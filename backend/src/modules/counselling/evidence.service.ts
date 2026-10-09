/**
 * MENTORING EVIDENCE SERVICE
 * ============================================================================
 * TEMPORARY LOCAL FILE STORAGE — replace with a persistent storage
 * implementation before production deployment.
 *
 * One physical photo per `MentoringEvidence` record. Mentoring records,
 * Saturday meetings and every participating student reference that one record
 * by id, so the same photo is never copied per student.
 *
 * Canonical storage: `backend/storage/uploads/counselling/`, resolved through the
 * ONE shared helper (`resolveWritableUploadsDir` / `locateStoredUpload`) that
 * every other upload path in this project uses. No second upload directory is
 * created anywhere in this module.
 *
 * Order of operations is deliberate and load-bearing:
 *   1. compress every image in RAM -> nothing is written if any fails
 *   2. only then write to disk and create the records
 * That way a rejected multi-photo upload leaves no orphan files behind.
 */

import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import {
  MentoringEvidence,
  CounsellingRecord,
  Meeting,
  Student,
  Faculty,
  type IMentoringEvidence,
  type MentoringEvidenceRef,
} from '../../models/index.js';
import { resolveWritableUploadsDir, locateStoredUpload } from '../../config/storage.js';
import {
  compressEvidenceImage,
  isAcceptedEvidenceMime,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_UPLOAD_BYTES,
  EvidenceCompressionError,
} from '../../services/evidence-image.service.js';
import { newLocalId, toLocalId } from '../../services/localId.js';
import { isValidId } from '../../services/localId.js';
import { checkStudentAccess } from '../../utils/access.util.js';
import { ROLES } from '../../config/constants.js';
import type { AuthUser } from '../../middleware/auth.middleware.js';

/** Sub-directory inside the canonical uploads root. */
export const EVIDENCE_UPLOAD_SUBDIR = 'counselling';

/**
 * Resolved lazily (never at import time) so a test that sets `UPLOADS_DIR`
 * before booting the app still gets its own sandbox, and so a read-only host
 * can fall back without crashing the process at require() time — the exact
 * failure that used to take the whole API down on Render.
 */
export function evidenceUploadsDir(): string {
  return resolveWritableUploadsDir(EVIDENCE_UPLOAD_SUBDIR);
}

/** Max photos per single submission. */
export const MAX_EVIDENCE_FILES = 12;

/**
 * Multer middleware. `memoryStorage` is used on purpose: compression happens
 * in RAM and a file that cannot be reduced is rejected WITHOUT ever touching
 * the disk. A disk-storage upload would leave an oversized orphan behind.
 */
export const evidenceUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EVIDENCE_UPLOAD_BYTES,
    files: MAX_EVIDENCE_FILES,
  },
  fileFilter: (_req, file, cb) => {
    if (isAcceptedEvidenceMime(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported file format. Mentoring evidence must be a JPG, PNG or WebP photo.'));
  },
});

export interface EvidenceUploadInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface StoreEvidenceOptions {
  files: EvidenceUploadInput[];
  mentorId?: string | null;
  mentorName?: string;
  context: 'INDIVIDUAL' | 'SATURDAY_MEETING';
  evidenceGroupId?: string | null;
  meetingId?: string | null;
  studentIds: string[];
}

export interface StoredEvidence {
  evidenceId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export class EvidenceValidationError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, code = 'EVIDENCE_REJECTED', status = 400) {
    super(message);
    this.name = 'EvidenceValidationError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Route wrapper around the multer middleware.
 *
 * A raw `LIMIT_FILE_SIZE` / bad-MIME error has no HTTP status, so it would reach
 * the global handler and be reported to the mentor as a generic 500. This turns
 * those into an actionable 400 with the real reason.
 */
export function evidenceUploadArray(field: string) {
  const middleware = evidenceUploadMiddleware.array(field);
  return (req: any, res: any, next: any) => {
    middleware(req, res, (err: any) => {
      if (!err) return next();
      const message =
        err?.code === 'LIMIT_FILE_SIZE'
          ? `Each mentoring evidence photo must be ${Math.round(MAX_EVIDENCE_UPLOAD_BYTES / (1024 * 1024))} MB or smaller before compression.`
          : err?.code === 'LIMIT_FILE_COUNT'
            ? `A maximum of ${MAX_EVIDENCE_FILES} evidence photos may be uploaded at once.`
            : err?.message || 'The evidence photos could not be read.';
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message,
        meta: { timestamp: new Date().toISOString() },
      });
    });
  };
}

