/**
 * BULK SELECT / BULK DELETE / BULK DOCUMENT DOWNLOAD — END-TO-END VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against a temporary local
 * file store and drives the bulk endpoints over HTTP exactly as the Admin
 * Portal does. Covers authorisation, department scoping, partial failures, the
 * cascade delete, the ZIP structure/manifest, the "no documents" path, and the
 * preservation of the existing single-record operations.
 *
 * Run: npx tsx src/tests/bulk-actions.test.ts
 */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

const store = useTemporaryLocalStore('bulk-actions');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5099;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bulk-actions-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';

const BASE = `http://127.0.0.1:${PORT}`;

type Status = 'PASS' | 'FAIL';
interface Row {
  n: number;
  requirement: string;
  status: Status;
  evidence: string;
}
const rows: Row[] = [];

function record(requirement: string, status: Status, evidence: string) {
  const n = rows.length + 1;
  rows.push({ n, requirement, status, evidence });
  console.log(`  [${status === 'PASS' ? 'PASS' : 'FAIL'}] ${requirement}\n         evidence: ${evidence}`);
}

async function check(requirement: string, fn: () => Promise<string>) {
  try {
    record(requirement, 'PASS', await fn());
  } catch (err: any) {
    record(requirement, 'FAIL', err?.message || String(err));
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function http(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: any } = {}
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as any };
}

