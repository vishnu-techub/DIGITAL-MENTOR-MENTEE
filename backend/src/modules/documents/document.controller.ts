import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { StudentDocument, Student } from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import { checkStudentAccess, toIdString } from '../../utils/access.util.js';
import { syncStudentDetailsPdf } from './student-details-pdf.service.js';

// Ensure upload directory exists
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const sanitizedName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `doc-${uniqueSuffix}-${sanitizedName}${ext}`);
  },
});

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

// File validation filter (MIME level; magic bytes are verified after landing on disk)
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file format. Please upload PDF, JPG, JPEG, or PNG files only.'));
  }
};

export const documentUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES },
});

/**
 * Verify the actual file signature. A caller can claim any MIME type, so the
 * bytes on disk are what decides whether a document is accepted.
 */
function sniffFileType(filePath: string): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    const read = fs.readSync(fd, buf, 0, 8, 0);
    if (read < 4) return null;
    if (buf.slice(0, 4).toString('binary') === '%PDF') return 'application/pdf';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Resolve a stored fileUrl to an absolute path, refusing anything that escapes
 * the uploads directory (path traversal defence).
 */
function resolveStoredPath(fileUrl: string): string | null {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const relative = fileUrl.replace(/^\/+/, '');
  const absolute = path.resolve(process.cwd(), relative);
  const root = path.resolve(UPLOADS_DIR);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return null;
  }
  return absolute;
}

/** Locate a Student by ObjectId or register number. */
async function findStudent(idOrReg: string) {
  if (mongoose.Types.ObjectId.isValid(idOrReg)) {
    const byId = await Student.findById(idOrReg);
    if (byId) return byId;
  }
  return Student.findOne({ registerNumber: String(idOrReg).toUpperCase() });
}

