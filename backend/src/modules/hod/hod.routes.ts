import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { ROLES } from '../../config/constants.js';
import { sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import {
  getHodDashboard,
  getMentorWiseCoverage,
  getMentorDetail,
  getWeeklyProgress,
  getReport30Day,
  getDepartmentOverview,
  getHodFaculty,
  createHodFaculty,
  updateHodFaculty,
  getHodStudents,
  createHodStudent,
  updateHodStudent,
  createHodAssignment,
  removeHodAssignment,
  getFacultyNotifications,
  getDepartmentNotifications,
} from './hod.controller.js';

const router = Router();

/**
 * Every route below is HOD-only AND department-scoped.
 *
 * The guard refuses a HOD token that carries no `departmentId` claim, so an
 * unscoped account can never reach institution-wide data. The controller then
 * applies `department: <hod departmentId>` inside every query — this layer is
 * the authentication/role gate, not the data scope.
 */
function requireHod(req: AuthRequest, res: any, next: any) {
  if (!req.user || req.user.role !== ROLES.HOD) {
    return sendError(res, 'Access denied. HOD access required.', 403);
  }
  if (!req.user.departmentId) {
    return sendError(res, 'Your account is not linked to a department. HOD access requires one.', 403);
  }
  next();
}

router.use(authenticate, requireHod);

// --- Analytics (all derived from stored records) ---------------------------
router.get('/dashboard', getHodDashboard);
router.get('/mentor-wise', getMentorWiseCoverage);
router.get('/mentor/:mentorId', getMentorDetail);
router.get('/weekly-progress', getWeeklyProgress);
router.get('/report-30-day', getReport30Day);
router.get('/department-overview', getDepartmentOverview);

// --- Faculty (own department only) -----------------------------------------
router.get('/faculty', getHodFaculty);
router.post('/faculty', createHodFaculty);
router.put('/faculty/:facultyId', updateHodFaculty);

// --- Students (own department only) ----------------------------------------
router.get('/students', getHodStudents);
router.post('/students', createHodStudent);
router.put('/students/:studentId', updateHodStudent);

// --- Mentor assignment (own department only) -------------------------------
router.post('/mentor-assignments', createHodAssignment);
router.patch('/mentor-assignments/:assignmentId/remove', removeHodAssignment);

// --- Faculty notifications, visible to the HOD -----------------------------
router.get('/faculty-notifications', getFacultyNotifications);

// --- Notices this department's faculty SENT to the HOD ---------------------
// Department scope + recipient scope are both applied inside the controller's
// Mongo filter; a HOD can never read another department's notices here.
router.get('/notifications', getDepartmentNotifications);

export default router;