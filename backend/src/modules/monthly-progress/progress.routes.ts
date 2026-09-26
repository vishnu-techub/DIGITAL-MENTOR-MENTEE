import { Router } from 'express';
import { getMonthlyProgress, createMonthlyProgress } from './progress.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/:studentId', getMonthlyProgress);
router.post('/', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), createMonthlyProgress);

export default router;
