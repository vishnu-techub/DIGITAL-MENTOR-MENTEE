import { Response } from 'express';
import mongoose from 'mongoose';
import {
  Meeting,
  Student,
  Faculty,
  MentorAssignment,
  SystemSetting,
  Notification,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES, ATTENDANCE_STATUS, MEETING_STATUS } from '../../config/constants.js';
import {
  describeMeetingDate,
  formatMeetingDate,
  parseMeetingDate,
} from '../../utils/meetingDate.util.js';
import { checkStudentAccess, isActiveMentorOf, toIdString } from '../../utils/access.util.js';

/** Latest meeting record for a student (the one notifications are built from). */
async function latestMeetingFor(studentId: any) {
  return Meeting.findOne({ student: studentId })
    .sort({ meetingDate: -1, createdAt: -1 })
    .select('meetingDate meetingTime location meetingStatus')
    .lean();
}

/**
 * Institutional Saturday configuration.
 * `nextMeetingDate` comes from the ACTUAL latest meeting record in MongoDB —
 * it is never computed from the system clock.
 */
export async function getSaturdaySchedule(req: AuthRequest, res: Response) {
  try {
    const settings = await SystemSetting.find({ key: { $regex: '^saturday_meeting_' } });
    const config: Record<string, string> = {};
    for (const s of settings) config[s.key] = s.value;

    // Find the most relevant meeting for this user.
    let meeting: any = null;
    if (req.user?.role === ROLES.STUDENT) {
      const sid = req.user.studentId;
      if (sid) {
        const student = mongoose.Types.ObjectId.isValid(sid)
          ? await Student.findById(sid).select('_id')
          : await Student.findOne({ registerNumber: String(sid).toUpperCase() }).select('_id');
        if (student) meeting = await latestMeetingFor(student._id);
      }
    } else if (req.user?.role === ROLES.FACULTY && req.user.facultyId) {
      const faculty = mongoose.Types.ObjectId.isValid(req.user.facultyId)
        ? await Faculty.findById(req.user.facultyId).select('_id')
        : await Faculty.findOne({ employeeId: req.user.facultyId }).select('_id');
      if (faculty) {
        meeting = await Meeting.findOne({ mentor: faculty._id })
          .sort({ meetingDate: -1, createdAt: -1 })
          .select('meetingDate meetingTime location meetingStatus')
          .lean();
      }
    }

    const label = meeting ? describeMeetingDate(meeting.meetingDate) : null;

    // `meetingDate` is a date-only field in the Meeting model, so it is always
    // returned as YYYY-MM-DD. Returning a raw Date here leaked a misleading
    // time component into every consumer of this endpoint.
    const storedDate = meeting?.meetingDate
      ? (() => {
          const d = new Date(meeting.meetingDate);
          if (Number.isNaN(d.getTime())) return null;
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })()
      : null;

    return sendSuccess(res, {
      // When a meeting record exists the day label comes from the stored date,
      // not from the configured default. With no record the institutional
      // setting is all that is known, so it is used as an explicit fallback.
      day: meeting
        ? (label?.formatted ? new Date(meeting.meetingDate).toLocaleDateString('en-US', { weekday: 'long' }) : config['saturday_meeting_day'] || 'Saturday')
        : config['saturday_meeting_day'] || 'Saturday',
      time: meeting?.meetingTime || config['saturday_meeting_time'] || '10:30 AM',
      location: meeting?.location || config['saturday_meeting_location'] || 'Faculty Cabin / Mentoring Room',
      // Actual stored meeting date, formatted. Empty when none exists.
      nextSaturdayDate: meeting ? formatMeetingDate(meeting.meetingDate) : '',
      meetingDate: storedDate,
      meetingPhase: label?.phase || 'PAST',
      meetingTitle: label?.title || 'No upcoming meetings',
      meetingDescription: label?.description || 'No meeting has been recorded yet.',
      isUpcoming: label?.isUpcoming || false,
      hasMeetingRecord: Boolean(meeting),
    });
  } catch (err: any) {
    console.error('getSaturdaySchedule error:', err);
    return sendError(res, 'Failed to fetch Saturday schedule settings.', 500);
  }
}

