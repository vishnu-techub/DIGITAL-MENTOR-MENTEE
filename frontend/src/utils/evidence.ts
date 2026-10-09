/**
 * MENTORING EVIDENCE — client-side compression + capture metadata.
 * ---------------------------------------------------------------------------
 * Hard requirement enforced here so the mentor gets an actionable
 * message instead of a generic upload failure:
 *
 *   <= 200 KB PER PHOTO. Images are compressed in the browser BEFORE upload
 *   so the mentor is not uploading a 5 MB file on a slow connection. The
 *   server enforces the same ceiling independently and rejects anything that
 *   still exceeds it, so this is an optimisation, not the guarantee.
 *
 * LOCATION + CAPTURE TIME (for the evidence upload workflow ONLY):
 *   - The browser location is requested ONCE, when the mentor attaches photos
 *     to an evidence record — never in the background and never elsewhere in
 *     the app. A refusal, timeout or unavailable device NEVER blocks the
 *     upload; the true outcome is reported instead.
 *   - The original EXIF capture time is read from the file BEFORE compression
 *     (re-encoding strips metadata). When EXIF is absent the capture time is
 *     reported as unavailable rather than guessed.
 *
 * TEMPORARY LOCAL FILE STORAGE. See PROJECT_PROGRESS.md.
 */

/** Hard ceiling for a single stored evidence photo. Mirrors the server. */
export const MAX_EVIDENCE_BYTES = 200 * 1024;

/** Max photos in one submission. Mirrors the server. */
export const MAX_EVIDENCE_FILES = 12;

/** A photo that has been compressed, ready to upload. */
export interface PreparedEvidencePhoto {
  file: File;
  /** Size before compression, so the UI can show what was saved. */
  originalBytes: number;
  previewUrl: string;
  /** EXIF capture time (`YYYY-MM-DDTHH:mm:ss`) or null when unavailable. */
  captureTime: string | null;
}

/** Location request outcome, mirroring the server's honest status values. */
export type EvidenceLocationStatus =
  | 'CAPTURED'
  | 'DENIED'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'ERROR'
  | 'NOT_REQUESTED';

/** Device-reported location captured for an evidence upload. */
export interface EvidenceLocationState {
  status: EvidenceLocationStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  capturedAt: string | null;
}

/** The initial state before any location request has been made. */
export const NOT_REQUESTED_LOCATION: EvidenceLocationState = {
  status: 'NOT_REQUESTED',
  latitude: null,
  longitude: null,
  accuracy: null,
  capturedAt: null,
};

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Load a File into an HTMLImageElement (object URL, auto-revoked). */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`"${file.name}" could not be read as an image.`));
    };
    img.src = url;
  });
}

/** Longest edge kept, so an oversized camera photo is also scaled down. */
const MAX_EDGE = 1920;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed.'))),
      type,
      quality
    );
  });
}

/**
 * Re-encode one photo as JPEG until it is <= MAX_EVIDENCE_BYTES.
 *
 * Quality is stepped down first, then the dimensions, because a photo that is
 * only just over the limit should keep its resolution rather than being
 * needlessly downscaled. Throws when it cannot be achieved — the server would
 * reject it anyway, so failing early gives the mentor a clear message.
 */
export async function compressEvidenceImage(file: File): Promise<{ file: File; originalBytes: number }> {
  const originalBytes = file.size;
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" is not a JPG, PNG or WebP photo.`);
  }

  // Already small enough and JPEG: upload untouched so quality is never lost.
  if (file.type === 'image/jpeg' && file.size <= MAX_EVIDENCE_BYTES) {
    return { file, originalBytes };
  }

  const img = await loadImage(file);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const baseWidth = Math.max(1, Math.round(img.naturalWidth * scale));
  const baseHeight = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image compression is not supported in this browser.');

  // Several passes: shrink only if quality alone was not enough.
  const dimensions: Array<[number, number]> = [
    [baseWidth, baseHeight],
    [Math.round(baseWidth * 0.75), Math.round(baseHeight * 0.75)],
    [Math.round(baseWidth * 0.5), Math.round(baseHeight * 0.5)],
  ];
  const qualities = [0.82, 0.7, 0.6, 0.5, 0.4, 0.3];

  for (const [width, height] of dimensions) {
    canvas.width = width;
    canvas.height = height;
    // White matte, so a transparent PNG does not become a black rectangle.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (blob.size <= MAX_EVIDENCE_BYTES) {
        return {
          file: new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }),
          originalBytes,
        };
      }
    }
  }

  throw new Error(
    `"${file.name}" could not be reduced to ${Math.round(
      MAX_EVIDENCE_BYTES / 1024
    )} KB. Please choose a smaller photo.`
  );
}

