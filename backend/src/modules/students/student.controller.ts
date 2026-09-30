import { Response } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  Student,
  User,
  Faculty,
  Department,
  Batch,
  AcademicRecord,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  MonthlyProgress,
  School,
  StudentDocument,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import { calculateArrearStatistics, parseSubjectCodes } from '../../utils/arrears.util.js';
import { checkStudentAccess, isActiveMentorOf, toIdString } from '../../utils/access.util.js';
import {
  parseStrictNumber,
  parseGrade,
  parseMobile,
  parseEmail,
  parseStudyYear,
  parseSection,
  parseSemesterNumber,
  joinErrors,
} from '../../utils/validation.util.js';
import { syncStudentDetailsPdf } from '../documents/student-details-pdf.service.js';

/**
 * SINGLE SOURCE OF TRUTH for a student's institutional email.
 * `Student.email` is authoritative; the linked `User.email` is kept in sync as
 * a mirror. Nothing is synthesised at read time any more.
 */
export function canonicalStudentEmail(student: any): string {
  return String(student?.email || '').trim().toLowerCase();
}

/** Normalise an incoming arrear subject list into {code,name} pairs. Accepts
 *  a structured array or a free-text string ("24ITT36, 24ITT40"). */
function normaliseArrearSubjects(input: any): { codes: string[]; details: { subjectCode: string; subjectName: string }[] } {
  const details: { subjectCode: string; subjectName: string }[] = [];
  const seen = new Set<string>();

  const push = (rawCode: any, rawName: any) => {
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (!code) return;
    if (['NIL', 'NONE', 'CLEAR', 'REGULAR', 'NA', 'N/A', '-', '—'].includes(code)) return;
    if (seen.has(code)) return;
    seen.add(code);
    details.push({ subjectCode: code, subjectName: String(rawName ?? '').trim() || 'Not Provided' });
  };

  if (Array.isArray(input)) {
    input.forEach((d: any) => {
      if (typeof d === 'string') push(d, '');
      else push(d?.subjectCode ?? d?.subject_code ?? d?.code, d?.subjectName ?? d?.subject_name ?? d?.name);
    });
  } else if (typeof input === 'string' && input.trim()) {
    parseSubjectCodes(input).forEach((code) => push(code, ''));
  }

  return { codes: details.map((d) => d.subjectCode), details };
}

// Helper: Resolve student from id, registerNumber, or user ID
async function findStudentByIdOrReg(idOrReg: string) {
  if (mongoose.Types.ObjectId.isValid(idOrReg)) {
    const byId = await Student.findById(idOrReg).populate('department batch user school.tenthSchoolId school.twelfthSchoolId');
    if (byId) return byId;
    const byUser = await Student.findOne({ user: idOrReg }).populate('department batch user school.tenthSchoolId school.twelfthSchoolId');
    if (byUser) return byUser;
  }
  return await Student.findOne({ registerNumber: idOrReg }).populate('department batch user school.tenthSchoolId school.twelfthSchoolId');
}

/**
 * Largest page size a client may request on the student directory. This is a
 * *page* bound, never a cap on the dataset: every student stays reachable by
 * walking `pages`.
 */
export const MAX_STUDENT_PAGE_SIZE = 250;

// Get list of students with comprehensive search & filtering
export async function getStudents(req: AuthRequest, res: Response) {
  try {
    const {
      search,
      departmentId,
      batchId,
      mentorId,
      assignmentStatus,
      isActive,
      page = '1',
      limit,
    } = req.query as Record<string, string>;

    const filter: any = {};

    // RBAC: HOD restricted to own department
    if (req.user?.role === ROLES.HOD && req.user.departmentId) {
      filter.department = req.user.departmentId;
    } else if (departmentId) {
      if (mongoose.Types.ObjectId.isValid(departmentId)) {
        filter.department = departmentId;
      } else {
        const d = await Department.findOne({ $or: [{ code: departmentId.toUpperCase() }, { _id: departmentId }] });
        if (d) filter.department = d._id;
      }
    }

    if (batchId) {
      if (mongoose.Types.ObjectId.isValid(batchId)) {
        filter.batch = batchId;
      } else {
        const b = await Batch.findOne({ name: batchId });
        if (b) filter.batch = b._id;
      }
    }

    if (isActive !== undefined && isActive !== '') {
      filter.isActive = isActive === 'true' || isActive === '1';
    }

    if (search && search.trim() !== '') {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ fullName: regex }, { registerNumber: regex }, { email: regex }];
    }

    // Role-based filtering for Faculty
    if (req.user?.role === ROLES.FACULTY && req.user.facultyId) {
      const activeAssignments = await MentorAssignment.find({
        mentor: req.user.facultyId,
        status: 'ACTIVE',
      }).select('student');
      const studentIds = activeAssignments.map((a) => a.student);
      filter._id = { $in: studentIds };
    } else if (mentorId) {
      const activeAssignments = await MentorAssignment.find({
        mentor: mentorId,
        status: 'ACTIVE',
      }).select('student');
      const studentIds = activeAssignments.map((a) => a.student);
      filter._id = { $in: studentIds };
    }

    // ---- Pagination -------------------------------------------------------
    // `page`/`limit` are optional. When `limit` is omitted the *entire* filtered
    // set is returned (no silent truncation). When `limit` is supplied the query
    // is paged, and the real total is always reported via countDocuments().
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = limit === undefined || limit === '' ? null : parseInt(limit, 10);
    const limitNum =
      parsedLimit === null || Number.isNaN(parsedLimit)
        ? null
        : Math.min(MAX_STUDENT_PAGE_SIZE, Math.max(1, parsedLimit));
    const skip = limitNum === null ? 0 : (pageNum - 1) * limitNum;

    const baseQuery = Student.find(filter)
      .populate('department', 'name code')
      .populate('batch', 'name')
      .sort({ registerNumber: 1 })
      .skip(skip);
    if (limitNum !== null) baseQuery.limit(limitNum);

    // The total is the count of everything matching the filter — NOT the length
    // of this page. This is what makes the whole directory reachable.
    const [students, total] = await Promise.all([baseQuery, Student.countDocuments(filter)]);

    const totalPages =
      limitNum === null ? 1 : Math.max(1, Math.ceil(total / limitNum));

    if (students.length === 0) {
      return sendSuccess(
        res,
        {
          students: [],
          total,
          page: pageNum,
          limit: limitNum,
          pages: totalPages,
          hasMore: limitNum !== null && pageNum < totalPages,
        },
        'Students list fetched successfully.'
      );
    }

    const studentIds = students.map((s) => s._id);

    // ---- Batched enrichment ----------------------------------------------
    // Resolved in a fixed number of round trips for the whole page instead of
    // ~7 queries per student, so a 250-row page is no slower than a 50-row one.
    const [
      activeAssignments,
      completedMeetingCounts,
      counsellingCounts,
      academicRecords,
      latestMeetings,
      documentCounts,
    ] = await Promise.all([
      MentorAssignment.find({ student: { $in: studentIds }, status: 'ACTIVE' }).populate({
        path: 'mentor',
        populate: { path: 'user', select: 'fullName' },
      }),
      Meeting.aggregate([
        { $match: { student: { $in: studentIds }, meetingStatus: 'COMPLETED' } },
        { $group: { _id: '$student', count: { $sum: 1 } } },
      ]),
      CounsellingRecord.aggregate([
        { $match: { student: { $in: studentIds } } },
        { $group: { _id: '$student', count: { $sum: 1 } } },
      ]),
      AcademicRecord.find({ student: { $in: studentIds } }).lean(),
      Meeting.find({ student: { $in: studentIds } }).lean(),
      StudentDocument.aggregate([
        { $match: { student: { $in: studentIds } } },
        { $group: { _id: '$student', count: { $sum: 1 } } },
      ]),
    ]);

    const assignmentByStudent = new Map<string, any>(
      activeAssignments.map((a: any) => [a.student?._id?.toString?.() ?? String(a.student), a])
    );
    const meetingCountByStudent = new Map<string, number>(
      completedMeetingCounts.map((r: any) => [String(r._id), r.count])
    );
    const counsellingCountByStudent = new Map<string, number>(
      counsellingCounts.map((r: any) => [String(r._id), r.count])
    );
    const documentCountByStudent = new Map<string, number>(
      documentCounts.map((r: any) => [String(r._id), r.count])
    );
    const academicsByStudent = new Map<string, any[]>();
    for (const rec of academicRecords) {
      const key = String(rec.student);
      const list = academicsByStudent.get(key) || [];
      list.push(rec);
      academicsByStudent.set(key, list);
    }
    // Newest semester first — mirrors the previous per-student `.sort()`.
    for (const list of academicsByStudent.values()) {
      list.sort((a: any, b: any) => (b.semesterNumber || 0) - (a.semesterNumber || 0));
    }
    // meetingDate is a 'YYYY-MM-DD' string, so a lexicographic max is a
    // chronological max. Ties resolve to the most recently stored row, matching
    // the previous `findOne().sort({ meetingDate: -1 })` behaviour.
    const latestMeetingByStudent = new Map<string, any>();
    for (const m of latestMeetings) {
      const key = String(m.student);
      const current = latestMeetingByStudent.get(key);
      if (!current || String(m.meetingDate || '') > String(current.meetingDate || '')) {
        latestMeetingByStudent.set(key, m);
      }
    }

    const enriched = students.map((s) => {
      const sKey = s._id.toString();
      const activeAsg = assignmentByStudent.get(sKey);
      const activeMentor = activeAsg?.mentor as any;
      const mentorUser = activeMentor?.user as any;
      const latestMeeting = latestMeetingByStudent.get(sKey);
      const records = academicsByStudent.get(sKey) || [];

      const arrearStats = calculateArrearStatistics(
        records,
        s.clearedSubjects || [],
        s.arrearHistory || []
      );
      const totalArrears = arrearStats.activeArrearsCount;
      const latestWithCgpa = records.find((r: any) => (r.cgpa || 0) > 0);
      const currentCgpa = latestWithCgpa ? latestWithCgpa.cgpa : 0.0;

      // Profile completion percentage calculation
      let completionPercent = 0;
      if (s.profileCompleted) {
        completionPercent = 100;
      } else {
        if (s.fullName && s.registerNumber) completionPercent += 25;
        if (s.mobileNumber && s.email && s.dob) completionPercent += 25;
        if (s.parent?.fatherName || s.parent?.motherName) completionPercent += 25;
        if (s.school?.tenthMark || s.school?.twelfthMark) completionPercent += 25;
      }

      const dept = s.department as any;
      const batch = s.batch as any;

      return {
        id: s._id.toString(),
        _id: s._id.toString(),
        register_number: s.registerNumber,
        full_name: s.fullName,
        department_id: dept?._id?.toString() || '',
        department_name: dept?.name || '',
        department_code: dept?.code || '',
        batch_id: batch?._id?.toString() || '',
        batch_name: batch?.name || '',
        year: s.year || 2,
        section: s.section || 'A',
        dob: s.dob || '',
        blood_group: s.bloodGroup || '',
        residential_type: s.residentialType,
        mobile_number: s.mobileNumber || '',
        email: canonicalStudentEmail(s),
        is_active: s.isActive ? 1 : 0,
        profile_completed: s.profileCompleted ? 1 : 0,
        profile_completion_percentage: completionPercent,
        profile_completed_at: s.profileCompletedAt || null,
        current_mentor_name: mentorUser?.fullName || 'Not Assigned',
        mentor_cabin: activeMentor?.cabinLocation || null,
        assignment_id: activeAsg?._id?.toString() || null,
        assignment_status: activeAsg?.status || 'UNASSIGNED',
        completed_meetings_count: meetingCountByStudent.get(sKey) || 0,
        counselling_count: counsellingCountByStudent.get(sKey) || 0,
        document_count: documentCountByStudent.get(sKey) || 0,
        total_arrears: totalArrears,
        active_arrears: arrearStats.activeArrearsCount,
        historical_arrears: arrearStats.historicalArrearsCount,
        cleared_arrears: arrearStats.clearedCount,
        arrear_status_label: arrearStats.statusLabel,
        cgpa: currentCgpa,
        // Never a fabricated date: null means "no meeting recorded yet".
        next_meeting_date: latestMeeting?.meetingDate || null,
        meeting_status: latestMeeting?.meetingStatus || 'SCHEDULED',
      };
    });

    return sendSuccess(
      res,
      {
        students: enriched,
        total,
        page: pageNum,
        limit: limitNum,
        pages: totalPages,
        hasMore: limitNum !== null && pageNum < totalPages,
      },
      'Students list fetched successfully.'
    );
  } catch (err: any) {
    console.error('getStudents error:', err);
    return sendError(res, 'Failed to fetch students directory.', 500);
  }
}

