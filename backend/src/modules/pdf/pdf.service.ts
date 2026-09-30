import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import {
  Student,
  AcademicRecord,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  MonthlyProgress,
  StudentDocument,
} from '../../models/index.js';
import { calculateArrearStatistics } from '../../utils/arrears.util.js';
// Reuse the single existing uploads abstraction (traversal-safe). Documents are
// read through it, never through a second, parallel storage resolution.
import { resolveStoredUploadPath } from '../../config/storage.js';

let logoBase64: string | null = null;
try {
  const logoPath = path.resolve(process.cwd(), 'assets', 'ksrce-logo.png');
  if (fs.existsSync(logoPath)) {
    logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  }
} catch (e) {
  // gracefully fallback if logo unavailable
}

export async function generateStudentPdf(studentIdOrRegNo: string): Promise<Uint8Array> {
  // 1. Fetch Student Master
  let studentDoc: any = null;
  if (mongoose.Types.ObjectId.isValid(studentIdOrRegNo)) {
    studentDoc = await Student.findById(studentIdOrRegNo).populate('department').populate('batch');
  }
  if (!studentDoc) {
    studentDoc = await Student.findOne({ registerNumber: studentIdOrRegNo }).populate('department').populate('batch');
  }

  if (!studentDoc) {
    throw new Error('Student record not found.');
  }

  const dept = studentDoc.department || {};
  const batch = studentDoc.batch || {};

  const student = {
    id: studentDoc._id.toString(),
    _id: studentDoc._id.toString(),
    register_number: studentDoc.registerNumber,
    full_name: studentDoc.fullName,
    department_name: dept.name || '',
    department_code: dept.code || '',
    batch_name: batch.name || '',
    year: studentDoc.year ? `Year ${studentDoc.year}` : '',
    section: studentDoc.section || '',
    residential_type: studentDoc.residentialType || 'DAY_SCHOLAR',
    blood_group: studentDoc.bloodGroup || 'B+ve',
    mobile_number: studentDoc.mobileNumber || '',
    email: studentDoc.email || '',
    dob: studentDoc.dob || '',
    address: studentDoc.address || '',
  };

  // 2. Fetch Parent Details
  const p = studentDoc.parent || {};
  const parent = {
    father_name: p.fatherName || '',
    father_contact: p.fatherContact || '',
    father_occupation: p.fatherOccupation || '',
    mother_name: p.motherName || '',
    mother_contact: p.motherContact || '',
    mother_occupation: p.motherOccupation || '',
  };

  // 3. Sibling Details
  const siblings = studentDoc.siblings || [];

  // 4. School Details
  const sc = studentDoc.school || {};
  const school = {
    tenth_mark: sc.tenthMark,
    tenth_school: sc.tenthSchool || '',
    twelfth_mark: sc.twelfthMark,
    twelfth_school: sc.twelfthSchool || '',
    cutoff_mark: sc.cutoffMark,
    admission_type: studentDoc.admissionType || sc.admissionType || 'COUNSELLING',
    scholarship_details: studentDoc.scholarshipDetails || sc.scholarshipDetails || '',
    // Lateral entry data is stored on the `school` subdocument. The previous
    // code read `student.lateralEntry`, which never existed, so the PDF always
    // printed "N/A" for lateral-entry students.
    lateral_entry: sc.lateralEntry || null,
  };

  // 5. Fetch Semesters 1 to 8
  const semesterDocs = await AcademicRecord.find({ student: studentDoc._id }).sort({ semesterNumber: 1 });
  const arrearStats = calculateArrearStatistics(
    semesterDocs,
    studentDoc.clearedSubjects || [],
    studentDoc.arrearHistory || []
  );
  const semesters = arrearStats.formattedSemesters;

  // 6. Current Mentor
  const activeAsgDoc: any = await MentorAssignment.findOne({
    student: studentDoc._id,
    status: 'ACTIVE',
  }).populate({ path: 'mentor', populate: { path: 'user' } });

  let currentMentor: any = null;
  if (activeAsgDoc) {
    const m = activeAsgDoc.mentor || {};
    const u = m.user || {};
    currentMentor = {
      assigned_from: activeAsgDoc.assignedFrom,
      employee_id: m.employeeId || '',
      designation: m.designation || '',
      cabin_location: m.cabinLocation || '',
      phone_number: m.phoneNumber || '',
      mentor_name: u.fullName || 'Faculty Mentor',
      mentor_email: u.email || '',
    };
  }

  // 7. Mentor History Lineage
  const asgDocs = await MentorAssignment.find({ student: studentDoc._id })
    .populate({ path: 'mentor', populate: { path: 'user' } })
    .populate('assignedBy')
    .sort({ createdAt: 1 });

  const mentorHistory = asgDocs.map((ma: any) => {
    const m = ma.mentor || {};
    const u = m.user || {};
    const assigner = ma.assignedBy || {};
    return {
      assigned_from: ma.assignedFrom,
      assigned_until: ma.assignedUntil,
      status: ma.status,
      change_reason: ma.changeReason,
      created_at: ma.createdAt,
      employee_id: m.employeeId || '',
      designation: m.designation || '',
      mentor_name: u.fullName || 'Faculty Mentor',
      assigned_by_name: assigner.fullName || 'Administrator',
    };
  });

  // 8. Saturday Meeting History
  const meetingDocs = await Meeting.find({ student: studentDoc._id })
    .populate({ path: 'mentor', populate: { path: 'user' } })
    .sort({ meetingDate: 1 });

  const meetings = meetingDocs.map((m: any) => {
    const mentorUser = (m.mentor as any)?.user || {};
    return {
      meeting_date: m.meetingDate,
      meeting_time: m.meetingTime,
      location: m.location,
      attendance_status: m.attendanceStatus,
      meeting_status: m.meetingStatus,
      challenges_discussed: m.challengesDiscussed || '',
      student_feedback: m.studentFeedback || '',
      counselling_provided: m.counsellingProvided || '',
      corrective_action: m.correctiveAction || '',
      mentor_remarks: m.mentorRemarks || '',
      mentor_name: mentorUser.fullName || '',
    };
  });

  // 9. Counselling Records
  const counsellingDocs = await CounsellingRecord.find({ student: studentDoc._id })
    .populate({ path: 'mentor', populate: { path: 'user' } })
    .sort({ sessionDate: 1 });

  const counsellingRecords = counsellingDocs.map((c: any) => {
    const mentorUser = (c.mentor as any)?.user || {};
    return {
      session_date: c.sessionDate,
      category: c.category,
      challenge_observed: c.challengeObserved,
      corrective_action: c.correctiveAction,
      student_feedback: c.studentFeedback || '',
      mentor_remarks: c.mentorRemarks || '',
      mentor_name: mentorUser.fullName || '',
    };
  });

  // 10. Monthly Progress Records
  const progressDocs = await MonthlyProgress.find({ student: studentDoc._id })
    .populate({ path: 'mentor', populate: { path: 'user' } })
    .sort({ createdAt: 1 });

  const monthlyProgress = progressDocs.map((mp: any) => {
    const mentorUser = (mp.mentor as any)?.user || {};
    return {
      month_name: mp.monthName,
      academic_year: mp.academicYear,
      academic_rating: mp.academicRating,
      academic_notes: mp.academicNotes || '',
      placement_rating: mp.placementRating,
      placement_notes: mp.placementNotes || '',
      ec_rating: mp.ecRating,
      ec_notes: mp.ecNotes || '',
      innovation_rating: mp.innovationRating,
      innovation_notes: mp.innovationNotes || '',
      skill_rating: mp.skillRating,
      skill_notes: mp.skillNotes || '',
      mentor_name: mentorUser.fullName || '',
    };
  });

  // 11. Student Documents (uploaded certificates + the system Student Details Form)
  //
  // This is the data that was previously missing entirely: the record book read
  // only academic/profile data, so documents uploaded through Student Documents
  // appeared in the portal but never in the Official Institutional Record Book.
  // Scoped strictly by this student's id, so a record book can only ever contain
  // the documents of the student it was generated for.
  const documentDocs = await StudentDocument.find({ studentId: studentDoc._id }).sort({
    isPrimary: -1,
    uploadedAt: -1,
  });

  const formatDocDate = (value: any): string => {
    if (!value) return '';
    const dt = value instanceof Date ? value : new Date(value);
    if (isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const studentDocuments = documentDocs.map((d: any) => {
    // The system-generated Student Details Form IS this very dossier: it is
    // written to disk by syncStudentDetailsPdf() as the output of
    // generateStudentPdf(). It is listed for completeness but must never be
    // embedded, or each regeneration would embed the previous one and grow
    // without bound.
    const isSystemForm = Boolean(d.isPrimary) || d.documentType === 'student_details_form';
    const eventDetails = [d.eventName, d.organizer, d.eventDate].filter(Boolean).join(' | ');
    return {
      id: d._id.toString(),
      title: d.title || d.fileName || 'Document',
      file_name: d.fileName || d.title || 'Document',
      document_type: isSystemForm
        ? 'Student Details Form'
        : d.documentType === 'other'
          ? 'Other Document'
          : 'Certificate',
      category: d.category || 'Other',
      event_details: eventDetails || d.description || 'N/A',
      uploaded_on: formatDocDate(d.uploadedAt),
      verification_status: d.verificationStatus || 'Pending',
      is_system_form: isSystemForm,
      file_type: d.fileType || 'application/pdf',
      file_size: d.fileSize || 0,
      file_url: d.fileUrl || '',
    };
  });

  // Initialize jsPDF (Portrait, A4, millimeters)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const primaryColor: [number, number, number] = [11, 37, 69]; // #0B2545 KSRCE Navy
  const goldColor: [number, number, number] = [197, 155, 39]; // #C59B27 KSRCE Gold
  const darkTextColor: [number, number, number] = [33, 37, 41];
  const lightBg: [number, number, number] = [245, 247, 250];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  const renderHeader = (isFirstPage: boolean = false) => {
    // Institutional Top Header
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(margin, 10, pageWidth - margin * 2, 2.5, 'F');

    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', margin + 2, 13.5, 17, 17);
      } catch (err) {
        // Continue if image rendering fails
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('K.S.R. COLLEGE OF ENGINEERING', pageWidth / 2, 17, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text('(An Autonomous Institution, Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai)', pageWidth / 2, 21, { align: 'center' });
    doc.text('K.S.R. Kalvi Nagar, Tiruchengode – 637 215, Namakkal District, Tamil Nadu | www.ksrce.ac.in', pageWidth / 2, 25, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    doc.text('OFFICIAL DIGITAL MENTOR–MENTEE RECORD BOOK', pageWidth / 2, 30.5, { align: 'center' });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, 33, pageWidth - margin, 33);
  };

  // Render First Page Header
  renderHeader(true);

  // Student Primary Dossier Banner
  let currentY = 37;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 22, 2, 2, 'F');
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 22, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`STUDENT: ${student.full_name.toUpperCase()}`, margin + 4, currentY + 6);
  doc.text(`REGISTER NO: ${student.register_number}`, pageWidth - margin - 4, currentY + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text(`Department: B.E. ${student.department_name} (${student.department_code})`, margin + 4, currentY + 12);
  const acadExtra = [student.batch_name, student.year, student.section ? `Sec ${student.section}` : ''].filter(Boolean).join(' • ');
  doc.text(`Academic Batch: ${acadExtra}`, pageWidth - margin - 4, currentY + 12, { align: 'right' });

  doc.text(`Residential: ${student.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}  |  Blood Group: ${student.blood_group || 'N/A'}  |  Mobile: ${student.mobile_number || 'N/A'}`, margin + 4, currentY + 18);
  doc.text(`Active Mentor: ${currentMentor ? currentMentor.mentor_name : 'Pending Allocation'}`, pageWidth - margin - 4, currentY + 18, { align: 'right' });

  currentY += 27;

  // SECTION 1: PERSONAL & FAMILY INFORMATION
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [[{ content: '1. PERSONAL & FAMILY INFORMATION', colSpan: 4, styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' } }]],
    body: [
      [
        { content: 'Date of Birth:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        student.dob || 'Not specified',
        { content: 'Email Address:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        student.email || 'N/A',
      ],
      [
        { content: "Father's Name:", styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        parent?.father_name || 'N/A',
        { content: 'Father Contact & Job:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        `${parent?.father_contact || 'N/A'} (${parent?.father_occupation || 'N/A'})`,
      ],
      [
        { content: "Mother's Name:", styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        parent?.mother_name || 'N/A',
        { content: 'Mother Contact & Job:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        `${parent?.mother_contact || 'N/A'} (${parent?.mother_occupation || 'N/A'})`,
      ],
      [
        { content: 'Permanent Address:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        { content: student.address || 'KSRCE Campus / Tiruchengode', colSpan: 3 },
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // SECTION 2: ADMISSION & SCHOOLING DETAILS
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [[{ content: '2. SCHOOLING & ADMISSION PARTICULARS', colSpan: 4, styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' } }]],
    body: [
      [
        { content: '10th Mark & School:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        `${school?.tenth_mark ? `${school.tenth_mark}/500` : 'N/A'} — ${school?.tenth_school || 'N/A'}`,
        { content: '12th Mark & School:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        `${school?.twelfth_mark ? `${school.twelfth_mark}/600` : 'N/A'} — ${school?.twelfth_school || 'N/A'}`,
      ],
      [
        { content: 'TNEA Cut-off Mark:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        school?.cutoff_mark ? `${school.cutoff_mark} / 200` : 'N/A',
        { content: 'Admission Mode:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        school?.admission_type === 'LATERAL_ENTRY' ? 'LATERAL ENTRY' : school?.admission_type === 'MANAGEMENT' ? 'MANAGEMENT' : 'COUNSELLING',
      ],
      ...(school?.admission_type === 'LATERAL_ENTRY' && school?.lateral_entry ? [
        [
          { content: 'Lateral Entry College:', styles: { fontStyle: 'bold' as const, fillColor: [248, 249, 250] } },
          `${school.lateral_entry.previousCollegeName || school.lateral_entry.previousInstitution || 'N/A'}`,
          { content: 'Previous Course / Diploma:', styles: { fontStyle: 'bold' as const, fillColor: [248, 249, 250] } },
          `${school.lateral_entry.previousCourseDiploma || school.lateral_entry.previousCourse || 'N/A'}`,
        ] as any,
        [
          { content: 'Previous Institution:', styles: { fontStyle: 'bold' as const, fillColor: [248, 249, 250] } },
          `${school.lateral_entry.previousInstitution || 'N/A'}`,
          { content: 'Qualification & Adm Year:', styles: { fontStyle: 'bold' as const, fillColor: [248, 249, 250] } },
          `${school.lateral_entry.previousQualificationDetails || 'N/A'} (Adm: ${school.lateral_entry.admissionYear || 'N/A'})`,
        ] as any,
      ] : []),
      [
        { content: 'Scholarship Details:', styles: { fontStyle: 'bold' as const, fillColor: [248, 249, 250] } },
        { content: school?.scholarship_details || 'Nil', colSpan: 3 },
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // SECTION 3: SEMESTER ACADEMIC PERFORMANCE (Semesters 1 - 8)
  // SGPA is printed from the stored value. The PDF must never fall back to the
  // CGPA when SGPA is unrecorded.
  const semesterRows = [1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
    const s = semesters.find((x: any) => x.semester_number === num);
    const arrearsCountDisplay = s ? `${s.arrears_count}` : '0';
    const subjectsDisplay = s ? (s.arrears_subjects || '—') : '—';
    const hasStanding = s ? Boolean(s.has_active_arrear || s.arrears_count > 0) : false;
    const statusDisplay = hasStanding ? 'Active Arrear' : 'Clear';

    return [
      `Semester 0${num}`,
      s && s.cgpa > 0 ? s.cgpa.toFixed(2) : '-',
      s && s.sgpa > 0 ? s.sgpa.toFixed(2) : '-',
      arrearsCountDisplay,
      subjectsDisplay,
      statusDisplay,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [
      [{
        content: `3. SEMESTER ACADEMIC PERFORMANCE (SEMESTERS 1 TO 8) — Active: ${arrearStats.activeArrearsCount} | Total History: ${arrearStats.historicalArrearsCount} | Cleared: ${arrearStats.clearedCount}`,
        colSpan: 6,
        styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      }],
      ['Semester', 'CGPA', 'SGPA', 'Semester Arrears', 'Arrear Subjects', 'Clearance Remarks & Status'],
    ],
    body: semesterRows,
    headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 8, cellPadding: 1.8, halign: 'center' },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left', cellWidth: 26 },
      1: { cellWidth: 16 },
      2: { cellWidth: 16 },
      3: { cellWidth: 28 },
      4: { halign: 'left', cellWidth: 36 },
      5: { halign: 'left' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // SECTION 3B: ARREAR HISTORY (If any history exists)
  if (arrearStats.arrearHistory && arrearStats.arrearHistory.length > 0) {
    const arrearHistoryRows = arrearStats.arrearHistory.map((h: any) => [
      h.subjectCode,
      `Semester 0${h.originalSemester}`,
      `Attempt ${h.attempt || 1}`,
      h.status === 'CLEARED' ? (h.clearedInSemester ? `Semester 0${h.clearedInSemester}` : 'Cleared') : '—',
      h.clearedDate || '—',
      h.status === 'CLEARED' ? 'CLEARED' : 'ACTIVE ARREAR',
      h.remarks || '—',
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [
        [{
          content: `ARREAR HISTORY (Preserved Records) — Current Active: ${arrearStats.activeArrearsCount} | Total History: ${arrearStats.historicalArrearsCount} | Cleared: ${arrearStats.clearedCount}`,
          colSpan: 7,
          styles: { fillColor: [70, 80, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
        }],
        ['Subject Code', 'Original Semester', 'Attempt', 'Cleared In', 'Cleared Date', 'Status', 'Remarks'],
      ],
      body: arrearHistoryRows,
      headStyles: { fillColor: [55, 65, 80], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 7.5, cellPadding: 1.6, halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left', cellWidth: 26 },
        1: { cellWidth: 28 },
        2: { cellWidth: 20 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { fontStyle: 'bold', cellWidth: 28 },
        6: { halign: 'left' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // SECTION 4: MENTOR ASSIGNMENT & REASSIGNMENT HISTORY (Immutable Lineage)
  const mentorHistoryRows = mentorHistory.length > 0
    ? mentorHistory.map((h: any, idx: number) => [
        `#${idx + 1}`,
        h.mentor_name,
        h.designation || 'Faculty Mentor',
        `${h.assigned_from} to ${h.assigned_until || 'Present'}`,
        h.status,
        h.change_reason || 'Initial Assignment',
      ])
    : [['1', currentMentor?.mentor_name || 'Assigned Mentor', currentMentor?.designation || '', currentMentor?.assigned_from || '2024-06-01 to Present', 'ACTIVE', 'Initial Allocation']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [
      [{ content: '4. MENTOR ASSIGNMENT & HISTORICAL REASSIGNMENT LINEAGE', colSpan: 6, styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' } }],
      ['#', 'Mentor Name', 'Designation', 'Tenure Duration', 'Status', 'Reason for Change / Allocation'],
    ],
    body: mentorHistoryRows,
    headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { fontStyle: 'bold', cellWidth: 40 },
      2: { cellWidth: 32 },
      3: { cellWidth: 38 },
      4: { cellWidth: 22, halign: 'center' },
    },
  });

  // PAGE 2 (or Next Page) for Meetings & Counselling
  doc.addPage();
  renderHeader(false);
  currentY = 38;

  // SECTION 5: WEEKLY SATURDAY MEETINGS RECORD
  const meetingRows = meetings.length > 0
    ? meetings.map((m: any) => [
        m.meeting_date,
        `${m.meeting_time}\n(${m.location})`,
        m.attendance_status,
        m.challenges_discussed || 'None reported',
        m.corrective_action || 'Regular mentoring guidance',
        m.mentor_remarks || 'Satisfactory',
      ])
    : [['No meetings logged yet.', '-', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [
      [{ content: '5. WEEKLY SATURDAY MENTOR–MENTEE MEETINGS LOG', colSpan: 6, styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' } }],
      ['Date', 'Time & Location', 'Attendance', 'Challenges Discussed', 'Corrective Action Taken', 'Mentor Remarks'],
    ],
    body: meetingRows,
    headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      1: { cellWidth: 28 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 40 },
      4: { cellWidth: 40 },
      5: { cellWidth: 32 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // SECTION 6: 5-DOMAIN COUNSELLING & INTERVENTION RECORDS
  const counsellingRows = counsellingRecords.length > 0
    ? counsellingRecords.map((c: any) => [
        c.session_date,
        c.category,
        c.challenge_observed,
        c.corrective_action,
        c.student_feedback || 'Acknowledged',
        c.mentor_remarks || 'Action initiated',
      ])
    : [['No formal counselling sessions logged.', '-', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [
      [{ content: '6. 5-DOMAIN COUNSELLING & CORRECTIVE ACTION RECORDS', colSpan: 6, styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' } }],
      ['Date', 'Category Domain', 'Challenge Observed', 'Corrective Action Prescribed', 'Student Feedback', 'Mentor Remarks'],
    ],
    body: counsellingRows,
    headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 20 },
      1: { fontStyle: 'bold', cellWidth: 32 },
      2: { cellWidth: 38 },
      3: { cellWidth: 38 },
      4: { cellWidth: 28 },
      5: { cellWidth: 26 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // SECTION 7: MONTHLY PROGRESS EVALUATION LEDGER
  if (monthlyProgress.length > 0) {
    if (currentY > pageHeight - 65) {
      doc.addPage();
      renderHeader(false);
      currentY = 38;
    }

    const progressRows = monthlyProgress.map((p: any) => [
      p.month_name,
      `Acad: ${p.academic_rating}/5\n${p.academic_notes || ''}`,
      `Placement: ${p.placement_rating}/5\n${p.placement_notes || ''}`,
      `E&C: ${p.ec_rating}/5\n${p.ec_notes || ''}`,
      `Innov: ${p.innovation_rating}/5\n${p.innovation_notes || ''}`,
      `Skill: ${p.skill_rating}/5\n${p.skill_notes || ''}`,
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [
        [{ content: '7. MONTHLY PROGRESS EVALUATION LEDGER', colSpan: 6, styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' } }],
        ['Period', 'Academic', 'Placement', 'Extra-Curricular', 'Innovation', 'Skill Development'],
      ],
      body: progressRows,
      headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 2 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // SECTION 8: STUDENT DOCUMENTS & CERTIFICATES OFFICIAL ARCHIVE
  //
  // Every document on the student's record is listed here with its metadata, and
  // the actual file is embedded: images inline on the following pages, PDFs as
  // annexure pages appended after the signed record (jsPDF cannot merge PDFs on
  // its own, so pdf-lib performs that final append).
  if (currentY > pageHeight - 70) {
    doc.addPage();
    renderHeader(false);
    currentY = 38;
  }

  const uploadedCount = studentDocuments.filter((d: any) => !d.is_system_form).length;
  const docRows =
    studentDocuments.length > 0
      ? studentDocuments.map((d: any, i: number) => [
          String(i + 1),
          d.title.length > 38 ? `${d.title.slice(0, 37)}…` : d.title,
          `${d.document_type}\n${d.category}`,
          d.event_details.length > 46 ? `${d.event_details.slice(0, 45)}…` : d.event_details,
          d.uploaded_on,
          d.verification_status,
        ])
      : [['—', 'No documents on record.', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [
      [
        {
          content: '8. STUDENT DOCUMENTS & CERTIFICATES – OFFICIAL ARCHIVE',
          colSpan: 6,
          styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
        },
      ],
      ['#', 'Document Name', 'Type / Category', 'Event / Details', 'Upload Date', 'Status'],
    ],
    body: docRows,
    headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { fontStyle: 'bold', cellWidth: 40 },
      2: { cellWidth: 30 },
      3: { cellWidth: 42 },
      4: { cellWidth: 24, halign: 'center' },
      5: { cellWidth: 24, halign: 'center' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 5;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `${uploadedCount} student-uploaded document(s) on record. Certificate scans are reproduced in full as annexures following the signed record. Verification is carried out by the assigned mentor / administrator.`,
    margin,
    currentY
  );
  currentY += 8;

  // ---- Embed the actual files -------------------------------------------------
  // Images are drawn inline; PDFs are collected and appended after the record is
  // signed. Anything that cannot be embedded is reported, never silently dropped.
  const EMBED_LIMITS = { images: 25, pdfFiles: 25 };
  const IMAGE_FORMATS: Record<string, string> = {
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/jpg': 'JPEG',
  };

  const annexurePdfs: Array<{ meta: any; doc: PDFDocument; pages: number }> = [];
  let imageCount = 0;
  const notEmbedded: string[] = [];

  for (const d of studentDocuments) {
    if (d.is_system_form) continue; // never self-embed this dossier

    const absPath = resolveStoredUploadPath(d.file_url);
    if (!absPath || !fs.existsSync(absPath)) {
      notEmbedded.push(`${d.file_name} (file not on disk)`);
      continue;
    }

    const mime = (d.file_type || '').toLowerCase();

    if (mime === 'application/pdf') {
      if (annexurePdfs.length >= EMBED_LIMITS.pdfFiles) {
        notEmbedded.push(`${d.file_name} (annexure limit reached)`);
        continue;
      }
      try {
        // Loaded once here and reused below, so each file is parsed only once.
        const src = await PDFDocument.load(fs.readFileSync(absPath), { ignoreEncryption: true });
        annexurePdfs.push({ meta: d, doc: src, pages: src.getPageCount() });
      } catch (e: any) {
        notEmbedded.push(`${d.file_name} (unreadable PDF)`);
        console.error('generateStudentPdf: could not read document', absPath, e?.message);
      }
      continue;
    }

    const fmt = IMAGE_FORMATS[mime];
    if (!fmt) {
      notEmbedded.push(`${d.file_name} (unsupported type ${d.file_type || 'unknown'})`);
      continue;
    }
    if (imageCount >= EMBED_LIMITS.images) {
      notEmbedded.push(`${d.file_name} (image limit reached)`);
      continue;
    }

    try {
      const dataUrl = `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`;
      const props = doc.getImageProperties(dataUrl);

      doc.addPage();
      renderHeader(false);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`ANNEXURE IMAGE – ${d.title}`, margin, 40, { maxWidth: pageWidth - margin * 2 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      doc.text(
        `${d.document_type} | ${d.category} | Uploaded: ${d.uploaded_on} | Status: ${d.verification_status} | File: ${d.file_name}`,
        margin,
        45,
        { maxWidth: pageWidth - margin * 2 }
      );

      // Fit the image inside the printable area, preserving aspect ratio.
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - 60;
      const ratio = props.width > 0 && props.height > 0 ? props.height / props.width : 0.7;
      let drawW = maxW;
      let drawH = drawW * ratio;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH / ratio;
      }
      doc.addImage(dataUrl, fmt, margin + (maxW - drawW) / 2, 50, drawW, drawH);
      imageCount++;
    } catch (e: any) {
      notEmbedded.push(`${d.file_name} (image could not be rendered)`);
      console.error('generateStudentPdf: could not embed image', absPath, e?.message);
    }
  }

  // If image annexures consumed the current page, start the signed record on a
  // fresh page so the signature block is never printed on top of a scan.
  if (imageCount > 0) {
    doc.addPage();
    renderHeader(false);
    currentY = 38;
  }

  // INSTITUTIONAL SIGNATURE BLOCK (Ensure it fits or create new page)
  if (currentY > pageHeight - 45) {
    doc.addPage();
    renderHeader(false);
    currentY = 45;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('INSTITUTIONAL VERIFICATION & DIGITAL ENDORSEMENT', margin, currentY);

  currentY += 12;
  const colW = (pageWidth - margin * 2) / 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  doc.text('_____________________', margin + 2, currentY);
  doc.text('Signature of Mentee', margin + 4, currentY + 4);

  doc.text('_____________________', margin + colW + 2, currentY);
  doc.text('Signature of Mentor', margin + colW + 4, currentY + 4);

  doc.text('_____________________', margin + colW * 2 + 2, currentY);
  doc.text('Head of Department', margin + colW * 2 + 4, currentY + 4);

  doc.text('_____________________', margin + colW * 3 + 2, currentY);
  doc.text('Principal / Dean', margin + colW * 3 + 4, currentY + 4);

  // FOOTER ON ALL PAGES
  const totalPages = doc.getNumberOfPages();
  const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.4);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`KSRCE Digital Mentor–Mentee System | Reg No: ${student.register_number} | Generated on: ${reportDate}`, margin, pageHeight - 8);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const dossierBytes = new Uint8Array(doc.output('arraybuffer'));

  // ---- APPEND PDF ANNEXURES --------------------------------------------------
  // jsPDF cannot merge existing PDFs, so the uploaded PDF documents are appended
  // here with pdf-lib, each preceded by its own annexure detail sheet. If this
  // step fails for any reason the signed dossier is still returned intact — a
  // document-management problem must never cost the student their record book.
  if (annexurePdfs.length === 0 && notEmbedded.length === 0) {
    return dossierBytes;
  }

  try {
    const merged = await PDFDocument.load(dossierBytes);

    for (const item of annexurePdfs) {
      // Annexure detail sheet, built with the same institutional chrome.
      const sheet = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const sw = sheet.internal.pageSize.getWidth();
      const sh = sheet.internal.pageSize.getHeight();
      const sm = 14;

      sheet.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      sheet.rect(sm, 10, sw - sm * 2, 2.5, 'F');
      if (logoBase64) {
        try {
          sheet.addImage(logoBase64, 'PNG', sm + 2, 13.5, 17, 17);
        } catch {
          /* logo optional */
        }
      }
      sheet.setFont('helvetica', 'bold');
      sheet.setFontSize(14);
      sheet.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      sheet.text('K.S.R. COLLEGE OF ENGINEERING', sw / 2, 17, { align: 'center' });
      sheet.setFont('helvetica', 'normal');
      sheet.setFontSize(8);
      sheet.setTextColor(80, 80, 80);
      sheet.text('OFFICIAL DIGITAL MENTOR–MENTEE RECORD BOOK – DOCUMENT ANNEXURE', sw / 2, 30.5, { align: 'center' });
      sheet.setDrawColor(200, 200, 200);
      sheet.setLineWidth(0.5);
      sheet.line(sm, 33, sw - sm, 33);

      let y = 44;
      sheet.setFont('helvetica', 'bold');
      sheet.setFontSize(11);
      sheet.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      sheet.text(`ANNEXURE ${item.meta.title}`, sm, y, { maxWidth: sw - sm * 2 });
      y += 9;

      const detailRows: string[][] = [
        ['Student', student.full_name],
        ['Register Number', student.register_number],
        ['Document Name', item.meta.title],
        ['Stored File', item.meta.file_name],
        ['Type / Category', `${item.meta.document_type} / ${item.meta.category}`],
        ['Event / Details', item.meta.event_details],
        ['Upload Date', item.meta.uploaded_on],
        ['Verification Status', item.meta.verification_status],
        ['File Type / Size', `${item.meta.file_type} / ${item.meta.file_size} bytes`],
        ['Pages Reproduced', String(item.pages)],
      ];

      autoTable(sheet, {
        startY: y,
        margin: { left: sm, right: sm },
        theme: 'grid',
        body: detailRows.map(([k, v]) => [
          { content: k, styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
          String(v || 'N/A'),
        ]),
        styles: { fontSize: 8.5, cellPadding: 2.2 },
        columnStyles: { 0: { cellWidth: 46 } },
      });

      y = (sheet as any).lastAutoTable.finalY + 8;
      sheet.setFont('helvetica', 'italic');
      sheet.setFontSize(7.5);
      sheet.setTextColor(100, 100, 100);
      sheet.text(
        `The following ${item.pages} page(s) are a verbatim reproduction of the document uploaded by the student through Student Documents on ${item.meta.uploaded_on}.`,
        sm,
        y,
        { maxWidth: sw - sm * 2 }
      );

      sheet.setFontSize(7.5);
      sheet.setTextColor(120, 120, 120);
      sheet.text(
        `KSRCE Digital Mentor–Mentee System | Reg No: ${student.register_number} | Generated on: ${reportDate}`,
        sm,
        sh - 8
      );

      const sheetDoc = await PDFDocument.load(sheet.output('arraybuffer'));
      const sheetPages = await merged.copyPages(sheetDoc, sheetDoc.getPageIndices());
      sheetPages.forEach((p) => merged.addPage(p));

      const srcDoc = item.doc;
      const srcPages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
      srcPages.forEach((p) => merged.addPage(p));
    }

    if (notEmbedded.length > 0) {
      const notice = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const nw = notice.internal.pageSize.getWidth();
      notice.setFont('helvetica', 'bold');
      notice.setFontSize(12);
      notice.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      notice.text('ANNEXURE EMBEDDING NOTICE', nw / 2, 50, { align: 'center' });
      notice.setFont('helvetica', 'normal');
      notice.setFontSize(8.5);
      notice.setTextColor(60, 60, 60);
      notice.text(
        'The documents listed below are registered in Section 8 of this record book but could not be reproduced as annexures. They remain available in full through the Student Documents screen.',
        nw / 2,
        62,
        { align: 'center', maxWidth: nw - 40 }
      );
      autoTable(notice, {
        startY: 78,
        margin: { left: 20, right: 20 },
        theme: 'grid',
        head: [['Document']],
        body: notEmbedded.map((n) => [n]),
        styles: { fontSize: 8, cellPadding: 2 },
      });
      const noticeDoc = await PDFDocument.load(notice.output('arraybuffer'));
      const noticePages = await merged.copyPages(noticeDoc, noticeDoc.getPageIndices());
      noticePages.forEach((p) => merged.addPage(p));
    }

    return new Uint8Array(await merged.save());
  } catch (e: any) {
    console.error('generateStudentPdf: annexure append failed, returning signed dossier only:', e?.message);
    return dossierBytes;
  }
}
