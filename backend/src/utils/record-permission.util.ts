import { ROLES, type Role } from '../config/constants.js';

/**
 * The student-record permission state machine.
 *
 *   PENDING -> APPROVED -> EDITING -> SUBMITTED -> CONFIRMED (terminal)
 *                  \                     /
 *                   \-> REJECTED <-------/
 *                        (resubmission path: REJECTED -> SUBMITTED)
 *
 * `Verified` is the persisted name of the CONFIRMED state. Uploading a
 * document NEVER produces it: only a mentor confirmation on a SUBMITTED record
 * does. See the transition table in `canTransition`.
 *
 * Every permission decision in the application is derived here, on the server.
 * The UI is handed the already-computed capability object over the wire and
 * renders it verbatim, so no state is ever guessed or invented client-side.
 */

export const RECORD_STATE = {
  /** Uploaded, waiting for a mentor to review the request. Student read-only. */
  PENDING: 'Pending',
  /** Mentor approved the request. Student may now edit and submit. */
  APPROVED: 'Approved',
  /** Student has the record open for editing. */
  EDITING: 'Editing',
  /** With the mentor awaiting review. Student read-only. */
  SUBMITTED: 'Submitted',
  /** Mentor-confirmed official record. Displayed as VERIFIED, permanently immutable. */
  CONFIRMED: 'Verified',
  /** Mentor requested changes. Student may correct and resubmit. */
  REJECTED: 'Rejected',
} as const;

export type RecordState = (typeof RECORD_STATE)[keyof typeof RECORD_STATE];

/**
 * The complete set of persisted states. Exported so the model enums, the
 * request-body allow-lists and the tests can never drift apart.
 */
export const RECORD_STATES: readonly RecordState[] = [
  RECORD_STATE.PENDING,
  RECORD_STATE.APPROVED,
  RECORD_STATE.EDITING,
  RECORD_STATE.SUBMITTED,
  RECORD_STATE.CONFIRMED,
  RECORD_STATE.REJECTED,
];

/** The states from which a mentor may still act. */
export const REVIEWABLE_STATES: readonly RecordState[] = [
  RECORD_STATE.PENDING,
  RECORD_STATE.SUBMITTED,
  RECORD_STATE.REJECTED,
];

/** The states in which the owning student may change the record. */
export const STUDENT_EDITABLE_STATES: readonly RecordState[] = [
  RECORD_STATE.APPROVED,
  RECORD_STATE.EDITING,
  RECORD_STATE.REJECTED,
];

/**
 * CONFIRMED is the official verified academic record: once a mentor has
 * confirmed it, nothing may change it. Enforced here, at the API layer, rather
 * than only in the UI.
 */
export const CONFIRMED_LOCK_REASON =
  'Verified by your mentor. This is an official academic record and is permanently locked — it cannot be edited, deleted or re-submitted.';

/** Shown wherever a student tries to act on a read-only state. */
export const READ_ONLY_REASONS: Readonly<Record<string, string>> = {
  [RECORD_STATE.PENDING]:
    'Waiting for mentor approval. This record is read-only until your mentor approves it.',
  [RECORD_STATE.SUBMITTED]:
    'Submitted and waiting for mentor review. This record is read-only while your mentor reviews it.',
  [RECORD_STATE.CONFIRMED]: CONFIRMED_LOCK_REASON,
};

/**
 * Legal transitions. Anything absent is rejected, which is what makes the
 * state machine un-bypassable: a caller cannot move a record from one state to
 * another simply by naming a different target.
 *
 * The `role` field is the role allowed to perform the transition; `'STUDENT'`
 * is always the owner of the record.
 */
const TRANSITIONS: ReadonlyArray<{
  from: RecordState;
  to: RecordState;
  role: Role | 'MENTOR';
}> = [
  // A fresh upload always lands in PENDING. It is never anything else.
  // A PENDING record can only be approved or sent back: it cannot be confirmed,
  // because CONFIRMED is reserved for a record the student has actually
  // submitted. There is deliberately no PENDING -> CONFIRMED edge.
  { from: RECORD_STATE.PENDING, to: RECORD_STATE.APPROVED, role: 'MENTOR' },
  { from: RECORD_STATE.PENDING, to: RECORD_STATE.REJECTED, role: 'MENTOR' },

  // Mentor approved -> the student may open it for editing.
  { from: RECORD_STATE.APPROVED, to: RECORD_STATE.EDITING, role: ROLES.STUDENT },
  { from: RECORD_STATE.APPROVED, to: RECORD_STATE.APPROVED, role: ROLES.STUDENT },
  { from: RECORD_STATE.APPROVED, to: RECORD_STATE.SUBMITTED, role: ROLES.STUDENT },

  // Editing in progress: keep editing, or submit for review.
  { from: RECORD_STATE.EDITING, to: RECORD_STATE.EDITING, role: ROLES.STUDENT },
  { from: RECORD_STATE.EDITING, to: RECORD_STATE.APPROVED, role: ROLES.STUDENT },
  { from: RECORD_STATE.EDITING, to: RECORD_STATE.SUBMITTED, role: ROLES.STUDENT },

  // Submitted is read-only for the student; only a mentor resolves it.
  { from: RECORD_STATE.SUBMITTED, to: RECORD_STATE.CONFIRMED, role: 'MENTOR' },
  { from: RECORD_STATE.SUBMITTED, to: RECORD_STATE.REJECTED, role: 'MENTOR' },

  // Resubmission path.
  { from: RECORD_STATE.REJECTED, to: RECORD_STATE.EDITING, role: ROLES.STUDENT },
  { from: RECORD_STATE.REJECTED, to: RECORD_STATE.SUBMITTED, role: ROLES.STUDENT },
  { from: RECORD_STATE.REJECTED, to: RECORD_STATE.REJECTED, role: ROLES.STUDENT },
  { from: RECORD_STATE.REJECTED, to: RECORD_STATE.APPROVED, role: 'MENTOR' },
];

