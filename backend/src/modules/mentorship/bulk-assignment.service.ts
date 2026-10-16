/**
 * BULK MENTEE ASSIGNMENT — PARSING, VALIDATION AND EXECUTION
 * ============================================================================
 *
 * Downloads assignment templates (.xlsx / .csv), parses an uploaded roster,
 * validates every row against the live data store, and executes the resulting
 * assignment/reassignment writes using exactly the same business rules and the
 * same MentorAssignment / Notification / AuditLog records as the existing
 * single-student `assignMentor` / `reassignMentor` flows.
 *
 * Deliberate boundaries:
 *   - Parsing, validation and execution are separate functions; the controller
 *     never trusts a client-supplied status, it always re-validates the raw
 *     `{ registerNumber, employeeId }` pairs on the server.
 *   - Department / role / mentor-eligibility decisions come from stored records,
 *     never from the file.
 *   - A HOD may only affect students AND mentors inside its own department.
 *   - `maxMentees` is NOT enforced anywhere in the existing application, so it
 *     produces a warning at most and never blocks an assignment.
 *
 * TEMPORARY LOCAL FILE STORAGE — all reads/writes go through the JSON-backed
 * model layer; replace with a persistent database before production.
 */
import ExcelJS from 'exceljs';
import {
  Student,
  Faculty,
  MentorAssignment,
  Notification,
  Department,
} from '../../models/index.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { toIdString } from '../../utils/access.util.js';
import { isValidId, toLocalId } from '../../services/localId.js';
import { AuthUser } from '../../middleware/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

/* -------------------------------------------------------------------------
 * Limits & constants
 * ------------------------------------------------------------------------- */

/** Maximum accepted upload size (bytes). Enforced by multer AND here. */
export const BULK_ASSIGN_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Maximum accepted data rows in one file. */
export const BULK_ASSIGN_MAX_ROWS = 1000;

/** KSRCE Navy & Gold theme (matches the existing bulk-upload templates). */
const XL_NAVY = 'FF0B2545';
const XL_GOLD = 'FF997316';
const XL_SLATE = 'FF64748B';
const XL_SAMPLE_FILL = 'FFFFF7E6';

/**
 * Documented illustrative example pairs. A row that reproduces one of these
 * pairs (or uses a `SAMPLE…` identifier) is ALWAYS reported INVALID so the
 * shipped template can never create a fake assignment.
 */
const SAMPLE_PAIRS = new Set(['261T001|EMP1001', '261T002|EMP1002']);

const TEMPLATE_HEADERS = ['Student Register Number', 'Mentor Employee ID'];

const REGISTER_ALIASES = [
  'studentregisternumber',
  'studentregno',
  'registernumber',
  'registerno',
  'studentregister',
  'regno',
  'rollno',
  'register',
  'studentid',
];

const EMPLOYEE_ALIASES = [
  'mentoremployeeid',
  'facultyemployeeid',
  'employeeid',
  'empid',
  'empcode',
  'mentorid',
  'facultyid',
];

/* -------------------------------------------------------------------------
 * Public types
 * ------------------------------------------------------------------------- */

export type BulkAssignStatus =
  | 'VALID'
  | 'WARNING'
  | 'INVALID'
  | 'DUPLICATE'
  | 'ALREADY_ASSIGNED'
  | 'REASSIGNMENT_REQUIRED';

export interface RawAssignmentRow {
  rowNumber: number;
  registerNumber: string;
  employeeId: string;
  /** True for the shipped template examples (never assignable). */
  sample: boolean;
}

export interface BulkAssignPreviewRow {
  rowNumber: number;
  registerNumber: string;
  studentId: string | null;
  studentName: string;
  employeeId: string;
  mentorId: string | null;
  mentorName: string;
  currentMentorId: string | null;
  currentMentorName: string | null;
  proposedMentorName: string;
  status: BulkAssignStatus;
  message: string;
}

export interface BulkAssignSummary {
  totalRows: number;
  validAssignments: number;
  warnings: number;
  invalidRows: number;
  duplicates: number;
  alreadyAssigned: number;
  reassignmentRequired: number;
  readyForAssignment: number;
  affectedMentors: number;
}

export interface BulkAssignValidationResponse {
  summary: BulkAssignSummary;
  rows: BulkAssignPreviewRow[];
}

export type BulkAssignResultStatus = 'ASSIGNED' | 'REASSIGNED' | 'SKIPPED' | 'FAILED';

export interface BulkAssignResultRow {
  rowNumber: number;
  registerNumber: string;
  studentName: string;
  employeeId: string;
  mentorName: string;
  status: BulkAssignResultStatus;
  reason: string;
}

