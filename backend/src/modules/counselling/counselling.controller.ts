import { Response } from 'express';
import {
  CounsellingRecord,
  MentoringEvidence,
  Student,
  Faculty,
  MentorAssignment,
  Notification,
  Meeting,
  DISCUSSION_WITH_PARTICIPANTS,
  RECORD_KINDS,
  type DiscussionWith,
  type MentoringRecordKind,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { COUNSELLING_CATEGORIES, COUNSELLING_5_CATEGORIES, CounsellingCategory, ROLES } from '../../config/constants.js';
import { generateCounsellingSuggestion } from './ai-counselling.service.js';
import { askMentorAiBot, correctGrammarAndSpelling } from './ai-assistant.service.js';
import { isValidId, toLocalId, newLocalId, type LocalId } from '../../services/localId.js';
import { checkStudentAccess, isActiveMentorOf, resolveFacultyIdForUser } from '../../utils/access.util.js';
import {
  EvidenceValidationError,
  appendEvidenceRefs,
  buildEvidenceViews,
  deleteUnreferencedEvidence,
  normaliseEvidenceRefs,
  removeEvidenceRefs,
  resolveEvidenceFile,
  resolveUploaderFaculty,
  storeEvidenceUploads,
  toEvidenceView,
  assertEvidenceAccess,
  type StoredEvidence,
} from './evidence.service.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ============================================================================
 * MENTORING (internally still "counselling" for backwards compatibility)
 * ============================================================================
 * The user-facing term is "Mentoring". Internal identifiers — this file, the
 * route paths, the stored fields, the API's legacy snake_case aliases — are all
 * left exactly as they were so no existing record, contract or test breaks.
 * ============================================================================
 */

/**
 * Multipart form fields are always strings. A JSON body sends real arrays and
 * objects; a multipart body sends `"[\"student\"]"`. Both must work, so complex
 * fields are normalised through here before validation.
 */
function coerceField<T>(value: any, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const looksJson =
      (trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'));
    if (looksJson) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return fallback;
      }
    }
    // "student,parent" is a convenient multipart encoding of the same list.
    if (trimmed.includes(',')) return trimmed.split(',').map((s) => s.trim()) as unknown as T;
  }
  return value as T;
}

/** Flatten multer's `req.files` into a predictable array. */
function uploadedFiles(req: any): any[] {
  const files = req?.files;
  if (!files) return [];
  if (Array.isArray(files)) return files.filter(Boolean);
  // Single-file upload shape.
  return Object.values(files).flat().filter(Boolean) as any[];
}

const DISCUSSION_WITH_HELP =
  'Please select at least one discussion participant: Student, Parent, or both.';

/**
 * Validate WHO the mentor discussed with.
 *
 * `student`, `parent`, or `['student','parent']`. They are deliberately NOT
 * mutually exclusive. An empty / unknown selection is refused — the mentor is
 * never allowed to guess, and neither is the server.
 */
export function parseDiscussionWith(raw: any): {
  ok: boolean;
  value: DiscussionWith[];
  message?: string;
} {
  const list = coerceField<unknown>(raw, []);
  const candidates = Array.isArray(list) ? list : list === undefined || list === null ? [] : [list];

  const normalised: DiscussionWith[] = [];
  const invalid: string[] = [];
  for (const entry of candidates) {
    if (typeof entry !== 'string') {
      invalid.push(String(entry));
      continue;
    }
    const value = entry.trim().toLowerCase();
    if (!value) continue;
    if (!(DISCUSSION_WITH_PARTICIPANTS as readonly string[]).includes(value)) {
      invalid.push(entry);
      continue;
    }
    if (!normalised.includes(value as DiscussionWith)) normalised.push(value as DiscussionWith);
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      value: [],
      message: `Unknown discussion participant "${invalid.join(', ')}". Valid participants are: ${DISCUSSION_WITH_PARTICIPANTS.join(', ')}.`,
    };
  }
  if (normalised.length === 0) {
    return { ok: false, value: [], message: DISCUSSION_WITH_HELP };
  }
  return { ok: true, value: normalised };
}

function parseRecordKind(raw: any): { ok: boolean; value: MentoringRecordKind; message?: string } {
  const value = String(coerceField<any>(raw, 'INDIVIDUAL')).trim().toUpperCase();
  if (!(RECORD_KINDS as readonly string[]).includes(value)) {
    return { ok: false, value: 'INDIVIDUAL', message: `Record kind must be one of: ${RECORD_KINDS.join(', ')}.` };
  }
  return { ok: true, value: value as MentoringRecordKind };
}

