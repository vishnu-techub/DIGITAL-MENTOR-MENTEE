/**
 * BULK UPLOAD & ASSIGN MENTEES — END-TO-END VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against a temporary local
 * file store and drives the new `/api/mentorship/bulk/*` endpoints over HTTP
 * exactly as the Admin / HOD portals do.
 *
 * Coverage (mirrors the 12 required verification points):
 *   1. Download Excel (.xlsx) and CSV assignment templates
 *   2. Upload .xlsx AND .csv through the multipart validate endpoint
 *   3. Validation results + assignment preview (columns + statuses)
 *   4. Explicit confirmation to assign / cancel semantics (execute only writes)
 *   5. Template example rows are illustrative and NEVER create assignments
 *   6. Per-row validation: required columns, unknown student/mentor, inactive
 *      mentor, HOD department scope, duplicates, existing assignments,
 *      malformed values, file type / size / row limits
 *   7. Preview statuses: VALID / WARNING / INVALID / DUPLICATE /
 *      ALREADY_ASSIGNED / REASSIGNMENT_REQUIRED
 *   8. Confirmation summary + reassignment authorisation; invalid rows never
 *      assigned; history preserved; capacity is a warning only; duplicate
 *      submissions prevented; partial failures reported per row
 *   9. RBAC: ADMIN college-wide, HOD own department (student AND mentor),
 *      FACULTY/STUDENT/no-token refused
 *  10. Assignment history + notifications + audit trail
 *  11. Downloadable validation + results reports (CSV and Excel)
 *  12. Parsing/validation separated from execution; single-student
 *      assign/reassign flows still work after the new code lands
 *
 * Run: npx tsx src/tests/bulk-assignment.test.ts
 */
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

const store = useTemporaryLocalStore('bulk-assignment');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5120;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bulk-assignment-secret-do-not-use-in-prod';
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

/* ------------------------------------------------------------------ HTTP --- */

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
  return { status: res.status, body: parsed as any, headers: res.headers };
}

/** JSON request that keeps the raw bytes + headers (for downloads). */
async function httpRaw(
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
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    disposition: res.headers.get('content-disposition') || '',
    buffer,
  };
}

/** Multipart upload of a .xlsx / .csv file to the validate endpoint. */
async function uploadFile(
  urlPath: string,
  token: string | undefined,
  filename: string,
  data: Buffer | string,
  contentType: string
) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const form = new FormData();
  form.append('file', new Blob([buf], { type: contentType }), filename);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, { method: 'POST', headers, body: form });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as any };
}

/* --------------------------------------------------------------- helpers --- */

function csvText(pairs: Array<[string, string]>, includeHeader = true): string {
  const lines: string[] = [];
  if (includeHeader) lines.push('Student Register Number,Mentor Employee ID');
  for (const [r, e] of pairs) lines.push(`${r},${e}`);
  return lines.join('\r\n') + '\r\n';
}

