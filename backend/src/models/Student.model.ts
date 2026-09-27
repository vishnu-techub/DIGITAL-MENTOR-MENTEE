import mongoose, { Schema, Document } from 'mongoose';

export interface ISibling {
  siblingName: string;
  siblingContact?: string;
  siblingOccupation?: string;
}

export interface IParentDetails {
  fatherName?: string;
  fatherContact?: string;
  fatherOccupation?: string;
  motherName?: string;
  motherContact?: string;
  motherOccupation?: string;
}

export interface ISchoolDetails {
  tenthMark?: number;
  tenthSchool?: string;
  tenthSchoolId?: mongoose.Types.ObjectId;
  twelfthMark?: number;
  twelfthSchool?: string;
  twelfthSchoolId?: mongoose.Types.ObjectId;
  cutoffMark?: number;
  admissionType?: 'COUNSELLING' | 'MANAGEMENT';
  scholarshipDetails?: string;
}

export interface IArrearHistoryItem {
  subjectCode: string;
  originalSemester: number;
  attempt?: number;
  clearedInSemester?: number;
  clearedDate?: string;
  status: 'ACTIVE' | 'CLEARED';
  remarks?: string;
}

export interface IStudent extends Document {
  user: mongoose.Types.ObjectId;
  registerNumber: string;
  fullName: string;
  department: mongoose.Types.ObjectId;
  batch: mongoose.Types.ObjectId;
  dob?: string;
  bloodGroup?: string;
  residentialType: 'DAY_SCHOLAR' | 'HOSTELLER';
  mobileNumber?: string;
  email?: string;
  address?: string;
  parent: IParentDetails;
  siblings: ISibling[];
  school: ISchoolDetails;
  clearedSubjects?: {
    subjectCode: string;
    clearedInSemester: number;
    originalSemester?: number;
    clearedDate?: string;
    remarks?: string;
  }[];
  arrearHistory?: IArrearHistoryItem[];
  profileCompleted: boolean;
  profileCompletedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    registerNumber: {
      type: String,
      required: [true, 'Register number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    batch: {
      type: Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true,
    },
    dob: {
      type: String,
      trim: true,
    },
    bloodGroup: {
      type: String,
      trim: true,
      default: 'B+ve',
    },
    residentialType: {
      type: String,
      enum: ['DAY_SCHOLAR', 'HOSTELLER'],
      default: 'DAY_SCHOLAR',
    },
    mobileNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
    },
    parent: {
      fatherName: { type: String, trim: true, default: '' },
      fatherContact: { type: String, trim: true, default: '' },
      fatherOccupation: { type: String, trim: true, default: '' },
      motherName: { type: String, trim: true, default: '' },
      motherContact: { type: String, trim: true, default: '' },
      motherOccupation: { type: String, trim: true, default: '' },
    },
    siblings: [
      {
        siblingName: { type: String, trim: true },
        siblingContact: { type: String, trim: true },
        siblingOccupation: { type: String, trim: true },
      },
    ],
    school: {
      tenthMark: { type: Number, default: 0 },
      tenthSchool: { type: String, trim: true, default: '' },
      tenthSchoolId: { type: Schema.Types.ObjectId, ref: 'School', index: true },
      twelfthMark: { type: Number, default: 0 },
      twelfthSchool: { type: String, trim: true, default: '' },
      twelfthSchoolId: { type: Schema.Types.ObjectId, ref: 'School', index: true },
      cutoffMark: { type: Number, default: 0 },
      admissionType: {
        type: String,
        enum: ['COUNSELLING', 'MANAGEMENT'],
        default: 'COUNSELLING',
      },
      scholarshipDetails: { type: String, trim: true, default: 'Nil' },
    },
    clearedSubjects: [
      {
        subjectCode: { type: String, trim: true, uppercase: true },
        clearedInSemester: { type: Number, min: 1, max: 8 },
        originalSemester: { type: Number, min: 1, max: 8 },
        clearedDate: { type: String },
        remarks: { type: String, trim: true },
      },
    ],
    arrearHistory: [
      {
        subjectCode: { type: String, trim: true, uppercase: true, required: true },
        originalSemester: { type: Number, required: true, min: 1, max: 8 },
        attempt: { type: Number, default: 1 },
        clearedInSemester: { type: Number, min: 1, max: 8 },
        clearedDate: { type: String },
        status: { type: String, enum: ['ACTIVE', 'CLEARED'], default: 'ACTIVE' },
        remarks: { type: String, trim: true },
      },
    ],
    profileCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    profileCompletedAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);



export const Student = mongoose.model<IStudent>('Student', StudentSchema);
