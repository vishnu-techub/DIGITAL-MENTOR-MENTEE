/**
 * ADMIN DASHBOARD — STATISTICS-CARD DETAIL VIEWS
 * ---------------------------------------------------------------------------
 * Locks the drill-down behaviour behind the seven Admin overview cards.
 *
 * Boots the REAL production entrypoint (src/index.ts) over HTTP against a
 * temporary local store and asserts:
 *   - the three new `dashboard-details` endpoints return real records and their
 *     totals RECONCILE with the matching aggregate from `/api/admin/dashboard-stats`
 *   - search + pagination work and are honest
 *   - the `assignmentStatus` filter on `/api/students` is applied at the QUERY
 *     level (assigned + unassigned == total), fixing the previously ignored param
 *   - every detail endpoint stays ADMIN-only (HOD 403, anonymous 401)
 *   - `frontend/src/api/client.ts` ships exactly these routes
 *
 * Run: npm run test:admin-stat-details
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

const store = useTemporaryLocalStore('admin-stat-details-verify');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5117;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-stat-details-secret-do-not-use-in-prod';
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

/** YYYY-MM-DD for `offset` days from today. */
function dayOffset(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

function verifyFrontendClient() {
  const clientPath = path.resolve(process.cwd(), '..', 'frontend', 'src', 'api', 'client.ts');
  const src = fs.readFileSync(clientPath, 'utf8');
  const mustHave = [
    '/admin/dashboard-details/active-arrears',
    '/admin/dashboard-details/mentoring-sessions',
    '/admin/dashboard-details/documents',
  ];
  for (const needle of mustHave) {
    assert(src.includes(needle), `frontend client.ts is missing the route ${needle}`);
  }
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Student, Faculty, Department, Batch, MentorAssignment, CounsellingRecord, AcademicRecord, StudentDocument } =
    await import('../models/index.js');

  const hash = bcrypt.hashSync('Mentor@123', 10);

  const adminLogin = await http('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'Admin@12345' },
  });
  const adminToken = adminLogin.body?.data?.token || adminLogin.body?.token;
  assert(adminToken, 'admin could not log in');

  const cse: any = await Department.findOne({ code: 'CSE' });
  assert(cse, 'bootstrap did not create the CSE department');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'bootstrap did not create a batch');

  // ── Seed ────────────────────────────────────────────────────────────────
  const hodUser: any = await User.create({
    username: 'stats.hod', passwordHash: hash, role: 'HOD',
    email: 'stats.hod@ksrce.test', fullName: 'Dr Stats Hod', department: cse._id, isActive: true,
  });
  const hodLogin = await http('POST', '/api/auth/login', {
    body: { username: 'stats.hod', password: 'Mentor@123' },
  });
  const hodToken = hodLogin.body?.data?.token || hodLogin.body?.token;
  assert(hodToken, 'HOD could not log in');

  const mentorUser: any = await User.create({
    username: 'stats.fac', passwordHash: hash, role: 'FACULTY',
    email: 'stats.fac@ksrce.test', fullName: 'Dr Stats Mentor', department: cse._id, isActive: true,
  });
  const mentor: any = await Faculty.create({
    user: mentorUser._id, employeeId: 'STFAC1', department: cse._id,
    designation: 'Professor', cabinLocation: 'S-1', isActive: true,
  } as any);

  async function makeStudent(reg: string, name: string) {
    const user: any = await User.create({
      username: reg.toLowerCase(), passwordHash: hash, role: 'STUDENT',
      email: `${reg.toLowerCase()}@ksrce.test`, fullName: name, department: cse._id, isActive: true,
    });
    const student: any = await Student.create({
      user: user._id, registerNumber: reg, fullName: name, department: cse._id, batch: batch._id,
      residentialType: 'DAY_SCHOLAR', parent: {}, siblings: [], school: {}, profileCompleted: true, isActive: true,
    } as any);
    return student;
  }

  const sAssigned1 = await makeStudent('STSTA001', 'Stats Assigned One');
  const sAssigned2 = await makeStudent('STSTA002', 'Stats Assigned Two');
  const sUnassigned = await makeStudent('STSTU003', 'Stats Unassigned Three');
  const sArrear = await makeStudent('STARR004', 'Stats Arrear Four');

  await MentorAssignment.create({
    student: sAssigned1._id, mentor: mentor._id, department: cse._id,
    assignedFrom: dayOffset(-90), status: 'ACTIVE', assignedBy: hodUser._id, changeReason: 'Seed',
  } as any);
  await MentorAssignment.create({
    student: sAssigned2._id, mentor: mentor._id, department: cse._id,
    assignedFrom: dayOffset(-90), status: 'ACTIVE', assignedBy: hodUser._id, changeReason: 'Seed',
  } as any);

  // Active arrears on ONE student: two subjects in semester 3 (structured detail).
  await AcademicRecord.create({
    student: sArrear._id, semesterNumber: 3, cgpa: 6.4, sgpa: 6.1, arrearsCount: 2,
    arrearsSubjects: 'ST301, ST302',
    arrearSubjectDetails: [
      { subjectCode: 'ST301', subjectName: 'Discrete Mathematics' },
      { subjectCode: 'ST302', subjectName: 'Data Structures' },
    ],
  } as any);

  // Mentoring sessions (college-wide list).
  await CounsellingRecord.create({
    student: sAssigned1._id, mentor: mentor._id, sessionDate: dayOffset(-3), date: dayOffset(-3),
    categories: ['Academic Development'], discussionWith: ['student'],
    challengeObserved: 'Focus', correctiveAction: 'Plan',
  } as any);
  await CounsellingRecord.create({
    student: sAssigned2._id, mentor: mentor._id, sessionDate: dayOffset(-2), date: dayOffset(-2),
    categories: ['Career Development'], discussionWith: ['student', 'parent'],
    challengeObserved: 'Direction', correctiveAction: 'Guidance',
  } as any);

  // Uploaded documents (college-wide list).
  await StudentDocument.create({
    studentId: sAssigned1._id, documentType: 'certificate', isPrimary: false,
    fileName: 'nptel.pdf', fileUrl: '/uploads/documents/nptel.pdf', title: 'NPTEL Certificate',
    category: 'NPTEL Certificate', fileType: 'application/pdf', fileSize: 1024,
    verificationStatus: 'Verified', uploadedAt: new Date(),
  } as any);
  await StudentDocument.create({
    studentId: sAssigned2._id, documentType: 'certificate', isPrimary: false,
    fileName: 'sih.pdf', fileUrl: '/uploads/documents/sih.pdf', title: 'SIH Certificate',
    category: 'SIH Certificate', fileType: 'application/pdf', fileSize: 2048,
    verificationStatus: 'Pending', uploadedAt: new Date(),
  } as any);

  // ── 1. Aggregates reconcile with the card ────────────────────────────────
  const statsRes = await http('GET', '/api/admin/dashboard-stats', { token: adminToken });
  assert(statsRes.status === 200, `dashboard-stats -> ${statsRes.status}`);
  const stats = statsRes.body.data;

  await check('Active Arrears detail reconciles with the dashboard card', async () => {
    const r = await http('GET', '/api/admin/dashboard-details/active-arrears?limit=25', { token: adminToken });
    assert(r.status === 200, `active-arrears -> ${r.status} (${JSON.stringify(r.body).slice(0, 140)})`);
    const d = r.body.data;
    assert(Array.isArray(d.students), 'no students array');
    assert(d.totalActiveArrears === stats.activeArrears,
      `detail sum ${d.totalActiveArrears} != card ${stats.activeArrears}`);
    assert(d.students.length === 1, `expected 1 student with arrears, got ${d.students.length}`);
    const row = d.students[0];
    assert(row.register_number === 'STARR004', `wrong student ${row.register_number}`);
    assert(row.active_arrears === 2, `expected 2 active arrears, got ${row.active_arrears}`);
    assert(Array.isArray(row.subjects) && row.subjects.length === 2, 'arrear subject details missing');
    assert(row.subjects.every((s: any) => s.semester === 3 && s.subject_code), 'subject detail missing semester/code');
    assert(row.subjects.some((s: any) => s.subject_name === 'Discrete Mathematics'), 'subject name not carried through');
    return `card ${stats.activeArrears} == detail sum ${d.totalActiveArrears} across ${d.total} student(s); subjects carry semester+code+name`;
  });

  await check('Mentoring Sessions detail reconciles with the dashboard card', async () => {
    const r = await http('GET', '/api/admin/dashboard-details/mentoring-sessions?limit=25', { token: adminToken });
    assert(r.status === 200, `mentoring-sessions -> ${r.status}`);
    const d = r.body.data;
    assert(d.total === stats.counsellingSessions,
      `detail total ${d.total} != card ${stats.counsellingSessions}`);
    assert(Array.isArray(d.records) && d.records.length === stats.counsellingSessions, 'record rows missing');
    assert(d.records.every((x: any) => x.student_name && x.mentor_name), 'student/mentor name not populated');
    return `card ${stats.counsellingSessions} == detail total ${d.total}; rows carry student + mentor names`;
  });

  await check('Uploaded Documents detail reconciles with the dashboard card', async () => {
    const r = await http('GET', '/api/admin/dashboard-details/documents?limit=25', { token: adminToken });
    assert(r.status === 200, `documents -> ${r.status}`);
    const d = r.body.data;
    assert(d.total === stats.uploadedDocuments,
      `detail total ${d.total} != card ${stats.uploadedDocuments}`);
    assert(d.documents.every((x: any) => x.student_name && x.title), 'student/title not populated');
    assert(d.documents.every((x: any) => x.verification_status), 'verification status missing');
    return `card ${stats.uploadedDocuments} == detail total ${d.total}; rows carry student, title, verification status`;
  });

  // ── 2. Search + pagination honesty ───────────────────────────────────────
  await check('Detail search narrows the set and pagination is honest', async () => {
    const hay = await http('GET', '/api/admin/dashboard-details/mentoring-sessions?search=Stats%20Assigned%20One', { token: adminToken });
    assert(hay.status === 200, `search -> ${hay.status}`);
    assert(hay.body.data.total === 1, `search returned ${hay.body.data.total}, expected 1`);
    assert(hay.body.data.records[0].student_name === 'Stats Assigned One', 'search matched the wrong student');

    const none = await http('GET', '/api/admin/dashboard-details/documents?search=zzzz-no-match', { token: adminToken });
    assert(none.body.data.total === 0, `non-matching search returned ${none.body.data.total}`);

    const paged = await http('GET', '/api/admin/dashboard-details/mentoring-sessions?limit=1&page=1', { token: adminToken });
    assert(paged.body.data.records.length === 1, 'limit=1 did not return exactly one row');
    assert(paged.body.data.pages === stats.counsellingSessions,
      `pages ${paged.body.data.pages} != ${stats.counsellingSessions} with limit=1`);
    assert(paged.body.data.hasMore === true, 'hasMore should be true on page 1 of 2');
    return `search → 1 row; nonsense → 0; limit=1 → pages=${paged.body.data.pages}, hasMore=true`;
  });

  // ── 3. assignmentStatus filter (the fixed param) ──────────────────────────
  await check('Unassigned Students detail reconciles with the card', async () => {
    const r = await http('GET', '/api/students?assignmentStatus=unassigned&isActive=true&limit=25', { token: adminToken });
    assert(r.status === 200, `unassigned -> ${r.status}`);
    const d = r.body.data;
    assert(d.total === stats.unassignedStudents, `detail total ${d.total} != card ${stats.unassignedStudents}`);
    assert(d.students.every((s: any) => s.assignment_status === 'UNASSIGNED' || s.current_mentor_name === 'Not Assigned'),
      'an assigned student leaked into the unassigned list');
    return `card ${stats.unassignedStudents} == detail total ${d.total}; every row is genuinely unassigned`;
  });

  await check('Assigned Mentees detail lists only students with a mentor', async () => {
    const r = await http('GET', '/api/students?assignmentStatus=assigned&isActive=true&limit=25', { token: adminToken });
    assert(r.status === 200, `assigned -> ${r.status}`);
    const d = r.body.data;
    assert(d.students.length === 2, `expected 2 assigned students, got ${d.students.length}`);
    assert(d.students.every((s: any) => s.assignment_status === 'ACTIVE'), 'a student without an active mentor leaked in');
    assert(d.students.every((s: any) => s.current_mentor_name === 'Dr Stats Mentor'), 'mentor name missing');
    return `2 assigned students, each with an active mentor (${d.students[0].current_mentor_name})`;
  });

  await check('assigned + unassigned == total active students (query-level filter)', async () => {
    const assigned = await http('GET', '/api/students?assignmentStatus=assigned&isActive=true', { token: adminToken });
    const unassigned = await http('GET', '/api/students?assignmentStatus=unassigned&isActive=true', { token: adminToken });
    const all = await http('GET', '/api/students?isActive=true', { token: adminToken });
    assert(assigned.body.data.total + unassigned.body.data.total === all.body.data.total,
      `assigned ${assigned.body.data.total} + unassigned ${unassigned.body.data.total} != total ${all.body.data.total}`);
    assert(assigned.body.data.total === stats.assignedMentees,
      `assigned total ${assigned.body.data.total} != card ${stats.assignedMentees}`);
    return `assigned ${assigned.body.data.total} + unassigned ${unassigned.body.data.total} == ${all.body.data.total} active students`;
  });

  // ── 4. Authorization ─────────────────────────────────────────────────────
  await check('Every detail endpoint stays ADMIN-only', async () => {
    const urls = [
      '/api/admin/dashboard-details/active-arrears',
      '/api/admin/dashboard-details/mentoring-sessions',
      '/api/admin/dashboard-details/documents',
    ];
    for (const url of urls) {
      const asHod = await http('GET', url, { token: hodToken });
      assert(asHod.status === 403, `HOD on ${url} -> ${asHod.status}, expected 403`);
      const anon = await http('GET', url);
      assert(anon.status === 401, `anonymous on ${url} -> ${anon.status}, expected 401`);
    }
    return `${urls.length} endpoints: HOD 403, anonymous 401`;
  });

  await check('frontend client.ts ships the three dashboard-details routes', async () => {
    verifyFrontendClient();
    return 'client.ts contains all three /admin/dashboard-details/* routes';
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== ADMIN STAT-DETAILS VERIFICATION ==========\n');
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
