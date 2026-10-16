/**
 * STUDENT BULK ACTIONS
 * ---------------------------------------------------------------------------
 * Server side of the Student Master bulk toolbar: select-all id resolution,
 * safe bulk delete, and bulk document download.
 *
 * Authorisation mirrors the single-record endpoints exactly:
 *   - ADMIN  -> every student.
 *   - HOD    -> only students inside the caller's own department.
 *   - any other role -> 403 (enforced by the route's `authorize(...)`), and the
 *     per-record department check below is re-applied even for an HOD payload,
 *     so a forged list of ids can never delete/download out of scope.
 *
 * Nothing here trusts the frontend: every id is validated, every record is
 * re-fetched, and every permission decision is re-derived on the server.
 */
import { Response } from 'express';
import fs from 'fs';
import {
  Student,
  StudentDocument,
  Department,
  Batch,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import { checkStudentAccess } from '../../utils/access.util.js';
import { isValidId } from '../../services/localId.js';
import { cascadeDeleteStudent } from './student.controller.js';
import { resolveServedDocumentPath } from '../documents/document.controller.js';
import {
  BULK_DOCUMENT_LIMITS,
  bulkArchiveFileName,
  buildManifestCsv,
  createArchive,
  uniqueName,
  type BulkArchiveEntry,
  type BulkManifestRow,
} from '../../services/bulk-documents.service.js';

/** Upper bound on ids returned by the "Select All" helper. */
const MAX_SELECTION_IDS = 5000;

/**
 * Department scope for the caller, mirroring `getStudents`. ADMIN is
 * unrestricted; HOD is pinned to its own department.
 */
function studentScopeFilter(user: AuthRequest['user']): Record<string, any> {
  if (user?.role === ROLES.HOD && user.departmentId) {
    return { department: user.departmentId };
  }
  return {};
}

/** Build the same filtered student query the directory uses (ADMIN/HOD view). */
async function buildStudentFilter(
  user: AuthRequest['user'],
  query: Record<string, any>
): Promise<Record<string, any>> {
  const filter: Record<string, any> = { ...studentScopeFilter(user) };
  const { search, departmentId, batchId, isActive } = query;

  if (departmentId) {
    if (isValidId(String(departmentId))) {
      filter.department = departmentId;
    } else {
      const d = await Department.findOne({
        $or: [{ code: String(departmentId).toUpperCase() }, { name: String(departmentId) }],
      });
      if (d) filter.department = d._id;
    }
  }
  if (batchId) {
    if (isValidId(String(batchId))) {
      filter.batch = batchId;
    } else {
      const b = await Batch.findOne({ name: String(batchId) });
      if (b) filter.batch = b._id;
    }
  }
  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === '1';
  }
  if (search && String(search).trim() !== '') {
    const regex = new RegExp(String(search).trim(), 'i');
    filter.$or = [{ fullName: regex }, { registerNumber: regex }, { email: regex }];
  }
  return filter;
}

/** Normalise and validate the `ids` payload shared by delete/download. */
function parseIds(body: any): { ids: string[] } | { error: string } {
  const raw = body?.ids;
  if (!Array.isArray(raw)) {
    return { error: 'A list of student ids is required.' };
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
    return { error: 'Select at least one student.' };
  }
  if (ids.length > BULK_DOCUMENT_LIMITS.maxRecords) {
    return {
      error: `Too many records selected (${ids.length}). The maximum for one bulk action is ${BULK_DOCUMENT_LIMITS.maxRecords}.`,
    };
  }
  return { ids };
}

/**
 * GET /api/students/selection/ids
 * Every id matching the current filter within the caller's scope, so the
 * frontend "Select All" can select the whole eligible set (not just the page).
 */