export interface BulkAssignExecuteSummary {
  totalRows: number;
  assigned: number;
  reassigned: number;
  successful: number;
  skipped: number;
  failed: number;
}

export interface BulkAssignExecuteResponse {
  summary: BulkAssignExecuteSummary;
  results: BulkAssignResultRow[];
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */

function normalizeHeader(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeRegister(value: string): string {
  return (value || '').trim().toUpperCase();
}

function normalizeEmployee(value: string): string {
  return (value || '').trim().toUpperCase();
}

function pickColumn(map: Map<string, number>, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const idx = map.get(alias);
    if (idx !== undefined) return idx;
  }
  return undefined;
}

function isSampleAssignmentRow(registerNumber: string, employeeId: string): boolean {
  const reg = normalizeRegister(registerNumber);
  const emp = normalizeEmployee(employeeId);
  if (!reg && !emp) return false;
  if (SAMPLE_PAIRS.has(`${reg}|${emp}`)) return true;
  if (reg.startsWith('SAMPLE') || emp.startsWith('SAMPLE')) return true;
  return false;
}

function getCellString(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const val: any = cell.value;
  if (typeof val === 'object') {
    if ('text' in val && typeof val.text === 'string') return val.text.trim();
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
    if (val instanceof Date) return val.toISOString().split('T')[0];
    return String(val).trim();
  }
  return String(val).trim();
}

/* -------------------------------------------------------------------------
 * 1. Template generation
 * ------------------------------------------------------------------------- */

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_NAVY } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 26;
}

function styleSampleRow(row: ExcelJS.Row): void {
  row.font = { italic: true, color: { argb: XL_SLATE }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_SAMPLE_FILL } };
}

/** The two illustrative example pairs, clearly marked as non-assignable. */
function sampleRows(): Array<{ registerNumber: string; employeeId: string }> {
  return [
    { registerNumber: '261T001', employeeId: 'EMP1001' },
    { registerNumber: '261T002', employeeId: 'EMP1002' },
  ];
}