// Get single student detailed record book
export async function getStudentById(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  try {
    const student = await findStudentByIdOrReg(id);

    if (!student) {
      return sendError(res, 'Student not found', 404);
    }

    // Authorisation: student = own record, mentor = assigned mentees,
    // HOD = own department, admin = institutional access.
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const dept = student.department as any;
    const batch = student.batch as any;

    // Fetch related records in parallel
    const [semesters, activeAsg, allAsgs, meetings, counsellingRecords, monthlyProgress] =
      await Promise.all([
        AcademicRecord.find({ student: student._id }).sort({ semesterNumber: 1 }),
        MentorAssignment.findOne({ student: student._id, status: 'ACTIVE' }).populate({
          path: 'mentor',
          populate: { path: 'user', select: 'fullName email' },
        }),
        MentorAssignment.find({ student: student._id })
          .sort({ assignedFrom: -1 })
          .populate({
            path: 'mentor',
            populate: { path: 'user', select: 'fullName email' },
          })
          .populate('assignedBy', 'fullName'),
        Meeting.find({ student: student._id }).sort({ meetingDate: -1, createdAt: -1 }),
        CounsellingRecord.find({ student: student._id }).sort({ sessionDate: -1 }),
        MonthlyProgress.find({ student: student._id }).sort({ createdAt: -1 }),
      ]);

    const activeMentorDoc = activeAsg?.mentor as any;
    const activeMentorUser = activeMentorDoc?.user as any;

    const currentMentor = activeAsg
      ? {
          assignment_id: activeAsg._id.toString(),
          mentor_id: activeMentorDoc?._id?.toString() || '',
          mentor_name: activeMentorUser?.fullName || 'Faculty Mentor',
          mentor_email: activeMentorUser?.email || '',
          designation: activeMentorDoc?.designation || 'Assistant Professor',
          cabin_location: activeMentorDoc?.cabinLocation || 'Faculty Cabin',
          phone_number: activeMentorDoc?.phoneNumber || '',
          assigned_from: activeAsg.assignedFrom ? (activeAsg.assignedFrom instanceof Date ? activeAsg.assignedFrom.toISOString().split('T')[0] : String(activeAsg.assignedFrom).split('T')[0]) : '',
        }
      : null;

    const mentorHistory = allAsgs.map((a: any) => {
      const mDoc = a.mentor as any;
      const mUser = mDoc?.user as any;
      const byUser = a.assignedBy as any;
      return {
        assignment_id: a._id.toString(),
        mentor_id: mDoc?._id?.toString() || '',
        mentor_name: mUser?.fullName || 'Faculty Mentor',
        designation: mDoc?.designation || 'Faculty Mentor',
        assigned_from: a.assignedFrom ? (a.assignedFrom instanceof Date ? a.assignedFrom.toISOString().split('T')[0] : String(a.assignedFrom).split('T')[0]) : '',
        assigned_until: a.assignedUntil ? (a.assignedUntil instanceof Date ? a.assignedUntil.toISOString().split('T')[0] : String(a.assignedUntil).split('T')[0]) : null,
        status: a.status,
        change_reason: a.changeReason || 'Initial Allocation',
        assigned_by_name: byUser?.fullName || 'Administrator',
      };
    });

    const arrearStats = calculateArrearStatistics(
      semesters,
      student.clearedSubjects || [],
      student.arrearHistory || []
    );
    const formattedSemesters = arrearStats.formattedSemesters;

    const formattedMeetings = meetings.map((m) => ({
      id: m._id.toString(),
      meeting_date: m.meetingDate,
      meeting_time: m.meetingTime,
      location: m.location,
      attendance_status: m.attendanceStatus,
      meeting_status: m.meetingStatus,
      challenges_discussed: m.challengesDiscussed,
      corrective_action: m.correctiveAction,
      student_feedback: m.studentFeedback,
      mentor_remarks: m.mentorRemarks,
    }));

    const formattedCounselling = counsellingRecords.map((c) => ({
      id: c._id.toString(),
      session_date: c.sessionDate,
      category: c.category,
      challenge_observed: c.challengeObserved,
      corrective_action: c.correctiveAction,
      student_feedback: c.studentFeedback,
      mentor_remarks: c.mentorRemarks,
    }));

    const formattedProgress = monthlyProgress.map((p) => ({
      id: p._id.toString(),
      academic_year: p.academicYear,
      month_name: p.monthName,
      academic_rating: p.academicRating,
      academic_notes: p.academicNotes,
      placement_rating: p.placementRating,
      placement_notes: p.placementNotes,
      ec_rating: p.ecRating,
      ec_notes: p.ecNotes,
      innovation_rating: p.innovationRating,
      innovation_notes: p.innovationNotes,
      skill_rating: p.skillRating,
      skill_notes: p.skillNotes,
      created_at: p.createdAt,
    }));

    return sendSuccess(res, {
      id: student._id.toString(),
      _id: student._id.toString(),
      register_number: student.registerNumber,
      full_name: student.fullName,
      department_id: dept?._id?.toString() || '',
      department_name: dept?.name || '',
      department_code: dept?.code || '',
      batch_id: batch?._id?.toString() || '',
      batch_name: batch?.name || '',
      year: student.year || 2,
      section: student.section || 'A',
      admission_type: student.school?.admissionType || 'COUNSELLING',
      lateral_entry: student.school?.lateralEntry || null,
      dob: student.dob || null,
      blood_group: student.bloodGroup || 'B+ve',
      residential_type: student.residentialType,
      mobile_number: student.mobileNumber || null,
      // Single source of truth: never synthesise an address at read time.
      email: canonicalStudentEmail(student),
      address: student.address || null,
      profile_completed: student.profileCompleted ? 1 : 0,
      profile_completed_at: student.profileCompletedAt || null,
      is_active: student.isActive ? 1 : 0,
      created_at: student.createdAt,
      parent: {
        father_name: student.parent?.fatherName || '',
        father_contact: student.parent?.fatherContact || '',
        father_occupation: student.parent?.fatherOccupation || '',
        mother_name: student.parent?.motherName || '',
        mother_contact: student.parent?.motherContact || '',
        mother_occupation: student.parent?.motherOccupation || '',
      },
      siblings: student.siblings?.map((sib) => ({
        sibling_name: sib.siblingName,
        sibling_contact: sib.siblingContact || '',
        sibling_occupation: sib.siblingOccupation || '',
      })) || [],
      school: {
        tenth_mark: student.school?.tenthMark || 0,
        tenth_school: student.school?.tenthSchool || '',
        tenth_school_id: (student.school?.tenthSchoolId as any)?._id?.toString() || student.school?.tenthSchoolId?.toString() || null,
        tenth_school_obj: (student.school?.tenthSchoolId && typeof student.school.tenthSchoolId === 'object') ? student.school.tenthSchoolId : null,
        twelfth_mark: student.school?.twelfthMark || 0,
        twelfth_school: student.school?.twelfthSchool || '',
        twelfth_school_id: (student.school?.twelfthSchoolId as any)?._id?.toString() || student.school?.twelfthSchoolId?.toString() || null,
        twelfth_school_obj: (student.school?.twelfthSchoolId && typeof student.school.twelfthSchoolId === 'object') ? student.school.twelfthSchoolId : null,
        cutoff_mark: student.school?.cutoffMark || 0,
        admission_type: student.school?.admissionType || 'COUNSELLING',
        scholarship_details: student.school?.scholarshipDetails || 'Nil',
        lateral_entry: student.school?.lateralEntry || null,
      },
      semesters: formattedSemesters,
      cleared_subjects: arrearStats.clearedSubjects,
      arrear_history: arrearStats.arrearHistory,
      active_arrears_count: arrearStats.activeArrearsCount,
      historical_arrears_count: arrearStats.historicalArrearsCount,
      cleared_arrears_count: arrearStats.clearedCount,
      arrear_status_label: arrearStats.statusLabel,
      total_arrears: arrearStats.activeArrearsCount,
      active_arrear_subjects: arrearStats.activeArrearSubjects,
      currentMentor,
      mentorHistory,
      meetings: formattedMeetings,
      counsellingRecords: formattedCounselling,
      monthlyProgress: formattedProgress,
    });
  } catch (err: any) {
    console.error('getStudentById error:', err);
    return sendError(res, 'Failed to fetch student profile.', 500);
  }
}