/** Human-readable byte size, for the mentor's confirmation line. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// EXIF capture time (read BEFORE compression, which strips metadata)
// ---------------------------------------------------------------------------

/** Convert an EXIF date (`2026:09:10 14:23:11`) to `2026-09-10T14:23:11`. */
function normaliseExifDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00'] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

type ExifEntry = { tag: number; value: string | null; entryOffset: number };

function scanExifIfd(
  view: DataView,
  ifdOffset: number,
  little: boolean,
  tiffStart: number
): ExifEntry[] {
  const entries: ExifEntry[] = [];
  if (ifdOffset < 0 || ifdOffset + 2 > view.byteLength) return entries;
  const count = view.getUint16(ifdOffset, little);
  let p = ifdOffset + 2;
  for (let i = 0; i < count; i += 1) {
    if (p + 12 > view.byteLength) break;
    const tag = view.getUint16(p, little);
    const type = view.getUint16(p + 2, little);
    const comps = view.getUint32(p + 4, little);
    let value: string | null = null;
    if (type === 2 && comps > 0) {
      // An ASCII value of <= 4 bytes is stored inline; longer values are stored
      // at a TIFF-header-relative offset.
      const valueOffset = comps > 4 ? tiffStart + view.getUint32(p + 8, little) : p + 8;
      if (valueOffset >= 0 && valueOffset + comps <= view.byteLength) {
        let text = '';
        for (let c = 0; c < comps; c += 1) {
          const ch = view.getUint8(valueOffset + c);
          if (ch === 0) break;
          text += String.fromCharCode(ch);
        }
        value = text || null;
      }
    }
    entries.push({ tag, value, entryOffset: p });
    p += 12;
  }
  return entries;
}

/**
 * Extract the EXIF capture time from a JPEG, if present.
 *
 * Reads only the first 512 KB (the EXIF APP1 header is near the front) and
 * returns null for anything it cannot confidently parse — a missing capture
 * time is reported as unknown, never invented.
 */
export async function readEvidenceCaptureTime(file: File): Promise<string | null> {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const isJpeg = type === 'image/jpeg' || type === 'image/jpg' || /\.jpe?g$/.test(name);
  if (!isJpeg) return null;

  try {
    const buffer = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = view.getUint8(offset + 1);
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xda) break; // start of scan; no more metadata segments
      const segmentLength = view.getUint16(offset + 2, false);
      if (segmentLength < 2) break;

      if (marker === 0xe1) {
        const start = offset + 4;
        if (
          start + 6 <= view.byteLength &&
          view.getUint32(start, false) === 0x45786966 && // "Exif"
          view.getUint16(start + 4, false) === 0x0000
        ) {
          return parseExifDateTime(view, start + 6);
        }
      }
      offset += 2 + segmentLength;
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

function parseExifDateTime(view: DataView, tiffStart: number): string | null {
  if (tiffStart + 8 > view.byteLength) return null;
  const byteOrder = view.getUint16(tiffStart, false);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;

  const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, little);
  const ifd0 = scanExifIfd(view, ifd0Offset, little, tiffStart);
  const dateTime = ifd0.find((e) => e.tag === 0x0132)?.value ?? null;

  const exifPointer = ifd0.find((e) => e.tag === 0x8769);
  let original: string | null = null;
  if (exifPointer) {
    const exifOffset = tiffStart + view.getUint32(exifPointer.entryOffset + 8, little);
    const exifEntries = scanExifIfd(view, exifOffset, little, tiffStart);
    original =
      exifEntries.find((e) => e.tag === 0x9003)?.value ??
      exifEntries.find((e) => e.tag === 0x9004)?.value ??
      null;
  }

  return normaliseExifDate(original ?? dateTime);
}

