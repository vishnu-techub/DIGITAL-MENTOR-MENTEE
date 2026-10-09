/**
 * FACULTY DEPARTMENT REASSIGNMENT VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives `PATCH /api/admin/faculty/:facultyId/department` over HTTP
 * exactly as the Admin Dashboard "Reassign Department" flow does.
 *
 * A CSE mentor is moved to ECE and the following are PROVABLE rather than
 * assumed:
 *   - only ADMIN may reassign (HOD / FACULTY / STUDENT get 403, anonymous 401)
 *   - both the Faculty row and the linked User row move to the new department,
 *     so a re-login issues a token whose `departmentId` claim is ECE
 *   - the mentor's ACTIVE MentorAssignments (and therefore their mentees) are
 *     PRESERVED — the department change never moves mentees
 *   - every historical CounsellingRecord keeps its original mentor + student
 *   - the HOD /api/admin/faculty lists re-scope after the move (CSE no longer
 *     sees the mentor, a new ECE HOD does)
 *   - the response reports old/new department and how many active assignments
 *     still need a manual mentor reassignment
 *   - a REASSIGN_FACULTY_DEPARTMENT audit record is written
 *   - validation: same department / missing / unknown department -> 400,
 *     unregistered faculty id -> 404
 *
 * It also asserts FEATURE 1 and FEATURE 3 source contracts on the frontend:
 *   - "Remove HOD" drives de-activation (`setHodStatus`), never deletion
 *   - the Student Documents tab opens a dedicated document viewer
 *     (no Student Profile redirect, legitimate-preview-only rules intact)
 *
 * Run: npm run test:faculty-dept-reassign
 */
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('faculty-dept-reassign');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5115;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'faculty-dept-reassign-secret-do-not-use-in-prod';
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

async function login(username: string, password: string) {
  const r = await http('POST', '/api/auth/login', { body: { username, password } });
  return {
    status: r.status,
    token: r.body?.data?.token || r.body?.token,
    user: r.body?.data?.user,
  };
}

