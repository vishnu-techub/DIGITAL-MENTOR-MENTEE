import { Router } from 'express';
import {
  getCounsellingRecords,
  createCounsellingRecord,
  updateCounsellingRecord,
  removeCounsellingEvidence,
  saveSaturdayCommonEvidence,
  getEvidenceFile,
  downloadEvidenceFile,
  getAiCounsellingSuggestion,
  askMentorAiBotController,
  grammarCheckController,
} from './counselling.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';
import { evidenceUploadArray } from './evidence.service.js';

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

// ---------------------------------------------------------------------------
// EVIDENCE ROUTES — declared BEFORE `/:studentId` so "evidence" is never
// swallowed by the dynamic student route.
// ---------------------------------------------------------------------------

// 4. Saturday COMMON meeting evidence. One physical upload, shared by every
//    participating student.
router.post(
  '/evidence/saturday',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  evidenceUploadArray('evidence'),
  saveSaturdayCommonEvidence
);

// 5. Authenticated photo bytes. `/uploads` is not a public static mount, so a
//    photo is only ever served through here after an ownership check.
router.get('/evidence/:evidenceId/file', getEvidenceFile);
router.get('/evidence/:evidenceId/download', downloadEvidenceFile);

// 6. Mentoring records for a student
router.get('/:studentId', getCounsellingRecords);

// 7. Official Save (Only when mentor types and clicks Save)
router.post(
  '/',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  evidenceUploadArray('evidence'),
  createCounsellingRecord
);

// 8. Update Mentoring Record (Existing evidence is preserved and appended to)
router.put(
  '/:id',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  evidenceUploadArray('evidence'),
  updateCounsellingRecord
);

// 9. Explicit evidence detachment. Photos still shared with another record are
//    retained on disk, never deleted.
router.delete(
  '/:id/evidence',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  removeCounsellingEvidence
);

export default router;