// Create new student login account (Admin creates basic identity only)
export async function createStudent(req: AuthRequest, res: Response) {
  const {
    registerNumber,
    fullName,
    departmentId,
    batchId,
    username,
    temporaryPassword = 'Password@123',
    isActive = 1,
  } = req.body;

  if (!registerNumber || !fullName || !departmentId || !batchId) {
    return sendError(res, 'Student Name, Register Number, Department, and Academic Batch are mandatory.', 400);
  }

  const effectiveUsername = username && username.trim() !== '' ? username.trim() : registerNumber.trim();

  try {
    // Check for existing register number or username
    const existingStudent = await Student.findOne({ registerNumber: registerNumber.trim() });
    if (existingStudent) {
      return sendError(res, `A student with Register Number '${registerNumber.trim()}' already exists.`, 409);
    }

    const existingUser = await User.findOne({ username: effectiveUsername.toLowerCase() });
    if (existingUser) {
      return sendError(res, `Username '${effectiveUsername}' is already taken. Please choose another username.`, 409);
    }

    // Resolve department and batch
    let deptDoc = await Department.findById(departmentId);
    if (!deptDoc) {
      deptDoc = await Department.findOne({ code: departmentId.toUpperCase() });
    }
    if (!deptDoc) {
      deptDoc = await Department.findOne();
    }

    let batchDoc = await Batch.findById(batchId);
    if (!batchDoc) {
      batchDoc = await Batch.findOne({ name: batchId });
    }
    if (!batchDoc) {
      batchDoc = await Batch.findOne();
    }

    const passwordHash = await bcrypt.hash(temporaryPassword.trim(), 10);

    // Single source of truth: computed ONCE and written identically to both
    // Student.email and the mirrored User.email.
    const institutionalEmail = `${registerNumber.trim().toLowerCase()}@ksrce.ac.in`;

    const newUser = await User.create({
      username: effectiveUsername.toLowerCase(),
      passwordHash,
      role: 'STUDENT',
      email: institutionalEmail,
      fullName: fullName.trim(),
      department: deptDoc?._id,
      isActive: isActive === 1 || isActive === true,
    });

    const newStudent = await Student.create({
      user: newUser._id,
      registerNumber: registerNumber.trim(),
      fullName: fullName.trim(),
      department: deptDoc?._id,
      batch: batchDoc?._id,
      email: institutionalEmail,
      profileCompleted: false,
      isActive: isActive === 1 || isActive === true,
      parent: {},
      siblings: [],
      school: {},
    });

    // Initialize 8 blank semester rows
    for (let sem = 1; sem <= 8; sem++) {
      await AcademicRecord.create({
        student: newStudent._id,
        semesterNumber: sem,
        cgpa: 0,
        sgpa: 0,
        arrearsCount: 0,
        arrearsSubjects: '',
      });
    }

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_STUDENT_ACCOUNT',
      entity: 'STUDENT',
      entityId: newStudent._id.toString(),
      details: {
        registerNumber: newStudent.registerNumber,
        username: effectiveUsername,
        permanentStudentId: newStudent._id.toString(),
      },
      req,
    });

    return sendSuccess(
      res,
      {
        studentId: newStudent._id.toString(),
        userId: newUser._id.toString(),
        registerNumber: newStudent.registerNumber,
        username: effectiveUsername,
        temporaryPassword: temporaryPassword.trim(),
        fullName: newStudent.fullName,
        departmentName: deptDoc?.name,
        batchName: batchDoc?.name,
        profileCompleted: false,
      },
      'Student login account created successfully. The student will complete their profile upon first login.',
      201
    );
  } catch (err: any) {
    console.error('createStudent error:', err);
    return sendError(res, 'Failed to create student account: ' + err.message, 500);
  }
}

