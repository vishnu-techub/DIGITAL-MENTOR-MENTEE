import { Response } from 'express';
import {
  User,
  Student,
  Faculty,
  Department,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  clampWeeks,
  idOf,
  isSameMonth,
  mentorWiseRows,
  pct,
  summarise as summariseMetrics,
  toDay,
  weeklyBuckets as buildWeeklyBuckets,
  type MentorCoverageRow,
  type NormalisedSession,
} from '../../utils/mentoring-analytics.util.js';

/**
 * ============================================================================
 * ADMIN â€” COLLEGE-WIDE MENTORING DASHBOARD
 * ============================================================================
 *
 * Scope: ADMIN only, institution-wide. This is the ONE place in the codebase
 * that is allowed to read across every department; the HOD module remains
 * hard-scoped to its own department and shares no data path with this file.
 *
 * Every figure below is derived from stored rows (Department, Faculty, Student,
 * MentorAssignment, CounsellingRecord, Meeting). Nothing is hardcoded, and no
 * figure is invented to look plausible: a department with no students reports
 * `0 / 0%`, never a placeholder.
 *
 * The arithmetic is imported from `utils/mentoring-analytics.util.ts` â€” the
 * SAME module the HOD dashboard uses â€” so "mentored", "pending" and "coverage
 * %" mean exactly the same thing in both portals and cannot drift.
 *
 * Definitions shipped to the client so the UI never re-derives them:
 *  - mentored  = student has >= 1 dated counselling record or Saturday meeting
 *                inside the reporting month. A Set, so a student mentored five
 *                times counts ONCE.
 *  - pending   = students in scope minus the mentored set (derived, not stored).
 *  - mentors   = distinct faculty holding >= 1 ACTIVE MentorAssignment.
 *  - coverage% = round(mentored / students * 100), 0 when there are no students.
 *
 * NO location / GPS data is read or emitted by this module.
 */

const MONTH_LABEL = (ref: Date) =>
  `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}`;

const parseMonth = (m: any): Date => {
  if (typeof m !== 'string') return new Date();
  const match = m.trim().match(/^(\\d{4})-(\\d{2})$/);
  if (!match) return new Date();
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return new Date();
  const d = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  return d;
};
/**
 * Defence in depth for every handler.
 *
 * The router already applies `authorize(ROLES.ADMIN)`; this re-check guarantees
 * a handler cannot be reached by HOD / FACULTY / STUDENT even if it is ever
 * re-mounted elsewhere. Authorisation is never a frontend concern.
 */
