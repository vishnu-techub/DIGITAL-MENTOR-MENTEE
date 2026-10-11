/**
 * Student Record Book — structured HTML/CSS → PDF renderer.
 *
 * The record book is now authored as a real HTML document (institutional
 * header, student banner, section tables, photo montages, annexure pages,
 * signature block) styled with print CSS and rendered to PDF through the
 * system-installed headless Chromium (`--print-to-pdf`). No new runtime
 * dependency is required: an already installed browser is reused.
 *
 * Watermark: a `position: fixed` "background layer" whose text runs
 * bottom-right → top-left (rotate 45deg), centred on every printed page,
 * ~10 % light grey, painted strictly BENEATH the content wrapper
 * (content z-index 1 > watermark z-index 0) and inert to pointer events.
 * Verified programmatically (MuPDF pixel diff) so it never darkens any ink.
 *
 * If no browser is installed or rendering fails, pdf.service.ts falls back to
 * the historical jsPDF renderer, so the endpoint never breaks.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'node:child_process';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import sharp from 'sharp';
import {
  locateStoredUpload,
  resolveStoredUploadPath,
  describeUploadRoots,
  sniffStoredFileType,
  UPLOADS_BASE,
} from '../../config/storage.js';
import { collectRecordBookData, formatDocDate, type RecordBookData } from './record-book-html.data.js';
import type { StudentPdfMode } from './record-book-html.data.js';

// ---------------------------------------------------------------------------
// Logo (optional)
// ---------------------------------------------------------------------------
let logoBase64: string | null = null;
try {
  const logoPath = path.resolve(process.cwd(), 'assets', 'ksrce-logo.png');
  if (fs.existsSync(logoPath)) {
    logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  }
} catch {
  // logo is optional
}

// ---------------------------------------------------------------------------
// Small shared limits / formats (identical to the legacy jsPDF renderer)
// ---------------------------------------------------------------------------
const EMBED_LIMITS = { images: 25, pdfFiles: 25, photos: 60 };
const IMAGE_FORMATS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
};

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

// ---------------------------------------------------------------------------
// Print stylesheet
// ---------------------------------------------------------------------------
const PRINT_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.32; color: #212529; margin: 0; }

  /* ---- Watermark background layer (never touches content) ---- */
  .wm {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center;
    z-index: 0; pointer-events: none; user-select: none;
    color: rgba(128, 128, 128, 0.08);
    font-size: 88pt; font-weight: 700; letter-spacing: 4pt;
    white-space: nowrap; transform: rotate(45deg);
  }
  .content { position: relative; z-index: 1; }

  /* ---- Institutional header ---- */
  .topbar { background: #0B2545; height: 2.6mm; margin: 0; }
  .insthead { display: flex; align-items: center; gap: 3mm; padding: 1.5mm 0 0.5mm; }
  .logo { width: 17mm; height: auto; }
  .insttext { flex: 1; text-align: center; }
  .collegename { color: #0B2545; font-size: 13pt; font-weight: 700; letter-spacing: 0.4pt; }
  .autoline { color: #505050; font-size: 7.2pt; }
  .addrline { color: #505050; font-size: 7.2pt; }
  .doctitle { color: #C59B27; font-size: 10pt; font-weight: 700; margin-top: 0.8mm; }
  .instrule { border-top: 0.5pt solid #C8C8C8; margin: 1mm 0 2.2mm; }

  /* ---- Student banner ---- */
  .banner { background: #F5F7FA; border: 0.4pt solid #0B2545; border-radius: 2mm; padding: 2.2mm 3mm; margin-bottom: 3mm; }
  .banner .brow { display: flex; justify-content: space-between; gap: 4mm; padding: 0.6mm 0; font-size: 8.6pt; }
  .banner .bname { color: #0B2545; font-size: 10pt; font-weight: 700; }

  /* ---- Section tables ---- */
  table.grid { width: 100%; border-collapse: collapse; margin: 0 0 2.4mm; table-layout: fixed; }
  table.grid th, table.grid td { border: 0.4pt solid #4b5563; padding: 1.1mm 1.4mm; vertical-align: top; font-size: 8pt; overflow-wrap: break-word; }
  table.grid tr { break-inside: avoid; }
  table.grid td.b { font-weight: 700; }
  table.grid td.sub { color: #5c6b73; font-size: 7.4pt; }
  table.grid td.c, table.grid th.c { text-align: center; }
  table.grid th { background: #283C5A; color: #fff; font-weight: 700; font-size: 7.6pt; text-align: left; }
  table.grid tr.shrow td { background: #0B2545; color: #fff; font-weight: 700; font-size: 8.2pt; }
  table.grid tr.sheadrow td { background: #10233f; color: #fff; font-weight: 700; }
  table.grid tr.subhead td { background: #e2e8f0; color: #0B2545; font-weight: 700; }
  table.grid tr.labrow td { background: #F8F9FA; font-weight: 700; }
  table.grid tr.empty td { font-style: italic; color: #6c757d; text-align: left; }
  h2.section { break-after: avoid; }

  /* ---- Photo montage ---- */
  table.photos { width: 100%; border-collapse: separate; border-spacing: 1.6mm; table-layout: fixed; }
  table.photos td { border: 0.35pt solid #d7d7d7; border-radius: 1.2mm; padding: 1.2mm; vertical-align: top; break-inside: avoid; }
  .photoframe { height: 42mm; display: flex; align-items: center; justify-content: center; border: 0.3pt solid #e2e2e2; border-radius: 1mm; background: #fff; overflow: hidden; }
  .photoframe img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .photoframe .unavail { color: #964f4f; font-style: italic; font-size: 8pt; }
  .photocap { font-size: 7pt; color: #5a5a5a; margin-top: 0.8mm; }
  .photocap .n { font-weight: 700; }

  /* ---- Annexure pages ---- */
  section.annexure { break-before: page; }
  .annexhead { font-weight: 700; font-size: 9.5pt; color: #0B2545; margin: 1mm 0 1mm; }
  .annexmeta { font-size: 7.6pt; color: #5a5a5a; margin-bottom: 2.5mm; border-bottom: 0.4pt solid #C59B27; padding-bottom: 1.5mm; }
  .anneximg { display: flex; align-items: center; justify-content: center; min-height: 190mm; }
  .anneximg img { max-width: 100%; max-height: 245mm; object-fit: contain; }

  /* ---- Signature block ---- */
  .signatures { margin-top: 14mm; }
  .signatures .sigheading { font-weight: 700; font-size: 8.6pt; color: #0B2545; margin-bottom: 8mm; }
  .sigrow { display: flex; justify-content: space-between; }
  .sigcol { width: 23%; text-align: left; font-size: 8pt; color: #3c3c3c; }

  .note { font-size: 7.6pt; font-style: italic; color: #6a6a6a; margin: 1mm 0 2mm; }
  .small { font-size: 7pt; }
`;

// ---------------------------------------------------------------------------
// Headless browser discovery + rendering
// ---------------------------------------------------------------------------
function findChromeExecutable(): string | null {
  const fromEnv = process.env.KSRCE_PDF_CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '';
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    );
    const local = process.env.LOCALAPPDATA;
    if (local) candidates.push(path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge');
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

let htmlRendererAvailable: boolean | null = null;
/** True when a headless-capable Chromium-family browser is installed. */
export function isHtmlPdfRendererAvailable(): boolean {
  if (htmlRendererAvailable === null) htmlRendererAvailable = findChromeExecutable() !== null;
  return htmlRendererAvailable;
}

function runChromePrint(exe: string, htmlFile: string, pdfFile: string, headlessFlag: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [
      headlessFlag,
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      '--disable-dev-shm-usage',
      `--print-to-pdf=${pdfFile}`,
      `file:///${htmlFile.replace(/\\/g, '/')}`,
    ];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(exe, args, { stdio: 'ignore', windowsHide: true });
    } catch (err) {
      rejectPromise(err as Error);
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      rejectPromise(new Error('browser print-to-pdf timed out'));
    }, 90000);
    child.on('error', (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(pdfFile)) resolvePromise();
      else rejectPromise(new Error(`browser exited with code ${code}`));
    });
  });
}

async function renderHtmlToPdfBuffer(html: string): Promise<Buffer | null> {
  const exe = findChromeExecutable();
  if (!exe) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksrce-pdf-'));
  const htmlFile = path.join(dir, 'record-book.html');
  const pdfFile = path.join(dir, 'record-book.pdf');
  let headlessFlag: string;
  try {
    fs.writeFileSync(htmlFile, html, 'utf8');
    headlessFlag = '--headless=new';
    try {
      await runChromePrint(exe, htmlFile, pdfFile, headlessFlag);
    } catch {
      // Older headless implementations only accept `--headless`.
      headlessFlag = '--headless';
      await runChromePrint(exe, htmlFile, pdfFile, headlessFlag);
    }
    return fs.readFileSync(pdfFile);
  } catch (err) {
    console.error('[record-book-html] headless browser render failed, falling back to jsPDF:', (err as Error)?.message);
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Attachment resolution (student documents → inline images + appended PDFs)
// ---------------------------------------------------------------------------
interface AnnexImage {
  d: any;
  mime: string;
  dataUrl: string;
}
interface AnnexPdf {
  meta: any;
  doc: PDFDocument;
  pages: number;
}

async function resolveDocumentFiles(data: RecordBookData): Promise<{
  images: AnnexImage[];
  pdfs: AnnexPdf[];
  notEmbedded: Array<{ name: string; reason: string }>;
  missingFileReasons: Map<string, number>;
}> {
  const images: AnnexImage[] = [];
  const pdfs: AnnexPdf[] = [];
  const notEmbedded: Array<{ name: string; reason: string }> = [];
  const missingFileReasons = new Map<string, number>();

  for (const d of data.studentDocuments) {
    if (d.is_system_form) continue; // never self-embed this dossier

    const located = locateStoredUpload(d.file_url, {
      fileName: d.file_name,
      fileSize: d.file_size,
      fileType: d.file_type,
    });
    if (!located) {
      if (!resolveStoredUploadPath(d.file_url)) {
        notEmbedded.push({
          name: d.file_name,
          reason: `Stored path "${d.file_url}" is not inside the uploads directory, so it cannot be looked up at all. This record needs administrator repair.`,
        });
        continue;
      }
      notEmbedded.push({
        name: d.file_name,
        reason: `No file with these exact bytes was found in any upload location searched (${describeUploadRoots()}), and no other file matches the recorded size of ${d.file_size} bytes. The record is intact but the file itself was lost.`,
      });
      missingFileReasons.set(d.file_url, (missingFileReasons.get(d.file_url) || 0) + 1);
      continue;
    }

    const absPath = located.path;
    if (!fs.existsSync(absPath)) {
      notEmbedded.push({
        name: d.file_name,
        reason: 'The file was located but disappeared from disk while the record book was being generated. Please retry.',
      });
      continue;
    }

    const sniffed = sniffStoredFileType(absPath);
    const declared = (d.file_type || '').toLowerCase().trim();
    const mime = sniffed || declared;

    if (mime === 'application/pdf') {
      if (pdfs.length >= EMBED_LIMITS.pdfFiles) {
        notEmbedded.push({
          name: d.file_name,
          reason: `Record book annexure limit of ${EMBED_LIMITS.pdfFiles} PDF files reached, so this document was not reproduced. It is still listed in the documents section and remains available in Student Documents.`,
        });
        continue;
      }
      try {
        const src = await PDFDocument.load(fs.readFileSync(absPath), { ignoreEncryption: true });
        pdfs.push({ meta: d, doc: src, pages: src.getPageCount() });
      } catch (e: any) {
        notEmbedded.push({
          name: d.file_name,
          reason: 'The file is present on disk but is not a readable PDF (it is damaged or password-protected), so it could not be reproduced.',
        });
        console.error('record-book-html: could not read document', absPath, e?.message);
      }
      continue;
    }

    if (!IMAGE_FORMATS[mime]) {
      notEmbedded.push({
        name: d.file_name,
        reason: `Unsupported file type "${d.file_type || 'unknown'}". Only PDF, JPEG and PNG can be reproduced as annexures.`,
      });
      continue;
    }
    if (images.length >= EMBED_LIMITS.images) {
      notEmbedded.push({
        name: d.file_name,
        reason: `Record book annexure limit of ${EMBED_LIMITS.images} images reached, so this image was not reproduced. It is still listed in the documents section and remains available in Student Documents.`,
      });
      continue;
    }

    const dataUrl = `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`;
    // Verify the bytes decode before embedding (matches legacy behaviour).
    // NOTE: sharp() treats a bare string as a FILE PATH, so the base64 payload
    // must be decoded into a Buffer first — passing the raw base64 text made
    // every valid image fail this check and land in the embedding notice.
    try {
      await sharp(Buffer.from(dataUrl.split(',')[1], 'base64')).metadata();
    } catch {
      notEmbedded.push({
        name: d.file_name,
        reason: 'The image file is present on disk but could not be decoded, so it could not be reproduced.',
      });
      continue;
    }
    images.push({ d, mime, dataUrl });
  }

  if (missingFileReasons.size > 0) {
    console.error(
      `record-book-html: ${missingFileReasons.size} stored file(s) for reg no ${data.registerNumber} could not be resolved ` +
        `after searching every upload root (${describeUploadRoots()}). New uploads are written to ${UPLOADS_BASE}, which is ephemeral unless a persistent disk is mounted. ` +
        `Affected: ${JSON.stringify([...missingFileReasons.keys()])}`
    );
  }
  return { images, pdfs, notEmbedded, missingFileReasons };
}

/** Evidence photo views → embeddable base64 (deduped by evidence id). */
async function resolveEvidencePhotos(data: RecordBookData): Promise<Array<{ caption: string; view: any; dataUrl: string | null }>> {
  const items: Array<{ caption: string; view: any }> = [];
  const seen = new Set<string>();
  const push = (views: any[], caption: string) => {
    for (const v of views || []) {
      const key = String(v?.evidenceId || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push({ caption, view: v });
    }
  };
  for (const m of data.meetings as any[]) {
    push(m.evidence, `Saturday Meeting • ${formatDocDate(m.meeting_date)}`);
  }
  for (const c of data.counsellingRecords as any[]) {
    push(c.evidence, `Counselling • ${formatDocDate(c.session_date)} • ${c.category}`);
  }
  const shown = items.slice(0, EMBED_LIMITS.photos);
  const out: Array<{ caption: string; view: any; dataUrl: string | null }> = [];
  for (const item of shown) {
    let dataUrl: string | null = null;
    try {
      const located = locateStoredUpload(item.view.storedPath, {
        fileName: item.view.fileName,
        fileSize: item.view.fileSize,
        fileType: item.view.fileType,
      });
      if (located && fs.existsSync(located.path)) {
        const mime = sniffStoredFileType(located.path) || (item.view.fileType || '').toLowerCase();
        if (IMAGE_FORMATS[mime]) dataUrl = `data:${mime};base64,${fs.readFileSync(located.path).toString('base64')}`;
      }
    } catch (e: any) {
      console.error('record-book-html: could not embed evidence photo', item.view.fileName, e?.message);
    }
    out.push({ ...item, dataUrl });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML building helpers
// ---------------------------------------------------------------------------
type Cell = string | { t: string; span?: number; center?: boolean; bold?: boolean; sub?: boolean; empty?: boolean };

function tdHTML(cell: Cell): string {
  if (typeof cell === 'string') return `<td>${cell}</td>`;
  const cls = [
    cell.center ? 'c' : '',
    cell.bold ? 'b' : '',
    cell.sub ? 'sub' : '',
    cell.empty ? 'empty' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<td${cell.span ? ` colspan="${cell.span}"` : ''}${cls ? ` class="${cls}"` : ''}>${cell.t}</td>`;
}

function trHTML(cells: Cell[], cls = ''): string {
  return `<tr${cls ? ` class="${cls}"` : ''}>${cells.map(tdHTML).join('')}</tr>`;
}

function gridTable(opts: {
  title?: string;
  cols?: string[];
  colWidths?: string[];
  rows: Cell[][] | Cell[];
  tailRows?: Cell[][];
  titleClass?: string;
}): string {
  const parts: string[] = [];
  if (opts.title) {
    parts.push(`<tr class="${opts.titleClass || 'shrow'}"><td colspan="${opts.cols?.length || 99}" class="c">${opts.title}</td></tr>`);
  }
  if (opts.cols) {
    const widths = opts.colWidths?.length === opts.cols.length ? opts.colWidths : [];
    parts.push(`<colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`);
    parts.push(`<tr>${opts.cols.map((c) => `<th>${c}</th>`).join('')}</tr>`);
  }
  const body: Cell[][] = Array.isArray(opts.rows[0]) ? (opts.rows as Cell[][]) : [opts.rows as Cell[]];
  for (const row of body) parts.push(trHTML(row));
  for (const row of opts.tailRows || []) parts.push(trHTML(row));
  return `<table class="grid">${parts.join('')}</table>`;
}

function wrapHtml(body: string, watermark: boolean): string {
  const wm = watermark
    ? '<div class="wm" aria-hidden="true">K S R C E</div>'
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>KSRCE Digital Mentor–Mentee System — Record Book</title>
<style>${PRINT_CSS}</style>
</head><body>
${wm}
<div class="content">
${body}
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Header / banner
// ---------------------------------------------------------------------------
function headerHtml(docTitle: string): string {
  const logo = logoBase64 ? `<img class="logo" src="${logoBase64}" alt="KSRCE logo">` : '';
  return `<div class="topbar"></div>
<div class="insthead">${logo}<div class="insttext">
  <div class="collegename">K.S.R. COLLEGE OF ENGINEERING</div>
  <div class="autoline">(An Autonomous Institution, Approved by AICTE, New Delhi &amp; Affiliated to Anna University, Chennai)</div>
  <div class="addrline">K.S.R. Kalvi Nagar, Tiruchengode – 637 215, Namakkal District, Tamil Nadu | www.ksrce.ac.in</div>
  <div class="doctitle">${esc(docTitle)}</div>
</div></div>
<div class="instrule"></div>`;
}

function bannerHtml(data: RecordBookData): string {
  const { student, currentMentor } = data;
  const acadExtra = [student.batch_name, student.year, student.section ? `Sec ${student.section}` : '']
    .filter(Boolean)
    .join(' • ');
  return `<div class="banner">
  <div class="brow"><span class="bname">STUDENT: ${esc(String(student.full_name || '').toUpperCase())}</span><span class="bname">REGISTER NO: ${esc(student.register_number || '')}</span></div>
  <div class="brow"><span>Department: B.E. ${esc(student.department_name)} (${esc(student.department_code)})</span><span>Academic Batch: ${esc(acadExtra)}</span></div>
  <div class="brow"><span>Residential: ${esc((student.residential_type || 'DAY SCHOLAR').replace('_', ' '))}  |  Blood Group: ${esc(student.blood_group || 'N/A')}  |  Mobile: ${esc(student.mobile_number || 'N/A')}</span><span>Active Mentor: ${esc(currentMentor ? currentMentor.mentor_name : 'Pending Allocation')}</span></div>
</div>`;
}

// ---------------------------------------------------------------------------
// Section: PERSONAL & FAMILY, SCHOOLING & ADMISSION (full mode)
// ---------------------------------------------------------------------------
function section1And2Html(data: RecordBookData): string {
  const { student, parent, school } = data;
  const s1 = gridTable({
    title: '1. PERSONAL & FAMILY INFORMATION',
    cols: ['', '', '', ''],
    rows: [
      [
        { t: 'Date of Birth:', bold: true },
        student.dob || 'Not specified',
        { t: 'Email Address:', bold: true },
        student.email || 'N/A',
      ],
      [
        { t: "Father's Name:", bold: true },
        parent?.father_name || 'N/A',
        { t: 'Father Contact & Job:', bold: true },
        `${parent?.father_contact || 'N/A'} (${parent?.father_occupation || 'N/A'})`,
      ],
      [
        { t: "Mother's Name:", bold: true },
        parent?.mother_name || 'N/A',
        { t: 'Mother Contact & Job:', bold: true },
        `${parent?.mother_contact || 'N/A'} (${parent?.mother_occupation || 'N/A'})`,
      ],
      [
        { t: 'Permanent Address:', bold: true },
        { t: student.address || 'KSRCE Campus / Tiruchengode', span: 3 },
      ],
    ],
  });

  const lateralRows: Cell[][] = [];
  if (school?.admission_type === 'LATERAL_ENTRY' && school?.lateral_entry) {
    lateralRows.push([
      { t: 'Lateral Entry College:', bold: true },
      `${school.lateral_entry.previousCollegeName || school.lateral_entry.previousInstitution || 'N/A'}`,
      { t: 'Previous Course / Diploma:', bold: true },
      `${school.lateral_entry.previousCourseDiploma || school.lateral_entry.previousCourse || 'N/A'}`,
    ]);
    lateralRows.push([
      { t: 'Previous Institution:', bold: true },
      `${school.lateral_entry.previousInstitution || 'N/A'}`,
      { t: 'Qualification & Adm Year:', bold: true },
      `${school.lateral_entry.previousQualificationDetails || 'N/A'} (Adm: ${school.lateral_entry.admissionYear || 'N/A'})`,
    ]);
  }

  const s2 = gridTable({
    title: '2. SCHOOLING & ADMISSION PARTICULARS',
    cols: ['', '', '', ''],
    rows: [
      [
        { t: '10th Mark & School:', bold: true },
        `${school?.tenth_mark ? `${school.tenth_mark}/500` : 'N/A'} — ${school?.tenth_school || 'N/A'}`,
        { t: '12th Mark & School:', bold: true },
        `${school?.twelfth_mark ? `${school.twelfth_mark}/600` : 'N/A'} — ${school?.twelfth_school || 'N/A'}`,
      ],
      [
        { t: 'TNEA Cut-off Mark:', bold: true },
        school?.cutoff_mark ? `${school.cutoff_mark} / 200` : 'N/A',
        { t: 'Admission Mode:', bold: true },
        school?.admission_type === 'LATERAL_ENTRY'
          ? 'LATERAL ENTRY'
          : school?.admission_type === 'MANAGEMENT'
            ? 'MANAGEMENT'
            : 'COUNSELLING',
      ],
      ...lateralRows,
      [
        { t: 'Scholarship Details:', bold: true },
        { t: school?.scholarship_details || 'Nil', span: 3 },
      ],
    ],
  });

  return `${s1}${s2}`;
}

function semesterRowsHtml(data: RecordBookData): string {
  const { semesters, arrearStats } = data;
  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((num): Cell[] => {
    const s = semesters.find((x: any) => x.semester_number === num);
    const arrearsCountDisplay = s && s.arrears_count !== undefined ? String(s.arrears_count) : '0';
    const subjectsDisplay = s ? (s.arrears_subjects || '—') : '—';
    const hasStanding = s ? Boolean(s.has_active_arrear || s.arrears_count > 0) : false;
    const statusDisplay = hasStanding ? 'Active Arrear' : 'Clear';
    return [
      { t: `Semester 0${num}`, bold: true },
      { t: s && s.cgpa > 0 ? s.cgpa.toFixed(2) : '-', center: true },
      { t: s && s.sgpa > 0 ? s.sgpa.toFixed(2) : '-', center: true },
      { t: arrearsCountDisplay, center: true },
      subjectsDisplay,
      statusDisplay,
    ];
  });
  return gridTable({
    title: `3. SEMESTER ACADEMIC PERFORMANCE (SEMESTERS 1 TO 8) — Active: ${arrearStats.activeArrearsCount} | Total History: ${arrearStats.historicalArrearsCount} | Cleared: ${arrearStats.clearedCount}`,
    cols: ['Semester', 'CGPA', 'SGPA', 'Semester Arrears', 'Arrear Subjects', 'Clearance Remarks & Status'],
    colWidths: ['16', '10', '10', '15', '22', '27'],
    rows,
    titleClass: 'shrow',
  });
}

function arrearHistoryHtml(data: RecordBookData): string {
  const { arrearStats } = data;
  const rows: Cell[][] = arrearStats.arrearHistory.map((h: any) => [
    { t: h.subjectCode, bold: true },
    `Semester 0${h.originalSemester}`,
    `Attempt ${h.attempt || 1}`,
    h.status === 'CLEARED' ? (h.clearedInSemester ? `Semester 0${h.clearedInSemester}` : 'Cleared') : '—',
    h.clearedDate || '—',
    h.status === 'CLEARED' ? 'CLEARED' : 'ACTIVE ARREAR',
    h.remarks || '—',
  ]);
  return gridTable({
    title: `ARREAR HISTORY (Preserved Records) — Current Active: ${arrearStats.activeArrearsCount} | Total History: ${arrearStats.historicalArrearsCount} | Cleared: ${arrearStats.clearedCount}`,
    cols: ['Subject Code', 'Original Semester', 'Attempt', 'Cleared In', 'Cleared Date', 'Status', 'Remarks'],
    colWidths: ['15', '14', '11', '13', '13', '15', '19'],
    rows,
    titleClass: 'sheadrow',
  });
}

function internalAssessmentHtml(data: RecordBookData, label: string): string {
  const rows: Cell[][] = [];
  if (data.internalMarks.length === 0) {
    rows.push([
      { t: '—', center: true },
      { t: 'No internal assessment marks have been recorded for this student yet.', span: 5, empty: true },
    ]);
  } else {
    let lastSem = -1;
    for (const m of data.internalMarks as any[]) {
      if (m.semesterNumber !== lastSem) {
        lastSem = m.semesterNumber;
        rows.push([{ t: `Semester ${m.semesterNumber}`, span: 6, bold: true, sub: true }]);
      }
      const entered = [m.ia1, m.ia2, m.endSem].filter((v: any) => v != null) as number[];
      const total = entered.length > 0 ? entered.reduce((a, b) => a + b, 0) : null;
      rows.push([
        { t: m.subjectCode, bold: true },
        m.subjectName || '—',
        m.ia1 != null ? String(m.ia1) : '—',
        m.ia2 != null ? String(m.ia2) : '—',
        m.endSem != null ? String(m.endSem) : '—',
        total != null ? String(total) : '—',
      ]);
    }
  }
  const note =
    data.internalMarks.length > 0
      ? `<p class="note">"—" indicates the mark has not been recorded for that component. Total is the sum of the recorded components only.</p>`
      : '';
  const table = gridTable({
    title: label,
    cols: ['Subject Code', 'Subject Name', 'IA1 (out of 50)', 'IA2 (out of 50)', 'End Semester (out of 100)', 'Total (of recorded marks)'],
    colWidths: ['14', '28', '13', '13', '17', '15'],
    rows,
    titleClass: 'shrow',
  });
  return `${table}${note}`;
}

function mentorLineageHtml(data: RecordBookData): string {
  const { mentorHistory, currentMentor } = data;
  const rows: Cell[][] =
    mentorHistory.length > 0
      ? mentorHistory.map((h: any, idx: number) => [
          { t: `#${idx + 1}`, center: true },
          { t: h.mentor_name, bold: true },
          h.designation || 'Faculty Mentor',
          h.status,
          h.change_reason || 'Initial Assignment',
        ])
      : [[
          { t: '1', center: true },
          { t: currentMentor?.mentor_name || 'Assigned Mentor', bold: true },
          currentMentor?.designation || '',
          'ACTIVE',
          'Initial Allocation',
        ]];
  return gridTable({
    title: '5. MENTOR ASSIGNMENT & HISTORICAL REASSIGNMENT LINEAGE',
    cols: ['#', 'Mentor Name', 'Designation', 'Status', 'Reason for Change / Allocation'],
    colWidths: ['6', '24', '20', '15', '35'],
    rows,
    titleClass: 'shrow',
  });
}

function studentMentorInfoHtml(data: RecordBookData): string {
  const { student, currentMentor } = data;
  const acadExtra = [student.batch_name, student.year, student.section ? `Sec ${student.section}` : '']
    .filter(Boolean)
    .join(' • ');
  return gridTable({
    title: '1. STUDENT & MENTOR INFORMATION',
    cols: ['', '', '', ''],
    rows: [
      [
        { t: 'Student Name:', bold: true },
        student.full_name,
        { t: 'Register Number:', bold: true },
        student.register_number,
      ],
      [
        { t: 'Department:', bold: true },
        `B.E. ${student.department_name} (${student.department_code})`,
        { t: 'Academic Batch:', bold: true },
        acadExtra || 'Not recorded',
      ],
      [
        { t: 'Active Mentor:', bold: true },
        currentMentor ? currentMentor.mentor_name : 'Pending Allocation',
        { t: 'Designation & Employee ID:', bold: true },
        currentMentor
          ? `${currentMentor.designation || 'Faculty Mentor'} (${currentMentor.employee_id || 'N/A'})`
          : 'N/A',
      ],
      [
        { t: 'Mentor Contact:', bold: true },
        currentMentor?.phone_number || 'N/A',
        { t: 'Mentor Assigned From:', bold: true },
        formatDocDate(currentMentor?.assigned_from) || 'N/A',
      ],
    ],
  });
}

function meetingsCounsellingHtml(data: RecordBookData, fullNo: number, docsNo: number): string {
  const { meetings, counsellingRecords } = data;
  const numbered = (full: number, docs: number, title: string): string =>
    `${data.mode === 'full' ? full : docs}. ${title}`;

  const meetingRows: Cell[][] =
    meetings.length > 0
      ? meetings.map((m: any) => [
          { t: formatDocDate(m.meeting_date), bold: true },
          `${m.meeting_time || ''}<div class="small">(${m.location || ''})</div>`,
          m.attendance_status,
          m.challenges_discussed || 'None reported',
          m.corrective_action || 'Regular mentoring guidance',
          m.mentor_remarks || 'Satisfactory',
        ])
      : [[{ t: 'No meetings logged yet.', span: 6, empty: true }]];

  const mTable = gridTable({
    title: numbered(fullNo, docsNo, 'WEEKLY SATURDAY MENTOR\u2013MENTEE MEETINGS LOG'),
    cols: ['Date', 'Time & Location', 'Attendance', 'Challenges Discussed', 'Corrective Action Taken', 'Mentor Remarks'],
    colWidths: ['12', '15', '11', '21', '21', '20'],
    rows: meetingRows,
    titleClass: 'shrow',
  });

  const counsellingRows: Cell[][] =
    counsellingRecords.length > 0
      ? counsellingRecords.map((c: any) => [
          { t: formatDocDate(c.session_date), bold: true },
          { t: c.category, bold: true },
          { t: c.discussion_with, bold: true },
          c.challenge_observed,
          c.corrective_action,
          c.student_feedback || 'Acknowledged',
          c.mentor_remarks || 'Action initiated',
        ])
      : [[{ t: 'No formal counselling sessions logged.', span: 7, empty: true }]];

  const cTable = gridTable({
    title: numbered(fullNo + 1, docsNo + 1, '5-DOMAIN COUNSELLING & CORRECTIVE ACTION RECORDS'),
    cols: ['Date', 'Category Domain', 'Discussion With', 'Challenge Observed', 'Corrective Action Prescribed', 'Student Feedback', 'Mentor Remarks'],
    colWidths: ['11', '15', '14', '19', '19', '12', '10'],
    rows: counsellingRows,
    titleClass: 'shrow',
  });

  return `${mTable}${cTable}`;
}

function geoTaggedEvidenceHtml(data: RecordBookData): string {
  const allEvidence: any[] = [];
  for (const record of data.counsellingRecords as any[]) {
    for (const item of record.evidence || []) allEvidence.push({ ...item, session_date: record.session_date });
  }
  if (data.mode !== 'full' || allEvidence.length === 0) return '';
  const rows: Cell[][] = allEvidence.map((e: any) => [
    { t: e.session_date ? formatDocDate(e.session_date) : '-', bold: true },
    e.fileName || '-',
    `${(e.fileSize / 1024).toFixed(1)} KB`,
    e.capturedAt ? new Date(e.capturedAt).toISOString().slice(0, 19).replace('T', ' ') : '-',
    e.locationVerified ? `${e.latitudeLabel}, ${e.longitudeLabel}` : 'NOT AVAILABLE',
    e.accuracy != null ? `+/- ${Number(e.accuracy).toFixed(0)} m` : '-',
    e.capturedBy || '-',
  ]);
  return gridTable({
    title: '7.1&nbsp;&nbsp;GEO-TAGGED EVIDENCE PHOTOS (each file <= 200 KB)',
    cols: ['Date', 'File Name', 'Size', 'Captured At (UTC)', 'Location', 'Accuracy', 'Captured By'],
    colWidths: ['11', '21', '9', '18', '20', '9', '12'],
    rows,
    titleClass: 'shrow',
  });
}

async function photoEvidenceHtml(data: RecordBookData, fullNo: number, docsNo: number): Promise<string> {
  const photos = await resolveEvidencePhotos(data);
  if (photos.length === 0) return '';
  const label = `${data.mode === 'full' ? fullNo : docsNo}. MENTORING PHOTO EVIDENCE`;
  const heads = [`${label} — ${photos.length} PHOTO(S) ON RECORD`];
  const cells: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const { caption, view, dataUrl } = photos[i];
    const frame = dataUrl
      ? `<img src="${dataUrl}" alt="${esc(view.fileName || 'photo')}">`
      : `<span class="unavail">Photo file unavailable</span>`;
    const sizeLabel = view.fileSize != null ? ` — ${(Number(view.fileSize) / 1024).toFixed(1)} KB` : '';
    cells.push(
      `<td><div class="photoframe">${frame}</div>` +
        `<div class="photocap"><span class="n">${i + 1}.</span> ${esc(truncate(caption, 60))}</div>` +
        `<div class="photocap">${esc(truncate(`${view.fileName || 'photo'}${sizeLabel}`, 60))}</div></td>`
    );
  }
  // rows of two
  const rows: string[] = [`<tr class="shrow"><td colspan="2" class="c">${esc(heads[0])}</td></tr>`];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(`<tr>${cells[i]}${cells[i + 1] || '<td></td>'}</tr>`);
  }
  let note = '';
  if (photos.length < resolveEvidencePhotoCount(data)) {
    note = `<p class="note">Only up to ${EMBED_LIMITS.photos} photos can be carried in one record book; the first ${EMBED_LIMITS.photos} are shown.</p>`;
  }
  return `<table class="photos">${rows.join('')}</table>${note}`;
}

function resolveEvidencePhotoCount(data: RecordBookData): number {
  const seen = new Set<string>();
  let n = 0;
  for (const m of data.meetings as any[]) for (const v of m.evidence || []) {
    const k = String(v?.evidenceId || '');
    if (k && !seen.has(k)) { seen.add(k); n++; }
  }
  for (const m of data.meetings as any[]) for (const v of (m as any).evidence || []) seen.add(String(v?.evidenceId || ''));
  for (const c of data.counsellingRecords as any[]) for (const v of c.evidence || []) {
    const k = String(v?.evidenceId || '');
    if (k && !seen.has(k)) { seen.add(k); n++; }
  }
  return n;
}

function monthlyProgressHtml(data: RecordBookData): string {
  if (data.mode !== 'full' || data.monthlyProgress.length === 0) return '';
  const rows: Cell[][] = data.monthlyProgress.map((p: any) => [
    { t: p.month_name || p.academic_year || '-', bold: true },
    `Acad: ${p.academic_rating}/5<div class="small">${esc(p.academic_notes || '')}</div>`,
    `Placement: ${p.placement_rating}/5<div class="small">${esc(p.placement_notes || '')}</div>`,
    `E&amp;C: ${p.ec_rating}/5<div class="small">${esc(p.ec_notes || '')}</div>`,
    `Innov: ${p.innovation_rating}/5<div class="small">${esc(p.innovation_notes || '')}</div>`,
    `Skill: ${p.skill_rating}/5<div class="small">${esc(p.skill_notes || '')}</div>`,
  ]);
  return gridTable({
    title: '9. MONTHLY PROGRESS EVALUATION LEDGER',
    cols: ['Period', 'Academic', 'Placement', 'Extra-Curricular', 'Innovation', 'Skill Development'],
    colWidths: ['14', '18', '18', '18', '16', '16'],
    rows,
    titleClass: 'shrow',
  });
}

function documentsSectionHtml(data: RecordBookData, sectionNo: number): string {
  const uploadedCount = data.studentDocuments.filter((d: any) => !d.is_system_form).length;
  const rows: Cell[][] =
    data.studentDocuments.length > 0
      ? data.studentDocuments.map((d: any, i: number) => [
          { t: String(i + 1), center: true },
          { t: truncate(d.title, 38), bold: true },
          `${d.document_type}<div class="small">${esc(d.category)}</div>`,
          truncate(d.event_details, 46),
          { t: d.uploaded_on, center: true },
          { t: d.verification_status, center: true },
        ])
      : [[{ t: '—', center: true }, { t: 'No documents on record.', span: 5, empty: true }]];
  const table = gridTable({
    title: `${sectionNo}. STUDENT DOCUMENTS & CERTIFICATES – OFFICIAL ARCHIVE`,
    cols: ['#', 'Document Name', 'Type / Category', 'Event / Details', 'Upload Date', 'Status'],
    colWidths: ['5', '21', '16', '23', '12', '12'],
    rows,
    titleClass: 'shrow',
  });
  const note = `<p class="note">${uploadedCount} student-uploaded document(s) on record. Certificate scans are reproduced in full as annexures following the signed record. Verification is carried out by the assigned mentor / administrator.</p>`;
  return `${table}${note}`;
}

async function documentAnnexurePagesHtml(data: RecordBookData): Promise<string> {
  const resolved = await resolveDocumentFiles(data);
  const pages: string[] = [];
  for (const img of resolved.images) {
    const d = img.d;
    pages.push(`<section class="annexure">
  <div class="annexhead">ANNEXURE IMAGE – ${esc(d.title)}</div>
  <div class="annexmeta">${esc(d.document_type)} | ${esc(d.category)} | Uploaded: ${esc(d.uploaded_on)} | Status: ${esc(d.verification_status)} | File: ${esc(d.file_name)}</div>
  <div class="anneximg"><img src="${img.dataUrl}" alt="${esc(d.file_name)}"></div>
</section>`);
  }
  if (resolved.notEmbedded.length > 0) {
    const rowsHtml = resolved.notEmbedded
      .map((n) => `<tr><td class="b">${esc(n.name)}</td><td>${esc(n.reason)}</td></tr>`)
      .join('');
    pages.push(`<section class="annexure">
  <div class="annexhead">ANNEXURE EMBEDDING NOTICE</div>
  <p class="note">Every certificate above is reproduced in full as an annexure. The entries below are the only exceptions: they are registered in the documents section but their file could not be read at generation time. The file name and the exact reason are stated for each one.</p>
  <table class="grid"><colgroup><col style="width:24%;"><col style="width:76%;"></colgroup><tr><th>Document</th><th>Reason the annexure could not be produced</th></tr>${rowsHtml}</table>
</section>`);
  }
  return pages.join('');
}

function signatureBlockHtml(): string {
  return `<div class="signatures">
  <div class="sigheading">INSTITUTIONAL VERIFICATION &amp; DIGITAL ENDORSEMENT</div>
  <div class="sigrow">
    <div class="sigcol"><div class="small" style="white-space:pre">____________</div>Signature of Mentee</div>
    <div class="sigcol">____________<div class="small" style="margin-top:1mm">Signature of Mentor</div></div>
    <div class="sigcol">____________<div class="small" style="margin-top:1mm">Head of Department</div></div>
    <div class="sigcol">____________<div class="small" style="margin-top:1mm">Principal / Dean</div></div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Full document assembly
// ---------------------------------------------------------------------------
export interface RecordBookHtmlOptions {
  /** Render the K S R C E watermark as the CSS background layer. Default true. */
  watermark?: boolean;
}

export function docTitleFor(mode: StudentPdfMode): string {
  return mode === 'internal'
    ? 'OFFICIAL INTERNAL ASSESSMENT REPORT'
    : mode === 'mentor-documents'
      ? 'MENTORING RECORDS & DOCUMENT ARCHIVE'
      : 'OFFICIAL DIGITAL MENTOR–MENTEE RECORD BOOK';
}

export async function buildRecordBookHtml(data: RecordBookData, opts: RecordBookHtmlOptions = {}): Promise<string> {
  const watermark = opts.watermark !== false;
  const { mode } = data;
  const parts: string[] = [];

  parts.push(headerHtml(docTitleFor(mode)));
  parts.push(bannerHtml(data));

  if (mode === 'full') {
    parts.push(section1And2Html(data));
    parts.push(semesterRowsHtml(data));
    if (data.arrearStats.arrearHistory && data.arrearStats.arrearHistory.length > 0) {
      parts.push(arrearHistoryHtml(data));
    }
    parts.push(internalAssessmentHtml(data, '4. INTERNAL ASSESSMENT MARKS'));
    parts.push(mentorLineageHtml(data));
  } else if (mode === 'mentor-documents') {
    parts.push(studentMentorInfoHtml(data));
  } else {
    // internal
    parts.push(internalAssessmentHtml(data, '1. INTERNAL ASSESSMENT MARKS (IA1 / 50 • IA2 / 50 • END SEMESTER / 100)'));
  }

  if (mode !== 'internal') {
    parts.push(meetingsCounsellingHtml(data, 6, 2));
    if (mode === 'full') parts.push(geoTaggedEvidenceHtml(data));
    parts.push(await photoEvidenceHtml(data, 8, 4));
    if (mode === 'full') parts.push(monthlyProgressHtml(data));
    const documentsSectionNo = mode === 'full' ? 10 : 5;
    parts.push(documentsSectionHtml(data, documentsSectionNo));
    parts.push(await documentAnnexurePagesHtml(data));
  }

  parts.push(signatureBlockHtml());
  return wrapHtml(parts.join('\n'), watermark);
}

// ---------------------------------------------------------------------------
// PDF annexure append (pdf-lib) — mirrors the legacy jsPDF annexure sheets
// ---------------------------------------------------------------------------
async function appendPdfAnnexures(
  baseBytes: Uint8Array,
  data: RecordBookData,
  annexurePdfs: AnnexPdf[]
): Promise<{ bytes: Uint8Array; basePageCount: number }> {
  const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const merged = await PDFDocument.load(baseBytes);
  const basePageCount = merged.getPageCount();

  if (annexurePdfs.length === 0) {
    return { bytes: baseBytes, basePageCount };
  }

  const primaryColor: [number, number, number] = [11, 37, 69];

  for (const [idx, item] of annexurePdfs.entries()) {
    const sheet = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const sw = sheet.internal.pageSize.getWidth();
    const sh = sheet.internal.pageSize.getHeight();
    const sm = 14;

    sheet.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    sheet.rect(sm, 10, sw - sm * 2, 2.5, 'F');
    if (logoBase64) {
      try {
        sheet.addImage(logoBase64, 'PNG', sm + 2, 13.5, 17, 17);
      } catch {
        /* logo optional */
      }
    }
    sheet.setFont('helvetica', 'bold');
    sheet.setFontSize(14);
    sheet.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    sheet.text('K.S.R. COLLEGE OF ENGINEERING', sw / 2, 17, { align: 'center' });
    sheet.setFont('helvetica', 'normal');
    sheet.setFontSize(8);
    sheet.setTextColor(80, 80, 80);
    sheet.text(`Annexure ${idx + 1}`, sw / 2, 30.5, { align: 'center' });
    sheet.setDrawColor(200, 200, 200);
    sheet.setLineWidth(0.5);
    sheet.line(sm, 33, sw - sm, 33);

    let y = 44;
    sheet.setFont('helvetica', 'bold');
    sheet.setFontSize(11);
    sheet.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    sheet.text(`ANNEXURE ${idx + 1} OF ${annexurePdfs.length} - ${item.meta.title}`, sm, y, { maxWidth: sw - sm * 2 });
    y += 9;

    const detailRows: string[][] = [
      ['Student', data.student.full_name],
      ['Register Number', data.student.register_number],
      ['Document Name', item.meta.title],
      ['Stored File', item.meta.file_name],
      ['Type / Category', `${item.meta.document_type} / ${item.meta.category}`],
      ['Event / Details', item.meta.event_details],
      ['Upload Date', item.meta.uploaded_on],
      ['Verification Status', item.meta.verification_status],
      ['File Type / Size', `${item.meta.file_type} / ${item.meta.file_size} bytes`],
      ['Pages Reproduced', String(item.pages)],
    ];

    autoTable(sheet, {
      startY: y,
      margin: { left: sm, right: sm },
      theme: 'grid',
      body: detailRows.map(([k, v]) => [
        { content: k, styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        String(v || 'N/A'),
      ]),
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 46 } },
    });

    y = (sheet as any).lastAutoTable.finalY + 8;
    sheet.setFont('helvetica', 'italic');
    sheet.setFontSize(7.5);
    sheet.setTextColor(100, 100, 100);
    sheet.text(
      `The following ${item.pages} page(s) are a verbatim reproduction of the document uploaded by the student through Student Documents on ${item.meta.uploaded_on}.`,
      sm,
      y,
      { maxWidth: sw - sm * 2 }
    );

    sheet.setDrawColor(210, 210, 210);
    sheet.setLineWidth(0.4);
    sheet.line(sm, sh - 12, sw - sm, sh - 12);
    sheet.setFontSize(7.5);
    sheet.setTextColor(120, 120, 120);
    sheet.text(
      `KSRCE Digital Mentor-Mentee System | Reg No: ${data.student.register_number} | Generated on: ${reportDate}`,
      sm,
      sh - 8
    );

    const sheetDoc = await PDFDocument.load(sheet.output('arraybuffer'));
    const sheetPages = await merged.copyPages(sheetDoc, sheetDoc.getPageIndices());
    sheetPages.forEach((p) => merged.addPage(p));

    const srcDoc = item.doc;
    const srcPages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
    srcPages.forEach((p) => merged.addPage(p));
  }

  return { bytes: new Uint8Array(await merged.save()), basePageCount };
}

// ---------------------------------------------------------------------------
// Per-page footer ("… | Reg No: … | Generated on: …" + "Page X of Y")
// Stamped with pdf-lib onto the Chrome-rendered document pages only (appended
// verbatim PDF annexure pages and their sheets keep their own layout).
// ---------------------------------------------------------------------------
async function stampPageFooters(pdfBytes: Uint8Array, registerNumber: string, upToIndex: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPageCount();
  const limit = Math.min(upToIndex, pages);
  if (limit <= 0) return pdfBytes;
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const gray = rgb(120 / 255, 120 / 255, 120 / 255);
  const rule = rgb(210 / 255, 210 / 255, 210 / 255);

  for (let i = 0; i < limit; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const yLine = 12 * 2.8346; // 12 mm from the BOTTOM (legacy footer position; pdf-lib y is bottom-anchored)
    const yText = 8 * 2.8346; // 8 mm from the bottom
    page.drawLine({ start: { x: 14 * 2.8346, y: yLine }, end: { x: width - 14 * 2.8346, y: yLine }, thickness: 0.4, color: rule });
    page.drawText(`KSRCE Digital Mentor-Mentee System | Reg No: ${registerNumber} | Generated on: ${reportDate}`, {
      x: 14 * 2.8346,
      y: yText,
      size: 7.5,
      font: helv,
      color: gray,
    });
    const suffix = `Page ${i + 1} of ${pages}`;
    const suffixWidth = helv.widthOfTextAtSize(suffix, 7.5);
    page.drawText(suffix, { x: width - 14 * 2.8346 - suffixWidth, y: yText, size: 7.5, font: helv, color: gray });
  }
  return new Uint8Array(await doc.save());
}

// ---------------------------------------------------------------------------
// Public entry: HTML/CSS → PDF
// ---------------------------------------------------------------------------
export async function renderRecordBookHtmlToPdf(
  data: RecordBookData,
  opts: RecordBookHtmlOptions = {}
): Promise<Uint8Array | null> {
  if (!isHtmlPdfRendererAvailable()) return null;
  try {
    const html = await buildRecordBookHtml(data, opts);
    const base = await renderHtmlToPdfBuffer(html);
    if (!base) return null;

    // PDF annexures (uploaded certificate PDFs) are appended exactly like the
    // legacy renderer does; images were inlined by the HTML itself.
    const resolved = await resolveDocumentFiles(data);
    const appended = await appendPdfAnnexures(base, data, resolved.pdfs);
    const finalBytes = await stampPageFooters(appended.bytes, data.student.register_number, appended.basePageCount);
    return finalBytes;
  } catch (err) {
    console.error('[record-book-html] generation failed, falling back to jsPDF:', (err as Error)?.message);
    return null;
  }
}

/** Re-exported so the tests can generate record books directly. */
export { collectRecordBookData, formatDocDate };
export type { RecordBookData, StudentPdfMode };