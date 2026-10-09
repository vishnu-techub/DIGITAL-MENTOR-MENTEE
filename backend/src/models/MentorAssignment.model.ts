import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export type AssignmentStatus = 'ACTIVE' | 'COMPLETED' | 'TRANSFERRED';

export interface IMentorAssignment extends LocalDocument {
  student: LocalId;
  mentor: LocalId;
  department: LocalId;
  assignedFrom: Date | string;
  assignedUntil?: Date | string;
  status: AssignmentStatus;
  assignedBy: LocalId;
  changeReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MentorAssignmentSchema = new Schema<IMentorAssignment>(
  {
    student: {
      type: 'ObjectId',
      ref: 'Student',
      required: true,
      index: true,
    },
    mentor: {
      type: 'ObjectId',
      ref: 'Faculty',
      required: true,
      index: true,
    },
    department: {
      type: 'ObjectId',
      ref: 'Department',
      required: true,
      index: true,
    },
    assignedFrom: {
      type: Date,
      default: Date.now,
      required: true,
    },
    assignedUntil: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'TRANSFERRED'],
      default: 'ACTIVE',
      index: true,
    },
    assignedBy: {
      type: 'ObjectId',
      ref: 'User',
      required: true,
    },
    changeReason: {
      type: String,
      trim: true,
      default: 'Initial Allocation',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
MentorAssignmentSchema.index({ student: 1, status: 1 });
MentorAssignmentSchema.index({ mentor: 1, status: 1 });
MentorAssignmentSchema.index({ assignedFrom: -1 });

export const MentorAssignment = defineModel<IMentorAssignment>('MentorAssignment', MentorAssignmentSchema);
