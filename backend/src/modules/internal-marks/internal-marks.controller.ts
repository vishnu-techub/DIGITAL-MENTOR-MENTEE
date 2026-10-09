import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  InternalMark,
  MarkEntryPermission,
  MarkUpdateRequest,
  Student,
} from '../../models/index.js';
import { MARK_ENTRY_PERMISSION_KEY } from '../../models/MarkEntryPermission.model.js';
import {
  isMarkType,
  MARK_TYPES,
  MARK_TYPE_MAX,
  MARK_TYPE_LABEL,
  MARK_TYPE_FIELD,
  type InternalMarkType,
} from '../../models/InternalMark.model.js';
import {
  getMarkEntryPermissionState,
  markTypeRefusal,
} from './mark-entry-permission.service.js';
import { parseStrictNumber, parseSemesterNumber, joinErrors } from '../../utils/validation.util.js';
import { loadAccessibleStudent, buildScopedStudentFilter } from '../../utils/access.util.js';
import { isValidId } from '../../services/localId.js';

/**
 * INTERNAL MARKS + ADMIN-CONTROLLED MARK ENTRY.
 * ---------------------------------------------------------------------------
 * Authorisation is layered exactly like the rest of the codebase:
 *   1. router-level `authenticate` (JWT),
 *   2. route-level `authorize(...roles)`,
 *   3. handler-level scope: `loadAccessibleStudent` (ADMIN college-wide,
 *      FACULTY own ACTIVE mentees only, HOD own department) for every student
 *      operation, plus a role re-check on the ADMIN-only handlers,
 *   4. the server-authoritative MarkEntryPermission window for every write of
 *      an official mark — expiry is enforced here, never by the UI.
 *
 * A correction REQUEST never writes a mark; only an Admin approval does, and it
 * re-validates the stored request before writing.
 */

const SUBJECT_CODE_RE = /^[A-Z0-9][A-Z0-9.\-]{1,19}$/;

function parseSubjectCode(input: unknown): { ok: boolean; value?: string; error?: string } {
  if (input === null || input === undefined || String(input).trim() === '') {
    return { ok: false, error: 'Subject code is required.' };
  }
  const raw = String(input).trim().toUpperCase();
  if (!SUBJECT_CODE_RE.test(raw)) {
    return {
      ok: false,
      error: `Invalid subject code "${String(input).trim()}" (2-20 letters/digits, dots or hyphens).`,
    };
  }
  return { ok: true, value: raw };
}

function parseSubjectName(input: unknown): { ok: boolean; value?: string; error?: string } {
  if (input === null || input === undefined || String(input).trim() === '') {
    return { ok: false, error: 'Subject name is required.' };
  }
  const raw = String(input).trim();
  if (raw.length < 2 || raw.length > 120) {
    return { ok: false, error: 'Subject name must be between 2 and 120 characters.' };
  }
  return { ok: true, value: raw };
}

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === ROLES.ADMIN;
}

