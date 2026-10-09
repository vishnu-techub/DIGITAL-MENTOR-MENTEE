/**
 * DOCUMENT WATERMARK — full-stack runtime verification.
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint against a real local file store and
 * drives the document API over HTTP as a real mentor and student, then inspects
 * the ACTUAL bytes on disk.
 *
 * Covers:
 *   A. An uploaded single-page PDF gets a SEPARATE watermarked copy; the
 *      original file is byte-for-byte unchanged.
 *   B. An uploaded multi-page PDF is watermarked on every page.
 *   C. Preview (`/file`) and download (`/download`) serve the WATERMARKED copy.
 *   D. The watermarked copy opens as a valid PDF with the watermark text.
 *   E. An uploaded PNG is watermarked without changing its dimensions.
 *   F. Authentication is still enforced: an unrelated mentor is refused.
 *   G. Deleting the document removes BOTH the original and the watermarked copy.
 *   H. A record that predates the watermark (no watermarked copy) is regenerated
 *      on access, from the untouched original, and then served watermarked.
 *
 * Run: npx tsx src/tests/document-watermark-runtime.test.ts
 */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFArray, PDFStream, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('document-watermark');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5097;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'document-watermark-secret-do-not-use-in-prod';
// Keep the reverse-geocoding boundary out of this document test entirely.
process.env.GEOCODING_DISABLED = 'true';

const BASE = `http://127.0.0.1:${PORT}`;
const WATERMARK_HEX = Buffer.from('K S R C E', 'latin1').toString('hex').toUpperCase();

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function http(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: any } = {}
): Promise<{ status: number; body: any; bytes: number; contentType: string; cacheControl: string }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const contentType = res.headers.get('content-type') || '';
  const cacheControl = res.headers.get('cache-control') || '';
  let parsed: any = null;
  let bytes = 0;
  if (contentType.includes('application/json')) {
    const text = await res.text();
    bytes = Buffer.byteLength(text);
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    bytes = buf.length;
    parsed = buf;
  }
  return { status: res.status, body: parsed, bytes, contentType, cacheControl };
}

