import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { ROLES } from '../../config/constants.js';
import {
  Achievement,
  ACHIEVEMENT_CATEGORIES,
} from '../../models/Achievement.model.js';
import { Student, MentorAssignment } from '../../models/index.js';
import {
  rankLeaderboard,
  findRank,
  type LeaderboardCandidate,
} from '../../utils/leaderboard.util.js';
import {
  loadAccessibleStudent,
  resolveFacultyIdForUser,
  toIdString,
} from '../../utils/access.util.js';

/**
 * ============================================================================
 * LEADERBOARD
 * ============================================================================
 *
 * Scope (locked, derived server-side from the JWT — never from the client):
 *   ADMIN / STUDENT -> college-wide (every active student is ranked)
 *   HOD             -> the HOD's own department
 *   FACULTY         -> the mentor's ACTIVE assigned mentees
 *
 * Every in-scope active student is ranked, including students with 0 verified
 * points. Only rows with `verified === true && verificationStatus === 'Approved'`
 * contribute. Clients never send a score; totals are recomputed per request.
 */

const CATEGORY_LABELS: Record<string, string> = {
  Hackathon: 'Hackathon',
  'Symposium / Paper Presentation': 'Symposium / Paper Presentation',
  'Global / Technical Certification': 'Global / Technical Certification',
  Workshop: 'Workshop',
  'Competition / Event': 'Competition / Event',
  'Project / Technical Achievement': 'Project / Technical Achievement',
  Other: 'Other',
};

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  registerNumber: string;
  fullName: string;
  departmentName: string;
  batchName: string;
  year: number;
  totalPoints: number;
  achievementCount: number;
  categoryCounts: Record<string, number>;
  categoryPoints: Record<string, number>;
  lastAwardAt: string | null;
}

function entryFromCandidate(
  candidate: Record<string, any>,
  rank: number
): LeaderboardEntry {
  return {
    rank,
    studentId: candidate.studentId,
    registerNumber: candidate.registerNumber,
    fullName: candidate.fullName || '',
    departmentName: candidate.departmentName || '',
    batchName: candidate.batchName || '',
    year: Number(candidate.year ?? 0),
    totalPoints: candidate.totalPoints,
    achievementCount: candidate.achievementCount,
    categoryCounts: candidate.categoryCounts,
    categoryPoints: candidate.categoryPoints,
    lastAwardAt: candidate.lastAwardAt || null,
  };
}

function emptyCategoryBreakdown() {
  const categoryCounts: Record<string, number> = {};
  const categoryPoints: Record<string, number> = {};
  for (const c of ACHIEVEMENT_CATEGORIES) {
    categoryCounts[c] = 0;
    categoryPoints[c] = 0;
  }
  return { categoryCounts, categoryPoints };
}

const SCOPE_LABEL: Record<string, string> = {
  COLLEGE: 'College-wide',
  DEPARTMENT: 'My department',
  MENTEES: 'My mentees',
};

async function loadScopeStudents(req: AuthRequest): Promise<{
  students: any[];
  scope: string;
  scopeLabel: string;
} | null> {
  const user = req.user!;

  if (user.role === ROLES.HOD) {
    if (!user.departmentId) return null;
    const students = await Student.find({ department: String(user.departmentId), isActive: true })
      .populate('department batch')
      .lean();
    return { students: students as any[], scope: 'DEPARTMENT', scopeLabel: SCOPE_LABEL.DEPARTMENT };
  }

  if (user.role === ROLES.FACULTY) {
    const mentorId = await resolveFacultyIdForUser(user);
    if (!mentorId) return null;
    const assignments = await MentorAssignment.find({ mentor: mentorId, status: 'ACTIVE' })
      .select('student')
      .lean();
    const ids = (assignments as any[]).map((a: any) => String(a.student));
    const students =
      ids.length > 0
        ? await Student.find({ _id: { $in: ids }, isActive: true }).populate('department batch').lean()
        : [];
    return { students: students as any[], scope: 'MENTEES', scopeLabel: SCOPE_LABEL.MENTEES };
  }

  // ADMIN and STUDENT: the whole institution (active students only).
  const students = await Student.find({ isActive: true }).populate('department batch').lean();
  return { students: students as any[], scope: 'COLLEGE', scopeLabel: SCOPE_LABEL.COLLEGE };
}