function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user || req.user.role !== ROLES.ADMIN) {
    sendError(res, 'You are not authorized to perform this operation.', 403);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// College-wide data set
// ---------------------------------------------------------------------------

interface DepartmentSlice {
  department: any;
  departmentId: string;
  faculty: any[];
  students: any[];
  assignments: any[];
  sessions: NormalisedSession[];
}

interface CollegeScope {
  departments: any[];
  departmentById: Map<string, any>;
  faculty: any[];
  students: any[];
  assignments: any[];
  sessions: NormalisedSession[];
  hodUsers: any[];
  studentById: Map<string, any>;
  facultyById: Map<string, any>;
  /** Department id -> its own slice of the college data. */
  sliceByDepartment: Map<string, DepartmentSlice>;
  /** Students whose `department` is missing or points at a deleted department. */
  studentsWithoutDepartment: number;
}

function newSlice(department: any, departmentId: string): DepartmentSlice {
  return { department, departmentId, faculty: [], students: [], assignments: [], sessions: [] };
}

async function loadCollege(): Promise<CollegeScope> {
  const [departments, faculty, students, assignments, hodUsers] = await Promise.all([
    Department.find().sort({ code: 1 }).lean(),
    Faculty.find().populate('user').lean(),
    Student.find().populate('batch').lean(),
    MentorAssignment.find({ status: 'ACTIVE' }).lean(),
    User.find({ role: ROLES.HOD }).sort({ fullName: 1 }).lean(),
  ]);

  const departmentById = new Map<string, any>();
  const sliceByDepartment = new Map<string, DepartmentSlice>();
  for (const d of departments as any[]) {
    const deptId = String(d._id);
    departmentById.set(deptId, d);
    sliceByDepartment.set(deptId, newSlice(d, deptId));
  }

  const studentById = new Map<string, any>();
  const facultyById = new Map<string, any>();
  let studentsWithoutDepartment = 0;

  for (const f of faculty as any[]) facultyById.set(String(f._id), f);

  for (const s of students as any[]) {
    const sid = String(s._id);
    studentById.set(sid, s);
    const deptId = idOf(s.department);
    const slice = sliceByDepartment.get(deptId);
    if (slice) slice.students.push(s);
    else studentsWithoutDepartment += 1;
  }

  for (const f of faculty as any[]) {
    const slice = sliceByDepartment.get(idOf(f.department));
    if (slice) slice.faculty.push(f);
  }

  for (const a of assignments as any[]) {
    const slice = sliceByDepartment.get(idOf(a.department));
    if (slice) slice.assignments.push(a);
  }

  // Mentoring activity = counselling records + Saturday meetings. Both are real
  // stored rows; a date is never invented. A row whose student no longer exists
  // is dropped, exactly as the department-scoped HOD loader does, so a deleted
  // student can never inflate a session count.
  const studentIds = [...studentById.keys()];
  const sessions: NormalisedSession[] = [];

  if (studentIds.length > 0) {
    const records = await CounsellingRecord.find({ student: { $in: studentIds } }).lean();
    for (const r of records as any[]) {
      const studentId = idOf(r.student) || idOf(r.studentId);
      if (!studentById.has(studentId)) continue;
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
      if (!studentById.has(studentId)) continue;
      sessions.push({
        id: String(m._id),
        studentId,
        mentorId: idOf(m.mentor),
        date: toDay(m.meetingDate || m.createdAt),
        source: 'MEETING',
      });
    }
  }

  for (const slice of sliceByDepartment.values()) {
    slice.sessions = sessions.filter((s) => {
      const student = studentById.get(s.studentId);
      return !!student && idOf(student.department) === slice.departmentId;
    });
  }

  return {
    departments: departments as any[],
    departmentById,
    faculty: faculty as any[],
    students: students as any[],
    assignments: assignments as any[],
    sessions,
    hodUsers: hodUsers as any[],
    studentById,
    facultyById,
    sliceByDepartment,
    studentsWithoutDepartment,
  };
}

/** Human-readable metric definitions, shipped so the UI never re-derives them. */
const DEFINITIONS = {
  mentored:
    'Student has at least one dated counselling record or Saturday meeting in the reporting month. Counted once per student.',
  pending: 'Students in scope minus the mentored set for the reporting month.',
  mentors: 'Distinct faculty members holding at least one ACTIVE mentor assignment.',
  coverage: 'round(mentored / students * 100). Reported as 0 when a department has no students.',
  sessions: 'Stored counselling records plus Saturday meetings that carry a date.',
} as const;

// ---------------------------------------------------------------------------
// Shared row builders
// ---------------------------------------------------------------------------

/** One row per HOD login, carrying that HOD's own department figures. */
function hodRows(scope: CollegeScope, now: Date) {
  const rows: any[] = [];

  for (const hod of scope.hodUsers) {
    const deptId = idOf(hod.department);
    const department = scope.departmentById.get(deptId) || null;
    const slice = scope.sliceByDepartment.get(deptId) || null;

    const summary = summariseMetrics(
      {
        totalStudents: slice ? slice.students.length : 0,
        totalFaculty: slice ? slice.faculty.length : 0,
        assignments: slice ? slice.assignments : [],
        sessions: slice ? slice.sessions : [],
      },
      now
    );

    rows.push({
      hodId: String(hod._id),
      hodName: hod.fullName || '',
      username: hod.username || '',
      email: hod.email || '',
      isActive: hod.isActive !== false,
      departmentId: department ? deptId : '',
      departmentName: department?.name || 'Unassigned',
      departmentCode: department?.code || '',
      students: summary.totalStudents,
      faculty: summary.totalFaculty,
      mentors: summary.totalMentors,
      mentoredThisMonth: summary.mentoredThisMonth,
      mentoringCoverage: summary.overallMentoringCoverage,
      pendingStudents: summary.studentsNotMentoredThisMonth,
      totalMentoringSessions: summary.totalMentoringSessions,
      lastMentoringActivity: summary.lastMentoringActivity,
      hasDepartment: Boolean(department),
    });
  }

  rows.sort(
    (a, b) =>
      a.departmentName.localeCompare(b.departmentName) || a.hodName.localeCompare(b.hodName)
  );
  return rows;
}

/** One row per department, including departments with no students at all. */
function departmentRows(scope: CollegeScope, now: Date) {
  const hodByDepartment = new Map<string, any[]>();
  for (const hod of scope.hodUsers) {
    const deptId = idOf(hod.department);
    if (!scope.departmentById.has(deptId)) continue;
    if (!hodByDepartment.has(deptId)) hodByDepartment.set(deptId, []);
    hodByDepartment.get(deptId)!.push(hod);
  }

  const rows = scope.departments.map((d) => {
    const deptId = String(d._id);
    const slice = scope.sliceByDepartment.get(deptId)!;
    const summary = summariseMetrics(
      {
        totalStudents: slice.students.length,
        totalFaculty: slice.faculty.length,
        assignments: slice.assignments,
        sessions: slice.sessions,
      },
      now
    );

    const assignedStudentIds = new Set(slice.assignments.map((a: any) => idOf(a.student)));
    const hods = hodByDepartment.get(deptId) || [];

    return {
      departmentId: deptId,
      departmentName: d.name || '',
      departmentCode: d.code || '',
      hodNames: hods.map((h: any) => h.fullName || ''),
      hodCount: hods.length,
      students: summary.totalStudents,
      faculty: summary.totalFaculty,
      mentors: summary.totalMentors,
      mentoredThisMonth: summary.mentoredThisMonth,
      mentoringCoverage: summary.overallMentoringCoverage,
      pendingStudents: summary.studentsNotMentoredThisMonth,
      unassignedStudents: slice.students.filter((s: any) => !assignedStudentIds.has(String(s._id))).length,
      totalMentoringSessions: summary.totalMentoringSessions,
      lastMentoringActivity: summary.lastMentoringActivity,
    };
  });

  rows.sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  return rows;
}

function mentorRowsForSlice(slice: DepartmentSlice, now: Date): MentorCoverageRow[] {
  return mentorWiseRows(
    {
      faculty: slice.faculty,
      assignments: slice.assignments,
      sessions: slice.sessions,
      departmentName: slice.department?.name || '',
    },
    now
  );
}

/** Resolve a :departmentId path param to a real department or answer 404. */
function resolveDepartment(scope: CollegeScope, departmentId: string): any | null {
  const department = scope.departmentById.get(String(departmentId));
  return department || null;
}

// ---------------------------------------------------------------------------
// GET /admin/overview/dashboard
// ---------------------------------------------------------------------------

export async function getAdminMentoringDashboard(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const now = parseMonth((req.query as any)?.month);

    const summary = summariseMetrics(
      {
        totalStudents: scope.students.length,
        totalFaculty: scope.faculty.length,
        assignments: scope.assignments,
        sessions: scope.sessions,
      },
      now
    );

    const departmentWithHod = new Set(
      scope.hodUsers.map((h: any) => idOf(h.department)).filter((id: string) => scope.departmentById.has(id))
    ).size;

    return sendSuccess(res, {
      generatedAt: new Date().toISOString(),
      month: MONTH_LABEL(now),
      summary: {
        totalDepartments: scope.departments.length,
        totalHODs: scope.hodUsers.length,
        totalFaculty: summary.totalFaculty,
        totalMentors: summary.totalMentors,
        totalStudents: summary.totalStudents,
        mentoredThisMonth: summary.mentoredThisMonth,
        pendingStudents: summary.studentsNotMentoredThisMonth,
        overallMentoringCoverage: summary.overallMentoringCoverage,
        totalMentoringSessions: summary.totalMentoringSessions,
        lastMentoringActivity: summary.lastMentoringActivity,
        departmentsWithHod: departmentWithHod,
        departmentsWithoutHod: scope.departments.length - departmentWithHod,
        studentsWithoutDepartment: scope.studentsWithoutDepartment,
      },
      coverage: {
        total: summary.totalStudents,
        mentored: summary.mentoredThisMonth,
        pending: summary.studentsNotMentoredThisMonth,
        percentage: summary.overallMentoringCoverage,
      },
      // College-wide PIE series for the current month. Each student appears at
      // most once because the server de-duplicates by student identity.
      pie: {
        month: MONTH_LABEL(now),
        mentored: summary.mentoredThisMonth,
        pending: summary.studentsNotMentoredThisMonth,
        total: summary.totalStudents,
      },
      weeklyProgress: buildWeeklyBuckets(
        { sessions: scope.sessions, totalStudents: scope.students.length },
        8,
        now
      ),
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminMentoringDashboard error:', err);
    return sendError(res, 'Failed to fetch the college mentoring dashboard.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/overview/hods
// ---------------------------------------------------------------------------

export async function getAdminHodOverview(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const now = parseMonth((req.query as any)?.month);
    return sendSuccess(res, {
      month: MONTH_LABEL(now),
      totalHODs: scope.hodUsers.length,
      hods: hodRows(scope, now),
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminHodOverview error:', err);
    return sendError(res, 'Failed to fetch the HOD overview.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/overview/departments
// ---------------------------------------------------------------------------

export async function getAdminDepartmentOverview(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const now = parseMonth((req.query as any)?.month);
    return sendSuccess(res, {
      month: MONTH_LABEL(now),
      totalDepartments: scope.departments.length,
      departments: departmentRows(scope, now),
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminDepartmentOverview error:', err);
    return sendError(res, 'Failed to fetch the department overview.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/overview/department-comparison
// ---------------------------------------------------------------------------

export async function getAdminDepartmentComparison(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const now = parseMonth((req.query as any)?.month);
    const rows = departmentRows(scope, now)
      .map((r: any) => ({
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        departmentCode: r.departmentCode,
        students: r.students,
        mentored: r.mentoredThisMonth,
        pending: r.pendingStudents,
        coveragePercent: r.mentoringCoverage,
        totalMentoringSessions: r.totalMentoringSessions,
      }))
      .sort(
        (a: any, b: any) =>
          b.coveragePercent - a.coveragePercent || a.departmentName.localeCompare(b.departmentName)
      );

    const highest = rows.length > 0 ? rows[0].coveragePercent : 0;

    return sendSuccess(res, {
      month: MONTH_LABEL(now),
      highestCoveragePercent: highest,
      departments: rows,
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminDepartmentComparison error:', err);
    return sendError(res, 'Failed to fetch the department comparison.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/overview/departments/:departmentId
//
// Drill-down level 2 (Admin -> Department) and level 3 (Department -> HOD ->
// Mentor). Returning the HOD rows AND the mentor rows here lets the client walk
// the whole chain with one request per level.
// ---------------------------------------------------------------------------

export async function getAdminDepartmentDetail(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const departmentId = String(req.params.departmentId || '');
    const department = resolveDepartment(scope, departmentId);
    if (!department) {
      return sendError(res, 'Department not found.', 404);
    }

    const now = new Date();
    const slice = scope.sliceByDepartment.get(String(department._id))!;
    const summary = summariseMetrics(
      {
        totalStudents: slice.students.length,
        totalFaculty: slice.faculty.length,
        assignments: slice.assignments,
        sessions: slice.sessions,
      },
      now
    );

    const allHods = hodRows(scope, now);
    const hods = allHods.filter((h: any) => h.departmentId === String(department._id));

    const assignedStudentIds = new Set(slice.assignments.map((a: any) => idOf(a.student)));

    return sendSuccess(res, {
      department: {
        departmentId: String(department._id),
        departmentName: department.name || '',
        departmentCode: department.code || '',
        createdAt: department.createdAt || null,
      },
      summary: {
        totalStudents: summary.totalStudents,
        totalFaculty: summary.totalFaculty,
        totalMentors: summary.totalMentors,
        mentoredThisMonth: summary.mentoredThisMonth,
        pendingStudents: summary.studentsNotMentoredThisMonth,
        overallMentoringCoverage: summary.overallMentoringCoverage,
        totalMentoringSessions: summary.totalMentoringSessions,
        lastMentoringActivity: summary.lastMentoringActivity,
        unassignedStudents: slice.students.filter((s: any) => !assignedStudentIds.has(String(s._id)))
          .length,
      },
      pie: {
        month: MONTH_LABEL(now),
        mentored: summary.mentoredThisMonth,
        pending: summary.studentsNotMentoredThisMonth,
        total: summary.totalStudents,
      },
      weeklyProgress: buildWeeklyBuckets(
        { sessions: slice.sessions, totalStudents: slice.students.length },
        8,
        now
      ),
      // Drill-down: the HOD(s) of this department, then their mentors.
      hods,
      mentors: mentorRowsForSlice(slice, now),
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminDepartmentDetail error:', err);
    return sendError(res, 'Failed to fetch the department detail.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/overview/departments/:departmentId/mentors
// ---------------------------------------------------------------------------

export async function getAdminDepartmentMentors(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const department = resolveDepartment(scope, String(req.params.departmentId || ''));
    if (!department) return sendError(res, 'Department not found.', 404);

    const now = new Date();
    const slice = scope.sliceByDepartment.get(String(department._id))!;
    const hods = hodRows(scope, now).filter(
      (h: any) => h.departmentId === String(department._id)
    );

    return sendSuccess(res, {
      department: {
        departmentId: String(department._id),
        departmentName: department.name || '',
        departmentCode: department.code || '',
      },
      hod: hods[0] || null,
      hods,
      // Faculty with no mentees are included (all zeroes) so the administration
      // can see who is available; `mentorsWithMentees` is the actionable list.
      mentors: mentorRowsForSlice(slice, now),
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminDepartmentMentors error:', err);
    return sendError(res, 'Failed to fetch department mentors.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/overview/mentors/:mentorId
//
// Drill-down level 4 (Mentor -> Student). Returns the mentor's mentees with
// their real mentoring state so the administration can open any student record.
// ---------------------------------------------------------------------------

export async function getAdminMentorDetail(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const mentorId = String(req.params.mentorId || '');
    const mentor = scope.facultyById.get(mentorId);
    if (!mentor) return sendError(res, 'Faculty mentor not found.', 404);

    const department = scope.departmentById.get(idOf(mentor.department)) || null;
    const slice = department ? scope.sliceByDepartment.get(String(department._id)) : undefined;
    const now = new Date();

    const assignmentByStudent = new Map<string, any>();
    for (const a of scope.assignments) {
      if (idOf(a.mentor) !== mentorId) continue;
      assignmentByStudent.set(idOf(a.student), a);
    }

    const mine = scope.sessions.filter((s) => assignmentByStudent.has(s.studentId));

    const mentees: any[] = [];
    for (const [studentId, asg] of assignmentByStudent.entries()) {
      const student = scope.studentById.get(studentId);
      if (!student) continue;

      const theirs = mine.filter((s) => s.studentId === studentId && s.date);
      const lastMentoringDate = theirs.reduce<string | null>(
        (acc, x) => (acc === null || x.date > acc ? x.date : acc),
        null
      );

      mentees.push({
        id: studentId,
        registerNumber: student.registerNumber || '',
        fullName: student.fullName || '',
        departmentId: idOf(student.department),
        departmentName: department?.name || '',
        batch: student.batch?.name || '',
        year: student.year ?? null,
        section: student.section || '',
        isActive: student.isActive !== false,
        assignmentId: String(asg._id),
        assignedFrom: toDay(asg.assignedFrom) || null,
        mentoredThisMonth: mine.some((s) => s.studentId === studentId && isSameMonth(s.date, now)),
        lastMentoringDate,
        sessionCount: theirs.length,
      });
    }

    mentees.sort((a, b) => a.registerNumber.localeCompare(b.registerNumber));

    const mentoredThisMonthSet = new Set(
      mine.filter((s) => isSameMonth(s.date, now)).map((s) => s.studentId)
    ).size;

    const user: any = mentor.user || {};
    const departmentStudents = slice ? slice.students.length : 0;

    return sendSuccess(res, {
      mentor: {
        mentorId,
        fullName: user.fullName || '',
        email: user.email || '',
        employeeId: mentor.employeeId || '',
        designation: mentor.designation || '',
        cabinLocation: mentor.cabinLocation || '',
        phoneNumber: mentor.phoneNumber || '',
        isActive: mentor.isActive !== false,
        departmentId: department ? String(department._id) : '',
        departmentName: department?.name || '',
      },
      mentees,
      summary: {
        totalMentees: mentees.length,
        mentoredThisMonth: mentoredThisMonthSet,
        pending: Math.max(0, mentees.length - mentoredThisMonthSet),
        coveragePercent: pct(mentoredThisMonthSet, mentees.length),
        sessionCount: mine.filter((s) => !!s.date).length,
        lastMentoringDate: mine
          .filter((s) => !!s.date)
          .reduce<string | null>((acc, s) => (acc === null || s.date > acc ? s.date : acc), null),
        departmentStudents,
        departmentCoveragePercent: pct(mentees.length, departmentStudents),
      },
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminMentorDetail error:', err);
    return sendError(res, 'Failed to fetch the mentor detail.', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /admin/overview/report-30-day
// ---------------------------------------------------------------------------

export async function getAdminReport30Day(req: AuthRequest, res: Response): Promise<any> {
  if (!requireAdmin(req, res)) return;
  try {
    const scope = await loadCollege();
    const weeks = clampWeeks((req.query as any)?.weeks, 5, 12);

    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);
    const fromDay = toDay(from);
    const toDay_ = toDay(to);

    const inRange = scope.sessions.filter(
      (s) => !!s.date && s.date >= fromDay && s.date <= toDay_
    );

    const departments = scope.departments.map((d) => {
      const deptId = String(d._id);
      const slice = scope.sliceByDepartment.get(deptId)!;
      const sliceInRange = slice.sessions.filter(
        (s) => !!s.date && s.date >= fromDay && s.date <= toDay_
      );

      const coveredIds = new Set(sliceInRange.map((s) => s.studentId));
      const coveredStudents = coveredIds.size;
      const totalStudents = slice.students.length;

      const assignedStudentIds = new Set(slice.assignments.map((a: any) => idOf(a.student)));

      return {
        departmentId: deptId,
        departmentName: d.name || '',
        departmentCode: d.code || '',
        totalStudents,
        coveredStudents,
        pendingStudents: Math.max(0, totalStudents - coveredStudents),
        unassignedStudents: slice.students.filter(
          (s: any) => !assignedStudentIds.has(String(s._id))
        ).length,
        mentoringSessions: sliceInRange.length,
        coveragePercent: pct(coveredStudents, totalStudents),
        weekly: buildWeeklyBuckets(
          { sessions: sliceInRange, totalStudents },
          weeks,
          to
        ),
      };
    });

    departments.sort((a, b) => a.departmentName.localeCompare(b.departmentName));

    const coveredCollege = new Set(inRange.map((s) => s.studentId)).size;
    const totalStudents = scope.students.length;

    return sendSuccess(res, {
      from: fromDay,
      to: toDay_,
      weeks,
      totals: {
        totalStudents,
        coveredStudents: coveredCollege,
        pendingStudents: Math.max(0, totalStudents - coveredCollege),
        mentoringSessions: inRange.length,
        coveragePercent: pct(coveredCollege, totalStudents),
        departments: departments.length,
      },
      weekly: buildWeeklyBuckets(
        { sessions: inRange, totalStudents },
        weeks,
        to
      ),
      departments,
      definitions: DEFINITIONS,
    });
  } catch (err: any) {
    console.error('getAdminReport30Day error:', err);
    return sendError(res, 'Failed to fetch the 30-day report.', 500);
  }
}

