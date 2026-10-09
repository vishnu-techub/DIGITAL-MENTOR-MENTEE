/**
 * MENTORING EVIDENCE IMAGE COMPRESSION
 * ---------------------------------------------------------------------------
 * HARD REQUIREMENT: every stored mentoring evidence image is <= 200 KB.
 * 200 KB is a CEILING, not a target — the encoder stops as soon as it is under
 * the limit so the image keeps as much readable detail as possible.
 *
 * Strategy (in order, stopping at the first result under the ceiling):
 *   1. Sweep JPEG quality downward at full dimensions.
 *   2. Only if that is not enough, progressively reduce dimensions and re-sweep.
 *
 * Orientation is preserved by letting sharp apply the EXIF orientation transform
 * BEFORE re-encoding, so a portrait phone photo is never stored sideways.
 * Metadata is deliberately NOT copied to the output: the GPS proof is stored
 * separately on the evidence record, so recompression cannot remove it.
 *
 * If the image cannot be brought under the ceiling without becoming unusable it
 * is REJECTED — the server never stores an oversized or illegible "evidence"
 * photo.
 */

import sharp from 'sharp';

/** 200 KB ceiling for one stored mentoring evidence photo. */
export const MAX_EVIDENCE_BYTES = 200 * 1024;

/** Hard ceiling on what we accept on the wire before compressing. */
export const MAX_EVIDENCE_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Floor on the long edge so an "evidence photo" stays readable as evidence. */
export const MIN_LONG_EDGE = 640;

/** Lowest JPEG quality we are willing to emit before rejecting instead. */
export const MIN_QUALITY = 40;

const QUALITY_STEPS = [84, 78, 72, 66, 60, 54, 48, MIN_QUALITY];
const SCALE_STEPS = [1, 0.85, 0.72, 0.62, 0.52, 0.44];

export type EvidenceImageFormat = 'image/jpeg';

export interface CompressedEvidenceImage {
  buffer: Buffer;
  format: EvidenceImageFormat;
  width: number;
  height: number;
  bytes: number;
  /** JPEG quality actually used, for diagnostics / audit. */
  quality: number;
  /** How many encode attempts were needed. */
  attempts: number;
  /** True when the source already satisfied the ceiling and was re-encoded as-is size. */
  resized: boolean;
}

export class EvidenceCompressionError extends Error {
  readonly code = 'EVIDENCE_COMPRESSION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceCompressionError';
  }
}

/** Formats we are willing to decode into evidence. */
const ACCEPTED_INPUT_FORMATS = new Set([
  'jpeg',
  'png',
  'webp',
  'heif',
  'tiff',
  'gif',
]);

export function isAcceptedEvidenceMime(mime: string | undefined | null): boolean {
  if (!mime) return false;
  const normalised = String(mime).toLowerCase().trim();
  if (normalised === 'image/jpg') return true;
  if (normalised === 'image/heic' || normalised === 'image/heif') return true;
  return normalised === 'image/jpeg' || normalised === 'image/png' || normalised === 'image/webp';
}

async function decodeMetadata(input: Buffer): Promise<{ format: string; width: number; height: number }> {
  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    return {
      format: String(meta.format || ''),
      width: Number(meta.width) || 0,
      height: Number(meta.height) || 0,
    };
  } catch {
    throw new EvidenceCompressionError('The uploaded file is not a readable image. Please re-take the photo and try again.');
  }
}

/**
 * Verify the actual bytes on disk. A client can claim `image/jpeg` for anything,
 * so the file signature decides whether the upload is accepted.
 */
export function sniffImageSignature(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heif' | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  const head = buffer.slice(0, 12).toString('binary');
  if (head.startsWith('RIFF') && buffer.slice(8, 12).toString('binary') === 'WEBP') return 'image/webp';
  if (head.slice(4, 8) === 'ftyp') {
    const brand = head.slice(8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heif';
  }
  return null;
}

/**
 * Compress one evidence photo to at most MAX_EVIDENCE_BYTES.
 *
 * @throws {EvidenceCompressionError} when the image cannot be decoded, is an
 *         unsupported format, or cannot be reduced safely.
 */
export async function compressEvidenceImage(input: Buffer, label = 'Evidence photo'): Promise<CompressedEvidenceImage> {
  if (!input || input.length === 0) {
    throw new EvidenceCompressionError(`${label}: the uploaded photo is empty.`);
  }
  if (input.length > MAX_EVIDENCE_UPLOAD_BYTES) {
    throw new EvidenceCompressionError(
      `${label}: the photo is larger than the ${Math.round(MAX_EVIDENCE_UPLOAD_BYTES / (1024 * 1024))} MB upload limit.`
    );
  }

  const signature = sniffImageSignature(input);
  if (!signature) {
    throw new EvidenceCompressionError(
      `${label}: unsupported file. Please upload a JPG, PNG or WebP photo of the mentoring session.`
    );
  }

  const meta = await decodeMetadata(input);
  if (!ACCEPTED_INPUT_FORMATS.has(meta.format)) {
    throw new EvidenceCompressionError(`${label}: unsupported image format "${meta.format}". Please upload a JPG or PNG photo.`);
  }

  const oriented = await sharp(input, { failOn: 'none' })
    .rotate() // apply EXIF orientation, then discard it
    .toBuffer({ resolveWithObject: true });
  const sourceWidth = Number(oriented.info.width) || meta.width;
  const sourceHeight = Number(oriented.info.height) || meta.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new EvidenceCompressionError(`${label}: the photo has no readable dimensions.`);
  }

  const longEdge = Math.max(sourceWidth, sourceHeight);
  let attempts = 0;
  let best: CompressedEvidenceImage | null = null;

  for (const scale of SCALE_STEPS) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    if (Math.max(width, height) < MIN_LONG_EDGE && best) break;

    for (const quality of QUALITY_STEPS) {
      attempts += 1;
      let buffer: Buffer;
      try {
        buffer = await sharp(oriented.data, { failOn: 'none' })
          .resize(width, height, { fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' }) // transparency has no meaning in evidence
          .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
          .toBuffer();
      } catch {
        continue;
      }

      const candidate: CompressedEvidenceImage = {
        buffer,
        format: 'image/jpeg',
        width,
        height,
        bytes: buffer.length,
        quality,
        attempts,
        resized: width !== sourceWidth || height !== sourceHeight,
      };

      if (buffer.length <= MAX_EVIDENCE_BYTES) return candidate;
      if (!best || candidate.bytes < best.bytes) best = candidate;
    }
  }

  const reachedFloor = best !== null && Math.max(best.width, best.height) < MIN_LONG_EDGE;
  throw new EvidenceCompressionError(
    `${label}: this photo could not be compressed to the ${Math.round(MAX_EVIDENCE_BYTES / 1024)} KB evidence limit ` +
      `without making it unreadable (best ${best ? `${best.bytes} bytes` : 'n/a'}` +
      `${reachedFloor ? ' at the minimum readable size' : ''}). Please re-take the photo closer to the subject or with less background detail.`
  );
}
