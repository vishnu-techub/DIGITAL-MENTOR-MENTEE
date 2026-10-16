/**
 * Shared PDF reading helpers for the runtime test suites.
 *
 * The HTML/CSS → PDF renderer (headless Chromium) emits all content text as
 * subset-font hex `Tj` operands, so the old "find `(...) Tj` literals and
 * inflate jsPDF streams" tricks stopped being renderer-agnostic. These helpers
 * read the PDF with MuPDF (a test-only devDependency) so the SAME assertions
 * work for pages produced by either renderer:
 *
 *   - pdfText() / pdfPageTexts()  — real text extraction (selectable text),
 *   - pdfPageImages()             — image XObjects found per page,
 *   - pdfPageCount()              — total pages.
 *
 * MuPDF also decodes the pdf-lib StandardFonts pages that the annexure sheets
 * and copied certificate pages use, so text on appended pages is readable too.
 *
 * NOTE: mupdf ships as ESM with top-level await, so it cannot be `require()`d
 * from this CommonJS workspace. It is loaded once through a cached dynamic
 * `import()` (preserved as a true async import by tsx), which works from CJS.
 */
/** Lazily resolved, cached MuPDF module namespace (loaded asynchronously). */
let _mupdf: any = null;
async function mupdfModule(): Promise<any> {
  if (!_mupdf) _mupdf = await import('mupdf');
  return _mupdf;
}

/** Metadata for one embedded image XObject found in a page. */
export interface PdfImageInfo {
  /** Zero-based page index that declares the image resource. */
  page: number;
  /** `/Width` in pixels (the uploaded file's own dimensions). */
  width: number;
  /** `/Height` in pixels. */
  height: number;
  /** XObject dictionary key, e.g. `Image-2000805986`. */
  name: string;
}

function assertBuffer(buf: Buffer): asserts buf is Buffer {
  if (!Buffer.isBuffer(buf)) throw new Error('expected a Buffer of PDF bytes');
}

/** Number of pages in the PDF. */
export async function pdfPageCount(buf: Buffer): Promise<number> {
  assertBuffer(buf);
  const m = await mupdfModule();
  return m.Document.openDocument(buf, 'application/pdf').countPages();
}

/**
 * Extracted text for every page, in reading order (one string per page).
 * Throws if `buf` is not a readable PDF — callers that want best-effort
 * behaviour should catch and degrade to '' on their own.
 */
export async function pdfPageTexts(buf: Buffer): Promise<string[]> {
  assertBuffer(buf);
  const m = await mupdfModule();
  const doc = m.Document.openDocument(buf, 'application/pdf');
  const out: string[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    out.push(doc.loadPage(i).toStructuredText('preserve-whitespace').asText());
  }
  return out;
}

/** All pages' text joined with newlines (useful for `includes()` checks). */
export async function pdfText(buf: Buffer): Promise<string> {
  return (await pdfPageTexts(buf)).join('\n');
}

/** One text line with its bounding box (used to prove header/body separation). */
export interface PdfTextLine {
  /** Zero-based page index. */
  page: number;
  /** The line's text (may be empty for whitespace-only runs). */
  text: string;
  /** Bounding box in PDF points, top-left origin (y grows downward). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Every text line on every page with its bounding box. Read from MuPDF's
 * structured-text JSON so callers can assert geometric facts (e.g. that page
 * body text begins BELOW the repeating header band and never overlaps it).
 */
export async function pdfPageLines(buf: Buffer): Promise<PdfTextLine[]> {
  assertBuffer(buf);
  const m = await mupdfModule();
  const doc = m.Document.openDocument(buf, 'application/pdf');
  const out: PdfTextLine[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const json = JSON.parse(doc.loadPage(i).toStructuredText('preserve-whitespace').asJSON());
    for (const block of json.blocks || []) {
      for (const line of block.lines || []) {
        const bb = line.bbox;
        const [x0, y0, x1, y1] = Array.isArray(bb)
          ? bb
          : [bb?.x ?? 0, bb?.y ?? 0, (bb?.x ?? 0) + (bb?.w ?? 0), (bb?.y ?? 0) + (bb?.h ?? 0)];
        out.push({ page: i, text: value(line.text), x0, y0, x1, y1 });
      }
    }
  }
  return out;
}

function value(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/**
 * Image XObjects declared anywhere in the document.
 *
 * Walks each page's /Resources -> /XObject dictionary looking for entries with
 * /Subtype /Image. The XObject keeps the uploaded file's pixel dimensions
 * regardless of the CSS display size, so exact width/height assertions stay
 * valid for the HTML renderer and the legacy jsPDF renderer alike.
 */
export async function pdfPageImages(buf: Buffer): Promise<PdfImageInfo[]> {
  assertBuffer(buf);
  const m = await mupdfModule();
  const doc = m.Document.openDocument(buf, 'application/pdf');
  const out: PdfImageInfo[] = [];
  for (let pageNo = 0; pageNo < doc.countPages(); pageNo++) {
    const page = doc.loadPage(pageNo);
    if (typeof page.getObject !== 'function') continue;
    let resources: any;
    try {
      resources = page.getObject().get('Resources').resolve();
    } catch {
      continue;
    }
    if (!resources || resources.isNull() || !resources.isDictionary()) continue;
    const xobj = resources.get('XObject');
    if (!xobj || xobj.isNull()) continue;
    const dict = xobj.resolve();
    if (!dict.isDictionary()) continue;
    dict.forEach((value: unknown, key: unknown) => {
      const resolved: any = (value as any).resolve();
      if (!resolved || !resolved.isDictionary?.()) return;
      const subtype = resolved.get('Subtype');
      if (!subtype || subtype.isNull()) return;
      let name = '';
      try {
        name = subtype.asName();
      } catch {
        return;
      }
      if (name !== 'Image') return;
      let width = 0;
      let height = 0;
      try {
        width = resolved.get('Width').resolve().asNumber();
        height = resolved.get('Height').resolve().asNumber();
      } catch {
        return;
      }
      out.push({ page: pageNo, width, height, name: String(key) });
    });
  }
  return out;
}