export async function getStudentSelectionIds(req: AuthRequest, res: Response) {
  try {
    const filter = await buildStudentFilter(req.user, req.query as Record<string, any>);
    const rows = await Student.find(filter);
    const total = rows.length;
    if (total > MAX_SELECTION_IDS) {
      return sendError(
        res,
        `Too many matching students (${total}) to select at once. Narrow the filters.`,
        413
      );
    }
    return sendSuccess(res, {
      ids: rows.map((s: any) => s._id.toString()),
      total,
    });
  } catch (err: any) {
    console.error('getStudentSelectionIds error:', err);
    return sendError(res, 'Failed to resolve the selectable student set.', 500);
  }
}

/**
 * POST /api/students/bulk-delete
 * Deletes the selected students, one at a time, reporting per-record outcomes
 * so a single bad/forbidden id never aborts the whole batch.
 */
export async function bulkDeleteStudents(req: AuthRequest, res: Response) {
  const parsed = parseIds(req.body);
  if ('error' in parsed) {
    return sendError(res, parsed.error, 400);
  }

  const deleted: Array<{ id: string; registerNumber: string; fullName: string }> = [];
  const failed: Array<{ id: string; registerNumber?: string; fullName?: string; reason: string }> = [];

  for (const id of parsed.ids) {
    try {
      if (!isValidId(id)) {
        failed.push({ id, reason: 'Invalid student reference.' });
        continue;
      }
      const student: any = await Student.findById(id);
      if (!student) {
        failed.push({ id, reason: 'Student profile not found.' });
        continue;
      }

      // Re-check scope per record: HOD may only touch its own department.
      const access = await checkStudentAccess(req.user, student);
      if (!access.allowed) {
        failed.push({
          id,
          registerNumber: student.registerNumber,
          fullName: student.fullName,
          reason: access.message || 'Not authorised for this student.',
        });
        continue;
      }

      const info = await cascadeDeleteStudent(student);
      await logAudit({
        userId: req.user!.id,
        action: 'DELETE_STUDENT',
        entity: 'STUDENT',
        entityId: info.studentId.toString(),
        details: { registerNumber: info.registerNumber, fullName: info.fullName, bulk: true },
        req,
      });
      deleted.push({
        id: info.studentId.toString(),
        registerNumber: info.registerNumber,
        fullName: info.fullName,
      });
    } catch (err: any) {
      console.error(`bulkDeleteStudents failed for ${id}:`, err);
      failed.push({ id, reason: err?.message || 'Deletion failed.' });
    }
  }

  const summary = { requested: parsed.ids.length, deleted: deleted.length, failed: failed.length };
  const message =
    failed.length === 0
      ? `${deleted.length} student record(s) and all associated records deleted permanently.`
      : `${deleted.length} of ${parsed.ids.length} student record(s) deleted; ${failed.length} could not be deleted.`;

  return sendSuccess(res, { deleted, failed, summary }, message);
}

/**
 * POST /api/students/bulk-documents
 * Streams a ZIP of every document belonging to the selected students.
 *
 * Watermarked copies are served exactly as the single-document download does
 * (the existing download policy); the ORIGINAL uploads on disk are never
 * modified. When nothing is eligible the endpoint answers with a clear JSON
 * message instead of an empty or misleading archive.
 */
