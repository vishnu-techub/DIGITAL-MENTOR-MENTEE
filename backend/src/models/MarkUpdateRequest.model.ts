import { defineModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';
import { MARK_TYPES, type InternalMarkType } from './InternalMark.model.js';

export type MarkUpdateRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * MENTOR MARK UPDATE (CORRECTION) REQUESTS — the post-expiry change path.
 * ---------------------------------------------------------------------------
 * A request NEVER changes the official mark by itself. The official InternalMark
 * row is written only when an Admin approves, and the approval re-validates the
 * stored request rather than trusting it.
 *
 * Historical requests are preserved forever (approved and rejected rows keep
 * requester, old value, requested value, reason, timestamps and the deciding
 * Admin), so the audit trail answers: who asked, what changed, from what, to
 * what, why, when, and who decided.
 */

export interface IMarkUpdateRequest extends LocalDocument {
  student: LocalId;
  registerNumber: string;
  studentName: string;
  semesterNumber: number;
  subjectCode: string;
  subjectName: string;

  markType: InternalMarkType;
  /** Official value at request time (null = never entered). */
  existingMark: number | null;
  requestedMark: number;

  reason: string;
  /** Optional free-text supporting note from the mentor. */
  supportingNote?: string;

  status: MarkUpdateRequestStatus;

  requestedBy: LocalId;
  requestedByName: string;
  requestedByRole?: string;
  requestedAt: Date;

  approvedBy?: LocalId;
  approvedByName?: string;
  approvedAt?: Date;
  /** The value actually written to the official mark on approval. */
  resolvedMark?: number;

  rejectedBy?: LocalId;
  rejectedByName?: string;
  rejectedAt?: Date;
  rejectionReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

const MarkUpdateRequestSchema = new Schema<IMarkUpdateRequest>(
  {
    student: {
      type: 'ObjectId',
      ref: 'Student',
      required: true,
      index: true,
    },
    registerNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    semesterNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
      index: true,
    },
    subjectCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    subjectName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    markType: {
      type: String,
      enum: [...MARK_TYPES],
      required: true,
    },
    existingMark: { type: Number, min: 0, max: 100 },
    requestedMark: { type: Number, required: true, min: 0, max: 100 },

    reason: {
      type: String,
      required: [true, 'A reason is required for a mark update request.'],
      trim: true,
      maxlength: 1000,
    },
    supportingNote: { type: String, trim: true, maxlength: 1000 },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },

    requestedBy: { type: 'ObjectId', ref: 'User', required: true },
    requestedByName: { type: String, required: true, trim: true },
    requestedByRole: { type: String, trim: true },
    requestedAt: { type: Date, required: true },

    approvedBy: { type: 'ObjectId', ref: 'User' },
    approvedByName: { type: String, trim: true },
    approvedAt: { type: Date },
    resolvedMark: { type: Number, min: 0, max: 100 },

    rejectedBy: { type: 'ObjectId', ref: 'User' },
    rejectedByName: { type: String, trim: true },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: true,
    collection: 'mark_update_requests',
  }
);

// Admin queue: one PENDING request per subject+type, newest first.
MarkUpdateRequestSchema.index(
  { student: 1, semesterNumber: 1, subjectCode: 1, markType: 1, status: 1 },
  { unique: false }
);
MarkUpdateRequestSchema.index({ status: 1, createdAt: -1 });

export const MarkUpdateRequest = defineModel<IMarkUpdateRequest>(
  'MarkUpdateRequest',
  MarkUpdateRequestSchema
);
