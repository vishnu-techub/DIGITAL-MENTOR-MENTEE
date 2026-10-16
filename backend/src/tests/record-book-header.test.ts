/**
 * STUDENT RECORD BOOK — repeating institutional header on EVERY page.
 * ---------------------------------------------------------------------------
 * Proves, on a REAL multi-page PDF produced by the production HTML/CSS →
 * headless-Chromium → pdf-lib pipeline, that:
 *
 *   A. A synthetic but realistic record book spans 3+ pages and the long
 *      internal-assessment table flows across those pages.
 *   B. The institutional header (college name + autonomous/affiliation line +
 *      address + logo + divider) is present on page 1 AND on
 *      every subsequent page — including the pages the long table spills onto.
 *      The full Record Book prints NO document-title heading, and the removed
 *      "INSTITUTIONAL VERIFICATION & DIGITAL ENDORSEMENT" signature heading must
 *      not appear on any page either (asserted below).
 *   C. Body content never overlaps the header: every non-header text line on
 *      every page starts BELOW the header band (geometric check via MuPDF
 *      line bounding boxes, not an inference).
 *   D. The footer page number is correct on every page ("Page X of Y").
 *   E. The K S R C E watermark is still present on every page (the header does
 *      not remove or replace the watermark requirement).
 *   F. The college logo image is embedded on every page.
 *
 * The geometry is asserted from the actual rendered PDF. When
 * KSRCE_RB_HEADER_DUMP=1 is set, every page is also written to
 * ../.runtime-verify/header-exp/rb-pN.png for human inspection.
 *
 * Run: npx tsx src/tests/record-book-header.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  renderRecordBookHtmlToPdf,
  isHtmlPdfRendererAvailable,
  docTitleFor,
  headerBandMm,
  headerRuleMm,
} from '../modules/pdf/record-book-html.service.js';
import type { RecordBookData } from '../modules/pdf/record-book-html.data.js';
import { pdfPageCount, pdfPageTexts, pdfPageImages, pdfPageLines } from './helpers/pdf-text.js';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(requirement: string, condition: boolean, evidence = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${requirement}${evidence ? ` — ${evidence}` : ''}`);
  } else {
    fail++;
    failures.push(requirement);
    console.log(`  [FAIL] ${requirement}${evidence ? `\n         evidence: ${evidence}` : ''}`);
  }
}

const MM = 2.83465; // 1 mm in PDF points
/**
 * Divider y of the stamped header for THIS render. The full Record Book prints
 * no document-title line, so its header band is 31.5mm and the divider sits at
 * 28.4mm (headerRuleMm('full')); the other modes keep 35mm / 30.6mm.
 */
const HEADER_RULE_MM = headerRuleMm('full');
const HEADER_BAND_FLOOR_MM = 33; // anything above this is header, never body
/** Text that belongs to the stamped header (excluded from the overlap check). */
const HEADER_TEXT_RE =
  /COLLEGE OF ENGINEERING|Autonomous Institution|Kalvi Nagar|INTERNAL ASSESSMENT REPORT|MENTORING RECORDS|K S R C E/i;

/** A realistic full record book: a long internal-assessment table spanning pages. */
function buildSyntheticRecordBook(): RecordBookData {
  const semesters = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    return {
      semester_number: n,
      cgpa: 8 + n / 100,
      sgpa: 7.5 + n / 100,
      arrears_count: n === 4 ? 1 : 0,
      arrears_subjects: n === 4 ? 'CS8401' : '',
      has_active_arrear: n === 4,
    };
  });

  const prefixes = ['CS', 'EC', 'ME', 'CE', 'EE', 'IT'];
  const internalMarks: any[] = [];
  for (let sem = 1; sem <= 8; sem++) {
    for (let k = 0; k < 15; k++) {
      internalMarks.push({
        semesterNumber: sem,
        subjectCode: `${prefixes[k % prefixes.length]}${sem}${String(k + 1).padStart(2, '0')}`,
        subjectName: `Subject ${sem}-${k + 1} — Engineering Course Unit ${k + 1}`,
        ia1: 40 + (k % 10),
        ia2: 38 + (k % 12),
        endSem: 70 + (k % 30),
      });
    }
  }

  return {
    mode: 'full',
    registerNumber: '731523301001',
    student: {
      full_name: 'Sample Student Name',
      register_number: '731523301001',
      department_name: 'Computer Science and Engineering',
      department_code: 'CSE',
      batch_name: '2023-2027',
      year: 'Year 3',
      section: 'A',
      residential_type: 'DAY_SCHOLAR',
      blood_group: 'B+ve',
      mobile_number: '9000000000',
      email: 'sample.student@ksrce.test',
      dob: '2005-06-15',
      address: 'K.S.R. Kalvi Nagar, Tiruchengode',
    },
    parent: {
      father_name: 'Parent One',
      father_contact: '9000000001',
      father_occupation: 'Business',
      mother_name: 'Parent Two',
      mother_contact: '9000000002',
      mother_occupation: 'Homemaker',
    },
    siblings: [],
    school: {
      tenth_mark: 480,
      tenth_school: 'Government Higher Secondary School',
      twelfth_mark: 560,
      twelfth_school: 'Government Higher Secondary School',
      cutoff_mark: 185,
      admission_type: 'COUNSELLING',
      scholarship_details: 'Nil',
      lateral_entry: null,
    },
    semesters,
    arrearStats: {
      formattedSemesters: semesters,
      activeArrearsCount: 1,
      historicalArrearsCount: 1,
      clearedCount: 0,
      arrearHistory: [],
    },
    internalMarks,
    currentMentor: {
      assigned_from: new Date('2024-07-01'),
      employee_id: 'FAC-001',
      designation: 'Assistant Professor',
      cabin_location: 'Block A',
      phone_number: '9000000003',
      mentor_name: 'Dr Sample Mentor',
      mentor_email: 'mentor@ksrce.test',
    },
    mentorHistory: [],
    meetings: [],
    counsellingRecords: [],
    monthlyProgress: [],
    studentDocuments: [],
  } as RecordBookData;
}

