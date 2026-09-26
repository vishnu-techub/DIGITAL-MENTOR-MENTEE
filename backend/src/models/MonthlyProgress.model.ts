import mongoose, { Schema, Document } from 'mongoose';

export interface IMonthlyProgress extends Document {
  student: mongoose.Types.ObjectId;
  mentor: mongoose.Types.ObjectId;
  academicYear: string;
  monthName: string;
  academicRating: number;
  academicNotes?: string;
  placementRating: number;
  placementNotes?: string;
  ecRating: number;
  ecNotes?: string;
  innovationRating: number;
  innovationNotes?: string;
  skillRating: number;
  skillNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MonthlyProgressSchema = new Schema<IMonthlyProgress>(
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
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      default: '2026-2027',
    },
    monthName: {
      type: String,
      required: [true, 'Month name or evaluation interval is required'],
      default: 'End of Month 1',
    },
    academicRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 4,
    },
    academicNotes: {
      type: String,
      default: '',
    },
    placementRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 4,
    },
    placementNotes: {
      type: String,
      default: '',
    },
    ecRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 4,
    },
    ecNotes: {
      type: String,
      default: '',
    },
    innovationRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 4,
    },
    innovationNotes: {
      type: String,
      default: '',
    },
    skillRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 4,
    },
    skillNotes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound Index
MonthlyProgressSchema.index({ academicYear: 1, monthName: 1 });

export const MonthlyProgress = mongoose.model<IMonthlyProgress>('MonthlyProgress', MonthlyProgressSchema);
