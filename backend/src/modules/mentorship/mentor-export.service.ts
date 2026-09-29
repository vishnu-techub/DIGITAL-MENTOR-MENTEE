import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import {
  Student,
  Faculty,
  Department,
  Batch,
  AcademicRecord,
  MentorAssignment,
  CounsellingRecord,
  StudentDocument,
  MonthlyProgress,
  StudentProgress,
  COUNSELLING_5_CATEGORIES,
} from '../../models/index.js';
import { calculateArrearStatistics } from '../../utils/arrears.util.js';

function getProgressCategoryEntries(list: any[], category: string): string[] {
  return list
    .filter((p) => p.category === category)
    .map((p) => (p.activityName || p.eventName || '').trim())
    .filter(Boolean);
}


export interface ExportResult {
  count: number;
  buffer: Buffer | null;
  filename: string | null;
  mentorName?: string;
  departmentName?: string;
  academicYear?: string;
}

/**
 * Calculates academic year in institutional format (e.g. "2025-2026")
 */
export function getAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  if (month >= 6) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Sanitizes filename string removing invalid characters
 */
export function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Safe string sanitizer that converts empty/undefined/null to "NIL"
 */
function safeNil(val?: string | null): string {
  if (!val || typeof val !== 'string' || !val.trim() || val.trim().toUpperCase() === 'UNDEFINED' || val.trim().toUpperCase() === 'NULL') {
    return 'NIL';
  }
  return val.trim();
}

/**
 * Generates institutional Excel (.xlsx) report containing all mentees currently assigned to the given mentor
 */
