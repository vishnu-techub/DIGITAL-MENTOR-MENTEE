/**
 * ============================================================================
 * ROLE-AWARE, SECURE AI CONTEXT BUILDER
 * ============================================================================
 *
 * The ONLY thing that feeds the AI model about application data. It derives
 * the authenticated identity and role from the verified JWT (`req.user`) — never
 * from anything the frontend sends — and then loads ONLY the data that role is
 * already permitted to read, using the same model queries the existing
 * controllers use.
 *
 *   ADMIN     -> college-wide aggregates (no student names)
 *   PRINCIPAL -> college-wide aggregates (read-only role)
 *   HOD       -> own department aggregates (students, mentors, coverage, marks)
 *   FACULTY   -> mentees with an ACTIVE MentorAssignment to this mentor only
 *   STUDENT   -> the student's OWN record only
 *
 * The output is a small, immutable list of "verified fact" strings plus a role
 * briefing. These are injected into the system prompt so the model can ground
 * answers in real data while never seeing passwords, tokens, API keys, or any
 * record outside the caller's permission scope.
 */

import { AuthUser } from '../../middleware/auth.middleware.js';
import {
  Department,
  Faculty,
  Student,
  User,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  InternalMark,
  Batch,
} from '../../models/index.js';
import { ROLES } from '../../config/constants.js';
import {
  idOf,
  summarise as summariseMetrics,
  toDay,
  type NormalisedSession,
} from '../../utils/mentoring-analytics.util.js';

export interface AiRoleContext {
  role: string;
  scopeLabel: string;
  facts: string[];
}

