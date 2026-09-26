import { Response } from 'express';
import mongoose from 'mongoose';
import {
  Notification,
  MentorAssignment,
  SystemSetting,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { getUpcomingSaturday } from '../../utils/date.js';

export async function getUserNotifications(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

    const rawNotifications = await Notification.find({ user: userObjId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      user: userObjId,
      isRead: false,
    });

    const notifications = rawNotifications.map((n: any) => ({
      id: n._id.toString(),
      _id: n._id.toString(),
      user_id: n.user?.toString() || '',
      title: n.title,
      message: n.message,
      type: n.type,
      is_read: n.isRead ? 1 : 0,
      related_entity: n.relatedEntity || null,
      related_entity_id: n.relatedEntityId || null,
      created_at: n.createdAt,
    }));

    return sendSuccess(res, {
      notifications,
      unreadCount,
    });
  } catch (err: any) {
    console.error('getUserNotifications error:', err);
    return sendError(res, 'Failed to fetch notifications.', 500);
  }
}

export async function markNotificationAsRead(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  try {
    const userId = req.user!.id;
    const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

    if (id === 'all') {
      await Notification.updateMany({ user: userObjId }, { isRead: true });
      return sendSuccess(res, null, 'All notifications marked as read.');
    }

    if (mongoose.Types.ObjectId.isValid(id)) {
      await Notification.updateOne(
        { _id: new mongoose.Types.ObjectId(id), user: userObjId },
        { isRead: true }
      );
    } else {
      await Notification.updateOne(
        { _id: id, user: userObjId },
        { isRead: true }
      );
    }

    return sendSuccess(res, null, 'Notification marked as read.');
  } catch (err: any) {
    console.error('markNotificationAsRead error:', err);
    return sendError(res, 'Failed to update notification.', 500);
  }
}

// Generate automated Saturday meeting reminders (Can be called by cron or admin trigger)
export async function triggerSaturdayReminders(req: AuthRequest, res: Response) {
  const { triggerType = 'SATURDAY_TODAY' } = req.body; // 'FRIDAY_REMINDER' or 'SATURDAY_TODAY'

  try {
    const nextSat = getUpcomingSaturday();
    const settings = await SystemSetting.find({
      key: { $in: ['saturday_meeting_time', 'saturday_meeting_location'] },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    const time = settingsMap['saturday_meeting_time'] || '10:30 AM';
    const loc = settingsMap['saturday_meeting_location'] || 'Faculty Cabin';

    // Find all active mentor assignments
    const activeAssignments = await MentorAssignment.find({ status: 'ACTIVE' })
      .populate('student')
      .populate({ path: 'mentor', populate: { path: 'user' } });

    let createdCount = 0;

    for (const asg of activeAssignments as any[]) {
      const student = asg.student;
      const mentor = asg.mentor;
      const mentorUser = mentor?.user;

      if (!student || !mentorUser) continue;

      if (triggerType === 'FRIDAY_REMINDER') {
        // Friday Student Notification
        await Notification.create({
          user: student.user,
          title: 'Friday Reminder: Saturday Mentor–Mentee Meeting',
          message: `Reminder: Your Mentor–Mentee meeting is tomorrow (${nextSat}) at ${time} in ${loc}.`,
          type: 'MEETING_REMINDER_FRIDAY',
          relatedEntity: 'MEETING',
        });

        // Friday Faculty Notification
        await Notification.create({
          user: mentorUser._id || mentorUser,
          title: 'Friday Reminder: Saturday Mentor–Mentee Meeting',
          message: `Reminder: Mentor–Mentee meeting is tomorrow (${nextSat}) at ${time}. Please update meeting records after the session.`,
          type: 'MEETING_REMINDER_FRIDAY',
          relatedEntity: 'MEETING',
        });
      } else {
        // Saturday Student Notification
        await Notification.create({
          user: student.user,
          title: 'Today is your Mentor–Mentee Meeting',
          message: `Today (${nextSat}) is your Mentor–Mentee meeting with ${mentorUser.fullName || 'your mentor'} at ${time} in ${loc}.`,
          type: 'MEETING_TODAY_SATURDAY',
          relatedEntity: 'MEETING',
        });

        // Saturday Faculty Notification
        await Notification.create({
          user: mentorUser._id || mentorUser,
          title: 'Today is your Mentor–Mentee Meeting',
          message: `Today is your scheduled Mentor–Mentee meeting with mentee ${student.fullName}. Please update the meeting status after completion.`,
          type: 'MEETING_TODAY_SATURDAY',
          relatedEntity: 'MEETING',
        });
      }

      createdCount += 2;
    }

    return sendSuccess(
      res,
      { triggeredCount: createdCount, triggerType },
      'Saturday meeting reminders dispatched successfully.'
    );
  } catch (err: any) {
    console.error('triggerSaturdayReminders error:', err);
    return sendError(res, 'Failed to trigger reminders.', 500);
  }
}
