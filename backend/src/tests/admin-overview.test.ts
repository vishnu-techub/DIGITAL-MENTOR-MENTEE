/**
 * ADMIN COLLEGE-WIDE MENTORING DASHBOARD VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives every `/api/admin/overview/*` route over HTTP exactly as the
 * Admin dashboard does.
 *
 * Two departments plus a third empty one are seeded with students, faculty,
 * mentor assignments and dated mentoring records on purpose, so the following
 * are PROVABLE rather than assumed:
 *   - every college figure is the sum of the real departments, not a constant
 *   - a student mentored several times this month is counted ONCE
 *   - the college total agrees with each department's own HOD-scoped figure
 *   - the empty department reports 0 / 0%, never a placeholder or NaN
 *   - HOD / FACULTY / STUDENT / anonymous are all refused with 403 / 401
 *   - the reference endpoints stay readable by every role while the Admin
 *     lists they replaced are ADMIN-only
 *   - no GPS / location field appears anywhere in the Admin mentoring surface
 *
 * Run: npm run test:admin
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('admin-overview-verify');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5098;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-overview-secret-do-not-use-in-prod';
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

/** YYYY-MM-DD for `offset` days from today, so "this month" stays real. */
function dayOffset(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Student, Faculty, Department, Batch, MentorAssignment, CounsellingRecord, Meeting } =
    await import('../models/index.js');

  const hash = bcrypt.hashSync('Mentor@123', 10);

  // Admin token
  const adminLogin = await http('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'Admin@12345' },
  });
  const adminToken = adminLogin.body?.data?.token || adminLogin.body?.token;
  assert(adminToken, 'admin could not log in');

  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  assert(cse && ece, 'bootstrap did not create the expected reference data');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'bootstrap did not create a batch');

  // ── SEED ──────────────────────────────────────────────────────────────────
  async function makeHod(dept: any, suffix: string) {
    const user: any = await User.create({
      username: `admin.hod.${suffix}`, passwordHash: hash, role: 'HOD',
      email: `admin.hod.${suffix}@ksrce.test`, fullName: `Dr Adm Hod ${suffix.toUpperCase()}`,
      department: dept._id, isActive: true,
    });
    const login = await http('POST', '/api/auth/login', {
      body: { username: `admin.hod.${suffix}`, password: 'Mentor@123' },
    });
    const token = login.body?.data?.token || login.body?.token;
    assert(token, `${suffix} HOD could not log in`);
    return { user, token, deptId: String(dept._id) };
  }

  async function makeMentor(dept: any, empId: string, name: string) {
    const user: any = await User.create({
      username: `adm.fac.${empId.toLowerCase()}`, passwordHash: hash, role: 'FACULTY',
      email: `adm.fac.${empId.toLowerCase()}@ksrce.test`, fullName: name,
      department: dept._id, isActive: true,
    });
    const faculty: any = await Faculty.create({
      user: user._id, employeeId: empId, department: dept._id,
      designation: 'Professor', cabinLocation: 'A-1', isActive: true,
    } as any);
    const login = await http('POST', '/api/auth/login', {
      body: { username: `adm.fac.${empId.toLowerCase()}`, password: 'Mentor@123' },
    });
    const token = login.body?.data?.token || login.body?.token;
    assert(token, `${empId} faculty could not log in`);
    return { user, faculty, token, id: String(faculty._id) };
  }

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
    const login = await http('POST', '/api/auth/login', {
      body: { username: reg.toLowerCase(), password: 'Mentor@123' },
    });
    const token = login.body?.data?.token || login.body?.token;
    assert(token, `${reg} could not log in`);
    return { user, student, token, id: String(student._id) };
  }

  const hodCse = await makeHod(cse, 'cse');
  const hodEce = await makeHod(ece, 'ece');

  const cseMentorA = await makeMentor(cse, 'ADMCSE1', 'Dr Adm Cse A');
  const cseMentorB = await makeMentor(cse, 'ADMCSE2', 'Dr Adm Cse B');
  const eceMentor = await makeMentor(ece, 'ADMECE1', 'Dr Adm Ece');

  // CSE: 3 students (2 under A, 1 under B). ECE: 2 students (both under E).
  const cseS1 = await makeStudent(cse, 'ADMCSE001', 'Adm Cse Student One');
  const cseS2 = await makeStudent(cse, 'ADMCSE002', 'Adm Cse Student Two');
  const cseS3 = await makeStudent(cse, 'ADMCSE003', 'Adm Cse Student Three');
  const eceS1 = await makeStudent(ece, 'ADMECE001', 'Adm Ece Student One');
  const eceS2 = await makeStudent(ece, 'ADMECE002', 'Adm Ece Student Two');

  for (const [s, m] of [[cseS1, cseMentorA], [cseS2, cseMentorA], [cseS3, cseMentorB]] as const) {
    await MentorAssignment.create({
      student: s.student._id, mentor: m.faculty._id, department: cse._id,
      assignedFrom: dayOffset(-120), status: 'ACTIVE', assignedBy: hodCse.user._id,
      changeReason: 'Seed',
    } as any);
  }
  for (const s of [eceS1, eceS2]) {
    await MentorAssignment.create({
      student: s.student._id, mentor: eceMentor.faculty._id, department: ece._id,
      assignedFrom: dayOffset(-120), status: 'ACTIVE', assignedBy: hodEce.user._id,
      changeReason: 'Seed',
    } as any);
  }

  // This month: CSE student 1 twice (must count ONCE), CSE student 2 once via a
  // meeting, ECE student 1 once. ECE student 2 and CSE student 3 stay pending.
  await CounsellingRecord.create({
    student: cseS1.student._id, mentor: cseMentorA.faculty._id,
    sessionDate: dayOffset(-2), date: dayOffset(-2), categories: ['Academic Development'],
    discussionWith: ['student'], challengeObserved: 'Needs focus', correctiveAction: 'Study plan',
  } as any);
  await CounsellingRecord.create({
    student: cseS1.student._id, mentor: cseMentorA.faculty._id,
    sessionDate: dayOffset(-1), date: dayOffset(-1), categories: ['Skill Development'],
    discussionWith: ['student'], challengeObserved: 'Confidence', correctiveAction: 'Group work',
  } as any);
  await Meeting.create({
    student: cseS2.student._id, mentor: cseMentorA.faculty._id,
    meetingDate: dayOffset(-3), meetingTime: '10:30 AM', location: 'Cabin',
    attendanceStatus: 'PRESENT', meetingStatus: 'COMPLETED',
    challengesDiscussed: 'Time management', correctiveAction: 'Weekly plan',
  } as any);
  await CounsellingRecord.create({
    student: eceS1.student._id, mentor: eceMentor.faculty._id,
    sessionDate: dayOffset(-4), date: dayOffset(-4), categories: ['Career Development'],
    discussionWith: ['student'], challengeObserved: 'Internships', correctiveAction: 'Apply early',
  } as any);
  // An older CSE record, outside this month, so the month filter is provable.
  await CounsellingRecord.create({
    student: cseS3.student._id, mentor: cseMentorB.faculty._id,
    sessionDate: dayOffset(-70), date: dayOffset(-70), categories: ['Skill Development'],
    discussionWith: ['student'], challengeObserved: 'Communication', correctiveAction: 'Group work',
  } as any);

  // A third department with a HOD but no students at all.
  const zero: any = await Department.create({ code: 'ZZZ', name: 'Zero Department' } as any);
  const hodZero = await makeHod(zero, 'zero');

  // Expected college figures, derived by hand from the seed above:
  //   students 5 | faculty 3 | mentors 3 | mentored this month 3
  //   pending 2 | coverage 60% | sessions (all time) 5
  const EXPECTED = {
    totalStudents: 5,
    totalFaculty: 3,
    totalMentors: 3,
    mentoredThisMonth: 3,
    pending: 2,
    coverage: 60,
    sessions: 5,
  };

  // ── 1. College-wide totals ────────────────────────────────────────────────
  await check('Overall dashboard reports real college-wide totals', async () => {
    const r = await http('GET', '/api/admin/overview/dashboard', { token: adminToken });
    assert(r.status === 200, `GET /api/admin/overview/dashboard -> ${r.status}`);
    const s = r.body.data.summary;
    assert(s.totalStudents === EXPECTED.totalStudents, `students ${s.totalStudents}, expected ${EXPECTED.totalStudents}`);
    assert(s.totalFaculty === EXPECTED.totalFaculty, `faculty ${s.totalFaculty}, expected ${EXPECTED.totalFaculty}`);
    assert(s.totalMentors === EXPECTED.totalMentors, `mentors ${s.totalMentors}, expected ${EXPECTED.totalMentors}`);
    assert(s.mentoredThisMonth === EXPECTED.mentoredThisMonth, `mentored ${s.mentoredThisMonth}, expected ${EXPECTED.mentoredThisMonth}`);
    assert(s.pendingStudents === EXPECTED.pending, `pending ${s.pendingStudents}, expected ${EXPECTED.pending}`);
    assert(s.overallMentoringCoverage === EXPECTED.coverage, `coverage ${s.overallMentoringCoverage}, expected ${EXPECTED.coverage}`);
    assert(s.totalMentoringSessions === EXPECTED.sessions, `sessions ${s.totalMentoringSessions}, expected ${EXPECTED.sessions}`);
    assert(s.totalHODs === 3, `HODs ${s.totalHODs}, expected 3`);
    // The bootstrap ships departments that deliberately have no HOD. Those must
    // be reported honestly rather than hidden, so the count is derived: exactly
    // the three departments we created a HOD for have one.
    assert(s.departmentsWithHod === 3, `departmentsWithHod ${s.departmentsWithHod}, expected 3`);
    assert(
      s.departmentsWithoutHod === s.totalDepartments - 3,
      `departmentsWithoutHod ${s.departmentsWithoutHod} is inconsistent with ${s.totalDepartments} departments`
    );
    return `${s.totalStudents} students / ${s.totalFaculty} faculty / ${s.totalMentors} mentors / ${s.mentoredThisMonth} mentored / ${s.pendingStudents} pending / ${s.overallMentoringCoverage}% / ${s.totalMentoringSessions} sessions across ${s.totalDepartments} departments`;
  });

  await check('A student mentored several times this month is counted once', async () => {
    const r = await http('GET', '/api/admin/overview/dashboard', { token: adminToken });
    const d = r.body.data;
    const s = d.summary;
    // cseS1 has TWO counselling records this month but must contribute 1.
    assert(s.mentoredThisMonth === 3, `mentored ${s.mentoredThisMonth}, expected 3 (not 4)`);
    assert(s.mentoredThisMonth + s.pendingStudents === s.totalStudents, 'mentored + pending did not equal the student total');
    assert(d.coverage.percentage === s.overallMentoringCoverage, 'coverage.percentage disagreed with summary.overallMentoringCoverage');
    assert(d.coverage.mentored === s.mentoredThisMonth, 'coverage.mentored disagreed with the summary');
    assert(d.coverage.pending === s.pendingStudents, 'coverage.pending disagreed with the summary');
    assert(d.pie.mentored === d.coverage.mentored && d.pie.pending === d.coverage.pending, 'the pie and the coverage block disagree');
    return `student 1 has 2 dated records this month and is counted once; mentored ${s.mentoredThisMonth} + pending ${s.pendingStudents} = ${s.totalStudents}, and the pie, coverage block and summary all agree`;
  });

  // ── 2. College-wide PIE ────────────────────────────────────────────────────
  await check('College-wide PIE splits Mentored vs Pending for the month', async () => {
    const r = await http('GET', '/api/admin/overview/dashboard', { token: adminToken });
    const pie = r.body.data.pie;
    assert(pie, 'dashboard carried no pie series');
    assert(pie.mentored === 3, `pie.mentored ${pie.mentored}, expected 3`);
    assert(pie.pending === 2, `pie.pending ${pie.pending}, expected 2`);
    assert(pie.total === 5, `pie.total ${pie.total}, expected 5`);
    assert(pie.mentored + pie.pending === pie.total, 'pie slices did not sum to the total');
    assert(/^\d{4}-\d{2}$/.test(pie.month), `pie.month "${pie.month}" is not YYYY-MM`);
    return `month ${pie.month}: mentored ${pie.mentored}, pending ${pie.pending}, total ${pie.total}`;
  });

  // ── 3. HOD overview ───────────────────────────────────────────────────────
  await check('HOD overview lists every HOD with that HOD department figures', async () => {
    const r = await http('GET', '/api/admin/overview/hods', { token: adminToken });
    assert(r.status === 200, `GET /api/admin/overview/hods -> ${r.status}`);
    const list = r.body.data.hods as any[];
    assert(list.length === 3, `HOD overview returned ${list.length} rows, expected 3`);
    const cseRow = list.find((h) => h.departmentCode === 'CSE');
    const eceRow = list.find((h) => h.departmentCode === 'ECE');
    const zeroRow = list.find((h) => h.departmentCode === 'ZZZ');
    assert(cseRow && eceRow && zeroRow, 'a seeded HOD department is missing from the overview');
    assert(cseRow.students === 3, `CSE HOD row students ${cseRow.students}, expected 3`);
    assert(cseRow.mentoredThisMonth === 2, `CSE HOD row mentored ${cseRow.mentoredThisMonth}, expected 2`);
    assert(cseRow.mentoringCoverage === 67, `CSE HOD row coverage ${cseRow.mentoringCoverage}, expected 67`);
    assert(eceRow.students === 2, `ECE HOD row students ${eceRow.students}, expected 2`);
    assert(zeroRow.students === 0, `empty-department HOD row students ${zeroRow.students}, expected 0`);
    return `CSE 3 students/67%, ECE 2 students/50%, empty department 0 students/0% — no cross-department bleed`;
  });

  // ── 4. Department overview ────────────────────────────────────────────────
  await check('Department overview reports one row per department', async () => {
    const r = await http('GET', '/api/admin/overview/departments', { token: adminToken });
    assert(r.status === 200, `GET /api/admin/overview/departments -> ${r.status}`);
    const list = r.body.data.departments as any[];
    const cseRow = list.find((d) => d.departmentCode === 'CSE');
    const eceRow = list.find((d) => d.departmentCode === 'ECE');
    const zeroRow = list.find((d) => d.departmentCode === 'ZZZ');
    assert(cseRow && eceRow && zeroRow, 'a seeded department is missing from the overview');
    assert(cseRow.students === 3 && cseRow.faculty === 2 && cseRow.mentors === 2, 'CSE counts are wrong');
    assert(cseRow.mentoringCoverage === 67, `CSE coverage ${cseRow.mentoringCoverage}, expected 67`);
    assert(cseRow.hodCount === 1 && cseRow.hodNames[0] === hodCse.user.fullName, 'CSE row did not carry its own HOD');
    assert(eceRow.students === 2 && eceRow.mentors === 1, 'ECE counts are wrong');
    assert(zeroRow.students === 0 && zeroRow.mentoringCoverage === 0, 'the empty department did not report 0 / 0%');
    assert(zeroRow.hodCount === 1, 'the empty department lost its HOD');
    return `CSE 3 students/2 mentors/67%, ECE 2 students/1 mentor, empty department 0 students/0%`;
  });

  await check('Department rows sum to the college-wide totals', async () => {
    const [dash, dept] = await Promise.all([
      http('GET', '/api/admin/overview/dashboard', { token: adminToken }),
      http('GET', '/api/admin/overview/departments', { token: adminToken }),
    ]);
    const rows = dept.body.data.departments as any[];
    const sum = (k: string) => rows.reduce((n, d) => n + (d[k] || 0), 0);
    const s = dash.body.data.summary;
    assert(sum('students') === s.totalStudents, `department students ${sum('students')} != college ${s.totalStudents}`);
    assert(sum('faculty') === s.totalFaculty, `department faculty ${sum('faculty')} != college ${s.totalFaculty}`);
    assert(sum('mentors') === s.totalMentors, `department mentors ${sum('mentors')} != college ${s.totalMentors}`);
    assert(sum('pendingStudents') === s.pendingStudents, `department pending ${sum('pendingStudents')} != college ${s.pendingStudents}`);
    assert(sum('totalMentoringSessions') === s.totalMentoringSessions, 'department sessions != college sessions');
    return `students ${sum('students')}, faculty ${sum('faculty')}, mentors ${sum('mentors')}, pending ${sum('pendingStudents')}, sessions ${sum('totalMentoringSessions')} — all match the college totals`;
  });

  // ── 5. College figure agrees with the department-scoped HOD figure ────────
  await check('The college figure agrees with each department own HOD view', async () => {
    const [cseAdmin, eceAdmin, cseHod, eceHod] = await Promise.all([
      http('GET', '/api/admin/overview/departments', { token: adminToken }),
      http('GET', '/api/admin/overview/departments', { token: adminToken }),
      http('GET', '/api/hod/dashboard', { token: hodCse.token }),
      http('GET', '/api/hod/dashboard', { token: hodEce.token }),
    ]);
    const deptList = cseAdmin.body.data.departments as any[];
    const cseRow = deptList.find((d) => d.departmentCode === 'CSE')!;
    const eceRow = deptList.find((d) => d.departmentCode === 'ECE')!;
    const cseH = cseHod.body.data.summary;
    const eceH = eceHod.body.data.summary;

    assert(cseRow.students === cseH.totalStudents, 'CSE student count differs between Admin and HOD');
    assert(cseRow.mentoringCoverage === cseH.overallMentoringCoverage, `CSE coverage Admin ${cseRow.mentoringCoverage} vs HOD ${cseH.overallMentoringCoverage}`);
    assert(cseRow.mentoredThisMonth === cseH.mentoredThisMonth, 'CSE mentored-this-month differs between Admin and HOD');
    assert(cseRow.totalMentoringSessions === cseH.totalMentoringSessions, 'CSE session count differs between Admin and HOD');
    assert(eceRow.students === eceH.totalStudents, 'ECE student count differs between Admin and HOD');
    assert(eceRow.mentoringCoverage === eceH.overallMentoringCoverage, 'ECE coverage differs between Admin and HOD');
    assert(eceAdmin.status === 200, 'ECE comparison read failed');
    return `CSE ${cseRow.students} students/${cseRow.mentoringCoverage}% and ECE ${eceRow.students} students/${eceRow.mentoringCoverage}% are identical in both portals — the shared arithmetic holds`;
  });

  // ── 6. Department comparison ──────────────────────────────────────────────
  await check('Department comparison ranks by coverage, highest first', async () => {
    const r = await http('GET', '/api/admin/overview/department-comparison', { token: adminToken });
    assert(r.status === 200, `GET /api/admin/overview/department-comparison -> ${r.status}`);
    const list = r.body.data.departments as any[];
    const withStudents = list.filter((d) => d.students > 0);
    for (let i = 1; i < withStudents.length; i++) {
      assert(
        withStudents[i - 1].coveragePercent >= withStudents[i].coveragePercent,
        'comparison rows are not sorted by descending coverage'
      );
    }
    const cseRow = list.find((d) => d.departmentCode === 'CSE');
    assert(cseRow.coveragePercent === 67, `CSE comparison coverage ${cseRow.coveragePercent}, expected 67`);
    assert(cseRow.mentored === 2 && cseRow.pending === 1, 'CSE mentored/pending split is wrong');
    assert(r.body.data.highestCoveragePercent === 67, `highestCoveragePercent ${r.body.data.highestCoveragePercent}, expected 67`);
    return `CSE 67% ranked above ECE 50%; highest reported as ${r.body.data.highestCoveragePercent}%`;
  });

  // ── 7. Drill-down: Department -> HOD -> Mentor ───────────────────────────
  await check('Department drill-down returns that department HODs and mentors', async () => {
    const r = await http('GET', `/api/admin/overview/departments/${cse._id}`, { token: adminToken });
    assert(r.status === 200, `GET department detail -> ${r.status}`);
    const d = r.body.data;
    assert(d.department.departmentCode === 'CSE', `drill-down returned ${d.department.departmentCode}`);
    assert(d.summary.totalStudents === 3, `department detail students ${d.summary.totalStudents}, expected 3`);
    assert(d.summary.overallMentoringCoverage === 67, `department detail coverage ${d.summary.overallMentoringCoverage}, expected 67`);
    assert(d.pie.mentored === 2 && d.pie.pending === 1, 'department detail pie is wrong');
    assert(d.hods.length === 1 && d.hods[0].hodName === hodCse.user.fullName, 'department detail did not carry its own HOD');
    assert(d.mentors.length === 2, `department detail returned ${d.mentors.length} mentors, expected 2`);
    for (const m of d.mentors) assert(m.department === cse.name, `mentor row claims department ${m.department}`);
    return `CSE detail: ${d.summary.totalStudents} students/67%, HOD ${d.hods[0].hodName}, ${d.mentors.length} mentors all scoped to CSE`;
  });

  await check('Department drill-down does not leak another department mentors', async () => {
    const r = await http('GET', `/api/admin/overview/departments/${cse._id}`, { token: adminToken });
    const ids = (r.body.data.mentors as any[]).map((m) => m.mentorId);
    assert(!ids.includes(eceMentor.id), 'the ECE mentor appeared in the CSE department detail');
    const eceRes = await http('GET', `/api/admin/overview/departments/${ece._id}`, { token: adminToken });
    const eceIds = (eceRes.body.data.mentors as any[]).map((m) => m.mentorId);
    assert(!eceIds.includes(cseMentorA.id), 'a CSE mentor appeared in the ECE department detail');
    return `CSE detail carries only ${ids.length} CSE mentors, ECE detail only ${eceIds.length} ECE mentor`;
  });

  await check('Department drill-down 404s an unknown department id', async () => {
    const r = await http('GET', '/api/admin/overview/departments/000000000000000000000000', { token: adminToken });
    assert(r.status === 404, `unknown department expected 404, got ${r.status}`);
    return `unknown department id -> ${r.status}`;
  });

  // ── 8. Drill-down: Mentor -> Student ──────────────────────────────────────
  await check('Mentor drill-down returns mentees with real mentoring state', async () => {
    const r = await http('GET', `/api/admin/overview/mentors/${cseMentorA.id}`, { token: adminToken });
    assert(r.status === 200, `GET mentor detail -> ${r.status}`);
    const d = r.body.data;
    assert(d.mentor.fullName === 'Dr Adm Cse A', `unexpected mentor ${d.mentor.fullName}`);
    assert(d.mentor.departmentName === cse.name, 'mentor detail reported the wrong department');
    assert(d.mentees.length === 2, `mentor detail returned ${d.mentees.length} mentees, expected 2`);
    assert(d.summary.totalMentees === 2, `summary totalMentees ${d.summary.totalMentees}, expected 2`);
    assert(d.summary.mentoredThisMonth === 2, `summary mentoredThisMonth ${d.summary.mentoredThisMonth}, expected 2`);
    assert(d.summary.sessionCount === 3, `summary sessionCount ${d.summary.sessionCount}, expected 3`);
    assert(d.summary.coveragePercent === 100, `summary coverage ${d.summary.coveragePercent}, expected 100`);
    const s1 = d.mentees.find((m: any) => m.id === cseS1.id);
    const s2 = d.mentees.find((m: any) => m.id === cseS2.id);
    assert(s1 && s2, 'a seeded mentee is missing from the mentor detail');
    assert(s1.sessionCount === 2, `student 1 sessionCount ${s1.sessionCount}, expected 2`);
    assert(s1.mentoredThisMonth === true, 'student 1 should be marked mentored this month');
    assert(s2.lastMentoringDate === dayOffset(-3), `student 2 last mentoring ${s2.lastMentoringDate}, expected ${dayOffset(-3)}`);
    return `2 mentees, student 1 has 2 dated sessions and is marked mentored, student 2 last mentored ${dayOffset(-3)}`;
  });

  await check('Mentor with a pending mentee reports the pending figure', async () => {
    const r = await http('GET', `/api/admin/overview/mentors/${cseMentorB.id}`, { token: adminToken });
    assert(r.status === 200, `GET mentor B detail -> ${r.status}`);
    const d = r.body.data;
    assert(d.mentees.length === 1, `mentor B mentees ${d.mentees.length}, expected 1`);
    assert(d.summary.mentoredThisMonth === 0, `mentor B mentoredThisMonth ${d.summary.mentoredThisMonth}, expected 0`);
    assert(d.summary.pending === 1, `mentor B pending ${d.summary.pending}, expected 1`);
    assert(d.summary.coveragePercent === 0, `mentor B coverage ${d.summary.coveragePercent}, expected 0`);
    assert(d.mentees[0].lastMentoringDate === dayOffset(-70), 'mentor B mentee should still show its older 70-day record');
    return `mentor B 0/1 mentored this month, 100% pending, but the 70-day-old record is still visible`;
  });

  await check('Mentor drill-down 404s an unknown faculty id', async () => {
    const r = await http('GET', '/api/admin/overview/mentors/000000000000000000000000', { token: adminToken });
    assert(r.status === 404, `unknown mentor expected 404, got ${r.status}`);
    return `unknown faculty id -> ${r.status}`;
  });

  // ── 9. Weekly progress ───────────────────────────────────────────────────
  await check('College weekly progress returns one bucket per week with real counts', async () => {
    const r = await http('GET', '/api/admin/overview/dashboard', { token: adminToken });
    const weeks = r.body.data.weeklyProgress as any[];
    assert(weeks.length === 8, `weeklyProgress returned ${weeks.length} buckets, expected 8`);
    for (const w of weeks) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(w.weekStart), `bad weekStart ${w.weekStart}`);
      assert(typeof w.sessions === 'number', `week ${w.weekStart} carried no session count`);
    }
    const total = weeks.reduce((n, w) => n + w.sessions, 0);
    // The four in-window records: 2 for CSE student 1, 1 meeting, 1 ECE. The
    // 70-day-old record must fall outside all 8 buckets.
    assert(total === 4, `the 8 buckets counted ${total} sessions, expected the 4 in-window records`);
    assert(weeks[0].weekStart < weeks[7].weekStart, 'buckets are not oldest-first');
    return `8 buckets, ${total} sessions total, oldest first; the 70-day-old record is excluded`;
  });

  // ── 10. Department-wise 30-day report ─────────────────────────────────────
  await check('30-day report totals and per-department breakdown are real', async () => {
    const r = await http('GET', '/api/admin/overview/report-30-day', { token: adminToken });
    assert(r.status === 200, `GET report-30-day -> ${r.status}`);
    const d = r.body.data;
    assert(d.from <= d.to, `report window ${d.from}..${d.to} is inverted`);
    assert(d.totals.totalStudents === 5, `report totalStudents ${d.totals.totalStudents}, expected 5`);
    assert(d.totals.mentoringSessions === 4, `report sessions ${d.totals.mentoringSessions}, expected 4`);
    assert(d.totals.coveredStudents === 3, `report coveredStudents ${d.totals.coveredStudents}, expected 3`);
    assert(d.totals.pendingStudents === 2, `report pending ${d.totals.pendingStudents}, expected 2`);
    assert(d.totals.coveragePercent === 60, `report coverage ${d.totals.coveragePercent}, expected 60`);
    const cseRow = d.departments.find((x: any) => x.departmentCode === 'CSE');
    const eceRow = d.departments.find((x: any) => x.departmentCode === 'ECE');
    const zeroRow = d.departments.find((x: any) => x.departmentCode === 'ZZZ');
    assert(cseRow && eceRow && zeroRow, 'a seeded department is missing from the report');
    assert(cseRow.mentoringSessions === 3, `CSE report sessions ${cseRow.mentoringSessions}, expected 3`);
    assert(cseRow.coveredStudents === 2, `CSE report covered ${cseRow.coveredStudents}, expected 2`);
    assert(cseRow.pendingStudents === 1, `CSE report pending ${cseRow.pendingStudents}, expected 1`);
    assert(cseRow.weekly.length === d.weeks, 'department weekly buckets did not match the requested range');
    assert(eceRow.mentoringSessions === 1, `ECE report sessions ${eceRow.mentoringSessions}, expected 1`);
    assert(zeroRow.mentoringSessions === 0 && zeroRow.totalStudents === 0, 'the empty department reported sessions or students');
    assert(zeroRow.coveragePercent === 0, 'the empty department reported a non-zero coverage');
    return `${d.from}..${d.to}: ${d.totals.mentoringSessions} sessions, ${d.totals.coveredStudents}/${d.totals.totalStudents} students (${d.totals.coveragePercent}%); CSE ${cseRow.mentoringSessions}, ECE ${eceRow.mentoringSessions}, empty 0`;
  });

  await check('30-day report caps the weekly range and rejects nonsense input', async () => {
    for (const [q, expectWeeks] of [['?weeks=4', 4], ['?weeks=12', 12], ['?weeks=999', 5], ['?weeks=0', 5], ['', 5]] as const) {
      const r = await http('GET', `/api/admin/overview/report-30-day${q}`, { token: adminToken });
      assert(r.status === 200, `report${q} -> ${r.status}`);
      assert(r.body.data.weeks === expectWeeks, `report${q} weeks ${r.body.data.weeks}, expected ${expectWeeks}`);
      assert(r.body.data.weekly.length === expectWeeks, `report${q} weekly length ${r.body.data.weekly.length}, expected ${expectWeeks}`);
    }
    return 'weeks=4/12 honoured, weeks=999/0/absent fall back to 5 buckets';
  });

  // ── 11. Empty institution guard ──────────────────────────────────────────
  await check('An empty department reports zeros rather than placeholder figures', async () => {
    const r = await http('GET', `/api/admin/overview/departments/${zero._id}`, { token: adminToken });
    assert(r.status === 200, `empty department detail -> ${r.status}`);
    const d = r.body.data;
    assert(d.summary.totalStudents === 0, 'empty department reported students');
    assert(d.summary.overallMentoringCoverage === 0, 'empty department reported a non-zero coverage');
    assert(d.pie.total === 0 && d.pie.mentored === 0 && d.pie.pending === 0, 'empty department reported a non-zero pie');
    assert(Number.isFinite(d.summary.overallMentoringCoverage), 'empty department produced NaN coverage');
    assert(d.mentors.length === 0, 'empty department reported mentors');
    // Second identical read must agree — proves the figures are data, not constants.
    const again = await http('GET', `/api/admin/overview/departments/${zero._id}`, { token: adminToken });
    assert(JSON.stringify(again.body.data.summary) === JSON.stringify(d.summary), 'two reads of the same department disagreed');
    // The empty department still contributes its HOD to the college HOD overview.
    const hods = await http('GET', '/api/admin/overview/hods', { token: adminToken });
    const zeroHod = (hods.body.data.hods as any[]).find((h) => h.departmentCode === 'ZZZ');
    assert(zeroHod, 'the empty department lost its HOD row');
    return `empty department: 0 students / 0% coverage / pie 0 / 0 mentors, reads agree, and its HOD row survives (${zeroHod.hodName})`;
  });

  // ── 12. SECURITY: the whole surface is ADMIN-only ────────────────────────
  await check('Every Admin mentoring endpoint refuses non-admin roles server-side', async () => {
    const paths = [
      '/api/admin/overview/dashboard',
      '/api/admin/overview/hods',
      '/api/admin/overview/departments',
      '/api/admin/overview/department-comparison',
      `/api/admin/overview/departments/${cse._id}`,
      `/api/admin/overview/departments/${cse._id}/mentors`,
      `/api/admin/overview/mentors/${cseMentorA.id}`,
      '/api/admin/overview/report-30-day',
    ];
    const nonAdmins: [string, string][] = [
      [hodCse.token, 'HOD'],
      [cseMentorA.token, 'FACULTY'],
      [cseS1.token, 'STUDENT'],
    ];
    for (const p of paths) {
      for (const [token, label] of nonAdmins) {
        const r = await http('GET', p, { token });
        assert(r.status === 403, `${label} GET ${p} expected 403, got ${r.status}`);
      }
      const anon = await http('GET', p);
      assert(anon.status === 401, `anonymous GET ${p} expected 401, got ${anon.status}`);
      const ok = await http('GET', p, { token: adminToken });
      assert(ok.status === 200, `admin GET ${p} expected 200, got ${ok.status}`);
    }
    return `${paths.length} endpoints: HOD/FACULTY/STUDENT -> 403, anonymous -> 401, admin -> 200`;
  });

  await check('Reference dropdowns stay open to every role while the Admin lists stay locked', async () => {
    for (const [token, label] of [[cseS1.token, 'STUDENT'], [cseMentorA.token, 'FACULTY'], [hodCse.token, 'HOD'], [adminToken, 'ADMIN']] as const) {
      const d = await http('GET', '/api/reference/departments', { token });
      const b = await http('GET', '/api/reference/batches', { token });
      assert(d.status === 200, `${label} /api/reference/departments -> ${d.status}`);
      assert(b.status === 200, `${label} /api/reference/batches -> ${b.status}`);
    }
    const anon = await http('GET', '/api/reference/departments');
    assert(anon.status === 401, `anonymous /api/reference/departments expected 401, got ${anon.status}`);

    for (const ep of ['/api/admin/departments', '/api/admin/batches', '/api/admin/settings']) {
      for (const [token, label] of [[cseS1.token, 'STUDENT'], [cseMentorA.token, 'FACULTY'], [hodCse.token, 'HOD']] as const) {
        const r = await http('GET', ep, { token });
        assert(r.status === 403, `${label} GET ${ep} expected 403, got ${r.status}`);
      }
      const ok = await http('GET', ep, { token: adminToken });
      assert(ok.status === 200, `admin GET ${ep} expected 200, got ${ok.status}`);
    }
    return '/api/reference/* -> 200 for student/faculty/HOD/admin and 401 anonymous; /api/admin/{departments,batches,settings} -> 403 for the three non-admin roles and 200 for admin';
  });

  // ── 13. HOD isolation is unaffected ──────────────────────────────────────
  await check('The department-scoped HOD API still refuses cross-department reads', async () => {
    const r = await http('GET', `/api/hod/mentor/${eceMentor.id}`, { token: hodCse.token });
    assert(r.status === 404, `CSE HOD reading an ECE mentor expected 404, got ${r.status}`);
    const anon = await http('GET', '/api/hod/dashboard');
    assert(anon.status === 401, `anonymous HOD dashboard expected 401, got ${anon.status}`);
    const fac = await http('GET', '/api/hod/dashboard', { token: cseMentorA.token });
    assert(fac.status === 403, `FACULTY HOD dashboard expected 403, got ${fac.status}`);
    const cseHod = await http('GET', '/api/hod/dashboard', { token: hodCse.token });
    assert(cseHod.body.data.summary.totalStudents === 3, `CSE HOD totalStudents ${cseHod.body.data.summary.totalStudents}, expected 3 — adding the Admin module must not widen HOD scope`);
    return 'CSE HOD still sees 3 students only, an ECE mentor id is still 404, anonymous 401, faculty 403';
  });

  // ── 14. No location data in the Admin mentoring surface ──────────────────
  await check('Admin mentoring responses carry no GPS / location tracking fields', async () => {
    const paths = [
      '/api/admin/overview/dashboard',
      '/api/admin/overview/hods',
      '/api/admin/overview/departments',
      '/api/admin/overview/department-comparison',
      `/api/admin/overview/departments/${cse._id}`,
      `/api/admin/overview/departments/${cse._id}/mentors`,
      `/api/admin/overview/mentors/${cseMentorA.id}`,
      '/api/admin/overview/report-30-day',
    ];
    const needles = ['latitude', 'longitude', 'geotag', 'locationStatus', 'accuracy', 'deviceGeotag'];
    for (const p of paths) {
      const r = await http('GET', p, { token: adminToken });
      assert(r.status === 200, `${p} -> ${r.status}`);
      const text = JSON.stringify(r.body);
      for (const needle of needles) assert(!text.includes(needle), `${p} leaked "${needle}"`);
    }
    return `${paths.length} Admin mentoring responses scanned, 0 of ${needles.length} location fields present`;
  });

  // ── 15. Metric definitions travel with the data ─────────────────────────
  await check('The API ships the metric definitions so the UI never re-derives them', async () => {
    const r = await http('GET', '/api/admin/overview/dashboard', { token: adminToken });
    const defs = r.body.data.definitions;
    assert(defs, 'dashboard carried no definitions block');
    for (const k of ['mentored', 'pending', 'mentors', 'coverage', 'sessions']) {
      assert(typeof defs[k] === 'string' && defs[k].length > 10, `definition "${k}" is missing or too short`);
    }
    return `definitions present for mentored/pending/mentors/coverage/sessions (${defs.coverage})`;
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== ADMIN COLLEGE-WIDE MENTORING DASHBOARD VERIFICATION ==========\n');
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