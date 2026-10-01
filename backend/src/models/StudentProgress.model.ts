import mongoose, { Schema, Document } from 'mongoose';

export type ProgressCategory =
  | 'Event Certificate'
  | 'NPTEL Certificate'
  | 'Global Certification'
  | 'Hackathon Certificate'
  | 'Symposium Certificate'
  | 'Award Certificate'
  | 'Program attended in other state'
  | 'Extension Activity'
  | 'Extra Curricular'
  | 'Other approved achievements/activities';

export type ProgressLevel = 'College' | 'State' | 'National' | 'International';

export type ProgressStatus =
  | 'Pending'
  | 'Approved'
  | 'Editing'
  | 'Submitted'
  | 'Verified'
  | 'Rejected';

export interface IStudentProgress extends Document {
  studentId: mongoose.Types.ObjectId;
  registerNumber: string;
  studentName: string;
  department?: string;
  batch?: string;
  section?: string;
  category: ProgressCategory;
  activityName: string;
  organization?: string;
  eventName?: string;
  date?: string;
  level?: ProgressLevel;
  description?: string;
  certificateUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  status: ProgressStatus;
  rejectionReason?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewerName?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentProgressSchema = new Schema<IStudentProgress>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'studentId is required'],
      index: true,
    },
    registerNumber: {
      type: String,
      required: [true, 'registerNumber is required'],
      trim: true,
      index: true,
    },
    studentName: {
      type: String,
      required: [true, 'studentName is required'],
      trim: true,
    },
    department: {
      type: String,
      trim: true,
      default: 'Information Technology',
    },
    batch: {
      type: String,
      trim: true,
    },
    section: {
      type: String,
      trim: true,
      default: 'A',
    },
    category: {
      type: String,
      required: [true, 'category is required'],
      enum: [
        'Event Certificate',
        'NPTEL Certificate',
        'Global Certification',
        'Hackathon Certificate',
        'Symposium Certificate',
        'Award Certificate',
        'Program attended in other state',
        'Extension Activity',
        'Extra Curricular',
        'Other approved achievements/activities',
      ],
      index: true,
    },
    activityName: {
      type: String,
      required: [true, 'activityName is required'],
      trim: true,
    },
    organization: {
      type: String,
      trim: true,
      default: '',
    },
    eventName: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: String,
      trim: true,
      default: '',
    },
    level: {
      type: String,
      enum: ['College', 'State', 'National', 'International'],
      default: 'College',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    certificateUrl: {
      type: String,
      trim: true,
      default: '',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    fileType: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Editing', 'Submitted', 'Verified', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Faculty',
    },
    reviewerName: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'student_progress',
  }
);

// Compound indexes for performant lookups
StudentProgressSchema.index({ studentId: 1, category: 1 });
StudentProgressSchema.index({ registerNumber: 1, category: 1 });
StudentProgressSchema.index({ studentId: 1, createdAt: -1 });

export const StudentProgress = mongoose.model<IStudentProgress>(
  'StudentProgress',
  StudentProgressSchema
);
