import { Router } from 'express';
import { getAuditLogs } from './audit.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize(ROLES.ADMIN, ROLES.HOD), getAuditLogs);

export default router;