export async function generateAssignmentTemplateXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSRCE Digital Mentor–Mentee Management System';
  workbook.created = new Date();

  /* ---- Sheet 1: Instructions ------------------------------------------- */
  const info = workbook.addWorksheet('Instructions', { views: [{ showGridLines: false }] });
  info.columns = [{ width: 110 }];
  const lines: Array<{ kind: 'title' | 'heading' | 'text' | 'bullet'; text: string }> = [
    { kind: 'title', text: 'KSRCE — BULK MENTEE ASSIGNMENT TEMPLATE' },
    { kind: 'heading', text: 'PURPOSE' },
    {
      kind: 'text',
      text:
        'Assign or reassign many students to faculty mentors in one upload. Fill the "Assignments" ' +
        'sheet with one student per row, upload it from the Bulk Assign Mentees screen, review the ' +
        'validated preview, then confirm.',
    },
    { kind: 'heading', text: 'COLUMNS (do not rename or reorder)' },
    { kind: 'bullet', text: 'Student Register Number — must match an existing student exactly (e.g. 73152421125).' },
    { kind: 'bullet', text: 'Mentor Employee ID — must match an existing, active faculty mentor exactly (e.g. EMP1001).' },
    { kind: 'heading', text: 'RULES' },
    { kind: 'bullet', text: 'One student per row. Do NOT merge cells or add blank columns.' },
    { kind: 'bullet', text: 'Every row is validated BEFORE anything is written; only valid rows can be assigned.' },
    { kind: 'bullet', text: 'A student who already has an active mentor needs an explicit REASSIGNMENT, which must be authorised on the confirmation step. The previous mentor is preserved in history.' },
    { kind: 'bullet', text: 'Duplicate students in the same file, unknown students, unknown/inactive mentors and out-of-department rows are never assigned.' },
    { kind: 'bullet', text: 'A HOD may only assign students and mentors inside their own department.' },
    { kind: 'bullet', text: `Maximum ${BULK_ASSIGN_MAX_ROWS} rows and ${Math.round(BULK_ASSIGN_MAX_FILE_BYTES / (1024 * 1024))} MB per file.` },
    { kind: 'heading', text: 'SAMPLE ROWS' },
    {
      kind: 'text',
      text:
        'Rows 2 and 3 of the "Assignments" sheet are illustrative examples (261T001/EMP1001 and ' +
        '261T002/EMP1002), shown in italic on a tinted background. They are detected and always ' +
        'reported INVALID — they can never create an assignment. Replace them with real data or ' +
        'delete them before uploading.',
    },
  ];

  let r = 1;
  for (const line of lines) {
    const row = info.getRow(r++);
    const cell = row.getCell(1);
    cell.value = line.kind === 'bullet' ? `     •  ${line.text}` : line.text;
    cell.alignment = { vertical: 'top', wrapText: true };
    if (line.kind === 'title') {
      row.height = 30;
      cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_NAVY } };
      cell.alignment = { vertical: 'middle', indent: 1 };
    } else if (line.kind === 'heading') {
      row.height = 20;
      cell.font = { bold: true, size: 11, color: { argb: XL_GOLD } };
    } else {
      cell.font = { size: 10, color: { argb: 'FF334155' } };
    }
  }

  /* ---- Sheet 2: Assignments -------------------------------------------- */
  const sheet = workbook.addWorksheet('Assignments', { views: [{ showGridLines: false }] });
  sheet.columns = [
    { header: TEMPLATE_HEADERS[0], key: 'registerNumber', width: 30 },
    { header: TEMPLATE_HEADERS[1], key: 'employeeId', width: 24 },
  ];
  styleHeaderRow(sheet.getRow(1));
  for (const sample of sampleRows()) {
    styleSampleRow(sheet.addRow(sample));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generateAssignmentTemplateCsv(): string {
  const header = TEMPLATE_HEADERS.map(csvEscape).join(',');
  const instructionLines = [
    '# KSRCE — BULK MENTEE ASSIGNMENT TEMPLATE (CSV)',
    '# Fill one student per row below the header: Student Register Number, Mentor Employee ID',
    '# Both values must already exist in the system (student register number + faculty employee ID).',
    '# Lines beginning with # are comments and are ignored on upload.',
    '# The two rows directly below the header are ILLUSTRATIVE EXAMPLES ONLY (261T001/EMP1001,',
    '# 261T002/EMP1002). They are always reported INVALID and never create an assignment.',
    '# Replace them with real data or delete them before uploading.',
    '# Maximum 1000 rows and 5 MB per file.',
  ];
  const examples = sampleRows().map((s) => `${csvEscape(s.registerNumber)},${csvEscape(s.employeeId)}`);
  return [...instructionLines, header, ...examples].join('\r\n') + '\r\n';
}

function csvEscape(value: string): string {
  const v = value ?? '';
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/* -------------------------------------------------------------------------
 * 2. Parsing (CSV + XLSX → a common string matrix)
 * ------------------------------------------------------------------------- */

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function pickDataSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const norm = (name: string) => (name || '').trim().toLowerCase();
  const skip = new Set(['instructions', 'reference values', 'reference values sheet']);
  return (
    wb.worksheets.find((ws) => norm(ws.name) === 'assignments') ||
    wb.worksheets.find((ws) => !skip.has(norm(ws.name))) ||
    wb.worksheets[0]
  );
}

async function parseXlsxMatrix(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new Error('Corrupted or unreadable Excel (.xlsx) file.');
  }
  const sheet = pickDataSheet(workbook);
  if (!sheet) return [];

  const matrix: string[][] = [];
  const maxCol = Math.max(1, sheet.columnCount);
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= maxCol; c++) cells.push(getCellString(row.getCell(c)));
    matrix.push(cells);
  }
  return matrix;
}

/**
 * Turn a string matrix into raw `{ registerNumber, employeeId }` rows.
 *
 * The header may sit below comment / title lines, so the first 10 rows are
 * scanned for one containing both required columns. Blank rows and `#` comment
 * lines are skipped. Throws a clear, user-facing Error when the required
 * columns or a usable row set are missing, or when the row limit is exceeded.
 */
export function matrixToRawRows(matrix: string[][]): RawAssignmentRow[] {
  let headerIndex = -1;
  let registerCol = -1;
  let employeeCol = -1;

  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const cells = matrix[i] ?? [];
    const firstNonEmpty = cells.find((c) => (c || '').trim() !== '');
    if (firstNonEmpty && firstNonEmpty.trim().startsWith('#')) continue;

    const map = new Map<string, number>();
    cells.forEach((cell, idx) => {
      const key = normalizeHeader(cell);
      if (key && !map.has(key)) map.set(key, idx);
    });

    const rc = pickColumn(map, REGISTER_ALIASES);
    const ec = pickColumn(map, EMPLOYEE_ALIASES);
    if (rc !== undefined && ec !== undefined) {
      headerIndex = i;
      registerCol = rc;
      employeeCol = ec;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error(
      'The file must contain the columns "Student Register Number" and "Mentor Employee ID".'
    );
  }

  const rows: RawAssignmentRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    const firstNonEmpty = cells.find((c) => (c || '').trim() !== '');
    if (!firstNonEmpty) continue;
    if (firstNonEmpty.trim().startsWith('#')) continue;

    const registerNumber = (cells[registerCol] ?? '').trim();
    const employeeId = (cells[employeeCol] ?? '').trim();
    if (!registerNumber && !employeeId) continue;

    rows.push({
      rowNumber: i + 1,
      registerNumber,
      employeeId,
      sample: isSampleAssignmentRow(registerNumber, employeeId),
    });
  }

  if (rows.length > BULK_ASSIGN_MAX_ROWS) {
    throw new Error(
      `The file contains ${rows.length} data rows, which exceeds the maximum of ${BULK_ASSIGN_MAX_ROWS}.`
    );
  }

  return rows;
}