/** Build `YYYY-MM` for "this month" arithmetic; UTC-safe. */
function monthKeyNow(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Turn the counselling + meeting rows for a student set into sessions. */
async function buildSessionsForStudents(studentIds: string[]): Promise<NormalisedSession[]> {
  const sessions: NormalisedSession[] = [];
  if (studentIds.length === 0) return sessions;

  const records = await CounsellingRecord.find({ student: { $in: studentIds } }).lean();
  for (const r of records as any[]) {
    sessions.push({
      id: String(r._id),
      studentId: idOf(r.student),
      mentorId: idOf(r.mentor),
      date: toDay(r.sessionDate || r.date || r.createdAt),
      source: 'COUNSELLING',
    });
  }

  const meetings = await Meeting.find({ student: { $in: studentIds } }).lean();
  for (const m of meetings as any[]) {
    sessions.push({
      id: String(m._id),
      studentId: idOf(m.student),
      mentorId: idOf(m.mentor),
      date: toDay(m.meetingDate || m.createdAt),
      source: 'MEETING',
    });
  }
  return sessions;
}

async function collegeContext(role: string, scopeLabel: string): Promise<AiRoleContext> {
  const [departments, faculty, students, assignments] = await Promise.all([
    Department.find().sort({ code: 1 }).lean(),
    Faculty.find().populate('user').lean(),
    Student.find().lean(),
    MentorAssignment.find({ status: 'ACTIVE' }).lean(),
  ]);

  const sessions = await buildSessionsForStudents(students.map((s: any) => String(s._id)));
  const summary = summariseMetrics(
    {
      totalStudents: students.length,
      totalFaculty: faculty.length,
      assignments: assignments as any[],
      sessions,
    },
    new Date()
  );

  const deptById = new Map<string, any>();
  for (const d of departments as any[]) deptById.set(String(d._id), d);

  const byDept = new Map<string, any[]>();
  for (const s of students as any[]) {
    const deptId = idOf(s.department);
    if (!byDept.has(deptId)) byDept.set(deptId, []);
    byDept.get(deptId)!.push(s);
  }

  const deptLines = (departments as any[])
    .map((d: any) => {
      const studentsInDept = byDept.get(String(d._id)) || [];
      return `- ${d.name} (${d.code || '—'}): ${studentsInDept.length} students`;
    })
    .slice(0, 40);

  return {
    role,
    scopeLabel,
    facts: [
      `Total departments: ${departments.length}`,
      `Total faculty: ${summary.totalFaculty}`,
      `Total students: ${summary.totalStudents}`,
      `Active mentors: ${summary.totalMentors}`,
      `Students with an active mentor assignment: ${summary.assignedMentees}`,
      `Students mentored this month (${monthKeyNow()}): ${summary.mentoredThisMonth}`,
      `Overall monthly mentoring coverage: ${summary.overallMentoringCoverage}%`,
      `Total dated mentoring sessions on record: ${summary.totalMentoringSessions}`,
      ...deptLines,
    ],
  };
}

async function hodContext(user: AuthUser): Promise<AiRoleContext> {
  const deptId = user.departmentId;
  if (!deptId) {
    return { role: ROLES.HOD, scopeLabel: 'unassigned (no department linked)', facts: ['No department is linked to this account.'] };
  }

  const [department, faculty, students, assignments] = await Promise.all([
    Department.findById(deptId).lean(),
    Faculty.find({ department: deptId }).populate('user').lean(),
    Student.find({ department: deptId }).lean(),
    MentorAssignment.find({ department: deptId, status: 'ACTIVE' }).lean(),
  ]);

  const sessions = await buildSessionsForStudents(students.map((s: any) => String(s._id)));
  const summary = summariseMetrics(
    {
      totalStudents: students.length,
      totalFaculty: faculty.length,
      assignments: assignments as any[],
      sessions,
    },
    new Date()
  );

  // Subject-wise aggregated internal marks for this department (no names).
  const marks = await InternalMark.find({ student: { $in: students.map((s: any) => String(s._id)) } }).lean();
  const bySubject = new Map<string, { subjectName: string; count: number; ia1: number[]; ia2: number[]; endSem: number[] }>();
  for (const m of marks as any[]) {
    const key = `${m.subjectCode}|${m.subjectName}`;
    if (!bySubject.has(key)) bySubject.set(key, { subjectName: m.subjectName || m.subjectCode, count: 0, ia1: [], ia2: [], endSem: [] });
    const row = bySubject.get(key)!;
    row.count += 1;
    if (typeof m.ia1 === 'number') row.ia1.push(m.ia1);
    if (typeof m.ia2 === 'number') row.ia2.push(m.ia2);
    if (typeof m.endSem === 'number') row.endSem.push(m.endSem);
  }
  const markLines = Array.from(bySubject.values())
    .map((r) => {
      const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
      return `- ${r.subjectName}: ${r.count} students recorded | IA1 avg ${avg(r.ia1) ?? 'n/a'}, IA2 avg ${avg(r.ia2) ?? 'n/a'}, End-Sem avg ${avg(r.endSem) ?? 'n/a'}`;
    })
    .slice(0, 30);

  return {
    role: ROLES.HOD,
    scopeLabel: `department ${department?.name || 'unknown'} (this department only)`,
    facts: [
      `Department: ${department?.name || 'unknown'} (${department?.code || '—'})`,
      `Students in department: ${summary.totalStudents}`,
      `Faculty in department: ${summary.totalFaculty}`,
      `Active mentors: ${summary.totalMentors}`,
      `Students with an active mentor assignment: ${summary.assignedMentees}`,
      `Students mentored this month: ${summary.mentoredThisMonth}`,
      `Monthly mentoring coverage: ${summary.overallMentoringCoverage}%`,
      `Total dated mentoring sessions: ${summary.totalMentoringSessions}`,
      ...markLines,
    ],
  };
}

async function facultyContext(user: AuthUser): Promise<AiRoleContext> {
  const facultyId = user.facultyId;
  if (!facultyId) {
    return { role: ROLES.FACULTY, scopeLabel: 'mentor (no faculty profile linked)', facts: ['No faculty profile is linked to this account.'] };
  }

  const assignments = await MentorAssignment.find({ mentor: facultyId, status: 'ACTIVE' }).lean();
  const studentIds = assignments.map((a: any) => idOf(a.student)).filter(Boolean);
  const students = studentIds.length ? await Student.find({ _id: { $in: studentIds } }).populate('department batch').lean() : [];

  const byStudentId = new Map<string, any>();
  for (const s of students as any[]) byStudentId.set(String(s._id), s);

  const sessions = await buildSessionsForStudents(studentIds);
  const mentoredThisMonth = new Set(
    sessions.filter((s) => s.date && s.date.startsWith(monthKeyNow())).map((s) => s.studentId)
  ).size;

  const menteeLines = (students as any[])
    .map((s: any) => {
      const dept: any = s.department || {};
      const batch: any = s.batch || {};
      return `- ${s.registerNumber || '—'}, ${s.fullName || '—'} (${dept.code || dept.name || 'no-dept'}, ${batch.name || 'no-batch'})`;
    })
    .slice(0, 60);

  return {
    role: ROLES.FACULTY,
    scopeLabel: 'your own assigned mentees only',
    facts: [
      `You have ${studentIds.length} mentee(s) with ACTIVE mentor assignments.`,
      `Mentees mentored this month (${monthKeyNow()}): ${mentoredThisMonth}`,
      ...menteeLines,
    ],
  };
}

async function studentContext(user: AuthUser): Promise<AiRoleContext> {
  const studentId = user.studentId;
  if (!studentId) {
    return { role: ROLES.STUDENT, scopeLabel: 'student (no student profile linked)', facts: ['No student profile is linked to this account.'] };
  }

  const student = await Student.findById(studentId).populate('department batch');
  if (!student) {
    return { role: ROLES.STUDENT, scopeLabel: 'student (profile missing)', facts: ['Your student profile could not be found.'] };
  }

  const dept: any = (student as any).department || {};
  const batch: any = (student as any).batch || {};

  const marks = await InternalMark.find({ student: studentId }).sort({ semesterNumber: 1 }).lean();
  const markLines = (marks as any[])
    .map((m: any) => `- Sem ${m.semesterNumber} ${m.subjectCode} ${m.subjectName}: IA1 ${m.ia1 ?? '—'}, IA2 ${m.ia2 ?? '—'}, End-Sem ${m.endSem ?? '—'}`)
    .slice(0, 40);

  const counsellingCount = await CounsellingRecord.countDocuments({ student: studentId });
  const sessions = await buildSessionsForStudents([studentId]);

  const assignment = await MentorAssignment.findOne({ student: studentId, status: 'ACTIVE' }).lean();
  let mentorName = '';
  if (assignment) {
    const mentorFaculty = await Faculty.findById(idOf(assignment.mentor)).populate('user').lean();
    mentorName = (mentorFaculty as any)?.user?.fullName || '';
  }

  return {
    role: ROLES.STUDENT,
    scopeLabel: 'your own record only',
    facts: [
      `You: ${(student as any).fullName} (${(student as any).registerNumber})`,
      `Department: ${dept.name || '—'}${batch.name ? `, Batch ${batch.name}` : ''}`,
      `Mentor: ${mentorName || 'not assigned yet'}`,
      `Mentoring sessions with your mentor on record: ${sessions.length}`,
      `Counselling records on record: ${counsellingCount}`,
      `Your recorded internal marks (${marks.length}):`,
      ...markLines,
    ],
  };
}

/**
 * Build the verified, role-scoped context for the authenticated user.
 * Misses nothing is fabricated: empty data produces explicit "none recorded".
 */
export async function buildAiRoleContext(user: AuthUser): Promise<AiRoleContext> {
  switch (user.role) {
    case ROLES.ADMIN:
      return collegeContext(ROLES.ADMIN, 'college-wide (all departments)');
    case ROLES.PRINCIPAL:
      return collegeContext(ROLES.PRINCIPAL, 'college-wide (all departments) — READ-ONLY role');
    case ROLES.HOD:
      return hodContext(user);
    case ROLES.FACULTY:
      return facultyContext(user);
    case ROLES.STUDENT:
      return studentContext(user);
    default:
      return { role: user.role, scopeLabel: 'unknown role', facts: [] };
  }
}