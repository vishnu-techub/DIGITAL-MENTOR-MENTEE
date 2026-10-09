import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  getMarkEntryPermission,
  updateMarkEntryPermission,
  getInternalMarks,
  updateInternalMarks,
  listMarkUpdateRequests,
  createMarkUpdateRequest,
  approveMarkUpdateRequest,
  rejectMarkUpdateRequest,
} from './internal-marks.controller.js';

const router = Router();

router.use(authenticate);

// ---- ADMIN: mark-entry permission (enable/disable, mark types, duration) ----
router.get('/permission', authorize(ROLES.ADMIN), getMarkEntryPermission);
router.put('/permission', authorize(ROLES.ADMIN), updateMarkEntryPermission);

// ---- Subject-wise internal marks (scope enforced per student in the handler) ----
router.get('/student/:studentId', getInternalMarks);
router.put(
  '/student/:studentId',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  updateInternalMarks
);

// ---- Correction requests: mentor raises, Admin decides ----
router.get(
  '/update-requests',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  listMarkUpdateRequests
);
router.post(
  '/update-requests',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  createMarkUpdateRequest
);
router.patch(
  '/update-requests/:requestId/approve',
  authorize(ROLES.ADMIN),
  approveMarkUpdateRequest
);
router.patch('/update-requests/:requestId/reject', authorize(ROLES.ADMIN), rejectMarkUpdateRequest);

export default router;
