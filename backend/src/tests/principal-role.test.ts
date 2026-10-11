/**
 * PRINCIPAL ROLE SUITE — provisioning, mandatory first-login password change
 * and the college-wide READ-ONLY surface.
 * ============================================================================
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives it over HTTP exactly as the web app does.
 *
 * It proves, end to end:
 *   1. the default Principal account (Principal / Principal@ksrce.ac.in) is
 *      provisioned once, active, flagged `mustChangePassword`, with a HASHED
 *      password — never plaintext;
 *   2. a later boot neither duplicates the account nor resets its password;
 *   3. the initial credential logs in and the response carries the flag;
 *   4. while flagged, the dashboard and every other protected route are refused
 *      with 403 (only /auth/me, /auth/login, /auth/change-password, /health stay
 *      reachable) — server-side, not a UI redirect;
 *   5. wrong current password, mismatch, too-short and new==current changes are
 *      all rejected and the flag survives;
 *   6. a correct change clears the flag, persists the new hash and returns a
 *      fresh unflagged token (the old flagged token becomes inert);
 *   7. the Principal can read the college-wide overview, but NO admin/HOD/
 *      settings/export/mutation route — enforced by the backend allow-list;
 *   8. after the change only the new password logs in; the old one fails;
 *   9. repeated restarts preserve exactly one account, its hash and the cleared
 *      flag;
 *  10. the existing ADMIN / HOD flows are unaffected.
 *
 * Run: npm run test:principal
 */
import assert from 'assert';
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('principal-role');

process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5099;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'principal-role-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';
// The shipped Principal defaults are deliberately left unset so the bootstrap
// fallbacks are what is actually exercised.
delete process.env.PRINCIPAL_USERNAME;
delete process.env.PRINCIPAL_EMAIL;
delete process.env.PRINCIPAL_PASSWORD;

const BASE = `http://127.0.0.1:${PORT}`;

const PRINCIPAL_USERNAME = 'Principal';
const PRINCIPAL_EMAIL = 'Principal@ksrce.ac.in';
const INITIAL_PASSWORD = 'Ksrce@1234';
const NEW_PASSWORD = 'NewPrincipal@123';

