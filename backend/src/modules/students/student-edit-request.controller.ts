import { Response } from 'express';
import {
  Student,
  User,
  Department,
  Batch,
  StudentEditRequest,
  MentorAssignment,
  Notification,
  StudentProgress,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { toIdString } from '../../utils/access.util.js';
import { ROLES } from '../../config/constants.js';
import { syncStudentDetailsPdf } from '../documents/student-details-pdf.service.js';
import { isValidId, toLocalId, type LocalId } from '../../services/localId.js';

/** Escape a user-supplied string so it is safe to embed in a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact-name match, built without a nested template literal. */
function exactNameRegex(value: string): RegExp {
  return new RegExp('^' + escapeRegex(value) + '$', 'i');
}

// Case-insensitive lookup by ObjectId, name, or code.
async function resolveDepartment(input: any) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (isValidId(raw)) {
    const byId = await Department.findById(raw);
    if (byId) return byId;
  }
  return Department.findOne({ name: exactNameRegex(raw) });
}

async function resolveBatch(input: any) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (isValidId(raw)) {
    const byId = await Batch.findById(raw);
    if (byId) return byId;
  }
  return Batch.findOne({ name: exactNameRegex(raw) });
}

// Student submits an Institutional Identity Edit Request
export async function createIdentityEditRequest(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const student = await Student.findOne({ user: userId })
      .populate('department')
      .populate('batch');

    if (!student) {
      return sendError(res, 'Student account record not found.', 404);
    }

    // Accept BOTH wire shapes so the frontend and backend cannot drift again:
    //   { requestedChanges: { fullName, registerNumber, department, batch }, reason }
    //   { fullName, registerNumber, departmentId, batchId, reason }
    const source = (req.body?.requestedChanges && typeof req.body.requestedChanges === 'object')
      ? req.body.requestedChanges
      : req.body || {};

    const fullName = source.fullName ?? source.full_name;
    const registerNumber = source.registerNumber ?? source.register_number;
    const departmentInput = source.department ?? source.departmentId ?? source.department_id;
    const batchInput = source.batch ?? source.batchId ?? source.batch_id;
    const reason = req.body?.reason;

    if (!reason || !String(reason).trim()) {
      return sendError(res, 'A clear reason / explanation is required for requesting identity corrections.', 400);
    }

    const requestedFields: any = {};
    const currentValues: any = {
      fullName: student.fullName,
      registerNumber: student.registerNumber,
      department: toIdString(student.department),
      departmentName: (student.department as any)?.name || '',
      batch: toIdString(student.batch),
      batchName: (student.batch as any)?.name || '',
    };

    let hasChange = false;

    if (fullName && String(fullName).trim() && String(fullName).trim() !== student.fullName) {
      requestedFields.fullName = String(fullName).trim();
      hasChange = true;
    }

    if (registerNumber && String(registerNumber).trim()) {
      const cleanReg = String(registerNumber).trim().toUpperCase();
      if (cleanReg !== student.registerNumber) {
        const existing = await Student.findOne({ registerNumber: cleanReg, _id: { $ne: student._id } });
        if (existing) {
          return sendError(res, `Register Number ${cleanReg} is already assigned to another student.`, 400);
        }
        requestedFields.registerNumber = cleanReg;
        hasChange = true;
      }
    }

    if (departmentInput) {
      const deptDoc = await resolveDepartment(departmentInput);
      if (!deptDoc) {
        return sendError(
          res,
          `Department "${String(departmentInput).trim()}" was not found. Select a department from the list.`,
          400
        );
      }
      // Compare normalised ids — never ObjectId vs populated subdocument.
      if (toIdString(deptDoc._id) !== toIdString(student.department)) {
        requestedFields.department = deptDoc._id;
        requestedFields.departmentName = deptDoc.name;
        hasChange = true;
      }
    }

    if (batchInput) {
      const batchDoc = await resolveBatch(batchInput);
      if (!batchDoc) {
        return sendError(
          res,
          `Batch "${String(batchInput).trim()}" was not found. Select a batch from the list.`,
          400
        );
      }
      if (toIdString(batchDoc._id) !== toIdString(student.batch)) {
        requestedFields.batch = batchDoc._id;
        requestedFields.batchName = batchDoc.name;
        hasChange = true;
      }
    }

    if (!hasChange) {
      return sendError(res, 'No changes detected. Please specify at least one updated identity field.', 400);
    }

    // Check for existing pending request
    const pendingExisting = await StudentEditRequest.findOne({
      student: student._id,
      status: 'PENDING',
    });
    if (pendingExisting) {
      return sendError(
        res,
        'You already have a pending correction request under administrative review. Please wait for decision before submitting another.',
        400
      );
    }

    const editRequest = await StudentEditRequest.create({
      student: student._id,
      registerNumber: student.registerNumber,
      studentName: student.fullName,
      requestedFields,
      currentValues,
      reason: reason.trim(),
      status: 'PENDING',
    });

    await logAudit({
      userId: req.user!.id,
      action: 'REQUEST_IDENTITY_EDIT',
      entity: 'STUDENT',
      entityId: student._id.toString(),
      details: { requestId: editRequest._id.toString(), requestedFields },
      req,
    });

    return sendSuccess(
      res,
      editRequest,
      'Your identity correction request has been submitted to the Academic Administrator for formal review.',
      201
    );
  } catch (err: any) {
    console.error('createIdentityEditRequest error:', err);
    return sendError(res, 'Failed to submit identity edit request: ' + err.message, 500);
  }
}

