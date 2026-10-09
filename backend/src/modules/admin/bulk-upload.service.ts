import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import {
  Student,
  Faculty,
  User,
  Department,
  Batch,
  AcademicRecord,
} from '../../models/index.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { toIdString } from '../../utils/access.util.js';
import { isValidId } from '../../services/localId.js';

export type RowStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'ALREADY_EXISTS';

export interface BulkPreviewRow {
  rowNumber: number;
  identifier: string;
  name: string;
  department: string;
  status: RowStatus;
  reason: string;
  rawData?: Record<string, any>;
  parsedData?: any;
}

export interface BulkSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  existingRecords: number;
  readyForImport: number;
}

export interface ValidationResponse {
  summary: BulkSummary;
  rows: BulkPreviewRow[];
}

export interface BulkImportResultRow {
  rowNumber: number;
  identifier: string;
  name: string;
  status: 'Imported' | 'Skipped' | 'Failed';
  reason: string;
}

export interface ImportResponse {
  summary: {
    totalRows: number;
    imported: number;
    skipped: number;
    failed: number;
  };
  results: BulkImportResultRow[];
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/* -------------------------------------------------------------------------
 * 1. Template Generation
 * -------------------------------------------------------------------------
 * Every template is a three-sheet workbook:
 *   1. "Instructions"     — purpose, rules, mandatory fields, sample-row note
 *   2. "<Students|Faculty>" — the exact header row + one clearly marked sample row
 *   3. "Reference Values" — live departments / batches plus controlled lists
 *
 * The header rows are the single source of truth for both the template and the
 * validator below: the validator reads headers by (normalised) name, so the two
 * can never silently drift apart.
 * ------------------------------------------------------------------------- */

/** KSRCE Navy & Gold theme (same values the original templates used). */
const XL_NAVY = 'FF0B2545';
const XL_NAVY_LIGHT = 'FF13315C';
const XL_GOLD = 'FF997316';
const XL_SLATE = 'FF64748B';
const XL_SAMPLE_FILL = 'FFFFF7E6';

/** How many data rows (below the header) receive Excel dropdown validation. */
const TEMPLATE_DROPDOWN_ROWS = 200;

interface TemplateColumn {
  header: string;
  key: string;
  width: number;
}

/** The 25 Student columns, in the exact order of the spec's three sections. */
export const STUDENT_TEMPLATE_COLUMNS: TemplateColumn[] = [
  // Section 1 — Student Basic Information
  { header: 'Student Name', key: 'studentName', width: 24 },
  { header: 'Register No.', key: 'registerNo', width: 16 },
  { header: 'Department', key: 'department', width: 16 },
  { header: 'Academic Batch', key: 'academicBatch', width: 16 },
  { header: 'Year', key: 'year', width: 8 },
  { header: 'Section', key: 'section', width: 9 },
  { header: 'Residential Status', key: 'residentialStatus', width: 18 },
  { header: 'Blood Group', key: 'bloodGroup', width: 12 },
  { header: 'Mobile', key: 'mobile', width: 14 },
  // Section 2 — Personal & Family Information
  { header: 'Date of Birth', key: 'dateOfBirth', width: 15 },
  { header: 'Email Address', key: 'emailAddress', width: 28 },
  { header: "Father's Name", key: 'fatherName', width: 22 },
  { header: 'Father Contact', key: 'fatherContact', width: 15 },
  { header: "Father's Occupation / Job", key: 'fatherJob', width: 24 },
  { header: "Mother's Name", key: 'motherName', width: 22 },
  { header: 'Mother Contact', key: 'motherContact', width: 15 },
  { header: "Mother's Occupation / Job", key: 'motherJob', width: 24 },
  { header: 'Permanent Address', key: 'permanentAddress', width: 30 },
  // Section 3 — Schooling & Admission Particulars
  { header: '10th Mark', key: 'tenthMark', width: 13 },
  { header: '10th School', key: 'tenthSchool', width: 30 },
  { header: '12th Mark', key: 'twelfthMark', width: 13 },
  { header: '12th School', key: 'twelfthSchool', width: 30 },
  { header: 'TNEA Cut-off Mark', key: 'tneaCutoff', width: 16 },
  { header: 'Admission Mode', key: 'admissionMode', width: 16 },
  { header: 'Scholarship Details', key: 'scholarship', width: 24 },
];

/**
 * Faculty columns. The first six are the supported subset of the requested
 * 16-column layout (the Faculty/User models carry no date of birth, gender,
 * blood group, residential status, address, qualification, specialisation,
 * experience, joining date or employment type — see the Instructions sheet,
 * which lists those explicitly instead of collecting and discarding them).
 * Cabin Location and Username pre-date this redesign, are stored by the model
 * and stay supported as optional trailing columns.
 */
export const FACULTY_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { header: 'Faculty Name', key: 'facultyName', width: 26 },
  { header: 'Employee ID', key: 'employeeId', width: 16 },
  { header: 'Department', key: 'department', width: 16 },
  { header: 'Designation', key: 'designation', width: 26 },
  { header: 'Mobile', key: 'mobile', width: 14 },
  { header: 'Email Address', key: 'emailAddress', width: 28 },
  { header: 'Cabin Location', key: 'cabinLocation', width: 22 },
  { header: 'Username', key: 'username', width: 18 },
];

/** Requested Faculty fields the current Faculty/User models cannot store. */
export const FACULTY_UNSUPPORTED_FIELDS = [
  'Date of Birth',
  'Gender',
  'Blood Group',
  'Residential Status',
  'Permanent Address',
  'Qualification',
  'Specialization',
  'Experience',
  'Date of Joining',
  'Employment Type',
];

const REFERENCE_YEARS = ['1', '2', '3', '4'];
const REFERENCE_SECTIONS = ['A', 'B', 'C', 'D'];
const REFERENCE_RESIDENTIAL = ['Day Scholar', 'Hosteller'];
const REFERENCE_BLOOD_GROUPS = ['A+ve', 'A-ve', 'B+ve', 'B-ve', 'O+ve', 'O-ve', 'AB+ve', 'AB-ve'];
const REFERENCE_ADMISSION_MODES = ['Counselling', 'Management', 'Lateral Entry'];
const REFERENCE_DESIGNATIONS = [
  'Assistant Professor',
  'Associate Professor',
  'Professor',
  'Head of Department',
];

function styleHeaderRow(row: ExcelJS.Row, argb: string = XL_NAVY): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 28;
}

/** Mark the sample row so it can never be mistaken for real data. */
function styleSampleRow(row: ExcelJS.Row): void {
  row.font = { italic: true, color: { argb: XL_SLATE }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_SAMPLE_FILL } };
}

type InstructionLine =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'numbered'; text: string }
  | { kind: 'spacer' };

