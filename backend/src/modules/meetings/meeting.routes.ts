import { Router } from 'express';
import { getSaturdaySchedule, getMeetings, createMeetingRecord } from './meeting.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/rbac.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// Saturday schedule & next dates
router.get('/schedule/current', getSaturdaySchedule);

// List meetings (role-scoped)
router.get('/', getMeetings);

// Create meeting record (Faculty, HOD, Admin)
router.post('/', authorize(ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN), createMeetingRecord);

export default router;