/** Read-only normalisation of a stored `discussionWith` array. Never invents. */
function normaliseRefsAsParticipants(raw: any): DiscussionWith[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: DiscussionWith[] = [];
  for (const entry of list) {
    const value = String(entry ?? '').trim().toLowerCase();
    if ((DISCUSSION_WITH_PARTICIPANTS as readonly string[]).includes(value) && !out.includes(value as DiscussionWith)) {
      out.push(value as DiscussionWith);
    }
  }
  return out;
}

/** "Student", "Parent" or "Student & Parent" for the mentor's record card. */
export function describeDiscussionWith(participants: DiscussionWith[]): string {
  if (participants.length === 0) return 'Not recorded';
  if (participants.length === 1) return participants[0] === 'student' ? 'Student' : 'Parent';
  return participants.includes('student') && participants.includes('parent') ? 'Student & Parent' : participants.join(' & ');
}

/**
 * Apply mentor narrative text to a record.
 *
 * An EMPTY incoming value is treated as "not supplied" so a partial update can
 * never blank a value that was already recorded. This also keeps
 * `correctiveAction` (which is `required`) satisfiable on an edit that did not
 * mention it, instead of failing validation and surfacing as a 500.
 */
function applyNarrative(record: any, field: string, incoming: unknown): void {
  const value = String(incoming ?? '').trim();
  if (value) record[field] = value;
}

/** Locate a Student by ObjectId or register number. */
async function findStudentByIdOrRegister(idOrReg: string) {
  if (!idOrReg) return null;
  if (isValidId(idOrReg)) {
    const byId = await Student.findById(idOrReg);
    if (byId) return byId;
  }
  return Student.findOne({ registerNumber: String(idOrReg).trim().toUpperCase() });
}

/**
 * Resolve the Faculty record for the authenticated mentor.
 *
 * This is also the AUTHORISATION gate: a FACULTY caller may only act on a
 * student they are the ACTIVE assigned mentor for. The active mentor is never
 * silently substituted.
 */
async function resolveMentorForWrite(user: AuthRequest['user'], student: any): Promise<
  { ok: true; mentor: any } | { ok: false; status: number; message: string }
> {
  if (user?.role === ROLES.FACULTY) {
    const assigned = await isActiveMentorOf(user, String(student._id));
    if (!assigned) {
      return {
        ok: false,
        status: 403,
        message:
          'Access denied: you are not the active assigned mentor for this student, so you cannot record mentoring for them.',
      };
    }
    const facultyId = await resolveFacultyIdForUser(user);
    const mentor = facultyId
      ? await Faculty.findById(facultyId)
      : await Faculty.findOne({ employeeId: user.facultyId });
    if (!mentor) return { ok: false, status: 404, message: 'Faculty record not found for your account.' };
    return { ok: true, mentor };
  }

  const access = await checkStudentAccess(user, student);
  if (!access.allowed) return { ok: false, status: access.status, message: access.message };

  const activeAsg = await MentorAssignment.findOne({ student: student._id, status: 'ACTIVE' });
  if (!activeAsg) return { ok: false, status: 400, message: 'Student has no active mentor assigned.' };
  const mentor = await Faculty.findById(activeAsg.mentor);
  if (!mentor) return { ok: false, status: 400, message: 'Active mentor not found.' };
  return { ok: true, mentor };
}

/** Normalise a YYYY-MM-DD / DD-MM-YYYY meeting or session date to YYYY-MM-DD. */
function normaliseIsoDate(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) ? value : null;
  }
  const dmy = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Ingest any evidence photos attached to a mentoring submission.
 * Returns the freshly stored records; an empty array when none were attached.
 */
async function ingestEvidence(
  req: any,
  mentorId: string,
  context: 'INDIVIDUAL' | 'SATURDAY_MEETING',
  studentIds: string[],
  extra: { evidenceGroupId?: string | null; meetingId?: string | null } = {}
): Promise<StoredEvidence[]> {
  const files = uploadedFiles(req);
  if (files.length === 0) return [];

  const uploader = await resolveUploaderFaculty({ ...req.user, facultyId: mentorId } as any);

  return storeEvidenceUploads({
    files: files.map((f: any) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype })),
    mentorId,
    mentorName: uploader?.name || req.user?.fullName || '',
    context,
    studentIds,
    evidenceGroupId: extra.evidenceGroupId ?? null,
    meetingId: extra.meetingId ?? null,
  });
}

