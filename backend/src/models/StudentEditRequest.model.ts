import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export type EditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IStudentEditRequest extends LocalDocument {
  student: LocalId;
  registerNumber: string;
  studentName: string;
  requestedFields: {
    fullName?: string;
    registerNumber?: string;
    department?: LocalId;
    departmentName?: string;
    batch?: LocalId;
    batchName?: string;
  };
  currentValues: {
    fullName?: string;
    registerNumber?: string;
    department?: LocalId;
    departmentName?: string;
    batch?: LocalId;
    batchName?: string;
  };
  reason: string;
  status: EditRequestStatus;
  reviewedBy?: LocalId;
  reviewerName?: string;
  adminComments?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentEditRequestSchema = new Schema<IStudentEditRequest>(
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
      index: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    requestedFields: {
      fullName: { type: String, trim: true },
      registerNumber: { type: String, trim: true },
      department: { type: 'ObjectId', ref: 'Department' },
      departmentName: { type: String, trim: true },
      batch: { type: 'ObjectId', ref: 'Batch' },
      batchName: { type: String, trim: true },
    },
    currentValues: {
      fullName: { type: String, trim: true },
      registerNumber: { type: String, trim: true },
      department: { type: 'ObjectId', ref: 'Department' },
      departmentName: { type: String, trim: true },
      batch: { type: 'ObjectId', ref: 'Batch' },
      batchName: { type: String, trim: true },
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    reviewedBy: {
      type: 'ObjectId',
      ref: 'User',
    },
    reviewerName: {
      type: String,
      trim: true,
    },
    adminComments: {
      type: String,
      trim: true,
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'student_edit_requests',
  }
);

StudentEditRequestSchema.index({ student: 1, status: 1 });
StudentEditRequestSchema.index({ createdAt: -1 });

export const StudentEditRequest =
  getModel<IStudentEditRequest>('StudentEditRequest', StudentEditRequestSchema);
