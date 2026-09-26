import { Router } from 'express';
import { getDepartmentReport, exportStudentsCsv } from './report.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/departments', authorize(ROLES.ADMIN, ROLES.HOD), getDepartmentReport);
router.get('/export/csv', authorize(ROLES.ADMIN, ROLES.HOD, ROLES.FACULTY), exportStudentsCsv);

export default router;
