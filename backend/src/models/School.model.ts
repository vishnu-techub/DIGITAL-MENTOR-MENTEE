import mongoose, { Schema, Document } from 'mongoose';

export interface ISchool extends Document {
  schoolName: string;
  city: string;
  district: string;
  state: string;
  schoolType: string;
  schoolCode?: string;
  pincode?: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SchoolSchema = new Schema<ISchool>(
  {
    schoolName: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
      index: true,
    },
    city: {
      type: String,
      required: [true, 'City/Block is required'],
      trim: true,
      index: true,
    },
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true,
      index: true,
    },
    state: {
      type: String,
      default: 'Tamil Nadu',
      trim: true,
    },
    schoolType: {
      type: String,
      trim: true,
      default: 'Other',
    },
    schoolCode: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      index: true,
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

// Compound text index for fast keyword search across schoolName, city, district
SchoolSchema.index(
  {
    schoolName: 'text',
    city: 'text',
    district: 'text',
    displayName: 'text',
  },
  {
    weights: {
      schoolName: 10,
      displayName: 8,
      city: 5,
      district: 3,
    },
    name: 'SchoolSearchIndex',
  }
);

// Standard compound indexes for filtering
SchoolSchema.index({ district: 1, city: 1, schoolName: 1 });
SchoolSchema.index({ isActive: 1, schoolName: 1 });

export const School = mongoose.model<ISchool>('School', SchoolSchema);
