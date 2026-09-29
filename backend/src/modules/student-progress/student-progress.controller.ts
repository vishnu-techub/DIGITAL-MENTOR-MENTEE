import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { StudentProgress, ProgressCategory, ProgressLevel, ProgressStatus } from '../../models/StudentProgress.model.js';
import { Student } from '../../models/Student.model.js';
import { MentorAssignment } from '../../models/MentorAssignment.model.js';
import { Faculty } from '../../models/Faculty.model.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';

// Setup Uploads Directory for Progress Certificates
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'progress');
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
        const oldPath = path.resolve(process.cwd(), record.certificateUrl.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) {
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

    // Remove file if exists
    if (record.certificateUrl) {
      const filePath = path.resolve(process.cwd(), record.certificateUrl.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
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

    // Security check: If role is FACULTY, verify assignment is active
    if (req.user?.role === ROLES.FACULTY) {
      let facultyId = req.user.facultyId;
      if (!facultyId) {
        const fac = await Faculty.findOne({ user: req.user.id });
        if (fac) facultyId = fac._id.toString();
      }

      if (facultyId) {
        const assignment = await MentorAssignment.findOne({
          mentor: facultyId,
          student: studentId,
          status: 'ACTIVE',
        });

        if (!assignment) {
          return sendError(
            res,
            'Access denied: This mentee is not currently assigned to you. If reassignment occurred, access has shifted to the new mentor.',
            403
          );
        }
      }
    }

    const records = await StudentProgress.find({ studentId }).sort({ date: -1, createdAt: -1 });

    // Summary calculations
    const summary = {
      eventCertificates: records.filter((r) => r.category === 'Event Certificate').length,
      nptelCertificates: records.filter((r) => r.category === 'NPTEL Certificate').length,
      globalCertifications: records.filter((r) => r.category === 'Global Certification').length,
      hackathons: records.filter((r) => r.category === 'Hackathon Certificate').length,
      symposiums: records.filter((r) => r.category === 'Symposium Certificate').length,
      awards: records.filter((r) => r.category === 'Award Certificate').length,
      otherStatePrograms: records.filter((r) => r.category === 'Program attended in other state').length,
      extensionActivities: records.filter((r) => r.category === 'Extension Activity').length,
      extraCurricular: records.filter((r) => r.category === 'Extra Curricular').length,
      others: records.filter((r) => r.category === 'Other approved achievements/activities').length,
      pending: records.filter((r) => r.status === 'Pending').length,
      verified: records.filter((r) => r.status === 'Verified').length,
      rejected: records.filter((r) => r.status === 'Rejected').length,
      total: records.length,
    };

    return sendSuccess(res, {
      records,
      summary,
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
    const { status, rejectionReason } = req.body;

    if (!['Verified', 'Rejected', 'Pending'].includes(status)) {
      return sendError(res, 'Status must be Verified, Rejected, or Pending.', 400);
    }

    if (status === 'Rejected' && (!rejectionReason || !rejectionReason.trim())) {
      return sendError(res, 'Rejection reason is required when rejecting a progress record.', 400);
    }

    // Security check for Faculty mentor
    let reviewerFaculty: any = null;
    if (req.user?.role === ROLES.FACULTY) {
      reviewerFaculty = await Faculty.findOne({
        $or: [{ _id: req.user.facultyId }, { user: req.user.id }],
      }).populate('user');

      if (reviewerFaculty) {
        const assignment = await MentorAssignment.findOne({
          mentor: reviewerFaculty._id,
          student: studentId,
          status: 'ACTIVE',
        });
        if (!assignment) {
          return sendError(res, 'Access denied: You are not the active mentor for this mentee.', 403);
        }
      }
    }

    const record = await StudentProgress.findOne({ _id: id, studentId });
    if (!record) {
      return sendError(res, 'Progress record not found for this mentee.', 404);
    }

    record.status = status as ProgressStatus;
    if (status === 'Rejected') {
      record.rejectionReason = rejectionReason.trim();
    } else {
      record.rejectionReason = '';
    }

    record.reviewedBy = reviewerFaculty?._id || undefined;
    record.reviewerName = reviewerFaculty?.user?.fullName || req.user?.username || 'Mentor';
    record.reviewedAt = new Date();

    await record.save();

    await logAudit({
      userId: req.user!.id,
      action: 'VERIFY_STUDENT_PROGRESS',
      entity: 'STUDENT_PROGRESS',
      details: {
        progressId: record._id,
        studentId,
        status: record.status,
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
