import { Response } from 'express';
import mongoose from 'mongoose';
import {
  Notification,
  Student,
  Faculty,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { syncMeetingNotifications } from './notification.service.js';

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

/** Auto-generated meeting notice types — these are the ones we keep in sync. */
/**
 * Manual re-sync endpoint (admin/HOD).
 *
 * The actual synchronisation lives in `notification.service.ts` so that the
 * automatic scheduler and this endpoint run byte-identical logic. This handler
 * only exposes it over HTTP.
 *
 * The legacy `triggerType` body field is accepted but ignored, because the
 * wording is derived from the stored `Meeting.meetingDate` rather than from a
 * manual trigger choice.
 */
export async function triggerSaturdayReminders(req: AuthRequest, res: Response) {
  try {
    const result = await syncMeetingNotifications();
    return sendSuccess(
      res,
      result,
      `Meeting notifications synchronised from database records: ${result.createdCount} created, ${result.updatedCount} updated, ${result.clearedCount} cleared.`
    );
  } catch (err: any) {
    console.error('triggerSaturdayReminders error:', err);
    return sendError(res, 'Failed to synchronise meeting notifications.', 500);
  }
}