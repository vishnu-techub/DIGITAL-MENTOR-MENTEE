/**
 * SECURITY HARDENING VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives the hardened surfaces over HTTP, exactly as a client would.
 *
 * Two departments are seeded with students in the SAME year/section/batch so a
 * missing department filter in the marks template is provable rather than
 * assumed. The suite covers three concrete fixes:
 *
 *   1. Marks Excel template is department-scoped (no cross-department roster).
 *   2. Marks bulk-import of a brand-new mark persists the owning `student`.
 *   3. Login brute-force protection: repeated credential failures are throttled
 *      (429 + Retry-After), a success resets the counter, and unrelated accounts
 *      are unaffected.
 *   4. Marks bulk-import is audit-logged (one IMPORT_MARKS_BULK row per run,
 *      summary only, no secrets).
 *
 * Plus a source-contract check that the shared JWT secret no longer ships a
 * hardcoded fallback value in the middleware.
 *
 * Run: npm run test:security-hardening
 */
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('security-hardening');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5119;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'security-hardening-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';
// Keep the brute-force window short and the threshold small so the suite is fast
// and deterministic, while still exercising the exact production code path.
process.env.LOGIN_MAX_ATTEMPTS = '10';
process.env.LOGIN_WINDOW_MS = String(15 * 60 * 1000);

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
  return { status: res.status, body: parsed as any, headers: res.headers };
}

