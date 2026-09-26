import { Response } from 'express';
import mongoose from 'mongoose';
import {
  CounsellingRecord,
  Student,
  Faculty,
  MentorAssignment,
  Notification,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { COUNSELLING_CATEGORIES } from '../../config/constants.js';
import { generateCounsellingSuggestion } from './ai-counselling.service.js';

// 1. Get Counselling Records for a Specific Student (Strictly scoped)
export async function getCounsellingRecords(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  try {
    let student = null;
    if (mongoose.Types.ObjectId.isValid(studentId)) {
      student = await Student.findById(studentId);
    }
    if (!student) {
      student = await Student.findOne({ registerNumber: studentId });
    }
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    const records = await CounsellingRecord.find({
      $or: [{ student: student._id }, { studentId: student._id }],
    })
      .populate({ path: 'mentor', populate: { path: 'user' } })
      .populate({ path: 'mentorId', populate: { path: 'user' } })
      .sort({ sessionDate: -1, date: -1, createdAt: -1 });

    const formatted = records.map((c: any) => {
      const mentor = c.mentor || c.mentorId || {};
      const mentorUser = mentor.user || {};

      return {
        id: c._id.toString(),
        _id: c._id.toString(),
        student_id: student._id.toString(),
        studentId: student._id.toString(),
        mentor_id: mentor._id ? mentor._id.toString() : '',
        mentorId: mentor._id ? mentor._id.toString() : '',
        date: c.date || c.sessionDate,
        session_date: c.sessionDate || c.date,
        category: c.category,
        challenge_observed: c.challengeObserved,
        challengeObserved: c.challengeObserved,
        corrective_action: c.correctiveAction,
        correctiveAction: c.correctiveAction,
        expected_improvement: c.expectedImprovement || '',
        expectedImprovement: c.expectedImprovement || '',
        ai_generated: c.aiGenerated ? 1 : 0,
        aiGenerated: Boolean(c.aiGenerated),
        student_feedback: c.studentFeedback || '',
        mentor_remarks: c.mentorRemarks || '',
        student_acknowledgement_status: c.studentAcknowledgementStatus || 'ACKNOWLEDGED',
        mentor_signature_status: c.mentorSignatureStatus || 'SIGNED',
        mentor_name: mentorUser.fullName || '',
        mentor_designation: mentor.designation || '',
        created_at: c.createdAt,
      };
    });

    return sendSuccess(res, formatted);
  } catch (err: any) {
    console.error('getCounsellingRecords error:', err);
    return sendError(res, 'Failed to fetch counselling records.', 500);
  }
}

// 2. AI Counselling Assistant — Generates suggestions without saving to database
export async function getAiCounsellingSuggestion(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;
  const { category, mentorPrompt } = req.body;

  if (!mentorPrompt || !mentorPrompt.trim()) {
    return sendError(res, "Please describe the student's improvement need or observation.", 400);
  }

  const validCategories = Object.values(COUNSELLING_CATEGORIES) as string[];
  const selectedCategory = category && validCategories.includes(category)
    ? category
    : 'Skill Development';

  try {
    let student = null;
    if (studentId) {
      if (mongoose.Types.ObjectId.isValid(studentId)) {
        student = await Student.findById(studentId);
      }
      if (!student) {
        student = await Student.findOne({ registerNumber: studentId });
      }
    }

    const suggestion = await generateCounsellingSuggestion({
      category: selectedCategory,
      mentorPrompt: mentorPrompt.trim(),
      studentName: student?.fullName,
      registerNumber: student?.registerNumber,
    });

    return sendSuccess(
      res,
      {
        category: selectedCategory,
        mentorPrompt: mentorPrompt.trim(),
        challengeObserved: suggestion.challengeObserved,
        correctiveAction: suggestion.correctiveAction,
        expectedImprovement: suggestion.expectedImprovement,
        source: suggestion.source,
      },
      'AI counselling suggestion generated. Please review and edit before saving.'
    );
  } catch (err: any) {
    console.error('getAiCounsellingSuggestion error:', err);
    return sendError(res, 'Failed to generate AI counselling suggestion: ' + err.message, 500);
  }
}

// 3. Official Save of Counselling Record (Only triggered when mentor clicks [ ACCEPT & SAVE ])
export async function createCounsellingRecord(req: AuthRequest, res: Response) {
  const {
    studentId,
    sessionDate,
    date,
    category,
    challengeObserved,
    correctiveAction,
    expectedImprovement,
    studentFeedback,
    mentorRemarks,
    aiGenerated = false,
  } = req.body;

  const effectiveDate = sessionDate || date || new Date().toISOString().split('T')[0];

  if (!studentId || !category || !challengeObserved || !correctiveAction) {
    return sendError(
      res,
      'Required fields missing: studentId, category, challengeObserved, correctiveAction.',
      400
    );
  }

  // Validate category
  const validCategories = Object.values(COUNSELLING_CATEGORIES) as string[];
  if (!validCategories.includes(category)) {
    return sendError(
      res,
      `Invalid category. Allowed domains: ${validCategories.join(', ')}`,
      400
    );
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
        return sendError(res, 'Student has no active mentor assigned.', 400);
      }
      mentorDoc = await Faculty.findById(activeAsg.mentor);
    }

    if (!mentorDoc) {
      return sendError(res, 'Active mentor not found.', 400);
    }

    const record = await CounsellingRecord.create({
      student: student._id,
      studentId: student._id,
      mentor: mentorDoc._id,
      mentorId: mentorDoc._id,
      sessionDate: effectiveDate,
      date: effectiveDate,
      category,
      challengeObserved: challengeObserved.trim(),
      correctiveAction: correctiveAction.trim(),
      expectedImprovement: expectedImprovement?.trim() || '',
      studentFeedback: studentFeedback?.trim() || '',
      mentorRemarks: mentorRemarks?.trim() || '',
      aiGenerated: Boolean(aiGenerated),
      studentAcknowledgementStatus: 'ACKNOWLEDGED',
      mentorSignatureStatus: 'SIGNED',
    });

    // Notify student
    await Notification.create({
      user: student.user,
      title: 'New Counselling Entry Added',
      message: `A new counselling record under domain "${category}" was added by your mentor.`,
      type: 'SYSTEM_ANNOUNCEMENT',
      relatedEntity: 'COUNSELLING',
      relatedEntityId: record._id.toString(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'ADD_COUNSELLING_RECORD',
      entity: 'COUNSELLING_RECORD',
      entityId: record._id.toString(),
      details: {
        studentId: student._id.toString(),
        registerNumber: student.registerNumber,
        category,
        sessionDate: effectiveDate,
        aiGenerated: Boolean(aiGenerated),
      },
      req,
    });

    return sendSuccess(
      res,
      {
        recordId: record._id.toString(),
        _id: record._id.toString(),
        studentId: student._id.toString(),
        category,
        challengeObserved: record.challengeObserved,
        correctiveAction: record.correctiveAction,
        expectedImprovement: record.expectedImprovement,
        aiGenerated: record.aiGenerated,
      },
      'Counselling record created successfully.',
      201
    );
  } catch (err: any) {
    console.error('createCounsellingRecord error:', err);
    return sendError(res, 'Failed to save counselling record.', 500);
  }
}
