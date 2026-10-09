import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  Achievement,
  type IAchievement,
  ACHIEVEMENT_CATEGORIES,
  HACKATHON_RESULTS,
} from '../../models/Achievement.model.js';
import {
  achievementPointLabel,
  achievementVerificationRefusal,
  calculateAchievementPoints,
} from '../../utils/achievement-points.util.js';
import {
  loadAccessibleStudent,
  toIdString,
} from '../../utils/access.util.js';
import { joinErrors } from '../../utils/validation.util.js';

/**
 * ============================================================================
 * ACHIEVEMENTS + ACHIEVEMENT POINTS
 * ============================================================================
 *
 * Point rules (server-authoritative, never taken from the client):
 *   - `points`        = what the row is worth as it currently stands (potential),
 *   - `pointsAwarded` = what has actually been credited (0 until Approved),
 *   - leaderboard totals sum `pointsAwarded` over `verified === true &&
 *     verificationStatus === 'Approved'` rows ONLY.
 *
 * Workflow: STUDENT or mentor creates Pending rows -> FACULTY/HOD/ADMIN verify
 * (credit points) or reject (zero points, reason). Approved rows are frozen:
 * edits return 409. Editing a Rejected row submits it again -> back to Pending,
 * pointsAwarded forced back to 0.
 */

const MAX = { title: 200, description: 2000, eventName: 200, organizer: 200, eventDate: 50, subCategory: 100, rejectionReason: 500 };

function clamp(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

interface ParsedAchievementBody {
  title?: string;
  category?: string;
  subCategory?: string;
  eventName?: string;
  organizer?: string;
  eventDate?: string;
  result?: string;
  hackathonResult?: string;
  description?: string;
}

function parseAchievementBody(body: any, requireTitle: boolean): { errors: string[]; value: ParsedAchievementBody } {
  const errors: string[] = [];
  const value: ParsedAchievementBody = {};

  const titleRaw = String(body?.title ?? '').trim();
  if (requireTitle && !titleRaw) {
    errors.push('Title of the achievement is required.');
  } else if (!requireTitle && body?.title !== undefined && !String(body.title).trim()) {
    errors.push('Title cannot be blank.');
  }
  if (titleRaw) {
    if (titleRaw.length > MAX.title) errors.push(`Title must be at most ${MAX.title} characters.`);
    else value.title = titleRaw;
  }

  if (body?.category !== undefined && body?.category !== null) {
    const rawCat = String(body.category).trim();
    const hit = ACHIEVEMENT_CATEGORIES.find((c) => c.toUpperCase() === rawCat.toUpperCase());
    if (!hit) {
      errors.push(`Category must be one of ${ACHIEVEMENT_CATEGORIES.join(', ')}.`);
    } else {
      value.category = hit;
    }
  } else if (requireTitle) {
    errors.push('Category is required.');
  }

  const category = value.category ?? '';

  if (body?.hackathonResult !== undefined && body?.hackathonResult !== null && String(body.hackathonResult).trim() !== '') {
    const raw = String(body.hackathonResult).trim();
    const hit = HACKATHON_RESULTS.find((r) => r.toUpperCase() === raw.toUpperCase());
    if (!hit) {
      errors.push(`Hackathon result must be one of ${HACKATHON_RESULTS.join(', ')}.`);
    } else {
      value.hackathonResult = hit;
    }
  } else if (category === 'Hackathon') {
    // Hackathon rows may go in Pending without a result, but verification is
    // refused until one is recorded (see achievementVerificationRefusal).
    value.hackathonResult = undefined;
  }

  if (category !== 'Hackathon' && body?.result !== undefined && body?.result !== null) {
    value.result = clamp(body.result, MAX.title);
  }
  if (category === 'Hackathon' && value.hackathonResult && !value.result) {
    value.result = value.hackathonResult;
  }

  if (body?.subCategory !== undefined) value.subCategory = clamp(body.subCategory, MAX.subCategory);
  if (body?.eventName !== undefined) value.eventName = clamp(body.eventName, MAX.eventName);
  if (body?.organizer !== undefined) value.organizer = clamp(body.organizer, MAX.organizer);
  if (body?.eventDate !== undefined) {
    const d = clamp(body.eventDate, MAX.eventDate);
    value.eventDate = d;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      errors.push('Event date must be a valid date in YYYY-MM-DD format.');
    }
  }
  if (body?.description !== undefined) {
    const d = clamp(body.description, MAX.description);
    if (String(body.description ?? '').trim().length > MAX.description) {
      errors.push(`Description must be at most ${MAX.description} characters.`);
    } else {
      value.description = d;
    }
  }

  return { errors, value };
}

