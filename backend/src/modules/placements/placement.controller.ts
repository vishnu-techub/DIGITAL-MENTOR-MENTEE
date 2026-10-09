import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import {
  Department,
  Faculty,
  MentorAssignment,
  Placement,
  Student,
} from '../../models/index.js';
import {
  PLACEMENT_STATUSES,
  type PlacementStatus,
} from '../../models/Placement.model.js';
import {
  FINAL_YEAR,
  NOT_FINAL_YEAR_MESSAGE,
  allowedPlacementTransitions,
  buildPlacementSummary,
  canTransitionPlacementStatus,
  derivePlacementFields,
  emptyPlacementCounts,
  isFinalYearStudent,
  tallyPlacementStatus,
} from '../../utils/placement.util.js';
import {
  loadAccessibleStudent,
  resolveFacultyIdForUser,
} from '../../utils/access.util.js';
import { joinErrors, parseStrictNumber } from '../../utils/validation.util.js';

/**
 * ============================================================================
 * PLACEMENT MONITORING — FINAL-YEAR STUDENTS
 * ============================================================================
 *
 * Authorisation is layered exactly like the rest of the codebase:
 *   1. router-level `authenticate` (JWT),
 *   2. route-level `authorize(FACULTY, HOD, ADMIN)`,
 *   3. handler-level scope through `loadAccessibleStudent` — ADMIN college-wide,
 *      FACULTY own ACTIVE mentees only, HOD own department,
 *   4. final-year scoping from the authoritative `Student.year` field.
 *
 * The HOD aggregate endpoints never accept a department id from the client:
 * the scope is built from `req.user.departmentId` inside the handler, so a
 * manipulated query parameter cannot widen it.
 *
 * NO GPS / location data is read or emitted by this module.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isWriteRole(req: AuthRequest): boolean {
  return req.user?.role === ROLES.FACULTY || req.user?.role === ROLES.HOD || req.user?.role === ROLES.ADMIN;
}

function clampText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function parseStatus(input: unknown, field: string, errors: string[]): PlacementStatus | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const raw = String(input).trim().toUpperCase();
  if (!(PLACEMENT_STATUSES as readonly string[]).includes(raw)) {
    errors.push(`${field} must be one of ${PLACEMENT_STATUSES.join(', ')}.`);
    return undefined;
  }
  return raw as PlacementStatus;
}

function parseEnum(
  input: unknown,
  allowed: readonly string[],
  field: string,
  errors: string[]
): string | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const raw = String(input).trim().toUpperCase();
  const hit = allowed.find((a) => a.toUpperCase() === raw);
  if (!hit) {
    errors.push(`${field} must be one of ${allowed.join(', ')}.`);
    return undefined;
  }
  return hit;
}

export function serializePlacement(row: any): Record<string, any> {
  if (!row) return null as any;
  return {
    id: String(row._id),
    studentId: String(row.student),
    departmentId: String(row.department ?? ''),
    mentorId: row.mentor ? String(row.mentor) : '',
    registerNumber: row.registerNumber || '',
    trainingStatus: row.trainingStatus || 'NOT_STARTED',
    trainingProgress: typeof row.trainingProgress === 'number' ? row.trainingProgress : 0,
    trainingCompletionDate: row.trainingCompletionDate || '',
    assessmentStatus: row.assessmentStatus || 'NOT_STARTED',
    companyName: row.companyName || '',
    applicationStatus: row.applicationStatus || 'NOT_APPLIED',
    interviewStatus: row.interviewStatus || 'NOT_SCHEDULED',
    selectionStatus: row.selectionStatus || 'PENDING',
    overallStatus: row.overallStatus || 'NOT_STARTED',
    placed: row.placed === true,
    notPlaced: row.notPlaced === true,
    placementDate: row.placementDate || '',
    placedCompanyName: row.placedCompanyName || '',
    package: typeof row.package === 'number' ? row.package : null,
    salaryDetails: row.salaryDetails || '',
    mentorRemarks: row.mentorRemarks || '',
    createdBy: row.createdBy ? String(row.createdBy) : '',
    updatedBy: row.updatedBy ? String(row.updatedBy) : '',
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

/**
 * Load the target student, prove the caller may touch the record, and prove
 * the student is final-year. Returns null after writing the refusal.
 */
