import ExcelJS from 'exceljs';
import {
  Student,
  InternalMark,
  Department,
  Batch,
} from '../../models/index.js';
import { toIdString } from '../../utils/access.util.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { MARK_TYPES, MARK_TYPE_MAX, MARK_TYPE_LABEL, MARK_TYPE_FIELD, type InternalMarkType, isMarkType } from '../../models/InternalMark.model.js';
import { parseStrictNumber } from '../../utils/validation.util.js';

export type MarksRowStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'ALREADY_EXISTS';

export interface MarksBulkPreviewRow {
  rowNumber: number;
  registerNumber: string;
  studentName: string;
  department: string;
  year: string;
  section: string;
  subjectCode: string;
  subjectName: string;
  semesterNumber: string;
  assessmentType: string;
  maxMarks: number;
  marksObtained: string;
  status: MarksRowStatus;
  reason: string;
  rawData?: Record<string, any>;
  parsedData?: any;
}

export interface MarksBulkSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  existingRecords: number;
  readyForImport: number;
}

export interface MarksValidationResponse {
  summary: MarksBulkSummary;
  rows: MarksBulkPreviewRow[];
}

export interface MarksImportResultRow {
  rowNumber: number;
  registerNumber: string;
  studentName: string;
  subjectCode: string;
  assessmentType: string;
  status: 'Imported' | 'Updated' | 'Skipped' | 'Failed';
  reason: string;
}

export interface MarksImportResponse {
  summary: {
    totalRows: number;
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  results: MarksImportResultRow[];
}

const REQUIRED_HEADERS = [
  'Register Number',
  'Student Name',
  'Department',
  'Year',
  'Class/Section',
  'Subject Code',
  'Subject Name',
  'Assessment Type',
  'Max Marks',
  'Marks Obtained',
];

const VALID_ASSESSMENT_TYPES = ['IA1', 'IA2', 'END_SEM'];

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

function pickCol(map: Map<string, number>, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const idx = map.get(alias);
    if (idx !== undefined) return idx;
  }
  return undefined;
}

function pickDataSheet(wb: ExcelJS.Workbook, preferredName: string): ExcelJS.Worksheet | undefined {
  const norm = (name: string) => (name || '').trim().toLowerCase();
  const skip = new Set(['instructions', 'reference values', 'reference values sheet']);
  return (
    wb.worksheets.find((ws) => norm(ws.name) === norm(preferredName)) ||
    wb.worksheets.find((ws) => !skip.has(norm(ws.name))) ||
    wb.worksheets[0]
  );
}

function styleHeaderRow(row: ExcelJS.Row, argb: string = 'FF0B2545'): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 28;
}

/**
 * Generate Excel template for marks entry
 */
