import { Router } from 'express';
import {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  updateStudentAcademics,
  clearArrear,
  deleteStudent,
  submitStudentProfile,
  resetStudentPassword,
  toggleStudentStatus,
} from './student.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// Directory listing with search and filters (Admin, HOD, Faculty)
router.get('/', authorize(ROLES.ADMIN, ROLES.HOD, ROLES.FACULTY), getStudents);

// Student first-login complete profile
router.post('/complete-profile', authorize(ROLES.STUDENT, ROLES.ADMIN), submitStudentProfile);
router.post('/:id/complete-profile', authorize(ROLES.STUDENT, ROLES.ADMIN), submitStudentProfile);

// Admin reset student password
router.post('/:id/reset-password', authorize(ROLES.ADMIN), resetStudentPassword);

// Admin toggle student active status
router.patch('/:id/toggle-status', authorize(ROLES.ADMIN), toggleStudentStatus);

// Detailed profile (Admin, HOD, Faculty, or Student self-view)
router.get('/:id', getStudentById);

// Add student with permanent ID (Admin only)
router.post('/', authorize(ROLES.ADMIN), createStudent);

// Update profile info (Admin or Student self)
router.put('/:id', authorize(ROLES.ADMIN, ROLES.STUDENT), updateStudent);

// Update Semester 1-8 academics and school marks (Admin, Faculty)
router.put('/:id/academics', authorize(ROLES.ADMIN, ROLES.FACULTY), updateStudentAcademics);

// Clear an arrear in a specific semester preserving historical records (Admin, Faculty)
router.post('/:id/clear-arrear', authorize(ROLES.ADMIN, ROLES.FACULTY), clearArrear);

// Admin delete student account and all related records
router.delete('/:id', authorize(ROLES.ADMIN), deleteStudent);

export default router;
