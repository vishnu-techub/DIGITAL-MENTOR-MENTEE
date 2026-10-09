/**
 * HOD DEPARTMENT SCOPING + MENTORING ANALYTICS VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives every /api/hod route over HTTP exactly as the HOD dashboard
 * does.
 *
 * Two departments are seeded with students, faculty, mentor assignments and
 * mentoring records on purpose, so a missing departmentId filter is provable
 * rather than assumed:
 *   - every analytics figure must reflect ONLY the calling HOD's department
 *   - a faculty/student/assignment id from the OTHER department must be refused
 *   - a HOD token with no departmentId claim must be refused outright
 *
 * Run: npm run test:hod
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('hod-verify');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5097;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'hod-scope-secret-do-not-use-in-prod';
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

/** YYYY-MM-DD for `offset` days before today, so "this month" stays real. */
function dayOffset(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Student, Faculty, Department, Batch, MentorAssignment, CounsellingRecord, Meeting, Notification } =
    await import('../models/index.js');

  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  assert(cse && ece, 'bootstrap did not create the expected reference data');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'bootstrap did not create a batch');

  const hash = bcrypt.hashSync('Mentor@123', 10);

  // ── SEED: two departments, mirrored shape ──────────────────────────────────
  async function makeHod(dept: any, suffix: string) {
    const user: any = await User.create({
      username: `hod.${suffix}`, passwordHash: hash, role: 'HOD',
      email: `hod.${suffix}@ksrce.test`, fullName: `Dr Hod ${suffix.toUpperCase()}`,
      department: dept._id, isActive: true,
    });
    const login = await http('POST', '/api/auth/login', {
      body: { username: `hod.${suffix}`, password: 'Mentor@123' },
    });
    const token = login.body?.data?.token || login.body?.token;
    assert(token, `${suffix} HOD could not log in`);
    return { user, token, deptId: String(dept._id) };
  }

  async function makeMentor(dept: any, empId: string, name: string) {
    const user: any = await User.create({
      username: `fac.${empId.toLowerCase()}`, passwordHash: hash, role: 'FACULTY',
      email: `fac.${empId.toLowerCase()}@ksrce.test`, fullName: name,
      department: dept._id, isActive: true,
    });
    const faculty: any = await Faculty.create({
      user: user._id, employeeId: empId, department: dept._id,
      designation: 'Associate Professor', cabinLocation: 'C-1', isActive: true,
    } as any);
    return { user, faculty, id: String(faculty._id) };
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
    return { user, student, id: String(student._id) };
  }

  const hodCse = await makeHod(cse, 'cse');
  const hodEce = await makeHod(ece, 'ece');

  const cseMentorA = await makeMentor(cse, 'HODCSE1', 'Dr Cse Mentor A');
  const cseMentorB = await makeMentor(cse, 'HODCSE2', 'Dr Cse Mentor B');
  const eceMentor = await makeMentor(ece, 'HODECE1', 'Dr Ece Mentor');

  // CSE: 3 students (2 under Mentor A, 1 under Mentor B). ECE: 2 students.
  const cseS1 = await makeStudent(cse, 'HODCSE001', 'Cse Student One');
  const cseS2 = await makeStudent(cse, 'HODCSE002', 'Cse Student Two');
  const cseS3 = await makeStudent(cse, 'HODCSE003', 'Cse Student Three');
  const eceS1 = await makeStudent(ece, 'HODECE001', 'Ece Student One');
  const eceS2 = await makeStudent(ece, 'HODECE002', 'Ece Student Two');

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

  // CSE: two of three students mentored THIS month; ECE: one of two.
  await CounsellingRecord.create({
    student: cseS1.student._id, mentor: cseMentorA.faculty._id,
    sessionDate: dayOffset(-2), date: dayOffset(-2), categories: ['Academic Development'],
    discussionWith: ['student'], challengeObserved: 'Needs focus', correctiveAction: 'Study plan',
  } as any);
  await Meeting.create({
    student: cseS2.student._id, mentor: cseMentorA.faculty._id,
    meetingDate: dayOffset(-3), meetingTime: '10:30 AM', location: 'Cabin',
    attendanceStatus: 'PRESENT', meetingStatus: 'COMPLETED',
    challengesDiscussed: 'Time management', correctiveAction: 'Weekly plan',
  } as any);
  // An older record, outside this month, so the month filter is provable.
  await CounsellingRecord.create({
    student: cseS3.student._id, mentor: cseMentorB.faculty._id,
    sessionDate: dayOffset(-70), date: dayOffset(-70), categories: ['Skill Development'],
    discussionWith: ['student'], challengeObserved: 'Communication', correctiveAction: 'Group work',
  } as any);
  await CounsellingRecord.create({
    student: eceS1.student._id, mentor: eceMentor.faculty._id,
    sessionDate: dayOffset(-4), date: dayOffset(-4), categories: ['Career Development'],
    discussionWith: ['student'], challengeObserved: 'Internships', correctiveAction: 'Apply early',
  } as any);

  // A notification for a CSE faculty member: the HOD must be able to see it.
  await Notification.create({
    user: cseMentorA.user._id,
    title: 'Saturday reminder',
    message: 'Weekly Saturday mentoring meeting is due.',
    type: 'REMINDER',
    relatedEntity: 'MEETING',
    relatedEntityId: 'seed-1',
  } as any);

  // ── 1. Department-scoped dashboard ────────────────────────────────────────
  await check('Dashboard summary is computed from real stored records', async () => {
    const r = await http('GET', '/api/hod/dashboard', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/dashboard -> ${r.status}`);
    const d = r.body.data;
    assert(d.summary.totalStudents === 3, `CSE totalStudents ${d.summary.totalStudents}, expected 3`);
    assert(d.summary.totalFaculty === 2, `CSE totalFaculty ${d.summary.totalFaculty}, expected 2`);
    assert(d.summary.totalMentors === 2, `CSE totalMentors ${d.summary.totalMentors}, expected 2`);
    assert(d.summary.assignedMentees === 3, `CSE assignedMentees ${d.summary.assignedMentees}, expected 3`);
    assert(d.summary.mentoredThisMonth === 2, `CSE mentoredThisMonth ${d.summary.mentoredThisMonth}, expected 2`);
    assert(d.summary.studentsNotMentoredThisMonth === 1, `CSE pending ${d.summary.studentsNotMentoredThisMonth}, expected 1`);
    assert(d.summary.overallMentoringCoverage === 67, `CSE coverage ${d.summary.overallMentoringCoverage}, expected 67`);
    assert(d.summary.totalMentoringSessions === 3, `CSE sessions ${d.summary.totalMentoringSessions}, expected 3`);
    assert(d.department.code === 'CSE', `dashboard returned department ${d.department.code}`);
    return `3 students / 2 faculty / 2 mentors / 3 active mentees / 2 mentored this month / 1 pending / 67% / 3 sessions (all CSE)`;
  });

  await check('Dashboard does not leak the other department', async () => {
    const cse = await http('GET', '/api/hod/dashboard', { token: hodCse.token });
    const ece = await http('GET', '/api/hod/dashboard', { token: hodEce.token });
    assert(cse.body.data.summary.totalStudents === 3, 'CSE HOD saw the wrong student count');
    assert(ece.body.data.summary.totalStudents === 2, `ECE HOD totalStudents ${ece.body.data.summary.totalStudents}, expected 2`);
    assert(ece.body.data.summary.mentoredThisMonth === 1, `ECE mentoredThisMonth ${ece.body.data.summary.mentoredThisMonth}, expected 1`);
    assert(ece.body.data.summary.totalFaculty === 1, `ECE totalFaculty ${ece.body.data.summary.totalFaculty}, expected 1`);
    assert(ece.body.data.department.code === 'ECE', 'ECE HOD received the wrong department');
    return `CSE HOD -> 3 students, ECE HOD -> 2 students; neither sees the other's figures`;
  });

  // ── 2. Monthly PIE series ──────────────────────────────────────────────────
  await check('Monthly PIE series splits Mentored vs Pending for this month', async () => {
    const r = await http('GET', '/api/hod/dashboard', { token: hodCse.token });
    const pie = r.body.data.pie;
    assert(pie, 'dashboard carried no pie series');
    assert(pie.mentored === 2, `pie.mentored ${pie.mentored}, expected 2`);
    assert(pie.pending === 1, `pie.pending ${pie.pending}, expected 1`);
    assert(pie.total === 3, `pie.total ${pie.total}, expected 3`);
    assert(/^\d{4}-\d{2}$/.test(pie.month), `pie.month "${pie.month}" is not YYYY-MM`);
    return `month ${pie.month}: mentored ${pie.mentored}, pending ${pie.pending}, total ${pie.total}`;
  });

  // ── 3. Mentor-wise coverage table ──────────────────────────────────────────
  await check('Mentor-wise coverage lists only this department mentors', async () => {
    const r = await http('GET', '/api/hod/mentor-wise', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/mentor-wise -> ${r.status}`);
    const rows = r.body.data as any[];
    assert(rows.length === 2, `CSE mentor-wise returned ${rows.length} rows, expected 2`);
    for (const m of rows) {
      assert(m.department === cse.name, `row for ${m.mentorId} claims department ${m.department}`);
    }
    const a = rows.find((m) => m.mentorId === cseMentorA.id);
    const b = rows.find((m) => m.mentorId === cseMentorB.id);
    assert(a, 'Mentor A missing from mentor-wise');
    assert(b, 'Mentor B missing from mentor-wise');
    assert(a.totalMentees === 2, `Mentor A mentees ${a.totalMentees}, expected 2`);
    assert(a.mentoredThisMonth === 2, `Mentor A mentored this month ${a.mentoredThisMonth}, expected 2`);
    assert(a.sessionCount === 2, `Mentor A sessions ${a.sessionCount}, expected 2`);
    assert(a.coveragePercent === 100, `Mentor A coverage ${a.coveragePercent}, expected 100`);
    assert(b.totalMentees === 1, `Mentor B mentees ${b.totalMentees}, expected 1`);
    assert(b.mentoredThisMonth === 0, `Mentor B mentored this month ${b.mentoredThisMonth}, expected 0`);
    assert(b.pending === 1, `Mentor B pending ${b.pending}, expected 1`);
    assert(b.coveragePercent === 0, `Mentor B coverage ${b.coveragePercent}, expected 0`);
    return `Mentor A 2/2 mentees 100%, Mentor B 0/1 mentees 0%; no ECE row present`;
  });

  // ── 4. Mentor detail ──────────────────────────────────────────────────────
  await check('Mentor detail returns mentees, last mentoring date and session count', async () => {
    const r = await http('GET', `/api/hod/mentor/${cseMentorA.id}`, { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/mentor/:id -> ${r.status}`);
    const d = r.body.data;
    assert(d.mentor.fullName === 'Dr Cse Mentor A', `unexpected mentor name ${d.mentor.fullName}`);
    assert(d.mentees.length === 2, `mentor detail returned ${d.mentees.length} mentees, expected 2`);
    assert(d.summary.sessionCount === 2, `mentor detail sessions ${d.summary.sessionCount}, expected 2`);
    assert(d.summary.totalMentees === 2, `mentor detail totalMentees ${d.summary.totalMentees}, expected 2`);
    assert(d.summary.lastMentoringDate, 'mentor detail reported no last mentoring date');
    for (const m of d.mentees) {
      assert('lastMentoringDate' in m, `mentee ${m.id} carried no lastMentoringDate field`);
      assert(typeof m.sessionCount === 'number', `mentee ${m.id} carried no sessionCount`);
    }
    const s1 = d.mentees.find((m: any) => m.id === cseS1.id);
    assert(s1?.lastMentoringDate === dayOffset(-2), `student 1 last mentoring ${s1?.lastMentoringDate}`);
    assert(s1?.sessionCount === 1, `student 1 sessions ${s1?.sessionCount}, expected 1`);
    return `2 mentees, sessionCount ${d.summary.sessionCount}, lastMentoringDate ${d.summary.lastMentoringDate}`;
  });

  await check('Mentor detail refuses a faculty id from another department', async () => {
    const r = await http('GET', `/api/hod/mentor/${eceMentor.id}`, { token: hodCse.token });
    assert(r.status === 404, `cross-department mentor detail expected 404, got ${r.status}`);
    return `CSE HOD asking for the ECE mentor id -> ${r.status}`;
  });

  // ── 5. Weekly progress ─────────────────────────────────────────────────────
  await check('Weekly progress returns one bucket per week with real session counts', async () => {
    const r = await http('GET', '/api/hod/weekly-progress?weeks=8', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/weekly-progress -> ${r.status}`);
    const weeks = r.body.data as any[];
    assert(weeks.length === 8, `weekly-progress returned ${weeks.length} weeks, expected 8`);
    for (const w of weeks) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(w.weekStart), `bad weekStart ${w.weekStart}`);
      assert(typeof w.sessions === 'number', `week ${w.weekStart} carried no session count`);
    }
    // Every seeded in-window session must land in exactly one bucket, and the
    // 70-day-old record must land in none of these 8 buckets. The two seeded
    // days (today-2 and today-3) may straddle a Monday boundary depending on
    // the run date, so each session day is matched to its own bucket instead
    // of assuming both share one.
    const total = weeks.reduce((n, w) => n + w.sessions, 0);
    assert(total === 2, `the 8 buckets counted ${total} sessions, expected the 2 in-window records`);
    for (const [day, label] of [[dayOffset(-3), 'meeting'], [dayOffset(-2), 'counselling']] as const) {
      const bucket = weeks.find((w) => w.weekStart <= day && day <= w.weekEnd);
      assert(bucket, `the ${label} on ${day} landed in no bucket`);
      assert(bucket.sessions > 0, `the ${label} on ${day} landed in a bucket reporting 0 sessions`);
      assert(bucket.weekStart <= day, 'bucket starts after its own session');
    }
    const counted = weeks.filter((w) => w.sessions > 0);
    assert(counted.length >= 1 && counted.length <= 2, `${counted.length} buckets held sessions, expected 1 or 2`);
    return `8 buckets, ${total} sessions total, spread over ${counted.length} week(s) starting ${counted.map((w) => w.weekStart).join(', ')}`;
  });

  await check('Weekly progress caps the range and never returns a foreign department', async () => {
    for (const [query, label] of [['?weeks=999', 'weeks=999'], ['?weeks=0', 'weeks=0'], ['?weeks=-4', 'weeks=-4'], ['', 'no parameter']] as const) {
      const r = await http('GET', `/api/hod/weekly-progress${query}`, { token: hodCse.token });
      assert(r.status === 200, `${label} -> ${r.status}`);
      const weeks = r.body.data as any[];
      assert(weeks.length === 4, `${label} returned ${weeks.length} buckets, expected the 4-week (30-day) default`);
      const total = weeks.reduce((n, w) => n + w.sessions, 0);
      assert(total === 2, `${label} counted ${total} CSE sessions, expected 2`);
    }
    const max = await http('GET', '/api/hod/weekly-progress?weeks=26', { token: hodCse.token });
    assert((max.body.data as any[]).length === 26, `weeks=26 returned ${(max.body.data as any[]).length}`);
    return 'out-of-range week counts fall back to the 4-week (30-day) default; weeks=26 honoured; no cross-department sessions at any range';
  });

  // ── 6. 30-day report ───────────────────────────────────────────────────────
  await check('30-day report totals, weekly, mentor-wise and pending list', async () => {
    const r = await http('GET', '/api/hod/report-30-day', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/report-30-day -> ${r.status}`);
    const d = r.body.data;
    assert(d.totals.sessions === 2, `30d sessions ${d.totals.sessions}, expected 2 (the 70-day record is out of range)`);
    assert(d.totals.studentsMentored === 2, `30d studentsMentored ${d.totals.studentsMentored}, expected 2`);
    assert(d.totals.studentsPending === 1, `30d studentsPending ${d.totals.studentsPending}, expected 1`);
    assert(d.totals.coveragePercent === 67, `30d coverage ${d.totals.coveragePercent}, expected 67`);
    assert(d.totals.mentorsWithMentees === 2, `30d mentorsWithMentees ${d.totals.mentorsWithMentees}, expected 2`);
    assert(d.totals.mentorsActive === 1, `30d mentorsActive ${d.totals.mentorsActive}, expected 1`);
    assert(d.pendingStudents.length === 1, `pendingStudents ${d.pendingStudents.length}, expected 1`);
    assert(d.pendingStudents[0].id === cseS3.id, 'the wrong student is listed as pending');
    assert(d.mentorWise.length === 2, `30d mentorWise ${d.mentorWise.length}, expected 2`);
    return `2 sessions / 2 mentored / 1 pending / 67% / 1 active of 2 mentors; pending=${d.pendingStudents[0].registerNumber}`;
  });

  // ── 7. Department overview ─────────────────────────────────────────────────
  await check('Department overview reports its own department only', async () => {
    const r = await http('GET', '/api/hod/department-overview', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/department-overview -> ${r.status}`);
    const d = r.body.data;
    assert(d.department.code === 'CSE', `overview department ${d.department.code}`);
    assert(d.studentCount === 3, `overview studentCount ${d.studentCount}, expected 3`);
    assert(d.facultyCount === 2, `overview facultyCount ${d.facultyCount}, expected 2`);
    assert(d.mentorCount === 2, `overview mentorCount ${d.mentorCount}, expected 2`);
    assert(d.unassignedStudents === 0, `overview unassignedStudents ${d.unassignedStudents}, expected 0`);
    assert(d.activeMentees === 3, `overview activeMentees ${d.activeMentees}, expected 3`);
    assert(d.totalMentoringSessions === 3, `overview sessions ${d.totalMentoringSessions}, expected 3`);
    assert(Array.isArray(d.batches), 'overview carried no batch list');
    return `CSE: ${d.studentCount} students, ${d.facultyCount} faculty, ${d.mentorCount} mentors, ${d.activeMentees} active mentees, ${d.unassignedStudents} unassigned`;
  });

  // ── 7b. HOD dashboard verification additions ──────────────────────────────
  await check('Dashboard reports active mentees and a 4-week (30-day) window', async () => {
    const r = await http('GET', '/api/hod/dashboard', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/dashboard -> ${r.status}`);
    const d = r.body.data;
    assert(d.summary.assignedMentees === 3, `assignedMentees ${d.summary.assignedMentees}, expected 3`);
    assert(Array.isArray(d.weeklyProgress), 'dashboard carried no weeklyProgress');
    assert(d.weeklyProgress.length === 4, `dashboard weeklyProgress ${d.weeklyProgress.length} buckets, expected 4 (the 30-day window)`);
    const ece = await http('GET', '/api/hod/dashboard', { token: hodEce.token });
    assert(ece.body.data.summary.assignedMentees === 2, `ECE assignedMentees ${ece.body.data.summary.assignedMentees}, expected 2`);
    return `CSE active mentees 3 / ECE 2; dashboard weekly window = 4 buckets (30 days)`;
  });

  await check('Selecting a past month recomputes the monthly figures from stored records', async () => {
    const oldMonth = dayOffset(-70).slice(0, 7);
    const r = await http('GET', `/api/hod/dashboard?month=${oldMonth}`, { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/dashboard?month=${oldMonth} -> ${r.status}`);
    const pie = r.body.data.pie;
    assert(pie.month === oldMonth, `pie.month ${pie.month}, expected ${oldMonth}`);
    assert(pie.mentored === 1, `old-month pie.mentored ${pie.mentored}, expected 1 (only the 70-day-old record)`);
    assert(pie.pending === 2, `old-month pie.pending ${pie.pending}, expected 2`);

    const mw = await http('GET', `/api/hod/mentor-wise?month=${oldMonth}`, { token: hodCse.token });
    const rows = mw.body.data as any[];
    const a = rows.find((m) => m.mentorId === cseMentorA.id);
    const b = rows.find((m) => m.mentorId === cseMentorB.id);
    assert(a && b, 'mentor-wise rows missing for the past month');
    assert(a.mentoredThisMonth === 0 && a.coveragePercent === 0, `Mentor A old-month row ${a.mentoredThisMonth}/${a.coveragePercent}%, expected 0/0`);
    assert(b.mentoredThisMonth === 1 && b.coveragePercent === 100, `Mentor B old-month row ${b.mentoredThisMonth}/${b.coveragePercent}%, expected 1/100`);

    const md = await http('GET', `/api/hod/mentor/${cseMentorB.id}?month=${oldMonth}`, { token: hodCse.token });
    assert(md.status === 200, `mentor detail?month=${oldMonth} -> ${md.status}`);
    assert(md.body.data.summary.mentoredThisMonth === 1, `Mentor B old-month mentored ${md.body.data.summary.mentoredThisMonth}, expected 1`);
    assert(md.body.data.summary.sessionsThisMonth === 1, `Mentor B old-month sessionsThisMonth ${md.body.data.summary.sessionsThisMonth}, expected 1`);

    const bad = await http('GET', '/api/hod/dashboard?month=not-a-month', { token: hodCse.token });
    assert(bad.body.data.pie.month === new Date().toISOString().slice(0, 7), 'an invalid month did not fall back to the current month');
    return `month ${oldMonth}: pie 1 mentored / 2 pending; Mentor A 0% vs Mentor B 100%; invalid month -> current month`;
  });

  await check('30-day report carries per-mentor rows with not-covered students', async () => {
    const r = await http('GET', '/api/hod/report-30-day', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/report-30-day -> ${r.status}`);
    const d = r.body.data;
    assert(d.weekly.length === 4, `report weekly ${d.weekly.length} buckets, expected 4 (the 30-day window)`);
    assert(Array.isArray(d.reportMentors), 'report carried no reportMentors rows');
    assert(d.reportMentors.length === 2, `reportMentors ${d.reportMentors.length}, expected 2`);
    const a = d.reportMentors.find((m: any) => m.mentorId === cseMentorA.id);
    const b = d.reportMentors.find((m: any) => m.mentorId === cseMentorB.id);
    assert(a, 'Mentor A missing from reportMentors');
    assert(a.totalMentees === 2 && a.coveredStudents === 2 && a.pendingStudents === 0 && a.coveragePercent === 100,
      `Mentor A report row ${a.totalMentees}/${a.coveredStudents}/${a.pendingStudents}/${a.coveragePercent}%`);
    assert(a.totalSessions === 2, `Mentor A report sessions ${a.totalSessions}, expected 2`);
    assert(a.notCovered.length === 0, `Mentor A not-covered list ${a.notCovered.length}, expected 0`);
    assert(b, 'Mentor B missing from reportMentors');
    assert(b.totalMentees === 1 && b.coveredStudents === 0 && b.pendingStudents === 1 && b.coveragePercent === 0,
      `Mentor B report row ${b.totalMentees}/${b.coveredStudents}/${b.pendingStudents}/${b.coveragePercent}%`);
    assert(b.totalSessions === 0, `Mentor B report sessions ${b.totalSessions}, expected 0 (the 70-day record is out of window)`);
    assert(b.lastMentoringDate === null, `Mentor B report lastMentoringDate ${b.lastMentoringDate}, expected null`);
    assert(b.notCovered.length === 1 && b.notCovered[0].registerNumber === 'HODCSE003',
      `Mentor B not-covered list wrong: ${JSON.stringify(b.notCovered)}`);
    return `Mentor A 2/2 covered (100%, 2 sessions); Mentor B 0/1 covered, not covered: HODCSE003; weekly window 4 buckets`;
  });

  await check('Duplicate sessions in one month count the student once but the sessions separately', async () => {
    // Two more SAME-month sessions for an already-mentored student: the distinct
    // rule must keep mentored/coverage unchanged while session counts rise.
    for (let i = 0; i < 2; i++) {
      await CounsellingRecord.create({
        student: cseS1.student._id, mentor: cseMentorA.faculty._id,
        sessionDate: dayOffset(-2), date: dayOffset(-2), categories: ['Academic Development'],
        discussionWith: ['student'], challengeObserved: 'Needs focus', correctiveAction: 'Study plan',
      } as any);
    }
    const d = (await http('GET', '/api/hod/dashboard', { token: hodCse.token })).body.data;
    assert(d.summary.mentoredThisMonth === 2, `mentoredThisMonth ${d.summary.mentoredThisMonth}, expected 2 (the student counted once)`);
    assert(d.summary.overallMentoringCoverage === 67, `coverage ${d.summary.overallMentoringCoverage}, expected 67`);
    assert(d.pie.mentored === 2 && d.pie.pending === 1, `pie ${d.pie.mentored}/${d.pie.pending}, expected 2/1`);
    assert(d.summary.totalMentoringSessions === 5, `total sessions ${d.summary.totalMentoringSessions}, expected 5`);

    const md = (await http('GET', `/api/hod/mentor/${cseMentorA.id}`, { token: hodCse.token })).body.data;
    assert(md.summary.mentoredThisMonth === 2, `mentor mentoredThisMonth ${md.summary.mentoredThisMonth}, expected 2`);
    assert(md.summary.sessionCount === 4, `mentor all-time sessions ${md.summary.sessionCount}, expected 4`);
    assert(md.summary.sessionsThisMonth === 4, `mentor sessionsThisMonth ${md.summary.sessionsThisMonth}, expected 4`);
    const s1 = md.mentees.find((m: any) => m.id === cseS1.id);
    assert(s1.sessionCount === 3, `student 1 all-time sessions ${s1.sessionCount}, expected 3`);
    assert(s1.sessionsThisMonth === 3, `student 1 sessionsThisMonth ${s1.sessionsThisMonth}, expected 3`);
    assert(s1.mentoredThisMonth === true, 'student 1 not flagged as mentored this month');

    const rep = (await http('GET', '/api/hod/report-30-day', { token: hodCse.token })).body.data;
    assert(rep.totals.sessions === 4, `report sessions ${rep.totals.sessions}, expected 4`);
    assert(rep.totals.studentsMentored === 2, `report studentsMentored ${rep.totals.studentsMentored}, expected 2`);
    assert(rep.totals.mentorsActive === 1, `report mentorsActive ${rep.totals.mentorsActive}, expected 1`);
    const a = rep.reportMentors.find((m: any) => m.mentorId === cseMentorA.id);
    assert(a.totalSessions === 4, `Mentor A report sessions ${a.totalSessions}, expected 4`);
    return `coverage stays 2/3 (67%) while sessions rise to 5 (dashboard) / 4 (report window); mentor sessionsThisMonth ${md.summary.sessionsThisMonth}`;
  });

  // ── 8. Faculty add / edit / view ───────────────────────────────────────────
  await check('HOD can add faculty, and the new record lands in their own department', async () => {
    const r = await http('POST', '/api/hod/faculty', {
      token: hodCse.token,
      body: {
        fullName: 'Dr Added By Hod', email: 'added.byhod@ksrce.test', employeeId: 'ADDED01',
        designation: 'Assistant Professor', cabinLocation: 'B-2', phoneNumber: '9000000001',
      },
    });
    assert(r.status === 201, `POST /api/hod/faculty -> ${r.status}`);
    const created = r.body.data;
    assert(created.department_id === hodCse.deptId, `new faculty landed in ${created.department_id}`);
    const stored: any = await Faculty.findOne({ employeeId: 'ADDED01' });
    assert(stored && String(stored.department) === hodCse.deptId, 'stored faculty is in the wrong department');
    const list = await http('GET', '/api/hod/faculty', { token: hodCse.token });
    assert(list.body.data.length === 3, `CSE faculty list ${list.body.data.length}, expected 3`);
    const eceList = await http('GET', '/api/hod/faculty', { token: hodEce.token });
    assert(eceList.body.data.length === 1, `ECE faculty list ${eceList.body.data.length}, expected 1`);
    return `created ADDED01 in CSE; CSE list 3, ECE list 1 — no cross-department leakage`;
  });

  await check('HOD cannot add or edit faculty in another department', async () => {
    const eceList = await http('GET', '/api/hod/faculty', { token: hodEce.token });
    const eceFacultyId = eceList.body.data[0].id;
    const r = await http('PUT', `/api/hod/faculty/${eceFacultyId}`, {
      token: hodCse.token,
      body: { fullName: 'Hijacked By Other Hod' },
    });
    assert(r.status === 404, `cross-department faculty edit expected 404, got ${r.status}`);
    const still: any = await Faculty.findById(eceFacultyId);
    assert(still.user, 'the ECE faculty record was damaged');
    const eceFacultyUser: any = await User.findById((await Faculty.findById(eceFacultyId)).user);
    assert(eceFacultyUser.fullName === 'Dr Ece Mentor', `ECE faculty name is now "${eceFacultyUser.fullName}"`);
    return `CSE HOD editing the ECE faculty id -> ${r.status}, ECE record unchanged`;
  });

  await check('HOD can edit their own faculty', async () => {
    const r = await http('PUT', `/api/hod/faculty/${cseMentorB.id}`, {
      token: hodCse.token,
      body: { designation: 'Professor', cabinLocation: 'H-1', phoneNumber: '9000000009' },
    });
    assert(r.status === 200, `PUT /api/hod/faculty/:id -> ${r.status}`);
    assert(r.body.data.designation === 'Professor', `designation not updated: ${r.body.data.designation}`);
    const stored: any = await Faculty.findById(cseMentorB.id);
    assert(stored.designation === 'Professor', 'stored designation not updated');
    return `HODCSE2 designation -> ${stored.designation}, cabin -> ${stored.cabinLocation}`;
  });

  // ── 9. Student add / edit / view ───────────────────────────────────────────
  let addedStudentId = '';
  await check('HOD can add a student into their own department', async () => {
    const r = await http('POST', '/api/hod/students', {
      token: hodCse.token,
      body: {
        fullName: 'Hod Added Student', registerNumber: 'HODCSE900', email: 'hodcse900@ksrce.test',
        batchId: String(batch._id), year: 2, section: 'A',
      },
    });
    assert(r.status === 201, `POST /api/hod/students -> ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const created = r.body.data;
    addedStudentId = created.id;
    assert(created.register_number === 'HODCSE900', `register number ${created.register_number}`);
    assert(created.department_id === hodCse.deptId, `new student landed in ${created.department_id}`);
    const stored: any = await Student.findOne({ registerNumber: 'HODCSE900' });
    assert(stored && String(stored.department) === hodCse.deptId, 'stored student is in the wrong department');
    return `created HODCSE900 in CSE; register ${stored.registerNumber}, department ${stored.department}`;
  });

  await check('HOD student listing is department scoped', async () => {
    const cse = await http('GET', '/api/hod/students', { token: hodCse.token });
    const ece = await http('GET', '/api/hod/students', { token: hodEce.token });
    assert(cse.body.data.length === 4, `CSE students ${cse.body.data.length}, expected 4`);
    assert(ece.body.data.length === 2, `ECE students ${ece.body.data.length}, expected 2`);
    for (const s of cse.body.data as any[]) {
      assert(s.department_id === hodCse.deptId, `CSE list leaked ${s.register_number} from another department`);
    }
    const withMentor = cse.body.data.find((s: any) => s.register_number === 'HODCSE001');
    assert(withMentor.current_mentor_name === 'Dr Cse Mentor A', `mentor name ${withMentor.current_mentor_name}`);
    assert(typeof withMentor.last_mentoring_date === 'string', 'student row carried no last_mentoring_date');
    return `CSE 4 students, ECE 2 students, none cross the boundary; HODCSE001 -> ${withMentor.current_mentor_name}`;
  });

  await check('HOD cannot edit a student from another department', async () => {
    const r = await http('PUT', `/api/hod/students/${eceS1.id}`, {
      token: hodCse.token,
      body: { fullName: 'Hijacked Student' },
    });
    assert(r.status === 404, `cross-department student edit expected 404, got ${r.status}`);
    const stored: any = await Student.findById(eceS1.id);
    assert(stored.fullName === 'Ece Student One', `ECE student name is now "${stored.fullName}"`);
    return `CSE HOD editing the ECE student id -> ${r.status}, ECE record unchanged`;
  });

  // ── 10. Mentor assignment inside the department ────────────────────────────
  await check('HOD can assign a mentor inside their own department', async () => {
    const r = await http('POST', '/api/hod/mentor-assignments', {
      token: hodCse.token,
      body: { studentId: addedStudentId, mentorId: cseMentorA.id, reason: 'HOD test allocation' },
    });
    assert(r.status === 201, `POST /api/hod/mentor-assignments -> ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const stored: any = await MentorAssignment.findOne({ student: addedStudentId } as any);
    assert(stored, 'no assignment row was written');
    assert(String(stored.department) === hodCse.deptId, `assignment department ${stored.department}`);
    assert(stored.status === 'ACTIVE', `assignment status ${stored.status}`);
    const note: any = await Notification.findOne({ user: cseMentorA.user._id, type: 'MENTOR_ASSIGNMENT' } as any);
    assert(note, 'the mentor received no assignment notification');
    return `HODCSE900 (${addedStudentId}) -> ${cseMentorA.id} in CSE, status ACTIVE, mentor notified`;
  });

  await check('HOD cannot assign a mentor outside their own department', async () => {
    const foreign = await http('POST', '/api/hod/mentor-assignments', {
      token: hodCse.token,
      body: { studentId: eceS1.id, mentorId: cseMentorA.id },
    });
    assert(foreign.status === 404, `cross-department student assignment expected 404, got ${foreign.status}`);

    const foreignMentor = await http('POST', '/api/hod/mentor-assignments', {
      token: hodCse.token,
      body: { studentId: cseS1.id, mentorId: eceMentor.id },
    });
    assert(foreignMentor.status === 404, `cross-department mentor assignment expected 404, got ${foreignMentor.status}`);

    const dup = await http('POST', '/api/hod/mentor-assignments', {
      token: hodCse.token,
      body: { studentId: cseS1.id, mentorId: cseMentorB.id },
    });
    assert(dup.status === 409, `re-assigning a mentored student expected 409, got ${dup.status}`);

    const count: number = await MentorAssignment.countDocuments({ student: eceS1.id } as any);
    assert(count === 1, `ECE student now has ${count} assignments`);
    return `foreign student -> ${foreign.status}, foreign mentor -> ${foreignMentor.status}, duplicate -> ${dup.status}`;
  });

  // ── 11. Faculty notifications ──────────────────────────────────────────────
  await check('HOD sees their own faculty notifications, and only those', async () => {
    await Notification.create({
      user: eceMentor.user._id, title: 'ECE only', message: 'Must not appear for the CSE HOD.',
      type: 'REMINDER', relatedEntity: 'MEETING', relatedEntityId: 'seed-2',
    } as any);
    const cse = await http('GET', '/api/hod/faculty-notifications', { token: hodCse.token });
    assert(cse.status === 200, `GET /api/hod/faculty-notifications -> ${cse.status}`);
    const texts = (cse.body.data as any[]).map((n) => n.title);
    assert(texts.includes('Saturday reminder'), 'the CSE faculty notification was not visible to the HOD');
    assert(!texts.includes('ECE only'), 'an ECE-only notification leaked to the CSE HOD');
    for (const n of cse.body.data as any[]) {
      assert(n.faculty_name, 'notification row carried no faculty name');
      assert(typeof n.is_read === 'boolean', 'notification row carried no is_read flag');
    }
    const ece = await http('GET', '/api/hod/faculty-notifications', { token: hodEce.token });
    const eceTexts = (ece.body.data as any[]).map((n) => n.title);
    assert(eceTexts.includes('ECE only'), 'the ECE HOD cannot see their own faculty notifications');
    return `CSE HOD sees ${texts.length} CSE notification(s), 0 ECE; ECE HOD sees ${eceTexts.length}`;
  });

  // ── 11b. Assignment removal ─────────────────────────────────────────────────
  await check('HOD can end an assignment, and the historical row is retained', async () => {
    const asg: any = await MentorAssignment.findOne({ student: addedStudentId } as any);
    const r = await http('PATCH', `/api/hod/mentor-assignments/${asg._id}/remove`, {
      token: hodCse.token, body: {},
    });
    assert(r.status === 200, `PATCH .../remove -> ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const after: any = await MentorAssignment.findById(asg._id);
    assert(after.status === 'COMPLETED', `assignment status after removal is ${after.status}`);
    assert(after.assignedUntil, 'the ended assignment carries no assignedUntil date');
    const stillThere = await MentorAssignment.countDocuments({ student: addedStudentId } as any);
    assert(stillThere === 1, `the historical assignment row was deleted (${stillThere} remain), records must be retained`);
    return `assignment ${asg._id} -> COMPLETED, assignedUntil recorded, row retained`;
  });

  await check('HOD cannot end an assignment from another department', async () => {
    const eceAsg: any = await MentorAssignment.findOne({ student: eceS1.id } as any);
    const r = await http('PATCH', `/api/hod/mentor-assignments/${eceAsg._id}/remove`, {
      token: hodCse.token, body: {},
    });
    assert(r.status === 404, `cross-department assignment removal expected 404, got ${r.status}`);
    const after: any = await MentorAssignment.findById(eceAsg._id);
    assert(after.status === 'ACTIVE', `the ECE assignment is now ${after.status}, it must be untouched`);
    return `CSE HOD ending the ECE assignment -> ${r.status}, ECE assignment still ACTIVE`;
  });

  // ── 12. Role guards ────────────────────────────────────────────────────────
  await check('Non-HOD roles and an unscoped HOD are refused', async () => {
    const login = await http('POST', '/api/auth/login', {
      body: { username: 'fac.hodcse1', password: 'Mentor@123' },
    });
    const facultyToken = login.body?.data?.token || login.body?.token;
    assert(facultyToken, 'the seeded faculty could not log in');
    const asFaculty = await http('GET', '/api/hod/dashboard', { token: facultyToken });
    assert(asFaculty.status === 403, `FACULTY GET /api/hod/dashboard expected 403, got ${asFaculty.status}`);

    const studentLogin = await http('POST', '/api/auth/login', {
      body: { username: 'hodcse001', password: 'Mentor@123' },
    });
    const studentToken = studentLogin.body?.data?.token || studentLogin.body?.token;
    assert(studentToken, 'the seeded student could not log in');
    const asStudent = await http('GET', '/api/hod/students', { token: studentToken });
    assert(asStudent.status === 403, `STUDENT GET /api/hod/students expected 403, got ${asStudent.status}`);

    const anon = await http('GET', '/api/hod/dashboard');
    assert(anon.status === 401, `anonymous GET /api/hod/dashboard expected 401, got ${anon.status}`);

    // A HOD whose user row carries no department must fail closed, not widen.
    await User.create({
      username: 'hod.nodep', passwordHash: hash, role: 'HOD',
      email: 'hod.nodep@ksrce.test', fullName: 'Dr No Department',
      department: undefined as any, isActive: true,
    } as any);
    const unscopedLogin = await http('POST', '/api/auth/login', {
      body: { username: 'hod.nodep', password: 'Mentor@123' },
    });
    const unscopedToken = unscopedLogin.body?.data?.token || unscopedLogin.body?.token;
    assert(unscopedToken, 'the unscoped HOD could not log in');
    const unscoped = await http('GET', '/api/hod/dashboard', { token: unscopedToken });
    assert(unscoped.status === 403, `unscoped HOD expected 403, got ${unscoped.status}`);

    return `FACULTY -> ${asFaculty.status}, STUDENT -> ${asStudent.status}, anonymous -> ${anon.status}, HOD without department -> ${unscoped.status}`;
  });

  // ── 12b. Shared admin/HOD endpoints stay department-scoped ─────────────────
  // The Admin UI shares a few listing/export/assignment endpoints with HOD
  // roles. Each one that hands a HOD another department's data must be scoped:
  // the HOD surface is /api/hod/* but a missing guard here would let a
  // department head read a foreign mentor's mentees, list foreign students,
  // assign/reassign across departments or export another department's Excel.
  await check('HOD cannot read another department mentor mentees through the shared admin endpoint', async () => {
    const foreign = await http('GET', `/api/admin/mentors/${eceMentor.id}/mentees`, { token: hodCse.token });
    assert(foreign.status === 404, `CSE HOD reading the ECE mentor mentees expected 404, got ${foreign.status}`);
    const own = await http('GET', `/api/admin/mentors/${cseMentorA.id}/mentees`, { token: hodCse.token });
    assert(own.status === 200, `CSE HOD reading their OWN mentor mentees expected 200, got ${own.status}`);
    const mentees = (own.body.data.mentees as any[]) || [];
    assert(mentees.length === 2, `own-dept mentees returned ${mentees.length}, expected 2`);
    for (const m of mentees) {
      assert(m.department_code === 'CSE', `own-dept drilldown leaked ${m.department_code}`);
    }
    return `foreign ECE mentor -> ${foreign.status}; own CSE mentor -> ${own.status} (${mentees.length} mentees, all CSE)`;
  });

  await check('HOD /admin/students lists only their own department regardless of the department filter', async () => {
    const r = await http('GET', `/api/admin/students?department=${ece._id}&limit=100`, { token: hodCse.token });
    assert(r.status === 200, `GET /api/admin/students -> ${r.status}`);
    const list = (r.body.data.students as any[]) || [];
    assert(list.length === 4, `CSE HOD /admin/students returned ${list.length} rows, expected the 4 CSE students`);
    for (const s of list) {
      assert(s.department_code === 'CSE', `row ${s.register_number} leaked department ${s.department_code}`);
    }
    return `forced CSE scope -> ${list.length} rows, all CSE; the requested ECE filter is ignored`;
  });

  await check('HOD cannot assign or reassign outside their department through the shared mentorship endpoints', async () => {
    const foreignStudent = await http('POST', '/api/mentorship/assign', {
      token: hodCse.token,
      body: { studentId: eceS1.id, mentorId: cseMentorA.id, reason: 'cross-dept student attempt' },
    });
    assert(foreignStudent.status === 404, `assign a foreign student expected 404, got ${foreignStudent.status}`);

    const foreignMentor = await http('POST', '/api/mentorship/assign', {
      token: hodCse.token,
      body: { studentId: cseS3.id, mentorId: eceMentor.id, reason: 'cross-dept mentor attempt' },
    });
    assert(foreignMentor.status === 404, `assign a foreign mentor expected 404, got ${foreignMentor.status}`);

    const foreignReassign = await http('POST', '/api/mentorship/reassign', {
      token: hodCse.token,
      body: { studentId: eceS1.id, newMentorId: cseMentorA.id, reasonForChange: 'cross-dept reassign attempt' },
    });
    assert(foreignReassign.status === 404, `reassign a foreign student expected 404, got ${foreignReassign.status}`);

    // A legitimate own-department assignment passes the guard and is then
    // refused by business validation (already active), never by the guard.
    const own = await http('POST', '/api/mentorship/assign', {
      token: hodCse.token,
      body: { studentId: cseS1.id, mentorId: cseMentorA.id, reason: 'own department - already active' },
    });
    assert(own.status === 400, `own-department assign of an already-active student expected 400, got ${own.status}`);

    return `foreign student -> ${foreignStudent.status}, foreign mentor -> ${foreignMentor.status}, foreign reassign -> ${foreignReassign.status}; own-dept assign reached business logic (${own.status})`;
  });

  await check('HOD cannot export another department mentor mentees Excel', async () => {
    const foreign = await http('GET', `/api/reports/export/mentor-mentees?mentorId=${eceMentor.id}`, { token: hodCse.token });
    assert(foreign.status === 404, `HOD export of the ECE mentor expected 404, got ${foreign.status}`);
    const alt = await http('GET', `/api/mentor/export/mentees?mentorId=${eceMentor.id}`, { token: hodCse.token });
    assert(alt.status === 404, `HOD /api/mentor/export/mentees of the ECE mentor expected 404, got ${alt.status}`);
    const own = await http('GET', `/api/mentor/export/mentees?mentorId=${cseMentorA.id}`, { token: hodCse.token });
    assert(own.status === 200, `HOD export of their OWN CSE mentor expected 200, got ${own.status}`);
    return `foreign ECE export -> ${foreign.status}, foreign alt path -> ${alt.status}; own CSE export -> ${own.status}`;
  });

  await check('HOD cannot read the institutional audit log or the college-wide admin dashboard stats', async () => {
    const audit = await http('GET', '/api/audit-logs', { token: hodCse.token });
    assert(audit.status === 403, `HOD GET /api/audit-logs expected 403, got ${audit.status}`);
    const stats = await http('GET', '/api/admin/dashboard-stats', { token: hodCse.token });
    assert(stats.status === 403, `HOD GET /api/admin/dashboard-stats expected 403, got ${stats.status}`);
    return `HOD /api/audit-logs -> ${audit.status}, /api/admin/dashboard-stats -> ${stats.status}; the verified /api/hod/dashboard remains the HOD analytics surface`;
  });

  // ── 13. No location data anywhere in the HOD surface ───────────────────────
  await check('HOD responses carry no GPS / location tracking fields', async () => {
    const paths = [
      '/api/hod/dashboard',
      '/api/hod/mentor-wise',
      `/api/hod/mentor/${cseMentorA.id}`,
      '/api/hod/weekly-progress',
      '/api/hod/report-30-day',
      '/api/hod/department-overview',
      '/api/hod/students',
      '/api/hod/faculty',
      '/api/hod/faculty-notifications',
    ];
    const needles = ['latitude', 'longitude', 'geotag', 'locationStatus', 'accuracy', 'deviceGeotag'];
    for (const p of paths) {
      const r = await http('GET', p, { token: hodCse.token });
      assert(r.status === 200, `${p} -> ${r.status}`);
      const text = JSON.stringify(r.body);
      for (const needle of needles) {
        assert(!text.includes(needle), `${p} leaked "${needle}"`);
      }
    }
    return `${paths.length} HOD responses scanned, 0 of ${needles.length} location fields present`;
  });

  // ── 14. No hardcoded statistics ────────────────────────────────────────────
  await check('An empty department reports zeros rather than placeholder figures', async () => {
    const eceOnly = await makeHod(ece, 'empty');
    const r = await http('GET', '/api/hod/dashboard', { token: eceOnly.token });
    assert(r.status === 200, `empty-department dashboard -> ${r.status}`);
    const d = r.body.data;
    assert(d.summary.totalStudents === 2, 'seed check failed');
    // Now assert the maths is derived, not fixed: a second HOD over the SAME
    // department must see identical numbers (proves they are data, not a
    // constant baked into the controller).
    const second = await http('GET', '/api/hod/dashboard', { token: hodEce.token });
    assert(
      JSON.stringify(second.body.data.summary) === JSON.stringify(d.summary),
      'two reads of the same department disagreed'
    );
    // And a department with no students at all must not divide by zero.
    const other: any = await Department.create({ code: 'ZZZ', name: 'Zero Department' } as any);
    const zeroHod = await makeHod(other, 'zero');
    const zero = await http('GET', '/api/hod/dashboard', { token: zeroHod.token });
    assert(zero.status === 200, `zero-department dashboard -> ${zero.status}`);
    assert(zero.body.data.summary.totalStudents === 0, 'zero department reported students');
    assert(zero.body.data.summary.overallMentoringCoverage === 0, 'zero department reported a non-zero coverage');
    assert(zero.body.data.pie.total === 0, 'zero department reported a non-zero pie total');
    return 'identical reads agree; an empty department yields 0 students / 0% coverage / pie total 0 (no NaN, no placeholder)';
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== HOD DEPARTMENT SCOPING VERIFICATION ==========\n');
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