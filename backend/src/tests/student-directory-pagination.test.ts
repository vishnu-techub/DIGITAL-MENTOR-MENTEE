/**
 * STUDENT DIRECTORY — FULL-DATASET REACHABILITY VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file store and
 * drives GET /api/students over HTTP exactly as the Admin Portal does.
 *
 * The seed deliberately creates MORE students than any single page size
 * (25 / 50 / 100 / 250) so that a silent "first 50 rows" truncation cannot pass.
 *
 * Run: npx tsx src/tests/student-directory-pagination.test.ts
 */
import bcrypt from 'bcryptjs';
import { isValidId, toLocalId, type LocalId } from '../services/localId.js';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('directory-verify');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5098;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'directory-pagination-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';

const BASE = `http://127.0.0.1:${PORT}`;

/** Seed size. Must exceed the largest page size (250) so truncation is provable. */
const SEED_SIZE = 275;
/** 25 students are deliberately left WITHOUT a mentor and PENDING first login. */
const UNASSIGNED_COUNT = 25;

// ── result recording ────────────────────────────────────────────────────────
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

  // Boot the REAL app.
  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Student, Faculty, Department, Batch, MentorAssignment } = await import('../models/index.js');

  // ── SEED ───────────────────────────────────────────────────────────────────
  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  const b1: any = await Batch.findOne({ name: '2023-2027' });
  const b2: any = await Batch.findOne({ name: '2022-2026' });
  assert(cse && ece && b1 && b2, 'bootstrap did not create the expected reference data');

  const admin: any = await User.findOne({ role: 'ADMIN' });
  const hash = bcrypt.hashSync('Mentor@123', 10);

  const mentorUser: any = await User.create({
    username: 'mentor.dir', passwordHash: hash, role: 'FACULTY',
    email: 'mentor.dir@ksrce.test', fullName: 'Dr Directory Mentor', department: cse._id, isActive: true,
  });
  const mentor: any = await Faculty.create({
    user: mentorUser._id, employeeId: 'FAC900', fullName: 'Dr Directory Mentor',
    email: 'mentor.dir@ksrce.test', designation: 'Associate Professor',
    department: cse._id, isActive: true,
  } as any);

  // Register numbers are zero-padded so lexical order == numeric order, matching
  // the backend's `{ registerNumber: 1 }` sort.
  const seedStudents: any[] = [];
  for (let i = 0; i < SEED_SIZE; i++) {
    const regNo = `7315232${String(10000 + i)}`;
    const isUnassigned = i >= SEED_SIZE - UNASSIGNED_COUNT;
    const dept = i % 3 === 0 ? ece : cse;
    const batch = i % 2 === 0 ? b1 : b2;
    const user: any = await User.create({
      username: regNo, passwordHash: bcrypt.hashSync('Student@123', 4), role: 'STUDENT',
      email: `dir${i}@ksrce.test`, fullName: `Directory Student ${String(i).padStart(3, '0')}`,
      department: dept._id, isActive: true,
    });
    const student: any = await Student.create({
      user: user._id, fullName: `Directory Student ${String(i).padStart(3, '0')}`,
      registerNumber: regNo, email: `dir${i}@ksrce.test`, mobileNumber: '9000000000',
      department: dept._id, batch: batch._id, section: 'A', year: 2,
      residentialType: 'DAY_SCHOLAR',
      // Unassigned cohort is also the "Pending (First Login)" cohort, and every
      // 10th student is deactivated, to prove neither is silently dropped.
      profileCompleted: !isUnassigned,
      isActive: i % 10 !== 0,
    } as any);
    seedStudents.push(student);
    if (!isUnassigned) {
      await MentorAssignment.create({
        mentor: mentor._id, student: student._id, department: dept._id,
        assignedBy: admin._id, status: 'ACTIVE',
      });
    }
  }
  const dbTotal = await Student.countDocuments({});
  console.log(`### Seeded ${SEED_SIZE} students (db count = ${dbTotal})\n`);

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  const login = await http('POST', '/api/auth/login', {
    body: { username: 'admin', password: process.env.ADMIN_PASSWORD },
  });
  assert(login.status === 200, `admin login failed: ${login.status}`);
  const token: string = login.body?.data?.token || login.body?.token;
  assert(token, 'admin login returned no token');

  const studentLogin = await http('POST', '/api/auth/login', {
    body: { username: seedStudents[0].registerNumber, password: 'Student@123' },
  });
  const studentToken: string = studentLogin.body?.data?.token || studentLogin.body?.token;

  /** GET /api/students with the Admin token. */
  const getStudents = async (qs = '') => {
    const r = await http('GET', `/api/students${qs}`, { token });
    assert(r.status === 200, `GET /api/students${qs} -> ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body.data;
  };

  console.log('--- verification -------------------------------------------------');

  // 1. No artificial 50-record cap: omitting `limit` returns the whole dataset.
  await check('GET /api/students without `limit` returns EVERY student, not a 50-row slice', async () => {
    const data = await getStudents();
    assert(Array.isArray(data.students), 'response.data.students is missing');
    const ids = new Set(data.students.map((s: any) => s.id));
    assert(data.total === dbTotal, `total ${data.total} != db count ${dbTotal}`);
    assert(data.students.length === dbTotal, `returned ${data.students.length} rows, expected ${dbTotal}`);
    assert(ids.size === dbTotal, `expected ${dbTotal} unique ids, got ${ids.size}`);
    return `total=${data.total} rows=${data.students.length} unique=${ids.size} (db=${dbTotal}); page=${data.page} pages=${data.pages} limit=${data.limit}`;
  });

  // 2. Real total count via countDocuments(), not the page length.
  await check('`total` is the true database total, not the length of the returned page', async () => {
    for (const limit of [25, 50, 100, 250]) {
      const data = await getStudents(`?page=1&limit=${limit}`);
      assert(data.total === dbTotal, `limit=${limit}: total ${data.total} != ${dbTotal}`);
      assert(data.students.length === Math.min(limit, dbTotal), `limit=${limit}: got ${data.students.length} rows`);
      assert(data.limit === limit, `limit=${limit}: echoed limit is ${data.limit}`);
      assert(data.pages === Math.ceil(dbTotal / limit), `limit=${limit}: pages ${data.pages} != ${Math.ceil(dbTotal / limit)}`);
      assert(data.hasMore === dbTotal > limit, `limit=${limit}: hasMore ${data.hasMore}`);
    }
    return `limit 25/50/100/250 all report total=${dbTotal} with correct pages/hasMore`;
  });

  // 3. Page size selector: 250 must work, and 250+ must be clamped, not honoured blindly.
  await check('Page-size selector reaches 250 rows and clamps oversized requests', async () => {
    const at250 = await getStudents('?page=1&limit=250');
    assert(at250.students.length === 250, `limit=250 returned ${at250.students.length}`);
    const over = await getStudents('?page=1&limit=100000');
    assert(over.limit === 250, `limit=100000 was not clamped (got ${over.limit})`);
    assert(over.students.length === 250, `clamped request returned ${over.students.length} rows`);
    // A dataset larger than the max page size is still fully reachable, because
    // the clamp produces extra pages rather than dropping rows.
    const oversize = await getStudents(`?limit=${dbTotal}`);
    assert(oversize.limit === 250, `limit=${dbTotal} should clamp to 250, got ${oversize.limit}`);
    assert(oversize.pages === Math.ceil(dbTotal / 250), `clamped pages ${oversize.pages} != ${Math.ceil(dbTotal / 250)}`);
    const walked: string[] = [];
    for (let page = 1; page <= oversize.pages; page++) {
      const d = page === 1 ? oversize : await getStudents(`?page=${page}&limit=${dbTotal}`);
      walked.push(...d.students.map((s: any) => s.id));
    }
    assert(new Set(walked).size === dbTotal, `clamped walk reached ${new Set(walked).size}/${dbTotal}`);
    return `limit=250 -> 250 rows; limit=100000 -> clamped to 250; limit=${dbTotal} -> clamped to 250 across ${oversize.pages} pages, all ${dbTotal} still reachable`;
  });

  // 4. Every page is reachable; union == dataset exactly once (no dupes, no gaps).
  await check('Walking all pages yields every student exactly once (no duplicates, no missing)', async () => {
    for (const limit of [25, 50, 100, 250]) {
      const first = await getStudents(`?page=1&limit=${limit}`);
      const seen: string[] = [];
      for (let page = 1; page <= first.pages; page++) {
        const data = page === 1 ? first : await getStudents(`?page=${page}&limit=${limit}`);
        seen.push(...data.students.map((s: any) => s.id));
      }
      const unique = new Set(seen);
      assert(seen.length === dbTotal, `limit=${limit}: walked ${seen.length} rows, expected ${dbTotal}`);
      assert(unique.size === dbTotal, `limit=${limit}: ${seen.length - unique.size} duplicate row(s)`);
      for (const s of seedStudents) {
        assert(unique.has(s._id.toString()), `limit=${limit}: student ${s.registerNumber} unreachable`);
      }
    }
    return `limit 25/50/100/250: each walk collected exactly ${dbTotal} unique students (0 dupes, 0 missing)`;
  });

  // 5. Past-the-end page is empty but still reports the true total.
  await check('A page beyond the end returns 0 rows and still reports the true total', async () => {
    const data = await getStudents('?page=999&limit=50');
    assert(data.students.length === 0, `expected 0 rows, got ${data.students.length}`);
    assert(data.total === dbTotal, `total drifted to ${data.total}`);
    assert(data.hasMore === false, 'hasMore should be false on the last page');
    return `page=999&limit=50 -> 0 rows, total=${data.total}, hasMore=${data.hasMore}`;
  });

  // 6. Search by name reaches students beyond the first 50.
  await check('Search by student NAME works across the whole dataset (beyond row 50)', async () => {
    // The very last seeded student sits far past any 50-row window.
    const target = seedStudents[SEED_SIZE - 1];
    const data = await getStudents(`?search=${encodeURIComponent('Directory Student 274')}`);
    assert(data.students.length === 1, `expected 1 hit, got ${data.students.length}`);
    assert(data.students[0].id === target._id.toString(), 'wrong student returned by name search');
    const firstPageRegs = new Set(
      (await getStudents('?page=1&limit=50')).students.map((s: any) => s.register_number)
    );
    assert(!firstPageRegs.has(target.registerNumber), 'test target unexpectedly sits on page 1');
    return `"Directory Student 274" found (reg ${target.registerNumber}); it is absent from the first 50 rows, so search is server-side`;
  });

  // 7. Search by register number reaches students beyond the first 50.
  await check('Search by REGISTER NUMBER works across the whole dataset (beyond row 50)', async () => {
    const target = seedStudents[SEED_SIZE - 1];
    const data = await getStudents(`?search=${target.registerNumber}`);
    assert(data.students.length === 1, `expected 1 hit, got ${data.students.length}`);
    assert(data.students[0].id === target._id.toString(), 'wrong student returned by register search');
    assert(data.total === 1, `filtered total should be 1, got ${data.total}`);
    return `reg ${target.registerNumber} (index ${SEED_SIZE - 1}) found; filtered total=${data.total}`;
  });

  // 8. Department filter works across the whole dataset.
  await check('Department filter works across the whole dataset with a correct total', async () => {
    const cseTotal = await Student.countDocuments({ department: cse._id });
    const data = await getStudents(`?departmentId=${cse._id}&limit=50`);
    assert(data.total === cseTotal, `CSE total ${data.total} != db ${cseTotal}`);
    const walked: string[] = [];
    for (let page = 1; page <= data.pages; page++) {
      const d = page === 1 ? data : await getStudents(`?departmentId=${cse._id}&page=${page}&limit=50`);
      for (const s of d.students) {
        walked.push(s.id);
        assert(s.department_id === cse._id.toString(), `row ${s.register_number} leaked from another department`);
      }
    }
    assert(new Set(walked).size === cseTotal, `walked ${new Set(walked).size} unique, expected ${cseTotal}`);
    return `CSE: total=${data.total} (db ${cseTotal}), pages=${data.pages}, walked ${new Set(walked).size} unique rows, 0 cross-department leaks`;
  });

  // 9. Batch filter works across the whole dataset.
  await check('Batch filter works across the whole dataset with a correct total', async () => {
    const b2Total = await Student.countDocuments({ batch: b2._id });
    const data = await getStudents(`?batchId=${b2._id}&limit=50`);
    assert(data.total === b2Total, `batch total ${data.total} != db ${b2Total}`);
    const walked: string[] = [];
    for (let page = 1; page <= data.pages; page++) {
      const d = page === 1 ? data : await getStudents(`?batchId=${b2._id}&page=${page}&limit=50`);
      for (const s of d.students) {
        walked.push(s.id);
        assert(s.batch_id === b2._id.toString(), `row ${s.register_number} leaked from another batch`);
      }
    }
    assert(new Set(walked).size === b2Total, `walked ${new Set(walked).size} unique, expected ${b2Total}`);
    return `batch 2022-2026: total=${data.total} (db ${b2Total}), pages=${data.pages}, walked ${new Set(walked).size} unique rows, 0 cross-batch leaks`;
  });

  // 10. Department + batch + search compose correctly.
  await check('Search + department + batch filters compose server-side', async () => {
    const data = await getStudents(`?departmentId=${cse._id}&batchId=${b1._id}&search=Directory&limit=50`);
    const expected = await Student.countDocuments({ department: cse._id, batch: b1._id, fullName: /Directory/i });
    assert(data.total === expected, `composed total ${data.total} != db ${expected}`);
    for (const s of data.students) {
      assert(s.department_id === cse._id.toString(), 'department leak');
      assert(s.batch_id === b1._id.toString(), 'batch leak');
    }
    return `CSE + 2023-2027 + "Directory" -> total=${data.total} (db ${expected}), all rows satisfy every filter`;
  });

  // 11. "Not Assigned" mentor and pending-first-login students are present.
  await check('Students with "Not Assigned" mentor and Pending (First Login) profile still appear', async () => {
    // The unassigned cohort is seeded at the END of the register-number order, so
    // it lives on the LAST page. Walking every page proves reachability.
    const first = await getStudents('?page=1&limit=250');
    const all: any[] = [];
    for (let page = 1; page <= first.pages; page++) {
      const d = page === 1 ? first : await getStudents(`?page=${page}&limit=250`);
      all.push(...d.students);
    }
    const unassigned = all.filter((s) => s.current_mentor_name === 'Not Assigned');
    assert(unassigned.length === UNASSIGNED_COUNT, `expected ${UNASSIGNED_COUNT} "Not Assigned" rows, got ${unassigned.length}`);
    const pending = all.filter((s) => s.profile_completed === 0);
    assert(pending.length === UNASSIGNED_COUNT, `expected ${UNASSIGNED_COUNT} "Pending (First Login)" rows, got ${pending.length}`);
    const dbAssigned = await MentorAssignment.countDocuments({ status: 'ACTIVE' });
    assert(
      unassigned.length + dbAssigned === dbTotal,
      `unassigned(${unassigned.length}) + assigned(${dbAssigned}) != ${dbTotal}`
    );
    // Both cohorts must be visible on the page the UI actually shows them.
    const lastPage = first.pages > 1 ? await getStudents(`?page=${first.pages}&limit=250`) : first;
    const lastUnassigned = lastPage.students.filter((s: any) => s.current_mentor_name === 'Not Assigned');
    assert(lastUnassigned.length > 0, 'the "Not Assigned" cohort is unreachable on any page');
    return `across all ${first.pages} pages: ${unassigned.length} "Not Assigned" + ${pending.length} "Pending (First Login)"; ${unassigned.length}+${dbAssigned}=${dbTotal} accounts for the whole roster`;
  });

  // 12. Inactive / deactivated students are not hidden by default.
  await check('Deactivated students remain visible (no implicit isActive filter)', async () => {
    const dbInactive = await Student.countDocuments({ isActive: false });
    assert(dbInactive > 0, 'seed produced no inactive students to test with');
    const data = await getStudents('?page=1&limit=250');
    const inactiveShown = data.students.filter((s: any) => s.is_active === 0);
    assert(inactiveShown.length > 0, 'page 1 hid every inactive student');
    // And the explicit filter still works when a user asks for it.
    const onlyActive = await getStudents('?isActive=true&limit=250');
    assert(
      onlyActive.students.every((s: any) => s.is_active === 1),
      'isActive=true returned inactive rows'
    );
    const onlyInactive = await getStudents('?isActive=false&limit=250');
    assert(onlyInactive.total === dbInactive, `isActive=false total ${onlyInactive.total} != ${dbInactive}`);
    return `default view shows inactive students (${inactiveShown.length} on page 1); explicit isActive=true/false still filters (${onlyInactive.total} inactive)`;
  });

  // 13. Row shape preserved: every column the Students Master table binds to.
  await check('Every Students Master table column is still present in each row', async () => {
    const data = await getStudents('?page=1&limit=25');
    assert(data.students.length === 25, `expected 25 rows, got ${data.students.length}`);
    const required = [
      'id', 'register_number', 'full_name', 'department_code', 'batch_name',
      'profile_completed', 'profile_completion_percentage', 'is_active',
      'current_mentor_name', 'total_arrears', 'completed_meetings_count',
    ];
    for (const row of data.students) {
      for (const key of required) {
        assert(key in row, `row ${row.register_number} is missing "${key}"`);
      }
      assert(typeof row.total_arrears === 'number', 'total_arrears must be numeric');
      assert(typeof row.completed_meetings_count === 'number', 'completed_meetings_count must be numeric');
    }
    return `all ${required.length} bound fields present on all 25 rows (register number, name, dept & batch, profile status, account, mentor, arrears, Saturday sessions)`;
  });

  // 14. No secret leakage in the newly wrapped payload.
  await check('Paginated payload still leaks no secrets', async () => {
    const data = await getStudents('?page=1&limit=50');
    const text = JSON.stringify(data);
    for (const needle of ['passwordHash', 'JWT_SECRET', 'DATA_DIR', 'temporaryPassword']) {
      assert(!text.includes(needle), `payload leaked "${needle}"`);
    }
    return 'no passwordHash / JWT_SECRET / DATA_DIR / temporaryPassword in the 50-row page';
  });

  // 15. RBAC preserved: a STUDENT token still cannot list the directory.
  await check('RBAC unchanged: STUDENT role is still denied the directory listing', async () => {
    const r = await http('GET', '/api/students', { token: studentToken });
    assert(r.status === 403, `student GET /api/students expected 403, got ${r.status}`);
    return `GET /api/students with a STUDENT token -> ${r.status}`;
  });

  // 16. HOD scope preserved: an HOD sees only their own department.
  await check('RBAC unchanged: HOD listing stays scoped to its own department', async () => {
    const hodUser: any = await User.create({
      username: 'hod.dir', passwordHash: hash, role: 'HOD',
      email: 'hod.dir@ksrce.test', fullName: 'Dr Directory HOD', department: cse._id, isActive: true,
    });
    const loginRes = await http('POST', '/api/auth/login', {
      body: { username: 'hod.dir', password: 'Mentor@123' },
    });
    const hodToken: string = loginRes.body?.data?.token || loginRes.body?.token;
    const cseTotal = await Student.countDocuments({ department: cse._id });
    const walked: string[] = [];
    let page = 1;
    let pages = 1;
    do {
      const r = await http('GET', `/api/students?page=${page}&limit=50`, { token: hodToken });
      assert(r.status === 200, `HOD GET /api/students -> ${r.status}`);
      assert(r.body.data.total === cseTotal, `HOD total ${r.body.data.total} != CSE ${cseTotal}`);
      pages = r.body.data.pages;
      for (const s of r.body.data.students) {
        assert(s.department_id === cse._id.toString(), `HOD saw ${s.register_number} from another department`);
        walked.push(s.id);
      }
      page += 1;
    } while (page <= pages);
    assert(new Set(walked).size === cseTotal, `HOD walked ${new Set(walked).size}, expected ${cseTotal}`);
    await User.deleteOne({ _id: hodUser._id });
    return `HOD paged through ${pages} pages, total=${cseTotal} (its own dept), 0 out-of-department rows`;
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== STUDENT DIRECTORY VERIFICATION ==========\n');
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
