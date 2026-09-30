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
    // These three are free-text narrative the Saturday meeting form does not
    // always supply: the mentor form collects "Challenges & Topics Discussed"
    // and "Mentor Remarks & Action Agreed Upon" only. `challengesDiscussed`
    // and `correctiveAction` were previously `required`, which made a
    // legitimate save fail Mongoose validation (an empty string does not
    // satisfy `required`) and surface to the mentor as HTTP 500.
    // They are NOT filled with placeholder prose -- the controller either
    // stores what the mentor actually wrote or leaves them empty.
    challengesDiscussed: {
      type: String,
      trim: true,
      default: '',
    },
    studentFeedback: {
      type: String,
      trim: true,
      default: '',
    },
    counsellingProvided: {
      type: String,
      trim: true,
      default: '',
    },
    correctiveAction: {
      type: String,
      trim: true,
      default: '',
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