function evidenceFileName(evidenceId: string): string {
  return `mentor-evidence-${evidenceId}.jpg`;
}

/**
 * Validate + compress every photo, then write them. Returns one
 * `MentoringEvidence` record per photo.
 *
 * Throws `EvidenceValidationError` (400/422) for an
 * uncompressible image. Nothing is written unless ALL photos succeed.
 */
export async function storeEvidenceUploads(options: StoreEvidenceOptions): Promise<StoredEvidence[]> {
  const { files, mentorId, mentorName, context, evidenceGroupId, meetingId, studentIds } = options;

  if (!Array.isArray(files) || files.length === 0) {
    throw new EvidenceValidationError('No evidence photo was received. Please attach at least one photo.');
  }
  if (files.length > MAX_EVIDENCE_FILES) {
    throw new EvidenceValidationError(`A maximum of ${MAX_EVIDENCE_FILES} evidence photos may be uploaded at once.`);
  }

  // ---- 1. Compress every image in RAM. A failure aborts the whole request ---
  const compressed: Awaited<ReturnType<typeof compressEvidenceImage>>[] = [];
  for (let i = 0; i < files.length; i += 1) {
    try {
      compressed.push(await compressEvidenceImage(files[i].buffer, `Evidence photo ${i + 1}`));
    } catch (err: any) {
      if (err instanceof EvidenceCompressionError) {
        throw new EvidenceValidationError(err.message, 'EVIDENCE_NOT_COMPRESSIBLE', 422);
      }
      throw new EvidenceValidationError(
        `Evidence photo ${i + 1} could not be processed. Please re-take the photo and try again.`,
        'EVIDENCE_NOT_COMPRESSIBLE',
        422
      );
    }
  }

  // ---- 2. Only now write to the canonical uploads directory ----------------
  const dir = evidenceUploadsDir();
  const written: { evidenceId: string; absolutePath: string; fileUrl: string }[] = [];
  const nowIso = new Date().toISOString();

  try {
    for (let i = 0; i < compressed.length; i += 1) {
      const evidenceId = newLocalId();
      const fileName = evidenceFileName(evidenceId);
      const absolutePath = path.join(dir, fileName);
      fs.writeFileSync(absolutePath, compressed[i].buffer);

      // Defence in depth: prove the bytes actually on disk satisfy the ceiling.
      const onDisk = fs.statSync(absolutePath).size;
      if (onDisk > MAX_EVIDENCE_BYTES) {
        throw new EvidenceValidationError(
          `Evidence photo ${i + 1} could not be stored within the ${Math.round(MAX_EVIDENCE_BYTES / 1024)} KB limit.`,
          'EVIDENCE_TOO_LARGE',
          422
        );
      }

      written.push({ evidenceId, absolutePath, fileUrl: `/uploads/${EVIDENCE_UPLOAD_SUBDIR}/${fileName}` });
    }
  } catch (err) {
    // Roll back: never leave a partial set on disk.
    for (const item of written) {
      try {
        if (fs.existsSync(item.absolutePath)) fs.unlinkSync(item.absolutePath);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }

  // ---- 3. Create one evidence record per physical file --------------------
  const stored: StoredEvidence[] = [];
  const createdDocs: IMentoringEvidence[] = [];
  try {
    for (let i = 0; i < written.length; i += 1) {
      const doc = await MentoringEvidence.create({
        evidenceId: written[i].evidenceId,
        fileUrl: written[i].fileUrl,
        fileName: evidenceFileName(written[i].evidenceId),
        fileSize: compressed[i].bytes,
        fileType: compressed[i].format,
        uploadedBy: mentorId ? toLocalId(mentorId) : undefined,
        uploadedByName: mentorName || '',
        context,
        evidenceGroupId: evidenceGroupId || undefined,
        meetingId: meetingId ? toLocalId(meetingId) : undefined,
        students: studentIds.map((s) => String(s)),
        compression: {
          quality: compressed[i].quality,
          width: compressed[i].width,
          height: compressed[i].height,
          attempts: compressed[i].attempts,
          resized: compressed[i].resized,
          maxBytes: MAX_EVIDENCE_BYTES,
        },
      });
      createdDocs.push(doc);
      stored.push({
        evidenceId: written[i].evidenceId,
        fileUrl: written[i].fileUrl,
        fileName: evidenceFileName(written[i].evidenceId),
        fileSize: compressed[i].bytes,
        fileType: compressed[i].format,
      });
    }
  } catch (err) {
    // The files are already referenced by nothing, so remove them again rather
    // than leave unreferenced bytes in the evidence directory.
    for (const item of written) {
      try {
        if (fs.existsSync(item.absolutePath)) fs.unlinkSync(item.absolutePath);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }

  return stored;
}

/** Normalise the evidence reference list stored on a record. */
export function normaliseEvidenceRefs(value: any, addedBy?: string): MentoringEvidenceRef[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: MentoringEvidenceRef[] = [];
  for (const entry of list) {
    const id =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object'
          ? String(entry.evidenceId || '')
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      evidenceId: id,
      addedAt: new Date().toISOString(),
      addedBy: addedBy || '',
    });
  }
  return out;
}

/** Append evidence refs, never replacing the ones already on the record. */
export function appendEvidenceRefs(
  existing: any,
  additions: Array<string | MentoringEvidenceRef>,
  addedBy?: string
): MentoringEvidenceRef[] {
  const current: MentoringEvidenceRef[] = normaliseEvidenceRefs(existing).map((ref) => ({
    evidenceId: ref.evidenceId,
    addedAt: ref.addedAt || new Date().toISOString(),
    addedBy: ref.addedBy || addedBy || '',
  }));
  const byId = new Map<string, MentoringEvidenceRef>(current.map((ref) => [ref.evidenceId, ref]));
  for (const addition of additions) {
    const id = typeof addition === 'string' ? addition : addition?.evidenceId;
    if (!id || byId.has(id)) continue;
    const ref: MentoringEvidenceRef = {
      evidenceId: id,
      addedAt: new Date().toISOString(),
      addedBy: addedBy || '',
    };
    byId.set(id, ref);
    current.push(ref);
  }
  return Array.from(byId.values());
}

/** Remove the given evidence ids from a ref list. Returns the new list. */
export function removeEvidenceRefs(existing: any, removals: string[]): MentoringEvidenceRef[] {
  const drop = new Set(removals.map((r) => String(r)));
  return normaliseEvidenceRefs(existing).filter((ref) => !drop.has(ref.evidenceId));
}

/**
 * How many records still reference each evidence id, across BOTH the mentoring
 * records and the Saturday meetings. Used before deleting a physical file so a
 * shared Saturday photo is never removed while another student still points at
 * it.
 */
export async function countEvidenceReferences(evidenceIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const ids = evidenceIds.map((id) => String(id));
  if (ids.length === 0) return counts;
  for (const id of ids) counts.set(id, 0);

  const records = await CounsellingRecord.find({
    evidence: { $elemMatch: { evidenceId: { $in: ids } } },
  })
    .select('evidence')
    .lean();

  for (const record of records) {
    for (const ref of record.evidence || []) {
      if (counts.has(ref.evidenceId)) counts.set(ref.evidenceId, (counts.get(ref.evidenceId) as number) + 1);
    }
  }

  const meetings = await Meeting.find({ evidence: { $elemMatch: { evidenceId: { $in: ids } } } })
    .select('evidence')
    .lean();

  for (const meeting of meetings) {
    for (const ref of meeting.evidence || []) {
      if (counts.has(ref.evidenceId)) counts.set(ref.evidenceId, (counts.get(ref.evidenceId) as number) + 1);
    }
  }

  return counts;
}

/** Resolve the stored bytes for one evidence record through the shared resolver. */
export function resolveEvidenceFile(evidence: any): string | null {
  if (!evidence?.fileUrl) return null;
  return (
    locateStoredUpload(evidence.fileUrl, {
      fileName: evidence.fileName,
      fileSize: evidence.fileSize,
      fileType: evidence.fileType,
    })?.path ?? null
  );
}

/**
 * Delete the physical file and the evidence record — but only when NOTHING
 * references it any more. Returns what was actually done, so the response never
 * overstates the deletion.
 */
export async function deleteUnreferencedEvidence(
  evidenceIds: string[]
): Promise<{ removed: string[]; retained: Array<{ evidenceId: string; references: number }> }> {
  const removed: string[] = [];
  const retained: Array<{ evidenceId: string; references: number }> = [];
  const counts = await countEvidenceReferences(evidenceIds);

  for (const evidenceId of evidenceIds) {
    const remaining = counts.get(evidenceId) ?? 0;
    if (remaining > 0) {
      retained.push({ evidenceId, references: remaining });
      continue;
    }
    const evidence = await MentoringEvidence.findOne({ evidenceId });
    if (evidence) {
      const filePath = resolveEvidenceFile(evidence);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          retained.push({ evidenceId, references: 0 });
          continue;
        }
      }
      await MentoringEvidence.deleteOne({ evidenceId } as any);
      removed.push(evidenceId);
    }
  }

  return { removed, retained };
}