function buildInstructionsSheet(wb: ExcelJS.Workbook, lines: InstructionLine[]): void {
  const ws = wb.addWorksheet('Instructions', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 112 }];

  let r = 1;
  for (const line of lines) {
    const row = ws.getRow(r++);
    if (line.kind === 'spacer') {
      row.height = 8;
      continue;
    }
    const cell = row.getCell(1);
    cell.value = line.text;
    cell.alignment = { vertical: 'top', wrapText: true };
    switch (line.kind) {
      case 'title':
        row.height = 30;
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_NAVY } };
        cell.alignment = { vertical: 'middle', indent: 1 };
        break;
      case 'heading':
        row.height = 20;
        cell.font = { bold: true, size: 11, color: { argb: XL_GOLD } };
        break;
      case 'bullet':
        cell.value = `     •  ${line.text}`;
        cell.font = { size: 10, color: { argb: 'FF334155' } };
        break;
      case 'numbered':
        cell.font = { size: 10, color: { argb: 'FF334155' } };
        break;
      default:
        cell.font = { size: 10, color: { argb: 'FF334155' } };
        break;
    }
  }
}

/** Apply an Excel list dropdown sourced from the Reference Values sheet. */
function applyListValidation(
  sheet: ExcelJS.Worksheet,
  columnKey: string,
  formula: string
): void {
  const column = sheet.getColumn(columnKey);
  const letter = column.letter;
  for (let r = 2; r <= TEMPLATE_DROPDOWN_ROWS + 1; r++) {
    const cell = sheet.getCell(`${letter}${r}`);
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Value not allowed',
      error: 'Please choose one of the values from the Reference Values sheet.',
    };
  }
}

function refRange(colLetter: string, count: number): string {
  return `'Reference Values'!$${colLetter}$2:$${colLetter}$${Math.max(2, count + 1)}`;
}

