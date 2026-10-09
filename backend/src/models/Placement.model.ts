import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export const PLACEMENT_STATUSES = [
  'NOT_STARTED',
  'TRAINING',
  'APPLYING',
  'INTERVIEW',
  'SELECTED',
  'NOT_SELECTED',
  'PLACED',
  'NOT_PLACED',
] as const;

export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export interface IPlacement extends LocalDocument {
  student: LocalId;
  department: LocalId;
  mentor?: LocalId;
  registerNumber: string;

  // Training
  trainingStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NA';
  trainingProgress?: number; // percentage
  trainingCompletionDate?: string;

  // Assessment
  assessmentStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PASSED' | 'FAILED';

  // Applications & Interviews
  companyName?: string;
  applicationStatus?: 'NOT_APPLIED' | 'APPLIED' | 'PENDING' | 'REJECTED';
  interviewStatus?: 'NOT_SCHEDULED' | 'SCHEDULED' | 'COMPLETED' | 'REJECTED';
  selectionStatus?: 'PENDING' | 'SELECTED' | 'NOT_SELECTED' | 'WAITLIST';

  // Final Placement
  overallStatus: PlacementStatus;
  placed: boolean;
  notPlaced?: boolean;
  placementDate?: string;
  placedCompanyName?: string;
  package?: number; // in LPA
  salaryDetails?: string;

  // Notes
  mentorRemarks?: string;

  createdBy?: LocalId;
  updatedBy?: LocalId;

  createdAt: Date;
  updatedAt: Date;
}

const PlacementSchema = new Schema<IPlacement>(
  {
    student: {
      type: 'ObjectId',
      ref: 'Student',
      required: true,
      unique: true,
      index: true,
    },
    department: {
      type: 'ObjectId',
      ref: 'Department',
      required: true,
      index: true,
    },
    mentor: {
      type: 'ObjectId',
      ref: 'Faculty',
      index: true,
    },
    registerNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    trainingStatus: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NA'],
      default: 'NOT_STARTED',
    },
    trainingProgress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    trainingCompletionDate: {
      type: String,
      trim: true,
    },

    assessmentStatus: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PASSED', 'FAILED'],
      default: 'NOT_STARTED',
    },

    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    applicationStatus: {
      type: String,
      enum: ['NOT_APPLIED', 'APPLIED', 'PENDING', 'REJECTED'],
      default: 'NOT_APPLIED',
    },
    interviewStatus: {
      type: String,
      enum: ['NOT_SCHEDULED', 'SCHEDULED', 'COMPLETED', 'REJECTED'],
      default: 'NOT_SCHEDULED',
    },
    selectionStatus: {
      type: String,
      enum: ['PENDING', 'SELECTED', 'NOT_SELECTED', 'WAITLIST'],
      default: 'PENDING',
    },

    overallStatus: {
      type: String,
      enum: PLACEMENT_STATUSES,
      default: 'NOT_STARTED',
      index: true,
    },
    placed: {
      type: Boolean,
      default: false,
      index: true,
    },
    notPlaced: {
      type: Boolean,
      default: false,
    },
    placementDate: {
      type: String,
      trim: true,
    },
    placedCompanyName: {
      type: String,
      trim: true,
      default: '',
    },
    package: {
      type: Number,
      min: 0,
    },
    salaryDetails: {
      type: String,
      trim: true,
      default: '',
    },

    mentorRemarks: {
      type: String,
      trim: true,
      default: '',
    },

    createdBy: {
      type: 'ObjectId',
      ref: 'User',
      index: true,
    },
    updatedBy: {
      type: 'ObjectId',
      ref: 'User',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

PlacementSchema.index({ department: 1, overallStatus: 1 });
PlacementSchema.index({ mentor: 1, overallStatus: 1 });
PlacementSchema.index({ placed: 1 });

export const Placement = defineModel<IPlacement>('Placement', PlacementSchema);

