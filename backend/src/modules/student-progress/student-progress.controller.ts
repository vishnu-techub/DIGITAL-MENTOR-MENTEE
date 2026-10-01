import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { StudentProgress, ProgressCategory, ProgressLevel, ProgressStatus } from '../../models/StudentProgress.model.js';
import { Student } from '../../models/Student.model.js';
import { Faculty } from '../../models/Faculty.model.js';
import { StudentDocument } from '../../models/StudentDocument.model.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { checkStudentAccess } from '../../utils/access.util.js';
import {
  RECORD_STATE,
  RECORD_STATES,
  CONFIRMED_LOCK_REASON,
  canTransition,
  canStudentTransition,
  deriveRecordPermissions,
  isTerminal,
  type RecordState,
  type RecordPermissions,
} from '../../utils/record-permission.util.js';
import { resolveStoredUploadPath, resolveWritableUploadsDir } from '../../config/storage.js';

// Setup a Writable Uploads Directory for Progress Certificates
const UPLOADS_DIR = resolveWritableUploadsDir('progress');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const sanitizedName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `prog-${uniqueSuffix}-${sanitizedName}${ext}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];

  if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file format. Please upload PDF, JPG, JPEG, or PNG files only.'));
  }
};

export const progressUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * Helper to resolve authenticated student document
 */
async function resolveAuthStudent(req: AuthRequest) {
  if (req.user?.role === ROLES.STUDENT) {
    if (req.user.studentId) {
      if (mongoose.Types.ObjectId.isValid(req.user.studentId)) {
        const byId = await Student.findById(req.user.studentId).populate('department batch');
        if (byId) return byId;
      }
      const byReg = await Student.findOne({ registerNumber: req.user.studentId }).populate('department batch');
      if (byReg) return byReg;
    }
    return await Student.findOne({ user: req.user.id }).populate('department batch');
  }
  return null;
}

/**
 * The terminal, mentor-confirmed state of a certificate/achievement.
 * `Verified` IS the confirmed state in this schema (see ProgressStatus /
 * VerificationStatus); the UI labels it "Verified". Once reached it is
 * immutable - nothing below ever silently demotes or reopens it.
 */
export const CONFIRMED_STATUS = RECORD_STATE.CONFIRMED;

const CONFIRMED_LOCK_MESSAGE = CONFIRMED_LOCK_REASON;

// ---------------------------------------------------------------------------
// Canonical student -> certificate relationship
// ---------------------------------------------------------------------------
/**
 * There is exactly ONE canonical relationship in this project between a student
 * and an uploaded certificate: `studentId -> Student._id`. It is already used
 * by `StudentDocument` (where every uploaded certificate actually lands) and by
 * `StudentProgress` (the achievement ledger).
 *
 * Nothing used to connect the two collections, which is why a certificate
 * uploaded through Student Documents never appeared in the mentor's
 * "Student Progress & Certificate Verifications" view: the mentor endpoint read
 * `student_progress` only, so every counter was 0 for a real, stored file.
 *
 * `StudentDocument` is treated as the canonical certificate store (it owns the
 * verification status, the rejection reason and Record Book Section 8), and
 * `StudentProgress` rows that point at the SAME stored file are folded into the
 * corresponding document row instead of being listed twice. No second
 * relationship and no duplicate MongoDB record is introduced.
 */
const DOCUMENT_CATEGORY_TO_PROGRESS_CATEGORY: Record<string, ProgressCategory> = {
  'Event Certificate': 'Event Certificate',
  'Workshop Certificate': 'Event Certificate',
  'MOOC Certificate': 'Event Certificate',
  'Internship Certificate': 'Event Certificate',
  'Paper Presentation': 'Event Certificate',
  'Technical Event': 'Event Certificate',
  'NPTEL Certificate': 'NPTEL Certificate',
  'Global Certification': 'Global Certification',
  'Hackathon Certificate': 'Hackathon Certificate',
  'SIH Certificate': 'Hackathon Certificate',
  Symposium: 'Symposium Certificate',
  'Symposium Certificate': 'Symposium Certificate',
  Award: 'Award Certificate',
  'Award Certificate': 'Award Certificate',
  'Extension Activity': 'Extension Activity',
  'Extra Curricular': 'Extra Curricular',
  'Program attended in other state': 'Program attended in other state',
  'Other approved achievements/activities': 'Other approved achievements/activities',
  Achievement: 'Other approved achievements/activities',
  Other: 'Other approved achievements/activities',
};

/**
 * Map a stored document category onto the existing ProgressCategory enum so the
 * six institutional counters can be derived from one list. Unknown values fall
 * back to the existing catch-all enum member - no new category name is created.
 */
export function toProgressCategory(category: string | undefined | null): ProgressCategory {
  const key = String(category || '').trim();
  return DOCUMENT_CATEGORY_TO_PROGRESS_CATEGORY[key] || 'Other approved achievements/activities';
}

/** Normalise a stored upload URL for identity comparison between collections. */
function normaliseFileKey(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Compare only the stable logical path, ignoring any base URL prefix.
  const idx = trimmed.indexOf('uploads/');
  return idx >= 0 ? trimmed.slice(idx) : trimmed;
}

export interface UnifiedProgressRecord {
  _id: string;
  source: 'DOCUMENT' | 'PROGRESS';
  studentId: string;
  category: ProgressCategory;
  rawCategory: string;
  activityName: string;
  organization: string;
  eventName: string;
  date: string;
  level: string;
  description: string;
  certificateUrl: string;
  fileName: string;
  status: ProgressStatus;
  rejectionReason: string;
  reviewerName: string;
  reviewedAt: Date | null;
  createdAt: Date | null;
  fileAvailable: boolean;
  /** Server-derived capability set for the requesting user. */
  permissions: RecordPermissions;
}

/**
 * Build the single list of a student's certificates + achievements for the
 * mentor review screen, from BOTH existing collections, de-duplicated by stored
 * file identity so one certificate is never counted twice.
 */
export async function buildUnifiedProgressRecords(studentObjectId: any): Promise<UnifiedProgressRecord[]> {
  const sid = String(studentObjectId);

  const [documents, progressRows] = await Promise.all([
    StudentDocument.find({
      studentId: sid,
      isPrimary: false,
      documentType: { $ne: 'student_details_form' },
    }).lean(),
    StudentProgress.find({ studentId: sid }).lean(),
  ]);

  const records: UnifiedProgressRecord[] = [];
  const consumedFileKeys = new Set<string>();

  for (const d of documents as any[]) {
    const fileKey = normaliseFileKey(d.fileUrl);
    if (fileKey) consumedFileKeys.add(fileKey);

    const absPath = fileKey ? resolveStoredUploadPath(d.fileUrl) : null;

    records.push({
      _id: String(d._id),
      source: 'DOCUMENT',
      studentId: sid,
      category: toProgressCategory(d.category),
      rawCategory: d.category || 'Other',
      activityName: d.title || d.fileName || 'Certificate',
      organization: d.organizer || '',
      eventName: d.eventName || '',
      date: d.eventDate || (d.uploadedAt ? new Date(d.uploadedAt).toISOString().slice(0, 10) : ''),
      level: 'College',
      description: d.description || '',
      certificateUrl: d.fileUrl || '',
      fileName: d.fileName || '',
      status: (d.verificationStatus || RECORD_STATE.PENDING) as ProgressStatus,
      rejectionReason: d.rejectionReason || '',
      reviewerName: '',
      reviewedAt: d.rejectedDate || null,
      createdAt: d.uploadedAt || d.createdAt || null,
      fileAvailable: Boolean(absPath && fs.existsSync(absPath)),
      // Filled in by the caller with the REQUESTING user's role; a placeholder
      // here keeps the merge below from having to special-case each branch.
      permissions: deriveRecordPermissions(d.verificationStatus, ROLES.FACULTY),
    });
  }

  for (const p of progressRows as any[]) {
    const fileKey = normaliseFileKey(p.certificateUrl);

    // Same physical certificate already represented by its StudentDocument
    // row: fold it in instead of listing the certificate twice.
    if (fileKey && consumedFileKeys.has(fileKey)) {
      const existing = records.find((r) => normaliseFileKey(r.certificateUrl) === fileKey);
      if (existing) {
        // Keep whichever status is further along the workflow; never regress a
        // confirmed document back to pending because of a stale progress row.
        if (existing.status !== RECORD_STATE.CONFIRMED && p.status === RECORD_STATE.CONFIRMED) {
          existing.status = RECORD_STATE.CONFIRMED;
          existing.permissions = deriveRecordPermissions(RECORD_STATE.CONFIRMED, ROLES.FACULTY);
        }
        if (existing.activityName === 'Certificate' && p.activityName) {
          existing.activityName = p.activityName;
        }
        if (existing.organization === '' && p.organization) existing.organization = p.organization;
        if (existing.eventName === '' && p.eventName) existing.eventName = p.eventName;
        if (existing.description === '' && p.description) existing.description = p.description;
        if (existing.level === 'College' && p.level) existing.level = p.level;
        if (existing.rejectionReason === '' && p.rejectionReason) existing.rejectionReason = p.rejectionReason;
        continue;
      }
    }
    if (fileKey) consumedFileKeys.add(fileKey);

    const absPath = fileKey ? resolveStoredUploadPath(p.certificateUrl) : null;

    records.push({
      _id: String(p._id),
      source: 'PROGRESS',
      studentId: sid,
      category: p.category,
      rawCategory: p.category,
      activityName: p.activityName,
      organization: p.organization || '',
      eventName: p.eventName || '',
      date: p.date || '',
      level: p.level || 'College',
      description: p.description || '',
      certificateUrl: p.certificateUrl || '',
      fileName: p.fileName || '',
      status: (p.status || RECORD_STATE.PENDING) as ProgressStatus,
      rejectionReason: p.rejectionReason || '',
      reviewerName: p.reviewerName || '',
      reviewedAt: p.reviewedAt || null,
      createdAt: p.createdAt || null,
      fileAvailable: Boolean(absPath && fs.existsSync(absPath)),
      permissions: deriveRecordPermissions(p.status, ROLES.FACULTY),
    });
  }

  records.sort((a, b) => {
    const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (bd !== ad) return bd - ad;
    return String(b.date).localeCompare(String(a.date));
  });

  return records;
}

/** Institutional category + status counters, derived from the actual records. */
function summariseProgress(records: UnifiedProgressRecord[]) {
  const byCategory = (c: ProgressCategory) => records.filter((r) => r.category === c).length;
  const byStatus = (s: ProgressStatus) => records.filter((r) => r.status === s).length;
  return {
    eventCertificates: byCategory('Event Certificate'),
    nptelCertificates: byCategory('NPTEL Certificate'),
    globalCertifications: byCategory('Global Certification'),
    hackathons: byCategory('Hackathon Certificate'),
    symposiums: byCategory('Symposium Certificate'),
    awards: byCategory('Award Certificate'),
    otherStatePrograms: byCategory('Program attended in other state'),
    extensionActivities: byCategory('Extension Activity'),
    extraCurricular: byCategory('Extra Curricular'),
    others: byCategory('Other approved achievements/activities'),
    // AWAITING_REVIEW counts everything a mentor still has to act on: the
    // initial PENDING request and the student's SUBMITTED record alike. The
    // editable states (APPROVED / EDITING) are the student's to work on, not the
    // mentor's, so they are counted separately rather than inflating the
    // reviewer's queue.
    pending: records.filter(
      (r) => r.status === RECORD_STATE.PENDING || r.status === RECORD_STATE.SUBMITTED
    ).length,
    awaitingApproval: byStatus(RECORD_STATE.PENDING),
    awaitingConfirmation: byStatus(RECORD_STATE.SUBMITTED),
    editableByStudent: byStatus(RECORD_STATE.APPROVED) + byStatus(RECORD_STATE.EDITING),
    approved: byStatus(RECORD_STATE.APPROVED),
    editing: byStatus(RECORD_STATE.EDITING),
    submitted: byStatus(RECORD_STATE.SUBMITTED),
    verified: byStatus(CONFIRMED_STATUS),
    rejected: byStatus('Rejected'),
    total: records.length,
  };
}

// 1. POST /api/student/progress - Create new achievement / progress record
export async function createStudentProgress(req: AuthRequest, res: Response) {
  try {
    let student = await resolveAuthStudent(req);

    // If Admin/HOD is submitting on behalf of a student with body studentId
    if (!student && (req.user?.role === ROLES.ADMIN || req.user?.role === ROLES.HOD)) {
      const targetId = req.body.studentId;
      if (targetId) {
        student = await Student.findById(targetId).populate('department batch');
      }
    }

    if (!student) {
      return sendError(res, 'Student profile not found or access unauthorized.', 403);
    }

    const {
      category,
      activityName,
      organization,
      eventName,
      date,
      level,
      description,
    } = req.body;

    if (!category || !category.trim()) {
      return sendError(res, 'Category is required.', 400);
    }
    if (!activityName || !activityName.trim()) {
      return sendError(res, 'Activity / Certificate Name is required.', 400);
    }

    const file = req.file;
    let certificateUrl = '';
    let fileName = '';
    let fileSize = 0;
    let fileType = '';

    if (file) {
      certificateUrl = `/uploads/progress/${file.filename}`;
      fileName = file.originalname;
      fileSize = file.size;
      fileType = file.mimetype;
    }

    const deptName = (student.department as any)?.name || (student.department as any)?.code || student.department || 'Information Technology';
    const batchName = (student.batch as any)?.name || (student.batch as any)?.academicYear || student.batch || '';

    const newProgress = await StudentProgress.create({
      studentId: student._id,
      registerNumber: student.registerNumber,
      studentName: student.fullName,
      department: typeof deptName === 'string' ? deptName : 'Information Technology',
      batch: typeof batchName === 'string' ? batchName : '',
      section: student.section || 'A',
      category: category.trim() as ProgressCategory,
      activityName: activityName.trim(),
      organization: organization ? organization.trim() : '',
      eventName: eventName ? eventName.trim() : '',
      date: date ? date.trim() : '',
      level: (level ? level.trim() : 'College') as ProgressLevel,
      description: description ? description.trim() : '',
      certificateUrl,
      fileName,
      fileSize,
      fileType,
      // An upload ALWAYS lands in PENDING; it can never auto-verify.
      status: RECORD_STATE.PENDING,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_STUDENT_PROGRESS',
      entity: 'STUDENT_PROGRESS',
      details: {
        progressId: newProgress._id,
        registerNumber: student.registerNumber,
        category: newProgress.category,
        activityName: newProgress.activityName,
      },
      req,
    });

    // Permissions are attached here too, not only on the read paths: a freshly
    // created record is PENDING, and the client must be told that it is
    // read-only rather than re-deriving editability from the status string.
    return sendSuccess(
      res,
      { ...newProgress.toObject(), permissions: deriveRecordPermissions(newProgress.status, req.user?.role) },
      'Achievement / progress record added successfully.',
      201
    );
  } catch (err: any) {
    console.error('createStudentProgress error:', err);
    return sendError(res, err.message || 'Failed to create student progress record.', 500);
  }
}

// 2. GET /api/student/progress - Get authenticated student's own progress records
export async function getStudentProgressList(req: AuthRequest, res: Response) {
  try {
    const student = await resolveAuthStudent(req);
    if (!student) {
      return sendError(res, 'Student profile not found.', 404);
    }

    const records = await StudentProgress.find({ studentId: student._id }).sort({ date: -1, createdAt: -1 });

    // Category summary counts
    const categoryCounts: Record<string, number> = {};
    records.forEach((r) => {
      categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    });

    // Ship the server-derived capability set with every record so the student UI
    // renders exactly what the API permits, rather than re-deriving it.
    const withPermissions = records.map((r) => ({
      ...r.toObject(),
      permissions: deriveRecordPermissions(r.status, req.user?.role),
    }));

    return sendSuccess(res, {
      records: withPermissions,
      categoryCounts,
      totalCount: records.length,
    });
  } catch (err: any) {
    console.error('getStudentProgressList error:', err);
    return sendError(res, 'Failed to fetch progress records.', 500);
  }
}

// 3. PUT /api/student/progress/:id - Update student's own progress record
export async function updateStudentProgress(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const student = await resolveAuthStudent(req);

    const record = await StudentProgress.findById(id);
    if (!record) {
      return sendError(res, 'Progress record not found.', 404);
    }

    // Authorization check
    if (req.user?.role === ROLES.STUDENT) {
      if (!student || record.studentId.toString() !== student._id.toString()) {
        return sendError(res, 'Access denied: You can only edit your own progress records.', 403);
      }
    }

    // A mentor-confirmed record is an official verified entry and is immutable.
    // Enforced here, not just in the UI, so a crafted request cannot reopen it.
    if (isTerminal(record.status)) {
      return sendError(res, CONFIRMED_LOCK_MESSAGE, 409);
    }

    // PENDING and SUBMITTED are read-only for the student: a save is refused
    // with the reason, not silently accepted.
    if (req.user?.role === ROLES.STUDENT && !canStudentTransition(record.status, RECORD_STATE.APPROVED)) {
      return sendError(
        res,
        deriveRecordPermissions(record.status, req.user.role).reason ??
          'This record is read-only in its current state.',
        409
      );
    }

    const {
      category,
      activityName,
      organization,
      eventName,
      date,
      level,
      description,
    } = req.body;

    if (category) record.category = category.trim() as ProgressCategory;
    if (activityName) record.activityName = activityName.trim();
    if (organization !== undefined) record.organization = organization.trim();
    if (eventName !== undefined) record.eventName = eventName.trim();
    if (date !== undefined) record.date = date.trim();
    if (level) record.level = level.trim() as ProgressLevel;
    if (description !== undefined) record.description = description.trim();

    // If new file uploaded, update certificate info
    const file = req.file;
    if (file) {
      // Remove old file if exists
      if (record.certificateUrl) {
        const oldPath = resolveStoredUploadPath(record.certificateUrl);
        if (oldPath && fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (_) {}
        }
      }
      record.certificateUrl = `/uploads/progress/${file.filename}`;
      record.fileName = file.originalname;
      record.fileSize = file.size;
      record.fileType = file.mimetype;
    }

    // A save is a draft, not a submission: the student stays in an editable
    // state and re-enters the mentor queue only via the explicit submit route.
    if (req.user?.role === ROLES.STUDENT) {
      record.status = RECORD_STATE.APPROVED;
      record.rejectionReason = '';
    }

    await record.save();

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_STUDENT_PROGRESS',
      entity: 'STUDENT_PROGRESS',
      details: { progressId: record._id, category: record.category },
      req,
    });

    return sendSuccess(res, record, 'Progress record updated successfully.');
  } catch (err: any) {
    console.error('updateStudentProgress error:', err);
    return sendError(res, err.message || 'Failed to update progress record.', 500);
  }
}

// 4. DELETE /api/student/progress/:id - Delete student's own progress record
export async function deleteStudentProgress(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const student = await resolveAuthStudent(req);

    const record = await StudentProgress.findById(id);
    if (!record) {
      return sendError(res, 'Progress record not found.', 404);
    }

    if (req.user?.role === ROLES.STUDENT) {
      if (!student || record.studentId.toString() !== student._id.toString()) {
        return sendError(res, 'Access denied: You can only delete your own progress records.', 403);
      }
    }

    // Confirmed records are permanently locked: deletion is rejected too.
    if (isTerminal(record.status)) {
      return sendError(res, CONFIRMED_LOCK_MESSAGE, 409);
    }

    // The owner may only delete from an editable state.
    if (req.user?.role === ROLES.STUDENT) {
      const perms = deriveRecordPermissions(record.status, req.user.role);
      if (!perms.canDelete) {
        return sendError(
          res,
          perms.reason ?? 'This record cannot be deleted in its current state.',
          409
        );
      }
    }

    // Remove file if exists
    if (record.certificateUrl) {
      const filePath = resolveStoredUploadPath(record.certificateUrl);
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }

    await record.deleteOne();

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_STUDENT_PROGRESS',
      entity: 'STUDENT_PROGRESS',
      details: { progressId: id, registerNumber: record.registerNumber },
      req,
    });

    return sendSuccess(res, null, 'Progress record deleted successfully.');
  } catch (err: any) {
    console.error('deleteStudentProgress error:', err);
    return sendError(res, 'Failed to delete progress record.', 500);
  }
}

/**
 * Student submits an editable record for mentor review.
 * APPROVED / EDITING / REJECTED -> SUBMITTED. A save is a draft; only this
 * explicit action returns the record to the mentor queue.
 */
export async function submitStudentProgress(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const student = await resolveAuthStudent(req);

    const record = await StudentProgress.findById(id);
    if (!record) {
      return sendError(res, 'Progress record not found.', 404);
    }

    // Submitting is the owner's decision. An HOD/admin may view and review the record,
    // but pushing it into the mentor queue on the student's behalf would skip the
    // student's own final read of what they are claiming.
    if (!student || record.studentId.toString() !== student._id.toString()) {
      return sendError(res, 'Access denied: You can only submit your own progress records.', 403);
    }

    if (!canStudentTransition(record.status, RECORD_STATE.SUBMITTED)) {
      if (isTerminal(record.status)) {
        return sendError(res, CONFIRMED_LOCK_MESSAGE, 409);
      }
      return sendError(
        res,
        deriveRecordPermissions(record.status, req.user?.role).reason ??
          'This record cannot be submitted in its current state.',
        409
      );
    }

    const from = record.status;
    record.status = RECORD_STATE.SUBMITTED;
    record.rejectionReason = '';
    await record.save();

    await logAudit({
      userId: req.user!.id,
      action: 'SUBMIT_STUDENT_PROGRESS',
      entity: 'STUDENT_PROGRESS',
      details: { progressId: String(record._id), from, to: RECORD_STATE.SUBMITTED },
      req,
    });

    return sendSuccess(
      res,
      {
        ...record.toObject(),
        permissions: deriveRecordPermissions(record.status, req.user?.role),
      },
      'Submitted for mentor review. The record is now read-only while your mentor reviews it.'
    );
  } catch (err: any) {
    console.error('submitStudentProgress error:', err);
    return sendError(res, err.message || 'Failed to submit progress record.', 500);
  }
}

// 5. GET /api/mentor/mentees/:studentId/progress - Mentor views mentee's progress records
export async function getMenteeProgressForMentor(req: AuthRequest, res: Response) {
  try {
    const studentId = req.params.studentId as string;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return sendError(res, 'Invalid student ID parameter.', 400);
    }

    // Data isolation is enforced in the QUERY, through the single existing
    // authorisation utility, exactly like the documents/students/meetings
    // modules. The previous inline check was wrapped in `if (facultyId)`, so a
    // mentor whose faculty id could not be resolved skipped the ownership test
    // entirely and could read ANY mentee's records. checkStudentAccess denies
    // when it cannot resolve the caller, which is the safe direction.
    const student = await Student.findById(studentId);
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const records = await buildUnifiedProgressRecords(student._id);
    const summary = summariseProgress(records);

    // Recompute capabilities for the ACTUAL caller. The builder is role-agnostic;
    // this is where the requesting mentor/HOD/admin's own permission set is
    // attached, so the review buttons are never a frontend guess.
    const forCaller = records.map((r) => ({
      ...r,
      permissions: deriveRecordPermissions(r.status, req.user?.role),
    }));

    return sendSuccess(res, {
      records: forCaller,
      summary,
      student: {
        id: String(student._id),
        fullName: student.fullName,
        registerNumber: student.registerNumber,
      },
    });
  } catch (err: any) {
    console.error('getMenteeProgressForMentor error:', err);
    return sendError(res, 'Failed to fetch mentee progress.', 500);
  }
}

// 6. PUT /api/mentor/mentees/:studentId/progress/:id/verify - Verify or reject progress record
export async function verifyMenteeProgress(req: AuthRequest, res: Response) {
  try {
    const studentId = req.params.studentId as string;
    const id = req.params.id as string;
    const { status, rejectionReason, source } = req.body;

    if (!(RECORD_STATES as readonly string[]).includes(String(status))) {
      return sendError(
        res,
        `Status must be one of: ${RECORD_STATES.join(', ')}.`,
        400
      );
    }

    const targetStatus = status as RecordState;

    if (targetStatus === RECORD_STATE.REJECTED && (!rejectionReason || !rejectionReason.trim())) {
      return sendError(res, 'Rejection reason is required when rejecting a progress record.', 400);
    }

    // Ownership of the SELECTED mentee, not just of the record id.
    const student = await Student.findById(studentId);
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    // `source` tells us which of the two existing collections holds the record
    // that was rendered. It is always sent by the mentor UI; the fallbacks keep
    // older clients working and are still scoped to this exact student.
    const order: Array<'DOCUMENT' | 'PROGRESS'> =
      source === 'PROGRESS' ? ['PROGRESS', 'DOCUMENT'] : ['DOCUMENT', 'PROGRESS'];

    let reviewerFaculty: any = null;
    if (req.user?.role === ROLES.FACULTY) {
      reviewerFaculty = await Faculty.findOne({
        $or: [{ _id: req.user.facultyId }, { user: req.user.id }],
      }).populate('user');
    }

    let record: any = null;
    let storedIn: 'DOCUMENT' | 'PROGRESS' | null = null;

    for (const candidate of order) {
      if (candidate === 'DOCUMENT') {
        const doc = await StudentDocument.findOne({
          _id: mongoose.Types.ObjectId.isValid(id) ? id : undefined,
          studentId: student._id,
          isPrimary: false,
          documentType: { $ne: 'student_details_form' },
        });
        if (doc) {
          record = doc;
          storedIn = 'DOCUMENT';
          break;
        }
      } else {
        const prog = await StudentProgress.findOne({
          _id: mongoose.Types.ObjectId.isValid(id) ? id : undefined,
          studentId: student._id,
        });
        if (prog) {
          record = prog;
          storedIn = 'PROGRESS';
          break;
        }
      }
    }

    if (!record || !storedIn) {
      return sendError(res, 'Progress record not found for this mentee.', 404);
    }

    // The single authority on whether this state change is legal. A confirmed
    // record is frozen in every direction, and only a mentor may act.
    const currentStatus = (record.verificationStatus ?? record.status) as string;
    if (!canTransition(currentStatus, targetStatus, req.user?.role)) {
      if (isTerminal(currentStatus)) {
        return sendError(res, CONFIRMED_LOCK_MESSAGE, 409);
      }
      return sendError(
        res,
        `A record in state "${currentStatus}" cannot move to "${targetStatus}". Allowed next states from ${currentStatus}: ${
          RECORD_STATES.filter((s) => canTransition(currentStatus, s, req.user?.role)).join(', ') ||
          'none'
        }.`,
        409
      );
    }

    const fromStatus = currentStatus;

    if (storedIn === 'DOCUMENT') {
      record.verificationStatus = targetStatus;
      record.rejectionReason = targetStatus === RECORD_STATE.REJECTED ? rejectionReason.trim() : '';
      if (targetStatus === RECORD_STATE.REJECTED) {
        record.rejectedBy = mongoose.Types.ObjectId.isValid(String(req.user?.id || ''))
          ? new mongoose.Types.ObjectId(String(req.user?.id))
          : undefined;
        record.rejectedDate = new Date();
      } else {
        record.rejectedBy = undefined;
        record.rejectedDate = undefined;
      }
    } else {
      record.status = targetStatus;
      record.rejectionReason = targetStatus === RECORD_STATE.REJECTED ? rejectionReason.trim() : '';
      record.reviewedBy = reviewerFaculty?._id || undefined;
      record.reviewerName = reviewerFaculty?.user?.fullName || req.user?.username || 'Mentor';
      record.reviewedAt = new Date();
    }

    await record.save();

    await logAudit({
      userId: req.user!.id,
      action: 'VERIFY_STUDENT_PROGRESS',
      entity: 'STUDENT_PROGRESS',
      details: {
        progressId: String(record._id),
        storedIn,
        studentId: String(student._id),
        from: fromStatus,
        to: targetStatus,
        rejectionReason: record.rejectionReason,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        ...record.toObject(),
        permissions: deriveRecordPermissions(targetStatus, req.user?.role),
      },
      targetStatus === RECORD_STATE.CONFIRMED
        ? 'Achievement confirmed. It is now a verified record and permanently locked.'
        : targetStatus === RECORD_STATE.REJECTED
          ? 'Changes requested. The student may now correct and resubmit this record.'
          : 'Request approved. The student may now edit and submit this record.'
    );
  } catch (err: any) {
    console.error('verifyMenteeProgress error:', err);
    return sendError(res, err.message || 'Failed to update verification status.', 500);
  }
}
