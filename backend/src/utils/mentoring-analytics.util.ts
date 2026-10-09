/**
 * ============================================================================
 * SHARED MENTORING ANALYTICS — PURE ARITHMETIC
 * ============================================================================
 *
 * These helpers are the SINGLE implementation of the mentoring-coverage maths.
 * They were extracted verbatim from the verified, department-scoped HOD module
 * (`modules/hod/hod.controller.ts`) so that the Admin college-wide dashboard can
 * report the exact same definitions without a second, divergent copy of the
 * rules. The HOD module now imports from here, so the two dashboards cannot
 * drift apart.
 *
 * Deliberately PURE: no model imports, no request/response objects, no I/O.
 * Callers load their own (already scoped) rows and pass them in. That is what
 * lets the Admin module aggregate college-wide while the HOD module stays
 * hard-scoped to one department — the filtering is the caller's job, the
 * arithmetic is shared.
 *
 * Definitions (unchanged from the HOD module):
 *  - "mentored" = the student has at least ONE stored counselling record or
 *    Saturday meeting dated inside the reporting month. A student mentored
 *    several times still counts ONCE (identity is a Set, not a counter).
 *  - "pending"  = every student in scope minus the mentored set. It is derived,
 *    never stored, so it can never disagree with the mentored figure.
 *  - coverage % = round(mentored / totalStudents * 100), 0 when there are no
 *    students (never NaN, never a placeholder).
 *  - a "mentor" is a faculty member holding at least one ACTIVE
 *    MentorAssignment. Every other faculty member is counted under "faculty".
 *  - "sessions" = stored CounsellingRecord + Meeting rows that carry a date,
 *    counted across all time unless a range is supplied.
 *
 * NO location / GPS data is read, derived or emitted here.
 */

export interface NormalisedSession {
  id: string;
  studentId: string;
  mentorId: string;
  /** YYYY-MM-DD */
  date: string;
  source: 'COUNSELLING' | 'MEETING';
}

export interface DepartmentSummary {
  totalStudents: number;
  totalFaculty: number;
  /** Distinct faculty members holding at least one ACTIVE assignment. */
  totalMentors: number;
  /** Distinct students covered by at least one ACTIVE MentorAssignment. */
  assignedMentees: number;
  /** Distinct students with >= 1 session in the reporting month. */
  mentoredThisMonth: number;
  studentsNotMentoredThisMonth: number;
  overallMentoringCoverage: number;
  /** All-time dated counselling + meeting rows in scope. */
  totalMentoringSessions: number;
  /** YYYY-MM-DD of the most recent dated session, or null. */
  lastMentoringActivity: string | null;
}

export interface MentorCoverageRow {
  mentorId: string;
  mentorName: string;
  employeeId: string;
  designation: string;
  department: string;
  isActive: boolean;
  totalMentees: number;
  mentoredThisMonth: number;
  pending: number;
  coveragePercent: number;
  sessionCount: number;
  lastMentoringDate: string | null;
}

export interface WeeklyProgressBucket {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  sessions: number;
  studentsMentored: number;
  menteesEligible: number;
  coveragePercent: number;
}

/** Coerce a populated or unpopulated reference into its id string. */
export function idOf(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return value._id ? String(value._id) : '';
  return String(value);
}

