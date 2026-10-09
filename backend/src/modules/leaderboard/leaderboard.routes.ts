import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  getLeaderboard,
  getStudentLeaderboardDetail,
} from './leaderboard.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize(ROLES.STUDENT, ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), getLeaderboard);
router.get('/student/:studentId', authorize(ROLES.STUDENT, ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), getStudentLeaderboardDetail);

export default router;