/** Parse an uploaded .xlsx / .csv buffer into raw assignment rows. */
export async function parseAssignmentFile(buffer: Buffer, originalName: string): Promise<RawAssignmentRow[]> {
  if (buffer.length > BULK_ASSIGN_MAX_FILE_BYTES) {
    throw new Error(
      `File exceeds the maximum ${Math.round(BULK_ASSIGN_MAX_FILE_BYTES / (1024 * 1024))} MB upload ceiling.`
    );
  }
  const name = (originalName || '').toLowerCase();
  if (name.endsWith('.csv')) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    return matrixToRawRows(parseCsvMatrix(text));
  }
  if (name.endsWith('.xlsx')) {
    return matrixToRawRows(await parseXlsxMatrix(buffer));
  }
  throw new Error('Only .xlsx and .csv files are supported.');
}

/** Sanitise raw row objects received on the assign request. */
export function normalizeRawRows(input: any[]): RawAssignmentRow[] {
  if (!Array.isArray(input)) return [];
  const rows: RawAssignmentRow[] = [];
  input.forEach((entry, idx) => {
    const registerNumber = String(entry?.registerNumber ?? entry?.register ?? '').trim();
    const employeeId = String(entry?.employeeId ?? entry?.employee ?? entry?.mentorEmployeeId ?? '').trim();
    if (!registerNumber && !employeeId) return;
    const rowNumber = Number.isFinite(Number(entry?.rowNumber)) ? Number(entry.rowNumber) : idx + 1;
    rows.push({
      rowNumber,
      registerNumber,
      employeeId,
      sample: isSampleAssignmentRow(registerNumber, employeeId),
    });
  });
  if (rows.length > BULK_ASSIGN_MAX_ROWS) {
    throw new Error(`Too many rows: ${rows.length} (maximum ${BULK_ASSIGN_MAX_ROWS}).`);
  }
  return rows;
}

/* -------------------------------------------------------------------------
 * 3. Validation
 * ------------------------------------------------------------------------- */

interface BcryptLikeUser {
  fullName?: string;
  _id?: string;
}

function mentorDisplayName(mentor: any): string {
  const user: BcryptLikeUser = mentor?.user || {};
  return user.fullName || mentor?.employeeId || 'Faculty Mentor';
}

