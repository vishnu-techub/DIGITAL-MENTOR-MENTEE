import { defineModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';
import { MARK_TYPES, type InternalMarkType } from './InternalMark.model.js';

/**
 * ADMIN-CONTROLLED MARK-ENTRY PERMISSION (singleton row).
 * ---------------------------------------------------------------------------
 * Exactly one logical document (key `mark_entry`) holds the CURRENT permission
 * state:
 *   enabled      — Admin's switch. false = manually disabled (blocks everything)
 *   markTypes    — which of IA1 / IA2 / END_SEM are editable right now
 *   durationDays — the window the Admin chose when enabling
 *   startsAt     — when the current window began
 *   expiresAt    — server-set start + durationDays; the ONLY expiry authority
 *
 * Automatic expiry is derived from `expiresAt` at read time by
 * mark-entry-permission.service.ts — nothing needs a cron job, and a stored
 * `enabled: true` whose window has passed is reported as EXPIRED, never ACTIVE.
 * The row is never deleted: it carries the audit trail of the current window.
 */

export type MarkEntryStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export interface IMarkEntryPermission extends LocalDocument {
  key: string;
  enabled: boolean;
  markTypes: InternalMarkType[];
  durationDays: number;
  startsAt?: Date;
  expiresAt?: Date;
  updatedBy?: LocalId;
  updatedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MarkEntryPermissionSchema = new Schema<IMarkEntryPermission>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    markTypes: {
      type: [String],
      enum: [...MARK_TYPES],
      default: [],
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      max: 365,
      default: 7,
    },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    updatedBy: { type: 'ObjectId', ref: 'User' },
    updatedByName: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'mark_entry_permissions',
  }
);

export const MarkEntryPermission = defineModel<IMarkEntryPermission>(
  'MarkEntryPermission',
  MarkEntryPermissionSchema
);

/** The single document key used by every read/write of the permission. */
export const MARK_ENTRY_PERMISSION_KEY = 'mark_entry';
