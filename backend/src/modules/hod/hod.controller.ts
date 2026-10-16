import { Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import {
  User,
  Student,
  Faculty,
  Department,
  Batch,
  MentorAssignment,
  Meeting,
  Notification,
  CounsellingRecord,
  InternalMark,
  StudentDocument,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { NOTIFICATION_TYPES, ROLES } from '../../config/constants.js';
import { isValidId, toLocalId } from '../../services/localId.js';
import {
  clampWeeks,
  idOf,
  isSameMonth,
  mentorReportRows,
  mentorWiseRows,
  parseMonthRef,
  pct,
  summarise as summariseMetrics,
  toDay,
  weeklyBuckets as buildWeeklyBuckets,
  type NormalisedSession,
} from '../../utils/mentoring-analytics.util.js';
import { parseStrictNumber, parseSemesterNumber, joinErrors } from '../../utils/validation.util.js';
import { MARK_TYPES, MARK_TYPE_MAX, MARK_TYPE_LABEL, MARK_TYPE_FIELD, type InternalMarkType, isMarkType } from '../../models/InternalMark.model.js';
import {
  generateMarksTemplate,
  validateMarksExcel,
  executeMarksImport,
  exportMarksExcel,
  type MarksBulkPreviewRow,
} from './marks-bulk-upload.service.js';
import { loadDepartmentSubjects } from '../subjects/subject.controller.js';
import { subjectRegulations, subjectSemesters } from '../../models/Subject.model.js';

/**
 * ============================================================================
 * HOD — DEPARTMENT-SCOPED MENTORING ANALYTICS
 * ============================================================================
 *
 * Every endpoint in this module is HARD-SCOPED to the authenticated HOD's own
 * `departmentId`. The scope is applied inside the Mongo filter (never by
 * post-filtering a wider read), so a row that belongs to another department
 * cannot leak through a code change in the mapping layer below.
 *
 * A HOD with no `departmentId` claim is refused outright rather than being
 * treated as institution-wide. There is no `admin` bypass here: admin keeps its
 * own endpoints.
 *
 * All figures are computed from stored records (CounsellingRecord + Meeting +
 * MentorAssignment). Nothing here is hardcoded or defaulted to a plausible
 * number.
 *
 * The arithmetic (coverage %, mentored-vs-pending, weekly buckets, mentor-wise
 * rollup) lives in `utils/mentoring-analytics.util.ts` and is shared with the
 * Admin college-wide dashboard, so the two portals can never disagree about
 * what "mentored" or "coverage" means. This module owns ONLY the scope.
 *
 * NO location / GPS data is read or emitted by this module.
 */

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

interface HodScope {
  departmentId: string;
  department: any;
  faculty: any[];
  students: any[];
  /** Student ids in this department, as plain strings. */
  studentIds: string[];
  /** Faculty ids in this department, as plain strings. */
  facultyIds: string[];
  /** ACTIVE MentorAssignment rows touching this department. */
  assignments: any[];
  /** Counselling + Meeting rows for this department's students, normalised. */
  sessions: NormalisedSession[];
}

/**
 * Resolve the caller's department and load every collection the analytics need,
 * already filtered to that department.
 */
async function loadScope(req: AuthRequest, res: Response): Promise<HodScope | null> {
  const user = req.user;
  if (!user || user.role !== ROLES.HOD) {
    sendError(res, 'Access denied. HOD access required.', 403);
    return null;
  }
  if (!user.departmentId) {
    // Fail closed: an unscoped HOD must not be read as institution-wide.
    sendError(res, 'Your account is not linked to a department. HOD access requires one.', 403);
    return null;
  }

  const department = await Department.findById(user.departmentId);
  if (!department) {
    sendError(res, 'Department not found.', 404);
    return null;
  }

  const deptId = String(department._id);

  const [faculty, students, assignments] = await Promise.all([
    Faculty.find({ department: deptId }).populate('user').lean(),
    Student.find({ department: deptId }).populate('user').populate('batch').lean(),
    MentorAssignment.find({ department: deptId, status: 'ACTIVE' }).lean(),
  ]);

  const studentIds = students.map((s: any) => String(s._id));
  const facultyIds = faculty.map((f: any) => String(f._id));
  const studentIdSet = new Set(studentIds);

  // Mentoring activity = counselling records + Saturday meetings. Both are real
  // stored rows; a date is never invented.
  const sessions: NormalisedSession[] = [];

  if (studentIds.length > 0) {
    const records = await CounsellingRecord.find({
      student: { $in: studentIds },
    }).lean();
    for (const r of records as any[]) {
      const studentId = idOf(r.student) || idOf(r.studentId);
      if (!studentIdSet.has(studentId)) continue;
      sessions.push({
        id: String(r._id),
        studentId,
        mentorId: idOf(r.mentor) || idOf(r.mentorId),
        date: toDay(r.sessionDate || r.date || r.createdAt),
        source: 'COUNSELLING',
      });
    }

    const meetings = await Meeting.find({ student: { $in: studentIds } }).lean();
    for (const m of meetings as any[]) {
      const studentId = idOf(m.student);
      if (!studentIdSet.has(studentId)) continue;
      sessions.push({
        id: String(m._id),
        studentId,
        mentorId: idOf(m.mentor),
        date: toDay(m.meetingDate || m.createdAt),
        source: 'MEETING',
      });
    }
  }

  return { departmentId: deptId, department, faculty, students, studentIds, facultyIds, assignments, sessions };
}

// ---------------------------------------------------------------------------
// Shared aggregation — thin scope-bound adapters
// ---------------------------------------------------------------------------
//
// The arithmetic itself lives in `utils/mentoring-analytics.util.ts` so the
// Admin college-wide dashboard reports identical definitions. These adapters
// only bind an already department-scoped `HodScope` to that shared maths.

function summarise(scope: HodScope, now: Date) {
  return summariseMetrics(
    {
      totalStudents: scope.students.length,
      totalFaculty: scope.faculty.length,
      assignments: scope.assignments,
      sessions: scope.sessions,
    },
    now
  );
}

/** Per-mentor rollup for the whole department. */
function mentorWiseForScope(scope: HodScope, now: Date) {
  return mentorWiseRows(
    {
      faculty: scope.faculty,
      assignments: scope.assignments,
      sessions: scope.sessions,
      departmentName: scope.department?.name || '',
    },
    now
  );
}

/** Weekly buckets over the trailing `weeks` weeks, oldest first. */
function weeklyBuckets(scope: HodScope, weeks: number, endRef: Date = new Date()) {
  return buildWeeklyBuckets(
    { sessions: scope.sessions, totalStudents: scope.students.length },
    weeks,
    endRef
  );
}

// ---------------------------------------------------------------------------
// GET /dashboard
// ---------------------------------------------------------------------------

export async function getHodDashboard(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    // Reporting month defaults to "now"; `?month=YYYY-MM` (untrusted) selects
    // a past month for the monthly figures. Invalid values fall back to now.
    const ref = parseMonthRef((req.query as any)?.month, new Date());
    const summary = summarise(scope, ref);

    return sendSuccess(res, {
      department: {
        id: scope.departmentId,
        name: scope.department.name,
        code: scope.department.code,
        hodName: req.user?.fullName || scope.department.hodName || '',
      },
      summary,
      coverage: {
        total: summary.totalStudents,
        mentored: summary.mentoredThisMonth,
        pending: summary.studentsNotMentoredThisMonth,
        percentage: summary.overallMentoringCoverage,
      },
      // Monthly PIE series: Mentored vs Pending for the selected month.
      pie: {
        month: `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}`,
        mentored: summary.mentoredThisMonth,
        pending: summary.studentsNotMentoredThisMonth,
        total: summary.totalStudents,
      },
      mentorWise: mentorWiseForScope(scope, ref),
      // 30-day reporting window expressed as 4 weekly periods.
      weeklyProgress: weeklyBuckets(scope, 4, new Date()),
    });
  } catch (err: any) {
    console.error('getHodDashboard error:', err);
    return sendError(res, 'Failed to fetch HOD dashboard data.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /mentor-wise
// ---------------------------------------------------------------------------

export async function getMentorWiseCoverage(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;
    const ref = parseMonthRef((req.query as any)?.month, new Date());
    return sendSuccess(res, mentorWiseForScope(scope, ref));
  } catch (err: any) {
    console.error('getMentorWiseCoverage error:', err);
    return sendError(res, 'Failed to fetch mentor-wise coverage.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /mentor/:mentorId
// ---------------------------------------------------------------------------

export async function getMentorDetail(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const mentorId = String(req.params.mentorId || '');
    const mentor = scope.faculty.find((f: any) => String(f._id) === mentorId);
    if (!mentor) {
      // Also refuse (rather than 404-leak) when the id belongs to another
      // department: an HOD cannot discover that a foreign faculty id exists.
      return sendError(res, 'Faculty member not found in your department.', 404);
    }

    const assignmentByStudent = new Map<string, any>();
    for (const a of scope.assignments) assignmentByStudent.set(idOf(a.student), a);

    const myStudentIds = new Set<string>();
    for (const [studentId, asg] of assignmentByStudent.entries()) {
      if (idOf(asg.mentor) === mentorId) myStudentIds.add(studentId);
    }

    const ref = parseMonthRef((req.query as any)?.month, new Date());

    const mentees = scope.students
      .filter((s: any) => myStudentIds.has(String(s._id)))
      .map((s: any) => {
        const mine = scope.sessions.filter((x) => x.studentId === String(s._id));
        const withDate = mine.filter((x) => x.date);
        const lastMentoringDate = withDate.reduce<string | null>(
          (acc, x) => (acc === null || x.date > acc ? x.date : acc),
          null
        );
        const monthSessions = mine.filter((x) => isSameMonth(x.date, ref));
        return {
          id: String(s._id),
          registerNumber: s.registerNumber,
          fullName: s.fullName,
          batch: s.batch?.name || '',
          year: s.year ?? null,
          section: s.section || '',
          isActive: Boolean(s.isActive),
          mentoredThisMonth: monthSessions.length > 0,
          lastMentoringDate,
          // All-time sessions for this student, and sessions inside the
          // selected reporting month (the rule above counts the student once).
          sessionCount: mine.length,
          sessionsThisMonth: monthSessions.length,
        };
      })
      .sort((a: any, b: any) => String(a.fullName).localeCompare(String(b.fullName)));

    let sessionCount = 0;
    let sessionsThisMonth = 0;
    let lastMentoringDate: string | null = null;
    const mentoredThisMonthSet = new Set<string>();
    for (const s of scope.sessions) {
      if (!myStudentIds.has(s.studentId) || !s.date) continue;
      sessionCount += 1;
      if (!lastMentoringDate || s.date > lastMentoringDate) lastMentoringDate = s.date;
      if (isSameMonth(s.date, ref)) {
        sessionsThisMonth += 1;
        mentoredThisMonthSet.add(s.studentId);
      }
    }

    // ------------------------------------------------------------------
    // Dossier sections behind the faculty detail view.
    //
    // Every section is derived from stored rows and scoped to THIS
    // department. The mentor is already proven to be in scope; each
    // record's student is additionally cross-checked against the
    // department's student set, so even a stale cross-department reference
    // can never leak another department's data.
    // ------------------------------------------------------------------

    const deptStudentIds = new Set<string>(scope.studentIds);
    const studentById = new Map<string, any>();
    for (const s of scope.students) studentById.set(String(s._id), s);

    const studentRef = (sid: string) => {
      const s = studentById.get(sid);
      return {
        studentId: sid,
        registerNumber: s?.registerNumber || '',
        studentName: s?.fullName || '',
      };
    };
    const ts = (v: any): number => (v ? new Date(v).getTime() || 0 : 0);

    // (1) Assignment history — current AND historical rows for this mentor.
    // Distinct students are represented by distinct transition rows; rows are
    // de-duplicated by id so a replayed/duplicated store entry shows once.
    const assignmentRaw = await MentorAssignment.find({
      mentor: mentorId,
      department: scope.departmentId,
    }).lean();

    const seenAssignments = new Set<string>();
    const assignments = (assignmentRaw as any[])
      .filter((a) => {
        const key = String(a._id);
        if (seenAssignments.has(key)) return false;
        seenAssignments.add(key);
        return true;
      })
      .map((a) => {
        const sid = idOf(a.student);
        return {
          id: String(a._id),
          ...studentRef(sid),
          status: a.status || 'ACTIVE',
          assignedFrom: a.assignedFrom || null,
          assignedUntil: a.assignedUntil || null,
          changeReason: a.changeReason || '',
          isCurrent: a.status === 'ACTIVE',
        };
      })
      .sort((x, y) => ts(y.assignedFrom) - ts(x.assignedFrom));

    // (2) Counselling records AUTHORED by this mentor. Scoping by author (not
    // by current mentee) keeps a reassigned student's earlier sessions with
    // this faculty member in their history, while the student's later
    // sessions correctly appear under the new mentor.
    const counsellingRaw = await CounsellingRecord.find({
      $or: [{ mentor: mentorId }, { mentorId: mentorId }],
    }).lean();

    const counselling = (counsellingRaw as any[])
      .map((r) => ({ r, sid: idOf(r.student) || idOf(r.studentId) }))
      .filter(({ sid }) => deptStudentIds.has(sid))
      .map(({ r, sid }) => ({
        id: String(r._id),
        ...studentRef(sid),
        date: toDay(r.sessionDate || r.date || r.createdAt) || null,
        categories:
          Array.isArray(r.categories) && r.categories.length > 0
            ? r.categories
            : r.category
              ? [r.category]
              : [],
        discussionWith: Array.isArray(r.discussionWith) ? r.discussionWith : [],
        recordKind: r.recordKind || 'INDIVIDUAL',
        status: r.status || '',
        followUpDate: r.followUpDate || '',
        concernReason: r.concernReason || '',
        observation: r.discussionObservation || r.challengeObserved || '',
        skillNeedingImprovement: r.skillNeedingImprovement || '',
        actionPlan: r.actionPlan || r.correctiveAction || '',
        expectedImprovement: r.expectedImprovement || '',
        studentFeedback: r.studentFeedback || '',
        mentorRemarks: r.mentorRemarks || '',
        evidenceCount: Array.isArray(r.evidence) ? r.evidence.length : 0,
      }))
      .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));

    // (3) Saturday / individual meetings conducted by this mentor.
    const meetingRaw = await Meeting.find({ mentor: mentorId }).lean();

    const meetings = (meetingRaw as any[])
      .map((m) => ({ m, sid: idOf(m.student) }))
      .filter(({ sid }) => deptStudentIds.has(sid))
      .map(({ m, sid }) => ({
        id: String(m._id),
        ...studentRef(sid),
        meetingDate: m.meetingDate || '',
        meetingTime: m.meetingTime || '',
        location: m.location || '',
        attendanceStatus: m.attendanceStatus || '',
        meetingStatus: m.meetingStatus || '',
        challengesDiscussed: m.challengesDiscussed || '',
        studentFeedback: m.studentFeedback || '',
        counsellingProvided: m.counsellingProvided || '',
        correctiveAction: m.correctiveAction || '',
        followUpRequired: Boolean(m.followUpRequired),
        followUpDate: m.followUpDate || '',
        mentorRemarks: m.mentorRemarks || '',
        evidenceCount: Array.isArray(m.evidence) ? m.evidence.length : 0,
      }))
      .sort((x, y) => String(y.meetingDate || '').localeCompare(String(x.meetingDate || '')));

    // (4) Certificates / supporting documents belonging to the mentor's
    // CURRENT mentees. Documents belong to students, so this is the set the
    // faculty member is presently accountable for.
    const menteeIds = Array.from(myStudentIds);
    const documentRaw =
      menteeIds.length > 0
        ? await StudentDocument.find({ studentId: { $in: menteeIds } }).lean()
        : [];

    const documents = (documentRaw as any[])
      .map((d) => ({
        id: String(d._id),
        ...studentRef(idOf(d.studentId)),
        title: d.title || d.fileName || 'Document',
        fileName: d.fileName || '',
        category: d.category || 'Other',
        documentType: d.documentType || (d.isPrimary ? 'student_details_form' : 'certificate'),
        isPrimary: Boolean(d.isPrimary),
        fileType: d.fileType || 'application/pdf',
        fileSize: d.fileSize || 0,
        verificationStatus: d.verificationStatus || 'Pending',
        uploadedAt: d.uploadedAt || null,
      }))
      .sort((x, y) => ts(y.uploadedAt) - ts(x.uploadedAt));

    const user: any = mentor.user || {};
    return sendSuccess(res, {
      mentor: {
        id: mentorId,
        fullName: user.fullName || '',
        email: user.email || '',
        employeeId: mentor.employeeId || '',
        designation: mentor.designation || '',
        cabinLocation: mentor.cabinLocation || '',
        phoneNumber: mentor.phoneNumber || '',
        isActive: Boolean(mentor.isActive),
        department: scope.department?.name || '',
      },
      mentees,
      summary: {
        totalMentees: mentees.length,
        mentoredThisMonth: mentoredThisMonthSet.size,
        pending: Math.max(0, mentees.length - mentoredThisMonthSet.size),
        coveragePercent: pct(mentoredThisMonthSet.size, mentees.length),
        // All-time sessions vs sessions inside the selected reporting month.
        sessionCount,
        sessionsThisMonth,
        lastMentoringDate,
      },
      assignments,
      counselling,
      meetings,
      documents,
      departmentScope: scope.departmentId,
    });
  } catch (err: any) {
    console.error('getMentorDetail error:', err);
    return sendError(res, 'Failed to fetch mentor detail.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /weekly-progress
// ---------------------------------------------------------------------------

export async function getWeeklyProgress(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;
    // Default 4 weekly periods (the 30-day window); explicit `weeks` still
    // honoured and clamped to [1, 26].
    const weeks = clampWeeks((req.query as any)?.weeks, 4, 26);
    return sendSuccess(res, weeklyBuckets(scope, weeks));
  } catch (err: any) {
    console.error('getWeeklyProgress error:', err);
    return sendError(res, 'Failed to fetch weekly progress.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /report-30-day
// ---------------------------------------------------------------------------

export async function getReport30Day(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);

    const inRange = scope.sessions.filter((s) => s.date && s.date >= fromDay && s.date <= toDay);
    const studentsMentoredSet = new Set(inRange.map((s) => s.studentId));
    const studentsMentored = studentsMentoredSet.size;

    const pendingStudentIds = scope.students
      .map((s: any) => String(s._id))
      .filter((id) => !studentsMentoredSet.has(id));

    const assignmentByStudent = new Map(scope.assignments.map((a: any) => [idOf(a.student), a]));
    const studentById = new Map(scope.students.map((s: any) => [String(s._id), s]));

    const pendingStudents = pendingStudentIds.map((id) => {
      const s: any = studentById.get(id);
      const asg = assignmentByStudent.get(id);
      const mentorId = asg ? idOf(asg.mentor) : '';
      const mentorDoc = scope.faculty.find((f: any) => String(f._id) === mentorId);
      return {
        id,
        registerNumber: s?.registerNumber || '',
        fullName: s?.fullName || '',
        batch: s?.batch?.name || '',
        year: s?.year ?? null,
        section: s?.section || '',
        mentorId,
        mentorName: (mentorDoc?.user as any)?.fullName || '',
        lastMentoringDate: null,
        sessionCount: 0,
        mentoredThisMonth: false,
      };
    });

    // Monthly mentor-wise rows (distinct-student rule for the current month)
    // plus the windowed per-mentor rows the 30-day report table renders.
    const mentorWise = mentorWiseForScope(scope, new Date()).filter((row: any) => row.totalMentees > 0);
    const reportMentors = mentorReportRows(
      {
        faculty: scope.faculty,
        assignments: scope.assignments,
        sessions: scope.sessions,
        students: scope.students,
      },
      fromDay,
      toDay
    ).filter((row) => row.totalMentees > 0);

    return sendSuccess(res, {
      from: fromDay,
      to: toDay,
      totals: {
        sessions: inRange.length,
        studentsMentored,
        studentsPending: pendingStudents.length,
        coveragePercent: pct(studentsMentored, scope.students.length),
        mentorsActive: reportMentors.filter((m) => m.coveredStudents > 0).length,
        mentorsWithMentees: reportMentors.length,
      },
      // 30-day reporting window expressed as 4 weekly periods.
      weekly: weeklyBuckets(scope, 4, to),
      mentorWise,
      reportMentors,
      pendingStudents,
    });
  } catch (err: any) {
    console.error('getReport30Day error:', err);
    return sendError(res, 'Failed to fetch the 30-day report.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /department-overview
// ---------------------------------------------------------------------------

export async function getDepartmentOverview(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const assignedStudentIds = new Set(scope.assignments.map((a: any) => idOf(a.student)));
    const summary = summarise(scope, new Date());

    const batchIds = new Set(
      scope.students.map((s: any) => idOf(s.batch)).filter(Boolean) as string[]
    );

    // Batches are institution-wide in this data model (Batch carries no
    // department), but only those actually used by this department's students
    // are offered — an HOD should not allocate across an empty department.
    const allBatches = await Batch.find({ isActive: true }).sort({ name: 1 }).lean();

    return sendSuccess(res, {
      department: {
        id: scope.departmentId,
        name: scope.department.name,
        code: scope.department.code,
        hodName: scope.department.hodName || req.user?.fullName || '',
      },
      facultyCount: summary.totalFaculty,
      studentCount: summary.totalStudents,
      mentorCount: summary.totalMentors,
      batchCount: batchIds.size,
      batches: (allBatches as any[]).map((b) => ({
        id: String(b._id),
        name: b.name || '',
        startYear: b.startYear ?? null,
        endYear: b.endYear ?? null,
        inUse: batchIds.has(String(b._id)),
      })),
      unassignedStudents: scope.students.filter((s: any) => !assignedStudentIds.has(String(s._id))).length,
      activeMentees: summary.assignedMentees,
      activeStudents: scope.students.filter((s: any) => s.isActive).length,
      totalMentoringSessions: summary.totalMentoringSessions,
      lastMentoringActivity: summary.lastMentoringActivity,
      overallMentoringCoverage: summary.overallMentoringCoverage,
    });
  } catch (err: any) {
    console.error('getDepartmentOverview error:', err);
    return sendError(res, 'Failed to fetch department overview.', 500);
  }
}

// ---------------------------------------------------------------------------
// Faculty: GET / POST / PUT
// ---------------------------------------------------------------------------

function facultyRow(f: any, scope: HodScope, menteeCount: number) {
  const user: any = f.user || {};
  return {
    id: String(f._id),
    _id: String(f._id),
    employee_id: f.employeeId || '',
    full_name: user.fullName || '',
    email: user.email || '',
    username: user.username || '',
    designation: f.designation || '',
    cabin_location: f.cabinLocation || '',
    phone_number: f.phoneNumber || '',
    department: scope.department?.name || '',
    department_id: scope.departmentId,
    is_active: Boolean(f.isActive),
    mentee_count: menteeCount,
  };
}

export async function getHodFaculty(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const list = scope.faculty.map((f: any) => {
      const menteeCount = scope.assignments.filter((a: any) => idOf(a.mentor) === String(f._id)).length;
      return facultyRow(f, scope, menteeCount);
    });
    list.sort((a: any, b: any) => String(a.full_name).localeCompare(String(b.full_name)));
    return sendSuccess(res, list);
  } catch (err: any) {
    console.error('getHodFaculty error:', err);
    return sendError(res, 'Failed to fetch department faculty.', 500);
  }
}

export async function createHodFaculty(req: AuthRequest, res: Response): Promise<any> {
  const { username, fullName, email, employeeId, designation, cabinLocation, phoneNumber, password } =
    req.body || {};

  if (!fullName || !email || !employeeId) {
    return sendError(res, 'Required fields missing: fullName, email, employeeId.', 400);
  }

  const scope = await loadScope(req, res);
  if (!scope) return;

  const empId = String(employeeId).trim().toUpperCase();
  const mail = String(email).trim().toLowerCase();

  try {
    if (await Faculty.findOne({ employeeId: empId })) {
      return sendError(res, 'Employee ID already registered.', 409);
    }
    if (await User.findOne({ email: mail })) {
      return sendError(res, 'Email already registered.', 409);
    }

    // A username is optional; derive a deterministic one from the employee id so
    // the new faculty member always has a login.
    let uName = username ? String(username).trim().toLowerCase() : empId.toLowerCase();
    if (await User.findOne({ username: uName })) {
      return sendError(res, 'Username already registered.', 409);
    }

    const passwordHash = await bcrypt.hash(password || 'Password@123', 10);
    const user = await User.create({
      username: uName,
      passwordHash,
      role: ROLES.FACULTY,
      email: mail,
      fullName: String(fullName).trim(),
      department: scope.departmentId,
      isActive: true,
    });

    const faculty = await Faculty.create({
      user: user._id,
      employeeId: empId,
      // Forced to the HOD's own department. A request cannot place a new
      // faculty member in another department.
      department: scope.departmentId,
      designation: String(designation || 'Assistant Professor').trim(),
      cabinLocation: cabinLocation?.trim() || 'Faculty Cabin',
      phoneNumber: phoneNumber?.trim() || '',
      maxMentees: 25,
      isActive: true,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_FACULTY',
      entity: 'FACULTY',
      entityId: String(faculty._id),
      details: { employeeId: empId, fullName: String(fullName).trim(), departmentId: scope.departmentId },
      req,
    } as any);

    const hydrated = await Faculty.findById(faculty._id).populate('user').lean();
    return sendSuccess(res, facultyRow(hydrated, scope, 0), 'Faculty member added to your department.', 201);
  } catch (err: any) {
    console.error('createHodFaculty error:', err);
    return sendError(res, 'Failed to add the faculty member.', 500);
  }
}

export async function updateHodFaculty(req: AuthRequest, res: Response): Promise<any> {
  const { fullName, email, designation, cabinLocation, phoneNumber, isActive } = req.body || {};

  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const facultyId = String(req.params.facultyId || '');
    // Department-scoped lookup: an id from another department simply is not found.
    const faculty: any = await Faculty.findOne({ _id: toLocalId(facultyId), department: scope.departmentId });
    if (!faculty) return sendError(res, 'Faculty member not found in your department.', 404);

    const userId = idOf(faculty.user);
    const user: any = await User.findById(userId);

    if (fullName !== undefined) user.fullName = String(fullName).trim();
    if (email !== undefined) {
      const mail = String(email).trim().toLowerCase();
      const clash = await User.findOne({ email: mail, _id: { $ne: user._id } });
      if (clash) return sendError(res, 'Email already registered.', 409);
      user.email = mail;
    }
    if (isActive !== undefined) user.isActive = Boolean(isActive);
    await user.save();

    if (designation !== undefined) faculty.designation = String(designation).trim();
    if (cabinLocation !== undefined) faculty.cabinLocation = String(cabinLocation).trim();
    if (phoneNumber !== undefined) faculty.phoneNumber = String(phoneNumber).trim();
    if (isActive !== undefined) faculty.isActive = Boolean(isActive);
    await faculty.save();

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_FACULTY',
      entity: 'FACULTY',
      entityId: facultyId,
      details: { updated: Object.keys(req.body || {}) },
      req,
    } as any);

    const hydrated: any = await Faculty.findById(faculty._id).populate('user').lean();
    const menteeCount = scope.assignments.filter((a: any) => idOf(a.mentor) === facultyId).length;
    return sendSuccess(res, facultyRow(hydrated, scope, menteeCount), 'Faculty member updated.');
  } catch (err: any) {
    console.error('updateHodFaculty error:', err);
    return sendError(res, 'Failed to update the faculty member.', 500);
  }
}

// ---------------------------------------------------------------------------
// Students: GET / POST / PUT
// ---------------------------------------------------------------------------

function studentRow(s: any, scope: HodScope, mentorName: string, extra: Record<string, any> = {}) {
  return {
    id: String(s._id),
    _id: String(s._id),
    register_number: s.registerNumber || '',
    full_name: s.fullName || '',
    department: scope.department?.name || '',
    department_id: scope.departmentId,
    batch_name: s.batch?.name || '',
    year: s.year ?? null,
    section: s.section || '',
    email: (s.user as any)?.email || s.email || '',
    mobile_number: s.mobileNumber || '',
    is_active: Boolean(s.isActive),
    current_mentor_name: mentorName,
    ...extra,
  };
}

export async function getHodStudents(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const now = new Date();
    const assignmentByStudent = new Map(scope.assignments.map((a: any) => [idOf(a.student), a]));
    const facultyById = new Map(scope.faculty.map((f: any) => [String(f._id), f]));

    const list = scope.students.map((s: any) => {
      const sid = String(s._id);
      const asg = assignmentByStudent.get(sid);
      const mentorDoc = asg ? facultyById.get(idOf(asg.mentor)) : null;
      const mine = scope.sessions.filter((x) => x.studentId === sid);
      const lastMentoringDate = mine.reduce<string | null>(
        (acc, x) => (x.date && (acc === null || x.date > acc) ? x.date : acc),
        null
      );
      return studentRow(s, scope, (mentorDoc?.user as any)?.fullName || '', {
        mentor_id: mentorDoc ? String(mentorDoc._id) : '',
        // The active assignment row, so the client can end it before reassigning
        // rather than only ever handling first-time allocation.
        assignment_id: asg ? String(asg._id) : '',
        mentored_this_month: mine.some((x) => isSameMonth(x.date, now)),
        last_mentoring_date: lastMentoringDate,
        session_count: mine.length,
      });
    });

    list.sort((a: any, b: any) => String(a.register_number).localeCompare(String(b.register_number)));
    return sendSuccess(res, list);
  } catch (err: any) {
    console.error('getHodStudents error:', err);
    return sendError(res, 'Failed to fetch department students.', 500);
  }
}

export async function createHodStudent(req: AuthRequest, res: Response): Promise<any> {
  const { fullName, registerNumber, email, batchId, year, section, mobileNumber, password } = req.body || {};

  if (!fullName || !registerNumber || !batchId) {
    return sendError(res, 'Required fields missing: fullName, registerNumber, batchId.', 400);
  }

  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const reg = String(registerNumber).trim().toUpperCase();
    if (await Student.findOne({ registerNumber: reg })) {
      return sendError(res, 'Register number already exists.', 409);
    }

    // The batch must belong to this department. A batch id from elsewhere is
    // refused rather than silently reassigned.
    const batch: any = await Batch.findById(toLocalId(String(batchId)));
    if (!batch) return sendError(res, 'Batch not found.', 404);

    const deptIdOnBatch = idOf((batch as any).department);
    if (deptIdOnBatch && deptIdOnBatch !== scope.departmentId) {
      return sendError(res, 'That batch does not belong to your department.', 403);
    }

    const username = reg.toLowerCase();
    if (await User.findOne({ username })) {
      return sendError(res, 'A user account already exists for that register number.', 409);
    }

    const passwordHash = await bcrypt.hash(password || 'Student@123', 10);
    const user = await User.create({
      username,
      passwordHash,
      role: ROLES.STUDENT,
      email: email ? String(email).trim().toLowerCase() : `${username}@ksrce.test`,
      fullName: String(fullName).trim(),
      department: scope.departmentId,
      isActive: true,
    });

    const student = await Student.create({
      user: user._id,
      registerNumber: reg,
      fullName: String(fullName).trim(),
      department: scope.departmentId,
      batch: batch._id,
      residentialType: 'DAY_SCHOLAR',
      mobileNumber: mobileNumber?.trim() || '',
      section: section?.trim() || '',
      year: Number(year) || undefined,
      email: email ? String(email).trim().toLowerCase() : user.email,
      parent: {},
      siblings: [],
      school: {},
      profileCompleted: false,
      isActive: true,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_STUDENT',
      entity: 'STUDENT',
      entityId: String(student._id),
      details: { registerNumber: reg, departmentId: scope.departmentId },
      req,
    } as any);

    const hydrated: any = await Student.findById(student._id).populate('user').populate('batch').lean();
    return sendSuccess(res, studentRow(hydrated, scope, ''), 'Student added to your department.', 201);
  } catch (err: any) {
    console.error('createHodStudent error:', err);
    return sendError(res, 'Failed to add the student.', 500);
  }
}

export async function updateHodStudent(req: AuthRequest, res: Response): Promise<any> {
  const { fullName, email, year, section, mobileNumber, isActive } = req.body || {};

  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const studentId = String(req.params.studentId || '');
    const student: any = await Student.findOne({
      _id: toLocalId(studentId),
      department: scope.departmentId,
    });
    if (!student) return sendError(res, 'Student not found in your department.', 404);

    const userId = idOf(student.user);
    const user: any = await User.findById(userId);
    if (user) {
      if (fullName !== undefined) user.fullName = String(fullName).trim();
      if (email !== undefined) user.email = String(email).trim().toLowerCase();
      if (isActive !== undefined) user.isActive = Boolean(isActive);
      await user.save();
    }

    if (fullName !== undefined) student.fullName = String(fullName).trim();
    if (email !== undefined) student.email = String(email).trim().toLowerCase();
    if (year !== undefined) student.year = Number(year) || undefined;
    if (section !== undefined) student.section = String(section).trim();
    if (mobileNumber !== undefined) student.mobileNumber = String(mobileNumber).trim();
    if (isActive !== undefined) student.isActive = Boolean(isActive);
    await student.save();

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_STUDENT',
      entity: 'STUDENT',
      entityId: studentId,
      details: { updated: Object.keys(req.body || {}) },
      req,
    } as any);

    const hydrated: any = await Student.findById(student._id).populate('user').populate('batch').lean();
    const asg = scope.assignments.find((a: any) => idOf(a.student) === studentId);
    const mentorDoc = asg ? scope.faculty.find((f: any) => String(f._id) === idOf(asg.mentor)) : null;

    const mine = scope.sessions.filter((x) => x.studentId === studentId);
    const lastMentoringDate = mine.reduce<string | null>(
      (acc, x) => (x.date && (acc === null || x.date > acc) ? x.date : acc),
      null
    );

    return sendSuccess(
      res,
      studentRow(hydrated, scope, (mentorDoc?.user as any)?.fullName || '', {
        mentor_id: mentorDoc ? String(mentorDoc._id) : '',
        assignment_id: asg ? String(asg._id) : '',
        mentored_this_month: mine.some((x) => isSameMonth(x.date, new Date())),
        last_mentoring_date: lastMentoringDate,
        session_count: mine.length,
      }),
      'Student updated.'
    );
  } catch (err: any) {
    console.error('updateHodStudent error:', err);
    return sendError(res, 'Failed to update the student.', 500);
  }
}