async function loadFinalYearStudent(req: AuthRequest, res: Response, studentId: string) {
  const { student, decision } = await loadAccessibleStudent(req.user, studentId);
  if (!student) {
    sendError(res, decision.message, decision.status);
    return null;
  }
  if (!isFinalYearStudent(student)) {
    sendError(
      res,
      `${NOT_FINAL_YEAR_MESSAGE} ${student.fullName} is in year ${student.year ?? 'unknown'}.`,
      400
    );
    return null;
  }
  return student;
}

interface ParsedPlacementBody {
  status?: PlacementStatus;
  trainingStatus?: string;
  trainingProgress?: number;
  trainingCompletionDate?: string;
  assessmentStatus?: string;
  companyName?: string;
  applicationStatus?: string;
  interviewStatus?: string;
  selectionStatus?: string;
  placementDate?: string;
  placedCompanyName?: string;
  packageValue?: number;
  salaryDetails?: string;
  mentorRemarks?: string;
}

function parsePlacementBody(body: any, requireStatus: boolean): { errors: string[]; value: ParsedPlacementBody } {
  const errors: string[] = [];
  const value: ParsedPlacementBody = {};

  const status = parseStatus(body?.overallStatus, 'Placement status', errors);
  if (requireStatus && !status) {
    if (body?.overallStatus === undefined || body?.overallStatus === null || body?.overallStatus === '') {
      errors.push('Placement status is required.');
    }
  }
  if (status) value.status = status;

  value.trainingStatus = parseEnum(
    body?.trainingStatus,
    ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NA'],
    'Training status',
    errors
  );
  value.assessmentStatus = parseEnum(
    body?.assessmentStatus,
    ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PASSED', 'FAILED'],
    'Assessment status',
    errors
  );
  value.applicationStatus = parseEnum(
    body?.applicationStatus,
    ['NOT_APPLIED', 'APPLIED', 'PENDING', 'REJECTED'],
    'Application status',
    errors
  );
  value.interviewStatus = parseEnum(
    body?.interviewStatus,
    ['NOT_SCHEDULED', 'SCHEDULED', 'COMPLETED', 'REJECTED'],
    'Interview status',
    errors
  );
  value.selectionStatus = parseEnum(
    body?.selectionStatus,
    ['PENDING', 'SELECTED', 'NOT_SELECTED', 'WAITLIST'],
    'Selection status',
    errors
  );

  if (body?.trainingProgress !== undefined && body?.trainingProgress !== null && body?.trainingProgress !== '') {
    const parsed = parseStrictNumber(body.trainingProgress, {
      field: 'Training progress',
      min: 0,
      max: 100,
    });
    if (!parsed.ok) errors.push(parsed.error!);
    else value.trainingProgress = parsed.value;
  }

  if (body?.package !== undefined && body?.package !== null && body?.package !== '') {
    const parsed = parseStrictNumber(body['package'], { field: 'Package (LPA)', min: 0, max: 200 });
    if (!parsed.ok) errors.push(parsed.error!);
    else value.packageValue = parsed.value;
  }

  if (body?.placementDate !== undefined && body?.placementDate !== null && body?.placementDate !== '') {
    const raw = String(body.placementDate).trim();
    if (!DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
      errors.push('Placement date must be a valid date in YYYY-MM-DD format.');
    } else {
      value.placementDate = raw;
    }
  }

  if (body?.trainingCompletionDate !== undefined && body?.trainingCompletionDate !== null && body?.trainingCompletionDate !== '') {
    const raw = String(body.trainingCompletionDate).trim();
    if (!DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
      errors.push('Training completion date must be a valid date in YYYY-MM-DD format.');
    } else {
      value.trainingCompletionDate = raw;
    }
  }

  if (body?.companyName !== undefined) value.companyName = clampText(body.companyName, 120);
  if (body?.placedCompanyName !== undefined) value.placedCompanyName = clampText(body.placedCompanyName, 120);
  if (body?.salaryDetails !== undefined) value.salaryDetails = clampText(body.salaryDetails, 300);
  if (body?.mentorRemarks !== undefined) value.mentorRemarks = clampText(body.mentorRemarks, 1000);

  if (value.mentorRemarks !== undefined && String(value.mentorRemarks).length > 1000) {
    errors.push('Mentor remarks must be at most 1000 characters.');
  }

  return { errors, value };
}

