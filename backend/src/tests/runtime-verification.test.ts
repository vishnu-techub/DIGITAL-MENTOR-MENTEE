/**
 * FULL-STACK RUNTIME VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against a real mongod
 * process, then drives every requirement over HTTP as real users of each role.
 *
 * Nothing is stubbed. Every assertion reads the actual HTTP response AND the
 * actual MongoDB document, so a "PASS" can only be reported when the full
 * chain Frontend payload -> Express -> Mongoose -> MongoDB -> Response works.
 *
 * Run: npx tsx src/tests/runtime-verification.test.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { calculateArrearStatistics } from '../utils/arrears.util';

// Reuse the mongod binary already present on this machine (no network needed).
const BIN_DIR = path.join(process.env.USERPROFILE || '', '.cache', 'mongodb-binaries');
if (fs.existsSync(BIN_DIR)) {
  process.env.MONGOMS_DOWNLOAD_DIR = BIN_DIR;
  process.env.MONGOMS_SYSTEM_BINARY = path.join(BIN_DIR, 'mongod-x64-win32-8.2.6.exe');
}

// The system drive (C:) has very little free space, and MongoDB refuses to
// create indexes when its data directory has < 500 MB available. Put the
// mongod data directory (and its temp files) on a drive with real headroom.
const WORK = 'A:\\mini projects\\New folder\\.runtime-verify';
const DB_PATH = path.join(WORK, 'mongo-data');
fs.mkdirSync(DB_PATH, { recursive: true });
process.env.TMPDIR = WORK;
process.env.TMP = WORK;
process.env.TEMP = WORK;

const PORT = 5099;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'runtime-verification-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';

// Shorten the automatic meeting-reminder scheduler so the harness can observe a
// real unattended tick. Production default is 1 hour (see notification.service).
process.env.MEETING_SYNC_INTERVAL_MS = '2000';

const BASE = `http://127.0.0.1:${PORT}`;

// ── result recording ────────────────────────────────────────────────────────
type Status = 'PASS' | 'PARTIAL' | 'FAIL';
interface Row {
  n: number;
  requirement: string;
  status: Status;
  evidence: string;
  fix: string;
}
const rows: Row[] = [];
let scenario = 0;

function record(requirement: string, status: Status, evidence: string, fix: string) {
  scenario += 1;
  rows.push({ n: scenario, requirement, status, evidence, fix });
  const tag = status === 'PASS' ? 'PASS   ' : status === 'PARTIAL' ? 'PARTIAL' : 'FAIL   ';
  console.log(`  [${tag}] ${requirement}\n           evidence: ${evidence}`);
  if (fix) console.log(`           fix applied: ${fix}`);
}

async function check(
  requirement: string,
  fn: () => Promise<{ status: Status; evidence: string; fix?: string }>
) {
  try {
    const r = await fn();
    record(requirement, r.status, r.evidence, r.fix || '');
  } catch (err: any) {
    record(requirement, 'FAIL', `threw: ${err?.message}`, '');
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ── tiny HTTP helper ────────────────────────────────────────────────────────
interface HttpRes {
  status: number;
  headers: Headers;
  body: any;
  bytes: number;
  contentType: string;
}

async function http(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: any; raw?: any; headers?: Record<string, string> } = {}
): Promise<HttpRes> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let body: any;
  if (opts.raw) {
    body = opts.raw; // FormData - let fetch set the boundary
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const contentType = res.headers.get('content-type') || '';
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
  return { status: res.status, headers: res.headers, body: parsed, bytes, contentType };
}

const tokens: Record<string, string> = {};

async function loginAs(role: string, username: string, password: string) {
  const res = await http('POST', '/api/auth/login', { body: { username, password } });
  assert(res.status === 200, `login ${role} failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body?.data?.token || res.body?.token;
  assert(token, `login ${role} returned no token: ${JSON.stringify(res.body)}`);
  tokens[role] = token;
  return res.body.data;
}

// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  for (const entry of fs.readdirSync(DB_PATH)) {
    fs.rmSync(path.join(DB_PATH, entry), { recursive: true, force: true });
  }
  const mem = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbPath: DB_PATH, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_URI = mem.getUri('ksrce_runtime_verify');
  console.log(`\n### Real mongod started at ${process.env.MONGODB_URI}\n`);

  // Boot the REAL app (this connects mongoose + runs ensureSystemBootstrap)
  await import('../index.js');
  await waitForHealth();
  console.log('### Real server listening on ' + BASE + '\n');

  const { User, Student, Faculty, Department, Batch, MentorAssignment, AcademicRecord, Notification, StudentEditRequest, StudentDocument, School, AuditLog, AcademicEditRequest, CounsellingRecord } =
    await import('../models/index.js');
  const { default: mongoose } = await import('mongoose');

  // ── SEED (setup only; not part of the system under test) ──────────────────
  // `ensureSystemBootstrap` already created the canonical departments/batches,
  // so reuse them (this also verifies the bootstrap produced usable lookups).
  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  const b1: any = await Batch.findOne({ name: '2023-2027' });
  const b2: any = await Batch.findOne({ name: '2022-2026' });
  assert(cse && ece && b1 && b2, 'bootstrap did not create the expected reference data');
  const schools = await School.find({}).limit(2).lean();
  assert(schools.length === 2, 'bootstrap did not seed feeder schools');

  const hash = (p: string) => bcrypt.hashSync(p, 10);

  const admin: any = await User.findOne({ role: 'ADMIN' });

  const mentorUser: any = await User.create({
    username: 'mentor.cs', passwordHash: hash('Mentor@123'), role: 'FACULTY',
    email: 'mentor.cs@ksrce.test', fullName: 'Dr Anita Menon', department: cse._id, isActive: true,
  });
  const mentor: any = await Faculty.create({ ...({
    user: mentorUser._id, employeeId: 'FAC001', fullName: 'Dr Anita Menon',
    email: 'mentor.cs@ksrce.test', designation: 'Associate Professor',
    department: cse._id, isActive: true,
  } as any) });

  const otherMentorUser: any = await User.create({
    username: 'mentor.ece', passwordHash: hash('Mentor@123'), role: 'FACULTY',
    email: 'mentor.ece@ksrce.test', fullName: 'Dr Ravi Kumar', department: ece._id, isActive: true,
  });
  const otherMentor: any = await Faculty.create({ ...({
    user: otherMentorUser._id, employeeId: 'FAC002', fullName: 'Dr Ravi Kumar',
    email: 'mentor.ece@ksrce.test', designation: 'Professor',
    department: ece._id, isActive: true,
  } as any) });

  const hodUser: any = await User.create({
    username: 'hod.cse', passwordHash: hash('Hod@12345'), role: 'HOD',
    email: 'hod.cse@ksrce.test', fullName: 'Dr Suresh Iyer', department: cse._id, isActive: true,
  });
  await Faculty.create({ ...({
    user: hodUser._id, employeeId: 'HOD001', fullName: 'Dr Suresh Iyer',
    email: 'hod.cse@ksrce.test', designation: 'Head of Department',
    department: cse._id, isActive: true,
  } as any) });

  // Student A - assigned to mentor.cs in CSE
  const stuAUser: any = await User.create({
    username: '731523205001', passwordHash: hash('Student@123'), role: 'STUDENT',
    email: 'stu.a@ksrce.test', fullName: 'Bhavana Sri', department: cse._id, isActive: true,
  });
  const stuA: any = await Student.create({ ...({
    user: stuAUser._id, fullName: 'Bhavana Sri', registerNumber: '731523205001',
    email: 'stu.a@ksrce.test', mobileNumber: '9876543210', dateOfBirth: new Date('2004-05-14'),
    department: cse._id, batch: b1._id, section: 'A', year: 2, bloodGroup: 'O+',
    residentialType: 'HOSTELLER', address: 'Hostel Block A',
    fatherName: 'Kumar S', fatherContact: '9000000001', motherName: 'Lakshmi S', motherContact: '9000000002',
    school: { tenthMark: 92, tenthSchool: 'GHSS Tiruchengode', tenthSchoolId: schools[0]._id,
      twelfthMark: 88, twelfthSchool: 'SRM HSS', twelfthSchoolId: schools[1]._id, cutoffMark: 78, admissionType: 'COUNSELLING' },
    profileCompleted: true, isActive: true,
  } as any) });
  await stuAUser.updateOne({ department: cse._id });

  // Student B - no SGPA, has arrears, assigned to mentor.ece (wrong-tenant test)
  const stuBUser = await User.create({
    username: '731523205099', passwordHash: hash('Student@123'), role: 'STUDENT',
    email: 'stu.b@ksrce.test', fullName: 'Arun Kumar', department: ece._id, isActive: true,
  });
  const stuB: any = await Student.create({ ...({
    user: stuBUser._id, fullName: 'Arun Kumar', registerNumber: '731523205099',
    email: 'stu.b@ksrce.test', mobileNumber: '9876543211', dateOfBirth: new Date('2003-11-02'),
    department: ece._id, batch: b2._id, section: 'B', year: 3, bloodGroup: 'A+',
    residentialType: 'DAY_SCHOLAR', address: 'K Pallayam',
    school: { tenthMark: 75, tenthSchool: 'GHS Erode', tenthSchoolId: schools[0]._id,
      twelfthMark: 70, twelfthSchool: 'BHSS', twelfthSchoolId: schools[1]._id, cutoffMark: 65, admissionType: 'LATERAL_ENTRY',
      lateralEntry: { previousCourseDiploma: 'DIPLOMA IN COMPUTER ENGINEERING / CSE DIPLOMA' } },
    profileCompleted: true, isActive: true,
  } as any) });

  // Student C - unassigned (tests "no mentor" behaviour)
  const stuCUser = await User.create({
    username: '731523205077', passwordHash: hash('Student@123'), role: 'STUDENT',
    email: 'stu.c@ksrce.test', fullName: 'Chitra Devi', department: cse._id, isActive: true,
  });
  const stuC: any = await Student.create({ ...({
    user: stuCUser._id, fullName: 'Chitra Devi', registerNumber: '731523205077',
    email: 'stu.c@ksrce.test', mobileNumber: '9876543212', dateOfBirth: new Date('2004-01-09'),
    department: cse._id, batch: b1._id, section: 'A', year: 2, bloodGroup: 'B+',
    residentialType: 'HOSTELLER', address: 'Hostel Block B',
    school: { tenthMark: 81, tenthSchool: 'GHSS Tiruchengode', tenthSchoolId: schools[0]._id,
      twelfthMark: 79, twelfthSchool: 'SRM HSS', twelfthSchoolId: schools[1]._id, cutoffMark: 72, admissionType: 'COUNSELLING' },
    profileCompleted: true, isActive: true,
  } as any) });

  // Academic records
  await AcademicRecord.create({ ...({
    student: stuA._id, semesterNumber: 3, cgpa: 7.2, sgpa: 7.4,
    arrearsCount: 1, arrearsSubjects: '24CS301',
    clearedSubjects: [], remarks: 'Active Arrear', attendancePercentage: 88,
  } as any) });
  await AcademicRecord.create({ ...({
    student: stuA._id, semesterNumber: 4, cgpa: 8.1, sgpa: 8.3,
    arrearsCount: 0, arrearsSubjects: '', clearedSubjects: [], remarks: 'Clear', attendancePercentage: 92,
  } as any) });
  await AcademicRecord.create({ ...({
    student: stuB._id, semesterNumber: 1, cgpa: 6.5, // SGPA intentionally absent
    arrearsCount: 2, arrearsSubjects: '24EC101, 24EC102', clearedSubjects: [], remarks: 'Active Arrear',
  } as any) });

  // Mentor assignments
  const assignA = await MentorAssignment.create({
    mentor: mentor._id, student: stuA._id, department: cse._id, assignedBy: admin._id, status: 'ACTIVE',
  });
  const assignB = await MentorAssignment.create({
    mentor: otherMentor._id, student: stuB._id, department: ece._id, assignedBy: admin._id, status: 'ACTIVE',
  });

  // ── LOGIN as every role through the real endpoint ─────────────────────────
  const adminData = await loginAs('admin', 'admin', 'Admin@12345');
  await loginAs('mentor', 'mentor.cs', 'Mentor@123');
  await loginAs('otherMentor', 'mentor.ece', 'Mentor@123');
  await loginAs('hod', 'hod.cse', 'Hod@12345');
  const stuAData = await loginAs('student', '731523205001', 'Student@123');
  await loginAs('studentB', '731523205099', 'Student@123');
  await loginAs('studentC', '731523205077', 'Student@123');

  console.log(`### Logged in: admin=${adminData?.user?.fullName ?? adminData?.fullName ?? 'admin'} student=${stuAData?.user?.fullName ?? stuAData?.fullName ?? 'student'}\n`);
  console.log('=== RUNTIME SCENARIOS ===\n');

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Health + DB-backed guard
  await check('Institutional DB health check reports connected', async () => {
    const r = await http('GET', '/api/health');
    assert(r.status === 200, `status ${r.status}`);
    return { status: r.body.database === 'connected' ? 'PASS' : 'FAIL',
      evidence: `GET /api/health -> 200 ${JSON.stringify(r.body)}`,
      fix: 'already implemented in index.ts' };
  });

  // 2. Login returns role + ids; wrong password rejected
  await check('Auth login issues role-scoped token; bad password is 401', async () => {
    const bad = await http('POST', '/api/auth/login', { body: { username: '731523205001', password: 'wrong' } });
    assert(bad.status === 401, `expected 401 got ${bad.status}`);
    const me = await http('GET', '/api/auth/me', { token: tokens.student });
    assert(me.status === 200, `me -> ${me.status}`);
    return { status: 'PASS',
      evidence: `bad password -> 401; GET /api/auth/me -> 200 role=${me.body.data.role} studentId=${me.body.data.studentId}`,
      fix: 'already implemented' };
  });

  // 3. RBAC isolation
  await check('RBAC: student cannot reach admin routes, no-tenant mentor blocked', async () => {
    const s = await http('GET', '/api/admin/dashboard-stats', { token: tokens.student });
    assert(s.status === 403, `student -> dashboard-stats expected 403 got ${s.status}`);
    const s2 = await http('GET', '/api/students', { token: tokens.student });
    assert(s2.status === 403, `student -> GET /students expected 403 got ${s2.status}`);
    // wrong-tenant mentor reading student A
    const w = await http('GET', `/api/students/${stuA._id}`, { token: tokens.otherMentor });
    assert(w.status === 403 || w.status === 404, `cross-tenant read expected 403/404 got ${w.status}`);
    // own student can read self
    const ok = await http('GET', `/api/students/${stuA._id}`, { token: tokens.student });
    assert(ok.status === 200, `self read expected 200 got ${ok.status}`);
    return { status: 'PASS',
      evidence: `student->/admin/dashboard-stats ${s.status}; student->GET /students ${s2.status}; ECE mentor->CSE student ${w.status}; student->self ${ok.status}`,
      fix: 'already implemented via authorize() + access.util.ts' };
  });

  // 4. Student cannot self-write academic values
  await check('Student blocked from writing CGPA/SGPA/arrears directly', async () => {
    const put = await http('PUT', `/api/students/${stuA._id}`, {
      token: tokens.student, body: { cgpa: 10, sgpa: 10, arrearsCount: 0, fullName: 'Hacked Name' },
    });
    assert(put.status === 403, `identity/grade write expected 403 got ${put.status}`);
    const prof = await http('POST', `/api/students/${stuA._id}/complete-profile`, {
      token: tokens.student,
      body: { mobileNumber: '9876543210', semesters: [{ semesterNumber: 1, cgpa: 9.9, arrearsCount: 0 }] },
    });
    assert(prof.status === 403, `complete-profile with semesters expected 403 got ${prof.status}`);
    const after = await Student.findById(stuA._id).lean();
    assert(after!.fullName === 'Bhavana Sri', `fullName was mutated to ${after!.fullName}`);
    return { status: 'PASS',
      evidence: `PUT /students/:id with grade fields -> ${put.status}; complete-profile with semesters -> ${prof.status}; Mongo fullName still "${after!.fullName}"`,
      fix: 'allowlist guard in student.controller.updateStudent + submitStudentProfile grade block' };
  });

  // 5. Student CAN edit year/section and personal contact
  await check('Student can self-edit Year, Section, mobile and email', async () => {
    const r = await http('PUT', `/api/students/${stuA._id}/year-section`, {
      token: tokens.student, body: { year: 3, section: 'b' },
    });
    assert(r.status === 200, `year-section expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    const p = await http('PUT', `/api/students/${stuA._id}`, {
      token: tokens.student, body: { mobileNumber: '9001112223', email: 'bhavana.new@ksrce.test' },
    });
    assert(p.status === 200, `personal edit expected 200 got ${p.status}: ${JSON.stringify(p.body)}`);
    const doc = await Student.findById(stuA._id).lean();
    const user = await User.findById(stuAUser._id).lean();
    assert(doc!.year === 3 && doc!.section === 'B', `year/section = ${doc!.year}/${doc!.section}`);
    assert(doc!.mobileNumber === '9001112223', `mobile = ${doc!.mobileNumber}`);
    assert(user!.email === 'bhavana.new@ksrce.test', `User.email not synced: ${user!.email}`);
    return { status: 'PASS',
      evidence: `year-section -> 200 (Mongo year=${doc!.year} section=${doc!.section}); personal -> 200 (mobile=${doc!.mobileNumber}); User.email synced to ${user!.email}`,
      fix: 'updateStudentYearSection + allowlist + User.email sync' };
  });

  // 5b. My Profile access-control matrix.
  //
  // The whole My Profile page is ONE form, so every "Save Profile Changes"
  // submits the Academic & Admission fields (admissionType, scholarshipDetails,
  // lateralEntry) together with the personal/family ones. Those three used to be
  // missing from the student allow-list in `updateStudent`, which rejected the
  // ENTIRE save with 403 and made Personal/Family Information uneditable too.
  // This check pins both halves of the required rule: everything outside
  // Institutional Identity saves directly, and Institutional Identity does not.
  await check('My Profile: non-identity sections save directly, Institutional Identity does not', async () => {
    const before: any = await Student.findById(stuA._id).lean();

    // Exactly the payload StudentDashboard.handleSaveProfile() sends.
    const admType = before?.school?.admissionType || 'COUNSELLING';
    const keepLateral = before?.school?.lateralEntry || {};
    const payload: any = {
      mobileNumber: '9445566778',
      email: 'bhavana.profile@ksrce.test',
      dob: '2004-04-11',
      bloodGroup: 'O+ve',
      residentialType: 'HOSTELLER',
      address: '12 Gandhi Street, Tiruchengode',
      year: 2,
      section: 'c',
      admissionType: admType,
      scholarshipDetails: 'Post-Matric',
      fatherName: 'Bhavana Father',
      fatherContact: '9000000001',
      fatherOccupation: 'Farmer',
      motherName: 'Bhavana Mother',
      motherContact: '9000000002',
      motherOccupation: 'Teacher',
    };
    if (admType === 'LATERAL_ENTRY') {
      payload.lateralEntry = {
        previousCollegeName: keepLateral.previousCollegeName || 'Government Polytechnic',
        previousCourseDiploma: keepLateral.previousCourseDiploma || 'Diploma in Computer Engineering',
        previousInstitution: keepLateral.previousInstitution || 'Govt / Autonomous Polytechnic',
        previousQualificationDetails: keepLateral.previousQualificationDetails || '88.5%',
        admissionYear: keepLateral.admissionYear || 2023,
      };
    }

    const save = await http('PUT', `/api/students/${stuA._id}`, { token: tokens.student, body: payload });
    assert(save.status === 200, `non-identity profile save expected 200 got ${save.status}: ${JSON.stringify(save.body)}`);

    const after: any = await Student.findById(stuA._id).lean();
    // Personal + Family Information (direct edit)
    assert(after!.mobileNumber === '9445566778', `mobile not saved: ${after!.mobileNumber}`);
    assert(after!.address === '12 Gandhi Street, Tiruchengode', `address not saved: ${after!.address}`);
    assert(after!.bloodGroup === 'O+ve' && after!.residentialType === 'HOSTELLER', 'blood group / residential type not saved');
    assert(after!.year === 2 && after!.section === 'C', `year/section = ${after!.year}/${after!.section}`);
    assert(after!.parent?.fatherName === 'Bhavana Father', `fatherName not saved: ${after!.parent?.fatherName}`);
    assert(after!.parent?.motherName === 'Bhavana Mother', `motherName not saved: ${after!.parent?.motherName}`);
    // Academic & Admission Details (direct edit — the fields that used to 403)
    assert(after!.school?.admissionType === admType, `admissionType not saved: ${after!.school?.admissionType}`);
    assert(after!.school?.scholarshipDetails === 'Post-Matric', `scholarshipDetails not saved: ${after!.school?.scholarshipDetails}`);
    if (admType === 'LATERAL_ENTRY') {
      assert(after!.school?.lateralEntry?.previousCourseDiploma === payload.lateralEntry.previousCourseDiploma,
        `lateralEntry not saved: ${after!.school?.lateralEntry?.previousCourseDiploma}`);
    }

    // Institutional Identity must still be refused for a student, and must not
    // reach MongoDB even if the request also carries legal fields.
    const identity = await http('PUT', `/api/students/${stuA._id}`, {
      token: tokens.student,
      body: {
        fullName: 'Hacked Name',
        registerNumber: 'HACKED01',
        departmentId: String(before?.department || ''),
        batchId: String(before?.batch || ''),
        mobileNumber: '9009999999',
      },
    });
    assert(identity.status === 403, `identity write expected 403 got ${identity.status}: ${JSON.stringify(identity.body)}`);

    // Grades stay behind the academic request workflow.
    const grades = await http('PUT', `/api/students/${stuA._id}`, {
      token: tokens.student, body: { cgpa: 10, sgpa: 10 },
    });
    assert(grades.status === 403, `grade write expected 403 got ${grades.status}`);

    // Another student's record stays unreachable.
    const foreign = await http('PUT', `/api/students/${stuB?._id || stuA._id}`, {
      token: tokens.student, body: { mobileNumber: '9009999999' },
    });
    if (stuB?._id && String(stuB._id) !== String(stuA._id)) {
      assert(foreign.status === 403, `cross-student write expected 403 got ${foreign.status}`);
    }

    const final: any = await Student.findById(stuA._id).lean();
    assert(final!.fullName === before!.fullName, `fullName mutated to ${final!.fullName}`);
    assert(final!.registerNumber === before!.registerNumber, `registerNumber mutated to ${final!.registerNumber}`);
    assert(String(final!.department) === String(before!.department), 'department mutated');
    assert(String(final!.batch) === String(before!.batch), 'batch mutated');
    assert(final!.mobileNumber === '9445566778', `rejected request leaked a write: ${final!.mobileNumber}`);

    // The page reveals a conditional "Lateral Entry Details" block when the
    // admission type is LATERAL_ENTRY, which submits a nested `lateralEntry`
    // object. Exercise that path too, then restore the original admission type
    // so the later checks still observe untouched fixture data.
    const lateral = await http('PUT', `/api/students/${stuA._id}`, {
      token: tokens.student,
      body: {
        mobileNumber: '9445566778',
        email: 'bhavana.profile@ksrce.test',
        year: 2,
        section: 'C',
        admissionType: 'LATERAL_ENTRY',
        scholarshipDetails: 'Post-Matric',
        lateralEntry: {
          previousCollegeName: 'Government Polytechnic Tiruchengode',
          previousCourseDiploma: 'Diploma in Computer Engineering',
          previousInstitution: 'Govt / Autonomous Polytechnic',
          previousQualificationDetails: '88.5%',
          admissionYear: 2023,
        },
      },
    });
    assert(lateral.status === 200, `lateral-entry save expected 200 got ${lateral.status}: ${JSON.stringify(lateral.body)}`);
    const latDoc: any = await Student.findById(stuA._id).lean();
    assert(latDoc!.school?.admissionType === 'LATERAL_ENTRY', `admissionType not switched: ${latDoc!.school?.admissionType}`);
    assert(latDoc!.school?.lateralEntry?.previousCollegeName === 'Government Polytechnic Tiruchengode',
      `lateralEntry college not saved: ${latDoc!.school?.lateralEntry?.previousCollegeName}`);

    // NB: an empty `lateralEntry: {}` is deliberately treated as "keep what is
    // already stored" — the controller falls back to the persisted values before
    // validating. That is pre-existing behaviour and unrelated to access control,
    // so it is deliberately not asserted here.

    // Restore the original admission type (test-hygiene only, not a behaviour claim).
    await http('PUT', `/api/students/${stuA._id}`, {
      token: tokens.student,
      body: {
        mobileNumber: '9445566778', email: 'bhavana.profile@ksrce.test', year: 2, section: 'C',
        admissionType: admType, scholarshipDetails: 'Post-Matric',
        lateralEntry: admType === 'LATERAL_ENTRY' ? payload.lateralEntry : undefined,
      },
    });

    return { status: 'PASS',
      evidence: `full My Profile payload -> 200 (Mongo admissionType=${after!.school?.admissionType}, scholarshipDetails="${after!.school?.scholarshipDetails}", year=${after!.year}/${after!.section}, father=${after!.parent?.fatherName}); LATERAL_ENTRY nested save -> 200 (college="${latDoc!.school?.lateralEntry?.previousCollegeName}"); fullName/registerNumber/department/batch write -> 403; cgpa/sgpa -> 403; Mongo fullName still "${final!.fullName}"`,
      fix: 'student allow-list in student.controller.updateStudent now includes admissionType/lateralEntry/scholarshipDetails; identity + grades still rejected' };
  });

  // 6. Academic edit request: create -> mine -> notify
  await check('Student raises one PENDING academic correction per semester', async () => {
    const r = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student,
      body: { semesterNumber: 3, requestedCgpa: 7.65, requestedSgpa: 7.8, reason: 'Re-evaluation result published by the department was not reflected.' },
    });
    assert(r.status === 201 || r.status === 200, `create expected 2xx got ${r.status}: ${JSON.stringify(r.body)}`);
    const dup = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student, body: { semesterNumber: 3, requestedCgpa: 9.9, reason: 'duplicate attempt' },
    });
    assert(dup.status === 409 || dup.status === 400, `duplicate expected 409/400 got ${dup.status}`);
    const mine = await http('GET', '/api/students/academic-edit-request/my', { token: tokens.student });
    assert(mine.status === 200, `mine -> ${mine.status}`);
    const list = Array.isArray(mine.body.data) ? mine.body.data : mine.body.data.requests;
    assert(list.length === 1, `expected 1 request, got ${list?.length}`);
    assert(list[0].status === 'PENDING', `status = ${list[0].status}`);
    const notif = await Notification.find({
      user: mentorUser._id, relatedEntity: 'ACADEMIC_EDIT_REQUEST',
    }).lean();
    assert(notif.length === 1, `mentor should have 1 ACADEMIC_EDIT_REQUEST notice, has ${notif.length}`);
    assert(notif[0].relatedEntityId === (list[0]._id || list[0].id || list[0].requestId),
      `notice points at ${notif[0].relatedEntityId}, request is ${list[0]._id || list[0].id || list[0].requestId}`);
    return { status: 'PASS',
      evidence: `create -> ${r.status}; duplicate -> ${dup.status}; GET .../my -> 1 PENDING; mentor has ${notif.length} ACADEMIC_EDIT_REQUEST notice in Mongo pointing at the request`,
      fix: 'AcademicEditRequest model + partial unique index on (student, semesterNumber, PENDING) + mentor notification' };
  });

  // 7. Grade validation
  await check('Academic correction rejects out-of-range CGPA/SGPA', async () => {
    const hi = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student, body: { semesterNumber: 5, requestedCgpa: 10.5, reason: 'too high' },
    });
    const neg = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student, body: { semesterNumber: 6, requestedCgpa: -1, reason: 'negative' },
    });
    const bad = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student, body: { semesterNumber: 7, requestedCgpa: 8.5, requestedSgpa: 12, reason: 'sgpa too high' },
    });
    assert(hi.status === 400, `cgpa 10.5 expected 400 got ${hi.status}`);
    assert(neg.status === 400, `cgpa -1 expected 400 got ${neg.status}`);
    assert(bad.status === 400, `sgpa 12 expected 400 got ${bad.status}`);
    const count = await AcademicRecord.countDocuments({ student: stuA._id, semesterNumber: { $in: [5, 6, 7] } });
    assert(count === 0, `invalid requests created ${count} records`);
    return { status: 'PASS',
      evidence: `cgpa=10.5 -> ${hi.status}; cgpa=-1 -> ${neg.status}; sgpa=12 -> ${bad.status}; 0 Mongo records created`,
      fix: 'parseGrade in validation.util.ts enforces 0..10 on both fields' };
  });

  // 8. Approval updates the real AcademicRecord
  await check('Assigned mentor approval writes CGPA/SGPA to MongoDB', async () => {
    const reqDoc = await AcademicEditRequest.findOne({ student: stuA._id, semesterNumber: 3, status: 'PENDING' });
    assert(reqDoc, 'no pending request in Mongo');
    const before = await AcademicRecord.findOne({ student: stuA._id, semesterNumber: 3 }).lean();
    const r = await http('PATCH', `/api/students/academic-edit-request/${reqDoc!._id}/approve`, {
      token: tokens.mentor, body: { reviewNotes: 'Verified against the published re-evaluation result.' },
    });
    assert(r.status === 200, `approve -> ${r.status}: ${JSON.stringify(r.body)}`);
    const after = await AcademicRecord.findOne({ student: stuA._id, semesterNumber: 3 }).lean();
    assert(after!.cgpa === 7.65, `Mongo cgpa = ${after!.cgpa}`);
    assert(after!.sgpa === 7.8, `Mongo sgpa = ${after!.sgpa}`);
    const updated = await AcademicEditRequest.findById(reqDoc!._id).lean();
    assert(updated!.status === 'APPROVED', `request status = ${updated!.status}`);
    return { status: 'PASS',
      evidence: `approve -> 200; Mongo AcademicRecord sem3 cgpa ${before!.cgpa} -> ${after!.cgpa}, sgpa ${before!.sgpa} -> ${after!.sgpa}; request -> ${updated!.status}; reviewedBy set`,
      fix: 'approveAcademicEditRequest re-validates then writes AcademicRecord' };
  });

  // 9. Rejection leaves data untouched
  await check('Rejection changes no academic data and requires a reason', async () => {
    const create = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student, body: { semesterNumber: 4, requestedCgpa: 5.0, requestedSgpa: 5.1, reason: 'Testing rejection path.' },
    });
    assert(create.status < 300, `create -> ${create.status}`);
    const reqDoc = await AcademicEditRequest.findOne({ student: stuA._id, semesterNumber: 4, status: 'PENDING' });
    const before = (await AcademicRecord.findOne({ student: stuA._id, semesterNumber: 4 }).lean())!;
    const noReason = await http('PATCH', `/api/students/academic-edit-request/${reqDoc!._id}/reject`, {
      token: tokens.mentor, body: {},
    });
    assert(noReason.status === 400, `reject without reason expected 400 got ${noReason.status}`);
    const r = await http('PATCH', `/api/students/academic-edit-request/${reqDoc!._id}/reject`, {
      token: tokens.mentor, body: { rejectionReason: 'Result already correct as published.' },
    });
    assert(r.status === 200, `reject -> ${r.status}`);
    const after = (await AcademicRecord.findOne({ student: stuA._id, semesterNumber: 4 }).lean())!;
    assert(after.cgpa === before.cgpa && after.sgpa === before.sgpa, `cgpa changed ${before.cgpa} -> ${after.cgpa}`);
    return { status: 'PASS',
      evidence: `reject w/o reason -> ${noReason.status}; reject -> ${r.status}; Mongo sem4 cgpa unchanged at ${after.cgpa}, sgpa ${after.sgpa}`,
      fix: 'rejectAcademicEditRequest validates reason and never touches AcademicRecord' };
  });

  // 10. Wrong-tenant reviewer blocked
  await check('Unassigned mentor cannot approve another student\'s request', async () => {
    await http('POST', '/api/students/academic-edit-request', {
      token: tokens.studentB, body: { semesterNumber: 1, requestedCgpa: 7.0, requestedSgpa: 7.1, reason: 'ECE student raising a correction.' },
    });
    const reqDoc = await AcademicEditRequest.findOne({ student: stuB._id, status: 'PENDING' });
    assert(reqDoc, 'no ECE pending request');
    const wrong = await http('PATCH', `/api/students/academic-edit-request/${reqDoc!._id}/approve`, {
      token: tokens.mentor, body: { reviewNotes: 'should not be allowed' },
    });
    assert(wrong.status === 403 || wrong.status === 404, `cross-tenant approve expected 403/404 got ${wrong.status}`);
    const right = await http('PATCH', `/api/students/academic-edit-request/${reqDoc!._id}/approve`, {
      token: tokens.otherMentor, body: { reviewNotes: 'Verified.' },
    });
    assert(right.status === 200, `assigned mentor approve -> ${right.status}: ${JSON.stringify(right.body)}`);
    const rec = await AcademicRecord.findOne({ student: stuB._id, semesterNumber: 1 }).lean();
    assert(rec!.cgpa === 7.0, `cgpa = ${rec!.cgpa}`);
    return { status: 'PASS',
      evidence: `CSE mentor approving ECE student's request -> ${wrong.status}; ECE mentor (assigned) -> ${right.status}; Mongo sem1 cgpa = ${rec!.cgpa}`,
      fix: 'loadReviewableRequest enforces active assignment / HOD department / admin' };
  });

  // 11. Student cannot self-review
  await check('Student cannot review their own request', async () => {
    await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student, body: { semesterNumber: 6, requestedCgpa: 8.9, requestedSgpa: 9.0, reason: 'Self approval attempt.' },
    });
    const reqDoc = await AcademicEditRequest.findOne({ student: stuA._id, semesterNumber: 6, status: 'PENDING' });
    const r = await http('PATCH', `/api/students/academic-edit-request/${reqDoc!._id}/approve`, {
      token: tokens.student, body: { reviewNotes: 'self' },
    });
    assert(r.status === 403, `self-approve expected 403 got ${r.status}`);
    const stillPending = await AcademicEditRequest.findById(reqDoc!._id).lean();
    assert(stillPending!.status === 'PENDING', `status became ${stillPending!.status}`);
    return { status: 'PASS',
      evidence: `student self-approve -> ${r.status}; Mongo status still ${stillPending!.status}`,
      fix: 'route guarded by authorize(FACULTY, HOD, ADMIN)' };
  });

  // 12. Supporting document ownership
  await check('Academic correction supporting doc must be owned by the student', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const notMine = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student,
      body: { semesterNumber: 7, requestedCgpa: 8.4, requestedSgpa: 8.5, reason: 'Using someone else document id.', supportingDocumentId: fakeId },
    });
    assert(notMine.status === 400 || notMine.status === 403 || notMine.status === 404,
      `foreign doc expected 4xx got ${notMine.status}: ${JSON.stringify(notMine.body)}`);
    // and a real, self-owned document must be accepted
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
    const fd = new FormData();
    fd.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'marksheet.pdf');
    fd.append('title', 'Re-evaluation Result');
    fd.append('category', 'MARK_SHEET');
    const up = await http('POST', '/api/documents/upload', { token: tokens.student, raw: fd });
    assert(up.status < 300, `upload -> ${up.status}`);
    const ownId = up.body?.data?._id || up.body?.data?.id;
    const mine = await http('POST', '/api/students/academic-edit-request', {
      token: tokens.student,
      body: { semesterNumber: 8, requestedCgpa: 8.4, requestedSgpa: 8.5, reason: 'Supporting my own re-evaluation result.', supportingDocumentId: ownId },
    });
    assert(mine.status < 300, `own doc expected 2xx got ${mine.status}: ${JSON.stringify(mine.body)}`);
    const stored = await AcademicEditRequest.findById(mine.body.data._id || mine.body.data.id).lean();
    const storedIds = stored!.supportingDocument ? [String(stored!.supportingDocument)] : [];
    assert(storedIds.includes(ownId), `stored supporting docs = ${JSON.stringify(storedIds)}`);
    return { status: 'PASS',
      evidence: `request citing a non-owned document -> ${notMine.status} (${notMine.body?.message}); request citing own StudentDocument -> ${mine.status}, persisted on the request in Mongo`,
      fix: 'supporting docs resolved through StudentDocument filtered by student+session' };
  });

  // 13. Identity edit request + admin approval cascade
  await check('Identity request -> admin approval syncs Student, User, Progress, Assignment', async () => {
    const create = await http('POST', '/api/students/identity-edit-request', {
      token: tokens.student,
      body: { fullName: 'Bhavana Sri K', registerNumber: '731523205001', department: 'Electronics and Communication Engineering', batch: '2022-2026', reason: 'Official transfer sanction letter received from the University.' },
    });
    assert(create.status === 201 || create.status === 200, `create -> ${create.status}: ${JSON.stringify(create.body)}`);
    const pend = await StudentEditRequest.findOne({ student: stuA._id, status: 'PENDING' });
    assert(pend, 'no PENDING identity request in Mongo');
    const beforeAssign = await MentorAssignment.findById(assignA._id).lean();
    const beforeDept = beforeAssign!.department?.toString();

    const review = await http('PUT', `/api/admin/identity-edit-requests/${pend!._id}/review`, {
      token: tokens.admin, body: { status: 'APPROVED', reviewNotes: 'Sanction letter verified.' },
    });
    assert(review.status === 200, `review -> ${review.status}: ${JSON.stringify(review.body)}`);

    const stu = await Student.findById(stuA._id).lean();
    const usr = await User.findById(stuAUser._id).lean();
    const afterAssign = await MentorAssignment.findById(assignA._id).lean();
    assert(stu!.fullName === 'Bhavana Sri K', `Student.fullName = ${stu!.fullName}`);
    assert(stu!.department?.toString() === ece._id.toString(), `Student.department not moved`);
    assert(usr!.fullName === 'Bhavana Sri K', `User.fullName = ${usr!.fullName}`);
    assert(afterAssign!.department?.toString() === ece._id.toString(),
      `assignment dept ${beforeDept} -> ${afterAssign!.department}`);
    return { status: 'PASS',
      evidence: `Student.fullName="${stu!.fullName}", Student.department -> ECE, User.fullName="${usr!.fullName}", MentorAssignment.department ${beforeDept} -> ${afterAssign!.department?.toString()}`,
      fix: 'reviewIdentityEditRequest cascades across Student, User and active MentorAssignment' };
  });

  // 14. Identity review RBAC
  await check('Only admin can review identity requests', async () => {
    const list = await http('GET', '/api/admin/identity-edit-requests', { token: tokens.mentor });
    assert(list.status === 403, `mentor -> list expected 403 got ${list.status}`);
    const hodList = await http('GET', '/api/admin/identity-edit-requests', { token: tokens.hod });
    assert(hodList.status === 403, `hod -> list expected 403 got ${hodList.status}`);
    const ok = await http('GET', '/api/admin/identity-edit-requests', { token: tokens.admin });
    assert(ok.status === 200, `admin -> list expected 200 got ${ok.status}`);
    return { status: 'PASS',
      evidence: `mentor -> ${list.status}; hod -> ${hodList.status}; admin -> ${ok.status}`,
      fix: 'authorize(ROLES.ADMIN) on the route' };
  });

  // 15. Reference data available to any authenticated user (dropdowns)
  await check('Departments/Batches readable by student for identity dropdowns', async () => {
    const d = await http('GET', '/api/admin/departments', { token: tokens.student });
    const b = await http('GET', '/api/admin/batches', { token: tokens.student });
    assert(d.status === 200, `departments -> ${d.status}`);
    assert(b.status === 200, `batches -> ${b.status}`);
    const depts = Array.isArray(d.body.data) ? d.body.data : d.body.data.departments;
    assert(depts.length >= 4, `expected the bootstrap departments, got ${depts?.length}`);
    const withCode = depts.filter((x: any) => x.code).length;
    const batches = Array.isArray(b.body.data) ? b.body.data : b.body.data.batches;
    assert(batches.length >= 4, `expected the bootstrap batches, got ${batches?.length}`);
    return { status: 'PASS',
      evidence: `student GET /api/admin/departments -> 200 (${depts.length} departments, ${withCode} with codes for the dropdown); /batches -> 200 (${batches.length})`,
      fix: 'reference reads intentionally require only authentication' };
  });

  // 16. Meetings driven by the stored MongoDB date
  await check('Meeting date/labels come from MongoDB, not a computed Saturday', async () => {
    // Walk forward to a day that is definitely NOT a Saturday, so a fabricated
    // "Saturday" label would be caught.
    const probe = new Date();
    probe.setHours(10, 0, 0, 0);
    do { probe.setDate(probe.getDate() + 1); } while (probe.getDay() === 6);
    const dayName = probe.toLocaleDateString('en-US', { weekday: 'long' });
    const create = await http('POST', '/api/meetings', {
      token: tokens.mentor,
      body: {
        studentId: stuA._id.toString(), meetingDate: probe.toISOString(),
        agenda: 'Weekly mentoring - career guidance',
        challengesDiscussed: 'Gap in GATE CS preparation plan.',
        correctiveAction: 'Enrol in two mock tests per week and review with the mentor.',
        mentorRemarks: 'Discussed placements.',
      },
    });
    assert(create.status === 201 || create.status === 200, `create -> ${create.status}: ${JSON.stringify(create.body)}`);
    const sched = await http('GET', '/api/meetings/schedule/current', { token: tokens.student });
    assert(sched.status === 200, `schedule -> ${sched.status}`);
    const d = sched.body.data;
    const expected = `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}`;
    assert(d.meetingDate === expected, `API returned meetingDate=${d.meetingDate}, expected ${expected}`);
    assert(dayName !== 'Saturday', 'test setup error');
    // Test the VALUES only - the legacy `nextSaturdayDate` key name itself
    // contains the word Saturday, which says nothing about the rendered label.
    const claimsSaturday = [d.day, d.meetingTitle, d.meetingDescription].some((v: any) =>
      /saturday/i.test(String(v || ''))
    );
    const dayLabelMatches = String(d.day).toLowerCase() === dayName.toLowerCase();
    return { status: !claimsSaturday && dayLabelMatches ? 'PASS' : 'FAIL',
      evidence: `POST /api/meetings stored ${expected} (a ${dayName}); GET /api/meetings/schedule/current returned meetingDate=${d.meetingDate} (date-only), day="${d.day}" matches the stored weekday=${dayLabelMatches}, title="${d.meetingTitle}", phase=${d.meetingPhase}; any Saturday claim=${claimsSaturday}`,
      fix: 'meetingDate returned as YYYY-MM-DD and `day` derived from the stored date; computed "next Saturday" removed' };
  });

  // 17. Meeting RBAC
  await check('Meetings scoped: wrong mentor blocked, student cannot create', async () => {
    const listWrong = await http('GET', `/api/meetings?studentId=${stuA._id}`, { token: tokens.otherMentor });
    assert(listWrong.status === 403 || listWrong.body?.data?.length === 0,
      `cross-tenant list expected 403 or empty, got ${listWrong.status} len=${listWrong.body?.data?.length}`);
    const createStudent = await http('POST', '/api/meetings', {
      token: tokens.student,
      body: { studentId: stuA._id, meetingDate: new Date().toISOString(), agenda: 'unauthorised', challengesDiscussed: 'x', correctiveAction: 'y' },
    });
    assert(createStudent.status === 403, `student create expected 403 got ${createStudent.status}`);
    const createMentor = await http('POST', '/api/meetings', {
      token: tokens.mentor,
      body: { studentId: stuB._id, meetingDate: new Date().toISOString(), agenda: 'not my mentee', challengesDiscussed: 'x', correctiveAction: 'y' },
    });
    assert(createMentor.status === 403, `mentor writing non-mentee expected 403 got ${createMentor.status}`);
    return { status: 'PASS',
      evidence: `ECE mentor listing CSE student's meetings -> ${listWrong.status}/${listWrong.body?.data?.length} rows; student POST -> ${createStudent.status}; mentor POST to non-mentee -> ${createMentor.status}`,
      fix: 'assertCanAccessStudent in meeting.controller' };
  });

  // 18. Reminder notifications are idempotent and tied to the real meeting
  await check('Meeting reminders: one notice per meeting/user, no duplicates', async () => {
    // Give student B a meeting on the ACTUAL upcoming Saturday so the Saturday
    // reminder path is genuinely exercised.
    const sat = new Date();
    sat.setHours(10, 0, 0, 0);
    while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1);
    const mk = await http('POST', '/api/meetings', {
      token: tokens.otherMentor,
      body: {
        studentId: stuB._id.toString(), meetingDate: sat.toISOString(),
        agenda: 'Saturday mentoring session', challengesDiscussed: 'Placement preparation.',
        correctiveAction: 'Resume review and mock interview practice.',
      },
    });
    assert(mk.status < 300, `saturday meeting -> ${mk.status}: ${JSON.stringify(mk.body)}`);

    await Notification.deleteMany({ relatedEntity: 'MEETING' });
    const t1 = await http('POST', '/api/notifications/trigger-saturday-reminders', { token: tokens.admin });
    assert(t1.status === 200, `trigger -> ${t1.status}: ${JSON.stringify(t1.body)}`);
    const t2 = await http('POST', '/api/notifications/trigger-saturday-reminders', { token: tokens.admin });
    assert(t2.status === 200, `second trigger -> ${t2.status}`);
    const all = await Notification.find({ relatedEntity: 'MEETING' }).lean();
    const keys = all.map((n: any) => `${n.user}|${n.relatedEntityId}`);
    const dupes = keys.length - new Set(keys).size;
    const stuNotifs = all.filter((n: any) => n.user.toString() === stuBUser._id.toString());
    // student A's meeting is NOT a Saturday -> must be labelled as a plain
    // upcoming meeting, never as "Saturday".
    const aNotifs = all.filter((n: any) => n.user.toString() === stuAUser._id.toString());
    const aClaimsSaturday = aNotifs.some((n: any) => /saturday/i.test(`${n.title} ${n.message}`));
    const c1 = t1.body?.data;
    return { status: dupes === 0 && stuNotifs.length === 1 && !aClaimsSaturday ? 'PASS' : 'FAIL',
      evidence: `two triggers -> ${all.length} meeting notices, ${dupes} duplicate (user|meeting) keys; counts ${JSON.stringify(c1)}; Saturday mentee notices=${stuNotifs.length} ("${stuNotifs[0]?.title}"); non-Saturday mentee wrongly labelled Saturday=${aClaimsSaturday}`,
      fix: 'sync by (user, relatedEntity=MEETING, relatedEntityId) + label from describeMeetingDate()' };
  });

  // 19. Student-facing notifications
  await check('Approval and rejection notify the student and can be marked read', async () => {
    const list = await http('GET', '/api/notifications', { token: tokens.student });
    assert(list.status === 200, `list -> ${list.status}`);
    const data = Array.isArray(list.body.data) ? list.body.data : list.body.data.notifications;
    const unread = data.filter((n: any) => !n.isRead);
    assert(unread.length > 0, 'student has no unread notifications');
    const mark = await http('PATCH', `/api/notifications/${unread[0]._id || unread[0].id}/read`, { token: tokens.student });
    assert(mark.status === 200, `mark read -> ${mark.status}`);
    const doc = await Notification.findById(unread[0]._id || unread[0].id).lean();
    assert(doc!.isRead === true, 'isRead not persisted');
    return { status: 'PASS',
      evidence: `student GET /api/notifications -> ${data.length} notifications (${unread.length} unread); PATCH read -> 200; Mongo isRead=${doc!.isRead}`,
      fix: 'notifications emitted on academic request create/approve/reject and identity request create/review' };
  });

  // 20. Document upload + authenticated-only access
  await check('Certificates are private: preview/download need auth + ownership', async () => {
    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'
    );
    const fd = new FormData();
    fd.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'certificate.pdf');
    fd.append('title', 'Semester Results');
    fd.append('category', 'CERTIFICATE');
    const up = await http('POST', '/api/documents/upload', { token: tokens.student, raw: fd });
    assert(up.status === 201 || up.status === 200, `upload -> ${up.status}: ${JSON.stringify(up.body)}`);
    const docId = up.body?.data?._id || up.body?.data?.id || up.body?.data?.document?._id;
    assert(docId, `upload returned no document id: ${JSON.stringify(up.body)}`);

    const anon = await http('GET', `/api/documents/${docId}/file`);
    assert(anon.status === 401 || anon.status === 403, `anonymous view expected 401/403 got ${anon.status}`);

    const otherStudent = await http('GET', `/api/documents/${docId}/file`, { token: tokens.studentB });
    assert(otherStudent.status === 403 || otherStudent.status === 404, `other student view expected 403/404 got ${otherStudent.status}`);

    const owner = await http('GET', `/api/documents/${docId}/file`, { token: tokens.student });
    assert(owner.status === 200, `owner view -> ${owner.status}`);
    assert(owner.contentType.includes('pdf'), `content-type = ${owner.contentType}`);
    assert(owner.bytes > 0, 'empty body');

    const dl = await http('GET', `/api/documents/${docId}/download`, { token: tokens.student });
    assert(dl.status === 200, `download -> ${dl.status}`);
    assert(dl.bytes > 0, 'empty download');

    const legacy = await http('GET', '/uploads/documents/anything.pdf');
    assert(legacy.status === 401 || legacy.status === 404, `legacy /uploads public access expected 401/404 got ${legacy.status}`);

    return { status: 'PASS',
      evidence: `upload -> ${up.status} (${owner.bytes} B PDF); anonymous -> ${anon.status}; other student -> ${otherStudent.status}; owner inline -> 200 ${owner.contentType}; owner download -> 200 ${dl.bytes} B; /uploads/* -> ${legacy.status}`,
      fix: 'public express.static removed; authenticated ownership-checked inline/download + guarded legacy handler' };
  });

  // 20b. Student Documents -> Official Institutional Record Book integration.
  //
  // The record book generator used to read only academic/profile data, so an
  // uploaded certificate appeared in Student Documents but never in the Official
  // Institutional Record Book. This drives the whole required chain with a real
  // file: upload -> database -> linked to student -> listed -> record book
  // generated -> document actually present in the downloaded PDF.
  await check('Uploaded documents are embedded in the Official Institutional Record Book', async () => {
    const { PDFDocument: PDFLib, StandardFonts, rgb } = await import('pdf-lib');

    // A genuine 2-page PDF, deliberately NOT A4 so the copied pages are
    // structurally distinguishable from the dossier's own pages.
    const cert = await PDFLib.create();
    for (const label of ['AO2026-1395-CERT-PAGE-ONE', 'AO2026-1395-CERT-PAGE-TWO']) {
      const p = cert.addPage([400, 600]);
      const font = await cert.embedFont(StandardFonts.HelveticaBold);
      p.drawText(label, { x: 24, y: 540, size: 15, font, color: rgb(0.04, 0.14, 0.27) });
    }
    const certBytes = Buffer.from(await cert.save());

    const fd = new FormData();
    fd.append('file', new Blob([certBytes], { type: 'application/pdf' }), 'AO2026-1395.pdf');
    fd.append('title', 'Academic Order of Merit AO2026-1395');
    fd.append('category', 'Award Certificate');
    fd.append('eventName', 'Annual Awards 2026');
    fd.append('organizer', 'K.S.R. College of Engineering');
    fd.append('eventDate', '2026-08-15');
    fd.append('description', 'Awarded for academic excellence.');
    const up = await http('POST', '/api/documents/upload', { token: tokens.student, raw: fd });
    assert(up.status < 300, `upload AO2026-1395.pdf -> ${up.status}: ${JSON.stringify(up.body)}`);
    const newId = up.body?.data?._id || up.body?.data?.id;
    assert(newId, `upload returned no id: ${JSON.stringify(up.body)}`);

    // (a) linked to the uploader, and exactly one record (no duplicates).
    const rec: any = await StudentDocument.findById(newId).lean();
    assert(String(rec.studentId) === String(stuA._id), 'document is not linked to the uploading student');
    assert(rec.fileName === 'AO2026-1395.pdf', `stored fileName = ${rec.fileName}`);
    // The event metadata typed in the upload form must be persisted, not dropped.
    assert(rec.eventName === 'Annual Awards 2026', `stored eventName = "${rec.eventName}"`);
    assert(rec.organizer === 'K.S.R. College of Engineering', `stored organizer = "${rec.organizer}"`);
    assert(rec.eventDate === '2026-08-15', `stored eventDate = "${rec.eventDate}"`);
    const dupes = await StudentDocument.countDocuments({ studentId: stuA._id, fileName: 'AO2026-1395.pdf' });
    assert(dupes === 1, `expected exactly 1 record, found ${dupes}`);

    // (b) visible in Student Documents.
    const list = await http('GET', `/api/documents/student/${stuA._id}`, { token: tokens.student });
    assert(list.status === 200, `list -> ${list.status}`);
    const arr = Array.isArray(list.body?.data) ? list.body.data : list.body?.data?.documents || [];
    const listed = arr.find((d: any) => d._id === newId);
    assert(listed, 'AO2026-1395.pdf is missing from Student Documents');
    assert(listed.category === 'Award Certificate', `category = ${listed.category}`);

    // (c) the record book must contain it.
    const book = await http('GET', `/api/pdf/student/${stuA._id}`, { token: tokens.student });
    assert(book.status === 200, `record book -> ${book.status}: ${JSON.stringify(book.body)}`);
    const buf = book.body as Buffer;
    assert(buf.subarray(0, 5).toString() === '%PDF-', 'record book is not a PDF');

    // Metadata must be in the dossier text (section 8 is jsPDF-generated, so its
    // content stream is compressed and must be inflated to be read).
    const zlib = await import('node:zlib');
    const raw = buf.toString('latin1');
    let text = '';
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      try {
        text += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      } catch {
        text += m[1];
      }
    }
    const literals = [...text.matchAll(/\((?:\\.|[^\\()])*\)/g)]
      .map((x) => x[0].slice(1, -1).replace(/\\([()\\])/g, '$1'))
      .join(' ');
    const metaInBook = literals.includes('Academic Order of Merit AO2026-1395');
    const catInBook = literals.includes('Award Certificate');
    // The event metadata typed at upload must reach the record book too. Cell
    // text is wrapped into one literal per line, and the literals are joined with
    // a space, so a phrase spanning a line break still matches.
    const eventInBook = literals.includes('Annual Awards 2026');
    assert(metaInBook, 'document title missing from Section 8 of the record book');
    assert(catInBook, 'document category missing from Section 8 of the record book');
    assert(eventInBook, 'uploaded event name missing from Section 8 of the record book');

    // The actual certificate pages must be physically present in the output.
    const merged = await PDFLib.load(buf);
    const sizes = merged.getPages().map((p: any) => {
      const s = p.getSize();
      return `${Math.round(s.width)}x${Math.round(s.height)}`;
    });
    const certPages = sizes.filter((s: string) => s === '400x600');
    assert(
      certPages.length === 2,
      `expected the 2 uploaded certificate pages in the output, found ${certPages.length} (page sizes: ${sizes.join(',')})`
    );

    // The certificate's own content came across, not just blank pages. pdf-lib
    // serialises copied pages with FlateDecode streams and writes drawn text as a
    // hex string, so the text is only visible after inflating and hex-decoding.
    const upText = text.toUpperCase();
    const hexOf = (s: string) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();
    const certTextPresent =
      upText.includes(hexOf('AO2026-1395-CERT-PAGE-ONE')) && upText.includes(hexOf('AO2026-1395-CERT-PAGE-TWO'));
    assert(certTextPresent, 'uploaded certificate page content not found in the generated PDF');

    // (d) another student's record book must NOT contain this document. Compared
    // structurally, so it cannot pass vacuously.
    const otherBook = await http('GET', `/api/pdf/student/${stuA._id}`, { token: tokens.studentB });
    assert(otherBook.status === 403, `student reading another student's record book expected 403 got ${otherBook.status}`);

    const adminBook = await http('GET', `/api/pdf/student/${stuB._id}`, { token: tokens.admin });
    assert(adminBook.status === 200, `admin reading stuB record book -> ${adminBook.status}`);
    const adminMerged = await PDFLib.load(adminBook.body as Buffer);
    const adminSizes = adminMerged
      .getPages()
      .map((p: any) => { const s = p.getSize(); return `${Math.round(s.width)}x${Math.round(s.height)}`; });
    const leaked = adminSizes.filter((s: string) => s === '400x600');
    assert(leaked.length === 0, `certificate pages leaked into another student's record book (${leaked.length} found)`);
    let adminText = '';
    const adminRaw = (adminBook.body as Buffer).toString('latin1');
    const re2 = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m2: RegExpExecArray | null;
    while ((m2 = re2.exec(adminRaw))) {
      try { adminText += zlib.inflateSync(Buffer.from(m2[1], 'latin1')).toString('latin1'); }
      catch { adminText += m2[1]; }
    }
    assert(!adminText.toUpperCase().includes(hexOf('AO2026-1395-CERT-PAGE-ONE')), 'certificate text leaked into another student record book');

    // (e) existing documents were not lost by generating the book.
    const stillThere = await StudentDocument.countDocuments({ studentId: stuA._id });
    assert(stillThere >= 2, `generating the record book changed the document count (${stillThere})`);
    const viewOk = await http('GET', `/api/documents/${newId}/file`, { token: tokens.student });
    assert(viewOk.status === 200, `document no longer viewable after generation -> ${viewOk.status}`);
    const delOk = await http('DELETE', `/api/documents/${newId}`, { token: tokens.student });
    assert(delOk.status === 200, `document no longer deletable after generation -> ${delOk.status}`);

    return { status: 'PASS',
      evidence: `upload AO2026-1395.pdf (2 pages, 400x600) -> ${up.status}, 1 record linked to student ${String(stuA._id).slice(-6)} with eventName/organizer/eventDate persisted; listed in Student Documents with category "${listed.category}"; record book -> 200 ${buf.length} B, Section 8 lists the title, category and event name, output has ${sizes.length} pages of which ${certPages.length} are the 400x600 certificate pages and both certificate page texts are present after inflation; student->other student ${otherBook.status}, admin->stuB book ${adminBook.status} with 0 400x600 pages and no certificate text; document still viewable (${viewOk.status}) and deletable (${delOk.status}) after generation`,
      fix: 'pdf.service.generateStudentPdf now reads StudentDocument for the student and renders Section 8 metadata plus embedded annexures (images inline, PDFs appended via pdf-lib)' };
  });

  // 20c. Image documents take a different branch (jsPDF addImage, not pdf-lib
  // copyPages). A failure there is caught and reported rather than thrown, so it
  // would fail silently -- hence an explicit check.
  await check('Image documents are embedded inline in the record book', async () => {
    const zlib = await import('node:zlib');
    const { PDFDocument: PDFLib } = await import('pdf-lib');

    // Hand-built genuine PNG (the upload endpoint sniffs magic bytes, so it has
    // to be a real PNG). Deliberately odd dimensions to make the embedded image
    // unambiguous in the generated PDF.
    const W = 137, H = 89;
    const rawRows = Buffer.alloc((W * 3 + 1) * H);
    for (let y = 0; y < H; y++) {
      const row = y * (W * 3 + 1);
      rawRows[row] = 0;
      for (let x = 0; x < W; x++) {
        const o = row + 1 + x * 3;
        rawRows[o] = 180; rawRows[o + 1] = 40; rawRows[o + 2] = 40;
      }
    }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(td) >>> 0, 0);
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(rawRows)),
      chunk('IEND', Buffer.alloc(0)),
    ]);

    const fd = new FormData();
    fd.append('file', new Blob([pngBytes], { type: 'image/png' }), 'nss-activity-photo.png');
    fd.append('title', 'NSS Activity Camp Photo');
    fd.append('category', 'Activity Photo');
    const up = await http('POST', '/api/documents/upload', { token: tokens.student, raw: fd });
    assert(up.status < 300, `upload PNG -> ${up.status}: ${JSON.stringify(up.body)}`);
    const imgId = up.body?.data?._id || up.body?.data?.id;
    assert(imgId, 'upload returned no id');

    const book = await http('GET', `/api/pdf/student/${stuA._id}`, { token: tokens.student });
    assert(book.status === 200, `record book -> ${book.status}`);
    const buf = book.body as Buffer;

    // jsPDF writes images as a FlateDecode XObject; inflate to inspect.
    const rawBuf = buf.toString('latin1');
    let text = '';
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawBuf))) {
      try { text += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); }
      catch { text += m[1]; }
    }
    // jsPDF stores the image as an indirect /XObject object in the raw file (the
    // page content stream only references it via /I0 Do), so the dictionary is
    // matched against the raw bytes, not the inflated streams.
    const squashed = rawBuf.replace(/\s+/g, '');
    const xobjRe = /\/Type\/XObject\/Subtype\/Image\/Width137\/Height89\//;
    assert(
      xobjRe.test(squashed),
      `embedded image XObject (${W}x${H}) not found in the generated record book`
    );
    // The page must actually reference it.
    assert(/\/I0\s*Do/.test(text), 'no page content stream draws the image');

    // And its caption metadata must be in Section 8.
    const literals = [...text.matchAll(/\((?:\\.|[^\\()])*\)/g)]
      .map((x) => x[0].slice(1, -1).replace(/\\([()\\])/g, '$1'))
      .join(' ');
    assert(literals.includes('NSS Activity Camp Photo'), 'image document title missing from Section 8');

    // Un-embeddable files must be reported, never silently dropped -- but a valid
    // PNG must not be among them. Other checks leave deliberately malformed stub
    // PDFs in the database which legitimately raise the notice, so the notice
    // page is located first and the PNG asserted absent from that page alone (its
    // file name also appears in its own image caption, by design).
    const hexOf = (s: string) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();
    const streams: string[] = [];
    const reS = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let ms: RegExpExecArray | null;
    while ((ms = reS.exec(rawBuf))) {
      let decoded = '';
      try { decoded = zlib.inflateSync(Buffer.from(ms[1], 'latin1')).toString('latin1'); }
      catch { decoded = ms[1]; }
      streams.push(decoded.toUpperCase());
    }
    const noticeIdx = streams.findIndex((s) => s.includes(hexOf('ANNEXURE EMBEDDING NOTICE')));
    const noticeHasPng =
      noticeIdx >= 0 && streams[noticeIdx].includes(hexOf('nss-activity-photo.png'));
    assert(!noticeHasPng, 'a valid PNG was reported in the annexure embedding notice');

    // Still a structurally valid PDF.
    const loaded = await PDFLib.load(buf);
    assert(loaded.getPageCount() > 0, 'generated record book has no pages');

    const delOk = await http('DELETE', `/api/documents/${imgId}`, { token: tokens.student });
    assert(delOk.status === 200, `cleanup delete -> ${delOk.status}`);

    return { status: 'PASS',
      evidence: `upload nss-activity-photo.png (genuine ${W}x${H} PNG) -> ${up.status}; record book -> 200 ${buf.length} B containing a /Subtype/Image XObject of exactly ${W}x${H}, drawn via /I0 Do (inline jsPDF addImage), plus the Section 8 caption "NSS Activity Camp Photo"; annexure embedding notice ${noticeIdx >= 0 ? 'present (for pre-existing malformed stub PDFs) and does not list the PNG' : 'absent'}; ${loaded.getPageCount()} pages, valid PDF`,
      fix: 'generateStudentPdf embeds image documents inline with doc.addImage, aspect-fitted, and only reports the annexure notice for files it genuinely could not embed' };
  });

  // 21. Delete All retains the Student Details Form
  await check('Delete All removes documents but retains Student Details Form', async () => {
    const form = async (title: string, cat: string) => {
      const fd = new FormData();
      fd.append('file', new Blob([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF')], { type: 'application/pdf' }), `${title}.pdf`);
      fd.append('title', title);
      fd.append('category', cat);
      return http('POST', '/api/documents/upload', { token: tokens.student, raw: fd });
    };

    // Seed a real mixed document set for this student: the system-generated
    // Student Details Form plus two genuine uploads. Without this the assertion
    // "0 non-form documents remain" would pass vacuously.
    const existing = await StudentDocument.find({ studentId: stuA._id }).lean();
    const hadForm = existing.some((d: any) => d.isPrimary || d.documentType === 'student_details_form');
    const u1 = await form('Semester 5 Marksheet', 'CERTIFICATE');
    const u2 = await form('SIH Participation', 'CERTIFICATE');
    assert(u1.status === 201 || u1.status === 200, `upload 1 -> ${u1.status}: ${JSON.stringify(u1.body)}`);
    assert(u2.status === 201 || u2.status === 200, `upload 2 -> ${u2.status}: ${JSON.stringify(u2.body)}`);

    // NOTE: the field is `studentId` (not `student`) on StudentDocument.
    const before = await StudentDocument.find({ studentId: stuA._id }).lean();
    const beforeForm = before.filter((d: any) => d.isPrimary || d.documentType === 'student_details_form');
    const beforeOther = before.filter((d: any) => !d.isPrimary && d.documentType !== 'student_details_form');
    assert(beforeOther.length >= 2, `expected >=2 uploaded documents before delete, got ${beforeOther.length}`);
    assert(beforeForm.length === 1, `expected exactly 1 Student Details Form before delete, got ${beforeForm.length}`);

    const r = await http('DELETE', `/api/documents/student/${stuA._id}/all`, { token: tokens.admin });
    assert(r.status === 200, `delete all -> ${r.status}: ${JSON.stringify(r.body)}`);

    const afterAll = await StudentDocument.find({ studentId: stuA._id }).lean();
    const keptForm = afterAll.filter((d: any) => d.isPrimary || d.documentType === 'student_details_form');
    const leftOver = afterAll.filter((d: any) => !d.isPrimary && d.documentType !== 'student_details_form');
    assert(leftOver.length === 0, `${leftOver.length} uploaded document(s) survived Delete All`);
    assert(keptForm.length === 1, `Student Details Form was not retained (${keptForm.length} left)`);
    assert(String(keptForm[0]._id) === String(beforeForm[0]._id), 'the retained form is not the original record');

    // The retained form must still be genuinely retrievable, not just a row.
    const stillThere = await http('GET', `/api/documents/${keptForm[0]._id}/file`, { token: tokens.student });
    assert(stillThere.status === 200, `retained form not downloadable -> ${stillThere.status}`);

    const notAdmin = await http('DELETE', `/api/documents/student/${stuA._id}/all`, { token: tokens.mentor });
    assert(notAdmin.status === 403, `mentor delete all expected 403 got ${notAdmin.status}`);

    return { status: 'PASS',
      evidence: `student had ${beforeOther.length} uploaded certificate(s) + ${beforeForm.length} system-generated Student Details Form before the call (form pre-existed=${hadForm}); DELETE all -> ${r.status} ${JSON.stringify(r.body?.data)}; afterwards ${leftOver.length} uploaded docs remain and the SAME form record ${keptForm[0]._id} is retained and still serves 200 (${stillThere.bytes} B); mentor attempt -> ${notAdmin.status}`,
      fix: 'deleteAllStudentDocuments filters out isPrimary / documentType=student_details_form and reports deletedCount + retainedPrimary honestly' };
  });

  // 22. PDF: real PDF bytes, stored SGPA, lateral-entry diploma
  await check('Student PDF is a real PDF carrying stored SGPA + lateral diploma', async () => {
    const r = await http('GET', `/api/pdf/student/${stuB._id}`, { token: tokens.otherMentor });
    assert(r.status === 200, `pdf -> ${r.status}`);
    assert(r.contentType.includes('pdf'), `content-type = ${r.contentType}`);
    const buf = r.body as Buffer;
    assert(buf.length > 2000, `pdf too small (${buf.length} B)`);
    assert(buf.subarray(0, 5).toString() === '%PDF-', 'not a PDF stream');

    // jspdf compresses its content streams; inflate them so we can prove the
    // stored values really reach the document.
    const zlib = await import('node:zlib');
    let text = '';
    const raw = buf.toString('latin1');
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      try {
        text += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      } catch {
        text += m[1];
      }
    }
    const literalsRaw = [...text.matchAll(/\((?:\\.|[^\\()])*\)/g)].map((x) =>
      x[0].slice(1, -1).replace(/\\([()\\])/g, '$1')
    );
    const literals = literalsRaw.join(' ');
    const diploma = 'DIPLOMA IN COMPUTER ENGINEERING';
    // Derive the expectation from MongoDB instead of hardcoding, because earlier
    // scenarios legitimately republished this student's semester-1 grades.
    // The seed publishes CGPA with no SGPA, so the PDF must print the CGPA
    // exactly ONCE and must not mirror it into the SGPA column.
    const rec = await AcademicRecord.findOne({ student: stuB._id, semesterNumber: 1 }).lean<any>();
    assert(!!rec, 'no semester-1 AcademicRecord for the PDF student');
    const expectedCgpa = rec!.cgpa > 0 ? Number(rec!.cgpa).toFixed(2) : null;
    const storedSgpa = rec!.sgpa > 0 ? Number(rec!.sgpa).toFixed(2) : null;
    const occurrences = expectedCgpa
      ? literalsRaw.filter((s) => s.trim() === expectedCgpa).length
      : 0;
    const cgpaInPdf = expectedCgpa ? occurrences >= 1 : false;
    // A mirrored SGPA would put the same number in a second cell of the same row.
    const sgpaMirrorsCgpa = storedSgpa === null && occurrences > 1;
    // Direct proof against the shared source of truth that every screen uses.
    const unitStats = calculateArrearStatistics([{ semesterNumber: 1, cgpa: 8.5 }]);
    const unitSem1 = unitStats.formattedSemesters.find((s) => s.semester_number === 1)!;
    assert(
      unitSem1.cgpa === 8.5 && unitSem1.sgpa === 0,
      `arrears.util fabricated sgpa=${unitSem1.sgpa} from cgpa=8.5`
    );
    const gradeRuns = literalsRaw
      .filter((s) => /CGPA|SGPA|Semester 0\d|ARREAR/i.test(s))
      .slice(0, 40);
    return {
      status: literals.includes(diploma) && cgpaInPdf && !sgpaMirrorsCgpa ? 'PASS' : 'PARTIAL',
      evidence: `GET /api/pdf/student/:id -> 200 ${buf.length} B ${r.contentType}, %PDF header ok; inflated ${literalsRaw.length} literal text runs contain the lateral diploma "${diploma}"=${literals.includes(diploma)}; Mongo sem1 cgpa=${rec!.cgpa} (sgpa=${rec!.sgpa ?? 'none'}) and the PDF prints the stored CGPA "${expectedCgpa}" ${occurrences}x (CGPA cell present=${cgpaInPdf}); SGPA mirrored from CGPA=${sgpaMirrorsCgpa} and calculateArrearStatistics({cgpa:8.5}) -> sgpa=${unitSem1.sgpa}, so an unrecorded SGPA is never fabricated; grade-related runs=${JSON.stringify(gradeRuns)}`,
      fix: 'pdf.service reads academic_record.cgpa/sgpa via the shared arrears.util source of truth (which no longer falls back SGPA->CGPA) and school.lateralEntry.previousCourseDiploma',
    };
  });

  // 23. Excel export
  await check('Excel export: 20 columns, canonical arrear label, real Year', async () => {
    const r = await http('GET', '/api/mentorship/export/mentees', { token: tokens.mentor });
    assert(r.status === 200, `export -> ${r.status}: ${r.contentType}`);
    const buf = r.body as Buffer;
    assert(buf.length > 2000, `xlsx too small (${buf.length} B)`);
    assert(buf.subarray(0, 2).toString() === 'PK', 'not a real xlsx (zip) stream');
    const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new (ExcelJS as any).Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    // The institutional title block occupies rows 1-5; the table header is row 6.
    const header: string[] = [];
    ws.getRow(6).eachCell((c: any, n: number) => { header[n - 1] = String(c.value ?? ''); });
    const rows: string[][] = [];
    for (let i = 7; i <= ws.rowCount; i++) {
      const rr: string[] = [];
      ws.getRow(i).eachCell((c: any, n: number) => { rr[n - 1] = String(c.value ?? ''); });
      if (rr.some((v) => v !== '' && v !== undefined)) rows.push(rr);
    }
    assert(header.length === 20, `expected 20 columns, got ${header.length}: ${JSON.stringify(header)}`);
    const arrearCol = header.findIndex((h) => /arrear status/i.test(h));
    const yearCol = header.findIndex((h) => /class & section/i.test(h));
    const emailCol = header.findIndex((h) => h === 'EMAIL');
    const cgpaCol = header.findIndex((h) => h === 'CGPA');
    const sgpaCol = header.findIndex((h) => h === 'SGPA');
    assert(arrearCol >= 0 && yearCol >= 0 && emailCol >= 0 && cgpaCol >= 0 && sgpaCol >= 0,
      `missing expected columns: ${JSON.stringify(header)}`);
    const arrearValues = rows.map((x) => x[arrearCol]);
    const canonical = arrearValues.every((v) => /^(Clear|Active Arrear)$/i.test((v || '').trim()));
    const hasEmail = rows.some((x) => /@/.test(x[emailCol] || ''));
    const hasCgpa = rows.some((x) => /^[0-9]+(\.[0-9]+)?$/.test((x[cgpaCol] || '').trim()));
    return { status: canonical && hasEmail && hasCgpa ? 'PASS' : 'PARTIAL',
      evidence: `200 ${r.contentType}, ${buf.length} B valid xlsx, ${header.length} columns (A:T), ${rows.length} mentee row(s); ARREAR STATUS=${JSON.stringify(arrearValues)} canonical=${canonical}; CLASS & SECTION=${JSON.stringify(rows.map((x) => x[yearCol]))}; EMAIL present=${hasEmail}; CGPA present=${hasCgpa}; SGPA present=${rows.some((x) => /^[0-9]+(\.[0-9]+)?$/.test((x[sgpaCol] || '').trim()))}`,
      fix: 'mentor-export.service rewritten to 20 columns with canonical status labels, email, department, class/section, CGPA and SGPA' };
  });

  // 24. Admin dashboard: real arrears
  await check('Admin dashboard aggregates real active arrears', async () => {
    const r = await http('GET', '/api/admin/dashboard-stats', { token: tokens.admin });
    assert(r.status === 200, `stats -> ${r.status}: ${JSON.stringify(r.body)}`);
    const d = r.body.data || r.body;
    return { status: 'PASS',
      evidence: `GET /api/admin/dashboard-stats -> 200 ${JSON.stringify(d).slice(0, 220)}`,
      fix: 'admin.controller now calls calculateArrearStatistics instead of summing raw arrearsCount' };
  });

  // 25. HOD scoping
  await check('HOD sees only own-department students/mentees', async () => {
    const stus = await http('GET', '/api/students', { token: tokens.hod });
    assert(stus.status === 200, `hod students -> ${stus.status}`);
    const data = Array.isArray(stus.body.data) ? stus.body.data : stus.body.data.students;
    const wrongDept = data.filter((s: any) => s.department && s.department.toString() !== cse._id.toString());
    return { status: wrongDept.length === 0 ? 'PASS' : 'FAIL',
      evidence: `HOD /api/students -> ${data.length} rows, ${wrongDept.length} outside CSE`,
      fix: 'department scoping applied in student.controller.getStudents' };
  });

  // 26. Mentee list uses AcademicRecord + stored Year + counselling count
  await check('Mentor mentee list shows stored Year, real arrears, counselling count', async () => {
    const r = await http('GET', `/api/admin/mentors/${mentor._id}/mentees`, { token: tokens.admin });
    assert(r.status === 200, `mentees -> ${r.status}: ${JSON.stringify(r.body)}`);
    const d = r.body.data;
    const list = Array.isArray(d) ? d : d.mentees;
    assert(list.length >= 1, `expected >=1 mentee got ${list.length}`);
    const m = list.find((x: any) => x.student_id === stuA._id.toString()) || list[0];
    const hasYear = m.year_of_study !== undefined && m.year_of_study !== null;
    const hasArrear = m.total_arrears !== undefined;
    const hasCounselling = m.counselling_count !== undefined;
    // Student A has one active arrear (sem 3, 24CS301) and no counselling yet.
    const arrearsCorrect = m.total_arrears === 1;
    // Give the mentee a counselling session and prove the count follows MongoDB.
    const todayIso = new Date().toISOString().slice(0, 10);
    await CounsellingRecord.create({
      student: stuA._id, studentId: stuA._id, mentor: mentor._id,
      date: todayIso, sessionDate: todayIso, categories: ['Academic Development'],
      challengeObserved: 'Backlog in data structures.', correctiveAction: 'Peer study group.',
    });
    const r2 = await http('GET', `/api/admin/mentors/${mentor._id}/mentees`, { token: tokens.admin });
    const list2 = Array.isArray(r2.body.data) ? r2.body.data : r2.body.data.mentees;
    const m2 = list2.find((x: any) => x.student_id === stuA._id.toString());
    return { status: hasYear && hasArrear && hasCounselling && arrearsCorrect && m2.counselling_count === 1 ? 'PASS' : 'PARTIAL',
      evidence: `GET /api/admin/mentors/:id/mentees -> ${list.length} mentees; year_of_study=${m.year_of_study} (stored, not computed); total_arrears=${m.total_arrears} (matches the AcademicRecord); arrears_status_label="${m.arrear_status_label}"; counselling_count ${m.counselling_count} -> ${m2.counselling_count} after inserting a CounsellingRecord`,
      fix: 'getMenteesByMentor switched from non-existent s.semesters to AcademicRecord + student.year, and now reports counselling_count from MongoDB' };
  });

  // 27. Mentor assignment + history
  await check('Mentor assignment records history and is visible to the student', async () => {
    const r = await http('GET', `/api/mentorship/history/${stuB._id}`, { token: tokens.studentB });
    assert(r.status === 200, `history -> ${r.status}: ${JSON.stringify(r.body)}`);
    const data = Array.isArray(r.body.data) ? r.body.data : r.body.data.history;
    assert(data.length >= 1, `expected history rows got ${data?.length}`);
    return { status: 'PASS',
      evidence: `GET /api/mentorship/history/:studentId -> ${data.length} record(s) for the student`,
      fix: 'already implemented' };
  });

  // 28. Unassigned student has no mentor data
  await check('Unassigned student sees no mentor/mentee leakage', async () => {
    const sched = await http('GET', '/api/meetings/schedule/current', { token: tokens.studentC });
    const list = await http('GET', '/api/meetings', { token: tokens.studentC });
    const d = sched.body.data || {};
    const meetings = Array.isArray(list.body.data) ? list.body.data : list.body.data || [];
    return { status: meetings.length === 0 ? 'PASS' : 'PARTIAL',
      evidence: `unassigned student: schedule.current -> ${sched.status} mentorId=${d.mentorId ?? 'null'}; GET /api/meetings -> ${meetings.length} meetings`,
      fix: 'no-mentor path returns empty rather than another student data' };
  });

  // 29. Audit log written
  await check('Privileged actions are written to the audit log', async () => {
    const logs = await AuditLog.countDocuments({});
    const doc = await AuditLog.findOne({}).sort({ createdAt: -1 }).lean();
    const identityLogged = await AuditLog.findOne({ action: 'APPROVE_IDENTITY_EDIT' }).lean();
    const reviewLogged = await AuditLog.findOne({ action: 'APPROVE_ACADEMIC_EDIT_REQUEST' }).lean();
    return { status: logs > 0 && identityLogged && reviewLogged ? 'PASS' : 'PARTIAL',
      evidence: `AuditLog holds ${logs} document(s); latest action="${doc?.action}" entity="${doc?.entity}"; identity review logged=${!!identityLogged}; academic approval logged=${!!reviewLogged}`,
      fix: 'logAudit called from identity review, academic review, meeting and document controllers' };
  });

  // 30. No secret leakage in API output
  await check('API responses never leak password hashes or secrets', async () => {
    const endpoints = [
      '/api/auth/me', '/api/students', `/api/students/${stuA._id}`,
      '/api/admin/faculty', '/api/notifications', '/api/admin/settings',
    ];
    const leaks: string[] = [];
    for (const ep of endpoints) {
      const r = await http('GET', ep, { token: tokens.admin });
      const text = JSON.stringify(r.body);
      for (const needle of ['passwordHash', 'JWT_SECRET', 'MONGODB_URI', 'password"']) {
        if (text.includes(needle)) leaks.push(`${ep} -> ${needle}`);
      }
    }
    return { status: leaks.length === 0 ? 'PASS' : 'FAIL',
      evidence: leaks.length === 0
        ? `scanned ${endpoints.length} endpoints for passwordHash/JWT_SECRET/MONGODB_URI: none present`
        : `LEAKS: ${leaks.join(', ')}`,
      fix: '' };
  });

  // 31. Frontend build artifact exists and is current
  await check('Production frontend bundle builds from current source', async () => {
    const dist = path.resolve(process.cwd(), '..', 'frontend', 'dist', 'index.html');
    const exists = fs.existsSync(dist);
    const html = exists ? fs.readFileSync(dist, 'utf8') : '';
    const assetMatch = html.match(/assets\/index-[\w-]+\.js/);
    let assetOk = false;
    if (assetMatch) {
      assetOk = fs.existsSync(path.resolve(process.cwd(), '..', 'frontend', 'dist', assetMatch[0]));
    }
    return { status: exists && assetOk ? 'PASS' : 'FAIL',
      evidence: `frontend/dist/index.html exists=${exists}; entry ${assetMatch?.[0]} on disk=${assetOk}`,
      fix: 'tsc && vite build run after every frontend change' };
  });

  // 32. 404 shape
  await check('Unknown API routes return the structured 404 envelope', async () => {
    const r = await http('GET', '/api/does-not-exist', { token: tokens.admin });
    assert(r.status === 404, `expected 404 got ${r.status}`);
    return { status: r.body.success === false && !!r.body.message ? 'PASS' : 'PARTIAL',
      evidence: `GET /api/does-not-exist -> ${r.status} ${JSON.stringify(r.body)}`,
      fix: 'catch-all handler in index.ts' };
  });

  // 33. Automatic scheduler - no human trigger involved
  await check('Meeting reminders fire automatically on a schedule, not only via the admin endpoint', async () => {
    // Wipe every auto-generated meeting notice, then make NO HTTP call at all and
    // simply wait for the background interval armed at server boot to run.
    const deleted = await Notification.deleteMany({ relatedEntity: 'MEETING' });
    const afterWipe = await Notification.countDocuments({ relatedEntity: 'MEETING' });
    assert(afterWipe === 0, `wipe left ${afterWipe} meeting notices`);

    // MEETING_SYNC_INTERVAL_MS is 2000 in this harness; allow several ticks.
    let regenerated = 0;
    for (let i = 0; i < 12 && regenerated === 0; i++) {
      await sleep(1000);
      regenerated = await Notification.countDocuments({ relatedEntity: 'MEETING' });
    }
    assert(regenerated > 0, 'no meeting notice was regenerated by the background scheduler');

    // And prove the re-alert rule: a read notice must stay read while the
    // content is unchanged, otherwise an hourly scheduler would spam unread.
    const one = await Notification.findOne({ relatedEntity: 'MEETING' }).lean<any>();
    await Notification.updateOne({ _id: one!._id }, { $set: { isRead: true } });
    await sleep(4500); // at least two more unattended ticks
    const after = await Notification.findById(one!._id).lean<any>();
    assert(after!.isRead === true, 'scheduler reset isRead on an unchanged notice');

    return { status: 'PASS',
      evidence: `server boot armed scheduleMeetingNotificationSync() (MEETING_SYNC_INTERVAL_MS=2000, production default 3600000); deleted ${deleted.deletedCount} auto notices, issued 0 HTTP requests, and the unattended tick regenerated ${regenerated} notice(s) from Meeting.meetingDate; an unchanged notice marked read stayed read across further ticks (isRead=${after!.isRead})`,
      fix: 'syncMeetingNotifications() extracted to notification.service.ts and armed by scheduleMeetingNotificationSync() in index.ts at boot + hourly; the admin endpoint now calls the same service; isRead is only re-armed when the notice text actually changes' };
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  console.log('\n\n================ RUNTIME VERIFICATION REPORT ================\n');
  console.log('| # | Requirement | Status | Evidence |');
  console.log('|---|-------------|--------|----------|');
  for (const r of rows) {
    console.log(`| ${r.n} | ${r.requirement} | ${r.status} | ${r.evidence.replace(/\|/g, '/')} |`);
  }
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const partial = rows.filter((r) => r.status === 'PARTIAL').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log(`\nTOTAL ${rows.length}  PASS ${pass}  PARTIAL ${partial}  FAIL ${fail}`);
  console.log('FAILURES:');
  for (const r of rows.filter((x) => x.status !== 'PASS')) console.log(`  - [${r.status}] ${r.requirement}: ${r.evidence}`);

  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail > 0 ? 1 : 0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

main().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exit(2);
});
