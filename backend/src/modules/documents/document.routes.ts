import { Router } from 'express';
import {
  uploadDocument,
  getStudentDocuments,
  downloadDocument,
  viewDocumentFile,
  deleteDocument,
  deleteAllStudentDocuments,
  verifyDocument,
  updateDocument,
  documentUploadMiddleware,
} from './document.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Require authentication for every document route. Certificates are private
// student data; no document endpoint is reachable anonymously.
router.use(authenticate);

// 1. Upload certificate / document.
//    Target student is verified in the controller (students cannot spoof it).
router.post(
  '/upload',
  authorize(ROLES.STUDENT, ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  documentUploadMiddleware.single('file'),
  uploadDocument
);

// 2. List documents for a specific student.
//    Scoped in the controller: self / assigned mentee / own department / admin.
router.get('/student/:studentId', getStudentDocuments);

// 3. Delete all uploaded documents for a student (Admin only)
router.delete(
  '/student/:studentId/all',
  authorize(ROLES.ADMIN),
  deleteAllStudentDocuments
);

// 4. Inline file view (PDF/images render in the browser, never auto-download)
router.get('/:documentId/file', viewDocumentFile);

// 5. Forced download
router.get('/:documentId/download', downloadDocument);

// 6. Delete document (owner or admin/assigned mentor/HOD per controller rules)
router.delete('/:documentId', deleteDocument);

// 7. Edit / re-submit a certificate.
//    A REJECTED certificate must be correctable; the controller resets it to
//    Pending and refuses any edit of a mentor-confirmed (Verified) one.
router.put('/:documentId', updateDocument);

// 8. Verification status review (Mentor of record, Admin, HOD)
router.patch(
  '/:documentId/verify',
  authorize(ROLES.FACULTY, ROLES.ADMIN, ROLES.HOD),
  verifyDocument
);

export default router;
