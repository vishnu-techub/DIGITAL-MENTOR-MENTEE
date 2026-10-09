import { Response } from 'express';
import {
  Student,
  User,
  Faculty,
  AcademicRecord,
  AcademicEditRequest,
  MentorAssignment,
  StudentDocument,
  Notification,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  checkStudentAccess,
  isActiveMentorOf,
  resolveFacultyIdForUser,
  toIdString,
} from '../../utils/access.util.js';
import { parseGrade, parseSemesterNumber, joinErrors } from '../../utils/validation.util.js';
import { syncStudentDetailsPdf } from '../documents/student-details-pdf.service.js';
import { isValidId, toLocalId, type LocalId } from '../../services/localId.js';

const MAX_PENDING_PER_SEMESTER = 1;

function shape(r: any) {
  return {
    id: r._id.toString(),
    _id: r._id.toString(),
    student: r.student ? toIdString(r.student) : null,
    register_number: r.registerNumber,
    student_name: r.studentName,
    semester_number: r.semesterNumber,
    current_cgpa: r.currentCgpa,
    current_sgpa: r.currentSgpa,
    requested_cgpa: r.requestedCgpa,
    requested_sgpa: r.requestedSgpa,
    reason: r.reason,
    supporting_document_id: r.supportingDocument ? toIdString(r.supportingDocument) : null,
    supporting_document_name: r.supportingDocumentName || '',
    supporting_document_url: r.supportingDocumentUrl || '',
    status: r.status,
    approved_by_name: r.approvedByName || '',
    approved_at: r.approvedAt || null,
    rejected_by_name: r.rejectedByName || '',
    rejected_at: r.rejectedAt || null,
    rejection_reason: r.rejectionReason || '',
    requested_at: r.createdAt,
    created_at: r.createdAt,
  };
}

async function loadStudentForStudentUser(req: AuthRequest) {
  const tokenStudentId = req.user?.studentId;
  if (!tokenStudentId) return null;
  if (isValidId(tokenStudentId)) {
    const byId = await Student.findById(tokenStudentId);
    if (byId) return byId;
  }
  return Student.findOne({ registerNumber: String(tokenStudentId).toUpperCase() });
}

/** Resolve the ACTIVE mentor's user id for a student (used to route requests + notices). */
async function activeMentorUserId(studentId: string): Promise<{ facultyId: string; userId: string; name: string } | null> {
  const asg = await MentorAssignment.findOne({ student: toLocalId(studentId), status: 'ACTIVE' });
  if (!asg) return null;
  const faculty = await Faculty.findById(asg.mentor).populate('user', 'fullName');
  if (!faculty) return null;
  const userId = toIdString(faculty.user);
  if (!userId) return null;
  const mentorUser = faculty.user as any;
  return {
    facultyId: toIdString(faculty._id) as string,
    userId,
    name: mentorUser?.fullName || 'Assigned Mentor',
  };
}

/** Semester with recorded results, highest first. */
async function latestRecordedSemester(studentId: string): Promise<number> {
  const rec = await AcademicRecord.findOne({ student: toLocalId(studentId), semesterNumber: { $gt: 0 } })
    .sort({ semesterNumber: -1 })
    .select('semesterNumber')
    .lean();
  return rec ? (rec as any).semesterNumber : 1;
}

