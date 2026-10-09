/**
 * ADMIN DASHBOARD ROUTE MATCH VERIFICATION
 * ---------------------------------------------------------------------------
 * Regression lock for the "Admin Mentoring Dashboard 404" bug.
 *
 * The browser once requested `/api/admin/mentoring-overview/*` (and was 404 on
 * `/api/admin/hods`). The ACTUAL server mount points are `/api/admin/overview`
 * (college-wide mentoring dashboard) and `/api/admin` (HOD Management etc.),
 * so the frontend must only ever call those. This suite boots the REAL
 * production entrypoint (src/index.ts) over HTTP and asserts:
 *   - every correct URL the Admin UI calls returns 200 with real data
 *   - the WRONG `mentoring-overview` prefix is refused (404) — proving no
 *     duplicate routes were added that would let a stale client keep working
 *   - the same routes stay ADMIN-only (HOD 403, anonymous 401)
 *   - `/api/admin/hods` (HOD Management) works
 *   - the verified HOD department-scoped surface still works afterwards
 *   - `frontend/src/api/client.ts` itself never contains the wrong prefix
 *
 * Run: npm run test:admin-routes
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('admin-dashboard-routes-verify');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5102;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-routes-secret-do-not-use-in-prod';
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

/** Assert the frontend API client ships the exact route strings. */
function verifyFrontendClient() {
  const clientPath = path.resolve(process.cwd(), '..', 'frontend', 'src', 'api', 'client.ts');
  const src = fs.readFileSync(clientPath, 'utf8');
  const mustHave = [
    "/admin/overview/dashboard",
    "/admin/overview/hods",
    "/admin/overview/departments",
    "/admin/overview/department-comparison",
    "/admin/hods",
  ];
  const mustNotHave = [
    "/admin/mentoring-overview",
    "mentoring-overview/dashboard",
    "mentoring-overview/hods",
    "mentoring-overview/departments",
    "mentoring-overview/mentoring-comparison",
  ];
  for (const needle of mustHave) {
    assert(src.includes(needle), `frontend client.ts is missing the route ${needle}`);
  }
  for (const needle of mustNotHave) {
    assert(!src.includes(needle), `frontend client.ts still requests the wrong route ${needle}`);
  }
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Student, Faculty, Department, Batch, MentorAssignment, CounsellingRecord } =
    await import('../models/index.js');

  const hash = bcrypt.hashSync('Mentor@123', 10);

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

  async function makeHod(dept: any, suffix: string) {
    const user: any = await User.create({
      username: `routes.hod.${suffix}`, passwordHash: hash, role: 'HOD',
      email: `routes.hod.${suffix}@ksrce.test`, fullName: `Dr Routes Hod ${suffix.toUpperCase()}`,
      department: dept._id, isActive: true,
    });
    const login = await http('POST', '/api/auth/login', {
      body: { username: `routes.hod.${suffix}`, password: 'Mentor@123' },
    });
    const token = login.body?.data?.token || login.body?.token;
    assert(token, `${suffix} HOD could not log in`);
    return { user, token, deptId: String(dept._id) };
  }

  async function makeMentor(dept: any, empId: string, name: string) {
    const user: any = await User.create({
      username: `routes.fac.${empId.toLowerCase()}`, passwordHash: hash, role: 'FACULTY',
      email: `routes.fac.${empId.toLowerCase()}@ksrce.test`, fullName: name,
      department: dept._id, isActive: true,
    });
    const faculty: any = await Faculty.create({
      user: user._id, employeeId: empId, department: dept._id,
      designation: 'Professor', cabinLocation: 'R-1', isActive: true,
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

  const cseMentor = await makeMentor(cse, 'RTCSE1', 'Dr Routes Cse');
  const eceMentor = await makeMentor(ece, 'RTECE1', 'Dr Routes Ece');

  const cseS1 = await makeStudent(cse, 'RTCSE001', 'Routes Cse One');
  const cseS2 = await makeStudent(cse, 'RTCSE002', 'Routes Cse Two');
  const eceS1 = await makeStudent(ece, 'RTECE001', 'Routes Ece One');

  await MentorAssignment.create({
    student: cseS1.student._id, mentor: cseMentor.faculty._id, department: cse._id,
    assignedFrom: dayOffset(-120), status: 'ACTIVE', assignedBy: hodCse.user._id,
    changeReason: 'Seed',
  } as any);
  await MentorAssignment.create({
    student: cseS2.student._id, mentor: cseMentor.faculty._id, department: cse._id,
    assignedFrom: dayOffset(-120), status: 'ACTIVE', assignedBy: hodCse.user._id,
    changeReason: 'Seed',
  } as any);
  await MentorAssignment.create({
    student: eceS1.student._id, mentor: eceMentor.faculty._id, department: ece._id,
    assignedFrom: dayOffset(-120), status: 'ACTIVE', assignedBy: hodEce.user._id,
    changeReason: 'Seed',
  } as any);

  // CSE: one student mentored this month (counts once even with two records);
  // the other stays pending. ECE student stays pending.
  await CounsellingRecord.create({
    student: cseS1.student._id, mentor: cseMentor.faculty._id,
    sessionDate: dayOffset(-2), date: dayOffset(-2), categories: ['Academic Development'],
    discussionWith: ['student'], challengeObserved: 'Needs focus', correctiveAction: 'Study plan',
  } as any);
  await CounsellingRecord.create({
    student: cseS1.student._id, mentor: cseMentor.faculty._id,
    sessionDate: dayOffset(-1), date: dayOffset(-1), categories: ['Skill Development'],
    discussionWith: ['student'], challengeObserved: 'Confidence', correctiveAction: 'Group work',
  } as any);

  // ── 1. The exact URLs the Admin dashboard calls must return 200 ───────────
  await check('The Admin Mentoring Dashboard endpoints the UI calls all return 200', async () => {
    const targets: Array<[string, string]> = [
      ['/api/admin/overview/dashboard', 'dashboard'],
      ['/api/admin/overview/hods', 'hods'],
      ['/api/admin/overview/departments', 'departments'],
      ['/api/admin/overview/department-comparison', 'comparison'],
      ['/api/admin/overview/departments/' + cse._id, 'department detail'],
      ['/api/admin/overview/departments/' + cse._id + '/mentors', 'department mentors'],
      ['/api/admin/overview/mentors/' + cseMentor.id, 'mentor detail'],
      ['/api/admin/overview/report-30-day', '30-day report'],
    ];
    for (const [url, label] of targets) {
      const r = await http('GET', url, { token: adminToken });
      assert(r.status === 200, `GET ${url} -> ${r.status} (${JSON.stringify(r.body).slice(0, 120)}) [${label}]`);
    }
    return `${targets.length} /api/admin/overview/* URLs all returned 200 with an Admin token`;
  });

  await check('The dashboard data loads, not just a status code', async () => {
    const r = await http('GET', '/api/admin/overview/dashboard', { token: adminToken });
    const d = r.body.data;
    assert(d && typeof d === 'object', 'dashboard payload missing data object');
    assert(Array.isArray(d.weeklyProgress), 'dashboard payload has no weeklyProgress array');
    const pie = d.pie;
    assert(typeof pie.mentored === 'number' && typeof pie.pending === 'number', 'dashboard has no mentored/pending split');
    assert(pie.mentored === 1, `mentored this month ${pie.mentored}, expected 1 (one student, two records = once)`);
    assert(pie.pending === 2, `pending ${pie.pending}, expected 2 (CSE two + ECE one)`);
    return `pie mentored ${pie.mentored} / pending ${pie.pending}; records de-duplicated by student`;
  });

  await check('HOD overview, department overview and comparison all return data', async () => {
    const hods = await http('GET', '/api/admin/overview/hods', { token: adminToken });
    assert(hods.status === 200, `hods -> ${hods.status}`);
    assert(Array.isArray(hods.body.data.hods), 'hods payload has no hods array');
    assert(hods.body.data.hods.some((x: any) => x.hodName && String(x.departmentId) === String(cse._id)),
      `CSE HOD row missing from overview: ${JSON.stringify(hods.body.data).slice(0, 200)}`);

    const depts = await http('GET', '/api/admin/overview/departments', { token: adminToken });
    assert(depts.status === 200, `departments -> ${depts.status}`);
    const deptRows = depts.body.data.departments as any[];
    const cseRow = deptRows.find((x) => String(x.departmentId) === String(cse._id));
    const eceRow = deptRows.find((x) => String(x.departmentId) === String(ece._id));
    assert(cseRow && eceRow, 'department overview is missing CSE or ECE rows');
    assert(cseRow.students === 2 && eceRow.students === 1, `student counts ${cseRow.students}/${eceRow.students} != 2/1`);

    const cmp = await http('GET', '/api/admin/overview/department-comparison', { token: adminToken });
    assert(cmp.status === 200, `comparison -> ${cmp.status}`);
    const cmpIds = (cmp.body.data.departments as any[]).map((x: any) => String(x.departmentId)).sort();
    assert(cmpIds.includes(String(cse._id)) && cmpIds.includes(String(ece._id)), 'comparison rows do not match departments');
    return `hods ${hods.body.data.hods.length} row(s); CSE ${cseRow.students} students / ECE ${eceRow.students}; comparison ${cmpIds.length} rows`;
  });

  // ── 2. The wrong legacy prefix must NOT exist (no duplicate routes) ───────
  await check('The old mentoring-overview prefix is refused — no duplicate routes were added', async () => {
    const wrong = [
      '/api/admin/mentoring-overview/dashboard',
      '/api/admin/mentoring-overview/hods',
      '/api/admin/mentoring-overview/departments',
      '/api/admin/mentoring-overview/mentoring-comparison',
    ];
    for (const url of wrong) {
      const r = await http('GET', url, { token: adminToken });
      assert(r.status === 404, `GET ${url} -> ${r.status}, expected 404 (route must not exist)`);
    }
    return `${wrong.length} legacy /api/admin/mentoring-overview/* URLs -> 404; nothing for a stale client to call`;
  });

  await check('frontend client.ts ships exactly the server routes, never the wrong prefix', async () => {
    verifyFrontendClient();
    return 'client.ts contains /admin/overview/{dashboard,hods,departments,department-comparison} and /admin/hods only';
  });

  // ── 3. /api/admin/hods (HOD Management) ───────────────────────────────────
  await check('GET /api/admin/hods used by HOD Management still works', async () => {
    const r = await http('GET', '/api/admin/hods', { token: adminToken });
    assert(r.status === 200, `GET /api/admin/hods -> ${r.status}`);
    const data = r.body.data;
    assert(Array.isArray(data?.hods) || Array.isArray(data), 'hods payload has no list');
    const list: any[] = Array.isArray(data) ? data : data.hods;
    assert(list.length === 2, `expected the 2 seeded HODs, found ${list.length}`);
    assert(list.some((h) => String(h.department_id) === String(cse._id)), 'CSE HOD not in the list');
    return `${list.length} HODs (both departments listed) with data`;
  });

  // ── 4. Admin-only authorization preserved ─────────────────────────────────
  await check('The overview surface stays ADMIN-only', async () => {
    const asHod = await http('GET', '/api/admin/overview/dashboard', { token: hodCse.token });
    assert(asHod.status === 403, `HOD on overview/dashboard -> ${asHod.status}, expected 403`);
    const asHodHods = await http('GET', '/api/admin/hods', { token: hodCse.token });
    assert(asHodHods.status === 403, `HOD on /api/admin/hods -> ${asHodHods.status}, expected 403`);
    const anon = await http('GET', '/api/admin/overview/dashboard');
    assert(anon.status === 401, `anonymous on overview/dashboard -> ${anon.status}, expected 401`);
    return `HOD user 403 on overview+admin/hods, anonymous 401`;
  });

  // ── 5. HOD regression — department isolation untouched ────────────────────
  await check('The verified HOD department-scoped dashboard is unchanged', async () => {
    const cseHod = await http('GET', '/api/hod/dashboard', { token: hodCse.token });
    assert(cseHod.status === 200, `GET /api/hod/dashboard (CSE HOD) -> ${cseHod.status}`);
    assert(cseHod.body.data.summary.totalStudents === 2, `CSE HOD totalStudents ${cseHod.body.data.summary.totalStudents}, expected 2`);
    const eceHod = await http('GET', '/api/hod/dashboard', { token: hodEce.token });
    assert(eceHod.status === 200, `GET /api/hod/dashboard (ECE HOD) -> ${eceHod.status}`);
    assert(eceHod.body.data.summary.mentoredThisMonth === 0, 'ECE HOD sees a CSE mentoring record');
    return 'CSE HOD 200 (2 students), ECE HOD 200 (1 student, 0 mentored) — isolation intact';
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== ADMIN DASHBOARD ROUTE MATCH VERIFICATION ==========\n');
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