// Student First-Login Complete Profile Submission
export async function submitStudentProfile(req: AuthRequest, res: Response) {
  const targetId = req.params.id || req.body.studentId;

  try {
    let student = null;
    if (targetId) {
      student = await findStudentByIdOrReg(targetId);
    } else if (req.user?.role === ROLES.STUDENT) {
      student = await Student.findOne({ user: req.user.id });
    }

    if (!student) {
      return sendError(res, 'Student account not found.', 404);
    }

    // RBAC: Only student or admin can submit
    if (req.user?.role === ROLES.STUDENT && student.user.toString() !== req.user.id) {
      return sendError(res, 'You are not authorized to complete this profile.', 403);
    }

    const {
      mobileNumber,
      email,
      dob,
      bloodGroup,
      residentialType,
      address,
      fatherName,
      fatherContact,
      fatherOccupation,
      motherName,
      motherContact,
      motherOccupation,
      siblings,
      tenthMark,
      tenthSchool,
      tenthSchoolId,
      twelfthMark,
      twelfthSchool,
      twelfthSchoolId,
      cutoffMark,
      admissionType,
      scholarshipDetails,
      lateralEntry,
      year,
      section,
      semesters,
    } = req.body;

    // ---- Validate everything up-front; nothing is persisted on failure ------
    const errors: string[] = [];

    const mobileResult = parseMobile(mobileNumber, false);
    if (!mobileResult.ok) errors.push(mobileResult.error as string);

    const emailResult = parseEmail(email, false);
    if (!emailResult.ok) errors.push(emailResult.error as string);

    const yearResult = parseStudyYear(year);
    if (!yearResult.ok) errors.push(yearResult.error as string);

    const sectionResult = parseSection(section);
    if (!sectionResult.ok) errors.push(sectionResult.error as string);

    const tenthMarkResult = parseStrictNumber(tenthMark, { field: '10th standard mark', min: 0, max: 1000 });
    if (!tenthMarkResult.ok) errors.push(tenthMarkResult.error as string);

    const twelfthMarkResult = parseStrictNumber(twelfthMark, { field: '12th standard mark', min: 0, max: 1000 });
    if (!twelfthMarkResult.ok) errors.push(twelfthMarkResult.error as string);

    const cutoffResult = parseStrictNumber(cutoffMark, { field: 'TNEA cut-off mark', min: 0, max: 200 });
    if (!cutoffResult.ok) errors.push(cutoffResult.error as string);

    const effectiveAdmissionType = admissionType || student.school?.admissionType || 'COUNSELLING';
    if (!['COUNSELLING', 'MANAGEMENT', 'LATERAL_ENTRY'].includes(effectiveAdmissionType)) {
      errors.push('Admission type must be COUNSELLING, MANAGEMENT or LATERAL_ENTRY.');
    }
    if (effectiveAdmissionType === 'LATERAL_ENTRY') {
      const lat = (lateralEntry ?? {}) as any;
      const college = String(
        lat.previousCollegeName ?? lat.previous_college_name ?? student.school?.lateralEntry?.previousCollegeName ?? ''
      ).trim();
      const course = String(
        lat.previousCourseDiploma ?? lat.previous_course_diploma ?? student.school?.lateralEntry?.previousCourseDiploma ?? ''
      ).trim();
      if (!college) errors.push('Previous College Name is required for Lateral Entry admission.');
      if (!course) errors.push('Previous Course / Diploma is required for Lateral Entry admission.');
    }

    // Build validated semester payloads (arrear subject list is authoritative).
    const semesterWrites: {
      semesterNumber: number;
      cgpa: number;
      sgpa?: number;
      arrearsCount: number;
      arrearsSubjects: string;
      arrearSubjectDetails: { subjectCode: string; subjectName: string }[];
    }[] = [];

    if (Array.isArray(semesters)) {
      // Students may NOT write CGPA, SGPA or arrears — not even on first login.
      // Those values must be entered by faculty/HOD/admin, or by the student via
      // an Academic Edit Request approved by the assigned mentor.
      if (req.user?.role === ROLES.STUDENT) {
        const offending: string[] = [];
        for (const sem of semesters) {
          const semNum = sem?.semesterNumber ?? sem?.semester_number ?? '?';
          if (sem?.cgpa !== undefined && sem?.cgpa !== null && sem?.cgpa !== '') {
            offending.push(`Semester ${semNum} CGPA`);
          }
          if (sem?.sgpa !== undefined && sem?.sgpa !== null && sem?.sgpa !== '') {
            offending.push(`Semester ${semNum} SGPA`);
          }
          if (
            sem?.arrearsSubjects || sem?.arrears_subjects ||
            sem?.arrearSubjectDetails || sem?.arrear_subject_details ||
            (Number(sem?.arrearsCount ?? sem?.arrears_count ?? 0) > 0)
          ) {
            offending.push(`Semester ${semNum} arrear details`);
          }
        }
        if (offending.length) {
          return sendError(
            res,
            `Access denied: students cannot enter ${offending.join(', ')}. ` +
              'Submit an Academic Edit Request and your mentor/HOD will review and approve the correction.',
            403
          );
        }
      }

      const seen = new Set<number>();
      for (const sem of semesters) {
        const semResult = parseSemesterNumber(sem?.semesterNumber ?? sem?.semester_number);
        if (!semResult.ok) {
          errors.push(semResult.error as string);
          continue;
        }
        const semNum = semResult.value as number;
        if (seen.has(semNum)) {
          errors.push(`Semester 0${semNum} appears more than once in the request.`);
          continue;
        }
        seen.add(semNum);

        const cgpaResult = parseGrade(sem?.cgpa, `Semester 0${semNum} CGPA`, false);
        if (!cgpaResult.ok) errors.push(cgpaResult.error as string);

        const sgpaResult = parseGrade(sem?.sgpa, `Semester 0${semNum} SGPA`, false);
        if (!sgpaResult.ok) errors.push(sgpaResult.error as string);

        const { codes, details } = normaliseArrearSubjects(
          sem?.arrearSubjectDetails ?? sem?.arrear_subject_details ?? sem?.arrearsSubjects ?? sem?.arrears_subjects
        );
        if (codes.length === 0) {
          const claimed = sem?.arrearsCount ?? sem?.arrears_count;
          if (claimed !== undefined && Number(claimed) > 0) {
            errors.push(
              `Semester 0${semNum}: ${claimed} arrear(s) claimed but no subject codes supplied. Provide the subject list instead of a count.`
            );
          }
        }

        const cgpa = cgpaResult.value !== undefined ? (cgpaResult.value as number) : 0;
        // SGPA must never silently inherit CGPA. When it is not supplied, the
        // existing stored SGPA is left untouched (see the $set build below).
        const sgpa = sgpaResult.value !== undefined ? (sgpaResult.value as number) : undefined;

        semesterWrites.push({
          semesterNumber: semNum,
          cgpa,
          sgpa,
          arrearsCount: details.length,
          arrearsSubjects: codes.join(', '),
          arrearSubjectDetails: details,
        });
      }
    }

    if (errors.length) {
      return sendError(res, joinErrors(errors), 400, errors);
    }

    // Validate school selection: accept selected school from database OR entered school name
    let tenthSchoolDoc = null;
    if (tenthSchoolId && mongoose.Types.ObjectId.isValid(tenthSchoolId)) {
      tenthSchoolDoc = await School.findById(tenthSchoolId);
    }
    const finalTenthSchoolName = tenthSchoolDoc?.displayName || tenthSchool?.trim() || student.school?.tenthSchool || '';
    if (!finalTenthSchoolName) {
      return sendError(res, 'Please provide or select your 10th standard school name.', 400);
    }

    let twelfthSchoolDoc = null;
    if (twelfthSchoolId && mongoose.Types.ObjectId.isValid(twelfthSchoolId)) {
      twelfthSchoolDoc = await School.findById(twelfthSchoolId);
    }
    const finalTwelfthSchoolName = twelfthSchoolDoc?.displayName || twelfthSchool?.trim() || student.school?.twelfthSchool || '';
    if (!finalTwelfthSchoolName) {
      return sendError(res, 'Please provide or select your 12th standard school name.', 400);
    }

    // Auto-index custom school entries into School model so they appear in dropdown searches
    if (!tenthSchoolDoc && tenthSchool?.trim()) {
      const cleanName = tenthSchool.trim();
      let match = await School.findOne({
        $or: [
          { schoolName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { displayName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        ],
      });
      if (!match) {
        try {
          match = await School.create({
            schoolName: cleanName,
            displayName: cleanName,
            city: 'General',
            district: 'Tamil Nadu',
            state: 'Tamil Nadu',
            schoolType: 'Other',
            isActive: true,
          });
        } catch {
          // ignore error
        }
      }
      if (match) tenthSchoolDoc = match;
    }

    if (!twelfthSchoolDoc && twelfthSchool?.trim()) {
      const cleanName = twelfthSchool.trim();
      let match = await School.findOne({
        $or: [
          { schoolName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { displayName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        ],
      });
      if (!match) {
        try {
          match = await School.create({
            schoolName: cleanName,
            displayName: cleanName,
            city: 'General',
            district: 'Tamil Nadu',
            state: 'Tamil Nadu',
            schoolType: 'Other',
            isActive: true,
          });
        } catch {
          // ignore error
        }
      }
      if (match) twelfthSchoolDoc = match;
    }

    // Update student personal and subdocument fields
    if (mobileNumber !== undefined) {
      student.mobileNumber = mobileResult.value as string;
    }
    if (email !== undefined) {
      student.email = emailResult.value as string;
    }
    student.dob = dob || student.dob;
    student.bloodGroup = bloodGroup || student.bloodGroup;
    student.residentialType = residentialType || student.residentialType;
    student.address = address || student.address;
    if (yearResult.value !== undefined) {
      student.year = yearResult.value as number;
    }
    if (section !== undefined) {
      student.section = sectionResult.value || student.section;
    }
    student.profileCompleted = true;
    student.profileCompletedAt = new Date();

    student.parent = {
      fatherName: fatherName || student.parent?.fatherName || '',
      fatherContact: fatherContact || student.parent?.fatherContact || '',
      fatherOccupation: fatherOccupation || student.parent?.fatherOccupation || '',
      motherName: motherName || student.parent?.motherName || '',
      motherContact: motherContact || student.parent?.motherContact || '',
      motherOccupation: motherOccupation || student.parent?.motherOccupation || '',
    };

    if (Array.isArray(siblings)) {
      student.siblings = siblings
        .filter((s: any) => s.siblingName || s.name)
        .map((s: any) => ({
          siblingName: s.siblingName || s.name,
          siblingContact: s.siblingContact || s.contact || '',
          siblingOccupation: s.siblingOccupation || s.occupation || 'Student',
        }));
    }

    student.school = {
      tenthMark: tenthMarkResult.value ?? student.school?.tenthMark ?? 0,
      tenthSchool: finalTenthSchoolName,
      tenthSchoolId: tenthSchoolDoc?._id || (mongoose.Types.ObjectId.isValid(tenthSchoolId) ? tenthSchoolId : null) || student.school?.tenthSchoolId || null,
      twelfthMark: twelfthMarkResult.value ?? student.school?.twelfthMark ?? 0,
      twelfthSchool: finalTwelfthSchoolName,
      twelfthSchoolId: twelfthSchoolDoc?._id || (mongoose.Types.ObjectId.isValid(twelfthSchoolId) ? twelfthSchoolId : null) || student.school?.twelfthSchoolId || null,
      cutoffMark: cutoffResult.value ?? student.school?.cutoffMark ?? 0,
      admissionType: effectiveAdmissionType,
      scholarshipDetails: (scholarshipDetails || student.school?.scholarshipDetails || 'Nil').trim(),
      // Only lateral-entry admissions persist lateral data — never empty padding.
      lateralEntry: effectiveAdmissionType === 'LATERAL_ENTRY'
        ? {
            previousCollegeName: String(
              lateralEntry?.previousCollegeName ??
                lateralEntry?.previous_college_name ??
                student.school?.lateralEntry?.previousCollegeName ??
                ''
            ).trim(),
            previousCourseDiploma: String(
              lateralEntry?.previousCourseDiploma ??
                lateralEntry?.previous_course_diploma ??
                student.school?.lateralEntry?.previousCourseDiploma ??
                ''
            ).trim(),
            previousInstitution: String(
              lateralEntry?.previousInstitution ??
                lateralEntry?.previous_institution ??
                student.school?.lateralEntry?.previousInstitution ??
                ''
            ).trim(),
            previousQualificationDetails: String(
              lateralEntry?.previousQualificationDetails ??
                lateralEntry?.previous_qualification_details ??
                student.school?.lateralEntry?.previousQualificationDetails ??
                ''
            ).trim(),
            admissionYear: lateralEntry?.admissionYear || lateralEntry?.admission_year || student.school?.lateralEntry?.admissionYear || undefined,
          }
        : undefined,
    };

    await student.save();

    // Keep the mirrored User record's email identical (single source of truth).
    if (student.email) {
      await User.findByIdAndUpdate(student.user, { email: student.email });
    }

    // Semester grades: validated values only; arrears derived from the subject list.
    for (const w of semesterWrites) {
      const setFields: Record<string, any> = {
        cgpa: w.cgpa,
        arrearsCount: w.arrearsCount,
        arrearsSubjects: w.arrearsSubjects,
        arrearSubjectDetails: w.arrearSubjectDetails,
      };
      // Only overwrite SGPA when it was actually supplied.
      if (w.sgpa !== undefined) setFields.sgpa = w.sgpa;

      await AcademicRecord.findOneAndUpdate(
        { student: student._id, semesterNumber: w.semesterNumber },
        {
          $set: setFields,
          $setOnInsert: {
            student: student._id,
            semesterNumber: w.semesterNumber,
            sgpa: w.sgpa ?? 0,
            clearedSubjects: [],
            remarks: '',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    await logAudit({
      userId: req.user!.id,
      action: 'SUBMIT_STUDENT_PROFILE',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      details: { registerNumber: student.registerNumber },
      req,
    });

    // Automatically generate and attach/update the Student Details Form PDF
    try {
      await syncStudentDetailsPdf(student._id.toString(), req.user?.id);
    } catch (pdfErr) {
      console.error('Failed to sync student details PDF on profile submission:', pdfErr);
    }

    return sendSuccess(
      res,
      { studentId: student._id.toString(), profileCompleted: true },
      'Your profile has been successfully completed.'
    );
  } catch (err: any) {
    console.error('submitStudentProfile error:', err);
    return sendError(res, 'Failed to submit student profile.', 500);
  }
}

// Admin resets student password
export async function resetStudentPassword(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const { newPassword = 'Password@123' } = req.body;

  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    await User.findByIdAndUpdate(student.user, { passwordHash });

    await logAudit({
      userId: req.user!.id,
      action: 'RESET_STUDENT_PASSWORD',
      entity: 'USER',
      entityId: student.user.toString(),
      details: { registerNumber: student.registerNumber },
      req,
    });

    return sendSuccess(
      res,
      { registerNumber: student.registerNumber, newPassword: newPassword.trim() },
      'Student password reset successfully.'
    );
  } catch (err: any) {
    console.error('resetStudentPassword error:', err);
    return sendError(res, 'Failed to reset student password.', 500);
  }
}

// Toggle student active status (Activate / Deactivate account)
export async function toggleStudentStatus(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    const newStatus = !student.isActive;
    student.isActive = newStatus;
    await student.save();

    await User.findByIdAndUpdate(student.user, { isActive: newStatus });

    await logAudit({
      userId: req.user!.id,
      action: newStatus ? 'ACTIVATE_STUDENT' : 'DEACTIVATE_STUDENT',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      req,
    });

    return sendSuccess(
      res,
      { isActive: newStatus ? 1 : 0 },
      `Student account ${newStatus ? 'activated' : 'deactivated'} successfully.`
    );
  } catch (err: any) {
    console.error('toggleStudentStatus error:', err);
    return sendError(res, 'Failed to update student status.', 500);
  }
}

// Update student personal information
export async function updateStudent(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const {
    fullName,
    dob,
    bloodGroup,
    residentialType,
    mobileNumber,
    email,
    address,
    fatherName,
    fatherContact,
    fatherOccupation,
    motherName,
    motherContact,
    motherOccupation,
  } = req.body;

  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    // Authorisation: student = self, mentor = assigned mentee, HOD = own department, admin = all.
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    if (req.user?.role === ROLES.STUDENT) {
      // A student may maintain ONLY their own personal/contact details and
      // Year/Section here. Everything else must go through a request workflow
      // or an administrator, so this endpoint can never become a back door to
      // identity or academic data.
      const allowedForStudent = new Set([
        'id', 'studentId',
        'mobileNumber', 'mobile_number',
        'email',
        'address',
        'dob', 'dateOfBirth', 'date_of_birth',
        'bloodGroup', 'blood_group',
        'residentialType', 'residential_type',
        'fatherName', 'father_name',
        'fatherContact', 'father_contact',
        'fatherOccupation', 'father_occupation',
        'motherName', 'mother_name',
        'motherContact', 'mother_contact',
        'motherOccupation', 'mother_occupation',
        'year', 'section',
      ]);
      const rejected = Object.keys(req.body || {}).filter((k) => !allowedForStudent.has(k));
      if (rejected.length) {
        return sendError(
          res,
          `Access denied: students cannot modify ${rejected.join(', ')} from this endpoint. ` +
            'Register Number, Department and Batch require an Identity Edit Request; ' +
            'CGPA, SGPA and arrears require an Academic Edit Request approved by your mentor.',
          403
        );
      }
    }

    // ---- VALIDATE EVERYTHING FIRST (no partial writes) ----------------------
    const errors: string[] = [];

    const mobileResult = parseMobile(mobileNumber, false);
    if (!mobileResult.ok) errors.push(mobileResult.error as string);

    const emailResult = parseEmail(email, false);
    if (!emailResult.ok) errors.push(emailResult.error as string);

    const yearResult = parseStudyYear(req.body.year);
    if (!yearResult.ok) errors.push(yearResult.error as string);

    const sectionResult = parseSection(req.body.section);
    if (!sectionResult.ok) errors.push(sectionResult.error as string);

    const admTypeRaw = req.body.admissionType ?? req.body.admission_type;
    if (admTypeRaw !== undefined && !['COUNSELLING', 'MANAGEMENT', 'LATERAL_ENTRY'].includes(admTypeRaw)) {
      errors.push('Admission type must be COUNSELLING, MANAGEMENT or LATERAL_ENTRY.');
    }

    const latRaw = req.body.lateralEntry ?? req.body.lateral_entry;
    const effectiveAdmType = admTypeRaw ?? student.school?.admissionType ?? 'COUNSELLING';
    if (effectiveAdmType === 'LATERAL_ENTRY' && (latRaw || admTypeRaw === 'LATERAL_ENTRY')) {
      const lat = latRaw || {};
      const college = String(lat.previousCollegeName ?? lat.previous_college_name ?? student.school?.lateralEntry?.previousCollegeName ?? '').trim();
      const course = String(lat.previousCourseDiploma ?? lat.previous_course_diploma ?? student.school?.lateralEntry?.previousCourseDiploma ?? '').trim();
      if (!college) errors.push('Previous College Name is required for Lateral Entry admission.');
      if (!course) errors.push('Previous Course / Diploma is required for Lateral Entry admission.');
    }

    if (errors.length) {
      return sendError(res, joinErrors(errors), 400, errors);
    }

    // ---- ALL VALID: apply ---------------------------------------------------
    if (dob) student.dob = dob;
    if (bloodGroup) student.bloodGroup = bloodGroup;
    if (residentialType) student.residentialType = residentialType;
    if (mobileNumber !== undefined) {
      student.mobileNumber = mobileResult.value as string;
    }
    if (email !== undefined) {
      student.email = emailResult.value as string;
      // Keep the mirrored User record identical (single source of truth).
      await User.findByIdAndUpdate(student.user, { email: student.email || undefined });
    }
    if (address) student.address = address;

    if (yearResult.value !== undefined) {
      student.year = yearResult.value as number;
    }
    if (req.body.section !== undefined) {
      student.section = sectionResult.value || student.section;
    }

    if (req.body.admissionType !== undefined || req.body.admission_type !== undefined) {
      const admType = req.body.admissionType || req.body.admission_type;
      if (!student.school) student.school = {};
      if (admType === 'LATERAL_ENTRY') {
        student.school.admissionType = 'LATERAL_ENTRY';
        const lat = req.body.lateralEntry || req.body.lateral_entry || {};
        student.school.lateralEntry = {
          previousCollegeName: lat.previousCollegeName || lat.previous_college_name || student.school.lateralEntry?.previousCollegeName || '',
          previousCourseDiploma: lat.previousCourseDiploma || lat.previous_course_diploma || student.school.lateralEntry?.previousCourseDiploma || '',
          previousInstitution: lat.previousInstitution || lat.previous_institution || student.school.lateralEntry?.previousInstitution || '',
          previousQualificationDetails: lat.previousQualificationDetails || lat.previous_qualification_details || student.school.lateralEntry?.previousQualificationDetails || '',
          admissionYear: lat.admissionYear || lat.admission_year || student.school.lateralEntry?.admissionYear || undefined,
        };
      } else {
        student.school.admissionType = admType === 'MANAGEMENT' ? 'MANAGEMENT' : 'COUNSELLING';
        student.school.lateralEntry = undefined;
      }
    } else if (req.body.lateralEntry || req.body.lateral_entry) {
      const lat = req.body.lateralEntry || req.body.lateral_entry;
      if (!student.school) student.school = {};
      if (student.school.admissionType === 'LATERAL_ENTRY') {
        student.school.lateralEntry = {
          previousCollegeName: lat.previousCollegeName || lat.previous_college_name || student.school.lateralEntry?.previousCollegeName || '',
          previousCourseDiploma: lat.previousCourseDiploma || lat.previous_course_diploma || student.school.lateralEntry?.previousCourseDiploma || '',
          previousInstitution: lat.previousInstitution || lat.previous_institution || student.school.lateralEntry?.previousInstitution || '',
          previousQualificationDetails: lat.previousQualificationDetails || lat.previous_qualification_details || student.school.lateralEntry?.previousQualificationDetails || '',
          admissionYear: lat.admissionYear || lat.admission_year || student.school.lateralEntry?.admissionYear || undefined,
        };
      }
    }

    if (req.body.scholarshipDetails !== undefined || req.body.scholarship_details !== undefined) {
      if (!student.school) student.school = {};
      student.school.scholarshipDetails = (req.body.scholarshipDetails ?? req.body.scholarship_details ?? '').trim() || 'Nil';
    }

    if (fatherName || fatherContact || fatherOccupation || motherName || motherContact || motherOccupation) {
      student.parent = {
        fatherName: fatherName ?? student.parent?.fatherName,
        fatherContact: fatherContact ?? student.parent?.fatherContact,
        fatherOccupation: fatherOccupation ?? student.parent?.fatherOccupation,
        motherName: motherName ?? student.parent?.motherName,
        motherContact: motherContact ?? student.parent?.motherContact,
        motherOccupation: motherOccupation ?? student.parent?.motherOccupation,
      };
    }

    if (req.user?.role === ROLES.ADMIN) {
      if (fullName) {
        student.fullName = fullName;
        await User.findByIdAndUpdate(student.user, { fullName });
      }
      if (req.body.registerNumber || req.body.register_number) {
        const newReg = (req.body.registerNumber || req.body.register_number).trim().toUpperCase();
        student.registerNumber = newReg;
        await User.findByIdAndUpdate(student.user, { username: newReg });
      }
      if (req.body.departmentId) {
        student.department = req.body.departmentId;
      }
      if (req.body.batchId) {
        student.batch = req.body.batchId;
      }
      if (req.body.isActive !== undefined) {
        const activeBool = req.body.isActive === true || req.body.isActive === 1 || req.body.isActive === '1';
        student.isActive = activeBool;
        await User.findByIdAndUpdate(student.user, { isActive: activeBool });
      }
      if (req.body.newPassword && req.body.newPassword.trim()) {
        const passwordHash = await bcrypt.hash(req.body.newPassword.trim(), 10);
        await User.findByIdAndUpdate(student.user, { passwordHash });
      }
    } else if (fullName && req.user?.role !== ROLES.STUDENT) {
      student.fullName = fullName;
      await User.findByIdAndUpdate(student.user, { fullName });
    }

    await student.save();

    // Automatically update the existing Student Details Form PDF (replaces in place)
    try {
      await syncStudentDetailsPdf(student._id.toString(), req.user?.id);
    } catch (pdfErr) {
      console.error('Failed to sync student details PDF on profile update:', pdfErr);
    }

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_STUDENT_PROFILE',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      req,
    });

    return sendSuccess(res, null, 'Student information updated successfully.');
  } catch (err: any) {
    console.error('updateStudent error:', err);
    return sendError(res, 'Failed to update student profile.', 500);
  }
}

/**
 * Year / Section self-service.
 *
 * Requirement: a student may edit Study Year and Section directly, with no
 * approval workflow. Those are the ONLY two fields a student may write here —
 * any CGPA/SGPA/arrear payload is rejected with 403 so it cannot be used as a
 * back door to the academics endpoint.
 */
export async function updateStudentYearSection(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    if (req.user?.role === ROLES.STUDENT) {
      const forbidden: string[] = [];
      for (const key of Object.keys(req.body || {})) {
        if (!['year', 'section', 'id', 'studentId'].includes(key)) {
          forbidden.push(key);
        }
      }
      if (forbidden.length) {
        return sendError(
          res,
          `Students may only update Year and Section here. Rejected fields: ${forbidden.join(', ')}. Use an Academic Edit Request for CGPA/SGPA.`,
          403
        );
      }
    }

    const errors: string[] = [];
    const yearResult = parseStudyYear(req.body?.year);
    if (!yearResult.ok) errors.push(yearResult.error as string);

    const sectionResult = parseSection(req.body?.section);
    if (!sectionResult.ok) errors.push(sectionResult.error as string);

    if (req.body?.year === undefined && req.body?.section === undefined) {
      errors.push('Provide a Year and/or Section to update.');
    }
    if (errors.length) {
      return sendError(res, joinErrors(errors), 400, errors);
    }

    if (yearResult.value !== undefined) {
      student.year = yearResult.value as number;
    }
    if (req.body?.section !== undefined && sectionResult.value) {
      student.section = sectionResult.value as string;
    }

    await student.save();

    try {
      await syncStudentDetailsPdf(student._id.toString(), req.user?.id);
    } catch (pdfErr) {
      console.error('Failed to sync student details PDF on year/section update:', pdfErr);
    }

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_STUDENT_YEAR_SECTION',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      details: { year: student.year, section: student.section },
      req,
    });

    return sendSuccess(
      res,
      { year: student.year, section: student.section },
      `Year and section updated to ${student.year} / ${student.section}.`
    );
  } catch (err: any) {
    console.error('updateStudentYearSection error:', err);
    return sendError(res, 'Failed to update year and section.', 500);
  }
}

