import {
  MarkEntryPermission,
  MARK_ENTRY_PERMISSION_KEY,
  type IMarkEntryPermission,
  type MarkEntryStatus,
} from '../../models/MarkEntryPermission.model.js';
import {
  isMarkType,
  MARK_TYPES,
  MARK_TYPE_MAX,
  MARK_TYPE_LABEL,
  MARK_TYPE_FIELD,
  type InternalMarkType,
} from '../../models/InternalMark.model.js';

/**
 * SERVER-AUTHORITATIVE MARK-ENTRY PERMISSION.
 * ---------------------------------------------------------------------------
 * Every decision about whether a mentor may edit IA1 / IA2 / End Semester RIGHT
 * NOW is made here, from the stored row plus `Date.now()` on the server clock.
 * The frontend receives the same state for display, but nothing is enforced by
 * hiding buttons: an expired window makes this service refuse the write even
 * when the API is called by hand.
 *
 * Status rules (fail-closed in every ambiguous case):
 *   no row / enabled=false            -> INACTIVE  (never enabled or manually disabled)
 *   enabled=true, expiresAt <= now    -> EXPIRED   (the configured days elapsed)
 *   enabled=true, expiresAt > now     -> ACTIVE    (only then is anything editable)
 *   enabled=true with no expiresAt    -> EXPIRED   (an unbounded window is never assumed)
 */

export interface MarkEntryPermissionState {
  status: MarkEntryStatus;
  /** Admin's stored switch (true even when the window has since expired). */
  enabled: boolean;
  markTypes: InternalMarkType[];
  /** Mark types editable RIGHT NOW — empty unless status is ACTIVE. */
  editableMarkTypes: InternalMarkType[];
  durationDays: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

const INACTIVE: MarkEntryPermissionState = {
  status: 'INACTIVE',
  enabled: false,
  markTypes: [],
  editableMarkTypes: [],
  durationDays: 0,
  startsAt: null,
  expiresAt: null,
  isActive: false,
};

export function computePermissionState(doc: IMarkEntryPermission | null): MarkEntryPermissionState {
  if (!doc) return { ...INACTIVE };

  const now = Date.now();
  const markTypes = (Array.isArray(doc.markTypes) ? doc.markTypes : []).filter(isMarkType);
  const startsAt = doc.startsAt ? new Date(doc.startsAt) : null;
  const expiresAt = doc.expiresAt ? new Date(doc.expiresAt) : null;

  let status: MarkEntryStatus;
  if (!doc.enabled) {
    status = 'INACTIVE';
  } else if (!expiresAt || Number(expiresAt.getTime()) <= now) {
    status = 'EXPIRED';
  } else {
    status = 'ACTIVE';
  }

  return {
    status,
    enabled: Boolean(doc.enabled),
    markTypes,
    editableMarkTypes: status === 'ACTIVE' ? markTypes : [],
    durationDays: Number(doc.durationDays) || 0,
    startsAt: startsAt ? startsAt.toISOString() : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    isActive: status === 'ACTIVE',
  };
}

/** Read the current permission state (single row, computed at read time). */
export async function getMarkEntryPermissionState(): Promise<MarkEntryPermissionState> {
  const doc = await MarkEntryPermission.findOne({ key: MARK_ENTRY_PERMISSION_KEY });
  return computePermissionState(doc);
}

/**
 * May `type` be written to an official mark right now?
 * Returns null when allowed, otherwise the client-facing refusal message.
 */
export function markTypeRefusal(
  state: MarkEntryPermissionState,
  type: InternalMarkType
): string | null {
  if (state.status === 'EXPIRED') {
    return 'Mark entry period has expired. You can raise a correction request with a reason.';
  }
  if (state.status === 'INACTIVE') {
    return 'Mark entry is not enabled. The administrator must enable mark entry before marks can be edited.';
  }
  if (!state.editableMarkTypes.includes(type)) {
    return `${MARK_TYPE_LABEL[type]} mark entry is not currently enabled. Enabled: ${
      state.markTypes.map((t) => MARK_TYPE_LABEL[t]).join(', ') || 'none'
    }.`;
  }
  return null;
}

export const MARK_TYPE_LIMITS = MARK_TYPE_MAX;
export const MARK_TYPE_FIELDS = MARK_TYPE_FIELD;
export const ALL_MARK_TYPES = MARK_TYPES;
