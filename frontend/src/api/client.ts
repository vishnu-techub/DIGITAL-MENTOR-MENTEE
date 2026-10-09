/**
 * KSRCE Digital Mentor-Mentee System Typed API Client
 */

import type { RecordState, RecordPermissions } from '../lib/recordStatus';

export type { RecordState, RecordPermissions };

/** Every student record returned by the API carries the server-derived capabilities. */
export interface PermissionedRecord {
  _id: string;
  permissions: RecordPermissions;
  [key: string]: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  errors?: any;
  meta?: { timestamp: string };
}

/**
 * `GET /api/students` â€” a genuinely paginated directory listing.
 *
 * `total` is the real number of students matching the filter (from
 * `countDocuments()`), not the length of the current page. `limit` is `null`
 * when the caller omitted it, in which case the whole filtered set is returned
 * in a single page (`pages === 1`).
 */
export interface StudentsListResponse {
  students: any[];
  total: number;
  page: number;
  limit: number | null;
  pages: number;
  hasMore: boolean;
}

/** Page sizes offered by the Students Master directory selector. */
export const STUDENT_PAGE_SIZES = [25, 50, 100, 250] as const;

/* ---------------------------------------------------------------- HOD types */

/**
 * ============================================================================
 * College-wide mentoring dashboard (`/api/admin/overview/*`)
 * ============================================================================
 *
 * ADMIN-only. Every number below is computed on the server from stored
 * Department / Faculty / Student / MentorAssignment / CounsellingRecord / Meeting
 * rows using the same shared arithmetic as the HOD dashboard, so the college
 * view and a department's own view can never disagree. The UI renders these
 * values as received and never recomputes coverage.
 */

export interface AdminMetricDefinitions {
  mentored: string;
  pending: string;
  mentors: string;
  coverage: string;
  sessions: string;
}

/** Level 1 — Admin college-wide overall dashboard. */
export interface AdminMentoringDashboardData {
  generatedAt: string;
  month: string;
  summary: {
    totalDepartments: number;
    totalHODs: number;
    totalFaculty: number;
    totalMentors: number;
    totalStudents: number;
    mentoredThisMonth: number;
    pendingStudents: number;
    overallMentoringCoverage: number;
    totalMentoringSessions: number;
    lastMentoringActivity: string | null;
    departmentsWithHod: number;
    departmentsWithoutHod: number;
    studentsWithoutDepartment: number;
  };
  coverage: { total: number; mentored: number; pending: number; percentage: number };
  /** College-wide PIE series: Mentored vs Pending for the current month. */
  pie: { month: string; mentored: number; pending: number; total: number };
  weeklyProgress: AdminWeeklyProgress[];
  definitions: AdminMetricDefinitions;
}

/** One row per HOD login, carrying that HOD's own department figures. */
export interface AdminHodRow {
  hodId: string;
  hodName: string;
  username: string;
  email: string;
  isActive: boolean;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  students: number;
  faculty: number;
  mentors: number;
  mentoredThisMonth: number;
  mentoringCoverage: number;
  pendingStudents: number;
  totalMentoringSessions: number;
  lastMentoringActivity: string | null;
  hasDepartment: boolean;
}

export interface AdminHodOverviewData {
  month: string;
  totalHODs: number;
  hods: AdminHodRow[];
  definitions: AdminMetricDefinitions;
}

/** HOD Management tab — one row per HOD account (Admin account surface). */
export interface AdminHodManagementRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  department_id: string;
  department_name: string;
  department_code: string;
  is_active: 0 | 1;
  /** 1 only for accounts on the backend's reviewed demo-cleanup allowlist. */
  is_verified_demo: 0 | 1;
  last_login_at: string | null;
  created_at: string | null;
}

export interface AdminHodManagementData {
  hods: AdminHodManagementRow[];
  summary: { total: number; active: number; inactive: number };
}

/** One row per department, including departments with no students. */
export interface AdminDepartmentRow {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  hodNames: string[];
  hodCount: number;
  students: number;
  faculty: number;
  mentors: number;
  mentoredThisMonth: number;
  mentoringCoverage: number;
  pendingStudents: number;
  unassignedStudents: number;
  totalMentoringSessions: number;
  lastMentoringActivity: string | null;
}

export interface AdminDepartmentOverviewData {
  month: string;
  totalDepartments: number;
  departments: AdminDepartmentRow[];
  definitions: AdminMetricDefinitions;
}

/** College-wide department comparison, highest coverage first. */
export interface AdminDepartmentComparisonRow {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  students: number;
  mentored: number;
  pending: number;
  coveragePercent: number;
  totalMentoringSessions: number;
}

export interface AdminDepartmentComparisonData {
  month: string;
  highestCoveragePercent: number;
  departments: AdminDepartmentComparisonRow[];
  definitions: AdminMetricDefinitions;
}

/** Drill-down levels 2 and 3: Department -> HOD -> Mentor. */
export interface AdminDepartmentDetailData {
  department: { departmentId: string; departmentName: string; departmentCode: string; createdAt: string | null };
  summary: {
    totalStudents: number;
    totalFaculty: number;
    totalMentors: number;
    mentoredThisMonth: number;
    pendingStudents: number;
    overallMentoringCoverage: number;
    totalMentoringSessions: number;
    lastMentoringActivity: string | null;
    unassignedStudents: number;
  };
  pie: { month: string; mentored: number; pending: number; total: number };
  weeklyProgress: AdminWeeklyProgress[];
  hods: AdminHodRow[];
  mentors: AdminMentorCoverageRow[];
  definitions: AdminMetricDefinitions;
}

export interface AdminDepartmentMentorsData {
  department: { departmentId: string; departmentName: string; departmentCode: string };
  hod: AdminHodRow | null;
  hods: AdminHodRow[];
  mentors: AdminMentorCoverageRow[];
  definitions: AdminMetricDefinitions;
}

/** College-wide mentor rollup. Same shape as the HOD mentor-wise rows. */
export interface AdminMentorCoverageRow {
  mentorId: string;
  mentorName: string;
  employeeId: string;
  designation: string;
  department: string;
  isActive: boolean;
  totalMentees: number;
  mentoredThisMonth: number;
  pending: number;
  coveragePercent: number;
  sessionCount: number;
  lastMentoringDate: string | null;
}

/** Drill-down level 4: Mentor -> Student. */
export interface AdminMenteeRow {
  id: string;
  registerNumber: string;
  fullName: string;
  departmentId: string;
  departmentName: string;
  batch: string;
  year: number | null;
  section: string;
  isActive: boolean;
  assignmentId: string;
  assignedFrom: string | null;
  mentoredThisMonth: boolean;
  lastMentoringDate: string | null;
  sessionCount: number;
}