export async function validateAssignmentRows(
  rawRows: RawAssignmentRow[],
  user: AuthUser
): Promise<BulkAssignValidationResponse> {
  const [allStudents, allFaculties, activeAssignments, allDepartments] = await Promise.all([
    Student.find({}),
    Faculty.find({}).populate('user', 'fullName email'),
    MentorAssignment.find({ status: 'ACTIVE' }).populate({
      path: 'mentor',
      populate: { path: 'user', select: 'fullName' },
    }),
    Department.find({}),
  ]);

  const studentByReg = new Map<string, any>();
  for (const s of allStudents as any[]) {
    studentByReg.set(normalizeRegister(s.registerNumber), s);
  }

  const facultyByEmp = new Map<string, any>();
  for (const f of allFaculties as any[]) {
    facultyByEmp.set(normalizeEmployee(f.employeeId), f);
  }

  const activeByStudent = new Map<string, any>();
  const mentorActiveCount = new Map<string, number>();
  for (const a of activeAssignments as any[]) {
    const sid = toIdString(a.student);
    if (sid && !activeByStudent.has(sid)) activeByStudent.set(sid, a);
    const mid = toIdString(a.mentor);
    if (mid) mentorActiveCount.set(mid, (mentorActiveCount.get(mid) || 0) + 1);
  }

  const deptCodeById = new Map<string, string>();
  for (const d of allDepartments as any[]) {
    const id = toIdString(d._id);
    if (id) deptCodeById.set(id, d.code || d.name || '');
  }

  const isHod = user.role === ROLES.HOD;
  const hodDept = user.departmentId ? String(user.departmentId) : null;

  const rows: BulkAssignPreviewRow[] = [];
  const seenRegisters = new Set<string>();
  const affectedMentors = new Set<string>();

  for (const raw of rawRows) {
    const registerNumber = normalizeRegister(raw.registerNumber);
    const employeeId = normalizeEmployee(raw.employeeId);

    const student = registerNumber ? studentByReg.get(registerNumber) : null;
    const mentor = employeeId ? facultyByEmp.get(employeeId) : null;

    const studentName = student?.fullName || '—';
    const mentorName = mentor ? mentorDisplayName(mentor) : '—';
    const proposedMentorName = mentor ? mentorDisplayName(mentor) : employeeId || '—';

    const active = student ? activeByStudent.get(toIdString(student._id) as string) : null;
    const currentMentorName = active ? mentorDisplayName(active.mentor) : null;

    let status: BulkAssignStatus = 'VALID';
    let message = '';
    const issues: string[] = [];
    const warnings: string[] = [];

    if (raw.sample) {
      status = 'INVALID';
      message =
        'This is the template example row (illustrative only). Replace it with real data or delete it.';
    } else {
      if (!registerNumber) issues.push('Student Register Number is required');
      if (!employeeId) issues.push('Mentor Employee ID is required');

      if (registerNumber && !student) {
        issues.push(`No student found with register number "${registerNumber}"`);
      }
      if (employeeId && !mentor) {
        issues.push(`No faculty mentor found with employee ID "${employeeId}"`);
      }
      if (mentor && mentor.isActive === false) {
        issues.push(`Mentor "${employeeId}" is inactive and cannot receive mentees`);
      }

      if (isHod) {
        if (!hodDept) {
          issues.push('Your HOD account has no department scope; contact an administrator.');
        } else {
          if (student && toIdString(student.department) !== hodDept) {
            issues.push(`Student "${registerNumber}" is not in your department`);
          }
          if (mentor && toIdString(mentor.department) !== hodDept) {
            issues.push(`Mentor "${employeeId}" is not in your department`);
          }
        }
      }

      // Cross-department is allowed for ADMIN (matching the existing single
      // flows) but flagged as a caveat.
      if (!isHod && student && mentor && toIdString(student.department) !== toIdString(mentor.department)) {
        const from = deptCodeById.get(toIdString(student.department) || '') || 'student dept';
        const to = deptCodeById.get(toIdString(mentor.department) || '') || 'mentor dept';
        warnings.push(`Cross-department assignment (${from} → ${to})`);
      }

      // Capacity is never enforced in this application: warn only.
      if (mentor) {
        const mid = toIdString(mentor._id) as string;
        const current = mentorActiveCount.get(mid) || 0;
        const max = Number(mentor.maxMentees);
        if (Number.isFinite(max) && max > 0 && current >= max) {
          warnings.push(
            `Mentor ${employeeId} is at capacity (${current}/${max} active mentees)`
          );
        }
      }

      if (issues.length > 0) {
        status = 'INVALID';
        message = issues.join('; ');
      } else if (registerNumber && seenRegisters.has(registerNumber)) {
        status = 'DUPLICATE';
        message = `Duplicate register number "${registerNumber}" in the uploaded file`;
      } else if (active && mentor) {
        if (toIdString(active.mentor) === toIdString(mentor._id)) {
          status = 'ALREADY_ASSIGNED';
          message = `Already assigned to ${currentMentorName || mentorName}. No change needed.`;
        } else {
          status = 'REASSIGNMENT_REQUIRED';
          message =
            `Currently assigned to ${currentMentorName || 'another mentor'}; ` +
            `will be reassigned to ${mentorName}.` +
            (warnings.length ? ` Note: ${warnings.join('; ')}` : '');
        }
      } else if (mentor) {
        if (warnings.length > 0) {
          status = 'WARNING';
          message = warnings.join('; ');
        } else {
          status = 'VALID';
          message = 'Ready to assign.';
        }
      } else {
        status = 'INVALID';
        message = 'Row could not be validated.';
      }
    }

    if (registerNumber) seenRegisters.add(registerNumber);

    if (mentor && (status === 'VALID' || status === 'WARNING' || status === 'REASSIGNMENT_REQUIRED')) {
      const mid = toIdString(mentor._id);
      if (mid) affectedMentors.add(mid);
    }

    rows.push({
      rowNumber: raw.rowNumber,
      registerNumber: registerNumber || '—',
      studentId: student ? toIdString(student._id) : null,
      studentName,
      employeeId: employeeId || '—',
      mentorId: mentor ? toIdString(mentor._id) : null,
      mentorName,
      currentMentorId: active ? toIdString(active.mentor) : null,
      currentMentorName,
      proposedMentorName,
      status,
      message,
    });
  }

  const count = (s: BulkAssignStatus) => rows.filter((r) => r.status === s).length;
  const valid = count('VALID');
  const warnings = count('WARNING');
  const invalid = count('INVALID');
  const duplicates = count('DUPLICATE');
  const alreadyAssigned = count('ALREADY_ASSIGNED');
  const reassignmentRequired = count('REASSIGNMENT_REQUIRED');

  const summary: BulkAssignSummary = {
    totalRows: rows.length,
    validAssignments: valid + warnings,
    warnings,
    invalidRows: invalid + duplicates,
    duplicates,
    alreadyAssigned,
    reassignmentRequired,
    readyForAssignment: valid + warnings + reassignmentRequired,
    affectedMentors: affectedMentors.size,
  };

  return { summary, rows };
}