async function applyBodyToRow(
  req: AuthRequest,
  row: any,
  value: ParsedPlacementBody,
  student: any
): Promise<string[] | null> {
  const errors: string[] = [];
  const nextStatus: PlacementStatus = value.status ?? (row.overallStatus || 'NOT_STARTED');
  const currentStatus: PlacementStatus = row.overallStatus || 'NOT_STARTED';

  if (value.status && value.status !== currentStatus) {
    if (!canTransitionPlacementStatus(currentStatus, value.status)) {
      errors.push(
        `Placement status cannot move from ${currentStatus} to ${value.status}. Allowed from ${currentStatus}: ${
          allowedPlacementTransitions(currentStatus).join(', ') || 'none (PLACED is terminal)'
        }.`
      );
    }
  }

  if (nextStatus === 'PLACED') {
    const company = value.placedCompanyName || value.companyName || row.placedCompanyName || row.companyName || '';
    if (!String(company).trim()) {
      errors.push('A company name is required before a student can be marked PLACED.');
    }
  }

  if (errors.length > 0) return errors;

  const derived = derivePlacementFields(nextStatus);

  if (value.status !== undefined) row.overallStatus = nextStatus;
  row.placed = derived.placed;
  row.notPlaced = derived.notPlaced;

  if (value.trainingStatus !== undefined) row.trainingStatus = value.trainingStatus;
  if (value.trainingProgress !== undefined) row.trainingProgress = value.trainingProgress;
  if (value.trainingCompletionDate !== undefined) row.trainingCompletionDate = value.trainingCompletionDate;
  if (value.assessmentStatus !== undefined) row.assessmentStatus = value.assessmentStatus;
  if (value.companyName !== undefined) row.companyName = value.companyName;
  if (value.applicationStatus !== undefined) row.applicationStatus = value.applicationStatus;
  if (value.interviewStatus !== undefined) row.interviewStatus = value.interviewStatus;
  if (value.selectionStatus !== undefined) row.selectionStatus = value.selectionStatus;
  if (value.placementDate !== undefined) row.placementDate = value.placementDate;
  if (value.placedCompanyName !== undefined) row.placedCompanyName = value.placedCompanyName;
  if (value.packageValue !== undefined) row.package = value.packageValue;
  if (value.salaryDetails !== undefined) row.salaryDetails = value.salaryDetails;
  if (value.mentorRemarks !== undefined) row.mentorRemarks = value.mentorRemarks;

  // Keep the sub-statuses honest when the overall status is unambiguous.
  if (value.selectionStatus === undefined) {
    if (nextStatus === 'SELECTED' || nextStatus === 'PLACED') row.selectionStatus = 'SELECTED';
    else if (nextStatus === 'NOT_SELECTED') row.selectionStatus = 'NOT_SELECTED';
  }
  if (value.applicationStatus === undefined && nextStatus === 'APPLYING') {
    row.applicationStatus = 'APPLIED';
  }

  // Denormalised keys are always re-derived from the authoritative student row.
  row.student = student._id;
  row.department = student.department;
  row.registerNumber = student.registerNumber;
  if (req.user?.role === ROLES.FACULTY) {
    const mentorId = await resolveFacultyIdForUser(req.user);
    if (mentorId) row.mentor = mentorId;
  }
  row.updatedBy = req.user!.id;

  return null;
}

// ---------------------------------------------------------------------------
// Per-student record
// ---------------------------------------------------------------------------

export async function getPlacement(req: AuthRequest, res: Response) {
  try {
    const student = await loadFinalYearStudent(req, res, String(req.params.studentId ?? ''));
    if (!student) return res;

    const row = await Placement.findOne({ student: student._id });
    const mentorDoc = row?.mentor ? await Faculty.findById(String(row.mentor)).populate('user') : null;
    const mentorUser = (mentorDoc as any)?.user;

    return sendSuccess(res, {
      student: {
        id: String(student._id),
        registerNumber: student.registerNumber,
        fullName: student.fullName,
        year: student.year,
        section: student.section || '',
        departmentId: String(student.department ?? ''),
      },
      isFinalYear: true,
      finalYear: FINAL_YEAR,
      placement: row ? serializePlacement(row) : null,
      allowedTransitions: allowedPlacementTransitions((row?.overallStatus as PlacementStatus) || 'NOT_STARTED'),
      mentorName: mentorUser?.fullName || '',
    });
  } catch (err: any) {
    console.error('getPlacement error:', err);
    return sendError(res, 'Unable to load the placement record.', 500);
  }
}

