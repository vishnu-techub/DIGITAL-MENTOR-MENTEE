import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'ON_DUTY';
export type MeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'PENDING' | 'PENDING_UPDATE';

export interface IMeeting extends Document {
  student: mongoose.Types.ObjectId;
  mentor: mongoose.Types.ObjectId;
  meetingDate: string; // YYYY-MM-DD
  meetingTime: string;
  location: string;
  attendanceStatus: AttendanceStatus;
  meetingStatus: MeetingStatus;
  challengesDiscussed: string;
  studentFeedback?: string;
  counsellingProvided?: string;
  correctiveAction: string;
  followUpRequired: boolean;
  followUpDate?: string;
  mentorRemarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
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
    meetingDate: {
      type: String,
      required: [true, 'Meeting date is required'],
      index: true,
    },
    meetingTime: {
      type: String,
      default: '10:30 AM',
    },
    location: {
      type: String,
      default: 'Faculty Cabin',
    },
    attendanceStatus: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'ON_DUTY'],
      default: 'PRESENT',
    },
    meetingStatus: {
      type: String,
      enum: ['SCHEDULED', 'COMPLETED', 'PENDING', 'PENDING_UPDATE'],
      default: 'COMPLETED',
    },
    challengesDiscussed: {
      type: String,
      required: [true, 'Challenges discussed must be recorded'],
    },
    studentFeedback: {
      type: String,
      default: 'Acknowledged',
    },
    counsellingProvided: {
      type: String,
    },
    correctiveAction: {
      type: String,
      required: [true, 'Corrective action must be recorded'],
    },
    followUpRequired: {
      type: Boolean,
      default: false,
    },
    followUpDate: {
      type: String,
    },
    mentorRemarks: {
      type: String,
      default: 'Satisfactory',
    },
  },
  {
    timestamps: true,
  }
);

// Compound Index
MeetingSchema.index({ meetingDate: -1, student: 1 });

export const Meeting = mongoose.model<IMeeting>('Meeting', MeetingSchema);