// ---------------------------------------------------------------------------
// Mentor assignment
// ---------------------------------------------------------------------------

export async function createHodAssignment(req: AuthRequest, res: Response): Promise<any> {
  const { studentId, mentorId, assignedFrom, reason } = req.body || {};
  if (!studentId || !mentorId) {
    return sendError(res, 'Student ID and Mentor ID are required.', 400);
  }

  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const student: any = scope.students.find((s: any) => String(s._id) === String(studentId));
    if (!student) return sendError(res, 'Student not found in your department.', 404);

    const mentor: any = scope.faculty.find((f: any) => String(f._id) === String(mentorId));
    if (!mentor) return sendError(res, 'Faculty member not found in your department.', 404);
    if (!mentor.isActive) return sendError(res, 'That faculty member is inactive.', 400);

    const existing = scope.assignments.find((a: any) => idOf(a.student) === String(student._id));
    if (existing) {
      return sendError(res, 'This student already has an active mentor. Use reassignment instead.', 409);
    }

    const fromDate = assignedFrom ? toDay(assignedFrom) : toDay(new Date());
    const assignment = await MentorAssignment.create({
      student: student._id,
      mentor: mentor._id,
      // Forced to the student's department — never taken from the request body.
      department: scope.departmentId,
      assignedFrom: fromDate,
      status: 'ACTIVE',
      assignedBy: toLocalId(req.user!.id),
      changeReason: reason || 'HOD Departmental Allocation',
    });

    await Notification.create({
      user: idOf(student.user),
      title: 'Mentor Assigned',
      message: `You have been assigned to ${(mentor.user as any)?.fullName || 'a faculty mentor'}.`,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: String(assignment._id),
    });

    await Notification.create({
      user: idOf(mentor.user),
      title: 'New Mentee Assigned',
      message: `${student.fullName} (${student.registerNumber}) has been assigned to you by the HOD.`,
      type: 'MENTOR_ASSIGNMENT',
      relatedEntity: 'MENTOR_ASSIGNMENT',
      relatedEntityId: String(assignment._id),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'ASSIGN_MENTOR',
      entity: 'MENTOR_ASSIGNMENT',
      entityId: String(assignment._id),
      details: {
        studentId: String(student._id),
        mentorId: String(mentor._id),
        departmentId: scope.departmentId,
        reason,
      },
      req,
    } as any);

    return sendSuccess(
      res,
      {
        assignmentId: String(assignment._id),
        studentId: String(student._id),
        mentorId: String(mentor._id),
        message: 'Mentor assigned within your department.',
      },
      'Mentor assigned.',
      201
    );
  } catch (err: any) {
    console.error('createHodAssignment error:', err);
    return sendError(res, 'Failed to assign the mentor.', 500);
  }
}

