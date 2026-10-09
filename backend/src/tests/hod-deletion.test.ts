/**
 * SAFE PERMANENT HOD DELETION VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives the Admin-only demo-cleanup delete endpoint
 * (`DELETE /api/admin/hods/:hodId`) over HTTP exactly as the Admin "HOD
 * Management" tab will.
 *
 * The deletion safety valve requires (all server-enforced):
 *   - caller is an Admin (HOD / FACULTY / STUDENT 403, anonymous 401);
 *   - the target exists AND is a `role: 'HOD'` User (Admin / Faculty / Student
 *     accounts 404 — they can never be deleted through this route);
 *   - the target is NOT the calling Admin themselves;
 *   - the target is already INACTIVE (active HODs 409);
 *   - the target is on the reviewed `VERIFIED_DEMO_HOD_IDS` allowlist
 *     (unverified / genuine HODs 403 — deactivation is their only removal
 *     path). The allowlist is a shared module-level Set; this suite adds its
 *     own sandbox-generated ids to it to prove the verified-demo gate without
 *     depending on the live-store ids that ship in the constant;
 *   - NO dependent record references the target (a Notification dependency
 *     proves the scan: delete is refused 409 until the dependency is gone,
 *     then succeeds);
 *   - the DELETE_HOD audit entry (non-sensitive identity only — never a
 *     password hash) is written and survives the removal, and the pre-existing
 *     account audit trail is untouched.
 *
 * Also verified: deleted accounts cannot log in, running bootstrap again does
 * not recreate them, admin/faculty/student/HOD workflows keep working, and the
 * one-active-HOD-per-department + deactivation rules remain intact.
 *
 * Run: npm run test:hod-delete
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('hod-deletion');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5117;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'hod-deletion-secret-do-not-use-in-prod';
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
    Notification,
    AuditLog,
  } = await import('../models/index.js');
  const { VERIFIED_DEMO_HOD_IDS } = await import('../modules/admin/admin-hod.controller.js');
  const { ensureSystemBootstrap } = await import('../database/bootstrap.js');

  const hash = bcrypt.hashSync('Seed@12345', 10);

  const admin = await login('admin', 'Admin@12345');
  assert(admin.token, 'admin could not log in');
  const adminToken = admin.token;
  const adminId = admin.user?.id;
  assert(adminId, 'admin id missing from login response');

  const cse: any = await Department.findOne({ code: 'CSE' });
  assert(cse, 'bootstrap did not create CSE');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'bootstrap did not create a batch');

  // ── SEED: CSE faculty mentor + students + assignment + a record, so a real
  //    HOD token has a department-scoped dashboard to prove workflows intact.
  const cseMentorUser: any = await User.create({
    username: 'hoddel.fac.cse', passwordHash: hash, role: 'FACULTY',
    email: 'hoddel.fac.cse@ksrce.test', fullName: 'HodDel Cse Mentor',
    department: cse._id, isActive: true,
  });
  const cseMentor: any = await Faculty.create({
    user: cseMentorUser._id, employeeId: 'HODDEL-CSE1', department: cse._id,
    designation: 'Professor', cabinLocation: 'A-1', isActive: true,
  } as any);
  const facultyLogin = await login('hoddel.fac.cse', 'Seed@12345');
  assert(facultyLogin.token, 'CSE mentor could not log in');

  async function makeStudent(reg: string, name: string) {
    const user: any = await User.create({
      username: reg.toLowerCase(), passwordHash: hash, role: 'STUDENT',
      email: `${reg.toLowerCase()}@ksrce.test`, fullName: name,
      department: cse._id, isActive: true,
    });
    const student: any = await Student.create({
      user: user._id, registerNumber: reg, fullName: name,
      department: cse._id, batch: batch._id, residentialType: 'DAY_SCHOLAR',
      parent: {}, siblings: [], school: {}, profileCompleted: false, isActive: true,
    } as any);
    return { user, student };
  }
  const s1 = await makeStudent('HODDEL001', 'HodDel Student One');
  await makeStudent('HODDEL002', 'HodDel Student Two');
  const studentLogin = await login('hoddel001', 'Seed@12345');
  assert(studentLogin.token, 'seed student could not log in');

  await MentorAssignment.create({
    student: s1.student._id, mentor: cseMentor._id, department: cse._id,
    assignedFrom: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10),
    status: 'ACTIVE', assignedBy: adminId, changeReason: 'Seed',
  } as any);
  await CounsellingRecord.create({
    student: s1.student._id, mentor: cseMentor._id,
    sessionDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    categories: ['Academic Development'], discussionWith: ['student'],
    challengeObserved: 'Needs focus', correctiveAction: 'Study plan',
  } as any);

  // ── Real (unverified) HOD ────────────────────────────────────────────────
  let realHodId = '';
  let realHodUsername = '';
  await check('Admin creates a real (unverified) HOD account', async () => {
    const r = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: {
        fullName: 'Dr Real Cse Head', email: 'realhod.cse@ksrce.test',
        departmentId: String(cse._id), password: 'RealHod@123',
      },
    });
    assert(r.status === 201, `create real HOD -> ${r.status}: ${JSON.stringify(r.body)}`);
    realHodId = r.body.data.id;
    realHodUsername = r.body.data.username;
    assert(r.body.data.is_active === 1, 'real HOD should start active');
    assert(r.body.data.is_verified_demo === 0, 'real HOD must NOT be flagged verified-demo');
    return `id=${realHodId} username=${realHodUsername} is_verified_demo=0`;
  });

  // ── 1. An ACTIVE HOD can never be permanently deleted ───────────────────
  await check('Permanent deletion of an ACTIVE HOD is rejected with 409', async () => {
    const r = await http('DELETE', `/api/admin/hods/${realHodId}`, { token: adminToken });
    assert(r.status === 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    const dbUser = await User.findById(realHodId);
    assert(dbUser, 'active HOD was deleted anyway');
    return `409 "${r.body.message}"`;
  });

  // ── 2. RBAC: HOD / FACULTY / STUDENT 403, anonymous 401 ─────────────────
  await check('Non-Admin callers and anonymous requests cannot delete a HOD', async () => {
    const hodLogin = await login(realHodUsername, 'RealHod@123');
    assert(hodLogin.token, 'real HOD could not log in for the RBAC check');
    const cases: [string, string | undefined][] = [
      ['HOD', hodLogin.token],
      ['FACULTY', facultyLogin.token],
      ['STUDENT', studentLogin.token],
      ['anonymous', undefined],
    ];
    const seen: string[] = [];
    for (const [label, token] of cases) {
      const r = await http('DELETE', `/api/admin/hods/${realHodId}`, { token });
      const expected = token ? 403 : 401;
      assert(r.status === expected, `${label} -> expected ${expected}, got ${r.status}`);
      seen.push(`${label}=${r.status}`);
    }
    const dbUser = await User.findById(realHodId);
    assert(dbUser, 'a non-Admin caller deleted the HOD anyway');
    return seen.join(', ') + '; account still present';
  });

  // ── 3. Deactivate, then deletion is STILL refused (not allowlisted) ─────
  await check('Deactivation still works and blocks login (regression)', async () => {
    const d = await http('PATCH', `/api/admin/hods/${realHodId}/status`, {
      token: adminToken, body: { isActive: false },
    });
    assert(d.status === 200, `deactivate -> ${d.status}`);
    const l = await login(realHodUsername, 'RealHod@123');
    assert(l.status === 403, `deactivated HOD login -> expected 403, got ${l.status}`);
    return `deactivate 200; deactivated login -> ${l.status}`;
  });

  await check('Permanent deletion of an unverified (non-demo) HOD is rejected with 403', async () => {
    const r = await http('DELETE', `/api/admin/hods/${realHodId}`, { token: adminToken });
    assert(r.status === 403, `expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
    const dbUser = await User.findById(realHodId);
    assert(dbUser, 'the unverified HOD was deleted despite the allowlist gate');
    return `403 "${r.body.message}"`;
  });

  // ── Demo HOD: allowlisted, deactivated, dependent-record discipline ─────
  let demoHodId = '';
  let demoHodUsername = '';
  await check('Admin creates the demo HOD and it is flagged as a verified demo account in the list', async () => {
    const r = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: {
        fullName: 'Demo CSE HOD', email: 'demo.cse.hod@ksrce.test',
        departmentId: String(cse._id), password: 'DemoHod@123',
      },
    });
    assert(r.status === 201, `create demo HOD -> ${r.status}: ${JSON.stringify(r.body)}`);
    demoHodId = r.body.data.id;
    demoHodUsername = r.body.data.username;
    VERIFIED_DEMO_HOD_IDS.add(demoHodId); // simulate reviewed provenance for the sandbox id
    const list = await http('GET', '/api/admin/hods', { token: adminToken });
    const demoRow = list.body.data.hods.find((h: any) => h.id === demoHodId);
    assert(demoRow && demoRow.is_verified_demo === 1, `demo row is_verified_demo=${demoRow?.is_verified_demo}`);
    const realRow = list.body.data.hods.find((h: any) => h.id === realHodId);
    assert(realRow && realRow.is_verified_demo === 0, `real row is_verified_demo=${realRow?.is_verified_demo}`);
    return `demo is_verified_demo=1, real is_verified_demo=0`;
  });

  await check('Permanent deletion is refused for the allowlisted demo HOD while it is still ACTIVE', async () => {
    const r = await http('DELETE', `/api/admin/hods/${demoHodId}`, { token: adminToken });
    assert(r.status === 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `409 "${r.body.message}"`;
  });

  await check('The demo HOD is deactivated before deletion', async () => {
    const d = await http('PATCH', `/api/admin/hods/${demoHodId}/status`, {
      token: adminToken, body: { isActive: false },
    });
    assert(d.status === 200, `deactivate demo -> ${d.status}`);
    const l = await login(demoHodUsername, 'DemoHod@123');
    assert(l.status === 403, `deactivated demo login -> expected 403, got ${l.status}`);
    return `deactivate 200; login -> ${l.status}`;
  });

  await check('Permanent deletion is refused while a dependent record still references the HOD', async () => {
    const notif: any = await Notification.create({
      user: demoHodId, title: 'Notice', message: 'Dept circular',
      type: 'SYSTEM_ANNOUNCEMENT', isRead: false,
    });
    const r = await http('DELETE', `/api/admin/hods/${demoHodId}`, { token: adminToken });
    assert(r.status === 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(/notifications/.test(String(r.body.message)), `message did not name the collection: ${r.body.message}`);
    const dbUser = await User.findById(demoHodId);
    assert(dbUser, 'demo HOD was deleted despite the reference');
    await (notif as any).deleteOne();
    return `409 "${r.body.message}"`;
  });

  await check('Admin can permanently delete an eligible inactive verified-demo HOD', async () => {
    const listBefore: any = await http('GET', '/api/admin/hods', { token: adminToken });
    const before = listBefore.body.data.summary.total;
    const r = await http('DELETE', `/api/admin/hods/${demoHodId}`, { token: adminToken });
    assert(r.status === 200, `delete demo -> ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.data.username === demoHodUsername, 'response missing the deleted username');
    const afterDb = await User.findById(demoHodId);
    assert(!afterDb, 'deleted HOD user still in the store');
    const listAfter: any = await http('GET', '/api/admin/hods', { token: adminToken });
    const stillPresent = listAfter.body.data.hods.some((h: any) => h.id === demoHodId);
    assert(!stillPresent, 'deleted HOD still appears in the admin list');
    assert(listAfter.body.data.summary.total === before - 1, 'summary.total did not drop by one');
    return `200; HOD list ${before} -> ${listAfter.body.data.summary.total}; account gone`;
  });

  // ── 4. Admin / Faculty / Student accounts can never be deleted ──────────
  await check('Admin, Faculty and Student accounts cannot be deleted through this endpoint (404)', async () => {
    const seen: string[] = [];
    for (const [label, targetId] of [
      ['Admin', adminId],
      ['Faculty', String(cseMentorUser._id)],
      ['Student', String(s1.user._id)],
    ]) {
      const r = await http('DELETE', `/api/admin/hods/${targetId}`, { token: adminToken });
      assert(r.status === 404, `${label} delete -> expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
      seen.push(`${label}=${r.status}`);
    }
    const checkFaculty = await User.findById(cseMentorUser._id);
    const checkStudent = await User.findById(s1.user._id);
    const checkAdmin = await User.findById(adminId);
    assert(checkFaculty && checkStudent && checkAdmin, 'a non-HOD account was deleted');
    return seen.join(', ') + '; all three accounts still present';
  });

  // ── 5. Bad / missing ids ────────────────────────────────────────────────
  await check('Invalid and unknown HOD ids return 404', async () => {
    const malformed = await http('DELETE', '/api/admin/hods/not-an-id', { token: adminToken });
    assert(malformed.status === 404, `malformed id -> ${malformed.status}`);
    const missing = await http('DELETE', '/api/admin/hods/aaaaaaaaaaaaaaaaaaaaaaaa', { token: adminToken });
    assert(missing.status === 404, `unknown id -> ${missing.status}`);
    return `malformed=404, unknown=404`;
  });

  // ── 6. Deleted account cannot log in ────────────────────────────────────
  await check('A permanently deleted HOD cannot log in anymore', async () => {
    const l = await login(demoHodUsername, 'DemoHod@123');
    assert(l.status === 401, `expected 401, got ${l.status}`);
    return `login -> ${l.status} (account gone)`;
  });

  // ── 7. Audit preservation + DELETE_HOD entry ────────────────────────────
  await check('Audit history is preserved and the DELETE_HOD event records non-sensitive identity only', async () => {
    const entries: any = await AuditLog.find({ entityId: demoHodId });
    const actions = entries.map((e: any) => e.action);
    assert(actions.includes('CREATE_HOD'), 'CREATE_HOD audit lost: ' + actions.join(','));
    assert(actions.includes('DEACTIVATE_HOD'), 'DEACTIVATE_HOD audit lost: ' + actions.join(','));
    assert(actions.includes('DELETE_HOD'), 'DELETE_HOD audit missing: ' + actions.join(','));
    const del = entries.find((e: any) => e.action === 'DELETE_HOD');
    assert(del.user && String(del.user) === String(adminId), 'DELETE_HOD is not attributed to the acting Admin');
    assert(del.details?.username === demoHodUsername, 'DELETE_HOD missing the target username');
    assert(del.details?.fullName === 'Demo CSE HOD', 'DELETE_HOD missing the target full name');
    assert(!('passwordHash' in (del.details || {})), 'DELETE_HOD leaked a password hash');
    const leaked = JSON.stringify(entries);
    assert(!leaked.includes('passwordHash') && !leaked.includes('token'), 'audit trail leaked a hash or token');
    return `audit for target = ${actions.join(' -> ')}; DELETE_HOD carries username+fullName+acting Admin; no secrets`;
  });

  // ── 8. One-active-HOD rule and reactivation still work ──────────────────
  await check('The department slot was freed and the one-active-HOD-per-department rule is intact', async () => {
    const react = await http('PATCH', `/api/admin/hods/${realHodId}/status`, {
      token: adminToken, body: { isActive: true },
    });
    assert(react.status === 200, `reactivate real HOD -> ${react.status}`);
    const dup = await http('POST', '/api/admin/hods', {
      token: adminToken,
      body: { fullName: 'Dr Second Head', email: 'second.head@ksrce.test', departmentId: String(cse._id) },
    });
    assert(dup.status === 409, `duplicate active HOD -> expected 409, got ${dup.status}`);
    const realHodLogin = await login(realHodUsername, 'RealHod@123');
    assert(realHodLogin.token, 'reactivated HOD could not log in');
    return `reactivate 200; second active CSE HOD -> 409; reactivated HOD login 200`;
  });

  // ── 9. Deleted accounts are not recreated on restart / bootstrap ────────
  await check('Bootstrap (restart path) does not recreate deleted demo HOD accounts', async () => {
    await ensureSystemBootstrap();
    const again = await User.findById(demoHodId);
    assert(!again, 'deleted demo HOD was recreated by bootstrap');
    const byName = await User.findOne({ username: demoHodUsername });
    assert(!byName, `username ${demoHodUsername} was recreated`);
    const adminToken2 = (await login('admin', 'Admin@12345')).token;
    assert(adminToken2, 'admin login broke after the bootstrap rerun');
    return 'demo HOD absent after bootstrap rerun; admin login still works';
  });

  // ── 10. Other workflows still work ──────────────────────────────────────
  await check('Admin, HOD, Faculty/Mentor and Student workflows still work after deletion', async () => {
    const realHodLogin = await login(realHodUsername, 'RealHod@123');
    assert(realHodLogin.token, 'real HOD login failed');
    const dash = await http('GET', '/api/hod/dashboard', { token: realHodLogin.token });
    assert(dash.status === 200, `HOD dashboard -> ${dash.status}`);
    assert((await login('hoddel.fac.cse', 'Seed@12345')).token, 'faculty login failed');
    assert((await login('hoddel001', 'Seed@12345')).token, 'student login failed');
    return 'admin/HOD dashboard 200, faculty + student logins OK';
  });

  // ── REPORT ──────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== HOD PERMANENT DELETION VERIFICATION ==========\n');
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