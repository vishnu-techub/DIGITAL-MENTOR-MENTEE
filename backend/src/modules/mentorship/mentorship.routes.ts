import { Router } from 'express';
import { assignMentor, reassignMentor, getMentorshipHistory, exportMentorMenteesExcel } from './mentorship.controller.js';
import {
  getAiCounsellingSuggestion,
  askMentorAiBotController,
  grammarCheckController,
} from '../counselling/counselling.controller.js';
import {
  getMenteeProgressForMentor,
  verifyMenteeProgress,
} from '../student-progress/student-progress.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// Download Overall Mentee Data as Institutional Excel (.xlsx) (Faculty, Admin, HOD)
router.get('/export/mentees', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), exportMentorMenteesExcel);

// Initial allocation (Admin or HOD)
router.post('/assign', authorize(ROLES.ADMIN, ROLES.HOD), assignMentor);

// Mentor Reassignment (Admin or HOD) - 100% data preservation
router.post('/reassign', authorize(ROLES.ADMIN, ROLES.HOD), reassignMentor);

// History retrieval (Admin, HOD, Faculty, or Student)
router.get('/history/:studentId', getMentorshipHistory);

// AI Bot for Mentors (Q&A Advisory)
router.post(
  '/ai-bot/ask',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  askMentorAiBotController
);

// Real-time Writing Assistant (Spelling & Grammar Correction)
router.post(
  '/grammar-check',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  grammarCheckController
);

// AI Counselling Assistant (Faculty, Admin, HOD)
router.post(
  '/students/:studentId/counselling/ai-suggestion',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  getAiCounsellingSuggestion
);

// Mentee Progress & Achievements (Faculty, Admin, HOD)
router.get(
  '/mentees/:studentId/progress',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  getMenteeProgressForMentor
);

router.put(
  '/mentees/:studentId/progress/:id/verify',
  authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN),
  verifyMenteeProgress
);

export default router;