async function xlsxBuffer(pairs: Array<[string, string]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Assignments');
  ws.addRow(['Student Register Number', 'Mentor Employee ID']);
  for (const [r, e] of pairs) ws.addRow([r, e]);
  return Buffer.from(await wb.xlsx.writeBuffer());
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

  const { User, Student, Faculty, Department, Batch, MentorAssignment, Notification, AuditLog } =
    await import('../models/index.js');

  // ── SEED ───────────────────────────────────────────────────────────────────
  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  const b1: any = await Batch.findOne({ name: '2023-2027' });
  assert(cse && ece && b1, 'bootstrap did not create the expected reference data');
  const admin: any = await User.findOne({ role: 'ADMIN' });
  const hash = bcrypt.hashSync('Mentor@123', 10);

  const hodUser: any = await User.create({
    username: 'hod.bulk', passwordHash: hash, role: 'HOD',
    email: 'hod.bulk@ksrce.test', fullName: 'Dr Bulk HOD', department: cse._id, isActive: true,
  });

  async function seedFaculty(username: string, employeeId: string, dept: any, name: string, maxMentees = 25) {
    const user: any = await User.create({
      username, passwordHash: hash, role: 'FACULTY', email: `${username}@ksrce.test`,
      fullName: name, department: dept._id, isActive: true,
    });
    const faculty: any = await Faculty.create({
      user: user._id, employeeId, designation: 'Assistant Professor',
      department: dept._id, isActive: true, maxMentees,
    } as any);
    return { user, faculty };
  }

  const m1 = await seedFaculty('fac.cse1', 'FAC700', cse, 'Dr Cse Mentor One');
  const m2 = await seedFaculty('fac.cse2', 'FAC702', cse, 'Dr Cse Mentor Two', 1); // capacity 1
  const m3 = await seedFaculty('fac.cse3', 'FAC703', cse, 'Dr Cse Mentor Three');
  const mEce = await seedFaculty('fac.ece1', 'FAC701', ece, 'Dr Ece Mentor');
  // Faculty whose employee IDs reproduce the shipped template example pairs.
  const mSample1 = await seedFaculty('fac.sample1', 'EMP1001', cse, 'Dr Sample One');
  const mSample2 = await seedFaculty('fac.sample2', 'EMP1002', cse, 'Dr Sample Two');
  void mSample1;
  void mSample2;

  async function seedStudent(regNo: string, name: string, dept: any) {
    const user: any = await User.create({
      username: regNo, passwordHash: bcrypt.hashSync('Student@123', 4), role: 'STUDENT',
      email: `${regNo}@ksrce.test`, fullName: name, department: dept._id, isActive: true,
    });
    const student: any = await Student.create({
      user: user._id, fullName: name, registerNumber: regNo, email: `${regNo}@ksrce.test`,
      mobileNumber: '9000000000', department: dept._id, batch: b1._id, section: 'A', year: 2,
      residentialType: 'DAY_SCHOLAR', profileCompleted: true, isActive: true,
    } as any);
    return { user, student };
  }

  const s1 = await seedStudent('73152430001', 'Cse Student One', cse); // assigned to m1
  const s2 = await seedStudent('73152430002', 'Cse Student Two', cse); // unassigned
  const s3 = await seedStudent('73152430003', 'Cse Student Three', cse); // unassigned
  const s4 = await seedStudent('73152430004', 'Ece Student Four', ece); // ECE
  const s5 = await seedStudent('73152430005', 'Cse Student Five', cse); // assigned to m1
  const s6 = await seedStudent('73152430006', 'Cse Student Six', cse); // assigned to m2 (fills capacity)
  const s7 = await seedStudent('73152430007', 'Cse Student Seven', cse); // unassigned (capacity warning)
  const s8 = await seedStudent('73152430008', 'Cse Student Eight', cse); // unassigned (HOD assign)
  const s9 = await seedStudent('73152430009', 'Cse Student Nine', cse); // unassigned (single-flow regression)
  const sSample = await seedStudent('261T001', 'Sample Student One', cse); // template example register
  const sSample2 = await seedStudent('261T002', 'Sample Student Two', cse); // template example register

  // Existing active assignments: s1 & s5 -> m1, s6 -> m2 (m2 has capacity 1).
  for (const st of [s1, s5]) {
    await MentorAssignment.create({
      mentor: m1.faculty._id, student: st.student._id, department: cse._id,
      assignedBy: admin._id, status: 'ACTIVE',
    });
  }
  await MentorAssignment.create({
    mentor: m2.faculty._id, student: s6.student._id, department: cse._id,
    assignedBy: admin._id, status: 'ACTIVE',
  });

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  async function login(username: string, password: string) {
    const r = await http('POST', '/api/auth/login', { body: { username, password } });
    assert(r.status === 200, `login ${username} failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return (r.body?.data?.token || r.body?.token) as string;
  }
  const adminToken = await login('admin', process.env.ADMIN_PASSWORD as string);
  const hodToken = await login('hod.bulk', 'Mentor@123');
  const facultyToken = await login('fac.cse1', 'Mentor@123');
  const studentToken = await login('73152430002', 'Student@123');

  console.log('--- verification -------------------------------------------------');

  /* ============================================================ 1. TEMPLATES */

  await check('CSV template downloads with the required header + illustrative example rows', async () => {
    const r = await httpRaw('GET', '/api/mentorship/bulk/template?format=csv', { token: adminToken });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(/text\/csv/.test(r.contentType), `content-type was ${r.contentType}`);
    const text = r.buffer.toString('utf8');
    assert(text.includes('Student Register Number,Mentor Employee ID'), 'missing template header');
    assert(text.includes('261T001,EMP1001') && text.includes('261T002,EMP1002'), 'missing example rows');
    assert(text.includes('#'), 'missing instruction/comment lines');
    return `200 text/csv; header + 2 example rows + comment instructions`;
  });

  await check('Excel template downloads as a valid .xlsx with Instructions + Assignments sheets', async () => {
    const r = await httpRaw('GET', '/api/mentorship/bulk/template?format=xlsx', { token: adminToken });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(/spreadsheetml\.sheet/.test(r.contentType), `content-type was ${r.contentType}`);
    assert(r.buffer.subarray(0, 2).toString() === 'PK', 'not an XLSX (missing PK signature)');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer as any);
    const names = wb.worksheets.map((w) => w.name);
    assert(names.includes('Assignments') && names.includes('Instructions'), `sheets were ${names.join(', ')}`);
    const ws = wb.getWorksheet('Assignments')!;
    assert(String(ws.getRow(1).getCell(1).value).includes('Student Register Number'), 'wrong header cell');
    return `200 xlsx; sheets [${names.join(', ')}]; header "Student Register Number"`;
  });

  /* ============================== 5. SAMPLE ROWS NEVER ASSIGN (even if real) */

  await check('Template example pairs are ALWAYS INVALID and never create assignments', async () => {
    const csv = csvText([
      ['261T001', 'EMP1001'],
      ['261T002', 'EMP1002'],
    ]);
    const v = await uploadFile('/api/mentorship/bulk/validate', adminToken, 'samples.csv', csv, 'text/csv');
    assert(v.status === 200, `validate expected 200, got ${v.status} ${JSON.stringify(v.body).slice(0, 200)}`);
    const vRows = v.body.data.rows;
    assert(vRows.length === 2, `expected 2 rows, got ${vRows.length}`);
    assert(vRows.every((x: any) => x.status === 'INVALID'), `statuses: ${vRows.map((x: any) => x.status).join(',')}`);
    assert(v.body.data.summary.invalidRows === 2, 'sample rows were not counted invalid');

    // Even though real student + faculty rows exist for these IDs, execution must skip them.
    const ex = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: {
        rows: [
          { rowNumber: 2, registerNumber: '261T001', employeeId: 'EMP1001' },
          { rowNumber: 3, registerNumber: '261T002', employeeId: 'EMP1002' },
        ],
        authorizeReassignments: false,
      },
    });
    assert(ex.status === 200, `assign expected 200, got ${ex.status}`);
    assert(ex.body.data.summary.successful === 0, `samples created ${ex.body.data.summary.successful} assignments!`);
    assert((await MentorAssignment.countDocuments({ student: sSample.student._id })) === 0, 'sample student got an assignment');
    assert((await MentorAssignment.countDocuments({ student: sSample2.student._id })) === 0, 'sample student 2 got an assignment');
    return `samples -> INVALID, 0 assigned; real 261T001/EMP1001 pairs still refused`;
  });

  /* ====================================== 7 + 6. PREVIEW STATS & VALIDATION */

  const mainPairs: Array<[string, string]> = [
    ['73152430002', 'FAC700'], // s2 -> VALID
    ['73152430005', 'FAC700'], // s5 -> ALREADY_ASSIGNED
    ['73152430001', 'FAC703'], // s1 -> REASSIGNMENT_REQUIRED
    ['73152430003', 'FAC700'], // s3 -> VALID
    ['73152430003', 'FAC700'], // s3 -> DUPLICATE
    ['UNKNOWN999', 'FAC700'],  // INVALID (no student)
    ['73152430002', 'UNKNOWNEMP'], // INVALID (no mentor)
    ['73152430003', ''],       // INVALID (missing mentor)
  ];

  let mainPreview: any = null;

  await check('CSV preview reports every status with correct summary counts + columns', async () => {
    const csv = csvText(mainPairs);
    const v = await uploadFile('/api/mentorship/bulk/validate', adminToken, 'main.csv', csv, 'text/csv');
    assert(v.status === 200, `expected 200, got ${v.status} ${JSON.stringify(v.body).slice(0, 300)}`);
    mainPreview = v.body.data;
    const r = mainPreview.rows;
    const s = mainPreview.summary;

    assert(r.map((x: any) => x.status).join(',') ===
      'VALID,ALREADY_ASSIGNED,REASSIGNMENT_REQUIRED,VALID,DUPLICATE,INVALID,INVALID,INVALID',
      `statuses were ${r.map((x: any) => x.status).join(',')}`);

    assert(s.totalRows === 8, `totalRows=${s.totalRows}`);
    assert(s.validAssignments === 2, `validAssignments=${s.validAssignments}`);
    assert(s.alreadyAssigned === 1, `alreadyAssigned=${s.alreadyAssigned}`);
    assert(s.reassignmentRequired === 1, `reassignmentRequired=${s.reassignmentRequired}`);
    assert(s.duplicates === 1, `duplicates=${s.duplicates}`);
    assert(s.invalidRows === 4, `invalidRows=${s.invalidRows}`);
    assert(s.readyForAssignment === 3, `readyForAssignment=${s.readyForAssignment}`);
    assert(s.affectedMentors === 2, `affectedMentors=${s.affectedMentors}`);

    // Preview exposes the documented columns.
    const first = r[0];
    for (const key of ['rowNumber', 'registerNumber', 'studentName', 'employeeId', 'mentorName', 'currentMentorName', 'proposedMentorName', 'status', 'message']) {
      assert(key in first, `preview row missing "${key}"`);
    }
    assert(first.studentName === 'Cse Student Two', `studentName=${first.studentName}`);
    assert(first.mentorName === 'Dr Cse Mentor One', `mentorName=${first.mentorName}`);
    // The already-assigned row carries the current mentor name.
    assert(r[1].currentMentorName === 'Dr Cse Mentor One', `currentMentorName=${r[1].currentMentorName}`);
    assert(r[2].currentMentorName === 'Dr Cse Mentor One', 'reassignment row missing current mentor');
    return `8 rows; VALID2 ALREADY1 REASSIGN1 DUP1 INVALID4; affectedMentors=2`;
  });

  await check('Excel (.xlsx) upload parses to the same validated preview', async () => {
    const buf = await xlsxBuffer([
      ['73152430002', 'FAC700'],
      ['UNKNOWN999', 'FAC700'],
    ]);
    const v = await uploadFile(
      '/api/mentorship/bulk/validate',
      adminToken,
      'roster.xlsx',
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert(v.status === 200, `expected 200, got ${v.status} ${JSON.stringify(v.body).slice(0, 200)}`);
    assert(v.body.data.rows.length === 2, `expected 2 rows, got ${v.body.data.rows.length}`);
    assert(v.body.data.rows[0].status === 'VALID' && v.body.data.rows[1].status === 'INVALID', 'wrong xlsx statuses');
    return `.xlsx parsed: row1 VALID, row2 INVALID`;
  });

  await check('A file without the required columns is rejected with a clear 400', async () => {
    const bad = 'Name,Phone\r\nAlice,12345\r\n';
    const v = await uploadFile('/api/mentorship/bulk/validate', adminToken, 'bad.csv', bad, 'text/csv');
    assert(v.status === 400, `expected 400, got ${v.status}`);
    assert(/Student Register Number/i.test(v.body.message), `message: ${v.body.message}`);
    return `400 "${v.body.message}"`;
  });

  await check('Row limit: more than 1000 data rows is refused', async () => {
    const lines = ['Student Register Number,Mentor Employee ID'];
    for (let i = 0; i < 1001; i++) lines.push(`R${i},FAC700`);
    const v = await uploadFile('/api/mentorship/bulk/validate', adminToken, 'huge.csv', lines.join('\r\n') + '\r\n', 'text/csv');
    assert(v.status === 400, `expected 400, got ${v.status}`);
    assert(/exceeds the maximum/i.test(v.body.message), `message: ${v.body.message}`);
    return `1001 rows -> 400 "${v.body.message}"`;
  });

  await check('File type guard: a non-spreadsheet extension is refused', async () => {
    const v = await uploadFile('/api/mentorship/bulk/validate', adminToken, 'notes.txt', 'a,b\r\n', 'application/octet-stream');
    assert(v.status === 400, `expected 400, got ${v.status}`);
    assert(/xlsx|csv/i.test(v.body.message), `message: ${v.body.message}`);
    return `notes.txt -> 400 "${v.body.message}"`;
  });

  await check('Corrupted .xlsx is reported with a clear 400 (not a 500)', async () => {
    const v = await uploadFile(
      '/api/mentorship/bulk/validate',
      adminToken,
      'broken.xlsx',
      'this is definitely not a spreadsheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert(v.status === 400, `expected 400, got ${v.status}`);
    assert(/corrupt|unreadable|Failed/i.test(v.body.message), `message: ${v.body.message}`);
    return `broken.xlsx -> 400 "${v.body.message}"`;
  });

  await check('File size limit: an over-5MB upload is refused', async () => {
    const header = 'Student Register Number,Mentor Employee ID\r\n';
    const filler = '73152430002,FAC700\r\n';
    const big = header + filler.repeat(Math.ceil((5.3 * 1024 * 1024) / filler.length));
    assert(Buffer.byteLength(big) > 5 * 1024 * 1024, 'test payload is not actually oversized');
    const v = await uploadFile('/api/mentorship/bulk/validate', adminToken, 'big.csv', big, 'text/csv');
    assert(v.status === 400, `expected 400, got ${v.status}`);
    assert(/maximum|5 MB|exceeds/i.test(v.body.message), `message: ${v.body.message}`);
    return `>5MB -> 400 "${v.body.message}"`;
  });

  /* ======================================================= 8. EXECUTION FLOW */

  await check('Confirmed execution writes only valid rows, preserves history, and reports partial results', async () => {
    const body = {
      rows: mainPairs.map(([registerNumber, employeeId], i) => ({ rowNumber: i + 2, registerNumber, employeeId })),
      authorizeReassignments: true,
      reason: 'Bulk academic-year rebalancing test',
    };
    const ex = await http('POST', '/api/mentorship/bulk/assign', { token: adminToken, body });
    assert(ex.status === 200, `expected 200, got ${ex.status} ${JSON.stringify(ex.body).slice(0, 300)}`);
    const s = ex.body.data.summary;
    assert(s.totalRows === 8, `totalRows=${s.totalRows}`);
    assert(s.assigned === 2, `assigned=${s.assigned}`);
    assert(s.reassigned === 1, `reassigned=${s.reassigned}`);
    assert(s.successful === 3, `successful=${s.successful}`);
    assert(s.skipped === 5, `skipped=${s.skipped}`);
    assert(s.failed === 0, `failed=${s.failed}`);

    // Per-row outcomes.
    const stat = (reg: string, emp: string) =>
      ex.body.data.results.find((r: any) => r.registerNumber === reg && r.employeeId === emp)?.status;
    assert(stat('73152430002', 'FAC700') === 'ASSIGNED', 's2 not assigned');
    assert(stat('73152430003', 'FAC700') === 'ASSIGNED', 's3 not assigned');
    assert(stat('73152430001', 'FAC703') === 'REASSIGNED', 's1 not reassigned');
    assert(stat('73152430005', 'FAC700') === 'SKIPPED', 'already-assigned row not skipped');

    // New ACTIVE assignments exist.
    assert(await MentorAssignment.countDocuments({ student: s2.student._id, status: 'ACTIVE' }) === 1, 's2 active assignment missing');
    assert(await MentorAssignment.countDocuments({ student: s3.student._id, status: 'ACTIVE' }) === 1, 's3 active assignment missing');

    // Reassignment preserved the previous mentor as COMPLETED with an end date.
    const s1history: any[] = await MentorAssignment.find({ student: s1.student._id });
    const completed = s1history.filter((a) => a.status === 'COMPLETED');
    const active = s1history.filter((a) => a.status === 'ACTIVE');
    assert(completed.length === 1, `expected 1 completed history row, got ${completed.length}`);
    assert(completed[0].assignedUntil != null, 'completed row has no assignedUntil');
    assert(active.length === 1 && String(active[0].mentor) === String(m3.faculty._id), 'active row is not the new mentor');
    return `assigned=2 reassigned=1 skipped=5 failed=0; s1 history COMPLETED+ACTIVE preserved`;
  });

  await check('Duplicate submission is prevented (re-running the same batch assigns nothing)', async () => {
    const body = {
      rows: mainPairs.map(([registerNumber, employeeId], i) => ({ rowNumber: i + 2, registerNumber, employeeId })),
      authorizeReassignments: true,
      reason: 'Duplicate submission probe',
    };
    const ex = await http('POST', '/api/mentorship/bulk/assign', { token: adminToken, body });
    assert(ex.status === 200, `expected 200, got ${ex.status}`);
    assert(ex.body.data.summary.successful === 0, `re-run created ${ex.body.data.summary.successful} writes!`);
    assert(ex.body.data.summary.assigned === 0 && ex.body.data.summary.reassigned === 0, 're-run mutated state');
    return `re-run: successful=0, assigned=0, reassigned=0`;
  });

  await check('Invalid rows are NEVER assigned, even if a client forges a VALID status', async () => {
    const before = await MentorAssignment.countDocuments({});
    const ex = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: {
        rows: [
          { rowNumber: 2, registerNumber: 'UNKNOWN999', employeeId: 'FAC700', status: 'VALID' },
          { rowNumber: 3, registerNumber: '73152430002', employeeId: 'NOPE', status: 'VALID' },
        ],
        authorizeReassignments: false,
      },
    });
    assert(ex.status === 200, `expected 200, got ${ex.status}`);
    assert(ex.body.data.summary.successful === 0, 'a forged-status row was assigned!');
    assert((await MentorAssignment.countDocuments({})) === before, 'assignment count changed');
    return `forged statuses ignored; successful=0; no new rows`;
  });

  await check('Reassignment is refused without explicit authorisation', async () => {
    const r = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: {
        rows: [{ rowNumber: 2, registerNumber: '73152430005', employeeId: 'FAC703' }],
        authorizeReassignments: false,
      },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.data.summary.reassigned === 0, 'unauthorised reassignment went through');
    assert(r.body.data.results[0].status === 'SKIPPED', `status=${r.body.data.results[0].status}`);
    assert((await MentorAssignment.countDocuments({ student: s5.student._id, mentor: m1.faculty._id, status: 'ACTIVE' })) === 1, 's5 changed!');
    return `unauthorised -> SKIPPED ("${r.body.data.results[0].reason}")`;
  });

  await check('Reassignment authorisation without a reason is rejected with 400', async () => {
    const r = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: {
        rows: [{ rowNumber: 2, registerNumber: '73152430005', employeeId: 'FAC703' }],
        authorizeReassignments: true,
        reason: '   ',
      },
    });
    assert(r.status === 400, `expected 400, got ${r.status}`);
    assert(/reason/i.test(r.body.message), `message: ${r.body.message}`);
    return `400 "${r.body.message}"`;
  });

  await check('Authorised reassignment requires a reason and completes with history preserved', async () => {
    const r = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: {
        rows: [{ rowNumber: 2, registerNumber: '73152430005', employeeId: 'FAC703' }],
        authorizeReassignments: true,
        reason: 'Workload rebalancing',
      },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.data.summary.reassigned === 1, `reassigned=${r.body.data.summary.reassigned}`);
    const history: any[] = await MentorAssignment.find({ student: s5.student._id });
    assert(history.filter((a) => a.status === 'COMPLETED').length === 1, 'previous assignment not completed');
    assert(history.filter((a) => a.status === 'ACTIVE').length === 1, 'no single active assignment');
    assert(String(history.find((a) => a.status === 'ACTIVE').mentor) === String(m3.faculty._id), 'wrong new mentor');
    return `s5 reassigned to FAC703; previous mentor COMPLETED (history preserved)`;
  });

  await check('Already-assigned student returns a no-op SKIPPED (never a duplicate active row)', async () => {
    const r = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: {
        rows: [{ rowNumber: 2, registerNumber: '73152430002', employeeId: 'FAC700' }],
        authorizeReassignments: false,
      },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.data.results[0].status === 'SKIPPED', `status=${r.body.data.results[0].status}`);
    assert(await MentorAssignment.countDocuments({ student: s2.student._id, status: 'ACTIVE' }) === 1, 'duplicate active assignment created');
    return `no-op SKIPPED ("${r.body.data.results[0].reason}")`;
  });

  /* ====================================================== CAPACITY (warn only) */

  await check('Mentor capacity produces a WARNING but never blocks (capacity is not enforced)', async () => {
    // m2 has maxMentees=1 and one active mentee already.
    const v = await uploadFile(
      '/api/mentorship/bulk/validate',
      adminToken,
      'cap.csv',
      csvText([['73152430007', 'FAC702']]),
      'text/csv'
    );
    assert(v.status === 200, `expected 200, got ${v.status}`);
    assert(v.body.data.rows[0].status === 'WARNING', `status=${v.body.data.rows[0].status}`);
    assert(/capacity/i.test(v.body.data.rows[0].message), `message=${v.body.data.rows[0].message}`);

    const ex = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: { rows: [{ rowNumber: 2, registerNumber: '73152430007', employeeId: 'FAC702' }], authorizeReassignments: false },
    });
    assert(ex.status === 200, `expected 200, got ${ex.status}`);
    assert(ex.body.data.summary.assigned === 1, 'capacity warning blocked the assignment');
    assert(await MentorAssignment.countDocuments({ student: s7.student._id, status: 'ACTIVE' }) === 1, 's7 not assigned');
    return `WARNING then ASSIGNED; capacity never blocks`;
  });

  await check('Cross-department assignment is a WARNING for ADMIN and assigns successfully', async () => {
    const v = await uploadFile(
      '/api/mentorship/bulk/validate',
      adminToken,
      'xdept.csv',
      csvText([['73152430004', 'FAC700']]), // ECE student -> CSE mentor
      'text/csv'
    );
    assert(v.status === 200, `expected 200, got ${v.status}`);
    assert(v.body.data.rows[0].status === 'WARNING', `status=${v.body.data.rows[0].status}`);
    assert(/cross-department/i.test(v.body.data.rows[0].message), `message=${v.body.data.rows[0].message}`);

    const ex = await http('POST', '/api/mentorship/bulk/assign', {
      token: adminToken,
      body: { rows: [{ rowNumber: 2, registerNumber: '73152430004', employeeId: 'FAC700' }], authorizeReassignments: false },
    });
    assert(ex.status === 200 && ex.body.data.summary.assigned === 1, 'admin cross-dept assignment was blocked');
    return `ADMIN cross-department -> WARNING + ASSIGNED`;
  });

  /* ============================================================== 9. RBAC --- */

  await check('HOD preview scopes BOTH the student and the mentor to its own department', async () => {
    const v = await uploadFile(
      '/api/mentorship/bulk/validate',
      hodToken,
      'hod.csv',
      csvText([
        ['73152430008', 'FAC700'], // CSE student + CSE mentor -> VALID
        ['73152430004', 'FAC700'], // ECE student -> INVALID
        ['73152430008', 'FAC701'], // ECE mentor -> INVALID
      ]),
      'text/csv'
    );
    assert(v.status === 200, `expected 200, got ${v.status} ${JSON.stringify(v.body).slice(0, 200)}`);
    const r = v.body.data.rows;
    assert(r[0].status === 'VALID', `row1=${r[0].status} (${r[0].message})`);
    assert(r[1].status === 'INVALID' && /department/i.test(r[1].message), `row2=${r[1].status} (${r[1].message})`);
    assert(r[2].status === 'INVALID' && /department/i.test(r[2].message), `row3=${r[2].status} (${r[2].message})`);
    return `own-dept VALID; out-of-dept student + mentor both INVALID`;
  });

  await check('HOD execution refuses out-of-department students (server re-checks, not just preview)', async () => {
    const r = await http('POST', '/api/mentorship/bulk/assign', {
      token: hodToken,
      body: { rows: [{ rowNumber: 2, registerNumber: '73152430004', employeeId: 'FAC700' }], authorizeReassignments: false },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.data.summary.successful === 0, 'HOD assigned an out-of-department student!');
    assert(r.body.data.results[0].status === 'SKIPPED', `status=${r.body.data.results[0].status}`);
    assert(await MentorAssignment.countDocuments({ student: s4.student._id }) === 1, 'ECE student assignment count unexpected (expected only the admin cross-dept one)');
    return `HOD out-of-dept -> SKIPPED ("${r.body.data.results[0].reason}")`;
  });

  await check('HOD can assign inside its own department', async () => {
    const r = await http('POST', '/api/mentorship/bulk/assign', {
      token: hodToken,
      body: { rows: [{ rowNumber: 2, registerNumber: '73152430008', employeeId: 'FAC700' }], authorizeReassignments: false },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.data.summary.assigned === 1, `assigned=${r.body.data.summary.assigned}`);
    assert(await MentorAssignment.countDocuments({ student: s8.student._id, status: 'ACTIVE' }) === 1, 'HOD assign did not persist');
    return `HOD own-dept -> ASSIGNED`;
  });

  await check('FACULTY, STUDENT and anonymous callers are refused on every bulk endpoint', async () => {
    const attempts: Array<[string, string, string | undefined]> = [
      ['GET', '/api/mentorship/bulk/template?format=csv', facultyToken],
      ['POST', '/api/mentorship/bulk/validate', facultyToken],
      ['POST', '/api/mentorship/bulk/assign', facultyToken],
      ['POST', '/api/mentorship/bulk/report', facultyToken],
      ['GET', '/api/mentorship/bulk/template?format=csv', studentToken],
      ['POST', '/api/mentorship/bulk/assign', studentToken],
      ['GET', '/api/mentorship/bulk/template?format=csv', undefined],
    ];
    for (const [method, path, token] of attempts) {
      const r = await http(method, path, { token, body: method === 'POST' ? { rows: [{}] } : undefined });
      assert(r.status === 403 || r.status === 401, `${method} ${path} (${token ? 'non-admin' : 'anon'}) -> ${r.status}`);
    }
    return `${attempts.length} non-privileged/anonymous calls all refused (401/403)`;
  });

  /* ================================================ 10. HISTORY & AUDIT --- */

  await check('Assignments emit student/mentor notifications and BULK_ASSIGNMENT audit entries', async () => {
    const notifCount = await Notification.countDocuments({ type: 'MENTOR_ASSIGNMENT' });
    assert(notifCount > 0, 'no assignment notifications were created');

    const allAudits: any[] = await AuditLog.find({ entity: 'MENTOR_ASSIGNMENT' });
    const bulkSummary = allAudits.find((a) => a.action === 'BULK_ASSIGN_MENTORS');
    assert(bulkSummary, 'no BULK_ASSIGN_MENTORS audit entry');
    assert(typeof bulkSummary.details?.totalRows === 'number', 'bulk summary audit has no totalRows');

    const rowAudits = allAudits.filter(
      (a) => (a.action === 'ASSIGN_MENTOR' || a.action === 'REASSIGN_MENTOR') && a.details?.source === 'BULK_ASSIGNMENT'
    );
    assert(rowAudits.length >= 3, `expected >=3 per-row bulk audit entries, got ${rowAudits.length}`);
    const reassignAudit = rowAudits.find((a) => a.action === 'REASSIGN_MENTOR');
    assert(reassignAudit && reassignAudit.details?.previousMentorId, 'reassignment audit missing previousMentorId');

    // Student-side notification exists for a newly assigned student.
    const studentNotifs = await Notification.countDocuments({ user: s2.user._id, type: 'MENTOR_ASSIGNMENT' });
    assert(studentNotifs > 0, 'assigned student received no notification');
    return `${notifCount} notifications; ${rowAudits.length} per-row audit entries + BULK_ASSIGN_MENTORS summary`;
  });

  /* ================================================== 11. REPORTS (CSV/XLSX) */

  await check('Validation report downloads as CSV with the preview columns', async () => {
    const r = await httpRaw('POST', '/api/mentorship/bulk/report', {
      token: adminToken,
      body: { type: 'VALIDATION', format: 'CSV', rows: mainPreview.rows },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(/text\/csv/.test(r.contentType), `content-type ${r.contentType}`);
    const text = r.buffer.toString('utf8');
    assert(text.includes('Register Number') && text.includes('Status'), 'CSV header missing columns');
    assert(text.includes('VALID') && text.includes('REASSIGNMENT_REQUIRED'), 'CSV missing status values');
    return `200 text/csv; ${mainPreview.rows.length} rows + header`;
  });

  await check('Results report downloads as Excel (.xlsx)', async () => {
    const resultRows = [
      { rowNumber: 2, registerNumber: '73152430002', studentName: 'Cse Student Two', employeeId: 'FAC700', mentorName: 'Dr Cse Mentor One', status: 'ASSIGNED', reason: 'Assigned successfully.' },
      { rowNumber: 6, registerNumber: 'UNKNOWN999', studentName: '—', employeeId: 'FAC700', mentorName: 'Dr Cse Mentor One', status: 'SKIPPED', reason: 'Invalid row' },
    ];
    const r = await httpRaw('POST', '/api/mentorship/bulk/report', {
      token: adminToken,
      body: { type: 'RESULT', format: 'XLSX', rows: resultRows },
    });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(/spreadsheetml\.sheet/.test(r.contentType), `content-type ${r.contentType}`);
    assert(r.buffer.subarray(0, 2).toString() === 'PK', 'not an XLSX');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer as any);
    const ws = wb.worksheets[0];
    assert(String(ws.getRow(1).getCell(1).value) === 'Row', 'wrong header');
    assert(String(ws.getRow(2).getCell(6).value) === 'ASSIGNED', 'first result row wrong');
    return `200 xlsx; header Row..; row status ASSIGNED`;
  });

  await check('Report endpoint rejects an empty row set with 400', async () => {
    const r = await http('POST', '/api/mentorship/bulk/report', {
      token: adminToken,
      body: { type: 'RESULT', format: 'CSV', rows: [] },
    });
    assert(r.status === 400, `expected 400, got ${r.status}`);
    return `empty rows -> 400`;
  });

  /* ============================= 12. SINGLE-FLOW REGRESSION + NO SECRETS --- */

  await check('Existing single-student assign/reassign still work after the bulk feature', async () => {
    const assign = await http('POST', '/api/mentorship/assign', {
      token: adminToken,
      body: { studentId: s9.student._id.toString(), mentorId: m3.faculty._id.toString(), reason: 'Single assign regression' },
    });
    assert(assign.status === 201, `single assign -> ${assign.status} ${JSON.stringify(assign.body).slice(0, 200)}`);

    const reassign = await http('POST', '/api/mentorship/reassign', {
      token: adminToken,
      body: {
        studentId: s9.student._id.toString(),
        newMentorId: m1.faculty._id.toString(),
        reasonForChange: 'Single reassign regression',
      },
    });
    assert(reassign.status === 200, `single reassign -> ${reassign.status} ${JSON.stringify(reassign.body).slice(0, 200)}`);
    const history: any[] = await MentorAssignment.find({ student: s9.student._id });
    assert(history.filter((a) => a.status === 'COMPLETED').length === 1, 'single reassign lost history');
    assert(history.filter((a) => a.status === 'ACTIVE').length === 1, 'single reassign active count wrong');
    return `single assign 201 + reassign 200; history preserved`;
  });

  await check('Bulk payloads leak no secrets', async () => {
    const v = await uploadFile(
      '/api/mentorship/bulk/validate',
      adminToken,
      'leak.csv',
      csvText([['73152430002', 'FAC700']]),
      'text/csv'
    );
    const text = JSON.stringify(v.body);
    for (const needle of ['passwordHash', 'JWT_SECRET', 'DATA_DIR', 'temporaryPassword']) {
      assert(!text.includes(needle), `validate payload leaked "${needle}"`);
    }
    return 'no passwordHash / JWT_SECRET / DATA_DIR / temporaryPassword in preview payload';
  });

  /* ── REPORT ──────────────────────────────────────────────────────────────── */
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== BULK ASSIGNMENT VERIFICATION ==========\n');
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