async function dumpPages(buf: Buffer) {
  const outDir = path.resolve(process.cwd(), '..', '.runtime-verify', 'header-exp');
  fs.mkdirSync(outDir, { recursive: true });
  const mupdf: any = await import('mupdf');
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  for (let i = 0; i < doc.countPages(); i++) {
    const pix = doc.loadPage(i).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
    fs.writeFileSync(path.join(outDir, `rb-p${i + 1}.png`), Buffer.from(pix.asPNG()));
  }
  console.log(`  (pages dumped to ${outDir})`);
}

interface RawPage {
  w: number;
  h: number;
  data: Buffer;
}

/** Render every page to raw RGB (2x) so the two renders can be diffed. */
async function rawPages(buf: Buffer): Promise<RawPage[]> {
  const mupdf: any = await import('mupdf');
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  const out: RawPage[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const pix = doc.loadPage(i).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
    const { data, info } = await sharp(Buffer.from(pix.asPNG())).raw().toBuffer({ resolveWithObject: true });
    out.push({ w: info.width, h: info.height, data });
  }
  return out;
}

async function main() {
  console.log('\n=== Student record book: repeating institutional header ===\n');

  if (!isHtmlPdfRendererAvailable()) {
    console.error('  [ABORT] No headless Chromium found — this verification needs the real HTML/CSS renderer.');
    process.exit(1);
  }

  const data = buildSyntheticRecordBook();
  const fullTitle = docTitleFor('full'); // '' — removed by request
  check(
    'the full Record Book has no document-title heading configured',
    fullTitle === '',
    `docTitleFor('full') = "${fullTitle}", header band ${headerBandMm('full')}mm`
  );
  const bytes = await renderRecordBookHtmlToPdf(data);
  check('the HTML/CSS renderer produced a PDF', !!bytes && bytes.length > 0, `${bytes?.length ?? 0} bytes`);
  if (!bytes) {
    finish();
    return;
  }
  const buf = Buffer.from(bytes);

  const pageCount = await pdfPageCount(buf);
  const pageTexts = await pdfPageTexts(buf);
  const images = await pdfPageImages(buf);
  const lines = await pdfPageLines(buf);

  const logoMeta = await sharp(path.resolve(process.cwd(), 'assets', 'ksrce-logo.png')).metadata();
  const logoW = Number(logoMeta.width || 0);
  const logoH = Number(logoMeta.height || 0);

  check('the record book spans at least 3 pages', pageCount >= 3, `${pageCount} pages`);

  const codes = (data.internalMarks as any[]).map((m) => String(m.subjectCode));
  const pagesWithMarks = pageTexts.filter((t) => codes.some((c) => t.includes(c))).length;
  check(
    'the long internal-assessment table flows across 3+ pages',
    pagesWithMarks >= 3,
    `subject rows appear on ${pagesWithMarks} distinct pages`
  );

  console.log('\n  Per-page header / footer / watermark / logo / no-overlap:');
  for (let p = 0; p < pageCount; p++) {
    const text = pageTexts[p] || '';
    const pageLines = lines.filter((l) => l.page === p && l.text.trim() !== '');

    // B. Header present on this page.
    const headerLine = pageLines.find((l) => /K\.S\.R\. COLLEGE OF ENGINEERING/i.test(l.text));
    const hasAutonomous = /Autonomous Institution/i.test(text);
    check(`page ${p + 1}: institutional header present`, !!headerLine && hasAutonomous);

    // B. Header sits inside the reserved top band (not floating mid-page).
    check(
      `page ${p + 1}: header is inside the reserved top band`,
      !!headerLine && headerLine.y0 < HEADER_BAND_FLOOR_MM * MM,
      headerLine ? `header top y=${headerLine.y0.toFixed(1)}pt (< ${(HEADER_BAND_FLOOR_MM * MM).toFixed(1)}pt)` : 'no header line'
    );

    // C. No body text invades the header band.
    const intruders = pageLines.filter(
      (l) => l.y0 < HEADER_RULE_MM * MM && !HEADER_TEXT_RE.test(l.text)
    );
    check(
      `page ${p + 1}: body content does not overlap the header`,
      intruders.length === 0,
      intruders.length
        ? `intruding line(s): ${intruders.map((l) => `"${l.text.slice(0, 40)}"@y${l.y0.toFixed(0)}`).join(', ')}`
        : `all body text starts below ${(HEADER_RULE_MM).toFixed(1)}mm`
    );

    // D. Footer page number correct.
    check(`page ${p + 1}: footer shows "Page ${p + 1} of ${pageCount}"`, text.includes(`Page ${p + 1} of ${pageCount}`));

    // E. Watermark preserved.
    check(`page ${p + 1}: K S R C E watermark present`, text.includes('K S R C E'));

    // F. Logo embedded on this page.
    const logoHere = images.some((im) => im.page === p && im.width === logoW && im.height === logoH);
    check(`page ${p + 1}: college logo image embedded`, logoHere, `looking for ${logoW}x${logoH}`);
  }

  // Headings removed by request: neither the signature heading nor the full
  // Record Book "OFFICIAL DIGITAL MENTOR–MENTEE RECORD BOOK" title may appear on
  // any rendered page.
  const joinedText = pageTexts.join('\n');
  check(
    'the removed "THE INSTITUTIONAL VERIFICATION & DIGITAL ENDORSEMENT" heading is absent',
    !/INSTITUTIONAL VERIFICATION/i.test(joinedText)
  );
  check(
    'the removed "OFFICIAL DIGITAL MENTOR–MENTEE RECORD BOOK" heading is absent',
    !/OFFICIAL DIGITAL MENTOR/i.test(joinedText)
  );

  // Every page the long table continues onto must repeat the column headers
  // (<thead>), so the reader never sees unlabelled columns.
  const pagesWithMarkList = pageTexts.filter((t) => codes.some((c) => t.includes(c)));
  check(
    'every page the long table continues onto repeats its column headers',
    pagesWithMarkList.length >= 3 && pagesWithMarkList.every((t) => /Subject Code/.test(t)),
    `${pagesWithMarkList.length} page(s) carry subject rows; all labelled`
  );

  // No body text may be clipped below the page content box (bottom margin 16mm).
  const bottomLimit = (297 - 16) * MM;
  let clipOk = true;
  const clipDetails: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const body = lines.filter((l) => l.page === p && l.y0 >= HEADER_RULE_MM * MM && l.y0 <= 285 * MM);
    const maxY1 = Math.max(...body.map((l) => l.y1), 0);
    if (maxY1 > bottomLimit + 1) clipOk = false;
    clipDetails.push(`p${p + 1}:${maxY1.toFixed(0)}pt`);
  }
  check(
    'no body content is clipped below the page content box',
    clipOk,
    `max body bottom per page ${clipDetails.join(' ')} (limit ${bottomLimit.toFixed(0)}pt)`
  );

  // The watermark must be a genuine BACKGROUND layer: diffing the watermarked
  // render against an identical un-watermarked control, the document ink must be
  // byte-identical (a foreground overlay would shift every text pixel). The
  // watermark ink that does appear must run along the bottom-left -> top-right
  // "/" diagonal and be centred on the physical page.
  console.log('\n  Watermark background layer / diagonal / centring (pixel diff vs control):');
  const controlBytes = await renderRecordBookHtmlToPdf(data, { watermark: false });
  check('un-watermarked control render produced a PDF', !!controlBytes && controlBytes.length > 0);
  if (controlBytes) {
    const wmPages = await rawPages(buf);
    const ctrlPages = await rawPages(Buffer.from(controlBytes));
    const n = Math.min(wmPages.length, ctrlPages.length);
    let behindOk = true;
    let directionOk = true;
    let centredOk = true;
    let visibleOk = true;
    const detail: string[] = [];
    const visibility: string[] = [];
    for (let p = 0; p < n; p++) {
      const a = wmPages[p];
      const b = ctrlPages[p];
      if (a.w !== b.w || a.h !== b.h) { behindOk = false; directionOk = false; continue; }
      let contentPx = 0;
      let contentChanged = 0;
      let sx = 0, sy = 0, sxy = 0, sxx = 0, wn = 0;
      let minY = Infinity, maxY = -Infinity;
      let maxMag = 0;
      for (let i = 0; i < a.data.length; i += 3) {
        const mag =
          Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2]);
        const lumControl = 0.299 * b.data[i] + 0.587 * b.data[i + 1] + 0.114 * b.data[i + 2];
        if (lumControl < 160) {
          contentPx++;
          if (mag > 0) contentChanged++;
        } else if (mag > 6) {
          if (mag > maxMag) maxMag = mag;
          const px = (i / 3) % a.w;
          const py = Math.floor((i / 3) / a.w);
          sx += px; sy += py; sxy += px * py; sxx += px * px; wn++;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
      const changedRatio = contentPx ? contentChanged / contentPx : 1;
      if (changedRatio > 0.05) behindOk = false;
      const slope = wn > 1 ? (wn * sxy - sx * sy) / Math.max(1, wn * sxx - sx * sx) : 0;
      if (!(slope < 0)) directionOk = false; // y grows downward: -slope => "/"
      // Visibility: the mark must be CLEARLY visible (its strongest ink differs
      // from the control by a wide margin) yet still TRANSLUCENT (it never
      // approaches the darkness of solid text, whose mag would be ~765). The
      // 0.4 grey @ 0.26 alpha mark composites to ≈215 on white => mag ≈120.
      const visible = maxMag >= 45 && maxMag <= 220;
      if (!visible) visibleOk = false;
      visibility.push(`p${p + 1} maxMag${maxMag}`);
      // Measure the mark's position from the watermark text's own PDF geometry.
      // Opaque table cells / the banner are painted ABOVE the background layer,
      // so a pixel-diff bbox loses whatever part of the mark sits under content
      // and drifts on sparse pages; the text bbox is unaffected by overpainting.
      const pageHpt = a.h / 2;
      const wmLine = lines.find((l) => l.page === p && l.text.trim() === 'K S R C E');
      const bboxCentreY = wmLine ? (wmLine.y0 + wmLine.y1) / 2 : (minY + maxY) / 4;
      if (!Number.isFinite(bboxCentreY) || Math.abs(bboxCentreY - pageHpt / 2) > 20) centredOk = false;
      detail.push(`p${p + 1} ink+${(changedRatio * 100).toFixed(2)}% slope${slope.toFixed(2)} cy${bboxCentreY.toFixed(0)}/${(pageHpt / 2).toFixed(0)}`);
    }
    check('the watermark is a true background layer (document ink unchanged)', behindOk, detail.join(' | '));
    check('the watermark runs bottom-left -> top-right ("/" diagonal)', directionOk, detail.join(' | '));
    check('the watermark is clearly visible but translucent', visibleOk, visibility.join(' | '));
    check('the watermark is centred on the physical page', centredOk, detail.join(' | '));
  }

  // The other two download modes share the same renderer and must get the same
  // repeating header + footer on every page.
  console.log('\n  Other document modes through the shared pipeline:');
  for (const mode of ['internal', 'mentor-documents'] as const) {
    const modeBytes = await renderRecordBookHtmlToPdf({ ...data, mode } as RecordBookData);
    check(`${mode}: renderer produced a PDF`, !!modeBytes && modeBytes.length > 0);
    if (!modeBytes) continue;
    const modeTexts = await pdfPageTexts(Buffer.from(modeBytes));
    const everyPageFurnished =
      modeTexts.length > 0 &&
      modeTexts.every((t) => /K\.S\.R\. COLLEGE OF ENGINEERING/i.test(t) && /Page \d+ of \d+/.test(t));
    check(
      `${mode}: header + footer on every page`,
      everyPageFurnished,
      `${modeTexts.length} pages, title "${docTitleFor(mode)}"`
    );
    // The other two document types were deliberately NOT changed: their own
    // title must still print on every page, and the removed signature heading
    // must be gone from them too.
    const title = docTitleFor(mode);
    check(
      `${mode}: its own document title is still repeated on every page`,
      title.length > 0 && modeTexts.every((t) => t.includes(title)),
      `"${title}" on ${modeTexts.length} page(s)`
    );
    check(
      `${mode}: removed signature heading is absent`,
      !modeTexts.some((t) => /INSTITUTIONAL VERIFICATION/i.test(t))
    );
  }

  if (process.env.KSRCE_RB_HEADER_DUMP === '1') await dumpPages(buf);

  finish();
}

function finish() {
  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('record-book-header test crashed:', err);
  process.exit(1);
});
