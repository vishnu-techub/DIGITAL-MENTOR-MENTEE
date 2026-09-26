import { Response } from 'express';
import mongoose from 'mongoose';
import { generateStudentPdf } from './pdf.service.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { Student } from '../../models/index.js';
import { ROLES } from '../../config/constants.js';

export async function downloadStudentPdf(req: AuthRequest, res: Response) {
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

    // RBAC: Verify authorization
    if (req.user?.role === ROLES.STUDENT && req.user.studentId) {
      const isOwner =
        req.user.studentId === student._id.toString() ||
        req.user.studentId === student.registerNumber;
      if (!isOwner) {
        return sendError(res, 'You are not authorized to download this student report.', 403);
      }
    }

    if (req.user?.role === ROLES.HOD && req.user.departmentId) {
      const deptId = student.department?.toString();
      if (deptId !== req.user.departmentId) {
        return sendError(res, 'Access denied: Department boundary violation.', 403);
      }
    }

    const pdfBytes = await generateStudentPdf(student._id.toString());

    await logAudit({
      userId: req.user!.id,
      action: 'GENERATE_PDF',
      entity: 'STUDENT_PDF',
      entityId: student._id.toString(),
      details: { registerNumber: student.registerNumber },
      req,
    });

    const safeRegNo = student.registerNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `KSRCE_Mentee_${safeRegNo}_Dossier.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.byteLength);

    return res.end(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error('downloadStudentPdf error:', err);
    return sendError(res, 'Unable to generate PDF report. Please try again.', 500);
  }
}
