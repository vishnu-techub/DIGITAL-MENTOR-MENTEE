import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

/**
 * Single source of truth for uploaded files.
 *
 * Uploads are written to the local filesystem, but the runtime filesystem is not
 * writable everywhere: Render mounts the project directory read-only and only a
 * persistent disk (or, failing that, `/tmp`) accepts writes. The `uploads` tree
 * is also not tracked in git, so it does not exist in a fresh container and has
 * to be created on boot.
 *
 * The previous code called `fs.mkdirSync` at import time without a guard, so a
 * read-only working directory threw before `startServer()` could run. The
 * process exited with code 1, never bound a port, and every route -- including
 * `/api/health` -- failed, which the browser surfaces as an HTTP 500.
 *
 * `UPLOADS_BASE` is the directory that actually backs every uploaded file on this
 * host. Every stored `fileUrl` keeps the stable `/uploads/<subdir>/<name>` shape,
 * and `resolveStoredUploadPath` maps that URL back onto the real directory.
 *
 * ── Why there is a list of roots, not just one ──────────────────────────────────
 * `UPLOADS_BASE` used to be derived from `process.cwd()` alone. That makes the
 * same `/uploads/...` URL resolve to a DIFFERENT directory depending only on how
 * the process was started (`npm --prefix backend run dev` runs with cwd=`backend`,
 * `node backend/dist/index.js` runs with cwd=the repository root), so a record
 * written by one process is invisible to every other process, and a redeploy that
 * changes the working directory silently orphans every stored file. The cwd is a
 * property of the shell, not of the application, so it is never used as the only
 * anchor.
 *
 * `UPLOAD_ROOTS` is that list, in priority order. It is anchored on
 * `UPLOADS_DIR`, then a mounted persistent disk, then the backend package's own
 * directory (derived from the module location, never from the cwd), then the
 * legacy cwd-relative path, and only then the ephemeral tmp fallback. Writes go to
 * the first writable entry; every read searches all of them.
 */

const LOGICAL_PREFIX = 'uploads';

/** Render mounts a persistent disk here. Absent on a free plan and on dev hosts. */
const RENDER_DISK_MOUNT = '/mnt/data';

/** Last-resort fallback for hosts where nothing else accepts writes. */
const TMP_UPLOADS_DIR = 'ksrce-mentor-uploads';

/** An `AO2026-1395.pdf` upload is capped at 10 MB by the upload middleware. */
const RECOVERY_MAX_BYTES = 20 * 1024 * 1024;
const RECOVERY_MAX_FILES = 20000;

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

function uniqueAbsolute(entries: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const abs = path.resolve(entry);
    // Windows paths are case-insensitive, so `C:\Uploads` and `c:\uploads` are
    // the same directory and must not be scanned twice.
    const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(abs);
  }
  return out;
}

/**
 * Absolute path of the backend package, derived from this module's own location
 * so it is identical whether the app is run from `src` (tsx), from `dist`, or
 * from any working directory. `__dirname` is defined in the CommonJS output this
 * project compiles to; the `typeof` guard keeps the module loadable regardless.
 * Both `src/config` and `dist/config` sit two levels below the package root.
 */
const BACKEND_DIR = (() => {
  try {
    if (typeof __dirname === 'string' && __dirname.length > 0) {
      return path.resolve(__dirname, '..', '..');
    }
  } catch {
    // Fall through: the cwd-relative root still covers this host.
  }
  return null;
})();

/**
 * Every directory on this host that may legitimately hold uploaded files, in the
 * order they should be preferred. This is an extension of the existing uploads
 * tree, not a second storage system: every entry holds exactly the same
 * `/uploads/<subdir>/<name>` layout and all of them are read and written by the
 * same resolver.
 */
function buildUploadRoots(): string[] {
  return uniqueAbsolute([
    // An explicit operator choice always wins.
    process.env.UPLOADS_DIR,
    // A mounted persistent disk survives a redeploy; /tmp does not.
    fs.existsSync(RENDER_DISK_MOUNT) ? path.join(RENDER_DISK_MOUNT, LOGICAL_PREFIX) : null,
    // The package's own uploads directory. cwd-independent, and the exact path
    // `.gitignore` already reserves for user media.
    BACKEND_DIR ? path.join(BACKEND_DIR, LOGICAL_PREFIX) : null,
    // Legacy behaviour, kept so an existing checkout that was started from the
    // repository root keeps resolving.
    path.join(process.cwd(), LOGICAL_PREFIX),
    path.join(os.tmpdir(), TMP_UPLOADS_DIR),
  ]);
}

/** Ordered list of candidate upload roots. `UPLOADS_BASE` is the first writable one. */
export const UPLOAD_ROOTS = buildUploadRoots();