// Update student academic records (Semesters 1-8)
export async function updateStudentAcademics(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const {
    semesters,
    tenthMark,
    tenthSchool,
    tenthSchoolId,
    twelfthMark,
    twelfthSchool,
    twelfthSchoolId,
    cutoffMark,
    admissionType,
    scholarshipDetails,
    lateralEntry,
    year,
    section,
  } = req.body;

  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    // Authorisation: student = self, mentor = assigned mentee, HOD = own department, admin = all.
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const isStudent = req.user?.role === ROLES.STUDENT;
    const isPrivileged = ([ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN] as string[]).includes(req.user!.role);

    // -----------------------------------------------------------------------
    // STUDENTS MAY NOT WRITE CGPA / SGPA / ARREARS DIRECTLY.
    // They must raise an Academic Edit Request instead.
    // -----------------------------------------------------------------------
    if (isStudent) {
      const blocked: string[] = [];
      if (Array.isArray(semesters)) {
        semesters.forEach((sem: any) => {
          if (sem?.cgpa !== undefined) blocked.push('CGPA');
          if (sem?.sgpa !== undefined) blocked.push('SGPA');
          if (sem?.arrearsCount !== undefined || sem?.arrears_count !== undefined) blocked.push('Arrear count');
          if (sem?.arrearsSubjects !== undefined || sem?.arrears_subjects !== undefined) blocked.push('Arrear subjects');
          if (sem?.clearedSubjects !== undefined || sem?.cleared_subjects !== undefined) blocked.push('Arrear clearances');
        });
      }
      if (blocked.length) {
        return sendError(
          res,
          `Students cannot directly modify ${Array.from(new Set(blocked)).join(', ')}. Submit an Academic Edit Request from your Academic Ledger for mentor approval.`,
          403
        );
      }
    }

    // =======================================================================
    // PHASE 1 — VALIDATE EVERYTHING. Nothing is written in this phase.
    // =======================================================================
    const errors: string[] = [];

    const yearResult = parseStudyYear(year);
    if (!yearResult.ok) errors.push(yearResult.error as string);

    const sectionResult = parseSection(section);
    if (!sectionResult.ok) errors.push(sectionResult.error as string);

    const tenthMarkResult = parseStrictNumber(tenthMark, { field: '10th standard mark', min: 0, max: 1000 });
    if (!tenthMarkResult.ok) errors.push(tenthMarkResult.error as string);

    const twelfthMarkResult = parseStrictNumber(twelfthMark, { field: '12th standard mark', min: 0, max: 1000 });
    if (!twelfthMarkResult.ok) errors.push(twelfthMarkResult.error as string);

    const cutoffResult = parseStrictNumber(cutoffMark, { field: 'TNEA cut-off mark', min: 0, max: 200 });
    if (!cutoffResult.ok) errors.push(cutoffResult.error as string);

    const admissionTypeValue = admissionType ?? student.school?.admissionType ?? 'COUNSELLING';
    if (!['COUNSELLING', 'MANAGEMENT', 'LATERAL_ENTRY'].includes(admissionTypeValue)) {
      errors.push('Admission type must be COUNSELLING, MANAGEMENT or LATERAL_ENTRY.');
    }

    // Lateral entry: required only when admission type is LATERAL_ENTRY.
    let lateralPayload: Record<string, any> | undefined;
    if (admissionTypeValue === 'LATERAL_ENTRY') {
      const lat = (lateralEntry ?? {}) as any;
      const college = String(
        lat.previousCollegeName ?? lat.previous_college_name ?? student.school?.lateralEntry?.previousCollegeName ?? ''
      ).trim();
      const course = String(
        lat.previousCourseDiploma ?? lat.previous_course_diploma ?? student.school?.lateralEntry?.previousCourseDiploma ?? ''
      ).trim();
      if (!college) errors.push('Previous College Name is required for Lateral Entry admission.');
      if (!course) errors.push('Previous Course / Diploma is required for Lateral Entry admission.');

      const admYear = lat.admissionYear ?? lat.admission_year ?? student.school?.lateralEntry?.admissionYear;
      if (admYear !== undefined && admYear !== null && String(admYear).trim() !== '') {
        const yr = parseStrictNumber(admYear, { field: 'Lateral entry admission year', min: 2000, max: 2100, integer: true });
        if (!yr.ok) errors.push(yr.error as string);
        else lateralPayload = { admissionYear: yr.value };
      }

      lateralPayload = {
        ...(lateralPayload || {}),
        previousCollegeName: college,
        previousCourseDiploma: course,
        previousInstitution: String(
          lat.previousInstitution ?? lat.previous_institution ?? student.school?.lateralEntry?.previousInstitution ?? ''
        ).trim(),
        previousQualificationDetails: String(
          lat.previousQualificationDetails ??
            lat.previous_qualification_details ??
            student.school?.lateralEntry?.previousQualificationDetails ??
            ''
        ).trim(),
      };
    }

    // Resolve school references before validation completes (needed for the write).
    let tenthSchoolDoc: any = null;
    let twelfthSchoolDoc: any = null;
    if (tenthSchoolId) {
      if (!mongoose.Types.ObjectId.isValid(String(tenthSchoolId))) errors.push('Invalid 10th standard school reference.');
      else tenthSchoolDoc = await School.findById(tenthSchoolId);
    }
    if (twelfthSchoolId) {
      if (!mongoose.Types.ObjectId.isValid(String(twelfthSchoolId))) errors.push('Invalid 12th standard school reference.');
      else twelfthSchoolDoc = await School.findById(twelfthSchoolId);
    }

    // Semester payloads: strict grade validation, arrear list is authoritative.
    type SemPlan = {
      semesterNumber: number;
      cgpa?: number;
      sgpa?: number;
      details: { subjectCode: string; subjectName: string }[];
      subjectString: string;
      clearedSubjects?: any[];
      remarks?: string;
    };
    const semesterPlans: SemPlan[] = [];
    const touchesSemesters = Array.isArray(semesters) && semesters.length > 0;

    if (touchesSemesters && !isPrivileged) {
      errors.push('Only a mentor, HOD or administrator can modify semester CGPA/SGPA/arrear records.');
    }

    if (touchesSemesters) {
      const seenSemesters = new Set<number>();
      for (const sem of semesters) {
        const semResult = parseSemesterNumber(sem?.semesterNumber ?? sem?.semester_number);
        if (!semResult.ok) {
          errors.push(semResult.error as string);
          continue;
        }
        const semNum = semResult.value as number;
        if (seenSemesters.has(semNum)) {
          errors.push(`Semester 0${semNum} appears more than once in the request.`);
          continue;
        }
        seenSemesters.add(semNum);

        const cgpaResult = parseGrade(sem?.cgpa, `Semester 0${semNum} CGPA`, false);
        if (!cgpaResult.ok) errors.push(cgpaResult.error as string);

        const sgpaResult = parseGrade(sem?.sgpa, `Semester 0${semNum} SGPA`, false);
        if (!sgpaResult.ok) errors.push(sgpaResult.error as string);

        // Arrear SUBJECT LIST is authoritative. A client-supplied count that
        // disagrees is ignored (and reported), never persisted.
        const rawSubjectInput =
          sem?.arrearSubjectDetails ?? sem?.arrear_subject_details ?? sem?.arrearsSubjects ?? sem?.arrears_subjects;
        const { codes, details } = normaliseArrearSubjects(rawSubjectInput);
        if (codes.length === 0) {
          const claimed = sem?.arrearsCount ?? sem?.arrears_count;
          if (claimed !== undefined && Number(claimed) > 0) {
            errors.push(
              `Semester 0${semNum}: ${claimed} arrear(s) claimed but no subject codes supplied. Provide the subject list instead of a count.`
            );
          }
        }

        semesterPlans.push({
          semesterNumber: semNum,
          cgpa: cgpaResult.value,
          sgpa: sgpaResult.value,
          details,
          subjectString: codes.join(', '),
          clearedSubjects: sem?.clearedSubjects ?? sem?.cleared_subjects,
          remarks: sem?.remarks,
        });
      }
    }

    if (errors.length) {
      // NOTHING has been persisted at this point.
      return sendError(res, joinErrors(errors), 400, errors);
    }

    // =======================================================================
    // PHASE 2 — PERSIST. All validation already passed.
    // =======================================================================
    if (yearResult.value !== undefined) {
      student.year = yearResult.value as number;
    }
    if (section !== undefined) {
      student.section = sectionResult.value || student.section;
    }

    const touchesSchool =
      tenthMark !== undefined ||
      tenthSchool !== undefined ||
      tenthSchoolId !== undefined ||
      twelfthMark !== undefined ||
      twelfthSchool !== undefined ||
      twelfthSchoolId !== undefined ||
      cutoffMark !== undefined ||
      scholarshipDetails !== undefined ||
      admissionType !== undefined ||
      lateralEntry !== undefined;

    if (touchesSchool) {
      student.school = {
        tenthMark: tenthMarkResult.value ?? student.school?.tenthMark,
        tenthSchool: (tenthSchoolDoc?.displayName || tenthSchool) ?? student.school?.tenthSchool,
        tenthSchoolId: tenthSchoolDoc?._id || student.school?.tenthSchoolId,
        twelfthMark: twelfthMarkResult.value ?? student.school?.twelfthMark,
        twelfthSchool: (twelfthSchoolDoc?.displayName || twelfthSchool) ?? student.school?.twelfthSchool,
        twelfthSchoolId: twelfthSchoolDoc?._id || student.school?.twelfthSchoolId,
        cutoffMark: cutoffResult.value ?? student.school?.cutoffMark,
        admissionType: admissionTypeValue,
        scholarshipDetails:
          scholarshipDetails !== undefined
            ? (String(scholarshipDetails).trim() || 'Nil')
            : student.school?.scholarshipDetails || 'Nil',
        // Do not persist empty lateral-entry data for non-lateral admissions.
        lateralEntry: admissionTypeValue === 'LATERAL_ENTRY' ? lateralPayload : undefined,
      } as any;
    }

    if (semesterPlans.length) {
      if (!student.arrearHistory) student.arrearHistory = [];

      for (const plan of semesterPlans) {
        const existing = await AcademicRecord.findOne({
          student: student._id,
          semesterNumber: plan.semesterNumber,
        });

        // Keep arrear history aligned with the authoritative subject list.
        plan.details.forEach((d) => {
          const known = student.arrearHistory!.find((h) => h.subjectCode.toUpperCase() === d.subjectCode);
          if (!known) {
            student.arrearHistory!.push({
              subjectCode: d.subjectCode,
              originalSemester: plan.semesterNumber,
              attempt: 1,
              status: 'ACTIVE',
              remarks: 'Active Arrear',
            } as any);
          }
        });

        // cgpa/sgpa: only change what was explicitly supplied. An omitted SGPA
        // must never silently inherit the CGPA value.
        const nextCgpa = plan.cgpa !== undefined ? plan.cgpa : (existing?.cgpa ?? 0);
        const nextSgpa = plan.sgpa !== undefined ? plan.sgpa : (existing?.sgpa ?? 0);

        await AcademicRecord.findOneAndUpdate(
          { student: student._id, semesterNumber: plan.semesterNumber },
          {
            $set: {
              cgpa: nextCgpa,
              sgpa: nextSgpa,
              // Derived from the subject list — never from a client count.
              arrearsCount: plan.details.length,
              arrearsSubjects: plan.subjectString,
              arrearSubjectDetails: plan.details,
              ...(plan.clearedSubjects !== undefined ? { clearedSubjects: plan.clearedSubjects } : {}),
              ...(plan.remarks !== undefined ? { remarks: plan.remarks } : {}),
            },
            $setOnInsert: {
              student: student._id,
              semesterNumber: plan.semesterNumber,
              clearedSubjects: [],
              remarks: '',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    await student.save();

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_STUDENT_ACADEMICS',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      req,
    });

    // Automatically update the existing Student Details Form PDF
    try {
      await syncStudentDetailsPdf(student._id.toString(), req.user?.id);
    } catch (pdfErr) {
      console.error('Failed to sync student details PDF on academics update:', pdfErr);
    }

    return sendSuccess(res, null, 'Academic records updated successfully.');
  } catch (err: any) {
    console.error('updateStudentAcademics error:', err);
    return sendError(res, 'Failed to update academic records.', 500);
  }
}

// Clear an arrear in a specific semester while strictly preserving historical semester records
export async function clearArrear(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const { subjectCode, clearedInSemester, originalSemester, remarks, clearedDate, attempt } = req.body;

  if (!subjectCode || !clearedInSemester || originalSemester === undefined || originalSemester === null) {
    return sendError(res, 'Subject Code, Original Semester, and Cleared In Semester number are mandatory.', 400);
  }

  const semCleared = parseInt(clearedInSemester, 10);
  const origSem = parseInt(originalSemester, 10);

  if (isNaN(semCleared) || semCleared < 1 || semCleared > 8) {
    return sendError(res, 'Cleared semester must be a valid number between 1 and 8.', 400);
  }

  if (isNaN(origSem) || origSem < 1 || origSem > 8) {
    return sendError(res, 'Original semester must be a valid number between 1 and 8.', 400);
  }

  if (semCleared < origSem) {
    return sendError(
      res,
      `Cleared semester (Semester 0${semCleared}) cannot be earlier than original semester (Semester 0${origSem}).`,
      400
    );
  }

  const cleanSubjectCode = subjectCode.trim().toUpperCase();
  const clearanceDate = clearedDate && String(clearedDate).trim()
    ? String(clearedDate).trim()
    : new Date().toISOString().split('T')[0];
  const clearanceRemark = remarks && remarks.trim()
    ? remarks.trim()
    : `${cleanSubjectCode} Cleared in Semester 0${semCleared}`;

  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student profile not found.', 404);
    }

    const clearanceEntry = {
      subjectCode: cleanSubjectCode,
      clearedInSemester: semCleared,
      originalSemester: origSem,
      clearedDate: clearanceDate,
      remarks: clearanceRemark,
      attempt: attempt ? parseInt(attempt, 10) : 1,
    };

    // 1. Record cleared subject in student master document
    if (!student.clearedSubjects) {
      student.clearedSubjects = [];
    }
    const existingIndex = student.clearedSubjects.findIndex(
      (c) => c.subjectCode.toUpperCase() === cleanSubjectCode
    );
    if (existingIndex >= 0) {
      student.clearedSubjects[existingIndex] = clearanceEntry;
    } else {
      student.clearedSubjects.push(clearanceEntry);
    }

    // 2. Update/create Arrear History record on student document
    if (!student.arrearHistory) {
      student.arrearHistory = [];
    }
    const histIndex = student.arrearHistory.findIndex(
      (h) => h.subjectCode.toUpperCase() === cleanSubjectCode
    );
    if (histIndex >= 0) {
      student.arrearHistory[histIndex].status = 'CLEARED';
      student.arrearHistory[histIndex].clearedInSemester = semCleared;
      student.arrearHistory[histIndex].clearedDate = clearanceDate;
      student.arrearHistory[histIndex].remarks = clearanceRemark;
      if (attempt) {
        student.arrearHistory[histIndex].attempt = parseInt(attempt, 10);
      }
    } else {
      student.arrearHistory.push({
        subjectCode: cleanSubjectCode,
        originalSemester: origSem,
        attempt: attempt ? parseInt(attempt, 10) : 1,
        clearedInSemester: semCleared,
        clearedDate: clearanceDate,
        status: 'CLEARED',
        remarks: clearanceRemark,
      });
    }

    await student.save();

    // 3. Update the semester in which it was cleared (e.g. Semester 04)
    let clearedSemRecord = await AcademicRecord.findOne({
      student: student._id,
      semesterNumber: semCleared,
    });

    if (!clearedSemRecord) {
      clearedSemRecord = new AcademicRecord({
        student: student._id,
        semesterNumber: semCleared,
        cgpa: 0,
        sgpa: 0,
        arrearsCount: 0,
        arrearsSubjects: '',
        clearedSubjects: [clearanceEntry],
        remarks: clearanceRemark,
      });
    } else {
      if (!clearedSemRecord.clearedSubjects) {
        clearedSemRecord.clearedSubjects = [];
      }
      const existingInSem = clearedSemRecord.clearedSubjects.findIndex(
        (c) => c.subjectCode.toUpperCase() === cleanSubjectCode
      );
      if (existingInSem >= 0) {
        clearedSemRecord.clearedSubjects[existingInSem] = clearanceEntry;
      } else {
        clearedSemRecord.clearedSubjects.push(clearanceEntry);
      }

      const currentRemarks = clearedSemRecord.remarks?.trim() || '';
      if (!currentRemarks || currentRemarks === 'Clear / Regular' || currentRemarks === 'None / Clear') {
        clearedSemRecord.remarks = `${clearanceRemark} / Clear`;
      } else if (!currentRemarks.includes(cleanSubjectCode)) {
        clearedSemRecord.remarks = `${currentRemarks}, ${clearanceRemark}`;
      }
    }
    await clearedSemRecord.save();

    await logAudit({
      userId: req.user!.id,
      action: 'CLEAR_STUDENT_ARREAR',
      entity: 'ACADEMIC_RECORD',
      entityId: student._id.toString(),
      details: {
        subjectCode: cleanSubjectCode,
        clearedInSemester: semCleared,
        originalSemester: origSem,
        clearedDate: clearanceDate,
        remarks: clearanceRemark,
      },
      req,
    });

    // Re-fetch all semesters and calculate updated statistics
    const allSemesters = await AcademicRecord.find({ student: student._id }).sort({ semesterNumber: 1 });
    const stats = calculateArrearStatistics(allSemesters, student.clearedSubjects || [], student.arrearHistory || []);

    // Automatically update the existing Student Details Form PDF
    try {
      await syncStudentDetailsPdf(student._id.toString(), req.user?.id);
    } catch (pdfErr) {
      console.error('Failed to sync student details PDF on arrear clearance:', pdfErr);
    }

    return sendSuccess(
      res,
      {
        studentId: student._id.toString(),
        clearanceEntry,
        stats,
      },
      `Subject ${cleanSubjectCode} cleared in Semester 0${semCleared}. Historical records preserved.`
    );
  } catch (err: any) {
    console.error('clearArrear error:', err);
    return sendError(res, 'Failed to record arrear clearance.', 500);
  }
}

// Admin permanently deletes student account and associated data
export async function deleteStudent(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student profile not found.', 404);
    }

    const studentId = student._id;
    const userId = student.user;
    const regNo = student.registerNumber;
    const fullName = student.fullName;

    // Delete associated institutional records
    await Promise.all([
      Student.deleteOne({ _id: studentId }),
      User.deleteOne({ _id: userId }),
      AcademicRecord.deleteMany({ student: studentId }),
      MentorAssignment.deleteMany({ student: studentId }),
      Meeting.deleteMany({ student: studentId }),
      CounsellingRecord.deleteMany({ student: studentId }),
      MonthlyProgress.deleteMany({ student: studentId }),
      StudentDocument.deleteMany({ student: studentId }),
    ]);

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_STUDENT',
      entity: 'STUDENT',
      entityId: studentId.toString(),
      details: { registerNumber: regNo, fullName },
      req,
    });

    return sendSuccess(
      res,
      { studentId: studentId.toString(), registerNumber: regNo },
      `Student ${fullName} (${regNo}) and all associated records deleted permanently.`
    );
  } catch (err: any) {
    console.error('deleteStudent error:', err);
    return sendError(res, 'Failed to delete student.', 500);
  }
}