/** Map an evidence error onto a clean HTTP response. */
function sendEvidenceError(res: Response, err: any): Response {
  const status = err instanceof EvidenceValidationError ? err.status : 400;
  const code = err instanceof EvidenceValidationError ? err.code : 'EVIDENCE_REJECTED';
  return res.status(status).json({
    success: false,
    statusCode: status,
    code,
    message: err?.message || 'Evidence upload failed. Please check the photo and try again.',
    meta: { timestamp: new Date().toISOString() },
  });
}


// 1. Get Mentoring Records for a Specific Student (Strictly scoped)
export async function getCounsellingRecords(req: AuthRequest, res: Response) {
  const studentId = req.params.studentId as string;

  try {
    const student = await findStudentByIdOrRegister(studentId);
    if (!student) {
      return sendError(res, 'Student not found.', 404);
    }

    // Read authorisation goes through the ONE central access utility. Without
    // this, any authenticated user could read any other student's mentoring
    // record and its geo-tagged evidence by passing an arbitrary id.
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const records = await CounsellingRecord.find({
      $or: [{ student: student._id }, { studentId: student._id }],
    })
      .populate({ path: 'mentor', populate: { path: 'user' } })
      .populate({ path: 'mentorId', populate: { path: 'user' } })
      .sort({ sessionDate: -1, date: -1, createdAt: -1 });

    const formatted = await Promise.all(
      records.map(async (c: any) => {
        const mentor = c.mentor || c.mentorId || {};
        const mentorUser = mentor.user || {};
        const discussionWith: DiscussionWith[] = normaliseRefsAsParticipants(c.discussionWith);
        const recordKind: MentoringRecordKind = (RECORD_KINDS as readonly string[]).includes(String(c.recordKind))
          ? c.recordKind
          : 'INDIVIDUAL';
        const evidenceRefs = normaliseEvidenceRefs(c.evidence);
        const evidence = await buildEvidenceViews(evidenceRefs.map((ref) => ref.evidenceId));

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
          // Who the mentor held this discussion with (student / parent / both).
          discussion_with: discussionWith,
          discussionWith,
          discussion_with_label: describeDiscussionWith(discussionWith),
          // Individual discussion evidence and Saturday common meeting evidence
          // are both supported and coexist on the same student.
          record_kind: recordKind,
          recordKind,
          evidence,
          evidence_count: evidence.length,
          evidenceCount: evidence.length,
          evidence_group_id: c.evidenceGroupId || null,
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
      })
    );

    return sendSuccess(res, formatted);
  } catch (err: any) {
    console.error('getCounsellingRecords error:', err);
    if (err instanceof EvidenceValidationError) return sendEvidenceError(res, err);
    return sendError(res, 'Failed to fetch mentoring records.', 500);
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
      if (isValidId(studentId)) {
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

// 3. Official Save of Mentoring Record (Only manually saved by mentor)
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

  // Who the mentor held this discussion with. Required, and NOT mutually
  // exclusive: Student, Parent, or both.
  const discussionWith = parseDiscussionWith(req.body.discussionWith ?? req.body.discussion_with);
  if (!discussionWith.ok) {
    return sendError(res, discussionWith.message || DISCUSSION_WITH_HELP, 400);
  }

  const recordKind = parseRecordKind(req.body.recordKind ?? req.body.record_kind);
  if (!recordKind.ok) {
    return sendError(res, recordKind.message as string, 400);
  }

  // Validate required multi-select categories (ONLY 5 basic categories)
  const rawCategories = coerceField<any>(categories ?? category, []);

  const validCategories: CounsellingCategory[] = (Array.isArray(rawCategories) ? rawCategories : [rawCategories])
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
    const student = await findStudentByIdOrRegister(String(studentId));
    if (!student) {
      return sendError(res, 'Student record not found.', 404);
    }

    // Correct mentor/student relationship is enforced server-side. A FACULTY
    // caller who is not this student's ACTIVE assigned mentor is refused.
    const mentorResolution = await resolveMentorForWrite(req.user, student);
    if (!mentorResolution.ok) {
      return sendError(res, mentorResolution.message, mentorResolution.status);
    }
    const mentorDoc = mentorResolution.mentor;

    // Evidence: compression to <= 200 KB is enforced before anything is written to disk.
    let storedEvidence: StoredEvidence[] = [];
    try {
      storedEvidence = await ingestEvidence(req, String(mentorDoc._id), 'INDIVIDUAL', [String(student._id)]);
    } catch (evidenceErr: any) {
      console.error('createCounsellingRecord: evidence rejected:', evidenceErr?.message);
      return sendEvidenceError(res, evidenceErr);
    }

    // IMPORTANT: AI generation must NOT happen inside the mentoring form. AI must NOT generate mentoring content automatically.
    let record: any;
    try {
      record = await CounsellingRecord.create({
        student: student._id,
        studentId: student._id,
        mentor: mentorDoc._id,
        mentorId: mentorDoc._id,
        sessionDate: effectiveDate,
        date: effectiveDate,
        categories: validCategories,
        category: validCategories.join(', '),
        discussionWith: discussionWith.value,
        recordKind: recordKind.value,
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
        evidence: appendEvidenceRefs([], storedEvidence.map((e) => e.evidenceId), String(mentorDoc._id)),
      });
    } catch (recordErr: any) {
      // The record could not be saved, so nothing should reference the photos.
      const cleanup = await deleteUnreferencedEvidence(storedEvidence.map((e) => e.evidenceId));
      console.error('createCounsellingRecord: record save failed, evidence cleanup:', cleanup.removed.length, recordErr?.message);
      throw recordErr;
    }

    // Notify student
    await Notification.create({
      user: student.user,
      title: 'New Mentoring Entry Added',
      message: `A new mentoring record under "${validCategories.join(', ')}" was added by your mentor (discussed with: ${describeDiscussionWith(
        discussionWith.value
      )}).`,
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
        discussionWith: discussionWith.value,
        recordKind: recordKind.value,
        evidenceCount: storedEvidence.length,
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
        discussionWith: record.discussionWith,
        discussion_with: record.discussionWith,
        discussionWithLabel: describeDiscussionWith(normaliseRefsAsParticipants(record.discussionWith)),
        recordKind: record.recordKind,
        record_kind: record.recordKind,
        challengeObserved: record.challengeObserved,
        correctiveAction: record.correctiveAction,
        sessionDate: record.sessionDate,
        evidence: await buildEvidenceViews(normaliseEvidenceRefs(record.evidence).map((r) => r.evidenceId)),
        evidenceCount: storedEvidence.length,
        createdAt: record.createdAt,
      },
      storedEvidence.length > 0
        ? `Mentoring record created successfully with ${storedEvidence.length} evidence photo(s).`
        : 'Mentoring record created successfully.',
      201
    );
  } catch (err: any) {
    console.error('createCounsellingRecord error:', err);
    if (err instanceof EvidenceValidationError) return sendEvidenceError(res, err);
    return sendError(res, 'Failed to save mentoring record: ' + err.message, 500);
  }
}

// 4. Update Mentoring Record
//    Evidence handling here is APPEND-only: existing photos are never dropped
//    and never replaced by a fresh upload. Only ids the mentor explicitly
//    removes are detached.
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
    if (!isValidId(id)) {
      return sendError(res, 'Invalid mentoring record reference.', 400);
    }
    const record: any = await CounsellingRecord.findById(id);
    if (!record) {
      return sendError(res, 'Mentoring record not found.', 404);
    }

    // Authorisation: the caller must be in scope for THIS record's student.
    const student = await Student.findById(record.student || record.studentId);
    if (!student) {
      return sendError(res, 'The student for this mentoring record no longer exists.', 404);
    }
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    // Who the discussion was with. Validated only when the mentor actually
    // changed it, so an older record that predates this field is never
    // rewritten by an unrelated edit.
    if (req.body.discussionWith !== undefined || req.body.discussion_with !== undefined) {
      const discussionWith = parseDiscussionWith(req.body.discussionWith ?? req.body.discussion_with);
      if (!discussionWith.ok) {
        return sendError(res, discussionWith.message || DISCUSSION_WITH_HELP, 400);
      }
      record.discussionWith = discussionWith.value;
    }

    if (categories !== undefined || category !== undefined) {
      // `coerceField` also handles a multipart form, where the array arrives as
      // the JSON string '["Academic Development"]'.
      const raw = coerceField<any>(categories ?? category, []);
      const valid: CounsellingCategory[] = (Array.isArray(raw) ? raw : [raw])
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
      if (String(text ?? '').trim()) {
        record.actionPlan = text;
        record.correctiveAction = text;
      }
    }
    if (expectedImprovement !== undefined) record.expectedImprovement = expectedImprovement;
    if (mentorRemarks !== undefined) record.mentorRemarks = mentorRemarks;
    if (followUpDate !== undefined) record.followUpDate = followUpDate;
    if (status !== undefined) record.status = status;

    // ---- evidence: append new, detach only what was explicitly removed -----
    const beforeRefs = normaliseEvidenceRefs(record.evidence).map((ref) => ref.evidenceId);

    const removeRaw = coerceField<any>(req.body.removeEvidenceIds ?? req.body.remove_evidence_ids, []);
    const requestedRemovals = (Array.isArray(removeRaw) ? removeRaw : [removeRaw])
      .map((value: any) => String(value ?? '').trim())
      .filter(Boolean);
    const detachable = requestedRemovals.filter((evidenceId) => beforeRefs.includes(evidenceId));

    let added: StoredEvidence[] = [];
    try {
      added = await ingestEvidence(req, String(record.mentor || record.mentorId), 'INDIVIDUAL', [String(student._id)]);
    } catch (evidenceErr: any) {
      console.error('updateCounsellingRecord: evidence rejected:', evidenceErr?.message);
      return sendEvidenceError(res, evidenceErr);
    }

    let nextRefs = appendEvidenceRefs(record.evidence, added.map((e) => e.evidenceId));
    if (detachable.length > 0) {
      nextRefs = removeEvidenceRefs(nextRefs, detachable);
    }
    record.evidence = nextRefs;

    try {
      await record.save();
    } catch (saveErr: any) {
      // Roll back the freshly uploaded files; nothing references them now.
      await deleteUnreferencedEvidence(added.map((e) => e.evidenceId));
      throw saveErr;
    }

    // A photo shared with another record (or another student on a Saturday
    // photo) must NOT be deleted from disk. `deleteUnreferencedEvidence` is the
    // single place that decision is made.
    const deletion = await deleteUnreferencedEvidence(detachable);

    const evidenceViews = await buildEvidenceViews(normaliseEvidenceRefs(record.evidence).map((ref) => ref.evidenceId));
    const addedCount = added.length;

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_COUNSELLING_RECORD',
      entity: 'COUNSELLING_RECORD',
      entityId: record._id.toString(),
      details: {
        studentId: String(student._id),
        registerNumber: student.registerNumber,
        evidenceAdded: addedCount,
        evidenceDetached: detachable.length,
        evidenceRemovedFromDisk: deletion.removed.length,
        evidenceRetainedStillShared: deletion.retained.length,
      },
      req,
    });

    const sharedNote =
      deletion.retained.length > 0
        ? ` ${deletion.retained.length} detached photo(s) are still shared with another record and were retained.`
        : '';

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
        discussionWith: record.discussionWith,
        discussion_with: record.discussionWith,
        discussionWithLabel: describeDiscussionWith(normaliseRefsAsParticipants(record.discussionWith)),
        recordKind: record.recordKind,
        record_kind: record.recordKind,
        evidence: evidenceViews,
        evidenceCount: evidenceViews.length,
        evidenceAdded: addedCount,
        evidenceDetached: detachable.length,
        evidenceDeleted: deletion.removed.length,
        evidenceRetained: deletion.retained,
      },
      `Mentoring record updated successfully.${addedCount > 0 ? ` ${addedCount} new evidence photo(s) added.` : ''}${
        detachable.length > 0 ? ` ${detachable.length} photo(s) detached.` : ''
      }${sharedNote} Existing evidence was preserved.`
    );
  } catch (err: any) {
    console.error('updateCounsellingRecord error:', err);
    if (err instanceof EvidenceValidationError) return sendEvidenceError(res, err);
    return sendError(res, 'Failed to update mentoring record.', 500);
  }
}

