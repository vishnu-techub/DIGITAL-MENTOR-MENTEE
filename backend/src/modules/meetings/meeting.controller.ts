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
import { getUpcomingSaturday, getPreviousSaturday } from '../../utils/date.js';

// Get Institutional Saturday Configuration
export async function getSaturdaySchedule(req: AuthRequest, res: Response) {
  try {
    const settings = await SystemSetting.find({
      key: { $regex: '^saturday_meeting_' },
    });

    const config: Record<string, string> = {};
    for (const s of settings) {
      config[s.key] = s.value;
    }

    const nextSaturday = getUpcomingSaturday();
    const lastSaturday = getPreviousSaturday();

    return sendSuccess(res, {
      day: config['saturday_meeting_day'] || 'Saturday',
      time: config['saturday_meeting_time'] || '10:30 AM',
      location: config['saturday_meeting_location'] || 'Faculty Cabin / Mentoring Room',
      nextSaturdayDate: nextSaturday,
      lastSaturdayDate: lastSaturday,
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

    // Role Scoping
    if (req.user?.role === ROLES.STUDENT && req.user.studentId) {
      if (mongoose.Types.ObjectId.isValid(req.user.studentId)) {
        filter.student = req.user.studentId;
      } else {
        const s = await Student.findOne({ registerNumber: req.user.studentId });
        if (s) filter.student = s._id;
      }
    } else if (req.user?.role === ROLES.FACULTY && req.user.facultyId) {
      if (mongoose.Types.ObjectId.isValid(req.user.facultyId)) {
        filter.mentor = req.user.facultyId;
      } else {
        const f = await Faculty.findOne({ employeeId: req.user.facultyId });
        if (f) filter.mentor = f._id;
      }
    }

    // Filters
    if (studentId) {
      if (mongoose.Types.ObjectId.isValid(studentId)) {
        filter.student = studentId;
      } else {
        const s = await Student.findOne({ registerNumber: studentId });
        if (s) filter.student = s._id;
      }
    }

    if (mentorId) {
      if (mongoose.Types.ObjectId.isValid(mentorId)) {
        filter.mentor = mentorId;
      } else {
        const f = await Faculty.findOne({ employeeId: mentorId });
        if (f) filter.mentor = f._id;
      }
    }

    if (date) {
      filter.meetingDate = date;
    }

    if (status) {
      filter.meetingStatus = status;
    }

    const meetingDocs = await Meeting.find(filter)
      .populate({
        path: 'student',
        populate: { path: 'department' },
      })
      .populate({
        path: 'mentor',
        populate: { path: 'user' },
      })
      .sort({ meetingDate: -1, createdAt: -1 });

    const meetings = meetingDocs
      .filter((m: any) => {
        // HOD scoping by department
        if (req.user?.role === ROLES.HOD && req.user.departmentId) {
          const dept = m.student?.department;
          const deptId = dept?._id ? dept._id.toString() : dept?.toString();
          return deptId === req.user.departmentId;
        }
        return true;
      })
      .map((m: any) => {
        const stu = m.student || {};
        const dept = stu.department || {};
        const mentor = m.mentor || {};
        const mentorUser = mentor.user || {};

        return {
          id: m._id.toString(),
          _id: m._id.toString(),
          student_id: stu._id ? stu._id.toString() : '',
          mentor_id: mentor._id ? mentor._id.toString() : '',
          meeting_date: m.meetingDate,
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

// Log a New Saturday Meeting Record (Always creates a new historical entry)
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

  try {
    let student = null;
    if (mongoose.Types.ObjectId.isValid(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    // Determine mentor ID (if faculty, use their facultyId; if admin/HOD, find current active mentor)
    let mentorDoc = null;
    if (req.user?.facultyId) {
      if (mongoose.Types.ObjectId.isValid(req.user.facultyId)) {
        mentorDoc = await Faculty.findById(req.user.facultyId);
      } else {
        mentorDoc = await Faculty.findOne({ employeeId: req.user.facultyId });
      }
    }

    if (!mentorDoc) {
      const activeAsg = await MentorAssignment.findOne({
        student: student._id,
        status: 'ACTIVE',
      });
      if (!activeAsg) {
        return sendError(res, 'Student has no active mentor assigned to conduct this meeting.', 400);
      }
      mentorDoc = await Faculty.findById(activeAsg.mentor);
    }

    if (!mentorDoc) {
      return sendError(res, 'Active mentor not found for this student.', 400);
    }

    // Default institutional time & location if not explicitly provided
    let finalTime = meetingTime;
    let finalLocation = location;
    if (!finalTime || !finalLocation) {
      const settings = await SystemSetting.find({
        key: { $in: ['saturday_meeting_time', 'saturday_meeting_location'] },
      });
      const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
      finalTime = finalTime || settingsMap['saturday_meeting_time'] || '10:30 AM';
      finalLocation = finalLocation || settingsMap['saturday_meeting_location'] || 'Faculty Cabin';
    }

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

    // Notify student of meeting log record
    await Notification.create({
      user: student.user,
      title: 'Saturday Meeting Logged',
      message: `Your mentor has updated the record for Saturday meeting on ${meetingDate}.`,
      type: 'SYSTEM_ANNOUNCEMENT',
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
      },
      'Meeting record saved successfully.',
      201
    );
  } catch (err: any) {
    console.error('createMeetingRecord error:', err);
    return sendError(res, 'Failed to save meeting record.', 500);
  }
}