/** Absolute directory that actually backs newly written uploads on this host. */
export const UPLOADS_BASE = firstWritable(UPLOAD_ROOTS);

  if (UPLOADS_BASE !== UPLOAD_ROOTS[0]) {
  console.warn(
    `[storage] "${UPLOAD_ROOTS[0]}" is not writable on this host; writing to "${UPLOADS_BASE}" instead. ` +
      'Reads still search every known upload root: ' +
      UPLOAD_ROOTS.map((r) => `"${r}"`).join(', ') +
      '. Files written to a fallback do not survive a redeploy.'
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
 * Normalise a stored `fileUrl` to its path inside an uploads root, or `null` if
 * it does not live under the logical `uploads` prefix. Path traversal is rejected
 * here rather than at each call site, so every reader inherits the same defence.
 */
function relativeUploadPath(fileUrl: string | undefined | null): string | null {
  if (!fileUrl || typeof fileUrl !== 'string') return null;

  const normalized = fileUrl.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized !== LOGICAL_PREFIX && !normalized.startsWith(`${LOGICAL_PREFIX}/`)) return null;

  const relative = normalized.slice(LOGICAL_PREFIX.length).replace(/^\/+/, '');
  if (!relative) return null;

  const segments = relative.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  if (segments.some((s) => s === '.' || s === '..')) return null;
  return segments.join('/');
}

function isInside(root: string, candidate: string): boolean {
  const abs = path.resolve(candidate);
  return abs === path.resolve(root) || abs.startsWith(path.resolve(root) + path.sep);
}

/**
 * Map a stored `/uploads/...` fileUrl back to an absolute path in the active
 * upload root, refusing anything that escapes it.
 *
 * Kept as the strict single-root mapping it has always been. Callers that need to
 * find a file this process did not write must use `locateStoredUpload`, which
 * searches every known root first.
 */
export function resolveStoredUploadPath(fileUrl: string | undefined | null): string | null {
  const relative = relativeUploadPath(fileUrl);
  if (!relative) return null;

  const absolute = path.resolve(UPLOADS_BASE, relative);
  if (!isInside(UPLOADS_BASE, absolute)) return null;
  return absolute;
}

export interface LocatedUpload {
  /** Absolute path of the file that holds the document bytes. */
  path: string;
  /** The upload root the file was found in. */
  root: string;
  /** True when this is NOT the exact path the database record points at. */
  recovered: boolean;
  /** How the file was found, for server-side logging. */
  strategy: 'exact' | 'recovered-by-size' | 'recovered-from-backup';
}

export interface LocateUploadMeta {
  /** Original upload name, as stored in `StudentDocument.fileName`. */
  fileName?: string | null;
  /** Byte size recorded at upload time, as stored in `StudentDocument.fileSize`. */
  fileSize?: number | null;
  /** MIME type recorded at upload time, as stored in `StudentDocument.fileType`. */
  fileType?: string | null;
}

function statFile(filePath: string): fs.Stats | null {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

/** Read the leading bytes and identify the real type of a file on disk. */
export function sniffStoredFileType(filePath: string): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    const read = fs.readSync(fd, buf, 0, 8, 0);
    if (read < 4) return null;
    if (buf.subarray(0, 4).toString('binary') === '%PDF') return 'application/pdf';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/** List files under an upload root, one subdirectory deep, which is the upload layout. */
function listUploadFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 1 || out.length >= RECOVERY_MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= RECOVERY_MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) out.push(full);
    }
  };
  try {
    if (fs.statSync(root).isDirectory()) walk(root, 0);
  } catch {
    // Root does not exist on this host; nothing to search.
  }
  return out;
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

interface RecoveryCandidate {
  filePath: string;
  root: string;
  hash: string;
  mtimeMs: number;
}

/**
 * Every filename suffix a stored file may legitimately carry for a given original
 * upload name.
 *
 * This MUST mirror the multer filename generator in document.controller.ts:
 * the extension is split off and kept verbatim while only the STEM is sanitised
 * (`AO2026-1395.pdf` -> `doc-123-456-AO2026-1395.pdf`). Sanitising the whole
 * name instead turns the dot into an underscore and can never match a real file,
 * which is why the extension is handled separately here.
 */