/** Normalise any stored date-ish value to `YYYY-MM-DD`, or '' when unusable. */
export function toDay(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export function isSameMonth(day: string, ref: Date): boolean {
  if (!day) return false;
  return monthKey(day) === `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Integer percentage that cannot produce NaN or Infinity. */
export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/** Distinct students in `sessions` that fall inside `ref`'s calendar month. */
export function mentoredStudentIdsThisMonth(sessions: NormalisedSession[], ref: Date): Set<string> {
  const out = new Set<string>();
  for (const s of sessions) {
    if (!s.studentId || !s.date) continue;
    if (isSameMonth(s.date, ref)) out.add(s.studentId);
  }
  return out;
}

/**
 * College-wide or department-wide headline figures.
 *
 * `assignments` must already be filtered to the scope being reported on
 * (HOD: `department: <hodDept>, status: 'ACTIVE'`; Admin: every ACTIVE row).
 */
export function summarise(input: {
  totalStudents: number;
  totalFaculty: number;
  assignments: any[];
  sessions: NormalisedSession[];
}, now: Date): DepartmentSummary {
  const { totalStudents, totalFaculty, assignments, sessions } = input;

  const assignedMentorIds = new Set(assignments.map((a: any) => idOf(a.mentor)).filter(Boolean));
  // Distinct students holding at least one ACTIVE assignment — the true
  // denominator for "students who have a mentor at all".
  const assignedStudentIds = new Set(assignments.map((a: any) => idOf(a.student)).filter(Boolean));

  let totalSessions = 0;
  let lastActivity: string | null = null;
  for (const s of sessions) {
    if (!s.date) continue;
    totalSessions += 1;
    if (lastActivity === null || s.date > lastActivity) lastActivity = s.date;
  }

  // A student counts ONCE no matter how many sessions they have.
  const mentoredThisMonth = mentoredStudentIdsThisMonth(sessions, now).size;

  return {
    totalStudents,
    totalFaculty,
    totalMentors: assignedMentorIds.size,
    assignedMentees: assignedStudentIds.size,
    mentoredThisMonth,
    studentsNotMentoredThisMonth: Math.max(0, totalStudents - mentoredThisMonth),
    overallMentoringCoverage: pct(mentoredThisMonth, totalStudents),
    totalMentoringSessions: totalSessions,
    lastMentoringActivity: lastActivity,
  };
}

/**
 * Per-mentor rollup for the supplied faculty list.
 *
 * A mentor with no mentees is still returned (with zeroes) so a department can
 * show every faculty member, but callers that only want mentors carrying
 * mentees filter on `totalMentees > 0`.
 */
export function mentorWiseRows(input: {
  faculty: any[];
  assignments: any[];
  sessions: NormalisedSession[];
  departmentName: string;
}, now: Date): MentorCoverageRow[] {
  const { faculty, assignments, sessions, departmentName } = input;

  const assignmentByStudent = new Map<string, any>();
  for (const a of assignments) assignmentByStudent.set(idOf(a.student), a);

  const rows = faculty.map((f: any) => {
    const mentorId = String(f._id);
    const mentorStudentIds = new Set<string>();
    for (const [studentId, asg] of assignmentByStudent.entries()) {
      if (idOf(asg.mentor) === mentorId) mentorStudentIds.add(studentId);
    }

    let sessionCount = 0;
    let lastMentoringDate: string | null = null;
    let mentoredThisMonth = 0;

    for (const s of sessions) {
      if (!mentorStudentIds.has(s.studentId) || !s.date) continue;
      sessionCount += 1;
      if (lastMentoringDate === null || s.date > lastMentoringDate) lastMentoringDate = s.date;
      if (isSameMonth(s.date, now)) mentoredThisMonth += 1;
    }

    const mentoredStudentCount = new Set(
      sessions
        .filter((s) => mentorStudentIds.has(s.studentId) && isSameMonth(s.date, now))
        .map((s) => s.studentId)
    ).size;

    const user: any = f.user || {};

    return {
      mentorId,
      mentorName: user.fullName || '',
      employeeId: f.employeeId || '',
      designation: f.designation || '',
      department: departmentName,
      isActive: Boolean(f.isActive),
      totalMentees: mentorStudentIds.size,
      mentoredThisMonth: mentoredStudentCount,
      pending: Math.max(0, mentorStudentIds.size - mentoredStudentCount),
      coveragePercent: pct(mentoredStudentCount, mentorStudentIds.size),
      sessionCount,
      lastMentoringDate,
    };
  });

  rows.sort(
    (a, b) => b.totalMentees - a.totalMentees || String(a.mentorName).localeCompare(String(b.mentorName))
  );
  return rows;
}

/**
 * Weekly buckets over the trailing `weeks` calendar weeks, oldest first.
 * Buckets are anchored on Monday so a bar is a calendar week, not a rolling 7.
 */
export function weeklyBuckets(input: {
  sessions: NormalisedSession[];
  totalStudents: number;
}, weeks: number, endRef: Date = new Date()): WeeklyProgressBucket[] {
  const { sessions, totalStudents } = input;
  const out: WeeklyProgressBucket[] = [];

  const end = new Date(Date.UTC(endRef.getUTCFullYear(), endRef.getUTCMonth(), endRef.getUTCDate()));
  const endDow = (end.getUTCDay() + 6) % 7;
  const thisWeekStart = new Date(end.getTime() - endDow * 86400000);

  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart.getTime() - i * 7 * 86400000);
    const stop = new Date(start.getTime() + 7 * 86400000);
    const startDay = start.toISOString().slice(0, 10);
    const stopDay = stop.toISOString().slice(0, 10);
    const endDay = new Date(stop.getTime() - 86400000).toISOString().slice(0, 10);

    const inBucket = sessions.filter((s) => s.date && s.date >= startDay && s.date < stopDay);
    const studentsMentored = new Set(inBucket.map((s) => s.studentId)).size;

    out.push({
      weekStart: startDay,
      weekEnd: endDay,
      weekLabel: `${startDay} to ${endDay}`,
      sessions: inBucket.length,
      studentsMentored,
      menteesEligible: totalStudents,
      coveragePercent: pct(studentsMentored, totalStudents),
    });
  }

  return out;
}

/** Clamp an untrusted `weeks` query value into a served range. */
export function clampWeeks(raw: any, fallback = 8, max = 26): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > max) return fallback;
  return Math.floor(n);
}

/**
 * Parse an optional `month=YYYY-MM` query value into the Date that anchors
 * "this month" arithmetic. Anything unusable (missing, malformed, out of
 * range) falls back to `fallback` — normally `new Date()` — so a bad filter
 * can never widen a scope or produce NaN dates.
 */
export function parseMonthRef(raw: any, fallback: Date = new Date()): Date {
  if (typeof raw === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.trim())) {
    const [y, m] = raw.trim().split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }
  return fallback;
}

export interface MentorReportRow {
  mentorId: string;
  mentorName: string;
  employeeId: string;
  designation: string;
  totalMentees: number;
  coveredStudents: number;
  pendingStudents: number;
  coveragePercent: number;
  totalSessions: number;
  lastMentoringDate: string | null;
  /** My mentees with zero sessions inside the window (sorted by register no). */
  notCovered: { id: string; registerNumber: string; fullName: string }[];
}

/**
 * Per-mentor rows for the rolling window report (default: last 30 days).
 *
 * Same distinct-student rule as `mentorWiseRows`/`summarise`, but bounded to
 * `[fromDay, toDay]` instead of a calendar month. A student of mine covered by
 * ANY stored session in the window counts once; `notCovered` lists my mentees
 * with no session in the window at all.
 */
export function mentorReportRows(input: {
  faculty: any[];
  assignments: any[];
  sessions: NormalisedSession[];
  students: any[];
}, fromDay: string, toDay: string): MentorReportRow[] {
  const { faculty, assignments, sessions, students } = input;

  const assignmentByStudent = new Map<string, any>();
  for (const a of assignments) assignmentByStudent.set(idOf(a.student), a);

  const studentById = new Map<string, any>();
  for (const s of students) studentById.set(String(s._id), s);

  const rows = faculty.map((f: any) => {
    const mentorId = String(f._id);
    const mentorStudentIds = new Set<string>();
    for (const [studentId, asg] of assignmentByStudent.entries()) {
      if (idOf(asg.mentor) === mentorId) mentorStudentIds.add(studentId);
    }

    const covered = new Set<string>();
    let totalSessions = 0;
    let lastMentoringDate: string | null = null;

    for (const s of sessions) {
      if (!s.date || !mentorStudentIds.has(s.studentId)) continue;
      if (s.date < fromDay || s.date > toDay) continue;
      totalSessions += 1;
      covered.add(s.studentId);
      if (lastMentoringDate === null || s.date > lastMentoringDate) lastMentoringDate = s.date;
    }

    const notCovered = Array.from(mentorStudentIds)
      .filter((id) => !covered.has(id))
      .map((id) => {
        const st: any = studentById.get(id) || {};
        return { id, registerNumber: st.registerNumber || '', fullName: st.fullName || '' };
      })
      .sort((a, b) => a.registerNumber.localeCompare(b.registerNumber));

    const user: any = f.user || {};

    return {
      mentorId,
      mentorName: user.fullName || '',
      employeeId: f.employeeId || '',
      designation: f.designation || '',
      totalMentees: mentorStudentIds.size,
      coveredStudents: covered.size,
      pendingStudents: Math.max(0, mentorStudentIds.size - covered.size),
      coveragePercent: pct(covered.size, mentorStudentIds.size),
      totalSessions,
      lastMentoringDate,
      notCovered,
    };
  });

  rows.sort(
    (a, b) => b.totalMentees - a.totalMentees || String(a.mentorName).localeCompare(String(b.mentorName))
  );
  return rows;
}