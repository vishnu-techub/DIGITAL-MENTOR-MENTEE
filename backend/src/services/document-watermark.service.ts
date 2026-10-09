/**
 * KSRCE DOCUMENT WATERMARK
 * ---------------------------------------------------------------------------
 * Applies the institutional watermark `K S R C E` diagonally across the centre
 * of a document, at approximately -45 degrees, in semi-transparent text.
 *
 * SCOPE
 *   Documents only. The original uploaded bytes are NEVER modified: this
 *   service returns a NEW buffer that the caller writes as a separate
 *   watermarked copy. Mentoring evidence PHOTOS are deliberately NOT passed
 *   through here — see evidence.service.ts.
 *
 * SUPPORTED FORMATS
 *   - application/pdf  -> every page is watermarked (pdf-lib overlay, page
 *                         dimensions and existing content are preserved).
 *   - image/jpeg, image/png -> the watermark is composited on top with sharp;
 *                         dimensions are preserved.
 *   Anything else is reported as `unsupported` and the caller keeps the
 *   original untouched. A processing failure is reported as `failed`; it never
 *   throws, so an upload is never lost just because a watermark could not be
 *   produced.
 *
 * TEMPORARY LOCAL FILE STORAGE. See PROJECT_PROGRESS.md.
 */

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import sharp from 'sharp';

/** Exact watermark text mandated by the institution. */
export const WATERMARK_TEXT = 'K S R C E';

/**
 * Watermark text colour (a neutral graphite grey) and opacity.
 *
 * Visibility note: the earlier 0.17 opacity over a mid-grey rendered at about
 * luminance 231 on white (contrast ~1.10:1) — present in the bytes but almost
 * invisible on screen, which is what users reported. 0.32 over this darker
 * graphite composites to ~luminance 205 (~1.24:1): clearly legible and still
 * light enough to read the document underneath. Covered by a rendered-output
 * regression test in tests/document-watermark.test.ts.
 */
const WATERMARK_COLOR = rgb(0.35, 0.35, 0.35);
const WATERMARK_OPACITY = 0.32;
const WATERMARK_ANGLE_DEGREES = -45;

export type WatermarkStatus = 'applied' | 'unsupported' | 'failed';

export interface WatermarkResult {
  status: WatermarkStatus;
  /** The watermarked bytes. Present only when `status === 'applied'`. */
  buffer?: Buffer;
  /** MIME type of the watermarked bytes. */
  contentType?: string;
  /** Human-readable reason when the watermark was not applied. */
  reason?: string;
}

/** Document MIME types this service knows how to watermark safely. */
export const WATERMARKABLE_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export function isWatermarkableMime(mime: string | undefined | null): boolean {
  const normalised = String(mime || '')
    .toLowerCase()
    .trim();
  if (normalised === 'image/jpg') return true;
  return (WATERMARKABLE_MIME as readonly string[]).includes(normalised);
}

/**
 * Overlay `K S R C E` on every page of a PDF.
 *
 * The text is drawn once per page, centred on the page, rotated -45 degrees and
 * semi-transparent. `pdf-lib` only draws over the existing content, so page
 * size, orientation and the original text/images are untouched.
 */
export async function watermarkPdfBuffer(input: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.load(input, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    if (width <= 0 || height <= 0) continue;

    // Scale the watermark to the page, keeping it readable on both A4 and
    // small custom sizes, and clamped so it never dominates the page.
    const size = Math.max(14, Math.min(width, height) * 0.14);
    const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, size);
    const textHeight = font.heightAtSize(size);

    // Rotate the text about its bottom-left anchor. To have the rotated text's
    // centre sit exactly at the page centre, offset the anchor by the rotated
    // half-extents.
    const rad = (WATERMARK_ANGLE_DEGREES * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const halfW = textWidth / 2;
    const halfH = textHeight / 2;
    const anchorX = width / 2 - (cos * halfW - sin * halfH);
    const anchorY = height / 2 - (sin * halfW + cos * halfH);

    page.drawText(WATERMARK_TEXT, {
      x: anchorX,
      y: anchorY,
      size,
      font,
      color: WATERMARK_COLOR,
      opacity: WATERMARK_OPACITY,
      rotate: degrees(WATERMARK_ANGLE_DEGREES),
    });
  }

  const bytes = await pdf.save({ addDefaultPage: false, updateFieldAppearances: false });
  return Buffer.from(bytes);
}

/**
 * Composite the `K S R C E` watermark over a JPEG or PNG.
 *
 * The output keeps the input's format and pixel dimensions; only a
 * semi-transparent overlay is added. The original buffer is never mutated.
 */
export async function watermarkImageBuffer(input: Buffer, mime: string): Promise<Buffer> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const width = Number(meta.width) || 0;
  const height = Number(meta.height) || 0;
  if (width <= 0 || height <= 0) {
    throw new Error('The image has no readable dimensions, so it cannot be watermarked.');
  }

  const rawMime = String(mime || '').toLowerCase();
  const isPng = rawMime.includes('png') || String(meta.format || '').toLowerCase() === 'png';

  // Let sharp infer the output format from the source; the SVG overlay is scaled
  // to the exact pixel dimensions so nothing is resized. The overlay uses the
  // SAME colour/opacity as the PDF path so images and PDFs read identically.
  const fontSize = Math.max(18, Math.round(Math.min(width, height) * 0.12));
  const grey255 = Math.round(Number(WATERMARK_COLOR.red) * 255);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="${width / 2}" y="${height / 2}" ` +
      `font-family="sans-serif" font-size="${fontSize}" font-weight="700" ` +
      `fill="rgba(${grey255},${grey255},${grey255},${WATERMARK_OPACITY})" text-anchor="middle" dominant-baseline="middle" ` +
      `transform="rotate(${WATERMARK_ANGLE_DEGREES} ${width / 2} ${height / 2})">${WATERMARK_TEXT}</text>` +
      `</svg>`
  );

  const pipeline = sharp(input, { failOn: 'none' }).composite([{ input: svg, top: 0, left: 0 }]);
  const output = isPng ? await pipeline.png().toBuffer() : await pipeline.jpeg({ quality: 92 }).toBuffer();
  return output;
}

/**
 * Produce a watermarked copy of a document buffer.
 *
 * Never throws: an unsupported MIME or an unexpected processing error is
 * reported in the result so the caller can upload the original and record the
 * true status.
 */
export async function watermarkDocumentBuffer(input: Buffer, mime: string): Promise<WatermarkResult> {
  const normalised = String(mime || '')
    .toLowerCase()
    .trim();

  try {
    if (normalised === 'application/pdf') {
      const buffer = await watermarkPdfBuffer(input);
      return { status: 'applied', buffer, contentType: 'application/pdf' };
    }
    if (normalised === 'image/jpeg' || normalised === 'image/jpg' || normalised === 'image/png') {
      const buffer = await watermarkImageBuffer(input, normalised);
      return { status: 'applied', buffer, contentType: normalised === 'image/png' ? 'image/png' : 'image/jpeg' };
    }
    return {
      status: 'unsupported',
      reason: `The watermark is not supported for "${mime || 'this format'}". The original document was kept unchanged.`,
    };
  } catch (err: any) {
    return {
      status: 'failed',
      reason: `The watermark could not be applied (${err?.message || 'processing error'}). The original document was kept unchanged.`,
    };
  }
}
