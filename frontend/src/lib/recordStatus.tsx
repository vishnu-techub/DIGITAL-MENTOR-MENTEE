import type { ReactNode } from 'react';
import {
  Clock,
  PencilLine,
  Send,
  ShieldCheck,
  RotateCcw,
  Lock,
  CheckCircle2,
  XCircle,
  LockKeyholeOpen,
} from 'lucide-react';

/**
 * Presentation for the backend permission state machine.
 *
 * IMPORTANT: this module contains NO permission logic. It must not decide what
 * is editable, what a mentor may do, or which buttons to show. Those decisions
 * are made on the server in `backend/src/utils/record-permission.util.ts` and
 * arrive on every record as `record.permissions`. This file only maps a state
 * to a badge, an icon and a colour, so all three components render one
 * consistent vocabulary instead of three divergent inline ternaries.
 *
 * If a state arrives that this module does not know, it is rendered as an
 * explicit UNKNOWN badge rather than silently defaulting to "pending", so a
 * backend state can never be visually disguised as a different one.
 */

export type RecordState =
  | 'Pending'
  | 'Approved'
  | 'Editing'
  | 'Submitted'
  | 'Verified'
  | 'Rejected';

/** Mirrors `RecordPermissions` in the backend. */
export interface RecordPermissions {
  state: RecordState;
  label: string;
  explanation: string;
  locked: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canConfirm: boolean;
  canReject: boolean;
  reason: string | null;
}

/**
 * The authoritative shape a caller should use. If the backend did not send a
 * permission set, this returns null and the caller must render read-only with
 * the reason below — it must never fall back to guessing.
 */
export function readPermissions(record: unknown): RecordPermissions | null {
  const p = (record as { permissions?: RecordPermissions } | null)?.permissions;
  if (!p || typeof p !== 'object' || typeof p.state !== 'string') return null;
  return p;
}

/**
 * The state to render. Prefers the backend's permission payload, then the raw
 * status field. Never invents a value.
 */
export function readState(record: unknown): RecordState | null {
  const perms = readPermissions(record);
  if (perms?.state) return perms.state;
  const raw =
    (record as { verificationStatus?: string } | null)?.verificationStatus ??
    (record as { status?: string } | null)?.status;
  return typeof raw === 'string' ? (raw as RecordState) : null;
}

interface StatePresentation {
  badge: string;
  Icon: typeof Clock;
  /** The short explanation shown beneath the badge. */
  hint: string;
  /**
   * The affordance label for a read-only state, or null when the record is
   * editable. The caller renders a disabled control with this as its reason
   * rather than hiding the action without explanation.
   */
  readOnly: string | null;
}

const PRESENTATION: Record<RecordState, StatePresentation> = {
  Pending: {
    badge: 'badge-warning',
    Icon: Clock,
    hint: 'Waiting for mentor approval.',
    readOnly: 'Read-only while waiting for mentor approval',
  },
  Approved: {
    badge: 'badge-info',
    Icon: LockKeyholeOpen,
    hint: 'Approved — you can edit this record.',
    readOnly: null,
  },
  Editing: {
    badge: 'badge-info',
    Icon: PencilLine,
    hint: 'Editing in progress.',
    readOnly: null,
  },
  Submitted: {
    badge: 'badge-warning',
    Icon: Send,
    hint: 'Submitted — waiting for mentor review.',
    readOnly: 'Read-only while your mentor reviews it',
  },
  Verified: {
    badge: 'badge-success',
    Icon: ShieldCheck,
    hint: 'Verified by Mentor. Permanently locked.',
    readOnly: 'Permanently locked',
  },
  Rejected: {
    badge: 'badge-danger',
    Icon: RotateCcw,
    hint: 'Changes requested by Mentor.',
    readOnly: null,
  },
};

function presentationFor(state: RecordState | null): StatePresentation {
  if (state && state in PRESENTATION) return PRESENTATION[state];
  return {
    badge: 'badge-neutral',
    Icon: CheckCircle2,
    hint: 'Unrecognised record state.',
    readOnly: 'Unrecognised state — treated as read-only',
  };
}

/**
 * The status badge. `label` and `explanation` come from the backend so the
 * wording can never drift from the server's own description of the state.
 */
export function RecordStatusBadge({
  record,
  size = 12,
}: {
  record: unknown;
  size?: number;
}) {
  const state = readState(record);
  const perms = readPermissions(record);
  const { badge, Icon } = presentationFor(state);
  const label = perms?.label ?? (state ? state.toUpperCase() : 'UNKNOWN');

  return (
    <span
      className={`badge ${badge}`}
      title={perms?.explanation ?? 'The backend did not describe this state.'}
    >
      <Icon size={size} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The one-line explanation plus, when the record is read-only for this user,
 * the reason. Renders nothing when the backend supplied no explanation, rather
 * than inventing one.
 */
export function RecordStateHint({ record }: { record: unknown }) {
  const state = readState(record);
  const perms = readPermissions(record);
  const { hint, readOnly } = presentationFor(state);

  const explanation = perms?.explanation ?? hint;
  const reason = perms?.reason;

  if (!reason) {
    return <span className="record-state-hint">{explanation}</span>;
  }

  return (
    <span className="record-state-hint record-state-hint--locked">
      <Lock size={12} aria-hidden="true" />
      {reason}
    </span>
  );
}

/**
 * A control that is unavailable in the current state. Rendered INSTEAD of
 * silently disabling a button, so the reason is always visible.
 */
export function UnavailableAction({ reason }: { reason: ReactNode }) {
  return (
    <span className="unavailable-action" title={typeof reason === 'string' ? reason : undefined}>
      <Lock size={12} aria-hidden="true" />
      {reason}
    </span>
  );
}

/** Icon for a rejected record, used where a rejection is displayed inline. */
export function RejectionIcon({ size = 12 }: { size?: number }) {
  return <XCircle size={size} aria-hidden="true" />;
}

/**
 * Every persisted state, for filter controls. Kept in the same order as the
 * backend's `RECORD_STATES` so the two never drift into different vocabularies.
 */
export const RECORD_STATES: readonly RecordState[] = [
  'Pending',
  'Approved',
  'Editing',
  'Submitted',
  'Verified',
  'Rejected',
];
