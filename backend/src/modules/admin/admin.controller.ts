import { Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import mongoose from 'mongoose';
import {
  User,
  Student,
  Faculty,
  Department,
  Batch,
  MentorAssignment,
  Meeting,
  AuditLog,
  SystemSetting,
  Notification,
  CounsellingRecord,
  AcademicRecord,
  StudentDocument,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { calculateArrearStatistics } from '../../utils/arrears.util.js';
import { ROLES } from '../../config/constants.js';
// Reuse the single existing uploads abstraction: this must never introduce a
// second storage system or re-derive the uploads root.
import { resolveStoredUploadPath } from '../../config/storage.js';
import { RECORD_STATE } from '../../utils/record-permission.util.js';

// Dashboard Overview Statistics
export async function getAdminDashboardStats(req: AuthRequest, res: Response) {
  try {
    const totalStudents = await Student.countDocuments({ isActive: true });
    const totalFaculty = await Faculty.countDocuments({ isActive: true });
    const totalDepartments = await Department.countDocuments();
    const assignedMentees = await MentorAssignment.countDocuments({ status: 'ACTIVE' });
    const unassignedStudents = Math.max(0, totalStudents - assignedMentees);
    const reassignmentsCount = await MentorAssignment.countDocuments({ status: 'COMPLETED' });
    const totalMeetings = await Meeting.countDocuments({ meetingStatus: 'COMPLETED' });
    const pendingMeetings = await Meeting.countDocuments({ meetingStatus: 'PENDING' });

    // Active arrears are derived from the shared calculation utility, which
    // treats the subject list as the source of truth. Summing the raw
    // `arrearsCount` column here previously double-counted cleared arrears.
    const studentsWithRecords = await Student.find({ isActive: true }).select(
      '_id clearedSubjects arrearHistory'
    );
    const allRecords = await AcademicRecord.find({}).select(
      'student semesterNumber cgpa sgpa arrearsCount arrearsSubjects arrearSubjectDetails clearedSubjects'
    );
    const recordsByStudent = new Map<string, any[]>();
    for (const r of allRecords) {
      const key = String(r.student);
      if (!recordsByStudent.has(key)) recordsByStudent.set(key, []);
      recordsByStudent.get(key)!.push(r);
    }
    const activeArrears = studentsWithRecords.reduce((total: number, s: any) => {
      const stats = calculateArrearStatistics(
        recordsByStudent.get(String(s._id)) || [],
        s.clearedSubjects || [],
        s.arrearHistory || []
      );
      return total + stats.activeArrearsCount;
    }, 0);

    // Real MongoDB calculation for Counselling Sessions & Documents
    const counsellingSessions = await CounsellingRecord.countDocuments();
    const uploadedDocuments = await StudentDocument.countDocuments();

    // Recent 10 audit activities
    const rawActivities = await AuditLog.find()
      .populate('user')
      .sort({ createdAt: -1 })
      .limit(10);

    const recentActivities = rawActivities.map((a: any) => ({
      id: a._id.toString(),
      action: a.action,
      entity: a.entity,
      entity_id: a.entityId,
      created_at: a.createdAt,
      user_name: a.userName || a.user?.fullName || 'System',
      role: a.role || a.user?.role || 'SYSTEM',
    }));

    return sendSuccess(res, {
      totalStudents,
      totalFaculty,
      totalDepartments,
      assignedMentees,
      unassignedStudents,
      activeAssignments: assignedMentees,
      reassignmentsCount,
      activeArrears,
      counsellingSessions,
      uploadedDocuments,
      totalMeetings,
      pendingMeetings,
      recentActivities,
    });
  } catch (err: any) {
    console.error('getAdminDashboardStats error:', err);
    return sendError(res, 'Failed to fetch admin dashboard statistics.', 500);
  }
}

// Departments Management
export async function getDepartments(req: AuthRequest, res: Response) {
  try {
    const depts = await Department.find().sort({ code: 1 });

    const departmentsWithCounts = await Promise.all(
      depts.map(async (d) => {
        const studentCount = await Student.countDocuments({ department: d._id, isActive: true });
        const facultyCount = await Faculty.countDocuments({ department: d._id, isActive: true });
        return {
          id: d._id.toString(),
          _id: d._id.toString(),
          code: d.code,
          name: d.name,
          created_at: d.createdAt,
          student_count: studentCount,
          faculty_count: facultyCount,
        };
      })
    );

    return sendSuccess(res, departmentsWithCounts);
  } catch (err: any) {
    console.error('getDepartments error:', err);
    return sendError(res, 'Failed to fetch departments.', 500);
  }
}

export async function createDepartment(req: AuthRequest, res: Response) {
  const { code, name } = req.body;
  if (!code || !name) {
    return sendError(res, 'Department code and name are required.', 400);
  }

  const deptCode = code.toUpperCase().trim();
  const deptName = name.trim();

  try {
    const existing = await Department.findOne({ code: deptCode });
    if (existing) {
      return sendError(res, 'A department with this code already exists.', 409);
    }

    const dept = await Department.create({
      code: deptCode,
      name: deptName,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_DEPARTMENT',
      entity: 'DEPARTMENT',
      entityId: dept._id.toString(),
      details: { code: deptCode, name: deptName },
      req,
    });

    return sendSuccess(
      res,
      {
        id: dept._id.toString(),
        code: dept.code,
        name: dept.name,
      },
      'Department created successfully.',
      201
    );
  } catch (err: any) {
    console.error('createDepartment error:', err);
    return sendError(res, 'Failed to create department.', 500);
  }
}

// Batches Management
export async function getBatches(req: AuthRequest, res: Response) {
  try {
    const batches = await Batch.find().sort({ startYear: -1 });

    const batchesWithCounts = await Promise.all(
      batches.map(async (b) => {
        const studentCount = await Student.countDocuments({ batch: b._id, isActive: true });
        return {
          id: b._id.toString(),
          _id: b._id.toString(),
          name: b.name,
          start_year: b.startYear,
          end_year: b.endYear,
          is_active: b.isActive ? 1 : 0,
          student_count: studentCount,
        };
      })
    );

    return sendSuccess(res, batchesWithCounts);
  } catch (err: any) {
    console.error('getBatches error:', err);
    return sendError(res, 'Failed to fetch batches.', 500);
  }
}

export async function createBatch(req: AuthRequest, res: Response) {
  const { name, startYear, endYear } = req.body;
  if (!name || !startYear || !endYear) {
    return sendError(res, 'Batch name, start year, and end year are required.', 400);
  }

  const batchName = name.trim();
  const sYear = parseInt(startYear, 10);
  const eYear = parseInt(endYear, 10);

  try {
    const existing = await Batch.findOne({ name: batchName });
    if (existing) {
      return sendError(res, 'A batch with this name already exists.', 409);
    }

    const batch = await Batch.create({
      name: batchName,
      startYear: sYear,
      endYear: eYear,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_BATCH',
      entity: 'BATCH',
      entityId: batch._id.toString(),
      details: { name: batchName, startYear: sYear, endYear: eYear },
      req,
    });

    return sendSuccess(
      res,
      {
        id: batch._id.toString(),
        name: batch.name,
        startYear: batch.startYear,
        endYear: batch.endYear,
      },
      'Batch created successfully.',
      201
    );
  } catch (err: any) {
    console.error('createBatch error:', err);
    return sendError(res, 'Failed to create batch.', 500);
  }
}

// Faculty Management
export async function getFacultyList(req: AuthRequest, res: Response) {
  try {
    const filter: any = {};

    // HOD is scoped to their department
    if (req.user?.role === 'HOD' && req.user.departmentId) {
      filter.department = req.user.departmentId;
    }

    const facultyDocs = await Faculty.find(filter)
      .populate('user')
      .populate('department')
      .sort({ createdAt: -1 });

    const list = await Promise.all(
      facultyDocs.map(async (fac: any) => {
        const menteeCount = await MentorAssignment.countDocuments({
          mentor: fac._id,
          status: 'ACTIVE',
        });

        const user = fac.user || {};
        const dept = fac.department || {};

        return {
          id: fac._id.toString(),
          _id: fac._id.toString(),
          user_id: user._id ? user._id.toString() : '',
          employee_id: fac.employeeId,
          designation: fac.designation,
          cabin_location: fac.cabinLocation,
          phone_number: fac.phoneNumber,
          is_active: fac.isActive ? 1 : 0,
          full_name: user.fullName || '',
          email: user.email || '',
          username: user.username || '',
          role: user.role || 'FACULTY',
          department_id: dept._id ? dept._id.toString() : '',
          department_name: dept.name || '',
          department_code: dept.code || '',
          mentee_count: menteeCount,
        };
      })
    );

    // Sort by full_name
    list.sort((a, b) => a.full_name.localeCompare(b.full_name));

    return sendSuccess(res, list);
  } catch (err: any) {
    console.error('getFacultyList error:', err);
    return sendError(res, 'Failed to fetch faculty list.', 500);
  }
}

export async function createFaculty(req: AuthRequest, res: Response) {
  const { username, fullName, email, departmentId, employeeId, designation, cabinLocation, phoneNumber, password } = req.body;

  if (!username || !fullName || !email || !departmentId || !employeeId || !designation) {
    return sendError(res, 'Required fields missing: username, fullName, email, departmentId, employeeId, designation.', 400);
  }

  const uName = username.trim().toLowerCase();
  const mail = email.trim().toLowerCase();
  const empId = employeeId.trim().toUpperCase();

  try {
    // Check uniqueness
    const existingUser = await User.findOne({
      $or: [{ username: uName }, { email: mail }],
    });
    if (existingUser) {
      return sendError(res, 'Username or Email already registered.', 409);
    }

    const existingFaculty = await Faculty.findOne({ employeeId: empId });
    if (existingFaculty) {
      return sendError(res, 'Employee ID already registered.', 409);
    }

    // Resolve department
    let deptDoc = null;
    if (mongoose.Types.ObjectId.isValid(departmentId)) {
      deptDoc = await Department.findById(departmentId);
    }
    if (!deptDoc) {
      deptDoc = await Department.findOne({
        $or: [{ code: departmentId.toUpperCase() }, { name: departmentId }],
      });
    }
    if (!deptDoc) {
      return sendError(res, 'Valid department is required.', 400);
    }

    const passwordHash = await bcrypt.hash(password || 'Password@123', 10);

    const user = await User.create({
      username: uName,
      passwordHash,
      role: 'FACULTY',
      email: mail,
      fullName: fullName.trim(),
      department: deptDoc._id,
      isActive: true,
    });

    const faculty = await Faculty.create({
      user: user._id,
      employeeId: empId,
      department: deptDoc._id,
      designation: designation.trim(),
      cabinLocation: cabinLocation?.trim() || 'Faculty Cabin',
      phoneNumber: phoneNumber?.trim() || '',
      maxMentees: 25,
      isActive: true,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_FACULTY',
      entity: 'FACULTY',
      entityId: faculty._id.toString(),
      details: { username: uName, fullName: fullName.trim(), employeeId: empId, departmentId: deptDoc._id.toString() },
      req,
    });

    return sendSuccess(
      res,
      {
        facultyId: faculty._id.toString(),
        userId: user._id.toString(),
        fullName: user.fullName,
        employeeId: faculty.employeeId,
      },
      'Faculty created successfully.',
      201
    );
  } catch (err: any) {
    console.error('createFaculty error:', err);
    if (err.code === 11000) {
      return sendError(res, 'Username, Email, or Employee ID already registered.', 409);
    }
    return sendError(res, 'Failed to create faculty record.', 500);
  }
}

export async function toggleFacultyStatus(req: AuthRequest, res: Response) {
  const facultyId = req.params.facultyId as string;
  try {
    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      return sendError(res, 'Faculty member not found.', 404);
    }

    const newStatus = !faculty.isActive;
    faculty.isActive = newStatus;
    await faculty.save();

    await User.findByIdAndUpdate(faculty.user, { isActive: newStatus });

    await logAudit({
      userId: req.user!.id,
      action: newStatus ? 'ACTIVATE_FACULTY' : 'DEACTIVATE_FACULTY',
      entity: 'FACULTY',
      entityId: faculty._id.toString(),
      details: { newStatus: newStatus ? 1 : 0 },
      req,
    });

    return sendSuccess(
      res,
      { facultyId: faculty._id.toString(), isActive: newStatus ? 1 : 0 },
      `Faculty member ${newStatus ? 'activated' : 'deactivated'} successfully.`
    );
  } catch (err: any) {
    console.error('toggleFacultyStatus error:', err);
    return sendError(res, 'Failed to update faculty status.', 500);
  }
}

// Delete faculty member and terminate active mentor assignments
export async function deleteFaculty(req: AuthRequest, res: Response) {
  const facultyId = req.params.facultyId as string;
  try {
    const faculty = await Faculty.findById(facultyId).populate('user', 'fullName email');
    if (!faculty) {
      return sendError(res, 'Faculty member not found.', 404);
    }

    const facUserId = (faculty.user as any)?._id || faculty.user;
    const empId = faculty.employeeId;
    const facName = (faculty.user as any)?.fullName || empId;

    // Terminate active mentee assignments for this mentor so students are unassigned safely
    await MentorAssignment.updateMany(
      { mentor: faculty._id, status: 'ACTIVE' },
      {
        status: 'TERMINATED',
        assignedUntil: new Date(),
        changeReason: 'Faculty mentor profile deleted by Administrator',
      }
    );

    // Delete faculty profile and user login account
    await Promise.all([
      Faculty.deleteOne({ _id: faculty._id }),
      User.deleteOne({ _id: facUserId }),
    ]);

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_FACULTY',
      entity: 'FACULTY',
      entityId: faculty._id.toString(),
      details: { employeeId: empId, fullName: facName },
      req,
    });

    return sendSuccess(
      res,
      { facultyId: faculty._id.toString(), employeeId: empId },
      `Faculty member ${facName} (${empId}) deleted successfully. Associated assignments terminated.`
    );
  } catch (err: any) {
    console.error('deleteFaculty error:', err);
    return sendError(res, 'Failed to delete faculty member.', 500);
  }
}