export async function createPlacement(req: AuthRequest, res: Response) {
  try {
    if (!isWriteRole(req)) return sendError(res, 'You are not authorized to record placement data.', 403);

    const student = await loadFinalYearStudent(req, res, String(req.params.studentId ?? ''));
    if (!student) return res;

    const existing = await Placement.findOne({ student: student._id });
    if (existing) {
      return sendError(res, 'A placement record already exists for this student. Update it instead.', 409);
    }

    const { errors, value } = parsePlacementBody(req.body ?? {}, true);
    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    const status: PlacementStatus = value.status ?? 'NOT_STARTED';
    const derived = derivePlacementFields(status);
    if (status === 'PLACED' && !(value.placedCompanyName || value.companyName)) {
      return sendError(res, 'A company name is required before a student can be marked PLACED.', 400);
    }

    const mentorId = await resolveFacultyIdForUser(req.user);

    const created = await Placement.create({
      student: student._id,
      department: student.department,
      mentor: mentorId || undefined,
      registerNumber: student.registerNumber,
      overallStatus: status,
      placed: derived.placed,
      notPlaced: derived.notPlaced,
      trainingStatus: value.trainingStatus ?? 'NOT_STARTED',
      trainingProgress: value.trainingProgress ?? 0,
      trainingCompletionDate: value.trainingCompletionDate ?? '',
      assessmentStatus: value.assessmentStatus ?? 'NOT_STARTED',
      companyName: value.companyName ?? '',
      applicationStatus: value.applicationStatus ?? 'NOT_APPLIED',
      interviewStatus: value.interviewStatus ?? 'NOT_SCHEDULED',
      selectionStatus: value.selectionStatus ?? 'PENDING',
      placementDate: value.placementDate ?? '',
      placedCompanyName: value.placedCompanyName ?? '',
      package: value.packageValue,
      salaryDetails: value.salaryDetails ?? '',
      mentorRemarks: value.mentorRemarks ?? '',
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_PLACEMENT',
      entity: 'PLACEMENT',
      entityId: String(created._id),
      details: { registerNumber: student.registerNumber, overallStatus: status },
      req,
    });

    return sendSuccess(
      res,
      { placement: serializePlacement(created), allowedTransitions: allowedPlacementTransitions(status) },
      'Placement record created.',
      201
    );
  } catch (err: any) {
    console.error('createPlacement error:', err);
    return sendError(res, 'Unable to create the placement record.', 500);
  }
}

export async function updatePlacement(req: AuthRequest, res: Response) {
  try {
    if (!isWriteRole(req)) return sendError(res, 'You are not authorized to record placement data.', 403);

    const student = await loadFinalYearStudent(req, res, String(req.params.studentId ?? ''));
    if (!student) return res;

    const row = await Placement.findOne({ student: student._id });
    if (!row) {
      return sendError(res, 'No placement record exists for this student yet. Create it first.', 404);
    }

    const previousStatus = row.overallStatus || 'NOT_STARTED';

    const { errors, value } = parsePlacementBody(req.body ?? {}, false);
    if (errors.length > 0) return sendError(res, joinErrors(errors), 400);

    const rowErrors = await applyBodyToRow(req, row, value, student);
    if (rowErrors && rowErrors.length > 0) return sendError(res, joinErrors(rowErrors), 409);

    await row.save();

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_PLACEMENT',
      entity: 'PLACEMENT',
      entityId: String(row._id),
      details: {
        registerNumber: student.registerNumber,
        from: previousStatus,
        to: row.overallStatus,
        trainingProgress: row.trainingProgress,
        placed: row.placed,
      },
      req,
    });

    return sendSuccess(
      res,
      { placement: serializePlacement(row), allowedTransitions: allowedPlacementTransitions(row.overallStatus) },
      'Placement record updated.'
    );
  } catch (err: any) {
    console.error('updatePlacement error:', err);
    return sendError(res, 'Unable to update the placement record.', 500);
  }
}

// ---------------------------------------------------------------------------
// Shared row builder
// ---------------------------------------------------------------------------

