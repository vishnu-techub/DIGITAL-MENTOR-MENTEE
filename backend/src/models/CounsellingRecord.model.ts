import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export const COUNSELLING_5_CATEGORIES = [
  'Academic Development',
  'Skill Development',
  'Career Development',
  'Personal Development',
  'Extra-Curricular Activities',
] as const;

export type CounsellingCategory = (typeof COUNSELLING_5_CATEGORIES)[number];

/**
 * WHO the mentor held the discussion with. These are NOT mutually exclusive:
 * `['student']` = student only, `['parent']` = parent only, and
 * `['student', 'parent']` = both. At least one participant is required by the
 * controller before a record can be saved.
 */
export const DISCUSSION_WITH_PARTICIPANTS = ['student', 'parent'] as const;
export type DiscussionWith = (typeof DISCUSSION_WITH_PARTICIPANTS)[number];

/**
 * Which mentoring surface a record belongs to.
 * `INDIVIDUAL`      – a one-to-one student and/or parent discussion.
 * `SATURDAY_COMMON` – evidence from the common Saturday mentoring meeting.
 *                     Both kinds coexist on a student; the Saturday record never
 *                     replaces the individual discussion record.
 */
export const RECORD_KINDS = ['INDIVIDUAL', 'SATURDAY_COMMON'] as const;
export type MentoringRecordKind = (typeof RECORD_KINDS)[number];

/** A reference to one physical evidence photo owned by MentoringEvidence. */
export interface MentoringEvidenceRef {
  evidenceId: string;
  addedAt: string;
  addedBy?: string;
}

export interface ICounsellingRecord extends LocalDocument {
  student: LocalId;
  studentId: LocalId;
  mentor: LocalId;
  mentorId: LocalId;
  date: string; // YYYY-MM-DD
  sessionDate: string; // YYYY-MM-DD
  categories: CounsellingCategory[];
  category?: string;
  discussionWith: DiscussionWith[];
  recordKind: MentoringRecordKind;
  concernReason?: string;
  discussionObservation?: string;
  challengeObserved: string;
  skillNeedingImprovement?: string;
  actionPlan?: string;
  correctiveAction: string;
  expectedImprovement?: string;
  studentFeedback?: string;
  mentorRemarks?: string;
  followUpDate?: string;
  status?: string;
  aiGenerated?: boolean;
  studentAcknowledgementStatus?: string;
  mentorSignatureStatus?: string;
  /** References to physical evidence photos. The bytes live once, in storage. */
  evidence: MentoringEvidenceRef[];
  /** Groups every record created by ONE Saturday common meeting submission. */
  evidenceGroupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CounsellingRecordSchema = new Schema<ICounsellingRecord>(
  {
    student: {
      type: 'ObjectId',
      ref: 'Student',
      index: true,
    },
    studentId: {
      type: 'ObjectId',
      ref: 'Student',
      index: true,
    },
    mentor: {
      type: 'ObjectId',
      ref: 'Faculty',
      index: true,
    },
    mentorId: {
      type: 'ObjectId',
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
    categories: {
      type: [String],
      enum: [
        'Academic Development',
        'Skill Development',
        'Career Development',
        'Personal Development',
        'Extra-Curricular Activities',
      ],
      required: [true, 'At least one counselling category is required'],
      default: ['Academic Development'],
      index: true,
    },
    category: {
      type: String,
      default: 'Academic Development',
    },
    discussionWith: {
      // Deliberately an array: "discussed with student AND parent" is a valid,
      // distinct outcome, not a third exclusive option.
      type: [String],
      enum: [...DISCUSSION_WITH_PARTICIPANTS],
      // A function default so every record gets its OWN array. A literal []
      // default would be shared by reference across every saved record.
      default: () => [],
      index: true,
    },
    recordKind: {
      type: String,
      enum: [...RECORD_KINDS],
      default: 'INDIVIDUAL',
      index: true,
    },
    concernReason: {
      type: String,
      default: '',
    },
    discussionObservation: {
      type: String,
      default: '',
    },
    challengeObserved: {
      type: String,
      required: [true, 'Challenge observed is required'],
    },
    skillNeedingImprovement: {
      type: String,
      default: '',
    },
    actionPlan: {
      type: String,
      default: '',
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
      default: '',
    },
    followUpDate: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      default: 'Completed',
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
    // References only. A Saturday meeting photo is one physical file referenced
    // by every participating student's record — never a per-student copy.
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

// Pre-save synchronization hook
CounsellingRecordSchema.pre('save', function () {
  if (this.student && !this.studentId) this.studentId = this.student;
  if (this.studentId && !this.student) this.student = this.studentId;
  if (this.mentor && !this.mentorId) this.mentorId = this.mentor;
  if (this.mentorId && !this.mentor) this.mentor = this.mentorId;
  if (this.sessionDate && !this.date) this.date = this.sessionDate;
  if (this.date && !this.sessionDate) this.sessionDate = this.date;

  // Normalise (never invent) the discussion participants: trim, lowercase,
  // de-duplicate and drop anything outside the two permitted participants.
  // Validation of "at least one participant" lives in the controller so the
  // mentor gets an actionable message instead of a schema error.
  if (Array.isArray(this.discussionWith)) {
    this.discussionWith = Array.from(
      new Set(
        this.discussionWith
          .map((p: any) => String(p).trim().toLowerCase())
          .filter((p: string) => (DISCUSSION_WITH_PARTICIPANTS as readonly string[]).includes(p))
      )
    ) as DiscussionWith[];
  } else {
    this.discussionWith = [];
  }

  if (!this.recordKind) this.recordKind = 'INDIVIDUAL';
  if (!Array.isArray(this.evidence)) this.evidence = [];

  if (Array.isArray(this.categories) && this.categories.length > 0) {
    this.category = this.categories.join(', ');
  } else if (this.category && typeof this.category === 'string') {
    const list = this.category.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      this.categories = list as any;
    } else {
      this.categories = ['Academic Development'];
      this.category = 'Academic Development';
    }
  } else {
    this.categories = ['Academic Development'];
    this.category = 'Academic Development';
  }

  if (this.discussionObservation && !this.challengeObserved) {
    this.challengeObserved = this.discussionObservation;
  }
  if (this.challengeObserved && !this.discussionObservation) {
    this.discussionObservation = this.challengeObserved;
  }
  if (this.actionPlan && !this.correctiveAction) {
    this.correctiveAction = this.actionPlan;
  }
  if (this.correctiveAction && !this.actionPlan) {
    this.actionPlan = this.correctiveAction;
  }
});

export const CounsellingRecord = defineModel<ICounsellingRecord>('CounsellingRecord', CounsellingRecordSchema);
