/**
 * Student Record Book — shared data assembly.
 *
 * The complete record-book input set (student, family, schooling, semesters +
 * arrears, internal marks, mentor lineage, meetings, counselling, monthly
 * progress, evidence views and the student document archive) is collected here
 * ONCE and consumed by BOTH PDF renderers:
 *   - the new structured HTML/CSS → PDF path (record-book-html.service.ts), and
 *   - the historical jsPDF path kept as the fallback in pdf.service.ts.
 *
 * Field names deliberately match the shapes the legacy jsPDF renderer already
 * destructures, so the fallback keeps working byte-for-byte.
 */
import { Student, AcademicRecord, MentorAssignment, Meeting, CounsellingRecord, MonthlyProgress, InternalMark, StudentDocument } from '../../models/index.js';
import { calculateArrearStatistics } from '../../utils/arrears.util.js';
import { isValidId } from '../../services/localId.js';
import { buildEvidenceViews, normaliseEvidenceRefs } from '../counselling/evidence.service.js';

/**
 * The three official download modes — defined here so both PDF renderers share
 * the same vocabulary:
 *   full             — the complete Digital Mentor–Mentee Record Book (default)
 *   internal         — Internal Assessment marks report only
 *   mentor-documents — mentoring records & evidence only
 */
export type StudentPdfMode = 'full' | 'internal' | 'mentor-documents';

const STUDENT_PDF_MODES: StudentPdfMode[] = ['full', 'internal', 'mentor-documents'];

export function isStudentPdfMode(value: unknown): value is StudentPdfMode {
  return typeof value === 'string' && (STUDENT_PDF_MODES as string[]).includes(value);
}

export interface RecordBookData {
  mode: StudentPdfMode;
  registerNumber: string;
  student: any;
  parent: any;
  siblings: any[];
  school: any;
  semesters: any[];
  arrearStats: any;
  internalMarks: any[];
  currentMentor: any;
  mentorHistory: any[];
  meetings: any[];
  counsellingRecords: any[];
  monthlyProgress: any[];
  studentDocuments: any[];
}

/** Format a value as `dd Mon yyyy` (en-GB). Mirrors the legacy PDF's dates. */
export function formatDocDate(value: any): string {
  if (!value) return '';
  const dt = value instanceof Date ? value : new Date(value);
  if (isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Collect every piece of data the record book renders for one student.
 * Ownership / role checks live in the http layer; this is data assembly only.
 */
export async function collectRecordBookData(
  studentIdOrRegNo: string,
  mode: StudentPdfMode
): Promise<RecordBookData> {
  // 1. Fetch Student Master
  let studentDoc: any = null;
  if (isValidId(studentIdOrRegNo)) {
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

  const registerNumber = studentDoc.registerNumber;

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

  // 5B. Subject-wise internal assessment marks.
  const internalMarks =
    mode === 'mentor-documents'
      ? []
      : await InternalMark.find({ student: studentDoc._id }).sort({
          semesterNumber: 1,
          subjectCode: 1,
        });

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

  const meetings = await Promise.all(
    meetingDocs.map(async (m: any) => {
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
        evidence:
          mode === 'internal'
            ? []
            : await buildEvidenceViews(
                normaliseEvidenceRefs(m.evidence).map((ref: any) => ref.evidenceId)
              ),
      };
    })
  );

  // 9. Counselling Records
  const counsellingDocs = await CounsellingRecord.find({ student: studentDoc._id })
    .populate({ path: 'mentor', populate: { path: 'user' } })
    .sort({ sessionDate: 1 });

  const counsellingRecords = await Promise.all(
    counsellingDocs.map(async (c: any) => {
      const mentorUser = (c.mentor as any)?.user || {};
      const discussionWith: string[] = Array.isArray(c.discussionWith) ? c.discussionWith : [];
      return {
        session_date: c.sessionDate,
        category: c.category,
        discussion_with:
          discussionWith.includes('student') && discussionWith.includes('parent')
            ? 'Student & Parent'
            : discussionWith.includes('student')
              ? 'Student'
              : discussionWith.includes('parent')
                ? 'Parent'
                : 'Not recorded',
        record_kind: c.recordKind || 'INDIVIDUAL',
        challenge_observed: c.challengeObserved,
        corrective_action: c.correctiveAction,
        student_feedback: c.studentFeedback || '',
        mentor_remarks: c.mentorRemarks || '',
        mentor_name: mentorUser.fullName || '',
        evidence:
          mode === 'internal'
            ? []
            : await buildEvidenceViews(
                normaliseEvidenceRefs(c.evidence).map((ref: any) => ref.evidenceId)
              ),
      };
    })
  );

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
  const documentDocs = await StudentDocument.find({ studentId: studentDoc._id }).sort({
    isPrimary: -1,
    uploadedAt: -1,
  });

  const studentDocuments = documentDocs.map((d: any) => {
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

  return {
    mode,
    registerNumber,
    student,
    parent,
    siblings,
    school,
    semesters,
    arrearStats,
    internalMarks,
    currentMentor,
    mentorHistory,
    meetings,
    counsellingRecords,
    monthlyProgress,
    studentDocuments,
  };
}