/**
 * Explicit evidence removal (DELETE /counselling/:id/evidence).
 *
 * Authorisation is the same relationship check as the update path, so a mentor
 * cannot detach evidence from a student they do not mentor.
 */
export async function removeCounsellingEvidence(req: AuthRequest, res: Response) {
  const { id } = req.params;

  try {
    if (!isValidId(id)) {
      return sendError(res, 'Invalid mentoring record reference.', 400);
    }
    const record: any = await CounsellingRecord.findById(id);
    if (!record) {
      return sendError(res, 'Mentoring record not found.', 404);
    }

    const student = await Student.findById(record.student || record.studentId);
    if (!student) {
      return sendError(res, 'The student for this mentoring record no longer exists.', 404);
    }
    const access = await checkStudentAccess(req.user, student);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const raw = coerceField<any>(req.body?.evidenceIds ?? req.body?.evidence_ids, []);
    const requested = (Array.isArray(raw) ? raw : [raw]).map((v: any) => String(v ?? '').trim()).filter(Boolean);
    const current = normaliseEvidenceRefs(record.evidence).map((ref) => ref.evidenceId);

    if (requested.length === 0) {
      return sendError(res, 'No evidence photo reference was supplied.', 400);
    }

    const unknown = requested.filter((evidenceId) => !current.includes(evidenceId));
    if (unknown.length > 0) {
      return sendError(res, 'One or more evidence photos are not attached to this mentoring record.', 404);
    }

    record.evidence = removeEvidenceRefs(record.evidence, requested);
    await record.save();

    const deletion = await deleteUnreferencedEvidence(requested);
    const evidenceViews = await buildEvidenceViews(normaliseEvidenceRefs(record.evidence).map((ref) => ref.evidenceId));

    await logAudit({
      userId: req.user!.id,
      action: 'REMOVE_MENTORING_EVIDENCE',
      entity: 'COUNSELLING_RECORD',
      entityId: record._id.toString(),
      details: {
        studentId: String(student._id),
        registerNumber: student.registerNumber,
        requested: requested.length,
        deletedFromDisk: deletion.removed.length,
        retainedStillShared: deletion.retained.length,
      },
      req,
    });

    const sharedNote =
      deletion.retained.length > 0
        ? ` ${deletion.retained.length} photo(s) are still referenced by another mentoring record and were retained on disk.`
        : '';

    return sendSuccess(
      res,
      {
        recordId: record._id.toString(),
        removed: requested,
        deletedFromDisk: deletion.removed.length,
        retained: deletion.retained,
        evidence: evidenceViews,
        evidenceCount: evidenceViews.length,
      },
      `${requested.length} evidence photo(s) detached from this mentoring record.${sharedNote}`
    );
  } catch (err: any) {
    console.error('removeCounsellingEvidence error:', err);
    if (err instanceof EvidenceValidationError) return sendEvidenceError(res, err);
    return sendError(res, 'Failed to remove the mentoring evidence.', 500);
  }
}

