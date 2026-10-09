/**
 * Internal Marks + Admin-controlled mark entry - full-stack runtime verification.
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against a real local file
 * store and drives the whole mark lifecycle over HTTP as a real Admin, mentor,
 * HOD and student, then reads back the actual persisted records.
 *
 * Nothing is stubbed. Expiry is tested by backdating the stored permission row,
 * so the refusal path is the production code path on the server clock.
 *
 * Covers: permission enable/disable + validation, window enforcement (ACTIVE,
 * INACTIVE, EXPIRED), validation of mark payloads, role/scope isolation for
 * reads and writes, the correction-request lifecycle (create / duplicate /
 * approve / reject / audit), and the three PDF download modes
 * (full / internal / mentor-documents) including filenames and section
 * separation.
 *
 * TEMPORARY LOCAL FILE STORAGE. Replace with a persistent database/storage
 * implementation before production deployment.
 *
 * Run: npx tsx src/tests/internal-marks.test.ts
 */
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('internal-marks');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5112;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'internal-marks-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';

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
): Promise<{ status: number; body: any; bytes: number; contentType: string; disposition: string }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const contentType = res.headers.get('content-type') || '';
  const disposition = res.headers.get('content-disposition') || '';
  let parsed: any = null;
  let bytes = 0;
  if (contentType.includes('application/json')) {
    const text = await res.text();
    bytes = Buffer.byteLength(text);
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    bytes = buf.length;
    parsed = buf;
  }
  return { status: res.status, body: parsed, bytes, contentType, disposition };
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

