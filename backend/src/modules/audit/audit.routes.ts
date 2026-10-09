import { Router } from 'express';
import { getAuditLogs } from './audit.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);
// The institutional audit trail records privileged actions (usernames, IP
// addresses) across every department, so it is Administrator-only. HODs have
// their own department-scoped surfaces and must not read the full trail.
router.get('/', authorize(ROLES.ADMIN), getAuditLogs);

export default router;