// 5. Saturday COMMON meeting evidence, shared by every participating student.
//    One physical file set is stored ONCE and referenced by every participant's
//    record, so N students cost 1 copy on disk, not N.
export async function saveSaturdayCommonEvidence(req: AuthRequest, res: Response) {
  const {
    meetingDate,
    date,
    categories,
    category,
    discussionObservation,
    challengeObserved,
    concernReason,
    actionPlan,
    correctiveAction,
    expectedImprovement,
    mentorRemarks,
  } = req.body;

  const effectiveDate = normaliseIsoDate(meetingDate || date);
  if (!effectiveDate) {
    return sendError(res, 'A valid Saturday meeting date (YYYY-MM-DD) is required.', 400);
  }

  const discussionWith = parseDiscussionWith(req.body.discussionWith ?? req.body.discussion_with);
  if (!discussionWith.ok) {
    return sendError(res, discussionWith.message || DISCUSSION_WITH_HELP, 400);
  }

  const rawCategories = coerceField<any>(categories ?? category, []);
  const validCategories: CounsellingCategory[] = (Array.isArray(rawCategories) ? rawCategories : [rawCategories])
    .map((c: any) => String(c).trim())
    .filter((c: string): c is CounsellingCategory => COUNSELLING_5_CATEGORIES.includes(c as any));
  if (validCategories.length === 0) {
    return sendError(
      res,
      'Mentoring Category is required. Please select at least one of: Academic Development, Skill Development, Career Development, Personal Development, Extra-Curricular Activities.',
      400
    );
  }

  const effectiveChallenge = (discussionObservation || challengeObserved || concernReason || '').trim();
  if (!effectiveChallenge) {
    return sendError(res, 'Required field missing: Discussion / Observation for the Saturday meeting.', 400);
  }
  const effectiveAction = (actionPlan || correctiveAction || '').trim();
  const effectiveConcern = (concernReason || '').trim();
  const effectiveRemarks = (mentorRemarks || '').trim();

  const rawStudents = coerceField<any>(req.body.studentIds ?? req.body.student_ids, []);
  const requestedIds: string[] = (Array.isArray(rawStudents) ? rawStudents : [rawStudents])
    .map((v: any) => String(v ?? '').trim())
    .filter(Boolean);
  const uniqueIds = Array.from(new Set(requestedIds));

  if (uniqueIds.length === 0) {
    return sendError(res, 'Select at least one participating student for the Saturday meeting.', 400);
  }

  try {
    // Resolve every participant and require the ACTIVE assigned mentor
    // relationship for ALL of them. No partial write is ever possible.
    const students: any[] = [];
    for (const id of uniqueIds) {
      const student = await findStudentByIdOrRegister(id);
      if (!student) {
        return sendError(res, `Student "${id}" was not found.`, 404);
      }
      const resolution = await resolveMentorForWrite(req.user, student);
      if (!resolution.ok) {
        return sendError(
          res,
          `Access denied for ${student.fullName || id}: ${resolution.message}`,
          resolution.status
        );
      }
      students.push(student);
    }

    const facultyId = await resolveFacultyIdForUser(req.user);
    const mentorDoc = facultyId
      ? await Faculty.findById(facultyId)
      : await Faculty.findOne({ employeeId: req.user?.facultyId });

    const evidenceGroupId = newLocalId();
    const studentIds = students.map((s) => String(s._id));

    // Store the shared photo set once, linked to every participant.
    let storedEvidence: StoredEvidence[] = [];
    try {
      storedEvidence = await ingestEvidence(
        req,
        String(mentorDoc?._id || ''),
        'SATURDAY_MEETING',
        studentIds,
        { evidenceGroupId }
      );
    } catch (evidenceErr: any) {
      console.error('saveSaturdayCommonEvidence: evidence rejected:', evidenceErr?.message);
      return sendEvidenceError(res, evidenceErr);
    }

    if (storedEvidence.length === 0) {
      return sendError(res, 'Please attach at least one photo for the Saturday meeting.', 400);
    }

    const refs = storedEvidence.map((e) => e.evidenceId);
    const savedRecords: any[] = [];
    const linkedMeetings: string[] = [];

    try {
      for (const student of students) {
        // Upsert the common record for THIS student on THIS date. Existing
        // evidence from an earlier Saturday upload is appended to, not replaced.
        let record: any = await CounsellingRecord.findOne({
          student: student._id,
          recordKind: 'SATURDAY_COMMON',
          sessionDate: effectiveDate,
        });

        if (!record) {
          // A NEW official record needs a real action plan. It is refused with a
          // clear message rather than back-filled with placeholder prose (which
          // would otherwise also trip the `required` validator and surface as a
          // 500). An edit to an existing record may omit it.
          if (!effectiveAction) {
            return sendError(
              res,
              'Required field missing: Action Plan / Corrective Action for the Saturday meeting.',
              400
            );
          }
          record = await CounsellingRecord.create({
            student: student._id,
            studentId: student._id,
            mentor: mentorDoc?._id,
            mentorId: mentorDoc?._id,
            sessionDate: effectiveDate,
            date: effectiveDate,
            categories: validCategories,
            category: validCategories.join(', '),
            discussionWith: discussionWith.value,
            recordKind: 'SATURDAY_COMMON',
            concernReason: effectiveConcern,
            discussionObservation: effectiveChallenge,
            challengeObserved: effectiveChallenge,
            actionPlan: effectiveAction,
            correctiveAction: effectiveAction,
            expectedImprovement: (expectedImprovement || '').trim(),
            mentorRemarks: effectiveRemarks,
            studentFeedback: '',
            followUpDate: '',
            status: 'Completed',
            aiGenerated: false,
            studentAcknowledgementStatus: 'ACKNOWLEDGED',
            mentorSignatureStatus: 'SIGNED',
            evidence: appendEvidenceRefs([], refs, String(req.user?.id || '')),
            evidenceGroupId,
          });
        } else {
          record.categories = validCategories;
          record.category = validCategories.join(', ');
          record.discussionWith = discussionWith.value;
          // Only overwrite with text the mentor actually supplied; an empty
          // submission must not erase what is already on the record.
          applyNarrative(record, 'concernReason', effectiveConcern);
          applyNarrative(record, 'discussionObservation', effectiveChallenge);
          applyNarrative(record, 'challengeObserved', effectiveChallenge);
          applyNarrative(record, 'actionPlan', effectiveAction);
          applyNarrative(record, 'correctiveAction', effectiveAction);
          applyNarrative(record, 'expectedImprovement', expectedImprovement);
          applyNarrative(record, 'mentorRemarks', effectiveRemarks);
          record.evidence = appendEvidenceRefs(record.evidence, refs, String(req.user?.id || ''));
          record.evidenceGroupId = record.evidenceGroupId || evidenceGroupId;
          await record.save();
        }
        savedRecords.push(record);

        // Link the pre-existing Saturday Meeting row for this student so the
        // photo is visible from the meeting too, not only from the record.
        const meetings = await Meeting.find({ student: student._id, meetingDate: effectiveDate });
        for (const meeting of meetings as any[]) {
          meeting.evidence = appendEvidenceRefs(meeting.evidence, refs, String(req.user?.id || ''));
          meeting.evidenceGroupId = meeting.evidenceGroupId || evidenceGroupId;
          await meeting.save();
          linkedMeetings.push(String(meeting._id));
        }

        await Notification.create({
          user: student.user,
          title: 'Saturday Mentoring Evidence Added',
          message: `${storedEvidence.length} geo-tagged photo(s) from the Saturday mentoring meeting on ${effectiveDate} were added to your record.`,
          type: 'SYSTEM_ANNOUNCEMENT',
          relatedEntity: 'COUNSELLING',
          relatedEntityId: String(record._id),
        });
      }
    } catch (saveErr: any) {
      // Partial failure: roll the photos back so no orphan bytes remain.
      await deleteUnreferencedEvidence(refs);
      console.error('saveSaturdayCommonEvidence: record save failed, evidence rolled back:', saveErr?.message);
      throw saveErr;
    }

    await logAudit({
      userId: req.user!.id,
      action: 'ADD_SATURDAY_COMMON_EVIDENCE',
      entity: 'COUNSELLING_RECORD',
      entityId: String(savedRecords[0]?._id || ''),
      details: {
        meetingDate: effectiveDate,
        participants: studentIds.length,
        participantIds: studentIds,
        evidenceCount: refs.length,
        evidenceGroupId,
        physicalCopiesStored: refs.length,
        linkedMeetings: linkedMeetings.length,
      },
      req,
    });

return sendSuccess(
      res,
      {
        evidenceGroupId,
        meetingDate: effectiveDate,
        recordKind: 'SATURDAY_COMMON',
        discussionWith: discussionWith.value,
        discussionWithLabel: describeDiscussionWith(discussionWith.value),
        // One physical copy per photo, shared by every participant.
        physicalFilesStored: refs.length,
        participants: students.map((s) => ({
          studentId: String(s._id),
          registerNumber: s.registerNumber,
          fullName: s.fullName,
          recordId: String(savedRecords.find((r) => String(r.student || r.studentId) === String(s._id))?._id || ''),
        })),
        linkedMeetings: linkedMeetings.length,
        evidence: await buildEvidenceViews(refs),
      },
      `Saturday common mentoring evidence saved for ${students.length} student(s). ${storedEvidence.length} photo(s) stored once and shared.`,
      201
    );
  } catch (err: any) {
    console.error('saveSaturdayCommonEvidence error:', err);
    if (err instanceof EvidenceValidationError) return sendEvidenceError(res, err);
    return sendError(res, 'Failed to save the Saturday common mentoring evidence.', 500);
  }
}

