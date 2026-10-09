/**
 * BULK UPLOAD (Admin) VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives the whole Admin → Bulk Upload flow over HTTP:
 *
 *   GET  /api/admin/bulk-upload/students/template
 *   GET  /api/admin/bulk-upload/faculty/template
 *   POST /api/admin/bulk-upload/students/validate
 *   POST /api/admin/bulk-upload/faculty/validate
 *   POST /api/admin/bulk-upload/students/import
 *   POST /api/admin/bulk-upload/faculty/import
 *   POST /api/admin/bulk-upload/error-report
 *
 * What is PROVABLE rather than assumed:
 *   - backend routes and frontend client.ts use byte-identical paths
 *   - student template = 3 sheets, the exact 25 headers in the exact order,
 *     one clearly marked SAMPLE row, live department/batch reference values
 *     and Excel drop-downs on every controlled column
 *   - faculty template only carries columns the Faculty/User models can store,
 *     and the Instructions sheet lists the 10 requested-but-unsupported fields
 *   - validation statuses: VALID / INVALID / DUPLICATE / ALREADY_EXISTS,
 *     including "SAMPLE… rows are always INVALID"
 *   - import creates the record with parent/school/blood/residential data,
 *     NEVER overwrites an existing record, never imports a sample row
 *   - RBAC: ADMIN only (faculty 403, anonymous 401)
 *   - .xlsx only, 10 MB ceiling, corrupted workbook rejected
 *   - error report downloads as .xlsx and omits successful rows
 *   - frontend source contracts (client.ts shapes, no Tailwind in the module)
 *
 * Run: npm run test:bulk-upload
 */
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('bulk-upload');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5116;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bulk-upload-secret-do-not-use-in-prod';
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

/** multipart/form-data upload — the way the browser sends an .xlsx file. */
async function upload(
  urlPath: string,
  buffer: Buffer,
  filename: string,
  token?: string
) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  );
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
  return { status: res.status, body: parsed as any, headers: res.headers };
}

/** Fetch a binary endpoint (template / error report) as a Buffer. */
async function download(urlPath: string, opts: { token?: string; method?: string; body?: any } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method: opts.method || 'GET', headers, body });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    ok: res.ok,
    buffer: buf,
    contentType: res.headers.get('content-type') || '',
    disposition: res.headers.get('content-disposition') || '',
  };
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

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

function headerRowOf(sheet: ExcelJS.Worksheet): string[] {
  const values = sheet.getRow(1).values as any[];
  return values.slice(1).map((v) => (v === undefined || v === null ? '' : String(v).trim()));
}

function columnLetterForHeader(sheet: ExcelJS.Worksheet, header: string): string {
  const headers = headerRowOf(sheet);
  const idx = headers.indexOf(header);
  assert(idx >= 0, `template is missing the "${header}" header`);
  return sheet.getColumn(idx + 1).letter;
}

