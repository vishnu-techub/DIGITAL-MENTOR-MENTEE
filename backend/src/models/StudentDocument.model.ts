import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export type DocumentCategory =
  | 'Event Certificate'
  | 'Workshop Certificate'
  | 'Hackathon Certificate'
  | 'SIH Certificate'
  | 'NPTEL Certificate'
  | 'Global Certification'
  | 'MOOC Certificate'
  | 'Internship Certificate'
  | 'Paper Presentation'
  | 'Symposium'
  | 'Symposium Certificate'
  | 'Technical Event'
  | 'Award'
  | 'Award Certificate'
  | 'Achievement'
  | 'Extension Activity'
  | 'Extra Curricular'
  | 'Other';

export type VerificationStatus =
  | 'Pending'
  | 'Approved'
  | 'Editing'
  | 'Submitted'
  | 'Verified'
  | 'Rejected';

export type DocumentType = 'student_details_form' | 'certificate' | 'other';

export interface IStudentDocument extends LocalDocument {
  studentId: LocalId;
  documentType: DocumentType | string;
  isPrimary: boolean;
  fileName: string;
  fileUrl: string;
  uploadedBy?: LocalId;
  title: string;
  category: DocumentCategory | string;
  eventName?: string;
  organizer?: string;
  eventDate?: string;
  description?: string;
  fileType: string;
  fileSize: number;
  verificationStatus: VerificationStatus;
  rejectionReason?: string;
  rejectedBy?: LocalId;
  rejectedDate?: Date;
  uploadedAt: Date;
  updatedAt: Date;
}

const StudentDocumentSchema = new Schema<IStudentDocument>(
  {
    studentId: {
      type: 'ObjectId',
      ref: 'Student',
      required: [true, 'Permanent studentId is mandatory for document storage'],
      index: true,
    },
    documentType: {
      type: String,
      enum: ['student_details_form', 'certificate', 'other'],
      default: 'certificate',
      index: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
      index: true,
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    fileUrl: {
      type: String,
      required: [true, 'File URL is required'],
      trim: true,
    },
    uploadedBy: {
      type: 'ObjectId',
      ref: 'User',
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: function (this: any) {
        return this.fileName || 'Document';
      },
    },
    category: {
      type: String,
      required: [true, 'Document category is required'],
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
    fileType: {
      type: String,
      default: 'application/pdf',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    verificationStatus: {
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
    rejectedBy: {
      type: 'ObjectId',
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

// Indexes: studentId with isPrimary descending ensures Student Details Form is ALWAYS first
StudentDocumentSchema.index({ studentId: 1, isPrimary: -1, uploadedAt: -1 });
StudentDocumentSchema.index({ studentId: 1, verificationStatus: 1 });

export const StudentDocument = defineModel<IStudentDocument>(
  'StudentDocument',
  StudentDocumentSchema
);
