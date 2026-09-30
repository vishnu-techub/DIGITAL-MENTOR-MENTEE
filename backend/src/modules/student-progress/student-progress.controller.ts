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
export const CONFIRMED_STATUS = 'Verified';

const CONFIRMED_LOCK_MESSAGE =
  'This record has been confirmed by your mentor and is now an official verified entry. Confirmed records are permanently locked and can no longer be edited, deleted or re-submitted.';

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
      status: (d.verificationStatus || 'Pending') as ProgressStatus,
      rejectionReason: d.rejectionReason || '',
      reviewerName: '',
      reviewedAt: d.rejectedDate || null,
      createdAt: d.uploadedAt || d.createdAt || null,
      fileAvailable: Boolean(absPath && fs.existsSync(absPath)),
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
        if (existing.status !== 'Verified' && p.status === 'Verified') existing.status = 'Verified';
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
      status: (p.status || 'Pending') as ProgressStatus,
      rejectionReason: p.rejectionReason || '',
      reviewerName: p.reviewerName || '',
      reviewedAt: p.reviewedAt || null,
      createdAt: p.createdAt || null,
      fileAvailable: Boolean(absPath && fs.existsSync(absPath)),
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
    pending: byStatus('Pending'),
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
      status: 'Pending',
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

    return sendSuccess(res, newProgress, 'Achievement / progress record added successfully.', 201);
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

    return sendSuccess(res, {
      records,
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
    if (record.status === CONFIRMED_STATUS) {
      return sendError(res, CONFIRMED_LOCK_MESSAGE, 409);
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

    // Reset status to Pending on edit if student edits
    if (req.user?.role === ROLES.STUDENT) {
      record.status = 'Pending';
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
    if (record.status === CONFIRMED_STATUS) {
      return sendError(res, CONFIRMED_LOCK_MESSAGE, 409);
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

    return sendSuccess(res, {
      records,
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

    if (!['Verified', 'Rejected', 'Pending'].includes(status)) {
      return sendError(res, 'Status must be Verified, Rejected, or Pending.', 400);
    }

    if (status === 'Rejected' && (!rejectionReason || !rejectionReason.trim())) {
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

    // A mentor-confirmed record is an official, immutable entry: it may not be
    // silently demoted back to Pending or Rejected. Enforced server-side, so a
    // hidden button is never the only protection.
    if (record.verificationStatus === CONFIRMED_STATUS || record.status === CONFIRMED_STATUS) {
      if (status !== CONFIRMED_STATUS) {
        return sendError(res, CONFIRMED_LOCK_MESSAGE, 409);
      }
      return sendSuccess(res, record, `Achievement record marked as ${status}.`);
    }

    if (storedIn === 'DOCUMENT') {
      record.verificationStatus = status;
      record.rejectionReason = status === 'Rejected' ? rejectionReason.trim() : '';
      if (status === 'Rejected') {
        record.rejectedBy = mongoose.Types.ObjectId.isValid(String(req.user?.id || ''))
          ? new mongoose.Types.ObjectId(String(req.user?.id))
          : undefined;
        record.rejectedDate = new Date();
      } else {
        record.rejectedBy = undefined;
        record.rejectedDate = undefined;
      }
    } else {
      record.status = status;
      record.rejectionReason = status === 'Rejected' ? rejectionReason.trim() : '';
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
        status,
        rejectionReason: record.rejectionReason,
      },
      req,
    });

    return sendSuccess(res, record, `Achievement record marked as ${status}.`);
  } catch (err: any) {
    console.error('verifyMenteeProgress error:', err);
    return sendError(res, err.message || 'Failed to update verification status.', 500);
  }
}
