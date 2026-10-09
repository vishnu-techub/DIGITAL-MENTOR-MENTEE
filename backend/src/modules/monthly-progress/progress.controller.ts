import { Response } from 'express';
import {
  MonthlyProgress,
  Student,
  Faculty,
  MentorAssignment,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { isValidId, toLocalId, type LocalId } from '../../services/localId.js';

export async function getMonthlyProgress(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  try {
    let student = null;
    if (isValidId(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    const progressDocs = await MonthlyProgress.find({ student: student._id })
      .populate({ path: 'mentor', populate: { path: 'user' } })
      .sort({ createdAt: -1 });

    const progressList = progressDocs.map((mp: any) => {
      const mentor = mp.mentor || {};
      const mentorUser = mentor.user || {};

      return {
        id: mp._id.toString(),
        _id: mp._id.toString(),
        student_id: student._id.toString(),
        mentor_id: mentor._id ? mentor._id.toString() : '',
        academic_year: mp.academicYear,
        month_name: mp.monthName,
        academic_rating: mp.academicRating,
        academic_notes: mp.academicNotes || '',
        placement_rating: mp.placementRating,
        placement_notes: mp.placementNotes || '',
        ec_rating: mp.ecRating,
        ec_notes: mp.ecNotes || '',
        innovation_rating: mp.innovationRating,
        innovation_notes: mp.innovationNotes || '',
        skill_rating: mp.skillRating,
        skill_notes: mp.skillNotes || '',
        mentor_name: mentorUser.fullName || '',
        mentor_designation: mentor.designation || '',
        created_at: mp.createdAt,
      };
    });

    return sendSuccess(res, progressList);
  } catch (err: any) {
    console.error('getMonthlyProgress error:', err);
    return sendError(res, 'Failed to fetch monthly progress records.', 500);
  }
}

export async function createMonthlyProgress(req: AuthRequest, res: Response) {
  const {
    studentId,
    academicYear,
    monthName,
    academicRating,
    academicNotes,
    placementRating,
    placementNotes,
    ecRating,
    ecNotes,
    innovationRating,
    innovationNotes,
    skillRating,
    skillNotes,
  } = req.body;

  if (!studentId || !academicYear || !monthName) {
    return sendError(res, 'Student ID, academic year, and month name are required.', 400);
  }

  try {
    let student = null;
    if (isValidId(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    let mentorDoc = null;
    if (req.user?.facultyId) {
      if (isValidId(req.user.facultyId)) {
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
        return sendError(res, 'Student has no active mentor assigned.', 400);
      }
      mentorDoc = await Faculty.findById(activeAsg.mentor);
    }

    if (!mentorDoc) {
      return sendError(res, 'Active mentor not found.', 400);
    }

    const progress = await MonthlyProgress.create({
      student: student._id,
      mentor: mentorDoc._id,
      academicYear,
      monthName,
      academicRating: academicRating ? parseInt(academicRating, 10) : 3,
      academicNotes: academicNotes || '',
      placementRating: placementRating ? parseInt(placementRating, 10) : 3,
      placementNotes: placementNotes || '',
      ecRating: ecRating ? parseInt(ecRating, 10) : 3,
      ecNotes: ecNotes || '',
      innovationRating: innovationRating ? parseInt(innovationRating, 10) : 3,
      innovationNotes: innovationNotes || '',
      skillRating: skillRating ? parseInt(skillRating, 10) : 3,
      skillNotes: skillNotes || '',
    });

    await logAudit({
      userId: req.user!.id,
      action: 'ADD_MONTHLY_PROGRESS',
      entity: 'MONTHLY_PROGRESS',
      entityId: progress._id.toString(),
      details: {
        studentId: student._id.toString(),
        registerNumber: student.registerNumber,
        monthName,
        academicYear,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        progressId: progress._id.toString(),
        studentId: student._id.toString(),
        monthName,
      },
      'Monthly progress evaluation saved successfully.',
      201
    );
  } catch (err: any) {
    console.error('createMonthlyProgress error:', err);
    return sendError(res, 'Failed to save monthly progress evaluation.', 500);
  }
}
