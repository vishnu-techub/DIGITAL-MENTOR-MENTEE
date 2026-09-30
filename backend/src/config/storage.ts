import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Uploads are written to the local filesystem, but the runtime filesystem is
 * not writable everywhere: Render mounts the project directory read-only and
 * only `/tmp` accepts writes. The `uploads` tree is also not tracked in git,
 * so it does not exist in a fresh container and has to be created on boot.
 *
 * The previous code called `fs.mkdirSync` at import time without a guard, so a
 * read-only working directory threw before `startServer()` could run. The
 * process exited with code 1, never bound a port, and every route -- including
 * `/api/health` -- failed, which the browser surfaces as an HTTP 500.
 *
 * `UPLOADS_BASE` is the single source of truth for where uploads physically
 * live. Every stored `fileUrl` keeps the stable `/uploads/<subdir>/<name>`
 * shape, and `resolveStoredUploadPath` maps that URL back onto the real
 * directory. Keeping both sides anchored to this one constant means the
 * temporary-directory fallback cannot desynchronise the writer from the reader.
 */

const LOGICAL_PREFIX = 'uploads';

function isWritable(dir: string): boolean {
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  try {
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function firstWritable(candidates: string[]): string {
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      if (isWritable(candidate)) return candidate;
    } catch {
      // Try the next candidate; directory setup must never abort the process.
    }
  }
  return candidates[0];
}

const preferredBase = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), LOGICAL_PREFIX));

/** Absolute directory that actually backs every uploaded file on this host. */
export const UPLOADS_BASE = firstWritable([
  preferredBase,
  path.join(os.tmpdir(), 'ksrce-mentor-uploads'),
]);

if (UPLOADS_BASE !== preferredBase) {
  console.warn(
    `[storage] "${preferredBase}" is not writable on this host; using "${UPLOADS_BASE}" instead. ` +
      'Files written here do not survive a redeploy.'
  );
}

/** Resolve (and create) the writable directory for one upload subdirectory. */
export function resolveWritableUploadsDir(subdir: string): string {
  const dir = path.join(UPLOADS_BASE, subdir);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Non-fatal: multer will surface a request-scoped error if a write fails.
  }
  return dir;
}

/**
 * Map a stored `/uploads/...` fileUrl back to an absolute path, refusing
 * anything that escapes the uploads root (path traversal defence).
 */
export function resolveStoredUploadPath(fileUrl: string | undefined | null): string | null {
  if (!fileUrl || typeof fileUrl !== 'string') return null;

  const relative = fileUrl.replace(/\\/g, '/').replace(/^\/+/, '');
  if (relative !== LOGICAL_PREFIX && !relative.startsWith(`${LOGICAL_PREFIX}/`)) return null;

  const absolute = path.resolve(UPLOADS_BASE, relative.slice(LOGICAL_PREFIX.length).replace(/^\/+/, ''));
  if (absolute !== UPLOADS_BASE && !absolute.startsWith(UPLOADS_BASE + path.sep)) {
    return null;
  }
  return absolute;
}
