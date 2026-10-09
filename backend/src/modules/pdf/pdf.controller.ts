import { Response } from 'express';
import { generateStudentPdf, isStudentPdfMode, type StudentPdfMode } from './pdf.service.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { Student } from '../../models/index.js';
import { ROLES } from '../../config/constants.js';
import { isValidId, toLocalId, type LocalId } from '../../services/localId.js';

export async function downloadStudentPdf(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  // Three download modes share this endpoint; the default stays the complete
  // record book so every existing caller is unchanged. An unknown mode is
  // rejected rather than silently coerced, so a typo cannot download a report
  // the caller did not intend.
  const requestedMode = (req.query.mode as string | undefined) ?? 'full';
  if (!isStudentPdfMode(requestedMode)) {
    return sendError(
      res,
      'Invalid PDF mode. Expected one of: full, internal, mentor-documents.',
      400
    );
  }
  const mode: StudentPdfMode = requestedMode;

  try {
    let student = null;
    if (isValidId(studentId)) {
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

    const pdfBytes = await generateStudentPdf(student._id.toString(), mode);

    await logAudit({
      userId: req.user!.id,
      action: 'GENERATE_PDF',
      entity: 'STUDENT_PDF',
      entityId: student._id.toString(),
      details: { registerNumber: student.registerNumber, mode },
      req,
    });

    const safeRegNo = student.registerNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename =
      mode === 'internal'
        ? `KSRCE_Internal_Assessment_${safeRegNo}.pdf`
        : mode === 'mentor-documents'
          ? `KSRCE_Mentor_Documents_${safeRegNo}.pdf`
          : `KSRCE_Mentee_${safeRegNo}_Dossier.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.byteLength);

    return res.end(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error('downloadStudentPdf error:', err);
    return sendError(res, 'Unable to generate PDF report. Please try again.', 500);
  }
}