export interface AdminMentorDetailData {
  mentor: {
    mentorId: string;
    fullName: string;
    email: string;
    employeeId: string;
    designation: string;
    cabinLocation: string;
    phoneNumber: string;
    isActive: boolean;
    departmentId: string;
    departmentName: string;
  };
  mentees: AdminMenteeRow[];
  summary: {
    totalMentees: number;
    mentoredThisMonth: number;
    pending: number;
    coveragePercent: number;
    sessionCount: number;
    lastMentoringDate: string | null;
    departmentStudents: number;
    departmentCoveragePercent: number;
  };
  definitions: AdminMetricDefinitions;
}

export interface AdminWeeklyProgress {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  sessions: number;
  studentsMentored: number;
  menteesEligible: number;
  coveragePercent: number;
}

export interface AdminReport30DayDepartmentRow {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  totalStudents: number;
  coveredStudents: number;
  pendingStudents: number;
  unassignedStudents: number;
  mentoringSessions: number;
  coveragePercent: number;
  weekly: AdminWeeklyProgress[];
}

export interface AdminReport30DayData {
  from: string;
  to: string;
  weeks: number;
  totals: {
    totalStudents: number;
    coveredStudents: number;
    pendingStudents: number;
    mentoringSessions: number;
    coveragePercent: number;
    departments: number;
  };
  weekly: AdminWeeklyProgress[];
  departments: AdminReport30DayDepartmentRow[];
  definitions: AdminMetricDefinitions;
}

export interface HodDashboardData {
  department: { id?: string; name: string; code: string; hodName: string };
  summary: {
    totalStudents: number;
    totalFaculty: number;
    totalMentors: number;
    /** Distinct students holding at least one active mentor assignment. */
    assignedMentees: number;
    mentoredThisMonth: number;
    studentsNotMentoredThisMonth: number;
    overallMentoringCoverage: number;
    totalMentoringSessions: number;
    lastMentoringActivity: string | null;
  };
  coverage: { total: number; mentored: number; pending: number; percentage: number };
  /** Monthly PIE series: Mentored vs Pending for the reporting month. */
  pie: { month: string; mentored: number; pending: number; total: number };
  mentorWise: HodMentorWiseRow[];
  weeklyProgress: HodWeeklyProgress[];
}

export interface HodMentorWiseRow {
  mentorId: string;
  mentorName: string;
  employeeId: string;
  designation: string;
  department: string;
  isActive: boolean;
  totalMentees: number;
  mentoredThisMonth: number;
  pending: number;
  coveragePercent: number;
  sessionCount: number;
  lastMentoringDate: string | null;
}

export interface HodMenteeRow {
  id: string;
  registerNumber: string;
  fullName: string;
  batch: string;
  year: number | null;
  section: string;
  isActive?: boolean;
  mentorId?: string;
  mentorName?: string;
  mentoredThisMonth: boolean;
  lastMentoringDate: string | null;
  sessionCount: number;
  /** Sessions inside the selected reporting month (mentor detail rows). */
  sessionsThisMonth?: number;
}

export interface HodMentorDetail {
  mentor: {
    id: string;
    fullName: string;
    email: string;
    employeeId: string;
    designation: string;
    cabinLocation: string;
    phoneNumber: string;
    isActive: boolean;
    department: string;
  };
  mentees: HodMenteeRow[];
  summary: {
    totalMentees: number;
    mentoredThisMonth: number;
    pending: number;
    coveragePercent: number;
    /** All-time sessions for this mentor's mentees. */
    sessionCount: number;
    /** Sessions inside the selected reporting month. */
    sessionsThisMonth: number;
    lastMentoringDate: string | null;
  };
  departmentScope: string;
}

export interface HodWeeklyProgress {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  sessions: number;
  studentsMentored: number;
  menteesEligible: number;
  coveragePercent: number;
}

/** Per-mentor rows for the rolling 30-day report window. */
export interface HodReportMentorRow {
  mentorId: string;
  mentorName: string;
  employeeId: string;
  designation: string;
  totalMentees: number;
  coveredStudents: number;
  pendingStudents: number;
  coveragePercent: number;
  totalSessions: number;
  lastMentoringDate: string | null;
  /** My mentees with zero sessions inside the window. */
  notCovered: { id: string; registerNumber: string; fullName: string }[];
}

export interface HodReport30Day {
  from: string;
  to: string;
  totals: {
    sessions: number;
    studentsMentored: number;
    studentsPending: number;
    coveragePercent: number;
    mentorsActive: number;
    mentorsWithMentees: number;
  };
  weekly: HodWeeklyProgress[];
  /** Monthly mentor-wise rows (current month). */
  mentorWise: HodMentorWiseRow[];
  /** Windowed per-mentor rows the 30-day report table renders. */
  reportMentors: HodReportMentorRow[];
  pendingStudents: HodMenteeRow[];
}

export interface HodBatchOption {
  id: string;
  name: string;
  startYear: number | null;
  endYear: number | null;
  inUse: boolean;
}

export interface HodDepartmentOverview {
  department: { id: string; name: string; code: string; hodName: string };
  facultyCount: number;
  studentCount: number;
  mentorCount: number;
  batchCount: number;
  batches: HodBatchOption[];
  unassignedStudents: number;
  /** Students holding at least one active mentor assignment. */
  activeMentees: number;
  activeStudents: number;
  totalMentoringSessions: number;
  lastMentoringActivity: string | null;
  overallMentoringCoverage: number;
}

export interface HodFacultyRow {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  username: string;
  designation: string;
  cabin_location: string;
  phone_number: string;
  department: string;
  department_id: string;
  is_active: boolean;
  mentee_count: number;
}

export interface HodStudentRow {
  id: string;
  register_number: string;
  full_name: string;
  department: string;
  department_id: string;
  batch_name: string;
  year: number | null;
  section: string;
  email: string;
  mobile_number: string;
  is_active: boolean;
  current_mentor_name: string;
  mentor_id: string;
  assignment_id: string;
  mentored_this_month: boolean;
  last_mentoring_date: string | null;
  session_count: number;
}

export interface HodFacultyNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string | null;
  faculty_id: string;
  faculty_name: string;
}

/** A notice this faculty member sent to their own department HOD. */
export interface SentFacultyNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  faculty_name: string;
  faculty_id: string;
  department: string | null;
  department_name: string | null;
  created_at: string | null;
}

/** Department-scoped notice as the HOD reads it. */
export interface HodDepartmentNotification extends SentFacultyNotification {}

export interface HodDepartmentNotificationPayload {
  notifications: HodDepartmentNotification[];
  unreadCount: number;
  totalCount: number;
  department: { id: string; name: string; code: string } | null;
}

export interface SendFacultyNotificationResult {
  id: string | null;
  title: string;
  message: string;
  type: string;
  faculty_id: string;
  faculty_name: string;
  department_id: string;
  department_name: string;
  is_read: boolean;
  created_at: string;
  hod_recipients: number;
  admin_recipients: number;
  recipient_count: number;
}

export interface HodAssignmentResult {
  assignmentId: string;
  message: string;
  studentId: string;
  mentorId: string;
}

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const normalizedApiUrl = rawApiUrl
  ? (rawApiUrl.startsWith('http') ? rawApiUrl : `https://${rawApiUrl}`).replace(/\/$/, '')
  : '';
