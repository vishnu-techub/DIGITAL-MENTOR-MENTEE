import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.js';

/**
 * ============================================================================
 * LOGIN BRUTE-FORCE PROTECTION (server-side, dependency-free)
 * ============================================================================
 *
 * The login endpoint used to accept an unlimited number of credential
 * attempts, so a script could grind a password offline-to-online with no
 * throttling. This middleware adds a sliding window of FAILED attempts and
 * answers 429 (with `Retry-After`) once the window is full.
 *
 * Design notes:
 *   - Only 401 responses ("invalid username or password") are counted; a
 *     successful login (2xx) clears the counter. Successful logins therefore
 *     never lock anyone out, which keeps normal use and the regression suite
 *     unaffected.
 *   - Two buckets are tracked: per (client IP + username) at a tight threshold
 *     and per client IP at a looser ceiling, so neither single-account guessing
 *     nor username spraying from one host gets an unlimited budget.
 *   - State is in-process and bounded (expired timestamps are pruned on every
 *     read), which is appropriate for the single-instance local-store deployment.
 *   - Thresholds are env-overridable for deploys and tests:
 *       LOGIN_MAX_ATTEMPTS   (default 10)  failures per IP+username per window
 *       LOGIN_MAX_IP_ATTEMPTS (default 60) failures per IP per window
 *       LOGIN_WINDOW_MS      (default 900000 = 15 minutes)
 */

const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS) > 0 ? Number(process.env.LOGIN_WINDOW_MS) : 15 * 60 * 1000;
const MAX_PER_IDENTITY =
  Number(process.env.LOGIN_MAX_ATTEMPTS) > 0 ? Number(process.env.LOGIN_MAX_ATTEMPTS) : 10;
const MAX_PER_IP =
  Number(process.env.LOGIN_MAX_IP_ATTEMPTS) > 0 ? Number(process.env.LOGIN_MAX_IP_ATTEMPTS) : 60;

const failures = new Map<string, number[]>();

function prune(key: string, now: number): number[] {
  const kept = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (kept.length > 0) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

function identityKey(req: Request): string {
  const body = (req.body || {}) as Record<string, unknown>;
  const username = String(body.username ?? body.email ?? '')
    .trim()
    .toLowerCase();
  return `id:${clientIp(req)}:${username}`;
}

function ipKey(req: Request): string {
  return `ip:${clientIp(req)}`;
}

function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function retryAfterSeconds(oldest: number, now: number): number {
  return Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const idKey = identityKey(req);
  const ip = ipKey(req);

  const idHits = prune(idKey, now);
  const ipHits = prune(ip, now);

  if (idHits.length >= MAX_PER_IDENTITY || ipHits.length >= MAX_PER_IP) {
    const oldest = Math.min(
      idHits.length >= MAX_PER_IDENTITY ? idHits[0] : Number.POSITIVE_INFINITY,
      ipHits.length >= MAX_PER_IP ? ipHits[0] : Number.POSITIVE_INFINITY
    );
    res.setHeader('Retry-After', String(retryAfterSeconds(oldest, now)));
    sendError(res, 'Too many failed login attempts. Please try again later.', 429);
    return;
  }

  res.on('finish', () => {
    const finishedAt = Date.now();
    if (res.statusCode === 401) {
      const idArr = prune(idKey, finishedAt);
      idArr.push(finishedAt);
      failures.set(idKey, idArr);
      const ipArr = prune(ip, finishedAt);
      ipArr.push(finishedAt);
      failures.set(ip, ipArr);
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      failures.delete(idKey);
    }
  });

  next();
}

/** Test-only: clear all tracked failures. */
export function resetLoginRateLimit(): void {
  failures.clear();
}