// ---------------------------------------------------------------------------
// STUDENT: create request
// ---------------------------------------------------------------------------
export async function createAcademicEditRequest(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.STUDENT) {
      return sendError(res, 'Only a student can raise an academic correction request.', 403);
    }

    const student = await loadStudentForStudentUser(req);
    if (!student) {
      return sendError(res, 'Student account record not found.', 404);
    }

    const errors: string[] = [];

    // ---- Validate EVERYTHING before touching the database (no partial writes)
    const semesterResult = parseSemesterNumber(req.body?.semesterNumber ?? req.body?.semester_number);
    if (!semesterResult.ok) errors.push(semesterResult.error as string);

    const reqCgpa = parseGrade(req.body?.requestedCgpa ?? req.body?.requested_cgpa, 'Requested CGPA');
    if (!reqCgpa.ok) errors.push(reqCgpa.error as string);

    const reqSgpa = parseGrade(req.body?.requestedSgpa ?? req.body?.requested_sgpa, 'Requested SGPA');
    if (!reqSgpa.ok) errors.push(reqSgpa.error as string);

    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) errors.push('A reason is required for an academic correction request.');
    else if (reason.length < 5) errors.push('Please provide a meaningful reason (at least 5 characters).');

    const supportingIdRaw = req.body?.supportingDocumentId ?? req.body?.supporting_document_id;
    if (supportingIdRaw && !isValidId(String(supportingIdRaw))) {
      errors.push('The selected supporting document reference is invalid.');
    }

    if (errors.length) {
      return sendError(res, joinErrors(errors), 400, errors);
    }

    const semesterNumber = semesterResult.value as number;

    // Supporting document must belong to the requesting student.
    let supporting: any = null;
    if (supportingIdRaw) {
      supporting = await StudentDocument.findOne({
        _id: toLocalId(String(supportingIdRaw)),
        studentId: student._id,
      });
      if (!supporting) {
        return sendError(res, 'The selected supporting document does not belong to your record.', 400);
      }
    }

    const existing = await AcademicRecord.findOne({
      student: student._id,
      semesterNumber,
    });

    const currentCgpa = existing ? Number(existing.cgpa) || 0 : 0;
    const currentSgpa = existing ? Number(existing.sgpa) || 0 : 0;
    const requestedCgpa = reqCgpa.value as number;
    const requestedSgpa = reqSgpa.value as number;

    if (requestedCgpa === currentCgpa && requestedSgpa === currentSgpa) {
      return sendError(
        res,
        'The requested CGPA/SGPA match your current recorded values. Nothing to change.',
        400
      );
    }

    const pending = await AcademicEditRequest.findOne({
      student: student._id,
      semesterNumber,
      status: 'PENDING',
    });
    if (pending) {
      return sendError(
        res,
        `You already have a pending academic correction request for Semester 0${semesterNumber}.`,
        400
      );
    }

    // ---- Everything validated: persist only the REQUEST. AcademicRecord is untouched.
    const created = await AcademicEditRequest.create({
      student: student._id,
      registerNumber: student.registerNumber,
      studentName: student.fullName,
      semesterNumber,
      currentCgpa,
      currentSgpa,
      requestedCgpa,
      requestedSgpa,
      reason,
      supportingDocument: supporting?._id,
      supportingDocumentName: supporting?.fileName || '',
      supportingDocumentUrl: supporting?.fileUrl || '',
      status: 'PENDING',
    });

    const mentor = await activeMentorUserId(student._id.toString());
    if (mentor) {
      await Notification.create({
        user: toLocalId(mentor.userId),
        title: 'Academic Correction Request',
        message: `${student.fullName} (${student.registerNumber}) requested a CGPA/SGPA correction for Semester 0${semesterNumber}: CGPA ${currentCgpa.toFixed(2)} → ${requestedCgpa.toFixed(2)}, SGPA ${currentSgpa.toFixed(2)} → ${requestedSgpa.toFixed(2)}.`,
        type: 'SYSTEM_ANNOUNCEMENT',
        relatedEntity: 'ACADEMIC_EDIT_REQUEST',
        relatedEntityId: created._id.toString(),
        actionUrl: '/mentor/academic-requests',
      });
    }

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_ACADEMIC_EDIT_REQUEST',
      entity: 'ACADEMIC_EDIT_REQUEST',
      entityId: created._id.toString(),
      details: {
        semesterNumber,
        currentCgpa,
        currentSgpa,
        requestedCgpa,
        requestedSgpa,
      },
      req,
    });

    return sendSuccess(
      res,
      shape(created),
      'Academic correction request submitted. Your mentor will review it. Your current CGPA/SGPA remain unchanged until approval.',
      201
    );
  } catch (err: any) {
    console.error('createAcademicEditRequest error:', err);
    return sendError(res, 'Failed to submit academic correction request.', 500);
  }
}

// ---------------------------------------------------------------------------
// STUDENT: own requests
// ---------------------------------------------------------------------------
export async function getMyAcademicEditRequests(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.STUDENT) {
      return sendError(res, 'Only a student can view their own academic correction requests.', 403);
    }
    const student = await loadStudentForStudentUser(req);
    if (!student) return sendError(res, 'Student account record not found.', 404);

    const requests = await AcademicEditRequest.find({ student: student._id })
      .sort({ createdAt: -1 })
      .limit(50);

    return sendSuccess(res, requests.map(shape));
  } catch (err: any) {
    console.error('getMyAcademicEditRequests error:', err);
    return sendError(res, 'Failed to retrieve academic correction requests.', 500);
  }
}

