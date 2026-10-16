/**
 * STUDENT RECORD BOOK PDF — UPLOADED CERTIFICATES ARE REPRODUCED.
 * ---------------------------------------------------------------------------
 * Drives the REAL production record-book pipeline (the HTML/CSS →
 * headless-Chromium → pdf-lib renderer, then the bytes are read back with
 * MuPDF) over a real local file store, and proves that certificates a student
 * uploaded through My Progress & Achievements actually appear in the generated
 * PDF — as a listed archive row AND as the certificate's own reproduced pages.
 *
 * Before the fix the record book read only the `StudentDocument` collection, so
 * a certificate that lived in `StudentProgress` was invisible: the PDF printed
 * "0 student-uploaded document(s) on record" and appended no annexure pages,
 * even though the portal displayed the file fine.
 *
 * This suite asserts, on the actual generated PDF bytes:
 *
 *   A. The certificate row is listed and counted in the documents archive.
 *   B. The uploaded PDF's own text is reproduced VERBATIM on its own page, and
 *      an uploaded image is inlined at its real pixel dimensions.
 *   C. The system Student Details Form is listed but never self-embedded.
 *   D. Another student's certificate never appears (isolation).
 *   E. A certificate referenced by both stores is listed and reproduced once.
 *   F. A missing file, an unsupported type and a record with no file attached
 *      produce clear, distinct reasons on the embedding-notice page — and a
 *      lost file is never mislabelled as "needs administrator repair".
 *   G. The other download modes keep working (mentor-documents includes it;
 *      internal stays document-free).
 *   H. Generating the PDF changes nothing: the original files keep their exact
 *      bytes, no achievement/point rows appear, and the record count is stable.
 *
 * Run: npx tsx src/tests/record-book-certificates.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('record-book-certificates');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;
process.env.NODE_ENV = 'test';

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

const norm = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

async function main() {
  const { connectDB } = await import('../config/database.js');
  await connectDB();

  const { jsPDF } = await import('jspdf');
  const sharp = (await import('sharp')).default;
  const { Department, Batch, User, Student, StudentDocument, StudentProgress, Achievement } =
    await import('../models/index.js');
  const { collectRecordBookData } = await import('../modules/pdf/record-book-html.data.js');
  const {
    renderRecordBookHtmlToPdf,
    isHtmlPdfRendererAvailable,
  } = await import('../modules/pdf/record-book-html.service.js');
  const { pdfPageCount, pdfPageTexts, pdfPageImages } = await import('./helpers/pdf-text.js');

  // ---------------------------------------------------------------- fixtures
  /** A one-page PDF whose selectable text is exactly `text`. */
  const certPdf = (text: string): Buffer => {
    const d = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    d.setFontSize(18);
    d.text(text, 20, 40);
    return Buffer.from(d.output('arraybuffer') as ArrayBuffer);
  };
  const imageBytes = async (): Promise<Buffer> =>
    sharp({ create: { width: 240, height: 160, channels: 3, background: { r: 20, g: 90, b: 200 } } })
      .png()
      .toBuffer();

  const progressDir = path.join(store.uploadsDir, 'progress');
  fs.mkdirSync(progressDir, { recursive: true });
  /** Write a file into the uploads tree and return its stored-URL metadata. */
  const storeFile = async (name: string, bytes: Buffer, fileType: string) => {
    const abs = path.join(progressDir, name);
    fs.writeFileSync(abs, bytes);
    return {
      abs,
      fileUrl: `/uploads/progress/${name}`,
      fileName: name,
      fileSize: bytes.length,
      fileType,
    };
  };

  const dept: any = await Department.create({ name: 'Information Technology', code: 'IT' });
  const batch: any = await Batch.create({ name: '2024-2028', startYear: 2024, endYear: 2028 });
  const hash = '$2b$10$abcdefghijklmnopqrstuv';

  const makeStudent = async (reg: string, fullName: string) => {
    const user: any = await User.create({
      username: reg,
      passwordHash: hash,
      role: 'STUDENT',
      email: `${reg}@ksrce.test`,
      fullName,
      department: dept._id,
      isActive: true,
    });
    return Student.create({
      user: user._id,
      fullName,
      registerNumber: reg,
      email: `${reg}@ksrce.test`,
      mobileNumber: '9876500001',
      department: dept._id,
      section: 'A',
      year: 3,
      batch: batch._id,
      profileCompleted: true,
      isActive: true,
    });
  };

  const studentA: any = await makeStudent('731523310001', 'Record Book Owner');
  const studentB: any = await makeStudent('731523310002', 'Unrelated Student');

  // --- Student A's two certificates (one PDF, one image) ---
  const textA = 'CERT-ALPHA-731523310001-VERBATIM-PAGE';
  const fileA = await storeFile('prog-cert-alpha.pdf', certPdf(textA), 'application/pdf');
  const certA: any = await StudentProgress.create({
    studentId: studentA._id,
    registerNumber: studentA.registerNumber,
    studentName: studentA.fullName,
    category: 'Hackathon Certificate',
    activityName: 'Alpha Hackathon Certificate',
    organization: 'Alpha Org',
    eventName: 'Alpha Grand Finale',
    date: '2026-02-22',
    status: 'Verified',
    certificateUrl: fileA.fileUrl,
    fileName: fileA.fileName,
    fileSize: fileA.fileSize,
    fileType: fileA.fileType,
  });

  const imgBytes = await imageBytes();
  const fileB = await storeFile('prog-cert-beta.png', imgBytes, 'image/png');
  const certB: any = await StudentProgress.create({
    studentId: studentA._id,
    registerNumber: studentA.registerNumber,
    studentName: studentA.fullName,
    category: 'NPTEL Certificate',
    activityName: 'Beta Image Certificate',
    status: 'Approved',
    certificateUrl: fileB.fileUrl,
    fileName: fileB.fileName,
    fileSize: fileB.fileSize,
    fileType: fileB.fileType,
  });

  // --- The system Student Details Form: listed, but must never self-embed ---
  const formText = 'SYSTEM-FORM-DO-NOT-EMBED';
  const fileForm = await storeFile('Student_Details_Form_fixture.pdf', certPdf(formText), 'application/pdf');
  await StudentDocument.create({
    studentId: studentA._id,
    title: 'Student Details Form',
    fileName: fileForm.fileName,
    fileUrl: fileForm.fileUrl,
    fileType: fileForm.fileType,
    fileSize: fileForm.fileSize,
    documentType: 'student_details_form',
    category: 'Other',
    isPrimary: true,
    verificationStatus: 'Verified',
    uploadedAt: new Date('2026-10-08'),
  });

  // --- Another student's certificate (isolation) ---
  const textOther = 'CERT-OTHER-STUDENT-999';
  const fileOther = await storeFile('prog-cert-other.pdf', certPdf(textOther), 'application/pdf');
  await StudentProgress.create({
    studentId: studentB._id,
    registerNumber: studentB.registerNumber,
    studentName: studentB.fullName,
    category: 'Award Certificate',
    activityName: 'Other Student Secret Certificate',
    status: 'Verified',
    certificateUrl: fileOther.fileUrl,
    fileName: fileOther.fileName,
    fileSize: fileOther.fileSize,
    fileType: fileOther.fileType,
  });

  if (!isHtmlPdfRendererAvailable()) {
    console.error('  [ABORT] No headless Chromium found — this verification needs the real HTML/CSS renderer.');
    process.exit(1);
  }

  const hashesBefore = {
    alpha: sha256(fs.readFileSync(fileA.abs)),
    beta: sha256(imgBytes),
    form: sha256(fs.readFileSync(fileForm.abs)),
    other: sha256(fs.readFileSync(fileOther.abs)),
  };
  const achievementsBefore = await Achievement.countDocuments({});
  // Fingerprint every certificate record that exists BEFORE any render, so the
  // read-only check below proves the generator neither altered nor deleted one
  // (records added later as edge fixtures are new rows, not mutations).
  const progressSnapshot = new Map<string, string>();
  for (const row of (await StudentProgress.find({})) as any[]) {
    progressSnapshot.set(String(row._id), `${row.status}|${row.certificateUrl}|${row.fileSize}`);
  }

  /**
   * Render a record book with the renderer's own diagnostics silenced, so the
   * test's evidence stays readable (a missing fixture file is expected here and
   * is logged with `console.error` by the production code path).
   */
  const render = async (mode: 'full' | 'mentor-documents' | 'internal') => {
    const realError = console.error;
    console.error = () => {};
    try {
      const data = await collectRecordBookData(String(studentA._id), mode);
      const bytes = await renderRecordBookHtmlToPdf(data);
      if (!bytes) throw new Error(`renderer returned null for mode=${mode}`);
      return { data, buf: Buffer.from(bytes) };
    } finally {
      console.error = realError;
    }
  };

  console.log('\n=== Record book PDF: uploaded certificates are reproduced ===\n');

  // ---------------------------------------------------------- A/B/C/D: listing
  console.log('A. Archive listing, verbatim reproduction, isolation');
  const { data: dataFull, buf: full } = await render('full');
  const archive: any[] = dataFull.studentDocuments;
  const certIds = archive.map((d) => d.id);

  check('the certificate ledger rows are listed in the archive',
    certIds.includes(String(certA._id)) && certIds.includes(String(certB._id)),
    `archive ids=${certIds.join(',')}`);
  check('the system Student Details Form is still listed',
    archive.some((d) => d.is_system_form === true),
    `is_system_form rows=${archive.filter((d) => d.is_system_form).length}`);
  check('the certificates are attributed to the My Progress upload channel',
    archive.find((d) => d.id === String(certA._id))?.source === 'PROGRESS',
    `source=${archive.find((d) => d.id === String(certA._id))?.source}`);
  check("student B's certificate is NOT in student A's archive",
    !archive.some((d) => String(d.file_url).includes('prog-cert-other')),
    `urls=${archive.map((d) => d.file_url).join(',')}`);

  const fullTexts = await pdfPageTexts(full);
  const fullText = fullTexts.join('\n');
  const fullNorm = norm(fullText);

  check('the documents section lists the alpha certificate',
    fullNorm.includes('Alpha Hackathon Certificate'),
    'title not found in PDF text');
  check('the documents section lists the beta certificate',
    fullNorm.includes('Beta Image Certificate'),
    'title not found in PDF text');
  check('the archive reports two student-uploaded documents',
    fullNorm.includes('2 student-uploaded document(s) on record'),
    'uploaded-count line not found');

  // B. The uploaded PDF appears as its own page with its exact original text.
  const verbatimPages = fullTexts.filter((t) => norm(t) === textA);
  check('the uploaded certificate text is reproduced VERBATIM on its own page',
    verbatimPages.length === 1,
    `pages with exact cert text = ${verbatimPages.length}`);
  check('the annexure cover sheet names the real upload channel',
    fullNorm.includes('through My Progress & Achievements'),
    'provenance wording not found');

  // B. The uploaded image is inlined at its real pixel dimensions.
  const fullImages = await pdfPageImages(full);
  check('the uploaded image is embedded at its original dimensions',
    fullImages.some((i) => i.width === 240 && i.height === 160),
    `images=${fullImages.map((i) => `${i.width}x${i.height}`).join(',')}`);
  check('the image annexure is labelled with the certificate title',
    fullNorm.includes('ANNEXURE IMAGE – Beta Image Certificate'),
    'image annexure heading not found');

  // C. The system form must never be reproduced, even though its file exists.
  check('the Student Details Form is never embedded into itself',
    !fullNorm.includes(formText),
    'the system form text appeared in the PDF');
  // D. Cross-student isolation, on the bytes.
  check("student B's certificate text never appears in student A's PDF",
    !fullNorm.includes(textOther),
    'another student certificate text appeared in the PDF');

  // ------------------------------------------------------- E/F: edge records
  console.log('\nE/F. De-duplication, missing / unsupported / no-file records');
  // Same physical file referenced by BOTH stores: must list and reproduce once.
  const textD = 'CERT-DEDUP-555';
  const fileD = await storeFile('prog-cert-dedup.pdf', certPdf(textD), 'application/pdf');
  await StudentDocument.create({
    studentId: studentA._id,
    title: 'Dedup Document Row',
    fileName: fileD.fileName,
    fileUrl: fileD.fileUrl,
    fileType: fileD.fileType,
    fileSize: fileD.fileSize,
    documentType: 'other',
    category: 'Other',
    isPrimary: false,
    verificationStatus: 'Verified',
    uploadedAt: new Date('2026-10-09'),
  });
  await StudentProgress.create({
    studentId: studentA._id,
    registerNumber: studentA.registerNumber,
    studentName: studentA.fullName,
    category: 'Event Certificate',
    activityName: 'Dedup Progress Row',
    status: 'Pending',
    certificateUrl: fileD.fileUrl,
    fileName: fileD.fileName,
    fileSize: fileD.fileSize,
    fileType: fileD.fileType,
  });

  // A file that is registered but whose bytes are gone (in-tree path).
  await StudentProgress.create({
    studentId: studentA._id,
    registerNumber: studentA.registerNumber,
    studentName: studentA.fullName,
    category: 'Event Certificate',
    activityName: 'Missing File Certificate',
    status: 'Verified',
    certificateUrl: '/uploads/progress/prog-cert-gone-forever.pdf',
    fileName: 'gone-forever.pdf',
    fileSize: 123456,
    fileType: 'application/pdf',
  });
  // A registered file of a type the renderer cannot reproduce.
  const fileU = await storeFile('prog-cert-unsupported.docx', Buffer.from('plain text, not a document'), 'application/msword');
  await StudentProgress.create({
    studentId: studentA._id,
    registerNumber: studentA.registerNumber,
    studentName: studentA.fullName,
    category: 'Event Certificate',
    activityName: 'Unsupported File Certificate',
    status: 'Verified',
    certificateUrl: fileU.fileUrl,
    fileName: fileU.fileName,
    fileSize: fileU.fileSize,
    fileType: fileU.fileType,
  });
  // A real record with no file attached at all.
  await StudentProgress.create({
    studentId: studentA._id,
    registerNumber: studentA.registerNumber,
    studentName: studentA.fullName,
    category: 'Extra Curricular',
    activityName: 'No File Certificate',
    status: 'Approved',
    certificateUrl: '',
    fileName: '',
    fileSize: 0,
    fileType: '',
  });

  const { buf: edge } = await render('full');
  const edgeTexts = await pdfPageTexts(edge);
  const edgeText = edgeTexts.join('\n');
  const edgeNorm = norm(edgeText);

  check('the record with no file is still listed in the documents table',
    edgeNorm.includes('No File Certificate'),
    'no-file record title not listed');
  check('the embedding notice explains a record with no file attached',
    edgeNorm.includes('has no certificate file attached'),
    'no-file reason not found');
  check('a truly missing file is reported as lost with the searched roots',
    edgeNorm.includes('No file with these exact bytes was found') && edgeNorm.includes('the file itself was lost'),
    'missing-file reason not found');
  check('an unsupported file type is reported clearly',
    edgeNorm.includes('Unsupported file type "application/msword"'),
    'unsupported-type reason not found');
  check('a lost file is NOT mislabelled as needing administrator repair',
    !edgeNorm.includes('needs administrator repair'),
    '"administrator repair" appeared for an in-tree missing file');

  const dedupPages = edgeTexts.filter((t) => norm(t).includes(textD));
  check('a certificate referenced by both stores is reproduced exactly once',
    dedupPages.length === 1,
    `pages carrying the dedup certificate = ${dedupPages.length}`);
  const dedupListed = (await collectRecordBookData(String(studentA._id), 'full')).studentDocuments.filter(
    (d: any) => String(d.file_url).includes('prog-cert-dedup')
  );
  check('a certificate referenced by both stores is listed exactly once',
    dedupListed.length === 1,
    `archive rows for the shared file = ${dedupListed.length}`);

  const edgeCovers = (edgeText.match(/ANNEXURE \d+ OF \d+/g) || []);
  check('each distinct uploaded PDF is reproduced exactly once',
    edgeCovers.length === 2 && edgeCovers[0] === 'ANNEXURE 1 OF 2' && edgeCovers[1] === 'ANNEXURE 2 OF 2',
    `annexure covers = ${edgeCovers.join(', ')}`);

  // -------------------------------------------------------------- G: modes
  console.log('\nG. Other download modes');
  const { buf: mentorBuf } = await render('mentor-documents');
  const mentorNorm = norm((await pdfPageTexts(mentorBuf)).join('\n'));
  check('mentor-documents mode also lists and reproduces the certificate',
    mentorNorm.includes('Alpha Hackathon Certificate') && mentorNorm.includes(textA),
    'certificate missing from mentor-documents mode');

  const { buf: internalBuf } = await render('internal');
  const internalNorm = norm((await pdfPageTexts(internalBuf)).join('\n'));
  check('internal mode remains a marks-only report (no documents section or annexures)',
    !internalNorm.includes('STUDENT DOCUMENTS') && !internalNorm.includes(textA),
    `has documents section=${internalNorm.includes('STUDENT DOCUMENTS')} has cert page=${internalNorm.includes(textA)}`);

  // ------------------------------------------------- H: nothing was mutated
  console.log('\nH. Generation is read-only');
  const hashesAfter = {
    alpha: sha256(fs.readFileSync(fileA.abs)),
    beta: sha256(fs.readFileSync(fileB.abs)),
    form: sha256(fs.readFileSync(fileForm.abs)),
    other: sha256(fs.readFileSync(fileOther.abs)),
  };
  check('the original uploaded certificate files are byte-for-byte unchanged',
    JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter),
    `before=${JSON.stringify(hashesBefore)} after=${JSON.stringify(hashesAfter)}`);
  check('generating the PDF creates no achievement / point rows',
    (await Achievement.countDocuments({})) === achievementsBefore,
    `achievements before=${achievementsBefore} after=${await Achievement.countDocuments({})}`);

  let altered = 0;
  let deleted = 0;
  for (const [id, fingerprint] of progressSnapshot) {
    const row: any = await StudentProgress.findById(id);
    if (!row) {
      deleted++;
    } else if (`${row.status}|${row.certificateUrl}|${row.fileSize}` !== fingerprint) {
      altered++;
    }
  }
  check('generating the PDF neither alters nor deletes any certificate record',
    altered === 0 && deleted === 0,
    `altered=${altered} deleted=${deleted} of ${progressSnapshot.size}`);
  check('the full record book is a real multi-page PDF', (await pdfPageCount(full)) >= 3,
    `${await pdfPageCount(full)} pages`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  await store.teardown();
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('record-book certificates test crashed:', err);
  try {
    await store.teardown();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
