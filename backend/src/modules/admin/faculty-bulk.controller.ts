/**
 * FACULTY / MENTOR BULK ACTIONS
 * ---------------------------------------------------------------------------
 * Server side of the Faculty / Mentors bulk toolbar. A Faculty record IS the
 * mentor record in this data model (a mentor is a Faculty member with an ACTIVE
 * MentorAssignment), so one bulk action covers both — exactly as the existing
 * "Faculty / Mentors" screen does.
 *
 * Authorisation mirrors `deleteFaculty` plus department scoping:
 *   - ADMIN -> every faculty member.
 *   - HOD   -> only faculty inside the caller's own department.
 *   - any other role -> 403.
 *
 * Document download: this application has NO faculty/mentor document store
 * (only students have uploaded documents), so the endpoint answers with an
 * explicit "no documents available" result rather than an empty ZIP.
 */
import { Response } from 'express';
import { Faculty } from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import { isValidId } from '../../services/localId.js';
import { toIdString } from '../../utils/access.util.js';
import { cascadeDeleteFaculty } from './admin.controller.js';
import {
  BULK_DOCUMENT_LIMITS,
  type BulkManifestRow,
} from '../../services/bulk-documents.service.js';

const MAX_SELECTION_IDS = 2000;

/** Department scope for the caller, mirroring `getFacultyList`. */
function facultyScopeFilter(user: AuthRequest['user']): Record<string, any> {
  if (user?.role === ROLES.HOD && user.departmentId) {
    return { department: user.departmentId };
  }
  return {};
}

/** Normalise and validate the `ids` payload shared by delete/download. */
function parseIds(body: any): { ids: string[] } | { error: string } {
  const raw = body?.ids;
  if (!Array.isArray(raw)) {
    return { error: 'A list of faculty ids is required.' };
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ids.push(trimmed);
  }
  if (ids.length === 0) {
    return { error: 'Select at least one faculty member.' };
  }
  if (ids.length > BULK_DOCUMENT_LIMITS.maxRecords) {
    return {
      error: `Too many records selected (${ids.length}). The maximum for one bulk action is ${BULK_DOCUMENT_LIMITS.maxRecords}.`,
    };
  }
  return { ids };
}

/**
 * GET /api/admin/faculty/selection/ids
 * Every faculty id within the caller's scope, for the "Select All" action.
 */
export async function getFacultySelectionIds(req: AuthRequest, res: Response) {
  try {
    const filter = facultyScopeFilter(req.user);
    const rows = await Faculty.find(filter);
    const total = rows.length;
    if (total > MAX_SELECTION_IDS) {
      return sendError(res, `Too many faculty members (${total}) to select at once.`, 413);
    }
    return sendSuccess(res, {
      ids: rows.map((f: any) => f._id.toString()),
      total,
    });
  } catch (err: any) {
    console.error('getFacultySelectionIds error:', err);
    return sendError(res, 'Failed to resolve the selectable faculty set.', 500);
  }
}

/**
 * POST /api/admin/faculty/bulk-delete
 * Deletes the selected faculty members with per-record results and department
 * scoping, so an out-of-scope id can never be removed.
 */
export async function bulkDeleteFaculty(req: AuthRequest, res: Response) {
  const parsed = parseIds(req.body);
  if ('error' in parsed) {
    return sendError(res, parsed.error, 400);
  }

  const deleted: Array<{ id: string; employeeId: string; fullName: string }> = [];
  const failed: Array<{ id: string; employeeId?: string; fullName?: string; reason: string }> = [];

  for (const id of parsed.ids) {
    try {
      if (!isValidId(id)) {
        failed.push({ id, reason: 'Invalid faculty reference.' });
        continue;
      }
      const faculty: any = await Faculty.findById(id).populate('user', 'fullName email');
      if (!faculty) {
        failed.push({ id, reason: 'Faculty member not found.' });
        continue;
      }

      // HOD may only delete faculty inside its own department.
      if (
        req.user?.role === ROLES.HOD &&
        toIdString(faculty.department) !== toIdString(req.user.departmentId)
      ) {
        failed.push({
          id,
          employeeId: faculty.employeeId,
          fullName: (faculty.user as any)?.fullName || faculty.employeeId,
          reason: 'Outside your department.',
        });
        continue;
      }

      const info = await cascadeDeleteFaculty(faculty);
      await logAudit({
        userId: req.user!.id,
        action: 'DELETE_FACULTY',
        entity: 'FACULTY',
        entityId: info.facultyId.toString(),
        details: { employeeId: info.employeeId, fullName: info.fullName, bulk: true },
        req,
      });
      deleted.push({
        id: info.facultyId.toString(),
        employeeId: info.employeeId,
        fullName: info.fullName,
      });
    } catch (err: any) {
      console.error(`bulkDeleteFaculty failed for ${id}:`, err);
      failed.push({ id, reason: err?.message || 'Deletion failed.' });
    }
  }

  const summary = { requested: parsed.ids.length, deleted: deleted.length, failed: failed.length };
  const message =
    failed.length === 0
      ? `${deleted.length} faculty record(s) deleted permanently. Associated assignments terminated.`
      : `${deleted.length} of ${parsed.ids.length} faculty record(s) deleted; ${failed.length} could not be deleted.`;

  return sendSuccess(res, { deleted, failed, summary }, message);
}

/**
 * POST /api/admin/faculty/bulk-documents
 *
 * Faculty / mentor records have no attached documents in this application, so
 * there is never anything to archive. The endpoint still validates the
 * selection and the caller's scope, then reports the outcome explicitly instead
 * of returning an empty or misleading ZIP.
 */
export async function bulkDownloadFacultyDocuments(req: AuthRequest, res: Response) {
  const parsed = parseIds(req.body);
  if ('error' in parsed) {
    return sendError(res, parsed.error, 400);
  }

  const missing: BulkManifestRow[] = [];
  for (const id of parsed.ids) {
    if (!isValidId(id)) {
      missing.push({
        recordType: 'Faculty',
        identifier: id,
        name: '',
        documentTitle: '',
        fileName: '',
        status: 'NOT_FOUND',
        note: 'Invalid faculty reference.',
      });
      continue;
    }
    const faculty: any = await Faculty.findById(id).populate('user', 'fullName');
    if (!faculty) {
      missing.push({
        recordType: 'Faculty',
        identifier: id,
        name: '',
        documentTitle: '',
        fileName: '',
        status: 'NOT_FOUND',
        note: 'Faculty member not found.',
      });
      continue;
    }
    if (
      req.user?.role === ROLES.HOD &&
      toIdString(faculty.department) !== toIdString(req.user.departmentId)
    ) {
      missing.push({
        recordType: 'Faculty',
        identifier: faculty.employeeId,
        name: (faculty.user as any)?.fullName || '',
        documentTitle: '',
        fileName: '',
        status: 'NOT_AUTHORIZED',
        note: 'Outside your department.',
      });
      continue;
    }
    missing.push({
      recordType: 'Faculty',
      identifier: faculty.employeeId,
      name: (faculty.user as any)?.fullName || '',
      documentTitle: '',
      fileName: '',
      status: 'NO_DOCUMENTS',
      note: 'Faculty / mentor records do not have attached documents in this system.',
    });
  }

  return sendSuccess(
    res,
    { hasDocuments: false, downloaded: 0, missing },
    'Faculty / mentor records do not have attached documents in this system, so there is nothing to download.'
  );
}