export function serializeAchievement(row: IAchievement): Record<string, any> {
  return {
    id: String(row._id),
    studentId: String(row.student),
    departmentId: String(row.department ?? ''),
    registerNumber: row.registerNumber || '',
    title: row.title || '',
    category: row.category || '',
    subCategory: row.subCategory || '',
    eventName: row.eventName || '',
    organizer: row.organizer || '',
    eventDate: row.eventDate || '',
    result: row.result || '',
    hackathonResult: row.hackathonResult || '',
    description: row.description || '',
    verified: row.verified === true,
    verificationStatus: row.verificationStatus || 'Pending',
    rejectionReason: row.rejectionReason || '',
    verifiedBy: row.verifiedBy ? String(row.verifiedBy) : '',
    verifiedAt: row.verifiedAt ?? null,
    documentId: row.documentId ? String(row.documentId) : '',
    points: typeof row.points === 'number' ? row.points : 0,
    pointsAwarded: typeof row.pointsAwarded === 'number' ? row.pointsAwarded : 0,
    createdBy: row.createdBy ? String(row.createdBy) : '',
    updatedBy: row.updatedBy ? String(row.updatedBy) : '',
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

const CREATOR_ROLES: readonly string[] = [ROLES.STUDENT, ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN];
const VERIFIER_ROLES: readonly string[] = [ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN];

function isCreatorRole(req: AuthRequest): boolean {
  return Boolean(req.user?.role) && CREATOR_ROLES.includes(req.user!.role!);
}

function isVerifierRole(req: AuthRequest): boolean {
  return Boolean(req.user?.role) && VERIFIER_ROLES.includes(req.user!.role!);
}

async function loadAchievementForAction(
  req: AuthRequest,
  res: Response,
  id: string
): Promise<IAchievement | null> {
  if (!id) {
    sendError(res, 'Achievement id is required.', 400);
    return null;
  }
  const row = await Achievement.findById(id);
  if (!row) {
    sendError(res, 'Achievement record not found.', 404);
    return null;
  }
  const studentId = toIdString(row.student);
  if (!studentId) {
    sendError(res, 'The achievement is not linked to a student.', 500);
    return null;
  }
  const { decision } = await loadAccessibleStudent(req.user, studentId);
  if (!decision.allowed) {
    sendError(res, decision.message, decision.status);
    return null;
  }
  return row;
}

function isDuplicatePunctuationFree(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function findDuplicate(row: IAchievement): Promise<boolean> {
  const existing = await Achievement.find({
    student: row.student,
    category: row.category,
  }).lean();
  return existing.some(
    (e: any) =>
      String(e._id) !== String(row._id) &&
      isDuplicatePunctuationFree(e.title ?? '', row.title) &&
      isDuplicatePunctuationFree(e.eventName ?? '', row.eventName ?? '') &&
      isDuplicatePunctuationFree(e.eventDate ?? '', row.eventDate ?? '')
  );
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getAchievements(req: AuthRequest, res: Response) {
  try {
    const { student, decision } = await loadAccessibleStudent(
      req.user,
      String(req.params.studentId ?? '')
    );
    if (!student) {
      return sendError(res, decision.message, decision.status);
    }
    const rows = await Achievement.find({ student: student._id })
      .sort({ createdAt: -1 })
      .lean();

    const approved = rows.filter(
      (r: any) => r.verified === true && r.verificationStatus === 'Approved'
    );
    let totalAwarded = 0;
    for (const r of approved) totalAwarded += Number(r.pointsAwarded ?? 0);

    return sendSuccess(res, {
      student: {
        id: String(student._id),
        registerNumber: student.registerNumber,
        fullName: student.fullName,
        year: student.year,
        departmentId: String(student.department ?? ''),
      },
      summary: {
        total: rows.length,
        pending: rows.filter((r: any) => r.verificationStatus === 'Pending').length,
        approved: approved.length,
        rejected: rows.filter((r: any) => r.verificationStatus === 'Rejected').length,
        totalPointsAwarded: totalAwarded,
      },
      achievements: rows.map((r: any) => serializeAchievement(r as IAchievement)),
    });
  } catch (err: any) {
    console.error('getAchievements error:', err);
    return sendError(res, 'Unable to load achievement records.', 500);
  }
}

export async function createAchievement(req: AuthRequest, res: Response) {
  try {
    if (!isCreatorRole(req)) {
      return sendError(res, 'You are not authorized to record achievements.', 403);
    }
    const studentId = String(req.params.studentId ?? '');
    const { student, decision } = await loadAccessibleStudent(req.user, studentId);
    if (!student) {
      return sendError(res, decision.message, decision.status);
    }

    const { errors, value } = parseAchievementBody(req.body ?? {}, true);
    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    const category = value.category!;
    const hackathonResult = value.hackathonResult as any;
    const points = calculateAchievementPoints(category, hackathonResult);

    const draft = {
      student: student._id,
      department: student.department,
      registerNumber: student.registerNumber,
      title: value.title!,
      category,
      subCategory: value.subCategory ?? '',
      eventName: value.eventName ?? '',
      organizer: value.organizer ?? '',
      eventDate: value.eventDate ?? '',
      result: value.result ?? '',
      // `hackathonResult` has an enum constraint, so a blank value must remain
      // absent (undefined) rather than an empty string.
      hackathonResult: value.hackathonResult || undefined,
      description: value.description ?? '',
      verified: false,
      verificationStatus: 'Pending',
      rejectionReason: '',
      points,
      pointsAwarded: 0,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    } as any;

    const created = await Achievement.create(draft);

    if (await findDuplicate(created as IAchievement)) {
      await Achievement.deleteOne({ _id: created._id });
      return sendError(
        res,
        'A matching achievement (same student, category, title, event name and event date) already exists.',
        409
      );
    }

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_ACHIEVEMENT',
      entity: 'ACHIEVEMENT',
      entityId: String(created._id),
      details: {
        registerNumber: student.registerNumber,
        title: created.title,
        category,
        points,
        status: 'Pending',
      },
      req,
    });

    return sendSuccess(res, { achievement: serializeAchievement(created as IAchievement) }, 'Achievement recorded. It will earn points only after verification.', 201);
  } catch (err: any) {
    console.error('createAchievement error:', err);
    return sendError(res, 'Unable to record the achievement.', 500);
  }
}

export async function updateAchievement(req: AuthRequest, res: Response) {
  try {
    if (!isCreatorRole(req)) {
      return sendError(res, 'You are not authorized to edit achievements.', 403);
    }
    const row = await loadAchievementForAction(req, res, String(req.params.id ?? ''));
    if (!row) return res;

    if (row.verificationStatus === 'Approved') {
      return sendError(
        res,
        'Approved achievements are locked. Contact your mentor if the entry must be corrected.',
        409
      );
    }

    const { errors, value } = parseAchievementBody(req.body ?? {}, false);
    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    if (value.title !== undefined) row.title = value.title;
    if (value.category !== undefined) row.category = value.category as any;
    if (value.subCategory !== undefined) row.subCategory = value.subCategory;
    if (value.eventName !== undefined) row.eventName = value.eventName;
    if (value.organizer !== undefined) row.organizer = value.organizer;
    if (value.eventDate !== undefined) row.eventDate = value.eventDate;
    if (value.result !== undefined) row.result = value.result;
    if (value.hackathonResult !== undefined) row.hackathonResult = value.hackathonResult as any;
    else if (value.category !== undefined && value.category !== 'Hackathon') row.hackathonResult = undefined as any;
    if (value.description !== undefined) row.description = value.description;

    const hackathonResult = row.hackathonResult || row.result || '';
    row.points = calculateAchievementPoints(row.category, hackathonResult);

    // Editing a Rejected row is a resubmission; a Pending edit keeps it Pending.
    // Either way the row must be re-verified before any points are credited.
    if (row.verificationStatus !== 'Pending') {
      row.verificationStatus = 'Pending';
      row.verified = false;
    }
    row.pointsAwarded = 0;
    row.updatedBy = req.user!.id;

    const created = row as IAchievement;
    if (await findDuplicate(created)) {
      return sendError(
        res,
        'Updating to this value would conflict with an existing achievement (same student, category, title, event name and event date).',
        409
      );
    }

    await row.save();

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_ACHIEVEMENT',
      entity: 'ACHIEVEMENT',
      entityId: String(row._id),
      details: {
        registerNumber: row.registerNumber,
        title: row.title,
        category: row.category,
        status: row.verificationStatus,
      },
      req,
    });

    return sendSuccess(res, { achievement: serializeAchievement(row) }, 'Achievement updated.');
  } catch (err: any) {
    console.error('updateAchievement error:', err);
    return sendError(res, 'Unable to update the achievement.', 500);
  }
}