// List Meetings with role-based scoping
export async function getMeetings(req: AuthRequest, res: Response) {
  try {
    const { studentId, mentorId, date, status } = req.query as Record<string, string>;

    const filter: any = {};

    if (req.user?.role === ROLES.STUDENT && req.user.studentId) {
      if (mongoose.Types.ObjectId.isValid(req.user.studentId)) {
        filter.student = req.user.studentId;
      } else {
        const s = await Student.findOne({ registerNumber: req.user.studentId });
        if (s) filter.student = s._id;
        else return sendSuccess(res, []);
      }
    } else if (req.user?.role === ROLES.FACULTY && req.user.facultyId) {
      const faculty = mongoose.Types.ObjectId.isValid(req.user.facultyId)
        ? await Faculty.findById(req.user.facultyId).select('_id')
        : await Faculty.findOne({ employeeId: req.user.facultyId }).select('_id');
      if (faculty) filter.mentor = faculty._id;
      else return sendSuccess(res, []);
    } else if (req.user?.role === ROLES.HOD && req.user.departmentId) {
      const students = await Student.find({ department: new mongoose.Types.ObjectId(req.user.departmentId) })
        .select('_id')
        .lean();
      filter.student = { $in: students.map((s: any) => s._id) };
    } else if (req.user?.role !== ROLES.ADMIN) {
      return sendError(res, 'You are not authorized to view meeting records.', 403);
    }

    // A faculty member may only see meetings for currently-assigned mentees.
    if (req.user?.role === ROLES.FACULTY) {
      const faculty = await Faculty.findOne(
        mongoose.Types.ObjectId.isValid(req.user.facultyId || '')
          ? { _id: req.user.facultyId }
          : { employeeId: req.user.facultyId }
      ).select('_id');
      if (faculty) {
        const asgs = await MentorAssignment.find({ mentor: faculty._id, status: 'ACTIVE' })
          .select('student')
          .lean();
        filter.student = { $in: asgs.map((a: any) => a.student) };
      }
    }

    if (studentId) {
      const s = mongoose.Types.ObjectId.isValid(studentId)
        ? await Student.findById(studentId)
        : await Student.findOne({ registerNumber: String(studentId).toUpperCase() });
      if (!s) return sendSuccess(res, []);
      // Explicit filter must still respect scope.
      const access = await checkStudentAccess(req.user, s);
      if (!access.allowed) return sendError(res, access.message, access.status);
      filter.student = s._id;
    }

    if (mentorId) {
      const f = mongoose.Types.ObjectId.isValid(mentorId)
        ? await Faculty.findById(mentorId)
        : await Faculty.findOne({ employeeId: mentorId });
      if (f) filter.mentor = f._id;
    }

    if (date) filter.meetingDate = date;
    if (status) filter.meetingStatus = status;

    const meetingDocs = await Meeting.find(filter)
      .populate({ path: 'student', populate: { path: 'department' } })
      .populate({ path: 'mentor', populate: { path: 'user' } })
      .sort({ meetingDate: -1, createdAt: -1 });

    const meetings = meetingDocs.map((m: any) => {
      const stu = m.student || {};
      const dept = stu.department || {};
      const mentor = m.mentor || {};
      const mentorUser = mentor.user || {};
      const label = describeMeetingDate(m.meetingDate);

      return {
        id: m._id.toString(),
        _id: m._id.toString(),
        student_id: stu._id ? stu._id.toString() : '',
        mentor_id: mentor._id ? mentor._id.toString() : '',
        meeting_date: m.meetingDate,
        meeting_date_formatted: formatMeetingDate(m.meetingDate),
        meeting_phase: label.phase,
        meeting_title: label.title,
        meeting_time: m.meetingTime,
        location: m.location,
        attendance_status: m.attendanceStatus,
        meeting_status: m.meetingStatus,
        challenges_discussed: m.challengesDiscussed || '',
        student_feedback: m.studentFeedback || '',
        counselling_provided: m.counsellingProvided || '',
        corrective_action: m.correctiveAction || '',
        follow_up_required: m.followUpRequired ? 1 : 0,
        follow_up_date: m.followUpDate || null,
        mentor_remarks: m.mentorRemarks || '',
        register_number: stu.registerNumber || '',
        student_name: stu.fullName || '',
        department_id: dept._id ? dept._id.toString() : '',
        department_name: dept.name || '',
        department_code: dept.code || '',
        mentor_name: mentorUser.fullName || '',
        mentor_cabin: mentor.cabinLocation || '',
        created_at: m.createdAt,
      };
    });

    return sendSuccess(res, meetings);
  } catch (err: any) {
    console.error('getMeetings error:', err);
    return sendError(res, 'Failed to fetch meetings ledger.', 500);
  }
}

