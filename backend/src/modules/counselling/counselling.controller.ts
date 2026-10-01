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
import { COUNSELLING_CATEGORIES, COUNSELLING_5_CATEGORIES, CounsellingCategory } from '../../config/constants.js';
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
        categories: Array.isArray(c.categories) && c.categories.length > 0
          ? c.categories
          : (c.category ? c.category.split(',').map((s: string) => s.trim()).filter(Boolean) : ['Academic Development']),
        category: c.category || (Array.isArray(c.categories) ? c.categories.join(', ') : 'Academic Development'),
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
    categories,
    category,
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

  // Validate required multi-select categories (ONLY 5 basic categories)
  const rawCategories = Array.isArray(categories)
    ? categories
    : (categories ? [categories] : (category ? (Array.isArray(category) ? category : [category]) : []));

  const validCategories: CounsellingCategory[] = rawCategories
    .map((c: any) => String(c).trim())
    .filter((c: string): c is CounsellingCategory => COUNSELLING_5_CATEGORIES.includes(c as any));

  if (validCategories.length === 0) {
    return sendError(
      res,
      'Counselling Category is required. Please select at least one of: Academic Development, Skill Development, Career Development, Personal Development, Extra-Curricular Activities.',
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

    // IMPORTANT: AI generation must NOT happen inside counselling form. AI must NOT generate counselling content automatically.
    const record = await CounsellingRecord.create({
      student: student._id,
      studentId: student._id,
      mentor: mentorDoc._id,
      mentorId: mentorDoc._id,
      sessionDate: effectiveDate,
      date: effectiveDate,
      categories: validCategories,
      category: validCategories.join(', '),
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
      message: `A new counselling record under "${validCategories.join(', ')}" was added by your mentor.`,
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
        categories: validCategories,
        category: validCategories.join(', '),
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
        categories: record.categories,
        category: record.category,
        challengeObserved: record.challengeObserved,
        correctiveAction: record.correctiveAction,
        sessionDate: record.sessionDate,
        createdAt: record.createdAt,
      },
      'Counselling record created successfully.',
      201
    );
  } catch (err: any) {
    console.error('createCounsellingRecord error:', err);
    return sendError(res, 'Failed to save counselling record: ' + err.message, 500);
  }
}

// 4. Update Counselling Record (Preserves categories array and selections when editing)
export async function updateCounsellingRecord(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const {
    counsellingDate,
    sessionDate,
    date,
    categories,
    category,
    concernReason,
    discussionObservation,
    challengeObserved,
    skillNeedingImprovement,
    mentorRemarks,
    actionPlan,
    correctiveAction,
    expectedImprovement,
    followUpDate,
    status,
  } = req.body;

  try {
    const record = await CounsellingRecord.findById(id);
    if (!record) {
      return sendError(res, 'Counselling record not found.', 404);
    }

    if (categories !== undefined || category !== undefined) {
      const raw = Array.isArray(categories) ? categories : (categories ? [categories] : (category ? (Array.isArray(category) ? category : [category]) : []));
      const valid: CounsellingCategory[] = raw
        .map((c: any) => String(c).trim())
        .filter((c: string): c is CounsellingCategory => COUNSELLING_5_CATEGORIES.includes(c as any));
      if (valid.length === 0) {
        return sendError(res, 'At least one valid counselling category is required.', 400);
      }
      record.categories = valid;
      record.category = valid.join(', ');
    }

    if (counsellingDate || sessionDate || date) {
      const d = counsellingDate || sessionDate || date;
      record.sessionDate = d;
      record.date = d;
    }
    if (concernReason !== undefined) record.concernReason = concernReason;
    if (discussionObservation !== undefined || challengeObserved !== undefined) {
      const text = discussionObservation || challengeObserved;
      record.discussionObservation = text;
      record.challengeObserved = text;
    }
    if (skillNeedingImprovement !== undefined) record.skillNeedingImprovement = skillNeedingImprovement;
    if (actionPlan !== undefined || correctiveAction !== undefined) {
      const text = actionPlan || correctiveAction;
      record.actionPlan = text;
      record.correctiveAction = text;
    }
    if (expectedImprovement !== undefined) record.expectedImprovement = expectedImprovement;
    if (mentorRemarks !== undefined) record.mentorRemarks = mentorRemarks;
    if (followUpDate !== undefined) record.followUpDate = followUpDate;
    if (status !== undefined) record.status = status;

    await record.save();

    return sendSuccess(
      res,
      {
        recordId: record._id.toString(),
        _id: record._id.toString(),
        categories: record.categories,
        category: record.category,
        sessionDate: record.sessionDate,
        discussionObservation: record.discussionObservation,
        actionPlan: record.actionPlan,
        status: record.status,
      },
      'Counselling record updated successfully.'
    );
  } catch (err: any) {
    console.error('updateCounsellingRecord error:', err);
    return sendError(res, 'Failed to update counselling record.', 500);
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
/**
 * Upper bound on the text sent for proofreading. Long enough for any remarks,
 * achievements or meeting-notes field, short enough that a single request cannot
 * be used to push a large payload through the AI provider.
 */
const MAX_GRAMMAR_CHECK_CHARS = 4000;

export async function grammarCheckController(req: AuthRequest, res: Response) {
  const { text } = req.body;
  if (text === undefined || text === null || typeof text !== 'string') {
    return sendError(res, 'Text content is required for grammar check.', 400);
  }

  if (!text.trim()) {
    return sendSuccess(res, { original: text, corrected: text, hasCorrections: false, source: 'INSTITUTIONAL_GRAMMAR_ENGINE' });
  }

  if (text.length > MAX_GRAMMAR_CHECK_CHARS) {
    return sendError(res, `Text is too long to check. Please keep it under ${MAX_GRAMMAR_CHECK_CHARS} characters.`, 400);
  }

  try {
    const result = await correctGrammarAndSpelling(text);
    // Only the four documented fields are returned. Nothing derived from the
    // request (key, model, provider error text) is echoed back to the client.
    return sendSuccess(res, {
      original: result.original,
      corrected: result.corrected,
      hasCorrections: result.hasCorrections,
      source: result.source,
    });
  } catch (err: any) {
    // The provider error is logged server-side only; the client receives a
    // generic message so no key, endpoint or internal detail can leak.
    console.error('grammarCheck error:', err);
    return sendError(res, 'We could not check your text just now. Your text has not been changed.', 500);
  }
}