interface ScopeRow {
  studentId: string;
  registerNumber: string;
  fullName: string;
  year: number;
  section: string;
  departmentId: string;
  mentorId: string;
  mentorName: string;
  hasRecord: boolean;
  overallStatus: PlacementStatus;
  trainingStatus: string;
  trainingProgress: number;
  assessmentStatus: string;
  applicationStatus: string;
  interviewStatus: string;
  selectionStatus: string;
  companyName: string;
  placedCompanyName: string;
  placed: boolean;
  placementDate: string;
  package: number | null;
  mentorRemarks: string;
}

function buildScopeRows(students: any[], placements: any[], mentorNames: Map<string, string>): ScopeRow[] {
  const byStudent = new Map<string, any>();
  for (const p of placements as any[]) byStudent.set(String(p.student), p);

  return students.map((s: any) => {
    const p = byStudent.get(String(s._id));
    return {
      studentId: String(s._id),
      registerNumber: s.registerNumber,
      fullName: s.fullName,
      year: Number(s.year ?? 0),
      section: s.section || '',
      departmentId: String(s.department ?? ''),
      mentorId: p?.mentor ? String(p.mentor) : '',
      mentorName: mentorNames.get(String(p?.mentor ?? '')) || '',
      hasRecord: Boolean(p),
      overallStatus: (p?.overallStatus as PlacementStatus) || 'NOT_STARTED',
      trainingStatus: p?.trainingStatus || 'NOT_STARTED',
      trainingProgress: typeof p?.trainingProgress === 'number' ? p.trainingProgress : 0,
      assessmentStatus: p?.assessmentStatus || 'NOT_STARTED',
      applicationStatus: p?.applicationStatus || 'NOT_APPLIED',
      interviewStatus: p?.interviewStatus || 'NOT_SCHEDULED',
      selectionStatus: p?.selectionStatus || 'PENDING',
      companyName: p?.companyName || '',
      placedCompanyName: p?.placedCompanyName || '',
      placed: p?.placed === true,
      placementDate: p?.placementDate || '',
      package: typeof p?.package === 'number' ? p.package : null,
      mentorRemarks: p?.mentorRemarks || '',
    };
  });
}

function summariseRows(rows: ScopeRow[]) {
  const counts = emptyPlacementCounts();
  let withRecord = 0;
  for (const row of rows) {
    tallyPlacementStatus(counts, row.overallStatus);
    if (row.hasRecord) withRecord += 1;
  }
  return { counts, summary: buildPlacementSummary(rows.length, counts, withRecord) };
}

async function loadMentorNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return names;
  const docs = await Faculty.find({ _id: { $in: unique } }).populate('user').lean();
  for (const f of docs as any[]) {
    names.set(String(f._id), String((f.user as any)?.fullName || 'Faculty Mentor'));
  }
  return names;
}

// ---------------------------------------------------------------------------
// Mentor scope — assigned mentees only
// ---------------------------------------------------------------------------

export async function getMentorPlacements(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.FACULTY) {
      return sendError(res, 'Access denied. Mentor (faculty) access required.', 403);
    }
    const mentorId = await resolveFacultyIdForUser(req.user);
    if (!mentorId) {
      return sendError(res, 'Your account is not linked to a faculty profile. Mentor access requires one.', 403);
    }

    const assignments = await MentorAssignment.find({ mentor: mentorId, status: 'ACTIVE' })
      .select('student')
      .lean();
    const menteeIds = (assignments as any[]).map((a) => String(a.student));

    const students =
      menteeIds.length > 0
        ? await Student.find({ _id: { $in: menteeIds }, year: FINAL_YEAR, isActive: true })
            .populate('department')
            .sort({ registerNumber: 1 })
            .lean()
        : [];

    const studentIds = (students as any[]).map((s: any) => String(s._id));
    const placements =
      studentIds.length > 0 ? await Placement.find({ student: { $in: studentIds } }).lean() : [];

    const mentorNames = await loadMentorNames(
      (placements as any[]).map((p: any) => (p.mentor ? String(p.mentor) : ''))
    );
    const rows = buildScopeRows(students as any[], placements as any[], mentorNames);
    for (const row of rows) {
      if (!row.mentorName) row.mentorName = req.user!.fullName;
      row.mentorId = row.mentorId || mentorId;
    }
    const { summary } = summariseRows(rows);

    return sendSuccess(res, {
      scope: 'MENTEES',
      finalYear: FINAL_YEAR,
      menteeCount: menteeIds.length,
      finalYearStudents: rows.length,
      summary,
      students: rows,
      definitions: {
        totalFinalYearStudents: 'Active mentees whose authoritative Student.year is 4.',
        placementPercentage: 'PLACED final-year students / total final-year students, rounded to a whole percent.',
        inProgress: 'Final-year students whose status is neither PLACED nor NOT_PLACED.',
      },
    });
  } catch (err: any) {
    console.error('getMentorPlacements error:', err);
    return sendError(res, 'Unable to load mentor placement data.', 500);
  }
}