const checks: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean): void {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

async function http(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: any } = {}
): Promise<{ status: number; body: any }> {
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

async function waitForHealth(): Promise<void> {
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

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

async function run(): Promise<void> {
  console.log('================================================================');
  console.log('PRINCIPAL ROLE — provisioning, first-login password change, READ-ONLY');
  console.log('================================================================\n');

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Department, Student, Batch } = await import('../models/index.js');
  const { ensureSystemBootstrap } = await import('../database/bootstrap.js');

  const itDept: any = await Department.findOne({ code: 'IT' });
  assert(itDept, 'bootstrap did not create the IT department');
  const pdfBatch: any = await Batch.findOne({ name: '2023-2027' });
  assert(pdfBatch, 'bootstrap did not create a batch');

  // ── 1. Provisioning ─────────────────────────────────────────────────────
  let principal: any = await User.findOne({ role: 'PRINCIPAL' });
  assert(principal, 'bootstrap did not create the PRINCIPAL account');
  check('provisioned: a PRINCIPAL account exists', true);
  check('provisioned: username resolves to "Principal" (store normalises case)', principal.username.toLowerCase() === PRINCIPAL_USERNAME.toLowerCase());
  check('provisioned: email resolves to Principal@ksrce.ac.in (store normalises case)', principal.email.toLowerCase() === PRINCIPAL_EMAIL.toLowerCase());
  check('provisioned: role is PRINCIPAL', principal.role === 'PRINCIPAL');
  check('provisioned: mustChangePassword is true', principal.mustChangePassword === true);
  check('provisioned: isActive', principal.isActive === true);
  check(
    'provisioned: password stored as a hash, never plaintext',
    BCRYPT_RE.test(principal.passwordHash) && principal.passwordHash !== INITIAL_PASSWORD
  );
  let principalCount = await User.countDocuments({ role: 'PRINCIPAL' });
  check('provisioned: exactly one PRINCIPAL account (no duplicate)', principalCount === 1);

  // ── 2. Initial credential + flagged login ──────────────────────────────
  const flaggedLogin = await http('POST', '/api/auth/login', {
    body: { username: PRINCIPAL_USERNAME, password: INITIAL_PASSWORD },
  });
  check('login: initial credential is accepted', flaggedLogin.status === 200);
  const flaggedToken = flaggedLogin.body?.data?.token || flaggedLogin.body?.token;
  assert(flaggedToken, 'initial login did not return a token');
  const flaggedUser = flaggedLogin.body?.data?.user || flaggedLogin.body?.user;
  check('login: response role is PRINCIPAL', flaggedUser?.role === 'PRINCIPAL');
  check('login: response carries mustChangePassword=true', flaggedUser?.mustChangePassword === true);

  // ── 3. Hard block while flagged ────────────────────────────────────────
  const me = await http('GET', '/api/auth/me', { token: flaggedToken });
  check('flagged: /auth/me stays readable (200 with flag)', me.status === 200 && me.body?.data?.mustChangePassword === true);
  const overviewBlocked = await http('GET', '/api/admin/overview/dashboard', { token: flaggedToken });
  check('flagged: college dashboard refused (403)', overviewBlocked.status === 403);
  const adminListBlocked = await http('GET', '/api/admin/students', { token: flaggedToken });
  check('flagged: admin student list refused (403)', adminListBlocked.status === 403);
  const hodCreateBlocked = await http('POST', '/api/hod/faculty', { token: flaggedToken, body: {} });
  check('flagged: HOD mutation refused (403)', hodCreateBlocked.status === 403);
  const anonChange = await http('POST', '/api/auth/change-password', {
    body: { currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  check('change-password: requires a token (401)', anonChange.status === 401);

  // ── 4. Invalid change attempts are rejected ────────────────────────────
  const wrongCurrent = await http('POST', '/api/auth/change-password', {
    token: flaggedToken,
    body: { currentPassword: 'TotallyWrong@1', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  check('change: wrong current password rejected (400)', wrongCurrent.status === 400);

  const mismatch = await http('POST', '/api/auth/change-password', {
    token: flaggedToken,
    body: { currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: 'Different@456' },
  });
  check('change: confirmation mismatch rejected (400)', mismatch.status === 400);

  const tooShort = await http('POST', '/api/auth/change-password', {
    token: flaggedToken,
    body: { currentPassword: INITIAL_PASSWORD, newPassword: 'abc', confirmPassword: 'abc' },
  });
  check('change: password shorter than 6 chars rejected (400)', tooShort.status === 400);

  const sameAsCurrent = await http('POST', '/api/auth/change-password', {
    token: flaggedToken,
    body: { currentPassword: INITIAL_PASSWORD, newPassword: INITIAL_PASSWORD, confirmPassword: INITIAL_PASSWORD },
  });
  check('change: new password equal to current rejected (400)', sameAsCurrent.status === 400);

  let stillFlagged = await User.findOne({ role: 'PRINCIPAL' });
  check('change: flag still set after every rejected attempt', stillFlagged?.mustChangePassword === true);

  // ── 5. Correct change succeeds ─────────────────────────────────────────
  const changeRes = await http('POST', '/api/auth/change-password', {
    token: flaggedToken,
    body: { currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  check('change: correct change succeeds (200)', changeRes.status === 200);
  const freshToken = changeRes.body?.data?.token || changeRes.body?.token;
  assert(freshToken, 'successful change did not return a fresh token');
  const freshUser = changeRes.body?.data?.user || changeRes.body?.user;
  check('change: fresh token has mustChangePassword=false', freshUser?.mustChangePassword === false);

  let afterChange = await User.findOne({ role: 'PRINCIPAL' });
  check('change: flag cleared in the store', afterChange?.mustChangePassword === false);
  check(
    'change: new hash persisted (bcrypt, not plaintext)',
    BCRYPT_RE.test(afterChange?.passwordHash ?? '') && afterChange?.passwordHash !== NEW_PASSWORD
  );

  // ── 6. Stale flagged token is inert; fresh token works ─────────────────
  const staleBlocked = await http('GET', '/api/admin/overview/dashboard', { token: flaggedToken });
  check('stale token: still flagged, dashboard refused (403)', staleBlocked.status === 403);

  const overviewOk = await http('GET', '/api/admin/overview/dashboard', { token: freshToken });
  check('new token: college dashboard readable (200)', overviewOk.status === 200);
  const overviewData = overviewOk.body?.data;
  check('new token: dashboard returns college summary data', !!overviewData && typeof overviewData === 'object');

  // A real student record so the PDF route passes identity resolution and has to
  // answer the PRINCIPAL read-only rule (a bogus id would 404 before RBAC).
  const pdfStuUser = await User.create({
    username: 'principal.pdfstu',
    passwordHash: bcrypt.hashSync('PdfStu@123', 10),
    role: 'STUDENT',
    email: 'principal.pdfstu@ksrce.test',
    fullName: 'Principal Pdf Student',
    department: itDept._id,
    isActive: true,
  });
  const pdfStudent = await Student.create({
    user: pdfStuUser._id,
    registerNumber: 'PRINCIPALPDF01',
    fullName: 'Principal Pdf Student',
    department: itDept._id,
    batch: pdfBatch._id,
    residentialType: 'DAY_SCHOLAR',
    parent: {},
    siblings: [],
    school: {},
    profileCompleted: false,
    isActive: true,
  } as any);

  // ── 7. Principal is READ-ONLY by backend enforcement ───────────────────
  const readOnly: Array<[string, string, any]> = [
    ['GET', '/api/admin/hods', undefined],
    ['GET', '/api/admin/departments', undefined],
    ['GET', '/api/admin/students', undefined],
    ['GET', '/api/admin/settings', undefined],
    ['POST', '/api/admin/hods', {}],
    ['POST', '/api/admin/departments', {}],
    ['PUT', '/api/admin/settings', {}],
    ['POST', '/api/hod/faculty', {}],
    ['GET', '/api/hod/dashboard', undefined],
    ['POST', '/api/hod/students', {}],
    ['GET', '/api/reports/export/csv', undefined],
  ];
  for (const [method, urlPath, body] of readOnly) {
    const res = await http(method, urlPath, { token: freshToken, body });
    check(`read-only: PRINCIPAL cannot ${method} ${urlPath} (403)`, res.status === 403);
  }

  const pdfByReg = await http('GET', '/api/pdf/student/PRINCIPALPDF01', { token: freshToken });
  check('read-only: PRINCIPAL cannot download a student PDF (register no, 403)', pdfByReg.status === 403);
  const pdfById = await http('GET', `/api/pdf/student/${pdfStudent._id}`, { token: freshToken });
  check('read-only: PRINCIPAL cannot download a student PDF (id, 403)', pdfById.status === 403);

  // ── 8. Subsequent logins use the new password ──────────────────────────
  const newLogin = await http('POST', '/api/auth/login', {
    body: { username: PRINCIPAL_EMAIL, password: NEW_PASSWORD },
  });
  check('login: new password works after change', newLogin.status === 200);
  check(
    'login: re-login no longer carries the change flag',
    (newLogin.body?.data?.user || newLogin.body?.user)?.mustChangePassword === false
  );

  const oldLogin = await http('POST', '/api/auth/login', {
    body: { username: PRINCIPAL_USERNAME, password: INITIAL_PASSWORD },
  });
  check('login: initial password rejected after change (401)', oldLogin.status === 401);

  // ── 9. Restart preserves the account (no duplicate, no reset) ──────────
  const hashBeforeRestart = afterChange?.passwordHash;
  await ensureSystemBootstrap();
  await ensureSystemBootstrap();
  await ensureSystemBootstrap();

  const afterRestart = await User.findOne({ role: 'PRINCIPAL' });
  principalCount = await User.countDocuments({ role: 'PRINCIPAL' });
  check('restart: exactly one PRINCIPAL account after repeated boots', principalCount === 1);
  check('restart: stored hash is byte-identical (never re-hashed)', afterRestart?.passwordHash === hashBeforeRestart);
  check('restart: mandatory flag is NOT re-armed', afterRestart?.mustChangePassword === false);
  check('restart: role and active state preserved', afterRestart?.role === 'PRINCIPAL' && afterRestart?.isActive === true);

  const relogin = await http('POST', '/api/auth/login', {
    body: { username: PRINCIPAL_USERNAME, password: NEW_PASSWORD },
  });
  check('restart: changed password still works', relogin.status === 200);

  // ── 10. Existing roles are unaffected ──────────────────────────────────
  const adminLogin = await http('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'Admin@12345' },
  });
  check('existing roles: ADMIN login works', adminLogin.status === 200);
  const adminToken = adminLogin.body?.data?.token || adminLogin.body?.token;
  assert(adminToken, 'admin login returned no token');
  const adminOverview = await http('GET', '/api/admin/overview/dashboard', { token: adminToken });
  check('existing roles: ADMIN still reads the college dashboard', adminOverview.status === 200);

  const hodUser = await User.create({
    username: 'principal.hod',
    passwordHash: bcrypt.hashSync('HodPass@123', 10),
    role: 'HOD',
    email: 'principal.hod@ksrce.test',
    fullName: 'Dr Principal Hod',
    department: itDept._id,
    isActive: true,
  });
  assert(hodUser, 'could not create the HOD user');
  const hodLogin = await http('POST', '/api/auth/login', {
    body: { username: 'principal.hod', password: 'HodPass@123' },
  });
  check('existing roles: HOD login works', hodLogin.status === 200);
  const hodToken = hodLogin.body?.data?.token || hodLogin.body?.token;
  const hodDashboard = hodToken
    ? await http('GET', '/api/hod/dashboard', { token: hodToken })
    : { status: 0, body: null };
  check('existing roles: HOD dashboard is reachable', hodDashboard.status === 200);

  await store.teardown();
}

run()
  .then(() => {
    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length > 0) {
      console.error(`\nFAILED: ${failed.map((f) => f.name).join('; ')}`);
      process.exit(1);
    }
    console.log('All Principal role checks passed.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nSuite error:', err);
    try {
      await store.teardown();
    } catch {
      /* ignore teardown errors on failure */
    }
    process.exit(1);
  });