/**
 * Stream one evidence photo to an authorised caller.
 *
 * `/uploads` is NOT a public static mount in this project, so evidence is only
 * ever served through here after an ownership check — a raw file path is never
 * exposed and a guessable id alone is not enough.
 */
export async function getEvidenceFile(req: AuthRequest, res: Response) {
  const evidenceId = String(req.params.evidenceId || '').trim();
  const disposition = String((req.query.download as string) || '').toLowerCase() === '1' ? 'attachment' : 'inline';

  if (!evidenceId) {
    return sendError(res, 'Evidence photo reference is required.', 400);
  }

  try {
    const evidence = await MentoringEvidence.findOne({ evidenceId });
    if (!evidence) {
      return sendError(res, 'Evidence photo not found.', 404);
    }

    const access = await assertEvidenceAccess(req.user, evidence);
    if (!access.allowed) {
      return sendError(res, access.message, access.status);
    }

    const filePath = resolveEvidenceFile(evidence);
    if (!filePath || !fs.existsSync(filePath)) {
      return sendError(res, 'The stored photo for this evidence record is missing.', 404);
    }

    res.setHeader('Content-Type', (evidence.fileType as string) || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fileName = String(evidence.fileName || `${evidenceId}.jpg`);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${fileName.replace(/[^\w.\-]+/g, '_')}"`
    );
    return fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    console.error('getEvidenceFile error:', err);
    return sendError(res, 'Failed to load the evidence photo.', 500);
  }
}

/** Same ownership check, forced as a download. */
export async function downloadEvidenceFile(req: AuthRequest, res: Response) {
  (req.query as any).download = '1';
  return getEvidenceFile(req, res);
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

