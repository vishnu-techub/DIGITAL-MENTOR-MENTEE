import { Router } from 'express';
import { downloadStudentPdf } from './pdf.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Endpoint to stream/download student PDF
router.get('/student/:studentId', downloadStudentPdf);

export default router;
