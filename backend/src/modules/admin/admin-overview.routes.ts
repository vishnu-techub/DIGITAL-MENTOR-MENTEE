import { Router } from 'express';
import {
  getAdminMentoringDashboard,
  getAdminHodOverview,
  getAdminDepartmentOverview,
  getAdminDepartmentComparison,
  getAdminDepartmentDetail,
  getAdminDepartmentMentors,
  getAdminMentorDetail,
  getAdminReport30Day,
} from './admin-overview.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

/**
 * ============================================================================
 * /api/admin/overview — college-wide mentoring dashboard (ADMIN only)
 * ============================================================================
 *
 * Mounted as its own router (rather than inside `admin.routes.ts`) so the
 * college-wide mentoring surface is auditable in one place and cannot silently
 * inherit a looser guard from a neighbouring CRUD route.
 *
 * `authenticate` then `authorize(ROLES.ADMIN)` is the SERVER-side guarantee:
 * a HOD, mentor (FACULTY) or Student receives 403 even if the client renders
 * the admin menu. Every handler additionally re-checks `req.user.role`.
 *
 * HOD department scoping is unaffected — HODs read `/api/hod/*`, which is a
 * separate router with its own hard `departmentId` scope.
 */
const router = Router();

router.use(authenticate);
router.use(authorize(ROLES.ADMIN));

// Level 1 — Admin college-wide overview (totals + coverage pie + weekly trend)
router.get('/dashboard', getAdminMentoringDashboard);

// HOD overview — one row per HOD login with that HOD's department figures
router.get('/hods', getAdminHodOverview);

// Department overview — one row per department
router.get('/departments', getAdminDepartmentOverview);

// Department comparison — highest coverage first, for the college-wide bar view
router.get('/department-comparison', getAdminDepartmentComparison);

// Drill-down: Admin -> Department -> HOD -> Mentor
router.get('/departments/:departmentId', getAdminDepartmentDetail);
router.get('/departments/:departmentId/mentors', getAdminDepartmentMentors);

// Drill-down: Mentor -> Student
router.get('/mentors/:mentorId', getAdminMentorDetail);

// Department-wise 30-day report
router.get('/report-30-day', getAdminReport30Day);

export default router;