import { Router } from 'express';
import {
  getReferenceDepartments,
  getReferenceBatches,
  getReferenceCounts,
} from './reference.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

/**
 * ============================================================================
 * /api/reference — lookup lists for any authenticated user
 * ============================================================================
 *
 * `authenticate` only. These routes are intentionally NOT `authorize(ROLES.ADMIN)`
 * because a Student / Faculty / HOD must be able to populate a department or
 * batch dropdown. What they expose is limited to id, name, code and academic
 * year range — see `reference.controller.ts`.
 *
 * Anonymous callers are rejected with 401 by `authenticate`, so the module is
 * not public.
 */
const router = Router();

router.use(authenticate);

router.get('/departments', getReferenceDepartments);
router.get('/batches', getReferenceBatches);
router.get('/counts', getReferenceCounts);

export default router;