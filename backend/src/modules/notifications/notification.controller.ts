import { Response } from 'express';
import {
  Notification,
  Student,
  Faculty,
  User,
  Department,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { syncMeetingNotifications } from './notification.service.js';
import { isValidId, toLocalId, type LocalId } from '../../services/localId.js';
import { resolveFacultyIdForUser, toIdString } from '../../utils/access.util.js';
import { NOTIFICATION_TYPES, ROLES } from '../../config/constants.js';
import { logAudit } from '../../middleware/audit.middleware.js';

const MAX_TITLE = 150;
const MAX_MESSAGE = 2000;

/** Normalise any stored date (Date | ISO string) to an ISO string, or null. */
function isoOf(value: any): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Fill `department_name` on rows that carry a `department` id. One lookup for
 * the whole batch — the department is stored as an id so a rename is picked up
 * on the next read instead of being frozen into every old notification.
 */
async function attachDepartmentNames(rows: Array<{ department?: string | null; department_name?: string | null }>): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.department).filter(Boolean))] as string[];
  if (ids.length === 0) return;
  const depts = await Department.find({ _id: { $in: ids } }).lean();
  const nameById = new Map<string, string>(
    (depts as any[]).map((d) => [String(d._id), String(d.name || '')])
  );
  for (const row of rows) {
    row.department_name = row.department ? nameById.get(String(row.department)) || null : null;
  }
}

export async function getUserNotifications(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const userObjId = isValidId(userId) ? toLocalId(userId) : userId;

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
      // Faculty -> department notices carry their author and department here.
      // Every other notification type returns null for both.
      faculty_name: n.facultyName || null,
      department: n.department ? String(n.department) : null,
      department_name: null as string | null,
    }));

    await attachDepartmentNames(notifications);

    return sendSuccess(res, {
      notifications,
      unreadCount,
    });
  } catch (err: any) {
    console.error('getUserNotifications error:', err);
    return sendError(res, 'Failed to fetch notifications.', 500);
  }
}

/**
 * POST /api/notifications/faculty — FACULTY only.
 *
 * A faculty member sends a notice about **their own** department. The
 * department is taken from the sender's stored Faculty record and is never
 * read from the request body, so a caller cannot address another department:
 * a `departmentId` that disagrees with the sender's own is refused 400
 * (cross-department rejection) before anything is written.
 *
 * Delivery reuses the existing Notification collection — one document per
 * recipient, so each recipient keeps their own read/unread state:
 *   - every ACTIVE HOD of that department (the primary recipient)
 *   - every ACTIVE Admin (the existing Admin "System Notifications" feed, so
 *     notification activity is visible without touching any authorization rule)
 *
 * Refused when the sender has no Faculty record / department (403) or when the
 * department has no active HOD (409) — a notice nobody can act on is not
 * silently accepted.
 */
