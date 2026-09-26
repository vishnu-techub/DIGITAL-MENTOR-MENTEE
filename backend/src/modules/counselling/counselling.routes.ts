import { Router } from 'express';
import {
  getCounsellingRecords,
  createCounsellingRecord,
  getAiCounsellingSuggestion,
} from './counselling.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// 1. AI Suggestion Assistant (Does NOT save to DB)
router.post(
  '/ai-suggestion',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  getAiCounsellingSuggestion
);
router.post(
  '/student/:studentId/ai-suggestion',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  getAiCounsellingSuggestion
);

// 2. Counselling records for a student
router.get('/:studentId', getCounsellingRecords);

// 3. Official Save (Only when mentor clicks Accept & Save)
router.post('/', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), createCounsellingRecord);

export default router;
