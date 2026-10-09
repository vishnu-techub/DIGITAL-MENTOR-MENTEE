import { defineModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

/**
 * INTERNAL / IN-SEMESTER MARKS — subject-wise, semester-wise.
 * ---------------------------------------------------------------------------
 * One row per student + semester + subject. The three mark categories have
 * hard institutional maxima that are enforced BOTH here (schema min/max, so a
 * bad value can never reach the store) and in the controller (a readable 400).
 *
 * A mark type may only be written while the Admin-controlled MarkEntryPermission
 * has that type enabled and the permission window has not expired — see
 * mark-entry-permission.service.ts. The store itself never decides editability;
 * it only guarantees the value is in range once an authorised write happens.
 */

export const MARK_TYPES = ['IA1', 'IA2', 'END_SEM'] as const;
export type InternalMarkType = (typeof MARK_TYPES)[number];

/** Hard maxima: IA1 <= 50, IA2 <= 50, End Semester <= 100. */
export const MARK_TYPE_MAX: Record<InternalMarkType, number> = {
  IA1: 50,
  IA2: 50,
  END_SEM: 100,
};

export const MARK_TYPE_LABEL: Record<InternalMarkType, string> = {
  IA1: 'IA1',
  IA2: 'IA2',
  END_SEM: 'End Semester',
};

/** Field on the InternalMark document that stores each mark type. */
export const MARK_TYPE_FIELD: Record<InternalMarkType, 'ia1' | 'ia2' | 'endSem'> = {
  IA1: 'ia1',
  IA2: 'ia2',
  END_SEM: 'endSem',
};

export function isMarkType(value: unknown): value is InternalMarkType {
  return typeof value === 'string' && (MARK_TYPES as readonly string[]).includes(value);
}

export interface IInternalMark extends LocalDocument {
  student: LocalId;
  registerNumber: string;
  semesterNumber: number;
  subjectCode: string;
  subjectName: string;

  ia1?: number | null;
  ia2?: number | null;
  endSem?: number | null;

  updatedBy?: LocalId;
  updatedByName?: string;

  createdAt: Date;
  updatedAt: Date;
}

const InternalMarkSchema = new Schema<IInternalMark>(
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

    // Absent means "not entered yet" — never defaulted to 0, because 0 is a
    // legitimate recorded mark and must remain distinguishable from "blank".
    ia1: { type: Number, min: 0, max: 50 },
    ia2: { type: Number, min: 0, max: 50 },
    endSem: { type: Number, min: 0, max: 100 },

    updatedBy: { type: 'ObjectId', ref: 'User' },
    updatedByName: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'internal_marks',
  }
);

// One row per student per semester per subject — the subject-wise mark record.
InternalMarkSchema.index({ student: 1, semesterNumber: 1, subjectCode: 1 }, { unique: true });

export const InternalMark = defineModel<IInternalMark>('InternalMark', InternalMarkSchema);
