import { Router } from 'express';
import {
  getUserNotifications,
  markNotificationAsRead,
  sendFacultyNotification,
  getSentFacultyNotifications,
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

// Faculty -> own-department notice. The department is derived server-side from
// the sender's Faculty record; the body cannot address another department.
router.post('/faculty', authorize(ROLES.FACULTY), sendFacultyNotification);
// The notices this faculty member authored (own records only).
router.get('/sent', authorize(ROLES.FACULTY), getSentFacultyNotifications);

export default router;