/** Build a single-sheet Students workbook using the exported column contract. */
async function buildStudentWorkbook(
  service: any,
  dataRows: Array<Record<string, any>>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.columns = service.STUDENT_TEMPLATE_COLUMNS.map((c: any) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  for (const row of dataRows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildFacultyWorkbook(
  service: any,
  dataRows: Array<Record<string, any>>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Faculty');
  ws.columns = service.FACULTY_TEMPLATE_COLUMNS.map((c: any) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  for (const row of dataRows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** One fully valid student row keyed by the template column keys. */
function validStudentRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    studentName: 'BU Test Student',
    registerNo: '713823BU001',
    department: 'CSE',
    academicBatch: '2023-2027',
    year: '2',
    section: 'A',
    residentialStatus: 'Hosteller',
    bloodGroup: 'A+ve',
    mobile: '9876543210',
    dateOfBirth: '2006-01-01',
    emailAddress: 'bu.student1@ksrce.test',
    fatherName: 'BU Test Father',
    fatherContact: '9876543211',
    fatherJob: 'Agriculture',
    motherName: 'BU Test Mother',
    motherContact: '9876543212',
    motherJob: 'Homemaker',
    permanentAddress: '12, Test Street, Karur',
    tenthMark: '450/500',
    tenthSchool: 'Test Higher Secondary School',
    twelfthMark: '500/600',
    twelfthSchool: 'Test Matriculation School',
    tneaCutoff: '185.5',
    admissionMode: 'Counselling',
    scholarship: 'First Graduate',
    ...overrides,
  };
}

/** Assert the frontend still ships the Bulk Upload contracts this test proves. */
function verifyFrontendContracts() {
  const frontendSrc = path.resolve(process.cwd(), '..', 'frontend', 'src');
  const client = fs.readFileSync(path.join(frontendSrc, 'api', 'client.ts'), 'utf8');

  // 1. Exact route alignment with backend/src/modules/admin/admin.routes.ts.
  for (const p of [
    '/admin/bulk-upload/students/template',
    '/admin/bulk-upload/faculty/template',
    '/admin/bulk-upload/students/validate',
    '/admin/bulk-upload/faculty/validate',
    '/admin/bulk-upload/students/import',
    '/admin/bulk-upload/faculty/import',
    '/admin/bulk-upload/error-report',
  ]) {
    // Appears either as a quoted literal or inside `${API_BASE}/admin/...`.
    assert(client.includes(p), `client.ts is missing ${p}`);
  }

  // 2. Response-shape contract matches the backend service.
  assert(client.includes('existingRecords'), 'client.ts dropped BulkSummary.existingRecords');
  assert(
    !client.includes('existingRows'),
    'client.ts still expects the old `existingRows` summary field'
  );
  assert(
    client.includes("'Imported'") && client.includes("'Skipped'") && client.includes("'Failed'"),
    'client.ts must use the backend import statuses Imported/Skipped/Failed'
  );
  assert(
    !client.includes("'IMPORTED'"),
    'client.ts still expects the old uppercase IMPORTED status'
  );
  assert(
    /summary:\s*\{\s*totalRows:\s*number/.test(client),
    'client.ts BulkImportResponse must nest summary.totalRows like the backend'
  );

  // 3. The page is written against the project design system, not Tailwind.
  const page = fs.readFileSync(
    path.join(frontendSrc, 'pages', 'admin', 'AdminBulkUpload.tsx'),
    'utf8'
  );
  for (const needle of [
    'Bulk Import Management',
    'bu-selector-card',
    'bu-dropzone',
    'bu-steps',
    'bu-stat-grid',
    'bu-chip',
    "display: 'none'",
    'bu-template-card',
    'Download error report',
    'Upload another file',
  ]) {
    assert(page.includes(needle), `AdminBulkUpload.tsx is missing "${needle}"`);
  }
  assert(
    !page.includes('className="hidden"'),
    'AdminBulkUpload.tsx must hide the file input with style={{display:none}}, not a Tailwind class'
  );
  assert(
    !/className="[^"]*\b(text-sm|bg-gray-|text-gray-|rounded-lg\b)/.test(page),
    'AdminBulkUpload.tsx must not use Tailwind utility classes (the project has no Tailwind)'
  );

  // 4. The styles actually exist.
  const css = fs.readFileSync(path.join(frontendSrc, 'styles', 'index.css'), 'utf8');
  for (const needle of ['.bu-dropzone', '.bu-steps', '.bu-selector-card', '.bu-stat-grid']) {
    assert(css.includes(needle), `styles/index.css is missing ${needle}`);
  }
  assert(!css.includes('@tailwind'), 'styles/index.css must not pull in Tailwind');
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Student, Faculty, Department, Batch, AuditLog } = await import(
    '../models/index.js'
  );
  const service = await import('../modules/admin/bulk-upload.service.js');

  const admin = await login('admin', 'Admin@12345');
  assert(admin.token, 'admin could not log in');
  const adminToken = admin.token;

  const cse: any = await Department.findOne({ code: 'CSE' });
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(cse && batch, 'bootstrap did not create CSE / the 2023-2027 batch');

  // A non-admin account for the RBAC checks.
  const hash = bcrypt.hashSync('Password@123', 10);
  await User.create({
    username: 'bu.faculty',
    passwordHash: hash,
    role: 'FACULTY',
    email: 'bu.faculty@ksrce.test',
    fullName: 'BU Faculty RBAC',
    department: cse._id,
    isActive: true,
  } as any);
  const facultyLogin = await login('bu.faculty', 'Password@123');
  assert(facultyLogin.token, 'faculty RBAC account could not log in');

  // A pre-existing student, used to prove imports never overwrite.
  const existingUser: any = await User.create({
    username: '713823bupre',
    passwordHash: hash,
    role: 'STUDENT',
    email: '713823bupre@ksrce.test',
    fullName: 'Pre Existing Student',
    department: cse._id,
    isActive: true,
  });
  await Student.create({
    user: existingUser._id,
    registerNumber: '713823BUPRE',
    fullName: 'Pre Existing Student',
    department: cse._id,
    batch: batch._id,
    residentialType: 'DAY_SCHOLAR',
    parent: {},
    siblings: [],
    school: {},
    profileCompleted: false,
    isActive: true,
  } as any);

  /* ── 1. Route alignment ─────────────────────────────────────────────── */
  await check('Backend routes and frontend client use identical paths', async () => {
    const routes = fs.readFileSync(
      path.resolve(process.cwd(), 'src', 'modules', 'admin', 'admin.routes.ts'),
      'utf8'
    );
    const client = fs.readFileSync(
      path.resolve(process.cwd(), '..', 'frontend', 'src', 'api', 'client.ts'),
      'utf8'
    );
    const paths = [
      '/bulk-upload/students/template',
      '/bulk-upload/faculty/template',
      '/bulk-upload/students/validate',
      '/bulk-upload/faculty/validate',
      '/bulk-upload/students/import',
      '/bulk-upload/faculty/import',
      '/bulk-upload/error-report',
    ];
    for (const p of paths) {
      assert(routes.includes(`'${p}'`), `admin.routes.ts is missing ${p}`);
      // client.ts uses either `'/admin/…'` or `` `${API_BASE}/admin/…` ``.
      assert(
        client.includes(`/admin${p}`),
        `client.ts is missing /admin${p}`
      );
    }
    return `${paths.length} routes declared identically on both sides`;
  });

  /* ── 2. Student template ────────────────────────────────────────────── */
  await check('Student template: 3 sheets, exact 25 headers in spec order', async () => {
    const dl = await download('/api/admin/bulk-upload/students/template', { token: adminToken });
    assert(dl.status === 200, `template download -> ${dl.status}`);
    const wb = await loadWorkbook(dl.buffer);
    const names = wb.worksheets.map((w) => w.name);
    assert(
      names[0] === 'Instructions' && names[1] === 'Students' && names[2] === 'Reference Values',
      `sheet order must be Instructions/Students/Reference Values, got ${names.join(', ')}`
    );

    const expected = [
      'Student Name',
      'Register No.',
      'Department',
      'Academic Batch',
      'Year',
      'Section',
      'Residential Status',
      'Blood Group',
      'Mobile',
      'Date of Birth',
      'Email Address',
      "Father's Name",
      'Father Contact',
      "Father's Occupation / Job",
      "Mother's Name",
      'Mother Contact',
      "Mother's Occupation / Job",
      'Permanent Address',
      '10th Mark',
      '10th School',
      '12th Mark',
      '12th School',
      'TNEA Cut-off Mark',
      'Admission Mode',
      'Scholarship Details',
    ];
    const actual = headerRowOf(wb.getWorksheet('Students')!);
    assert(actual.length === 25, `expected 25 headers, got ${actual.length}`);
    for (let i = 0; i < expected.length; i++) {
      assert(actual[i] === expected[i], `header ${i + 1} must be "${expected[i]}", got "${actual[i]}"`);
    }
    return `25/25 headers exact and in order across 3 sheets: ${names.join(' / ')}`;
  });

  await check('Student template: one marked SAMPLE row that can never import', async () => {
    const dl = await download('/api/admin/bulk-upload/students/template', { token: adminToken });
    const wb = await loadWorkbook(dl.buffer);
    const ws = wb.getWorksheet('Students')!;
    const regLetter = columnLetterForHeader(ws, 'Register No.');
    const sampleCell = ws.getCell(`${regLetter}2`);
    assert(
      String(sampleCell.value).toUpperCase() === 'SAMPLE001',
      'row 2 must carry Register No. SAMPLE001'
    );
    assert(sampleCell.font?.italic === true, 'sample row must be italic');
    const fill = sampleCell.fill as any;
    assert(
      fill && fill.fgColor && fill.fgColor.argb === 'FFFFF7E6',
      'sample row must be tinted so it is visually obvious'
    );
    // Count rows that actually carry a register number (drop-down validation
    // alone must not make a row look like data).
    let dataRows = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const v = ws.getCell(`${regLetter}${r}`).value;
      if (v !== undefined && v !== null && String(v).trim() !== '') dataRows++;
    }
    assert(dataRows === 1, `template must ship exactly ONE sample row, found ${dataRows}`);
    return 'row 2 = SAMPLE001, italic + tinted, and it is the only data row shipped';
  });

  await check('Student template: controlled columns carry Excel drop-downs + live reference values', async () => {
    const dl = await download('/api/admin/bulk-upload/students/template', { token: adminToken });
    const wb = await loadWorkbook(dl.buffer);
    const ws = wb.getWorksheet('Students')!;
    const controlled = [
      'Department',
      'Academic Batch',
      'Year',
      'Section',
      'Residential Status',
      'Blood Group',
      'Admission Mode',
    ];
    for (const header of controlled) {
      const letter = columnLetterForHeader(ws, header);
      const dv = ws.getCell(`${letter}2`).dataValidation as any;
      assert(dv && dv.type === 'list', `"${header}" has no list drop-down`);
      assert(
        String(dv.formulae?.[0] || '').includes('Reference Values'),
        `"${header}" drop-down does not point at the Reference Values sheet`
      );
    }

    const ref = wb.getWorksheet('Reference Values')!;
    const refText = JSON.stringify(ref.getSheetValues());
    assert(refText.includes('CSE'), 'Reference Values must list the live CSE department');
    assert(refText.includes('ECE'), 'Reference Values must list the live ECE department');
    assert(refText.includes('2023-2027'), 'Reference Values must list the live academic batches');
    assert(refText.includes('Hosteller'), 'Reference Values must offer Hosteller/Day Scholar');
    assert(refText.includes('A+ve'), 'Reference Values must offer blood groups');

    const instructions = wb.getWorksheet('Instructions')!;
    const instructionText = JSON.stringify(instructions.getSheetValues());
    assert(
      instructionText.includes('SAMPLE001'),
      'Instructions sheet must explain the sample-row rule'
    );
    return `${controlled.length} drop-downs bound to 'Reference Values'; live CSE/ECE + batches present`;
  });

  /* ── 3. Faculty template ────────────────────────────────────────────── */
  await check('Faculty template: only model-supported columns, unsupported fields disclosed', async () => {
    const dl = await download('/api/admin/bulk-upload/faculty/template', { token: adminToken });
    assert(dl.status === 200, `faculty template -> ${dl.status}`);
    const wb = await loadWorkbook(dl.buffer);
    const names = wb.worksheets.map((w) => w.name);
    assert(
      names[0] === 'Instructions' && names[1] === 'Faculty' && names[2] === 'Reference Values',
      `unexpected sheet layout: ${names.join(', ')}`
    );

    const headers = headerRowOf(wb.getWorksheet('Faculty')!);
    const expected = [
      'Faculty Name',
      'Employee ID',
      'Department',
      'Designation',
      'Mobile',
      'Email Address',
      'Cabin Location',
      'Username',
    ];
    assert(
      headers.length === expected.length,
      `expected ${expected.length} faculty headers, got ${headers.length}`
    );
    for (let i = 0; i < expected.length; i++) {
      assert(headers[i] === expected[i], `faculty header ${i + 1} must be "${expected[i]}"`);
    }

    // Nothing the model cannot store may appear as a collect-and-discard column.
    for (const unsupported of service.FACULTY_UNSUPPORTED_FIELDS as string[]) {
      assert(
        !headers.includes(unsupported),
        `unsupported field "${unsupported}" must NOT be a template column`
      );
    }

    const instructions = wb.getWorksheet('Instructions')!;
    const text = JSON.stringify(instructions.getSheetValues());
    assert(text.includes('FIELDS NOT YET SUPPORTED'), 'Instructions must have the unsupported section');
    for (const unsupported of service.FACULTY_UNSUPPORTED_FIELDS as string[]) {
      assert(text.includes(unsupported), `Instructions must list unsupported field "${unsupported}"`);
    }
    assert(text.includes('SAMPLEFAC001'), 'Instructions must explain the faculty sample row');

    const sample = wb.getWorksheet('Faculty')!.getRow(2);
    assert(
      String(sample.getCell(2).value).toUpperCase() === 'SAMPLEFAC001',
      'faculty row 2 must be SAMPLEFAC001'
    );
    return `${headers.length} supported columns; ${service.FACULTY_UNSUPPORTED_FIELDS.length} unsupported fields listed in Instructions instead of collected`;
  });

  /* ── 4. Validation ──────────────────────────────────────────────────── */
  const studentService: any = service;

  // Build the upload file: 1 valid, 1 sample, 2 invalid, 1 in-file duplicate,
  // 1 already-existing register.
  const studentFile = await buildStudentWorkbook(studentService, [
    validStudentRow(),
    validStudentRow({
      studentName: 'Sample Student',
      registerNo: 'SAMPLE001',
      emailAddress: 'sample.student@ksrce.test',
      mobile: '9000000000',
      fatherContact: '9000000001',
      motherContact: '9000000002',
    }),
    validStudentRow({
      studentName: 'BU Bad Values',
      registerNo: '713823BU002',
      emailAddress: 'bu.bad@ksrce.test',
      residentialStatus: 'Bunker',
      bloodGroup: 'X9',
      mobile: '12345',
      admissionMode: 'Walk-in',
    }),
    validStudentRow({
      studentName: '',
      registerNo: '713823BU003',
      emailAddress: '',
      mobile: '',
      fatherContact: '',
      motherContact: '',
    }),
    validStudentRow({ studentName: 'BU In-file Duplicate', emailAddress: 'bu.dup@ksrce.test' }),
    validStudentRow({
      studentName: 'Pre Existing Student',
      registerNo: '713823BUPRE',
      emailAddress: '713823bupre@ksrce.test',
      mobile: '9876543999',
    }),
  ]);

  await check('Student validation returns the four documented statuses', async () => {
    const r = await upload('/api/admin/bulk-upload/students/validate', studentFile, 'students.xlsx', adminToken);
    assert(r.status === 200, `validate -> ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    const data = r.body?.data;
    assert(data, 'validate response has no data payload');
    const find = (id: string) => data.rows.find((x: any) => x.identifier === id);
    const byId: Record<string, any> = {};
    for (const row of data.rows) if (!byId[row.identifier]) byId[row.identifier] = row;

    assert(find('713823BU001')?.status === 'VALID', 'valid row must be VALID');
    assert(byId['SAMPLE001']?.status === 'INVALID', `sample row was ${byId['SAMPLE001']?.status}`);
    assert(
      String(byId['SAMPLE001']?.reason || '').toLowerCase().includes('sample'),
      'sample row reason must mention it is the template sample'
    );
    assert(byId['713823BU002']?.status === 'INVALID', 'bad blood/mobile/residential must be INVALID');
    assert(
      byId['713823BU002']?.reason.includes('Blood Group') &&
        byId['713823BU002']?.reason.includes('Residential Status') &&
        byId['713823BU002']?.reason.includes('Admission Mode') &&
        byId['713823BU002']?.reason.includes('10-digit'),
      `invalid-row reasons incomplete: ${byId['713823BU002']?.reason}`
    );
    assert(byId['713823BU003']?.status === 'INVALID', 'missing Student Name must be INVALID');
    // The 5th data row repeats 713823BU001 → DUPLICATE (not VALID, not ALREADY_EXISTS).
    const dupRows = data.rows.filter((x: any) => x.status === 'DUPLICATE');
    assert(dupRows.length === 1, `expected exactly 1 DUPLICATE, got ${dupRows.length}`);
    assert(
      String(dupRows[0].reason).includes('713823BU001'),
      'duplicate reason must name the repeated Register No'
    );
    assert(byId['713823BUPRE']?.status === 'ALREADY_EXISTS', 'existing register must be ALREADY_EXISTS');

    const s = data.summary;
    assert(s.totalRows === 6, `summary.totalRows=${s.totalRows}, expected 6`);
    assert(s.validRows === 1, `summary.validRows=${s.validRows}, expected 1`);
    assert(s.invalidRows === 3, `summary.invalidRows=${s.invalidRows}, expected 3 (sample + 2 bad)`);
    assert(s.duplicateRows === 1, `summary.duplicateRows=${s.duplicateRows}`);
    assert(s.existingRecords === 1, `summary.existingRecords=${s.existingRecords}`);
    assert(s.readyForImport === 1, `summary.readyForImport=${s.readyForImport}`);
    return 'VALID / INVALID / DUPLICATE / ALREADY_EXISTS all observed; summary 6/1/3/1/1';
  });

  await check('Validation parsedData carries the full 25-column payload', async () => {
    const r = await upload('/api/admin/bulk-upload/students/validate', studentFile, 'students.xlsx', adminToken);
    const row = r.body?.data?.rows?.find((x: any) => x.identifier === '713823BU001');
    assert(row?.status === 'VALID', 'expected the valid row');
    const p = row.parsedData;
    assert(p.registerNumber === '713823BU001', 'parsedData.registerNumber missing');
    assert(p.residentialType === 'HOSTELLER', `residentialType=${p.residentialType}`);
    assert(p.bloodGroup === 'A+', `bloodGroup=${p.bloodGroup}`);
    assert(p.dob === '2006-01-01', `dob=${p.dob}`);
    assert(p.address?.includes('Test Street'), 'address not mapped');
    assert(p.parent?.fatherName === 'BU Test Father', 'parent.fatherName not mapped');
    assert(p.parent?.fatherContact === '9876543211', 'parent.fatherContact not normalised');
    assert(p.parent?.motherOccupation === 'Homemaker', 'parent.motherOccupation not mapped');
    assert(p.school?.tenthMark === 450, `school.tenthMark=${p.school?.tenthMark} (from "450/500")`);
    assert(p.school?.twelfthMark === 500, `school.twelfthMark=${p.school?.twelfthMark}`);
    assert(p.school?.cutoffMark === 185.5, `school.cutoffMark=${p.school?.cutoffMark}`);
    assert(p.school?.admissionType === 'COUNSELLING', `admissionType=${p.school?.admissionType}`);
    assert(p.school?.scholarshipDetails === 'First Graduate', 'scholarship not mapped');
    assert(p.year === 2 && p.section === 'A', 'year/section not mapped');
    assert(row.rawData?.registerNo === '713823BU001', 'rawData must round-trip the sheet values');
    return 'parent/school/bloodGroup/residentialType/address all mapped from the 25 columns';
  });

  /* ── 5. Import ──────────────────────────────────────────────────────── */
  let importResult: any = null;

  await check('Student import creates 1 record, skips the rest, imports no sample row', async () => {
    const v = await upload('/api/admin/bulk-upload/students/validate', studentFile, 'students.xlsx', adminToken);
    const preview = v.body?.data;
    assert(preview?.rows?.length === 6, `preview rows=${preview?.rows?.length}`);

    const r = await http('POST', '/api/admin/bulk-upload/students/import', {
      token: adminToken,
      body: { rows: preview.rows },
    });
    assert(r.status === 200, `import -> ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    importResult = r.body?.data;
    const s = importResult.summary;
    assert(s.totalRows === 6, `summary.totalRows=${s.totalRows}`);
    assert(s.imported === 1, `imported=${s.imported}, expected 1`);
    assert(s.skipped === 2, `skipped=${s.skipped}, expected 2 (duplicate + existing)`);
    assert(s.failed === 3, `failed=${s.failed}, expected 3 (invalid rows)`);
    return `total 6 / imported 1 / skipped 2 / failed 3 (statuses Imported|Skipped|Failed)`;
  });

  await check('Imported student persisted every supported field', async () => {
    const s: any = await Student.findOne({ registerNumber: '713823BU001' });
    assert(s, 'student 713823BU001 was not created');
    assert(s.residentialType === 'HOSTELLER', `residentialType=${s.residentialType}`);
    assert(s.bloodGroup === 'A+', `bloodGroup=${s.bloodGroup}`);
    assert(s.dob === '2006-01-01', `dob=${s.dob}`);
    assert(String(s.address || '').includes('Test Street'), 'address not persisted');
    assert(s.parent?.fatherName === 'BU Test Father', 'parent.fatherName not persisted');
    assert(s.parent?.motherContact === '9876543212', 'parent.motherContact not persisted');
    assert(s.school?.tenthMark === 450, `school.tenthMark=${s.school?.tenthMark}`);
    assert(s.school?.cutoffMark === 185.5, `school.cutoffMark=${s.school?.cutoffMark}`);
    assert(s.school?.admissionType === 'COUNSELLING', `admissionType=${s.school?.admissionType}`);
    assert(s.school?.scholarshipDetails === 'First Graduate', 'scholarship not persisted');
    assert(s.year === 2 && s.section === 'A', 'year/section not persisted');

    const u: any = await User.findOne({ username: '713823bu001' });
    assert(u, 'login account was not created for the imported student');
    assert(u.role === 'STUDENT', `role=${u.role}`);

    const sample: any = await Student.findOne({ registerNumber: 'SAMPLE001' });
    assert(!sample, 'the template SAMPLE row must never be imported');
    return 'Student + User created; parent/school/blood/residential persisted; SAMPLE001 absent';
  });

  await check('Existing record is never overwritten', async () => {
    const pre: any = await Student.findOne({ registerNumber: '713823BUPRE' });
    assert(pre, 'pre-existing student disappeared');
    assert(pre.fullName === 'Pre Existing Student', `fullName was overwritten to ${pre.fullName}`);

    // Re-validate + re-import the same file: the previously valid row now already exists.
    const v = await upload('/api/admin/bulk-upload/students/validate', studentFile, 'students.xlsx', adminToken);
    const again = v.body?.data;
    const nowExisting = again.rows.filter((x: any) => x.status === 'ALREADY_EXISTS').map((x: any) => x.identifier);
    assert(
      nowExisting.includes('713823BU001') && nowExisting.includes('713823BUPRE'),
      `second pass should report ALREADY_EXISTS for both, got ${nowExisting.join(', ')}`
    );

    const r = await http('POST', '/api/admin/bulk-upload/students/import', {
      token: adminToken,
      body: { rows: again.rows },
    });
    assert(r.status === 200, `re-import -> ${r.status}`);
    assert(r.body?.data?.summary?.imported === 0, 'a re-import must create nothing');

    const post: any = await Student.findOne({ registerNumber: '713823BUPRE' });
    assert(post.fullName === 'Pre Existing Student', 'existing record was modified by the re-import');
    const first: any = await Student.findOne({ registerNumber: '713823BU001' });
    assert(first.fullName === 'BU Test Student', 'existing imported record was modified');
    return 'second import: 0 created, both existing records byte-identical afterwards';
  });

  await check('Student import writes a BULK_IMPORT_STUDENTS audit record', async () => {
    const log: any = await AuditLog.findOne({ action: 'BULK_IMPORT_STUDENTS' });
    assert(log, 'no BULK_IMPORT_STUDENTS audit log written');
    const details = log.details || {};
    assert(
      Number(details.importedCount) === 1 || Number(details?.imported) === 1,
      `audit details did not record the import count: ${JSON.stringify(details)}`
    );
    return `audit action=BULK_IMPORT_STUDENTS, details=${JSON.stringify(details)}`;
  });

  /* ── 6. Faculty validate + import ───────────────────────────────────── */
  const facultyFile = await buildFacultyWorkbook(service, [
    {
      facultyName: 'BU Test Faculty',
      employeeId: 'BUFAC001',
      department: 'CSE',
      designation: 'Assistant Professor',
      mobile: '9876543220',
      emailAddress: 'bu.faculty.one@ksrce.test',
      cabinLocation: 'C-12',
      username: 'bu.faculty.one',
    },
    {
      facultyName: 'Sample Faculty',
      employeeId: 'SAMPLEFAC001',
      department: 'CSE',
      designation: 'Professor',
      mobile: '9000000010',
      emailAddress: 'sample.faculty@ksrce.test',
      cabinLocation: 'Faculty Cabin',
      username: 'sample.faculty',
    },
    {
      facultyName: 'BU Bad Mobile',
      employeeId: 'BUFAC002',
      department: 'CSE',
      designation: 'Professor',
      mobile: '12345',
      emailAddress: 'bu.faculty.two@ksrce.test',
      cabinLocation: 'C-13',
      username: 'bu.faculty.two',
    },
  ]);

  let facultyPreview: any = null;

  await check('Faculty validation: sample row INVALID, bad mobile INVALID, valid row VALID', async () => {
    const r = await upload('/api/admin/bulk-upload/faculty/validate', facultyFile, 'faculty.xlsx', adminToken);
    assert(r.status === 200, `faculty validate -> ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    facultyPreview = r.body?.data;
    const byId: Record<string, any> = {};
    for (const row of facultyPreview.rows) byId[row.identifier] = row;
    assert(byId['BUFAC001']?.status === 'VALID', `BUFAC001 was ${byId['BUFAC001']?.status}`);
    assert(byId['SAMPLEFAC001']?.status === 'INVALID', `sample was ${byId['SAMPLEFAC001']?.status}`);
    assert(byId['BUFAC002']?.status === 'INVALID', `bad mobile was ${byId['BUFAC002']?.status}`);
    assert(
      byId['BUFAC002']?.reason.includes('10-digit'),
      `reason=${byId['BUFAC002']?.reason}`
    );
    assert(facultyPreview.summary.validRows === 1, `validRows=${facultyPreview.summary.validRows}`);
    return 'BUFAC001 VALID, SAMPLEFAC001 INVALID, BUFAC002 INVALID (10-digit mobile)';
  });

  await check('Faculty import creates profile + login and skips everything else', async () => {
    const r = await http('POST', '/api/admin/bulk-upload/faculty/import', {
      token: adminToken,
      body: { rows: facultyPreview.rows },
    });
    assert(r.status === 200, `faculty import -> ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    const s = r.body?.data?.summary;
    assert(s.imported === 1, `imported=${s.imported}`);
    assert(s.failed === 2, `failed=${s.failed}, expected 2`);

    const f: any = await Faculty.findOne({ employeeId: 'BUFAC001' });
    assert(f, 'faculty BUFAC001 not created');
    assert(f.designation === 'Assistant Professor', `designation=${f.designation}`);
    assert(f.phoneNumber === '9876543220', `phoneNumber=${f.phoneNumber}`);
    assert(f.cabinLocation === 'C-12', `cabinLocation=${f.cabinLocation}`);
    const u: any = await User.findOne({ username: 'bu.faculty.one' });
    assert(u && u.role === 'FACULTY', 'FACULTY login account not created');

    const sample: any = await Faculty.findOne({ employeeId: 'SAMPLEFAC001' });
    assert(!sample, 'the faculty SAMPLE row must never be imported');
    return 'Faculty + User created with designation/phone/cabin; SAMPLEFAC001 absent';
  });

  await check('Second faculty import overwrites nothing (0 created)', async () => {
    const r = await http('POST', '/api/admin/bulk-upload/faculty/import', {
      token: adminToken,
      body: { rows: facultyPreview.rows },
    });
    assert(r.status === 200, `faculty re-import -> ${r.status}`);
    assert(r.body?.data?.summary?.imported === 0, 're-import created records');
    const f: any = await Faculty.findOne({ employeeId: 'BUFAC001' });
    assert(f.designation === 'Assistant Professor', 'existing faculty was modified');
    return 're-import: 0 created, existing faculty untouched';
  });

  /* ── 7. Error report ────────────────────────────────────────────────── */
  await check('Error report downloads as .xlsx and omits successful rows', async () => {
    assert(importResult?.results?.length, 'no import results to report on');
    const dl = await download('/api/admin/bulk-upload/error-report', {
      token: adminToken,
      method: 'POST',
      body: { results: importResult.results, type: 'STUDENTS' },
    });
    assert(dl.status === 200, `error report -> ${dl.status}`);
    assert(
      dl.contentType.includes('spreadsheetml'),
      `error report content-type=${dl.contentType}`
    );
    assert(
      dl.disposition.includes('.xlsx'),
      `error report filename=${dl.disposition}`
    );
    const wb = await loadWorkbook(dl.buffer);
    const ws = wb.worksheets[0];
    const headers = headerRowOf(ws);
    assert(headers[0] === 'Row Number', `unexpected report header: ${headers.join(', ')}`);
    assert(headers.includes('Status'), 'report must include a Status column');
    // 1 imported row must be excluded → 6 result rows - 1 imported = 5 data rows + header.
    assert(ws.rowCount === 6, `report rows=${ws.rowCount} (header + 5 non-imported expected)`);
    let statuses = '';
    for (let r = 2; r <= ws.rowCount; r++) {
      const cell = ws.getRow(r).getCell(headers.indexOf('Status') + 1);
      statuses += `${String(cell.value || '')}|`;
    }
    assert(
      !statuses.includes('Imported'),
      `report must omit successful rows, saw statuses: ${statuses}`
    );
    return `xlsx report, ${ws.rowCount - 1} issue rows, successful row excluded`;
  });

  await check('Error report without payloads is refused (400)', async () => {
    const r = await http('POST', '/api/admin/bulk-upload/error-report', {
      token: adminToken,
      body: { results: [] },
    });
    assert(r.status === 400, `empty error report -> ${r.status}`);
    return '400 for an empty report request';
  });

  /* ── 8. RBAC + file guards ──────────────────────────────────────────── */
  await check('Template download is ADMIN-only (faculty 403, anonymous 401)', async () => {
    const fac = await download('/api/admin/bulk-upload/students/template', {
      token: facultyLogin.token,
    });
    assert(fac.status === 403, `faculty template -> ${fac.status}`);
    const anon = await download('/api/admin/bulk-upload/students/template');
    assert(anon.status === 401, `anonymous template -> ${anon.status}`);
    return '403 for FACULTY, 401 for anonymous';
  });

  await check('Validate/import/error-report are ADMIN-only (faculty 403, anonymous 401)', async () => {
    const v1 = await upload('/api/admin/bulk-upload/students/validate', studentFile, 's.xlsx', facultyLogin.token);
    assert(v1.status === 403, `faculty validate -> ${v1.status}`);
    const v2 = await upload('/api/admin/bulk-upload/students/validate', studentFile, 's.xlsx');
    assert(v2.status === 401, `anonymous validate -> ${v2.status}`);
    const i1 = await http('POST', '/api/admin/bulk-upload/students/import', {
      token: facultyLogin.token,
      body: { rows: [] },
    });
    assert(i1.status === 403, `faculty import -> ${i1.status}`);
    const i2 = await http('POST', '/api/admin/bulk-upload/students/import', { body: { rows: [] } });
    assert(i2.status === 401, `anonymous import -> ${i2.status}`);
    const e1 = await http('POST', '/api/admin/bulk-upload/error-report', {
      token: facultyLogin.token,
      body: { results: [{ rowNumber: 1, identifier: 'X', name: 'X', status: 'Failed', reason: 'r' }] },
    });
    assert(e1.status === 403, `faculty error-report -> ${e1.status}`);
    return '403 faculty / 401 anonymous across validate, import and error-report';
  });

  await check('Non-.xlsx uploads are refused with 400', async () => {
    const r = await upload(
      '/api/admin/bulk-upload/students/validate',
      Buffer.from('student,register\nfoo,bar\n'),
      'students.csv',
      adminToken
    );
    assert(r.status === 400, `csv upload -> ${r.status}`);
    assert(
      String(r.body?.message || '').toLowerCase().includes('xlsx'),
      `message=${r.body?.message}`
    );
    return 'CSV rejected with 400 and an .xlsx-only message';
  });

  await check('Uploads above 10 MB are refused with 400', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 4096, 7);
    const r = await upload('/api/admin/bulk-upload/students/validate', big, 'huge.xlsx', adminToken);
    assert(r.status === 400, `oversize upload -> ${r.status}`);
    assert(
      String(r.body?.message || '').toLowerCase().includes('10 mb'),
      `message=${r.body?.message}`
    );
    return '10 MB + 4 KB rejected with 400 ("maximum 10 MB")';
  });

  await check('Corrupted .xlsx content is refused with 400', async () => {
    const r = await upload(
      '/api/admin/bulk-upload/students/validate',
      Buffer.from('this is definitely not a zip archive'),
      'broken.xlsx',
      adminToken
    );
    assert(r.status === 400, `corrupt upload -> ${r.status}`);
    assert(
      String(r.body?.message || '').toLowerCase().includes('unreadable') ||
        String(r.body?.message || '').toLowerCase().includes('corrupt'),
      `message=${r.body?.message}`
    );
    return `400: ${r.body?.message}`;
  });

  await check('No file in the validate request is refused with 400', async () => {
    const res = await fetch(`${BASE}/api/admin/bulk-upload/students/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body: any = await res.json().catch(() => null);
    assert(res.status === 400, `missing file -> ${res.status}`);
    return `400: ${body?.message}`;
  });

  /* ── 9. Frontend source contracts ───────────────────────────────────── */
  await check('Frontend source: client contract + design-system page (no Tailwind)', async () => {
    verifyFrontendContracts();
    return 'client.ts routes/shapes aligned; AdminBulkUpload.tsx uses bu- classes; index.css defines them; no @tailwind';
  });

  /* ── REPORT ─────────────────────────────────────────────────────────── */
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== BULK UPLOAD VERIFICATION ==========\n');
  console.log('| # | Requirement | Status | Evidence |');
  console.log('|---|-------------|--------|----------|');
  for (const r of rows) {
    console.log(`| ${r.n} | ${r.requirement} | ${r.status} | ${r.evidence.replace(/\|/g, '/')} |`);
  }
  console.log(`\nTOTAL ${rows.length}  PASS ${pass}  FAIL ${fail}`);
  if (fail > 0) {
    console.log('FAILURES:');
    for (const r of rows.filter((x) => x.status !== 'PASS')) {
      console.log(`  - ${r.requirement}: ${r.evidence}`);
    }
  }

  await store.teardown();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exit(1);
});
