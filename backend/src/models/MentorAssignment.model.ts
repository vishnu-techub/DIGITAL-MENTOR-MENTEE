import mongoose, { Schema, Document } from 'mongoose';

export type AssignmentStatus = 'ACTIVE' | 'COMPLETED' | 'TRANSFERRED';

export interface IMentorAssignment extends Document {
  student: mongoose.Types.ObjectId;
  mentor: mongoose.Types.ObjectId;
  department: mongoose.Types.ObjectId;
  assignedFrom: Date | string;
  assignedUntil?: Date | string;
  status: AssignmentStatus;
  assignedBy: mongoose.Types.ObjectId;
  changeReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MentorAssignmentSchema = new Schema<IMentorAssignment>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    mentor: {
      type: Schema.Types.ObjectId,
      ref: 'Faculty',
      required: true,
      index: true,
    },
    department: {
      type: Schema.Types.ObjectId,
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
      type: Schema.Types.ObjectId,
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

export const MentorAssignment = mongoose.model<IMentorAssignment>('MentorAssignment', MentorAssignmentSchema);
