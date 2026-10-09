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
  reassignFacultyDepartment,
  getSystemSettings,
  updateSystemSettings,
  getMenteesByMentor,
  getStudentsForAssignment,
  assignMenteesToMentor,
  removeAssignment,
  deleteAllDocuments,
} from './admin.controller.js';
import {
  getHodList,
  createHod,
  updateHod,
  setHodStatus,
} from './admin-hod.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Secure all admin routes
router.use(authenticate);

// Dashboard statistics. College-wide aggregates plus the recent audit trail,
// so the endpoint is Administrator-only. HODs read their own department
// figures from the department-scoped /api/hod/dashboard surface instead.
router.get('/dashboard-stats', authorize(ROLES.ADMIN), getAdminDashboardStats);

// Departments
// ADMIN only. Identity dropdowns for other roles now use the non-admin-safe
// `GET /api/reference/departments`, so this list — which carries student and
// faculty counts — is no longer reachable by a Student / Faculty / HOD account.
router.get('/departments', authorize(ROLES.ADMIN), getDepartments);
router.post('/departments', authorize(ROLES.ADMIN), createDepartment);

// Batches
router.get('/batches', authorize(ROLES.ADMIN), getBatches);
router.post('/batches', authorize(ROLES.ADMIN), createBatch);

// Faculty
router.get('/faculty', authorize(ROLES.ADMIN, ROLES.HOD), getFacultyList);
router.post('/faculty', authorize(ROLES.ADMIN), createFaculty);
router.patch('/faculty/:facultyId/toggle-status', authorize(ROLES.ADMIN), toggleFacultyStatus);
router.patch('/faculty/:facultyId/department', authorize(ROLES.ADMIN), reassignFacultyDepartment);
router.delete('/faculty/:facultyId', authorize(ROLES.ADMIN), deleteFaculty);

// HOD Management — strictly ADMIN. A HOD must never be able to mint, edit or
// deactivate another HOD, and every handler below re-checks the role as well,
// so these functions stay Admin-only even if re-mounted elsewhere. Deactivate
// is a status flip only: no route here deletes a User or any historical record.
router.get('/hods', authorize(ROLES.ADMIN), getHodList);
router.post('/hods', authorize(ROLES.ADMIN), createHod);
router.put('/hods/:hodId', authorize(ROLES.ADMIN), updateHod);
router.patch('/hods/:hodId/status', authorize(ROLES.ADMIN), setHodStatus);

// Mentor/Mentee Assignment Management
router.get('/mentors/:mentorId/mentees', authorize(ROLES.ADMIN, ROLES.HOD), getMenteesByMentor);
router.get('/students', authorize(ROLES.ADMIN, ROLES.HOD), getStudentsForAssignment);
router.post('/mentors/:mentorId/assign-mentees', authorize(ROLES.ADMIN), assignMenteesToMentor);
router.patch('/mentor-assignments/:assignmentId/remove', authorize(ROLES.ADMIN), removeAssignment);

// Institutional Saturday Settings
router.get('/settings', authorize(ROLES.ADMIN), getSystemSettings);
router.put('/settings', authorize(ROLES.ADMIN), updateSystemSettings);

// Global purge of the Student Document repository.
// `authenticate` is applied router-wide above; `authorize(ROLES.ADMIN)` is the
// server-side guarantee that Student / Faculty / Mentor / HOD are rejected with
// 403 regardless of what the frontend renders.
router.delete('/documents/all', authorize(ROLES.ADMIN), deleteAllDocuments);

// Mentee Institutional Identity Edit Requests (Admin review)
import {
  getAdminIdentityEditRequests,
  reviewIdentityEditRequest,
} from '../students/student-edit-request.controller.js';

router.get('/identity-edit-requests', authorize(ROLES.ADMIN), getAdminIdentityEditRequests);
router.put('/identity-edit-requests/:id/review', authorize(ROLES.ADMIN), reviewIdentityEditRequest);

// Bulk Upload (Excel .xlsx only, Admin only)
import {
  downloadStudentTemplateHandler,
  downloadFacultyTemplateHandler,
  validateStudentsHandler,
  validateFacultyHandler,
  importStudentsHandler,
  importFacultyHandler,
  downloadErrorReportHandler,
  bulkUploadFileMiddleware,
} from './bulk-upload.controller.js';

// Route order matches the client (`api.bulkUpload.*`) and the documented contract:
// /bulk-upload/<type>/<action>.
router.get('/bulk-upload/students/template', authorize(ROLES.ADMIN), downloadStudentTemplateHandler);
router.get('/bulk-upload/faculty/template', authorize(ROLES.ADMIN), downloadFacultyTemplateHandler);
router.post('/bulk-upload/students/validate', authorize(ROLES.ADMIN), bulkUploadFileMiddleware, validateStudentsHandler);
router.post('/bulk-upload/faculty/validate', authorize(ROLES.ADMIN), bulkUploadFileMiddleware, validateFacultyHandler);
router.post('/bulk-upload/students/import', authorize(ROLES.ADMIN), bulkUploadFileMiddleware, importStudentsHandler);
router.post('/bulk-upload/faculty/import', authorize(ROLES.ADMIN), bulkUploadFileMiddleware, importFacultyHandler);
router.post('/bulk-upload/error-report', authorize(ROLES.ADMIN), downloadErrorReportHandler);

export default router;
