import { Router } from 'express';
import {
  getAdminDashboardStats,
  getDepartments,
  createDepartment,
  getBatches,
  createBatch,
  getFacultyList,
  createFaculty,
  toggleFacultyStatus,
  deleteFaculty,
  getSystemSettings,
  updateSystemSettings,
  getMenteesByMentor,
  getStudentsForAssignment,
  assignMenteesToMentor,
  removeAssignment,
} from './admin.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Secure all admin routes
router.use(authenticate);

// Dashboard statistics
router.get('/dashboard-stats', authorize(ROLES.ADMIN, ROLES.HOD), getAdminDashboardStats);

// Departments
router.get('/departments', getDepartments);
router.post('/departments', authorize(ROLES.ADMIN), createDepartment);

// Batches
router.get('/batches', getBatches);
router.post('/batches', authorize(ROLES.ADMIN), createBatch);

// Faculty
router.get('/faculty', authorize(ROLES.ADMIN, ROLES.HOD), getFacultyList);
router.post('/faculty', authorize(ROLES.ADMIN), createFaculty);
router.patch('/faculty/:facultyId/toggle-status', authorize(ROLES.ADMIN), toggleFacultyStatus);
router.delete('/faculty/:facultyId', authorize(ROLES.ADMIN), deleteFaculty);

// Mentor/Mentee Assignment Management
router.get('/mentors/:mentorId/mentees', authorize(ROLES.ADMIN, ROLES.HOD), getMenteesByMentor);
router.get('/students', authorize(ROLES.ADMIN, ROLES.HOD), getStudentsForAssignment);
router.post('/mentors/:mentorId/assign-mentees', authorize(ROLES.ADMIN), assignMenteesToMentor);
router.patch('/mentor-assignments/:assignmentId/remove', authorize(ROLES.ADMIN), removeAssignment);

// Institutional Saturday Settings
router.get('/settings', getSystemSettings);
router.put('/settings', authorize(ROLES.ADMIN), updateSystemSettings);

// Mentee Institutional Identity Edit Requests (Admin review)
import {
  getAdminIdentityEditRequests,
  reviewIdentityEditRequest,
} from '../students/student-edit-request.controller.js';

router.get('/identity-edit-requests', authorize(ROLES.ADMIN), getAdminIdentityEditRequests);
router.put('/identity-edit-requests/:id/review', authorize(ROLES.ADMIN), reviewIdentityEditRequest);

export default router;