export async function generateMentorMenteesExcel(
  mentorFacultyId: string,
  requestedAcademicYear?: string
): Promise<ExportResult> {
  const isAll = mentorFacultyId === 'ALL';
  let faculty: any = null;
  let mentorName = 'All Mentors';
  let departmentName = 'Information Technology';
  const academicYear = requestedAcademicYear || getAcademicYear();

  let activeAssignments: any[] = [];

  if (isAll) {
    activeAssignments = await MentorAssignment.find({
      status: 'ACTIVE',
    })
      .populate({ path: 'mentor', populate: { path: 'user department' } })
      .sort({ mentor: 1, createdAt: 1 });

    const firstDept = activeAssignments.find((a) => (a.mentor as any)?.department?.name);
    if (firstDept) {
      departmentName = (firstDept.mentor as any).department.name;
    }
  } else {
    // 1. Resolve Faculty Mentor Record
    if (mongoose.Types.ObjectId.isValid(mentorFacultyId)) {
      faculty = await Faculty.findById(mentorFacultyId).populate('user department');
    }
    if (!faculty) {
      faculty = await Faculty.findOne({
        $or: [{ employeeId: mentorFacultyId }, { user: mentorFacultyId }],
      }).populate('user department');
    }

    if (!faculty) {
      throw new Error('Faculty mentor profile not found.');
    }

    const mentorUser = faculty.user as any;
    mentorName = mentorUser?.fullName || 'Faculty Mentor';
    const mentorDept = faculty.department as any;
    departmentName = mentorDept?.name || 'Information Technology';

    // 2. Fetch Active Mentor Assignments for this Mentor ONLY (Mentor-Specific Security)
    activeAssignments = await MentorAssignment.find({
      mentor: faculty._id,
      status: 'ACTIVE',
    }).sort({ createdAt: 1 });
  }

  if (activeAssignments.length === 0) {
    return {
      count: 0,
      buffer: null,
      filename: null,
      mentorName,
      departmentName,
      academicYear,
    };
  }

  // Build mentor mapping for each student
  const assignmentMentorMap = new Map<string, { mentorSNo: number; mentorName: string; studentSNo: number }>();
  let mentorCounter = 0;
  const mentorIdToSNo = new Map<string, number>();
  const mentorStudentCount = new Map<string, number>();

  activeAssignments.forEach((a) => {
    const sId = (a.student?._id || a.student)?.toString();
    const mDoc = a.mentor as any;
    const mId = (mDoc?._id || a.mentor)?.toString();

    if (!mentorIdToSNo.has(mId)) {
      mentorCounter++;
      mentorIdToSNo.set(mId, mentorCounter);
      mentorStudentCount.set(mId, 0);
    }

    const currentMCount = (mentorStudentCount.get(mId) || 0) + 1;
    mentorStudentCount.set(mId, currentMCount);

    const effectiveMName = mDoc?.user?.fullName || mentorName;
    assignmentMentorMap.set(sId, {
      mentorSNo: mentorIdToSNo.get(mId)!,
      mentorName: effectiveMName,
      studentSNo: currentMCount,
    });
  });

  const studentIds = activeAssignments.map((a) => (a.student?._id || a.student));

  // 3. Fetch Assigned Students & Complete Master Data
  const students = await Student.find({
    _id: { $in: studentIds },
  })
    .populate('department')
    .populate('batch')
    .sort({ registerNumber: 1 });

  // 4. Batch Fetch Associated Academic, Documents, Counselling & Progress Records
  const [academicRecords, studentDocuments, counsellingRecords, monthlyProgressList, studentProgressList] = await Promise.all([
    AcademicRecord.find({ student: { $in: studentIds } }),
    StudentDocument.find({ studentId: { $in: studentIds } }),
    CounsellingRecord.find({
      $or: [{ student: { $in: studentIds } }, { studentId: { $in: studentIds } }],
    }).sort({ sessionDate: -1, date: -1 }),
    MonthlyProgress.find({ student: { $in: studentIds } }).sort({ academicYear: -1, monthName: -1 }),
    StudentProgress.find({ studentId: { $in: studentIds } }).sort({ date: -1, createdAt: -1 }),
  ]);

  // Group records by student ID
  const academicsMap = new Map<string, any[]>();
  const documentsMap = new Map<string, any[]>();
  const counsellingMap = new Map<string, any[]>();
  const progressMap = new Map<string, any[]>();
  const studentProgressMap = new Map<string, any[]>();

  academicRecords.forEach((r) => {
    const sId = r.student.toString();
    if (!academicsMap.has(sId)) academicsMap.set(sId, []);
    academicsMap.get(sId)!.push(r);
  });

  studentDocuments.forEach((d) => {
    const sId = d.studentId.toString();
    if (!documentsMap.has(sId)) documentsMap.set(sId, []);
    documentsMap.get(sId)!.push(d);
  });

  counsellingRecords.forEach((c) => {
    const sId = (c.student || c.studentId)?.toString();
    if (sId) {
      if (!counsellingMap.has(sId)) counsellingMap.set(sId, []);
      counsellingMap.get(sId)!.push(c);
    }
  });

  monthlyProgressList.forEach((p) => {
    const sId = p.student.toString();
    if (!progressMap.has(sId)) progressMap.set(sId, []);
    progressMap.get(sId)!.push(p);
  });

  studentProgressList.forEach((sp) => {
    const sId = sp.studentId.toString();
    if (!studentProgressMap.has(sId)) studentProgressMap.set(sId, []);
    studentProgressMap.get(sId)!.push(sp);
  });

  // 5. Initialize Professional ExcelJS Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'K.S.R. College of Engineering - Mentoring Portal';
  workbook.lastModifiedBy = mentorName;
  workbook.created = new Date();
  workbook.modified = new Date();

  // ==========================================
  // SHEET 1: MENTOR MENTEE LIST (Exact Structure)
  // ==========================================
  const ws = workbook.addWorksheet('MENTOR MENTEE LIST', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 6 }],
  });

  // Institutional Color Palette
  const INSTITUTIONAL_NAVY = 'FF0B2545';
  const INSTITUTIONAL_BLUE = 'FF1E3A8A';
  const HEADER_FILL = 'FF1E3A8A';
  const HEADER_TEXT = 'FFFFFFFF';
  const BORDER_COLOR = 'FFCBD5E1';
  const ZEBRA_ROW_FILL = 'FFF8FAFC';
  const TITLE_BG = 'FFF1F5F9';

  // Section 1: Excel Institutional Titles / Headers
  // Row 1: College Name
  ws.mergeCells('A1:P1');
  const r1 = ws.getCell('A1');
  r1.value = 'K.S.R. COLLEGE OF ENGINEERING (AUTONOMOUS), TIRUCHENGODE';
  r1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: INSTITUTIONAL_NAVY } };
  r1.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  // Row 2: Department Name
  ws.mergeCells('A2:P2');
  const r2 = ws.getCell('A2');
  r2.value = `DEPARTMENT OF ${departmentName.toUpperCase()}`;
  r2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: INSTITUTIONAL_BLUE } };
  r2.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;

  // Row 3: Report Title
  ws.mergeCells('A3:P3');
  const r3 = ws.getCell('A3');
  r3.value = 'MENTOR MENTEE LIST - DOMAIN WISE';
  r3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F2937' } };
  r3.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(3).height = 20;

  // Row 4: Academic Year & Mentor Name
  ws.mergeCells('A4:P4');
  const r4 = ws.getCell('A4');
  r4.value = `ACADEMIC YEAR: ${academicYear}   |   MENTOR: ${mentorName.toUpperCase()}`;
  r4.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF374151' } };
  r4.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(4).height = 18;

  // Row 5: Subtle spacer row
  ws.getRow(5).height = 6;

  // Apply clean background fill to title block
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 16; c++) {
      ws.getRow(r).getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: TITLE_BG },
      };
    }
  }

  // Section 2: Table Column Headers (Row 6)
  const columns = [
    { key: 'mentorSNo', header: 'S.NO', width: 7 },
    { key: 'mentorName', header: 'MENTOR NAME', width: 24 },
    { key: 'studentSNo', header: 'S.NO', width: 7 },
    { key: 'regNumber', header: 'REG NUMBER', width: 17 },
    { key: 'studentName', header: 'STUDENT NAME (MENTEE)', width: 26 },
    { key: 'classSection', header: 'CLASS & SECTION', width: 16 },
    { key: 'nptel', header: 'NPTEL COMPLETED', width: 24 },
    { key: 'globalCert', header: 'GLOBAL CERTIFICATION', width: 25 },
    { key: 'allClear', header: 'ALL CLEAR', width: 16 },
    { key: 'finalYearPlaced', header: 'FINAL YEAR PLACED', width: 20 },
    { key: 'hackathon', header: 'HACKATHON PARTICIPATION', width: 25 },
    { key: 'symposium', header: 'SYMPOSIUM PARTICIPATION', width: 25 },
    { key: 'otherState', header: 'PROGRAM ATTENDED IN OTHER STATE', width: 26 },
    { key: 'extension', header: 'EXTENSION ACTIVITIES', width: 23 },
    { key: 'extraCurricular', header: 'EXTRA CURRICULAR', width: 23 },
    { key: 'award', header: 'AWARD', width: 24 },
  ];

  columns.forEach((col, index) => {
    ws.getColumn(index + 1).width = col.width;
  });

  const headerRow = ws.getRow(6);
  headerRow.height = 36;
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: INSTITUTIONAL_NAVY } },
      bottom: { style: 'medium', color: { argb: INSTITUTIONAL_NAVY } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });

  // Enable Excel Auto-Filter on Table Headers (A6:P6)
  ws.autoFilter = { from: 'A6', to: 'P6' };

  // Section 3: Data Mapping & Population (Rows 7+)
  let currentRowIndex = 7;
  const romanYears = ['', 'I', 'II', 'III', 'IV'];

  students.forEach((student, index) => {
    const sId = student._id.toString();
    const stuAcademics = academicsMap.get(sId) || [];
    const stuDocs = documentsMap.get(sId) || [];
    const stuCounselling = counsellingMap.get(sId) || [];
    const stuProgress = progressMap.get(sId) || [];
    const stuStudentProgress = studentProgressMap.get(sId) || [];

    // 1. ALL CLEAR Calculation
    const arrearStats = calculateArrearStatistics(
      stuAcademics,
      student.clearedSubjects || [],
      student.arrearHistory || []
    );

    let allClearDisplay = 'ALL CLEAR';
    if (arrearStats.activeArrearsCount > 0) {
      allClearDisplay = `${arrearStats.activeArrearsCount} ${arrearStats.activeArrearsCount === 1 ? 'ARREAR' : 'ARREARS'}`;
    }

    // 2. Class & Section
    const yr = student.year ? (romanYears[student.year] || String(student.year)) : 'III';
    const deptCode = (student.department as any)?.code || (faculty?.department as any)?.code || 'IT';
    const section = student.section || 'A';
    const classSection = `${yr} ${deptCode} ${section}`.trim();

    // 3. NPTEL Completed (Prioritize StudentProgress collection)
    const nptelProgress = getProgressCategoryEntries(stuStudentProgress, 'NPTEL Certificate');
    const nptelDocs = stuDocs.filter(
      (d) =>
        d.category === 'NPTEL Certificate' ||
        (d.title && /nptel/i.test(d.title)) ||
        (d.eventName && /nptel/i.test(d.eventName))
    );
    let nptelValue = 'NIL';
    if (nptelProgress.length > 0) {
      nptelValue = nptelProgress.join('\n');
    } else if (nptelDocs.length > 0) {
      nptelValue = nptelDocs
        .map((d) => (d.title || d.eventName || 'NPTEL Certified').trim())
        .filter(Boolean)
        .join('\n');
    } else if ((student as any).nptelCourses && Array.isArray((student as any).nptelCourses) && (student as any).nptelCourses.length > 0) {
      nptelValue = (student as any).nptelCourses.filter(Boolean).join('\n') || 'NIL';
    }

    // 4. Global Certification (Prioritize StudentProgress collection)
    const globalCertProgress = getProgressCategoryEntries(stuStudentProgress, 'Global Certification');
    const globalCertDocs = stuDocs.filter(
      (d) =>
        d.category === 'Global Certification' ||
        d.category === 'MOOC Certificate' ||
        (d.title && /aws|azure|oracle|gcp|cisco|redhat|certification|meta|coursera/i.test(d.title))
    );
    let globalCertValue = 'NIL';
    if (globalCertProgress.length > 0) {
      globalCertValue = globalCertProgress.join('\n');
    } else if (globalCertDocs.length > 0) {
      globalCertValue = globalCertDocs
        .map((d) => (d.title || d.eventName || 'Certified').trim())
        .filter(Boolean)
        .join('\n');
    } else if ((student as any).globalCertifications && Array.isArray((student as any).globalCertifications) && (student as any).globalCertifications.length > 0) {
      globalCertValue = (student as any).globalCertifications.filter(Boolean).join('\n') || 'NIL';
    }

    // 5. Final Year Placed
    let placementValue = 'NIL';
    const isFinalYear = student.year === 4;
    // Check monthly progress placement notes
    const progressWithPlacement = stuProgress.find(
      (p) =>
        (p.placementNotes && /placed|offer|selected|opted/i.test(p.placementNotes)) ||
        (p.placementRating && p.placementRating >= 4)
    );
    // Check counselling career development records
    const careerCounselling = stuCounselling.find(
      (c) =>
        (c.categories && c.categories.includes('Career Development')) ||
        (c.correctiveAction && /placed|offer|campus recruitment/i.test(c.correctiveAction)) ||
        (c.challengeObserved && /placed|offer/i.test(c.challengeObserved))
    );
    // Check internship / placement documents
    const placementDoc = stuDocs.find(
      (d) =>
        (d.title && /offer letter|placement|internship/i.test(d.title)) ||
        d.category === 'Internship Certificate'
    );

    if ((student as any).placementStatus) {
      placementValue = (student as any).placementStatus;
    } else if (progressWithPlacement && progressWithPlacement.placementNotes) {
      placementValue = progressWithPlacement.placementNotes.includes('Placed')
        ? progressWithPlacement.placementNotes
        : `PLACED (${progressWithPlacement.placementNotes})`;
    } else if (placementDoc) {
      placementValue = `PLACED (${placementDoc.title || 'Campus Placement'})`;
    } else if (careerCounselling && /placed/i.test(careerCounselling.challengeObserved || careerCounselling.correctiveAction || '')) {
      placementValue = 'PLACED';
    } else if (isFinalYear) {
      placementValue = 'NOT PLACED';
    } else {
      placementValue = 'NIL';
    }

    // 6. Hackathon Participation (Prioritize StudentProgress collection)
    const hackathonProgress = getProgressCategoryEntries(stuStudentProgress, 'Hackathon Certificate');
    const hackathonDocs = stuDocs.filter(
      (d) =>
        d.category === 'Hackathon Certificate' ||
        d.category === 'SIH Certificate' ||
        (d.title && /hackathon|sih|codeathon/i.test(d.title)) ||
        (d.eventName && /hackathon|sih|codeathon/i.test(d.eventName))
    );
    let hackathonValue = 'NIL';
    if (hackathonProgress.length > 0) {
      hackathonValue = hackathonProgress.join('\n');
    } else if (hackathonDocs.length > 0) {
      hackathonValue = hackathonDocs
        .map((d) => (d.title || d.eventName || 'Hackathon Participation').trim())
        .filter(Boolean)
        .join('\n');
    } else if ((student as any).hackathons && Array.isArray((student as any).hackathons) && (student as any).hackathons.length > 0) {
      hackathonValue = (student as any).hackathons.filter(Boolean).join('\n') || 'NIL';
    }

    // 7. Symposium Participation (Prioritize StudentProgress collection)
    const symposiumProgress = getProgressCategoryEntries(stuStudentProgress, 'Symposium Certificate');
    const symposiumDocs = stuDocs.filter(
      (d) =>
        d.category === 'Symposium' ||
        d.category === 'Symposium Certificate' ||
        d.category === 'Paper Presentation' ||
        (d.title && /symposium|paper presentation/i.test(d.title)) ||
        (d.eventName && /symposium|paper presentation/i.test(d.eventName))
    );
    let symposiumValue = 'NIL';
    if (symposiumProgress.length > 0) {
      symposiumValue = symposiumProgress.join('\n');
    } else if (symposiumDocs.length > 0) {
      symposiumValue = symposiumDocs
        .map((d) => (d.title || d.eventName || 'Symposium').trim())
        .filter(Boolean)
        .join('\n');
    } else if ((student as any).symposiums && Array.isArray((student as any).symposiums) && (student as any).symposiums.length > 0) {
      symposiumValue = (student as any).symposiums.filter(Boolean).join('\n') || 'NIL';
    }

    // 8. Program Attended in Other State (Prioritize StudentProgress collection)
    const otherStateProgress = getProgressCategoryEntries(stuStudentProgress, 'Program attended in other state');
    const otherStateDocs = stuDocs.filter((d) => {
      const text = `${d.title} ${d.eventName} ${d.organizer} ${d.description}`.toLowerCase();
      return (
        text.includes('other state') ||
        text.includes('inter-state') ||
        text.includes('karnataka') ||
        text.includes('kerala') ||
        text.includes('andhra') ||
        text.includes('telangana') ||
        text.includes('delhi') ||
        text.includes('maharashtra') ||
        text.includes('bengaluru') ||
        text.includes('bangalore') ||
        text.includes('hyderabad') ||
        text.includes('mumbai')
      );
    });
    let otherStateValue = 'NIL';
    if (otherStateProgress.length > 0) {
      otherStateValue = otherStateProgress.join('\n');
    } else if (otherStateDocs.length > 0) {
      otherStateValue = otherStateDocs
        .map((d) => (d.title || d.eventName || 'External State Event').trim())
        .filter(Boolean)
        .join('\n');
    } else if ((student as any).otherStatePrograms && Array.isArray((student as any).otherStatePrograms) && (student as any).otherStatePrograms.length > 0) {
      otherStateValue = (student as any).otherStatePrograms.filter(Boolean).join('\n') || 'NIL';
    }

    // 9. Extension Activities (Prioritize StudentProgress collection)
    const extensionProgress = getProgressCategoryEntries(stuStudentProgress, 'Extension Activity');
    const extensionDocs = stuDocs.filter((d) => {
      const text = `${d.title} ${d.eventName} ${d.category} ${d.description}`.toLowerCase();
      return (
        d.category === 'Extension Activity' ||
        text.includes('nss') ||
        text.includes('ncc') ||
        text.includes('yrc') ||
        text.includes('rotaract') ||
        text.includes('red cross') ||
        text.includes('community service') ||
        text.includes('blood donation') ||
        text.includes('plantation')
      );
    });
    let extensionValue = 'NIL';
    if (extensionProgress.length > 0) {
      extensionValue = extensionProgress.join('\n');
    } else if (extensionDocs.length > 0) {
      extensionValue = extensionDocs
        .map((d) => (d.title || d.eventName || 'Community / Extension').trim())
        .filter(Boolean)
        .join('\n');
    } else if ((student as any).extensionActivities && Array.isArray((student as any).extensionActivities) && (student as any).extensionActivities.length > 0) {
      extensionValue = (student as any).extensionActivities.filter(Boolean).join('\n') || 'NIL';
    }

    // 10. Extra Curricular (Prioritize StudentProgress collection)
    const extraCurrProgress = [
      ...getProgressCategoryEntries(stuStudentProgress, 'Extra Curricular'),
      ...getProgressCategoryEntries(stuStudentProgress, 'Event Certificate'),
    ];
    const ecDocs = stuDocs.filter((d) => {
      const text = `${d.title} ${d.eventName} ${d.category} ${d.description}`.toLowerCase();
      return (
        d.category === 'Extra Curricular' ||
        d.category === 'Event Certificate' ||
        text.includes('sports') ||
        text.includes('badminton') ||
        text.includes('cricket') ||
        text.includes('football') ||
        text.includes('athletics') ||
        text.includes('cultural') ||
        text.includes('music') ||
        text.includes('dance') ||
        text.includes('drama')
      );
    });
    const ecCounselling = stuCounselling.filter(
      (c) =>
        c.categories &&
        (c.categories.includes('Extra-Curricular Activities') || c.categories.includes('Personal Development'))
    );
    const ecProgress = stuProgress.find((p) => p.ecNotes && p.ecNotes.trim() && p.ecNotes !== 'Active participation.');

    let extraCurricularValue = 'NIL';
    if (extraCurrProgress.length > 0) {
      extraCurricularValue = extraCurrProgress.join('\n');
    } else if (ecDocs.length > 0) {
      extraCurricularValue = ecDocs.map((d) => (d.title || d.eventName).trim()).filter(Boolean).join('\n');
    } else if (ecProgress && ecProgress.ecNotes) {
      extraCurricularValue = ecProgress.ecNotes;
    } else if (ecCounselling.length > 0 && ecCounselling[0].correctiveAction) {
      extraCurricularValue = ecCounselling[0].correctiveAction;
    } else if ((student as any).extraCurricular && Array.isArray((student as any).extraCurricular) && (student as any).extraCurricular.length > 0) {
      extraCurricularValue = (student as any).extraCurricular.filter(Boolean).join('\n') || 'NIL';
    }

    // 11. Award (Prioritize StudentProgress collection)
    const awardProgress = getProgressCategoryEntries(stuStudentProgress, 'Award Certificate');
    const awardDocs = stuDocs.filter(
      (d) =>
        d.category === 'Award' ||
        d.category === 'Award Certificate' ||
        d.category === 'Achievement' ||
        (d.title && /prize|winner|runner|award|first place|gold medal/i.test(d.title)) ||
        (d.description && /prize|winner|award/i.test(d.description))
    );
    let awardValue = 'NIL';
    if (awardProgress.length > 0) {
      awardValue = awardProgress.join('\n');
    } else if (awardDocs.length > 0) {
      awardValue = awardDocs
        .map((d) => (d.title || d.eventName || 'Award / Prize').trim())
        .filter(Boolean)
        .join('\n');
    } else if ((student as any).awards && Array.isArray((student as any).awards) && (student as any).awards.length > 0) {
      awardValue = (student as any).awards.filter(Boolean).join('\n') || 'NIL';
    }

    // Populate Row
    const dataRow = ws.getRow(currentRowIndex);

    // Compute dynamic row height based on multi-line cell entries
    const maxCellLines = Math.max(
      1,
      nptelValue.split('\n').length,
      globalCertValue.split('\n').length,
      hackathonValue.split('\n').length,
      symposiumValue.split('\n').length,
      otherStateValue.split('\n').length,
      extensionValue.split('\n').length,
      extraCurricularValue.split('\n').length,
      awardValue.split('\n').length
    );
    dataRow.height = Math.max(24, Math.min(120, maxCellLines * 18));

    const mentorMapping = assignmentMentorMap.get(sId);
    const rowMentorSNo = mentorMapping ? mentorMapping.mentorSNo : 1;
    const rowMentorName = mentorMapping ? mentorMapping.mentorName : mentorName;
    const rowStudentSNo = mentorMapping ? mentorMapping.studentSNo : index + 1;

    const rowValues = [
      rowMentorSNo, // Mentor S.No
      rowMentorName, // Mentor Name
      rowStudentSNo, // Student S.No (1, 2, 3...)
      String(student.registerNumber), // Text format preserved
      student.fullName,
      classSection,
      safeNil(nptelValue),
      safeNil(globalCertValue),
      allClearDisplay,
      safeNil(placementValue),
      safeNil(hackathonValue),
      safeNil(symposiumValue),
      safeNil(otherStateValue),
      safeNil(extensionValue),
      safeNil(extraCurricularValue),
      safeNil(awardValue),
    ];

    rowValues.forEach((val, cIndex) => {
      const cell = dataRow.getCell(cIndex + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 9.5 };

      // Explicit string format for Register Number to prevent numeric scientific notation
      if (cIndex === 3) {
        cell.numFmt = '@';
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (cIndex === 0 || cIndex === 2 || cIndex === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (cIndex === 8) {
        // ALL CLEAR Column Highlighting
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (val === 'ALL CLEAR') {
          cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF059669' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        } else {
          cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
        }
      } else if (cIndex === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (typeof val === 'string' && val.includes('PLACED') && !val.includes('NOT')) {
          cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0D9488' } };
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }

      // Zebra striping for non-highlighted cells
      if (cIndex !== 8) {
        if (index % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_ROW_FILL } };
        }
      }

      cell.border = {
        top: { style: 'thin', color: { argb: BORDER_COLOR } },
        bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
        left: { style: 'thin', color: { argb: BORDER_COLOR } },
        right: { style: 'thin', color: { argb: BORDER_COLOR } },
      };
    });

    currentRowIndex++;
  });

  // ==========================================
  // SHEET 2: COUNSELLING RECORDS (Section 6)
  // ==========================================
  const wsCounselling = workbook.addWorksheet('COUNSELLING RECORDS', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }],
  });

  // Sheet 2 Title Block
  wsCounselling.mergeCells('A1:H1');
  const cr1 = wsCounselling.getCell('A1');
  cr1.value = 'K.S.R. COLLEGE OF ENGINEERING (AUTONOMOUS)';
  cr1.font = { name: 'Calibri', size: 12, bold: true, color: { argb: INSTITUTIONAL_NAVY } };
  cr1.alignment = { vertical: 'middle', horizontal: 'center' };

  wsCounselling.mergeCells('A2:H2');
  const cr2 = wsCounselling.getCell('A2');
  cr2.value = `DEPARTMENT OF ${departmentName.toUpperCase()} - MENTEE COUNSELLING SESSIONS`;
  cr2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: INSTITUTIONAL_BLUE } };
  cr2.alignment = { vertical: 'middle', horizontal: 'center' };

  wsCounselling.mergeCells('A3:H3');
  const cr3 = wsCounselling.getCell('A3');
  cr3.value = `MENTOR: ${mentorName.toUpperCase()}   |   ACADEMIC YEAR: ${academicYear}`;
  cr3.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF374151' } };
  cr3.alignment = { vertical: 'middle', horizontal: 'center' };

  wsCounselling.getRow(4).height = 6;

  // Counselling Table Headers (Row 5)
  const cHeaders = [
    { header: 'S.NO', width: 7 },
    { header: 'REG NUMBER', width: 17 },
    { header: 'STUDENT NAME', width: 25 },
    { header: 'SESSION DATE', width: 15 },
    { header: 'COUNSELLING CATEGORIES (5 DOMAINS)', width: 34 },
    { header: 'CHALLENGE OBSERVED', width: 32 },
    { header: 'CORRECTIVE ACTION & ACTION PLAN', width: 35 },
    { header: 'STATUS', width: 14 },
  ];

  cHeaders.forEach((col, index) => {
    wsCounselling.getColumn(index + 1).width = col.width;
    const cell = wsCounselling.getRow(5).getCell(index + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = {
      top: { style: 'medium', color: { argb: INSTITUTIONAL_NAVY } },
      bottom: { style: 'medium', color: { argb: INSTITUTIONAL_NAVY } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });
  wsCounselling.getRow(5).height = 32;
  wsCounselling.autoFilter = { from: 'A5', to: 'H5' };

  // Populate Counselling Records for these Mentees
  let cRowIdx = 6;
  let cSeq = 1;

  students.forEach((student) => {
    const sId = student._id.toString();
    const records = counsellingMap.get(sId) || [];

    records.forEach((cr) => {
      // Readable comma-separated categories (Requirement 6)
      let categoriesStr = 'Academic Development';
      if (Array.isArray(cr.categories) && cr.categories.length > 0) {
        categoriesStr = cr.categories.join(', ');
      } else if (cr.category) {
        categoriesStr = cr.category;
      }

      const row = wsCounselling.getRow(cRowIdx);
      row.height = 24;

      const cVals = [
        cSeq++,
        String(student.registerNumber),
        student.fullName,
        cr.sessionDate || cr.date || '—',
        categoriesStr,
        cr.challengeObserved || cr.discussionObservation || 'Regular review',
        cr.correctiveAction || cr.actionPlan || 'Standard guidance provided',
        cr.status || 'Completed',
      ];

      cVals.forEach((val, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 9 };
        if (idx === 0 || idx === 1 || idx === 3 || idx === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (idx === 1) cell.numFmt = '@';
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: BORDER_COLOR } },
          bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
          left: { style: 'thin', color: { argb: BORDER_COLOR } },
          right: { style: 'thin', color: { argb: BORDER_COLOR } },
        };
      });

      cRowIdx++;
    });
  });

  if (cSeq === 1) {
    const emptyRow = wsCounselling.getRow(6);
    wsCounselling.mergeCells('A6:H6');
    const emptyCell = emptyRow.getCell(1);
    emptyCell.value = 'No counselling sessions recorded yet for assigned mentees.';
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
    emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  }

  // ==========================================
  // SHEET 3: STUDENT DOCUMENTS & CERTS (Section 7)
  // ==========================================
  const wsDocs = workbook.addWorksheet('STUDENT CERTIFICATES', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }],
  });

  wsDocs.mergeCells('A1:H1');
  const dr1 = wsDocs.getCell('A1');
  dr1.value = 'K.S.R. COLLEGE OF ENGINEERING (AUTONOMOUS)';
  dr1.font = { name: 'Calibri', size: 12, bold: true, color: { argb: INSTITUTIONAL_NAVY } };
  dr1.alignment = { vertical: 'middle', horizontal: 'center' };

  wsDocs.mergeCells('A2:H2');
  const dr2 = wsDocs.getCell('A2');
  dr2.value = `DEPARTMENT OF ${departmentName.toUpperCase()} - MENTEE CERTIFICATES & DOCUMENTS`;
  dr2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: INSTITUTIONAL_BLUE } };
  dr2.alignment = { vertical: 'middle', horizontal: 'center' };

  wsDocs.mergeCells('A3:H3');
  const dr3 = wsDocs.getCell('A3');
  dr3.value = `MENTOR: ${mentorName.toUpperCase()}   |   ACADEMIC YEAR: ${academicYear}`;
  dr3.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF374151' } };
  dr3.alignment = { vertical: 'middle', horizontal: 'center' };

  wsDocs.getRow(4).height = 6;

  const docHeaders = [
    { header: 'S.NO', width: 7 },
    { header: 'REG NUMBER', width: 17 },
    { header: 'STUDENT NAME', width: 25 },
    { header: 'DOCUMENT TITLE', width: 28 },
    { header: 'CATEGORY', width: 24 },
    { header: 'EVENT / COURSE / ORGANIZER', width: 30 },
    { header: 'DATE', width: 14 },
    { header: 'VERIFICATION STATUS', width: 20 },
  ];

  docHeaders.forEach((col, index) => {
    wsDocs.getColumn(index + 1).width = col.width;
    const cell = wsDocs.getRow(5).getCell(index + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = {
      top: { style: 'medium', color: { argb: INSTITUTIONAL_NAVY } },
      bottom: { style: 'medium', color: { argb: INSTITUTIONAL_NAVY } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });
  wsDocs.getRow(5).height = 32;
  wsDocs.autoFilter = { from: 'A5', to: 'H5' };

  let dRowIdx = 6;
  let dSeq = 1;

  students.forEach((student) => {
    const sId = student._id.toString();
    const docs = documentsMap.get(sId) || [];

    docs.forEach((d) => {
      const row = wsDocs.getRow(dRowIdx);
      row.height = 22;

      const dVals = [
        dSeq++,
        String(student.registerNumber),
        student.fullName,
        d.title || d.fileName || 'Certificate',
        d.category || 'Other',
        [d.eventName, d.organizer].filter(Boolean).join(' - ') || '—',
        d.eventDate || (d.uploadedAt ? new Date(d.uploadedAt).toISOString().split('T')[0] : '—'),
        d.verificationStatus || 'Pending',
      ];

      dVals.forEach((val, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 9 };
        if (idx === 0 || idx === 1 || idx === 6 || idx === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (idx === 1) cell.numFmt = '@';
          if (idx === 7) {
            cell.font = {
              name: 'Calibri',
              size: 9,
              bold: true,
              color: { argb: val === 'Verified' ? 'FF059669' : val === 'Rejected' ? 'FFDC2626' : 'FFD97706' },
            };
          }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: BORDER_COLOR } },
          bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
          left: { style: 'thin', color: { argb: BORDER_COLOR } },
          right: { style: 'thin', color: { argb: BORDER_COLOR } },
        };
      });

      dRowIdx++;
    });

    // Also include Student Progress achievement submissions in Sheet 3
    const progressRecords = studentProgressMap.get(sId) || [];
    progressRecords.forEach((p) => {
      const row = wsDocs.getRow(dRowIdx);
      row.height = 22;

      const dVals = [
        dSeq++,
        String(student.registerNumber),
        student.fullName,
        p.activityName || p.fileName || 'Achievement',
        p.category || 'Other',
        [p.eventName, p.organization].filter(Boolean).join(' - ') || '—',
        p.date || (p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : '—'),
        p.status || 'Pending',
      ];

      dVals.forEach((val, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 9 };
        if (idx === 0 || idx === 1 || idx === 6 || idx === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (idx === 1) cell.numFmt = '@';
          if (idx === 7) {
            cell.font = {
              name: 'Calibri',
              size: 9,
              bold: true,
              color: { argb: val === 'Verified' ? 'FF059669' : val === 'Rejected' ? 'FFDC2626' : 'FFD97706' },
            };
          }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: BORDER_COLOR } },
          bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
          left: { style: 'thin', color: { argb: BORDER_COLOR } },
          right: { style: 'thin', color: { argb: BORDER_COLOR } },
        };
      });

      dRowIdx++;
    });
  });

  if (dSeq === 1) {
    const emptyRow = wsDocs.getRow(6);
    wsDocs.mergeCells('A6:H6');
    const emptyCell = emptyRow.getCell(1);
    emptyCell.value = 'No documents or certificates uploaded yet for assigned mentees.';
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
    emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  }

  // Section 9: Meaningful File Name Generation
  // Format: KSRCE_Mentor_Mentee_List_[MentorName]_[AcademicYear].xlsx
  const sanitizedMentor = sanitizeFileName(mentorName);
  const sanitizedYear = sanitizeFileName(academicYear);
  const filename = `KSRCE_Mentor_Mentee_List_${sanitizedMentor}_${sanitizedYear}.xlsx`;

  // Write ExcelJS workbook to binary buffer
  const rawBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(rawBuffer);

  return {
    count: students.length,
    buffer,
    filename,
    mentorName,
    departmentName,
    academicYear,
  };
}