function formatMark(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// ADMIN: mark-entry permission
// ---------------------------------------------------------------------------

export async function getMarkEntryPermission(req: AuthRequest, res: Response) {
  try {
    if (!isAdmin(req)) return sendError(res, 'Only an administrator may view mark-entry permission.', 403);
    const state = await getMarkEntryPermissionState();
    return sendSuccess(res, { permission: state }, 'Mark-entry permission loaded.');
  } catch (err: any) {
    console.error('getMarkEntryPermission error:', err);
    return sendError(res, 'Unable to load mark-entry permission.', 500);
  }
}

export async function updateMarkEntryPermission(req: AuthRequest, res: Response) {
  try {
    if (!isAdmin(req)) return sendError(res, 'Only an administrator may change mark-entry permission.', 403);

    const body = req.body ?? {};
    const enabled = body.enabled;

    if (typeof enabled !== 'boolean') {
      return sendError(res, 'The "enabled" flag (true/false) is required.', 400);
    }

    const now = new Date();

    if (!enabled) {
      // Manual disable before any expiry date: flip the switch, keep the window
      // so the UI can still show when it would have expired.
      const doc = await MarkEntryPermission.findOne({ key: MARK_ENTRY_PERMISSION_KEY });
      if (!doc) {
        const state = await getMarkEntryPermissionState();
        return sendSuccess(res, { permission: state }, 'Mark entry is already disabled.');
      }
      doc.enabled = false;
      doc.updatedBy = (req.user!.id as any) ?? undefined;
      doc.updatedByName = req.user!.fullName;
      await doc.save();

      await logAudit({
        userId: req.user!.id,
        action: 'DISABLE_MARK_ENTRY',
        entity: 'MARK_ENTRY_PERMISSION',
        entityId: MARK_ENTRY_PERMISSION_KEY,
        details: {
          markTypes: doc.markTypes,
          expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
          manuallyDisabled: true,
        },
        req,
      });

      const state = await getMarkEntryPermissionState();
      return sendSuccess(res, { permission: state }, 'Mark entry disabled.');
    }

    // ---- Enable -----------------------------------------------------------
    const errors: string[] = [];

    const rawTypes = Array.isArray(body.markTypes) ? body.markTypes : [];
    const markTypes: InternalMarkType[] = [];
    for (const t of rawTypes) {
      if (!isMarkType(t)) {
        errors.push(`Unknown mark type "${String(t)}" (allowed: IA1, IA2, END_SEM).`);
      } else if (!markTypes.includes(t)) {
        markTypes.push(t);
      }
    }
    if (markTypes.length === 0) errors.push('Select at least one mark type (IA1, IA2, END_SEM).');

    const durationResult = parseStrictNumber(body.durationDays, {
      field: 'Duration (days)',
      min: 1,
      max: 365,
      integer: true,
      required: false,
    });
    if (!durationResult.ok) errors.push(durationResult.error!);
    const durationDays = durationResult.value ?? 7;

    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    const startsAt = now;
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await MarkEntryPermission.findOneAndUpdate(
      { key: MARK_ENTRY_PERMISSION_KEY },
      {
        $set: {
          key: MARK_ENTRY_PERMISSION_KEY,
          enabled: true,
          markTypes,
          durationDays,
          startsAt,
          expiresAt,
          updatedBy: req.user!.id,
          updatedByName: req.user!.fullName,
        },
      },
      { upsert: true, new: true }
    );

    await logAudit({
      userId: req.user!.id,
      action: 'ENABLE_MARK_ENTRY',
      entity: 'MARK_ENTRY_PERMISSION',
      entityId: MARK_ENTRY_PERMISSION_KEY,
      details: {
        markTypes,
        durationDays,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      req,
    });

    const state = await getMarkEntryPermissionState();
    return sendSuccess(
      res,
      { permission: state },
      `Mark entry enabled for ${markTypes.map((t) => MARK_TYPE_LABEL[t]).join(', ')} until ${expiresAt.toISOString()}.`,
      200
    );
  } catch (err: any) {
    console.error('updateMarkEntryPermission error:', err);
    return sendError(res, 'Unable to update mark-entry permission.', 500);
  }
}

// ---------------------------------------------------------------------------
// Marks: read / write (scoped through loadAccessibleStudent)
// ---------------------------------------------------------------------------

export async function getInternalMarks(req: AuthRequest, res: Response) {
  try {
    const studentId = String(req.params.studentId ?? '');
    const { student, decision } = await loadAccessibleStudent(req.user, studentId);
    if (!student) return sendError(res, decision.message, decision.status);

    const filter: Record<string, any> = { student: student._id };
    if (req.query.semester !== undefined && req.query.semester !== '') {
      const sem = parseSemesterNumber(req.query.semester);
      if (!sem.ok) return sendError(res, sem.error!, 400);
      filter.semesterNumber = sem.value;
    }

    const rows = await InternalMark.find(filter).sort({ semesterNumber: 1, subjectCode: 1 });
    const permission = await getMarkEntryPermissionState();

    return sendSuccess(res, {
      student: {
        id: student._id.toString(),
        registerNumber: student.registerNumber,
        fullName: student.fullName,
      },
      permission,
      marks: rows.map((r: any) => ({
        id: r._id.toString(),
        semesterNumber: r.semesterNumber,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        ia1: formatMark(r.ia1),
        ia2: formatMark(r.ia2),
        endSem: formatMark(r.endSem),
        updatedByName: r.updatedByName || '',
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err: any) {
    console.error('getInternalMarks error:', err);
    return sendError(res, 'Unable to load internal marks.', 500);
  }
}

export async function updateInternalMarks(req: AuthRequest, res: Response) {
  try {
    // STUDENT is excluded at the route level; re-assert here so a handler
    // re-mounted elsewhere still refuses a student.
    if (req.user?.role === ROLES.STUDENT) {
      return sendError(res, 'Students cannot edit official marks. Ask your mentor to raise a correction request.', 403);
    }

    const studentId = String(req.params.studentId ?? '');
    const { student, decision } = await loadAccessibleStudent(req.user, studentId);
    if (!student) return sendError(res, decision.message, decision.status);

    const body = req.body ?? {};
    const errors: string[] = [];

    const sem = parseSemesterNumber(body.semesterNumber);
    if (!sem.ok) errors.push(sem.error!);

    const code = parseSubjectCode(body.subjectCode);
    if (!code.ok) errors.push(code.error!);

    const name = parseSubjectName(body.subjectName);
    if (!name.ok) errors.push(name.error!);

    const provided: Partial<Record<InternalMarkType, number>> = {};
    for (const type of MARK_TYPES) {
      const raw = body[type === 'END_SEM' ? 'endSem' : type.toLowerCase()];
      if (raw === undefined || raw === null || raw === '') continue;
      const parsed = parseStrictNumber(raw, {
        field: `${MARK_TYPE_LABEL[type]} mark`,
        min: 0,
        max: MARK_TYPE_MAX[type],
      });
      if (!parsed.ok) {
        errors.push(parsed.error!);
      } else {
        provided[type] = parsed.value!;
      }
    }

    if (Object.keys(provided).length === 0 && errors.length === 0) {
      errors.push('Provide at least one mark: IA1, IA2 or End Semester.');
    }

    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    // ---- Server-authoritative permission window --------------------------
    const permission = await getMarkEntryPermissionState();
    for (const type of Object.keys(provided) as InternalMarkType[]) {
      const refusal = markTypeRefusal(permission, type);
      if (refusal) {
        return sendError(res, refusal, 403, { permission });
      }
    }

    const set: Record<string, any> = {
      registerNumber: student.registerNumber,
      semesterNumber: sem.value,
      subjectCode: code.value,
      subjectName: name.value,
      updatedBy: req.user!.id,
      updatedByName: req.user!.fullName,
    };
    for (const type of Object.keys(provided) as InternalMarkType[]) {
      set[MARK_TYPE_FIELD[type]] = provided[type];
    }

    const row = await InternalMark.findOneAndUpdate(
      { student: student._id, semesterNumber: sem.value, subjectCode: code.value },
      { $set: set },
      { upsert: true, new: true }
    );

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_INTERNAL_MARK',
      entity: 'INTERNAL_MARK',
      entityId: row?._id?.toString() ?? null,
      details: {
        registerNumber: student.registerNumber,
        semesterNumber: sem.value,
        subjectCode: code.value,
        marks: provided,
      },
      req,
    });

    return sendSuccess(res, {
      mark: {
        id: row?._id?.toString(),
        semesterNumber: sem.value,
        subjectCode: code.value,
        subjectName: name.value,
        ia1: formatMark(row?.ia1),
        ia2: formatMark(row?.ia2),
        endSem: formatMark(row?.endSem),
        updatedByName: req.user!.fullName,
        updatedAt: (row as any)?.updatedAt,
      },
      permission,
    }, 'Mark saved.');
  } catch (err: any) {
    console.error('updateInternalMarks error:', err);
    return sendError(res, 'Unable to save the mark.', 500);
  }
}

// ---------------------------------------------------------------------------
// Correction requests (mentor raises, Admin decides)
// ---------------------------------------------------------------------------

export async function listMarkUpdateRequests(req: AuthRequest, res: Response) {
  try {
    // buildScopedStudentFilter() is shaped for Student.find() (_id / department /
    // registerNumber), but this collection is keyed by `student`. Resolve the
    // caller's scope to student ids first; an empty scope means Admin (no limit).
    const scopeFilter = await buildScopedStudentFilter(req.user);
    const filter: Record<string, any> = {};
    if (Object.keys(scopeFilter).length > 0) {
      const scoped = await Student.find(scopeFilter).select('_id').lean();
      filter.student = { $in: scoped.map((s: any) => s._id) };
    }
    const status = req.query.status;
    if (status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED') {
      filter.status = status;
    }
    const studentParam = req.query.studentId;
    if (typeof studentParam === 'string' && studentParam.trim() !== '') {
      const scoped = await loadAccessibleStudent(req.user, studentParam.trim());
      if (!scoped.student) return sendError(res, scoped.decision.message, scoped.decision.status);
      filter.student = scoped.student._id;
    }

    const requests = await MarkUpdateRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);

    return sendSuccess(res, {
      requests: requests.map((r: any) => ({
        id: r._id.toString(),
        studentId: String(r.student),
        registerNumber: r.registerNumber,
        studentName: r.studentName,
        semesterNumber: r.semesterNumber,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        markType: r.markType,
        markTypeLabel: MARK_TYPE_LABEL[r.markType as InternalMarkType] ?? r.markType,
        maxMarks: MARK_TYPE_MAX[r.markType as InternalMarkType] ?? null,
        existingMark: formatMark(r.existingMark),
        requestedMark: r.requestedMark,
        reason: r.reason,
        supportingNote: r.supportingNote || '',
        status: r.status,
        requestedBy: String(r.requestedBy ?? ''),
        requestedByName: r.requestedByName,
        requestedByRole: r.requestedByRole || '',
        requestedAt: r.requestedAt ?? r.createdAt,
        approvedByName: r.approvedByName || '',
        approvedAt: r.approvedAt ?? null,
        resolvedMark: formatMark(r.resolvedMark),
        rejectedByName: r.rejectedByName || '',
        rejectedAt: r.rejectedAt ?? null,
        rejectionReason: r.rejectionReason || '',
        createdAt: r.createdAt,
      })),
    });
  } catch (err: any) {
    console.error('listMarkUpdateRequests error:', err);
    return sendError(res, 'Unable to load mark update requests.', 500);
  }
}

export async function createMarkUpdateRequest(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role === ROLES.STUDENT) {
      return sendError(res, 'Students cannot raise mark update requests.', 403);
    }

    const body = req.body ?? {};
    const { student, decision } = await loadAccessibleStudent(
      req.user,
      String(body.studentId ?? '')
    );
    if (!student) return sendError(res, decision.message, decision.status);

    const errors: string[] = [];

    const sem = parseSemesterNumber(body.semesterNumber);
    if (!sem.ok) errors.push(sem.error!);

    const code = parseSubjectCode(body.subjectCode);
    if (!code.ok) errors.push(code.error!);

    const markType = body.markType;
    if (!isMarkType(markType)) {
      errors.push('Mark type must be IA1, IA2 or END_SEM.');
    }

    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    const type = markType as InternalMarkType;
    const requested = parseStrictNumber(body.requestedMark, {
      field: `Requested ${MARK_TYPE_LABEL[type]} mark`,
      min: 0,
      max: MARK_TYPE_MAX[type],
      required: true,
    });
    if (!requested.ok) errors.push(requested.error!);

    const reason = String(body.reason ?? '').trim();
    if (reason.length === 0) {
      errors.push('A reason is required for a mark update request.');
    } else if (reason.length < 5) {
      errors.push('The reason must be at least 5 characters.');
    } else if (reason.length > 1000) {
      errors.push('The reason must be at most 1000 characters.');
    }

    const supportingNote = String(body.supportingNote ?? '').trim();
    if (supportingNote.length > 1000) errors.push('The supporting note must be at most 1000 characters.');

    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    // The official row must already exist so the "existing mark" is a real,
    // stored value rather than something the client asserts.
    const official = await InternalMark.findOne({
      student: student._id,
      semesterNumber: sem.value,
      subjectCode: code.value,
    });
    if (!official) {
      return sendError(
        res,
        'No internal marks record exists for that subject. The mentor must enter the subject marks during an active mark-entry period first.',
        404
      );
    }

    const field = MARK_TYPE_FIELD[type];
    const existingMark = formatMark((official as any)[field]);

    if (existingMark !== null && existingMark === requested.value) {
      return sendError(
        res,
        `The requested mark equals the current mark (${existingMark}/${MARK_TYPE_MAX[type]}).`,
        400
      );
    }

    const duplicate = await MarkUpdateRequest.findOne({
      student: student._id,
      semesterNumber: sem.value,
      subjectCode: code.value,
      markType: type,
      status: 'PENDING',
    });
    if (duplicate) {
      return sendError(
        res,
        'A pending mark update request already exists for this subject and mark type.',
        409
      );
    }

    const now = new Date();
    const created = await MarkUpdateRequest.create({
      student: student._id,
      registerNumber: student.registerNumber,
      studentName: student.fullName,
      semesterNumber: sem.value,
      subjectCode: code.value,
      subjectName: official.subjectName,
      markType: type,
      existingMark,
      requestedMark: requested.value,
      reason,
      supportingNote: supportingNote || undefined,
      status: 'PENDING',
      requestedBy: req.user!.id,
      requestedByName: req.user!.fullName,
      requestedByRole: req.user!.role,
      requestedAt: now,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_MARK_UPDATE_REQUEST',
      entity: 'MARK_UPDATE_REQUEST',
      entityId: created._id.toString(),
      details: {
        registerNumber: student.registerNumber,
        semesterNumber: sem.value,
        subjectCode: code.value,
        markType: type,
        existingMark,
        requestedMark: requested.value,
        reason,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        request: {
          id: created._id.toString(),
          status: 'PENDING',
          existingMark,
          requestedMark: requested.value,
        },
      },
      'Mark update request submitted. The official mark is unchanged until an administrator approves it.',
      201
    );
  } catch (err: any) {
    console.error('createMarkUpdateRequest error:', err);
    return sendError(res, 'Unable to submit the mark update request.', 500);
  }
}

async function loadPendingRequest(req: AuthRequest, res: Response) {
  const requestId = String(req.params.requestId ?? '');
  if (!isValidId(requestId)) {
    sendError(res, 'Mark update request not found.', 404);
    return null;
  }
  const request = await MarkUpdateRequest.findById(requestId);
  if (!request) {
    sendError(res, 'Mark update request not found.', 404);
    return null;
  }
  if (request.status !== 'PENDING') {
    sendError(res, `This request has already been ${String(request.status).toLowerCase()}.`, 409);
    return null;
  }
  return request;
}

export async function approveMarkUpdateRequest(req: AuthRequest, res: Response) {
  try {
    if (!isAdmin(req)) return sendError(res, 'Only an administrator may approve mark update requests.', 403);

    const request = await loadPendingRequest(req, res);
    if (!request) return res;

    const type = request.markType as InternalMarkType;
    if (!isMarkType(type)) {
      return sendError(res, 'The stored request carries an unknown mark type and cannot be approved.', 400);
    }

    // Never trust the stored request blindly: re-validate against the hard
    // maximum before it can reach an official mark.
    const revalidated = parseStrictNumber(request.requestedMark, {
      field: `${MARK_TYPE_LABEL[type]} mark`,
      min: 0,
      max: MARK_TYPE_MAX[type],
      required: true,
    });
    if (!revalidated.ok) {
      return sendError(res, `The stored request failed validation: ${revalidated.error}`, 400);
    }

    const now = new Date();
    const field = MARK_TYPE_FIELD[type];

    const existingRow = await InternalMark.findOne({
      student: request.student,
      semesterNumber: request.semesterNumber,
      subjectCode: request.subjectCode,
    });
    const previousMark = existingRow ? formatMark((existingRow as any)[field]) : null;

    await InternalMark.findOneAndUpdate(
      {
        student: request.student,
        semesterNumber: request.semesterNumber,
        subjectCode: request.subjectCode,
      },
      {
        $set: {
          [field]: revalidated.value,
          registerNumber: request.registerNumber,
          subjectName: request.subjectName,
          updatedBy: req.user!.id,
          updatedByName: req.user!.fullName,
        },
      },
      { upsert: true, new: true }
    );

    await MarkUpdateRequest.findOneAndUpdate(
      { _id: request._id },
      {
        $set: {
          status: 'APPROVED',
          approvedBy: req.user!.id,
          approvedByName: req.user!.fullName,
          approvedAt: now,
          resolvedMark: revalidated.value,
        },
      }
    );

    await logAudit({
      userId: req.user!.id,
      action: 'APPROVE_MARK_UPDATE_REQUEST',
      entity: 'MARK_UPDATE_REQUEST',
      entityId: request._id.toString(),
      details: {
        registerNumber: request.registerNumber,
        semesterNumber: request.semesterNumber,
        subjectCode: request.subjectCode,
        markType: type,
        oldMark: previousMark,
        newMark: revalidated.value,
        requestedBy: request.requestedByName,
        reason: request.reason,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        request: {
          id: request._id.toString(),
          status: 'APPROVED',
          resolvedMark: revalidated.value,
          approvedByName: req.user!.fullName,
          approvedAt: now.toISOString(),
        },
      },
      'Mark update approved. The official mark has been changed.'
    );
  } catch (err: any) {
    console.error('approveMarkUpdateRequest error:', err);
    return sendError(res, 'Unable to approve the mark update request.', 500);
  }
}

export async function rejectMarkUpdateRequest(req: AuthRequest, res: Response) {
  try {
    if (!isAdmin(req)) return sendError(res, 'Only an administrator may reject mark update requests.', 403);

    const request = await loadPendingRequest(req, res);
    if (!request) return res;

    const rejectionReason = String(req.body?.rejectionReason ?? req.body?.reason ?? '').trim();
    if (rejectionReason.length === 0) {
      return sendError(res, 'A rejection reason is required.', 400);
    }
    if (rejectionReason.length > 1000) {
      return sendError(res, 'The rejection reason must be at most 1000 characters.', 400);
    }

    const now = new Date();
    // The official mark is deliberately NOT touched on rejection.
    await MarkUpdateRequest.findOneAndUpdate(
      { _id: request._id },
      {
        $set: {
          status: 'REJECTED',
          rejectedBy: req.user!.id,
          rejectedByName: req.user!.fullName,
          rejectedAt: now,
          rejectionReason,
        },
      }
    );

    await logAudit({
      userId: req.user!.id,
      action: 'REJECT_MARK_UPDATE_REQUEST',
      entity: 'MARK_UPDATE_REQUEST',
      entityId: request._id.toString(),
      details: {
        registerNumber: request.registerNumber,
        subjectCode: request.subjectCode,
        markType: request.markType,
        existingMark: formatMark(request.existingMark),
        requestedMark: request.requestedMark,
        requestedBy: request.requestedByName,
        rejectionReason,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        request: {
          id: request._id.toString(),
          status: 'REJECTED',
          rejectedByName: req.user!.fullName,
          rejectedAt: now.toISOString(),
          rejectionReason,
        },
      },
      'Mark update request rejected. The official mark is unchanged.'
    );
  } catch (err: any) {
    console.error('rejectMarkUpdateRequest error:', err);
    return sendError(res, 'Unable to reject the mark update request.', 500);
  }
}
