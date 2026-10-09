import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

/**
 * MENTORING EVIDENCE (one record per PHYSICAL uploaded photo)
 * ---------------------------------------------------------------------------
 * This is the single owner of a mentoring evidence file. A CounsellingRecord or
 * a Saturday Meeting only stores an `{ evidenceId }` REFERENCE, so the very same
 * photo can appear on twenty students' mentoring records while existing on disk
 * exactly once.
 *
 * The image bytes live in the project's canonical local storage under
 * `backend/storage/uploads/counselling/`. This record stores only the reference
 * plus the metadata — never the binary.
 *
 * GPS/geolocation has been intentionally REMOVED. The Mentoring Evidence feature
 * does NOT request, capture, validate, store, or process the user's physical
 * location. No latitude/longitude is stored. No location permission is required.
 *
 * TEMPORARY LOCAL FILE STORAGE — this is a JSON file in `backend/data/` and the
 * image is a file on local disk. Both are lost on a redeploy or a change of host
 * unless `DATA_DIR` / `UPLOADS_DIR` point at a persistent volume. See
 * PROJECT_PROGRESS.md.
 */

export const EVIDENCE_CONTEXTS = {
  /** Photo attached to one student's individual mentoring discussion. */
  INDIVIDUAL: 'INDIVIDUAL',
  /** Photo from the common Saturday mentoring meeting, shared by many students. */
  SATURDAY_MEETING: 'SATURDAY_MEETING',
} as const;

export type EvidenceContext = (typeof EVIDENCE_CONTEXTS)[keyof typeof EVIDENCE_CONTEXTS];

export interface IMentoringEvidence extends LocalDocument {
  /** Stable id of the physical file. Referenced by records; never duplicated. */
  evidenceId: string;
  /** Logical URL of the stored file, e.g. `/uploads/counselling/mtg-…jpg`. */
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  /** Mentor (Faculty) who captured the evidence. */
  uploadedBy?: LocalId;
  uploadedByName?: string;
  context: EvidenceContext;
  /** Set for SATURDAY_MEETING evidence so a shared set can be found as one group. */
  evidenceGroupId?: string;
  meetingId?: LocalId;
  /** Every student this physical file is linked to. Drives read authorisation. */
  students: string[];
  /** Diagnostics: JPEG quality / resize actually applied by the compressor. */
  compression?: {
    quality: number;
    width: number;
    height: number;
    attempts: number;
    resized: boolean;
    maxBytes: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const MentoringEvidenceSchema = new Schema<IMentoringEvidence>(
  {
    evidenceId: {
      type: String,
      required: [true, 'Evidence reference is required'],
      index: true,
    },
    fileUrl: {
      type: String,
      required: [true, 'Stored file reference is required'],
    },
    fileName: {
      type: String,
      default: '',
    },
    fileSize: {
      type: Number,
      required: [true, 'Stored file size is required'],
      // Enforced at the schema layer as well as in the compressor, so a stored
      // evidence record can never describe a file larger than the ceiling.
      max: 200 * 1024,
    },
    fileType: {
      type: String,
      default: 'image/jpeg',
    },
    uploadedBy: {
      type: 'ObjectId',
      ref: 'Faculty',
      index: true,
    },
    uploadedByName: {
      type: String,
      default: '',
    },
    context: {
      type: String,
      enum: [EVIDENCE_CONTEXTS.INDIVIDUAL, EVIDENCE_CONTEXTS.SATURDAY_MEETING],
      default: EVIDENCE_CONTEXTS.INDIVIDUAL,
      index: true,
    },
    evidenceGroupId: {
      type: String,
      index: true,
    },
    meetingId: {
      type: 'ObjectId',
      ref: 'Meeting',
      index: true,
    },
    students: {
      type: [String],
      default: [],
      index: true,
    },
    compression: {
      quality: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
      resized: { type: Boolean, default: false },
      maxBytes: { type: Number, default: 200 * 1024 },
    },
  },
  {
    timestamps: true,
  }
);

// `students` is stored as plain id strings (not ObjectId refs) so a shared
// Saturday photo can be authorised against every participating student with a
// single query, and so the JSON stays readable during a debugging session.
MentoringEvidenceSchema.pre('save', function () {
  const ids = Array.isArray(this.students) ? this.students : [];
  this.students = Array.from(
    new Set(
      ids
        .map((s: any) => (s && typeof s === 'object' && s._id ? String(s._id) : String(s)))
        .filter((s: string) => s && s.length > 0)
    )
  );
  if (!Array.isArray(this.students)) this.students = [];
});

MentoringEvidenceSchema.index({ evidenceGroupId: 1, context: 1 });

export const MentoringEvidence = defineModel<IMentoringEvidence>('MentoringEvidence', MentoringEvidenceSchema);