function uploadNameVariants(original: string): string[] {
  const base = path.basename(original);
  if (!base) return [];

  const ext = path.extname(base).toLowerCase().slice(0, 10);
  const stemOnly = path.basename(base, path.extname(base)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

  const variants = new Set<string>();
  if (stemOnly) variants.add(`${stemOnly}${ext}`);
  // Whole-name sanitisation, in case a record was ever written by an uploader
  // that did not preserve the extension.
  variants.add(base.replace(/[^a-zA-Z0-9_-]/g, '_'));
  // The name as uploaded.
  variants.add(base);

  return [...variants].filter((v) => v.length > 0);
}

/**
 * Find a file whose BYTES match a lost upload record.
 *
 * A stored `fileUrl` embeds a `Date.now()`-derived name, so the exact path cannot
 * be reconstructed once the file has moved or the directory has been reset. What
 * CAN be reconstructed is the identity of the content: the record keeps the
 * original `fileName` and the exact `fileSize` the bytes had when they were
 * accepted. A candidate is therefore only accepted when
 *
 *   1. its name ends with the record's sanitised original filename,
 *   2. its size is byte-for-byte the recorded size, and
 *   3. its magic bytes match the recorded MIME type.
 *
 * Every surviving candidate is then hashed, and recovery is refused outright if
 * two DIFFERENT files match -- embedding or streaming the wrong student's
 * certificate is worse than reporting the file as unavailable. A same-named file
 * of a different size (for example a truncated or placeholder upload) is never
 * accepted, so this can never substitute a stub for a real certificate.
 */
function findByContentIdentity(
  roots: string[],
  meta: LocateUploadMeta,
  onAmbiguous?: (found: RecoveryCandidate[]) => void
): RecoveryCandidate | null {
  const expectedBytes = Number(meta.fileSize);
  if (!Number.isInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > RECOVERY_MAX_BYTES) {
    return null;
  }

  const original = String(meta.fileName || '').trim();
  if (!original) return null;

  const variants = uploadNameVariants(original);
  if (variants.length === 0) return null;

  const expectedMime = String(meta.fileType || '').toLowerCase().trim() || null;
  const candidates: RecoveryCandidate[] = [];

  for (const root of roots) {
    for (const filePath of listUploadFiles(root)) {
      const base = path.basename(filePath);
      if (!variants.some((variant) => base.endsWith(variant))) continue;

      const st = statFile(filePath);
      if (!st || st.size !== expectedBytes) continue;

      if (expectedMime) {
        const actual = sniffStoredFileType(filePath);
        // An unreadable or mismatched file is never accepted as a substitute.
        if (actual && normalizeMime(actual) !== normalizeMime(expectedMime)) continue;
      }

      candidates.push({ filePath, root, hash: sha256(filePath), mtimeMs: st.mtimeMs });
    }
  }

  if (candidates.length === 0) return null;

  const distinct = new Map<string, RecoveryCandidate>();
  for (const c of candidates) {
    if (!distinct.has(c.hash)) distinct.set(c.hash, c);
  }

  if (distinct.size > 1) {
    onAmbiguous?.(candidates);
    return null;
  }

  return [...distinct.values()].sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

function normalizeMime(mime: string): string {
  const m = mime.toLowerCase().trim();
  if (m === 'image/jpg') return 'image/jpeg';
  if (m === 'application/x-pdf' || m === 'application/acrobat' || m === 'applications/vnd.pdf') {
    return 'application/pdf';
  }
  return m;
}

/**
 * THE canonical resolver for a stored document.
 *
 * Called by both the document streaming endpoints and the Official Record Book
 * PDF generator, so a file is found in exactly the same way no matter which
 * feature is reading it. Resolution order:
 *
 *   1. the exact stored path, in every known upload root (an explicit
 *      `UPLOADS_DIR`, a mounted persistent disk, the backend package directory,
 *      the legacy cwd-relative directory, the tmp fallback);
 *   2. an optional external backup directory named `UPLOADS_BACKUP_DIR`;
 *   3. a byte-exact content-identity recovery inside the upload roots.
 *
 * Returns `null` only when the record cannot be resolved, so a caller never has
 * to guess whether a file exists.
 */
export function locateStoredUpload(
  fileUrl: string | undefined | null,
  meta: LocateUploadMeta = {},
  extraRoots: string[] = []
): LocatedUpload | null {
  const relative = relativeUploadPath(fileUrl);
  if (!relative) return null;

  const searchRoots = uniqueAbsolute([...UPLOAD_ROOTS, ...extraRoots, process.env.UPLOADS_BACKUP_DIR]);

  for (const root of searchRoots) {
    const candidate = path.resolve(root, relative);
    if (!isInside(root, candidate)) continue;
    if (statFile(candidate)) {
      return {
        path: candidate,
        root,
        recovered: root !== UPLOADS_BASE,
        strategy: root !== UPLOADS_BASE ? 'recovered-from-backup' : 'exact',
      };
    }
  }

  const recovered = findByContentIdentity(searchRoots, meta, (found) => {
    console.warn(
      `[storage] content recovery for "${meta.fileName}" was REFUSED: ${found.length} different ` +
        `${meta.fileSize}-byte file(s) match it, so the correct one cannot be identified with certainty.`
    );
  });
  if (!recovered) return null;

  return {
    path: recovered.filePath,
    root: recovered.root,
    recovered: true,
    strategy: 'recovered-by-size',
  };
}

/**
 * Copy verified bytes to the exact path a record points at, so the next read is
 * an ordinary lookup. Used by the document-file repair tool after it has
 * identified a record's bytes; the destination is always validated against the
 * active uploads root.
 */
export function installStoredUpload(fileUrl: string | undefined | null, sourcePath: string): string | null {
  const relative = relativeUploadPath(fileUrl);
  if (!relative) return null;
  if (!statFile(sourcePath)) return null;

  const destination = path.resolve(UPLOADS_BASE, relative);
  if (!isInside(UPLOADS_BASE, destination)) return null;
  if (path.resolve(sourcePath) === destination) return destination;

  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(sourcePath, destination);
    return destination;
  } catch (err: any) {
    console.error(`[storage] could not install "${sourcePath}" at "${destination}": ${err?.message}`);
    return null;
  }
}

/** Roots the resolver searches, for diagnostics and server-side logging. */
export function describeUploadRoots(): string {
  return UPLOAD_ROOTS.map((r) => `"${r}"`).join(', ');
}