export async function generateMarksTemplate(params: {
  academicYear: string;
  year: number;
  section: string;
  subjectCode: string;
  subjectName: string;
  semesterNumber: number;
  assessmentType?: 'IA1' | 'IA2' | 'END_SEM';
  /** Owning department of the caller. Keeps other departments' rosters out. */
  departmentId: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSRCE Digital Mentor–Mentee Management System';
  workbook.created = new Date();

  // Get students for this class
  const students = await Student.find({})
    .populate('batch')
    .populate('department')
    .lean();

  const filteredStudents = students.filter((s: any) => {
    const batchName = s.batch?.name || '';
    return s.year === params.year && 
           s.section === params.section && 
           batchName.includes(params.academicYear) &&
           String(s.department?._id || s.department) === params.departmentId;
  });

  // Sheet 1: Instructions
  const instrSheet = workbook.addWorksheet('Instructions', { views: [{ showGridLines: false }] });
  instrSheet.columns = [{ width: 112 }];

  const assessmentType = params.assessmentType || 'IA1';
  const maxMark = MARK_TYPE_MAX[assessmentType];

  const instructions = [
    { kind: 'title', text: `KSRCE — ${assessmentType} MARKS ENTRY TEMPLATE` },
    { kind: 'spacer' },
    { kind: 'heading', text: 'PURPOSE' },
    { kind: 'text', text: `This workbook is the official template for entering ${assessmentType} marks in bulk for a specific class and subject.` },
    { kind: 'spacer' },
    { kind: 'heading', text: 'CONTEXT' },
    { kind: 'bullet', text: `Academic Year: ${params.academicYear}` },
    { kind: 'bullet', text: `Year: ${params.year}` },
    { kind: 'bullet', text: `Section: ${params.section}` },
    { kind: 'bullet', text: `Subject: ${params.subjectCode} - ${params.subjectName}` },
    { kind: 'bullet', text: `Semester: ${params.semesterNumber}` },
    { kind: 'bullet', text: `Assessment Type: ${assessmentType} (Max Marks: ${maxMark})` },
    { kind: 'spacer' },
    { kind: 'heading', text: 'HOW TO FILL THIS FILE' },
    { kind: 'numbered', text: '1. Do NOT change, reorder, rename or delete any column header in the "Marks Entry" sheet.' },
    { kind: 'numbered', text: '2. Do NOT merge cells anywhere in the "Marks Entry" sheet.' },
    { kind: 'numbered', text: '3. Enter marks for each student in the "Marks Obtained" column.' },
    { kind: 'numbered', text: `4. Marks must be numeric, between 0 and ${maxMark}.` },
    { kind: 'numbered', text: '5. Leave "Marks Obtained" blank if the student was absent or marks not yet available.' },
    { kind: 'numbered', text: '6. Do not modify Register Number, Student Name, or other pre-filled columns.' },
    { kind: 'numbered', text: '7. Save the file as .xlsx before uploading. Maximum upload size is 10 MB.' },
    { kind: 'spacer' },
    { kind: 'heading', text: 'WHAT HAPPENS ON UPLOAD' },
    { kind: 'bullet', text: 'Every row is validated first and shown as VALID / INVALID / DUPLICATE before anything is written.' },
    { kind: 'bullet', text: 'Only VALID rows are imported.' },
    { kind: 'bullet', text: 'Existing marks for the same student/subject/assessment will be updated if confirmed.' },
    { kind: 'bullet', text: 'Rows with duplicate Register Numbers in the same file are reported as DUPLICATE and skipped.' },
  ];

  let r = 1;
  for (const line of instructions) {
    const row = instrSheet.getRow(r++);
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
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
        cell.alignment = { vertical: 'middle', indent: 1 };
        break;
      case 'heading':
        row.height = 20;
        cell.font = { bold: true, size: 11, color: { argb: 'FFC59B27' } };
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

  // Sheet 2: Marks Entry
  const sheet = workbook.addWorksheet('Marks Entry', { views: [{ showGridLines: false }] });
  
  const columns = [
    { header: 'Register Number', key: 'regNo', width: 20 },
    { header: 'Student Name', key: 'studentName', width: 30 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Year', key: 'year', width: 8 },
    { header: 'Class/Section', key: 'classSection', width: 15 },
    { header: 'Subject Code', key: 'subjectCode', width: 15 },
    { header: 'Subject Name', key: 'subjectName', width: 30 },
    { header: 'Semester', key: 'semester', width: 10 },
    { header: 'Assessment Type', key: 'assessmentType', width: 15 },
    { header: 'Max Marks', key: 'maxMarks', width: 12 },
    { header: 'Marks Obtained', key: 'marksObtained', width: 18 },
  ];
  
  sheet.columns = columns;
  styleHeaderRow(sheet.getRow(1));

  for (const s of filteredStudents) {
    sheet.addRow({
      regNo: s.registerNumber,
      studentName: s.fullName,
      department: s.department?.name || '',
      year: s.year,
      classSection: `${s.year}${s.section}`,
      subjectCode: params.subjectCode,
      subjectName: params.subjectName,
      semester: params.semesterNumber,
      assessmentType: assessmentType,
      maxMarks: maxMark,
      marksObtained: '',
    });
  }

  // Set number format for marks columns
  const marksObtainedCol = sheet.getColumn('marksObtained');
  marksObtainedCol.numFmt = '0';
  
  const maxMarksCol = sheet.getColumn('maxMarks');
  maxMarksCol.numFmt = '0';

  // Sheet 3: Reference Values
  const refSheet = workbook.addWorksheet('Reference Values', { views: [{ showGridLines: false }] });
  refSheet.columns = [
    { header: 'Assessment Type', key: 'assessmentType', width: 18 },
    { header: 'Max Marks', key: 'maxMarks', width: 12 },
  ];
  styleHeaderRow(refSheet.getRow(1), 'FF13315C');
  
  for (const type of MARK_TYPES) {
    refSheet.addRow({
      assessmentType: type,
      maxMarks: MARK_TYPE_MAX[type],
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Validate marks Excel file
 */
export async function validateMarksExcel(
  buffer: Buffer,
  params: {
    academicYear: string;
    year: number;
    section: string;
    subjectCode: string;
    subjectName: string;
    semesterNumber: number;
    hodDepartmentId: string;
  }
): Promise<MarksValidationResponse> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch (err: any) {
    throw new Error('Corrupted or unreadable Excel (.xlsx) file.');
  }

  const sheet = pickDataSheet(workbook, 'Marks Entry');
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

  // Get students for this class to validate against
  const students = await Student.find({})
    .populate('batch')
    .populate('department')
    .lean();

  const filteredStudents = students.filter((s: any) => {
    const batchName = s.batch?.name || '';
    return s.year === params.year && 
           s.section === params.section && 
           batchName.includes(params.academicYear) &&
           String(s.department?._id || s.department) === params.hodDepartmentId;
  });

  const studentMap = new Map<string, any>();
  for (const s of filteredStudents) {
    studentMap.set(s.registerNumber.toUpperCase().trim(), s);
  }

  // Get existing marks to detect already-existing records
  const studentIds = filteredStudents.map((s: any) => String(s._id));
  const existingMarks = await InternalMark.find({
    student: { $in: studentIds },
    subjectCode: params.subjectCode.toUpperCase(),
    semesterNumber: params.semesterNumber,
  }).lean();

  const existingMarksMap = new Map<string, Set<string>>(); // registerNumber -> set of assessmentTypes
  for (const m of existingMarks as any[]) {
    const student = filteredStudents.find((s: any) => String(s._id) === String(m.student));
    if (student) {
      const regNo = student.registerNumber.toUpperCase().trim();
      const assessment = m.ia1 !== null && m.ia1 !== undefined ? 'IA1' : 
                         m.ia2 !== null && m.ia2 !== undefined ? 'IA2' : 
                         m.endSem !== null && m.endSem !== undefined ? 'END_SEM' : null;
      if (assessment) {
        if (!existingMarksMap.has(regNo)) existingMarksMap.set(regNo, new Set());
        existingMarksMap.get(regNo)!.add(assessment);
      }
    }
  }

  // Parse header row
  const headerRow = sheet.getRow(1);
  const colIndexMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const raw = getCellValue(cell);
    if (raw) {
      colIndexMap.set(normalizeKey(raw), colNumber);
    }
  });

  const regCol = pickCol(colIndexMap, ['registernumber', 'regno', 'registernumber']) ?? 1;
  const nameCol = pickCol(colIndexMap, ['studentname', 'fullname', 'name']) ?? 2;
  const deptCol = pickCol(colIndexMap, ['department', 'dept']) ?? 3;
  const yearCol = pickCol(colIndexMap, ['year']) ?? 4;
  const classSectionCol = pickCol(colIndexMap, ['classsection', 'class', 'section']) ?? 5;
  const subjectCodeCol = pickCol(colIndexMap, ['subjectcode', 'subcode']) ?? 6;
  const subjectNameCol = pickCol(colIndexMap, ['subjectname', 'subname']) ?? 7;
  const semesterCol = pickCol(colIndexMap, ['semester', 'sem']) ?? 8;
  const assessmentTypeCol = pickCol(colIndexMap, ['assessmenttype', 'assessment', 'type']) ?? 9;
  const maxMarksCol = pickCol(colIndexMap, ['maxmarks', 'max']) ?? 10;
  const marksObtainedCol = pickCol(colIndexMap, ['marksobtained', 'marks', 'obtained']) ?? 11;

  const rows: MarksBulkPreviewRow[] = [];
  const seenInFile = new Set<string>();

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    
    const regVal = getCellValue(row.getCell(regCol)).toUpperCase().trim();
    const nameVal = getCellValue(row.getCell(nameCol)).trim();
    const deptVal = getCellValue(row.getCell(deptCol)).trim();
    const yearVal = getCellValue(row.getCell(yearCol)).trim();
    const classSectionVal = getCellValue(row.getCell(classSectionCol)).trim();
    const subjectCodeVal = getCellValue(row.getCell(subjectCodeCol)).toUpperCase().trim();
    const subjectNameVal = getCellValue(row.getCell(subjectNameCol)).trim();
    const semesterVal = getCellValue(row.getCell(semesterCol)).trim();
    const assessmentTypeVal = getCellValue(row.getCell(assessmentTypeCol)).toUpperCase().trim();
    const maxMarksVal = getCellValue(row.getCell(maxMarksCol)).trim();
    const marksObtainedVal = getCellValue(row.getCell(marksObtainedCol)).trim();

    // If whole row is empty, skip
    if (!regVal && !nameVal && !subjectCodeVal && !marksObtainedVal) {
      continue;
    }

    const issues: string[] = [];

    if (!regVal) issues.push('Register Number is required');
    if (!nameVal) issues.push('Student Name is required');
    if (!subjectCodeVal) issues.push('Subject Code is required');
    if (!assessmentTypeVal) issues.push('Assessment Type is required');
    if (!semesterVal) issues.push('Semester is required');

    // Validate student exists in this class
    let student: any = null;
    if (regVal) {
      student = studentMap.get(regVal);
      if (!student) {
        issues.push(`Student with Register Number ${regVal} not found in this class/department`);
      }
    }

    // Validate assessment type
    if (assessmentTypeVal && !VALID_ASSESSMENT_TYPES.includes(assessmentTypeVal)) {
      issues.push(`Invalid Assessment Type: "${assessmentTypeVal}". Must be one of: IA1, IA2, END_SEM`);
    }

    // Validate max marks
    let maxMarks = 0;
    if (maxMarksVal) {
      const parsed = parseStrictNumber(maxMarksVal, { field: 'Max Marks', min: 0, integer: true });
      if (!parsed.ok) {
        issues.push(parsed.error!);
      } else {
        maxMarks = parsed.value!;
      }
    } else if (assessmentTypeVal) {
      maxMarks = MARK_TYPE_MAX[assessmentTypeVal as InternalMarkType] || 0;
    }

    // Validate marks obtained
    let marksObtained: number | null = null;
    if (marksObtainedVal !== '') {
      const parsed = parseStrictNumber(marksObtainedVal, { field: 'Marks Obtained', min: 0, max: maxMarks });
      if (!parsed.ok) {
        issues.push(parsed.error!);
      } else {
        marksObtained = parsed.value!;
      }
    }

    // Check subject code matches
    if (subjectCodeVal && subjectCodeVal !== params.subjectCode.toUpperCase()) {
      issues.push(`Subject Code mismatch: expected ${params.subjectCode}, got ${subjectCodeVal}`);
    }

    // Check semester matches
    if (semesterVal && Number(semesterVal) !== params.semesterNumber) {
      issues.push(`Semester mismatch: expected ${params.semesterNumber}, got ${semesterVal}`);
    }

    // Check for duplicates in file
    const rowKey = `${regVal}|${assessmentTypeVal}|${semesterVal}`;
    if (regVal && assessmentTypeVal && seenInFile.has(rowKey)) {
      issues.push(`Duplicate row for Register Number ${regVal}, Assessment ${assessmentTypeVal}, Semester ${semesterVal} in this file`);
    }

    // Check for existing marks
    let status: MarksRowStatus = 'VALID';
    let reason = 'Ready for import';

    if (issues.length > 0) {
      status = 'INVALID';
      reason = issues.join(', ');
    } else if (regVal && assessmentTypeVal && seenInFile.has(rowKey)) {
      status = 'DUPLICATE';
      reason = `Duplicate row for ${regVal} - ${assessmentTypeVal} in file`;
    } else if (regVal && existingMarksMap.has(regVal) && existingMarksMap.get(regVal)!.has(assessmentTypeVal)) {
      status = 'ALREADY_EXISTS';
      reason = `Marks for ${regVal} - ${assessmentTypeVal} already exist in system`;
    }

    if (regVal && assessmentTypeVal) {
      seenInFile.add(rowKey);
    }

    rows.push({
      rowNumber: rowNum,
      registerNumber: regVal || '—',
      studentName: nameVal || (student?.fullName || '—'),
      department: params.hodDepartmentId, // Will be resolved in UI
      year: yearVal || (student?.year?.toString() || '—'),
      section: classSectionVal || (student?.section || '—'),
      subjectCode: subjectCodeVal || params.subjectCode,
      subjectName: subjectNameVal || params.subjectName,
      semesterNumber: semesterVal || params.semesterNumber.toString(),
      assessmentType: assessmentTypeVal || '—',
      maxMarks,
      marksObtained: marksObtainedVal || '',
      status,
      reason,
      rawData: {
        registerNumber: regVal,
        studentName: nameVal,
        department: deptVal,
        year: yearVal,
        classSection: classSectionVal,
        subjectCode: subjectCodeVal,
        subjectName: subjectNameVal,
        semester: semesterVal,
        assessmentType: assessmentTypeVal,
        maxMarks: maxMarksVal,
        marksObtained: marksObtainedVal,
      },
      parsedData: status === 'VALID' ? {
        registerNumber: regVal,
        studentId: student ? String(student._id) : null,
        subjectCode: params.subjectCode.toUpperCase(),
        subjectName: params.subjectName,
        semesterNumber: params.semesterNumber,
        assessmentType: assessmentTypeVal as InternalMarkType,
        marksObtained: marksObtained,
        maxMarks,
      } : undefined,
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

/**
 * Execute marks bulk import
 */
export async function executeMarksImport(
  previewRows: MarksBulkPreviewRow[],
  hodUserId: string,
  hodDepartmentId: string,
  req: any
): Promise<MarksImportResponse> {
  const results: MarksImportResultRow[] = [];
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of previewRows) {
    if (row.status !== 'VALID' || !row.parsedData) {
      results.push({
        rowNumber: row.rowNumber,
        registerNumber: row.registerNumber,
        studentName: row.studentName,
        subjectCode: row.subjectCode,
        assessmentType: row.assessmentType,
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

    const { registerNumber, studentId, subjectCode, subjectName, semesterNumber, assessmentType, marksObtained, maxMarks } = row.parsedData;
    const markType = assessmentType as InternalMarkType;

    // ── Server-side re-validation of the (client-validated) row ──────────────
    // /import accepts pre-validated preview rows, so the same checks that
    // validateMarksExcel performs are re-applied here. This stops a hand-crafted
    // request from writing an unknown assessment type, an out-of-range mark or
    // an impossible semester, and it never trusts the client-supplied maxMarks.
    if (!isMarkType(markType)) {
      results.push({
        rowNumber: row.rowNumber,
        registerNumber,
        studentName: row.studentName,
        subjectCode,
        assessmentType,
        status: 'Failed',
        reason: `Unknown assessment type "${assessmentType}"`,
      });
      failedCount++;
      continue;
    }

    const semesterNum = Number(semesterNumber);
    if (!Number.isInteger(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      results.push({
        rowNumber: row.rowNumber,
        registerNumber,
        studentName: row.studentName,
        subjectCode,
        assessmentType,
        status: 'Failed',
        reason: `Invalid semester "${semesterNumber}"`,
      });
      failedCount++;
      continue;
    }

    const normalizedMarks =
      marksObtained === null || marksObtained === undefined || marksObtained === ''
        ? null
        : Number(marksObtained);
    if (
      normalizedMarks !== null &&
      (Number.isNaN(normalizedMarks) || normalizedMarks < 0 || normalizedMarks > MARK_TYPE_MAX[markType])
    ) {
      results.push({
        rowNumber: row.rowNumber,
        registerNumber,
        studentName: row.studentName,
        subjectCode,
        assessmentType,
        status: 'Failed',
        reason: `Marks for ${markType} must be between 0 and ${MARK_TYPE_MAX[markType]}`,
      });
      failedCount++;
      continue;
    }

    try {
      // Re-check student belongs to HOD's department
      const student = await Student.findOne({ _id: studentId, department: hodDepartmentId }).lean();
      if (!student) {
        results.push({
          rowNumber: row.rowNumber,
          registerNumber,
          studentName: row.studentName,
          subjectCode,
          assessmentType,
          status: 'Failed',
          reason: 'Student not found in your department',
        });
        failedCount++;
        continue;
      }

      // Check existing mark
      const existingMark = await InternalMark.findOne({
        student: studentId,
        subjectCode,
        semesterNumber,
      });

      const field = MARK_TYPE_FIELD[markType];
      const updateData: Record<string, any> = {
        student: studentId,
        registerNumber,
        semesterNumber,
        subjectCode,
        subjectName,
        [field]: normalizedMarks,
        updatedBy: hodUserId,
        updatedByName: req.user?.fullName || 'HOD',
      };

      if (existingMark) {
        const oldValue = (existingMark as any)[field];
        await InternalMark.findOneAndUpdate(
          { _id: existingMark._id },
          { $set: updateData },
          { new: true }
        );
        
        results.push({
          rowNumber: row.rowNumber,
          registerNumber,
          studentName: row.studentName,
          subjectCode,
          assessmentType,
          status: 'Updated',
          reason: `Updated ${assessmentType} from ${oldValue} to ${marksObtained}`,
        });
        updatedCount++;
      } else {
        await InternalMark.create(updateData);
        
        results.push({
          rowNumber: row.rowNumber,
          registerNumber,
          studentName: row.studentName,
          subjectCode,
          assessmentType,
          status: 'Imported',
          reason: `Created new ${assessmentType} mark: ${marksObtained}`,
        });
        importedCount++;
      }
    } catch (err: any) {
      console.error(`Error importing marks for row ${row.rowNumber}:`, err);
      results.push({
        rowNumber: row.rowNumber,
        registerNumber,
        studentName: row.studentName,
        subjectCode,
        assessmentType,
        status: 'Failed',
        reason: err.message || 'Database error',
      });
      failedCount++;
    }
  }

  // One audit record per import run (never per row, so the history stays
  // readable). Carries the outcome summary and a bounded register-number list;
  // no password/token/hash is ever written here.
  await logAudit({
    userId: hodUserId,
    action: 'IMPORT_MARKS_BULK',
    entity: 'INTERNAL_MARK',
    entityId: null,
    details: {
      summary: {
        totalRows: previewRows.length,
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
      },
      registerNumbers: results
        .filter((r) => r.status === 'Imported' || r.status === 'Updated')
        .map((r) => r.registerNumber)
        .slice(0, 50),
      subjectCodes: Array.from(new Set(results.map((r) => r.subjectCode).filter(Boolean))).slice(0, 20),
    },
    req,
  } as any);

  return {
    summary: {
      totalRows: previewRows.length,
      imported: importedCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
    },
    results,
  };
}

/**
 * Export marks to Excel
 */
export async function exportMarksExcel(
  marks: Array<{
    registerNumber: string;
    studentName: string;
    department: string;
    year: number;
    section: string;
    batch: string;
    semesterNumber: number;
    subjectCode: string;
    subjectName: string;
    ia1: number | null;
    ia2: number | null;
    endSem: number | null;
    updatedByName: string;
    updatedAt: string | Date;
  }>,
  filters: {
    academicYear: string;
    year?: number;
    section?: string;
    subjectCode?: string;
    semesterNumber?: number;
  }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KSRCE Digital Mentor–Mentee Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Marks Export', { views: [{ showGridLines: false }] });
  
  const columns = [
    { header: 'S. No.', key: 'sno', width: 8 },
    { header: 'Register Number', key: 'regNo', width: 20 },
    { header: 'Student Name', key: 'studentName', width: 30 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Year', key: 'year', width: 8 },
    { header: 'Class/Section', key: 'classSection', width: 15 },
    { header: 'Batch', key: 'batch', width: 20 },
    { header: 'Semester', key: 'semester', width: 10 },
    { header: 'Subject Code', key: 'subjectCode', width: 15 },
    { header: 'Subject Name', key: 'subjectName', width: 30 },
    { header: 'Assessment Type', key: 'assessmentType', width: 15 },
    { header: 'Max Marks', key: 'maxMarks', width: 12 },
    { header: 'Marks Obtained', key: 'marksObtained', width: 18 },
    { header: 'Percentage', key: 'percentage', width: 12 },
    { header: 'Academic Year', key: 'academicYear', width: 15 },
    { header: 'Last Updated', key: 'lastUpdated', width: 20 },
  ];
  
  sheet.columns = columns;
  styleHeaderRow(sheet.getRow(1));

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
  
  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  let sno = 1;
  for (const mark of marks) {
    // Create a row for each assessment type that has a mark
    for (const type of MARK_TYPES) {
      const field = MARK_TYPE_FIELD[type];
      const marksObtained = mark[field as keyof typeof mark] as number | null;
      const maxMarks = MARK_TYPE_MAX[type];
      
      if (marksObtained !== null && marksObtained !== undefined) {
        const percentage = maxMarks > 0 ? Math.round((marksObtained / maxMarks) * 10000) / 100 : 0;
        
        sheet.addRow({
          sno: sno++,
          regNo: mark.registerNumber,
          studentName: mark.studentName,
          department: mark.department,
          year: mark.year,
          classSection: `${mark.year}${mark.section}`,
          batch: mark.batch,
          semester: mark.semesterNumber,
          subjectCode: mark.subjectCode,
          subjectName: mark.subjectName,
          assessmentType: type,
          maxMarks,
          marksObtained,
          percentage: `${percentage}%`,
          academicYear: filters.academicYear,
          lastUpdated: mark.updatedAt ? new Date(mark.updatedAt).toLocaleDateString('en-GB') : '',
        });
      }
    }
  }

  // Set number formats
  const marksObtainedCol = sheet.getColumn('marksObtained');
  marksObtainedCol.numFmt = '0';
  
  const maxMarksCol = sheet.getColumn('maxMarks');
  maxMarksCol.numFmt = '0';

  const percentageCol = sheet.getColumn('percentage');
  percentageCol.numFmt = '0.00"%"';

  if (marks.length === 0) {
    // Add a note row
    const noteRow = sheet.addRow({});
    noteRow.getCell(1).value = 'No marks data found for the selected filters.';
    sheet.mergeCells(noteRow.number, 1, noteRow.number, columns.length);
    noteRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF64748B' }, size: 11 };
    noteRow.height = 30;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}