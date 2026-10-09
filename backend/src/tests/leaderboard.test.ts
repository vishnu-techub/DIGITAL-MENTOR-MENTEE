/**
 * Achievement Points + Leaderboard - full-stack runtime verification.
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against a real local
 * file store and drives the achievement/verification lifecycle over HTTP as a
 * real student, mentor, HOD and admin, then reads the persisted records.
 *
 * Nothing is stubbed. Covers: server-computed points (never client-supplied),
 * unverified = 0, the locked point table, verification refusals, optimal
 * edits (Approved locked / Rejected resubmits to Pending), duplicate rows,
 * deterministic college/department/mentee leaderboards with 0-point students
 * included, the persisted detail endpoint and 'me' resolution.
 *
 * TEMPORARY LOCAL FILE STORAGE. Replace with a persistent database/storage
 * implementation before production deployment.
 *
 * Run: npx tsx src/tests/leaderboard.test.ts
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

const store = useTemporaryLocalStore('leaderboard');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5114;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'leaderboard-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';

const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(requirement: string, condition: boolean, evidence = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${requirement}`);
  } else {
    fail++;
    failures.push(requirement);
    console.log(`  [FAIL] ${requirement}${evidence ? `\n         evidence: ${evidence}` : ''}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
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
  return { status: res.status, body: parsed };
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not become healthy in time');
}

function data(body: any) {
  return body?.data ?? body;
}

function bodyText(body: any): string {
  return typeof body === 'string' ? body : JSON.stringify(body ?? '');
}

async function login(role: string, username: string, password = 'Mentor@123'): Promise<string> {
  const res = await http('POST', '/api/auth/login', { body: { username, password } });
  assert(res.status === 200, `login ${role} failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body?.data?.token || res.body?.token;
  assert(token, `login ${role} returned no token: ${JSON.stringify(res.body)}`);
  return token;
}

async function main() {
  const { connectDB } = await import('../config/database.js');
  await connectDB();

  const { User, Faculty, Department, Batch, Student, MentorAssignment, Achievement } =
    await import('../models/index.js');

  // ---- SEED -----------------------------------------------------------------
  const hash = bcrypt.hashSync('Mentor@123', 10);
  const dept: any = await Department.create({ name: 'Computer Science', code: 'CSE' });
  const itDept: any = await Department.create({ name: 'Information Technology', code: 'IT' });
  const batch = await Batch.create({ name: '2022-2026', startYear: 2022, endYear: 2026 });

  async function seedFaculty(username: string, name: string, deptRef: any, employeeId: string) {
    const user: any = await User.create({
      username,
      passwordHash: hash,
      role: 'FACULTY',
      email: `${username}@ksrce.test`,
      fullName: name,
      department: deptRef._id,
      isActive: true,
    });
    const faculty: any = await Faculty.create({
      user: user._id,
      employeeId,
      designation: 'Assistant Professor',
      department: deptRef._id,
      isActive: true,
    });
    return { user, faculty };
  }

  const mentorA = await seedFaculty('mentor.divya', 'Dr Divya Mentor', dept, 'FAC-L1');
  const mentorB = await seedFaculty('mentor.anand', 'Dr Anand Mentor', dept, 'FAC-L2');

  const hodUser: any = await User.create({
    username: 'hod.csel',
    passwordHash: hash,
    role: 'HOD',
    email: 'hod.csel@ksrce.test',
    fullName: 'Dr HOD Leaderboard',
    department: dept._id,
    isActive: true,
  });
  await Faculty.create({
    user: hodUser._id,
    employeeId: 'HOD-L1',
    designation: 'Head of Department',
    department: dept._id,
    isActive: true,
  });

  async function seedStudent(
    username: string,
    fullName: string,
    reg: string,
    deptRef: any,
    year: number,
    section: string
  ) {
    const user: any = await User.create({
      username,
      passwordHash: hash,
      role: 'STUDENT',
      email: `${reg}@ksrce.test`,
      fullName,
      department: deptRef._id,
      isActive: true,
    });
    const student: any = await Student.create({
      user: user._id,
      fullName,
      registerNumber: reg,
      email: `${reg}@ksrce.test`,
      mobileNumber: `98123${reg.slice(-5)}`,
      department: deptRef._id,
      section,
      year,
      batch: batch._id,
      profileCompleted: true,
      isActive: true,
    });
    return { user, student };
  }

  const A = await seedStudent('731523301101', 'Alpha Student', '731523301101', dept, 4, 'A');
  const B = await seedStudent('731523301102', 'Beta Student', '731523301102', dept, 4, 'A');
  const C = await seedStudent('731523301103', 'Gamma Student', '731523301103', dept, 3, 'B');
  const D = await seedStudent('731523301201', 'Delta IT', '731523301201', itDept, 4, 'A');
  const E = await seedStudent('731523301104', 'Epsilon Quiet', '731523301104', dept, 4, 'B');
  const F = await seedStudent('731523301105', 'Zeta Quiet', '731523301105', dept, 3, 'B');

  const adminUser: any = await User.findOne({ role: 'ADMIN' });
  const assignedBy = adminUser?._id || mentorA.user._id;

  await MentorAssignment.create([
    { student: A.student._id, mentor: mentorA.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
    { student: B.student._id, mentor: mentorA.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
    { student: C.student._id, mentor: mentorA.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
    { student: D.student._id, mentor: mentorA.faculty._id, department: itDept._id, status: 'ACTIVE', assignedBy },
    { student: E.student._id, mentor: mentorB.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
    { student: F.student._id, mentor: mentorB.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
  ]);

  // Seeded VERIFIED rows (direct store writes model what a previous verify did).
  await Achievement.create([
    {
      student: A.student._id, department: dept._id, registerNumber: '731523301101',
      title: 'Smart India Hackathon 2025', category: 'Hackathon', hackathonResult: 'Winner',
      eventDate: '2025-12-02', verified: true, verificationStatus: 'Approved',
      verifiedBy: adminUser?._id, verifiedAt: new Date(), points: 25, pointsAwarded: 25,
      createdBy: adminUser?._id, updatedBy: adminUser?._id,
    },
    {
      student: A.student._id, department: dept._id, registerNumber: '731523301101',
      title: 'Python Workshop', category: 'Workshop', eventDate: '2026-01-10',
      verified: true, verificationStatus: 'Approved', verifiedBy: adminUser?._id,
      verifiedAt: new Date(), points: 5, pointsAwarded: 5, createdBy: adminUser?._id, updatedBy: adminUser?._id,
    },
    {
      student: B.student._id, department: dept._id, registerNumber: '731523301102',
      title: 'AWS Cloud Practitioner', category: 'Global / Technical Certification', eventDate: '2025-11-01',
      verified: true, verificationStatus: 'Approved', verifiedBy: adminUser?._id,
      verifiedAt: new Date(), points: 8, pointsAwarded: 8, createdBy: adminUser?._id, updatedBy: adminUser?._id,
    },
    {
      student: C.student._id, department: dept._id, registerNumber: '731523301103',
      title: 'Paper at National Conference', category: 'Symposium / Paper Presentation', eventDate: '2025-09-15',
      verified: true, verificationStatus: 'Approved', verifiedBy: adminUser?._id,
      verifiedAt: new Date(), points: 8, pointsAwarded: 8, createdBy: adminUser?._id, updatedBy: adminUser?._id,
    },
    {
      student: D.student._id, department: itDept._id, registerNumber: '731523301201',
      title: 'HackPro Runner-up', category: 'Hackathon', hackathonResult: 'Runner-up', eventDate: '2026-02-20',
      verified: true, verificationStatus: 'Approved', verifiedBy: adminUser?._id,
      verifiedAt: new Date(), points: 20, pointsAwarded: 20, createdBy: adminUser?._id, updatedBy: adminUser?._id,
    },
  ]);

  console.log('\n=== Achievement points + leaderboard: full-stack runtime ===\n');
  console.log('  booting src/index.ts ...');
  await import('../index.js');
  await waitForHealth();

  const adminToken = await login('admin', 'admin', 'Admin@12345');
  const mentorAToken = await login('mentor A', 'mentor.divya');
  const mentorBToken = await login('mentor B', 'mentor.anand');
  const hodToken = await login('HOD', 'hod.csel');
  const studentAToken = await login('student A', '731523301101');
  const studentBToken = await login('student B', '731523301102');

  // ---------------------------------------------------------------------------
  console.log('\nServer-computed points, duplicates and unverified = 0');
  // ---------------------------------------------------------------------------
  {
    const r = await http('POST', `/api/achievements/student/${A.student._id}`, {
      token: studentAToken,
      body: { title: 'Smart India Hackathon 2026', category: 'Hackathon', hackathonResult: 'Winner', eventDate: '2026-03-10' },
    });
    const ach = data(r.body)?.achievement;
    check('a student records an achievement for themselves (201)', r.status === 201, `status=${r.status} body=${bodyText(r.body)}`);
    check('points are server-computed to 25 for a Hackathon Winner', ach?.points === 25, JSON.stringify(ach));
    check('a fresh row starts Pending with pointsAwarded 0 even though points are 25', ach?.verified === false && ach?.verificationStatus === 'Pending' && ach?.pointsAwarded === 0, JSON.stringify(ach));

    const dup = await http('POST', `/api/achievements/student/${A.student._id}`, {
      token: studentAToken,
      body: { title: 'smart india hackathon 2026 ', category: 'Hackathon', hackathonResult: 'Winner', eventDate: '2026-03-10' },
    });
    check('an exact duplicate (case/space-insensitive) is refused 409', dup.status === 409, `status=${dup.status} body=${bodyText(dup.body)}`);

    const crossStudent = await http('POST', `/api/achievements/student/${B.student._id}`, {
      token: studentAToken,
      body: { title: 'Hack B Winner', category: 'Hackathon', hackathonResult: 'Winner', eventDate: '2026-04-01' },
    });
    check('student A cannot write achievements for student B', crossStudent.status === 403, `status=${crossStudent.status}`);

    const workshop = await http('POST', `/api/achievements/student/${A.student._id}`, {
      token: studentAToken,
      body: { title: 'React Bootcamp', category: 'Workshop', eventDate: '2026-04-02' },
    });
    check('a Workshop row is computed at 5 points', data(workshop.body)?.achievement?.points === 5, JSON.stringify(data(workshop.body)));

    const other = await http('POST', `/api/achievements/student/${A.student._id}`, {
      token: studentAToken,
      body: { title: 'Class Representative Duty', category: 'Other', eventDate: '2026-04-03' },
    });
    check('an "Other" category row computes to 0 points (not on the table)', data(other.body)?.achievement?.points === 0, JSON.stringify(data(other.body)));

    const otherVerify = await http('POST', `/api/achievements/${data(other.body)?.achievement?.id}/verify`, { token: mentorAToken });
    check('verifying a 0-point "Other" row is refused 409', otherVerify.status === 409 && /point table/i.test(bodyText(otherVerify.body)), `status=${otherVerify.status} body=${bodyText(otherVerify.body)}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nVerification pipeline');
  // ---------------------------------------------------------------------------
  {
    const pending: any[] = await Achievement.find({ student: A.student._id, verificationStatus: 'Pending' }).lean();
    check('student A has 2 Pending rows app-side', pending.length >= 2, `count=${pending.length}`);

    const before = await http('GET', '/api/leaderboard', { token: adminToken });
    const beforeA = (data(before.body)?.entries ?? []).find((e: any) => e.registerNumber === '731523301101');
    // Only the two SEEDED verified rows count; the two Pending rows just created
    // must not contribute yet.
    check('PENDING rows contribute 0 points to the leaderboard', beforeA?.totalPoints === 30 && beforeA?.achievementCount === 2 && beforeA?.categoryCounts?.Hackathon === 1, JSON.stringify(beforeA));

    const hack = pending.find((p: any) => p.title === 'Smart India Hackathon 2026');
    const verified = await http('POST', `/api/achievements/${String(hack._id)}/verify`, { token: mentorAToken });
    check('an assigned mentor verifies the Hackathon Winner (25)', verified.status === 200 && data(verified.body)?.awardedPoints === 25, `status=${verified.status} body=${bodyText(verified.body)}`);

    const reVerify = await http('POST', `/api/achievements/${String(hack._id)}/verify`, { token: mentorAToken });
    check('re-verifying an Approved row is refused 409', reVerify.status === 409, `status=${reVerify.status}`);

    const verifyByStudent = await http('POST', `/api/achievements/${String(hack._id)}/verify`, { token: studentAToken });
    check('a student cannot verify (only FACULTY/HOD/ADMIN)', verifyByStudent.status === 403, `status=${verifyByStudent.status}`);

    const edited = await http('PUT', `/api/achievements/${String(hack._id)}`, {
      token: studentAToken,
      body: { title: 'Smart India Hackathon 2026 Edited' },
    });
    check('editing an Approved row is refused 409', edited.status === 409, `status=${edited.status} body=${bodyText(edited.body)}`);

    const ws = pending.find((p: any) => p.title === 'React Bootcamp');
    const wsVerified = await http('POST', `/api/achievements/${String(ws._id)}/verify`, { token: mentorAToken });
    check('the Workshop verifies to 5 points', wsVerified.status === 200 && data(wsVerified.body)?.awardedPoints === 5, `status=${wsVerified.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nResult-required refusal + edit-to-resubmit');
  // ---------------------------------------------------------------------------
  {
    const r = await http('POST', `/api/achievements/student/${C.student._id}`, {
      token: studentAToken,
      body: { title: 'Ethackathon 2026', category: 'Hackathon', eventDate: '2026-05-01' },
    });
    // Student token is 731523301101; C has no user token, so post it as mentor A.
    const rc = await http('POST', `/api/achievements/student/${C.student._id}`, {
      token: mentorAToken,
      body: { title: 'Ethackathon 2026', category: 'Hackathon', eventDate: '2026-05-01' },
    });
    void r;
    const ach = data(rc.body)?.achievement;
    check('a Hackathon row with no result is recorded Pending', rc.status === 201 && ach?.points === 0, `status=${rc.status} body=${bodyText(rc.body)}`);

    const refused = await http('POST', `/api/achievements/${String(ach?.id)}/verify`, { token: mentorAToken });
    check('verifying a Hackathon row without a result is refused 409', refused.status === 409 && /result/i.test(bodyText(refused.body)), `status=${refused.status} body=${bodyText(refused.body)}`);

    const resub = await http('PUT', `/api/achievements/${String(ach?.id)}`, {
      token: mentorAToken,
      body: { hackathonResult: 'Participation' },
    });
    const resubAch = data(resub.body)?.achievement;
    check('adding the result recomputes points to 10 (Participation)', resub.status === 200 && resubAch?.points === 10, `status=${resub.status} body=${bodyText(resub.body)}`);

    const verifiedNow = await http('POST', `/api/achievements/${String(ach?.id)}/verify`, { token: mentorAToken });
    check('after the result is recorded the row verifies to 10 points', verifiedNow.status === 200 && data(verifiedNow.body)?.awardedPoints === 10, `status=${verifiedNow.status}`);

    const draft = await http('POST', `/api/achievements/student/${A.student._id}`, {
      token: studentAToken,
      body: { title: 'Draft Row', category: 'Competition / Event', eventDate: '2026-05-15' },
    });
    const draftAch = data(draft.body)?.achievement;
    const failed = await http('PUT', `/api/achievements/${String(draftAch?.id)}`, { token: studentAToken, body: { title: '' } });
    check('blank title edit is rejected 400', failed.status === 400, `status=${failed.status} body=${bodyText(failed.body)}`);
    await http('POST', `/api/achievements/${String(draftAch?.id)}/reject`, { token: mentorAToken, body: { rejectionReason: 'Insufficient evidence.' } });
  }

  // ---------------------------------------------------------------------------
  console.log('\nReject path (un-verify + zero) and resubmission');
  // ---------------------------------------------------------------------------
  {
    const r = await http('POST', `/api/achievements/student/${B.student._id}`, {
      token: studentBToken,
      body: { title: 'Coding Sprint', category: 'Competition / Event', eventDate: '2026-06-01' },
    });
    const ach = data(r.body)?.achievement;
    check('student B records a Competition / Event row (5 potential points)', r.status === 201 && ach?.points === 5, `status=${r.status}`);

    const rejected = await http('POST', `/api/achievements/${String(ach?.id)}/reject`, {
      token: mentorAToken,
      body: { rejectionReason: 'No supporting certificate was provided.' },
    });
    const rej = data(rejected.body)?.achievement;
    check('reject sets Rejected + un-verifies and zeroes awarded points', rejected.status === 200 && rej?.verificationStatus === 'Rejected' && rej?.verified === false && rej?.pointsAwarded === 0, JSON.stringify(rej));

    const resubmit = await http('PUT', `/api/achievements/${String(ach?.id)}`, {
      token: studentBToken,
      body: { eventDate: '2026-06-02' },
    });
    const resub = data(resubmit.body)?.achievement;
    check('editing a Rejected row resubmits it as Pending with award zeroed', resubmit.status === 200 && resub?.verificationStatus === 'Pending' && resub?.pointsAwarded === 0, JSON.stringify(resub));

    const nowVerified = await http('POST', `/api/achievements/${String(ach?.id)}/verify`, { token: mentorAToken });
    check('the resubmitted row verifies to 5 points', nowVerified.status === 200 && data(nowVerified.body)?.awardedPoints === 5, `status=${nowVerified.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nLeaderboard scopes + ranking determinism');
  // ---------------------------------------------------------------------------
  // Expected college-wide: A 30 (2), D 20 (1), C 18 (2), B 13 (2), E 0, F 0.
  // A: seeded Winner 25 + seeded Workshop 5 + verified Hack 25 + verified React 5 = 60, count 4.
  // B: seeded AWS 8 + verified Coding Sprint 5 = 13, count 2.
  // C: seeded paper 8 + verified Ethackathon 10 = 18, count 2.
  // D: seeded Runner-up 20.
  {
    const college = await http('GET', '/api/leaderboard', { token: adminToken });
    const rows: any[] = (data(college.body)?.entries ?? []) as any[];
    const byReg = new Map<string, any>(rows.map((e: any) => [e.registerNumber, e]));
    check('college scope returns every active student including 0-point students', rows.length === 6 && byReg.has('731523301104') && byReg.get('731523301104')?.totalPoints === 0, `rows=${rows.length} ${JSON.stringify(rows.map((r: any) => r.registerNumber))}`);
    check('points only count verified (Approved) rows', byReg.get('731523301101')?.totalPoints === 60 && byReg.get('731523301101')?.achievementCount === 4 && byReg.get('731523301103')?.totalPoints === 18, JSON.stringify([...byReg.entries()].map(([k, v]) => [k, v.totalPoints, v.achievementCount])));
    check('ranking is by points DESC', rows[0].registerNumber === '731523301101' && rows[1].registerNumber === '731523301201' && rows[2].registerNumber === '731523301103' && rows[3].registerNumber === '731523301102', JSON.stringify(rows.map((r: any) => [r.registerNumber, r.totalPoints, r.rank])));
    check('0-point students are ranked sequentially by register number ASC', rows[4].registerNumber === '731523301104' && rows[4].rank === 5 && rows[5].registerNumber === '731523301105' && rows[5].rank === 6, JSON.stringify(rows.slice(4).map((r: any) => [r.registerNumber, r.rank])));
    check('category breakdown is present per student', Array.isArray(byReg.get('731523301101')?.categoryCounts) === false && typeof byReg.get('731523301101')?.categoryPoints === 'object', JSON.stringify(byReg.get('731523301101')));

    const hod = await http('GET', '/api/leaderboard', { token: hodToken });
    const hodRows = data(hod.body)?.entries ?? [];
    check('HOD scope is department-only and excludes the IT student', data(hod.body)?.scope === 'DEPARTMENT' && hodRows.length === 5 && !hodRows.some((r: any) => r.registerNumber === '731523301201'), `scope=${data(hod.body)?.scope} rows=${hodRows.length} ${JSON.stringify(hodRows.map((r: any) => r.registerNumber))}`);

    const mentor = await http('GET', '/api/leaderboard', { token: mentorAToken });
    const mentorRows = data(mentor.body)?.entries ?? [];
    check('mentor scope is MENTEES only (A, B, C, D)', data(mentor.body)?.scope === 'MENTEES' && mentorRows.length === 4, `scope=${data(mentor.body)?.scope} rows=${mentorRows.length}`);
    check('mentor scope excludes non-mentees E and F', !mentorRows.some((r: any) => r.registerNumber === '731523301104' || r.registerNumber === '731523301105'), JSON.stringify(mentorRows.map((r: any) => r.registerNumber)));

    const me = await http('GET', '/api/leaderboard', { token: studentAToken });
    check('a student sees the college-wide scope with their own rank resolved', data(me.body)?.scope === 'COLLEGE' && data(me.body)?.me?.registerNumber === '731523301101' && data(me.body)?.me?.rank === 1, JSON.stringify(data(me.body)?.me));

    const detail = await http('GET', `/api/leaderboard/student/${A.student._id}`, { token: studentAToken });
    const dd = data(detail.body);
    check('student detail returns aggregated totals and itemised verified achievements', detail.status === 200 && dd?.totalPoints === 60 && dd?.achievementCount === 4 && Array.isArray(dd?.achievements) && dd.achievements.every((a: any) => a.pointsAwarded > 0), JSON.stringify(dd));

    const crossDetail = await http('GET', `/api/leaderboard/student/${D.student._id}`, { token: mentorBToken });
    check('mentor B cannot view the detail of a student outside their scope', crossDetail.status === 403, `status=${crossDetail.status}`);
  }

  await store.teardown();

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) {
    console.error('FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('ALL LEADERBOARD TESTS PASSED SUCCESSFULLY! (100% GREEN)\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});