// System Settings Management (Saturday Schedule)
export async function getSystemSettings(req: AuthRequest, res: Response) {
  try {
    const settings = await SystemSetting.find();
    const settingsMap: Record<string, string> = {};
    const list = settings.map((s) => {
      settingsMap[s.key] = s.value;
      return {
        key: s.key,
        value: s.value,
        description: s.description,
        updated_at: s.updatedAt,
      };
    });

    return sendSuccess(res, { list, map: settingsMap });
  } catch (err: any) {
    console.error('getSystemSettings error:', err);
    return sendError(res, 'Failed to retrieve system settings.', 500);
  }
}

export async function updateSystemSettings(req: AuthRequest, res: Response) {
  const { meetingDay, meetingTime, meetingLocation } = req.body;

  try {
    const userId = req.user?.id ? (mongoose.Types.ObjectId.isValid(req.user.id) ? new mongoose.Types.ObjectId(req.user.id) : undefined) : undefined;

    if (meetingDay) {
      await SystemSetting.findOneAndUpdate(
        { key: 'saturday_meeting_day' },
        { value: meetingDay, updatedBy: userId },
        { upsert: true }
      );
    }
    if (meetingTime) {
      await SystemSetting.findOneAndUpdate(
        { key: 'saturday_meeting_time' },
        { value: meetingTime, updatedBy: userId },
        { upsert: true }
      );
    }
    if (meetingLocation) {
      await SystemSetting.findOneAndUpdate(
        { key: 'saturday_meeting_location' },
        { value: meetingLocation, updatedBy: userId },
        { upsert: true }
      );
    }

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_SYSTEM_SETTINGS',
      entity: 'SETTINGS',
      details: { meetingDay, meetingTime, meetingLocation },
      req,
    });

    return sendSuccess(res, null, 'Institutional Saturday meeting configuration updated successfully.');
  } catch (err: any) {
    console.error('updateSystemSettings error:', err);
    return sendError(res, 'Failed to update system settings.', 500);
  }
}

