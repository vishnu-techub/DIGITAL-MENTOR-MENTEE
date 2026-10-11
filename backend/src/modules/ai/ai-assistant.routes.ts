import { Router } from 'express';
import {
  getAiStatus,
  startConversation,
  listConversations,
  getConversation,
  deleteConversation,
  sendChatMessage,
} from './ai-assistant.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

/**
 * ============================================================================
 * /api/ai — KSRCE AI Assistant (Ollama-backed, role-scoped, advisory only)
 * ============================================================================
 *
 * Every endpoint requires authentication. The global `enforcePasswordChange`
 * middleware (mounted at `/api` before all routers) already refuses these
 * routes for flag-flagged first-login accounts, so the assistant cannot be
 * reached before the mandatory password change either.
 *
 * The AI is advisory and read-only: `/chat` only ever READS the caller's
 * authorized data (built server-side in ai-context.service) and stores the
 * transcript. No endpoint creates, edits or deletes student/mentoring/
 * academic records, and conversation ownership is enforced per request.
 */
const router = Router();

router.use(authenticate);

router.get('/status', getAiStatus);
router.post('/conversations', startConversation);
router.get('/conversations', listConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);
router.post('/chat', sendChatMessage);

export default router;