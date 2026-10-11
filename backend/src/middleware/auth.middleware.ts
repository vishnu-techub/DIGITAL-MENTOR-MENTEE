import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendError } from '../utils/response.js';
import { Role } from '../config/constants.js';

/**
 * Resolve the shared JWT signing secret.
 *
 * Security posture: there is NO hardcoded fallback secret shipped in source.
 *   - `JWT_SECRET` from the environment is always used when present
 *     (see `backend/.env.example`; the deployed host must set it).
 *   - In `NODE_ENV === 'production'` a missing secret fails the process at boot
 *     instead of silently trusting a known string that an attacker could use to
 *     forge tokens.
 *   - In development a missing secret falls back to a RANDOM per-process value
 *     (never a shipped literal), so sessions simply do not survive a restart and
 *     the console explains what to configure.
 */
function resolveJwtSecret(): string {
  const configured = (process.env.JWT_SECRET || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. Set it to a strong random value before starting the server.'
    );
  }
  console.warn(
    '[security] JWT_SECRET is not set. Using a random development-only secret; sessions will not survive a restart. Set JWT_SECRET before deploying.'
  );
  return crypto.randomBytes(48).toString('hex');
}

export const JWT_SECRET = resolveJwtSecret();

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  email: string;
  fullName: string;
  departmentId: string | null;
  facultyId?: string | null;
  studentId?: string | null;
  /**
   * Present (true) only on a token issued to an account that still has to
   * choose a new password. Absent/false means the account is fully usable.
   */
  mustChangePassword?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authentication token missing or invalid.', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    return sendError(res, 'Session expired or invalid authentication token.', 401);
  }
}

export function optionalAuthenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
  } catch {
    // Proceed without user attached if token is invalid or expired
  }
  next();
}

/**
 * ============================================================================
 * Mandatory first-login password change
 * ============================================================================
 *
 * Mounted at `/api` BEFORE every business router. When a bearer token carries
 * the `mustChangePassword` claim, every `/api` route is refused with 403 except
 * the small allow-list below (health, login, the current-user lookup and the
 * change-password endpoint itself). This is the SERVER-side guarantee: a
 * Principal (or any account flagged the same way) cannot reach the college
 * dashboard, reference data, or any other protected route until the password
 * has been changed, no matter what the client renders.
 *
 * Requests with no token, or with an invalid/expired token, are passed through:
 * the route's own `authenticate` middleware answers those with 401, and public
 * routes keep working. The claim is trusted because it is signed; the flag is
 * only ever set true at provisioning and is dropped from the freshly issued
 * token on a successful change.
 */
const PASSWORD_CHANGE_ALLOWLIST = new Set<string>([
  '/health',
  '/auth/login',
  '/auth/me',
  '/auth/change-password',
]);

export function enforcePasswordChange(req: AuthRequest, res: Response, next: NextFunction) {
  if (PASSWORD_CHANGE_ALLOWLIST.has(req.path)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    if (decoded.mustChangePassword === true) {
      return sendError(
        res,
        'Password change required. Please set a new password before continuing.',
        403
      );
    }
  } catch {
    // Invalid or expired token: let the route's own authenticate answer 401.
  }
  next();
}
