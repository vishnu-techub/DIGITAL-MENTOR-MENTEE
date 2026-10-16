import { defineModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

/**
 * SUBJECT MASTER — the Admin-managed catalogue of subjects that marks are
 * entered and uploaded against.
 * ---------------------------------------------------------------------------
 * Until now a subject only existed implicitly: an `InternalMark` row stored a
 * free-text `subjectCode` / `subjectName` and the HOD's "subject" dropdown was
 * derived from whatever codes already had marks. That made it impossible for an
 * Admin to define the subjects a department is allowed to record marks for.
 *
 * This collection is that definition. It is ADDITIVE and OPTIONAL:
 *
 *   - A subject is scoped by a SET of departments, semesters, academic years and
 *     regulations: the same subject may be taught to several departments, in
 *     several semesters and across several cohorts. The same `code` may
 *     therefore exist for two disjoint scopes, but never with an overlapping
 *     one (see the controller's conflict check).
 *   - Marks are still stored denormalised on the `InternalMark` row, exactly as
 *     before, so historical records keep displaying the subject information
 *     they were written with even if the catalogue entry is later edited or
 *     deactivated. Editing a Subject NEVER rewrites an existing mark.
 *   - The marks upload only consults this catalogue when a matching entry
 *     exists, so departments that have not been set up yet keep working with
 *     the legacy free-form subject codes.
 *
 * MULTI-SELECT STORAGE
 *
 * The canonical scope lives in the four arrays (`departments`, `semesters`,
 * `academicYears`, `regulations`). The original scalar fields (`department`,
 * `semester`, `academicYear`, `regulation`) are kept in sync as the FIRST
 * element of each array: they preserve the existing unique index, the existing
 * API shape and every legacy reader, and `backfillSubjectScopes()` upgrades a
 * record written before multi-select existed by copying its scalars into the
 * arrays. The account store's query matcher cannot test membership on a
 * top-level array field, so callers compare scope in JavaScript via the
 * `subjectDepartments` / `subjectSemesters` / … helpers exported here.
 */

export const SUBJECT_TYPES = ['THEORY', 'PRACTICAL', 'PROJECT', 'ELECTIVE'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  THEORY: 'Theory',
  PRACTICAL: 'Practical',
  PROJECT: 'Project',
  ELECTIVE: 'Elective',
};

export const SUBJECT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

/** Semester number the subject is taught in — 1..8. */
export const SUBJECT_SEMESTER_MIN = 1;
export const SUBJECT_SEMESTER_MAX = 8;

/** Institution-wide mark scales a single subject may carry. */
export const SUBJECT_MAX_MARKS_MIN = 1;
export const SUBJECT_MAX_MARKS_MAX = 1000;

export function isSubjectType(value: unknown): value is SubjectType {
  return typeof value === 'string' && (SUBJECT_TYPES as readonly string[]).includes(value.toUpperCase());
}

export function isSubjectStatus(value: unknown): value is SubjectStatus {
  return typeof value === 'string' && (SUBJECT_STATUSES as readonly string[]).includes(value.toUpperCase());
}

/** Normalise a user-supplied subject type to its stored enum value, or null. */
export function normaliseSubjectType(value: unknown): SubjectType | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return isSubjectType(upper) ? (upper as SubjectType) : null;
}

export interface ISubject extends LocalDocument {
  code: string;
  name: string;

  /** Canonical multi-select scope — one or more of each. */
  departments: LocalId[];
  semesters: number[];
  academicYears: string[];
  regulations: string[];

  /**
   * Backward-compatible scalar mirrors: the first element of each array. These
   * keep the legacy unique index, the legacy API contract and any pre-existing
   * reader working unchanged.
   */
  department: LocalId;
  semester: number;
  /** Cohort session label, e.g. "2024-2028", matching the Batch naming. */
  academicYear: string;
  /** Regulation / syllabus, e.g. "R2021". Optional. */
  regulation?: string;

  subjectType: SubjectType;
  /** Maximum marks for the subject as a whole (theory 100, practical 50, ...). */
  maxMarks: number;
  /** Minimum pass mark, always <= maxMarks. */
  passMarks: number;
  status: SubjectStatus;

  createdBy?: LocalId;
  updatedBy?: LocalId;

  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<ISubject>(
  {
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      uppercase: true,
      trim: true,
      maxlength: 30,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
      maxlength: 150,
      index: true,
    },

    // ── Multi-select scope (canonical) ──────────────────────────────────────
    departments: {
      type: [String],
      required: [true, 'At least one department is required'],
      default: () => [],
    },
    semesters: {
      type: [Number],
      required: [true, 'At least one semester is required'],
      default: () => [],
    },
    academicYears: {
      type: [String],
      required: [true, 'At least one academic year is required'],
      default: () => [],
    },
    regulations: {
      type: [String],
      default: () => [],
    },

    // ── Scalar mirrors (first element of each array) ────────────────────────
    department: {
      type: 'ObjectId',
      ref: 'Department',
      required: [true, 'Department is required'],
      index: true,
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: SUBJECT_SEMESTER_MIN,
      max: SUBJECT_SEMESTER_MAX,
      index: true,
    },
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      trim: true,
      index: true,
    },
    regulation: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },

    subjectType: {
      type: String,
      enum: SUBJECT_TYPES,
      default: 'THEORY',
    },
    maxMarks: {
      type: Number,
      required: [true, 'Maximum marks are required'],
      min: SUBJECT_MAX_MARKS_MIN,
      max: SUBJECT_MAX_MARKS_MAX,
    },
    passMarks: {
      type: Number,
      required: [true, 'Pass marks are required'],
      min: 0,
      max: SUBJECT_MAX_MARKS_MAX,
    },
    status: {
      type: String,
      enum: SUBJECT_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    createdBy: { type: 'ObjectId', ref: 'User' },
    updatedBy: { type: 'ObjectId', ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'subjects',
  }
);

