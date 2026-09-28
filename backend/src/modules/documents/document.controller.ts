import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { StudentDocument, Student, User } from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import { syncStudentDetailsPdf } from './student-details-pdf.service.js';

// Ensure upload directory exists
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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
    cb(null, `doc-${uniqueSuffix}-${sanitizedName}${ext}`);
  },
});

// File validation filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file format. Please upload PDF, JPG, JPEG, or PNG files only.'));
  }
};

export const documentUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// 1. Upload Student Certificate / Document
export async function uploadDocument(req: AuthRequest, res: Response) {
  const file = req.file;
  if (!file) {
    return sendError(res, 'No file uploaded or file rejected due to unsupported format.', 400);
  }

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

  const effectiveTitle = (title || file.originalname || 'Certificate').trim();
  const effectiveCategory = (category || 'Other').trim();

  try {
    // Resolve target student using permanent studentId
    let targetStudentId = bodyStudentId;
    if (req.user?.role === ROLES.STUDENT) {
      targetStudentId = req.user.studentId;
    }

    if (!targetStudentId) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return sendError(res, 'Permanent studentId is required.', 400);
    }

    let student = null;
    if (mongoose.Types.ObjectId.isValid(targetStudentId)) {
      student = await Student.findById(targetStudentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: targetStudentId });
    }

    if (!student) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return sendError(res, 'Student record not found.', 404);
    }

    // Relative URL for serving static file
    const fileUrl = `/uploads/documents/${file.filename}`;
    const docType = reqDocType === 'other' ? 'other' : 'certificate';

    const newDoc = await StudentDocument.create({
      studentId: student._id, // Linked strictly by permanent studentId
      documentType: docType,
      isPrimary: false,
      fileName: file.originalname,
      fileUrl,
      fileType: file.mimetype,
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
        fileName: file.originalname,
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
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    console.error('uploadDocument error:', err);
    return sendError(res, 'Failed to save document metadata: ' + err.message, 500);
  }
}

// 2. Get Documents for a specific Student
export async function getStudentDocuments(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  try {
    let student = null;
    if (mongoose.Types.ObjectId.isValid(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }

    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    // Strict student scoping: students can only view their own
    if (req.user?.role === ROLES.STUDENT) {
      const isOwner =
        req.user.studentId === student._id.toString() ||
        req.user.studentId === student.registerNumber;
      if (!isOwner) {
        return sendError(res, 'Access denied: You can only view your own documents.', 403);
      }
    }

    // Auto-generate initial Student Details Form once if student has completed profile but doc doesn't exist
    const existingForm = await StudentDocument.findOne({
      studentId: student._id,
      $or: [{ isPrimary: true }, { documentType: 'student_details_form' }],
    });
    if (!existingForm && student.profileCompleted) {
      await syncStudentDetailsPdf(student._id);
    }

    // Document Order: Student Details Form (isPrimary: true) ALWAYS first,
    // then certificates/other documents sorted by newest uploaded date
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
      fileUrl: d.fileUrl,
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

// 3. Download / Stream Document File
export async function downloadDocument(req: AuthRequest, res: Response) {
  const documentId = req.params.documentId as string;

  try {
    const doc = await StudentDocument.findById(documentId);
    if (!doc) {
      return sendError(res, 'Document not found.', 404);
    }

    const filePath = path.resolve(process.cwd(), doc.fileUrl.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'Physical file not found on server.', 404);
    }

    res.setHeader('Content-Type', doc.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    return res.sendFile(filePath);
  } catch (err: any) {
    console.error('downloadDocument error:', err);
    return sendError(res, 'Failed to download document file.', 500);
  }
}

// 4. Delete Document (Students can only delete their own)
export async function deleteDocument(req: AuthRequest, res: Response) {
  const documentId = req.params.documentId as string;

  try {
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

    // Authorization
    if (req.user?.role === ROLES.STUDENT) {
      const student = await Student.findById(doc.studentId);
      const isOwner =
        student &&
        (req.user.studentId === student._id.toString() ||
          req.user.studentId === student.registerNumber);
      if (!isOwner) {
        return sendError(res, 'Access denied: You can only delete your own documents.', 403);
      }
    }

    // Delete physical file
    const filePath = path.resolve(process.cwd(), doc.fileUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await StudentDocument.findByIdAndDelete(documentId);

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_DOCUMENT',
      entity: 'DOCUMENT',
      entityId: documentId,
      details: { title: doc.title, fileName: doc.fileName },
      req,
    });

    return sendSuccess(res, null, 'Document deleted successfully.');
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
    const doc = await StudentDocument.findById(documentId);
    if (!doc) {
      return sendError(res, 'Document record not found.', 404);
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
      details: {
        verificationStatus,
        rejectionReason: doc.rejectionReason,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        id: doc._id.toString(),
        verificationStatus: doc.verificationStatus,
        rejectionReason: doc.rejectionReason,
      },
      `Document marked as ${verificationStatus}.`
    );
  } catch (err: any) {
    console.error('verifyDocument error:', err);
    return sendError(res, 'Failed to update document verification status.', 500);
  }
}
