import { Router } from 'express';
import {
  bulkAssignmentFileMiddleware,
  downloadAssignmentTemplateHandler,
  validateAssignmentHandler,
  assignBulkHandler,
  assignmentReportHandler,
} from './bulk-assignment.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

/**
 * Bulk mentee assignment sub-router, mounted at /api/mentorship/bulk.
 *
 * ADMIN may operate college-wide; a HOD is restricted to its own department for
 * BOTH the student and the mentor (enforced again inside the service). Faculty
 * mentors and students have no assignment privileges at all.
 */
const router = Router();

router.use(authenticate);

// Download the assignment template (Excel or CSV).
router.get('/template', authorize(ROLES.ADMIN, ROLES.HOD), downloadAssignmentTemplateHandler);

// Upload + validate a roster without writing anything (preview).
router.post(
  '/validate',
  authorize(ROLES.ADMIN, ROLES.HOD),
  bulkAssignmentFileMiddleware,
  validateAssignmentHandler
);

// Execute the confirmed assignments/reassignments.
router.post('/assign', authorize(ROLES.ADMIN, ROLES.HOD), assignBulkHandler);

// Download a validation or execution-results report (CSV or Excel).
router.post('/report', authorize(ROLES.ADMIN, ROLES.HOD), assignmentReportHandler);

export default router;
