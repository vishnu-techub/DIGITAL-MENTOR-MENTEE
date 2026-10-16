/**
 * CERTIFICATE VISIBILITY IN "MY DOCUMENTS" — full-stack runtime verification.
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint against a real local file store and
 * drives the document + achievement-participation APIs over HTTP as real
 * students and a mentor, then inspects the actual response payloads.
 *
 * A certificate a student uploads through the achievement ("My Progress")
 * module is stored as a StudentProgress row, NOT a StudentDocument. Before this
 * fix such certificates were invisible in My Documents (which only read the
 * document store). This suite proves, against the running app:
 *
 *   A. GET /api/documents/student/:id returns the Student Details Form AND the
 *      achievement certificate, normalised onto the document shape.
 *   B. The certificate is owned by the authenticated student and is flagged
 *      with its real verification status.
 *   C. Its file previews and downloads for the owner (original bytes/filename),
 *      is refused anonymously, refused to another student, and allowed to the
 *      assigned mentor.
 *   D. A certificate whose stored file already has a StudentDocument row is not
 *      listed twice.
 *   E. The extra read-only capability set on these rows never grants a document
 *      action (so a mentor cannot act on them via the document endpoints).
 *   F. Uploading a certificate awards NO points: the achievement/leaderboard
 *      totals are identical before and after.
 *
 * Run: npx tsx src/tests/certificate-visibility-runtime.test.ts
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('certificate-visibility');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5099;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'certificate-visibility-secret-do-not-use-in-prod';
process.env.GEOCODING_DISABLED = 'true';

const BASE = `http://127.0.0.1:${PORT}`;

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
): Promise<{ status: number; body: any; bytes: number; contentType: string; disposition: string }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const contentType = res.headers.get('content-type') || '';
  const disposition = res.headers.get('content-disposition') || '';
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
  return { status: res.status, body: parsed, bytes, contentType, disposition };
}

async function uploadProgress(
  token: string,
  file: { name: string; type: string; buffer: Buffer },
  fields: Record<string, string>
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('certificate', new Blob([new Uint8Array(file.buffer)], { type: file.type }), file.name);
  const res = await fetch(`${BASE}/api/student/progress`, {
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

async function uploadDocument(
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

/** Logical file key, ignoring any base prefix (mirrors the server's de-dup). */
function fileKey(url: string | undefined | null): string | null {
  if (!url) return null;
  const i = url.indexOf('uploads/');
  return i >= 0 ? url.slice(i) : url;
}

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 600]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF\n'
);