export async function generateStudentTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSRCE Digital Mentor–Mentee Management System';
  workbook.created = new Date();

  // Live reference values — never hard-coded department/batch lists.
  const [depts, batches] = await Promise.all([Department.find({}), Batch.find({})]);
  const deptCodes = depts.map((d: any) => String(d.code || '')).filter(Boolean);
  const deptNames = depts.map((d: any) => String(d.name || '')).filter(Boolean);
  const batchNames = batches.map((b: any) => String(b.name || '')).filter(Boolean);

  /* ---- Sheet 1: Instructions ------------------------------------------ */
  buildInstructionsSheet(workbook, [
    { kind: 'title', text: 'KSRCE — STUDENT BULK IMPORT TEMPLATE' },
    { kind: 'spacer' },
    { kind: 'heading', text: 'PURPOSE' },
    {
      kind: 'text',
      text:
        'This workbook is the official template for importing student records in bulk into the ' +
        'KSRCE Digital Mentor–Mentee Management System. Download it, fill in one row per student, ' +
        'then upload the completed file from Admin → Bulk Upload.',
    },
    { kind: 'spacer' },
    { kind: 'heading', text: 'HOW TO FILL THIS FILE' },
    { kind: 'numbered', text: '1. Do NOT change, reorder, rename or delete any column header in the "Students" sheet.' },
    { kind: 'numbered', text: '2. Do NOT merge cells anywhere in the "Students" sheet.' },
    { kind: 'numbered', text: '3. Enter exactly one student per row, starting from row 2.' },
    { kind: 'numbered', text: '4. Do not leave the mandatory fields empty (see the list below).' },
    { kind: 'numbered', text: '5. Use only valid Department / Academic Batch / Year / Section values (drop-downs are provided; the live lists are on the "Reference Values" sheet).' },
    { kind: 'numbered', text: '6. Register No. must be unique. Register Nos. that already exist in the system are reported as ALREADY_EXISTS and are never overwritten.' },
    { kind: 'numbered', text: '7. Dates use YYYY-MM-DD (e.g. 2006-01-01). Marks accept a plain number (450) or a scored-out form (450/500).' },
    { kind: 'numbered', text: '8. Save the file as .xlsx before uploading. Maximum upload size is 10 MB.' },
    { kind: 'spacer' },
    { kind: 'heading', text: 'MANDATORY FIELDS' },
    { kind: 'bullet', text: 'Register No., Student Name, Department, Academic Batch.' },
    { kind: 'text', text: 'All other columns are optional, but any value you do supply must be valid — an invalid value marks the whole row INVALID.' },
    { kind: 'spacer' },
    { kind: 'heading', text: 'COLUMN SECTIONS (same order as the header row)' },
    { kind: 'bullet', text: 'Section 1 — Student Basic Information: Student Name, Register No., Department, Academic Batch, Year, Section, Residential Status, Blood Group, Mobile.' },
    { kind: 'bullet', text: 'Section 2 — Personal & Family Information: Date of Birth, Email Address, Father’s Name, Father Contact, Father’s Occupation / Job, Mother’s Name, Mother Contact, Mother’s Occupation / Job, Permanent Address.' },
    { kind: 'bullet', text: 'Section 3 — Schooling & Admission Particulars: 10th Mark, 10th School, 12th Mark, 12th School, TNEA Cut-off Mark, Admission Mode, Scholarship Details.' },
    { kind: 'spacer' },
    { kind: 'heading', text: 'SAMPLE ROW' },
    {
      kind: 'text',
      text:
        'Row 2 of the "Students" sheet is a clearly marked SAMPLE row (Register No. SAMPLE001, shown in ' +
        'italic on a tinted background). It demonstrates the expected format only: any row whose Register No. ' +
        'starts with "SAMPLE" is always reported as INVALID and can never be imported. Replace it with real ' +
        'data or delete it before uploading.',
    },
    { kind: 'spacer' },
    { kind: 'heading', text: 'WHAT HAPPENS ON UPLOAD' },
    { kind: 'bullet', text: 'Every row is validated first and shown as VALID / INVALID / DUPLICATE / ALREADY_EXISTS before anything is written.' },
    { kind: 'bullet', text: 'Only VALID rows are imported. Existing records are NEVER overwritten automatically and are never deleted.' },
    { kind: 'bullet', text: 'Rows duplicated inside the same file are reported as DUPLICATE and skipped.' },
  ]);

  /* ---- Sheet 2: Students ---------------------------------------------- */
  const sheet = workbook.addWorksheet('Students', { views: [{ showGridLines: false }] });
  sheet.columns = STUDENT_TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  styleHeaderRow(sheet.getRow(1));

  const sampleValues: Record<string, string> = {
    studentName: 'Sample Student',
    registerNo: 'SAMPLE001',
    department: deptCodes[0] || 'CSE',
    academicBatch: batchNames[0] || '2023-2027',
    year: '2',
    section: 'A',
    residentialStatus: 'Hosteller',
    bloodGroup: 'A+ve',
    mobile: '9000000000',
    dateOfBirth: '2006-01-01',
    emailAddress: 'sample.student@example.com',
    fatherName: 'Sample Father',
    fatherContact: '9000000001',
    fatherJob: 'Sample Occupation',
    motherName: 'Sample Mother',
    motherContact: '9000000002',
    motherJob: 'Sample Occupation',
    permanentAddress: 'Sample Address',
    tenthMark: '450/500',
    tenthSchool: 'Sample Higher Secondary School',
    twelfthMark: '500/600',
    twelfthSchool: 'Sample Higher Secondary School',
    tneaCutoff: '150',
    admissionMode: 'Management',
    scholarship: 'None',
  };
  const sampleRow = sheet.addRow(sampleValues);
  styleSampleRow(sampleRow);

  // Controlled fields get Excel drop-downs sourced from the Reference Values sheet.
  applyListValidation(sheet, 'department', refRange('A', deptCodes.length));
  applyListValidation(sheet, 'academicBatch', refRange('C', batchNames.length));
  applyListValidation(sheet, 'year', refRange('D', REFERENCE_YEARS.length));
  applyListValidation(sheet, 'section', refRange('E', REFERENCE_SECTIONS.length));
  applyListValidation(sheet, 'residentialStatus', refRange('F', REFERENCE_RESIDENTIAL.length));
  applyListValidation(sheet, 'bloodGroup', refRange('G', REFERENCE_BLOOD_GROUPS.length));
  applyListValidation(sheet, 'admissionMode', refRange('H', REFERENCE_ADMISSION_MODES.length));

  /* ---- Sheet 3: Reference Values --------------------------------------- */
  const refSheet = workbook.addWorksheet('Reference Values', { views: [{ showGridLines: false }] });
  refSheet.columns = [
    { header: 'Department Code', key: 'deptCode', width: 20 },
    { header: 'Department Name', key: 'deptName', width: 46 },
    { header: 'Academic Batch', key: 'batch', width: 18 },
    { header: 'Year', key: 'year', width: 8 },
    { header: 'Section', key: 'section', width: 10 },
    { header: 'Residential Status', key: 'residential', width: 18 },
    { header: 'Blood Group', key: 'bloodGroup', width: 13 },
    { header: 'Admission Mode', key: 'admissionMode', width: 16 },
  ];
  styleHeaderRow(refSheet.getRow(1), XL_NAVY_LIGHT);

  const refRows = Math.max(
    deptCodes.length,
    batchNames.length,
    REFERENCE_YEARS.length,
    REFERENCE_SECTIONS.length,
    REFERENCE_RESIDENTIAL.length,
    REFERENCE_BLOOD_GROUPS.length,
    REFERENCE_ADMISSION_MODES.length
  );
  for (let i = 0; i < refRows; i++) {
    refSheet.addRow({
      deptCode: deptCodes[i] || '',
      deptName: deptNames[i] || '',
      batch: batchNames[i] || '',
      year: REFERENCE_YEARS[i] || '',
      section: REFERENCE_SECTIONS[i] || '',
      residential: REFERENCE_RESIDENTIAL[i] || '',
      bloodGroup: REFERENCE_BLOOD_GROUPS[i] || '',
      admissionMode: REFERENCE_ADMISSION_MODES[i] || '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateFacultyTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSRCE Digital Mentor–Mentee Management System';
  workbook.created = new Date();

  const depts = await Department.find({});
  const deptCodes = depts.map((d: any) => String(d.code || '')).filter(Boolean);
  const deptNames = depts.map((d: any) => String(d.name || '')).filter(Boolean);

  /* ---- Sheet 1: Instructions ------------------------------------------ */
  buildInstructionsSheet(workbook, [
    { kind: 'title', text: 'KSRCE — FACULTY / MENTOR BULK IMPORT TEMPLATE' },
    { kind: 'spacer' },
    { kind: 'heading', text: 'PURPOSE' },
    {
      kind: 'text',
      text:
        'This workbook is the official template for importing faculty (mentor) records in bulk into the ' +
        'KSRCE Digital Mentor–Mentee Management System. Download it, fill in one row per faculty member, ' +
        'then upload the completed file from Admin → Bulk Upload.',
    },
    { kind: 'spacer' },
    { kind: 'heading', text: 'HOW TO FILL THIS FILE' },
    { kind: 'numbered', text: '1. Do NOT change, reorder, rename or delete any column header in the "Faculty" sheet.' },
    { kind: 'numbered', text: '2. Do NOT merge cells anywhere in the "Faculty" sheet.' },
    { kind: 'numbered', text: '3. Enter exactly one faculty member per row, starting from row 2.' },
    { kind: 'numbered', text: '4. Employee ID must be unique. Employee IDs that already exist are reported as ALREADY_EXISTS and are never overwritten.' },
    { kind: 'numbered', text: '5. Department and Email Address are required; use a valid Department from the drop-down / "Reference Values" sheet.' },
    { kind: 'numbered', text: '6. Email Address must be unique — it becomes the login e-mail of the new account.' },
    { kind: 'numbered', text: '7. Cabin Location and Username are optional. When Username is blank it is derived from the e-mail address.' },
    { kind: 'numbered', text: '8. Save the file as .xlsx before uploading. Maximum upload size is 10 MB.' },
    { kind: 'spacer' },
    { kind: 'heading', text: 'SAMPLE ROW' },
    {
      kind: 'text',
      text:
        'Row 2 of the "Faculty" sheet is a clearly marked SAMPLE row (Employee ID SAMPLEFAC001, italic on a ' +
        'tinted background). Any row whose Employee ID starts with "SAMPLE" is always reported as INVALID and ' +
        'can never be imported. Replace it with real data or delete it before uploading.',
    },
    { kind: 'spacer' },
    { kind: 'heading', text: 'FIELDS NOT YET SUPPORTED BY THE FACULTY PROFILE' },
    {
      kind: 'text',
      text:
        'The following fields were requested for the faculty template but the current Faculty / User models do ' +
        'not store them, so they are deliberately NOT collected here (data that cannot be stored must not be ' +
        'gathered and silently discarded):',
    },
    ...FACULTY_UNSUPPORTED_FIELDS.map(
      (f): InstructionLine => ({ kind: 'bullet', text: f })
    ),
    {
      kind: 'text',
      text:
        'If these become required, add them to the Faculty/User models and the faculty profile screens first, ' +
        'then extend this template and the bulk validator together.',
    },
    { kind: 'spacer' },
    { kind: 'heading', text: 'WHAT HAPPENS ON UPLOAD' },
    { kind: 'bullet', text: 'Every row is validated first and shown as VALID / INVALID / DUPLICATE / ALREADY_EXISTS before anything is written.' },
    { kind: 'bullet', text: 'Only VALID rows are imported. Existing faculty records and user accounts are NEVER overwritten automatically.' },
  ]);

  /* ---- Sheet 2: Faculty ------------------------------------------------ */
  const sheet = workbook.addWorksheet('Faculty', { views: [{ showGridLines: false }] });
  sheet.columns = FACULTY_TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  styleHeaderRow(sheet.getRow(1));

  const sampleRow = sheet.addRow({
    facultyName: 'Sample Faculty',
    employeeId: 'SAMPLEFAC001',
    department: deptCodes[0] || 'CSE',
    designation: REFERENCE_DESIGNATIONS[1],
    mobile: '9000000010',
    emailAddress: 'sample.faculty@example.com',
    cabinLocation: 'Faculty Cabin',
    username: 'sample.faculty',
  });
  styleSampleRow(sampleRow);

  applyListValidation(sheet, 'department', refRange('A', deptCodes.length));

  /* ---- Sheet 3: Reference Values --------------------------------------- */
  const refSheet = workbook.addWorksheet('Reference Values', { views: [{ showGridLines: false }] });
  refSheet.columns = [
    { header: 'Department Code', key: 'deptCode', width: 20 },
    { header: 'Department Name', key: 'deptName', width: 46 },
    { header: 'Designation', key: 'designation', width: 28 },
    { header: 'Notes', key: 'notes', width: 60 },
  ];
  styleHeaderRow(refSheet.getRow(1), XL_NAVY_LIGHT);

  const refRows = Math.max(deptCodes.length, REFERENCE_DESIGNATIONS.length);
  for (let i = 0; i < refRows; i++) {
    refSheet.addRow({
      deptCode: deptCodes[i] || '',
      deptName: deptNames[i] || '',
      designation: REFERENCE_DESIGNATIONS[i] || '',
      notes:
        i === 0
          ? 'Designation is free text in the system; the listed values are the ones in common use.'
          : '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* -------------------------------------------------------------------------
 * Helper: Normalized Cell Value Reader
 * ------------------------------------------------------------------------- */

function getCellValue(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const val = cell.value;
  if (typeof val === 'object') {
    if ('text' in val && typeof (val as any).text === 'string') {
      return (val as any).text.trim();
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    return String(val).trim();
  }
  return String(val).trim();
}

function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* -------------------------------------------------------------------------
 * 1b. Cell value parsers (shared by both validators)
 * ------------------------------------------------------------------------- */

/** Pick the first alias that exists in the (normalised) header map. */
function pickCol(map: Map<string, number>, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const idx = map.get(alias);
    if (idx !== undefined) return idx;
  }
  return undefined;
}

/**
 * The template workbooks open with an "Instructions" sheet, so sheet 0 is not
 * necessarily the data sheet. Prefer the expected sheet name, then the first
 * non-instructions/reference sheet, then sheet 0 (legacy single-sheet files).
 */
function pickDataSheet(wb: ExcelJS.Workbook, preferredName: string): ExcelJS.Worksheet | undefined {
  const norm = (name: string) => (name || '').trim().toLowerCase();
  const skip = new Set(['instructions', 'reference values', 'reference values sheet']);
  return (
    wb.worksheets.find((ws) => norm(ws.name) === norm(preferredName)) ||
    wb.worksheets.find((ws) => !skip.has(norm(ws.name))) ||
    wb.worksheets[0]
  );
}

/** "Day Scholar" / "DAY_SCHOLAR" / "Hosteller" → model enum, or null. */
function parseResidentialStatus(raw: string): 'DAY_SCHOLAR' | 'HOSTELLER' | null {
  const v = normalizeKey(raw);
  if (!v) return null;
  if (v === 'dayscholar' || v === 'day' || v === 'ds') return 'DAY_SCHOLAR';
  if (v === 'hosteller' || v === 'hostel' || v === 'hosteler' || v === 'h') return 'HOSTELLER';
  return null;
}

/** "A+ve" / "A+" / "ab-negative" → model value, or null. */
function parseBloodGroup(raw: string): string | null {
  const v = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/POS(ITIVE)?/g, '+')
    .replace(/NEG(ATIVE)?/g, '-')
    .replace(/VE$/, ''); // "A+ve" / "AB-ve" → "A+" / "AB-"
  if (!v) return null;
  return ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(v) ? v : null;
}

/** "Counselling" / "Management" / "Lateral Entry" → model enum, or null. */
function parseAdmissionMode(raw: string): 'COUNSELLING' | 'MANAGEMENT' | 'LATERAL_ENTRY' | null {
  const v = normalizeKey(raw);
  if (!v) return null;
  if (v.includes('lateral')) return 'LATERAL_ENTRY';
  if (v.includes('management') || v === 'mq' || v === 'mgmt') return 'MANAGEMENT';
  if (v.includes('counselling') || v.includes('counseling') || v === 'tnea' || v === 'ea') {
    return 'COUNSELLING';
  }
  return null;
}

/**
 * "450" | "450/500" | "90%" → { value, of }. `of` is null when no total given.
 * Returns { value: null } when the text is not a number.
 */
function parseMarkValue(raw: string): { value: number | null; of: number | null } {
  const v = (raw || '').trim();
  if (!v) return { value: null, of: null };
  const slash = v.match(/^(\d+(?:\.\d+)?)\s*(?:\/|of)\s*(\d+(?:\.\d+)?)$/i);
  if (slash) return { value: Number(slash[1]), of: Number(slash[2]) };
  const n = Number(v.replace(/%$/, ''));
  return { value: Number.isFinite(n) ? n : null, of: null };
}

/** Indian mobile: 10 digits (optionally +91 / 0 prefixed) → digits, else null. */
function parseContactNumber(raw: string): string | null {
  let v = (raw || '').trim().replace(/[\s\-().]/g, '');
  if (!v) return null;
  v = v.replace(/^\+?91/, '').replace(/^0/, '');
  return /^\d{10}$/.test(v) ? v : null;
}

/** Date cell / "YYYY-MM-DD" / "DD/MM/YYYY" → ISO yyyy-mm-dd, else null. */
function parseIsoDate(raw: string): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Template sample rows (identifier starting with "SAMPLE") are demonstrations
 * only and must NEVER be importable — they are always INVALID.
 */
function isSampleIdentifier(...values: string[]): boolean {
  return values.some((v) => (v || '').trim().toUpperCase().startsWith('SAMPLE'));
}

/* -------------------------------------------------------------------------
 * 2. Validate Student Excel
 * ------------------------------------------------------------------------- */

export async function validateStudentExcel(buffer: Buffer): Promise<ValidationResponse> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch (err: any) {
    throw new Error('Corrupted or unreadable Excel (.xlsx) file.');
  }

  // The student template opens with an "Instructions" sheet — never assume sheet 0.
  const sheet = pickDataSheet(workbook, 'Students');
  if (!sheet || sheet.rowCount < 2) {
    return {
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        existingRecords: 0,
        readyForImport: 0,
      },
      rows: [],
    };
  }

  // Pre-load reference maps for performance
  const [allDepts, allBatches, existingStudents, existingUsers] = await Promise.all([
    Department.find({}),
    Batch.find({}),
    Student.find({}).select('registerNumber'),
    User.find({}).select('username email'),
  ]);

  const deptMap = new Map<string, any>();
  for (const d of allDepts) {
    deptMap.set(String(d.code || '').toUpperCase(), d);
    deptMap.set(String(d.name || '').toLowerCase(), d);
    deptMap.set(toIdString(d._id) || '', d);
  }

  const batchMap = new Map<string, any>();
  for (const b of allBatches) {
    batchMap.set(String(b.name || '').toLowerCase(), b);
    batchMap.set(toIdString(b._id) || '', b);
  }

  const existingRegSet = new Set<string>(
    existingStudents.map((s: any) => String(s.registerNumber || '').toUpperCase().trim()).filter(Boolean)
  );
  const existingUsernames = new Set<string>(
    existingUsers.map((u: any) => String(u.username || '').toLowerCase().trim()).filter(Boolean)
  );

  // Parse header row
  const headerRow = sheet.getRow(1);
  const colIndexMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const raw = getCellValue(cell);
    if (raw) {
      colIndexMap.set(normalizeKey(raw), colNumber);
    }
  });

  /* Column lookup — the 25-column template headers (normalised) first, then
   * legacy aliases so files made with the older templates still parse. */
  const regCol =
    pickCol(colIndexMap, ['registerno', 'registernumber', 'regno', 'register']) ?? 1;
  const nameCol =
    pickCol(colIndexMap, ['studentname', 'fullname', 'name']) ?? 2;
  const deptCol =
    pickCol(colIndexMap, ['department', 'dept', 'deptcode']) ?? 3;
  const batchCol =
    pickCol(colIndexMap, ['academicbatch', 'batch', 'batchname']) ?? 4;
  const emailCol = pickCol(colIndexMap, ['emailaddress', 'email', 'studentemail']);
  const mobileCol = pickCol(colIndexMap, ['mobile', 'mobilenumber', 'phone', 'contactnumber']);
  const yearCol = pickCol(colIndexMap, ['year', 'yearofstudy']);
  const secCol = pickCol(colIndexMap, ['section', 'sec']);
  const dobCol = pickCol(colIndexMap, ['dateofbirth', 'dob']);
  const residentialCol = pickCol(colIndexMap, ['residentialstatus', 'residentialtype', 'residential']);
  const bloodCol = pickCol(colIndexMap, ['bloodgroup', 'blood']);
  const fatherNameCol = pickCol(colIndexMap, ['fathersname', 'fathername']);
  const fatherContactCol = pickCol(colIndexMap, ['fathercontact', 'fatherphone', 'fathermobile']);
  const fatherJobCol = pickCol(colIndexMap, ['fathersoccupationjob', 'fatheroccupation', 'fathersjob']);
  const motherNameCol = pickCol(colIndexMap, ['mothersname', 'mothername']);
  const motherContactCol = pickCol(colIndexMap, ['mothercontact', 'motherphone', 'mothermobile']);
  const motherJobCol = pickCol(colIndexMap, ['mothersoccupationjob', 'motheroccupation', 'mothersjob']);
  const addressCol = pickCol(colIndexMap, ['permanentaddress', 'address', 'permanentplace']);
  const tenthMarkCol = pickCol(colIndexMap, ['10thmark', 'tenthmark', 'sslcmark']);
  const tenthSchoolCol = pickCol(colIndexMap, ['10thschool', 'tenthschool']);
  const twelfthMarkCol = pickCol(colIndexMap, ['12thmark', 'twelfthmark', 'hscmark', 'plustwomark']);
  const twelfthSchoolCol = pickCol(colIndexMap, ['12thschool', 'twelfthschool', 'plustwoschool']);
  const cutoffCol = pickCol(colIndexMap, ['tneacutoffmark', 'tneacutoff', 'cutoffmark', 'cutoff']);
  const admissionCol = pickCol(colIndexMap, ['admissionmode', 'admissiontype']);
  const scholarshipCol = pickCol(colIndexMap, ['scholarshipdetails', 'scholarship']);

  const rows: BulkPreviewRow[] = [];
  const seenInFile = new Set<string>();

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const regVal = getCellValue(row.getCell(regCol)).toUpperCase();
    const nameVal = getCellValue(row.getCell(nameCol));
    const deptVal = getCellValue(row.getCell(deptCol));
    const batchVal = getCellValue(row.getCell(batchCol));
    const emailVal = emailCol ? getCellValue(row.getCell(emailCol)) : '';
    const mobileVal = mobileCol ? getCellValue(row.getCell(mobileCol)) : '';
    const yearVal = yearCol ? getCellValue(row.getCell(yearCol)) : '';
    const secVal = secCol ? getCellValue(row.getCell(secCol)) : 'A';
    const dobVal = dobCol ? getCellValue(row.getCell(dobCol)) : '';
    const residentialVal = residentialCol ? getCellValue(row.getCell(residentialCol)) : '';
    const bloodVal = bloodCol ? getCellValue(row.getCell(bloodCol)) : '';
    const fatherNameVal = fatherNameCol ? getCellValue(row.getCell(fatherNameCol)) : '';
    const fatherContactVal = fatherContactCol ? getCellValue(row.getCell(fatherContactCol)) : '';
    const fatherJobVal = fatherJobCol ? getCellValue(row.getCell(fatherJobCol)) : '';
    const motherNameVal = motherNameCol ? getCellValue(row.getCell(motherNameCol)) : '';
    const motherContactVal = motherContactCol ? getCellValue(row.getCell(motherContactCol)) : '';
    const motherJobVal = motherJobCol ? getCellValue(row.getCell(motherJobCol)) : '';
    const addressVal = addressCol ? getCellValue(row.getCell(addressCol)) : '';
    const tenthMarkVal = tenthMarkCol ? getCellValue(row.getCell(tenthMarkCol)) : '';
    const tenthSchoolVal = tenthSchoolCol ? getCellValue(row.getCell(tenthSchoolCol)) : '';
    const twelfthMarkVal = twelfthMarkCol ? getCellValue(row.getCell(twelfthMarkCol)) : '';
    const twelfthSchoolVal = twelfthSchoolCol ? getCellValue(row.getCell(twelfthSchoolCol)) : '';
    const cutoffVal = cutoffCol ? getCellValue(row.getCell(cutoffCol)) : '';
    const admissionVal = admissionCol ? getCellValue(row.getCell(admissionCol)) : '';
    const scholarshipVal = scholarshipCol ? getCellValue(row.getCell(scholarshipCol)) : '';

    // If whole row is empty, skip
    if (!regVal && !nameVal && !deptVal && !batchVal) {
      continue;
    }

    const issues: string[] = [];

    // Sample rows from the template must never become real records.
    if (isSampleIdentifier(regVal)) {
      issues.push(
        'This is the template SAMPLE row — replace it with real data (sample rows are never imported)'
      );
    }

    if (!regVal) issues.push('Register Number is required');
    if (!nameVal) issues.push('Student Name is required');
    if (!deptVal) issues.push('Department is required');
    if (!batchVal) issues.push('Academic Batch is required');

    // Department match
    const resolvedDept = deptMap.get(deptVal.toUpperCase()) || deptMap.get(deptVal.toLowerCase());
    if (deptVal && !resolvedDept) {
      issues.push(`Unknown department: "${deptVal}"`);
    }

    // Batch match
    const resolvedBatch = batchMap.get(batchVal.toLowerCase());
    if (batchVal && !resolvedBatch) {
      issues.push(`Unknown batch: "${batchVal}"`);
    }

    // Email validation if supplied
    if (emailVal && !EMAIL_RE.test(emailVal)) {
      issues.push(`Invalid email format: "${emailVal}"`);
    }

    // Mobile validation if supplied
    const mobileNumber = parseContactNumber(mobileVal);
    if (mobileVal && !mobileNumber) {
      issues.push(`Mobile must be a 10-digit number (got "${mobileVal}")`);
    }

    // Year / Section
    let effectiveYear = 1;
    if (yearVal) {
      const y = Number(yearVal);
      if (!Number.isInteger(y) || y < 1 || y > 4) {
        issues.push(`Year must be 1, 2, 3 or 4 (got "${yearVal}")`);
      } else {
        effectiveYear = y;
      }
    }

    // Residential status / Blood group / Admission mode (controlled lists)
    const residentialType = parseResidentialStatus(residentialVal);
    if (residentialVal && !residentialType) {
      issues.push(`Residential Status must be "Day Scholar" or "Hosteller" (got "${residentialVal}")`);
    }

    const bloodGroup = parseBloodGroup(bloodVal);
    if (bloodVal && !bloodGroup) {
      issues.push(`Unknown Blood Group: "${bloodVal}"`);
    }

    const admissionType = parseAdmissionMode(admissionVal);
    if (admissionVal && !admissionType) {
      issues.push(
        `Admission Mode must be "Counselling", "Management" or "Lateral Entry" (got "${admissionVal}")`
      );
    }

    // Date of birth
    const dobIso = parseIsoDate(dobVal);
    if (dobVal && !dobIso) {
      issues.push(`Invalid Date of Birth: "${dobVal}" (use YYYY-MM-DD)`);
    }

    // Parent contact numbers
    const fatherContact = parseContactNumber(fatherContactVal);
    if (fatherContactVal && !fatherContact) {
      issues.push(`Father Contact must be a 10-digit number (got "${fatherContactVal}")`);
    }
    const motherContact = parseContactNumber(motherContactVal);
    if (motherContactVal && !motherContact) {
      issues.push(`Mother Contact must be a 10-digit number (got "${motherContactVal}")`);
    }

    // Marks — accept "450" or "450/500"
    const tenthMark = parseMarkValue(tenthMarkVal);
    if (tenthMarkVal && tenthMark.value === null) {
      issues.push(`Invalid 10th Mark: "${tenthMarkVal}" (use 450 or 450/500)`);
    }
    const twelfthMark = parseMarkValue(twelfthMarkVal);
    if (twelfthMarkVal && twelfthMark.value === null) {
      issues.push(`Invalid 12th Mark: "${twelfthMarkVal}" (use 450 or 450/500)`);
    }
    const cutoffMark = parseMarkValue(cutoffVal);
    if (cutoffVal && cutoffMark.value === null) {
      issues.push(`Invalid TNEA Cut-off Mark: "${cutoffVal}"`);
    }

    // Determine status & reason
    let status: RowStatus = 'VALID';
    let reason = 'Ready for import';

    if (issues.length > 0) {
      status = 'INVALID';
      reason = issues.join(', ');
    } else if (regVal && seenInFile.has(regVal)) {
      status = 'DUPLICATE';
      reason = `Duplicate Register No (${regVal}) in uploaded file`;
    } else if (regVal && (existingRegSet.has(regVal) || existingUsernames.has(regVal.toLowerCase()))) {
      status = 'ALREADY_EXISTS';
      reason = `Student with Register No ${regVal} already exists in system`;
    }

    if (regVal) {
      seenInFile.add(regVal);
    }

    const effectiveEmail = emailVal || (regVal ? `${regVal.toLowerCase()}@ksrce.ac.in` : '');

    rows.push({
      rowNumber: r,
      identifier: regVal || '—',
      name: nameVal || '—',
      department: resolvedDept ? `${resolvedDept.name} (${resolvedDept.code})` : deptVal || '—',
      status,
      reason,
      rawData: {
        studentName: nameVal,
        registerNo: regVal,
        department: deptVal,
        academicBatch: batchVal,
        year: yearVal,
        section: secVal,
        residentialStatus: residentialVal,
        bloodGroup: bloodVal,
        mobile: mobileVal,
        dateOfBirth: dobVal,
        emailAddress: emailVal,
        fatherName: fatherNameVal,
        fatherContact: fatherContactVal,
        fatherJob: fatherJobVal,
        motherName: motherNameVal,
        motherContact: motherContactVal,
        motherJob: motherJobVal,
        permanentAddress: addressVal,
        tenthMark: tenthMarkVal,
        tenthSchool: tenthSchoolVal,
        twelfthMark: twelfthMarkVal,
        twelfthSchool: twelfthSchoolVal,
        tneaCutoff: cutoffVal,
        admissionMode: admissionVal,
        scholarship: scholarshipVal,
      },
      parsedData:
        status === 'VALID'
          ? {
              registerNumber: regVal,
              fullName: nameVal.trim(),
              departmentId: toIdString(resolvedDept._id),
              batchId: toIdString(resolvedBatch._id),
              email: effectiveEmail.toLowerCase().trim(),
              mobileNumber: mobileNumber || '',
              year: effectiveYear,
              section: secVal.trim() || 'A',
              dob: dobIso || '',
              residentialType: residentialType || 'DAY_SCHOLAR',
              bloodGroup: bloodGroup || '',
              address: addressVal.trim(),
              parent: {
                fatherName: fatherNameVal.trim(),
                fatherContact: fatherContact || '',
                fatherOccupation: fatherJobVal.trim(),
                motherName: motherNameVal.trim(),
                motherContact: motherContact || '',
                motherOccupation: motherJobVal.trim(),
              },
              school: {
                tenthMark: tenthMark.value ?? 0,
                tenthSchool: tenthSchoolVal.trim(),
                twelfthMark: twelfthMark.value ?? 0,
                twelfthSchool: twelfthSchoolVal.trim(),
                cutoffMark: cutoffMark.value ?? 0,
                admissionType: admissionType || 'COUNSELLING',
                scholarshipDetails: scholarshipVal.trim() || 'Nil',
              },
            }
          : undefined,
    });
  }

  const validRows = rows.filter((r) => r.status === 'VALID').length;
  const invalidRows = rows.filter((r) => r.status === 'INVALID').length;
  const duplicateRows = rows.filter((r) => r.status === 'DUPLICATE').length;
  const existingRecords = rows.filter((r) => r.status === 'ALREADY_EXISTS').length;

  return {
    summary: {
      totalRows: rows.length,
      validRows,
      invalidRows,
      duplicateRows,
      existingRecords,
      readyForImport: validRows,
    },
    rows,
  };
}

