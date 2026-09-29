import { Router } from 'express';
import {
  uploadDocument,
  getStudentDocuments,
  downloadDocument,
  deleteDocument,
  deleteAllStudentDocuments,
  verifyDocument,
  documentUploadMiddleware,
} from './document.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Require authentication for all document routes
router.use(authenticate);

// 1. Upload certificate / document (Student, Faculty, Admin)
router.post(
  '/upload',
  documentUploadMiddleware.single('file'),
  uploadDocument
);

// 2. List documents for a specific student (Student itself, Mentor, Admin, HOD)
router.get('/student/:studentId', getStudentDocuments);

// 3. Download document file
router.get('/:documentId/download', downloadDocument);

// 4. Delete document (Student can delete own; Admin can delete any)
router.delete('/:documentId', deleteDocument);

// 5. Delete all uploaded documents for a student (Admin only)
router.delete(
  '/student/:studentId/all',
  authorize(ROLES.ADMIN),
  deleteAllStudentDocuments
);

// 6. Verification status review (Faculty Mentor, Admin, HOD)
router.patch(
  '/:documentId/verify',
  authorize(ROLES.FACULTY, ROLES.ADMIN, ROLES.HOD),
  verifyDocument
);

export default router;