// ---------------------------------------------------------------------------
// HOD scope — own department only, server-derived
// ---------------------------------------------------------------------------

async function loadHodDepartment(req: AuthRequest, res: Response) {
  const user = req.user;
  if (!user || user.role !== ROLES.HOD) {
    sendError(res, 'Access denied. HOD access required.', 403);
    return null;
  }
  if (!user.departmentId) {
    sendError(res, 'Your account is not linked to a department. HOD access requires one.', 403);
    return null;
  }
  const department = await Department.findById(user.departmentId);
  if (!department) {
    sendError(res, 'Department not found.', 404);
    return null;
  }
  return department;
}

interface HodPlacementScope {
  department: any;
  students: any[];
  placements: any[];
  mentorNames: Map<string, string>;
  faculty: any[];
  assignments: any[];
}

async function loadHodPlacementScope(req: AuthRequest, res: Response): Promise<HodPlacementScope | null> {
  const department = await loadHodDepartment(req, res);
  if (!department) return null;

  const deptId = String(department._id);
  const [students, placements, faculty, assignments] = await Promise.all([
    Student.find({ department: deptId, year: FINAL_YEAR, isActive: true }).sort({ registerNumber: 1 }).lean(),
    Placement.find({ department: deptId }).lean(),
    Faculty.find({ department: deptId }).populate('user').lean(),
    MentorAssignment.find({ department: deptId, status: 'ACTIVE' }).lean(),
  ]);

  const mentorNames = new Map<string, string>();
  for (const f of faculty as any[]) {
    mentorNames.set(String(f._id), String((f.user as any)?.fullName || 'Faculty Mentor'));
  }

  // A placement row that names a mentor outside the loaded list still resolves.
  for (const p of placements as any[]) {
    const id = p.mentor ? String(p.mentor) : '';
    if (id && !mentorNames.has(id)) mentorNames.set(id, 'Faculty Mentor');
  }

  return { department, students: students as any[], placements: placements as any[], mentorNames, faculty: faculty as any[], assignments: assignments as any[] };
}

export async function getHodPlacementSummary(req: AuthRequest, res: Response) {
  try {
    const scope = await loadHodPlacementScope(req, res);
    if (!scope) return res;

    const studentIds = new Set(scope.students.map((s: any) => String(s._id)));
    const inScopePlacements = scope.placements.filter((p: any) => studentIds.has(String(p.student)));
    const rows = buildScopeRows(scope.students, inScopePlacements, scope.mentorNames);
    const { summary } = summariseRows(rows);

    return sendSuccess(res, {
      scope: 'DEPARTMENT',
      department: {
        id: String(scope.department._id),
        name: scope.department.name,
        code: scope.department.code,
      },
      finalYear: FINAL_YEAR,
      summary,
      statusDistribution: {
        NOT_STARTED: summary.notStarted,
        TRAINING: summary.training,
        APPLYING: summary.applying,
        INTERVIEW: summary.interview,
        SELECTED: summary.selected,
        NOT_SELECTED: summary.notSelected,
        PLACED: summary.placed,
        NOT_PLACED: summary.notPlaced,
      },
      definitions: {
        totalFinalYearStudents: 'Active students of this department whose authoritative Student.year is 4.',
        placed: 'Final-year students with placement status PLACED.',
        notPlaced: 'Final-year students with placement status NOT_PLACED (declined / not offered).',
        inProgress: 'Final-year students still at NOT_STARTED, TRAINING, APPLYING, INTERVIEW, SELECTED or NOT_SELECTED.',
        placementPercentage: 'PLACED / total final-year students, rounded to a whole percent.',
        withoutRecord: 'Final-year students who have no stored placement row yet; they count as NOT_STARTED.',
      },
    });
  } catch (err: any) {
    console.error('getHodPlacementSummary error:', err);
    return sendError(res, 'Unable to load the department placement summary.', 500);
  }
}

