import { Router } from 'express';
import {
  getUserNotifications,
  markNotificationAsRead,
  triggerSaturdayReminders,
} from './notification.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getUserNotifications);
router.patch('/:id/read', markNotificationAsRead);
router.post('/trigger-saturday-reminders', authorize(ROLES.ADMIN, ROLES.HOD), triggerSaturdayReminders);

export default router;