const API_BASE = (normalizedApiUrl || '') + '/api';

import { ApiError, formatApiError } from './errorHandler';
export { ApiError, formatApiError } from './errorHandler';
export type { FormattedError, ApiErrorType } from './errorHandler';

export function getAuthToken(): string | null {
  return localStorage.getItem('ksrce_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('ksrce_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('ksrce_token');
}

/** Pull a filename out of a Content-Disposition header. */
function extractFilename(disposition: string | null): string | null {
  if (!disposition || !disposition.includes('filename=')) return null;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain && plain[1] ? plain[1] : null;
}

/**
 * One evidence photo, ready to upload.
 *
 * `file` is ALREADY client-side compressed to <= 200 KB by
 * `compressEvidenceImage` (see utils/evidence.ts).
 *
 * `captureTime` is the original EXIF capture time (`YYYY-MM-DDTHH:mm:ss`) when
 * the photo carried one, otherwise null. GPS is sent separately as a single
 * `evidenceLocation` field on the submission (see utils/evidence.ts).
 */
export interface EvidencePhotoInput {
  file: File;
  captureTime?: string | null;
}

/** Device-reported location attached to an evidence submission. */
export interface EvidenceLocationInput {
  status: 'CAPTURED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'ERROR' | 'NOT_REQUESTED';
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  capturedAt: string | null;
}

/**
 * Append photos (and their per-file capture times) to a multipart form.
 *
 * The capture-time array is aligned by index with the appended files. GPS is
 * not sent here because one location applies to the whole submission; the caller
 * adds it to the request body as `evidenceLocation`.
 */
function appendEvidenceToForm(form: FormData, photos: EvidencePhotoInput[]): void {
  if (photos.length === 0) return;
  const captureTimes = photos.map((photo) =>
    photo.captureTime ? { time: photo.captureTime, source: 'EXIF' } : null
  );
  for (const photo of photos) {
    form.append('evidence', photo.file, photo.file.name);
  }
  form.append('evidenceCaptureTimes', JSON.stringify(captureTimes));
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    // Only log technical network details in development console
    if (import.meta.env.DEV) {
      console.warn('[KSRCE API Client] Network connection error:', netErr);
    }
    throw new ApiError(0, netErr?.message || 'Failed to connect to backend server', endpoint);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      removeAuthToken();
    }
    throw new ApiError(response.status, data?.message, endpoint, data?.errors);
  }

  return data as ApiResponse<T>;
}

/* ------------------------------------------------------- Internal marks types */

/** Server-computed state of the Admin-controlled mark-entry window. */
export type MarkEntryStatus = 'INACTIVE' | 'ACTIVE' | 'EXPIRED';
export type MarkEntryType = 'IA1' | 'IA2' | 'END_SEM';

export interface MarkEntryPermissionState {
  status: MarkEntryStatus;
  /** Admin's stored switch (true even when the window has since expired). */
  enabled: boolean;
  markTypes: MarkEntryType[];
  /** Mark types editable RIGHT NOW — empty unless status is ACTIVE. */
  editableMarkTypes: MarkEntryType[];
  durationDays: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

/** One subject-wise official mark row. */
export interface InternalMarkRow {
  id: string;
  semesterNumber: number;
  subjectCode: string;
  subjectName: string;
  ia1: number | null;
  ia2: number | null;
  endSem: number | null;
  updatedByName: string;
  updatedAt: string | null;
}

export interface InternalMarksResponse {
  student: { id: string; registerNumber: string; fullName: string };
  permission: MarkEntryPermissionState;
  marks: InternalMarkRow[];
}

/** One mentor correction request with its full audit trail fields. */
export interface MarkUpdateRequest {
  id: string;
  studentId: string;
  registerNumber: string;
  studentName: string;
  semesterNumber: number;
  subjectCode: string;
  subjectName: string;
  markType: MarkEntryType;
  markTypeLabel: string;
  maxMarks: number | null;
  existingMark: number | null;
  requestedMark: number;
  reason: string;
  supportingNote: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  requestedAt: string | null;
  approvedByName: string;
  approvedAt: string | null;
  resolvedMark: number | null;
  rejectedByName: string;
  rejectedAt: string | null;
  rejectionReason: string;
  createdAt: string | null;
}

/** The three download modes served by `GET /api/pdf/student/:id`. */
export type StudentPdfMode = 'full' | 'internal' | 'mentor-documents';

/* ------------------------------------------------------- Placement monitoring */

export type PlacementStatus =
  | 'NOT_STARTED'
  | 'TRAINING'
  | 'APPLYING'
  | 'INTERVIEW'
  | 'SELECTED'
  | 'NOT_SELECTED'
  | 'PLACED'
  | 'NOT_PLACED';

export interface PlacementRow {
  id: string;
  studentId: string;
  departmentId: string;
  mentorId: string;
  registerNumber: string;
  trainingStatus: string;
  trainingProgress: number;
  trainingCompletionDate: string;
  assessmentStatus: string;
  companyName: string;
  applicationStatus: string;
  interviewStatus: string;
  selectionStatus: string;
  overallStatus: PlacementStatus;
  placed: boolean;
  notPlaced: boolean;
  placementDate: string;
  placedCompanyName: string;
  package: number | null;
  salaryDetails: string;
  mentorRemarks: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlacementSummary {
  totalFinalYearStudents: number;
  withRecord: number;
  withoutRecord: number;
  inProgress: number;
  notStarted: number;
  training: number;
  applying: number;
  interview: number;
  selected: number;
  notSelected: number;
  placed: number;
  notPlaced: number;
  placementPercentage: number;
}

export interface PlacementStudentRow {
  studentId: string;
  registerNumber: string;
  fullName: string;
  year: number;
  section: string;
  departmentId: string;
  mentorId: string;
  mentorName: string;
  hasRecord: boolean;
  overallStatus: PlacementStatus;
  trainingStatus: string;
  trainingProgress: number;
  assessmentStatus: string;
  applicationStatus: string;
  interviewStatus: string;
  selectionStatus: string;
  companyName: string;
  placedCompanyName: string;
  placed: boolean;
  placementDate: string;
  package: number | null;
  mentorRemarks: string;
}

export interface MentorPlacementResponse {
  scope: string;
  finalYear: number;
  menteeCount: number;
  finalYearStudents: number;
  summary: PlacementSummary;
  students: PlacementStudentRow[];
}

export interface HodPlacementSummary {
  totalFinalYearStudents: number;
  withRecord: number;
  withoutRecord: number;
  inProgress: number;
  notStarted: number;
  training: number;
  applying: number;
  interview: number;
  selected: number;
  notSelected: number;
  placed: number;
  notPlaced: number;
  placementPercentage: number;
}

export interface HodPlacementSummaryResponse {
  scope: string;
  department: { id: string; name: string; code: string };
  finalYear: number;
  summary: HodPlacementSummary;
  statusDistribution: Record<string, number>;
}

export interface HodMentorWiseRow {
  mentorId: string;
  mentorName: string;
  finalYearMentees: number;
  withRecord: number;
  placed: number;
  notPlaced: number;
  inProgress: number;
  training: number;
  applying: number;
  interview: number;
  selected: number;
  notSelected: number;
  notStarted: number;
  placementPercentage: number;
}

export interface HodStudentWiseResponse {
  scope: string;
  department: { id: string; name: string; code: string };
  finalYear: number;
  summary: HodPlacementSummary;
  statusFilter: string;
  total: number;
  students: PlacementStudentRow[];
}

/* ------------------------------------------------------- Achievement points */

export type AchievementCategory =
  | 'Hackathon'
  | 'Symposium / Paper Presentation'
  | 'Global / Technical Certification'
  | 'Workshop'
  | 'Competition / Event'
  | 'Project / Technical Achievement'
  | 'Other';

export interface AchievementRow {
  id: string;
  studentId: string;
  registerNumber: string;
  title: string;
  category: AchievementCategory;
  subCategory: string;
  eventName: string;
  organizer: string;
  eventDate: string;
  result: string;
  hackathonResult: string;
  description: string;
  verified: boolean;
  verificationStatus: 'Pending' | 'Approved' | 'Rejected';
  rejectionReason: string;
  verifiedBy: string;
  verifiedAt: string | null;
  points: number;
  pointsAwarded: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StudentAchievementsResponse {
  student: { id: string; registerNumber: string; fullName: string; year: number; departmentId: string };
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    totalPointsAwarded: number;
  };
  achievements: AchievementRow[];
}

export interface AchievementInput {
  title: string;
  category: AchievementCategory;
  subCategory?: string;
  eventName?: string;
  organizer?: string;
  eventDate?: string;
  hackathonResult?: string;
  result?: string;
  description?: string;
  documentId?: string;
}

/* ------------------------------------------------------- Leaderboard */

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  registerNumber: string;
  fullName: string;
  departmentName: string;
  batchName: string;
  year: number;
  totalPoints: number;
  achievementCount: number;
  categoryCounts: Record<string, number>;
  categoryPoints: Record<string, number>;
  lastAwardAt: string | null;
}

export interface LeaderboardMe {
  studentId: string;
  registerNumber: string;
  rank: number | null;
  totalPoints: number;
  achievementCount: number;
}

export interface LeaderboardResponse {
  scope: 'COLLEGE' | 'DEPARTMENT' | 'MENTEES';
  scopeLabel: string;
  totalStudents: number;
  verifiedAchievements: number;
  me: LeaderboardMe | null;
  entries: LeaderboardEntry[];
}

export interface StudentLeaderboardDetail {
  student: { id: string; registerNumber: string; fullName: string; year: number; departmentId: string };
  totalPoints: number;
  achievementCount: number;
  achievements: Array<{
    id: string;
    title: string;
    category: string;
    eventName: string;
    eventDate: string;
    hackathonResult: string;
    verifiedBy: string;
    verifiedAt: string | null;
    pointsAwarded: number;
  }>;
  categories: AchievementCategory[];
}

export type BulkRowStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'ALREADY_EXISTS';

/** Mirrors `BulkPreviewRow` in backend/src/modules/admin/bulk-upload.service.ts */
export interface BulkPreviewRow {
  rowNumber: number;
  identifier: string;
  name: string;
  department: string;
  status: BulkRowStatus;
  reason: string;
  rawData?: Record<string, any>;
  parsedData?: any;
}

export interface BulkSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  existingRecords: number;
  readyForImport: number;
}

