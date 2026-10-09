import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  createAchievement,
  getAchievements,
  rejectAchievement,
  updateAchievement,
  verifyAchievement,
} from './achievement.controller.js';

/**
 * Achievement routes.
 *
 * Records and edits are open to the actor scoped by `loadAccessibleStudent`
 * (STUDENT = own, FACULTY = assigned mentee, HOD = own department, ADMIN = any).
 * Verification and rejection are mentor/HOD/ADMIN only.
 */

const router = Router();

router.use(authenticate);

router.get('/student/:studentId', authorize(ROLES.STUDENT, ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), getAchievements);
router.post('/student/:studentId', authorize(ROLES.STUDENT, ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), createAchievement);

router.put('/:id', authorize(ROLES.STUDENT, ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), updateAchievement);
router.post('/:id/verify', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), verifyAchievement);
router.post('/:id/reject', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), rejectAchievement);

export default router;