import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export interface IClearedSubject {
  subjectCode: string;
  clearedInSemester: number;
  originalSemester?: number;
  clearedDate?: string;
  remarks?: string;
}

export interface IArrearSubjectDetail {
  subjectCode: string;
  subjectName: string;
}

export interface IAcademicRecord extends LocalDocument {
  student: LocalId;
  semesterNumber: number;
  cgpa: number;
  sgpa: number;
  /**
   * Derived from `arrearSubjectDetails` on every write. Retained for
   * backwards compatibility / fast filtering, never treated as the source
   * of truth (see utils/arrears.util.ts).
   */
  arrearsCount: number;
  arrearsSubjects: string;
  /** Authoritative structured arrear list, including subject names. */
  arrearSubjectDetails?: IArrearSubjectDetail[];
  clearedSubjects?: IClearedSubject[];
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AcademicRecordSchema = new Schema<IAcademicRecord>(
  {
    student: {
      type: 'ObjectId',
      ref: 'Student',
      required: true,
      index: true,
    },
    semesterNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    cgpa: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    sgpa: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    arrearsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    arrearsSubjects: {
      type: String,
      default: '',
      trim: true,
    },
    arrearSubjectDetails: [
      {
        subjectCode: { type: String, trim: true, uppercase: true },
        subjectName: { type: String, trim: true, default: 'Not Provided' },
      },
    ],
    clearedSubjects: [
      {
        subjectCode: { type: String, trim: true, uppercase: true },
        clearedInSemester: { type: Number, min: 1, max: 8 },
        originalSemester: { type: Number, min: 1, max: 8 },
        clearedDate: { type: String },
        remarks: { type: String, trim: true },
      },
    ],
    remarks: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring one record per student per semester
AcademicRecordSchema.index({ student: 1, semesterNumber: 1 }, { unique: true });

export const AcademicRecord = defineModel<IAcademicRecord>('AcademicRecord', AcademicRecordSchema);