function buildCandidates(
  students: any[],
  verifiedRows: any[]
): LeaderboardCandidate[] {
  const byStudent = new Map<string, any>();
  for (const row of verifiedRows) {
    const sid = toIdString(row.student);
    if (!sid) continue;
    if (!byStudent.has(sid)) {
      const seed = {
        totalPoints: 0,
        achievementCount: 0,
        lastAwardAt: null as string | null,
        ...emptyCategoryBreakdown(),
      };
      byStudent.set(sid, seed);
    }
    const agg = byStudent.get(sid)!;
    const awarded = Number(row.pointsAwarded ?? 0);
    agg.totalPoints += awarded;
    agg.achievementCount += 1;
    const cat: string = row.category || 'Other';
    if (cat in agg.categoryCounts) agg.categoryCounts[cat] += 1;
    if (cat in agg.categoryPoints) agg.categoryPoints[cat] += awarded;
    const at = row.verifiedAt ? new Date(row.verifiedAt).getTime() : 0;
    if (at > (agg.lastAwardAt ?? 0)) agg.lastAwardAt = row.verifiedAt;
  }

  return students.map((s: any) => {
    const agg = byStudent.get(String(s._id)) ?? {
      totalPoints: 0,
      achievementCount: 0,
      lastAwardAt: null as string | null,
      ...emptyCategoryBreakdown(),
    };
    return {
      studentId: String(s._id),
      registerNumber: String(s.registerNumber ?? ''),
      fullName: String(s.fullName ?? ''),
      departmentName: String((s.department as any)?.name || (s.department as any)?.code || ''),
      batchName: String((s.batch as any)?.name || (s.batch as any)?.batch_name || ''),
      year: Number(s.year ?? 0),
      totalPoints: agg.totalPoints,
      achievementCount: agg.achievementCount,
      lastAwardAt: agg.lastAwardAt,
      categoryCounts: agg.categoryCounts,
      categoryPoints: agg.categoryPoints,
    };
  });
}

async function loadVerifiedAchievements(studentIds: string[]): Promise<any[]> {
  if (studentIds.length === 0) return [];
  const rows = await Achievement.find({
    student: { $in: studentIds },
    verified: true,
    verificationStatus: 'Approved',
  }).lean();
  return rows as any[];
}

export async function getLeaderboard(req: AuthRequest, res: Response) {
  try {
    const scopeData = await loadScopeStudents(req);
    if (!scopeData) {
      return sendError(
        res,
        'Your account is not linked to the students needed for leaderboard scope.',
        403
      );
    }

    const students = scopeData.students;
    const verifiedRows = await loadVerifiedAchievements(
      students.map((s: any) => String(s._id))
    );
    const candidates = buildCandidates(students, verifiedRows);
    const ranked = rankLeaderboard(candidates);
    const entries = ranked.map((c: any) => entryFromCandidate(c, c.rank));

    let me: { studentId: string; registerNumber: string; rank: number | null; totalPoints: number; achievementCount: number } | null = null;
    if (req.user!.role === ROLES.STUDENT && req.user!.studentId) {
      const self = students.find(
        (s: any) =>
          String(s._id) === String(req.user!.studentId) ||
          String(s.registerNumber).toUpperCase() === String(req.user!.studentId).toUpperCase()
      );
      if (self) {
        const candidate = candidates.find((c) => c.studentId === String(self._id));
        me = {
          studentId: String(self._id),
          registerNumber: String(self.registerNumber ?? ''),
          rank: findRank(ranked as any, String(self._id)),
          totalPoints: candidate?.totalPoints ?? 0,
          achievementCount: candidate?.achievementCount ?? 0,
        };
      }
    }

    return sendSuccess(res, {
      scope: scopeData.scope,
      scopeLabel: scopeData.scopeLabel,
      totalStudents: students.length,
      verifiedAchievements: verifiedRows.length,
      me,
      entries,
      definitions: {
        totalPoints: 'Sum of pointsAwarded across verified (Approved) achievements only.',
        achievementCount: 'Number of verified (Approved) achievement rows.',
        ranking: 'Total verified points DESC, then verified count DESC, then register number ASC.',
        scope: 'An ADMIN/STUDENT sees the whole college, a HOD their department, a mentor their assigned mentees. Everyone in scope is ranked, including students with 0 points.',
      },
    });
  } catch (err: any) {
    console.error('getLeaderboard error:', err);
    return sendError(res, 'Unable to load the leaderboard.', 500);
  }
}

export async function getStudentLeaderboardDetail(req: AuthRequest, res: Response) {
  try {
    const studentId = String(req.params.studentId ?? '');
    const { student, decision } = await loadAccessibleStudent(req.user, studentId);
    if (!student) {
      return sendError(res, decision.message, decision.status);
    }

    const rows = await Achievement.find({
      student: String(student._id),
      verified: true,
      verificationStatus: 'Approved',
    })
      .sort({ verifiedAt: 1 })
      .lean();

    const items = (rows as any[])
      .map((r: any) => ({
        id: String(r._id),
        title: r.title || '',
        category: r.category || 'Other',
        eventName: r.eventName || '',
        eventDate: r.eventDate || '',
        hackathonResult: r.hackathonResult || r.result || '',
        verifiedBy: r.verifiedBy ? String(r.verifiedBy) : '',
        verifiedAt: r.verifiedAt ?? null,
        pointsAwarded: Number(r.pointsAwarded ?? 0),
      }))
      .sort((a: any, b: any) => b.pointsAwarded - a.pointsAwarded);

    let totalPoints = 0;
    for (const it of items) totalPoints += Number(it.pointsAwarded ?? 0);

    return sendSuccess(res, {
      student: {
        id: String(student._id),
        registerNumber: student.registerNumber,
        fullName: student.fullName,
        year: student.year,
        departmentId: String(student.department ?? ''),
      },
      totalPoints,
      achievementCount: items.length,
      achievements: items,
      categories: ACHIEVEMENT_CATEGORIES,
    });
  } catch (err: any) {
    console.error('getStudentLeaderboardDetail error:', err);
    return sendError(res, 'Unable to load the student leaderboard detail.', 500);
  }
}