export interface BulkValidationResponse {
  summary: BulkSummary;
  rows: BulkPreviewRow[];
}

/** Mirrors `BulkImportResultRow` in the backend (note the capitalised statuses). */
export interface BulkImportResultRow {
  rowNumber: number;
  identifier: string;
  name: string;
  status: 'Imported' | 'Skipped' | 'Failed';
  reason: string;
}

export interface BulkImportResponse {
  summary: {
    totalRows: number;
    imported: number;
    skipped: number;
    failed: number;
  };
  results: BulkImportResultRow[];
}

export const api = {
  // Authentication
  auth: {
    login: (credentials: { username: string; password: string }) =>
      request<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    me: () => request('/auth/me'),
    changePassword: (passwords: { currentPassword: string; newPassword: string }) =>
      request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      }),
  },

  /**
   * Non-admin-safe lookup lists (departments / batches).
   *
   * Any authenticated user may call these so identity dropdowns do not have to
   * reach for an ADMIN-only route. The backend limits the payload to
   * id / name / code / academic years — no mentoring or personal data.
   */
  reference: {
    getDepartments: () => request('/reference/departments'),
    getBatches: () => request('/reference/batches'),
    getCounts: () => request('/reference/counts'),
  },

  // Admin
  admin: {
    getStats: () => request('/admin/dashboard-stats'),
    getDepartments: () => request('/admin/departments'),
    createDepartment: (dept: { code: string; name: string }) =>
      request('/admin/departments', { method: 'POST', body: JSON.stringify(dept) }),
    getBatches: () => request('/admin/batches'),
    createBatch: (batch: { name: string; startYear: number; endYear: number }) =>
      request('/admin/batches', { method: 'POST', body: JSON.stringify(batch) }),
    getFaculty: () => request('/admin/faculty'),
    createFaculty: (fac: any) =>
      request('/admin/faculty', { method: 'POST', body: JSON.stringify(fac) }),
    toggleFacultyStatus: (facultyId: string) =>
      request(`/admin/faculty/${facultyId}/toggle-status`, { method: 'PATCH' }),
    // Reassign a Faculty member to a new academic department. ADMIN-only; the
    // server updates the faculty's department scope without moving any active
    // mentee — those are reassigned manually through `api.mentorship.reassign`.
    reassignFacultyDepartment: (facultyId: string, departmentId: string) =>
      request(`/admin/faculty/${facultyId}/department`, {
        method: 'PATCH',
        body: JSON.stringify({ departmentId }),
      }),
    deleteFaculty: (facultyId: string) =>
      request(`/admin/faculty/${facultyId}`, { method: 'DELETE' }),
    getSettings: () => request('/admin/settings'),
    updateSettings: (settings: any) =>
      request('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }),
    // Mentor Assignment Management
    getMentees: (mentorId: string, params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/admin/mentors/${mentorId}/mentees${q ? `?${q}` : ''}`);
    },
    getStudentsForAssignment: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/admin/students${q ? `?${q}` : ''}`);
    },
    assignMentees: (mentorId: string, studentIds: string[]) =>
      request(`/admin/mentors/${mentorId}/assign-mentees`, {
        method: 'POST',
        body: JSON.stringify({ studentIds }),
      }),
    removeAssignment: (assignmentId: string) =>
      request(`/admin/mentor-assignments/${assignmentId}/remove`, { method: 'PATCH' }),
    // Global purge of the Student Document repository. Admin-only; the backend
    // rejects every other role with 403 independently of the UI.
    deleteAllDocuments: () => request('/admin/documents/all', { method: 'DELETE' }),
    getEditRequests: (status?: string) => {
      const q = status ? `?status=${status}` : '';
      return request(`/admin/identity-edit-requests${q}`);
    },
    reviewEditRequest: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string; action?: 'APPROVE' | 'REJECT'; adminComments?: string }) =>
      request(`/admin/identity-edit-requests/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: data.action || (data.status === 'APPROVED' ? 'APPROVE' : 'REJECT'),
          adminComments: data.adminComments || data.reviewNotes || '',
          ...data,
}),
      }),
    // HOD Management — Admin account surface. The server enforces exactly one
    // active HOD per department and rejects every non-Admin caller with 403.
    getHods: () => request<AdminHodManagementData>('/admin/hods'),
    createHod: (data: {
      fullName: string;
      email: string;
      departmentId: string;
      username?: string;
      password?: string;
      isActive?: boolean;
    }) => request<AdminHodManagementRow>('/admin/hods', { method: 'POST', body: JSON.stringify(data) }),
    updateHod: (hodId: string, data: { fullName?: string; email?: string; departmentId?: string; isActive?: boolean }) =>
      request<AdminHodManagementRow>(`/admin/hods/${hodId}`, { method: 'PUT', body: JSON.stringify(data) }),
    setHodStatus: (hodId: string, isActive: boolean) =>
      request<AdminHodManagementRow>(`/admin/hods/${hodId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    /**
     * PERMANENT deletion — demo-cleanup safety valve only. The server refuses
     * unless the target is an INACTIVE HOD on the reviewed demo allowlist with
     * zero dependent records, called by an Admin. This is never used as a
     * general account-deletion path: genuine HODs only ever get deactivated.
     */
    deleteHod: (hodId: string) =>
      request<{ id: string; username: string; fullName: string }>(`/admin/hods/${hodId}`, {
        method: 'DELETE',
      }),
  },

  /**
   * College-wide mentoring dashboard (`/admin/overview/*`).
   *
   * ADMIN-only on the server: the router applies `authorize(ROLES.ADMIN)` and
   * every handler re-checks the role, so a HOD / FACULTY / STUDENT token gets
   * 403 regardless of what the UI renders.
   *
   * Drill-down chain: departments -> department detail (HODs + mentors)
   * -> mentor detail (mentees). Every metric is computed by the backend from
   * stored records; the UI renders the numbers as sent and never re-derives
   * coverage, so the college view and the department-scoped HOD view can never
   * disagree.
   */
  adminMentoring: {
    dashboard: (params?: { month?: string }) => request('/admin/overview/dashboard' + (params?.month ? '?month=' + params.month : '')),
    hods: (params?: { month?: string }) => request('/admin/overview/hods' + (params?.month ? '?month=' + params.month : '')),
    departments: (params?: { month?: string }) => request('/admin/overview/departments' + (params?.month ? '?month=' + params.month : '')),
    departmentComparison: (params?: { month?: string }) => request('/admin/overview/department-comparison' + (params?.month ? '?month=' + params.month : '')),
    departmentDetail: (departmentId: string) =>
      request(`/admin/overview/departments/${departmentId}`),
    departmentMentors: (departmentId: string) =>
      request(`/admin/overview/departments/${departmentId}/mentors`),
    mentorDetail: (mentorId: string) => request(`/admin/overview/mentors/${mentorId}`),
    report30Day: (weeks?: number) =>
      request(`/admin/overview/report-30-day${weeks ? `?weeks=${weeks}` : ''}`),
  },


  // Students
  students: {
    /**
     * Directory listing. Pass `page` + `limit` for server-side pagination.
     * Omit `limit` entirely to receive every matching student in one response
     * (used by the HOD / Faculty dashboards, which need the whole roster).
     */
    list: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request<StudentsListResponse>(`/students${q ? `?${q}` : ''}`);
    },
    getById: (id: string) => request(`/students/${id}`),
    create: (data: any) =>
      request('/students', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateAcademics: (id: string, data: any) =>
      request(`/students/${id}/academics`, { method: 'PUT', body: JSON.stringify(data) }),
    clearArrear: (id: string, data: { subjectCode: string; clearedInSemester: number; originalSemester?: number; clearedDate?: string; remarks?: string; attempt?: number }) =>
      request(`/students/${id}/clear-arrear`, { method: 'POST', body: JSON.stringify(data) }),
    completeProfile: (data: any) =>
      request('/students/complete-profile', { method: 'POST', body: JSON.stringify(data) }),
    resetPassword: (id: string, newPassword?: string) =>
      request(`/students/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
    toggleStatus: (id: string) =>
      request(`/students/${id}/toggle-status`, { method: 'PATCH' }),
    delete: (id: string) =>
      request(`/students/${id}`, { method: 'DELETE' }),
    requestEdit: (data: { requestedChanges: { fullName?: string; registerNumber?: string; department?: string; batch?: string }; reason: string }) =>
      request('/students/identity-edit-request', { method: 'POST', body: JSON.stringify(data) }),
    getMyEditRequests: () =>
      request('/students/identity-edit-request/my'),
    /** Year and Section are the ONLY academic fields a student edits directly. */
    updateYearSection: (id: string, data: { year?: number; section?: string }) =>
      request(`/students/${id}/year-section`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  /**
   * Academic Edit Requests.
   * A student CANNOT write CGPA/SGPA/arrears directly â€” the only route is a
   * per-semester request reviewed by the assigned mentor, HOD or admin.
   */
  academicRequests: {
    /** Student: raise a correction request for one semester. */
    create: (data: {
      semesterNumber: number;
      requestedCgpa: number;
      requestedSgpa?: number;
      currentCgpa?: number;
      currentSgpa?: number;
      reason: string;
      supportingDocumentId?: string;
    }) =>
      request('/students/academic-edit-request', { method: 'POST', body: JSON.stringify(data) }),
    /** Student: own request history. */
    getMine: () => request<any[]>('/students/academic-edit-request/my'),
    getById: (id: string) => request(`/students/academic-edit-request/${id}`),
    /** Mentor / HOD / Admin: review queue. */
    list: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/students/academic-edit-request${q ? `?${q}` : ''}`);
    },
    approve: (id: string, data: { reviewNotes?: string } = {}) =>
      request(`/students/academic-edit-request/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    reject: (id: string, rejectionReason: string) =>
      request(`/students/academic-edit-request/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ rejectionReason }),
      }),
  },

  // Mentorship (Assignment & Reassignment History)
  mentorship: {
    assign: (data: { studentId: string; mentorId: string; assignedFrom?: string; reason?: string }) =>
      request('/mentorship/assign', { method: 'POST', body: JSON.stringify(data) }),
    reassign: (data: { studentId: string; newMentorId: string; effectiveDate?: string; reasonForChange: string }) =>
      request('/mentorship/reassign', { method: 'POST', body: JSON.stringify(data) }),
    getHistory: (studentId: string) => request(`/mentorship/history/${studentId}`),
    downloadOverallMenteesExcel: async (params?: { mentorId?: string; academicYear?: string }) => {
      const token = getAuthToken();
      const q = new URLSearchParams();
      if (params?.mentorId) q.append('mentorId', params.mentorId);
      if (params?.academicYear) q.append('academicYear', params.academicYear);

      const endpoint = `${API_BASE}/mentor/export/mentees${q.toString() ? `?${q.toString()}` : ''}`;
      const res = await fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.message || 'Failed to download overall mentee data.');
      }

      let filename = 'KSRCE_Mentor_Mentee_List.xlsx';
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return { success: true, filename };
    },
  },

  // Saturday Meetings
  meetings: {
    getSchedule: () => request('/meetings/schedule/current'),
    list: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/meetings${q ? `?${q}` : ''}`);
    },
    create: (data: any) =>
      request('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Counselling & AI Assistant (internally still "counselling"; user-facing
  // term is Mentoring. See PROJECT_PROGRESS.md.)
  counselling: {
    getByStudent: (studentId: string) => request(`/counselling/${studentId}`),
    create: (data: any) =>
      request('/counselling', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request(`/counselling/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

/**
 * Save a mentoring record WITH evidence photos.
 *
 * Sent as multipart. `discussionWith`
 * is REQUIRED and must name who the mentor discussed with: 'student',
 * 'parent', or both. The server refuses the save if it is missing, rather
 * than guessing.
 */
    createWithEvidence: (data: Record<string, unknown>, photos: EvidencePhotoInput[]) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      appendEvidenceToForm(form, photos);
      return request('/counselling', { method: 'POST', body: form });
    },

    /**
     * Edit a record. Existing photos are PRESERVED; new photos are appended.
     * Only ids listed in `removeEvidenceIds` are detached, and a photo still
     * shared with another record is retained on disk rather than deleted.
     */
    updateWithEvidence: (
      id: string,
      data: Record<string, unknown>,
      photos: EvidencePhotoInput[],
      removeEvidenceIds: string[] = []
    ) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      if (removeEvidenceIds.length > 0) form.append('removeEvidenceIds', JSON.stringify(removeEvidenceIds));
      appendEvidenceToForm(form, photos);
      return request(`/counselling/${id}`, { method: 'PUT', body: form });
    },

    /** Explicit, deliberate removal of specific photos from one record. */
    removeEvidence: (id: string, evidenceIds: string[]) =>
      request(`/counselling/${id}/evidence`, {
        method: 'DELETE',
        body: JSON.stringify({ evidenceIds }),
      }),