/* -------------------------------------------------------------------------
 * 3. Validate Faculty Excel
 * ------------------------------------------------------------------------- */

export async function validateFacultyExcel(buffer: Buffer): Promise<ValidationResponse> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch (err: any) {
    throw new Error('Corrupted or unreadable Excel (.xlsx) file.');
  }

  // The faculty template opens with an "Instructions" sheet — never assume sheet 0.
  const sheet = pickDataSheet(workbook, 'Faculty');
  if (!sheet || sheet.rowCount < 2) {
    return {
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        existingRecords: 0,
        readyForImport: 0,
      },
      rows: [],
    };
  }

  const [allDepts, existingFaculties, existingUsers] = await Promise.all([
    Department.find({}),
    Faculty.find({}).select('employeeId'),
    User.find({}).select('username email'),
  ]);

  const deptMap = new Map<string, any>();
  for (const d of allDepts) {
    deptMap.set(String(d.code || '').toUpperCase(), d);
    deptMap.set(String(d.name || '').toLowerCase(), d);
    deptMap.set(toIdString(d._id) || '', d);
  }

  const existingEmpSet = new Set<string>(
    existingFaculties.map((f: any) => String(f.employeeId || '').toUpperCase().trim()).filter(Boolean)
  );
  const existingEmailSet = new Set<string>(
    existingUsers.map((u: any) => String(u.email || '').toLowerCase().trim()).filter(Boolean)
  );
  const existingUsernameSet = new Set<string>(
    existingUsers.map((u: any) => String(u.username || '').toLowerCase().trim()).filter(Boolean)
  );

  const headerRow = sheet.getRow(1);
  const colIndexMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const raw = getCellValue(cell);
    if (raw) colIndexMap.set(normalizeKey(raw), colNumber);
  });

  /* Column lookup — the template headers (normalised) first, then legacy aliases. */
  const empCol = pickCol(colIndexMap, ['employeeid', 'empid', 'facultyid']) ?? 1;
  const nameCol = pickCol(colIndexMap, ['facultyname', 'fullname', 'name']) ?? 2;
  const deptCol = pickCol(colIndexMap, ['department', 'dept', 'deptcode']) ?? 4;
  const emailCol = pickCol(colIndexMap, ['emailaddress', 'email', 'facultyemail']) ?? 3;
  const desigCol = pickCol(colIndexMap, ['designation', 'role']) ?? 5;
  const phoneCol = pickCol(colIndexMap, ['mobile', 'phonenumber', 'phone', 'contactnumber']);
  const cabinCol = pickCol(colIndexMap, ['cabinlocation', 'cabin']);
  const userCol = pickCol(colIndexMap, ['username']);

  const rows: BulkPreviewRow[] = [];
  const seenEmpInFile = new Set<string>();
  const seenEmailInFile = new Set<string>();

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const empVal = getCellValue(row.getCell(empCol)).toUpperCase();
    const nameVal = getCellValue(row.getCell(nameCol));
    const emailVal = getCellValue(row.getCell(emailCol)).toLowerCase();
    const deptVal = getCellValue(row.getCell(deptCol));
    const desigVal = getCellValue(row.getCell(desigCol)) || 'Assistant Professor';
    const phoneVal = phoneCol ? getCellValue(row.getCell(phoneCol)) : '';
    const cabinVal = cabinCol ? getCellValue(row.getCell(cabinCol)) : 'Faculty Cabin';
    const userVal = userCol ? getCellValue(row.getCell(userCol)) : '';

    if (!empVal && !nameVal && !emailVal && !deptVal) {
      continue;
    }

    const issues: string[] = [];

    // Sample rows from the template must never become real records.
    if (isSampleIdentifier(empVal)) {
      issues.push(
        'This is the template SAMPLE row — replace it with real data (sample rows are never imported)'
      );
    }

    if (!empVal) issues.push('Employee ID is required');
    if (!nameVal) issues.push('Faculty Name is required');
    if (!emailVal) issues.push('Email Address is required');
    if (!deptVal) issues.push('Department is required');
    if (!desigVal) issues.push('Designation is required');

    if (emailVal && !EMAIL_RE.test(emailVal)) {
      issues.push(`Invalid email format: "${emailVal}"`);
    }

    if (phoneVal && !parseContactNumber(phoneVal)) {
      issues.push(`Mobile must be a 10-digit number (got "${phoneVal}")`);
    }

    const resolvedDept = deptMap.get(deptVal.toUpperCase()) || deptMap.get(deptVal.toLowerCase());
    if (deptVal && !resolvedDept) {
      issues.push(`Unknown department: "${deptVal}"`);
    }

    let effectiveUsername = userVal.trim().toLowerCase();
    if (!effectiveUsername && emailVal) {
      effectiveUsername = emailVal.split('@')[0].trim().toLowerCase();
    }
    if (!effectiveUsername && empVal) {
      effectiveUsername = empVal.toLowerCase();
    }

    let status: RowStatus = 'VALID';
    let reason = 'Ready for import';

    if (issues.length > 0) {
      status = 'INVALID';
      reason = issues.join(', ');
    } else if (empVal && seenEmpInFile.has(empVal)) {
      status = 'DUPLICATE';
      reason = `Duplicate Employee ID (${empVal}) in uploaded file`;
    } else if (emailVal && seenEmailInFile.has(emailVal)) {
      status = 'DUPLICATE';
      reason = `Duplicate Email (${emailVal}) in uploaded file`;
    } else if (empVal && existingEmpSet.has(empVal)) {
      status = 'ALREADY_EXISTS';
      reason = `Faculty with Employee ID ${empVal} already exists in system`;
    } else if (emailVal && existingEmailSet.has(emailVal)) {
      status = 'ALREADY_EXISTS';
      reason = `User with email ${emailVal} already exists in system`;
    } else if (effectiveUsername && existingUsernameSet.has(effectiveUsername)) {
      status = 'ALREADY_EXISTS';
      reason = `Username "${effectiveUsername}" is already in use`;
    }

    if (empVal) seenEmpInFile.add(empVal);
    if (emailVal) seenEmailInFile.add(emailVal);

    rows.push({
      rowNumber: r,
      identifier: empVal || '—',
      name: nameVal || '—',
      department: resolvedDept ? `${resolvedDept.name} (${resolvedDept.code})` : deptVal || '—',
      status,
      reason,
      rawData: {
        employeeId: empVal,
        fullName: nameVal,
        email: emailVal,
        department: deptVal,
        designation: desigVal,
        phoneNumber: phoneVal,
        cabinLocation: cabinVal,
        username: userVal,
      },
      parsedData:
        status === 'VALID'
          ? {
              employeeId: empVal,
              fullName: nameVal.trim(),
              email: emailVal.trim(),
              departmentId: toIdString(resolvedDept._id),
              designation: desigVal.trim(),
              phoneNumber: parseContactNumber(phoneVal) || phoneVal.trim(),
              cabinLocation: cabinVal.trim() || 'Faculty Cabin',
              username: effectiveUsername,
            }
          : undefined,
    });
  }

  const validRows = rows.filter((r) => r.status === 'VALID').length;
  const invalidRows = rows.filter((r) => r.status === 'INVALID').length;
  const duplicateRows = rows.filter((r) => r.status === 'DUPLICATE').length;
  const existingRecords = rows.filter((r) => r.status === 'ALREADY_EXISTS').length;

  return {
    summary: {
      totalRows: rows.length,
      validRows,
      invalidRows,
      duplicateRows,
      existingRecords,
      readyForImport: validRows,
    },
    rows,
  };
}

