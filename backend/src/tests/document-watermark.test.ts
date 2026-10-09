/**
 * DOCUMENT WATERMARK — verification.
 * ---------------------------------------------------------------------------
 * Proves the KSRCE document watermarking contract at the service level, with no
 * server and no database:
 *
 *   A. A PDF is watermarked on EVERY page, page count is preserved, the
 *      watermark is the exact text `K S R C E`, and the ORIGINAL buffer is
 *      byte-for-byte unchanged.
 *   B. A multi-page PDF reports the same page count and has the watermark on
 *      every page.
 *   C. Image formats are watermarked without changing pixel dimensions, and the
 *      original is unchanged.
 *   D. An unsupported format is reported `unsupported` and the original bytes
 *      are returned untouched, so the caller can keep the original safely.
 *
 * Run: npx tsx src/tests/document-watermark.test.ts
 */
import sharp from 'sharp';
import {
  PDFDocument,
  PDFArray,
  PDFStream,
  PDFRawStream,
  PDFDict,
  PDFName,
  decodePDFRawStream,
  rgb,
} from 'pdf-lib';
import {
  WATERMARK_TEXT,
  watermarkDocumentBuffer,
  watermarkPdfBuffer,
  watermarkImageBuffer,
} from '../services/document-watermark.service.js';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(requirement: string, condition: boolean, evidence = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${requirement}`);
  } else {
    fail++;
    failures.push(requirement);
    console.log(`  [FAIL] ${requirement}${evidence ? `\n         evidence: ${evidence}` : ''}`);
  }
}

/** The watermark text as pdf-lib writes it into the content stream (WinAnsi hex). */
const WATERMARK_HEX = Buffer.from(WATERMARK_TEXT, 'latin1').toString('hex').toUpperCase();

/**
 * Collect the decoded content-stream text of one page.
 *
 * pdf-lib writes the drawn text as a hex-encoded `Tj` operand, so the exact
 * watermark can be asserted from the actual page content — not inferred.
 */
function pageContentText(doc: PDFDocument, page: any): string {
  const contents = page.node.Contents();
  const refs: any[] = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  let text = '';
  for (const ref of refs) {
    const stream: any = doc.context.lookup(ref);
    if (!stream) continue;
    let bytes: Uint8Array | null = null;
    if (stream instanceof PDFRawStream) {
      try {
        bytes = decodePDFRawStream(stream).decode();
      } catch {
        bytes = stream.getContents();
      }
    } else if (stream instanceof PDFStream) {
      bytes = stream.getContents();
    }
    if (bytes) text += Buffer.from(bytes).toString('latin1');
  }
  return text;
}

async function makePdf(pageSizes: Array<[number, number]>): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const [w, h] of pageSizes) {
    const page = doc.addPage([w, h]);
    page.drawText('Existing original content', { x: 40, y: h - 60, size: 12 });
  }
  return Buffer.from(await doc.save());
}

/**
 * Read the operators of the content stream that ACTUALLY contains the
 * watermark and derive what a renderer paints:
 *   - the fill alpha (`ca`) from the ExtGState it applies with `gs`, and
 *   - the grey level of its text fill colour (`r g b rg`).
 *
 * The watermark is painted BEHIND the document (first in `/Contents`), so it is
 * no longer the last stream — we must find the stream that carries it instead
 * of assuming the last fill colour belongs to it.
 *
 * Compositing the fill onto white gives 255 - alpha * (255 - grey*255).
 */
function watermarkAppearance(
  doc: PDFDocument,
  page: any
): { alpha: number | null; grey: number | null; index: number; firstContentIndex: number; streamCount: number } {
  const contents = page.node.Contents();
  const refs: any[] = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];

  const streams: Array<{ text: string; hasWatermark: boolean }> = refs.map((ref) => {
    const stream: any = doc.context.lookup(ref);
    let bytes: Uint8Array | null = null;
    if (stream instanceof PDFRawStream) {
      try {
        bytes = decodePDFRawStream(stream).decode();
      } catch {
        bytes = stream.getContents();
      }
    } else if (stream instanceof PDFStream) {
      bytes = stream.getContents();
    }
    const text = bytes ? Buffer.from(bytes).toString('latin1') : '';
    return { text, hasWatermark: text.includes(WATERMARK_HEX) };
  });

  const index = streams.findIndex((s) => s.hasWatermark);
  const text = index >= 0 ? streams[index].text : '';
  const firstContentIndex = streams.findIndex((s) => !s.hasWatermark && s.text.length > 24);

  const fills = [...text.matchAll(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/g)];
  const last = fills.length ? fills[fills.length - 1] : null;
  const grey = last ? (Number(last[1]) + Number(last[2]) + Number(last[3])) / 3 : null;

  let alpha: number | null = null;
  const gsName = text.match(/\/(GS[^\s/]+)\s+gs/)?.[1];
  if (gsName) {
    const resources = page.node.Resources();
    const extGStateRef = resources?.lookup(PDFName.of('ExtGState'));
    const extGState = doc.context.lookup(extGStateRef);
    if (extGState instanceof PDFDict) {
      const state = doc.context.lookup(extGState.get(PDFName.of(gsName)));
      if (state instanceof PDFDict) {
        const ca: any = state.get(PDFName.of('ca'));
        if (ca && typeof ca.asNumber === 'function') alpha = ca.asNumber();
      }
    }
  }

  return { alpha, grey, index, firstContentIndex, streamCount: streams.length };
}

/** Luminance on white (0=black, 255=white) of the watermark as actually painted. */
function compositedLuminance(alpha: number, grey: number): number {
  return 255 - alpha * (255 - grey * 255);
}

/**
 * Principal-axis slope of every non-white pixel in a raw RGB image, in image
 * coordinates (y-down). A backslash "\" (bottom-right <-> top-left) has a
 * POSITIVE slope; a slash "/" has a negative one. Used to prove the rendered
 * watermark direction, not just the rotation sign in the bytes.
 */
function inkSlope(raw: Buffer, width: number, height: number, channels: number): number {
  const pts: Array<[number, number]> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const l = 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2];
      if (l < 250) pts.push([x, y]);
    }
  }
  const n = pts.length;
  if (n === 0) return 0;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return Math.tan(theta);
}

async function main() {
  console.log('\n=== Document watermark verification ===\n');

  // ---------------------------------------------------------------------------
  console.log('A. Single-page PDF: every page watermarked, original untouched');
  // ---------------------------------------------------------------------------
  {
    const original = await makePdf([[595, 842]]);
    const snapshot = Buffer.from(original);

    const watermarked = await watermarkPdfBuffer(original);
    check('watermarking returns a non-empty PDF', watermarked.length > 0, `${watermarked.length} bytes`);
    check('the ORIGINAL buffer is byte-for-byte unchanged', original.equals(snapshot));

    const out = await PDFDocument.load(watermarked);
    check('the watermarked copy opens as a valid PDF', out.getPages().length === 1);

    const text = pageContentText(out, out.getPages()[0]);
    check(
      `page content contains the exact watermark "${WATERMARK_TEXT}"`,
      text.includes(WATERMARK_HEX),
      text.slice(0, 120)
    );
    check('the watermark is drawn with a -45 degree transform', /0\.7071.*-0\.7071/.test(text), text.slice(0, 200));
    check(
      'the watermark is semi-transparent (an ExtGState is applied)',
      /\/GS[\s\S]*gs/.test(text) || /gs\b/.test(text)
    );

    const layout = watermarkAppearance(out, out.getPages()[0]);
    check(
      'the watermark is painted BEHIND the document content (first stream in /Contents)',
      layout.index === 0 && (layout.firstContentIndex === -1 || layout.index < layout.firstContentIndex),
      `watermarkStream=${layout.index} firstContentStream=${layout.firstContentIndex} of ${layout.streamCount}`
    );
  }

  // ---------------------------------------------------------------------------
  console.log('\nB. Multi-page PDF: watermark on EVERY page, page count preserved');
  // ---------------------------------------------------------------------------
  {
    const sizes: Array<[number, number]> = [
      [595, 842],
      [842, 595],
      [400, 400],
    ];
    const original = await makePdf(sizes);
    const watermarked = await watermarkPdfBuffer(original);
    const out = await PDFDocument.load(watermarked);
    const pages = out.getPages();

    check('page count is preserved', pages.length === sizes.length, `${pages.length} vs ${sizes.length}`);
    const allWatermarked = pages.every((page) => pageContentText(out, page).includes(WATERMARK_HEX));
    check('the watermark appears on EVERY page', allWatermarked);
  }

  // ---------------------------------------------------------------------------
  console.log('\nC. Image documents: dimensions preserved, original untouched');
  // ---------------------------------------------------------------------------
  {
    const source = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const snapshot = Buffer.from(source);

    const result = await watermarkDocumentBuffer(source, 'image/png');
    check('a PNG is reported as watermarked', result.status === 'applied', result.reason || '');
    check('the original image buffer is unchanged', source.equals(snapshot));

    const meta = await sharp(result.buffer!).metadata();
    check('image dimensions are preserved', meta.width === 640 && meta.height === 480, `${meta.width}x${meta.height}`);
    check('the output is still a PNG', String(meta.format) === 'png', String(meta.format));

    const { data: raw, info: rawInfo } = await sharp(result.buffer!).raw().toBuffer({ resolveWithObject: true });
    const channels = rawInfo.channels;
    let nonWhite = 0;
    let darkest = 255;
    for (let i = 0; i < raw.length; i += channels) {
      const l = 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2];
      if (l < 250) nonWhite += 1;
      if (l < darkest) darkest = l;
    }
    check('the watermark really added pixels (not a no-op overlay)', nonWhite > 100, `${nonWhite} non-white samples`);
    check(
      'the image watermark is subtle, not a heavy overlay (darkest between 225 and 248)',
      darkest >= 225 && darkest <= 248,
      `darkest=${darkest.toFixed(1)} (255=white)`
    );
    const slope = inkSlope(raw, rawInfo.width, rawInfo.height, channels);
    check(
      'the image watermark runs bottom-right to top-left (backslash, positive slope)',
      slope > 0.5,
      `principal-axis slope=${slope.toFixed(3)}`
    );
  }

  {
    const jpeg = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#e2e8f0' },
    })
      .jpeg()
      .toBuffer();
    const result = await watermarkDocumentBuffer(jpeg, 'image/jpeg');
    check('a JPEG is reported as watermarked', result.status === 'applied', result.reason || '');
    check('the watermarked JPEG content type is image/jpeg', result.contentType === 'image/jpeg');
    const meta = await sharp(result.buffer!).metadata();
    check('the JPEG dimensions are preserved', meta.width === 300 && meta.height === 200);
  }

  // ---------------------------------------------------------------------------
  console.log('\nD. Unsupported / invalid input is safe and never corrupts the original');
  // ---------------------------------------------------------------------------
  {
    const original = Buffer.from('plain text, not a document we can watermark');
    const snapshot = Buffer.from(original);
    const result = await watermarkDocumentBuffer(original, 'text/plain');
    check('an unsupported format is reported `unsupported`', result.status === 'unsupported', result.status);
    check('no watermarked bytes are returned for an unsupported format', !result.buffer);
    check('an honest reason is provided', !!result.reason);
    check('the original buffer is untouched', original.equals(snapshot));
  }

  {
    const notAPdf = Buffer.from('%PDF-1.4 not really a pdf');
    const result = await watermarkDocumentBuffer(notAPdf, 'application/pdf');
    check('a corrupt PDF reports a failure instead of throwing', result.status === 'failed', result.status);
    check('a failure still never returns corrupt bytes', !result.buffer);
  }

  // ---------------------------------------------------------------------------
  console.log('\nE. Rendered appearance: the watermark is SUBTLE, present, and behind content');
  // ---------------------------------------------------------------------------
  {
    // The fix under test: the watermark must be light enough not to compete with
    // document ink, still present in white space, and painted behind the page
    // content. These assertions read the operators a renderer uses and
    // reproduce the composited stroke luminance on white.
    const sizes: Array<[number, number]> = [
      [595, 842],
      [842, 595],
    ];
    const original = await makePdf(sizes);
    const watermarked = await watermarkPdfBuffer(original);
    const out = await PDFDocument.load(watermarked);

    for (const [pageIndex, page] of out.getPages().entries()) {
      const { alpha, grey, index: wmIndex, firstContentIndex } = watermarkAppearance(out, page);
      check(`page ${pageIndex + 1}: the renderer's fill alpha is readable`, alpha !== null, String(alpha));
      check(
        `page ${pageIndex + 1}: the watermark is subtle (alpha <= 0.15)`,
        (alpha ?? 1) <= 0.15,
        `alpha=${alpha}`
      );
      check(
        `page ${pageIndex + 1}: the watermark is still present, not disabled (alpha >= 0.08)`,
        (alpha ?? 0) >= 0.08,
        `alpha=${alpha}`
      );
      check(
        `page ${pageIndex + 1}: the fill is a neutral grey, not black (0.2 <= grey <= 0.6)`,
        (grey ?? 0) >= 0.2 && (grey ?? 1) <= 0.6,
        `grey=${grey}`
      );

      const luminance = compositedLuminance(alpha ?? 0, grey ?? 1);
      check(
        `page ${pageIndex + 1}: composited on white the stroke is subtle but present (230 <= luminance <= 245)`,
        luminance >= 230 && luminance <= 245,
        `luminance=${luminance.toFixed(1)} (255=invisible white)`
      );
      check(
        `page ${pageIndex + 1}: the watermark stream is behind the page content`,
        wmIndex === 0 && (firstContentIndex === -1 || wmIndex < firstContentIndex),
        `watermarkStream=${wmIndex} firstContentStream=${firstContentIndex}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log('\nF. Opaque full-page scan: watermark is ALSO a background layer');
  // ---------------------------------------------------------------------------
  {
    // A page whose content is one opaque image covering the whole page (a scan)
    // must still get a BEHIND-layered watermark. It is hidden behind the opaque
    // image (an accepted, documented tradeoff), but it must NEVER be moved in
    // front of the page content — a foreground overlay is exactly what made
    // dense tables and headings unreadable.
    const doc = await PDFDocument.create();
    const png = await sharp({
      create: { width: 40, height: 56, channels: 3, background: '#f2efe9' },
    })
      .png()
      .toBuffer();
    const img = await doc.embedPng(png);
    const page = doc.addPage([595, 842]);
    page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    const original = Buffer.from(await doc.save());

    const watermarked = await watermarkPdfBuffer(original);
    const out = await PDFDocument.load(watermarked);
    const [onlyPage] = out.getPages();
    const { alpha, grey, index, streamCount } = watermarkAppearance(out, onlyPage);

    check('the scan page is still watermarked', index >= 0, `watermarkStream=${index}`);
    check(
      'the watermark is BEHIND the full-page image (never a foreground overlay)',
      index === 0,
      `watermarkStream=${index} of ${streamCount}`
    );
    check('the scan watermark is still subtle (alpha <= 0.15)', (alpha ?? 1) <= 0.15, `alpha=${alpha}`);
    check('the scan watermark is still present (alpha >= 0.08)', (alpha ?? 0) >= 0.08, `alpha=${alpha}`);
    const luminance = compositedLuminance(alpha ?? 0, grey ?? 1);
    check(
      'the scan watermark composites to a subtle grey',
      luminance >= 230 && luminance <= 245,
      `luminance=${luminance.toFixed(1)}`
    );
  }

  // ---------------------------------------------------------------------------
  console.log('\nG. Full-page background rectangle + dense text: watermark stays BEHIND the text');
  // ---------------------------------------------------------------------------
  {
    // Regression for the foreground-layering defect: an earlier heuristic treated
    // any page with a near-full-page filled rectangle (a certificate background,
    // a shaded page) as an "opaque scan" and left the watermark ON TOP, so it
    // darkened table text and headings. The watermark must be behind the content
    // on such a page too.
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    // Near-full-page background fill (the false-positive trigger).
    page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.98, 0.97, 0.94) });
    // Dense text lines on top of the background.
    for (let i = 0; i < 24; i++) {
      page.drawText(`Heading / table row ${i + 1} with dense content`, {
        x: 40,
        y: 800 - i * 28,
        size: 12,
        color: rgb(0, 0, 0),
      });
    }
    const original = Buffer.from(await doc.save());

    const watermarked = await watermarkPdfBuffer(original);
    const out = await PDFDocument.load(watermarked);
    const [onlyPage] = out.getPages();
    const { index, streamCount } = watermarkAppearance(out, onlyPage);

    check('the background-rectangle page is watermarked', index >= 0, `watermarkStream=${index}`);
    check(
      'the watermark is BEHIND the text on a page with a full-page background',
      index === 0,
      `watermarkStream=${index} of ${streamCount}`
    );
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('watermark test crashed:', err);
  process.exit(1);
});
