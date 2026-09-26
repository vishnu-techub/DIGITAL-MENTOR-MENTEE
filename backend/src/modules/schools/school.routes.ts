import { Router } from 'express';
import {
  getSchools,
  getDistricts,
  getSchoolStats,
  getSchoolById,
  createSchool,
  updateSchool,
  toggleSchoolStatus,
  deleteSchool,
} from './school.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Public / Authenticated search (Students, Faculty, Admin, HOD can search without auth barriers)
router.get('/', optionalAuthenticate, getSchools);
router.get('/districts', optionalAuthenticate, getDistricts);
router.get('/stats', authenticate, authorize(ROLES.ADMIN, ROLES.HOD), getSchoolStats);
router.get('/:id', optionalAuthenticate, getSchoolById);

// Admin-only management endpoints
router.post('/', authenticate, authorize(ROLES.ADMIN), createSchool);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), updateSchool);
router.patch('/:id/toggle', authenticate, authorize(ROLES.ADMIN), toggleSchoolStatus);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), deleteSchool);

export default router;
