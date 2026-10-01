import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  createStudentProgress,
  getStudentProgressList,
  updateStudentProgress,
  deleteStudentProgress,
  submitStudentProgress,
  getMenteeProgressForMentor,
  verifyMenteeProgress,
  progressUploadMiddleware,
} from './student-progress.controller.js';

const router = Router();

router.use(authenticate);

// Student endpoints
router.post(
  '/',
  authorize(ROLES.STUDENT, ROLES.ADMIN, ROLES.HOD),
  progressUploadMiddleware.single('certificate'),
  createStudentProgress
);

router.get(
  '/',
  authorize(ROLES.STUDENT, ROLES.ADMIN, ROLES.HOD),
  getStudentProgressList
);

router.put(
  '/:id',
  authorize(ROLES.STUDENT, ROLES.ADMIN, ROLES.HOD),
  progressUploadMiddleware.single('certificate'),
  updateStudentProgress
);

router.delete(
  '/:id',
  authorize(ROLES.STUDENT, ROLES.ADMIN, ROLES.HOD),
  deleteStudentProgress
);

// Student submits an editable achievement for mentor review.
// Owner-only at the route: a mentor/HOD/admin can review the record but must
// never be able to push it into the review queue on the student's behalf.
router.post(
  '/:id/submit',
  authorize(ROLES.STUDENT),
  submitStudentProgress
);

export default router;
