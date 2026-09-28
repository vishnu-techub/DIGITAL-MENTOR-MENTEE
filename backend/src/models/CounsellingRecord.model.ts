import mongoose, { Schema, Document } from 'mongoose';

export const COUNSELLING_5_CATEGORIES = [
  'Academic Development',
  'Skill Development',
  'Career Development',
  'Personal Development',
  'Extra-Curricular Activities',
] as const;

export type CounsellingCategory = (typeof COUNSELLING_5_CATEGORIES)[number];

export interface ICounsellingRecord extends Document {
  student: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  mentor: mongoose.Types.ObjectId;
  mentorId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  sessionDate: string; // YYYY-MM-DD
  categories: CounsellingCategory[];
  category?: string;
  concernReason?: string;
  discussionObservation?: string;
  challengeObserved: string;
  skillNeedingImprovement?: string;
  actionPlan?: string;
  correctiveAction: string;
  expectedImprovement?: string;
  studentFeedback?: string;
  mentorRemarks?: string;
  followUpDate?: string;
  status?: string;
  aiGenerated?: boolean;
  studentAcknowledgementStatus?: string;
  mentorSignatureStatus?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CounsellingRecordSchema = new Schema<ICounsellingRecord>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      index: true,
    },
    mentor: {
      type: Schema.Types.ObjectId,
      ref: 'Faculty',
      index: true,
    },
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: 'Faculty',
      index: true,
    },
    date: {
      type: String,
      index: true,
    },
    sessionDate: {
      type: String,
      index: true,
    },
    categories: {
      type: [String],
      enum: [
        'Academic Development',
        'Skill Development',
        'Career Development',
        'Personal Development',
        'Extra-Curricular Activities',
      ],
      required: [true, 'At least one counselling category is required'],
      default: ['Academic Development'],
      index: true,
    },
    category: {
      type: String,
      default: 'Academic Development',
    },
    concernReason: {
      type: String,
      default: '',
    },
    discussionObservation: {
      type: String,
      default: '',
    },
    challengeObserved: {
      type: String,
      required: [true, 'Challenge observed is required'],
    },
    skillNeedingImprovement: {
      type: String,
      default: '',
    },
    actionPlan: {
      type: String,
      default: '',
    },
    correctiveAction: {
      type: String,
      required: [true, 'Corrective action is required'],
    },
    expectedImprovement: {
      type: String,
      default: '',
    },
    studentFeedback: {
      type: String,
      default: 'Acknowledged',
    },
    mentorRemarks: {
      type: String,
      default: '',
    },
    followUpDate: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      default: 'Completed',
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    studentAcknowledgementStatus: {
      type: String,
      default: 'ACKNOWLEDGED',
    },
    mentorSignatureStatus: {
      type: String,
      default: 'SIGNED',
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save synchronization hook
CounsellingRecordSchema.pre('save', function () {
  if (this.student && !this.studentId) this.studentId = this.student;
  if (this.studentId && !this.student) this.student = this.studentId;
  if (this.mentor && !this.mentorId) this.mentorId = this.mentor;
  if (this.mentorId && !this.mentor) this.mentor = this.mentorId;
  if (this.sessionDate && !this.date) this.date = this.sessionDate;
  if (this.date && !this.sessionDate) this.sessionDate = this.date;

  if (Array.isArray(this.categories) && this.categories.length > 0) {
    this.category = this.categories.join(', ');
  } else if (this.category && typeof this.category === 'string') {
    const list = this.category.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      this.categories = list as any;
    } else {
      this.categories = ['Academic Development'];
      this.category = 'Academic Development';
    }
  } else {
    this.categories = ['Academic Development'];
    this.category = 'Academic Development';
  }

  if (this.discussionObservation && !this.challengeObserved) {
    this.challengeObserved = this.discussionObservation;
  }
  if (this.challengeObserved && !this.discussionObservation) {
    this.discussionObservation = this.challengeObserved;
  }
  if (this.actionPlan && !this.correctiveAction) {
    this.correctiveAction = this.actionPlan;
  }
  if (this.correctiveAction && !this.actionPlan) {
    this.actionPlan = this.correctiveAction;
  }
});

export const CounsellingRecord = mongoose.model<ICounsellingRecord>('CounsellingRecord', CounsellingRecordSchema);
