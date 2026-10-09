/**
 * MENTORING EVIDENCE — client-side compression.
 * ---------------------------------------------------------------------------
 * Hard requirement enforced here so the mentor gets an actionable
 * message instead of a generic upload failure:
 *
 *   <= 200 KB PER PHOTO. Images are compressed in the browser BEFORE upload
 *   so the mentor is not uploading a 5 MB file on a slow connection. The
 *   server enforces the same ceiling independently and rejects anything that
 *   still exceeds it, so this is an optimisation, not the guarantee.
 *
 * GPS/geolocation has been intentionally REMOVED. The Mentoring Evidence feature
 * does NOT request, capture, validate, store, or process the user's physical
 * location. No location permission is required.
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
}

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

/**
 * Turn the mentor's chosen files into upload-ready, compressed photos.
 *
 * GPS/geolocation is NOT captured. Photos are compressed and ready to upload.
 */
export async function prepareEvidencePhotos(files: File[]): Promise<PreparedEvidencePhoto[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_EVIDENCE_FILES) {
    throw new Error(`You can attach at most ${MAX_EVIDENCE_FILES} photos at a time.`);
  }

  const prepared: PreparedEvidencePhoto[] = [];
  try {
    for (const file of files) {
      const { file: compressed, originalBytes } = await compressEvidenceImage(file);
      prepared.push({
        file: compressed,
        originalBytes,
        previewUrl: URL.createObjectURL(compressed),
      });
    }
  } catch (err) {
    // Do not leak object URLs for photos that will never be uploaded.
    for (const photo of prepared) URL.revokeObjectURL(photo.previewUrl);
    throw err;
  }

  return prepared;
}