async function loginAs(role: string, username: string, password: string): Promise<string> {
  const res = await http('POST', '/api/auth/login', { body: { username, password } });
  assert(res.status === 200, `login ${role} failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body?.data?.token || res.body?.token;
  assert(token, `login ${role} returned no token: ${JSON.stringify(res.body)}`);
  return token;
}

/** Best-effort text extraction from a PDF buffer, for content assertions. */
function pdfBytesToText(buf: Buffer): string {
  if (!Buffer.isBuffer(buf)) return String(buf || '');
  const raw = buf.toString('latin1');
  const parts: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) parts.push(m[1].replace(/\\([()\\])/g, '$1'));
  return parts.join(' ');
}

function bodyText(body: any): string {
  return typeof body === 'string' ? body : JSON.stringify(body ?? '');
}

async function main() {
  const { connectDB } = await import('../config/database.js');
  await connectDB();

  const {
    Faculty,
    Department,
    Batch,
    Student,
    User,
    MentorAssignment,
    CounsellingRecord,
    Meeting,
    AuditLog,
    MarkEntryPermission,
  } = await import('../models/index.js');
  const { MARK_ENTRY_PERMISSION_KEY } = await import('../models/MarkEntryPermission.model.js');
  const { storeEvidenceUploads } = await import('../modules/counselling/evidence.service.js');

  // ---- SEED (setup only; not part of the system under test) ----------------
  const hash = bcrypt.hashSync('Mentor@123', 10);
  const dept: any = await Department.create({ name: 'Computer Science', code: 'CSE' });
  const batch = await Batch.create({ name: '2023-2027', startYear: 2023, endYear: 2027 });

  // Mentor A: the ACTIVE mentor of student A.
  const mentorAUser: any = await User.create({
    username: 'mentor.priya',
    passwordHash: hash,
    role: 'FACULTY',
    email: 'priya.mentor@ksrce.test',
    fullName: 'Dr Priya Mentor',
    department: dept._id,
    isActive: true,
  });
  const mentorAFaculty: any = await Faculty.create({
    user: mentorAUser._id,
    employeeId: 'FAC-IM1',
    designation: 'Assistant Professor',
    cabinLocation: 'FAC-201',
    department: dept._id,
    isActive: true,
  });

  // Mentor B: same department but assigned to nobody.
  const mentorBUser: any = await User.create({
    username: 'mentor.rahul',
    passwordHash: hash,
    role: 'FACULTY',
    email: 'rahul.mentor@ksrce.test',
    fullName: 'Dr Rahul Mentor',
    department: dept._id,
    isActive: true,
  });
  const mentorBFaculty: any = await Faculty.create({
    user: mentorBUser._id,
    employeeId: 'FAC-IM2',
    designation: 'Assistant Professor',
    cabinLocation: 'FAC-202',
    department: dept._id,
    isActive: true,
  });

  // HOD of the same department.
  const hodUser: any = await User.create({
    username: 'hod.cse',
    passwordHash: hash,
    role: 'HOD',
    email: 'hod.cse@ksrce.test',
    fullName: 'Dr Suresh HOD',
    department: dept._id,
    isActive: true,
  });
  await Faculty.create({
    user: hodUser._id,
    employeeId: 'HOD-IM1',
    designation: 'Head of Department',
    cabinLocation: 'HOD-1',
    department: dept._id,
    isActive: true,
  });

  // Student A: mentee of mentor A.
  const studentAUser: any = await User.create({
    username: '731523301001',
    passwordHash: hash,
    role: 'STUDENT',
    email: 'aruna.im@ksrce.test',
    fullName: 'Aruna K',
    department: dept._id,
    isActive: true,
  });
  const studentA: any = await Student.create({
    user: studentAUser._id,
    fullName: 'Aruna K',
    registerNumber: '731523301001',
    email: 'aruna.im@ksrce.test',
    mobileNumber: '9876501001',
    department: dept._id,
    section: 'A',
    year: 3,
    batch: batch._id,
    profileCompleted: true,
    isActive: true,
  });

  // Student B: same department, mentored by nobody (scope probe target).
  const studentBUser: any = await User.create({
    username: '731523301002',
    passwordHash: hash,
    role: 'STUDENT',
    email: 'bharath.im@ksrce.test',
    fullName: 'Bharath S',
    department: dept._id,
    isActive: true,
  });
  const studentB: any = await Student.create({
    user: studentBUser._id,
    fullName: 'Bharath S',
    registerNumber: '731523301002',
    email: 'bharath.im@ksrce.test',
    mobileNumber: '9876501002',
    department: dept._id,
    section: 'B',
    year: 3,
    batch: batch._id,
    profileCompleted: true,
    isActive: true,
  });

  const adminUser: any = await User.findOne({ role: 'ADMIN' });
  await MentorAssignment.create({
    student: studentA._id,
    mentor: mentorAFaculty._id,
    department: dept._id,
    status: 'ACTIVE',
    assignedBy: adminUser?._id || mentorAUser._id,
  });

  console.log('\n=== Internal Marks: full-stack runtime ===\n');
  console.log('  booting src/index.ts ...');
  await import('../index.js');
  await waitForHealth();

  const adminToken = await loginAs('admin', 'admin', 'Admin@12345');
  const mentorAToken = await loginAs('mentor A', 'mentor.priya', 'Mentor@123');
  const mentorBToken = await loginAs('mentor B', 'mentor.rahul', 'Mentor@123');
  const hodToken = await loginAs('HOD', 'hod.cse', 'Mentor@123');
  const studentAToken = await loginAs('student A', '731523301001', 'Mentor@123');
  check('admin, both mentors, HOD and student all authenticate through the real endpoint', true);

  // ---------------------------------------------------------------------------
  console.log('\nPermission starts INACTIVE and is ADMIN-only');
  // ---------------------------------------------------------------------------
  {
    const initial = await http('GET', '/api/marks/permission', { token: adminToken });
    const state = initial.body?.data?.permission ?? initial.body?.permission;
    check('GET /permission as Admin returns the INACTIVE state', initial.status === 200 && state?.status === 'INACTIVE', `status=${initial.status} state=${JSON.stringify(state)}`);
    check('an unconfigured permission exposes no editable mark types', Array.isArray(state?.editableMarkTypes) && state.editableMarkTypes.length === 0, JSON.stringify(state?.editableMarkTypes));

    const asMentor = await http('GET', '/api/marks/permission', { token: mentorAToken });
    check('a mentor cannot read the permission switch', asMentor.status === 403, `status=${asMentor.status}`);

    const putAsMentor = await http('PUT', '/api/marks/permission', { token: mentorAToken, body: { enabled: true } });
    check('a mentor cannot flip the permission switch', putAsMentor.status === 403, `status=${putAsMentor.status}`);

    const missingFlag = await http('PUT', '/api/marks/permission', { token: adminToken, body: {} });
    check('enable without the enabled flag is rejected 400', missingFlag.status === 400, `status=${missingFlag.status}`);

    const badType = await http('PUT', '/api/marks/permission', { token: adminToken, body: { enabled: true, markTypes: ['BOGUS'] } });
    check('an unknown mark type is rejected 400', badType.status === 400 && bodyText(badType.body).includes('BOGUS'), `status=${badType.status} body=${bodyText(badType.body)}`);

    const emptyTypes = await http('PUT', '/api/marks/permission', { token: adminToken, body: { enabled: true, markTypes: [] } });
    check('an empty mark-type list is rejected 400', emptyTypes.status === 400 && bodyText(emptyTypes.body).includes('at least one mark type'), `status=${emptyTypes.status}`);

    const badDuration = await http('PUT', '/api/marks/permission', { token: adminToken, body: { enabled: true, markTypes: ['IA1'], durationDays: 0 } });
    check('durationDays below 1 is rejected 400', badDuration.status === 400, `status=${badDuration.status}`);

    const writeWhileInactive = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 40 },
    });
    check('a mentor cannot write marks before the window is enabled', writeWhileInactive.status === 403 && bodyText(writeWhileInactive.body).includes('not enabled'), `status=${writeWhileInactive.status} body=${bodyText(writeWhileInactive.body)}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nAdmin enables the window; mentor writes during the ACTIVE window');
  // ---------------------------------------------------------------------------
  {
    const enable = await http('PUT', '/api/marks/permission', {
      token: adminToken,
      body: { enabled: true, markTypes: ['IA1', 'IA2', 'END_SEM'], durationDays: 7 },
    });
    const state = enable.body?.data?.permission ?? enable.body?.permission;
    check('enable returns 200 with status ACTIVE', enable.status === 200 && state?.status === 'ACTIVE', `status=${enable.status} state=${JSON.stringify(state)}`);
    check('all three mark types are editable while ACTIVE', state?.editableMarkTypes?.length === 3, JSON.stringify(state?.editableMarkTypes));
    check('the window expires in the future', new Date(state?.expiresAt).getTime() > Date.now(), String(state?.expiresAt));

    const notAdmin = await http('PUT', '/api/marks/permission', { token: hodToken, body: { enabled: true } });
    check('even a HOD cannot flip the permission switch', notAdmin.status === 403, `status=${notAdmin.status}`);

    // ---- payload validation, all inside the ACTIVE window ------------------
    const overMax = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 55 },
    });
    check('IA1 above 50 is rejected 400', overMax.status === 400 && bodyText(overMax.body).includes('IA1'), `status=${overMax.status}`);

    const badCode = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'x!', subjectName: 'Object Oriented Analysis and Design', ia1: 40 },
    });
    check('a malformed subject code is rejected 400', badCode.status === 400 && bodyText(badCode.body).includes('subject code'), `status=${badCode.status}`);

    const noMarks = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design' },
    });
    check('a payload with no marks at all is rejected 400', noMarks.status === 400 && bodyText(noMarks.body).includes('at least one mark'), `status=${noMarks.status}`);

    const noName = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', ia1: 40 },
    });
    check('a missing subject name is rejected 400', noName.status === 400 && bodyText(noName.body).toLowerCase().includes('subject name'), `status=${noName.status}`);

    // ---- role / scope isolation on the write route -------------------------
    const byStudent = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: studentAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 40 },
    });
    check('a student can never write marks (route refuses 403)', byStudent.status === 403, `status=${byStudent.status}`);

    const byUnassignedMentor = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorBToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 40 },
    });
    check('an unassigned mentor cannot write this mentee\'s marks', byUnassignedMentor.status === 403 && bodyText(byUnassignedMentor.body).includes('assigned mentor'), `status=${byUnassignedMentor.status} body=${bodyText(byUnassignedMentor.body)}`);

    const byWrongDeptHod = await http('PUT', `/api/marks/student/${studentB._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 40 },
    });
    check('a mentor cannot write a non-mentee student\'s marks', byWrongDeptHod.status === 403, `status=${byWrongDeptHod.status}`);

    // ---- legitimate writes -------------------------------------------------
    const hodWrite = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: hodToken,
      body: { semesterNumber: 5, subjectCode: 'CS8401', subjectName: 'Data Structures and Algorithms', ia1: 45, ia2: 41 },
    });
    check('the HOD of the student\'s department can write marks while ACTIVE', hodWrite.status === 200, `status=${hodWrite.status} body=${bodyText(hodWrite.body)}`);

    const mentorWrite = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 42, ia2: 38, endSem: 76 },
    });
    const saved = mentorWrite.body?.data?.mark ?? mentorWrite.body?.mark;
    check('the assigned mentor saves IA1/IA2/End-Sem in one call', mentorWrite.status === 200 && saved?.ia1 === 42 && saved?.ia2 === 38 && saved?.endSem === 76, `status=${mentorWrite.status} mark=${JSON.stringify(saved)}`);
    check('the saved row records who entered it', saved?.updatedByName === 'Dr Priya Mentor', String(saved?.updatedByName));

    const readBack = await http('GET', `/api/marks/student/${studentA._id}`, { token: mentorAToken });
    const rows: any[] = readBack.body?.data?.marks ?? [];
    check('GET returns both subjects with the stored values', readBack.status === 200 && rows.length === 2 && rows.find((r) => r.subjectCode === 'CS8491')?.ia1 === 42 && rows.find((r) => r.subjectCode === 'CS8401')?.ia1 === 45, JSON.stringify(rows));

    const selfRead = await http('GET', `/api/marks/student/${studentA._id}`, { token: studentAToken });
    check('the student can read their own marks', selfRead.status === 200 && (selfRead.body?.data?.marks ?? []).length === 2, `status=${selfRead.status}`);

    const crossRead = await http('GET', `/api/marks/student/${studentB._id}`, { token: studentAToken });
    check('a student cannot read another student\'s marks', crossRead.status === 403, `status=${crossRead.status}`);

    const unassignedRead = await http('GET', `/api/marks/student/${studentA._id}`, { token: mentorBToken });
    check('an unassigned mentor cannot read this mentee\'s marks', unassignedRead.status === 403, `status=${unassignedRead.status}`);

    const hodRead = await http('GET', `/api/marks/student/${studentA._id}`, { token: hodToken });
    check('the department HOD can read the marks', hodRead.status === 200, `status=${hodRead.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nManual disable flips the switch to INACTIVE');
  // ---------------------------------------------------------------------------
  {
    const disable = await http('PUT', '/api/marks/permission', { token: adminToken, body: { enabled: false } });
    const state = disable.body?.data?.permission ?? disable.body?.permission;
    check('disable returns 200 with status INACTIVE', disable.status === 200 && state?.status === 'INACTIVE', `status=${disable.status} state=${JSON.stringify(state)}`);

    const refused = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 44 },
    });
    check('writes are refused the moment the switch is off', refused.status === 403 && bodyText(refused.body).includes('not enabled'), `status=${refused.status} body=${bodyText(refused.body)}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nExpiry is enforced server-side (stored expiresAt backdated)');
  // ---------------------------------------------------------------------------
  {
    await http('PUT', '/api/marks/permission', {
      token: adminToken,
      body: { enabled: true, markTypes: ['IA1', 'IA2', 'END_SEM'], durationDays: 1 },
    });

    const perm: any = await MarkEntryPermission.findOne({ key: MARK_ENTRY_PERMISSION_KEY });
    assert(perm, 'permission row missing after enable');
    perm.expiresAt = new Date(Date.now() - 60_000);
    await perm.save();

    const state = await http('GET', '/api/marks/permission', { token: adminToken });
    const p = state.body?.data?.permission ?? state.body?.permission;
    check('an elapsed window reports EXPIRED even though enabled=true', p?.status === 'EXPIRED' && p?.enabled === true, JSON.stringify(p));
    check('an EXPIRED window exposes zero editable mark types', Array.isArray(p?.editableMarkTypes) && p.editableMarkTypes.length === 0, JSON.stringify(p?.editableMarkTypes));

    const refused = await http('PUT', `/api/marks/student/${studentA._id}`, {
      token: mentorAToken,
      body: { semesterNumber: 5, subjectCode: 'CS8491', subjectName: 'Object Oriented Analysis and Design', ia1: 44 },
    });
    check('an expired window refuses the write with the exact correction-request message', refused.status === 403 && bodyText(refused.body).includes('Mark entry period has expired. You can raise a correction request with a reason.'), `status=${refused.status} body=${bodyText(refused.body)}`);

    const still = await http('GET', `/api/marks/student/${studentA._id}`, { token: mentorAToken });
    const rows: any[] = still.body?.data?.marks ?? [];
    check('the refused write left the stored mark untouched', rows.find((r) => r.subjectCode === 'CS8491')?.ia1 === 42, JSON.stringify(rows));
  }

  // ---------------------------------------------------------------------------
  console.log('\nCorrection request lifecycle (works while EXPIRED)');
  // ---------------------------------------------------------------------------
  let firstRequestId = '';
  let secondRequestId = '';
  {
    const noReason = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA1', requestedMark: 45 },
    });
    check('a request without a reason is rejected 400', noReason.status === 400 && bodyText(noReason.body).includes('reason'), `status=${noReason.status}`);

    const shortReason = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA1', requestedMark: 45, reason: 'ok' },
    });
    check('a reason shorter than 5 characters is rejected 400', shortReason.status === 400 && bodyText(shortReason.body).includes('at least 5 characters'), `status=${shortReason.status}`);

    const overMark = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA1', requestedMark: 55, reason: 'IA1 answer script was re-evaluated during the recheck window.' },
    });
    check('a requested mark above the type maximum is rejected 400', overMark.status === 400, `status=${overMark.status}`);

    const unknownSubject = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS9999', markType: 'IA1', requestedMark: 45, reason: 'No record exists for this subject yet.' },
    });
    check('a request against a subject with no stored row is rejected 404', unknownSubject.status === 404, `status=${unknownSubject.status}`);

    const sameMark = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA1', requestedMark: 42, reason: 'Attempting to request the value already stored.' },
    });
    check('requesting the value already stored is rejected 400', sameMark.status === 400, `status=${sameMark.status}`);

    const byStudent = await http('POST', '/api/marks/update-requests', {
      token: studentAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA1', requestedMark: 45, reason: 'Students must not raise correction requests.' },
    });
    check('a student cannot raise a correction request (route refuses 403)', byStudent.status === 403, `status=${byStudent.status}`);

    const byUnassigned = await http('POST', '/api/marks/update-requests', {
      token: mentorBToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA1', requestedMark: 45, reason: 'Not my mentee, this must be refused.' },
    });
    check('an unassigned mentor cannot raise a request for this student', byUnassigned.status === 403, `status=${byUnassigned.status}`);

    const created = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: {
        studentId: String(studentA._id),
        semesterNumber: 5,
        subjectCode: 'CS8491',
        markType: 'IA1',
        requestedMark: 45,
        reason: 'IA1 answer script was re-evaluated during the recheck window.',
        supportingNote: 'Recheck memo attached in the department file.',
      },
    });
    firstRequestId = created.body?.data?.request?.id ?? '';
    check('the mentor raises a correction request (201)', created.status === 201 && !!firstRequestId, `status=${created.status} body=${bodyText(created.body)}`);

    const unchanged = await http('GET', `/api/marks/student/${studentA._id}`, { token: mentorAToken });
    const rows: any[] = unchanged.body?.data?.marks ?? [];
    check('raising the request does NOT touch the official mark', rows.find((r) => r.subjectCode === 'CS8491')?.ia1 === 42, JSON.stringify(rows));

    const duplicate = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA1', requestedMark: 46, reason: 'A second request while the first is pending must conflict.' },
    });
    check('a second PENDING request for the same subject and mark type is 409', duplicate.status === 409, `status=${duplicate.status}`);

    const mentorAList = await http('GET', '/api/marks/update-requests', { token: mentorAToken });
    const mentorARequests: any[] = mentorAList.body?.data?.requests ?? [];
    check('the mentor sees their mentee\'s pending request', mentorAList.status === 200 && mentorARequests.length === 1 && mentorARequests[0].status === 'PENDING', JSON.stringify(mentorARequests));

    const mentorBList = await http('GET', '/api/marks/update-requests', { token: mentorBToken });
    const mentorBRequests: any[] = mentorBList.body?.data?.requests ?? [];
    check('an unassigned mentor sees no requests (scope applied in the query)', mentorBList.status === 200 && mentorBRequests.length === 0, JSON.stringify(mentorBRequests));

    const adminScopedList = await http('GET', `/api/marks/update-requests?studentId=${studentA._id}`, { token: adminToken });
    check('Admin can list by studentId', adminScopedList.status === 200 && (adminScopedList.body?.data?.requests ?? []).length >= 1, `status=${adminScopedList.status}`);

    const wrongStudentParam = await http('GET', `/api/marks/update-requests?studentId=${studentB._id}`, { token: mentorAToken });
    check('a mentor asking for a non-mentee\'s requests is refused 403', wrongStudentParam.status === 403, `status=${wrongStudentParam.status}`);

    const hodApprove = await http('PATCH', `/api/marks/update-requests/${firstRequestId}/approve`, { token: hodToken, body: {} });
    check('a HOD cannot approve correction requests (Admin only)', hodApprove.status === 403, `status=${hodApprove.status}`);

    const mentorApprove = await http('PATCH', `/api/marks/update-requests/${firstRequestId}/approve`, { token: mentorAToken, body: {} });
    check('the requesting mentor cannot approve their own request', mentorApprove.status === 403, `status=${mentorApprove.status}`);

    const approve = await http('PATCH', `/api/marks/update-requests/${firstRequestId}/approve`, { token: adminToken, body: {} });
    check('Admin approval succeeds', approve.status === 200 && (approve.body?.data?.request?.status ?? '') === 'APPROVED', `status=${approve.status} body=${bodyText(approve.body)}`);

    const afterApprove = await http('GET', `/api/marks/student/${studentA._id}`, { token: adminToken });
    const approvedRows: any[] = afterApprove.body?.data?.marks ?? [];
    check('approval writes the official mark (IA1 42 -> 45)', approvedRows.find((r) => r.subjectCode === 'CS8491')?.ia1 === 45, JSON.stringify(approvedRows));
    check('the approver is stamped on the official row', approvedRows.find((r) => r.subjectCode === 'CS8491')?.updatedByName === 'System admin', JSON.stringify(approvedRows.find((r) => r.subjectCode === 'CS8491')));

    const reApprove = await http('PATCH', `/api/marks/update-requests/${firstRequestId}/approve`, { token: adminToken, body: {} });
    check('an already-resolved request cannot be approved twice (409)', reApprove.status === 409, `status=${reApprove.status}`);

    // ---- rejection path ----------------------------------------------------
    const second = await http('POST', '/api/marks/update-requests', {
      token: mentorAToken,
      body: { studentId: String(studentA._id), semesterNumber: 5, subjectCode: 'CS8491', markType: 'IA2', requestedMark: 44, reason: 'IA2 attendance component was miscoded in the mark sheet.' },
    });
    secondRequestId = second.body?.data?.request?.id ?? '';
    check('a second request for another mark type succeeds (201)', second.status === 201 && !!secondRequestId, `status=${second.status}`);

    const rejectNoReason = await http('PATCH', `/api/marks/update-requests/${secondRequestId}/reject`, { token: adminToken, body: {} });
    check('rejection without a reason is refused 400', rejectNoReason.status === 400 && bodyText(rejectNoReason.body).includes('reason'), `status=${rejectNoReason.status}`);

    const reject = await http('PATCH', `/api/marks/update-requests/${secondRequestId}/reject`, {
      token: adminToken,
      body: { rejectionReason: 'The attendance component code is correct; no recheck memo on file.' },
    });
    check('Admin rejection with a reason succeeds', reject.status === 200 && (reject.body?.data?.request?.status ?? '') === 'REJECTED', `status=${reject.status}`);

    const afterReject = await http('GET', `/api/marks/student/${studentA._id}`, { token: adminToken });
    const rejectedRows: any[] = afterReject.body?.data?.marks ?? [];
    check('rejection leaves the official mark untouched (IA2 stays 38)', rejectedRows.find((r) => r.subjectCode === 'CS8491')?.ia2 === 38, JSON.stringify(rejectedRows));

    const statusFilter = await http('GET', '/api/marks/update-requests?status=REJECTED', { token: adminToken });
    const rejectedList: any[] = statusFilter.body?.data?.requests ?? [];
    check('Admin can filter the queue by REJECTED', statusFilter.status === 200 && rejectedList.length === 1 && rejectedList[0].id === secondRequestId && !!rejectedList[0].rejectionReason, JSON.stringify(rejectedList));
  }

  // ---------------------------------------------------------------------------
  console.log('\nAudit trail of the whole lifecycle');
  // ---------------------------------------------------------------------------
  {
    const rows: any[] = await AuditLog.find({
      action: {
        $in: [
          'ENABLE_MARK_ENTRY',
          'DISABLE_MARK_ENTRY',
          'UPDATE_INTERNAL_MARK',
          'CREATE_MARK_UPDATE_REQUEST',
          'APPROVE_MARK_UPDATE_REQUEST',
          'REJECT_MARK_UPDATE_REQUEST',
        ],
      },
    }).lean();
    const actions = new Set(rows.map((r) => String(r.action)));
    for (const action of ['ENABLE_MARK_ENTRY', 'DISABLE_MARK_ENTRY', 'UPDATE_INTERNAL_MARK', 'CREATE_MARK_UPDATE_REQUEST', 'APPROVE_MARK_UPDATE_REQUEST', 'REJECT_MARK_UPDATE_REQUEST']) {
      check(`audit trail records ${action}`, actions.has(action), `found=${[...actions].join(',')}`);
    }
    const approveRow = rows.find((r) => String(r.action) === 'APPROVE_MARK_UPDATE_REQUEST');
    check('the approval audit row captures the old and new mark', approveRow?.details?.oldMark === 42 && approveRow?.details?.newMark === 45, JSON.stringify(approveRow?.details));
  }

  // ---------------------------------------------------------------------------
  console.log('\nThree PDF download modes');
  // ---------------------------------------------------------------------------
  {
    // Seed one counselling record with one real (compressed) evidence photo and
    // one Saturday meeting, so the mentoring sections have content to print.
    const png = await sharp({
      create: { width: 96, height: 72, channels: 3, background: { r: 40, g: 90, b: 160 } },
    })
      .png()
      .toBuffer();
    const stored = await storeEvidenceUploads({
      files: [{ buffer: png, originalname: 'session.png', mimetype: 'image/png' }],
      context: 'INDIVIDUAL',
      studentIds: [String(studentA._id)],
      mentorName: 'Dr Priya Mentor',
    });
    check('the seeded evidence photo was compressed and stored', stored.length === 1 && stored[0].fileSize > 0, JSON.stringify(stored));

    await CounsellingRecord.create({
      student: studentA._id,
      studentId: studentA._id,
      mentor: mentorAFaculty._id,
      mentorId: mentorAFaculty._id,
      sessionDate: '2026-08-14',
      date: '2026-08-14',
      categories: ['Academic Development'],
      discussionWith: ['student', 'parent'],
      recordKind: 'INDIVIDUAL',
      challengeObserved: 'Difficulty balancing lab submissions with theory study.',
      correctiveAction: 'Weekly plan with mentor sign-off every Saturday.',
      mentorRemarks: 'Parent briefed on attendance.',
      evidence: [{ evidenceId: stored[0].evidenceId, addedAt: new Date().toISOString(), addedBy: '' }],
    });

    await Meeting.create({
      student: studentA._id,
      mentor: mentorAFaculty._id,
      meetingDate: '2026-09-05',
      meetingTime: '10:30',
      location: 'Mentoring Cell, Room 204',
      attendanceStatus: 'PRESENT',
      meetingStatus: 'COMPLETED',
      challengesDiscussed: 'Struggles with data structures problem sets.',
      studentFeedback: 'Asked for extra weekend practice sessions.',
      mentorRemarks: 'Agreed to weekly practice sheets.',
    });

    // ---- default (full) ----------------------------------------------------
    const full = await http('GET', `/api/pdf/student/${studentA._id}`, { token: mentorAToken });
    const fullText = full.status === 200 ? pdfBytesToText(full.body as Buffer) : '';
    check('the default mode still generates the full record book', full.status === 200 && full.bytes > 1000 && (full.body as Buffer)?.slice(0, 5).toString('latin1') === '%PDF-', `status=${full.status} bytes=${full.bytes}`);
    check('full mode keeps the personal section', fullText.includes('PERSONAL & FAMILY'), 'not found');
    check('full mode keeps the internal assessment section', fullText.includes('4. INTERNAL ASSESSMENT MARKS'), 'not found');
    check('full mode prints the entered subject codes', fullText.includes('CS8491') && fullText.includes('CS8401'), 'not found');
    check('full mode keeps the counselling section', fullText.includes('5-DOMAIN COUNSELLING'), 'not found');
    check('full mode numbers the photo section as Section 8', fullText.includes('8. MENTORING PHOTO EVIDENCE'), 'not found');
    check('full mode embeds the seeded evidence photo caption with its size', /\d+\.\d\s?KB/.test(fullText), 'no KB value found');
    check('full mode excludes the mentor-documents cover table', !fullText.includes('STUDENT & MENTOR INFORMATION'), 'unexpectedly present');
    check('the full-mode download is named KSRCE_Mentee_<reg>_Dossier.pdf', full.disposition.includes('KSRCE_Mentee_731523301001_Dossier.pdf'), full.disposition);

    // ---- internal ----------------------------------------------------------
    const internal = await http('GET', `/api/pdf/student/${studentA._id}?mode=internal`, { token: mentorAToken });
    const internalText = internal.status === 200 ? pdfBytesToText(internal.body as Buffer) : '';
    check('mode=internal generates a PDF', internal.status === 200 && internal.bytes > 1000 && (internal.body as Buffer)?.slice(0, 5).toString('latin1') === '%PDF-', `status=${internal.status} bytes=${internal.bytes}`);
    check('mode=internal prints the internal assessment section', internalText.includes('INTERNAL ASSESSMENT MARKS'), 'not found');
    check('mode=internal prints every subject row', internalText.includes('CS8491') && internalText.includes('CS8401') && internalText.includes('IA1'), 'not found');
    check('mode=internal omits the personal section', !internalText.includes('PERSONAL & FAMILY'), 'unexpectedly present');
    check('mode=internal omits the counselling section', !internalText.includes('5-DOMAIN COUNSELLING'), 'unexpectedly present');
    check('mode=internal omits the photo evidence section', !internalText.includes('MENTORING PHOTO EVIDENCE'), 'unexpectedly present');
    check('mode=internal omits the mentor lineage section', !internalText.includes('REASSIGNMENT LINEAGE'), 'unexpectedly present');
    check('mode=internal download is named KSRCE_Internal_Assessment_<reg>.pdf', internal.disposition.includes('KSRCE_Internal_Assessment_731523301001.pdf'), internal.disposition);

    // ---- mentor-documents --------------------------------------------------
    const mentorDocs = await http('GET', `/api/pdf/student/${studentA._id}?mode=mentor-documents`, { token: mentorAToken });
    const mentorDocsText = mentorDocs.status === 200 ? pdfBytesToText(mentorDocs.body as Buffer) : '';
    check('mode=mentor-documents generates a PDF', mentorDocs.status === 200 && mentorDocs.bytes > 1000 && (mentorDocs.body as Buffer)?.slice(0, 5).toString('latin1') === '%PDF-', `status=${mentorDocs.status} bytes=${mentorDocs.bytes}`);
    check('mode=mentor-documents opens with the student & mentor table', mentorDocsText.includes('1. STUDENT & MENTOR INFORMATION'), 'not found');
    check('mode=mentor-documents numbers counselling as Section 3', mentorDocsText.includes('3. 5-DOMAIN COUNSELLING'), 'not found');
    check('mode=mentor-documents numbers the photo section as Section 4', mentorDocsText.includes('4. MENTORING PHOTO EVIDENCE'), 'not found');
    check('mode=mentor-documents embeds the seeded evidence photo', /\d+\.\d\s?KB/.test(mentorDocsText), 'no KB value found');
    check('mode=mentor-documents omits every internal mark row', !mentorDocsText.includes('CS8491') && !mentorDocsText.includes('CS8401') && !mentorDocsText.includes('INTERNAL ASSESSMENT'), 'unexpectedly present');
    check('mode=mentor-documents omits the personal section', !mentorDocsText.includes('PERSONAL & FAMILY'), 'unexpectedly present');
    check('mode=mentor-documents download is named KSRCE_Mentor_Documents_<reg>.pdf', mentorDocs.disposition.includes('KSRCE_Mentor_Documents_731523301001.pdf'), mentorDocs.disposition);

    // ---- invalid mode + RBAC ----------------------------------------------
    const bogus = await http('GET', `/api/pdf/student/${studentA._id}?mode=everything`, { token: adminToken });
    check('an unknown mode is rejected 400 with the allowed list', bogus.status === 400 && bodyText(bogus.body).includes('Invalid PDF mode'), `status=${bogus.status} body=${bodyText(bogus.body)}`);

    const ownerFull = await http('GET', `/api/pdf/student/${studentA._id}`, { token: studentAToken });
    const ownerInternal = await http('GET', `/api/pdf/student/${studentA._id}?mode=internal`, { token: studentAToken });
    check('the owning student can download the full and internal reports', ownerFull.status === 200 && ownerInternal.status === 200, `full=${ownerFull.status} internal=${ownerInternal.status}`);

    const nonOwner = await http('GET', `/api/pdf/student/${studentA._id}?mode=internal`, { token: studentAToken.replace(/./, 'x') });
    check('a forged token cannot download a report', nonOwner.status === 401 || nonOwner.status === 403, `status=${nonOwner.status}`);

    const auditPdf: any[] = await AuditLog.find({ action: 'GENERATE_PDF' }).lean();
    check('every PDF generation is audited with its mode', auditPdf.length >= 3 && new Set(auditPdf.map((r) => String(r.details?.mode))).has('internal') && new Set(auditPdf.map((r) => String(r.details?.mode))).has('mentor-documents'), JSON.stringify(auditPdf.map((r) => r.details?.mode)));
  }

  await store.teardown();

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) {
    console.error('FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('ALL INTERNAL MARKS TESTS PASSED SUCCESSFULLY! (100% GREEN)\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
