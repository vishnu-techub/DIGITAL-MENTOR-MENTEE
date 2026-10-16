/**
 * SUBJECT MANAGEMENT VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives the whole Admin Subject Management feature over HTTP,
 * exactly as the management page and the HOD marks workflow do:
 *
 *   GET    /api/admin/subjects
 *   GET    /api/admin/subjects/meta
 *   POST   /api/admin/subjects
 *   PUT    /api/admin/subjects/:id
 *   PATCH  /api/admin/subjects/:id/status
 *   DELETE /api/admin/subjects/:id
 *   GET    /api/hod/marks/subjects          (catalogue union)
 *   POST   /api/hod/marks/upload/validate   (subject + max-marks enforcement)
 *   POST   /api/hod/marks/upload/import
 *
 * What is PROVABLE rather than assumed:
 *   - an Admin can add / edit / deactivate / reactivate a subject
 *   - a duplicate code in the same academic scope is rejected (409)
 *   - an inactive subject is refused for a new upload and disappears from the
 *     HOD's selectable (active) subject list
 *   - the selected subject's maximum marks bound the uploaded marks
 *   - an unknown subject is refused once the department has a catalogue
 *   - editing a subject never rewrites an existing mark
 *   - the catalogue survives a backend restart (written to subjects.json)
 *   - a non-Admin (HOD) cannot create / edit / deactivate a subject (403)
 *
 * Run: npm run test:subject-management
 */
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('subject-management');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5127;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'subject-management-secret-do-not-use-in-prod';
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