// Log a New Saturday Meeting Record
export async function createMeetingRecord(req: AuthRequest, res: Response) {
  const {
    studentId,
    meetingDate,
    meetingTime,
    location,
    attendanceStatus = ATTENDANCE_STATUS.PRESENT,
    meetingStatus = MEETING_STATUS.COMPLETED,
    challengesDiscussed,
    studentFeedback,
    counsellingProvided,
    correctiveAction,
    followUpRequired,
    followUpDate,
    mentorRemarks,
  } = req.body;

  if (!studentId || !meetingDate) {
    return sendError(res, 'Student ID and Saturday meeting date are required.', 400);
  }

  // The meeting date must be a real, parseable calendar date.
  const parsedDate = parseMeetingDate(meetingDate);
  if (!parsedDate) {
    return sendError(res, 'A valid meeting date (YYYY-MM-DD) is required.', 400);
  }

  try {
    const student = mongoose.Types.ObjectId.isValid(studentId)
      ? await Student.findById(studentId)
      : await Student.findOne({ registerNumber: String(studentId).toUpperCase() });
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    // A faculty member may ONLY log meetings for students they are actually
    // assigned to mentor. The active mentor is never silently auto-substituted.
    let mentorDoc: any = null;
    if (req.user?.role === ROLES.FACULTY) {
      const isAssigned = await isActiveMentorOf(req.user, student._id.toString());
      if (!isAssigned) {
        return sendError(
          res,
          'Access denied: you are not the active assigned mentor for this student, so you cannot log a meeting for them.',
          403
        );
      }
      const faculty = mongoose.Types.ObjectId.isValid(req.user.facultyId || '')
        ? await Faculty.findById(req.user.facultyId)
        : await Faculty.findOne({ employeeId: req.user.facultyId });
      if (!faculty) {
        return sendError(res, 'Faculty record not found for your account.', 404);
      }
      mentorDoc = faculty;
    } else {
      // HOD / Admin: department or institutional scope.
      const access = await checkStudentAccess(req.user, student);
      if (!access.allowed) {
        return sendError(res, access.message, access.status);
      }
      const activeAsg = await MentorAssignment.findOne({ student: student._id, status: 'ACTIVE' });
      if (!activeAsg) {
        return sendError(res, 'Student has no active mentor assigned to conduct this meeting.', 400);
      }
      mentorDoc = await Faculty.findById(activeAsg.mentor);
    }

    if (!mentorDoc) {
      return sendError(res, 'Active mentor not found for this student.', 400);
    }

    const settings = await SystemSetting.find({
      key: { $in: ['saturday_meeting_time', 'saturday_meeting_location'] },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const finalTime = meetingTime || settingsMap['saturday_meeting_time'] || '10:30 AM';
    const finalLocation = location || settingsMap['saturday_meeting_location'] || 'Faculty Cabin';

    const meeting = await Meeting.create({
      student: student._id,
      mentor: mentorDoc._id,
      meetingDate,
      meetingTime: finalTime,
      location: finalLocation,
      attendanceStatus,
      meetingStatus,
      challengesDiscussed: challengesDiscussed || '',
      studentFeedback: studentFeedback || '',
      counsellingProvided: counsellingProvided || '',
      correctiveAction: correctiveAction || '',
      followUpRequired: Boolean(followUpRequired),
      followUpDate: followUpDate || null,
      mentorRemarks: mentorRemarks || '',
    });

    // Notify using the label derived from the stored date.
    const label = describeMeetingDate(meetingDate);
    await Notification.create({
      user: student.user,
      title: 'Meeting Record Updated',
      message: `${label.title}: your mentor has updated the record for the meeting on ${formatMeetingDate(meetingDate)}.`,
      type: 'MEETING_PENDING',
      relatedEntity: 'MEETING',
      relatedEntityId: meeting._id.toString(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_MEETING_RECORD',
      entity: 'MEETING',
      entityId: meeting._id.toString(),
      details: {
        studentId: student._id.toString(),
        registerNumber: student.registerNumber,
        meetingDate,
        attendanceStatus,
        meetingStatus,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        meetingId: meeting._id.toString(),
        studentId: student._id.toString(),
        meetingDate,
        meeting_title: label.title,
      },
      'Meeting record saved successfully.',
      201
    );
  } catch (err: any) {
    console.error('createMeetingRecord error:', err);
    return sendError(res, 'Failed to save meeting record.', 500);
  }
}
