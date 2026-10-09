/**
 * KSRCE DOCUMENT WATERMARK
 * ---------------------------------------------------------------------------
 * Applies the institutional watermark `K S R C E` diagonally across the centre
 * of a document, running from the BOTTOM-RIGHT toward the TOP-LEFT (a
 * backslash "\"), in subtle semi-transparent text.
 *
 * SCOPE
 *   Documents only. The original uploaded bytes are NEVER modified: this
 *   service returns a NEW buffer that the caller writes as a separate
 *   watermarked copy. Mentoring evidence PHOTOS are deliberately NOT passed
 *   through here — see evidence.service.ts.
 *
 * SUPPORTED FORMATS
 *   - application/pdf  -> every page is watermarked. The watermark is ALWAYS
 *                         placed BEHIND the page's original content: the
 *                         document's own text, tables, headings and signatures
 *                         paint on top of it and can never be obscured. Page
 *                         dimensions and existing content are preserved.
 *
 *                         NOTE: on a page whose original content is one opaque
 *                         object covering the whole page (a scanned/photographed
 *                         certificate, or a full-page background fill) an
 *                         underlaid watermark is hidden behind that opaque paint.
 *                         This is deliberate — the requirement is that the
 *                         watermark NEVER sits in front of document content, and
 *                         a foreground overlay is what made dense tables and
 *                         headings unreadable. No original content is altered to
 *                         make the watermark visible.
 *   - image/jpeg, image/png -> the watermark is composited with sharp at the
 *                         same direction/opacity; dimensions are preserved.
 *   Anything else is reported as `unsupported` and the caller keeps the
 *   original untouched. A processing failure is reported as `failed`; it never
 *   throws, so an upload is never lost just because a watermark could not be
 *   produced.
 *
 * TEMPORARY LOCAL FILE STORAGE. See PROJECT_PROGRESS.md.
 */

import { PDFArray, PDFDocument, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import sharp from 'sharp';

/** Exact watermark text mandated by the institution. */
export const WATERMARK_TEXT = 'K S R C E';

/**
 * Watermark appearance — deliberately subtle so document text, tables and
 * signatures stay fully readable.
 *
 * At 0.12 opacity over this light neutral grey the composited stroke lands at
 * roughly luminance 237 on white (contrast ~1.08:1): clearly present in the
 * white space of a page, but far too light to compete with document ink. The
 * PDF path additionally paints the watermark BEFORE the page content, so any
 * text, table cell or signature line always covers it.
 *
 * These values are covered by rendered-output regressions in
 * tests/document-watermark.test.ts.
 */
const WATERMARK_COLOR = rgb(0.4, 0.4, 0.4);
const WATERMARK_OPACITY = 0.12;

/**
 * PDF user space has y pointing UP, so -45 degrees makes the text run from the
 * BOTTOM-RIGHT toward the TOP-LEFT (a backslash "\"). This was verified by
 * rendering the real service output and measuring the ink, not inferred from
 * the rotation sign.
 */
const WATERMARK_ANGLE_DEGREES = -45;

/**
 * SVG/canvas space has y pointing DOWN, so the SAME visual diagonal (backslash,
 * bottom-right to top-left) needs +45 here. Using the PDF's -45 in the SVG
 * produced the opposite "/" slant — the direction defect this constant fixes.
 */
const WATERMARK_IMAGE_ROTATION_DEGREES = 45;

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
 * Move the content stream that `page.drawText` just appended to the FRONT of
 * the page's `/Contents` array.
 *
 * PDF paints a page's content streams in array order, so placing the watermark
 * stream first means every other stream (the original document) is painted on
 * top of it — the watermark sits in the background and never covers text,
 * tables, headings or signatures. This is a genuine underlay: no overlay PDF is
 * created and nothing is merged in front of the original content.
 *
 * `pdf-lib` guarantees that `drawText` has materialised `/Contents` as an array
 * by this point (it normalises a single stream into an array and appends its
 * own stream). The guards below only protect unusual/blank pages.
 */
function placeWatermarkBehindContent(page: PDFPage): void {
  const contents = page.node.Contents();
  if (!(contents instanceof PDFArray)) return; // No array to reorder (blank page).
  const size = contents.size();
  if (size < 2) return; // Only the watermark itself (blank page) — already first.
  const watermarkRef = contents.get(size - 1);
  contents.remove(size - 1);
  contents.insert(0, watermarkRef);
}

/**
 * Apply `K S R C E` to every page of a PDF as a genuine background layer.
 *
 * The text is drawn once per page, centred, rotated -45 degrees (bottom-right to
 * top-left) and semi-transparent. It is then moved behind the page's existing
 * content stream so that text, tables, headings and signatures always paint on
 * top of it and stay readable. Page size, orientation and existing content are
 * never changed.
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
    const size = Math.max(12, Math.min(width, height) * 0.1);
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

    // pdf-lib appends the text ABOVE the existing content. Always move it
    // behind, so the document's own content paints on top of the watermark and
    // is never obscured — regardless of the page's structure (vector tables,
    // scanned images or full-page backgrounds).
    placeWatermarkBehindContent(page);
  }

  const bytes = await pdf.save({ addDefaultPage: false, updateFieldAppearances: false });
  return Buffer.from(bytes);
}

/**
 * Composite the `K S R C E` watermark over a JPEG or PNG.
 *
 * The output keeps the input's format and pixel dimensions; only a
 * semi-transparent overlay is added. The original buffer is never mutated. The
 * SVG rotation is chosen so the image watermark runs along the SAME
 * bottom-right -> top-left diagonal as the PDF watermark.
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
  const fontSize = Math.max(16, Math.round(Math.min(width, height) * 0.1));
  const grey255 = Math.round(Number(WATERMARK_COLOR.red) * 255);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="${width / 2}" y="${height / 2}" ` +
      `font-family="sans-serif" font-size="${fontSize}" font-weight="700" ` +
      `fill="rgba(${grey255},${grey255},${grey255},${WATERMARK_OPACITY})" text-anchor="middle" dominant-baseline="middle" ` +
      `transform="rotate(${WATERMARK_IMAGE_ROTATION_DEGREES} ${width / 2} ${height / 2})">${WATERMARK_TEXT}</text>` +
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