export async function sendFacultyNotification(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    if (user.role !== ROLES.FACULTY) {
      return sendError(res, 'Only faculty members can send department notifications.', 403);
    }

    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!title) return sendError(res, 'Title is required.', 400);
    if (title.length > MAX_TITLE) {
      return sendError(res, `Title must be ${MAX_TITLE} characters or fewer.`, 400);
    }
    if (!message) return sendError(res, 'Message is required.', 400);
    if (message.length > MAX_MESSAGE) {
      return sendError(res, `Message must be ${MAX_MESSAGE} characters or fewer.`, 400);
    }

    const facultyId = await resolveFacultyIdForUser(user);
    const faculty = facultyId ? await Faculty.findById(facultyId).populate('user') : null;
    if (!faculty) {
      return sendError(res, 'Your account is not linked to a faculty record, so it cannot send department notifications.', 403);
    }

    const departmentId =
      toIdString((faculty as any).department) || toIdString(user.departmentId) || null;
    if (!departmentId) {
      return sendError(res, 'Your account is not linked to a department, so it cannot send department notifications.', 403);
    }

    // Cross-department rejection: the body may echo a department back, but it
    // can only ever be the sender's own. Anything else is a hard 400.
    const requested = body.departmentId ?? body.department ?? null;
    if (requested !== null && requested !== undefined && requested !== '') {
      if (toIdString(requested) !== departmentId) {
        return sendError(
          res,
          'Cross-department notifications are not allowed. You can only notify your own department.',
          400
        );
      }
    }

    const department = await Department.findById(departmentId);
    if (!department) return sendError(res, 'Department not found.', 404);

    const hods = await User.find({ role: ROLES.HOD, department: departmentId, isActive: true });
    if (hods.length === 0) {
      return sendError(
        res,
        `No active HOD is appointed for ${department.name}. The notification was not sent.`,
        409
      );
    }
    const admins = await User.find({ role: ROLES.ADMIN, isActive: true });

    const facultyName =
      ((faculty as any).user as any)?.fullName || user.fullName || 'Faculty';
    const recipients = [...(hods as any[]), ...(admins as any[])];

    const createdIds: string[] = [];
    for (const recipient of recipients) {
      const doc: any = await Notification.create({
        user: recipient._id,
        title,
        message,
        type: NOTIFICATION_TYPES.FACULTY_NOTIFICATION,
        isRead: false,
        department: (department as any)._id,
        facultyId,
        facultyName,
        // One document per recipient so each keeps its own read state. The
        // role says which job this copy does: the HOD copy is the actionable
        // one, the Admin copy is the activity feed.
        recipientRole: recipient.role,
        relatedEntity: 'FACULTY',
        relatedEntityId: facultyId,
      });
      createdIds.push(String(doc._id));
    }

    await logAudit({
      userId: user.id,
      action: 'CREATE_FACULTY_NOTIFICATION',
      entity: 'NOTIFICATION',
      entityId: createdIds[0] || null,
      details: {
        departmentId,
        hodRecipients: hods.length,
        adminRecipients: admins.length,
        title,
      },
      req,
    } as any);

    return sendSuccess(
      res,
      {
        id: createdIds[0] || null,
        title,
        message,
        type: NOTIFICATION_TYPES.FACULTY_NOTIFICATION,
        faculty_id: facultyId,
        faculty_name: facultyName,
        department_id: departmentId,
        department_name: department.name,
        is_read: false,
        created_at: isoOf(new Date()),
        hod_recipients: hods.length,
        admin_recipients: admins.length,
        recipient_count: recipients.length,
      },
      'Notification sent to your department HOD.',
      201
    );
  } catch (err: any) {
    console.error('sendFacultyNotification error:', err);
    return sendError(res, 'Failed to send the notification.', 500);
  }
}

/**
 * GET /api/notifications/sent — FACULTY only.
 *
 * The notices this caller authored. Scoped by the sender's own faculty record
 * id, so a faculty member can never list another faculty member's notices.
 * Only the HOD copy of each send is listed: every recipient (HOD, Admin) gets
 * its own document, and without this filter one send would appear once per
 * recipient. `is_read` here reflects whether the HOD has opened it.
 */
export async function getSentFacultyNotifications(req: AuthRequest, res: Response) {
  try {
    const facultyId = await resolveFacultyIdForUser(req.user!);
    if (!facultyId) {
      // No Faculty record => nothing could have been sent. Empty, not an error.
      return sendSuccess(res, { notifications: [], unreadCount: 0 });
    }

    const filter = {
      facultyId,
      type: NOTIFICATION_TYPES.FACULTY_NOTIFICATION,
      recipientRole: ROLES.HOD,
    };
    const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = await Notification.countDocuments({ ...filter, isRead: false });

    const notifications = (rows as any[]).map((n) => ({
      id: String(n._id),
      title: n.title || '',
      message: n.message || '',
      type: n.type || '',
      is_read: Boolean(n.isRead),
      faculty_name: n.facultyName || '',
      faculty_id: n.facultyId || facultyId,
      department: n.department ? String(n.department) : null,
      department_name: null as string | null,
      created_at: isoOf(n.createdAt),
    }));

    await attachDepartmentNames(notifications);

    return sendSuccess(res, { notifications, unreadCount });
  } catch (err: any) {
    console.error('getSentFacultyNotifications error:', err);
    return sendError(res, 'Failed to fetch sent notifications.', 500);
  }
}

export async function markNotificationAsRead(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  try {
    const userId = req.user!.id;
    const userObjId = isValidId(userId) ? toLocalId(userId) : userId;

    if (id === 'all') {
      await Notification.updateMany({ user: userObjId }, { isRead: true });
      return sendSuccess(res, null, 'All notifications marked as read.');
    }

    if (isValidId(id)) {
      await Notification.updateOne(
        { _id: toLocalId(id), user: userObjId },
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