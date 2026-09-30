import mongoose, { Schema, Document } from 'mongoose';

export type AcademicEditStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IAcademicEditRequest extends Document {
  student: mongoose.Types.ObjectId;
  registerNumber: string;
  studentName: string;
  semesterNumber: number;

  /** Snapshot of the values the student currently sees, captured at submission time. */
  currentCgpa: number;
  currentSgpa: number;
  requestedCgpa: number;
  requestedSgpa: number;

  reason: string;
  /** Optional supporting document owned by the same student. */
  supportingDocument?: mongoose.Types.ObjectId;
  supportingDocumentName?: string;
  supportingDocumentUrl?: string;

  status: AcademicEditStatus;

  approvedBy?: mongoose.Types.ObjectId;
  approvedByName?: string;
  approvedAt?: Date;

  rejectedBy?: mongoose.Types.ObjectId;
  rejectedByName?: string;
  rejectedAt?: Date;
  rejectionReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

const AcademicEditRequestSchema = new Schema<IAcademicEditRequest>(
  {
    student: {
      type: Schema.Types.ObjectId,
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

    currentCgpa: { type: Number, required: true, min: 0, max: 10 },
    currentSgpa: { type: Number, required: true, min: 0, max: 10 },
    requestedCgpa: { type: Number, required: true, min: 0, max: 10 },
    requestedSgpa: { type: Number, required: true, min: 0, max: 10 },

    reason: {
      type: String,
      required: [true, 'A reason is required for an academic correction request.'],
      trim: true,
      maxlength: 1000,
    },

    supportingDocument: {
      type: Schema.Types.ObjectId,
      ref: 'StudentDocument',
    },
    supportingDocumentName: { type: String, trim: true },
    supportingDocumentUrl: { type: String, trim: true },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },

    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String, trim: true },
    approvedAt: { type: Date },

    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedByName: { type: String, trim: true },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'academic_edit_requests',
  }
);

// A student may only have one in-flight request per semester.
AcademicEditRequestSchema.index({ student: 1, semesterNumber: 1, status: 1 });
// Mentor queue: everything PENDING for a given mentor's mentees, newest first.
AcademicEditRequestSchema.index({ status: 1, createdAt: -1 });

export const AcademicEditRequest =
  mongoose.models.AcademicEditRequest ||
  mongoose.model<IAcademicEditRequest>('AcademicEditRequest', AcademicEditRequestSchema);
