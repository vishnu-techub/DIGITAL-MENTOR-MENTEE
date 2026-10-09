import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export const ACHIEVEMENT_CATEGORIES = [
  'Hackathon',
  'Symposium / Paper Presentation',
  'Global / Technical Certification',
  'Workshop',
  'Competition / Event',
  'Project / Technical Achievement',
  'Other',
] as const;

export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const HACKATHON_RESULTS = ['Winner', 'Runner-up', 'Finalist', 'Participation'] as const;
export type HackathonResult = (typeof HACKATHON_RESULTS)[number];

export interface IAchievement extends LocalDocument {
  student: LocalId;
  department: LocalId;
  registerNumber: string;

  title: string;
  category: AchievementCategory;
  subCategory?: string;

  eventName?: string;
  organizer?: string;
  eventDate?: string;

  result?: string;
  hackathonResult?: HackathonResult;

  description?: string;

  verified: boolean;
  verifiedBy?: LocalId;
  verifiedAt?: Date;
  verificationStatus?: 'Pending' | 'Approved' | 'Rejected';
  rejectionReason?: string;

  points: number;
  pointsAwarded: number;

  // Linked document if any
  documentId?: LocalId;
  document?: any;

  createdBy?: LocalId;
  updatedBy?: LocalId;

  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema = new Schema<IAchievement>(
  {
    student: {
      type: 'ObjectId',
      ref: 'Student',
      required: true,
      index: true,
    },
    department: {
      type: 'ObjectId',
      ref: 'Department',
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

    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ACHIEVEMENT_CATEGORIES,
      required: true,
      index: true,
    },
    subCategory: {
      type: String,
      trim: true,
    },

    eventName: {
      type: String,
      trim: true,
      default: '',
    },
    organizer: {
      type: String,
      trim: true,
      default: '',
    },
    eventDate: {
      type: String,
      trim: true,
      default: '',
    },

    result: {
      type: String,
      trim: true,
      default: '',
    },
    hackathonResult: {
      type: String,
      enum: HACKATHON_RESULTS,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    verifiedBy: {
      type: 'ObjectId',
      ref: 'User',
      index: true,
    },
    verifiedAt: {
      type: Date,
    },
    verificationStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },

    points: {
      type: Number,
      default: 0,
      min: 0,
    },
    pointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },

    documentId: {
      type: 'ObjectId',
      ref: 'StudentDocument',
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

AchievementSchema.index({ student: 1, verified: 1 });
AchievementSchema.index({ department: 1, verified: 1 });
AchievementSchema.index({ verified: 1, pointsAwarded: -1 });

export const Achievement = defineModel<IAchievement>('Achievement', AchievementSchema);

