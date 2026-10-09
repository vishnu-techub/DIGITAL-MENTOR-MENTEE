/**
 * Placement Monitoring - full-stack runtime verification.
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against a real local
 * file store and drives the placement lifecycle over HTTP as a real mentor,
 * HOD and admin, then reads back the actual persisted records.
 *
 * Nothing is stubbed. Covers: auth/RBAC, final-year scoping, the locked
 * transition table (including the terminal PLACED state and the non-terminal
 * NOT_SELECTED path), derived placed/notPlaced fields, PLACED company
 * requirement, HOD department isolation, mentor-wise/student-wise aggregates
 * and audit logging.
 *
 * TEMPORARY LOCAL FILE STORAGE. Replace with a persistent database/storage
 * implementation before production deployment.
 *
 * Run: npx tsx src/tests/placement.test.ts
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('placement');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5113;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'placement-secret-do-not-use-in-prod';
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

async function main() {
  const { connectDB } = await import('../config/database.js');
  await connectDB();

  const { User, Faculty, Department, Batch, Student, MentorAssignment, Placement, AuditLog } =
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

  const mentorA = await seedFaculty('mentor.lakshmi', 'Dr Lakshmi Mentor', dept, 'FAC-P1');
  const mentorB = await seedFaculty('mentor.karthik', 'Dr Karthik Mentor', dept, 'FAC-P2');
  const mentorC = await seedFaculty('mentor.it', 'Dr IT Mentor', itDept, 'FAC-P3');

  const hodUser: any = await User.create({
    username: 'hod.cse',
    passwordHash: hash,
    role: 'HOD',
    email: 'hod.cse@ksrce.test',
    fullName: 'Dr HOD CSE',
    department: dept._id,
    isActive: true,
  });
  await Faculty.create({
    user: hodUser._id,
    employeeId: 'HOD-P1',
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

  const studentA = await seedStudent('731523301101', 'Aditi Final', '731523301101', dept, 4, 'A');
  const studentB = await seedStudent('731523301102', 'Bharath Final', '731523301102', dept, 4, 'B');
  const studentC = await seedStudent('731523301103', 'Charan Third', '731523301103', dept, 3, 'A');
  const studentD = await seedStudent('731523301201', 'IT Final', '731523301201', itDept, 4, 'A');

  const adminUser: any = await User.findOne({ role: 'ADMIN' });
  const assignedBy = adminUser?._id || hodUser._id;

  await MentorAssignment.create([
    { student: studentA.student._id, mentor: mentorA.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
    { student: studentB.student._id, mentor: mentorB.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
    { student: studentC.student._id, mentor: mentorA.faculty._id, department: dept._id, status: 'ACTIVE', assignedBy },
    { student: studentD.student._id, mentor: mentorC.faculty._id, department: itDept._id, status: 'ACTIVE', assignedBy },
  ]);

  console.log('\n=== Placement monitoring: full-stack runtime ===\n');
  console.log('  booting src/index.ts ...');
  await import('../index.js');
  await waitForHealth();

  const adminToken = await loginAdmin();
  const mentorAToken = await login('mentor A', 'mentor.lakshmi');
  const mentorBToken = await login('mentor B', 'mentor.karthik');
  const mentorCToken = await login('mentor C IT', 'mentor.it');
  const hodToken = await login('HOD CSE', 'hod.cse');
  const studentAToken = await login('student A', '731523301101');

  function data(body: any) {
    return body?.data ?? body;
  }

  // ---------------------------------------------------------------------------
  console.log('\nRBAC, final-year scoping and validation');
  // ---------------------------------------------------------------------------
  {
    const noToken = await http('GET', `/api/placements/student/${studentA.student._id}`);
    check('an unauthenticated call is rejected 401', noToken.status === 401, `status=${noToken.status}`);

    const studentWrite = await http('POST', `/api/placements/student/${studentA.student._id}`, {
      token: studentAToken,
      body: { overallStatus: 'APPLYING' },
    });
    check('students cannot write placement records even for themselves', studentWrite.status === 403, `status=${studentWrite.status}`);

    const studentRead = await http('GET', `/api/placements/student/${studentA.student._id}`, { token: studentAToken });
    check('students cannot read placement records (mentor/HOD/admin scope only)', studentRead.status === 403, `status=${studentRead.status}`);

    // Mentor A is NOT assigned student B or D.
    const crossMentor = await http('GET', `/api/placements/student/${studentB.student._id}`, { token: mentorAToken });
    check('a mentor cannot read a non-mentee placement record', crossMentor.status === 403, `status=${crossMentor.status}`);

    const crossIT = await http('POST', `/api/placements/student/${studentD.student._id}`, {
      token: hodToken,
      body: { overallStatus: 'TRAINING' },
    });
    check("the CSE HOD cannot write another department's student", crossIT.status === 403, `status=${crossIT.status}`);

    const nonFinal = await http('POST', `/api/placements/student/${studentC.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'TRAINING' },
    });
    check('placement creation is refused for a non-final-year student (400)', nonFinal.status === 400 && /final-year/i.test(bodyText(nonFinal.body)), `status=${nonFinal.status} body=${bodyText(nonFinal.body)}`);

    const nonFinalRead = await http('GET', `/api/placements/student/${studentC.student._id}`, { token: mentorAToken });
    check('placement read is refused for a non-final-year student (400)', nonFinalRead.status === 400, `status=${nonFinalRead.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nLifecycle + transition table');
  // ---------------------------------------------------------------------------
  {
    // Create: NOT_STARTED default path.
    const created = await http('POST', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'NOT_STARTED', trainingProgress: 0 },
    });
    const pA = data(created.body)?.placement;
    check('a mentor can create the initial placement record', created.status === 201 && pA?.overallStatus === 'NOT_STARTED', `status=${created.status} body=${bodyText(created.body)}`);
    check('a fresh record is derived placed=false notPlaced=false', pA?.placed === false && pA?.notPlaced === false, JSON.stringify(pA));

    const duplicateCreate = await http('POST', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'TRAINING' },
    });
    check('creating twice for the same student is refused 409', duplicateCreate.status === 409, `status=${duplicateCreate.status}`);

    // NOT_STARTED -> PLACED must be rejected (not in the transition table).
    const jump = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'PLACED', placedCompanyName: 'TCS' },
    });
    check('NOT_STARTED -> PLACED is refused 409 (transition table)', jump.status === 409 && /cannot move/.test(bodyText(jump.body)), `status=${jump.status} body=${bodyText(jump.body)}`);

    // NOT_STARTED -> TRAINING -> APPLYING -> INTERVIEW -> SELECTED -> PLACED
    let flow = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'TRAINING', trainingProgress: 40, assessmentStatus: 'IN_PROGRESS' },
    });
    check('NOT_STARTED -> TRAINING allowed (200)', flow.status === 200 && data(flow.body)?.placement?.overallStatus === 'TRAINING', `status=${flow.status}`);

    const badProgress = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { trainingProgress: 150 },
    });
    check('training progress above 100 is rejected 400', badProgress.status === 400, `status=${badProgress.status} body=${bodyText(badProgress.body)}`);

    const badEnum = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { trainingStatus: 'BOGUS' },
    });
    check('a bogus sub-status enum is rejected 400', badEnum.status === 400, `status=${badEnum.status}`);

    flow = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'APPLYING', companyName: 'Infosys', applicationStatus: 'APPLIED' },
    });
    check('TRAINING -> APPLYING allowed', flow.status === 200 && data(flow.body)?.placement?.overallStatus === 'APPLYING', `status=${flow.status}`);

    flow = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'INTERVIEW', interviewStatus: 'SCHEDULED' },
    });
    check('APPLYING -> INTERVIEW allowed', flow.status === 200 && data(flow.body)?.placement?.overallStatus === 'INTERVIEW', `status=${flow.status}`);

    flow = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'SELECTED' },
    });
    check('INTERVIEW -> SELECTED allowed', flow.status === 200 && data(flow.body)?.placement?.overallStatus === 'SELECTED' && data(flow.body)?.placement?.selectionStatus === 'SELECTED', `status=${flow.status}`);

    const clearCompany = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'SELECTED', companyName: '' },
    });
    check('company name can be cleared while still SELECTED', clearCompany.status === 200 && data(clearCompany.body)?.placement?.companyName === '', `status=${clearCompany.status}`);

    const placedNoCompany = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'PLACED' },
    });
    check('marking PLACED without a company is refused 409', placedNoCompany.status === 409 && /company name/i.test(bodyText(placedNoCompany.body)), `status=${placedNoCompany.status} body=${bodyText(placedNoCompany.body)}`);

    flow = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'PLACED', placedCompanyName: 'Infosys', placementDate: '2026-08-14', package: 6.5 },
    });
    const placedRow = data(flow.body)?.placement;
    check('SELECTED -> PLACED allowed with company', flow.status === 200 && placedRow?.overallStatus === 'PLACED', `status=${flow.status}`);
    check('PLACED derives placed=true notPlaced=false', placedRow?.placed === true && placedRow?.notPlaced === false, JSON.stringify(placedRow));
    check('package and placement date persist', placedRow?.package === 6.5 && placedRow?.placementDate === '2026-08-14', JSON.stringify(placedRow));
    check('placedCompanyName persists', placedRow?.placedCompanyName === 'Infosys', JSON.stringify(placedRow));

    const reopen = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'APPLYING' },
    });
    check('PLACED is terminal - any reopen is refused 409', reopen.status === 409, `status=${reopen.status} body=${bodyText(reopen.body)}`);

    const rolled = await http('PUT', `/api/placements/student/${studentA.student._id}`, {
      token: mentorAToken,
      body: { overallStatus: 'PLACED', mentorRemarks: 'Final offer accepted' },
    });
    check('updating details of a PLACED student (same status) still works', rolled.status === 200 && data(rolled.body)?.placement?.overallStatus === 'PLACED', `status=${rolled.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nNon-terminal NOT_SELECTED and NOT_PLACED');
  // ---------------------------------------------------------------------------
  {
    const created = await http('POST', `/api/placements/student/${studentB.student._id}`, {
      token: mentorBToken,
      body: { overallStatus: 'APPLYING', companyName: 'Cognizant' },
    });
    check('student B record created at APPLYING', created.status === 201 && data(created.body)?.placement?.overallStatus === 'APPLYING', `status=${created.status}`);

    const notSelected = await http('PUT', `/api/placements/student/${studentB.student._id}`, {
      token: mentorBToken,
      body: { overallStatus: 'NOT_SELECTED' },
    });
    check('APPLYING -> NOT_SELECTED allowed', notSelected.status === 200 && data(notSelected.body)?.placement?.selectionStatus === 'NOT_SELECTED', `status=${notSelected.status}`);

    const backToApplying = await http('PUT', `/api/placements/student/${studentB.student._id}`, {
      token: mentorBToken,
      body: { overallStatus: 'APPLYING', companyName: 'Zoho' },
    });
    check('NOT_SELECTED -> APPLYING allowed (NOT_SELECTED is not terminal)', backToApplying.status === 200, `status=${backToApplying.status}`);

    const notPlaced = await http('PUT', `/api/placements/student/${studentB.student._id}`, {
      token: mentorBToken,
      body: { overallStatus: 'NOT_PLACED' },
    });
    check('APPLYING -> NOT_PLACED allowed', notPlaced.status === 200 && data(notPlaced.body)?.placement?.notPlaced === true && data(notPlaced.body)?.placement?.placed === false, `status=${notPlaced.status}`);

    const notPlacedBack = await http('PUT', `/api/placements/student/${studentB.student._id}`, {
      token: mentorBToken,
      body: { overallStatus: 'TRAINING' },
    });
    check('NOT_PLACED -> TRAINING allowed (recovery path)', notPlacedBack.status === 200, `status=${notPlacedBack.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nMentor aggregate (assigned mentees, final-year only)');
  // ---------------------------------------------------------------------------
  {
    const res = await http('GET', '/api/placements/mentor', { token: mentorAToken });
    const rows = data(res.body)?.students ?? [];
    const summary = data(res.body)?.summary;
    check('mentor list returns 200', res.status === 200, `status=${res.status}`);
    check('mentor scope shows only the assigned final-year mentee', rows.length === 1 && rows[0].studentId === String(studentA.student._id), JSON.stringify(rows.map((r: any) => r.registerNumber)));
    check('student A is reported PLACED with the persisted company', rows[0]?.overallStatus === 'PLACED' && rows[0]?.placed === true && rows[0]?.placedCompanyName === 'Infosys', JSON.stringify(rows[0]));
    check('the non-final-year mentee is excluded from the mentor aggregate', !rows.some((r: any) => r.studentId === String(studentC.student._id)), JSON.stringify(rows.map((r: any) => r.registerNumber)));
    check('mentor summary totals are self-consistent', summary?.totalFinalYearStudents === 1 && summary?.placed === 1 && summary?.placementPercentage === 100, JSON.stringify(summary));

    const unassigned = await http('GET', '/api/placements/mentor', { token: mentorBToken });
    check('mentor B sees ONLY their own mentee (scope not college-wide)', (data(unassigned.body)?.students ?? []).length === 1 && (data(unassigned.body)?.students ?? [])[0].registerNumber === '731523301102', JSON.stringify((data(unassigned.body)?.students ?? []).map((r: any) => r.registerNumber)));
  }

  // ---------------------------------------------------------------------------
  console.log('\nHOD department aggregate + isolation');
  // ---------------------------------------------------------------------------
  {
    const summary = await http('GET', '/api/placements/hod/summary', { token: hodToken });
    const d = data(summary.body)?.summary;
    check('HOD summary returns 200', summary.status === 200, `status=${summary.status}`);
    check('HOD summary counts only the department final-year students (PLACED 1, TRAINING 1)', d?.totalFinalYearStudents === 2 && d?.placed === 1 && d?.training === 1, JSON.stringify(d));
    check('placementPercentage = placed / total', typeof d?.placementPercentage === 'number' && d.placementPercentage === 50, JSON.stringify(d));

    const studentWise = await http('GET', '/api/placements/hod/student-wise', { token: hodToken });
    const swRows = data(studentWise.body)?.students ?? [];
    check('HOD student-wise lists both department students', swRows.length === 2, JSON.stringify(swRows.map((r: any) => r.registerNumber)));
    check('HOD student-wise excludes the IT student', !swRows.some((r: any) => r.registerNumber.startsWith('7315233012')), JSON.stringify(swRows.map((r: any) => r.registerNumber)));

    const filtered = await http('GET', '/api/placements/hod/student-wise?status=PLACED', { token: hodToken });
    const fRows = data(filtered.body)?.students ?? [];
    check('student-wise status filter works server-side', fRows.length === 1 && fRows[0].overallStatus === 'PLACED' && fRows[0].registerNumber === '731523301101', JSON.stringify(fRows.map((r: any) => ({ reg: r.registerNumber, s: r.overallStatus }))));

    const mentorWise = await http('GET', '/api/placements/hod/mentor-wise', { token: hodToken });
    const mentors = data(mentorWise.body)?.mentors ?? [];
    const lakshmi = mentors.find((m: any) => m.mentorName.includes('Lakshmi'));
    const karthik = mentors.find((m: any) => m.mentorName.includes('Karthik'));
    check('mentor-wise lists both CSE mentors with their mentee counts', mentors.length === 2 && lakshmi?.finalYearMentees === 1 && karthik?.finalYearMentees === 1, JSON.stringify(mentors));
    check('mentor-wise placed counts are per mentor', lakshmi?.placed === 1 && karthik?.placed === 0, JSON.stringify(mentors));

    const asAdmin = await http('GET', '/api/placements/hod/summary', { token: adminToken });
    check('an ADMIN cannot view the department summary (HOD-only view)', asAdmin.status === 403, `status=${asAdmin.status}`);

    const asITMentor = await http('GET', `/api/placements/student/${studentD.student._id}`, { token: mentorCToken });
    const itRow = data(asITMentor.body);
    check('the IT mentor can read their own final-year mentee', asITMentor.status === 200 && itRow?.placement === null && itRow?.isFinalYear === true, `status=${asITMentor.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nPersistence + audit');
  // ---------------------------------------------------------------------------
  {
    const stored = await Placement.findOne({ student: studentA.student._id }).lean();
    check('the PLACED row is persisted with derived fields', stored && stored.placed === true && stored.notPlaced === false && stored.overallStatus === 'PLACED' && stored.placedCompanyName === 'Infosys', JSON.stringify(stored));

    const audits: any[] = await AuditLog.find({ entity: 'PLACEMENT' }).lean();
    const actions = new Set(audits.map((a) => a.action));
    check('create and update actions are audited', actions.has('CREATE_PLACEMENT') && actions.has('UPDATE_PLACEMENT'), JSON.stringify(actions));
  }

  await store.teardown();

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) {
    console.error('FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('ALL PLACEMENT TESTS PASSED SUCCESSFULLY! (100% GREEN)\n');
  process.exit(0);

  function loginAdmin() {
    return login('admin', 'admin', 'Admin@12345');
  }
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});