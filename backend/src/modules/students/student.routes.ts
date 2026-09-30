import { Router } from 'express';
import {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  updateStudentYearSection,
  updateStudentAcademics,
  clearArrear,
  deleteStudent,
  submitStudentProfile,
  resetStudentPassword,
  toggleStudentStatus,
} from './student.controller.js';
import {
  createIdentityEditRequest,
  getMyIdentityEditRequests,
} from './student-edit-request.controller.js';
import {
  createAcademicEditRequest,
  getMyAcademicEditRequests,
  listAcademicEditRequests,
  getAcademicEditRequestById,
  approveAcademicEditRequest,
  rejectAcademicEditRequest,
} from './academic-edit-request.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// ---------------------------------------------------------------------------
// Academic Edit Requests (the ONLY route by which a student changes CGPA/SGPA)
// ---------------------------------------------------------------------------
router.post('/academic-edit-request', authorize(ROLES.STUDENT), createAcademicEditRequest);
router.get('/academic-edit-request/my', authorize(ROLES.STUDENT), getMyAcademicEditRequests);
router.get(
  '/academic-edit-request',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  listAcademicEditRequests
);
router.get(
  '/academic-edit-request/:id',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN, ROLES.STUDENT),
  getAcademicEditRequestById
);
router.patch(
  '/academic-edit-request/:id/approve',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  approveAcademicEditRequest
);
router.patch(
  '/academic-edit-request/:id/reject',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  rejectAcademicEditRequest
);

// ---------------------------------------------------------------------------
// Institutional Identity Correction Requests
// ---------------------------------------------------------------------------
router.post('/identity-edit-request', authorize(ROLES.STUDENT), createIdentityEditRequest);
router.get('/identity-edit-request/my', authorize(ROLES.STUDENT), getMyIdentityEditRequests);

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

// Student first-login complete profile
router.post('/complete-profile', authorize(ROLES.STUDENT, ROLES.ADMIN), submitStudentProfile);
router.post('/:id/complete-profile', authorize(ROLES.STUDENT, ROLES.ADMIN), submitStudentProfile);

// Directory listing (Admin, HOD, own assigned mentees only — scoped in controller)
router.get('/', authorize(ROLES.ADMIN, ROLES.HOD, ROLES.FACULTY), getStudents);

// Admin reset student password
router.post('/:id/reset-password', authorize(ROLES.ADMIN), resetStudentPassword);

// Admin toggle student active status
router.patch('/:id/toggle-status', authorize(ROLES.ADMIN), toggleStudentStatus);

// Add student with permanent ID (Admin only)
router.post('/', authorize(ROLES.ADMIN), createStudent);

/**
 * Detailed profile. Ownership rules are enforced in the controller:
 * student = self, mentor = assigned mentee, HOD = own department, admin = all.
 */
router.get('/:id', getStudentById);

/**
 * Update profile info.
 *
 * Students MAY use this for their own personal/contact details (mobile, email,
 * address, parent details, blood group). The controller enforces a strict
 * allow-list for students: Register Number / Department / Batch are rejected
 * (Identity Edit Request), and CGPA / SGPA / arrears are rejected (Academic
 * Edit Request). Year and Section are also available via the dedicated
 * self-service route below.
 */
router.put('/:id', authorize(ROLES.STUDENT, ROLES.ADMIN, ROLES.FACULTY, ROLES.HOD), updateStudent);

/**
 * Year / Section self-service. Students may edit ONLY these two fields.
 * The controller rejects any CGPA/SGPA/arrear payload with 403.
 */
router.put('/:id/year-section', authorize(ROLES.STUDENT, ROLES.ADMIN, ROLES.FACULTY, ROLES.HOD), updateStudentYearSection);

/**
 * Update Semester 1-8 academics and school marks.
 * Students are excluded: CGPA/SGPA/arrears must go through an Academic Edit
 * Request approved by the assigned mentor.
 */
router.put('/:id/academics', authorize(ROLES.ADMIN, ROLES.FACULTY, ROLES.HOD), updateStudentAcademics);

// Clear an arrear in a specific semester preserving historical records (Admin, Faculty, HOD)
router.post('/:id/clear-arrear', authorize(ROLES.ADMIN, ROLES.FACULTY, ROLES.HOD), clearArrear);

// Admin delete student account and all related records
router.delete('/:id', authorize(ROLES.ADMIN), deleteStudent);

export default router;