async function httpBuffer(urlPath: string, token?: string) {
  const res = await fetch(`${BASE}${urlPath}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buffer };
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

  const { User, Student, Department, Batch, InternalMark, AuditLog } = await import('../models/index.js');

  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  assert(cse && ece, 'bootstrap did not create the expected reference data');

  const batch2024: any = await Batch.findOne({ name: '2024-2028' });
  assert(batch2024, 'bootstrap did not create the 2024-2028 batch');

  const password = 'Mentor@123';
  const hash = bcrypt.hashSync(password, 10);

  async function makeHod(dept: any, suffix: string) {
    const username = `sec.hod.${suffix}`;
    const user: any = await User.create({
      username,
      passwordHash: hash,
      role: 'HOD',
      email: `${username}@ksrce.test`,
      fullName: `Dr Security Hod ${suffix.toUpperCase()}`,
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

  // Same year/section/batch across both departments so a missing department
  // filter in the template generator provably leaks the ECE roster into CSE.
  const cseStudent = await makeStudent(cse, 'SEC100001', 'Cse Sec One');
  await makeStudent(cse, 'SEC100002', 'Cse Sec Two');
  const eceStudent = await makeStudent(ece, 'SEC900001', 'Ece Sec One');

  // ── 1. Marks template is department-scoped ────────────────────────────────
  await check('Marks Excel template never leaks another department roster', async () => {
    const q =
      '/api/hod/marks/template?academicYear=2024-2028&year=1&section=A' +
      '&subjectCode=SEC101&subjectName=Security%20Testing&semesterNumber=1&assessmentType=IA1';
    const r = await httpBuffer(q, hodCse.token);
    assert(r.status === 200, `template download -> ${r.status}`);

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer as any);
    const sheet = wb.getWorksheet('Marks Entry');
    assert(sheet, 'Marks Entry sheet missing from template');

    const regs: string[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const value = row.getCell(1).value;
      if (value !== null && value !== undefined && String(value).trim()) {
        regs.push(String(value).trim());
      }
    });

    assert(regs.includes('SEC100001') && regs.includes('SEC100002'), `CSE students missing from template: ${regs.join(',')}`);
    assert(!regs.includes('SEC900001'), `cross-department leak: ECE student SEC900001 appears in the CSE template (${regs.join(',')})`);
    return `template rows: ${regs.join(', ')} (ECE student absent)`;
  });

  // ── 2. Bulk import creates a brand-new mark with its owning student ────────
  await check('Bulk import of a new mark persists the owning student', async () => {
    const before = await InternalMark.findOne({ student: cseStudent.id, subjectCode: 'SEC201' });
    assert(!before, 'test precondition failed: a mark already exists for this student/subject');

    const row = {
      rowNumber: 2,
      registerNumber: 'SEC100001',
      studentName: 'Cse Sec One',
      subjectCode: 'SEC201',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SEC100001',
        studentId: cseStudent.id,
        subjectCode: 'SEC201',
        subjectName: 'Integrity Testing',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 42,
        maxMarks: 50,
      },
    };

    const r = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [row], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'SEC201', subjectName: 'Integrity Testing', semesterNumber: 1 },
    });
    assert(r.status === 200, `import -> ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.data?.summary?.imported === 1, `expected 1 imported, got ${JSON.stringify(r.body?.data?.summary)}`);

    const saved: any = await InternalMark.findOne({ student: cseStudent.id, subjectCode: 'SEC201' });
    assert(saved, 'no InternalMark row was persisted');
    assert(String(saved.student) === cseStudent.id, `saved mark has wrong student: ${saved.student}`);
    assert(saved.ia1 === 42, `saved ia1 ${saved.ia1}, expected 42`);
    return `imported=1, stored student=${String(saved.student).slice(0, 8)}…, ia1=42`;
  });

  // ── 3. A forged cross-department row is still refused ─────────────────────
  await check('Import refuses a row targeting another department student', async () => {
    const row = {
      rowNumber: 3,
      registerNumber: 'SEC900001',
      studentName: 'Ece Sec One',
      subjectCode: 'SEC201',
      assessmentType: 'IA1',
      status: 'VALID',
      reason: 'Ready for import',
      parsedData: {
        registerNumber: 'SEC900001',
        studentId: eceStudent.id,
        subjectCode: 'SEC201',
        subjectName: 'Integrity Testing',
        semesterNumber: 1,
        assessmentType: 'IA1',
        marksObtained: 40,
        maxMarks: 50,
      },
    };
    const r = await http('POST', '/api/hod/marks/upload/import', {
      token: hodCse.token,
      body: { rows: [row], academicYear: '2024-2028', year: 1, section: 'A', subjectCode: 'SEC201', subjectName: 'Integrity Testing', semesterNumber: 1 },
    });
    assert(r.status === 200, `import -> ${r.status}`);
    assert(r.body?.data?.summary?.failed === 1 && r.body?.data?.summary?.imported === 0, `expected the row to fail: ${JSON.stringify(r.body?.data?.summary)}`);
    const leaked: any = await InternalMark.findOne({ student: eceStudent.id, subjectCode: 'SEC201' });
    assert(!leaked, 'a cross-department mark was written');
    return 'CSE HOD cannot write an ECE student mark';
  });

  // ── 3b. The bulk-import path is audit-logged (one row per run) ────────────
  await check('Marks bulk import writes an IMPORT_MARKS_BULK audit record', async () => {
    const audit = await AuditLog.find({ action: 'IMPORT_MARKS_BULK' });
    assert(audit.length >= 2, `expected at least 2 import audit rows (one per run), got ${audit.length}`);
    const last: any = audit[audit.length - 1];
    assert(last.details?.summary && last.details.summary.failed === 1, `last import audit must carry the failed=1 summary: ${JSON.stringify(last.details)}`);
    assert(last.details.summary.imported === 0, 'last import audit must not claim a write that was refused');
    const serialized = JSON.stringify(audit);
    assert(!serialized.includes('passwordHash') && !serialized.includes('JWT_SECRET'), 'import audit rows leak a secret field');
    return `IMPORT_MARKS_BULK rows=${audit.length}; last summary ${JSON.stringify(last.details?.summary)}; no secrets`;
  });

  // ── 4. Login brute-force protection ───────────────────────────────────────
  await check('Repeated failed logins are throttled (429 + Retry-After)', async () => {
    const target = 'sec.hod.ece';
    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const r = await http('POST', '/api/auth/login', { body: { username: target, password: 'definitely-wrong' } });
      lastStatus = r.status;
      assert(r.status === 401, `failed attempt ${i + 1} expected 401, got ${r.status}`);
    }
    const blocked = await http('POST', '/api/auth/login', { body: { username: target, password: 'definitely-wrong' } });
    assert(blocked.status === 429, `11th attempt expected 429, got ${blocked.status}`);
    assert(blocked.headers.get('retry-after'), 'Retry-After header missing on 429');

    // Even the correct password is refused while the account is throttled.
    const correct = await http('POST', '/api/auth/login', { body: { username: target, password } });
    assert(correct.status === 429, `correct password while throttled expected 429, got ${correct.status}`);
    return `10x 401 then ${blocked.status} (Retry-After=${blocked.headers.get('retry-after')}s); correct password still ${correct.status}`;
  });

  await check('A successful login resets the failure counter', async () => {
    const target = 'sec.hod.cse';
    for (let i = 0; i < 9; i++) {
      const r = await http('POST', '/api/auth/login', { body: { username: target, password: 'nope' } });
      assert(r.status === 401, `pre-success attempt ${i + 1} -> ${r.status}`);
    }
    const ok = await http('POST', '/api/auth/login', { body: { username: target, password } });
    assert(ok.status === 200, `valid login expected 200, got ${ok.status}`);

    // If the counter had NOT reset, the next 9 failures would trip the limit.
    for (let i = 0; i < 9; i++) {
      const r = await http('POST', '/api/auth/login', { body: { username: target, password: 'nope' } });
      assert(r.status === 401, `post-reset attempt ${i + 1} expected 401 (reset), got ${r.status}`);
    }
    return '9x401 -> 200 -> 9x401 (counter cleared on success)';
  });

  // ── 5. JWT secret source contract ─────────────────────────────────────────
  await check('The shared JWT secret ships no hardcoded fallback literal', async () => {
    const file = path.join(process.cwd(), 'src', 'middleware', 'auth.middleware.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert(!src.includes('ksrce-mentoring-jwt-secret-key-2026'), 'the old hardcoded JWT secret literal is still present');
    assert(/process\.env\.JWT_SECRET/.test(src), 'auth.middleware.ts must read JWT_SECRET from the environment');
    assert(/NODE_ENV\s*===\s*'production'/.test(src), 'auth.middleware.ts must fail closed for production without JWT_SECRET');
    return 'no hardcoded secret; env-driven with a production fail-closed guard';
  });

  await check('Login throttling middleware is wired to the login route', async () => {
    const file = path.join(process.cwd(), 'src', 'modules', 'auth', 'auth.routes.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert(/loginRateLimit/.test(src), 'loginRateLimit is not applied to the login route');
    return 'auth.routes.ts applies loginRateLimit before the login handler';
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== SECURITY HARDENING VERIFICATION ==========\n');
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