// 1. Upload Student Certificate / Document
export async function uploadDocument(req: AuthRequest, res: Response) {
  const file = req.file;
  if (!file) {
    return sendError(res, 'No file uploaded or file rejected due to unsupported format.', 400);
  }

  const cleanup = () => {
    try {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {
      /* best effort */
    }
  };

  const {
    studentId: bodyStudentId,
    title,
    category,
    documentType: reqDocType,
    eventName,
    organizer,
    eventDate,
    description,
  } = req.body;

  const effectiveTitle = (title || file.originalname || 'Certificate').trim().slice(0, 200);
  const effectiveCategory = (category || 'Other').trim().slice(0, 100);

  try {
    // A STUDENT may never target another student: the id comes from the token.
    let targetStudentId: string | undefined;
    if (req.user?.role === ROLES.STUDENT) {
      targetStudentId = req.user.studentId || undefined;
    } else {
      targetStudentId = bodyStudentId;
    }

    if (!targetStudentId) {
      cleanup();
      return sendError(res, 'Permanent studentId is required.', 400);
    }

    const student = await findStudent(String(targetStudentId));
    if (!student) {
      cleanup();
      return sendError(res, 'Student record not found.', 404);
    }

    // Authorisation is verified against the RESOLVED student, so rewriting
    // `studentId` in the request body cannot grant access to another student.
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      cleanup();
      return sendError(res, access.message, access.status);
    }

    // The Student Details Form is system-generated; users cannot upload one.
    if (reqDocType === 'student_details_form' || String(req.body?.isPrimary) === 'true') {
      cleanup();
      return sendError(res, 'The Student Details Form is generated automatically and cannot be uploaded.', 400);
    }

    // Verify real file content, not just the declared MIME type.
    const actualType = sniffFileType(file.path);
    if (!actualType || !ALLOWED_MIME.includes(actualType)) {
      cleanup();
      return sendError(
        res,
        'File content does not match an accepted document type. Only genuine PDF, JPG, JPEG or PNG files are allowed.',
        400
      );
    }

    const fileUrl = `/uploads/documents/${file.filename}`;
    const docType = reqDocType === 'other' ? 'other' : 'certificate';

    const newDoc = await StudentDocument.create({
      studentId: student._id,
      documentType: docType,
      isPrimary: false,
      fileName: file.originalname,
      fileUrl,
      fileType: actualType,
      fileSize: file.size,
      title: effectiveTitle,
      category: effectiveCategory,
      eventName: eventName?.trim() || '',
      organizer: organizer?.trim() || '',
      eventDate: eventDate?.trim() || '',
      description: description?.trim() || '',
      uploadedBy: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined,
      verificationStatus: 'Pending',
      uploadedAt: new Date(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'UPLOAD_DOCUMENT',
      entity: 'DOCUMENT',
      entityId: newDoc._id.toString(),
      details: {
        studentId: student._id.toString(),
        registerNumber: student.registerNumber,
        title: newDoc.title,
        documentType: newDoc.documentType,
        category: newDoc.category,
        fileName: newDoc.fileName,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        id: newDoc._id.toString(),
        _id: newDoc._id.toString(),
        studentId: student._id.toString(),
        documentType: newDoc.documentType,
        isPrimary: newDoc.isPrimary,
        title: newDoc.title,
        category: newDoc.category,
        eventName: newDoc.eventName,
        organizer: newDoc.organizer,
        eventDate: newDoc.eventDate,
        description: newDoc.description,
        fileUrl: newDoc.fileUrl,
        fileName: newDoc.fileName,
        fileType: newDoc.fileType,
        fileSize: newDoc.fileSize,
        verificationStatus: newDoc.verificationStatus,
        uploadedAt: newDoc.uploadedAt,
      },
      'Document uploaded successfully.',
      201
    );
  } catch (err: any) {
    cleanup();
    console.error('uploadDocument error:', err);
    return sendError(res, 'Failed to save document metadata: ' + err.message, 500);
  }
}

// 2. Get Documents for a specific Student
export async function getStudentDocuments(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  try {
    const student = await findStudent(studentId);
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    // Auto-generate the Student Details Form once when missing.
    const existingForm = await StudentDocument.findOne({
      studentId: student._id,
      $or: [{ isPrimary: true }, { documentType: 'student_details_form' }],
    });
    if (!existingForm && student.profileCompleted) {
      await syncStudentDetailsPdf(student._id);
    }

    const docs = await StudentDocument.find({ studentId: student._id })
      .populate('rejectedBy', 'fullName username role')
      .populate('uploadedBy', 'fullName username role')
      .sort({ isPrimary: -1, uploadedAt: -1 });

    const formatted = docs.map((d: any) => ({
      id: d._id.toString(),
      _id: d._id.toString(),
      studentId: d.studentId.toString(),
      documentType: d.documentType || (d.isPrimary ? 'student_details_form' : 'certificate'),
      isPrimary: Boolean(d.isPrimary),
      fileName: d.fileName || (d.isPrimary ? 'Student Details Form.pdf' : d.title),
      // Files are served through the authenticated document endpoints.
      fileUrl: d.fileUrl,
      fileUrlDownload: `/api/documents/${d._id.toString()}/download`,
      fileUrlView: `/api/documents/${d._id.toString()}/file`,
      fileType: d.fileType || 'application/pdf',
      fileSize: d.fileSize || 0,
      title: d.title || d.fileName,
      category: d.category || 'Other',
      eventName: d.eventName || '',
      organizer: d.organizer || '',
      eventDate: d.eventDate || '',
      description: d.description || '',
      verificationStatus: d.verificationStatus || 'Pending',
      rejectionReason: d.rejectionReason || '',
      rejectedByName: d.rejectedBy?.fullName || null,
      rejectedDate: d.rejectedDate || null,
      uploadedByName: d.uploadedBy?.fullName || null,
      uploadedAt: d.uploadedAt,
      updatedAt: d.updatedAt,
    }));

    return sendSuccess(res, formatted);
  } catch (err: any) {
    console.error('getStudentDocuments error:', err);
    return sendError(res, 'Failed to retrieve student documents.', 500);
  }
}

/**
 * Serve a document's bytes after verifying the caller may access the owner.
 * `disposition` selects inline viewing (PDF/images) or forced download.
 */
async function streamDocumentFile(req: AuthRequest, res: Response, disposition: 'inline' | 'attachment') {
  const documentId = req.params.documentId as string;

  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    return sendError(res, 'Invalid document reference.', 400);
  }

  const doc = await StudentDocument.findById(documentId);
  if (!doc) {
    return sendError(res, 'Document not found.', 404);
  }

  const student = await Student.findById(doc.studentId);
  if (!student) {
    return sendError(res, 'The owning student record no longer exists.', 404);
  }

  const access = await checkStudentAccess(req.user, student);
  if (!access.allowed) {
    return sendError(res, access.message, access.status);
  }

  const filePath = resolveStoredPath(doc.fileUrl);
  if (!filePath || !fs.existsSync(filePath)) {
    return sendError(res, 'Physical file not found on server.', 404);
  }

  // Safe download filename: strip any path components the stored name may carry.
  const safeName = path.basename(doc.fileName || 'document').replace(/["\r\n]/g, '_');

  res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  return res.sendFile(filePath);
}

/** Inline view used by the certificate preview. Never forces a download. */
export async function viewDocumentFile(req: AuthRequest, res: Response) {
  try {
    return await streamDocumentFile(req, res, 'inline');
  } catch (err: any) {
    console.error('viewDocumentFile error:', err);
    return sendError(res, 'Failed to stream document file.', 500);
  }
}

/** Forced download. */
export async function downloadDocument(req: AuthRequest, res: Response) {
  try {
    return await streamDocumentFile(req, res, 'attachment');
  } catch (err: any) {
    console.error('downloadDocument error:', err);
    return sendError(res, 'Failed to download document file.', 500);
  }
}

/**
 * Guarded compatibility route for legacy `/uploads/documents/<file>` links that
 * were stored on existing StudentDocument records. The file is resolved through
 * its document record so the same ownership rules apply — the raw static path
 * is never public.
 */
export async function serveLegacyUpload(req: AuthRequest, res: Response) {
  try {
    const requested = decodeURIComponent((req.params as any)[0] || '');
    const doc = await StudentDocument.findOne({ fileUrl: `/uploads/${requested}` });
    if (!doc) {
      return sendError(res, 'Document not found.', 404);
    }

    const student = await Student.findById(doc.studentId);
    if (!student) {
      return sendError(res, 'The owning student record no longer exists.', 404);
    }

    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const filePath = resolveStoredPath(doc.fileUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return sendError(res, 'Physical file not found on server.', 404);
    }

    const wantsDownload = req.query.download === '1' || req.query.download === 'true';
    const safeName = path.basename(doc.fileName || 'document').replace(/["\r\n]/g, '_');

    res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${wantsDownload ? 'attachment' : 'inline'}; filename="${safeName}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath);
  } catch (err: any) {
    console.error('serveLegacyUpload error:', err);
    return sendError(res, 'Failed to serve stored file.', 500);
  }
}

// 4. Delete Document (removes metadata AND the stored file)
export async function deleteDocument(req: AuthRequest, res: Response) {
  const documentId = req.params.documentId as string;

  try {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return sendError(res, 'Invalid document reference.', 400);
    }

    const doc = await StudentDocument.findById(documentId);
    if (!doc) {
      return sendError(res, 'Document not found.', 404);
    }

    if (doc.isPrimary || doc.documentType === 'student_details_form') {
      return sendError(
        res,
        'The Student Details Form cannot be deleted manually. It is automatically maintained by the student profile system.',
        400
      );
    }

    const student = await Student.findById(doc.studentId);
    if (!student) {
      return sendError(res, 'The owning student record no longer exists.', 404);
    }

    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    // Metadata first: if the unlink fails we must not leave a dangling record.
    await StudentDocument.findByIdAndDelete(documentId);

    const filePath = resolveStoredPath(doc.fileUrl);
    let fileRemoved = true;
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e: any) {
        fileRemoved = false;
        console.error('Failed to unlink stored document file:', filePath, e.message);
      }
    }

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_DOCUMENT',
      entity: 'DOCUMENT',
      entityId: documentId,
      details: {
        title: doc.title,
        fileName: doc.fileName,
        registerNumber: student.registerNumber,
        fileRemoved,
      },
      req,
    });

    return sendSuccess(
      res,
      { documentId, fileRemoved },
      fileRemoved
        ? 'Document deleted successfully.'
        : 'Document record deleted, but the stored file could not be removed from disk. An administrator has been notified.'
    );
  } catch (err: any) {
    console.error('deleteDocument error:', err);
    return sendError(res, 'Failed to delete document.', 500);
  }
}

