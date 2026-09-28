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
import { askMentorAiBot, correctGrammarAndSpelling } from './ai-assistant.service.js';

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
        counselling_date: c.sessionDate || c.date,
        counsellingDate: c.sessionDate || c.date,
        category: c.category,
        concern_reason: c.concernReason || '',
        concernReason: c.concernReason || '',
        discussion_observation: c.discussionObservation || c.challengeObserved || '',
        discussionObservation: c.discussionObservation || c.challengeObserved || '',
        challenge_observed: c.challengeObserved || c.discussionObservation || '',
        challengeObserved: c.challengeObserved || c.discussionObservation || '',
        skill_needing_improvement: c.skillNeedingImprovement || '',
        skillNeedingImprovement: c.skillNeedingImprovement || '',
        action_plan: c.actionPlan || c.correctiveAction || '',
        actionPlan: c.actionPlan || c.correctiveAction || '',
        corrective_action: c.correctiveAction || c.actionPlan || '',
        correctiveAction: c.correctiveAction || c.actionPlan || '',
        expected_improvement: c.expectedImprovement || '',
        expectedImprovement: c.expectedImprovement || '',
        ai_generated: 0,
        aiGenerated: false,
        student_feedback: c.studentFeedback || '',
        mentor_remarks: c.mentorRemarks || '',
        mentorRemarks: c.mentorRemarks || '',
        follow_up_date: c.followUpDate || '',
        followUpDate: c.followUpDate || '',
        status: c.status || 'Completed',
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

// 3. Official Save of Counselling Record (Only manually saved by mentor)
export async function createCounsellingRecord(req: AuthRequest, res: Response) {
  const {
    studentId,
    counsellingDate,
    sessionDate,
    date,
    category = 'Academic',
    concernReason,
    discussionObservation,
    challengeObserved,
    skillNeedingImprovement,
    skillsNeedingImprovement,
    mentorRemarks,
    actionPlan,
    correctiveAction,
    expectedImprovement,
    followUpDate,
    status = 'Completed',
    studentFeedback,
  } = req.body;

  const effectiveDate = counsellingDate || sessionDate || date || new Date().toISOString().split('T')[0];
  const effectiveChallenge = (discussionObservation || challengeObserved || concernReason || '').trim();
  const effectiveAction = (actionPlan || correctiveAction || 'Discussion conducted and mentee guided.').trim();
  const effectiveSkills = (skillsNeedingImprovement || skillNeedingImprovement || '').trim();
  const effectiveRemarks = (mentorRemarks || '').trim();
  const effectiveConcern = (concernReason || '').trim();

  if (!studentId || !effectiveChallenge) {
    return sendError(
      res,
      'Required fields missing: studentId and Discussion / Observation (or Challenge Observed).',
      400
    );
  }

  // Validate or fallback category
  const validCategories = Object.values(COUNSELLING_CATEGORIES) as string[];
  const selectedCategory = category && validCategories.includes(category)
    ? category
    : (effectiveSkills ? 'Skill Development' : 'Academic');

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

    // IMPORTANT: AI generation must NOT happen inside counselling form. AI must NOT generate counselling content automatically.
    const record = await CounsellingRecord.create({
      student: student._id,
      studentId: student._id,
      mentor: mentorDoc._id,
      mentorId: mentorDoc._id,
      sessionDate: effectiveDate,
      date: effectiveDate,
      category: selectedCategory,
      concernReason: effectiveConcern,
      discussionObservation: effectiveChallenge,
      challengeObserved: effectiveChallenge,
      skillNeedingImprovement: effectiveSkills,
      actionPlan: effectiveAction,
      correctiveAction: effectiveAction,
      expectedImprovement: expectedImprovement?.trim() || '',
      studentFeedback: studentFeedback?.trim() || 'Mentee acknowledged discussion.',
      mentorRemarks: effectiveRemarks,
      followUpDate: followUpDate?.trim() || '',
      status: status || 'Completed',
      aiGenerated: false,
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
        aiGenerated: false,
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

// 4. Mentor AI Advisor Bot (Question & Answer + Copyable Guidance)
export async function askMentorAiBotController(req: AuthRequest, res: Response) {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return sendError(res, 'Please provide a mentoring question or discussion topic.', 400);
  }

  try {
    const result = await askMentorAiBot(question);
    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('askMentorAiBot error:', err);
    return sendError(res, 'Failed to consult Mentor AI Assistant.', 500);
  }
}

// 5. Mentor Writing Assistant (Spelling & Grammar Correction)
export async function grammarCheckController(req: AuthRequest, res: Response) {
  const { text } = req.body;
  if (text === undefined || text === null || typeof text !== 'string') {
    return sendError(res, 'Text content is required for grammar check.', 400);
  }

  try {
    const result = await correctGrammarAndSpelling(text);
    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('grammarCheck error:', err);
    return sendError(res, 'Failed to perform grammar check.', 500);
  }
}

