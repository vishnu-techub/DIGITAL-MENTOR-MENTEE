import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { ROLES } from '../../config/constants.js';
import {
  generateStudentTemplate,
  generateFacultyTemplate,
  validateStudentExcel,
  validateFacultyExcel,
  executeStudentImport,
  executeFacultyImport,
  generateErrorReport,
} from './bulk-upload.service.js';

/* -------------------------------------------------------------------------
 * Multer in-memory upload handler for .xlsx files
 * ------------------------------------------------------------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB cap
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const isXlsxExt = /\.xlsx$/i.test(file.originalname);
    const validMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
      'application/zip',
    ];
    if (isXlsxExt || validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx) files are supported. CSV and other formats are not accepted.'));
    }
  },
});

export const bulkUploadFileMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return sendError(res, 'File exceeds the maximum 10 MB upload ceiling.', 400);
        }
        return sendError(res, `Upload error: ${err.message}`, 400);
      }
      return sendError(res, err.message || 'Invalid file uploaded.', 400);
    }
    next();
  });
};

/* -------------------------------------------------------------------------
 * 1. Download Templates
 * ------------------------------------------------------------------------- */

export async function downloadStudentTemplateHandler(req: AuthRequest, res: Response) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to download this template.', 403);
  }
  try {
    const buffer = await generateStudentTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="KSRCE_Student_Bulk_Upload_Template.xlsx"'
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('downloadStudentTemplateHandler error:', err);
    return sendError(res, 'Failed to generate student template.', 500);
  }
}

export async function downloadFacultyTemplateHandler(req: AuthRequest, res: Response) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to download this template.', 403);
  }
  try {
    const buffer = await generateFacultyTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="KSRCE_Faculty_Bulk_Upload_Template.xlsx"'
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('downloadFacultyTemplateHandler error:', err);
    return sendError(res, 'Failed to generate faculty template.', 500);
  }
}

/* -------------------------------------------------------------------------
 * 2. Validate Excel Uploads (Preview)
 * ------------------------------------------------------------------------- */

export async function validateStudentsHandler(req: AuthRequest, res: Response) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to validate student imports.', 403);
  }
  if (!req.file || !req.file.buffer) {
    return sendError(res, 'Please select an Excel (.xlsx) file to upload.', 400);
  }
  if (!/\.xlsx$/i.test(req.file.originalname)) {
    return sendError(res, 'Only .xlsx files are supported. CSV and other formats are not accepted.', 400);
  }

  try {
    const result = await validateStudentExcel(req.file.buffer);
    return sendSuccess(res, result, 'Student Excel file validated successfully.');
  } catch (err: any) {
    console.error('validateStudentsHandler error:', err);
    return sendError(res, err.message || 'Failed to parse student Excel file.', 400);
  }
}

export async function validateFacultyHandler(req: AuthRequest, res: Response) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to validate faculty imports.', 403);
  }
  if (!req.file || !req.file.buffer) {
    return sendError(res, 'Please select an Excel (.xlsx) file to upload.', 400);
  }
  if (!/\.xlsx$/i.test(req.file.originalname)) {
    return sendError(res, 'Only .xlsx files are supported. CSV and other formats are not accepted.', 400);
  }

  try {
    const result = await validateFacultyExcel(req.file.buffer);
    return sendSuccess(res, result, 'Faculty Excel file validated successfully.');
  } catch (err: any) {
    console.error('validateFacultyHandler error:', err);
    return sendError(res, err.message || 'Failed to parse faculty Excel file.', 400);
  }
}

/* -------------------------------------------------------------------------
 * 3. Execute Imports
 * ------------------------------------------------------------------------- */

export async function importStudentsHandler(req: AuthRequest, res: Response) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to execute student bulk import.', 403);
  }

  let rowsToImport = req.body.rows;

  // If a file was uploaded directly instead of pre-validated rows
  if ((!rowsToImport || !Array.isArray(rowsToImport)) && req.file?.buffer) {
    const validation = await validateStudentExcel(req.file.buffer);
    rowsToImport = validation.rows;
  }

  if (!rowsToImport || !Array.isArray(rowsToImport) || rowsToImport.length === 0) {
    return sendError(res, 'No student rows provided for import.', 400);
  }

  try {
    const result = await executeStudentImport(rowsToImport, req.user!.id, req);
    return sendSuccess(res, result, 'Student bulk import executed successfully.');
  } catch (err: any) {
    console.error('importStudentsHandler error:', err);
    return sendError(res, err.message || 'Failed to execute student bulk import.', 500);
  }
}

export async function importFacultyHandler(req: AuthRequest, res: Response) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to execute faculty bulk import.', 403);
  }

  let rowsToImport = req.body.rows;

  if ((!rowsToImport || !Array.isArray(rowsToImport)) && req.file?.buffer) {
    const validation = await validateFacultyExcel(req.file.buffer);
    rowsToImport = validation.rows;
  }

  if (!rowsToImport || !Array.isArray(rowsToImport) || rowsToImport.length === 0) {
    return sendError(res, 'No faculty rows provided for import.', 400);
  }

  try {
    const result = await executeFacultyImport(rowsToImport, req.user!.id, req);
    return sendSuccess(res, result, 'Faculty bulk import executed successfully.');
  } catch (err: any) {
    console.error('importFacultyHandler error:', err);
    return sendError(res, err.message || 'Failed to execute faculty bulk import.', 500);
  }
}

/* -------------------------------------------------------------------------
 * 4. Download Error Report
 * ------------------------------------------------------------------------- */

export async function downloadErrorReportHandler(req: AuthRequest, res: Response) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'You are not authorized to download error reports.', 403);
  }

  const { results, type = 'STUDENTS' } = req.body || {};
  if (!results || !Array.isArray(results) || results.length === 0) {
    return sendError(res, 'No issue records provided for the error report.', 400);
  }

  try {
    const buffer = await generateErrorReport(results, type === 'FACULTY' ? 'FACULTY' : 'STUDENTS');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="KSRCE_Bulk_Upload_${type}_Error_Report.xlsx"`
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('downloadErrorReportHandler error:', err);
    return sendError(res, 'Failed to generate error report.', 500);
  }
}