// ─── Mentee Assignment Endpoints ─────────────────────────────────────────────

/** GET /admin/mentors/:mentorId/mentees
 *  List all ACTIVE mentees assigned to a faculty mentor.
 *  Supports search by name/register number.
 */
export async function getMenteesByMentor(req: AuthRequest, res: Response) {
  const mentorId = req.params.mentorId as string;
  const { search = '', page = '1', limit = '50' } = req.query as Record<string, string>;

  try {
    if (!mentorId || !mongoose.Types.ObjectId.isValid(mentorId)) {
      return sendError(res, 'Mentor not found', 404);
    }
    const faculty = await Faculty.findById(mentorId);
    if (!faculty) return sendError(res, 'Mentor not found', 404);

    const activeAssignments = await MentorAssignment.find({
      mentor: faculty._id,
      status: 'ACTIVE',
    }).select('student assignedFrom createdAt');

    const studentIds = activeAssignments.map((a: any) => a.student);

    const searchFilter: any = { _id: { $in: studentIds } };
    if (search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      searchFilter.$or = [{ fullName: rx }, { registerNumber: rx }];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [studentDocs, totalCount] = await Promise.all([
      Student.find(searchFilter)
        .populate('department', 'code name')
        .populate('batch', 'name startYear endYear')
        .sort({ fullName: 1 })
        .skip(skip)
        .limit(limitNum),
      Student.countDocuments(searchFilter),
    ]);

    // Map assignment date onto each student
    const assignmentMap = new Map(activeAssignments.map((a: any) => [a.student.toString(), a]));

    // CGPA / arrears must come from AcademicRecord. The Student model has no
    // `semesters` field, so reading `s.semesters` silently produced blank
    // academic data on this screen.
    const academicRecords = await AcademicRecord.find({ student: { $in: studentIds } }).lean();
    const recordsByStudent = new Map<string, any[]>();
    for (const r of academicRecords) {
      const key = String(r.student);
      if (!recordsByStudent.has(key)) recordsByStudent.set(key, []);
      recordsByStudent.get(key)!.push(r);
    }

    // Counselling counts: the mentor/HOD dashboards filter on
    // "has arrears but has never had a counselling session", so the count must
    // come from MongoDB here. Without it every mentee silently reads as zero.
    const counsellingRows = await CounsellingRecord.find({
      $or: [{ student: { $in: studentIds } }, { studentId: { $in: studentIds } }],
    })
      .select('student studentId')
      .lean();
    const counsellingCountByStudent = new Map<string, number>();
    for (const c of counsellingRows) {
      const key = String((c as any).student || (c as any).studentId);
      if (!key) continue;
      counsellingCountByStudent.set(key, (counsellingCountByStudent.get(key) || 0) + 1);
    }

    const mentees = studentDocs.map((s: any) => {
      const asgn = assignmentMap.get(s._id.toString());
      const dept: any = s.department || {};
      const batch: any = s.batch || {};
      const records = recordsByStudent.get(s._id.toString()) || [];
      const currentYear = new Date().getFullYear();
      const startYear = batch.startYear || currentYear;
      const computedYear = Math.min(4, Math.max(1, currentYear - startYear + 1));
      // The student-entered/stored Year is authoritative when present; the
      // batch-derived value is only a fallback for legacy records.
      const yearOfStudy = s.year || s.yearOfStudy || computedYear;
      const sorted = [...records].sort(
        (a: any, b: any) => Number(a.semesterNumber || 0) - Number(b.semesterNumber || 0)
      );
      const latestCgpa = sorted.length > 0 ? Number(sorted[sorted.length - 1].cgpa) || null : null;
      const arrearStats = calculateArrearStatistics(records, s.clearedSubjects || [], s.arrearHistory || []);

      return {
        assignment_id: asgn?._id?.toString() || '',
        student_id: s._id.toString(),
        full_name: s.fullName || '',
        register_number: s.registerNumber || '',
        department_code: dept.code || '',
        department_name: dept.name || '',
        batch_name: batch.name || '',
        year_of_study: yearOfStudy,
        cgpa: latestCgpa,
        total_arrears: arrearStats.activeArrearsCount,
        active_arrears: arrearStats.activeArrearsCount,
        historical_arrears: arrearStats.historicalArrearsCount,
        arrear_status_label: arrearStats.statusLabel,
        counselling_count: counsellingCountByStudent.get(s._id.toString()) || 0,
        assigned_from: asgn?.assignedFrom || asgn?.createdAt,
        is_profile_complete: s.isProfileComplete || false,
      };
    });

    return sendSuccess(res, {
      mentees,
      total: totalCount,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err: any) {
    console.error('getMenteesByMentor error:', err);
    return sendError(res, 'Failed to fetch mentees.', 500);
  }
}

/** GET /admin/students?search=&department=&batch=&assignmentStatus=&page=&limit=
 *  List students for the assign-mentees picker.
 */
export async function getStudentsForAssignment(req: AuthRequest, res: Response) {
  const {
    search = '',
    department = '',
    batch = '',
    assignmentStatus = '',
    page = '1',
    limit = '30',
  } = req.query as Record<string, string>;

  try {
    const filter: any = { isActive: true };
    if (search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      filter.$or = [{ fullName: rx }, { registerNumber: rx }];
    }
    if (department) filter.department = department;
    if (batch) filter.batch = batch;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [studentDocs, total] = await Promise.all([
      Student.find(filter)
        .populate('department', 'code name')
        .populate('batch', 'name startYear')
        .sort({ fullName: 1 })
        .skip(skip)
        .limit(limitNum),
      Student.countDocuments(filter),
    ]);

    // Fetch active assignment status for each student in one query
    const studentIds = studentDocs.map((s: any) => s._id);
    const activeAssignments = await MentorAssignment.find({
      student: { $in: studentIds },
      status: 'ACTIVE',
    }).populate({ path: 'mentor', populate: { path: 'user', select: 'fullName' } });

    const assignmentMap = new Map(
      activeAssignments.map((a: any) => [a.student.toString(), a])
    );

    const currentYear = new Date().getFullYear();

    let list = studentDocs.map((s: any) => {
      const dept: any = s.department || {};
      const batch: any = s.batch || {};
      const startYear = batch.startYear || currentYear;
      const yearOfStudy = Math.min(4, Math.max(1, currentYear - startYear + 1));
      const asgn: any = assignmentMap.get(s._id.toString());
      const mentorUser: any = asgn?.mentor?.user || {};

      return {
        student_id: s._id.toString(),
        full_name: s.fullName || '',
        register_number: s.registerNumber || '',
        department_code: dept.code || '',
        department_name: dept.name || '',
        department_id: dept._id?.toString() || '',
        batch_name: batch.name || '',
        batch_id: batch._id?.toString() || '',
        year_of_study: yearOfStudy,
        has_active_mentor: !!asgn,
        current_mentor_name: mentorUser.fullName || null,
        current_mentor_id: asgn?.mentor?._id?.toString() || null,
        assignment_id: asgn?._id?.toString() || null,
      };
    });

    // Filter by assignment status if requested
    if (assignmentStatus === 'unassigned') {
      list = list.filter((s) => !s.has_active_mentor);
    } else if (assignmentStatus === 'assigned') {
      list = list.filter((s) => s.has_active_mentor);
    }

    return sendSuccess(res, { students: list, total, page: pageNum, limit: limitNum });
  } catch (err: any) {
    console.error('getStudentsForAssignment error:', err);
    return sendError(res, 'Failed to fetch students.', 500);
  }
}

/** POST /admin/mentors/:mentorId/assign-mentees
 *  Bulk assign multiple students to a single faculty mentor.
 *  Enforces one-active-mentor rule: students already assigned elsewhere are skipped
 *  unless "force" is set, which triggers reassignment.
 */
export async function assignMenteesToMentor(req: AuthRequest, res: Response) {
  const { mentorId } = req.params;
  const { studentIds }: { studentIds: string[] } = req.body;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return sendError(res, 'At least one student ID is required.', 400);
  }

  try {
    const mentor = await Faculty.findById(mentorId).populate('user', 'fullName _id');
    if (!mentor || !mentor.isActive) {
      return sendError(res, 'Active faculty mentor not found.', 404);
    }

    const assignerId =
      req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)
        ? new mongoose.Types.ObjectId(req.user.id)
        : undefined;
    const mentorUser: any = mentor.user;
    const fromDate = new Date().toISOString().split('T')[0];

    const results = { assigned: [] as string[], alreadyAssigned: [] as string[], notFound: [] as string[] };

    for (const sid of studentIds) {
      let student: any = null;
      if (mongoose.Types.ObjectId.isValid(sid)) student = await Student.findById(sid);
      if (!student) student = await Student.findOne({ registerNumber: sid });
      if (!student) { results.notFound.push(sid); continue; }

      // One-active-mentor rule
      const existingActive = await MentorAssignment.findOne({
        student: student._id,
        status: 'ACTIVE',
      });
      if (existingActive) {
        // If already assigned to THIS same mentor, skip
        if (existingActive.mentor.toString() === mentor._id.toString()) {
          results.alreadyAssigned.push(student.registerNumber);
          continue;
        }
        // Already assigned to someone else — skip (use reassign flow for this)
        results.alreadyAssigned.push(student.registerNumber);
        continue;
      }

      const assignment = await MentorAssignment.create({
        student: student._id,
        mentor: mentor._id,
        department: student.department,
        assignedFrom: fromDate,
        status: 'ACTIVE',
        assignedBy: assignerId,
        changeReason: 'Bulk assignment by administrator',
      });

      // Notify student
      await Notification.create({
        user: student.user,
        title: 'Mentor Assigned',
        message: `You have been assigned to mentor ${mentorUser?.fullName || 'Faculty Mentor'}.`,
        type: 'MENTOR_ASSIGNMENT',
        relatedEntity: 'MENTOR_ASSIGNMENT',
        relatedEntityId: assignment._id.toString(),
      });

      await logAudit({
        userId: req.user!.id,
        action: 'ASSIGN_MENTOR',
        entity: 'MENTOR_ASSIGNMENT',
        entityId: assignment._id.toString(),
        details: {
          studentId: student._id.toString(),
          registerNumber: student.registerNumber,
          mentorId: mentor._id.toString(),
          fromDate,
        },
        req,
      });

      results.assigned.push(student.registerNumber);
    }

    // Refresh mentee count
    const newMenteeCount = await MentorAssignment.countDocuments({
      mentor: mentor._id,
      status: 'ACTIVE',
    });

    return sendSuccess(
      res,
      {
        assigned: results.assigned,
        alreadyAssigned: results.alreadyAssigned,
        notFound: results.notFound,
        newMenteeCount,
      },
      `${results.assigned.length} student(s) assigned to ${mentorUser?.fullName || 'mentor'} successfully.`,
      201
    );
  } catch (err: any) {
    console.error('assignMenteesToMentor error:', err);
    return sendError(res, 'Failed to assign mentees.', 500);
  }
}

/** PATCH /admin/mentor-assignments/:assignmentId/remove
 *  Remove (COMPLETED) a mentor assignment.
 *  The student, all academic data, meetings, counselling remain intact.
 */
export async function removeAssignment(req: AuthRequest, res: Response) {
  const { assignmentId } = req.params;

  try {
    const assignment = await MentorAssignment.findById(assignmentId)
      .populate({ path: 'student', select: 'fullName registerNumber user' })
      .populate({ path: 'mentor', populate: { path: 'user', select: 'fullName _id' } });

    if (!assignment) return sendError(res, 'Assignment not found.', 404);
    if (assignment.status !== 'ACTIVE') return sendError(res, 'Assignment is already inactive.', 400);

    const student: any = assignment.student;
    const mentorUser: any = (assignment.mentor as any)?.user || {};

    assignment.status = 'COMPLETED';
    (assignment as any).assignedUntil = new Date().toISOString().split('T')[0];
    await assignment.save();

    // Notify student
    await Notification.create({
      user: student.user,
      title: 'Mentor Assignment Removed',
      message: `Your assignment to mentor ${mentorUser.fullName || 'Faculty Mentor'} has been removed by the administration.`,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: assignment._id.toString(),
    });

    // Notify mentor
    await Notification.create({
      user: mentorUser._id,
      title: 'Mentee Removed',
      message: `Student ${student.fullName} (${student.registerNumber}) has been removed from your mentee list.`,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: assignment._id.toString(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'REMOVE_ASSIGNMENT',
      entity: 'MENTOR_ASSIGNMENT',
      entityId: assignment._id.toString(),
      details: {
        studentId: student._id?.toString(),
        registerNumber: student.registerNumber,
        mentorId: (assignment.mentor as any)?._id?.toString(),
      },
      req,
    });

    // Refresh mentee count
    const newMenteeCount = await MentorAssignment.countDocuments({
      mentor: (assignment.mentor as any)?._id,
      status: 'ACTIVE',
    });

    return sendSuccess(
      res,
      { assignmentId: assignment._id.toString(), newMenteeCount },
      `${student.fullName} has been removed from the mentor assignment. All student data remains intact.`
    );
  } catch (err: any) {
    console.error('removeAssignment error:', err);
    return sendError(res, 'Failed to remove assignment.', 500);
  }
}

// ---------------------------------------------------------------------------
// Institutional Document Repository — global purge (ADMIN only)
// ---------------------------------------------------------------------------

/** Cap on how many failed file names are echoed back / written to the audit log. */
const MAX_REPORTED_FILE_FAILURES = 50;

/**
 * Permanently delete EVERY Student Document record institution-wide together with
 * its stored file on disk.
 *
 * Scope is deliberately narrow: only the `StudentDocument` collection and the
 * files those records point at are touched. Students, Users, Faculty, academics,
 * counselling, meetings and every other collection are left untouched.
 *
 * Partial-failure contract:
 *  - the database delete is ONE atomic `deleteMany`, so records are never left
 *    half-removed;
 *  - file unlink failures cannot roll the database back, so they are collected
 *    and reported explicitly instead of being swallowed or aborting the request.
 * Reported numbers are therefore always truthful and never overstate what was
 * actually removed.
 */
export async function deleteAllDocuments(req: AuthRequest, res: Response) {
  // Defence in depth. The route already applies `authorize(ROLES.ADMIN)`; this
  // re-check guarantees the handler cannot be reached by any other role even if
  // it is ever re-mounted elsewhere. Authorisation is NEVER a frontend concern.
  if (!req.user || req.user.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to perform this operation.', 403);
  }

  try {
    // Snapshot file locations BEFORE the records disappear, so the on-disk
    // cleanup still knows what to remove. `verificationStatus` is selected so
    // mentor-confirmed records can be excluded from the purge.
    const allDocs = await StudentDocument.find({})
      .select('_id fileName fileUrl verificationStatus')
      .lean();

    // CONFIRMED records are official verified academic records: immutable at the
    // API level for EVERY caller, admin included. They are counted and reported
    // as retained, never deleted. This was previously an unfiltered
    // `deleteMany({})`, which silently destroyed mentor-confirmed records.
    const docs = allDocs.filter((d: any) => d.verificationStatus !== RECORD_STATE.CONFIRMED);
    const retainedConfirmed = allDocs.length - docs.length;

    if (allDocs.length === 0) {
      // Nothing to purge: a successful no-op, deliberately not audit-logged so
      // the audit trail only ever records real destructive actions.
      return sendSuccess(
        res,
        { documentsDeleted: 0, filesDeleted: 0, filesNotDeleted: 0, filesNotDeletedNames: [], filesAlreadyAbsent: 0, retainedConfirmed: 0 },
        'No documents found.'
      );
    }

    // One atomic database operation for the whole deletable set. Ids are named
    // explicitly rather than filtered, so there is no window in which a newly
    // confirmed record could be swept up by a broad filter.
    const { deletedCount } = await StudentDocument.deleteMany({
      _id: { $in: docs.map((d: any) => d._id) },
    });

    let filesDeleted = 0;
    let filesAlreadyAbsent = 0;
    const filesNotDeletedNames: string[] = [];

    for (const doc of docs) {
      // Same traversal-safe resolver the upload / single-delete paths use.
      const filePath = resolveStoredUploadPath(doc.fileUrl);
      if (!filePath) {
        // Not an `/uploads/...` location (legacy path or external URL): there is
        // no local file for this record to remove.
        filesAlreadyAbsent++;
        continue;
      }

      try {
        if (!fs.existsSync(filePath)) {
          filesAlreadyAbsent++;
          continue;
        }
        fs.unlinkSync(filePath);
        filesDeleted++;
      } catch (e: any) {
        filesNotDeletedNames.push(String(doc.fileName || doc._id));
        console.error('deleteAllDocuments: failed to unlink stored file:', filePath, e.message);
      }
    }

    const filesNotDeleted = filesNotDeletedNames.length;

    await logAudit({
      userId: req.user.id,
      action: 'DELETE_ALL_DOCUMENTS',
      entity: 'DOCUMENT',
      entityId: null,
      // Counts and file NAMES only — never file contents or buffers.
      details: {
        documentsDeleted: deletedCount,
        filesDeleted,
        filesNotDeleted,
        filesAlreadyAbsent,
        retainedConfirmed,
        failedFileNames: filesNotDeletedNames.slice(0, MAX_REPORTED_FILE_FAILURES),
        failedFileNamesTruncated: filesNotDeleted > MAX_REPORTED_FILE_FAILURES,
      },
      req,
    });

    let message =
      deletedCount === 0
        ? retainedConfirmed > 0
          ? `Nothing was deleted. All ${retainedConfirmed} document(s) on record are mentor-confirmed and permanently locked.`
          : 'No documents found.'
        : `All deletable documents deleted (${deletedCount} document record(s) and ${filesDeleted} stored file(s) removed).${
            retainedConfirmed > 0
              ? ` ${retainedConfirmed} mentor-confirmed document(s) were retained; confirmed records are permanently locked.`
              : ''
          }`;

    if (filesNotDeleted > 0) {
      message += ` ${filesNotDeleted} stored file(s) could not be removed from disk and must be cleared manually.`;
    }

    return sendSuccess(
      res,
      {
        documentsDeleted: deletedCount,
        filesDeleted,
        filesNotDeleted,
        filesNotDeletedNames: filesNotDeletedNames.slice(0, MAX_REPORTED_FILE_FAILURES),
        filesNotDeletedNamesTruncated: filesNotDeleted > MAX_REPORTED_FILE_FAILURES,
        filesAlreadyAbsent,
        retainedConfirmed,
      },
      message
    );
  } catch (err: any) {
    console.error('deleteAllDocuments error:', err);
    return sendError(res, 'Failed to delete documents.', 500);
  }
}