// ---------------------------------------------------------------------------
// MENTOR / HOD / ADMIN: queue
// ---------------------------------------------------------------------------
export async function listAcademicEditRequests(req: AuthRequest, res: Response) {
  try {
    const { status, studentId } = req.query as Record<string, string>;
    const filter: any = {};

    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      filter.status = status.toUpperCase();
    }
    if (studentId) {
      if (!isValidId(studentId)) {
        return sendError(res, 'Invalid student reference.', 400);
      }
      filter.student = toLocalId(studentId);
    }

    if (req.user?.role === ROLES.FACULTY) {
      const mentorId = await resolveFacultyIdForUser(req.user);
      if (!mentorId) return sendSuccess(res, []);
      const asgs = await MentorAssignment.find({
        mentor: toLocalId(mentorId),
        status: 'ACTIVE',
      })
        .select('student')
        .lean();
      filter.student = { $in: asgs.map((a: any) => a.student) };
    } else if (req.user?.role === ROLES.HOD) {
      if (!req.user.departmentId) return sendSuccess(res, []);
      const students = await Student.find({ department: toLocalId(req.user.departmentId) })
        .select('_id')
        .lean();
      filter.student = { $in: students.map((s: any) => s._id) };
    } else if (req.user?.role !== ROLES.ADMIN) {
      return sendError(res, 'You are not authorized to view academic correction requests.', 403);
    }

    const requests = await AcademicEditRequest.find(filter).sort({ createdAt: -1 }).limit(200);
    return sendSuccess(res, requests.map(shape));
  } catch (err: any) {
    console.error('listAcademicEditRequests error:', err);
    return sendError(res, 'Failed to load academic correction requests.', 500);
  }
}

// ---------------------------------------------------------------------------
// Guard used by both review actions
// ---------------------------------------------------------------------------
async function loadReviewableRequest(req: AuthRequest, res: Response) {
  if (!([ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN] as string[]).includes(req.user!.role)) {
    sendError(res, 'Only a mentor, HOD or administrator can review academic correction requests.', 403);
    return null;
  }

  const editReq = await AcademicEditRequest.findById(req.params.id);
  if (!editReq) {
    sendError(res, 'Academic correction request not found.', 404);
    return null;
  }
  if (editReq.status !== 'PENDING') {
    sendError(res, `This request has already been ${editReq.status.toLowerCase()}.`, 400);
    return null;
  }

  const student = await Student.findById(editReq.student);
  if (!student) {
    sendError(res, 'The student record for this request no longer exists.', 404);
    return null;
  }

  // Mentors may only act on currently-assigned mentees.
  if (req.user!.role === ROLES.FACULTY) {
    const isMentor = await isActiveMentorOf(req.user, student._id.toString());
    if (!isMentor) {
      sendError(res, 'Access denied: you are not the active assigned mentor for this student.', 403);
      return null;
    }
  } else {
    const decision = await checkStudentAccess(req.user, student);
    if (!decision.allowed) {
      sendError(res, decision.message, decision.status);
      return null;
    }
  }

  return { editReq, student };
}