/** Mentor-side roles, which act as the mentor of record. */
const MENTOR_ROLES: readonly Role[] = [ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN];

export function isMentorRole(role: Role | string | undefined | null): boolean {
  return !!role && MENTOR_ROLES.includes(role as Role);
}

export function isConfirmed(state: string | undefined | null): boolean {
  return state === RECORD_STATE.CONFIRMED;
}

/** A confirmed record is frozen; no transition of any kind is permitted. */
export function isTerminal(state: string | undefined | null): boolean {
  return isConfirmed(state);
}

/**
 * Is `to` reachable from `from` by an actor with `role`?
 *
 * `actor` is the *live* role of the caller, already proven to be either the
 * owning student or an authorised mentor/HOD/admin for that student by
 * `checkStudentAccess`. This function only decides the state-machine question.
 */
export function canTransition(
  from: string | undefined | null,
  to: string | undefined | null,
  role: Role | string | undefined | null
): boolean {
  if (isTerminal(from)) return false;
  if (!from || !to) return false;
  if (!isMentorRole(role)) return false; // a mentor action, and this is not a mentor
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.role === 'MENTOR');
}

/**
 * Student-owned transitions are the mirror image: the owner may move a record
 * out of a student-editable state, and a confirmed record is always refused.
 */
export function canStudentTransition(
  from: string | undefined | null,
  to: string | undefined | null
): boolean {
  if (isTerminal(from)) return false;
  if (!from || !to) return false;
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.role === ROLES.STUDENT);
}

/** The capability object the API hands to the client. */
export interface RecordPermissions {
  /** The persisted state, echoed back so the UI never has to derive it. */
  state: RecordState;
  /** Human label for the badge. CONFIRMED is displayed as VERIFIED. */
  label: string;
  /** One-line explanation of the current state, shown under the badge. */
  explanation: string;
  /** True when the record may not be changed by anyone. */
  locked: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  /** Mentor/HOD/admin: the record is awaiting this reviewer's decision. */
  canReview: boolean;
  /** Mentor/HOD/admin: this reviewer may confirm it to VERIFIED. */
  canConfirm: boolean;
  /** Mentor/HOD/admin: this reviewer may send it back for changes. */
  canReject: boolean;
  /**
   * Why an action is unavailable. Present exactly when the owning student
   * cannot edit, so the UI can explain rather than silently disable.
   */
  reason: string | null;
}

/**
 * Derive every capability from the persisted state and the caller's role.
 *
 * This is the ONLY place read-only vs editable is decided. Controllers send the
 * result to the client verbatim.
 */
export function deriveRecordPermissions(
  status: string | undefined | null,
  role: Role | string | undefined | null
): RecordPermissions {
  const state = (RECORD_STATES as readonly string[]).includes(status as string)
    ? (status as RecordState)
    : RECORD_STATE.PENDING;

  const isStudent = role === ROLES.STUDENT;
  const isMentor = isMentorRole(role);
  const locked = isTerminal(state);
  const studentEditable = STUDENT_EDITABLE_STATES.includes(state);
  const reviewable = REVIEWABLE_STATES.includes(state);

  // Edit and submit are the *owner's* actions. A mentor who opens a record for
  // review must not be handed them, even in an editable state: the record's
  // content is the student's to correct, and the mentor's decision is expressed
  // through review/confirm/reject instead.
  const canEdit = isStudent && studentEditable;
  const canSubmit = isStudent && studentEditable;

  return {
    state,
    label: state === RECORD_STATE.CONFIRMED ? 'VERIFIED' : state.toUpperCase(),
    explanation: EXPLANATIONS[state],
    locked,
    canEdit,
    // Delete is different: a mentor keeps a housekeeping delete for a record
    // that is not yet official. A confirmed record is immutable for everyone,
    // which the controllers enforce independently of this flag.
    canDelete: !locked && (canEdit || isMentor),
    canSubmit,
    canReview: isMentor && reviewable,
    canConfirm: isMentor && state === RECORD_STATE.SUBMITTED,
    canReject: isMentor && reviewable,
    // Only the owner is told *why* they cannot edit. A mentor's review surface
    // is driven by canReview/canConfirm, so a reason string there would be noise.
    reason: isStudent && !canEdit ? READ_ONLY_REASONS[state] ?? null : null,
  };
}

const EXPLANATIONS: Readonly<Record<RecordState, string>> = {
  [RECORD_STATE.PENDING]: 'Waiting for mentor approval.',
  [RECORD_STATE.APPROVED]: 'Approved — you can edit this record.',
  [RECORD_STATE.EDITING]: 'Editing in progress. Finish your changes and submit for review.',
  [RECORD_STATE.SUBMITTED]: 'Submitted — waiting for mentor review.',
  [RECORD_STATE.CONFIRMED]: 'Verified by mentor. Permanently locked.',
  [RECORD_STATE.REJECTED]: 'Changes requested by your mentor. Edit and resubmit.',
};