/* -------------------------------------------------------------------------
 * 4. Execution
 * ------------------------------------------------------------------------- */

interface NotificationPayload {
  user: string | undefined;
  title: string;
  message: string;
  relatedEntityId: string;
}

async function safeNotify(payload: NotificationPayload): Promise<void> {
  if (!payload.user) return;
  try {
    await Notification.create({
      user: payload.user,
      title: payload.title,
      message: payload.message,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: payload.relatedEntityId,
    });
  } catch (err: any) {
    // A failed notification must never fail or roll back the assignment.
    console.error('bulk-assignment notification error:', err?.message || err);
  }
}

function resolveAssignerId(user: AuthUser): string {
  return user.id && isValidId(user.id) ? toLocalId(user.id) : user.id;
}

export interface ExecuteBulkAssignmentParams {
  rows: any[];
  user: AuthUser;
  req: any;
  authorizeReassignments: boolean;
  reason?: string;
}

export async function executeBulkAssignment(
  params: ExecuteBulkAssignmentParams
): Promise<BulkAssignExecuteResponse> {
  const { user, req, authorizeReassignments } = params;
  const reason = (params.reason || '').trim();

  // Re-validate from the raw pairs. Client-supplied statuses are never trusted.
  const rawRows = normalizeRawRows(params.rows);
  const { rows: previewRows } = await validateAssignmentRows(rawRows, user);

  const isHod = user.role === ROLES.HOD;
  const hodDept = user.departmentId ? String(user.departmentId) : null;
  const assignerId = resolveAssignerId(user);
  const changeDate = new Date().toISOString().split('T')[0];

  const results: BulkAssignResultRow[] = [];
  const processedStudents = new Set<string>();
  let assigned = 0;
  let reassigned = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of previewRows) {
    const base = {
      rowNumber: row.rowNumber,
      registerNumber: row.registerNumber,
      studentName: row.studentName,
      employeeId: row.employeeId,
      mentorName: row.mentorName,
    };

    const skip = (reasonText: string) => {
      skipped++;
      results.push({ ...base, status: 'SKIPPED', reason: reasonText });
    };
    const fail = (reasonText: string) => {
      failed++;
      results.push({ ...base, status: 'FAILED', reason: reasonText });
    };

    if (row.status === 'INVALID' || row.status === 'DUPLICATE') {
      skip(`${row.status === 'DUPLICATE' ? 'Duplicate row' : 'Invalid row'}: ${row.message}`);
      continue;
    }
    if (row.status === 'ALREADY_ASSIGNED') {
      skip(row.message);
      continue;
    }
    if (!row.studentId || !row.mentorId) {
      skip('Student or mentor could not be resolved on the server.');
      continue;
    }
    if (processedStudents.has(row.studentId)) {
      skip('Duplicate student in this batch (only the first occurrence is processed).');
      continue;
    }

    const isReassignment = row.status === 'REASSIGNMENT_REQUIRED';
    if (isReassignment) {
      if (!authorizeReassignments) {
        skip('Reassignment requires explicit authorisation on the confirmation step.');
        continue;
      }
      if (!reason) {
        skip('A reason is required for reassignment.');
        continue;
      }
    }

    try {
      const student: any = await Student.findById(row.studentId);
      if (!student) {
        skip('Student record no longer exists.');
        continue;
      }
      const mentor: any = await Faculty.findById(row.mentorId).populate('user');
      if (!mentor || mentor.isActive === false) {
        skip('Faculty mentor not found or inactive.');
        continue;
      }

      if (isHod) {
        if (
          !hodDept ||
          toIdString(student.department) !== hodDept ||
          toIdString(mentor.department) !== hodDept
        ) {
          skip('Student or mentor is not in your department.');
          continue;
        }
      }

      const currentAssignment: any = await MentorAssignment.findOne({
        student: student._id,
        status: 'ACTIVE',
      }).populate({ path: 'mentor', populate: { path: 'user', select: 'fullName' } });

      if (currentAssignment && toIdString(currentAssignment.mentor) === toIdString(mentor._id)) {
        processedStudents.add(row.studentId);
        skip('Student is already actively assigned to this mentor.');
        continue;
      }

      const mentorUser: any = mentor.user || {};
      let created: any;
      let outcome: BulkAssignResultStatus = 'ASSIGNED';

      if (currentAssignment) {
        // Not authorised where a reassignment was expected (status changed server-side).
        if (!authorizeReassignments || !reason) {
          skip('Student already has an active mentor; reassignment was not authorised.');
          continue;
        }

        const previousMentorUser: any = currentAssignment.mentor?.user || {};
        const previousMentorName = mentorDisplayName(currentAssignment.mentor);

        currentAssignment.status = 'COMPLETED';
        currentAssignment.assignedUntil = changeDate;
        await currentAssignment.save();

        try {
          created = await MentorAssignment.create({
            student: student._id,
            mentor: mentor._id,
            department: student.department,
            assignedFrom: changeDate,
            status: 'ACTIVE',
            assignedBy: assignerId,
            changeReason: reason,
          });
        } catch (createErr) {
          // Compensate: restore the previous assignment so history stays consistent.
          currentAssignment.status = 'ACTIVE';
          currentAssignment.assignedUntil = undefined;
          try {
            await currentAssignment.save();
          } catch (revertErr: any) {
            console.error('bulk-assignment revert error:', revertErr?.message || revertErr);
          }
          throw createErr;
        }

        outcome = 'REASSIGNED';

        await safeNotify({
          user: toIdString(student.user) || undefined,
          title: 'Mentor Reassignment Notice',
          message: `Your faculty mentor has been transitioned to ${mentorUser.fullName || 'New Mentor'}. Reason: ${reason}`,
          relatedEntityId: created._id.toString(),
        });
        await safeNotify({
          user: mentorUser._id ? String(mentorUser._id) : undefined,
          title: 'New Mentee Reassigned',
          message: `Student ${student.fullName} (${student.registerNumber}) has been reassigned to you.`,
          relatedEntityId: created._id.toString(),
        });
        if (currentAssignment.mentor?._id) {
          await safeNotify({
            user: String(currentAssignment.mentor._id),
            title: 'Mentee Reassignment Completed',
            message: `Student ${student.fullName} (${student.registerNumber}) has been transferred to ${mentorUser.fullName || 'another mentor'}.`,
            relatedEntityId: created._id.toString(),
          });
        }

        await logAudit({
          userId: user.id,
          action: 'REASSIGN_MENTOR',
          entity: 'MENTOR_ASSIGNMENT',
          entityId: created._id.toString(),
          details: {
            studentId: student._id.toString(),
            registerNumber: student.registerNumber,
            previousMentorId: toIdString(currentAssignment.mentor),
            newMentorId: mentor._id.toString(),
            effectiveDate: changeDate,
            reasonForChange: reason,
            source: 'BULK_ASSIGNMENT',
          },
          req,
        });
      } else {
        created = await MentorAssignment.create({
          student: student._id,
          mentor: mentor._id,
          department: student.department,
          assignedFrom: changeDate,
          status: 'ACTIVE',
          assignedBy: assignerId,
          changeReason: reason || 'Bulk Mentor Allocation',
        });

        await safeNotify({
          user: toIdString(student.user) || undefined,
          title: 'Mentor Assigned',
          message: `You have been assigned to mentor ${mentorUser.fullName || 'Faculty Mentor'}.`,
          relatedEntityId: created._id.toString(),
        });
        await safeNotify({
          user: mentorUser._id ? String(mentorUser._id) : undefined,
          title: 'New Mentee Assigned',
          message: `Student ${student.fullName} (${student.registerNumber}) has been assigned as your mentee.`,
          relatedEntityId: created._id.toString(),
        });

        await logAudit({
          userId: user.id,
          action: 'ASSIGN_MENTOR',
          entity: 'MENTOR_ASSIGNMENT',
          entityId: created._id.toString(),
          details: {
            studentId: student._id.toString(),
            registerNumber: student.registerNumber,
            mentorId: mentor._id.toString(),
            fromDate: changeDate,
            source: 'BULK_ASSIGNMENT',
          },
          req,
        });
      }

      processedStudents.add(row.studentId);
      if (outcome === 'REASSIGNED') reassigned++;
      else assigned++;
      results.push({
        ...base,
        studentName: student.fullName || base.studentName,
        mentorName: mentorDisplayName(mentor),
        status: outcome,
        reason:
          outcome === 'REASSIGNED'
            ? `Reassigned successfully. Reason: ${reason}`
            : 'Assigned successfully.',
      });
    } catch (err: any) {
      console.error('bulk-assignment row error:', err?.message || err);
      fail(err?.message || 'Failed to process this row.');
    }
  }

  const summary: BulkAssignExecuteSummary = {
    totalRows: previewRows.length,
    assigned,
    reassigned,
    successful: assigned + reassigned,
    skipped,
    failed,
  };

  await logAudit({
    userId: user.id,
    action: 'BULK_ASSIGN_MENTORS',
    entity: 'MENTOR_ASSIGNMENT',
    details: {
      totalRows: summary.totalRows,
      assigned: summary.assigned,
      reassigned: summary.reassigned,
      successful: summary.successful,
      skipped: summary.skipped,
      failed: summary.failed,
      authorizeReassignments: !!authorizeReassignments,
      reason: reason || undefined,
    },
    req,
  });

  return { summary, results };
}

