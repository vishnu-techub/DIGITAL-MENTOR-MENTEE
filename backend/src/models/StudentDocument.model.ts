import mongoose, { Schema, Document } from 'mongoose';

export type DocumentCategory =
  | 'Event Certificate'
  | 'Workshop Certificate'
  | 'Hackathon Certificate'
  | 'SIH Certificate'
  | 'NPTEL Certificate'
  | 'MOOC Certificate'
  | 'Internship Certificate'
  | 'Paper Presentation'
  | 'Symposium'
  | 'Technical Event'
  | 'Award'
  | 'Achievement'
  | 'Other';

export type VerificationStatus = 'Pending' | 'Verified' | 'Rejected';

export interface IStudentDocument extends Document {
  studentId: mongoose.Types.ObjectId;
  title: string;
  category: DocumentCategory | string;
  eventName?: string;
  organizer?: string;
  eventDate?: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  verificationStatus: VerificationStatus;
  rejectionReason?: string;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedDate?: Date;
  uploadedAt: Date;
  updatedAt: Date;
}

const StudentDocumentSchema = new Schema<IStudentDocument>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Permanent studentId is mandatory for document storage'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Document category is required'],
      enum: [
        'Event Certificate',
        'Workshop Certificate',
        'Hackathon Certificate',
        'SIH Certificate',
        'NPTEL Certificate',
        'MOOC Certificate',
        'Internship Certificate',
        'Paper Presentation',
        'Symposium',
        'Technical Event',
        'Award',
        'Achievement',
        'Other',
      ],
      default: 'Other',
      index: true,
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
    description: {
      type: String,
      trim: true,
      default: '',
    },
    fileUrl: {
      type: String,
      required: [true, 'File URL is required'],
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
    },
    fileType: {
      type: String,
      required: [true, 'File MIME type is required'],
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
    },
    verificationStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectedDate: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: 'uploadedAt', updatedAt: 'updatedAt' },
  }
);

// Indexes
StudentDocumentSchema.index({ studentId: 1, uploadedAt: -1 });
StudentDocumentSchema.index({ studentId: 1, verificationStatus: 1 });

export const StudentDocument = mongoose.model<IStudentDocument>(
  'StudentDocument',
  StudentDocumentSchema
);