export async function getHodMentorWisePlacements(req: AuthRequest, res: Response) {
  try {
    const scope = await loadHodPlacementScope(req, res);
    if (!scope) return res;

    const studentById = new Map(scope.students.map((s: any) => [String(s._id), s]));
    const studentIds = new Set(studentById.keys());
    const placementByStudent = new Map<string, any>();
    for (const p of scope.placements as any[]) {
      const sid = String(p.student);
      if (studentIds.has(sid)) placementByStudent.set(sid, p);
    }

    // Mentor-wise coverage is driven by ACTIVE assignments, never by a client
    // supplied mentor id.
    const menteesByMentor = new Map<string, any[]>();
    for (const a of scope.assignments as any[]) {
      const mentorId = String(a.mentor);
      const student = studentById.get(String(a.student));
      if (!student) continue;
      if (!menteesByMentor.has(mentorId)) menteesByMentor.set(mentorId, []);
      menteesByMentor.get(mentorId)!.push(student);
    }

    const mentorRows: any[] = [];
    for (const [mentorId, students] of menteesByMentor) {
      const counts = emptyPlacementCounts();
      let withRecord = 0;
      for (const s of students) {
        const p = placementByStudent.get(String(s._id));
        tallyPlacementStatus(counts, (p?.overallStatus as PlacementStatus) || 'NOT_STARTED');
        if (p) withRecord += 1;
      }
      const summary = buildPlacementSummary(students.length, counts, withRecord);
      mentorRows.push({
        mentorId,
        mentorName: scope.mentorNames.get(mentorId) || 'Faculty Mentor',
        finalYearMentees: students.length,
        withRecord,
        placed: summary.placed,
        notPlaced: summary.notPlaced,
        inProgress: summary.inProgress,
        training: summary.training,
        applying: summary.applying,
        interview: summary.interview,
        selected: summary.selected,
        notSelected: summary.notSelected,
        notStarted: summary.notStarted,
        placementPercentage: summary.placementPercentage,
      });
    }

    mentorRows.sort((a, b) => b.placed - a.placed || b.placementPercentage - a.placementPercentage || a.mentorName.localeCompare(b.mentorName));

    return sendSuccess(res, {
      scope: 'DEPARTMENT',
      department: { id: String(scope.department._id), name: scope.department.name, code: scope.department.code },
      finalYear: FINAL_YEAR,
      mentors: mentorRows,
      unassignedFinalYear: scope.students
        .filter((s: any) => !scope.assignments.some((a: any) => String(a.student) === String(s._id)))
        .map((s: any) => ({ studentId: String(s._id), registerNumber: s.registerNumber, fullName: s.fullName })),
    });
  } catch (err: any) {
    console.error('getHodMentorWisePlacements error:', err);
    return sendError(res, 'Unable to load mentor-wise placement progress.', 500);
  }
}

export async function getHodStudentWisePlacements(req: AuthRequest, res: Response) {
  try {
    const scope = await loadHodPlacementScope(req, res);
    if (!scope) return res;

    const studentIds = new Set(scope.students.map((s: any) => String(s._id)));
    const inScopePlacements = scope.placements.filter((p: any) => studentIds.has(String(p.student)));
    const rows = buildScopeRows(scope.students, inScopePlacements, scope.mentorNames);
    const { summary } = summariseRows(rows);

    const statusFilter = String(req.query.status ?? '').trim().toUpperCase();
    const filtered =
      statusFilter && (PLACEMENT_STATUSES as readonly string[]).includes(statusFilter)
        ? rows.filter((r) => r.overallStatus === statusFilter)
        : rows;

    return sendSuccess(res, {
      scope: 'DEPARTMENT',
      department: { id: String(scope.department._id), name: scope.department.name, code: scope.department.code },
      finalYear: FINAL_YEAR,
      summary,
      statusFilter: statusFilter || 'ALL',
      total: filtered.length,
      students: filtered,
    });
  } catch (err: any) {
    console.error('getHodStudentWisePlacements error:', err);
    return sendError(res, 'Unable to load student-wise placement progress.', 500);
  }
}
