import { Router } from 'express';
import {
  getSubjects,
  getSubjectMeta,
  getSubjectById,
  createSubject,
  updateSubject,
  setSubjectStatus,
  deleteSubject,
} from './subject.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

/**
 * ============================================================================
 * /api/admin/subjects — Admin subject catalogue
 * ============================================================================
 *
 * Every route is ADMIN-only at the router level AND each handler re-checks the
 * role, so a Student / Faculty / Mentor / HOD account is rejected with 403 by
 * the server regardless of what the client renders. Mounted before the general
 * `/api/admin` router in index.ts so this surface is matched first.
 */

const router = Router();

router.use(authenticate);
// Router-wide ADMIN guard. Placed once here, deliberately, so no future route
// added below can forget it.
router.use(authorize(ROLES.ADMIN));

// Filter vocabulary for the management screen.
router.get('/meta', getSubjectMeta);

router.get('/', getSubjects);
router.post('/', createSubject);

router.get('/:subjectId', getSubjectById);
router.put('/:subjectId', updateSubject);
router.patch('/:subjectId/status', setSubjectStatus);
router.delete('/:subjectId', deleteSubject);

export default router;
