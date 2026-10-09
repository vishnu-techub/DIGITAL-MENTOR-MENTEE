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
 * GPS / TIMESTAMP METADATA (explicitly reintroduced for the evidence upload
 * workflow ONLY — see PROJECT_PROGRESS.md):
 *   - When the mentor grants browser location permission at capture time, the
 *     latitude, longitude and accuracy are stored here, together with a location
 *     status and the time the fix was captured.
 *   - Coordinates are validated on the server (-90..90 / -180..180) and are
 *     treated as DEVICE-REPORTED data, not independently verified proof of
 *     physical presence. No anti-spoofing guarantee is claimed.
 *   - A human-readable place name is filled in best-effort by the configurable
 *     reverse-geocoding boundary. A failed lookup never blocks an upload.
 *   - Photo capture time (EXIF, when present) and the server upload time are
 *     stored as separate fields so their provenance is never blurred.
 *   - Location is NEVER captured in the background or outside an evidence
 *     upload, and no location history is retained beyond this record.
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

/**
 * Outcome of the location request made when the evidence photo was captured.
 * `NOT_REQUESTED` covers older records and any upload that intentionally did
 * not ask. Nothing here implies the coordinates are independently verified.
 */
export const EVIDENCE_LOCATION_STATUS = {
  NOT_REQUESTED: 'NOT_REQUESTED',
  CAPTURED: 'CAPTURED',
  DENIED: 'DENIED',
  UNAVAILABLE: 'UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
} as const;

export type EvidenceLocationStatus =
  (typeof EVIDENCE_LOCATION_STATUS)[keyof typeof EVIDENCE_LOCATION_STATUS];

/** Outcome of the best-effort reverse-geocoding lookup. */
export const EVIDENCE_PLACE_STATUS = {
  NOT_ATTEMPTED: 'NOT_ATTEMPTED',
  RESOLVED: 'RESOLVED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  ERROR: 'ERROR',
  UNAVAILABLE: 'UNAVAILABLE',
  DISABLED: 'DISABLED',
} as const;

export type EvidencePlaceStatus = (typeof EVIDENCE_PLACE_STATUS)[keyof typeof EVIDENCE_PLACE_STATUS];

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

  // ---- Location metadata (device-reported; see file header) -----------------
  /** Location request outcome. Older records default to NOT_REQUESTED. */
  locationStatus: EvidenceLocationStatus;
  /** Device-reported latitude, only when `locationStatus === 'CAPTURED'`. */
  latitude?: number | null;
  /** Device-reported longitude, only when `locationStatus === 'CAPTURED'`. */
  longitude?: number | null;
  /** Accuracy radius in metres reported by the device, when provided. */
  accuracyMeters?: number | null;
  /** When the browser produced the location fix. */
  locationCapturedAt?: Date | null;
  /** Human-readable place name from the configurable reverse-geocoding provider. */
  placeName?: string | null;
  /** Outcome of the reverse-geocoding lookup. */
  placeNameStatus: EvidencePlaceStatus;
  /** Structured address parts, for display when available. */
  placeDetails?: {
    locality?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  } | null;
  /** When the place name was resolved. */
  placeResolvedAt?: Date | null;

  // ---- Timestamp metadata ---------------------------------------------------
  /**
   * Original photo capture time from EXIF, stored as a wall-clock string
   * (`YYYY-MM-DDTHH:mm:ss`). User-provided metadata, not verified.
   */
  captureTime?: string | null;
  /** Where `captureTime` came from (currently only `EXIF`). */
  captureTimeSource?: string;
  /** `CAPTURED` when EXIF supplied a time, otherwise `UNAVAILABLE`. */
  captureTimeStatus?: string;
  /** Server-authoritative upload time (UTC), stamped on the server. */
  uploadedAt?: Date;

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
    // ---- Location metadata (device-reported) --------------------------------
    locationStatus: {
      type: String,
      enum: Object.values(EVIDENCE_LOCATION_STATUS),
      default: EVIDENCE_LOCATION_STATUS.NOT_REQUESTED,
      index: true,
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracyMeters: { type: Number, default: null },
    locationCapturedAt: { type: Date, default: null },
    placeName: { type: String, trim: true, default: '' },
    placeNameStatus: {
      type: String,
      enum: Object.values(EVIDENCE_PLACE_STATUS),
      default: EVIDENCE_PLACE_STATUS.NOT_ATTEMPTED,
    },
    placeDetails: {
      locality: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    placeResolvedAt: { type: Date, default: null },
    // ---- Timestamp metadata -------------------------------------------------
    captureTime: { type: String, default: null },
    captureTimeSource: { type: String, default: '' },
    captureTimeStatus: { type: String, default: 'UNAVAILABLE' },
    uploadedAt: { type: Date, default: null },
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