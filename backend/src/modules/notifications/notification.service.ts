/**
 * MEETING NOTIFICATION SYNCHRONISATION — SINGLE SOURCE OF TRUTH
 * ---------------------------------------------------------------------------
 * This is the only place that creates/updates/removes the automatic meeting
 * notices. It is invoked from three callers:
 *
 *   1. `scheduleMeetingNotificationSync()`  - automatically, on server start and
 *      then on a fixed interval, so reminders genuinely fire without any human
 *      pressing a button.
 *   2. `POST /api/notifications/trigger-saturday-reminders` - the manual
 *      admin/HOD re-sync, for the rare case an operator wants to force it.
 *   3. Tests, which call `syncMeetingNotifications()` directly.
 *
 * Correctness rules:
 *  - The stored `Meeting.meetingDate` is the only source of the notice wording.
 *    Nothing here assumes the meeting is on a Saturday.
 *  - Sync is IDEMPOTENT. It is keyed on (user, meetingId), so running it many
 *    times updates the same notice instead of creating duplicates.
 *  - A meeting that is no longer upcoming has its notices REMOVED, so a stale
 *    "upcoming" reminder can never be shown after the meeting has passed.
 */
import {
  Notification,
  MentorAssignment,
  SystemSetting,
  Meeting,
} from '../../models/index.js';
import { describeMeetingDate, formatMeetingDate } from '../../utils/meetingDate.util.js';

const AUTO_MEETING_TYPES = [
  'MEETING_TODAY_SATURDAY',
  'MEETING_REMINDER_FRIDAY',
  'MEETING_REMINDER',
];

/** How often the automatic re-sync runs. The sync is idempotent and cheap. */
const DEFAULT_SYNC_INTERVAL_MS = 60 * 60 * 1000; // hourly

