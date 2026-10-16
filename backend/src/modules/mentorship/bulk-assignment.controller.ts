/**
 * BULK MENTEE ASSIGNMENT — HTTP CONTROLLER
 * ============================================================================
 *
 * Thin HTTP layer over `bulk-assignment.service.ts`:
 *   GET  /api/mentorship/bulk/template?format=xlsx|csv
 *   POST /api/mentorship/bulk/validate   (multipart: file)
 *   POST /api/mentorship/bulk/assign     (JSON: rows, authorizeReassignments, reason)
 *   POST /api/mentorship/bulk/report     (JSON: type, format, rows)
 *
 * Every handler re-checks the role and the department scope on the server; the
 * frontend is never trusted for identity, department, permissions or statuses.
 */
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { ROLES } from '../../config/constants.js';
import {
  BULK_ASSIGN_MAX_FILE_BYTES,
  generateAssignmentTemplateXlsx,
  generateAssignmentTemplateCsv,
  parseAssignmentFile,
  normalizeRawRows,
  validateAssignmentRows,
  executeBulkAssignment,
  generateAssignmentReport,
} from './bulk-assignment.service.js';

/* -------------------------------------------------------------------------
 * Multer in-memory upload handler for .xlsx / .csv
 * ------------------------------------------------------------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: BULK_ASSIGN_MAX_FILE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const okExt = /\.(xlsx|csv)$/i.test(file.originalname);
    const validMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'text/plain',
      'application/octet-stream',
      'application/zip',
    ];
    if (okExt || validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx) and CSV (.csv) files are supported.'));
    }
  },
});

export const bulkAssignmentFileMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return sendError(
            res,
            `File exceeds the maximum ${Math.round(BULK_ASSIGN_MAX_FILE_BYTES / (1024 * 1024))} MB upload ceiling.`,
            400
          );
        }
        return sendError(res, `Upload error: ${err.message}`, 400);
      }
      return sendError(res, err.message || 'Invalid file uploaded.', 400);
    }
    next();
  });
};

/** Assignment endpoints are for ADMIN (college-wide) and HOD (own department). */
function ensureAssignerRole(req: AuthRequest, res: Response): boolean {
  const role = req.user?.role;
  if (role !== ROLES.ADMIN && role !== ROLES.HOD) {
    sendError(res, 'You are not authorized to bulk assign mentors.', 403);
    return false;
  }
  return true;
}

/* -------------------------------------------------------------------------
 * 1. Download templates
 * ------------------------------------------------------------------------- */

export async function downloadAssignmentTemplateHandler(req: AuthRequest, res: Response) {
  if (!ensureAssignerRole(req, res)) return;

  const format = String(req.query.format || 'xlsx').toLowerCase();
  try {
    if (format === 'csv') {
      const csv = generateAssignmentTemplateCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="KSRCE_Bulk_Mentee_Assignment_Template.csv"'
      );
      return res.send(csv);
    }

    const buffer = await generateAssignmentTemplateXlsx();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="KSRCE_Bulk_Mentee_Assignment_Template.xlsx"'
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('downloadAssignmentTemplateHandler error:', err);
    return sendError(res, 'Failed to generate the assignment template.', 500);
  }
}

/* -------------------------------------------------------------------------
 * 2. Validate an uploaded file (preview)
 * ------------------------------------------------------------------------- */

export async function validateAssignmentHandler(req: AuthRequest, res: Response) {
  if (!ensureAssignerRole(req, res)) return;
  if (!req.file || !req.file.buffer) {
    return sendError(res, 'Please select an Excel (.xlsx) or CSV (.csv) file to upload.', 400);
  }
  if (!/\.(xlsx|csv)$/i.test(req.file.originalname)) {
    return sendError(res, 'Only .xlsx and .csv files are supported.', 400);
  }

  try {
    const rawRows = await parseAssignmentFile(req.file.buffer, req.file.originalname);
    const result = await validateAssignmentRows(rawRows, req.user!);
    return sendSuccess(res, result, 'Assignment file validated successfully.');
  } catch (err: any) {
    console.error('validateAssignmentHandler error:', err);
    return sendError(res, err.message || 'Failed to parse the uploaded file.', 400);
  }
}

/* -------------------------------------------------------------------------
 * 3. Execute assignments
 * ------------------------------------------------------------------------- */

export async function assignBulkHandler(req: AuthRequest, res: Response) {
  if (!ensureAssignerRole(req, res)) return;

  const { rows, authorizeReassignments, reason } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return sendError(res, 'No assignment rows were provided.', 400);
  }
  if (authorizeReassignments === true && (!reason || String(reason).trim() === '')) {
    return sendError(res, 'A reason is required to authorise reassignments.', 400);
  }

  try {
    // Sanitise before validation so an oversized payload is refused early.
    normalizeRawRows(rows);

    const result = await executeBulkAssignment({
      rows,
      user: req.user!,
      req,
      authorizeReassignments: authorizeReassignments === true,
      reason: reason ? String(reason) : undefined,
    });

    const { summary } = result;
    let message: string;
    if (summary.successful === 0 && (summary.failed > 0 || summary.skipped > 0)) {
      message = 'No assignments were completed. Please review the reported reasons.';
    } else if (summary.failed > 0 || summary.skipped > 0) {
      message = `Completed ${summary.successful} of ${summary.totalRows} rows (${summary.reassigned} reassignment(s), ${summary.skipped} skipped, ${summary.failed} failed).`;
    } else {
      message = `All ${summary.successful} row(s) processed successfully (${summary.reassigned} reassignment(s)).`;
    }

    return sendSuccess(res, result, message);
  } catch (err: any) {
    console.error('assignBulkHandler error:', err);
    return sendError(res, err.message || 'Failed to execute bulk assignment.', 400);
  }
}

/* -------------------------------------------------------------------------
 * 4. Downloadable validation / result report
 * ------------------------------------------------------------------------- */

export async function assignmentReportHandler(req: AuthRequest, res: Response) {
  if (!ensureAssignerRole(req, res)) return;

  const { type, format, rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return sendError(res, 'No rows were provided for the report.', 400);
  }
  if (type !== 'VALIDATION' && type !== 'RESULT') {
    return sendError(res, 'Report type must be VALIDATION or RESULT.', 400);
  }

  try {
    const report = await generateAssignmentReport({
      type,
      format: String(format || 'CSV').toUpperCase() === 'XLSX' ? 'XLSX' : 'CSV',
      rows,
    });
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(report.buffer);
  } catch (err: any) {
    console.error('assignmentReportHandler error:', err);
    return sendError(res, 'Failed to generate the report.', 500);
  }
}