/* -------------------------------------------------------------------------
 * 5. Downloadable reports (validation preview + execution results)
 * ------------------------------------------------------------------------- */

const VALIDATION_COLUMNS = [
  'Row',
  'Register Number',
  'Student Name',
  'Employee ID',
  'Mentor Name',
  'Current Mentor',
  'Proposed Mentor',
  'Status',
  'Message',
];

const RESULT_COLUMNS = [
  'Row',
  'Register Number',
  'Student Name',
  'Employee ID',
  'Mentor Name',
  'Result',
  'Reason',
];

function validationRowToArray(row: any): string[] {
  return [
    String(row.rowNumber ?? ''),
    String(row.registerNumber ?? ''),
    String(row.studentName ?? ''),
    String(row.employeeId ?? ''),
    String(row.mentorName ?? ''),
    String(row.currentMentorName ?? ''),
    String(row.proposedMentorName ?? ''),
    String(row.status ?? ''),
    String(row.message ?? ''),
  ];
}

function resultRowToArray(row: any): string[] {
  return [
    String(row.rowNumber ?? ''),
    String(row.registerNumber ?? ''),
    String(row.studentName ?? ''),
    String(row.employeeId ?? ''),
    String(row.mentorName ?? ''),
    String(row.status ?? ''),
    String(row.reason ?? ''),
  ];
}

