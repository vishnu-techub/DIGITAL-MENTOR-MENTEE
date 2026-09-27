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
      limit = '50',
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

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Student.countDocuments(filter);
    const students = await Student.find(filter)
      .populate('department', 'name code')
      .populate('batch', 'name')
      .sort({ registerNumber: 1 })
      .skip(skip)
      .limit(limitNum);

    // Populate active mentor and academic aggregations for each student
    const enriched = await Promise.all(
      students.map(async (s) => {
        const activeAsg = await MentorAssignment.findOne({
          student: s._id,
          status: 'ACTIVE',
        }).populate({
          path: 'mentor',
          populate: { path: 'user', select: 'fullName' },
        });

        const activeMentor = activeAsg?.mentor as any;
        const mentorUser = activeMentor?.user as any;

        const [meetingCount, counsellingCount, academicRecords, latestMeeting] = await Promise.all([
          Meeting.countDocuments({ student: s._id, meetingStatus: 'COMPLETED' }),
          CounsellingRecord.countDocuments({ student: s._id }),
          AcademicRecord.find({ student: s._id }).sort({ semesterNumber: -1 }),
          Meeting.findOne({ student: s._id }).sort({ meetingDate: -1 }),
        ]);

        const arrearStats = calculateArrearStatistics(
          academicRecords,
          s.clearedSubjects || [],
          s.arrearHistory || []
        );
        const totalArrears = arrearStats.activeArrearsCount;
        const latestWithCgpa = academicRecords.find((r) => (r.cgpa || 0) > 0);
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
          dob: s.dob || '',
          blood_group: s.bloodGroup || '',
          residential_type: s.residentialType,
          mobile_number: s.mobileNumber || '',
          email: s.email || '',
          is_active: s.isActive ? 1 : 0,
          profile_completed: s.profileCompleted ? 1 : 0,
          profile_completion_percentage: completionPercent,
          profile_completed_at: s.profileCompletedAt || null,
          current_mentor_name: mentorUser?.fullName || 'Not Assigned',
          mentor_cabin: activeMentor?.cabinLocation || null,
          assignment_id: activeAsg?._id?.toString() || null,
          assignment_status: activeAsg?.status || 'UNASSIGNED',
          completed_meetings_count: meetingCount,
          counselling_count: counsellingCount,
          total_arrears: totalArrears,
          active_arrears: arrearStats.activeArrearsCount,
          historical_arrears: arrearStats.historicalArrearsCount,
          cleared_arrears: arrearStats.clearedCount,
          arrear_status_label: arrearStats.statusLabel,
          cgpa: currentCgpa,
          next_meeting_date: latestMeeting?.meetingDate || 'Upcoming Saturday',
          meeting_status: latestMeeting?.meetingStatus || 'SCHEDULED',
        };
      })
    );

    return sendSuccess(
      res,
      enriched,
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
      return sendError(res, 'Student profile not found.', 404);
    }

    // RBAC: Student can only view their own profile
    if (req.user?.role === ROLES.STUDENT) {
      if (req.user.studentId && req.user.studentId !== student._id.toString() && req.user.id !== student.user?.toString()) {
        return sendError(res, 'Access denied: You can only view your own student record.', 403);
      }
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
      dob: student.dob || null,
      blood_group: student.bloodGroup || 'B+ve',
      residential_type: student.residentialType,
      mobile_number: student.mobileNumber || null,
      email: student.email || `${student.registerNumber}@ksrce.ac.in`,
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

    const newUser = await User.create({
      username: effectiveUsername.toLowerCase(),
      passwordHash,
      role: 'STUDENT',
      email: `${registerNumber.trim().toLowerCase()}@ksrce.ac.in`,
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
      email: `${registerNumber.trim().toLowerCase()}@ksrce.ac.in`,
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
      semesters,
    } = req.body;

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
    student.mobileNumber = mobileNumber || student.mobileNumber;
    student.email = email || student.email;
    student.dob = dob || student.dob;
    student.bloodGroup = bloodGroup || student.bloodGroup;
    student.residentialType = residentialType || student.residentialType;
    student.address = address || student.address;
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
      tenthMark: tenthMark !== undefined && tenthMark !== '' ? parseFloat(tenthMark) : student.school?.tenthMark || 0,
      tenthSchool: finalTenthSchoolName,
      tenthSchoolId: tenthSchoolDoc?._id || (mongoose.Types.ObjectId.isValid(tenthSchoolId) ? tenthSchoolId : null) || student.school?.tenthSchoolId || null,
      twelfthMark: twelfthMark !== undefined && twelfthMark !== '' ? parseFloat(twelfthMark) : student.school?.twelfthMark || 0,
      twelfthSchool: finalTwelfthSchoolName,
      twelfthSchoolId: twelfthSchoolDoc?._id || (mongoose.Types.ObjectId.isValid(twelfthSchoolId) ? twelfthSchoolId : null) || student.school?.twelfthSchoolId || null,
      cutoffMark: cutoffMark !== undefined && cutoffMark !== '' ? parseFloat(cutoffMark) : student.school?.cutoffMark || 0,
      admissionType: admissionType || student.school?.admissionType || 'COUNSELLING',
      scholarshipDetails: scholarshipDetails || student.school?.scholarshipDetails || 'Nil',
    };

    await student.save();

    // Update user email if provided
    if (email) {
      await User.findByIdAndUpdate(student.user, { email });
    }

    // Update semester 1 to 8 academic grades
    if (Array.isArray(semesters)) {
      for (const sem of semesters) {
        const semNum = parseInt(sem.semesterNumber || sem.semester_number, 10);
        if (semNum >= 1 && semNum <= 8) {
          await AcademicRecord.findOneAndUpdate(
            { student: student._id, semesterNumber: semNum },
            {
              student: student._id,
              semesterNumber: semNum,
              cgpa: parseFloat(sem.cgpa || 0),
              sgpa: parseFloat(sem.sgpa || sem.cgpa || 0),
              arrearsCount: parseInt(sem.arrearsCount || sem.arrears_count || 0, 10),
              arrearsSubjects: sem.arrearsSubjects || sem.arrears_subjects || '',
            },
            { upsert: true, returnDocument: 'after' }
          );
        }
      }
    }

    await logAudit({
      userId: req.user!.id,
      action: 'SUBMIT_STUDENT_PROFILE',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      details: { registerNumber: student.registerNumber },
      req,
    });

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

    // RBAC: Student can update their own contact details; Admin can update everything
    if (req.user?.role === ROLES.STUDENT) {
      if (req.user.studentId !== student._id.toString() && req.user.id !== student.user.toString()) {
        return sendError(res, 'You are not authorized to update this profile.', 403);
      }
      if (req.body.registerNumber || req.body.register_number || req.body.departmentId || req.body.batchId) {
        return sendError(
          res,
          'Modifying core identity fields (Register Number, Department, Batch) is restricted to Administrators.',
          403
        );
      }
    }

    if (dob) student.dob = dob;
    if (bloodGroup) student.bloodGroup = bloodGroup;
    if (residentialType) student.residentialType = residentialType;
    if (mobileNumber) student.mobileNumber = mobileNumber;
    if (email) student.email = email;
    if (address) student.address = address;

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

    if (fullName && req.user?.role !== ROLES.STUDENT) {
      student.fullName = fullName;
      await User.findByIdAndUpdate(student.user, { fullName });
    }

    await student.save();

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
    scholarshipDetails,
  } = req.body;

  try {
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    if (
      tenthMark !== undefined ||
      tenthSchoolId !== undefined ||
      twelfthMark !== undefined ||
      twelfthSchoolId !== undefined ||
      cutoffMark !== undefined ||
      scholarshipDetails !== undefined
    ) {
      let tenthSchoolDoc = null;
      if (tenthSchoolId) {
        tenthSchoolDoc = await School.findById(tenthSchoolId);
      }
      let twelfthSchoolDoc = null;
      if (twelfthSchoolId) {
        twelfthSchoolDoc = await School.findById(twelfthSchoolId);
      }

      student.school = {
        tenthMark: tenthMark !== undefined && tenthMark !== '' ? parseFloat(tenthMark) : student.school?.tenthMark,
        tenthSchool: (tenthSchoolDoc?.displayName || tenthSchool) ?? student.school?.tenthSchool,
        tenthSchoolId: tenthSchoolDoc?._id || student.school?.tenthSchoolId,
        twelfthMark: twelfthMark !== undefined && twelfthMark !== '' ? parseFloat(twelfthMark) : student.school?.twelfthMark,
        twelfthSchool: (twelfthSchoolDoc?.displayName || twelfthSchool) ?? student.school?.twelfthSchool,
        twelfthSchoolId: twelfthSchoolDoc?._id || student.school?.twelfthSchoolId,
        cutoffMark: cutoffMark !== undefined && cutoffMark !== '' ? parseFloat(cutoffMark) : student.school?.cutoffMark,
        admissionType: student.school?.admissionType || 'COUNSELLING',
        scholarshipDetails: scholarshipDetails ?? student.school?.scholarshipDetails,
      };
      await student.save();
    }

    if (Array.isArray(semesters)) {
      if (!student.arrearHistory) {
        student.arrearHistory = [];
      }
      for (const sem of semesters) {
        const semNum = parseInt(sem.semesterNumber || sem.semester_number, 10);
        if (semNum >= 1 && semNum <= 8) {
          const subjects = parseSubjectCodes(sem.arrearsSubjects ?? sem.arrears_subjects);
          subjects.forEach((code) => {
            const exists = student.arrearHistory!.some(
              (h) => h.subjectCode.toUpperCase() === code
            );
            if (!exists) {
              student.arrearHistory!.push({
                subjectCode: code,
                originalSemester: semNum,
                attempt: 1,
                status: 'ACTIVE',
                remarks: 'Active Arrear',
              });
            }
          });

          const existing = await AcademicRecord.findOne({ student: student._id, semesterNumber: semNum });
          await AcademicRecord.findOneAndUpdate(
            { student: student._id, semesterNumber: semNum },
            {
              student: student._id,
              semesterNumber: semNum,
              cgpa: sem.cgpa !== undefined ? parseFloat(sem.cgpa || 0) : existing?.cgpa || 0,
              sgpa: sem.sgpa !== undefined ? parseFloat(sem.sgpa || sem.cgpa || 0) : existing?.sgpa || 0,
              arrearsCount: sem.arrearsCount !== undefined || sem.arrears_count !== undefined 
                ? parseInt(sem.arrearsCount ?? sem.arrears_count ?? 0, 10) 
                : existing?.arrearsCount || 0,
              arrearsSubjects: sem.arrearsSubjects ?? sem.arrears_subjects ?? existing?.arrearsSubjects ?? '',
              clearedSubjects: sem.clearedSubjects ?? sem.cleared_subjects ?? existing?.clearedSubjects ?? [],
              remarks: sem.remarks ?? existing?.remarks ?? '',
            },
            { upsert: true, returnDocument: 'after' }
          );
        }
      }
      await student.save();
    }

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_STUDENT_ACADEMICS',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      req,
    });

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