/* -------------------------------------------------------------------------
 * 4. Execute Student Bulk Import
 * ------------------------------------------------------------------------- */

export async function executeStudentImport(
  previewRows: BulkPreviewRow[],
  adminUserId: string,
  req: any
): Promise<ImportResponse> {
  const results: BulkImportResultRow[] = [];
  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of previewRows) {
    if (row.status !== 'VALID' || !row.parsedData) {
      results.push({
        rowNumber: row.rowNumber,
        identifier: row.identifier,
        name: row.name,
        status: row.status === 'ALREADY_EXISTS' || row.status === 'DUPLICATE' ? 'Skipped' : 'Failed',
        reason: row.reason,
      });
      if (row.status === 'ALREADY_EXISTS' || row.status === 'DUPLICATE') {
        skippedCount++;
      } else {
        failedCount++;
      }
      continue;
    }

    const {
      registerNumber,
      fullName,
      departmentId,
      batchId,
      email,
      mobileNumber,
      year,
      section,
      dob,
      residentialType,
      bloodGroup,
      address,
      parent,
      school,
    } = row.parsedData;

    try {
      // Re-check for race conditions
      const existing = await Student.findOne({ registerNumber });
      if (existing) {
        results.push({
          rowNumber: row.rowNumber,
          identifier: registerNumber,
          name: fullName,
          status: 'Skipped',
          reason: `Student ${registerNumber} already exists in database`,
        });
        skippedCount++;
        continue;
      }

      const passwordHash = await bcrypt.hash('Password@123', 10);
      const effectiveUsername = registerNumber.toLowerCase();

      const user = await User.create({
        username: effectiveUsername,
        passwordHash,
        role: 'STUDENT',
        email: email || `${effectiveUsername}@ksrce.ac.in`,
        fullName,
        department: departmentId,
        isActive: true,
      });

      const student = await Student.create({
        user: user._id,
        registerNumber,
        fullName,
        department: departmentId,
        batch: batchId,
        email: email || `${effectiveUsername}@ksrce.ac.in`,
        mobileNumber: mobileNumber || '',
        year: year || 1,
        section: section || 'A',
        dob: dob || '',
        bloodGroup: bloodGroup || '',
        residentialType: residentialType || 'DAY_SCHOLAR',
        address: address || '',
        profileCompleted: false,
        isActive: true,
        parent: parent || {},
        siblings: [],
        school: school || {},
      });

      // 8 Semesters
      for (let s = 1; s <= 8; s++) {
        await AcademicRecord.create({
          student: student._id,
          semesterNumber: s,
          cgpa: 0,
          sgpa: 0,
          arrearsCount: 0,
          arrearsSubjects: '',
        });
      }

      importedCount++;
      results.push({
        rowNumber: row.rowNumber,
        identifier: registerNumber,
        name: fullName,
        status: 'Imported',
        reason: 'Successfully created student account and academic record book',
      });
    } catch (err: any) {
      console.error(`Import failed for row ${row.rowNumber} (${registerNumber}):`, err);
      failedCount++;
      results.push({
        rowNumber: row.rowNumber,
        identifier: registerNumber,
        name: fullName,
        status: 'Failed',
        reason: err?.message || 'Database write error',
      });
    }
  }

  await logAudit({
    userId: adminUserId,
    action: 'BULK_IMPORT_STUDENTS',
    entity: 'STUDENT',
    entityId: 'BULK_IMPORT',
    details: {
      totalRows: previewRows.length,
      importedCount,
      skippedCount,
      failedCount,
    },
    req,
  });

  return {
    summary: {
      totalRows: previewRows.length,
      imported: importedCount,
      skipped: skippedCount,
      failed: failedCount,
    },
    results,
  };
}