function buildCsv(columns: string[], dataRows: string[][]): string {
  const lines = [columns.map(csvEscape).join(',')];
  for (const row of dataRows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\r\n') + '\r\n';
}

async function buildXlsx(sheetName: string, columns: string[], dataRows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSRCE Digital Mentor–Mentee Management System';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  sheet.columns = columns.map((header, idx) => ({
    header,
    key: `c${idx}`,
    width: Math.min(42, Math.max(12, header.length + 6)),
  }));
  styleHeaderRow(sheet.getRow(1));
  for (const row of dataRows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface AssignmentReportParams {
  type: 'VALIDATION' | 'RESULT';
  format?: 'CSV' | 'XLSX';
  rows: any[];
}

export async function generateAssignmentReport(
  params: AssignmentReportParams
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const format = (params.format || 'CSV').toUpperCase() === 'XLSX' ? 'XLSX' : 'CSV';
  const isValidation = params.type === 'VALIDATION';
  const rows = Array.isArray(params.rows) ? params.rows : [];
  const columns = isValidation ? VALIDATION_COLUMNS : RESULT_COLUMNS;
  const dataRows = rows.map((row) => (isValidation ? validationRowToArray(row) : resultRowToArray(row)));
  const stamp = new Date().toISOString().split('T')[0];
  const baseName = isValidation
    ? `Bulk_Assignment_Validation_Report_${stamp}`
    : `Bulk_Assignment_Results_${stamp}`;

  if (format === 'XLSX') {
    const buffer = await buildXlsx(isValidation ? 'Validation' : 'Results', columns, dataRows);
    return {
      buffer,
      filename: `${baseName}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  const buffer = Buffer.from(buildCsv(columns, dataRows), 'utf8');
  return {
    buffer,
    filename: `${baseName}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
}
