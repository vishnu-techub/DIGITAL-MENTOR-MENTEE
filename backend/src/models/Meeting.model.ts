import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';
import type { MentoringEvidenceRef } from './CounsellingRecord.model.js';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'ON_DUTY';
export type MeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'PENDING' | 'PENDING_UPDATE';

export interface IMeeting extends LocalDocument {
  student: LocalId;
  mentor: LocalId;
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
  /**
   * References to physical photos captured at the COMMON Saturday mentoring
   * meeting. One physical file is shared by every participant, so this holds
   * ids only — the bytes exist once in the canonical uploads directory.
   */
  evidence: MentoringEvidenceRef[];
  /** Ties every meeting row created/updated by one Saturday evidence upload. */
  evidenceGroupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    student: {
      type: 'ObjectId',
      ref: 'Student',
      required: true,
      index: true,
    },
    mentor: {
      type: 'ObjectId',
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
    evidence: {
      type: [
        {
          evidenceId: { type: String, required: true },
          addedAt: { type: String, default: '' },
          addedBy: { type: String, default: '' },
        },
      ],
      default: () => [],
    },
    evidenceGroupId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

MeetingSchema.pre('save', function () {
  if (!Array.isArray(this.evidence)) this.evidence = [];
});

// Compound Index
MeetingSchema.index({ meetingDate: -1, student: 1 });

export const Meeting = defineModel<IMeeting>('Meeting', MeetingSchema);
