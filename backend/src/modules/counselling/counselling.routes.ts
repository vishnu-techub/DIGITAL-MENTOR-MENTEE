import { Router } from 'express';
import {
  getCounsellingRecords,
  createCounsellingRecord,
  updateCounsellingRecord,
  getAiCounsellingSuggestion,
  askMentorAiBotController,
  grammarCheckController,
} from './counselling.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// 1. Separate AI Bot for Mentors (Q&A Advisory - Does NOT save or alter records)
router.post(
  '/ai-bot/ask',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  askMentorAiBotController
);

// 2. Real-time Writing Assistant (Spelling & Grammar Correction)
router.post(
  '/grammar-check',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  grammarCheckController
);

// 3. Legacy AI Suggestion Assistant (Does NOT save to DB)
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

// 4. Counselling records for a student
router.get('/:studentId', getCounsellingRecords);

// 5. Official Save (Only when mentor types and clicks Save)
router.post('/', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), createCounsellingRecord);

// 6. Update Counselling Record (Preserves selections)
router.put('/:id', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), updateCounsellingRecord);

export default router;