/** API shape for one evidence photo. */
export function toEvidenceView(evidence: any) {
  return {
    evidenceId: String(evidence.evidenceId),
    fileName: evidence.fileName || '',
    fileSize: evidence.fileSize ?? null,
    fileType: evidence.fileType || 'image/jpeg',
    // Authenticated, ownership-checked file endpoint. `/uploads` is NOT a public
    // static mount in this project, so a raw `<img src>` cannot be used.
    fileUrl: `/api/counselling/evidence/${encodeURIComponent(String(evidence.evidenceId))}/file`,
    downloadUrl: `/api/counselling/evidence/${encodeURIComponent(String(evidence.evidenceId))}/download`,
    storedPath: evidence.fileUrl,
    uploadedAt: evidence.updatedAt || evidence.createdAt || null,
    context: evidence.context || 'INDIVIDUAL',
    evidenceGroupId: evidence.evidenceGroupId || null,
    meetingId: evidence.meetingId ? String((evidence.meetingId as any)._id ?? evidence.meetingId) : null,
    capturedBy: evidence.uploadedByName || '',
    linkedStudents: Array.isArray(evidence.students) ? evidence.students.length : 0,
    compression: evidence.compression || null,
  };
}

/** Load and shape several evidence records in one pass. */
export async function buildEvidenceViews(evidenceIds: string[]): Promise<any[]> {
  const ids = Array.from(new Set(evidenceIds.map((id) => String(id)).filter(Boolean)));
  if (ids.length === 0) return [];
  const docs = await MentoringEvidence.find({ evidenceId: { $in: ids } }).lean();
  const byId = new Map(docs.map((doc: any) => [String(doc.evidenceId), doc]));
  const views: any[] = [];
  for (const id of ids) {
    const doc = byId.get(id);
    if (doc) views.push(toEvidenceView(doc));
  }
  return views;
}

