import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  createPlacement,
  getHodMentorWisePlacements,
  getHodPlacementSummary,
  getHodStudentWisePlacements,
  getMentorPlacements,
  getPlacement,
  updatePlacement,
} from './placement.controller.js';

/**
 * Placement monitoring routes.
 *
 * Reachable by FACULTY (mentors), HOD and ADMIN. Scope is enforced inside the
 * controller from the JWT, and the HOD aggregate endpoints are additionally
 * protected by `requireHod` so `req.user.departmentId` always exists.
 */

function requireHod(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role === ROLES.HOD && req.user?.departmentId) return next();
  if (role === ROLES.ADMIN) {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Placement department views require a HOD account linked to a department.',
    });
  }
  return res.status(403).json({
    success: false,
    statusCode: 403,
    message: 'Access denied. HOD access required for department placement views.',
  });
}

const router = Router();

router.use(authenticate);

router.get('/student/:studentId', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), getPlacement);
router.post('/student/:studentId', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), createPlacement);
router.put('/student/:studentId', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), updatePlacement);

router.get('/mentor', authorize(ROLES.FACULTY), getMentorPlacements);

router.get('/hod/summary', authorize(ROLES.HOD, ROLES.ADMIN), requireHod, getHodPlacementSummary);
router.get('/hod/mentor-wise', authorize(ROLES.HOD, ROLES.ADMIN), requireHod, getHodMentorWisePlacements);
router.get('/hod/student-wise', authorize(ROLES.HOD, ROLES.ADMIN), requireHod, getHodStudentWisePlacements);

export default router;