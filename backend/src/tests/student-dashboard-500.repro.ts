/**
 * STUDENT DASHBOARD 500 REPRODUCTION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint against a real mongod process and
 * replays the EXACT two requests the Student Dashboard issues on load:
 *
 *   1. GET /api/students/{studentId}          (api.students.getById)
 *   2. GET /api/meetings/schedule/current     (api.meetings.getSchedule)
 *
 * Both are awaited inside a single `Promise.all` in StudentDashboard.loadData(),
 * so a 5xx on EITHER one renders the generic "500 Something Went Wrong" page.
 *
 * Server-side `console.error` output is captured so the real exception/stack
 * that produced the 500 is reported instead of guessed at.
 *
 * Run: npx tsx src/tests/student-dashboard-500.repro.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

// Reuse the mongod binary already present on this machine (no network needed).
const BIN_DIR = path.join(process.env.USERPROFILE || '', '.cache', 'mongodb-binaries');
if (fs.existsSync(BIN_DIR)) {
  process.env.MONGOMS_DOWNLOAD_DIR = BIN_DIR;
  process.env.MONGOMS_SYSTEM_BINARY = path.join(BIN_DIR, 'mongod-x64-win32-8.2.6.exe');
}

const WORK = 'A:\\mini projects\\New folder\\.runtime-verify';
const DB_PATH = path.join(WORK, 'mongo-repro-data');
fs.mkdirSync(DB_PATH, { recursive: true });
process.env.TMPDIR = WORK;
process.env.TMP = WORK;
process.env.TEMP = WORK;

const PORT = 5131;
process.env.PORT = String(PORT);
// Production-equivalent: this is how Render runs the service.
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'dashboard-500-repro-secret-not-a-real-secret';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'IT';

const BASE = `http://127.0.0.1:${PORT}`;

// ── capture server-side logging so we can see the real stack trace ───────────
const serverLogs: string[] = [];
const realConsoleError = console.error.bind(console);
const realConsoleWarn = console.warn.bind(console);
const realConsoleLog = console.log.bind(console);
function capture(prefix: string) {
  return (...args: any[]) => {
    const text = args
      .map((a) => (a instanceof Error ? `${a.stack || a.message}` : typeof a === 'string' ? a : safeJson(a)))
      .join(' ');
    serverLogs.push(`${prefix} ${text}`);
    realConsoleError(`${prefix} ${text}`);
  };
}
function safeJson(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

async function http(method: string, p: string, opts: { token?: string; body?: any } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function waitForHealth(tries = 90) {
  for (let i = 0; i < tries; i++) {
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

const scenarios: {
  key: string;
  label: string;
  reg: string;
  make: (ctx: any) => Promise<any>;
}[] = [];

async function main() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  for (const e of fs.readdirSync(DB_PATH)) {
    fs.rmSync(path.join(DB_PATH, e), { recursive: true, force: true });
  }
  const mem = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbPath: DB_PATH, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_URI = mem.getUri('ksrce_dashboard_repro');
  realConsoleLog(`\n### mongod at ${process.env.MONGODB_URI}`);

  console.error = capture('[server:error]');
  console.warn = capture('[server:warn]');

  await import('../index.js');
  await waitForHealth();
  realConsoleLog(`### server up (NODE_ENV=${process.env.NODE_ENV}) on ${BASE}\n`);

  const { User, Student, Department, Batch, Faculty, MentorAssignment, AcademicRecord, CounsellingRecord, Meeting, StudentDocument } =
    await import('../models/index.js');

  const cse: any = await Department.findOne({ code: 'CSE' });
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  const admin: any = await User.findOne({ role: 'ADMIN' });
  const hash = (p: string) => bcrypt.hashSync(p, 10);

  const mentorUser: any = await User.create({
    username: 'mentor.cs', passwordHash: hash('Mentor@123'), role: 'FACULTY',
    email: 'mentor.cs@ksrce.test', fullName: 'Dr Anita Menon', department: cse._id, isActive: true,
  });
  const mentor: any = await Faculty.create({
    user: mentorUser._id, employeeId: 'FAC001', fullName: 'Dr Anita Menon',
    email: 'mentor.cs@ksrce.test', designation: 'Associate Professor',
    department: cse._id, isActive: true,
  } as any);

  async function makeStudent(reg: string, name: string, extra: any = {}) {
    const u: any = await User.create({
      username: reg, passwordHash: hash('Student@123'), role: 'STUDENT',
      email: `${reg}@ksrce.test`, fullName: name, department: cse._id, isActive: true,
    });
    const s: any = await Student.create({
      user: u._id, fullName: name, registerNumber: reg, email: `${reg}@ksrce.test`,
      department: cse._id, batch: batch._id, section: 'A', year: 2,
      profileCompleted: true, isActive: true, ...extra,
    } as any);
    return s;
  }

  // ---- S1: normal student, full academic + counselling + meeting data ------
  const s1 = await makeStudent('731523205001', 'Normal Student', {
    mobileNumber: '9876543210', dateOfBirth: new Date('2004-05-14'),
    school: { tenthMark: 92, tenthSchool: 'GHSS', twelfthMark: 88, twelfthSchool: 'SRM', cutoffMark: 78, admissionType: 'COUNSELLING' },
  });
  await MentorAssignment.create({ mentor: mentor._id, student: s1._id, department: cse._id, assignedBy: admin._id, status: 'ACTIVE' });
  await AcademicRecord.create({ student: s1._id, semesterNumber: 3, cgpa: 7.2, sgpa: 7.4, arrearsCount: 1, arrearsSubjects: '24CS301', clearedSubjects: [], remarks: 'Active Arrear' } as any);
  await AcademicRecord.create({ student: s1._id, semesterNumber: 4, cgpa: 8.1, sgpa: 8.3, arrearsCount: 0, arrearsSubjects: '', clearedSubjects: [], remarks: 'Clear' } as any);
  await CounsellingRecord.create({ student: s1._id, sessionDate: new Date(), category: 'ACADEMIC', challengeObserved: 'x', correctiveAction: 'y', mentorRemarks: 'z' } as any);
  await Meeting.create({ student: s1._id, mentor: mentor._id, meetingDate: '2026-10-03', meetingTime: '10:30 AM', location: 'Cabin', meetingStatus: 'COMPLETED', attendanceStatus: 'PRESENT', challengesDiscussed: 'Time management', correctiveAction: 'Weekly planner', studentFeedback: 'Good', mentorRemarks: 'Improving' } as any);

  // ---- S2: no academic records at all -------------------------------------
  const s2 = await makeStudent('731523205002', 'No Academics');

  // ---- S3: no counselling records, no meeting -----------------------------
  const s3 = await makeStudent('731523205003', 'No Counselling', {
    mobileNumber: '9876543213', address: 'K Pallayam',
    school: { tenthMark: 75, tenthSchool: 'GHS', twelfthMark: 70, twelfthSchool: 'BHSS', cutoffMark: 65, admissionType: 'LATERAL_ENTRY', lateralEntry: { previousCourseDiploma: 'DIPLOMA IN CSE' } },
  });

  // ---- S4: has documents ---------------------------------------------------
  const s4 = await makeStudent('731523205004', 'Has Documents', { mobileNumber: '9876543214' });
  await StudentDocument.create({
    studentId: s4._id, fileName: 'marksheet.pdf', documentType: 'certificate', fileUrl: 'uploads/documents/x.pdf', category: 'Academic',
  } as any);

  // ---- S5: empty optional fields (bare minimum record) ---------------------
  const s5 = await makeStudent('731523205005', 'Empty Optionals');

  const cases = [
    { key: 'S1', label: 'normal student (academics + counselling + meeting + mentor)', reg: '731523205001' },
    { key: 'S2', label: 'student with NO academic records', reg: '731523205002' },
    { key: 'S3', label: 'student with NO counselling records', reg: '731523205003' },
    { key: 'S4', label: 'student WITH documents', reg: '731523205004' },
    { key: 'S5', label: 'student with EMPTY optional fields', reg: '731523205005' },
  ];

  realConsoleLog('=== REPRODUCTION: Student Dashboard load requests ===\n');

  let failures = 0;
  for (const c of cases) {
    const login = await http('POST', '/api/auth/login', { body: { username: c.reg, password: 'Student@123' } });
    if (login.status !== 200) {
      realConsoleLog(`[${c.key}] login FAILED ${login.status} ${safeJson(login.body)}`);
      failures++;
      continue;
    }
    const token = login.body?.data?.token;
    const studentId = login.body?.data?.user?.studentId;
    const before = serverLogs.length;

    // EXACT replica of StudentDashboard.loadData()
    const [stu, sched] = await Promise.all([
      http('GET', `/api/students/${studentId}`, { token }),
      http('GET', '/api/meetings/schedule/current', { token }),
    ]);

    const newLogs = serverLogs.slice(before);
    const status = stu.status === 200 && sched.status === 200;
    if (!status) failures++;

    realConsoleLog(
      `[${c.key}] ${c.label}\n` +
      `   GET /api/students/${studentId}        -> ${stu.status} ${stu.status === 200 ? '' : safeJson(stu.body)}\n` +
      `   GET /api/meetings/schedule/current   -> ${sched.status} ${sched.status === 200 ? '' : safeJson(sched.body)}\n` +
      `   dashboard result: ${status ? 'RENDERS' : '*** 500 "Something Went Wrong" ***'}`
    );
    for (const l of newLogs) realConsoleLog(`   > ${l.split('\n').slice(0, 6).join('\n   > ')}`);
    realConsoleLog('');
  }

  realConsoleLog(`=== ${failures === 0 ? 'ALL SCENARIOS OK' : failures + ' SCENARIO(S) FAILED'} ===`);
  await mem.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  realConsoleError('repro harness crashed:', e);
  process.exit(2);
});