export async function removeHodAssignment(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const assignmentId = String(req.params.assignmentId || '');
    const isActiveHere = scope.assignments.some((a: any) => String(a._id) === assignmentId);
    if (!isActiveHere) return sendError(res, 'Active assignment not found in your department.', 404);

    // scope.assignments is loaded with .lean() for analytics, so re-read the row
    // as a live document. The department + ACTIVE filters are repeated here so
    // this read is scoped on its own terms, not merely because the id was found
    // in the scope list above.
    const assignment: any = await MentorAssignment.findOne({
      _id: assignmentId,
      department: scope.departmentId,
      status: 'ACTIVE',
    } as any);
    if (!assignment) return sendError(res, 'Active assignment not found in your department.', 404);

    assignment.status = 'COMPLETED';
    assignment.assignedUntil = toDay(new Date());
    assignment.changeReason = assignment.changeReason || 'Removed by HOD';
    await assignment.save();

    await logAudit({
      userId: req.user!.id,
      action: 'REMOVE_MENTOR_ASSIGNMENT',
      entity: 'MENTOR_ASSIGNMENT',
      entityId: assignmentId,
      details: { departmentId: scope.departmentId },
      req,
    } as any);

    return sendSuccess(
      res,
      {
        assignmentId,
        studentId: idOf(assignment.student),
        mentorId: idOf(assignment.mentor),
        message: 'Mentor assignment ended. Historical records are retained.',
      },
      'Mentor assignment removed.'
    );
  } catch (err: any) {
    console.error('removeHodAssignment error:', err);
    return sendError(res, 'Failed to remove the mentor assignment.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /faculty-notifications
// ---------------------------------------------------------------------------

export async function getFacultyNotifications(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    if (scope.faculty.length === 0) return sendSuccess(res, []);

    // Every User account behind this department's Faculty records.
    const userIds = scope.faculty.map((f: any) => idOf(f.user)).filter(Boolean);
    const notifications = userIds.length
      ? await Notification.find({ user: { $in: userIds } }).sort({ createdAt: -1 }).limit(100).lean()
      : [];

    const facultyByUser = new Map(scope.faculty.map((f: any) => [idOf(f.user), f]));
    const nameOf = new Map(
      scope.faculty.map((f: any) => [idOf(f.user), (f.user as any)?.fullName || ''] as const)
    );

    const list = (notifications as any[]).map((n) => {
      const facultyDoc: any = facultyByUser.get(idOf(n.user));
      return {
        id: String(n._id),
        title: n.title || '',
        message: n.message || '',
        type: n.type || '',
        is_read: Boolean(n.isRead),
        created_at: toDay(n.createdAt) || null,
        faculty_id: facultyDoc ? String(facultyDoc._id) : '',
        faculty_name: nameOf.get(idOf(n.user)) || '',
      };
    });

    return sendSuccess(res, list);
  } catch (err: any) {
    console.error('getFacultyNotifications error:', err);
    return sendError(res, 'Failed to fetch faculty notifications.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /notifications  (faculty -> HOD notices for THIS department)
// ---------------------------------------------------------------------------
//
// Distinct from `/faculty-notifications` above, which lists the notices the
// department's faculty *received* (reminders, assignments). This endpoint
// lists the notices the department's faculty *sent* to the HOD.
//
// Department scope is applied inside the Mongo filter three times over: the
// caller must be the recipient (`user`), the stored `department` must be this
// HOD's department, and the type must be a faculty notification. A notice
// belonging to another department therefore cannot be read here even if a
// document were addressed to this HOD by mistake — it fails closed.

/** Stored date (Date | ISO string) -> ISO string, or null when unparseable. */
function isoTimestamp(value: any): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function getDepartmentNotifications(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const userId = req.user!.id;
    const userObjId = isValidId(userId) ? toLocalId(userId) : userId;

    const base: any = {
      user: userObjId,
      department: scope.departmentId,
      type: NOTIFICATION_TYPES.FACULTY_NOTIFICATION,
    };

    const [rows, unreadCount, totalCount] = await Promise.all([
      Notification.find(base).sort({ createdAt: -1 }).limit(100).lean(),
      Notification.countDocuments({ ...base, isRead: false }),
      Notification.countDocuments(base),
    ]);

    const notifications = (rows as any[]).map((n) => ({
      id: String(n._id),
      title: n.title || '',
      message: n.message || '',
      type: n.type || '',
      faculty_id: n.facultyId || '',
      faculty_name: n.facultyName || '',
      department_id: scope.departmentId,
      department_name: scope.department?.name || '',
      is_read: Boolean(n.isRead),
      created_at: isoTimestamp(n.createdAt),
    }));

    return sendSuccess(res, {
      notifications,
      unreadCount,
      totalCount,
      department: {
        id: scope.departmentId,
        name: scope.department?.name || '',
        code: scope.department?.code || '',
      },
    });
  } catch (err: any) {
    console.error('getDepartmentNotifications error:', err);
    return sendError(res, 'Failed to fetch department notifications.', 500);
  }
}

// ---------------------------------------------------------------------------
// Marks Management — HOD department-scoped
// ---------------------------------------------------------------------------

/**
 * GET /marks/subjects
 * List subjects for a given academic year, year (1-4), and class/section.
 * The HOD can only see subjects relevant to their department's students.
 */
export async function getSubjectsForClass(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = Number(req.query.year);
    const section = String(req.query.section || '').trim().toUpperCase();

    if (!academicYear || !year || !section) {
      return sendError(res, 'academicYear, year, and section are required.', 400);
    }

    // Get students in this department matching the academic context
    const studentIds = scope.students
      .filter((s: any) => {
        const batchName = s.batch?.name || '';
        return s.year === year && s.section === section && batchName.includes(academicYear);
      })
      .map((s: any) => String(s._id));

    if (studentIds.length === 0) {
      return sendSuccess(res, []);
    }

    // The Admin-managed subject catalogue for this department + cohort. The
    // study year maps to two semesters (year 1 -> 1/2, year 4 -> 7/8), so a
    // class sees exactly the subjects taught across its two semesters.
    const semesters = [year * 2 - 1, year * 2];
    const catalogue = await loadDepartmentSubjects(scope.departmentId, { academicYear, semesters });

    type SubjectOption = {
      id: string | null;
      subjectCode: string;
      subjectName: string;
      semesterNumber: number;
      maxMarks: number | null;
      passMarks: number | null;
      subjectType: string | null;
      subjectTypeLabel: string | null;
      regulation: string;
      status: 'ACTIVE' | 'INACTIVE';
      source: 'MASTER' | 'MARKS';
      isActive: boolean;
    };

    const subjectMap = new Map<string, SubjectOption>();
    for (const s of catalogue as any[]) {
      // A subject may apply to several semesters; the class sees one option per
      // semester it actually covers (year 1 -> semesters 1 and 2, …).
      const subjectSemesterList = subjectSemesters(s).filter((n) => semesters.includes(n));
      const regulation = subjectRegulations(s)[0] ?? '';
      for (const semesterNumber of subjectSemesterList) {
        const key = `${String(s.code).toUpperCase()}|${semesterNumber}`;
        subjectMap.set(key, {
          id: String(s._id),
          subjectCode: s.code,
          subjectName: s.name,
          semesterNumber,
          maxMarks: s.maxMarks ?? null,
          passMarks: s.passMarks ?? null,
          subjectType: s.subjectType ?? null,
          subjectTypeLabel: s.subjectTypeLabel ?? null,
          regulation,
          status: s.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          source: 'MASTER',
          isActive: s.status !== 'INACTIVE',
        });
      }
    }

    // Legacy subjects: derived from marks already on record. Unioned in so an
    // existing department that has not been onboarded onto the catalogue keeps
    // working, and so historical subjects stay listed (viewable in reports).
    //
    // Once the department HAS a catalogue, enforcement is on, so a legacy code
    // that is not in the catalogue can no longer be uploaded to — it is listed
    // as view-only (isActive:false) rather than offered as a selectable subject
    // the server would then reject. Departments with no catalogue stay legacy
    // and their derived subjects remain fully selectable.
    const catalogueEnforced = catalogue.length > 0;
    const marks = await InternalMark.find({
      student: { $in: studentIds },
    }).select('subjectCode subjectName semesterNumber').lean();

    for (const m of marks as any[]) {
      const key = `${String(m.subjectCode).toUpperCase()}|${m.semesterNumber}`;
      if (subjectMap.has(key)) continue;
      subjectMap.set(key, {
        id: null,
        subjectCode: m.subjectCode,
        subjectName: m.subjectName,
        semesterNumber: m.semesterNumber,
        maxMarks: null,
        passMarks: null,
        subjectType: null,
        subjectTypeLabel: null,
        regulation: '',
        status: 'ACTIVE',
        source: 'MARKS',
        isActive: !catalogueEnforced,
      });
    }

    const subjects = Array.from(subjectMap.values()).sort((a, b) => {
      if (a.semesterNumber !== b.semesterNumber) return a.semesterNumber - b.semesterNumber;
      return String(a.subjectCode).localeCompare(String(b.subjectCode));
    });

    return sendSuccess(res, subjects);
  } catch (err: any) {
    console.error('getSubjectsForClass error:', err);
    return sendError(res, 'Failed to fetch subjects.', 500);
  }
}

/**
 * Derive the cohort session label (e.g. "2024-2028") from a batch name.
 * Falls back to the raw batch name so a class is never labelled with a value
 * that cannot be used to re-select the same students.
 */
function deriveAcademicYear(batchName: string): string {
  const match = String(batchName || '').match(/(\d{4}-\d{4})/);
  return match ? match[1] : String(batchName || '').trim();
}

/**
 * GET /class-management/classes
 * List classes (year + section) for the caller's department.
 *
 * `academicYear` and `year` are both optional filters:
 *   - no filters  -> every year (I–IV) grouped with every section
 *   - `year` only -> every section for that study year
 *   - `academicYear` only -> every year/section for that cohort
 * Each class reports its student count, the cohort session it belongs to and
 * the subjects that already have recorded marks (department-scoped).
 */
export async function getClassesForYear(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const rawYear = req.query.year;
    const hasYear = rawYear !== undefined && rawYear !== null && String(rawYear).trim() !== '';
    const year = hasYear ? Number(rawYear) : undefined;

    if (hasYear && (!Number.isFinite(year) || (year as number) <= 0)) {
      return sendError(res, 'year must be a positive number.', 400);
    }

    // Department-scoped students matching the optional filters.
    const students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      const yearOk = year === undefined || s.year === year;
      const batchOk = !academicYear || batchName.includes(academicYear);
      return yearOk && batchOk;
    });

    if (students.length === 0) {
      return sendSuccess(res, []);
    }

    // Group by (study year, section). A section appears exactly once per year.
    const groupMap = new Map<string, any[]>();
    students.forEach((s: any) => {
      const sec = (s.section || 'A').toString().toUpperCase();
      const key = `${s.year}|${sec}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    });

    const classList = [];
    for (const [key, groupStudents] of groupMap.entries()) {
      const separator = key.indexOf('|');
      const groupYear = Number(key.slice(0, separator));
      const section = key.slice(separator + 1);

      // The class cohort label = the most common session among its students.
      const sessionCounts = new Map<string, number>();
      for (const s of groupStudents) {
        const label = deriveAcademicYear(s.batch?.name || '');
        if (!label) continue;
        sessionCounts.set(label, (sessionCounts.get(label) || 0) + 1);
      }
      let cohort = '';
      let bestCount = -1;
      for (const [label, count] of sessionCounts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          cohort = label;
        }
      }

      const subjectsRes = await InternalMark.find({
        student: { $in: groupStudents.map((s: any) => String(s._id)) },
      }).select('subjectCode subjectName semesterNumber').lean();

      const subjectMap = new Map<string, { subjectCode: string; subjectName: string; semesterNumber: number }>();
      for (const m of subjectsRes as any[]) {
        const subjectKey = `${m.subjectCode}|${m.semesterNumber}`;
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, {
            subjectCode: m.subjectCode,
            subjectName: m.subjectName,
            semesterNumber: m.semesterNumber,
          });
        }
      }

      const subjects = Array.from(subjectMap.values()).sort((a, b) => {
        if (a.semesterNumber !== b.semesterNumber) return a.semesterNumber - b.semesterNumber;
        return a.subjectCode.localeCompare(b.subjectCode);
      });

      classList.push({
        year: groupYear,
        section,
        studentCount: groupStudents.length,
        academicYear: cohort || academicYear,
        subjects,
      });
    }

    classList.sort((a, b) => a.year - b.year || a.section.localeCompare(b.section));

    return sendSuccess(res, classList);
  } catch (err: any) {
    console.error('getClassesForYear error:', err);
    return sendError(res, 'Failed to fetch classes.', 500);
  }
}

/**
 * GET /class-management/students
 * List the students belonging to one class (study year + section) in the
 * caller's department. `academicYear` optionally narrows to a single cohort.
 * Used by the "View Class" roster — no marks are returned here.
 */
export async function getClassStudents(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = Number(req.query.year);
    const section = String(req.query.section || '').trim().toUpperCase();

    if (!year || !section) {
      return sendError(res, 'year and section are required.', 400);
    }

    const students = scope.students
      .filter((s: any) => {
        const batchName = s.batch?.name || '';
        const batchOk = !academicYear || batchName.includes(academicYear);
        return s.year === year && (s.section || '').toString().toUpperCase() === section && batchOk;
      })
      .map((s: any) => ({
        id: String(s._id),
        registerNumber: s.registerNumber,
        fullName: s.fullName,
        batch: s.batch?.name || '',
        year: s.year,
        section: s.section,
      }))
      .sort((a: any, b: any) => String(a.registerNumber).localeCompare(String(b.registerNumber)));

    return sendSuccess(res, students);
  } catch (err: any) {
    console.error('getClassStudents error:', err);
    return sendError(res, 'Failed to fetch class students.', 500);
  }
}

/**
 * GET /marks/students
 * List students for a given academic year, year, section, and subject.
 * Returns students with their existing marks for the subject.
 */
export async function getStudentsByClassSubject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = Number(req.query.year);
    const section = String(req.query.section || '').trim().toUpperCase();
    const subjectCode = String(req.query.subjectCode || '').trim().toUpperCase();
    const semesterNumber = Number(req.query.semesterNumber);

    if (!academicYear || !year || !section || !subjectCode || !semesterNumber) {
      return sendError(res, 'academicYear, year, section, subjectCode, and semesterNumber are required.', 400);
    }

    // Get students in this department matching the academic context
    const students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      return s.year === year && s.section === section && batchName.includes(academicYear);
    });

    if (students.length === 0) {
      return sendSuccess(res, []);
    }

    const studentIds = students.map((s: any) => String(s._id));

    // Get existing marks for this subject and semester
    const marks = await InternalMark.find({
      student: { $in: studentIds },
      subjectCode,
      semesterNumber,
    }).lean();

    const marksByStudent = new Map<string, any>();
    for (const m of marks as any[]) {
      marksByStudent.set(String(m.student), m);
    }

    const result = students.map((s: any) => {
      const mark = marksByStudent.get(String(s._id));
      return {
        id: String(s._id),
        registerNumber: s.registerNumber,
        fullName: s.fullName,
        batch: s.batch?.name || '',
        year: s.year,
        section: s.section,
        ia1: mark?.ia1 ?? null,
        ia2: mark?.ia2 ?? null,
        endSem: mark?.endSem ?? null,
        markId: mark?._id ? String(mark._id) : null,
      };
    });

    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('getStudentsByClassSubject error:', err);
    return sendError(res, 'Failed to fetch students.', 500);
  }
}

/**
 * GET /marks/class-subject
 * Get marks for a class and subject with max marks info.
 */
export async function getMarksForClassSubject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = Number(req.query.year);
    const section = String(req.query.section || '').trim().toUpperCase();
    const subjectCode = String(req.query.subjectCode || '').trim().toUpperCase();
    const semesterNumber = Number(req.query.semesterNumber);

    if (!academicYear || !year || !section || !subjectCode || !semesterNumber) {
      return sendError(res, 'academicYear, year, section, subjectCode, and semesterNumber are required.', 400);
    }

    const students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      return s.year === year && s.section === section && batchName.includes(academicYear);
    });

    if (students.length === 0) {
      return sendSuccess(res, { students: [], subject: null, maxMarks: { ia1: 50, ia2: 50, endSem: 100 } });
    }

    const studentIds = students.map((s: any) => String(s._id));

    const marks = await InternalMark.find({
      student: { $in: studentIds },
      subjectCode,
      semesterNumber,
    }).lean();

    const marksByStudent = new Map<string, any>();
    for (const m of marks as any[]) {
      marksByStudent.set(String(m.student), m);
    }

    // Get subject name from first mark record
    const subjectName = marks.length > 0 ? (marks[0] as any).subjectName : '';

    const result = students.map((s: any) => {
      const mark = marksByStudent.get(String(s._id));
      return {
        id: String(s._id),
        registerNumber: s.registerNumber,
        fullName: s.fullName,
        batch: s.batch?.name || '',
        year: s.year,
        section: s.section,
        ia1: mark?.ia1 ?? null,
        ia2: mark?.ia2 ?? null,
        endSem: mark?.endSem ?? null,
        markId: mark?._id ? String(mark._id) : null,
      };
    });

    return sendSuccess(res, {
      students: result,
      subject: { subjectCode, subjectName, semesterNumber },
      maxMarks: { ia1: MARK_TYPE_MAX.IA1, ia2: MARK_TYPE_MAX.IA2, endSem: MARK_TYPE_MAX.END_SEM },
    });
  } catch (err: any) {
    console.error('getMarksForClassSubject error:', err);
    return sendError(res, 'Failed to fetch marks.', 500);
  }
}

/**
 * POST /marks/class-subject/save
 * Save marks for multiple students in a class and subject.
 * Validates marks against max values and prevents silent overwrites.
 */
export async function saveMarksForClassSubject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const body = req.body ?? {};
    const academicYear = String(body.academicYear || '').trim();
    const year = Number(body.year);
    const section = String(body.section || '').trim().toUpperCase();
    const subjectCode = String(body.subjectCode || '').trim().toUpperCase();
    const subjectName = String(body.subjectName || '').trim();
    const semesterNumber = Number(body.semesterNumber);
    const marksData = body.marks || [];

    if (!academicYear || !year || !section || !subjectCode || !subjectName || !semesterNumber || !Array.isArray(marksData)) {
      return sendError(res, 'All fields are required: academicYear, year, section, subjectCode, subjectName, semesterNumber, marks[].', 400);
    }

    // Verify students belong to this department and match the academic context
    const students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      return s.year === year && s.section === section && batchName.includes(academicYear);
    });

    if (students.length === 0) {
      return sendError(res, 'No students found for the selected class.', 404);
    }

    const studentIds = new Set(students.map((s: any) => String(s._id)));

    const errors: string[] = [];
    const results: Array<{ registerNumber: string; studentId: string; saved: boolean; error?: string }> = [];

    for (const markData of marksData) {
      const { studentId, registerNumber, ia1, ia2, endSem } = markData || {};

      if (!studentId || !registerNumber) {
        errors.push(`Missing studentId or registerNumber in row.`);
        continue;
      }

      if (!studentIds.has(String(studentId))) {
        errors.push(`Student ${registerNumber} does not belong to this department/class.`);
        results.push({ registerNumber, studentId, saved: false, error: 'Not in this department/class' });
        continue;
      }

      // Validate marks
      const rowErrors: string[] = [];
      const set: Record<string, any> = {
        student: toLocalId(studentId),
        registerNumber,
        semesterNumber,
        subjectCode,
        subjectName,
        updatedBy: req.user!.id,
        updatedByName: req.user!.fullName,
      };

      if (ia1 !== undefined && ia1 !== null && ia1 !== '') {
        const parsed = parseStrictNumber(ia1, { field: 'IA1', min: 0, max: MARK_TYPE_MAX.IA1 });
        if (!parsed.ok) rowErrors.push(parsed.error!);
        else set.ia1 = parsed.value;
      }
      if (ia2 !== undefined && ia2 !== null && ia2 !== '') {
        const parsed = parseStrictNumber(ia2, { field: 'IA2', min: 0, max: MARK_TYPE_MAX.IA2 });
        if (!parsed.ok) rowErrors.push(parsed.error!);
        else set.ia2 = parsed.value;
      }
      if (endSem !== undefined && endSem !== null && endSem !== '') {
        const parsed = parseStrictNumber(endSem, { field: 'End Semester', min: 0, max: MARK_TYPE_MAX.END_SEM });
        if (!parsed.ok) rowErrors.push(parsed.error!);
        else set.endSem = parsed.value;
      }

      if (rowErrors.length > 0) {
        errors.push(`${registerNumber}: ${rowErrors.join(', ')}`);
        results.push({ registerNumber, studentId, saved: false, error: rowErrors.join(', ') });
        continue;
      }

      // Check if mark entry is allowed (permission window)
      const { getMarkEntryPermissionState, markTypeRefusal } = await import('../internal-marks/mark-entry-permission.service.js');
      const permission = await getMarkEntryPermissionState();
      
      // Check each mark type being set
      for (const type of Object.keys(set).filter(k => MARK_TYPES.includes(k as InternalMarkType)) as InternalMarkType[]) {
        const refusal = markTypeRefusal(permission, type);
        if (refusal) {
          rowErrors.push(`${MARK_TYPE_LABEL[type]}: ${refusal}`);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(`${registerNumber}: ${rowErrors.join(', ')}`);
        results.push({ registerNumber, studentId, saved: false, error: rowErrors.join(', ') });
        continue;
      }

      // Save the marks
      const row = await InternalMark.findOneAndUpdate(
        { student: toLocalId(studentId), semesterNumber, subjectCode },
        { $set: set },
        { upsert: true, new: true }
      );

      await logAudit({
        userId: req.user!.id,
        action: 'UPDATE_INTERNAL_MARK_HOD',
        entity: 'INTERNAL_MARK',
        entityId: row?._id?.toString() ?? null,
        details: {
          registerNumber,
          semesterNumber,
          subjectCode,
          marks: { ia1: set.ia1, ia2: set.ia2, endSem: set.endSem },
        },
        req,
      } as any);

      results.push({ registerNumber, studentId, saved: true });
    }

    return sendSuccess(res, {
      saved: results.filter(r => r.saved).length,
      failed: results.filter(r => !r.saved).length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    }, errors.length === 0 ? 'All marks saved successfully.' : 'Some marks could not be saved.');
  } catch (err: any) {
    console.error('saveMarksForClassSubject error:', err);
    return sendError(res, 'Failed to save marks.', 500);
  }
}

/**
 * GET /marks/template
 * Download Excel template for marks entry.
 */
export async function downloadMarksTemplate(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = Number(req.query.year);
    const section = String(req.query.section || '').trim().toUpperCase();
    const subjectCode = String(req.query.subjectCode || '').trim().toUpperCase();
    const subjectName = String(req.query.subjectName || '').trim();
    const semesterNumber = Number(req.query.semesterNumber);

    if (!academicYear || !year || !section || !subjectCode || !subjectName || !semesterNumber) {
      return sendError(res, 'All query parameters are required.', 400);
    }

    const students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      return s.year === year && s.section === section && batchName.includes(academicYear);
    });

    if (students.length === 0) {
      return sendError(res, 'No students found for the selected class.', 404);
    }

    // Generate Excel file
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Marks Entry');

    // Add metadata rows
    worksheet.addRow(['KSRCE - Marks Entry Template']);
    worksheet.addRow(['Academic Year', academicYear]);
    worksheet.addRow(['Year', year]);
    worksheet.addRow(['Section', section]);
    worksheet.addRow(['Subject Code', subjectCode]);
    worksheet.addRow(['Subject Name', subjectName]);
    worksheet.addRow(['Semester', semesterNumber]);
    worksheet.addRow(['Max Marks', 'IA1: 50', 'IA2: 50', 'End Sem: 100']);
    worksheet.addRow([]);

    // Header row
    const headerRow = worksheet.addRow([
      'Register Number',
      'Student Name',
      'Subject Code',
      'Subject Name',
      'Semester',
      'IA1 (Max 50)',
      'IA2 (Max 50)',
      'End Sem (Max 100)',
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0B2545' } };
      cell.font = { ...cell.font, color: { argb: 'FFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Data rows
    for (const s of students) {
      worksheet.addRow([
        s.registerNumber,
        s.fullName,
        subjectCode,
        subjectName,
        semesterNumber,
        '', // IA1
        '', // IA2
        '', // End Sem
      ]);
    }

    // Style data rows
    worksheet.columns = [
      { key: 'reg', width: 20 },
      { key: 'name', width: 30 },
      { key: 'subCode', width: 15 },
      { key: 'subName', width: 30 },
      { key: 'sem', width: 10 },
      { key: 'ia1', width: 15 },
      { key: 'ia2', width: 15 },
      { key: 'endSem', width: 18 },
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Marks_Template_${academicYear}_Y${year}_${section}_${subjectCode}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('downloadMarksTemplate error:', err);
    return sendError(res, 'Failed to generate template.', 500);
  }
}

/**
 * GET /marks/report
 * Get marks report with filters for academic year, class, section, subject, student.
 */
export async function getMarksReport(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = req.query.year ? Number(req.query.year) : undefined;
    const section = String(req.query.section || '').trim().toUpperCase() || undefined;
    const subjectCode = String(req.query.subjectCode || '').trim().toUpperCase() || undefined;
    const studentId = String(req.query.studentId || '').trim() || undefined;
    const semesterNumber = req.query.semesterNumber ? Number(req.query.semesterNumber) : undefined;

    if (!academicYear) {
      return sendError(res, 'academicYear is required.', 400);
    }

    // Build student filter
    let students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      const matchYear = !year || s.year === year;
      const matchSection = !section || s.section === section;
      const matchBatch = batchName.includes(academicYear);
      return matchYear && matchSection && matchBatch;
    });

    if (students.length === 0) {
      return sendSuccess(res, { marks: [], total: 0 });
    }

    let studentIds = students.map((s: any) => String(s._id));

    if (studentId) {
      if (!studentIds.includes(studentId)) {
        return sendError(res, 'Student not found in your department.', 404);
      }
      studentIds = [studentId];
    }

    // Build marks filter
    const markFilter: Record<string, any> = { student: { $in: studentIds } };
    if (subjectCode) markFilter.subjectCode = subjectCode;
    if (semesterNumber) markFilter.semesterNumber = semesterNumber;

    const marks = await InternalMark.find(markFilter).sort({ semesterNumber: 1, subjectCode: 1 }).lean();

    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));

    const result = (marks as any[]).map((m) => {
      const student = studentMap.get(String(m.student));
      return {
        id: String(m._id),
        registerNumber: m.registerNumber,
        studentName: student?.fullName || '',
        batch: student?.batch?.name || '',
        year: student?.year,
        section: student?.section,
        semesterNumber: m.semesterNumber,
        subjectCode: m.subjectCode,
        subjectName: m.subjectName,
        ia1: m.ia1 ?? null,
        ia2: m.ia2 ?? null,
        endSem: m.endSem ?? null,
        updatedByName: m.updatedByName || '',
        updatedAt: m.updatedAt,
      };
    });

    return sendSuccess(res, { marks: result, total: result.length });
  } catch (err: any) {
    console.error('getMarksReport error:', err);
    return sendError(res, 'Failed to fetch marks report.', 500);
  }
}

// ---------------------------------------------------------------------------
// Multer configuration for marks Excel uploads
// ---------------------------------------------------------------------------

const marksUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB cap
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const isXlsxExt = /\.xlsx$/i.test(file.originalname);
    const validMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
      'application/zip',
    ];
    if (isXlsxExt || validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx) files are supported. CSV and other formats are not accepted.'));
    }
  },
});

export const marksUploadMiddleware = (req: any, res: Response, next: any) => {
  marksUpload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return sendError(res, 'File exceeds the maximum 10 MB upload ceiling.', 400);
        }
        return sendError(res, `Upload error: ${err.message}`, 400);
      }
      return sendError(res, err.message || 'Invalid file uploaded.', 400);
    }
    next();
  });
};

// ---------------------------------------------------------------------------
// Marks Bulk Upload Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /marks/template
 * Download Excel template for marks entry.
 * Enhanced version with full context.
 */
export async function downloadMarksTemplateEnhanced(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = Number(req.query.year);
    const section = String(req.query.section || '').trim().toUpperCase();
    const subjectCode = String(req.query.subjectCode || '').trim().toUpperCase();
    const subjectName = String(req.query.subjectName || '').trim();
    const semesterNumber = Number(req.query.semesterNumber);
    const assessmentType = String(req.query.assessmentType || 'IA1').toUpperCase() as 'IA1' | 'IA2' | 'END_SEM';

    if (!academicYear || !year || !section || !subjectCode || !subjectName || !semesterNumber) {
      return sendError(res, 'All query parameters are required.', 400);
    }

    if (!MARK_TYPES.includes(assessmentType)) {
      return sendError(res, 'Invalid assessment type. Must be IA1, IA2, or END_SEM.', 400);
    }

    const students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      return s.year === year && s.section === section && batchName.includes(academicYear);
    });

    if (students.length === 0) {
      return sendError(res, 'No students found for the selected class.', 404);
    }

    const buffer = await generateMarksTemplate({
      academicYear,
      year,
      section,
      subjectCode,
      subjectName,
      semesterNumber,
      assessmentType,
      departmentId: scope.departmentId,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Marks_Template_${academicYear}_Y${year}_${section}_${subjectCode}_${assessmentType}.xlsx"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('downloadMarksTemplateEnhanced error:', err);
    return sendError(res, 'Failed to generate template.', 500);
  }
}

/**
 * POST /marks/upload/validate
 * Validate Excel file for marks upload.
 */
export async function validateMarksUpload(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    if (!req.file || !req.file.buffer) {
      return sendError(res, 'Please select an Excel (.xlsx) file to upload.', 400);
    }
    if (!/\.xlsx$/i.test(req.file.originalname)) {
      return sendError(res, 'Only .xlsx files are supported. CSV and other formats are not accepted.', 400);
    }

    const academicYear = String(req.body.academicYear || '').trim();
    const year = Number(req.body.year);
    const section = String(req.body.section || '').trim().toUpperCase();
    const subjectCode = String(req.body.subjectCode || '').trim().toUpperCase();
    const subjectName = String(req.body.subjectName || '').trim();
    const semesterNumber = Number(req.body.semesterNumber);

    if (!academicYear || !year || !section || !subjectCode || !subjectName || !semesterNumber) {
      return sendError(res, 'All context parameters are required: academicYear, year, section, subjectCode, subjectName, semesterNumber.', 400);
    }

    const result = await validateMarksExcel(req.file.buffer, {
      academicYear,
      year,
      section,
      subjectCode,
      subjectName,
      semesterNumber,
      hodDepartmentId: scope.departmentId,
    });

    return sendSuccess(res, result, 'Marks Excel file validated successfully.');
  } catch (err: any) {
    console.error('validateMarksUpload error:', err);
    return sendError(res, err.message || 'Failed to parse marks Excel file.', 400);
  }
}

/**
 * POST /marks/upload/import
 * Import validated marks from Excel.
 */
export async function importMarksUpload(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    let rowsToImport = req.body.rows;

    // If a file was uploaded directly instead of pre-validated rows
    if ((!rowsToImport || !Array.isArray(rowsToImport)) && req.file?.buffer) {
      const academicYear = String(req.body.academicYear || '').trim();
      const year = Number(req.body.year);
      const section = String(req.body.section || '').trim().toUpperCase();
      const subjectCode = String(req.body.subjectCode || '').trim().toUpperCase();
      const subjectName = String(req.body.subjectName || '').trim();
      const semesterNumber = Number(req.body.semesterNumber);

      if (!academicYear || !year || !section || !subjectCode || !subjectName || !semesterNumber) {
        return sendError(res, 'Context parameters required for direct file import.', 400);
      }

      const validation = await validateMarksExcel(req.file.buffer, {
        academicYear,
        year,
        section,
        subjectCode,
        subjectName,
        semesterNumber,
        hodDepartmentId: scope.departmentId,
      });
      rowsToImport = validation.rows;
    }

    if (!rowsToImport || !Array.isArray(rowsToImport) || rowsToImport.length === 0) {
      return sendError(res, 'No marks rows provided for import.', 400);
    }

    const result = await executeMarksImport(
      rowsToImport,
      req.user!.id,
      scope.departmentId,
      req,
      String(req.body.academicYear || '').trim() || undefined
    );
    return sendSuccess(res, result, 'Marks bulk import executed successfully.');
  } catch (err: any) {
    console.error('importMarksUpload error:', err);
    return sendError(res, err.message || 'Failed to execute marks bulk import.', 500);
  }
}

/**
 * GET /marks/export
 * Export marks report as Excel.
 */
export async function exportMarksReport(req: AuthRequest, res: Response): Promise<any> {
  try {
    const scope = await loadScope(req, res);
    if (!scope) return;

    const academicYear = String(req.query.academicYear || '').trim();
    const year = req.query.year ? Number(req.query.year) : undefined;
    const section = String(req.query.section || '').trim().toUpperCase() || undefined;
    const subjectCode = String(req.query.subjectCode || '').trim().toUpperCase() || undefined;
    const semesterNumber = req.query.semesterNumber ? Number(req.query.semesterNumber) : undefined;

    if (!academicYear) {
      return sendError(res, 'academicYear is required.', 400);
    }

    // Build student filter
    let students = scope.students.filter((s: any) => {
      const batchName = s.batch?.name || '';
      const matchYear = !year || s.year === year;
      const matchSection = !section || s.section === section;
      const matchBatch = batchName.includes(academicYear);
      return matchYear && matchSection && matchBatch;
    });

    if (students.length === 0) {
      // Return empty workbook
      const buffer = await exportMarksExcel([], { academicYear, year, section, subjectCode, semesterNumber });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Marks_Export_${academicYear}_${new Date().toISOString().slice(0,10)}.xlsx"`);
      return res.send(buffer);
    }

    let studentIds = students.map((s: any) => String(s._id));

    // Build marks filter
    const markFilter: Record<string, any> = { student: { $in: studentIds } };
    if (subjectCode) markFilter.subjectCode = subjectCode;
    if (semesterNumber) markFilter.semesterNumber = semesterNumber;

    const marks = await InternalMark.find(markFilter).sort({ semesterNumber: 1, subjectCode: 1 }).lean();

    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));

    const result = (marks as any[]).map((m) => {
      const student = studentMap.get(String(m.student));
      return {
        registerNumber: m.registerNumber,
        studentName: student?.fullName || '',
        department: scope.department?.name || '',
        year: student?.year,
        section: student?.section || '',
        batch: student?.batch?.name || '',
        semesterNumber: m.semesterNumber,
        subjectCode: m.subjectCode,
        subjectName: m.subjectName,
        ia1: m.ia1 ?? null,
        ia2: m.ia2 ?? null,
        endSem: m.endSem ?? null,
        updatedByName: m.updatedByName || '',
        updatedAt: m.updatedAt,
      };
    });

    const buffer = await exportMarksExcel(result, { academicYear, year, section, subjectCode, semesterNumber });
    
    const filenameParts = ['Marks_Export', academicYear];
    if (year) filenameParts.push(`Y${year}`);
    if (section) filenameParts.push(section);
    if (subjectCode) filenameParts.push(subjectCode);
    if (semesterNumber) filenameParts.push(`Sem${semesterNumber}`);
    filenameParts.push(new Date().toISOString().slice(0,10));
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameParts.join('_')}.xlsx"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('exportMarksReport error:', err);
    return sendError(res, 'Failed to export marks.', 500);
  }
}