async function main() {
  const { connectDB } = await import('../config/database.js');
  await connectDB();

  const { Faculty, Department, Batch, Student, User, MentorAssignment, StudentDocument, StudentProgress } =
    await import('../models/index.js');

  const hash = bcrypt.hashSync('Mentor@123', 10);
  const dept: any = await Department.create({ name: 'Information Technology', code: 'IT' });
  const batch: any = await Batch.create({ name: '2024-2028', startYear: 2024, endYear: 2028 });

  const makeUser = (username: string, fullName: string, role: string, email: string) =>
    User.create({ username, passwordHash: hash, role, email, fullName, department: dept._id, isActive: true });

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
      profileCompleted: true,
      isActive: true,
    });
  };

  const mentorUser: any = await makeUser('mentor.cert.a', 'Dr Cert Alpha', 'FACULTY', 'cert.a@ksrce.test');
  const mentor: any = await Faculty.create({
    user: mentorUser._id,
    employeeId: 'FAC-CERT1',
    designation: 'Assistant Professor',
    cabinLocation: 'FAC-201',
    department: dept._id,
    isActive: true,
  });
  const studentA: any = await makeStudent('731523209777', 'Cert Owner');
  const studentB: any = await makeStudent('731523209778', 'Other Student');
  const adminUser: any = await User.findOne({ role: 'ADMIN' });

  await MentorAssignment.create({
    student: studentA._id,
    mentor: mentor._id,
    department: dept._id,
    status: 'ACTIVE',
    assignedBy: adminUser?._id || mentorUser._id,
  });

  console.log('\n=== Certificate visibility in My Documents: full-stack runtime ===\n');
  console.log('  booting src/index.ts ...');
  await import('../index.js');
  await waitForHealth();

  const tokenA = await loginAs('731523209777', 'Mentor@123');
  const tokenB = await loginAs('731523209778', 'Mentor@123');
  const tokenMentor = await loginAs('mentor.cert.a', 'Mentor@123');

  const listDocs = async (token: string) => {
    const r = await http('GET', `/api/documents/student/${studentA._id}`, { token });
    assert(r.status === 200, `documents list -> ${r.status}`);
    return (r.body?.data || []) as any[];
  };

  // ---- Baseline: My Documents has only the auto-generated form ----
  const baseline = await listDocs(tokenA);
  const baselineNonForm = baseline.filter((d) => !d.isPrimary && d.documentType !== 'student_details_form');
  check('baseline My Documents shows only the Student Details Form', baselineNonForm.length === 0,
    `non-form entries = ${baselineNonForm.length}`);

  // Points are 0 before any certificate exists.
  const lbBefore = await http('GET', '/api/leaderboard', { token: tokenA });
  const meBefore = (lbBefore.body?.data?.me || (lbBefore.body?.data?.entries || []).find((e: any) => e.registerNumber === '731523209777')) || {};
  check('baseline achievement points are zero', meBefore.totalPoints === 0 && meBefore.achievementCount === 0,
    `me=${JSON.stringify(meBefore && { totalPoints: meBefore.totalPoints, achievementCount: meBefore.achievementCount })}`);

  // ---- A/B: upload an achievement certificate and confirm it appears ----
  console.log('\nA. Upload an achievement certificate via My Progress');
  const up = await uploadProgress(tokenA, { name: 'cert-visibility.pdf', type: 'application/pdf', buffer: PDF }, {
    category: 'Hackathon Certificate',
    activityName: 'Smart India Hackathon 2026',
    organization: 'Ministry of Education',
    eventName: 'SIH Grand Finale',
    date: '2026-03-15',
    level: 'National',
  });
  check('the certificate upload succeeds (201, Pending)', up.status === 201 && up.body?.data?.status === 'Pending',
    `status=${up.status} body=${JSON.stringify(up.body?.data?.status)}`);
  const certId = up.body?.data?._id;
  const certUrl = up.body?.data?.certificateUrl;
  assert(certId && certUrl, 'upload did not return an id/url');

  const afterUpload = await listDocs(tokenA);
  const certRow = afterUpload.find((d) => String(d._id) === String(certId));
  check('the certificate appears in My Documents', !!certRow,
    `ids=${afterUpload.map((d) => d._id).join(',')}`);
  check('the certificate is linked to the authenticated student', String(certRow?.studentId) === String(studentA._id),
    `row.studentId=${certRow?.studentId} expected=${studentA._id}`);
  check('the certificate is flagged with its real source and verification status',
    certRow?.source === 'progress' && certRow?.verificationStatus === 'Pending',
    `source=${certRow?.source} status=${certRow?.verificationStatus}`);
  check('the certificate carries a document type and a title', certRow?.documentType === 'certificate' && !!certRow?.title,
    `documentType=${certRow?.documentType} title=${certRow?.title}`);
  check('the certificate reports its file as available', certRow?.fileAvailable === true,
    `fileAvailable=${certRow?.fileAvailable}`);

  // ---- E: read-only capability set in this view ----
  const perms = certRow?.permissions || {};
  check('the achievement certificate is read-only in My Documents',
    !perms.canEdit && !perms.canSubmit && !perms.canReview && !perms.canConfirm && !perms.canReject && !perms.canDelete,
    `permissions=${JSON.stringify(perms)}`);

  // ---- C: ownership rules on preview / download ----
  console.log('\nC. Ownership on preview and download');
  const ownerView = await http('GET', `/api/documents/${certId}/file`, { token: tokenA });
  check('the owner can preview the certificate', ownerView.status === 200 && ownerView.contentType.includes('application/pdf'),
    `status=${ownerView.status} type=${ownerView.contentType}`);
  check('the preview serves the ORIGINAL stored bytes',
    Buffer.isBuffer(ownerView.body) && Buffer.from(ownerView.body).equals(PDF),
    `bytes=${ownerView.bytes} expected=${PDF.length}`);

  const ownerDl = await http('GET', `/api/documents/${certId}/download`, { token: tokenA });
  check('the owner can download the certificate', ownerDl.status === 200 && ownerDl.disposition.includes('attachment'),
    `status=${ownerDl.status} disposition=${ownerDl.disposition}`);
  check('the download preserves the original filename', ownerDl.disposition.includes('cert-visibility.pdf'),
    ownerDl.disposition);

  const anon = await http('GET', `/api/documents/${certId}/file`);
  check('anonymous access to the certificate is refused (401)', anon.status === 401, `status=${anon.status}`);

  const other = await http('GET', `/api/documents/${certId}/file`, { token: tokenB });
  check('another student cannot reach the certificate (403)', other.status === 403,
    `status=${other.status} body=${JSON.stringify(other.body?.message)}`);

  const mentorView = await http('GET', `/api/documents/${certId}/file`, { token: tokenMentor });
  check('the assigned mentor can view the certificate (200)', mentorView.status === 200, `status=${mentorView.status}`);

  // ---- D: no duplicate when the same file is also a StudentDocument ----
  console.log('\nD. No duplicate when a file exists in both stores');
  const docUp = await uploadDocument(tokenA, studentA._id, {
    name: 'both-stores.pdf', type: 'application/pdf', buffer: PDF,
  }, { documentType: 'Hackathon Certificate', category: 'Hackathon Certificate', title: 'Both Stores' });
  check('a document-store certificate uploads', docUp.status === 201 || docUp.status === 200,
    `status=${docUp.status} body=${JSON.stringify(docUp.body?.message || docUp.body?.data?.documentType)}`);
  const docRow: any = docUp.body?.data;
  assert(docRow?.fileUrl, 'document upload returned no fileUrl');

  // Create a StudentProgress row that references the SAME stored file. The
  // unification routine must fold it and list the file exactly once.
  await StudentProgress.create({
    studentId: studentA._id,
    registerNumber: studentA.registerNumber,
    studentName: studentA.fullName,
    category: 'Hackathon Certificate',
    activityName: 'Duplicate Should Collapse',
    certificateUrl: docRow.fileUrl,
    fileName: docRow.fileName,
    fileSize: docRow.fileSize,
    fileType: docRow.fileType,
    status: 'Pending',
  });

  const listAfter = await listDocs(tokenA);
  const sameKey = listAfter.filter((d) => fileKey(d.fileUrl) === fileKey(docRow.fileUrl));
  check('a file referenced by both stores is listed exactly once', sameKey.length === 1,
    `matches=${sameKey.length} (${sameKey.map((d) => d.source || 'document').join(',')})`);
  check('the surviving row is the document-store record', sameKey[0]?.source !== 'progress',
    `source=${sameKey[0]?.source}`);

  // The API returns document-store rows then achievement rows; the UI sorts the
  // Student Details Form first (isPrimary: true). Prove the form is present and
  // that the UI's own sort places it first.
  const uiSorted = [...listAfter].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });
  check('the Student Details Form is present and sorts first in the UI',
    listAfter.some((d) => d.isPrimary === true) && uiSorted[0]?.isPrimary === true,
    `present=${listAfter.some((d) => d.isPrimary === true)} first=${uiSorted[0]?.documentType}`);

  // ---- F: uploading a certificate must not award points ----
  console.log('\nF. Points stay unchanged');
  const lbAfter = await http('GET', '/api/leaderboard', { token: tokenA });
  const meAfter = (lbAfter.body?.data?.me || (lbAfter.body?.data?.entries || []).find((e: any) => e.registerNumber === '731523209777')) || {};
  check('uploading a certificate awards no achievement points',
    meAfter.totalPoints === meBefore.totalPoints && meAfter.achievementCount === meBefore.achievementCount,
    `before=${JSON.stringify(meBefore && { p: meBefore.totalPoints, c: meBefore.achievementCount })} after=${JSON.stringify(meAfter && { p: meAfter.totalPoints, c: meAfter.achievementCount })}`);
  check('no Achievement ledger row exists for the student',
    (await (await import('../models/index.js')).Achievement.countDocuments({ student: studentA._id })) === 0,
    'expected zero Achievement rows');

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  await store.teardown();
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('certificate visibility runtime test crashed:', err);
  process.exit(1);
});