/* -------------------------------------------------------------------------
 * 5. Execute Faculty Bulk Import
 * ------------------------------------------------------------------------- */

export async function executeFacultyImport(
  previewRows: BulkPreviewRow[],
  adminUserId: string,
  req: any
): Promise<ImportResponse> {
  const results: BulkImportResultRow[] = [];
  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of previewRows) {
    if (row.status !== 'VALID' || !row.parsedData) {
      results.push({
        rowNumber: row.rowNumber,
        identifier: row.identifier,
        name: row.name,
        status: row.status === 'ALREADY_EXISTS' || row.status === 'DUPLICATE' ? 'Skipped' : 'Failed',
        reason: row.reason,
      });
      if (row.status === 'ALREADY_EXISTS' || row.status === 'DUPLICATE') {
        skippedCount++;
      } else {
        failedCount++;
      }
      continue;
    }

    const {
      employeeId,
      fullName,
      email,
      departmentId,
      designation,
      phoneNumber,
      cabinLocation,
      username,
    } = row.parsedData;

    try {
      const existing = await Faculty.findOne({ employeeId });
      if (existing) {
        results.push({
          rowNumber: row.rowNumber,
          identifier: employeeId,
          name: fullName,
          status: 'Skipped',
          reason: `Faculty ${employeeId} already exists in database`,
        });
        skippedCount++;
        continue;
      }

      const passwordHash = await bcrypt.hash('Password@123', 10);

      const user = await User.create({
        username: username || employeeId.toLowerCase(),
        passwordHash,
        role: 'FACULTY',
        email,
        fullName,
        department: departmentId,
        isActive: true,
      });

      await Faculty.create({
        user: user._id,
        employeeId,
        department: departmentId,
        designation: designation || 'Assistant Professor',
        cabinLocation: cabinLocation || 'Faculty Cabin',
        phoneNumber: phoneNumber || '',
        maxMentees: 25,
        isActive: true,
      });

      importedCount++;
      results.push({
        rowNumber: row.rowNumber,
        identifier: employeeId,
        name: fullName,
        status: 'Imported',
        reason: 'Successfully created faculty profile and login account',
      });
    } catch (err: any) {
      console.error(`Import failed for row ${row.rowNumber} (${employeeId}):`, err);
      failedCount++;
      results.push({
        rowNumber: row.rowNumber,
        identifier: employeeId,
        name: fullName,
        status: 'Failed',
        reason: err?.message || 'Database write error',
      });
    }
  }

  await logAudit({
    userId: adminUserId,
    action: 'BULK_IMPORT_FACULTY',
    entity: 'FACULTY',
    entityId: 'BULK_IMPORT',
    details: {
      totalRows: previewRows.length,
      importedCount,
      skippedCount,
      failedCount,
    },
    req,
  });

  return {
    summary: {
      totalRows: previewRows.length,
      imported: importedCount,
      skipped: skippedCount,
      failed: failedCount,
    },
    results,
  };
}

/* -------------------------------------------------------------------------
 * 6. Generate Error Report (.xlsx)
 * ------------------------------------------------------------------------- */

export async function generateErrorReport(
  rows: BulkImportResultRow[] | BulkPreviewRow[],
  type: 'STUDENTS' | 'FACULTY'
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSRCE Digital Mentor System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Import Issues & Skipped Rows', {
    views: [{ showGridLines: true }],
  });

  const identifierLabel = type === 'STUDENTS' ? 'Register Number' : 'Employee ID';

  sheet.columns = [
    { header: 'Row Number', key: 'rowNumber', width: 14 },
    { header: identifierLabel, key: 'identifier', width: 22 },
    { header: 'Full Name', key: 'name', width: 26 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Reason / Issue Description', key: 'reason', width: 45 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF991B1B' }, // Dark Red
  };
  headerRow.height = 24;

  // Filter only failed/skipped/invalid/duplicate
  const filtered = rows.filter((r) => {
    const s = r.status.toUpperCase();
    return s !== 'IMPORTED' && s !== 'VALID';
  });

  for (const r of filtered) {
    sheet.addRow({
      rowNumber: r.rowNumber,
      identifier: r.identifier,
      name: r.name,
      status: r.status,
      reason: r.reason,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
