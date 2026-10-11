/**
 * HOD CLASS MANAGEMENT VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives the new /api/hod/class-management endpoints over HTTP
 * exactly as the Class Management page does.
 *
 * Two departments are seeded with students spread across study years, sections
 * and cohorts, so the grouping and the department boundary are provable rather
 * than assumed:
 *   - every year + section must appear exactly once in the unfiltered list
 *   - student counts and the derived cohort label must come from stored rows
 *   - a HOD must never see another department's classes or roster
 *
 * Run: npm run test:hod-class-management
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('hod-class-verify');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5098;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'hod-class-secret-do-not-use-in-prod';
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

  const { User, Student, Department, Batch } = await import('../models/index.js');

  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  assert(cse && ece, 'bootstrap did not create the expected reference data');

  const hash = bcrypt.hashSync('Mentor@123', 10);

  async function makeHod(dept: any, suffix: string) {
    const user: any = await User.create({
      username: `cm.hod.${suffix}`, passwordHash: hash, role: 'HOD',
      email: `cm.hod.${suffix}@ksrce.test`, fullName: `Dr Class Hod ${suffix.toUpperCase()}`,
      department: dept._id, isActive: true,
    });
    const login = await http('POST', '/api/auth/login', {
      body: { username: `cm.hod.${suffix}`, password: 'Mentor@123' },
    });
    const token = login.body?.data?.token || login.body?.token;
    assert(token, `${suffix} HOD could not log in`);
    return { user, token, deptId: String(dept._id) };
  }

  const batch2024: any = await Batch.findOne({ name: '2024-2028' });
  const batch2023: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch2024 && batch2023, 'bootstrap did not create the expected batches');

  async function makeStudent(dept: any, reg: string, name: string, year: number, section: string, batchId: any) {
    const user: any = await User.create({
      username: reg.toLowerCase(), passwordHash: hash, role: 'STUDENT',
      email: `${reg.toLowerCase()}@ksrce.test`, fullName: name,
      department: dept._id, isActive: true,
    });
    const student: any = await Student.create({
      user: user._id, registerNumber: reg, fullName: name,
      department: dept._id, batch: batchId, year, section,
      residentialType: 'DAY_SCHOLAR',
      parent: {}, siblings: [], school: {}, profileCompleted: false, isActive: true,
    } as any);
    return { user, student, id: String(student._id) };
  }

  const hodCse = await makeHod(cse, 'cse');
  const hodEce = await makeHod(ece, 'ece');

  // CSE: year 1 has two sections (A: 2, B: 1); year 2 has section A (1).
  // ECE: year 1 section A (1) — must never appear in the CSE HOD's lists.
  await makeStudent(cse, 'CM100002', 'Cse Y1 A Two', 1, 'A', batch2024._id);
  await makeStudent(cse, 'CM100001', 'Cse Y1 A One', 1, 'A', batch2024._id);
  await makeStudent(cse, 'CM100003', 'Cse Y1 B One', 1, 'B', batch2024._id);
  await makeStudent(cse, 'CM200001', 'Cse Y2 A One', 2, 'A', batch2023._id);
  await makeStudent(ece, 'CM900001', 'Ece Y1 A One', 1, 'A', batch2024._id);

  // A non-HOD token to prove the role gate.
  const studentLogin = await http('POST', '/api/auth/login', {
    body: { username: 'cm100001', password: 'Mentor@123' },
  });
  const studentToken = studentLogin.body?.data?.token || studentLogin.body?.token;
  assert(studentToken, 'seeded student could not log in');

  // ── 1. Unfiltered class list ───────────────────────────────────────────────
  await check('Unfiltered list groups every year + section exactly once', async () => {
    const r = await http('GET', '/api/hod/class-management/classes', { token: hodCse.token });
    assert(r.status === 200, `GET classes -> ${r.status}`);
    const list = r.body.data as any[];
    assert(list.length === 3, `expected 3 classes, got ${list.length}: ${JSON.stringify(list.map((c) => `${c.year}${c.section}`))}`);
    const keys = list.map((c) => `${c.year}${c.section}`);
    assert(new Set(keys).size === keys.length, `duplicate class keys: ${keys.join(',')}`);
    assert(keys.join(',') === '1A,1B,2A', `unexpected order/keys: ${keys.join(',')}`);
    const y1a = list.find((c) => c.year === 1 && c.section === 'A');
    assert(y1a.studentCount === 2, `year1 sectionA studentCount ${y1a.studentCount}, expected 2`);
    assert(y1a.academicYear === '2024-2028', `year1 sectionA cohort ${y1a.academicYear}`);
    assert(Array.isArray(y1a.subjects) && y1a.subjects.length === 0, 'subjects should be empty without recorded marks');
    const y2a = list.find((c) => c.year === 2);
    assert(y2a.academicYear === '2023-2027', `year2 cohort ${y2a.academicYear}`);
    return `3 classes (1A=2, 1B=1, 2A=1), cohorts derived from batches, subjects empty`;
  });

  await check('Year filter narrows the list to one study year', async () => {
    const r = await http('GET', '/api/hod/class-management/classes?year=1', { token: hodCse.token });
    assert(r.status === 200, `GET classes?year=1 -> ${r.status}`);
    const list = r.body.data as any[];
    assert(list.length === 2, `expected 2 year-1 classes, got ${list.length}`);
    assert(list.every((c) => c.year === 1), 'a non year-1 class leaked into the filtered list');
    return `year=1 -> ${list.length} sections (${list.map((c) => c.section).join(', ')})`;
  });

  await check('Cohort filter narrows the list to one batch session', async () => {
    const r = await http('GET', '/api/hod/class-management/classes?academicYear=2023-2027', { token: hodCse.token });
    assert(r.status === 200, `GET classes?academicYear=... -> ${r.status}`);
    const list = r.body.data as any[];
    assert(list.length === 1, `expected 1 class for cohort 2023-2027, got ${list.length}`);
    assert(list[0].year === 2 && list[0].section === 'A', `unexpected class ${list[0].year}${list[0].section}`);
    return `academicYear=2023-2027 -> ${list.length} class (2A)`;
  });

  await check('An invalid year value is rejected with 400', async () => {
    const r = await http('GET', '/api/hod/class-management/classes?year=abc', { token: hodCse.token });
    assert(r.status === 400, `invalid year expected 400, got ${r.status}`);
    return `year=abc -> ${r.status}`;
  });

  // ── 2. Class roster ────────────────────────────────────────────────────────
  await check('Class roster returns only that class, sorted by register number', async () => {
    const r = await http('GET', '/api/hod/class-management/students?year=1&section=A', { token: hodCse.token });
    assert(r.status === 200, `GET class students -> ${r.status}`);
    const list = r.body.data as any[];
    assert(list.length === 2, `expected 2 students in 1A, got ${list.length}`);
    const regs = list.map((s) => s.registerNumber);
    assert(regs.join(',') === 'CM100001,CM100002', `unexpected order: ${regs.join(',')}`);
    assert(list.every((s) => s.year === 1 && s.section === 'A'), 'roster contained a student from another class');
    assert(list.every((s) => s.batch === '2024-2028'), 'roster batch label missing');
    return `1A roster -> ${regs.join(', ')} (no marks, sorted)`;
  });

  await check('Class roster requires year and section', async () => {
    const r = await http('GET', '/api/hod/class-management/students?year=1', { token: hodCse.token });
    assert(r.status === 400, `missing section expected 400, got ${r.status}`);
    return `students?year=1 -> ${r.status}`;
  });

  // ── 3. Department boundary ─────────────────────────────────────────────────
  await check('Classes and roster never cross the department boundary', async () => {
    const eceClasses = await http('GET', '/api/hod/class-management/classes', { token: hodEce.token });
    assert(eceClasses.status === 200, `ECE classes -> ${eceClasses.status}`);
    const eceList = eceClasses.body.data as any[];
    assert(eceList.length === 1, `ECE expected 1 class, got ${eceList.length}`);
    assert(eceList[0].studentCount === 1, `ECE class studentCount ${eceList[0].studentCount}`);

    const cseRoster = await http('GET', '/api/hod/class-management/students?year=1&section=A', { token: hodCse.token });
    const leaked = (cseRoster.body.data as any[]).some((s) => s.registerNumber === 'CM900001');
    assert(!leaked, 'CSE roster leaked the ECE student');
    return `CSE HOD -> 3 classes / ECE HOD -> 1 class; CSE roster excludes the ECE student`;
  });

  // ── 4. Role gate ───────────────────────────────────────────────────────────
  await check('Class endpoints are HOD-only', async () => {
    const anon = await http('GET', '/api/hod/class-management/classes');
    assert(anon.status === 401, `anonymous classes expected 401, got ${anon.status}`);
    const asStudent = await http('GET', '/api/hod/class-management/classes', { token: studentToken });
    assert(asStudent.status === 403, `student classes expected 403, got ${asStudent.status}`);
    const rosterAsStudent = await http('GET', '/api/hod/class-management/students?year=1&section=A', { token: studentToken });
    assert(rosterAsStudent.status === 403, `student roster expected 403, got ${rosterAsStudent.status}`);
    return `anonymous -> ${anon.status}, student -> ${asStudent.status}, student roster -> ${rosterAsStudent.status}`;
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== HOD CLASS MANAGEMENT VERIFICATION ==========\n');
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