// Student gets their own correction requests
export async function getMyIdentityEditRequests(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const student = await Student.findOne({ user: userId });
    if (!student) {
      return sendError(res, 'Student account record not found.', 404);
    }

    const requests = await StudentEditRequest.find({ student: student._id })
      .sort({ createdAt: -1 })
      .limit(20);

    return sendSuccess(res, requests);
  } catch (err: any) {
    console.error('getMyIdentityEditRequests error:', err);
    return sendError(res, 'Failed to retrieve correction requests.', 500);
  }
}

// Admin retrieves all correction requests (filtered by status)
export async function getAdminIdentityEditRequests(req: AuthRequest, res: Response) {
  try {
    const { status } = req.query as { status?: string };
    const filter: any = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      filter.status = status.toUpperCase();
    }

    const requests = await StudentEditRequest.find(filter)
      .populate('student')
      .sort({ createdAt: -1 });

    return sendSuccess(res, requests);
  } catch (err: any) {
    console.error('getAdminIdentityEditRequests error:', err);
    return sendError(res, 'Failed to fetch identity edit requests.', 500);
  }
}

// Admin reviews (Approve or Reject) an identity edit request
export async function reviewIdentityEditRequest(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const rawAction = req.body.action || (req.body.status === 'APPROVED' ? 'APPROVE' : req.body.status === 'REJECTED' ? 'REJECT' : req.body.status);
  const action = typeof rawAction === 'string' ? rawAction.toUpperCase() : '';
  const adminComments = req.body.adminComments || req.body.reviewNotes || '';

  if (!action || !['APPROVE', 'REJECT'].includes(action)) {
    return sendError(res, 'Valid review action (APPROVE or REJECT) is required.', 400);
  }

  try {
    const editReq = await StudentEditRequest.findById(id);
    if (!editReq) {
      return sendError(res, 'Identity edit request not found.', 404);
    }

    if (editReq.status !== 'PENDING') {
      return sendError(res, `This request has already been ${editReq.status.toLowerCase()}.`, 400);
    }

    const student = await Student.findById(editReq.student);
    if (!student) {
      return sendError(res, 'Target student record no longer exists.', 404);
    }

    const reviewerName = req.user?.fullName || 'Academic Administrator';

    if (action === 'APPROVE') {
      // 1. Apply requested fields to Student
      const { fullName, registerNumber, department, batch } = editReq.requestedFields;

      if (fullName) {
        student.fullName = fullName;
        await User.findByIdAndUpdate(student.user, { fullName });
      }

      if (registerNumber) {
        const oldReg = student.registerNumber;
        student.registerNumber = registerNumber;
        await User.findByIdAndUpdate(student.user, { username: registerNumber });

        // Synchronize in StudentProgress collection if oldReg exists
        await StudentProgress.updateMany(
          { studentId: student._id },
          { $set: { registerNumber, studentName: student.fullName } }
        );
      }

      if (department) {
        student.department = department;
        // Keep mentor assignments aligned so HOD scoping and mentor views stay correct.
        await MentorAssignment.updateMany(
          { student: student._id, status: 'ACTIVE' },
          { $set: { department } }
        );
      }

      if (batch) {
        student.batch = batch;
      }

      await student.save();

      // 2. Mark request as APPROVED
      editReq.status = 'APPROVED';
      editReq.reviewedBy = req.user!.id as any;
      editReq.reviewerName = reviewerName;
      editReq.adminComments = adminComments?.trim() || 'Approved by Academic Administration';
      editReq.reviewedAt = new Date();
      await editReq.save();

      // 3. Sync Student Details Form PDF
      try {
        await syncStudentDetailsPdf(student._id.toString(), req.user?.id);
      } catch (pdfErr) {
        console.error('Failed to sync student details PDF on approved edit request:', pdfErr);
      }

      // 4. Notify student
      await Notification.create({
        user: student.user,
        title: 'Institutional Identity Correction Approved',
        message: `Your requested correction has been officially approved and updated in the college mentoring ledger.`,
        type: 'SYSTEM_ANNOUNCEMENT',
        relatedEntity: 'STUDENT',
        relatedEntityId: student._id.toString(),
      });

      await logAudit({
        userId: req.user!.id,
        action: 'APPROVE_IDENTITY_EDIT',
        entity: 'STUDENT',
        entityId: student._id.toString(),
        details: {
          requestId: editReq._id.toString(),
          updatedFields: editReq.requestedFields,
          reviewerName,
        },
        req,
      });

      return sendSuccess(res, editReq, 'Identity edit request approved and official student records updated.');
    } else {
      // REJECT action: Student information remains 100% untouched
      editReq.status = 'REJECTED';
      editReq.reviewedBy = req.user!.id as any;
      editReq.reviewerName = reviewerName;
      editReq.adminComments = adminComments?.trim() || 'Declined per institutional verification guidelines';
      editReq.reviewedAt = new Date();
      await editReq.save();

      // Notify student
      await Notification.create({
        user: student.user,
        title: 'Identity Correction Request Declined',
        message: `Your identity correction request was reviewed and declined. Reason: ${editReq.adminComments}`,
        type: 'SYSTEM_ANNOUNCEMENT',
        relatedEntity: 'STUDENT',
        relatedEntityId: student._id.toString(),
      });

      await logAudit({
        userId: req.user!.id,
        action: 'REJECT_IDENTITY_EDIT',
        entity: 'STUDENT',
        entityId: student._id.toString(),
        details: {
          requestId: editReq._id.toString(),
          reason: editReq.adminComments,
          reviewerName,
        },
        req,
      });

      return sendSuccess(res, editReq, 'Identity edit request declined. Student records remain unchanged.');
    }
  } catch (err: any) {
    console.error('reviewIdentityEditRequest error:', err);
    return sendError(res, 'Failed to process identity edit request review: ' + err.message, 500);
  }
}