// 5. Verify / Reject Document (Mentor / Admin / HOD)
export async function verifyDocument(req: AuthRequest, res: Response) {
  const documentId = req.params.documentId as string;
  const status = req.body.verificationStatus || req.body.status;
  const rejectionReason = req.body.rejectionReason;

  if (!status || !['Verified', 'Rejected', 'Pending'].includes(status)) {
    return sendError(res, 'Valid verificationStatus is required (Pending, Verified, Rejected).', 400);
  }

  const verificationStatus = status as 'Pending' | 'Verified' | 'Rejected';

  if (verificationStatus === 'Rejected' && (!rejectionReason || rejectionReason.trim() === '')) {
    return sendError(res, 'Rejection reason is mandatory when rejecting a document.', 400);
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return sendError(res, 'Invalid document reference.', 400);
    }

    const doc = await StudentDocument.findById(documentId);
    if (!doc) {
      return sendError(res, 'Document record not found.', 404);
    }

    if (doc.isPrimary || doc.documentType === 'student_details_form') {
      return sendError(res, 'The Student Details Form is system-maintained and cannot be reviewed.', 400);
    }

    const student = await Student.findById(doc.studentId);
    if (!student) {
      return sendError(res, 'The owning student record no longer exists.', 404);
    }

    // A mentor can only review documents of currently-assigned mentees.
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    doc.verificationStatus = verificationStatus;
    if (verificationStatus === 'Rejected') {
      doc.rejectionReason = rejectionReason.trim();
      doc.rejectedBy = req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)
        ? new mongoose.Types.ObjectId(req.user.id)
        : undefined;
      doc.rejectedDate = new Date();
    } else if (verificationStatus === 'Verified') {
      doc.rejectionReason = '';
      doc.rejectedBy = undefined;
      doc.rejectedDate = undefined;
    }

    await doc.save();

    await logAudit({
      userId: req.user!.id,
      action: verificationStatus === 'Verified' ? 'VERIFY_DOCUMENT' : 'REJECT_DOCUMENT',
      entity: 'DOCUMENT',
      entityId: doc._id.toString(),
      details: { verificationStatus, rejectionReason: doc.rejectionReason },
      req,
    });

    return sendSuccess(
      res,
      { id: doc._id.toString(), verificationStatus: doc.verificationStatus, rejectionReason: doc.rejectionReason },
      `Document marked as ${verificationStatus}.`
    );
  } catch (err: any) {
    console.error('verifyDocument error:', err);
    return sendError(res, 'Failed to update document verification status.', 500);
  }
}

