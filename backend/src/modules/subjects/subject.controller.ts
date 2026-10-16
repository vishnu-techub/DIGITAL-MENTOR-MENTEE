import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { Batch, Department, InternalMark, Student, Subject } from '../../models/index.js';
import {
  SUBJECT_SEMESTER_MAX,
  SUBJECT_SEMESTER_MIN,
  SUBJECT_STATUSES,
  SUBJECT_TYPES,
  SUBJECT_TYPE_LABEL,
  isSubjectStatus,
  normaliseSubjectType,
  subjectAcademicYears,
  subjectDepartments,
  subjectRegulations,
  subjectSemesters,
  type SubjectStatus,
} from '../../models/Subject.model.js';
import { parseStrictNumber } from '../../utils/validation.util.js';
import { toLocalId } from '../../services/localId.js';

/**
 * ============================================================================
 * SUBJECT MANAGEMENT — Admin-managed subject catalogue
 * ============================================================================
 *
 * WHY THIS EXISTS
 *
 * The marks workflow previously derived the "subject" list from whatever codes
 * already had marks, so an Admin had no way to define ahead of time which
 * subjects a department may record marks for. This module is that catalogue.
 *
 * MULTI-SELECT SCOPE
 *
 * A subject applies to a SET of departments, semesters, academic years and
 * regulations. The canonical scope is stored as arrays; the original scalar
 * fields are kept in sync as the first element of each array so the legacy
 * unique index, the legacy API shape and every existing reader keep working.
 * Because the local store's matcher cannot test membership on a top-level array
 * field, scope comparison is done in JavaScript through the helpers exported by
 * `Subject.model.ts` (`subjectDepartments`, `subjectSemesters`, ...).
 *
 * SCOPE / ISOLATION
 *
 *   - The Admin CRUD surface (`/api/admin/subjects`) is ADMIN-only: every route
 *     is guarded by `authorize(ROLES.ADMIN)` in subject.routes.ts and every
 *     handler re-checks the role, so hiding a button is never the control.
 *   - The HOD-facing catalogue (`loadDepartmentSubjects`) is hard-scoped to the
 *     caller's own department; an HOD can never read another department's
 *     subjects.
 *   - Subjects are stored in the existing local JSON store (`subjects.json`);
 *     no new infrastructure is introduced.
 *
 * SAFETY
 *
 *   - Subject codes are unique across their whole multi-select scope: two
 *     subjects with the same code may not share ANY (department, semester,
 *     academic year) combination.
 *   - A subject that already has marks can never be hard-deleted; callers are
 *     directed to deactivate it instead, which keeps every historical mark's
 *     subject information intact.
 *   - Editing a subject only changes the catalogue row. Existing InternalMark
 *     rows are never rewritten, so historical records keep the subject details
 *     they were entered with.
 */

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$/;
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;

interface SubjectInput {
  code: string;
  name: string;
  departmentIds: string[];
  semesters: number[];
  academicYears: string[];
  regulations: string[];
  subjectType: string;
  maxMarks: number;
  passMarks: number;
  status: SubjectStatus;
}

interface ParsedSubject {
  ok: true;
  value: SubjectInput;
}
interface InvalidSubject {
  ok: false;
  error: string;
}

/** Department lookup so a raw departmentId never reaches the store unchecked. */
async function resolveDepartment(rawId: unknown): Promise<any | null> {
  if (typeof rawId !== 'string' || !rawId.trim()) return null;
  let id: string;
  try {
    id = toLocalId(rawId.trim());
  } catch {
    return null;
  }
  const dept = await Department.findById(id).lean();
  return dept || null;
}