// A subject code is unique inside its primary academic scope: same department,
// same semester and same academic year (the first element of each multi-select
// field). The controller additionally rejects any OVERLAP between two subjects
// that share a code, which this single index cannot express on its own.
SubjectSchema.index(
  { code: 1, department: 1, semester: 1, academicYear: 1 },
  { unique: true }
);

export const Subject = defineModel<ISubject>('Subject', SubjectSchema);

/* ===========================================================================
 * Scope helpers
 * ===========================================================================
 * The canonical record stores arrays; a legacy record stores scalars only. Every
 * helper below therefore derives the EFFECTIVE scope, so old and new records
 * behave identically everywhere.
 */

/** Resolve a possibly-populated reference to its id string. */
function refId(value: any): string {
  if (value && typeof value === 'object' && '_id' in value) return String(value._id);
  return value === null || value === undefined ? '' : String(value);
}

function uniqueStrings(values: any[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Effective department ids (never empty for a valid subject). */
export function subjectDepartments(subject: any): string[] {
  if (Array.isArray(subject?.departments) && subject.departments.length > 0) {
    return uniqueStrings(subject.departments.map(refId));
  }
  const single = refId(subject?.department);
  return single ? [single] : [];
}

/** Effective semesters, ascending and de-duplicated. */
export function subjectSemesters(subject: any): number[] {
  const raw =
    Array.isArray(subject?.semesters) && subject.semesters.length > 0
      ? subject.semesters
      : subject?.semester !== undefined && subject?.semester !== null
      ? [subject.semester]
      : [];
  const out: number[] = [];
  for (const value of raw) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= SUBJECT_SEMESTER_MIN && n <= SUBJECT_SEMESTER_MAX && !out.includes(n)) {
      out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Effective academic-year labels (e.g. "2024-2028"). */
export function subjectAcademicYears(subject: any): string[] {
  if (Array.isArray(subject?.academicYears) && subject.academicYears.length > 0) {
    return uniqueStrings(subject.academicYears);
  }
  const single = String(subject?.academicYear ?? '').trim();
  return single ? [single] : [];
}

/** Effective regulations (may legitimately be empty). */
export function subjectRegulations(subject: any): string[] {
  if (Array.isArray(subject?.regulations) && subject.regulations.length > 0) {
    return uniqueStrings(subject.regulations).map((r) => r.toUpperCase());
  }
  const single = String(subject?.regulation ?? '').trim();
  return single ? [single.toUpperCase()] : [];
}

/** The effective multi-select scope of a stored subject in one object. */
export function normaliseSubjectScopes(subject: any): {
  departments: string[];
  semesters: number[];
  academicYears: string[];
  regulations: string[];
} {
  return {
    departments: subjectDepartments(subject),
    semesters: subjectSemesters(subject),
    academicYears: subjectAcademicYears(subject),
    regulations: subjectRegulations(subject),
  };
}

/** True when a stored subject applies to the given department + semester (+ year). */
export function subjectAppliesTo(
  subject: any,
  opts: { departmentId?: string; semester?: number; academicYear?: string }
): boolean {
  const scopes = normaliseSubjectScopes(subject);
  if (opts.departmentId && !scopes.departments.includes(String(opts.departmentId))) return false;
  if (opts.semester !== undefined && !scopes.semesters.includes(Number(opts.semester))) return false;
  if (opts.academicYear) {
    // An academic year is only a constraint when the subject declares one; a
    // subject always declares at least one, but legacy rows are treated as
    // matching any year rather than silently disappearing.
    if (scopes.academicYears.length > 0 && !scopes.academicYears.includes(opts.academicYear)) return false;
  }
  return true;
}

/**
 * Upgrade a record written before multi-select existed by copying its scalar
 * scope into the arrays. Idempotent: a record that already has arrays is left
 * untouched. Returns the number of records changed.
 */
export async function backfillSubjectScopes(): Promise<number> {
  const subjects = await Subject.find({}).lean<any>();
  let changed = 0;
  for (const subject of subjects as any[]) {
    const departments = subjectDepartments(subject);
    const semesters = subjectSemesters(subject);
    const academicYears = subjectAcademicYears(subject);
    const regulations = subjectRegulations(subject);

    const missingArrays =
      !Array.isArray(subject.departments) ||
      subject.departments.length === 0 ||
      !Array.isArray(subject.semesters) ||
      subject.semesters.length === 0 ||
      !Array.isArray(subject.academicYears) ||
      subject.academicYears.length === 0 ||
      regulations.length > 0 &&
        (!Array.isArray(subject.regulations) || subject.regulations.length === 0);

    if (!missingArrays) continue;

    await Subject.updateOne(
      { _id: subject._id },
      { $set: { departments, semesters, academicYears, regulations } }
    );
    changed++;
  }
  return changed;
}