export async function bulkDownloadStudentDocuments(req: AuthRequest, res: Response) {
  const parsed = parseIds(req.body);
  if ('error' in parsed) {
    return sendError(res, parsed.error, 400);
  }

  try {
    const entries: BulkArchiveEntry[] = [];
    const manifest: BulkManifestRow[] = [];
    const usedByFolder = new Map<string, Set<string>>();
    let totalBytes = 0;

    for (const id of parsed.ids) {
      if (!isValidId(id)) {
        manifest.push({
          recordType: 'Student',
          identifier: id,
          name: '',
          documentTitle: '',
          fileName: '',
          status: 'NOT_FOUND',
          note: 'Invalid student reference.',
        });
        continue;
      }

      const student: any = await Student.findById(id);
      if (!student) {
        manifest.push({
          recordType: 'Student',
          identifier: id,
          name: '',
          documentTitle: '',
          fileName: '',
          status: 'NOT_FOUND',
          note: 'Student profile not found.',
        });
        continue;
      }

      const label = `${student.fullName || 'Student'}_${student.registerNumber || id}`;
      const access = await checkStudentAccess(req.user, student);
      if (!access.allowed) {
        manifest.push({
          recordType: 'Student',
          identifier: student.registerNumber || id,
          name: student.fullName || '',
          documentTitle: '',
          fileName: '',
          status: 'NOT_AUTHORIZED',
          note: access.message || 'Not authorised for this student.',
        });
        continue;
      }

      const docs = await StudentDocument.find({ studentId: student._id }).sort({
        isPrimary: -1,
        uploadedAt: -1,
      });

      if (docs.length === 0) {
        manifest.push({
          recordType: 'Student',
          identifier: student.registerNumber || id,
          name: student.fullName || '',
          documentTitle: '',
          fileName: '',
          status: 'NO_DOCUMENTS',
          note: 'No documents on file.',
        });
        continue;
      }

      const folder = ['Students', label];
      const folderKey = folder.join('/');
      let used = usedByFolder.get(folderKey);
      if (!used) {
        used = new Set<string>();
        usedByFolder.set(folderKey, used);
      }

      for (const doc of docs as any[]) {
        const servedPath = await resolveServedDocumentPath(doc);
        if (!servedPath || !fs.existsSync(servedPath)) {
          manifest.push({
            recordType: 'Student',
            identifier: student.registerNumber || id,
            name: student.fullName || '',
            documentTitle: doc.title || '',
            fileName: doc.fileName || '',
            status: 'FILE_MISSING',
            note: 'Stored file is not present on the server.',
          });
          continue;
        }

        let data: Buffer;
        try {
          data = await fs.promises.readFile(servedPath);
        } catch (err: any) {
          manifest.push({
            recordType: 'Student',
            identifier: student.registerNumber || id,
            name: student.fullName || '',
            documentTitle: doc.title || '',
            fileName: doc.fileName || '',
            status: 'FILE_MISSING',
            note: `Could not read the stored file: ${err?.message || 'unknown error'}.`,
          });
          continue;
        }

        totalBytes += data.length;
        if (totalBytes > BULK_DOCUMENT_LIMITS.maxTotalBytes) {
          return sendError(
            res,
            'The selected documents exceed the bulk download size limit. Download in smaller batches.',
            413
          );
        }

        const fileName = uniqueName(doc.fileName || `${doc.title || 'document'}.pdf`, used);
        entries.push({ folder, fileName, data });
        manifest.push({
          recordType: 'Student',
          identifier: student.registerNumber || id,
          name: student.fullName || '',
          documentTitle: doc.title || doc.fileName || '',
          fileName,
          status: 'INCLUDED',
          note: '',
        });
      }
    }

    if (entries.length === 0) {
      const missing = manifest.filter((m) => m.status !== 'INCLUDED');
      const anyDocsElsewhere = missing.some((m) => m.status === 'FILE_MISSING');
      return sendSuccess(
        res,
        { hasDocuments: false, downloaded: 0, missing },
        anyDocsElsewhere
          ? 'The selected records have document entries, but none of the stored files could be read.'
          : 'None of the selected records have any documents to download.'
      );
    }

    const zip = createArchive(entries);
    zip.file('manifest.csv', buildManifestCsv(manifest));

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${bulkArchiveFileName()}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');

    const stream = zip.generateNodeStream({
      type: 'nodebuffer',
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    stream.on('error', (err: Error) => {
      console.error('bulkDownloadStudentDocuments stream error:', err);
      res.destroy(err);
    });
    stream.pipe(res);
    return undefined;
  } catch (err: any) {
    console.error('bulkDownloadStudentDocuments error:', err);
    if (!res.headersSent) {
      return sendError(res, 'Failed to build the bulk document archive.', 500);
    }
    return undefined;
  }
}