/** Coerce a scalar or array body value into a de-duplicated list of strings. */
function toStringList(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/** Coerce a scalar or array body value into a de-duplicated list of numbers. */
function toNumberList(raw: unknown): number[] {
  const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const out: number[] = [];
  for (const value of values) {
    const n = Number(value);
    if (!Number.isNaN(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Validate and normalise a create/update body.
 *
 * Accepts BOTH the multi-select shape (`departmentIds`, `semesters`,
 * `academicYears`, `regulations`) and the legacy scalar shape (`departmentId`,
 * `semester`, `academicYear`, `regulation`) — the scalar form is treated as a
 * single-element selection so older clients keep working.
 *
 * All required-field and cross-field checks live here so the store, the
 * controller and any future caller share one definition of a valid subject.
 */
async function parseSubjectInput(body: any): Promise<ParsedSubject | InvalidSubject> {
  const errors: string[] = [];

  const code = String(body?.code ?? '').trim().toUpperCase();
  if (!code) errors.push('Subject code is required.');
  else if (!CODE_PATTERN.test(code)) {
    errors.push('Subject code may use letters, numbers and . _ / - only (1-30 characters).');
  }

  const name = String(body?.name ?? '').trim();
  if (!name) errors.push('Subject name is required.');
  else if (name.length > 150) errors.push('Subject name must be at most 150 characters.');

  // ── Departments ──────────────────────────────────────────────────────────
  const departmentIdsRaw = toStringList(body?.departmentIds ?? body?.departmentId ?? body?.department);
  const departmentIds: string[] = [];
  if (departmentIdsRaw.length === 0) {
    errors.push('Select at least one department.');
  } else {
    const seen = new Set<string>();
    for (const rawId of departmentIdsRaw) {
      const department = await resolveDepartment(rawId);
      if (!department) {
        errors.push(`The selected department "${rawId}" does not exist.`);
        continue;
      }
      const id = String(department._id);
      if (!seen.has(id)) {
        seen.add(id);
        departmentIds.push(id);
      }
    }
  }

  // ── Semesters ────────────────────────────────────────────────────────────
  const semesters = toNumberList(body?.semesters ?? body?.semester).sort((a, b) => a - b);
  if (semesters.length === 0) {
    errors.push('Select at least one semester.');
  } else if (
    semesters.some(
      (s) => !Number.isInteger(s) || s < SUBJECT_SEMESTER_MIN || s > SUBJECT_SEMESTER_MAX
    )
  ) {
    errors.push(`Semester must be a whole number between ${SUBJECT_SEMESTER_MIN} and ${SUBJECT_SEMESTER_MAX}.`);
  }

  // ── Academic years ───────────────────────────────────────────────────────
  const academicYears = toStringList(body?.academicYears ?? body?.academicYear);
  if (academicYears.length === 0) {
    errors.push('Select at least one academic year.');
  } else if (academicYears.some((ay) => !ACADEMIC_YEAR_PATTERN.test(ay))) {
    errors.push('Academic year must use the cohort format YYYY-YYYY (e.g. 2024-2028).');
  }

  // ── Regulations (optional) ────────────────────────────────────────────────
  const regulations = toStringList(body?.regulations ?? body?.regulation).map((r) => r.toUpperCase());
  if (regulations.some((r) => r.length > 20)) errors.push('Regulation must be at most 20 characters.');

  const subjectType = normaliseSubjectType(body?.subjectType ?? 'THEORY');
  if (!subjectType) {
    errors.push(
      `Subject type must be one of: ${SUBJECT_TYPE_LABEL.THEORY}, ${SUBJECT_TYPE_LABEL.PRACTICAL}, ${SUBJECT_TYPE_LABEL.PROJECT}, ${SUBJECT_TYPE_LABEL.ELECTIVE}.`
    );
  }

  const maxParsed = parseStrictNumber(body?.maxMarks, {
    field: 'Maximum marks',
    min: 1,
    max: 1000,
    required: true,
    integer: true,
  });
  if (!maxParsed.ok) errors.push(maxParsed.error!);

  const passParsed = parseStrictNumber(body?.passMarks, {
    field: 'Pass marks',
    min: 0,
    max: 1000,
    required: true,
    integer: true,
  });
  if (!passParsed.ok) errors.push(passParsed.error!);

  const statusRaw = String(body?.status ?? 'ACTIVE').trim().toUpperCase();
  if (!isSubjectStatus(statusRaw)) {
    errors.push(`Status must be one of: ${SUBJECT_STATUSES.join(', ')}.`);
  }

  // Cross-field: pass marks may never exceed the subject maximum.
  if (maxParsed.ok && passParsed.ok && passParsed.value! > maxParsed.value!) {
    errors.push(`Pass marks (${passParsed.value}) cannot be greater than maximum marks (${maxParsed.value}).`);
  }

  if (errors.length > 0) return { ok: false, error: errors.join(' ') };

  return {
    ok: true,
    value: {
      code,
      name,
      departmentIds,
      semesters: semesters.map((s) => Number(s)),
      academicYears,
      regulations,
      subjectType: subjectType!,
      maxMarks: maxParsed.value!,
      passMarks: passParsed.value!,
      status: statusRaw as SubjectStatus,
    },
  };
}

/**
 * The scalar mirrors (first element of each array). Kept in sync on every write
 * so the legacy unique index and every legacy reader stay correct.
 */
function primaryScope(value: SubjectInput) {
  return {
    department: toLocalId(value.departmentIds[0]),
    semester: value.semesters[0],
    academicYear: value.academicYears[0],
    regulation: value.regulations[0] || undefined,
  };
}

/**
 * Reject a subject whose code already exists anywhere its scope OVERLAPS the
 * submitted scope — i.e. the two share at least one (department, semester,
 * academic year) combination. Two disjoint scopes may reuse the same code.
 */
async function findScopeConflict(
  code: string,
  value: SubjectInput,
  excludeId?: string
): Promise<any | null> {
  const candidates = await Subject.find({ code: code.toUpperCase() }).lean<any>();
  const wanted = new Set<string>();
  for (const departmentId of value.departmentIds) {
    for (const semester of value.semesters) {
      for (const academicYear of value.academicYears) {
        wanted.add(`${departmentId}|${semester}|${academicYear}`);
      }
    }
  }

  for (const candidate of candidates as any[]) {
    if (excludeId && String(candidate._id) === String(excludeId)) continue;
    const depts = subjectDepartments(candidate);
    const sems = subjectSemesters(candidate);
    const years = subjectAcademicYears(candidate);
    for (const d of depts) {
      for (const s of sems) {
        for (const y of years) {
          if (wanted.has(`${d}|${s}|${y}`)) return candidate;
        }
      }
    }
  }
  return null;
}

/** Every department id → {code, name}, so a subject's array resolves to labels. */
async function loadDepartmentMap(): Promise<Map<string, { code: string; name: string }>> {
  const departments = await Department.find({}).lean<any>();
  const map = new Map<string, { code: string; name: string }>();
  for (const d of departments as any[]) {
    map.set(String(d._id), { code: d.code ?? '', name: d.name ?? '' });
  }
  return map;
}

/**
 * Count InternalMark rows (and distinct students) per subject.
 *
 * A subject now spans several (department, semester) combinations, so its usage
 * is the sum across all of them. Keyed by subject id.
 */
async function computeSubjectUsage(
  subjects: any[]
): Promise<Map<string, { marksRecords: number; studentCount: number }>> {
  // comboKey -> subject id. Overlap uniqueness guarantees a combo belongs to at
  // most one subject with a given code.
  const comboToSubject = new Map<string, string>();
  for (const subject of subjects) {
    const id = String(subject._id);
    for (const departmentId of subjectDepartments(subject)) {
      for (const semester of subjectSemesters(subject)) {
        comboToSubject.set(`${String(subject.code).toUpperCase()}|${semester}|${departmentId}`, id);
      }
    }
  }
  if (comboToSubject.size === 0) return new Map();

  // One pass over the marks + a student→department map. Deliberately not a
  // per-subject query, which would re-scan the mark collection per row.
  const [marks, students] = await Promise.all([
    InternalMark.find({}).select('student subjectCode semesterNumber').lean(),
    Student.find({}).select('department').lean(),
  ]);

  const deptByStudent = new Map<string, string>();
  for (const s of students as any[]) {
    deptByStudent.set(String(s._id), String(s.department ?? ''));
  }

  const usage = new Map<string, { marksRecords: number; students: Set<string> }>();
  for (const m of marks as any[]) {
    const departmentId = deptByStudent.get(String(m.student)) ?? '';
    const key = `${String(m.subjectCode).toUpperCase()}|${Number(m.semesterNumber)}|${departmentId}`;
    const subjectId = comboToSubject.get(key);
    if (!subjectId) continue;
    if (!usage.has(subjectId)) usage.set(subjectId, { marksRecords: 0, students: new Set() });
    const entry = usage.get(subjectId)!;
    entry.marksRecords += 1;
    entry.students.add(String(m.student));
  }

  const out = new Map<string, { marksRecords: number; studentCount: number }>();
  for (const [id, value] of usage) {
    out.set(id, { marksRecords: value.marksRecords, studentCount: value.students.size });
  }
  return out;
}

/** Shape a stored Subject (+ its scope + usage counts) for the client. */
function serialiseSubject(
  subject: any,
  usage?: { marksRecords: number; studentCount: number },
  departmentMap?: Map<string, { code: string; name: string }>
) {
  const departmentIds = subjectDepartments(subject);
  const departments = departmentIds.map((id) => {
    const found = departmentMap?.get(id);
    return { id, code: found?.code ?? '', name: found?.name ?? '' };
  });
  const primary = departments[0];

  const semesters = subjectSemesters(subject);
  const academicYears = subjectAcademicYears(subject);
  const regulations = subjectRegulations(subject);

  return {
    id: String(subject._id),
    _id: String(subject._id),
    code: subject.code,
    name: subject.name,

    // Multi-select scope (canonical)
    departmentIds,
    departments,
    semesters,
    academicYears,
    regulations,

    // First-element mirrors (backward-compatible shape)
    departmentId: primary?.id ?? '',
    departmentCode: primary?.code ?? '',
    departmentName: primary?.name ?? '',
    semester: semesters[0] ?? null,
    academicYear: academicYears[0] ?? '',
    regulation: regulations[0] ?? '',

    subjectType: subject.subjectType ?? 'THEORY',
    subjectTypeLabel:
      SUBJECT_TYPE_LABEL[(subject.subjectType ?? 'THEORY') as keyof typeof SUBJECT_TYPE_LABEL] ?? 'Theory',
    maxMarks: subject.maxMarks,
    passMarks: subject.passMarks,
    status: subject.status ?? 'ACTIVE',
    marksRecordCount: usage?.marksRecords ?? 0,
    studentCount: usage?.studentCount ?? 0,
    createdAt: subject.createdAt ?? null,
    updatedAt: subject.updatedAt ?? null,
  };
}

/**
 * GET /api/admin/subjects
 * Searchable, filterable, paginated subject list (ADMIN).
 *
 * Filters: search (code/name), departmentId, semester, academicYear,
 * regulation, subjectType, status. The scope filters match when ANY of a
 * subject's selected values match, so a department filter lists a subject that
 * applies to that department even if it applies to others too.
 */
export async function getSubjects(req: AuthRequest, res: Response): Promise<any> {
  try {
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const departmentId = String(req.query.departmentId ?? req.query.department ?? '').trim();
    const academicYear = String(req.query.academicYear ?? '').trim();
    const regulation = String(req.query.regulation ?? '').trim().toUpperCase();
    const subjectType = String(req.query.subjectType ?? '').trim().toUpperCase();
    const status = String(req.query.status ?? '').trim().toUpperCase();

    const semesterRaw = req.query.semester;
    const hasSemester = semesterRaw !== undefined && semesterRaw !== null && String(semesterRaw).trim() !== '';
    const semester = hasSemester ? Number(semesterRaw) : undefined;
    if (hasSemester && (!Number.isInteger(semester) || (semester as number) < 1 || (semester as number) > 8)) {
      return sendError(res, 'semester must be an integer between 1 and 8.', 400);
    }

    let departmentFilterId = '';
    if (departmentId) {
      try {
        departmentFilterId = toLocalId(departmentId);
      } catch {
        return sendSuccess(res, { subjects: [], total: 0, page: 1, limit: 0, pageCount: 0 });
      }
    }

    // The subject master is small and the store scans anyway, so load once and
    // apply the array-aware scope filters in JavaScript.
    const all = await Subject.find({}).lean<any>();
    const departmentMap = await loadDepartmentMap();

    const filtered = (all as any[])
      .filter((s) => {
        if (departmentFilterId && !subjectDepartments(s).includes(departmentFilterId)) return false;
        if (semester !== undefined && !subjectSemesters(s).includes(semester)) return false;
        if (academicYear && !subjectAcademicYears(s).includes(academicYear)) return false;
        if (regulation && !subjectRegulations(s).includes(regulation)) return false;
        if (subjectType && String(s.subjectType ?? '').toUpperCase() !== subjectType) return false;
        if (status && String(s.status ?? '').toUpperCase() !== status) return false;
        if (search) {
          const hay = `${String(s.code ?? '').toLowerCase()} ${String(s.name ?? '').toLowerCase()}`;
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          String(subjectAcademicYears(b)[0] ?? '').localeCompare(String(subjectAcademicYears(a)[0] ?? '')) ||
          (subjectSemesters(a)[0] ?? 0) - (subjectSemesters(b)[0] ?? 0) ||
          String(a.code).localeCompare(String(b.code))
      );

    // Paginate. `limit` omitted (or 0) returns everything, mirroring the
    // Student directory contract so an HOD-style "load all" caller still works.
    const total = filtered.length;
    const hasLimit = req.query.limit !== undefined && String(req.query.limit).trim() !== '';
    const limit = hasLimit ? Math.max(1, Math.min(200, Number(req.query.limit))) : total || 1;
    const pageRaw = req.query.page !== undefined && String(req.query.page).trim() !== '' ? Number(req.query.page) : 1;
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const start = hasLimit ? (page - 1) * limit : 0;
    const paged = hasLimit ? filtered.slice(start, start + limit) : filtered;

    const usage = await computeSubjectUsage(paged);
    const serialised = paged.map((s: any) =>
      serialiseSubject(s, usage.get(String(s._id)), departmentMap)
    );

    return sendSuccess(res, {
      subjects: serialised,
      total,
      page,
      limit: hasLimit ? limit : total,
      pageCount: hasLimit ? Math.ceil(total / limit) : 1,
    });
  } catch (err: any) {
    console.error('getSubjects error:', err);
    return sendError(res, 'Failed to fetch subjects.', 500);
  }
}

/**
 * GET /api/admin/subjects/meta
 * The filter vocabulary for the management screen (API-driven, not hard-coded).
 * Academic years and regulations are unioned across the catalogue, the batches
 * and (for regulations) any legacy scalar values, so the pickers offer the
 * values the institution already uses.
 */
export async function getSubjectMeta(req: AuthRequest, res: Response): Promise<any> {
  try {
    const [departments, subjects, batches] = await Promise.all([
      Department.find().sort({ code: 1 }).lean<any>(),
      Subject.find({}).lean<any>(),
      Batch.find({}).select('name').lean<any>(),
    ]);

    const regulations = new Set<string>();
    const academicYears = new Set<string>();

    for (const subject of subjects as any[]) {
      for (const regulation of subjectRegulations(subject)) regulations.add(regulation);
      for (const academicYear of subjectAcademicYears(subject)) academicYears.add(academicYear);
    }
    for (const batch of batches as any[]) {
      const name = String(batch?.name ?? '').trim();
      if (ACADEMIC_YEAR_PATTERN.test(name)) academicYears.add(name);
    }

    return sendSuccess(res, {
      departments: (departments as any[]).map((d) => ({ id: String(d._id), code: d.code, name: d.name })),
      regulations: Array.from(regulations).sort(),
      academicYears: Array.from(academicYears).sort(),
      semesters: [1, 2, 3, 4, 5, 6, 7, 8],
      subjectTypes: SUBJECT_TYPES.map((t) => ({ value: t, label: SUBJECT_TYPE_LABEL[t] })),
      statuses: SUBJECT_STATUSES.slice(),
    });
  } catch (err: any) {
    console.error('getSubjectMeta error:', err);
    return sendError(res, 'Failed to fetch subject filter options.', 500);
  }
}

/** GET /api/admin/subjects/:subjectId */
export async function getSubjectById(req: AuthRequest, res: Response): Promise<any> {
  try {
    const subject: any = await Subject.findById(req.params.subjectId).lean();
    if (!subject) return sendError(res, 'Subject not found.', 404);
    const [usage, departmentMap] = await Promise.all([computeSubjectUsage([subject]), loadDepartmentMap()]);
    return sendSuccess(res, serialiseSubject(subject, usage.get(String(subject._id)), departmentMap));
  } catch (err: any) {
    console.error('getSubjectById error:', err);
    return sendError(res, 'Failed to fetch the subject.', 500);
  }
}

/**
 * POST /api/admin/subjects
 * Create a subject (ADMIN). Rejects a duplicate code whose scope overlaps.
 */
export async function createSubject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const parsed = await parseSubjectInput(req.body);
    if (!parsed.ok) return sendError(res, parsed.error, 400);

    const { value } = parsed;

    const conflict = await findScopeConflict(value.code, value);
    if (conflict) {
      return sendError(
        res,
        `Subject code ${value.code} already exists for one of the selected department / semester / academic year combinations.`,
        409
      );
    }

    const created: any = await Subject.create({
      code: value.code,
      name: value.name,
      departments: value.departmentIds.map((id) => toLocalId(id)),
      semesters: value.semesters,
      academicYears: value.academicYears,
      regulations: value.regulations,
      ...primaryScope(value),
      subjectType: value.subjectType,
      maxMarks: value.maxMarks,
      passMarks: value.passMarks,
      status: value.status,
      createdBy: req.user?.id,
      updatedBy: req.user?.id,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_SUBJECT',
      entity: 'SUBJECT',
      entityId: String(created._id),
      details: {
        code: value.code,
        name: value.name,
        departments: value.departmentIds,
        semesters: value.semesters,
        academicYears: value.academicYears,
      },
      req,
    });

    const subject: any = await Subject.findById(created._id).lean();
    const departmentMap = await loadDepartmentMap();
    return sendSuccess(res, serialiseSubject(subject, undefined, departmentMap), 'Subject created successfully.', 201);
  } catch (err: any) {
    // The store's own unique-index guard is the last line of defence.
    if (err?.name === 'ValidationError' || String(err?.message || '').toLowerCase().includes('unique')) {
      return sendError(res, 'Subject code must be unique within its department, semester and academic year.', 409);
    }
    console.error('createSubject error:', err);
    return sendError(res, 'Failed to create the subject.', 500);
  }
}

/**
 * PUT /api/admin/subjects/:subjectId
 * Edit a subject (ADMIN). Never touches existing InternalMark rows.
 */
export async function updateSubject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const current: any = await Subject.findById(req.params.subjectId).lean();
    if (!current) return sendError(res, 'Subject not found.', 404);

    const parsed = await parseSubjectInput(req.body);
    if (!parsed.ok) return sendError(res, parsed.error, 400);

    const { value } = parsed;

    // Duplicate check against the (possibly changed) scope, excluding self.
    const conflict = await findScopeConflict(value.code, value, String(current._id));
    if (conflict) {
      return sendError(
        res,
        `Subject code ${value.code} already exists for one of the selected department / semester / academic year combinations.`,
        409
      );
    }

    await Subject.updateOne(
      { _id: current._id },
      {
        $set: {
          code: value.code,
          name: value.name,
          departments: value.departmentIds.map((id) => toLocalId(id)),
          semesters: value.semesters,
          academicYears: value.academicYears,
          regulations: value.regulations,
          ...primaryScope(value),
          subjectType: value.subjectType,
          maxMarks: value.maxMarks,
          passMarks: value.passMarks,
          status: value.status,
          updatedBy: req.user?.id,
        },
      }
    );

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_SUBJECT',
      entity: 'SUBJECT',
      entityId: String(current._id),
      details: {
        code: value.code,
        fromCode: current.code,
        name: value.name,
        status: value.status,
        departments: value.departmentIds,
        semesters: value.semesters,
        academicYears: value.academicYears,
      },
      req,
    });

    const subject: any = await Subject.findById(current._id).lean();
    const departmentMap = await loadDepartmentMap();
    return sendSuccess(res, serialiseSubject(subject, undefined, departmentMap), 'Subject updated successfully.');
  } catch (err: any) {
    if (err?.name === 'ValidationError' || String(err?.message || '').toLowerCase().includes('unique')) {
      return sendError(res, 'Subject code must be unique within its department, semester and academic year.', 409);
    }
    console.error('updateSubject error:', err);
    return sendError(res, 'Failed to update the subject.', 500);
  }
}

/**
 * PATCH /api/admin/subjects/:subjectId/status
 * Activate / deactivate a subject (ADMIN). Deactivation is the intended way to
 * retire a subject: historical marks stay readable and the subject simply
 * stops being offered for new uploads.
 */
export async function setSubjectStatus(req: AuthRequest, res: Response): Promise<any> {
  try {
    const current: any = await Subject.findById(req.params.subjectId).lean();
    if (!current) return sendError(res, 'Subject not found.', 404);

    const raw = req.body?.status ?? (typeof req.body?.isActive === 'boolean' ? (req.body.isActive ? 'ACTIVE' : 'INACTIVE') : undefined);
    const status = String(raw ?? '').trim().toUpperCase();
    if (!isSubjectStatus(status)) {
      return sendError(res, `Status must be one of: ${SUBJECT_STATUSES.join(', ')}.`, 400);
    }

    const departmentMap = await loadDepartmentMap();
    if (status === (current.status ?? 'ACTIVE')) {
      const subject: any = await Subject.findById(current._id).lean();
      return sendSuccess(res, serialiseSubject(subject, undefined, departmentMap), `Subject is already ${status.toLowerCase()}.`);
    }

    await Subject.updateOne({ _id: current._id }, { $set: { status, updatedBy: req.user?.id } });

    await logAudit({
      userId: req.user!.id,
      action: status === 'ACTIVE' ? 'ACTIVATE_SUBJECT' : 'DEACTIVATE_SUBJECT',
      entity: 'SUBJECT',
      entityId: String(current._id),
      details: { code: current.code, status },
      req,
    });

    const subject: any = await Subject.findById(current._id).lean();
    return sendSuccess(
      res,
      serialiseSubject(subject, undefined, departmentMap),
      status === 'ACTIVE' ? 'Subject activated successfully.' : 'Subject deactivated successfully.'
    );
  } catch (err: any) {
    console.error('setSubjectStatus error:', err);
    return sendError(res, 'Failed to update the subject status.', 500);
  }
}

/**
 * DELETE /api/admin/subjects/:subjectId
 * Hard-delete ONLY a subject that has no marks records. A subject with any
 * recorded marks is refused and must be deactivated instead, so historical
 * records are never orphaned.
 */
export async function deleteSubject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const current: any = await Subject.findById(req.params.subjectId).lean();
    if (!current) return sendError(res, 'Subject not found.', 404);

    const usage = await computeSubjectUsage([current]);
    const entry = usage.get(String(current._id));
    if (entry && entry.marksRecords > 0) {
      return sendError(
        res,
        `This subject has ${entry.marksRecords} recorded mark(s) and cannot be deleted. Deactivate it instead to keep historical records intact.`,
        409
      );
    }

    await Subject.deleteOne({ _id: current._id });

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_SUBJECT',
      entity: 'SUBJECT',
      entityId: String(current._id),
      details: { code: current.code, name: current.name },
      req,
    });

    return sendSuccess(res, { id: String(current._id) }, 'Subject deleted successfully.');
  } catch (err: any) {
    console.error('deleteSubject error:', err);
    return sendError(res, 'Failed to delete the subject.', 500);
  }
}

