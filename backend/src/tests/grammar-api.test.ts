/**
 * Grammar & Spelling Assistant - full-stack runtime verification.
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against a real mongod
 * process and drives the writing assistant over HTTP as a real mentor, then
 * reads back the actual MongoDB documents.
 *
 * Nothing is stubbed, and AI_API_KEY is deliberately absent so the assertions
 * hold on the degraded path a provider outage would take.
 *
 * Covers: grammar correction, spelling correction, Apply Correction semantics
 * (nothing written until the user asks), Keep Original semantics, AI failure,
 * official-value preservation, RBAC, and that PDF generation is unaffected.
 *
 * Run: npx tsx src/tests/grammar-api.test.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

// Reuse the mongod binary already on this machine (no network needed).
const BIN_DIR = path.join(process.env.USERPROFILE || '', '.cache', 'mongodb-binaries');
if (fs.existsSync(BIN_DIR)) {
  process.env.MONGOMS_DOWNLOAD_DIR = BIN_DIR;
  process.env.MONGOMS_SYSTEM_BINARY = path.join(BIN_DIR, 'mongod-x64-win32-8.2.6.exe');
}

// mongod refuses to create indexes when its data directory has < 500 MB free,
// so keep the data directory on a drive with real headroom.
const WORK = 'A:\\mini projects\\New folder\\.runtime-verify';
const DB_PATH = path.join(WORK, 'mongo-data');
fs.mkdirSync(DB_PATH, { recursive: true });
process.env.TMPDIR = WORK;
process.env.TMP = WORK;
process.env.TEMP = WORK;

const PORT = 5097;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'grammar-runtime-secret-do-not-use-in-prod';

// The AI provider is absent on purpose: the local engine must carry the request,
// which is exactly what happens when the provider is unreachable.
delete process.env.AI_API_KEY;

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
  opts: { token?: string; body?: any; raw?: any } = {}
): Promise<{ status: number; body: any; bytes: number; contentType: string }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let body: any;
  if (opts.raw) {
    body = opts.raw;
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
  return { status: res.status, body: parsed, bytes, contentType };
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

async function main() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create({ instance: { dbPath: DB_PATH } });
  process.env.MONGODB_URI = mongo.getUri();

  const { connectDB } = await import('../config/database.js');
  await connectDB();
  // The mongod data directory is reused between runs, so start from a clean db.
  const mongooseMod = await import('mongoose');
  await mongooseMod.default.connection.dropDatabase();

// Seed one mentor, one HOD and one student, exactly as production does.
  const { Faculty, Department, Batch, Student, User, MentorAssignment, StudentDocument, CounsellingRecord, StudentProgress } =
    await import('../models/index.js');

  const hash = bcrypt.hashSync('Mentor@123', 10);
  const dept: any = await Department.create({ name: 'Computer Science', code: 'CSE' });
  const batch = await Batch.create({
    name: '2022-2026',
    startYear: 2022,
    endYear: 2026,
  });

  const mentorUser: any = await User.create({
    username: 'mentor.grammar',
    passwordHash: hash,
    role: 'FACULTY',
    email: 'grammar.mentor@ksrce.test',
    fullName: 'Dr Grammar Mentor',
    department: dept._id,
    isActive: true,
  });
  const faculty: any = await Faculty.create({
    user: mentorUser._id,
    employeeId: 'FAC-GR1',
    designation: 'Assistant Professor',
    cabinLocation: 'FAC-101',
    department: dept._id,
    isActive: true,
  });

  const hodUser: any = await User.create({
    username: 'hod.grammar',
    passwordHash: hash,
    role: 'HOD',
    email: 'grammar.hod@ksrce.test',
    fullName: 'Dr Grammar Hod',
    department: dept._id,
    isActive: true,
  });
  await Faculty.create({
    user: hodUser._id,
    employeeId: 'HOD-GR1',
    designation: 'Head of Department',
    cabinLocation: 'HOD-1',
    department: dept._id,
    isActive: true,
  });

  const studentUser: any = await User.create({
    username: '731523209001',
    passwordHash: hash,
    role: 'STUDENT',
    email: 'kavitha.grammar@ksrce.test',
    fullName: 'Kavitha R',
    department: dept._id,
    isActive: true,
  });
  const student: any = await Student.create({
    user: studentUser._id,
    fullName: 'Kavitha R',
    registerNumber: '731523209001',
    email: 'kavitha.grammar@ksrce.test',
    mobileNumber: '9876500001',
    department: dept._id,
    section: 'A',
    year: 3,
    batch: batch._id,
    profileCompleted: true,
    isActive: true,
  });

  // The mentor must actually be assigned to the student for the mentor-scoped
  // progress endpoint to authorise the request.
  const adminUser: any = await User.findOne({ role: 'ADMIN' });
  await MentorAssignment.create({
    student: student._id,
    mentor: faculty._id,
    department: dept._id,
    status: 'ACTIVE',
    assignedBy: adminUser?._id || mentorUser._id,
  });

  console.log('\n=== Grammar & Spelling Assistant: full-stack runtime ===\n');
  console.log('  booting src/index.ts ...');
  // index.js starts listening on process.env.PORT itself, so do not listen again.
  await import('../index.js');
  await waitForHealth();

  const mentorToken = await loginAs('mentor', 'mentor.grammar', 'Mentor@123');
  const hodToken = await loginAs('hod', 'hod.grammar', 'Mentor@123');
  const studentToken = await loginAs('student', '731523209001', 'Mentor@123');
  check('mentor, HOD and student all authenticate through the real endpoint', true);

  // ---------------------------------------------------------------------------
  console.log('\nGrammar correction');
  // ---------------------------------------------------------------------------
  {
    const original = 'student need improve communication skill';
    const res = await http('POST', '/api/mentor/grammar-check', {
      token: mentorToken,
      body: { text: original },
    });
    const d = res.body?.data || res.body;
    check('the endpoint returns 200', res.status === 200, `status=${res.status} body=${JSON.stringify(res.body)}`);
    check('a suggestion is returned', typeof d?.corrected === 'string' && !!d.corrected, JSON.stringify(d));
    check('the suggestion differs from the original', d?.corrected !== original, d?.corrected);
    check('hasCorrections is true', d?.hasCorrections === true);
    check('the original is echoed back for side-by-side display', d?.original === original);
  }

  // ---------------------------------------------------------------------------
  console.log('\nSpelling correction');
  // ---------------------------------------------------------------------------
  {
    const res = await http('POST', '/api/mentor/grammar-check', {
      token: mentorToken,
      body: { text: 'he have poor comunication skill and attendence is low' },
    });
    const d = res.body?.data || res.body;
    check('"comunication" is corrected', !/comunication/i.test(d?.corrected || ''), d?.corrected);
    check('"attendence" is corrected', !/attendence/i.test(d?.corrected || ''), d?.corrected);
    check('"communication" appears', /communication/i.test(d?.corrected || ''), d?.corrected);
  }

  // ---------------------------------------------------------------------------
  console.log('\nOfficial values are returned unchanged');
  // ---------------------------------------------------------------------------
  {
    const input =
      'Kavitha R (731523104999) of 24ITT36 scored 8.75 CGPA with 91.4% attendance on 14-03-2026 in CSE.';
    const res = await http('POST', '/api/mentor/grammar-check', { token: mentorToken, body: { text: input } });
    const d = res.body?.data || res.body;
    const out = d?.corrected || '';
    check('the request succeeds', res.status === 200, `status=${res.status}`);
    check('the register number is untouched', out.includes('731523104999'), out);
    check('the subject code is untouched', out.includes('24ITT36'), out);
    check('the CGPA is untouched', out.includes('8.75'), out);
    check('the attendance figure is untouched', out.includes('91.4'), out);
    check('the date is untouched', out.includes('14-03-2026'), out);
    check('the department code is untouched', out.includes('CSE'), out);
    check('the original is returned verbatim', d?.original === input);
  }

  // ---------------------------------------------------------------------------
  console.log("\nApply Correction: nothing is written until the user applies it");
  // ---------------------------------------------------------------------------
  {
    const docBefore = await StudentDocument.countDocuments();
    const counsellingBefore = await CounsellingRecord.countDocuments();
    const progressBefore = await StudentProgress.countDocuments();

    const res = await http('POST', '/api/mentor/grammar-check', {
      token: mentorToken,
      body: { text: 'this text must never be persisted as a record of any kind' },
    });

    const docAfter = await StudentDocument.countDocuments();
    const counsellingAfter = await CounsellingRecord.countDocuments();
    const progressAfter = await StudentProgress.countDocuments();

    check('checking grammar creates no document record', docBefore === docAfter, `${docBefore} -> ${docAfter}`);
    check('checking grammar creates no counselling record', counsellingBefore === counsellingAfter, `${counsellingBefore} -> ${counsellingAfter}`);
    check('checking grammar creates no progress record', progressBefore === progressAfter, `${progressBefore} -> ${progressAfter}`);

    // Now apply it for real through the official counselling endpoint, and confirm
    // the stored value equals exactly what the suggestion said.
    const corrected = (res.body?.data || res.body)?.corrected || '';
    const saved = await http('POST', '/api/counselling', {
      token: mentorToken,
      body: {
        studentId: student._id,
        counsellingDate: '2026-09-26',
        categories: ['Academic Development'],
        concernReason: corrected,
        discussionObservation: corrected,
        actionPlan: corrected,
        status: 'Completed',
      },
    });
    check('a mentor can save a counselling record carrying the applied text', saved.status === 200 || saved.status === 201, `status=${saved.status} body=${JSON.stringify(saved.body)}`);

    const stored = await CounsellingRecord.findOne({ studentId: student._id }).sort({ createdAt: -1 });
    check('the saved record holds exactly the applied text', stored?.concernReason === corrected, `stored=${stored?.concernReason}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nKeep Original: the original text is still valid and unmodified');
  // ---------------------------------------------------------------------------
  {
    const keptOriginal = 'mentor told student to submit the project before friday';
    const res = await http('POST', '/api/mentor/grammar-check', {
      token: mentorToken,
      body: { text: keptOriginal },
    });
    const d = res.body?.data || res.body;
    check('the original is returned unchanged so it can be kept', d?.original === keptOriginal, d?.original);
    check('the suggestion is offered separately', d?.corrected !== keptOriginal, d?.corrected);

    // Saving the untouched original must store it character for character.
    const saved = await http('POST', '/api/counselling', {
      token: mentorToken,
      body: {
        studentId: student._id,
        counsellingDate: '2026-09-27',
        categories: ['Academic Development'],
        concernReason: keptOriginal,
        discussionObservation: keptOriginal,
        actionPlan: keptOriginal,
        status: 'Completed',
      },
    });
    check('the kept original saves successfully', saved.status === 200 || saved.status === 201, `status=${saved.status}`);
    const stored = await CounsellingRecord.findOne({ studentId: student._id }).sort({ createdAt: -1 });
    check('the stored record holds the original verbatim', stored?.concernReason === keptOriginal, `stored=${stored?.concernReason}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nAI failure: the user keeps their text and nothing internal leaks');
  // ---------------------------------------------------------------------------
  {
    // AI_API_KEY is absent for this whole run, so the provider branch is never
    // reachable: this is exactly the state after a provider outage or bad key.
    const original = 'student have difficulty in comunication';
    const res = await http('POST', '/api/mentor/grammar-check', { token: mentorToken, body: { text: original } });
    const d = res.body?.data || res.body;
    check('the request still succeeds with no AI provider configured', res.status === 200, `status=${res.status}`);
    check('the original text is returned intact', d?.original === original, d?.original);
    check('the local engine still produced a usable suggestion', !!d?.corrected, JSON.stringify(d));

    const serialised = JSON.stringify(res.body);
    check('no API key appears in the response', !/AI_API_KEY|AIza|sk-[A-Za-z0-9]/i.test(serialised), serialised);
    check('no provider host or model name appears', !/generativelanguage|openai|gemini|gpt-/i.test(serialised), serialised);
    check('no file path or stack trace appears', !/[A-Za-z]:\\|\bat\s+\w+:\d+:\d+/.test(serialised), serialised);
    check('source reports the local engine, not a provider', d?.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', d?.source);
  }

  // ---------------------------------------------------------------------------
  console.log('\nMalformed input');
  // ---------------------------------------------------------------------------
  {
    const missing = await http('POST', '/api/mentor/grammar-check', { token: mentorToken, body: {} });
    check('missing text is rejected with 400', missing.status === 400, `status=${missing.status}`);

    const blank = await http('POST', '/api/mentor/grammar-check', { token: mentorToken, body: { text: '   ' } });
    check('blank text returns 200 with no correction', blank.status === 200 && (blank.body?.data?.hasCorrections === false), JSON.stringify(blank.body));

    const huge = await http('POST', '/api/mentor/grammar-check', {
      token: mentorToken,
      body: { text: 'word '.repeat(2000) },
    });
    check('an over-long payload is rejected with 400', huge.status === 400, `status=${huge.status}`);
    check('the size error leaks no internals', !/AI_API_KEY|\bat\s+\w+:/.test(JSON.stringify(huge.body)));
  }

  // ---------------------------------------------------------------------------
  console.log('\nAccess control is unchanged');
  // ---------------------------------------------------------------------------
  {
    const anon = await http('POST', '/api/mentor/grammar-check', { body: { text: 'student need improve skill' } });
    check('an anonymous caller is refused', anon.status === 401, `status=${anon.status}`);

    const asStudent = await http('POST', '/api/mentor/grammar-check', {
      token: studentToken,
      body: { text: 'student need improve skill' },
    });
    check('a student is refused on the mentor route', asStudent.status === 403, `status=${asStudent.status}`);

    const asHod = await http('POST', '/api/mentor/grammar-check', {
      token: hodToken,
      body: { text: 'student need improve skill' },
    });
    check('an HOD may use it, as before', asHod.status === 200, `status=${asHod.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nOfficial workflows still work (no regression)');
  // ---------------------------------------------------------------------------
  {
    // Counselling list still readable and still shows the saved records.
    const list = await http('GET', `/api/counselling/${student._id}`, { token: mentorToken });
    check('the counselling list endpoint still works', list.status === 200, `status=${list.status}`);
    const rows = list.body?.data || [];
    check('both saved records are present', Array.isArray(rows) && rows.length === 2, `count=${rows?.length}`);

    // The mentor progress workflow is untouched by this feature.
    const progress = await http('GET', `/api/mentor/mentees/${student._id}/progress`, { token: mentorToken });
    check('the mentor progress endpoint still works', progress.status === 200, `status=${progress.status}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nPDF generation renders saved content and runs no AI');
  // ---------------------------------------------------------------------------
  {
    const studentBefore = await Student.findById(student._id).lean();
    const res = await http('GET', `/api/pdf/student/${student._id}`, { token: mentorToken });
    check('the student PDF still generates', res.status === 200, `status=${res.status}`);
    check('it is a real PDF', res.contentType.includes('application/pdf'), res.contentType);
    check('it has real content', res.bytes > 5000, `bytes=${res.bytes}`);
    check('it carries the %PDF header', Buffer.from(res.body).slice(0, 4).toString() === '%PDF');

    const studentAfter = await Student.findById(student._id).lean();
    check('PDF generation changed no official field on the student record', JSON.stringify(studentBefore) === JSON.stringify(studentAfter));

    const counsellingAfterPdf = await CounsellingRecord.countDocuments({ studentId: (student as any)._id });
    check('PDF generation wrote no new record', counsellingAfterPdf === 2, `count=${counsellingAfterPdf}`);
  }

  await mongoose_disconnect();
  await mongo.stop();

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) {
    console.error('FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

async function mongoose_disconnect() {
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});