// ---------------------------------------------------------------------------
// Location capture (evidence upload workflow only)
// ---------------------------------------------------------------------------

/**
 * Request the browser location ONCE for an evidence upload.
 *
 * Always resolves — never rejects — so a denial, timeout or unsupported device
 * cannot block the upload. Call this directly from a user action (attaching
 * photos); do not call it in the background.
 */
export function captureEvidenceLocation(timeoutMs = 10000): Promise<EvidenceLocationState> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ...NOT_REQUESTED_LOCATION, status: 'UNAVAILABLE' });
      return;
    }

    let settled = false;
    const finish = (state: EvidenceLocationState) => {
      if (settled) return;
      settled = true;
      resolve(state);
    };

    const timer = setTimeout(() => {
      finish({ ...NOT_REQUESTED_LOCATION, status: 'TIMEOUT' });
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        finish({
          status: 'CAPTURED',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy:
            Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
              ? position.coords.accuracy
              : null,
          capturedAt: new Date().toISOString(),
        });
      },
      (error) => {
        clearTimeout(timer);
        const status: EvidenceLocationStatus =
          error?.code === 1
            ? 'DENIED'
            : error?.code === 2
              ? 'UNAVAILABLE'
              : error?.code === 3
                ? 'TIMEOUT'
                : 'ERROR';
        finish({ ...NOT_REQUESTED_LOCATION, status });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Human-readable label for a location status, shared by the UI. */
export function describeLocationStatus(status: string | null | undefined): string {
  switch (status) {
    case 'CAPTURED':
      return 'Location captured';
    case 'DENIED':
      return 'Location permission denied';
    case 'UNAVAILABLE':
      return 'Location unavailable';
    case 'TIMEOUT':
      return 'Location request timed out';
    case 'ERROR':
      return 'Location could not be captured';
    default:
      return 'Location not requested';
  }
}

/** Human-readable label for a place-name status, shared by the UI. */
export function describePlaceNameStatus(status: string | null | undefined): string {
  switch (status) {
    case 'RESOLVED':
      return '';
    case 'NOT_FOUND':
      return 'Place name unavailable';
    case 'RATE_LIMITED':
      return 'Place name lookup is temporarily rate-limited';
    case 'DISABLED':
      return 'Place name lookup is disabled';
    case 'ERROR':
      return 'Place name unavailable';
    case 'UNAVAILABLE':
      return 'Place name unavailable';
    default:
      return 'Place name unavailable';
  }
}

/**
 * Turn the mentor's chosen files into upload-ready, compressed photos,
 * preserving each original's EXIF capture time when present.
 */
export async function prepareEvidencePhotos(files: File[]): Promise<PreparedEvidencePhoto[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_EVIDENCE_FILES) {
    throw new Error(`You can attach at most ${MAX_EVIDENCE_FILES} photos at a time.`);
  }

  const prepared: PreparedEvidencePhoto[] = [];
  try {
    for (const file of files) {
      // Read metadata from the ORIGINAL file; compression drops EXIF.
      const captureTime = await readEvidenceCaptureTime(file);
      const { file: compressed, originalBytes } = await compressEvidenceImage(file);
      prepared.push({
        file: compressed,
        originalBytes,
        previewUrl: URL.createObjectURL(compressed),
        captureTime,
      });
    }
  } catch (err) {
    // Do not leak object URLs for photos that will never be uploaded.
    for (const photo of prepared) URL.revokeObjectURL(photo.previewUrl);
    throw err;
  }

  return prepared;
}
