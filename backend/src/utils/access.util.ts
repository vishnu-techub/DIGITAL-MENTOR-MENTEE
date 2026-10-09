import { AuthUser } from '../middleware/auth.middleware.js';
import { ROLES } from '../config/constants.js';
import { Student, MentorAssignment, Faculty } from '../models/index.js';
import { isValidId, toLocalId, type LocalId } from '../services/localId.js';

/**
 * CENTRAL AUTHORISATION UTILITY
 * ---------------------------------------------------------------------------
 * Single source of truth for "may this authenticated user read/write this
 * student record?". Every controller (students, documents, academics,
 * meetings, pdf, mentorship) MUST route its permission decisions through here
 * instead of re-implementing ad-hoc role checks.
 *
 * Rules:
 *   ADMIN   -> full institutional access
 *   STUDENT -> own record only
 *   FACULTY -> only students with an ACTIVE MentorAssignment to this faculty
 *   HOD     -> only students inside the HOD's own department
 */

export interface AccessDecision {
  allowed: boolean;
  status: number;
  message: string;
}

const ALLOW: Readonly<AccessDecision> = { allowed: true, status: 200, message: '' };

function deny(status: number, message: string): AccessDecision {
  return { allowed: false, status, message };
}

/** Normalise any populated doc | LocalId | string reference into a comparable string id. */
export function toIdString(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    if (value._id) return value._id.toString();
    return null;
  }
  return String(value);
}

/** Resolve the Faculty document id for the authenticated user (token may carry employeeId or ObjectId). */
export async function resolveFacultyIdForUser(user?: AuthUser): Promise<string | null> {
  if (!user) return null;
  const raw = user.facultyId;
  if (!raw) return null;
  if (isValidId(raw)) {
    const byId = await Faculty.findById(raw).select('_id').lean();
    if (byId) return (byId as any)._id.toString();
  }
  const byEmp = await Faculty.findOne({ employeeId: raw }).select('_id').lean();
  return byEmp ? (byEmp as any)._id.toString() : null;
}

/** True when the user holds an ACTIVE mentor assignment for the given student. */
export async function isActiveMentorOf(user: AuthUser | undefined, studentId: string): Promise<boolean> {
  const mentorId = await resolveFacultyIdForUser(user);
  if (!mentorId) return false;
  const asg = await MentorAssignment.findOne({
    student: toLocalId(studentId),
    mentor: toLocalId(mentorId),
    status: 'ACTIVE',
  })
    .select('_id')
    .lean();
  return Boolean(asg);
}

/** True when the user is the student themselves (by ObjectId, register number, or linked user account). */
export function isSelf(user: AuthUser | undefined, student: any): boolean {
  if (!user || !student) return false;
  const sid = toIdString(student._id);
  const reg = student.registerNumber ? String(student.registerNumber).toUpperCase() : null;
  const userStudentId = user.studentId ? String(user.studentId) : null;
  const studentUserId = toIdString(student.user);

  if (userStudentId && (userStudentId === sid || (reg && userStudentId.toUpperCase() === reg))) {
    return true;
  }
  if (studentUserId && toIdString(user.id) === studentUserId) return true;
  return false;
}

/** True when the student's department matches the HOD's department. */
export function isSameDepartment(user: AuthUser | undefined, student: any): boolean {
  if (!user?.departmentId || !student) return false;
  const dept = toIdString(student.department);
  return Boolean(dept) && dept === toIdString(user.departmentId);
}

export interface AccessOptions {
  /** When false (default) a HOD with no department claim is denied rather than granted. */
  allowUnscopedHod?: boolean;
}

/**
 * Authorise `user` to act on `student`.
 * @param action 'read' | 'write' — mentors/HODs may read department/assignment scope
 *                     but writes are checked identically; kept explicit for call-site clarity.
 */
export async function checkStudentAccess(
  user: AuthUser | undefined,
  student: any,
  _options: AccessOptions = {}
): Promise<AccessDecision> {
  if (!user) return deny(401, 'Authentication required.');
  if (!student) return deny(404, 'Student record not found.');

  switch (user.role) {
    case ROLES.ADMIN:
      return ALLOW;

    case ROLES.STUDENT:
      return isSelf(user, student)
        ? ALLOW
        : deny(403, 'Access denied: students may only access their own record.');

    case ROLES.FACULTY:
      return (await isActiveMentorOf(user, toIdString(student._id) as string))
        ? ALLOW
        : deny(403, 'Access denied: you are not the assigned mentor for this student.');

    case ROLES.HOD:
      return isSameDepartment(user, student)
        ? ALLOW
        : deny(403, 'Access denied: this student belongs to another department.');

    default:
      return deny(403, 'Access denied: unsupported role.');
  }
}

/**
 * Build a Mongo filter restricting a Student.find() to the caller's scope.
 * Used for list endpoints so scoping is enforced in the query, not after the fact.
 */
export async function buildScopedStudentFilter(
  user: AuthUser | undefined,
  extra: Record<string, any> = {}
): Promise<Record<string, any>> {
  const filter: Record<string, any> = { ...extra };

  if (!user) return { ...filter, _id: null };

  if (user.role === ROLES.ADMIN) return filter;

  if (user.role === ROLES.HOD) {
    if (user.departmentId) {
      filter.department = toLocalId(user.departmentId);
    } else {
      filter._id = null;
    }
    return filter;
  }

  if (user.role === ROLES.FACULTY) {
    const mentorId = await resolveFacultyIdForUser(user);
    if (!mentorId) {
      filter._id = null;
      return filter;
    }
    const asgs = await MentorAssignment.find({
      mentor: toLocalId(mentorId),
      status: 'ACTIVE',
    })
      .select('student')
      .lean();
    filter._id = { $in: asgs.map((a: any) => a.student) };
    return filter;
  }

  // STUDENT
  if (user.studentId) {
    if (isValidId(user.studentId)) {
      filter._id = toLocalId(user.studentId);
    } else {
      filter.registerNumber = String(user.studentId).toUpperCase();
    }
  } else {
    filter._id = null;
  }
  return filter;
}

/** Convenience wrapper returning the Student document when access is granted. */
export async function loadAccessibleStudent(
  user: AuthUser | undefined,
  idOrReg: string
): Promise<{ student: any | null; decision: AccessDecision }> {
  let student: any = null;
  if (isValidId(idOrReg)) {
    student = await Student.findById(idOrReg);
  }
  if (!student) {
    student = await Student.findOne({ registerNumber: String(idOrReg).toUpperCase() });
  }
  if (!student) {
    return { student: null, decision: deny(404, 'Student record not found.') };
  }
  const decision = await checkStudentAccess(user, student);
  return { student: decision.allowed ? student : null, decision };
}