/**
 * Saturday COMMON meeting evidence.
 *
 * ONE upload is stored and referenced by every participating student, so N
 * students cost a single physical copy. `studentIds` must all be students
 * the caller is the ACTIVE mentor for; otherwise the whole batch is refused.
 *
 * GPS/geolocation is NOT required or sent.
 */
    saveSaturdayEvidence: (data: Record<string, unknown>, photos: EvidencePhotoInput[]) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      appendEvidenceToForm(form, photos);
      return request('/counselling/evidence/saturday', { method: 'POST', body: form });
    },

    /**
     * Evidence photos are PRIVATE. `/uploads` is not a public static mount, so
     * a plain `<img src>` cannot work â€” the browser cannot attach an
     * Authorization header. This downloads the bytes with the bearer token and
     * returns a Blob for `URL.createObjectURL`. Revoke the URL when done.
     */
    fetchEvidenceBlob: async (evidenceId: string): Promise<Blob> => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/counselling/evidence/${encodeURIComponent(evidenceId)}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        if (res.status === 401) removeAuthToken();
        const body = await res.json().catch(() => null);
        throw new ApiError(
          res.status,
          body?.message || 'You are not authorised to view this evidence photo.',
          `/counselling/evidence/${evidenceId}/file`
        );
      }
      return await res.blob();
    },

    /** Separate, explicit download of one evidence photo. */
    downloadEvidence: async (evidenceId: string, fallbackName?: string) => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/counselling/evidence/${encodeURIComponent(evidenceId)}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        if (res.status === 401) removeAuthToken();
        const body = await res.json().catch(() => null);
        throw new ApiError(
          res.status,
          body?.message || 'Evidence download failed.',
          `/counselling/evidence/${evidenceId}/download`
        );
      }
      const fileName = extractFilename(res.headers.get('content-disposition')) || fallbackName || 'evidence.jpg';
      const url = window.URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    },

    askAiBot: (question: string) =>
      request<{
        answer: string;
        topic: string;
        suggestedQuestions?: string[];
        source: string;
      }>('/mentor/ai-bot/ask', {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
    /**
     * Proofreading is advisory only: it returns a suggestion and never writes to
     * any record. The caller must ask the user before applying it.
     */
    checkGrammar: (text: string) =>
      request<{
        original: string;
        corrected: string;
        hasCorrections: boolean;
        source: string;
      }>('/mentor/grammar-check', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    getAiSuggestion: (studentId: string, category: string, mentorPrompt: string) =>
      request<{
        category: string;
        mentorPrompt: string;
        challengeObserved: string;
        correctiveAction: string;
        expectedImprovement: string;
        source: string;
      }>(`/mentor/students/${studentId}/counselling/ai-suggestion`, {
        method: 'POST',
        body: JSON.stringify({ category, mentorPrompt }),
      }),
  },

  // Student Certificates & Documents
  documents: {
    upload: (formData: FormData) =>
      request('/documents/upload', {
        method: 'POST',
        body: formData,
      }),
    getByStudent: (studentId: string) =>
      request<any[]>(`/documents/student/${studentId}`),
    // Save a certificate. Legal only from a student-editable state
    // (Approved / Editing / Rejected); Pending, Submitted and Verified are
    // refused server-side with a reason.
    update: (
      documentId: string,
      data: {
        title?: string;
        category?: string;
        eventName?: string;
        organizer?: string;
        eventDate?: string;
        description?: string;
      }
    ) =>
      request(`/documents/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    // Submit an editable record for mentor review (Approved/Editing/Rejected ->
    // Submitted). A save is a draft and deliberately does NOT do this.
    submit: (documentId: string) =>
      request(`/documents/${documentId}/submit`, { method: 'POST' }),
    delete: (documentId: string) =>
      request(`/documents/${documentId}`, { method: 'DELETE' }),
    deleteAll: (studentId: string) =>
      request(`/documents/student/${studentId}/all`, { method: 'DELETE' }),
    verify: (
      documentId: string,
      data: { verificationStatus: RecordState; rejectionReason?: string }
    ) =>
      request(`/documents/${documentId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    /**
     * Certificates are PRIVATE. The server no longer exposes a public
     * `/uploads` mount, so a plain `<img src>` / `<iframe src>` cannot work â€”
     * the browser cannot attach an Authorization header to those requests.
     *
     * `fetchViewBlob` therefore downloads the file with the bearer token and
     * hands back a Blob whose `URL.createObjectURL` is safe to place in an
     * `<img>`/`<iframe>`. Revoke the URL when the preview closes.
     */
    fetchViewBlob: async (documentId: string): Promise<{ blob: Blob; mimeType: string; fileName: string }> => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/documents/${documentId}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        if (res.status === 401) removeAuthToken();
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body?.message || 'You are not authorised to view this document.', `/documents/${documentId}/file`);
      }
      return {
        blob: await res.blob(),
        mimeType: res.headers.get('content-type') || 'application/octet-stream',
        fileName: extractFilename(res.headers.get('content-disposition')) || 'document',
      };
    },

    /** Separate, explicit download action (never used for inline preview). */
    download: async (documentId: string, fallbackName?: string) => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/documents/${documentId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        if (res.status === 401) removeAuthToken();
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body?.message || 'Download failed.', `/documents/${documentId}/download`);
      }
      const fileName = extractFilename(res.headers.get('content-disposition')) || fallbackName || 'document';
      const url = window.URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
return { success: true, filename: fileName };
      },
    },

  // Monthly Progress
  progress: {
    getByStudent: (studentId: string) => request(`/progress/${studentId}`),
    create: (data: any) =>
      request('/progress', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Notifications
  notifications: {
    list: () => request<{ notifications: any[]; unreadCount: number }>('/notifications'),
    markRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    /** FACULTY only: notify the caller's own department HOD (server decides the department). */
    sendFaculty: (data: { title: string; message: string }) =>
      request<SendFacultyNotificationResult>('/notifications/faculty', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    /** FACULTY only: the notices this caller authored. */
    sent: () =>
      request<{ notifications: SentFacultyNotification[]; unreadCount: number }>('/notifications/sent'),
    triggerReminders: (triggerType: string) =>
      request('/notifications/trigger-saturday-reminders', {
        method: 'POST',
        body: JSON.stringify({ triggerType }),
      }),
  },

  // Internal Marks + Admin-controlled mark entry
  marks: {
    getPermission: () => request<{ permission: MarkEntryPermissionState }>('/marks/permission'),
    setPermission: (data: { enabled: boolean; markTypes?: string[]; durationDays?: number }) =>
      request<{ permission: MarkEntryPermissionState }>('/marks/permission', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getStudentMarks: (studentId: string, semester?: number) =>
      request<InternalMarksResponse>(
        `/marks/student/${studentId}${semester ? `?semester=${semester}` : ''}`
      ),
    updateStudentMarks: (
      studentId: string,
      data: {
        semesterNumber: number;
        subjectCode: string;
        subjectName: string;
        ia1?: number | null;
        ia2?: number | null;
        endSem?: number | null;
      }
    ) =>
      request<{ mark: InternalMarkRow; permission: MarkEntryPermissionState }>(
        `/marks/student/${studentId}`,
        { method: 'PUT', body: JSON.stringify(data) }
      ),
    listUpdateRequests: (params?: { status?: string; studentId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.studentId) qs.set('studentId', params.studentId);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<{ requests: MarkUpdateRequest[] }>(`/marks/update-requests${suffix}`);
    },
    createUpdateRequest: (data: {
      studentId: string;
      semesterNumber: number;
      subjectCode: string;
      markType: 'IA1' | 'IA2' | 'END_SEM';
      requestedMark: number;
      reason: string;
      supportingNote?: string;
    }) =>
      request<{ request: { id: string; status: string; existingMark: number | null; requestedMark: number } }>(
        '/marks/update-requests',
        { method: 'POST', body: JSON.stringify(data) }
      ),
    approveUpdateRequest: (requestId: string) =>
      request<{ request: { id: string; status: string; resolvedMark: number } }>(
        `/marks/update-requests/${requestId}/approve`,
        { method: 'PATCH', body: JSON.stringify({}) }
      ),
    rejectUpdateRequest: (requestId: string, rejectionReason: string) =>
      request<{ request: { id: string; status: string; rejectionReason: string } }>(
        `/marks/update-requests/${requestId}/reject`,
        { method: 'PATCH', body: JSON.stringify({ rejectionReason }) }
      ),
  },

  // PDF
  pdf: {
    /**
     * Download one of the three record-book modes. The default stays the full
     * dossier so every existing caller is unchanged; `internal` prints only the
     * internal-assessment report and `mentor-documents` only the mentoring
     * records + document archive.
     */
    downloadStudentPdf: async (
      studentId: string,
      filename?: string,
      mode: StudentPdfMode = 'full'
    ) => {
      const token = getAuthToken();
      const modeQuery = mode === 'full' ? '' : `?mode=${encodeURIComponent(mode)}`;
      const res = await fetch(`${API_BASE}/pdf/student/${studentId}${modeQuery}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error('Could not download student PDF.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        filename ||
        (mode === 'internal'
          ? `KSRCE_Internal_Assessment_${studentId}.pdf`
          : mode === 'mentor-documents'
            ? `KSRCE_Mentor_Documents_${studentId}.pdf`
            : `KSRCE_Mentee_${studentId}_Dossier.pdf`);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },

  // Reports
  reports: {
    getDepartmentReport: () => request('/reports/departments'),
    downloadCsv: async () => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/reports/export/csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'KSRCE_Mentee_Roster.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },

  // Audit Logs
  audit: {
    list: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/audit-logs${q ? `?${q}` : ''}`);
    },
  },

  // Schools Management & Search
  schools: {
    list: (params?: {
      search?: string;
      city?: string;
      district?: string;
      schoolType?: string;
      isActive?: string | boolean;
      page?: number;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.append('search', params.search);
      if (params?.city) qs.append('city', params.city);
      if (params?.district) qs.append('district', params.district);
      if (params?.schoolType) qs.append('schoolType', params.schoolType);
      if (params?.isActive !== undefined) qs.append('isActive', String(params.isActive));
      if (params?.page) qs.append('page', String(params.page));
      if (params?.limit) qs.append('limit', String(params.limit));
      return request<{
        schools: any[];
        pagination: { total: number; page: number; limit: number; pages: number };
      }>(`/schools?${qs.toString()}`);
    },
    districts: () => request<string[]>('/schools/districts'),
    stats: () =>
      request<{ total: number; active: number; inactive: number; districtCount: number }>(
        '/schools/stats'
      ),
    getById: (id: string) => request<any>(`/schools/${id}`),
    create: (data: any) =>
      request<any>('/schools', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<any>(`/schools/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggle: (id: string) =>
      request<any>(`/schools/${id}/toggle`, {
        method: 'PATCH',
      }),
    delete: (id: string) =>
      request<any>(`/schools/${id}`, {
        method: 'DELETE',
      }),
  },

  // Student Progress & Achievements (My Progress -> Mentor -> Excel Sync)
  studentProgress: {
    getMyProgress: () =>
      request<{ records: any[]; categoryCounts: Record<string, number>; totalCount: number }>('/student/progress'),
    create: (formData: FormData) =>
      request<any>('/student/progress', {
        method: 'POST',
        body: formData,
      }),
    update: (id: string, formData: FormData) =>
      request<any>(`/student/progress/${id}`, {
        method: 'PUT',
        body: formData,
      }),
    delete: (id: string) =>
      request<any>(`/student/progress/${id}`, {
        method: 'DELETE',
      }),
    // Submit an editable achievement for mentor review.
    submit: (id: string) =>
      request<any>(`/student/progress/${id}/submit`, {
        method: 'POST',
      }),
    getMenteeProgress: (studentId: string) =>
      request<{ records: any[]; summary: any }>(`/mentor/mentees/${studentId}/progress`),
    verifyMenteeProgress: (studentId: string, id: string, status: RecordState, rejectionReason?: string, source?: 'DOCUMENT' | 'PROGRESS') =>
      request<any>(`/mentor/mentees/${studentId}/progress/${id}/verify`, {
        method: 'PUT',
        body: JSON.stringify({ status, rejectionReason, source }),
      }),
  },

  // HOD — department-scoped dashboards, mentor coverage and reports.
  hod: {
    dashboard: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<HodDashboardData>(`/hod/dashboard${q ? `?${q}` : ''}`);
    },
    mentorWise: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<HodMentorWiseRow[]>(`/hod/mentor-wise${q ? `?${q}` : ''}`);
    },
    mentorDetail: (mentorId: string, params?: Record<string, any>) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<HodMentorDetail>(`/hod/mentor/${mentorId}${q ? `?${q}` : ''}`);
    },
    weeklyProgress: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<HodWeeklyProgress[]>(`/hod/weekly-progress${q ? `?${q}` : ''}`);
    },
    report30Day: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<HodReport30Day>(`/hod/report-30-day${q ? `?${q}` : ''}`);
    },
    departmentOverview: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<HodDepartmentOverview>(`/hod/department-overview${q ? `?${q}` : ''}`);
    },
    faculty: {
      list: (params?: Record<string, any>) => {
        const q = new URLSearchParams(params as Record<string, string>).toString();
        return request<HodFacultyRow[]>(`/hod/faculty${q ? `?${q}` : ''}`);
      },
      create: (data: any) =>
        request<HodFacultyRow>('/hod/faculty', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (facultyId: string, data: any) =>
        request<HodFacultyRow>(`/hod/faculty/${facultyId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
    },
    students: {
      list: (params?: Record<string, any>) => {
        const q = new URLSearchParams(params as Record<string, string>).toString();
        return request<HodStudentRow[]>(`/hod/students${q ? `?${q}` : ''}`);
      },
      create: (data: any) =>
        request<HodStudentRow>('/hod/students', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (studentId: string, data: any) =>
        request<HodStudentRow>(`/hod/students/${studentId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
    },
    assignMentor: (data: any) =>
      request<HodAssignmentResult>('/hod/mentor-assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    removeMentor: (assignmentId: string) =>
      request<HodAssignmentResult>(`/hod/mentor-assignments/${assignmentId}/remove`, {
        method: 'PATCH',
      }),
    facultyNotifications: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<HodFacultyNotification[]>(`/hod/faculty-notifications${q ? `?${q}` : ''}`);
    },
    /** HOD only: the notices this HOD's department faculty have sent. */
    departmentNotifications: () =>
      request<HodDepartmentNotificationPayload>('/hod/notifications'),
  },

  // Placement Monitoring (final-year students; mentor/HOD/admin scope).
  placements: {
    get: (studentId: string) =>
      request<{ student: any; finalYear: boolean; finalYearYear?: number; placement: PlacementRow | null; allowedTransitions: PlacementStatus[]; mentorName: string }>(
        `/placements/student/${studentId}`
      ),
    create: (studentId: string, data: any) =>
      request<{ placement: PlacementRow; allowedTransitions: PlacementStatus[] }>(
        `/placements/student/${studentId}`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    update: (studentId: string, data: any) =>
      request<{ placement: PlacementRow; allowedTransitions: PlacementStatus[] }>(
        `/placements/student/${studentId}`,
        { method: 'PUT', body: JSON.stringify(data) }
      ),
    mentor: () => request<MentorPlacementResponse>('/placements/mentor'),
    hodSummary: () => request<HodPlacementSummaryResponse>('/placements/hod/summary'),
    hodMentorWise: () =>
      request<{ mentors: HodMentorWiseRow[]; unassignedFinalYear: Array<{ studentId: string; registerNumber: string; fullName: string }> }>(
        '/placements/hod/mentor-wise'
      ),
    hodStudentWise: (status?: string) =>
      request<HodStudentWiseResponse>(
        `/placements/hod/student-wise${status ? `?status=${status}` : ''}`
      ),
  },

  // Achievements + point verification.
  achievements: {
    forStudent: (studentId: string) =>
      request<StudentAchievementsResponse>(`/achievements/student/${studentId}`),
    create: (studentId: string, data: AchievementInput) =>
      request<{ achievement: AchievementRow }>(`/achievements/student/${studentId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<AchievementInput>) =>
      request<{ achievement: AchievementRow }>(`/achievements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    verify: (id: string) =>
      request<{ achievement: AchievementRow; awardedPoints: number; label: string }>(
        `/achievements/${id}/verify`,
        { method: 'POST' }
      ),
    reject: (id: string, rejectionReason: string) =>
      request<{ achievement: AchievementRow }>(`/achievements/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason }),
      }),
  },

  // Deterministic achievement leaderboard.
  leaderboard: {
    get: () => request<LeaderboardResponse>('/leaderboard'),
    studentDetail: (studentId: string) =>
      request<StudentLeaderboardDetail>(`/leaderboard/student/${studentId}`),
  },

  // Bulk Upload (Admin only - Students & Faculty .xlsx)
  bulkUpload: {
    downloadStudentTemplate: async () => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/admin/bulk-upload/students/template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to download student template.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Student_Bulk_Upload_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    downloadFacultyTemplate: async () => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/admin/bulk-upload/faculty/template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to download faculty template.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Faculty_Bulk_Upload_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    validateStudents: async (file: File): Promise<ApiResponse<BulkValidationResponse>> => {
      const form = new FormData();
      form.append('file', file);
      return request<BulkValidationResponse>('/admin/bulk-upload/students/validate', {
        method: 'POST',
        body: form,
      });
    },
    validateFaculty: async (file: File): Promise<ApiResponse<BulkValidationResponse>> => {
      const form = new FormData();
      form.append('file', file);
      return request<BulkValidationResponse>('/admin/bulk-upload/faculty/validate', {
        method: 'POST',
        body: form,
      });
    },
    importStudents: (rows: BulkPreviewRow[]): Promise<ApiResponse<BulkImportResponse>> => {
      return request<BulkImportResponse>('/admin/bulk-upload/students/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
    },
    importFaculty: (rows: BulkPreviewRow[]): Promise<ApiResponse<BulkImportResponse>> => {
      return request<BulkImportResponse>('/admin/bulk-upload/faculty/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
    },
    downloadErrorReport: async (results: BulkImportResultRow[], type: 'STUDENTS' | 'FACULTY') => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/admin/bulk-upload/error-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ results, type }),
      });
      if (!res.ok) throw new Error('Failed to download error report.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type.toLowerCase()}_bulk_import_report.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },
};