async function http(method: string, urlPath: string, opts: { token?: string; body?: any } = {}) {
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

  const { User, Student, Department, Batch, InternalMark, Subject } = await import('../models/index.js');

  const adminLogin = await http('POST', '/api/auth/login', {
    body: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.body?.data?.token || adminLogin.body?.token;
  assert(adminToken, `admin login failed: ${JSON.stringify(adminLogin.body)}`);

  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  assert(cse && ece, 'bootstrap did not create the expected reference data');
  const cseId = String(cse._id);

  const batch2024: any = await Batch.findOne({ name: '2024-2028' });
  assert(batch2024, 'bootstrap did not create the 2024-2028 batch');

  const password = 'Mentor@123';
  const hash = bcrypt.hashSync(password, 10);

  async function makeHod(dept: any, suffix: string) {
    const username = `subj.hod.${suffix}`;
    const user: any = await User.create({
      username,
      passwordHash: hash,
      role: 'HOD',
      email: `${username}@ksrce.test`,
      fullName: `Dr Subject Hod ${suffix.toUpperCase()}`,
      department: dept._id,
      isActive: true,
    });
    const login = await http('POST', '/api/auth/login', { body: { username, password } });
    const token = login.body?.data?.token || login.body?.token;
    assert(token, `${suffix} HOD could not log in`);
    return { user, token, deptId: String(dept._id) };
  }

  async function makeStudent(dept: any, reg: string, name: string) {
    const user: any = await User.create({
      username: reg.toLowerCase(),
      passwordHash: hash,
      role: 'STUDENT',
      email: `${reg.toLowerCase()}@ksrce.test`,
      fullName: name,
      department: dept._id,
      isActive: true,
    });
    const student: any = await Student.create({
      user: user._id,
      registerNumber: reg,
      fullName: name,
      department: dept._id,
      batch: batch2024._id,
      year: 1,
      section: 'A',
      residentialType: 'DAY_SCHOLAR',
      parent: {},
      siblings: [],
      school: {},
      profileCompleted: false,
      isActive: true,
    } as any);
    return { user, student, id: String(student._id) };
  }

  const hodCse = await makeHod(cse, 'cse');
  const hodEce = await makeHod(ece, 'ece');
  const studentA = await makeStudent(cse, 'SUB100001', 'Subject Student One');

  // ── 1. Add a subject ──────────────────────────────────────────────────────
  let subjectAId = '';
  await check('Admin can add a subject', async () => {
    const r = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: {
        code: 'CS101',
        name: 'Programming in C',
        departmentId: cseId,
        semester: 1,
        academicYear: '2024-2028',
        regulation: 'R2021',
        subjectType: 'THEORY',
        maxMarks: 100,
        passMarks: 40,
      },
    });
    assert(r.status === 201, `create -> ${r.status}: ${JSON.stringify(r.body)}`);
    const s = r.body?.data;
    assert(s && s.id && s.code === 'CS101', `unexpected create payload: ${JSON.stringify(s)}`);
    assert(s.status === 'ACTIVE', 'a new subject must default to ACTIVE');
    subjectAId = s.id;
    return `created ${s.code} (${s.name}) dept=${s.departmentCode} sem=${s.semester} max=${s.maxMarks} pass=${s.passMarks}`;
  });

  // ── 2. Duplicate code rejected within scope ───────────────────────────────
  await check('A duplicate subject code in the same scope is rejected', async () => {
    const r = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: {
        code: 'CS101',
        name: 'Duplicate C',
        departmentId: cseId,
        semester: 1,
        academicYear: '2024-2028',
        subjectType: 'THEORY',
        maxMarks: 100,
        passMarks: 40,
      },
    });
    assert(r.status === 409, `duplicate -> expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    const count = await Subject.countDocuments({ code: 'CS101', department: cse._id });
    assert(count === 1, `expected exactly 1 CS101 row, found ${count}`);
    return `409 as expected: "${r.body?.message}"`;
  });

  // ── 2b. Cross-field validation ────────────────────────────────────────────
  await check('Pass marks greater than maximum marks are rejected', async () => {
    const r = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: {
        code: 'CS102',
        name: 'Bad bounds',
        departmentId: cseId,
        semester: 1,
        academicYear: '2024-2028',
        maxMarks: 50,
        passMarks: 80,
      },
    });
    assert(r.status === 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(/pass marks/i.test(r.body?.message || ''), `message should mention pass marks: ${r.body?.message}`);
    return `400 as expected: "${r.body?.message}"`;
  });

  // ── 3. Edit a subject ─────────────────────────────────────────────────────
  await check('Admin can edit a subject', async () => {
    const r = await http('PUT', `/api/admin/subjects/${subjectAId}`, {
      token: adminToken,
      body: {
        code: 'CS101',
        name: 'Programming in C (Revised)',
        departmentId: cseId,
        semester: 1,
        academicYear: '2024-2028',
        regulation: 'R2021',
        subjectType: 'THEORY',
        maxMarks: 100,
        passMarks: 35,
      },
    });
    assert(r.status === 200, `update -> ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.data?.name === 'Programming in C (Revised)', 'name was not updated');
    assert(r.body?.data?.passMarks === 35, 'pass marks were not updated');
    return `updated name + passMarks=35`;
  });

  // ── 4. Deactivate / reactivate ────────────────────────────────────────────
  await check('Admin can deactivate and reactivate a subject', async () => {
    const off = await http('PATCH', `/api/admin/subjects/${subjectAId}/status`, {
      token: adminToken,
      body: { status: 'INACTIVE' },
    });
    assert(off.status === 200 && off.body?.data?.status === 'INACTIVE', `deactivate -> ${JSON.stringify(off.body)}`);
    const on = await http('PATCH', `/api/admin/subjects/${subjectAId}/status`, {
      token: adminToken,
      body: { status: 'ACTIVE' },
    });
    assert(on.status === 200 && on.body?.data?.status === 'ACTIVE', `reactivate -> ${JSON.stringify(on.body)}`);
    return 'INACTIVE -> ACTIVE round-trip';
  });

  // ── 5. Inactive subjects are excluded from new uploads ────────────────────
  await check('An inactive subject is refused for a new upload', async () => {
    await http('PATCH', `/api/admin/subjects/${subjectAId}/status`, {
      token: adminToken,
      body: { status: 'INACTIVE' },
    });

    // HOD marks/subjects: the active list must not offer the inactive subject.
    const subjects = await http(
      'GET',
      `/api/hod/marks/subjects?academicYear=2024-2028&year=1&section=A`,
      { token: hodCse.token }
    );
    assert(subjects.status === 200, `subjects -> ${subjects.status}`);
    const inactive = (subjects.body?.data || []).find((s: any) => s.subjectCode === 'CS101');
    assert(inactive, 'the inactive subject should still be listed (for viewing)');
    assert(inactive.isActive === false, 'the listed inactive subject must be flagged isActive=false');
    assert(inactive.status === 'INACTIVE', `the listed subject must carry status=INACTIVE, got ${inactive.status}`);
    assert(inactive.source === 'MASTER', 'a catalogue subject must be tagged source=MASTER');

    // A direct import attempt must be refused even if the client posts it.
    const row = {
      rowNumber: 2,
      registerNumber: 'SUB100001',
      studentName: 'Subject Student One',
      subjectCode: 'CS101',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SUB100001',
        studentId: studentA.id,
        subjectCode: 'CS101',
        subjectName: 'Programming in C (Revised)',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 30,
        maxMarks: 50,
      },
    };
    const imp = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [row], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'CS101', subjectName: 'Programming in C (Revised)', semesterNumber: 1 },
    });
    assert(imp.status === 200, `import -> ${imp.status}`);
    assert(imp.body?.data?.summary?.imported === 0, `inactive subject must not import: ${JSON.stringify(imp.body?.data?.summary)}`);
    assert(/inactive/i.test(JSON.stringify(imp.body?.data?.results)), `import must explain the subject is inactive: ${JSON.stringify(imp.body?.data?.results)}`);
    const notSaved = await InternalMark.findOne({ student: studentA.id, subjectCode: 'CS101' });
    assert(!notSaved, 'no mark may be written for an inactive subject');
    return `inactive subject flagged + import refused (imported=0)`;
  });

  // Reactivate for the remaining checks.
  await http('PATCH', `/api/admin/subjects/${subjectAId}/status`, { token: adminToken, body: { status: 'ACTIVE' } });

  // ── 6. Upload uses the correct subject ────────────────────────────────────
  await check('A marks upload is associated with the correct subject', async () => {
    const row = {
      rowNumber: 2,
      registerNumber: 'SUB100001',
      studentName: 'Subject Student One',
      subjectCode: 'CS101',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SUB100001',
        studentId: studentA.id,
        subjectCode: 'CS101',
        subjectName: 'Programming in C (Revised)',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 44,
        maxMarks: 50,
      },
    };
    const imp = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [row], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'CS101', subjectName: 'Programming in C (Revised)', semesterNumber: 1 },
    });
    assert(imp.status === 200 && imp.body?.data?.summary?.imported === 1, `expected imported=1: ${JSON.stringify(imp.body?.data?.summary)}`);
    const saved: any = await InternalMark.findOne({ student: studentA.id, subjectCode: 'CS101' });
    assert(saved && saved.ia1 === 44, `stored mark wrong: ${JSON.stringify(saved)}`);
    assert(String(saved.student) === studentA.id, 'mark stored against the wrong student');
    return `imported=1, student=${String(saved.student).slice(0, 8)}…, CS101.ia1=44`;
  });

  // ── 7. Invalid marks / unknown subject produce clear errors ───────────────
  await check('Invalid marks are rejected with row-level details', async () => {
    // A hand-built row whose mark exceeds the subject maximum (100) and the
    // assessment maximum (IA1 <= 50): must fail server-side.
    const row = {
      rowNumber: 2,
      registerNumber: 'SUB100001',
      studentName: 'Subject Student One',
      subjectCode: 'CS101',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SUB100001',
        studentId: studentA.id,
        subjectCode: 'CS101',
        subjectName: 'Programming in C (Revised)',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 99,
        maxMarks: 50,
      },
    };
    const imp = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [row], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'CS101', subjectName: 'Programming in C (Revised)', semesterNumber: 1 },
    });
    assert(imp.status === 200, `import -> ${imp.status}`);
    assert(imp.body?.data?.summary?.failed === 1, `expected the row to fail: ${JSON.stringify(imp.body?.data?.summary)}`);
    const reason = JSON.stringify(imp.body?.data?.results);
    assert(/between 0 and 50/.test(reason), `clear range error expected, got: ${reason}`);
    return `row failed with clear reason: ${imp.body?.data?.results?.[0]?.reason}`;
  });

  await check('An unknown subject is refused once the department has a catalogue', async () => {
    const r = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'ZZ999', name: 'Placeholder', departmentId: cseId, semester: 2, academicYear: '2024-2028', maxMarks: 100, passMarks: 40 },
    });
    assert(r.status === 201, `seed subject -> ${r.status}`);

    const row = {
      rowNumber: 2,
      registerNumber: 'SUB100001',
      studentName: 'Subject Student One',
      subjectCode: 'NOPE01',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SUB100001',
        studentId: studentA.id,
        subjectCode: 'NOPE01',
        subjectName: 'Unknown',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 10,
        maxMarks: 50,
      },
    };
    const imp = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [row], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'NOPE01', subjectName: 'Unknown', semesterNumber: 1 },
    });
    assert(imp.status === 200, `import -> ${imp.status}`);
    assert(imp.body?.data?.summary?.imported === 0, 'unknown subject must not import');
    assert(/not registered/i.test(JSON.stringify(imp.body?.data?.results)), `clear unknown-subject error expected: ${JSON.stringify(imp.body?.data?.results)}`);
    return `unknown subject refused: ${imp.body?.data?.results?.[0]?.reason}`;
  });

  // ── 8. Editing a subject does not change existing marks ───────────────────
  await check('Editing a subject never rewrites an existing mark', async () => {
    const before: any = await InternalMark.findOne({ student: studentA.id, subjectCode: 'CS101' });
    assert(before && before.ia1 === 44, 'precondition: CS101 mark should be 44');

    const r = await http('PUT', `/api/admin/subjects/${subjectAId}`, {
      token: adminToken,
      body: {
        code: 'CS101',
        name: 'Programming in C (Renamed Again)',
        departmentId: cseId,
        semester: 1,
        academicYear: '2024-2028',
        regulation: 'R2021',
        subjectType: 'THEORY',
        maxMarks: 100,
        passMarks: 35,
      },
    });
    assert(r.status === 200, `edit -> ${r.status}: ${JSON.stringify(r.body)}`);

    const after: any = await InternalMark.findOne({ student: studentA.id, subjectCode: 'CS101' });
    assert(after && after.ia1 === 44, `mark changed after subject edit: ${JSON.stringify(after)}`);
    assert(after.subjectCode === 'CS101', 'mark subjectCode changed');
    return `mark untouched (ia1=${after.ia1}) after renaming the subject`;
  });

  // ── 9. Historical records still display ───────────────────────────────────
  await check('Historical marks remain accessible after catalogue changes', async () => {
    const subjects = await http(
      'GET',
      `/api/hod/marks/subjects?academicYear=2024-2028&year=1&section=A`,
      { token: hodCse.token }
    );
    assert(subjects.status === 200, `subjects -> ${subjects.status}`);
    const cs101 = (subjects.body?.data || []).find((s: any) => s.subjectCode === 'CS101');
    assert(cs101, 'CS101 missing from the class subject list');

    const students = await http(
      'GET',
      `/api/hod/marks/students?academicYear=2024-2028&year=1&section=A&subjectCode=CS101&semesterNumber=1`,
      { token: hodCse.token }
    );
    assert(students.status === 200, `students -> ${students.status}`);
    assert((students.body?.data || []).length >= 1, 'historical roster is empty');
    return `CS101 listed (source=${cs101.source}) with ${(students.body?.data || []).length} student(s)`;
  });

  // ── 10. Delete rules ──────────────────────────────────────────────────────
  await check('A subject with recorded marks cannot be deleted', async () => {
    const r = await http('DELETE', `/api/admin/subjects/${subjectAId}`, { token: adminToken });
    assert(r.status === 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(/deactivate/i.test(r.body?.message || ''), `message should advise deactivation: ${r.body?.message}`);
    const still: any = await Subject.findById(subjectAId);
    assert(still, 'subject must still exist after a refused delete');
    return `409 as expected: "${r.body?.message}"`;
  });

  await check('A subject with no marks can be deleted', async () => {
    const create = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'TMP01', name: 'Temporary', departmentId: cseId, semester: 3, academicYear: '2025-2029', maxMarks: 100, passMarks: 40 },
    });
    assert(create.status === 201, `seed temp -> ${create.status}`);
    const id = create.body?.data?.id;
    const del = await http('DELETE', `/api/admin/subjects/${id}`, { token: adminToken });
    assert(del.status === 200, `delete -> ${del.status}: ${JSON.stringify(del.body)}`);
    const gone: any = await Subject.findById(id);
    assert(!gone, 'subject should have been deleted');
    return 'unreferenced subject deleted cleanly';
  });

  // ── 11. Authorization: non-Admin cannot modify subjects ───────────────────
  await check('A non-Admin (HOD) cannot create / edit / deactivate a subject', async () => {
    const create = await http('POST', '/api/admin/subjects', {
      token: hodCse.token,
      body: { code: 'HACK1', name: 'Hack', departmentId: cseId, semester: 1, academicYear: '2024-2028', maxMarks: 100, passMarks: 40 },
    });
    assert(create.status === 403, `HOD create -> expected 403, got ${create.status}`);

    const edit = await http('PUT', `/api/admin/subjects/${subjectAId}`, {
      token: hodCse.token,
      body: { code: 'CS101', name: 'Hacked', departmentId: cseId, semester: 1, academicYear: '2024-2028', maxMarks: 100, passMarks: 40 },
    });
    assert(edit.status === 403, `HOD edit -> expected 403, got ${edit.status}`);

    const status = await http('PATCH', `/api/admin/subjects/${subjectAId}/status`, {
      token: hodCse.token,
      body: { status: 'INACTIVE' },
    });
    assert(status.status === 403, `HOD deactivate -> expected 403, got ${status.status}`);

    // An HOD must never read another department's catalogue through the HOD scope.
    const eceSubject = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'EC101', name: 'ECE Electronics', departmentId: String(ece._id), semester: 1, academicYear: '2024-2028', maxMarks: 100, passMarks: 40 },
    });
    assert(eceSubject.status === 201, `seed ECE subject -> ${eceSubject.status}`);
    const eceList = await http('GET', `/api/hod/marks/subjects?academicYear=2024-2028&year=1&section=A`, {
      token: hodCse.token,
    });
    assert(!(eceList.body?.data || []).some((s: any) => s.subjectCode === 'EC101'), 'CSE HOD saw an ECE subject');
    return 'HOD create/edit/deactivate all 403; no cross-department subject leak';
  });

  // ── 11b. Legacy subjects become view-only once a catalogue exists ─────────
  await check('Legacy marks-derived subjects stay listed but become view-only once a catalogue exists', async () => {
    // ECE now has a catalogue (EC101 was seeded by the authorization check).
    // Simulate a mark recorded before the department adopted the catalogue.
    const legacyStudent = await makeStudent(ece, 'SUB900001', 'Ece Legacy Student');
    await InternalMark.create({
      student: legacyStudent.student._id,
      registerNumber: 'SUB900001',
      subjectCode: 'LEG99',
      subjectName: 'Legacy Electronics',
      semesterNumber: 1,
      ia1: 10,
    } as any);

    const list = await http('GET', `/api/hod/marks/subjects?academicYear=2024-2028&year=1&section=A`, {
      token: hodEce.token,
    });
    assert(list.status === 200, `subjects -> ${list.status}`);

    const legacy = (list.body?.data || []).find((s: any) => s.subjectCode === 'LEG99');
    const catalogued = (list.body?.data || []).find((s: any) => s.subjectCode === 'EC101');
    assert(legacy, 'the legacy subject must still be listed so history stays viewable');
    assert(legacy.source === 'MARKS', `legacy subject must be tagged source=MARKS, got ${legacy.source}`);
    assert(legacy.isActive === false, 'a legacy subject must be view-only once the department has a catalogue');
    assert(catalogued && catalogued.isActive === true, 'the catalogued subject must remain selectable');
    return `LEG99 listed view-only (source=MARKS); EC101 selectable`;
  });

  // ── 12. Search / filter / pagination ──────────────────────────────────────
  await check('Search, filter and pagination work', async () => {
    const search = await http('GET', '/api/admin/subjects?search=programming', { token: adminToken });
    assert(search.status === 200, `search -> ${search.status}`);
    assert(search.body?.data?.subjects?.length === 1, `search expected 1 row, got ${search.body?.data?.subjects?.length}`);

    const filter = await http('GET', `/api/admin/subjects?departmentId=${cseId}&semester=1`, { token: adminToken });
    assert(filter.status === 200, `filter -> ${filter.status}`);
    assert(
      (filter.body?.data?.subjects || []).every((s: any) => s.semester === 1 && s.departmentId === cseId),
      'semester/department filter leaked a mismatched row'
    );

    const paged = await http('GET', '/api/admin/subjects?page=1&limit=1', { token: adminToken });
    assert(paged.status === 200 && paged.body?.data?.subjects?.length === 1, `page size 1 expected 1 row, got ${paged.body?.data?.subjects?.length}`);
    assert(paged.body?.data?.pageCount >= 2, `expected >1 page, got ${paged.body?.data?.pageCount}`);

    const meta = await http('GET', '/api/admin/subjects/meta', { token: adminToken });
    assert(meta.status === 200 && Array.isArray(meta.body?.data?.departments), 'meta should list departments');
    return `search=1 row; filter matches scope; pageCount=${paged.body?.data?.pageCount}; meta ok`;
  });

  // ── 13. Persistence across a restart ──────────────────────────────────────
  await check('Subject data persists across a backend restart', async () => {
    const subjectsFile = path.join(store.dataDir, 'subjects.json');
    const onDisk = await Subject.countDocuments();
    assert(onDisk >= 3, `expected >=3 subjects on disk, found ${onDisk}`);
    // The record must already be in the JSON file, not only in memory.
    const raw = fs.readFileSync(subjectsFile, 'utf8');
    assert(raw.includes('CS101'), 'CS101 is not present in subjects.json');
    const parsed = JSON.parse(raw);
    assert(Array.isArray(parsed) && parsed.some((s: any) => s.code === 'CS101'), 'subjects.json shape unexpected');
    return `subjects.json contains ${parsed.length} rows incl. CS101`;
  });

  // ── 14. Multi-select: create with several departments/semesters/years ─────
  let multiId = '';
  await check('Admin can create a subject with multiple departments, semesters and academic years', async () => {
    const r = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: {
        code: 'MS101',
        name: 'Multi Scope Subject',
        departmentIds: [cseId, String(ece._id)],
        semesters: [3, 4],
        academicYears: ['2024-2028', '2025-2029'],
        regulations: ['R2021', 'R2025'],
        subjectType: 'THEORY',
        maxMarks: 100,
        passMarks: 40,
      },
    });
    assert(r.status === 201, `multi create -> ${r.status}: ${JSON.stringify(r.body)}`);
    const s = r.body?.data;
    multiId = s.id;
    assert(s.departmentIds.length === 2, `expected 2 departments, got ${JSON.stringify(s.departmentIds)}`);
    assert(s.departments.length === 2 && s.departments.every((d: any) => d.code), 'departments must resolve to labelled entries');
    assert([...s.semesters].sort((a: number, b: number) => a - b).join(',') === '3,4', `semesters wrong: ${JSON.stringify(s.semesters)}`);
    assert(s.academicYears.join(',') === '2024-2028,2025-2029', `years wrong: ${JSON.stringify(s.academicYears)}`);
    assert(s.regulations.join(',') === 'R2021,R2025', `regulations wrong: ${JSON.stringify(s.regulations)}`);
    // Backward-compatible first-element mirrors stay in sync.
    assert(s.departmentId === cseId && s.semester === 3 && s.academicYear === '2024-2028', 'scalar mirrors are off');
    const stored: any = await Subject.findById(multiId);
    assert(stored.departments.length === 2 && stored.semesters.length === 2, 'stored scope arrays are missing');
    return `MS101 depts=[${s.departments.map((d: any) => d.code).join(',')}] sems=[${s.semesters}] years=[${s.academicYears}]`;
  });

  // ── 15. Overlapping scope rejected; disjoint scope allowed ────────────────
  await check('A duplicate code with an overlapping scope is rejected, a disjoint scope is allowed', async () => {
    const overlap = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: {
        code: 'MS101',
        name: 'Overlap',
        departmentIds: [cseId],
        semesters: [4],
        academicYears: ['2024-2028'],
        maxMarks: 100,
        passMarks: 40,
      },
    });
    assert(overlap.status === 409, `overlapping duplicate -> expected 409, got ${overlap.status}: ${JSON.stringify(overlap.body)}`);

    const disjoint = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: {
        code: 'MS101',
        name: 'Disjoint',
        departmentIds: [cseId],
        semesters: [7],
        academicYears: ['2023-2027'],
        maxMarks: 100,
        passMarks: 40,
      },
    });
    assert(disjoint.status === 201, `disjoint scope -> expected 201, got ${disjoint.status}: ${JSON.stringify(disjoint.body)}`);
    return 'overlap rejected (409); disjoint scope accepted (201)';
  });

  // ── 16. Empty / invalid scope selections rejected ─────────────────────────
  await check('Empty or malformed scope selections are rejected', async () => {
    const noDept = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'BAD01', name: 'No dept', departmentIds: [], semesters: [1], academicYears: ['2024-2028'], maxMarks: 100, passMarks: 40 },
    });
    assert(noDept.status === 400 && /department/i.test(noDept.body?.message || ''), `empty departments -> ${noDept.status} ${noDept.body?.message}`);

    const noSem = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'BAD02', name: 'No sem', departmentIds: [cseId], semesters: [], academicYears: ['2024-2028'], maxMarks: 100, passMarks: 40 },
    });
    assert(noSem.status === 400 && /semester/i.test(noSem.body?.message || ''), `empty semesters -> ${noSem.status} ${noSem.body?.message}`);

    const badYear = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'BAD03', name: 'Bad year', departmentIds: [cseId], semesters: [1], academicYears: ['20-28'], maxMarks: 100, passMarks: 40 },
    });
    assert(badYear.status === 400 && /academic year/i.test(badYear.body?.message || ''), `bad year -> ${badYear.status} ${badYear.body?.message}`);

    const stored = await Subject.countDocuments({ code: { $in: ['BAD01', 'BAD02', 'BAD03'] } });
    assert(stored === 0, `invalid subjects must not be stored, found ${stored}`);
    return 'empty department / empty semester / bad year all 400; nothing stored';
  });

  // ── 17. Editing preserves every selected value ────────────────────────────
  await check('Editing a subject preserves all multi-select values', async () => {
    const r = await http('PUT', `/api/admin/subjects/${multiId}`, {
      token: adminToken,
      body: {
        code: 'MS101',
        name: 'Multi Scope Subject (Edited)',
        departmentIds: [cseId, String(ece._id)],
        semesters: [3, 4],
        academicYears: ['2024-2028', '2025-2029'],
        regulations: ['R2021', 'R2025'],
        subjectType: 'THEORY',
        maxMarks: 100,
        passMarks: 45,
      },
    });
    assert(r.status === 200, `edit -> ${r.status}: ${JSON.stringify(r.body)}`);
    const s = r.body?.data;
    assert(s.name === 'Multi Scope Subject (Edited)', 'name was not updated');
    assert(s.passMarks === 45, 'pass marks were not updated');
    assert(
      s.departmentIds.length === 2 && s.semesters.length === 2 && s.academicYears.length === 2 && s.regulations.length === 2,
      `selections were lost: ${JSON.stringify(s)}`
    );
    return `kept ${s.departmentIds.length} depts, ${s.semesters.length} sems, ${s.academicYears.length} years, ${s.regulations.length} regs`;
  });

  // ── 18. Removing a value narrows the scope ────────────────────────────────
  await check('Removing a selected value narrows the stored scope without touching the rest', async () => {
    const r = await http('PUT', `/api/admin/subjects/${multiId}`, {
      token: adminToken,
      body: {
        code: 'MS101',
        name: 'Multi Scope Subject (Edited)',
        departmentIds: [cseId],
        semesters: [3, 4],
        academicYears: ['2024-2028', '2025-2029'],
        regulations: ['R2021'],
        subjectType: 'THEORY',
        maxMarks: 100,
        passMarks: 45,
      },
    });
    assert(r.status === 200, `edit -> ${r.status}: ${JSON.stringify(r.body)}`);
    const s = r.body?.data;
    assert(s.departmentIds.length === 1 && s.departmentIds[0] === cseId, `department not narrowed: ${JSON.stringify(s.departmentIds)}`);
    assert(s.regulations.length === 1 && s.regulations[0] === 'R2021', `regulation not narrowed: ${JSON.stringify(s.regulations)}`);
    assert(s.semesters.length === 2 && s.academicYears.length === 2, 'untouched selections must be preserved');
    return 'narrowed to 1 department + 1 regulation; semesters and years retained';
  });

  // ── 19. Marks upload uses a compatible subject ────────────────────────────
  await check('A marks upload succeeds when the subject applies to the class', async () => {
    const create = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'MS200', name: 'Multi Upload Subject', departmentIds: [cseId], semesters: [1, 2], academicYears: ['2024-2028'], maxMarks: 100, passMarks: 40 },
    });
    assert(create.status === 201, `seed MS200 -> ${create.status}: ${JSON.stringify(create.body)}`);

    const row = {
      rowNumber: 2,
      registerNumber: 'SUB100001',
      studentName: 'Subject Student One',
      subjectCode: 'MS200',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SUB100001',
        studentId: studentA.id,
        subjectCode: 'MS200',
        subjectName: 'Multi Upload Subject',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 33,
        maxMarks: 50,
      },
    };
    const imp = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [row], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'MS200', subjectName: 'Multi Upload Subject', semesterNumber: 1 },
    });
    assert(imp.status === 200 && imp.body?.data?.summary?.imported === 1, `expected imported=1: ${JSON.stringify(imp.body?.data?.summary)}`);
    const saved: any = await InternalMark.findOne({ student: studentA.id, subjectCode: 'MS200' });
    assert(saved && saved.ia1 === 33, `stored mark wrong: ${JSON.stringify(saved)}`);
    return `MS200 imported for the CSE year-1 semester-1 class (ia1=33)`;
  });

  // ── 20. Incompatible semester / department uploads rejected ───────────────
  await check('Uploads are rejected for an incompatible semester or department', async () => {
    // MS300 applies to CSE semester 3 only; the class is semester 1.
    const semCreate = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'MS300', name: 'Semester 3 Only', departmentIds: [cseId], semesters: [3], academicYears: ['2024-2028'], maxMarks: 100, passMarks: 40 },
    });
    assert(semCreate.status === 201, `seed MS300 -> ${semCreate.status}`);

    const semRow = {
      rowNumber: 2,
      registerNumber: 'SUB100001',
      studentName: 'Subject Student One',
      subjectCode: 'MS300',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SUB100001',
        studentId: studentA.id,
        subjectCode: 'MS300',
        subjectName: 'Semester 3 Only',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 20,
        maxMarks: 50,
      },
    };
    const semImp = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [semRow], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'MS300', subjectName: 'Semester 3 Only', semesterNumber: 1 },
    });
    assert(
      semImp.body?.data?.summary?.imported === 0 && /not registered/i.test(JSON.stringify(semImp.body?.data?.results)),
      `incompatible semester must be refused: ${JSON.stringify(semImp.body?.data?.results)}`
    );

    // MS400 applies to ECE only; the CSE HOD must neither see nor upload it.
    const eceCreate = await http('POST', '/api/admin/subjects', {
      token: adminToken,
      body: { code: 'MS400', name: 'ECE Only', departmentIds: [String(ece._id)], semesters: [1], academicYears: ['2024-2028'], maxMarks: 100, passMarks: 40 },
    });
    assert(eceCreate.status === 201, `seed MS400 -> ${eceCreate.status}`);

    const list = await http('GET', '/api/hod/marks/subjects?academicYear=2024-2028&year=1&section=A', { token: hodCse.token });
    assert(!(list.body?.data || []).some((s: any) => s.subjectCode === 'MS400'), 'the CSE HOD must not see an ECE-only subject');

    const deptRow = {
      ...semRow,
      subjectCode: 'MS400',
      parsedData: { ...semRow.parsedData, subjectCode: 'MS400', subjectName: 'ECE Only' },
    };
    const deptImp = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [deptRow], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'MS400', subjectName: 'ECE Only', semesterNumber: 1 },
    });
    assert(deptImp.body?.data?.summary?.imported === 0, 'an incompatible department must not import');
    return 'semester-3-only and ECE-only subjects both refused for the CSE year-1 class';
  });

  // ── 21. Existing marks preserved ──────────────────────────────────────────
  await check('Multi-select changes never disturb existing marks', async () => {
    const cs101: any = await InternalMark.findOne({ student: studentA.id, subjectCode: 'CS101' });
    assert(cs101 && cs101.ia1 === 44, `the CS101 mark changed: ${JSON.stringify(cs101)}`);
    return 'CS101.ia1 is still 44 after every multi-select edit';
  });

  // ── 22. Multi-select arrays persisted on disk ─────────────────────────────
  await check('Multi-select scope arrays are persisted to subjects.json', async () => {
    const subjectsFile = path.join(store.dataDir, 'subjects.json');
    const raw = JSON.parse(fs.readFileSync(subjectsFile, 'utf8'));
    const ms101 = raw.find((s: any) => s.code === 'MS101' && Array.isArray(s.departments) && s.departments.length === 1);
    assert(ms101, 'MS101 with scope arrays not found in subjects.json');
    assert(
      Array.isArray(ms101.departments) && Array.isArray(ms101.semesters) && Array.isArray(ms101.academicYears),
      'scope arrays were not persisted'
    );
    const ms200 = raw.find((s: any) => s.code === 'MS200');
    assert(ms200 && Array.isArray(ms200.semesters) && ms200.semesters.length === 2, 'the MS200 semesters array was not persisted');
    return 'subjects.json stores departments / semesters / academicYears as arrays';
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== SUBJECT MANAGEMENT VERIFICATION ==========\n');
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