// 6. Delete all documents for a student (Admin only)
export async function deleteAllStudentDocuments(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  try {
    const student = await findStudent(studentId);
    if (!student) {
      return sendError(res, 'Student account not found.', 404);
    }

    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const docs = await StudentDocument.find({ studentId: student._id });
    let deletedCount = 0;
    let retainedPrimary = 0;
    const failedFiles: string[] = [];

    for (const doc of docs) {
      // The Student Details Form is a system-generated artefact, not an
      // uploaded document. It is retained deliberately and reported as such.
      if (doc.isPrimary || doc.documentType === 'student_details_form') {
        retainedPrimary++;
        continue;
      }

      await StudentDocument.findByIdAndDelete(doc._id);
      deletedCount++;

      const filePath = resolveStoredPath(doc.fileUrl);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          failedFiles.push(doc.fileName);
        }
      }
    }

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_ALL_STUDENT_DOCUMENTS',
      entity: 'DOCUMENT',
      entityId: student._id.toString(),
      details: { deletedCount, retainedPrimary, registerNumber: student.registerNumber },
      req,
    });

    // Honest, explicit message — never claim more than was actually removed.
    const message = retainedPrimary
      ? `All uploaded documents except the Student Details Form were deleted (${deletedCount} deleted, 1 system-generated form retained).`
      : `All student documents deleted (${deletedCount} removed).`;

    if (failedFiles.length) {
      return sendSuccess(
        res,
        { deletedCount, retainedPrimary, failedFiles },
        `${message} ${failedFiles.length} stored file(s) could not be removed from disk.`
      );
    }

    return sendSuccess(res, { deletedCount, retainedPrimary, failedFiles }, message);
  } catch (err: any) {
    console.error('deleteAllStudentDocuments error:', err);
    return sendError(res, 'Failed to delete student documents: ' + err.message, 500);
  }
}