/** Fetch that keeps the raw bytes + headers (for the ZIP download). */
async function httpRaw(method: string, urlPath: string, opts: { token?: string; body?: any } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    disposition: res.headers.get('content-disposition') || '',
    buffer,
  };
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server never became healthy');
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);
  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Student, Faculty, Department, Batch, MentorAssignment, StudentDocument } =
    await import('../models/index.js');

  // ── SEED ───────────────────────────────────────────────────────────────────
  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  const b1: any = await Batch.findOne({ name: '2023-2027' });
  assert(cse && ece && b1, 'bootstrap did not create the expected reference data');
  const admin: any = await User.findOne({ role: 'ADMIN' });
  const hash = bcrypt.hashSync('Mentor@123', 10);

  // HOD for CSE (used to prove department scoping).
  const hodUser: any = await User.create({
    username: 'hod.bulk', passwordHash: hash, role: 'HOD',
    email: 'hod.bulk@ksrce.test', fullName: 'Dr Bulk HOD', department: cse._id, isActive: true,
  });

  // A faculty/mentor in each department.
  const mentorUser: any = await User.create({
    username: 'mentor.bulk', passwordHash: hash, role: 'FACULTY',
    email: 'mentor.bulk@ksrce.test', fullName: 'Dr Bulk Mentor', department: cse._id, isActive: true,
  });
  const mentor: any = await Faculty.create({
    user: mentorUser._id, employeeId: 'FAC700', designation: 'Associate Professor',
    department: cse._id, isActive: true,
  } as any);
  const facEceUser: any = await User.create({
    username: 'mentor.ece', passwordHash: hash, role: 'FACULTY',
    email: 'mentor.ece@ksrce.test', fullName: 'Dr Ece Mentor', department: ece._id, isActive: true,
  });
  const facEce: any = await Faculty.create({
    user: facEceUser._id, employeeId: 'FAC701', designation: 'Assistant Professor',
    department: ece._id, isActive: true,
  } as any);

  async function seedStudent(regNo: string, name: string, dept: any) {
    const user: any = await User.create({
      username: regNo, passwordHash: bcrypt.hashSync('Student@123', 4), role: 'STUDENT',
      email: `${regNo}@ksrce.test`, fullName: name, department: dept._id, isActive: true,
    });
    const student: any = await Student.create({
      user: user._id, fullName: name, registerNumber: regNo, email: `${regNo}@ksrce.test`,
      mobileNumber: '9000000000', department: dept._id, batch: b1._id, section: 'A', year: 2,
      residentialType: 'DAY_SCHOLAR', profileCompleted: true, isActive: true,
    } as any);
    return { user, student };
  }

  const s1 = await seedStudent('73152430001', 'Cse Student One', cse);
  const s2 = await seedStudent('73152430002', 'Cse Student Two', cse);
  const s3 = await seedStudent('73152430003', 'Cse Student Three', cse); // no documents
  const s4 = await seedStudent('73152430004', 'Ece Student Four', ece);
  for (const s of [s1, s2, s3]) {
    await MentorAssignment.create({
      mentor: mentor._id, student: s.student._id, department: cse._id,
      assignedBy: admin._id, status: 'ACTIVE',
    });
  }

  // Physical files + document records. Two documents deliberately share a file
  // name so the archive's collision handling is exercised.
  const docsDir = path.join(store.uploadsDir, 'documents');
  fs.mkdirSync(docsDir, { recursive: true });
  async function seedDocument(student: any, storedName: string, title: string) {
    const abs = path.join(docsDir, storedName);
    fs.writeFileSync(abs, Buffer.from(title));
    return StudentDocument.create({
      studentId: student.student._id, documentType: 'certificate', isPrimary: false,
      fileName: 'certificate.txt', fileUrl: `/uploads/documents/${storedName}`,
      title, category: 'Other', fileType: 'text/plain', fileSize: 10,
      uploadedBy: mentorUser._id, verificationStatus: 'Pending',
    } as any);
  }
  await seedDocument(s1, 's1-a.txt', 'Certificate A');
  await seedDocument(s1, 's1-b.txt', 'Certificate B');
  await seedDocument(s2, 's2-a.txt', 'Certificate C');

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  async function login(username: string, password: string) {
    const r = await http('POST', '/api/auth/login', { body: { username, password } });
    assert(r.status === 200, `login ${username} failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return (r.body?.data?.token || r.body?.token) as string;
  }
  const adminToken = await login('admin', process.env.ADMIN_PASSWORD as string);
  const hodToken = await login('hod.bulk', 'Mentor@123');
  const studentToken = await login('73152430001', 'Student@123');

  console.log('--- verification -------------------------------------------------');

  // 1. Select All ids (Admin) returns the whole roster.
  await check('GET /api/students/selection/ids (Admin) returns every student id', async () => {
    const r = await http('GET', '/api/students/selection/ids', { token: adminToken });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    const ids: string[] = r.body.data.ids;
    const dbCount = await Student.countDocuments({});
    assert(ids.length === dbCount, `returned ${ids.length} ids, expected ${dbCount}`);
    assert(new Set(ids).size === ids.length, 'ids contain duplicates');
    return `${ids.length} unique ids == db count ${dbCount}`;
  });

  // 2. HOD scope: only own department.
  await check('GET /api/students/selection/ids (HOD) is scoped to its own department', async () => {
    const r = await http('GET', '/api/students/selection/ids', { token: hodToken });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    const ids: string[] = r.body.data.ids;
    const cseCount = await Student.countDocuments({ department: cse._id });
    const eceCount = await Student.countDocuments({ department: ece._id });
    assert(ids.length === cseCount, `HOD saw ${ids.length} ids, expected ${cseCount}`);
    const eceIds = new Set(
      (await Student.find({ department: ece._id })).map((s: any) => s._id.toString())
    );
    assert(!ids.some((id) => eceIds.has(id)), 'HOD selection leaked an ECE student');
    assert(eceCount > 0, 'seed produced no ECE students to prove the exclusion');
    return `HOD returned ${ids.length} (CSE) ids; ${eceCount} ECE ids excluded`;
  });

  // 3. Filters compose on the selection endpoint.
  await check('Selection ids honour the search filter (server-side)', async () => {
    const r = await http('GET', '/api/students/selection/ids?search=Cse%20Student%20Two', { token: adminToken });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    const ids: string[] = r.body.data.ids;
    assert(ids.length === 1, `expected 1 id, got ${ids.length}`);
    assert(ids[0] === s2.student._id.toString(), 'wrong student matched the search');
    return `search matched exactly ${s2.student.registerNumber}`;
  });

  // 4. RBAC: a STUDENT token is refused.
  await check('Selection ids reject a STUDENT token with 403', async () => {
    const r = await http('GET', '/api/students/selection/ids', { token: studentToken });
    assert(r.status === 403, `expected 403, got ${r.status}`);
    return `STUDENT -> ${r.status}`;
  });

  // 5. Bulk delete: partial failure reporting (invalid id + valid id).
  await check('POST /api/students/bulk-delete reports per-record success AND failure', async () => {
    const invalidId = 'not-a-real-id';
    const r = await http('POST', '/api/students/bulk-delete', {
      token: adminToken,
      body: { ids: [invalidId, s3.student._id.toString(), s3.student._id.toString()] },
    });
    assert(r.status === 200, `expected 200, got ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const { deleted, failed, summary } = r.body.data;
    assert(summary.requested === 2, `dedupe failed: requested ${summary.requested}`);
    assert(deleted.length === 1, `expected 1 deleted, got ${deleted.length}`);
    assert(failed.length === 1 && failed[0].id === invalidId, 'invalid id was not reported as failed');
    // The cascade actually removed the rows.
    assert((await Student.findById(s3.student._id)) === null, 'student row survived the delete');
    assert((await User.findById(s3.user._id)) === null, 'login account survived the delete');
    assert((await MentorAssignment.countDocuments({ student: s3.student._id })) === 0, 'assignment survived');
    return `requested=${summary.requested} deleted=${deleted.length} failed=${failed.length}; student+user+assignment removed`;
  });

  // 6. HOD cannot delete outside its department, but can inside it.
  await check('Bulk delete enforces HOD department scope per record', async () => {
    const outside = await http('POST', '/api/students/bulk-delete', {
      token: hodToken,
      body: { ids: [s4.student._id.toString()] },
    });
    assert(outside.status === 200, `expected 200, got ${outside.status}`);
    assert(outside.body.data.failed.length === 1, 'out-of-department delete was not refused');
    assert(/department/i.test(outside.body.data.failed[0].reason), `reason: ${outside.body.data.failed[0].reason}`);
    assert((await Student.findById(s4.student._id)) !== null, 'ECE student was deleted by an HOD!');

    const inside = await http('POST', '/api/students/bulk-delete', {
      token: hodToken,
      body: { ids: [s2.student._id.toString()] },
    });
    assert(inside.status === 200, `expected 200, got ${inside.status}`);
    assert(inside.body.data.deleted.length === 1, 'HOD could not delete its own department student');
    return `HOD: outside-dept refused (${outside.body.data.failed[0].reason}); own-dept deleted`;
  });

  // 7. RBAC: STUDENT cannot bulk delete.
  await check('Bulk delete rejects a STUDENT token with 403', async () => {
    const r = await http('POST', '/api/students/bulk-delete', {
      token: studentToken,
      body: { ids: [s1.student._id.toString()] },
    });
    assert(r.status === 403, `expected 403, got ${r.status}`);
    assert((await Student.findById(s1.student._id)) !== null, 'STUDENT deleted a record!');
    return `STUDENT -> ${r.status}; target intact`;
  });

  // 8. Bulk documents -> ZIP with the documented folder structure + manifest.
  await check('POST /api/students/bulk-documents returns a ZIP with folders + manifest', async () => {
    const r = await httpRaw('POST', '/api/students/bulk-documents', {
      token: adminToken,
      body: { ids: [s1.student._id.toString()] },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(/application\/zip/.test(r.contentType), `content-type was ${r.contentType}`);
    assert(/attachment; filename="Bulk_Documents_\d{4}-\d{2}-\d{2}\.zip"/.test(r.disposition), `disposition: ${r.disposition}`);
    assert(r.buffer.subarray(0, 2).toString() === 'PK', 'response is not a ZIP (missing PK signature)');

    const zip = await JSZip.loadAsync(r.buffer);
    const names = Object.keys(zip.files);
    const folder = `Students/Cse Student One_${s1.student.registerNumber}`;
    assert(names.includes(`${folder}/certificate.txt`), `missing first document; entries: ${names.join(', ')}`);
    // Two same-named source files must not collide.
    const certFiles = names.filter((n) => n.startsWith(`${folder}/certificate`));
    assert(certFiles.length === 2, `expected 2 unique certificate files, got ${certFiles.length}`);
    assert(names.includes('manifest.csv'), 'manifest.csv missing from the archive');
    const manifest = await zip.file('manifest.csv')!.async('string');
    assert(manifest.includes('INCLUDED'), 'manifest has no INCLUDED rows');
    assert(manifest.includes('Certificate A') && manifest.includes('Certificate B'), 'manifest missing document titles');
    return `${names.length} entries; folder "${folder}" with 2 collision-safe files + manifest.csv`;
  });

  // 9. Bulk documents: no eligible documents -> explicit JSON, not an empty ZIP.
  await check('Bulk documents with no documents returns a clear JSON result (no empty ZIP)', async () => {
    const r = await http('POST', '/api/students/bulk-documents', {
      token: adminToken,
      body: { ids: [s4.student._id.toString()] },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.data.hasDocuments === false, 'hasDocuments should be false');
    assert(r.body.data.downloaded === 0, 'downloaded should be 0');
    assert(r.body.data.missing.some((m: any) => m.status === 'NO_DOCUMENTS'), 'missing NO_DOCUMENTS row');
    assert(typeof r.body.message === 'string' && r.body.message.length > 0, 'no explanatory message');
    return `JSON result: hasDocuments=false, message="${r.body.message}"`;
  });

  // 10. Bulk documents respects HOD scope.
  await check('Bulk documents enforces HOD department scope per record', async () => {
    const r = await http('POST', '/api/students/bulk-documents', {
      token: hodToken,
      body: { ids: [s4.student._id.toString()] },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    const rowsOut = r.body.data.missing || [];
    assert(rowsOut.some((m: any) => m.status === 'NOT_AUTHORIZED'), 'out-of-department record was not refused');
    assert(r.body.data.hasDocuments === false, 'HOD received documents for an out-of-scope student');
    return `HOD refused the ECE record: ${rowsOut.find((m: any) => m.status === 'NOT_AUTHORIZED').note}`;
  });

  // 11. Bulk delete bounds: oversized payloads are refused.
  await check('Bulk delete refuses an oversized payload (413-class guard)', async () => {
    const many = Array.from({ length: 201 }, (_, i) => `id-${i}`);
    const r = await http('POST', '/api/students/bulk-delete', { token: adminToken, body: { ids: many } });
    assert(r.status === 400, `expected 400, got ${r.status}`);
    assert(/maximum/i.test(r.body.message), `message: ${r.body.message}`);
    return `201 ids -> ${r.status} ("${r.body.message}")`;
  });

  // 12. Faculty bulk delete: HOD scope.
  await check('Faculty bulk delete enforces HOD department scope', async () => {
    const outside = await http('POST', '/api/admin/faculty/bulk-delete', {
      token: hodToken,
      body: { ids: [facEce._id.toString()] },
    });
    assert(outside.status === 200, `expected 200, got ${outside.status}`);
    assert(outside.body.data.failed.length === 1, 'out-of-department faculty delete was not refused');
    assert((await Faculty.findById(facEce._id)) !== null, 'HOD deleted an out-of-department faculty member!');

    const inside = await http('POST', '/api/admin/faculty/bulk-delete', {
      token: hodToken,
      body: { ids: [mentor._id.toString()] },
    });
    assert(inside.status === 200, `expected 200, got ${inside.status}`);
    assert(inside.body.data.deleted.length === 1, 'HOD could not delete its own department faculty');
    assert((await Faculty.findById(mentor._id)) === null, 'faculty row survived');
    assert((await User.findById(mentorUser._id)) === null, 'faculty login account survived');
    return `outside-dept refused; own-dept faculty + login account deleted`;
  });

  // 13. Faculty bulk documents: honest "nothing to download".
  await check('Faculty bulk documents reports "no documents available" (no empty ZIP)', async () => {
    const r = await http('POST', '/api/admin/faculty/bulk-documents', {
      token: adminToken,
      body: { ids: [facEce._id.toString()] },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.data.hasDocuments === false, 'hasDocuments should be false');
    assert(r.body.data.missing.some((m: any) => m.status === 'NO_DOCUMENTS'), 'missing NO_DOCUMENTS row');
    return `JSON result: "${r.body.message}"`;
  });

  // 14. Existing single-record delete still works after the shared refactor.
  await check('Existing single-record delete still works end to end', async () => {
    const r = await http('DELETE', `/api/students/${s1.student._id.toString()}`, { token: adminToken });
    assert(r.status === 200, `expected 200, got ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    assert((await Student.findById(s1.student._id)) === null, 'single delete left the student row');
    assert((await StudentDocument.countDocuments({ studentId: s1.student._id })) === 0, 'single delete left documents');
    return `DELETE /api/students/:id -> 200; student + documents removed`;
  });

  // 15. No secrets leaked by the new endpoints.
  await check('Bulk payloads leak no secrets', async () => {
    const r = await http('GET', '/api/students/selection/ids', { token: adminToken });
    const text = JSON.stringify(r.body);
    for (const needle of ['passwordHash', 'JWT_SECRET', 'DATA_DIR', 'temporaryPassword']) {
      assert(!text.includes(needle), `selection payload leaked "${needle}"`);
    }
    return 'no passwordHash / JWT_SECRET / DATA_DIR / temporaryPassword in the selection payload';
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== BULK ACTIONS VERIFICATION ==========\n');
  console.log('| # | Requirement | Status | Evidence |');
  console.log('|---|-------------|--------|----------|');
  for (const r of rows) {
    console.log(`| ${r.n} | ${r.requirement} | ${r.status} | ${r.evidence.replace(/\|/g, '/')} |`);
  }
  console.log(`\nTOTAL ${rows.length}  PASS ${pass}  FAIL ${fail}`);
  if (fail > 0) {
    console.log('FAILURES:');
    for (const r of rows.filter((x) => x.status !== 'PASS')) console.log(`  - ${r.requirement}: ${r.evidence}`);
  }

  await store.teardown();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exit(1);
});
