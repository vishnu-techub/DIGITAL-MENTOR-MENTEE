import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  createStudentProgress,
  getStudentProgressList,
  updateStudentProgress,
  deleteStudentProgress,
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

export default router;