async function uploadDoc(
  token: string,
  studentId: string,
  file: { name: string; type: string; buffer: Buffer },
  fields: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append('studentId', studentId);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.type }), file.name);
  const res = await fetch(`${BASE}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, body: parsed };
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not become healthy in time');
}

async function loginAs(username: string, password: string): Promise<string> {
  const res = await http('POST', '/api/auth/login', { body: { username, password } });
  assert(res.status === 200, `login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body?.data?.token || res.body?.token;
  assert(token, `login ${username} returned no token`);
  return token;
}

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Original page ${i + 1}`, { x: 40, y: 800, size: 14 });
  }
  return Buffer.from(await doc.save());
}

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

/**
 * Index of the page's content stream that carries the watermark (0 = painted
 * first = behind all later streams). Returns -1 when the watermark is absent.
 * Used to prove the watermark is a real background layer, not a foreground
 * overlay, from the served bytes.
 */
function watermarkStreamIndex(doc: PDFDocument, page: any): number {
  const contents = page.node.Contents();
  const refs: any[] = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return refs.findIndex((ref) => {
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
    return !!bytes && Buffer.from(bytes).toString('latin1').includes(WATERMARK_HEX);
  });
}

function storedPathFor(fileUrl: string): string | null {
  return locateStoredUploadFn ? locateStoredUploadFn(fileUrl)?.path ?? null : null;
}

let locateStoredUploadFn: ((fileUrl: string) => any) | null = null;

async function main() {
  const { connectDB } = await import('../config/database.js');
  await connectDB();

  const { locateStoredUpload } = await import('../config/storage.js');
  locateStoredUploadFn = locateStoredUpload;

  const { Faculty, Department, Batch, Student, User, MentorAssignment, StudentDocument } = await import('../models/index.js');

  const hash = bcrypt.hashSync('Mentor@123', 10);
  const dept: any = await Department.create({ name: 'Computer Science', code: 'CSE' });
  const batch: any = await Batch.create({ name: '2022-2026', startYear: 2022, endYear: 2026 });

  const makeUser = (username: string, fullName: string, role: string, email: string) =>
    User.create({ username, passwordHash: hash, role, email, fullName, department: dept._id, isActive: true });

  const makeFaculty = async (username: string, fullName: string, employeeId: string, email: string) => {
    const user: any = await makeUser(username, fullName, 'FACULTY', email);
    return await Faculty.create({
      user: user._id,
      employeeId,
      designation: 'Assistant Professor',
      cabinLocation: 'FAC-101',
      department: dept._id,
      isActive: true,
    });
  };

  const makeStudent = async (reg: string, fullName: string) => {
    const first = fullName.split(' ')[0].toLowerCase();
    const user: any = await makeUser(reg, fullName, 'STUDENT', `${first}@ksrce.test`);
    return await Student.create({
      user: user._id,
      fullName,
      registerNumber: reg,
      email: `${first}@ksrce.test`,
      mobileNumber: '9876500001',
      department: dept._id,
      section: 'A',
      year: 3,
      batch: batch._id,
      profileCompleted: false,
      isActive: true,
    });
  };

  const mentorA: any = await makeFaculty('mentor.wm.a', 'Dr Watermark Alpha', 'FAC-WM1', 'wm.a@ksrce.test');
  const mentorB: any = await makeFaculty('mentor.wm.b', 'Dr Watermark Beta', 'FAC-WM2', 'wm.b@ksrce.test');
  const studentA: any = await makeStudent('731523209001', 'Arun Watermark');
  const adminUser: any = await User.findOne({ role: 'ADMIN' });

  await MentorAssignment.create({
    student: studentA._id,
    mentor: mentorA._id,
    department: dept._id,
    status: 'ACTIVE',
    assignedBy: adminUser?._id || mentorA.user,
  });

  console.log('\n=== Document watermark: full-stack runtime ===\n');
  console.log('  booting src/index.ts ...');
  await import('../index.js');
  await waitForHealth();

  const mentorToken = await loginAs('mentor.wm.a', 'Mentor@123');
  const otherMentorToken = await loginAs('mentor.wm.b', 'Mentor@123');

  const studentId = String(studentA._id);

  // ---------------------------------------------------------------------------
  console.log('A + C + D. Single-page PDF upload, original preserved, served watermarked');
  // ---------------------------------------------------------------------------
  let singleId = '';
  {
    const original = await makePdf(1);
    const snapshot = Buffer.from(original);

    const res = await uploadDoc(
      mentorToken,
      studentId,
      { name: 'single.pdf', type: 'application/pdf', buffer: original },
      { title: 'Single Page Certificate', category: 'Other' }
    );
    check('the PDF upload succeeds', res.status === 201, `status=${res.status} ${JSON.stringify(res.body)}`);
    check('the response reports the watermark was applied', res.body?.data?.watermarkStatus === 'applied', res.body?.data?.watermarkStatus);

    singleId = String(res.body?.data?._id || '');
    const doc: any = await StudentDocument.findById(singleId);
    check('the document record points at the ORIGINAL upload', !!doc?.fileUrl);
    check('a SEPARATE watermarked copy is recorded', !!doc?.watermarkedFileUrl, String(doc?.watermarkedFileUrl));
    check('the watermarked copy is a different file from the original', doc?.fileUrl !== doc?.watermarkedFileUrl);

    const originalPath = storedPathFor(doc.fileUrl);
    const watermarkedPath = storedPathFor(doc.watermarkedFileUrl);
    check('the original file exists on disk', !!originalPath && fs.existsSync(originalPath), String(originalPath));
    check('the watermarked file exists on disk', !!watermarkedPath && fs.existsSync(watermarkedPath), String(watermarkedPath));

    const originalOnDisk = fs.readFileSync(originalPath!);
    check('the ORIGINAL file on disk is byte-for-byte unchanged', Buffer.from(originalOnDisk).equals(snapshot));

    const wmBytes = fs.readFileSync(watermarkedPath!);
    const wmDoc = await PDFDocument.load(wmBytes);
    check('the watermarked copy opens as a valid PDF', wmDoc.getPages().length === 1);
    check(
      'the watermarked copy carries the KSRCE watermark',
      pageContentText(wmDoc, wmDoc.getPages()[0]).includes(WATERMARK_HEX)
    );
    check(
      'the watermark is a background layer (first content stream), never a foreground overlay',
      watermarkStreamIndex(wmDoc, wmDoc.getPages()[0]) === 0,
      `watermarkStreamIndex=${watermarkStreamIndex(wmDoc, wmDoc.getPages()[0])}`
    );

    // Preview must serve the watermarked copy.
    const preview = await http('GET', `/api/documents/${singleId}/file`, { token: mentorToken });
    check('preview succeeds', preview.status === 200, `status=${preview.status}`);
    check('preview is served as a PDF', preview.contentType.includes('application/pdf'), preview.contentType);
    check('preview serves the WATERMARKED bytes', Buffer.isBuffer(preview.body) && Buffer.from(preview.body).equals(wmBytes));
    check(
      'preview forbids caching, so a stale unwatermarked copy can never be reused',
      /no-store/.test(preview.cacheControl),
      preview.cacheControl
    );

    const download = await http('GET', `/api/documents/${singleId}/download`, { token: mentorToken });
    check('download succeeds', download.status === 200, `status=${download.status}`);
    check('download serves the WATERMARKED bytes', Buffer.isBuffer(download.body) && Buffer.from(download.body).equals(wmBytes));
    check(
      'download forbids caching, so a stale unwatermarked copy can never be reused',
      /no-store/.test(download.cacheControl),
      download.cacheControl
    );

    // Listing reports the watermark status without breaking older flows.
    const list = await http('GET', `/api/documents/student/${studentId}`, { token: mentorToken });
    const row = (list.body?.data || []).find((d: any) => String(d._id) === singleId);
    check('the document list exposes the watermark status', row?.watermarkStatus === 'applied', JSON.stringify(row?.watermarkStatus));
  }

  // ---------------------------------------------------------------------------
  console.log('\nB. Multi-page PDF: watermark on EVERY page');
  // ---------------------------------------------------------------------------
  {
    const original = await makePdf(3);
    const res = await uploadDoc(
      mentorToken,
      studentId,
      { name: 'multi.pdf', type: 'application/pdf', buffer: original },
      { title: 'Multi Page Certificate', category: 'Other' }
    );
    check('the multi-page upload succeeds', res.status === 201, `status=${res.status}`);
    const id = String(res.body?.data?._id || '');
    const doc: any = await StudentDocument.findById(id);
    const wmBytes = fs.readFileSync(storedPathFor(doc.watermarkedFileUrl)!);
    const wmDoc = await PDFDocument.load(wmBytes);
    check('page count is preserved', wmDoc.getPages().length === 3, String(wmDoc.getPages().length));
    check(
      'every page of the multi-page PDF is watermarked',
      wmDoc.getPages().every((p) => pageContentText(wmDoc, p).includes(WATERMARK_HEX))
    );
    check(
      'every page of the multi-page PDF gets the watermark BEHIND its content',
      wmDoc.getPages().every((p) => watermarkStreamIndex(wmDoc, p) === 0)
    );
  }

  // ---------------------------------------------------------------------------
  console.log('\nE. PNG certificate: watermarked, dimensions preserved, served watermarked');
  // ---------------------------------------------------------------------------
  {
    const png = await sharp({
      create: { width: 500, height: 350, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const res = await uploadDoc(
      mentorToken,
      studentId,
      { name: 'certificate.png', type: 'image/png', buffer: png },
      { title: 'PNG Certificate', category: 'Other' }
    );
    check('the PNG upload succeeds', res.status === 201, `status=${res.status} ${JSON.stringify(res.body)}`);
    check('the PNG watermark was applied', res.body?.data?.watermarkStatus === 'applied', res.body?.data?.watermarkStatus);

    const id = String(res.body?.data?._id || '');
    const doc: any = await StudentDocument.findById(id);
    const originalPath = storedPathFor(doc.fileUrl)!;
    const watermarkedPath = storedPathFor(doc.watermarkedFileUrl)!;
    check('the original PNG is unchanged on disk', Buffer.from(fs.readFileSync(originalPath)).equals(png));

    const wmMeta = await sharp(fs.readFileSync(watermarkedPath)).metadata();
    check('the watermarked PNG keeps its dimensions', wmMeta.width === 500 && wmMeta.height === 350);

    const preview = await http('GET', `/api/documents/${id}/file`, { token: mentorToken });
    check('the watermarked PNG is served', preview.contentType.includes('image/png') && Buffer.from(preview.body).equals(fs.readFileSync(watermarkedPath)));
  }

  // ---------------------------------------------------------------------------
  console.log('\nF. Authentication is still enforced on watermarked documents');
  // ---------------------------------------------------------------------------
  {
    const res = await http('GET', `/api/documents/${singleId}/file`, { token: otherMentorToken });
    check('an unrelated mentor is refused the document', res.status === 403 || res.status === 404, `status=${res.status}`);

    const anon = await http('GET', `/api/documents/${singleId}/file`);
    check('an unauthenticated request is refused', anon.status === 401, `status=${anon.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nG. Deleting a document removes BOTH copies');
  // ---------------------------------------------------------------------------
  {
    const doc: any = await StudentDocument.findById(singleId);
    const originalPath = storedPathFor(doc.fileUrl)!;
    const watermarkedPath = storedPathFor(doc.watermarkedFileUrl)!;

    // A mentor-confirmed record is locked; this one is PENDING so it can be removed.
    const del = await http('DELETE', `/api/documents/${singleId}`, { token: mentorToken });
    check('the delete succeeds', del.status === 200, `status=${del.status} ${JSON.stringify(del.body)}`);
    check('the original file is removed from disk', !fs.existsSync(originalPath));
    check('the watermarked copy is also removed from disk', !fs.existsSync(watermarkedPath));
  }

  // ---------------------------------------------------------------------------
  console.log('\nH. A document that predates the fix is regenerated on access');
  // ---------------------------------------------------------------------------
  {
    const original = await makePdf(2);
    const snapshot = Buffer.from(original);
    const res = await uploadDoc(
      mentorToken,
      studentId,
      { name: 'legacy.pdf', type: 'application/pdf', buffer: original },
      { title: 'Pre-fix Certificate', category: 'Other' }
    );
    check('the upload for the pre-fix simulation succeeds', res.status === 201, `status=${res.status}`);

    const id = String(res.body?.data?._id || '');
    const doc: any = await StudentDocument.findById(id);
    const originalPath = storedPathFor(doc.fileUrl)!;
    const wmPathBefore = storedPathFor(doc.watermarkedFileUrl)!;

    // Simulate a record created BEFORE watermarking existed: the original is on
    // disk but there is no watermarked companion and no watermark metadata.
    if (wmPathBefore && fs.existsSync(wmPathBefore)) fs.unlinkSync(wmPathBefore);
    doc.watermarkedFileUrl = '';
    doc.watermarkStatus = 'unsupported';
    doc.watermarkText = '';
    doc.watermarkAppliedAt = null;
    await doc.save();
    check('the simulated pre-fix record has no watermarked copy on disk', !fs.existsSync(wmPathBefore));
    check(
      'the original is still present and byte-for-byte unchanged',
      fs.existsSync(originalPath) && fs.readFileSync(originalPath).equals(snapshot)
    );

    // First access must derive the watermarked copy from the untouched original.
    const preview = await http('GET', `/api/documents/${id}/file`, { token: mentorToken });
    check('preview of a pre-fix record succeeds', preview.status === 200, `status=${preview.status}`);

    const refreshed: any = await StudentDocument.findById(id);
    check('the pre-fix record now records a watermarked copy', !!refreshed?.watermarkedFileUrl, String(refreshed?.watermarkedFileUrl));
    check('the record now reports the watermark as applied', refreshed?.watermarkStatus === 'applied', String(refreshed?.watermarkStatus));

    const regenPath = storedPathFor(refreshed.watermarkedFileUrl)!;
    check('the regenerated copy exists on disk', !!regenPath && fs.existsSync(regenPath), String(regenPath));

    const wmBytes = fs.readFileSync(regenPath);
    const wmDoc = await PDFDocument.load(wmBytes);
    check(
      'the regenerated copy carries the KSRCE watermark on EVERY page',
      wmDoc.getPages().every((p) => pageContentText(wmDoc, p).includes(WATERMARK_HEX))
    );
    check(
      'the regenerated copy layers the watermark BEHIND content on every page',
      wmDoc.getPages().every((p) => watermarkStreamIndex(wmDoc, p) === 0)
    );
    check('preview serves the regenerated watermarked bytes', Buffer.isBuffer(preview.body) && Buffer.from(preview.body).equals(wmBytes));
    check('the regenerated copy is a different file from the original', regenPath !== originalPath);

    const download = await http('GET', `/api/documents/${id}/download`, { token: mentorToken });
    check('download also serves the regenerated watermarked bytes', Buffer.isBuffer(download.body) && Buffer.from(download.body).equals(wmBytes));
    check(
      'the ORIGINAL is still byte-for-byte unchanged after regeneration',
      fs.readFileSync(originalPath).equals(snapshot)
    );
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  await store.teardown();
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  // The booted server keeps background timers alive, so exit explicitly once
  // the run is finished (matching the other full-stack suites).
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('document-watermark runtime test crashed:', err);
  process.exit(1);
});