// ---------------------------------------------------------------------------
// MENTOR: approve
// ---------------------------------------------------------------------------
export async function approveAcademicEditRequest(req: AuthRequest, res: Response) {
  try {
    const ctx = await loadReviewableRequest(req, res);
    if (!ctx) return;
    const { editReq, student } = ctx;

    // Re-validate on the backend. Never trust the stored request blindly.
    const cgpa = parseGrade(req.body?.cgpa ?? req.body?.requestedCgpa ?? editReq.requestedCgpa, 'CGPA');
    const sgpa = parseGrade(req.body?.sgpa ?? req.body?.requestedSgpa ?? editReq.requestedSgpa, 'SGPA');
    const errors: string[] = [];
    if (!cgpa.ok) errors.push(cgpa.error as string);
    if (!sgpa.ok) errors.push(sgpa.error as string);
    if (errors.length) return sendError(res, joinErrors(errors), 400, errors);

    const newCgpa = cgpa.value as number;
    const newSgpa = sgpa.value as number;

    // ---- Validated: now write.
    const updated = await AcademicRecord.findOneAndUpdate(
      { student: student._id, semesterNumber: editReq.semesterNumber },
      {
        $set: {
          cgpa: newCgpa,
          sgpa: newSgpa,
        },
        $setOnInsert: {
          student: student._id,
          semesterNumber: editReq.semesterNumber,
          arrearsCount: 0,
          arrearsSubjects: '',
          arrearSubjectDetails: [],
          clearedSubjects: [],
          remarks: '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    editReq.status = 'APPROVED';
    editReq.requestedCgpa = newCgpa;
    editReq.requestedSgpa = newSgpa;
    editReq.approvedBy = toLocalId(req.user!.id);
    editReq.approvedByName = req.user?.fullName || 'Faculty Mentor';
    editReq.approvedAt = new Date();
    await editReq.save();

    await Notification.create({
      user: student.user,
      title: 'Academic update approved',
      message: `Your CGPA/SGPA correction request for Semester 0${editReq.semesterNumber} was approved by ${editReq.approvedByName}. CGPA is now ${newCgpa.toFixed(2)} and SGPA is ${newSgpa.toFixed(2)}.`,
      type: 'SYSTEM_ANNOUNCEMENT',
      relatedEntity: 'ACADEMIC_EDIT_REQUEST',
      relatedEntityId: editReq._id.toString(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'APPROVE_ACADEMIC_EDIT_REQUEST',
      entity: 'ACADEMIC_EDIT_REQUEST',
      entityId: editReq._id.toString(),
      details: {
        registerNumber: student.registerNumber,
        semesterNumber: editReq.semesterNumber,
        previousCgpa: editReq.currentCgpa,
        previousSgpa: editReq.currentSgpa,
        newCgpa,
        newSgpa,
      },
      req,
    });

    try {
      await syncStudentDetailsPdf(student._id.toString(), req.user?.id);
    } catch (pdfErr) {
      console.error('Failed to sync student details PDF after academic approval:', pdfErr);
    }

    return sendSuccess(
      res,
      {
        request: shape(editReq),
        academicRecord: {
          semester_number: updated?.semesterNumber,
          cgpa: updated?.cgpa,
          sgpa: updated?.sgpa,
        },
      },
      'Academic update approved.'
    );
  } catch (err: any) {
    console.error('approveAcademicEditRequest error:', err);
    return sendError(res, 'Failed to approve academic correction request.', 500);
  }
}

// ---------------------------------------------------------------------------
// MENTOR: reject
// ---------------------------------------------------------------------------
export async function rejectAcademicEditRequest(req: AuthRequest, res: Response) {
  try {
    const ctx = await loadReviewableRequest(req, res);
    if (!ctx) return;
    const { editReq, student } = ctx;

    const rejectionReason = String(req.body?.rejectionReason ?? req.body?.reason ?? '').trim();
    if (!rejectionReason) {
      return sendError(res, 'A rejection reason is required when rejecting an academic correction request.', 400);
    }

    // Original CGPA/SGPA are deliberately left untouched.
    editReq.status = 'REJECTED';
    editReq.rejectedBy = toLocalId(req.user!.id);
    editReq.rejectedByName = req.user?.fullName || 'Faculty Mentor';
    editReq.rejectedAt = new Date();
    editReq.rejectionReason = rejectionReason;
    await editReq.save();

    await Notification.create({
      user: student.user,
      title: 'Academic update request rejected',
      message: `Your CGPA/SGPA correction request for Semester 0${editReq.semesterNumber} was rejected by ${editReq.rejectedByName}. Reason: ${rejectionReason}. Your recorded CGPA/SGPA remain unchanged.`,
      type: 'SYSTEM_ANNOUNCEMENT',
      relatedEntity: 'ACADEMIC_EDIT_REQUEST',
      relatedEntityId: editReq._id.toString(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'REJECT_ACADEMIC_EDIT_REQUEST',
      entity: 'ACADEMIC_EDIT_REQUEST',
      entityId: editReq._id.toString(),
      details: {
        registerNumber: student.registerNumber,
        semesterNumber: editReq.semesterNumber,
        rejectionReason,
      },
      req,
    });

    return sendSuccess(res, shape(editReq), 'Academic update request rejected.');
  } catch (err: any) {
    console.error('rejectAcademicEditRequest error:', err);
    return sendError(res, 'Failed to reject academic correction request.', 500);
  }
}

// ---------------------------------------------------------------------------
// Single request (scoped)
// ---------------------------------------------------------------------------
export async function getAcademicEditRequestById(req: AuthRequest, res: Response) {
  try {
    const editReq = await AcademicEditRequest.findById(req.params.id);
    if (!editReq) return sendError(res, 'Academic correction request not found.', 404);

    const student = await Student.findById(editReq.student);
    if (!student) return sendError(res, 'Student record not found.', 404);

    const decision = await checkStudentAccess(req.user, student);
    if (!decision.allowed) return sendError(res, decision.message, decision.status);

    return sendSuccess(res, shape(editReq));
  } catch (err: any) {
    console.error('getAcademicEditRequestById error:', err);
    return sendError(res, 'Failed to load academic correction request.', 500);
  }
}
