import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import mongoose from 'mongoose';
import {
  Student,
  AcademicRecord,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  MonthlyProgress,
} from '../../models/index.js';
import { calculateArrearStatistics } from '../../utils/arrears.util.js';

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
    admission_type: sc.admissionType || 'COUNSELLING',
    scholarship_details: sc.scholarshipDetails || '',
  };

  // 5. Fetch Semesters 1 to 8
  const semesterDocs = await AcademicRecord.find({ student: studentDoc._id }).sort({ semesterNumber: 1 });
  const arrearStats = calculateArrearStatistics(semesterDocs, studentDoc.clearedSubjects || []);
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
  doc.text(`Academic Batch: ${student.batch_name}`, pageWidth - margin - 4, currentY + 12, { align: 'right' });

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
        school?.admission_type || 'COUNSELLING',
      ],
      [
        { content: 'Scholarship Details:', styles: { fontStyle: 'bold', fillColor: [248, 249, 250] } },
        { content: school?.scholarship_details || 'Nil', colSpan: 3 },
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // SECTION 3: SEMESTER ACADEMIC PERFORMANCE (Semesters 1 - 8)
  const semesterRows = [1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
    const s = semesters.find((x: any) => x.semester_number === num);
    let subjectStatus = 'Clear / Regular';
    if (s) {
      if (s.arrears_count > 0) {
        const clearedNote = s.cleared_in_later_semesters && s.cleared_in_later_semesters.length > 0
          ? ` (Cleared in Sem 0${s.cleared_in_later_semesters[0].clearedInSemester})`
          : ' [Active Arrear]';
        subjectStatus = (s.arrears_subjects || 'Arrear') + clearedNote;
      } else if (s.cleared_subjects && s.cleared_subjects.length > 0) {
        subjectStatus = s.cleared_subjects.map((c: any) => `${c.subjectCode} Cleared`).join(', ') + ' / Clear';
      } else if (s.remarks) {
        subjectStatus = s.remarks;
      }
    }
    return [
      `Semester 0${num}`,
      s && s.cgpa > 0 ? s.cgpa.toFixed(2) : '-',
      s && s.sgpa > 0 ? s.sgpa.toFixed(2) : '-',
      s ? `${s.arrears_count}` : '0',
      subjectStatus,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [
      [{ content: `3. SEMESTER ACADEMIC PERFORMANCE (SEMESTERS 1 TO 8) — ${arrearStats.statusLabel} (Historical: ${arrearStats.historicalArrearsCount}, Cleared: ${arrearStats.clearedCount})`, colSpan: 5, styles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' } }],
      ['Semester', 'Cumulative CGPA', 'Semester SGPA', 'Semester Arrears', 'Subjects / Clearance Remarks'],
    ],
    body: semesterRows,
    headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 8, cellPadding: 1.8, halign: 'center' },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left', cellWidth: 30 },
      1: { cellWidth: 32 },
      2: { cellWidth: 32 },
      3: { cellWidth: 26 },
      4: { halign: 'left' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

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

  return new Uint8Array(doc.output('arraybuffer'));
}
