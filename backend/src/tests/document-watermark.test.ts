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
  decodePDFRawStream,
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

    const raw = await sharp(result.buffer!).raw().toBuffer();
    let nonWhite = 0;
    for (let i = 0; i < raw.length; i += 1) if (raw[i] < 250) nonWhite += 1;
    check('the watermark really added pixels (not a no-op overlay)', nonWhite > 100, `${nonWhite} non-white samples`);
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