// ---------------------------------------------------------------------------
// Verification — the only path that touches awarded points
// ---------------------------------------------------------------------------

export async function verifyAchievement(req: AuthRequest, res: Response) {
  try {
    if (!isVerifierRole(req)) {
      return sendError(res, 'Only mentors, HOD and administrators can verify achievements.', 403);
    }
    const row = await loadAchievementForAction(req, res, String(req.params.id ?? ''));
    if (!row) return res;

    if (row.verificationStatus === 'Approved') {
      return sendError(res, 'This achievement is already verified and its points have been awarded.', 409);
    }

    const category = row.category || '';
    const hackathonResult = (row.hackathonResult || row.result || '') as any;
    const refusal = achievementVerificationRefusal(category, hackathonResult);
    if (refusal) {
      return sendError(res, refusal, 409);
    }

    const awarded = calculateAchievementPoints(category, hackathonResult);

    row.verified = true;
    row.verificationStatus = 'Approved';
    row.rejectionReason = '';
    row.verifiedBy = req.user!.id;
    row.verifiedAt = new Date();
    row.points = awarded;
    row.pointsAwarded = awarded;
    row.updatedBy = req.user!.id;

    await row.save();

    await logAudit({
      userId: req.user!.id,
      action: 'VERIFY_ACHIEVEMENT',
      entity: 'ACHIEVEMENT',
      entityId: String(row._id),
      details: {
        registerNumber: row.registerNumber,
        title: row.title,
        category,
        label: achievementPointLabel(category, hackathonResult),
        pointsAwarded: awarded,
      },
      req,
    });

    return sendSuccess(
      res,
      {
        achievement: serializeAchievement(row),
        awardedPoints: awarded,
        label: achievementPointLabel(category, hackathonResult),
      },
      `Verified. ${awarded} point(s) awarded.`
    );
  } catch (err: any) {
    console.error('verifyAchievement error:', err);
    return sendError(res, 'Unable to verify the achievement.', 500);
  }
}

