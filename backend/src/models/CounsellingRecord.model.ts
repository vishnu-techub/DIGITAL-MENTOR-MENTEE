import mongoose, { Schema, Document } from 'mongoose';

export type CounsellingCategory =
  | 'Academic'
  | 'Training & Placement'
  | 'Extra-Curricular / Co-Curricular'
  | 'Innovation'
  | 'Skill Development';

export interface ICounsellingRecord extends Document {
  student: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  mentor: mongoose.Types.ObjectId;
  mentorId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  sessionDate: string; // YYYY-MM-DD
  category: CounsellingCategory;
  challengeObserved: string;
  correctiveAction: string;
  expectedImprovement?: string;
  studentFeedback?: string;
  mentorRemarks?: string;
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
    category: {
      type: String,
      enum: [
        'Academic',
        'Training & Placement',
        'Extra-Curricular / Co-Curricular',
        'Innovation',
        'Skill Development',
      ],
      required: [true, 'Counselling domain category is required'],
      index: true,
    },
    challengeObserved: {
      type: String,
      required: [true, 'Challenge observed is required'],
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
      default: 'Satisfactory',
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

// Pre-save synchronization hook between student/studentId and sessionDate/date
CounsellingRecordSchema.pre('save', function () {
  if (this.student && !this.studentId) this.studentId = this.student;
  if (this.studentId && !this.student) this.student = this.studentId;
  if (this.mentor && !this.mentorId) this.mentorId = this.mentor;
  if (this.mentorId && !this.mentor) this.mentor = this.mentorId;
  if (this.sessionDate && !this.date) this.date = this.sessionDate;
  if (this.date && !this.sessionDate) this.sessionDate = this.date;
});

export const CounsellingRecord = mongoose.model<ICounsellingRecord>('CounsellingRecord', CounsellingRecordSchema);