/**
 * Read authorisation for one evidence photo.
 *
 * A photo is visible to a caller who is authorised for AT LEAST ONE of the
 * students it is linked to. A Saturday photo is shared by every participant, so
 * any one of them being in scope is the correct answer — and nobody outside the
 * participating students' mentor/department scope can reach it.
 */
export async function assertEvidenceAccess(
  user: AuthUser | undefined,
  evidence: any
): Promise<{ allowed: boolean; status: number; message: string }> {
  if (!user) return { allowed: false, status: 401, message: 'Authentication required.' };
  if (!evidence) return { allowed: false, status: 404, message: 'Evidence photo not found.' };
  if (user.role === ROLES.ADMIN) return { allowed: true, status: 200, message: '' };

  const studentIds: string[] = Array.isArray(evidence.students) ? evidence.students.map((s: any) => String(s)) : [];
  if (studentIds.length === 0) {
    return {
      allowed: false,
      status: 403,
      message: 'Access denied: this evidence photo is not linked to any student record.',
    };
  }

  for (const studentId of studentIds) {
    let student: any = null;
    if (isValidId(studentId)) student = await Student.findById(studentId);
    if (!student) student = await Student.findOne({ registerNumber: String(studentId).toUpperCase() });
    if (!student) continue;
    const decision = await checkStudentAccess(user, student);
    if (decision.allowed) return { allowed: true, status: 200, message: '' };
  }

  return {
    allowed: false,
    status: 403,
    message: 'Access denied: you are not the assigned mentor for any student linked to this evidence photo.',
  };
}

/**
 * Resolve the Faculty document for the caller, used to stamp `uploadedBy` on the
 * evidence so "who captured this photo" survives independently of the record.
 */
export async function resolveUploaderFaculty(user: AuthUser | undefined): Promise<{ id: string; name: string } | null> {
  if (!user || user.role === ROLES.STUDENT) return null;
  const raw = user.facultyId;
  if (!raw) {
    if (user.role === ROLES.ADMIN) return { id: String(user.id), name: user.fullName || 'Administrator' };
    return null;
  }
  const faculty = isValidId(raw)
    ? await Faculty.findById(raw).lean()
    : await Faculty.findOne({ employeeId: raw }).lean();
  if (faculty) return { id: String((faculty as any)._id), name: ((faculty as any).user?.fullName as string) || user.fullName || '' };
  if (user.role === ROLES.ADMIN) return { id: String(user.id), name: user.fullName || 'Administrator' };
  return null;
}

export { MAX_EVIDENCE_BYTES };