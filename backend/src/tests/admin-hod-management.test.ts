/**
 * ADMIN HOD MANAGEMENT VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives the `/api/admin/hods` account-management surface over HTTP
 * exactly as the Admin "HOD Management" tab does.
 *
 * Two departments are seeded with students, a mentor, an assignment and a
 * mentoring record so the following are PROVABLE rather than assumed:
 *   - Admin can create a HOD (role = HOD, exactly one departmentId) and that
 *     account can log in with the password supplied at creation
 *   - a second HOD for a department that already has one is refused with 409
 *   - edit re-runs the same one-HOD-per-department rule (no duplicate pair)
 *   - HOD / FACULTY / STUDENT get 403 and anonymous 401 on every endpoint —
 *     a HOD cannot mint another HOD
 *   - deactivation flips only `isActive`: the account, its department link and
 *     every historical mentoring record survive, and the deactivated HOD can
 *     no longer log in
 *   - the /api/hod/* department isolation still holds after the change
 *
 * Run: npm run test:hod-admin
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('admin-hod-mgmt');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5100;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-hod-mgmt-secret-do-not-use-in-prod';
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
  const it: any = await Department.findOne({ code: 'IT' });
  assert(cse && ece && it, 'bootstrap did not create the reference departments');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'bootstrap did not create a batch');

  // ── SEED: two departments with real records ─────────────────────────────
  const cseMentorUser: any = await User.create({
    username: 'hodmgmt.fac.cse', passwordHash: hash, role: 'FACULTY',
    email: 'hodmgmt.fac.cse@ksrce.test', fullName: 'HodMgmt Cse Mentor',
    department: cse._id, isActive: true,
  });
  const cseMentor: any = await Faculty.create({
    user: cseMentorUser._id, employeeId: 'HODMGMT-CSE1', department: cse._id,
    designation: 'Professor', cabinLocation: 'A-1', isActive: true,
  } as any);
  const cseMentorLogin = await login('hodmgmt.fac.cse', 'Seed@12345');
  assert(cseMentorLogin.token, 'CSE mentor could not log in');

  const eceMentorUser: any = await User.create({
    username: 'hodmgmt.fac.ece', passwordHash: hash, role: 'FACULTY',
    email: 'hodmgmt.fac.ece@ksrce.test', fullName: 'HodMgmt Ece Mentor',
    department: ece._id, isActive: true,
  });
  const eceMentor: any = await Faculty.create({
    user: eceMentorUser._id, employeeId: 'HODMGMT-ECE1', department: ece._id,
    designation: 'Professor', cabinLocation: 'B-1', isActive: true,
  } as any);

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

  const cseS1 = await makeStudent(cse, 'HODMGMT001', 'HodMgmt Cse Student One');
  const cseS2 = await makeStudent(cse, 'HODMGMT002', 'HodMgmt Cse Student Two');
  await makeStudent(ece, 'HODMGMT101', 'HodMgmt Ece Student One');
  const studentLogin = await login('hodmgmt001', 'Seed@12345');
  assert(studentLogin.token, 'seed student could not log in');

  await MentorAssignment.create({
    student: cseS1.student._id, mentor: cseMentor._id, department: cse._id,
    assignedFrom: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10),
    status: 'ACTIVE', assignedBy: admin.user?.id || undefined, changeReason: 'Seed',
  } as any);
  await CounsellingRecord.create({
    student: cseS1.student._id, mentor: cseMentor._id,
    sessionDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    categories: ['Academic Development'], discussionWith: ['student'],
    challengeObserved: 'Needs focus', correctiveAction: 'Study plan',
  } as any);

  // ── 1. Admin creates a HOD ──────────────────────────────────────────────
  let cseHodId = '';
  let cseHodUsername = '';
  await check('Admin creates a HOD with role HOD and exactly one department', async () => {
    const r = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: {
        fullName: 'Dr HodMgmt Cse Head',
        email: 'hodmgmt.cse@ksrce.test',
        departmentId: String(cse._id),
        password: 'HodPass@123',
      },
    });
    assert(r.status === 201, `create HOD -> ${r.status}: ${JSON.stringify(r.body)}`);
    const row = r.body.data;
    assert(row.full_name === 'Dr HodMgmt Cse Head', `full_name ${row.full_name}`);
    assert(row.email === 'hodmgmt.cse@ksrce.test', `email ${row.email}`);
    assert(row.department_id === String(cse._id), `department_id ${row.department_id}`);
    assert(row.department_code === 'CSE', `department_code ${row.department_code}`);
    assert(row.is_active === 1, `is_active ${row.is_active}`);
    assert(row.username, 'no username was derived');
    cseHodId = row.id;
    cseHodUsername = row.username;

    const dbUser: any = await User.findById(cseHodId);
    assert(dbUser, 'created HOD user not persisted');
    assert(dbUser.role === 'HOD', `role is ${dbUser.role}, expected HOD`);
    assert(String(dbUser.department) === String(cse._id), 'HOD is not linked to the single department');
    return `id=${row.id} username=${row.username} dept=${row.department_code} is_active=${row.is_active}`;
  });

  // ── 2. The account actually works ───────────────────────────────────────
  let cseHodToken = '';
  await check('The new HOD account logs in with the supplied password and carries one departmentId claim', async () => {
    const l = await login(cseHodUsername, 'HodPass@123');
    assert(l.token, `HOD login failed (status ${l.status})`);
    assert(l.user?.role === 'HOD', `token role ${l.user?.role}`);
    assert(l.user?.departmentId === String(cse._id), `departmentId claim ${l.user?.departmentId}`);
    cseHodToken = l.token;
    return `role=${l.user?.role} departmentId=${l.user?.departmentId}`;
  });

  // ── 3. Duplicate department HOD is rejected ─────────────────────────────
  await check('A second HOD for a department that already has one is rejected with 409', async () => {
    const before = await User.countDocuments({ role: 'HOD' });
    const r = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: {
        fullName: 'Dr Duplicate Head',
        email: 'hodmgmt.dup@ksrce.test',
        departmentId: String(cse._id),
      },
    });
    assert(r.status === 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    const after = await User.countDocuments({ role: 'HOD' });
    assert(after === before, 'a duplicate HOD user was persisted anyway');
    return `409 "${r.body.message}"; HOD user count unchanged at ${after}`;
  });

  // ── 4. Validation ───────────────────────────────────────────────────────
  await check('Required fields, email format, password length and unknown department are refused with 400', async () => {
    const cases: [string, any][] = [
      ['missing fullName + departmentId', { email: 'x@ksrce.test' }],
      ['invalid email', { fullName: 'Bad Email', email: 'not-an-email', departmentId: String(cse._id) }],
      ['short password', { fullName: 'Short Pw', email: 'shortpw@ksrce.test', departmentId: String(cse._id), password: 'abc' }],
      ['unknown department', { fullName: 'No Dept', email: 'nodept@ksrce.test', departmentId: 'NOPE' }],
    ];
    const seen: string[] = [];
    for (const [label, body] of cases) {
      const r = await http('POST', '/api/admin/hods', { token: adminToken, body });
      assert(r.status === 400, `${label} -> expected 400, got ${r.status}`);
      seen.push(`${label}=400`);
    }
    return seen.join(', ');
  });

  await check('A duplicate email is refused with 409 even for a different department', async () => {
    const r = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: {
        fullName: 'Dr Email Thief',
        email: 'hodmgmt.cse@ksrce.test',
        departmentId: String(it._id),
      },
    });
    assert(r.status === 409, `expected 409, got ${r.status}`);
    return `409 "${r.body.message}"`;
  });

  // ── 5. Second department gets its own HOD (rule is per department) ──────
  let eceHodId = '';
  let eceHodToken = '';
  let eceSuccessorToken = '';
  await check('A different department can still receive its own HOD', async () => {
    const r = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: {
        fullName: 'Dr HodMgmt Ece Head',
        email: 'hodmgmt.ece@ksrce.test',
        departmentId: String(ece._id),
        password: 'HodPass@123',
      },
    });
    assert(r.status === 201, `create ECE HOD -> ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.data.department_code === 'ECE', `department_code ${r.body.data.department_code}`);
    eceHodId = r.body.data.id;
    const l = await login(r.body.data.username, 'HodPass@123');
    assert(l.token, 'ECE HOD could not log in');
    eceHodToken = l.token;
    return `ECE HOD id=${eceHodId} created and logged in`;
  });

  // ── 6. ADMIN-only authorization ─────────────────────────────────────────
  await check('Every HOD-management endpoint refuses HOD / FACULTY / STUDENT with 403 and anonymous with 401', async () => {
    const probes: [string, string, any?][] = [
      ['GET', '/api/admin/hods'],
      ['POST', '/api/admin/hods', { fullName: 'Sneaky', email: 'sneaky@ksrce.test', departmentId: String(it._id) }],
      ['PUT', `/api/admin/hods/${cseHodId}`, { fullName: 'Sneaky Rename' }],
      ['PATCH', `/api/admin/hods/${cseHodId}/status`, { isActive: false }],
    ];
    const nonAdmins: [string, string][] = [
      [cseHodToken, 'HOD'],
      [cseMentorLogin.token, 'FACULTY'],
      [studentLogin.token, 'STUDENT'],
    ];
    for (const [method, path, body] of probes) {
      for (const [token, label] of nonAdmins) {
        const r = await http(method, path, { token, body });
        assert(r.status === 403, `${label} ${method} ${path} expected 403, got ${r.status}`);
      }
      const anon = await http(method, path, { body });
      assert(anon.status === 401, `anonymous ${method} ${path} expected 401, got ${anon.status}`);
    }
    const adminList = await http('GET', '/api/admin/hods', { token: adminToken });
    assert(adminList.status === 200, `admin GET list -> ${adminList.status}`);
    return `${probes.length} endpoints x 3 roles -> 403, anonymous -> 401, admin list -> 200`;
  });

  await check('A HOD token cannot create another HOD and no account is written', async () => {
    const before = await User.countDocuments({ role: 'HOD' });
    const r = await http('POST', '/api/admin/hods', {
      token: cseHodToken,
      body: { fullName: 'Self Appointed', email: 'selfappointed@ksrce.test', departmentId: String(it._id) },
    });
    assert(r.status === 403, `HOD create expected 403, got ${r.status}`);
    const after = await User.countDocuments({ role: 'HOD' });
    assert(after === before, 'a HOD managed to create an account');
    return `403 and HOD count unchanged (${after})`;
  });

  // ── 7. Edit ─────────────────────────────────────────────────────────────
  await check('Admin can rename a HOD and the list reflects it', async () => {
    const r = await http('PUT', `/api/admin/hods/${cseHodId}`, {
      token: adminToken,
      body: { fullName: 'Dr HodMgmt Cse Head Renamed' },
    });
    assert(r.status === 200, `rename -> ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.data.full_name === 'Dr HodMgmt Cse Head Renamed', `full_name ${r.body.data.full_name}`);
    assert(r.body.data.role === undefined || r.body.data.role === 'HOD', 'role changed on edit');
    const list = await http('GET', '/api/admin/hods', { token: adminToken });
    const row = (list.body.data.hods as any[]).find((h) => h.id === cseHodId);
    assert(row && row.full_name === 'Dr HodMgmt Cse Head Renamed', 'list did not reflect the rename');
    return `renamed to "${row.full_name}", department still ${row.department_code}`;
  });

  await check('Editing a HOD onto a department that already has one is rejected with 409', async () => {
    const r = await http('PUT', `/api/admin/hods/${eceHodId}`, {
      token: adminToken,
      body: { departmentId: String(cse._id) },
    });
    assert(r.status === 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    const still: any = await User.findById(eceHodId);
    assert(toIdString(still.department) === toIdString(ece._id), 'the ECE HOD department changed despite the 409');
    return `409 "${r.body.message}"; ECE HOD still on ECE`;
  });

  await check('Editing a HOD onto an empty department moves it and frees the old one', async () => {
    const r = await http('PUT', `/api/admin/hods/${eceHodId}`, {
      token: adminToken,
      body: { departmentId: String(it._id) },
    });
    assert(r.status === 200, `move ECE HOD to IT -> ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.data.department_code === 'IT', `department_code ${r.body.data.department_code}`);
    // ECE is now free: a successor can be appointed there.
    const r2 = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: { fullName: 'Dr Ece Successor', email: 'hodmgmt.ece2@ksrce.test', departmentId: String(ece._id) },
    });
    assert(r2.status === 201, `ECE successor create -> ${r2.status}: ${JSON.stringify(r2.body)}`);
    const sl = await login(r2.body.data.username, 'Password@123');
    assert(sl.token, 'ECE successor could not log in with the default password');
    eceSuccessorToken = sl.token;
    return `ECE HOD moved to IT, successor appointed to ECE (${r2.body.data.id})`;
  });

  await check('Changing a HOD email onto an existing email is rejected with 409', async () => {
    const r = await http('PUT', `/api/admin/hods/${cseHodId}`, {
      token: adminToken,
      body: { email: 'hodmgmt.ece2@ksrce.test' },
    });
    assert(r.status === 409, `expected 409, got ${r.status}`);
    return `409 "${r.body.message}"`;
  });

  await check('Editing a non-HOD user id through the HOD endpoint is refused with 404', async () => {
    const r = await http('PUT', `/api/admin/hods/${cseMentorUser._id}`, {
      token: adminToken,
      body: { fullName: 'Should Not Work' },
    });
    assert(r.status === 404, `expected 404, got ${r.status}`);
    const r2 = await http('PUT', '/api/admin/hods/not-a-valid-id', { token: adminToken, body: { fullName: 'X' } });
    assert(r2.status === 404, `invalid id expected 404, got ${r2.status}`);
    const after: any = await User.findById(cseMentorUser._id);
    assert(after.fullName === 'HodMgmt Cse Mentor', 'faculty user was modified through the HOD endpoint');
    return '404 for both a faculty user id and a malformed id; faculty record untouched';
  });

  // ── 8. Deactivate ───────────────────────────────────────────────────────
  let hodUserCountBefore = 0;
  let counsellingBefore = 0;
  let studentsBefore = 0;
  await check('Deactivating a HOD flips only isActive — account and records are retained', async () => {
    hodUserCountBefore = await User.countDocuments({ role: 'HOD' });
    counsellingBefore = await CounsellingRecord.countDocuments();
    studentsBefore = await Student.countDocuments();

    const r = await http('PATCH', `/api/admin/hods/${cseHodId}/status`, {
      token: adminToken,
      body: { isActive: false },
    });
    assert(r.status === 200, `deactivate -> ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.data.is_active === 0, `is_active ${r.body.data.is_active}`);

    const dbUser: any = await User.findById(cseHodId);
    assert(dbUser, 'the HOD user was deleted instead of deactivated');
    assert(dbUser.isActive === false, 'isActive was not flipped');
    assert(toIdString(dbUser.department) === toIdString(cse._id), 'department link was dropped on deactivation');

    const hodAfter = await User.countDocuments({ role: 'HOD' });
    assert(hodAfter === hodUserCountBefore, 'HOD user count changed — a record was deleted');
    const counsellingAfter = await CounsellingRecord.countDocuments();
    const studentsAfter = await Student.countDocuments();
    assert(counsellingAfter === counsellingBefore, 'historical counselling records were altered');
    assert(studentsAfter === studentsBefore, 'students were altered');

    const audit = await AuditLog.find({ action: 'DEACTIVATE_HOD' });
    assert(audit.length >= 1, 'no DEACTIVATE_HOD audit entry was written');
    return `isActive=0, users ${hodAfter}, counselling ${counsellingAfter}, students ${studentsAfter}, audit entry present`;
  });

  await check('A deactivated HOD can no longer log in', async () => {
    const l = await login(cseHodUsername, 'HodPass@123');
    assert(!l.token, 'the deactivated HOD still received a token');
    assert(l.status === 403, `expected 403 from login, got ${l.status}`);
    return `login -> 403 "${'account deactivated refusal'}"`;
  });

  await check('Deactivation frees the department for a successor HOD', async () => {
    const r = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: { fullName: 'Dr Cse Successor', email: 'hodmgmt.cse2@ksrce.test', departmentId: String(cse._id) },
    });
    assert(r.status === 201, `successor create -> ${r.status}: ${JSON.stringify(r.body)}`);
    return `successor HOD ${r.body.data.id} appointed to CSE`;
  });

  await check('Reactivating a HOD while the slot is taken is refused with 409', async () => {
    const r = await http('PATCH', `/api/admin/hods/${cseHodId}/status`, {
      token: adminToken,
      body: { isActive: true },
    });
    assert(r.status === 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    const dbUser: any = await User.findById(cseHodId);
    assert(dbUser.isActive === false, 'the HOD was reactivated despite the 409');
    return `409 "${r.body.message}"`;
  });

  await check('Status updates require a boolean and a real HOD id', async () => {
    const r = await http('PATCH', `/api/admin/hods/${cseHodId}/status`, { token: adminToken, body: { isActive: 'yes' } });
    assert(r.status === 400, `non-boolean -> expected 400, got ${r.status}`);
    const r2 = await http('PATCH', '/api/admin/hods/not-a-valid-id/status', { token: adminToken, body: { isActive: false } });
    assert(r2.status === 404, `bad id -> expected 404, got ${r2.status}`);
    const r3 = await http('PATCH', `/api/admin/hods/${cseMentorUser._id}/status`, { token: adminToken, body: { isActive: false } });
    assert(r3.status === 404, `faculty id -> expected 404, got ${r3.status}`);
    const after: any = await User.findById(cseMentorUser._id);
    assert(after.isActive === true, 'faculty account was deactivated through the HOD status endpoint');
    return '400 non-boolean, 404 malformed id, 404 faculty id, faculty still active';
  });

  await check('Reactivation succeeds once the department slot is free again', async () => {
    const successor: any = (await http('GET', '/api/admin/hods', { token: adminToken })).body.data.hods.find(
      (h: any) => h.email === 'hodmgmt.cse2@ksrce.test'
    );
    assert(successor, 'successor HOD not found in list');
    const off = await http('PATCH', `/api/admin/hods/${successor.id}/status`, {
      token: adminToken,
      body: { isActive: false },
    });
    assert(off.status === 200, `successor deactivate -> ${off.status}`);
    const on = await http('PATCH', `/api/admin/hods/${cseHodId}/status`, {
      token: adminToken,
      body: { isActive: true },
    });
    assert(on.status === 200, `reactivate -> ${on.status}: ${JSON.stringify(on.body)}`);
    assert(on.body.data.is_active === 1, `is_active ${on.body.data.is_active}`);
    const l = await login(cseHodUsername, 'HodPass@123');
    assert(l.token, 'reactivated HOD cannot log in');
    cseHodToken = l.token;
    return 'successor deactivated, original HOD reactivated and logged in again';
  });

  // ── 9. HOD department isolation is unaffected ───────────────────────────
  await check('The created HOD dashboard is still scoped to its own department', async () => {
    const cseDash = await http('GET', '/api/hod/dashboard', { token: cseHodToken });
    assert(cseDash.status === 200, `CSE HOD dashboard -> ${cseDash.status}`);
    assert(
      cseDash.body.data.summary.totalStudents === 2,
      `CSE HOD saw ${cseDash.body.data.summary.totalStudents} students, expected 2`
    );

    const eceDash = await http('GET', '/api/hod/dashboard', { token: eceSuccessorToken });
    assert(eceDash.status === 200, `ECE HOD dashboard -> ${eceDash.status}`);
    assert(
      eceDash.body.data.summary.totalStudents === 1,
      `ECE HOD saw ${eceDash.body.data.summary.totalStudents} students, expected 1`
    );
    return 'CSE HOD sees 2 students, ECE HOD sees 1';
  });

  await check('A HOD created through Admin still cannot read across departments', async () => {
    const foreign = await http('GET', `/api/hod/mentor/${eceMentor._id}`, { token: cseHodToken });
    assert(foreign.status === 404, `cross-department mentor read expected 404, got ${foreign.status}`);
    const anon = await http('GET', '/api/hod/dashboard');
    assert(anon.status === 401, `anonymous HOD dashboard -> ${anon.status}`);
    const fac = await http('GET', '/api/hod/dashboard', { token: cseMentorLogin.token });
    assert(fac.status === 403, `FACULTY HOD dashboard -> ${fac.status}`);
    return `foreign ECE mentor -> 404, anonymous -> 401, faculty -> 403`;
  });

  await check('The Admin HOD list reports accurate active / inactive totals', async () => {
    const r = await http('GET', '/api/admin/hods', { token: adminToken });
    assert(r.status === 200, `list -> ${r.status}`);
    const { hods, summary } = r.body.data;
    assert(summary.total === hods.length, 'summary.total does not match the row count');
    const activeRows = hods.filter((h: any) => h.is_active === 1).length;
    assert(summary.active === activeRows, `summary.active ${summary.active} vs rows ${activeRows}`);
    assert(summary.inactive === hods.length - activeRows, 'summary.inactive is wrong');
    assert(hods.every((h: any) => h.department_id && h.department_name), 'a HOD row is missing its department');
    const audit = await AuditLog.find({ action: 'CREATE_HOD' });
    assert(audit.length >= 1, 'no CREATE_HOD audit entry was written');
    return `${hods.length} HODs (${summary.active} active / ${summary.inactive} inactive), every row carries a department, CREATE_HOD audited`;
  });

  // ── REPORT ──────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== ADMIN HOD MANAGEMENT VERIFICATION ==========\n');
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