/**
 * Exported helper for the marks workflow: the department's subjects for a set
 * of semesters, used by `getSubjectsForClass` to union the Admin catalogue with
 * any legacy marks-derived subjects.
 *
 * A subject matches when ANY of its selected departments is this department,
 * ANY of its selected semesters is in `semesters`, and ANY of its selected
 * academic years is `academicYear`. Not a route on its own — it deliberately
 * carries no HTTP concerns so the HOD controller can merge it without
 * duplicating the filter logic.
 */
export async function loadDepartmentSubjects(
  departmentId: string,
  opts: { academicYear?: string; semesters?: number[] } = {}
): Promise<any[]> {
  let deptId: string;
  try {
    deptId = toLocalId(departmentId);
  } catch {
    return [];
  }

  const subjects = await Subject.find({}).lean<any>();
  const matches = (subjects as any[]).filter((s) => {
    if (!subjectDepartments(s).includes(deptId)) return false;
    if (opts.academicYear && !subjectAcademicYears(s).includes(opts.academicYear)) return false;
    if (opts.semesters && opts.semesters.length > 0) {
      const semesters = subjectSemesters(s);
      if (!opts.semesters.some((n) => semesters.includes(n))) return false;
    }
    return true;
  });

  matches.sort((a, b) => (subjectSemesters(a)[0] ?? 0) - (subjectSemesters(b)[0] ?? 0) || String(a.code).localeCompare(String(b.code)));

  return matches.map((s) => ({
    ...s,
    subjectTypeLabel:
      SUBJECT_TYPE_LABEL[(s.subjectType ?? 'THEORY') as keyof typeof SUBJECT_TYPE_LABEL] ?? 'Theory',
  }));
}