function syncIntervalMs(): number {
  // Overridable so the runtime-verification harness can observe a real
  // unattended scheduler tick instead of only the manual endpoint.
  const raw = Number(process.env.MEETING_SYNC_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 200 ? raw : DEFAULT_SYNC_INTERVAL_MS;
}

export interface IMeetingSyncResult {
  createdCount: number;
  updatedCount: number;
  clearedCount: number;
  skippedNoMeeting: number;
}

export async function syncMeetingNotifications(): Promise<IMeetingSyncResult> {
  const settings = await SystemSetting.find({
    key: { $in: ['saturday_meeting_time', 'saturday_meeting_location'] },
  });
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const defaultTime = settingsMap['saturday_meeting_time'] || '10:30 AM';
  const defaultLocation = settingsMap['saturday_meeting_location'] || 'Faculty Cabin';

  const activeAssignments = await MentorAssignment.find({ status: 'ACTIVE' })
    .populate('student')
    .populate({ path: 'mentor', populate: { path: 'user' } });

  let createdCount = 0;
  let updatedCount = 0;
  let clearedCount = 0;
  let skippedNoMeeting = 0;

  for (const asg of activeAssignments as any[]) {
    const student = asg.student;
    const mentorUser = asg.mentor?.user;
    if (!student || !mentorUser) continue;

    // The most recent meeting record for this student is the source of truth.
    const meeting = await Meeting.findOne({ student: student._id })
      .sort({ meetingDate: -1, createdAt: -1 })
      .select('_id meetingDate meetingTime location')
      .lean();

    if (!meeting) {
      skippedNoMeeting++;
      continue;
    }

    const meetingId = String(meeting._id);
    const label = describeMeetingDate(meeting.meetingDate);
    const time = meeting.meetingTime || defaultTime;
    const location = meeting.location || defaultLocation;
    const dateText = formatMeetingDate(meeting.meetingDate);

    // Remove any previously generated notice for this meeting (all phases).
    const staleFilter: Record<string, unknown> = {
      relatedEntity: 'MEETING',
      relatedEntityId: meetingId,
      type: { $in: AUTO_MEETING_TYPES },
    };

    if (!label.isUpcoming) {
      // Past meeting: must not be presented as current/upcoming.
      const res1 = await Notification.deleteMany({ ...staleFilter, user: student.user });
      const res2 = await Notification.deleteMany({ ...staleFilter, user: mentorUser._id });
      if ((res1.deletedCount || 0) + (res2.deletedCount || 0) > 0) clearedCount++;
      continue;
    }

    const noticeType =
      label.phase === 'TODAY'
        ? 'MEETING_TODAY_SATURDAY'
        : label.phase === 'TOMORROW'
          ? 'MEETING_REMINDER_FRIDAY'
          : 'MEETING_REMINDER';

    const studentBody = `${label.description} Time: ${time}. Venue: ${location}.`;
    const mentorBody = `${label.description} Mentee: ${student.fullName} (${student.registerNumber}). Time: ${time}. Venue: ${location}.`;

    const existingStudent = await Notification.findOne({ ...staleFilter, user: student.user });
    const existingMentor = await Notification.findOne({ ...staleFilter, user: mentorUser._id });

    if (existingStudent) {
      // Only re-alert when the notice content actually changed. Resetting
      // `isRead` unconditionally would make the hourly scheduler mark a
      // notice unread again after the student had already read it.
      const changed =
        existingStudent.title !== label.title ||
        existingStudent.message !== studentBody ||
        existingStudent.type !== noticeType;
      existingStudent.title = label.title;
      existingStudent.message = studentBody;
      existingStudent.type = noticeType;
      if (changed) existingStudent.isRead = false;
      await existingStudent.save();
      updatedCount++;
    } else {
      await Notification.create({
        user: student.user,
        title: label.title,
        message: studentBody,
        type: noticeType,
        relatedEntity: 'MEETING',
        relatedEntityId: meetingId,
      });
      createdCount++;
    }

    if (existingMentor) {
      const mentorChanged =
        existingMentor.title !== label.title ||
        existingMentor.message !== mentorBody ||
        existingMentor.type !== noticeType;
      existingMentor.title = label.title;
      existingMentor.message = mentorBody;
      existingMentor.type = noticeType;
      if (mentorChanged) existingMentor.isRead = false;
      await existingMentor.save();
    } else {
      await Notification.create({
        user: mentorUser._id,
        title: label.title,
        message: mentorBody,
        type: noticeType,
        relatedEntity: 'MEETING',
        relatedEntityId: meetingId,
      });
      createdCount++;
    }

    // `dateText` is intentionally resolved above so the formatter stays the one
    // place that turns a stored date into display text.
    void dateText;
  }

  return { createdCount, updatedCount, clearedCount, skippedNoMeeting };
}

let timer: NodeJS.Timeout | null = null;

/**
 * Start automatic reminder synchronisation. Safe to call once at boot.
 * Never throws: a failed sync is logged and retried on the next tick, because a
 * scheduler crash must not take the HTTP server down with it.
 */
export function scheduleMeetingNotificationSync(): void {
  if (timer) return;

  const run = async (reason: string) => {
    try {
      const result = await syncMeetingNotifications();
      if (result.createdCount || result.updatedCount || result.clearedCount) {
        console.log(
          `[meeting-reminders] ${reason}: ${result.createdCount} created, ` +
            `${result.updatedCount} updated, ${result.clearedCount} cleared, ` +
            `${result.skippedNoMeeting} assignment(s) without a meeting`
        );
      }
    } catch (err: any) {
      console.error(`[meeting-reminders] ${reason} failed:`, err?.message || err);
    }
  };

  // Fire once shortly after boot so a restarted server self-heals its reminders.
  const interval = syncIntervalMs();
  setTimeout(() => void run('startup sync'), Math.min(1000, interval)).unref?.();
  timer = setInterval(() => void run('scheduled sync'), interval);
  timer.unref?.();
  console.log(`[meeting-reminders] automatic synchronisation armed (every ${interval} ms)`);
}

export function stopMeetingNotificationSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
