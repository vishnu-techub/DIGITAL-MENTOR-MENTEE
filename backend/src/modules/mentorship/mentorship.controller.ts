import { Response } from 'express';
import {
  Student,
  Faculty,
  User,
  MentorAssignment,
  Notification,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { toIdString } from '../../utils/access.util.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import { generateMentorMenteesExcel } from './mentor-export.service.js';
import { isValidId, toLocalId, type LocalId } from '../../services/localId.js';

// Initial Mentor Allocation
export async function assignMentor(req: AuthRequest, res: Response) {
  const { studentId, mentorId, assignedFrom, reason } = req.body;

  if (!studentId || !mentorId) {
    return sendError(res, 'Student ID and Mentor ID are required.', 400);
  }

  try {
    let student = null;
    if (isValidId(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    let mentor = null;
    if (isValidId(mentorId)) {
      mentor = await Faculty.findById(mentorId).populate('user');
    }
    if (!mentor) {
      mentor = await Faculty.findOne({ employeeId: mentorId }).populate('user');
    }
    if (!mentor || !mentor.isActive) {
      return sendError(res, 'Active faculty member not found.', 404);
    }

    // A HOD may only create assignments inside their own department. Without
    // this the shared endpoint lets a department head assign across
    // departments (or into a foreign department's roster) in one call.
    if (req.user?.role === ROLES.HOD) {
      if (
        !req.user.departmentId ||
        toIdString(student.department) !== req.user.departmentId ||
        toIdString(mentor.department) !== req.user.departmentId
      ) {
        return sendError(res, 'Student or mentor is not in your department.', 404);
      }
    }

    // Check if student already has an active mentor
    const currentActive = await MentorAssignment.findOne({
      student: student._id,
      status: 'ACTIVE',
    });

    if (currentActive) {
      return sendError(
        res,
        'Student already has an active mentor assigned. Please use the Reassignment feature to maintain historical audit lineage.',
        400
      );
    }

    const fromDate = assignedFrom || new Date().toISOString().split('T')[0];
    const assignerId = req.user?.id && isValidId(req.user.id)
      ? toLocalId(req.user.id)
      : undefined;

    const assignment = await MentorAssignment.create({
      student: student._id,
      mentor: mentor._id,
      department: student.department,
      assignedFrom: fromDate,
      status: 'ACTIVE',
      assignedBy: assignerId,
      changeReason: reason || 'Initial Mentor Allocation',
    });

    // Notification to Student
    await Notification.create({
      user: student.user,
      title: 'Mentor Assigned',
      message: `You have been assigned to mentor ${(mentor.user as any)?.fullName || 'Faculty Mentor'}.`,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: assignment._id.toString(),
    });

    // Notification to Faculty
    await Notification.create({
      user: (mentor.user as any)?._id || mentor.user,
      title: 'New Mentee Assigned',
      message: `Student ${student.fullName} (${student.registerNumber}) has been assigned as your mentee.`,
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
        reason,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        assignmentId: assignment._id.toString(),
        studentId: student._id.toString(),
        mentorId: mentor._id.toString(),
        fromDate,
      },
      'Mentor successfully assigned.',
      201
    );
  } catch (err: any) {
    console.error('assignMentor error:', err);
    return sendError(res, 'Failed to assign mentor.', 500);
  }
}

// CRITICAL BUSINESS RULE: Reassign Mentor with 100% Data Preservation
export async function reassignMentor(req: AuthRequest, res: Response) {
  const { studentId, newMentorId, effectiveDate, reasonForChange } = req.body;

  if (!studentId || !newMentorId) {
    return sendError(res, 'Student ID and new Mentor ID are required.', 400);
  }

  if (!reasonForChange || reasonForChange.trim() === '') {
    return sendError(res, 'Institutional reason for mentor change is mandatory for audit compliance.', 400);
  }

  try {
    let student = null;
    if (isValidId(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    let newMentor = null;
    if (isValidId(newMentorId)) {
      newMentor = await Faculty.findById(newMentorId).populate('user');
    }
    if (!newMentor) {
      newMentor = await Faculty.findOne({ employeeId: newMentorId }).populate('user');
    }
    if (!newMentor || !newMentor.isActive) {
      return sendError(res, 'Target new faculty mentor not found or inactive.', 404);
    }

    // Same department rule as `assignMentor`: a HOD cannot move a student to a
    // mentor outside their own department, nor touch a foreign student.
    if (req.user?.role === ROLES.HOD) {
      if (
        !req.user.departmentId ||
        toIdString(student.department) !== req.user.departmentId ||
        toIdString(newMentor.department) !== req.user.departmentId
      ) {
        return sendError(res, 'Student or mentor is not in your department.', 404);
      }
    }

    const currentAssignment = await MentorAssignment.findOne({
      student: student._id,
      status: 'ACTIVE',
    }).populate({ path: 'mentor', populate: { path: 'user' } });

    if (currentAssignment && toIdString(currentAssignment.mentor) === newMentor._id.toString()) {
      return sendError(res, 'The student is already actively assigned to this mentor.', 400);
    }

    const changeDate = effectiveDate || new Date().toISOString().split('T')[0];
    const assignerId = req.user?.id && isValidId(req.user.id)
      ? toLocalId(req.user.id)
      : undefined;

    // 1. If an existing active assignment exists, transition it to COMPLETED with assignedUntil
    if (currentAssignment) {
      currentAssignment.status = 'COMPLETED';
      currentAssignment.assignedUntil = changeDate;
      await currentAssignment.save();
    }

    // 2. Create NEW active assignment record linking new mentor
    const newAssignment = await MentorAssignment.create({
      student: student._id,
      mentor: newMentor._id,
      department: student.department,
      assignedFrom: changeDate,
      status: 'ACTIVE',
      assignedBy: assignerId,
      changeReason: reasonForChange.trim(),
    });

    // 3. Notify Student
    const newMentorUser: any = newMentor.user || {};
    await Notification.create({
      user: student.user,
      title: 'Mentor Reassignment Notice',
      message: `Your faculty mentor has been transitioned to ${newMentorUser.fullName || 'New Mentor'}. Reason: ${reasonForChange.trim()}`,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: newAssignment._id.toString(),
    });

    // 4. Notify New Mentor
    await Notification.create({
      user: newMentorUser._id || newMentor.user,
      title: 'New Mentee Reassigned',
      message: `Student ${student.fullName} (${student.registerNumber}) has been reassigned to you. Complete academic and meeting history is available.`,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: newAssignment._id.toString(),
    });

    // 5. Notify Previous Mentor if existed
    let prevMentorName = null;
    let prevMentorId = null;
    if (currentAssignment) {
      const prevMentorDoc: any = currentAssignment.mentor || {};
      const prevUserDoc: any = prevMentorDoc.user || {};
      prevMentorName = prevUserDoc.fullName || null;
      prevMentorId = prevMentorDoc._id?.toString() || null;

      if (prevUserDoc._id) {
        await Notification.create({
          user: prevUserDoc._id,
          title: 'Mentee Reassignment Completed',
          message: `Student ${student.fullName} (${student.registerNumber}) has been transferred to ${newMentorUser.fullName || 'another mentor'}.`,
          type: 'MENTOR_ASSIGNMENT',
          relatedEntity: 'MENTOR_ASSIGNMENT',
          relatedEntityId: currentAssignment._id.toString(),
        });
      }
    }

    await logAudit({
      userId: req.user!.id,
      action: 'REASSIGN_MENTOR',
      entity: 'MENTOR_ASSIGNMENT',
      entityId: newAssignment._id.toString(),
      details: {
        studentId: student._id.toString(),
        registerNumber: student.registerNumber,
        previousMentorId: prevMentorId,
        newMentorId: newMentor._id.toString(),
        effectiveDate: changeDate,
        reasonForChange,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        studentId: student._id.toString(),
        newAssignmentId: newAssignment._id.toString(),
        newMentorId: newMentor._id.toString(),
        newMentorName: newMentorUser.fullName || 'Faculty Mentor',
        previousMentorId: prevMentorId,
        previousMentorName: prevMentorName,
        effectiveDate: changeDate,
      },
      'Mentor reassigned successfully. All student history, academic records, and past meetings remain intact.'
    );
  } catch (err: any) {
    console.error('reassignMentor error:', err);
    return sendError(res, 'Failed to reassign mentor.', 500);
  }
}

// Get complete mentor history for a student
export async function getMentorshipHistory(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  try {
    let student = null;
    if (isValidId(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    const assignments = await MentorAssignment.find({ student: student._id })
      .populate({ path: 'mentor', populate: { path: 'user' } })
      .populate('assignedBy')
      .sort({ createdAt: -1 });

    const history = assignments.map((ma: any) => {
      const mentor = ma.mentor || {};
      const mentorUser = mentor.user || {};
      const assigner = ma.assignedBy || {};

      return {
        assignment_id: ma._id.toString(),
        id: ma._id.toString(),
        _id: ma._id.toString(),
        assigned_from: ma.assignedFrom,
        assigned_until: ma.assignedUntil,
        status: ma.status,
        change_reason: ma.changeReason,
        created_at: ma.createdAt,
        mentor_id: mentor._id ? mentor._id.toString() : '',
        employee_id: mentor.employeeId || '',
        designation: mentor.designation || '',
        cabin_location: mentor.cabinLocation || '',
        mentor_name: mentorUser.fullName || '',
        mentor_email: mentorUser.email || '',
        assigned_by_name: assigner.fullName || 'Administrator',
      };
    });

    return sendSuccess(res, history);
  } catch (err: any) {
    console.error('getMentorshipHistory error:', err);
    return sendError(res, 'Failed to fetch mentor history.', 500);
  }
}

/**
 * Export Overall Mentee Data as Institutional Excel (.xlsx)
 * Strictly verifies the authenticated mentor ID (Mentor-Specific Security).
 * Faculty can only download their own active mentees.
 * Admin/HOD can export specified mentor or all.
 */
export async function exportMentorMenteesExcel(req: AuthRequest, res: Response) {
  try {
    let targetMentorId: string | null = null;

    if (req.user?.role === ROLES.FACULTY) {
      if (req.user.facultyId) {
        targetMentorId = req.user.facultyId;
      } else {
        const fac = await Faculty.findOne({ user: req.user.id });
        if (fac) targetMentorId = fac._id.toString();
      }
    } else if (req.user?.role === ROLES.ADMIN || req.user?.role === ROLES.HOD) {
      const queryMentorId = req.query.mentorId as string;
      if (queryMentorId) {
        targetMentorId = queryMentorId;
      } else if (req.user.facultyId) {
        targetMentorId = req.user.facultyId;
      } else if (req.user.role === ROLES.ADMIN) {
        targetMentorId = 'ALL';
      } else {
        const fac = await Faculty.findOne({ user: req.user.id });
        if (fac) targetMentorId = fac._id.toString();
      }
    }

    if (!targetMentorId) {
      return sendError(res, 'Target mentor ID could not be identified.', 400);
    }

    // A HOD may only export a mentor who belongs to their own department; the
    // shared export would otherwise hand any department head another
    // department's full mentee Excel with personal and academic data.
    if (req.user?.role === ROLES.HOD && req.user.departmentId && targetMentorId !== 'ALL') {
      const targetFaculty = isValidId(targetMentorId)
        ? await Faculty.findById(targetMentorId)
        : await Faculty.findOne({ employeeId: targetMentorId });
      if (!targetFaculty || toIdString(targetFaculty.department) !== req.user.departmentId) {
        return sendError(res, 'Mentor not found', 404);
      }
    }

    const requestedYear = req.query.academicYear as string;
    const result = await generateMentorMenteesExcel(targetMentorId, requestedYear);

    if (result.count === 0 || !result.buffer) {
      return sendError(res, 'No mentees are currently assigned to you.', 404);
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    await logAudit({
      userId: req.user!.id,
      action: 'EXPORT_MENTOR_MENTEES_EXCEL',
      entity: 'MENTOR_ASSIGNMENT',
      details: {
        mentorId: targetMentorId,
        menteeCount: result.count,
        filename: result.filename,
      },
      req,
    });

    return res.status(200).send(result.buffer);
  } catch (err: any) {
    console.error('exportMentorMenteesExcel error:', err);
    return sendError(res, err.message || 'Failed to generate mentor mentee Excel report.', 500);
  }
}