/** Assert the frontend ships the exact feature-1 / feature-3 wiring. */
function verifyFrontendContracts() {
  const frontendSrc = path.resolve(process.cwd(), '..', 'frontend', 'src');

  // Feature 1 — "Remove HOD" must de-activate, never delete.
  const hodPath = path.join(frontendSrc, 'pages', 'admin', 'AdminHodManagement.tsx');
  const hod = fs.readFileSync(hodPath, 'utf8');
  for (const needle of ['Remove HOD', 'confirmRemoveHod', 'setHodStatus']) {
    assert(hod.includes(needle), `AdminHodManagement.tsx is missing "${needle}"`);
  }
  assert(
    !hod.includes('api.admin.deleteHod'),
    'AdminHodManagement.tsx references a deleted-HOD API; Remove HOD must de-activate'
  );

  // Feature 2 — the client ships the reassign route + binding.
  const client = fs.readFileSync(path.join(frontendSrc, 'api', 'client.ts'), 'utf8');
  assert(
    client.includes('reassignFacultyDepartment'),
    'client.ts is missing api.admin.reassignFacultyDepartment'
  );
  assert(
    client.includes('`/admin/faculty/${facultyId}/department`') ||
      client.includes("'/admin/faculty/${facultyId}/department'"),
    'client.ts is missing the PATCH /admin/faculty/:facultyId/department route'
  );

  // Feature 3 — dedicated document viewer, no profile redirect.
  const viewerPath = path.join(frontendSrc, 'pages', 'admin', 'AdminStudentDocuments.tsx');
  const viewer = fs.readFileSync(viewerPath, 'utf8');
  for (const needle of ['Preview unavailable', 'Back to Student Documents', 'fetchViewBlob', 'getByStudent']) {
    assert(viewer.includes(needle), `AdminStudentDocuments.tsx is missing "${needle}"`);
  }
  assert(
    !viewer.includes('StudentDetailsView'),
    'AdminStudentDocuments.tsx is coupled to the Student Profile — the viewer must never redirect'
  );
  const dashboard = fs.readFileSync(path.join(frontendSrc, 'pages', 'admin', 'AdminDashboard.tsx'), 'utf8');
  for (const needle of [
    "AdminStudentDocuments",
    'documentsStudent',
    'setDocumentsStudent(s)',
    'setDocumentsStudent(null)',
  ]) {
    assert(dashboard.includes(needle), `AdminDashboard.tsx documents tab is missing "${needle}"`);
  }
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const {
    User,
    Student,
    Faculty,
    Department,
    Batch,
    MentorAssignment,
    CounsellingRecord,
    AuditLog,
  } = await import('../models/index.js');
  const { toIdString } = await import('../utils/access.util.js');

  const hash = bcrypt.hashSync('Seed@12345', 10);

  const admin = await login('admin', 'Admin@12345');
  assert(admin.token, 'admin could not log in');
  const adminToken = admin.token;

  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  assert(cse && ece, 'bootstrap did not create CSE/ECE');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'bootstrap did not create a batch');

  // ── SEED ──────────────────────────────────────────────────────────────────
  const mentorUser: any = await User.create({
    username: 'fdep.fac.cse', passwordHash: hash, role: 'FACULTY',
    email: 'fdep.fac.cse@ksrce.test', fullName: 'FDep Reassign Cse Mentor',
    department: cse._id, isActive: true,
  });
  const mentor: any = await Faculty.create({
    user: mentorUser._id, employeeId: 'FDEP-CSE1', department: cse._id,
    designation: 'Professor', cabinLocation: 'A-1', isActive: true,
  } as any);
  const mentorLogin = await login('fdep.fac.cse', 'Seed@12345');
  assert(mentorLogin.token, 'CSE mentor could not log in');
  assert(mentorLogin.user?.facultyId === mentor._id.toString(), 'login did not surface facultyId');

  async function makeStudent(dept: any, reg: string, name: string) {
    const user: any = await User.create({
      username: reg.toLowerCase(), passwordHash: hash, role: 'STUDENT',
      email: `${reg.toLowerCase()}@ksrce.test`, fullName: name,
      department: dept._id, isActive: true,
    });
    const student: any = await Student.create({
      user: user._id, registerNumber: reg, fullName: name,
      department: dept._id, batch: batch._id, residentialType: 'DAY_SCHOLAR',
      parent: {}, siblings: [], school: {}, profileCompleted: false, isActive: true,
    } as any);
    return { user, student };
  }

  const s1 = await makeStudent(cse, '713823FDR001', 'FDep Reassign Student One');
  const s2 = await makeStudent(cse, '713823FDR002', 'FDep Reassign Student Two');
  await makeStudent(ece, '713823FDR003', 'FDep Reassign Student Three');

  const actedS1 = await MentorAssignment.create({
    mentor: mentor._id,
    student: s1.student._id,
    department: cse._id,
    status: 'ACTIVE',
    assignedFrom: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10),
    assignedBy: admin.user?.id || undefined,
    changeReason: 'Seed',
  } as any);
  const actedS2 = await MentorAssignment.create({
    mentor: mentor._id,
    student: s2.student._id,
    department: cse._id,
    status: 'ACTIVE',
    assignedFrom: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    assignedBy: admin.user?.id || undefined,
    changeReason: 'Seed',
  } as any);

  const counselling = await CounsellingRecord.create({
    student: s1.student._id,
    mentor: mentor._id,
    sessionDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    categories: ['Academic Development'],
    discussionWith: ['student'],
    challengeObserved: 'Baseline counselling before the department change.',
    correctiveAction: 'Keep monthly sessions.',
  } as any);

  const hodCseUser: any = await User.create({
    username: 'fdep.hod.cse', passwordHash: hash, role: 'HOD',
    email: 'fdep.hod.cse@ksrce.test', fullName: 'FDep HOD CSE',
    department: cse._id, isActive: true,
  });
  const hodCse = await login('fdep.hod.cse', 'Seed@12345');
  assert(hodCse.token, 'CSE HOD could not log in');

  const hodEceUser: any = await User.create({
    username: 'fdep.hod.ece', passwordHash: hash, role: 'HOD',
    email: 'fdep.hod.ece@ksrce.test', fullName: 'FDep HOD ECE',
    department: ece._id, isActive: true,
  });
  const hodEce = await login('fdep.hod.ece', 'Seed@12345');
  assert(hodEce.token, 'ECE HOD could not log in');

  const eceMentorUser: any = await User.create({
    username: 'fdep.fac.ece', passwordHash: hash, role: 'FACULTY',
    email: 'fdep.fac.ece@ksrce.test', fullName: 'FDep Reassign Ece Mentor',
    department: ece._id, isActive: true,
  });
  const eceMentor: any = await Faculty.create({
    user: eceMentorUser._id, employeeId: 'FDEP-ECE1', department: ece._id,
    designation: 'Professor', cabinLocation: 'B-1', isActive: true,
  } as any);
  const eceMentorLogin = await login('fdep.fac.ece', 'Seed@12345');
  assert(eceMentorLogin.token, 'ECE mentor could not log in');

  const studentLogin = await login('713823fdr001', 'Seed@12345');
  assert(studentLogin.token, 'student could not log in');

  // ── 1. Admin reassigns the CSE mentor into ECE ────────────────────────────
  await check('Admin reassigns the faculty from CSE to ECE with a full response contract', async () => {
    const r = await http(
      'PATCH',
      `/api/admin/faculty/${mentor._id}/department`,
      { token: adminToken, body: { departmentId: ece._id.toString() } }
    );
    assert(r.status === 200, `PATCH -> ${r.status}: ${JSON.stringify(r.body)}`);
    const d = r.body?.data;
    assert(d?.faculty?.department_code === 'ECE', `faculty.department_code=${d?.faculty?.department_code}`);
    assert(d?.faculty?.department_id === ece._id.toString(), 'faculty.department_id is not the ECE id');
    assert(d?.faculty?.mentee_count === 2, `mentee_count=${d?.faculty?.mentee_count}`);
    assert(d?.previousDepartment?.code === 'CSE', `previousDepartment=${JSON.stringify(d?.previousDepartment)}`);
    assert(d?.newDepartment?.code === 'ECE', 'targetDepartment is not ECE');
    assert(d?.unchangedMentees === 2, `unchangedMentees=${d?.unchangedMentees}`);
    assert(d?.faculty?.full_name === 'FDep Reassign Cse Mentor', 'wrong faculty row returned');
    return `200 → faculty now ${d.faculty.department_code} (${d.faculty.department_name}), prev ${d.previousDepartment.code}→${d.newDepartment.code}, preserved ${d.unchangedMentees} assignments`;
  });

  // ── 2. Underlying Faculty + User documents moved ──────────────────────────
  await check('Both the Faculty row and the linked User row now point at ECE', async () => {
    const fac = await Faculty.findById(mentor._id);
    assert(toIdString(fac.department) === ece._id.toString(), `Faculty.department=${fac.department}`);
    const freshUser: any = await User.findById(mentorUser._id);
    assert(freshUser && toIdString(freshUser.department) === ece._id.toString(), `User.department=${freshUser?.department}`);
    return `Faculty.department → ECE, User.department → ECE (role ${freshUser.role})`;
  });

  // ── 3. Admin faculty list re-scopes ───────────────────────────────────────
  await check('Admin faculty list reports the mentor under ECE now', async () => {
    const r = await http('GET', '/api/admin/faculty', { token: adminToken });
    assert(r.status === 200, `list -> ${r.status}`);
    const list = Array.isArray(r.body?.data) ? r.body.data : [];
    const row = list.find((f: any) => f.employee_id === 'FDEP-CSE1');
    assert(row, 'moved mentor missing from the admin faculty list');
    assert(row.department_code === 'ECE', `listed under ${row.department_code}, expected ECE`);
    assert(row.mentee_count === 2, `mentee_count=${row.mentee_count}`);
    return `${row.full_name} appears under ${row.department_code} with ${row.mentee_count} active mentees`;
  });

  // ── 4. Mentees preserved ──────────────────────────────────────────────────
  await check('ACTIVE mentor assignments survive the move (mentees never move with the faculty)', async () => {
    const both = await MentorAssignment.find({ mentor: mentor._id, status: 'ACTIVE' }).sort({ student: 1 });
    assert(both.length === 2, `active assignments=${both.length}`);
    const s1Row = both.find((a: any) => a.student.toString() === s1.student._id.toString());
    const s2Row = both.find((a: any) => a.student.toString() === s2.student._id.toString());
    assert(s1Row && s2Row, 'one of the CSE students lost their assignment');
    assert(actedS1._id.toString() === s1Row._id.toString() && actedS2._id.toString() === s2Row._id.toString(), 'assignment _id changed');

    const r = await http('GET', `/api/admin/mentors/${mentor._id}/mentees`, { token: adminToken });
    assert(r.status === 200, `mentees -> ${r.status}`);
    const menteeData = r.body?.data || {};
    assert(Number(menteeData.total) === 2, `mentees total=${menteeData.total}`);
    const regs = (menteeData.mentees || []).map((x: any) => x.register_number || '');
    assert(regs.includes('713823FDR001') && regs.includes('713823FDR002'), `mentees = ${regs.join(', ')}`);
    return `2 ACTIVE assignments kept their ids; GET /api/admin/mentors/:id/mentees → ${regs.join(', ')}`;
  });

  // ── 5. Historical counselling preserved ───────────────────────────────────
  await check('The counselling record keeps its original mentor + student', async () => {
    const rec = await CounsellingRecord.findById(counselling._id);
    assert(rec, 'counselling record vanished');
    assert(rec.mentor.toString() === mentor._id.toString(), `record.mentor=${rec.mentor}`);
    assert(rec.student.toString() === s1.student._id.toString(), `record.student=${rec.student}`);
    return `record ${rec._id} still authored by the (now ECE) mentor for S1`;
  });

  // ── 6. Audit ──────────────────────────────────────────────────────────────
  await check('A REASSIGN_FACULTY_DEPARTMENT audit entry is recorded', async () => {
    const audit = await AuditLog.find({ action: 'REASSIGN_FACULTY_DEPARTMENT', entityId: mentor._id.toString() });
    assert(audit.length >= 1, 'no audit entry found');
    const latest: any = audit[audit.length - 1];
    assert(latest.details?.previousDepartmentId === cse._id.toString(), 'previousDepartmentId wrong');
    assert(latest.details?.newDepartmentId === ece._id.toString(), 'newDepartmentId wrong');
    assert(latest.details?.activeMenteesPreserved === 2, 'activeMenteesPreserved flag wrong');
    assert(latest.details?.employeeId === 'FDEP-CSE1', 'employeeId missing from audit');
    return `audit (${latest._id}) ${latest.details.previousDepartmentId} → ${latest.details.newDepartmentId}, preserved ${latest.details.activeMenteesPreserved}`;
  });

  // ── 7. Re-login claim ─────────────────────────────────────────────────────
  await check('A re-login issues a token whose departmentId claim is now ECE', async () => {
    const l = await login('fdep.fac.cse', 'Seed@12345');
    assert(l.status === 200, `re-login -> ${l.status}`);
    assert(l.user?.departmentId === ece._id.toString(), `departmentId=${l.user?.departmentId}`);
    return `token departmentId = ${l.user.departmentId} (ECE)`;
  });

  // ── 8. HOD isolation after the move ───────────────────────────────────────
  await check('HOD faculty lists re-scope after the move (CSE hides, ECE shows)', async () => {
    const cseList = await http('GET', '/api/admin/faculty', { token: hodCse.token });
    assert(cseList.status === 200, `CSE HOD list -> ${cseList.status}`);
    const cseRows = Array.isArray(cseList.body?.data) ? cseList.body.data : [];
    assert(!cseRows.some((f: any) => f.employee_id === 'FDEP-CSE1'), 'CSE HOD still sees the moved mentor');

    const eceList = await http('GET', '/api/admin/faculty', { token: hodEce.token });
    assert(eceList.status === 200, `ECE HOD list -> ${eceList.status}`);
    const eceRows = Array.isArray(eceList.body?.data) ? eceList.body.data : [];
    assert(eceRows.some((f: any) => f.employee_id === 'FDEP-CSE1'), 'ECE HOD cannot see the moved mentor');
    return `CSE hides FDEP-CSE1, ECE shows FDEP-CSE1`;
  });

  // ── 9-11. Validation ──────────────────────────────────────────────────────
  await check('Reassigning into the current department is rejected (400)', async () => {
    const r = await http(
      'PATCH',
      `/api/admin/faculty/${mentor._id}/department`,
      { token: adminToken, body: { departmentId: ece._id.toString() } }
    );
    assert(r.status === 400, `same-dept -> ${r.status}`);
    return `400: ${r.body?.message || 'rejected'}`;
  });

  await check('A missing department id is rejected (400)', async () => {
    const r = await http('PATCH', `/api/admin/faculty/${mentor._id}/department`, {
      token: adminToken, body: {},
    });
    assert(r.status === 400, `missing dept -> ${r.status}`);
    return `400: ${r.body?.message || 'rejected'}`;
  });

  await check('An unknown department is rejected (400)', async () => {
    const r = await http('PATCH', `/api/admin/faculty/${mentor._id}/department`, {
      token: adminToken, body: { departmentId: 'DOES-NOT-EXIST' },
    });
    assert(r.status === 400, `unknown dept -> ${r.status}`);
    return `400: ${r.body?.message || 'rejected'}`;
  });

  await check('An unregistered faculty id is rejected (404)', async () => {
    const r = await http('PATCH', '/api/admin/faculty/507f1f77bcf86cd799439011/department', {
      token: adminToken, body: { departmentId: ece._id.toString() },
    });
    assert(r.status === 404, `unknown faculty -> ${r.status}`);
    return `404: ${r.body?.message || 'rejected'}`;
  });

  // ── 12-15. RBAC ───────────────────────────────────────────────────────────
  await check('HOD cannot reassign a faculty member (403)', async () => {
    const r = await http('PATCH', `/api/admin/faculty/${mentor._id}/department`, {
      token: hodCse.token, body: { departmentId: ece._id.toString() },
    });
    assert(r.status === 403, `HOD reassign -> ${r.status}`);
    return `403 for role HOD`;
  });

  await check('FACULTY cannot reassign (403)', async () => {
    const r = await http('PATCH', `/api/admin/faculty/${mentor._id}/department`, {
      token: eceMentorLogin.token, body: { departmentId: ece._id.toString() },
    });
    assert(r.status === 403, `FACULTY reassign -> ${r.status}`);
    return `403 for role FACULTY`;
  });

  await check('STUDENT cannot reassign (403)', async () => {
    const r = await http('PATCH', `/api/admin/faculty/${mentor._id}/department`, {
      token: studentLogin.token, body: { departmentId: ece._id.toString() },
    });
    assert(r.status === 403, `STUDENT reassign -> ${r.status}`);
    return `403 for role STUDENT`;
  });

  await check('Anonymous reassign is refused (401)', async () => {
    const r = await http('PATCH', `/api/admin/faculty/${mentor._id}/department`, {
      body: { departmentId: ece._id.toString() },
    });
    assert(r.status === 401, `anonymous reassign -> ${r.status}`);
    return `401 unauthenticated`;
  });

  // ── 16. Mentee access stays assignment-derived, not department-derived ──
  await check('Mentee drill-down is assignment-derived (ECE HOD sees S1/S2, CSE HOD is blocked)', async () => {
    const ece = await http('GET', `/api/admin/mentors/${mentor._id}/mentees`, { token: hodEce.token });
    assert(ece.status === 200, `ECE HOD mentees -> ${ece.status}`);
    const data = ece.body?.data || {};
    assert(Number(data.total) === 2, `ECE HOD mentees total=${data.total}`);
    const regs = (data.mentees || []).map((x: any) => x.register_number || '');
    assert(regs.includes('713823FDR001'), 'S1 missing from the ECE HOD drill-down');

    const cseDrill = await http('GET', `/api/admin/mentors/${mentor._id}/mentees`, { token: hodCse.token });
    assert(cseDrill.status === 404, `CSE HOD drill -> ${cseDrill.status} (must be 404 out-of-scope)`);
    return `ECE HOD (new dept) reads S1/S2 mentees; CSE HOD (old dept) -> 404`;
  });

  // ── 17. Feature 1 + 3 frontend source contracts ──────────────────────────
  await check('Frontend source: Remove HOD de-activates, Documents tab uses a dedicated viewer', async () => {
    verifyFrontendContracts();
    return 'AdminHodManagement drives setHodStatus (no deletion route); AdminStudentDocuments viewer wired via documentsStudent, not selectedStudentId';
  });

  // ── REPORT ──────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== FACULTY DEPARTMENT REASSIGNMENT VERIFICATION ==========\n');
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