export async function rejectAchievement(req: AuthRequest, res: Response) {
  try {
    if (!isVerifierRole(req)) {
      return sendError(res, 'Only mentors, HOD and administrators can reject achievements.', 403);
    }
    const row = await loadAchievementForAction(req, res, String(req.params.id ?? ''));
    if (!row) return res;

    if (row.verificationStatus === 'Approved') {
      return sendError(
        res,
        'Approved achievements are locked. To overturn a verification, a mentor/HOD-admin must first unlock the entry.',
        409
      );
    }

    let reason = String(req.body?.rejectionReason ?? row.rejectionReason ?? '').trim();
    if (reason.length > MAX.rejectionReason) {
      return sendError(res, `Rejection reason must be at most ${MAX.rejectionReason} characters.`, 400);
    }
    if (!reason) reason = 'Rejected by verifier.';

    row.verified = false;
    row.verificationStatus = 'Rejected';
    row.rejectionReason = reason;
    row.verifiedBy = req.user!.id;
    row.verifiedAt = new Date();
    row.pointsAwarded = 0;
    row.updatedBy = req.user!.id;

    await row.save();

    await logAudit({
      userId: req.user!.id,
      action: 'REJECT_ACHIEVEMENT',
      entity: 'ACHIEVEMENT',
      entityId: String(row._id),
      details: {
        registerNumber: row.registerNumber,
        title: row.title,
        reason,
      },
      req,
    });

    return sendSuccess(res, { achievement: serializeAchievement(row) }, 'Achievement rejected. No points awarded.');
  } catch (err: any) {
    console.error('rejectAchievement error:', err);
    return sendError(res, 'Unable to reject the achievement.', 500);
  }
}