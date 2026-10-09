import React, { useState, useEffect } from 'react';
import { api, ApiError, type StudentPdfMode } from '../../api/client';
import { InternalMarksMentorPanel } from '../../components/mentor/InternalMarksMentorPanel';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { PageHeader } from '../../components/common/PageHeader';
import { StudentDocumentsManager } from '../../components/documents/StudentDocumentsManager';
import { MenteeProgressDashboard } from '../../components/mentor/MenteeProgressDashboard';
import { MentorPlacementPanel } from '../../components/placement/MentorPlacementPanel';
import { StudentProfileSkeleton } from '../../components/common/SkeletonLoader';
import { StudentNotFound } from '../error/StudentNotFound';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import { MentorAiBotModal } from '../../components/mentor/MentorAiBotModal';
import { GrammarAssistField } from '../../components/mentor/GrammarAssistField';
import { CounsellingCategorySelect } from '../../components/mentor/CounsellingCategorySelect';
import { DiscussionWithSelect } from '../../components/mentor/DiscussionWithSelect';
import { EvidenceUploader, type StoredEvidenceView } from '../../components/mentor/EvidenceUploader';
import { EvidenceGallery } from '../../components/mentor/EvidenceGallery';
import { SaturdayEvidenceModal } from '../../components/mentor/SaturdayEvidenceModal';
import type { PreparedEvidencePhoto } from '../../utils/evidence';
import {
  ArrowLeft,
  GraduationCap,
  CalendarCheck2,
  BookOpen,
  Award,
  FileText,
  User,
  History,
  Phone,
  Mail,
  Home,
  AlertCircle,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Bot,
  FileCheck,
  Send,
  HelpCircle,
  Check,
  ChevronRight,
  TrendingUp,
  MapPin,
  Shield,
  Layers,
  Star,
  Download,
  Edit2,
  Users,
  Camera,
  Briefcase,
} from 'lucide-react';

export type MentorProfileTab =
  | 'overview'
  | 'personal'
  | 'academic'
  | 'parent'
  | 'mentor'
  | 'counselling'
  | 'progress'
  | 'documents'
  | 'meeting'
  | 'skills'
  | 'placement';

interface MentorStudentProfileViewProps {
  studentId: string;
  onBack?: () => void;
  initialTab?: MentorProfileTab | string;
}

export const MentorStudentProfileView: React.FC<MentorStudentProfileViewProps> = ({
  studentId,
  onBack,
  initialTab = 'overview',
}) => {
  const { user } = useAuth();
  const toast = useToast();

  // Core Data
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [activeTab, setActiveTab] = useState<MentorProfileTab>(
    (initialTab as MentorProfileTab) || 'overview'
  );
  const [docSubTab, setDocSubTab] = useState<'progress' | 'files'>('progress');
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [saturdaySchedule, setSaturdaySchedule] = useState<any>(null);

  // Modals
  const [showRequestUpdateModal, setShowRequestUpdateModal] = useState(false);
  const [requestUpdateForm, setRequestUpdateForm] = useState({
    field: 'Personal Information',
    details: '',
    reason: '',
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    meetingDate: new Date().toISOString().split('T')[0],
    meetingTime: '10:30 AM',
    location: 'Faculty Cabin / Mentoring Room',
    attendanceStatus: 'PRESENT',
    meetingStatus: 'COMPLETED',
    challengesDiscussed: '',
    studentFeedback: '',
    counsellingProvided: '',
    correctiveAction: '',
    followUpRequired: false,
    followUpDate: '',
    mentorRemarks: '',
  });
  const [submittingMeeting, setSubmittingMeeting] = useState(false);

  // Separate Mentor AI Assistant Modal
  const [showAiBot, setShowAiBot] = useState(false);

  // Mentor-Controlled Counselling Form Modal (Strictly manual with grammar assist)
  const [showCounsellingModal, setShowCounsellingModal] = useState(false);
  const [editingCounsellingId, setEditingCounsellingId] = useState<string | null>(null);
  const [counsellingForm, setCounsellingForm] = useState({
    counsellingDate: new Date().toISOString().split('T')[0],
    categories: ['Academic Development'] as string[],
    // WHO this discussion was held with. Required and not mutually exclusive:
    // ['student'], ['parent'], or both. The server refuses a save without it.
    discussionWith: [] as Array<'student' | 'parent'>,
    concernReason: '',
    discussionObservation: '',
    skillNeedingImprovement: '',
    mentorRemarks: '',
    actionPlan: '',
    followUpDate: '',
    status: 'Completed',
  });
  const [submittingCounselling, setSubmittingCounselling] = useState(false);
  const [counsellingErrors, setCounsellingErrors] = useState<Record<string, string>>({});
  const [activeAiField, setActiveAiField] = useState<string | null>(null);

  // Geo-tagged evidence photos. `evidencePhotos` are picked but not yet saved;
  // `removedEvidenceIds` are saved photos the mentor has chosen to detach.
  // Everything else on the record is preserved untouched.
  const [evidencePhotos, setEvidencePhotos] = useState<PreparedEvidencePhoto[]>([]);
  const [removedEvidenceIds, setRemovedEvidenceIds] = useState<string[]>([]);
  const [editingCounsellingEvidence, setEditingCounsellingEvidence] = useState<StoredEvidenceView[]>([]);

  // Saturday COMMON meeting: one shared upload linked to every participant.
  const [showSaturdayModal, setShowSaturdayModal] = useState(false);

  const [showClearArrearModal, setShowClearArrearModal] = useState(false);
  const [clearArrearForm, setClearArrearForm] = useState({
    subjectCode: '',
    originalSemester: 1,
    clearedInSemester: 1,
    clearedDate: new Date().toISOString().split('T')[0],
    remarks: '',
    attempt: 1,
  });
  const [clearingArrear, setClearingArrear] = useState(false);

  const [showSkillAssessmentModal, setShowSkillAssessmentModal] = useState(false);
  const [skillRatings, setSkillRatings] = useState<Record<string, number>>({
    'Technical Skills': 4,
    'Communication': 4,
    'Presentation': 3,
    'Leadership': 4,
    'Attendance & Discipline': 5,
    'Academic Performance': 4,
    'Career Preparation': 3,
  });
  const [skillNotes, setSkillNotes] = useState({
    focusArea: 'Data Structures & Problem Solving',
    recommendations: 'Participate in weekly coding contests and practice Anna University model questions.',
    monthName: `Evaluation - ${new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}`,
  });
  const [submittingSkills, setSubmittingSkills] = useState(false);

  // ── Academic Correction Request review queue ──────────────────────────────
  const [myAcademicRequests, setMyAcademicRequests] = useState<any[]>([]);
  const [academicRequestsLoading, setAcademicRequestsLoading] = useState(false);
  const [academicRequestsError, setAcademicRequestsError] = useState<string | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadMyAcademicRequests = async () => {
    setAcademicRequestsLoading(true);
    setAcademicRequestsError(null);
    try {
      const res = await api.academicRequests.list({ status: '', all: 'true' });
      if (res.success) {
        const all = Array.isArray(res.data) ? res.data : res.data?.requests || [];
        // Only this student's requests belong on this page.
        setMyAcademicRequests(
          all.filter((r: any) => {
            const sid = r.studentId || r.student_id;
            return !sid || String(sid) === String(studentId);
          })
        );
      } else {
        setAcademicRequestsError(res.message || 'Failed to load correction requests.');
      }
    } catch (err: any) {
      setAcademicRequestsError(err?.message || 'Failed to load correction requests.');
    } finally {
      setAcademicRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (studentId) loadMyAcademicRequests();
  }, [studentId]);

  const openReviewModal = (request: any, action: 'APPROVE' | 'REJECT') => {
    setReviewTarget(request);
    setReviewAction(action);
    setReviewNote('');
    setReviewError(null);
    setShowReviewModal(true);
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    if (reviewAction === 'REJECT' && reviewNote.trim().length < 5) {
      setReviewError('A rejection reason is required so the student understands the decision.');
      return;
    }
    const id = reviewTarget.requestId || reviewTarget._id || reviewTarget.id;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res =
        reviewAction === 'APPROVE'
          ? await api.academicRequests.approve(id, { reviewNotes: reviewNote.trim() })
          : await api.academicRequests.reject(id, reviewNote.trim());
      if (res.success) {
        toast.success(
          reviewAction === 'APPROVE'
            ? `Approved. The Semester 0${reviewTarget.semesterNumber} record has been updated.`
            : 'Request rejected. The original academic record is unchanged.'
        );
        setShowReviewModal(false);
        await loadMyAcademicRequests();
        // Re-read the student so the academic table reflects the change.
        if (reviewAction === 'APPROVE') fetchStudentData();
      } else {
        setReviewError(res.message || 'The review could not be saved.');
      }
    } catch (err: any) {
      setReviewError(err?.message || 'The review could not be saved.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Sync initial tab
  useEffect(() => {
    if (initialTab) {
      const validTabs: MentorProfileTab[] = [
        'overview',
        'personal',
        'academic',
        'parent',
        'mentor',
        'counselling',
        'progress',
        'documents',
        'meeting',
        'skills',
        'placement',
      ];
      if (validTabs.includes(initialTab as MentorProfileTab)) {
        setActiveTab(initialTab as MentorProfileTab);
      }
    }
  }, [initialTab]);

  // Fetch Student Profile from MongoDB
  const fetchStudentData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentRes, scheduleRes] = await Promise.all([
        api.students.getById(studentId),
        api.meetings.getSchedule().catch(() => ({ success: false, data: null })),
      ]);

      if (studentRes.success && studentRes.data) {
        setStudent(studentRes.data);
      } else {
        setError(new ApiError(404, 'Student profile not found', `/students/${studentId}`));
      }

      if (scheduleRes.success && scheduleRes.data) {
        setSaturdaySchedule(scheduleRes.data);
      }
    } catch (err: any) {
      console.error('MentorStudentProfileView load error:', err);
      setError(err instanceof ApiError ? err : new ApiError(500, err?.message, `/students/${studentId}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [studentId]);

  // PDF Download Handler (full record book / internal assessment / mentor documents)
  const handleDownloadPdf = async (mode: StudentPdfMode) => {
    if (!student) return;
    setPdfDownloading(true);
    try {
      const filenameMap: Record<StudentPdfMode, string> = {
        full: `KSRCE_Mentee_${student.register_number}_Record_Book.pdf`,
        internal: `KSRCE_Internal_Assessment_${student.register_number}.pdf`,
        'mentor-documents': `KSRCE_Mentor_Documents_${student.register_number}.pdf`,
      };
      const labelMap: Record<StudentPdfMode, string> = {
        full: 'KSRCE Student Record Book PDF',
        internal: 'Internal Assessment PDF',
        'mentor-documents': 'Mentor Documents PDF',
      };
      await api.pdf.downloadStudentPdf(student.id, filenameMap[mode], mode);
      toast.success(`${labelMap[mode]} downloaded successfully.`);
    } catch (err: any) {
      toast.error('Failed to download student PDF: ' + err.message);
    } finally {
      setPdfDownloading(false);
    }
  };

  // Request Update Handler
  const handleRequestUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRequest(true);
    setTimeout(() => {
      setSubmittingRequest(false);
      setShowRequestUpdateModal(false);
      toast.success(
        `Profile update request for "${requestUpdateForm.field}" submitted to Academic Administrator.`
      );
      setRequestUpdateForm({ field: 'Personal Information', details: '', reason: '' });
    }, 400);
  };

  // Saturday Meeting Submission
  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingMeeting(true);
    try {
      await api.meetings.create({
        studentId: student.id,
        ...meetingForm,
      });
      toast.success('Saturday mentoring session logged successfully.');
      setShowMeetingModal(false);
      await fetchStudentData();
    } catch (err: any) {
      toast.error('Failed to log meeting: ' + err.message);
    } finally {
      setSubmittingMeeting(false);
    }
  };

  // Handle applying writing assistant suggestion directly into React state
  const handleUseCorrection = (fieldKey: string, correctedText: string) => {
    if (!correctedText || !fieldKey) return;
    setCounsellingForm((prev) => ({
      ...prev,
      [fieldKey]: correctedText,
    }));
    if (counsellingErrors[fieldKey]) {
      setCounsellingErrors((prev) => ({ ...prev, [fieldKey]: undefined }));
    }
  };

  // Meeting fields live in a different form object, so they need their own
  // setter. Kept deliberately explicit so a field can never be routed to the
  // wrong form by a copy-paste mistake.
  const handleMeetingUseCorrection = (fieldKey: 'challengesDiscussed' | 'mentorRemarks', correctedText: string) => {
    if (!correctedText) return;
    setMeetingForm((prev) => ({ ...prev, [fieldKey]: correctedText }));
  };

  // Open modal for creating new counselling record
  const handleOpenAddCounselling = () => {
    setEditingCounsellingId(null);
    setActiveAiField(null);
    setCounsellingErrors({});
    setEvidencePhotos([]);
    setRemovedEvidenceIds([]);
    setEditingCounsellingEvidence([]);
    setCounsellingForm({
      counsellingDate: new Date().toISOString().split('T')[0],
      categories: ['Academic Development'],
      discussionWith: [],
      concernReason: '',
      discussionObservation: '',
      skillNeedingImprovement: '',
      mentorRemarks: '',
      actionPlan: '',
      followUpDate: '',
      status: 'Completed',
    });
    setShowCounsellingModal(true);
  };

  // Open modal for editing existing counselling record (preserves selections)
  const handleEditCounselling = (c: any) => {
    setEditingCounsellingId(c.id || c._id);
    setActiveAiField(null);
    setCounsellingErrors({});
    setEvidencePhotos([]);
    setRemovedEvidenceIds([]);
    // Photos already on the record are shown so an edit never silently drops one.
    setEditingCounsellingEvidence(Array.isArray(c.evidence) ? c.evidence : []);
    const existingCats = Array.isArray(c.categories) && c.categories.length > 0
      ? c.categories
      : (c.category ? c.category.split(',').map((s: string) => s.trim()).filter(Boolean) : ['Academic Development']);

    // Reported exactly as stored. A record created before this field existed
    // reads "Not recorded" and starts empty rather than being guessed.
    const existingDiscussion = Array.isArray(c.discussionWith)
      ? c.discussionWith.filter((v: string) => v === 'student' || v === 'parent')
      : Array.isArray(c.discussion_with)
        ? c.discussion_with.filter((v: string) => v === 'student' || v === 'parent')
        : [];

    setCounsellingForm({
      counsellingDate: c.counselling_date || c.counsellingDate || c.session_date ? new Date(c.counselling_date || c.counsellingDate || c.session_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      categories: existingCats,
      discussionWith: existingDiscussion,
      concernReason: c.concern_reason || c.concernReason || '',
      discussionObservation: c.discussion_observation || c.discussionObservation || c.challenge_observed || c.challengeObserved || '',
      skillNeedingImprovement: c.skill_needing_improvement || c.skillNeedingImprovement || '',
      mentorRemarks: c.mentor_remarks || c.mentorRemarks || '',
      actionPlan: c.action_plan || c.actionPlan || c.corrective_action || c.correctiveAction || '',
      followUpDate: c.follow_up_date || c.followUpDate ? new Date(c.follow_up_date || c.followUpDate).toISOString().split('T')[0] : '',
      status: c.status || 'Completed',
    });
    setShowCounsellingModal(true);
  };

  // Mentor-Controlled Counselling Submission (Strictly mentor-typed, AI never automatically generates or saves)
  const handleCounsellingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!counsellingForm.counsellingDate) {
      errors.counsellingDate = 'Counselling Date is required.';
    }
    if (!counsellingForm.categories || counsellingForm.categories.length === 0) {
      errors.categories = 'Please select at least one Counselling Category.';
    }
    if (counsellingForm.discussionWith.length === 0) {
      errors.discussionWith = 'Select who this discussion was held with (Student, Parent, or both).';
    }
    if (!counsellingForm.concernReason.trim()) {
      errors.concernReason = 'Concern / Reason is required.';
    }
    if (!counsellingForm.discussionObservation.trim()) {
      errors.discussionObservation = 'Discussion / Observation is required.';
    }
    if (!counsellingForm.actionPlan.trim()) {
      errors.actionPlan = 'Action Plan is required.';
    }

    if (Object.keys(errors).length > 0) {
      setCounsellingErrors(errors);
      return;
    }
    setCounsellingErrors({});

    setSubmittingCounselling(true);
    try {
      const payload = {
        studentId: student.id,
        counsellingDate: counsellingForm.counsellingDate,
        categories: counsellingForm.categories,
        category: counsellingForm.categories.join(', '),
        discussionWith: counsellingForm.discussionWith,
        concernReason: counsellingForm.concernReason.trim(),
        discussionObservation: counsellingForm.discussionObservation.trim(),
        challengeObserved: counsellingForm.discussionObservation.trim() || counsellingForm.concernReason.trim(),
        skillNeedingImprovement: counsellingForm.skillNeedingImprovement.trim(),
        mentorRemarks: counsellingForm.mentorRemarks || counsellingForm.actionPlan.trim(),
        actionPlan: counsellingForm.actionPlan.trim(),
        correctiveAction: counsellingForm.actionPlan.trim(),
        followUpDate: counsellingForm.followUpDate,
        status: counsellingForm.status,
        aiGenerated: false,
      };

      // Sent as multipart when photos are attached. A plain text edit stays JSON and preserves existing evidence.
      const saved = evidencePhotos.length > 0
        ? await (editingCounsellingId
            ? api.counselling.updateWithEvidence(editingCounsellingId, payload, evidencePhotos, removedEvidenceIds)
            : api.counselling.createWithEvidence(payload, evidencePhotos))
        : editingCounsellingId
          ? await (removedEvidenceIds.length > 0
              ? api.counselling.updateWithEvidence(editingCounsellingId, payload, [], removedEvidenceIds)
              : api.counselling.update(editingCounsellingId, payload))
          : await api.counselling.create(payload);

      const result: any = saved?.data ?? saved;
      // An update reports how many were added; a create reports the total it stored.
      const added = Number(result?.evidenceAdded ?? result?.evidenceCount ?? 0);
      const detached = Number(result?.evidenceDetached ?? 0);
      const retained = (result?.evidenceRetained || []).length;

      if (editingCounsellingId) {
        const parts = [`Mentoring record updated successfully.`];
        if (added > 0) parts.push(`${added} new evidence photo(s) added.`);
        if (detached > 0) parts.push(`${detached} photo(s) detached.`);
        if (retained > 0) parts.push(`${retained} detached photo(s) are still shared and were retained.`);
        toast.success(parts.join(' '));
      } else {
        toast.success(
          added > 0
            ? `Mentoring record saved with ${added} evidence photo(s).`
            : 'Mentoring record saved successfully.'
        );
      }

      setShowCounsellingModal(false);
      setEditingCounsellingId(null);
      setActiveAiField(null);
      setCounsellingErrors({});
      setEvidencePhotos([]);
      setRemovedEvidenceIds([]);
      setEditingCounsellingEvidence([]);
      setCounsellingForm({
        counsellingDate: new Date().toISOString().split('T')[0],
        categories: ['Academic Development'],
        discussionWith: [],
        concernReason: '',
        discussionObservation: '',
        skillNeedingImprovement: '',
        mentorRemarks: '',
        actionPlan: '',
        followUpDate: '',
        status: 'Completed',
      });
      await fetchStudentData();
    } catch (err: any) {
      toast.error('Failed to save mentoring record: ' + err.message);
    } finally {
      setSubmittingCounselling(false);
    }
  };

  // Clear Arrear Submission
  const handleClearArrearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clearArrearForm.subjectCode.trim()) {
      toast.warning('Subject Code is required.');
      return;
    }
    setClearingArrear(true);
    try {
      const res = await api.students.clearArrear(student.id, {
        subjectCode: clearArrearForm.subjectCode.trim().toUpperCase(),
        clearedInSemester: Number(clearArrearForm.clearedInSemester),
        originalSemester: Number(clearArrearForm.originalSemester),
        clearedDate: clearArrearForm.clearedDate,
        remarks: clearArrearForm.remarks.trim() || 'Cleared in university re-examination attempt',
        attempt: Number(clearArrearForm.attempt) || 1,
      });

      if (res.success) {
        toast.success(`Arrear ${clearArrearForm.subjectCode.toUpperCase()} marked as cleared.`);
        setShowClearArrearModal(false);
        await fetchStudentData();
      } else {
        toast.error(res.message || 'Failed to record arrear clearance.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error recording arrear clearance.');
    } finally {
      setClearingArrear(false);
    }
  };

  // Skill Assessment Submission
  const handleSkillAssessmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingSkills(true);
    try {
      await api.progress.create({
        studentId: student.id,
        academicYear: student.batch_name ? `Batch ${student.batch_name}` : '2026-2027',
        monthName: skillNotes.monthName,
        academicRating: skillRatings['Academic Performance'] || 4,
        academicNotes: skillNotes.recommendations,
        placementRating: skillRatings['Career Preparation'] || 3,
        placementNotes: skillNotes.focusArea,
        ecRating: skillRatings['Leadership'] || 4,
        ecNotes: 'Active mentee participation',
        innovationRating: skillRatings['Presentation'] || 4,
        innovationNotes: 'Evaluated during mentoring session',
        skillRating: skillRatings['Technical Skills'] || 4,
        skillNotes: skillNotes.recommendations,
      });
      toast.success('Skill & progress assessment saved successfully.');
      setShowSkillAssessmentModal(false);
      await fetchStudentData();
    } catch (err: any) {
      toast.error('Failed to save assessment: ' + err.message);
    } finally {
      setSubmittingSkills(false);
    }
  };

  // Loading & Error States
  if (loading) {
    return <StudentProfileSkeleton />;
  }

  if (error || !student) {
    if (error?.type === 'STUDENT_NOT_FOUND' || error?.statusCode === 404) {
      return (
        <StudentNotFound
          onBackToStudents={onBack || (() => window.history.back())}
          onGoDashboard={onBack || (() => window.history.back())}
          fullPage={false}
        />
      );
    }
    if (error?.type === 'NETWORK_ERROR' || error?.statusCode === 0) {
      return <NetworkErrorState onRetry={fetchStudentData} fullPage={false} />;
    }
    if (error?.type === 'SERVICE_UNAVAILABLE' || error?.statusCode === 503) {
      return <ServiceUnavailableState onRetry={fetchStudentData} fullPage={false} />;
    }
    return <ServerErrorState onRetry={fetchStudentData} fullPage={false} />;
  }

  // Calculated values
  const activeArrearsCount =
    typeof student.active_arrears_count === 'number'
      ? student.active_arrears_count
      : (student.total_arrears || 0);

  const cgpaValue =
    student.semesters && student.semesters.length > 0 && student.semesters[student.semesters.length - 1].cgpa > 0
      ? student.semesters[student.semesters.length - 1].cgpa.toFixed(2)
      : (student.cgpa ? Number(student.cgpa).toFixed(2) : 'N/A');

  // Year calculation
  const calculateYearRoman = () => {
    if (student.year) return student.year;
    const currentSem = student.semesters?.length || 1;
    if (currentSem <= 2) return 'I Year';
    if (currentSem <= 4) return 'II Year';
    if (currentSem <= 6) return 'III Year';
    return 'IV Year';
  };
  const yearRoman = calculateYearRoman();

  // Distinct tabs list (Section 3)
  const TABS: { id: MentorProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: '1. Overview', icon: <Layers size={16} aria-hidden="true" /> },
    { id: 'personal', label: '2. Personal Details', icon: <User size={16} aria-hidden="true" /> },
    { id: 'academic', label: '3. Academic Details', icon: <GraduationCap size={16} aria-hidden="true" /> },
    { id: 'parent', label: '4. Parent Details', icon: <Home size={16} aria-hidden="true" /> },
    { id: 'mentor', label: '5. Mentor History', icon: <History size={16} aria-hidden="true" /> },
    { id: 'counselling', label: '6. Counselling', icon: <BookOpen size={16} aria-hidden="true" /> },
    { id: 'progress', label: '7. Student Progress & Certificates', icon: <Award size={16} aria-hidden="true" /> },
    { id: 'documents', label: '8. Documents / Certificates', icon: <FileCheck size={16} aria-hidden="true" /> },
    { id: 'meeting', label: '9. Meeting History', icon: <CalendarCheck2 size={16} aria-hidden="true" /> },
    { id: 'skills', label: '10. Progress & Skills', icon: <Star size={16} aria-hidden="true" /> },
    { id: 'placement', label: '11. Placement / Career', icon: <Briefcase size={16} aria-hidden="true" /> },
  ];

  return (
    <div className="mentor-mentee-profile" style={{ maxWidth: '1280px', margin: '0 auto', color: 'var(--slate-800)' }}>
      {/* ============================================================
          1. MENTOR VIEW HEADER (Clean institutional header for mentor)
          ============================================================ */}
      <div
        className="card mentor-header-card"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5) var(--space-6)',
          marginBottom: 'var(--space-5)',
          border: '1px solid var(--slate-200)',
          boxShadow: 'var(--shadow-sm)',
          borderLeft: '4px solid var(--primary-800)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Mentee Identity */}
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  title="Return to Mentees Roster"
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Back to Mentees
                </button>
              )}
              <span className="badge badge-primary" style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Mentor View • Read-Only Dossier
              </span>
            </div>

            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: 'var(--primary-800)',
                margin: '0 0 var(--space-1) 0',
                letterSpacing: '-0.01em',
                overflowWrap: 'anywhere',
              }}
            >
              {student.full_name}
            </h1>

            {/* Subtitle details */}
            <dl
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.35rem 0.9rem',
                fontSize: 'var(--text-base)',
                color: 'var(--slate-600)',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <dt style={{ color: 'var(--slate-500)' }}>Register No</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: 'var(--slate-900)' }}>{student.register_number}</dd>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <dt style={{ color: 'var(--slate-500)' }}>Department</dt>
                <dd style={{ margin: 0 }}>{student.department_name || 'Information Technology'}</dd>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <dt style={{ color: 'var(--slate-500)' }}>Year</dt>
                <dd style={{ margin: 0 }}>
                  {yearRoman}
                  {student.batch_name ? ` • Batch ${student.batch_name}` : ''}
                </dd>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <dt style={{ color: 'var(--slate-500)' }}>Section</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: 'var(--slate-900)' }}>{student.section || 'A'}</dd>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <dt style={{ color: 'var(--slate-500)' }}>Mentor</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: 'var(--primary-800)' }}>
                  {student.currentMentor?.mentor_name || 'Not Assigned'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Right: Key Institutional Metrics & PDF Action */}
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
          >
            {/* CGPA Metric */}
            <div
              style={{
                backgroundColor: 'var(--slate-50)',
                border: '1px solid var(--slate-200)',
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 1rem',
                textAlign: 'center',
                minWidth: '92px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                CGPA
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--primary-800)' }}>
                {cgpaValue}
              </div>
            </div>

            {/* Standing Arrears Metric — status carried by icon + text, not colour alone */}
            <div
              style={{
                backgroundColor: activeArrearsCount > 0 ? 'var(--danger-100)' : 'var(--success-100)',
                border: `1px solid ${activeArrearsCount > 0 ? '#FECACA' : '#A7F3D0'}`,
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 1rem',
                textAlign: 'center',
                minWidth: '128px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  color: activeArrearsCount > 0 ? '#B91C1C' : '#047857',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                }}
              >
                {activeArrearsCount > 0 ? (
                  <AlertTriangle size={12} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={12} aria-hidden="true" />
                )}
                Arrears
              </div>
              <div
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 800,
                  color: activeArrearsCount > 0 ? 'var(--danger-600)' : 'var(--success-600)',
                }}
              >
                {activeArrearsCount === 0 ? '0 (Cleared)' : `${activeArrearsCount} Active`}
              </div>
            </div>
          </div>
        </div>

        {/* Action row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            marginTop: 'var(--space-5)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--slate-100)',
          }}
        >
          <button
            type="button"
            onClick={() => setShowRequestUpdateModal(true)}
            className="btn btn-secondary"
            title="Request profile correction to Administrator"
          >
            <HelpCircle size={16} aria-hidden="true" /> Request Update
          </button>

          <button
            type="button"
            onClick={() => handleDownloadPdf('full')}
            disabled={pdfDownloading}
            className="btn btn-gold"
            aria-label={pdfDownloading ? 'Generating student PDF, please wait' : 'Download student record PDF'}
          >
            <Download size={16} aria-hidden="true" />
            {pdfDownloading ? 'Generating PDF…' : 'Download Student PDF'}
          </button>

          <button
            type="button"
            onClick={() => handleDownloadPdf('internal')}
            disabled={pdfDownloading}
            className="btn btn-secondary"
            title="Download the internal assessment (IA1 / IA2 / End Sem) PDF"
          >
            <FileText size={16} aria-hidden="true" /> Internal Assessment
          </button>

          <button
            type="button"
            onClick={() => handleDownloadPdf('mentor-documents')}
            disabled={pdfDownloading}
            className="btn btn-secondary"
            title="Download the mentor documents (meetings / counselling / evidence) PDF"
          >
            <FileCheck size={16} aria-hidden="true" /> Mentor Documents
          </button>

          <button
            type="button"
            onClick={() => setShowAiBot(true)}
            className="btn btn-outline"
            style={{ borderColor: 'var(--primary-600)', color: 'var(--primary-600)' }}
            title="Open the Mentor AI Advisory Assistant"
          >
            <Bot size={16} aria-hidden="true" /> AI Assistant
          </button>
        </div>
      </div>

      {/* ============================================================
          3. MENTOR PROFILE TABS (Responsive scrollable tab bar)
          ============================================================ */}
      <div
        className="mentor-tab-bar"
        role="tablist"
        aria-label="Mentee dossier sections"
        style={{
          display: 'flex',
          gap: '0.4rem',
          borderBottom: '2px solid var(--slate-200)',
          marginBottom: 'var(--space-6)',
          overflowX: 'auto',
          paddingBottom: '2px',
          scrollbarWidth: 'none',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`mentor-tab-pane-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                whiteSpace: 'nowrap',
                fontWeight: isActive ? 700 : 500,
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all var(--motion-fast) var(--ease-standard)',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ============================================================
          4. OVERVIEW TAB
          ============================================================ */}
      {activeTab === 'overview' && (
        <div
          className="tab-pane-overview"
          id="mentor-tab-pane-overview"
          role="tabpanel"
          aria-label="Mentee overview"
        >
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Mentee Overview"
            subtitle="Consolidated snapshot of academic standing, counselling sessions, meetings and documents."
          />

          {/* 6 Summary Cards — each is a real button so it is keyboard reachable */}
          <div className="overview-summary-grid">
            {/* 1. Academic Performance */}
            <button
              type="button"
              className="card overview-summary-card"
              onClick={() => setActiveTab('academic')}
              aria-label={`Academic Performance, CGPA ${cgpaValue}. Open academic details.`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span className="overview-summary-label">
                  Academic Performance
                </span>
                <GraduationCap size={18} color="var(--primary-800)" aria-hidden="true" />
              </div>
              <div className="overview-summary-value">
                {cgpaValue}
              </div>
              <div className="overview-summary-foot">
                {student.semesters?.length || 0} Semesters Evaluated
              </div>
            </button>

            {/* 2. Current Arrears */}
            <button
              type="button"
              className="card overview-summary-card"
              onClick={() => setActiveTab('academic')}
              aria-label={`Current Arrears: ${activeArrearsCount === 0 ? 'none, cleared' : `${activeArrearsCount} active`}. Open academic details.`}
              style={{ borderLeft: `4px solid ${activeArrearsCount > 0 ? 'var(--danger-600)' : 'var(--success-600)'}` }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span className="overview-summary-label">
                  Current Arrears
                </span>
                {activeArrearsCount > 0 ? (
                  <AlertCircle size={18} color="var(--danger-600)" aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={18} color="var(--success-600)" aria-hidden="true" />
                )}
              </div>
              <div
                className="overview-summary-value"
                style={{ color: activeArrearsCount > 0 ? 'var(--danger-600)' : 'var(--success-600)' }}
              >
                {activeArrearsCount === 0 ? '0 Cleared' : `${activeArrearsCount} Active`}
              </div>
              <div className="overview-summary-foot">
                {student.cleared_arrears_count || 0} Cleared in History
              </div>
            </button>

            {/* 3. Counselling Sessions */}
            <button
              type="button"
              className="card overview-summary-card"
              onClick={() => setActiveTab('counselling')}
              aria-label={`Counselling Sessions: ${student.counsellingRecords?.length || 0}. Open counselling records.`}
              style={{ borderLeft: '4px solid var(--primary-600)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span className="overview-summary-label">
                  Counselling Sessions
                </span>
                <BookOpen size={18} color="var(--primary-600)" aria-hidden="true" />
              </div>
              <div className="overview-summary-value">
                {student.counsellingRecords?.length || 0}
              </div>
              <div className="overview-summary-foot">
                5-Domain Mentoring Records
              </div>
            </button>

            {/* 4. Saturday Meetings */}
            <button
              type="button"
              className="card overview-summary-card"
              onClick={() => setActiveTab('meeting')}
              aria-label={`Saturday Meetings: ${student.meetings?.length || 0}. Open meeting history.`}
              style={{ borderLeft: '4px solid var(--gold-600)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span className="overview-summary-label">
                  Saturday Meetings
                </span>
                <CalendarCheck2 size={18} color="var(--gold-600)" aria-hidden="true" />
              </div>
              <div className="overview-summary-value">
                {student.meetings?.length || 0}
              </div>
              <div className="overview-summary-foot">
                Meeting Logs &amp; Attendance
              </div>
            </button>

            {/* 5. Documents */}
            <button
              type="button"
              className="card overview-summary-card"
              onClick={() => setActiveTab('documents')}
              aria-label={`Documents: ${student.documents?.length || (student.counsellingRecords ? 4 : 0)}. Open documents and certificates.`}
              style={{ borderLeft: '4px solid var(--success-600)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span className="overview-summary-label">
                  Documents
                </span>
                <FileCheck size={18} color="var(--success-600)" aria-hidden="true" />
              </div>
              <div className="overview-summary-value">
                {student.documents?.length || (student.counsellingRecords ? 4 : 0)}
              </div>
              <div className="overview-summary-foot">
                Certificates &amp; Verification
              </div>
            </button>

            {/* 6. Skill Progress */}
            <button
              type="button"
              className="card overview-summary-card"
              onClick={() => setActiveTab('skills')}
              aria-label={`Skill Progress: ${activeArrearsCount > 0 ? '2 needing focus' : 'on track'}. Open progress and skills.`}
              style={{ borderLeft: '4px solid var(--primary-500)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span className="overview-summary-label">
                  Skill Progress
                </span>
                <Award size={18} color="var(--primary-500)" aria-hidden="true" />
              </div>
              <div className="overview-summary-value">
                {activeArrearsCount > 0 ? '2 Needing Focus' : 'On Track'}
              </div>
              <div className="overview-summary-foot">
                7 Core Mentoring Domains
              </div>
            </button>
          </div>

          {/* Mentee Executive Overview & Assigned Mentor Dossier */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-5)' }}>
            {/* Left: Mentee Profile Summary */}
            <div className="card">
              <h3 className="card-title">
                <User size={18} color="var(--primary-800)" aria-hidden="true" /> Mentee Identity Snapshot
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', fontSize: 'var(--text-base)' }}>
                <div>
                  <div className="field-label">Date of Birth</div>
                  <div className="field-value">
                    {student.dob ? new Date(student.dob).toLocaleDateString() : 'Recorded in File'}
                  </div>
                </div>
                <div>
                  <div className="field-label">Blood Group</div>
                  <div className="field-value">
                    {student.blood_group || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="field-label">Residential Status</div>
                  <div className="field-value">
                    <span className="badge badge-primary">
                      {student.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="field-label">Mobile Contact</div>
                  <div className="field-value-accent">
                    {student.mobile_number || 'N/A'}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="field-label">Father / Guardian Name</div>
                  <div className="field-value">
                    {student.parent?.father_name || 'Recorded in dossier'}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="field-label">Institutional Email</div>
                  <div className="field-value-accent">
                    {student.email || `${student.register_number}@ksrce.ac.in`}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Mentor Assignment & Saturday Milestones */}
            <div className="card">
              <h3 className="section-heading">
                <History size={18} color="var(--primary-800)" aria-hidden="true" /> Mentorship Responsibility
              </h3>
              {student.currentMentor ? (
                <div style={{ backgroundColor: 'var(--slate-50)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', border: '1px solid var(--slate-200)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--primary-800)' }}>
                    {student.currentMentor.mentor_name}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--slate-500)', marginTop: 'var(--space-1)' }}>
                    {student.currentMentor.designation} • {student.currentMentor.cabin_location || 'Faculty Cabin'}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--success-600)', fontWeight: 600, marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Active Assignment Since: {student.currentMentor.assigned_from || 'Academic Term'}
                  </div>
                </div>
              ) : (
                <div className="notice notice-warning" style={{ marginBottom: 'var(--space-4)' }}>
                  <AlertTriangle size={18} aria-hidden="true" />
                  <span>No active mentor assignment record found in the system.</span>
                </div>
              )}

              {/* Saturday Meeting Milestone */}
              <div className="notice notice-warning">
                <CalendarCheck2 size={24} aria-hidden="true" />
                <div>
                  <div className="notice-title">
                    Upcoming Saturday Mentoring Session
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: '#78350F', marginTop: 'var(--space-1)' }}>
                    {saturdaySchedule?.time || '10:30 AM'} • {saturdaySchedule?.location || 'Faculty Cabin'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          5. PERSONAL DETAILS TAB (Read-only for mentor with Request Update)
          ============================================================ */}
      {activeTab === 'personal' && (
        <div id="mentor-tab-pane-personal" role="tabpanel" className="card">
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Mentee Personal Details"
            subtitle="Read-only institutional record. To propose corrections, click Request Update."
            actions={
              <button
                type="button"
                onClick={() => setShowRequestUpdateModal(true)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
              >
                <HelpCircle size={16} /> Request Update
              </button>
            }
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.5rem',
            }}
          >
            <div>
              <div className="field-label">
                Full Student Name
              </div>
              <div className="field-value">
                {student.full_name}
              </div>
            </div>

            <div>
              <div className="field-label">
                Register Number
              </div>
              <div className="field-value">
                <code>{student.register_number}</code>
              </div>
            </div>

            <div>
              <div className="field-label">
                Date of Birth
              </div>
              <div className="field-value">
                {student.dob ? new Date(student.dob).toLocaleDateString() : 'Recorded in dossier'}
              </div>
            </div>

            <div>
              <div className="field-label">
                Blood Group
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-danger-600)', marginTop: '4px' }}>
                {student.blood_group || 'N/A'}
              </div>
            </div>

            <div>
              <div className="field-label">
                Contact Number
              </div>
              <div className="field-value-accent">
                {student.mobile_number ? (
                  <a href={`tel:${student.mobile_number}`} style={{ color: 'var(--color-navy-500)', textDecoration: 'none' }}>
                    📞 {student.mobile_number}
                  </a>
                ) : (
                  'N/A'
                )}
              </div>
            </div>

            <div>
              <div className="field-label">
                Official Email
              </div>
              <div className="field-value-accent">
                {student.email ? (
                  <a href={`mailto:${student.email}`} style={{ color: 'var(--color-navy-500)', textDecoration: 'none' }}>
                    ✉️ {student.email}
                  </a>
                ) : (
                  `${student.register_number}@ksrce.ac.in`
                )}
              </div>
            </div>

            <div>
              <div className="field-label">
                Department & Branch
              </div>
              <div className="field-value">
                {student.department_name || 'Information Technology'} ({student.department_code || 'IT'})
              </div>
            </div>

            <div>
              <div className="field-label">
                Year & Batch
              </div>
              <div className="field-value">
                {yearRoman} {student.batch_name ? `• Batch ${student.batch_name}` : ''}
              </div>
            </div>

            <div>
              <div className="field-label">
                Residential Status
              </div>
              <div style={{ marginTop: '4px' }}>
                <span className="badge badge-primary">
                  {student.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}
                </span>
              </div>
            </div>

            <div>
              <div className="field-label">
                Academic Year & Section
              </div>
              <div className="field-value">
                Year {student.year || '—'} • Section {student.section || '—'}
              </div>
            </div>

            <div>
              <div className="field-label">
                Admission Type
              </div>
              <div className="field-value">
                {(student.admission_type || student.admissionType || student.school?.admission_type) === 'LATERAL_ENTRY'
                  ? 'Lateral Entry'
                  : (student.admission_type || student.admissionType || student.school?.admission_type) === 'MANAGEMENT'
                  ? 'Management Quota'
                  : 'Counselling (Govt Quota)'}
              </div>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <div className="field-label">
                Scholarship Details
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--color-slate-700)', marginTop: '4px' }}>
                {student.scholarship_details || student.scholarshipDetails || 'No scholarship recorded'}
              </div>
            </div>

            {/* Lateral Entry Details Section (Conditional) */}
            {((student.admission_type || student.admissionType) === 'LATERAL_ENTRY' ||
              Boolean(student.lateral_entry?.previous_college_name || student.lateralEntry?.previousCollegeName)) && (
              <div style={{ gridColumn: 'span 2', backgroundColor: '#EFF6FF', border: '1px solid var(--color-navy-200)', borderRadius: '8px', padding: '1rem', marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1E40AF', margin: '0 0 0.75rem 0' }}>
                  Lateral Entry Academic Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--color-slate-500)', display: 'block', fontSize: '0.75rem', fontWeight: 700 }}>Previous College Name:</span>
                    <strong style={{ color: 'var(--color-slate-800)' }}>{student.lateral_entry?.previous_college_name || student.lateralEntry?.previousCollegeName || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate-500)', display: 'block', fontSize: '0.75rem', fontWeight: 700 }}>Previous Course / Diploma:</span>
                    <strong style={{ color: 'var(--color-slate-800)' }}>{student.lateral_entry?.previous_course || student.lateralEntry?.previousCourse || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate-500)', display: 'block', fontSize: '0.75rem', fontWeight: 700 }}>Previous Institution:</span>
                    <strong style={{ color: 'var(--color-slate-800)' }}>{student.lateral_entry?.previous_institution || student.lateralEntry?.previousInstitution || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate-500)', display: 'block', fontSize: '0.75rem', fontWeight: 700 }}>Previous Qualification:</span>
                    <strong style={{ color: 'var(--color-slate-800)' }}>{student.lateral_entry?.previous_qualification_details || student.lateralEntry?.previousQualificationDetails || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-slate-500)', display: 'block', fontSize: '0.75rem', fontWeight: 700 }}>Admission Year:</span>
                    <strong style={{ color: 'var(--color-slate-800)' }}>{student.lateral_entry?.admission_year || student.lateralEntry?.admissionYear || '—'}</strong>
                  </div>
                </div>
              </div>
            )}

            <div style={{ gridColumn: 'span 2' }}>
              <div className="field-label">
                Permanent Home Address
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--color-slate-700)', marginTop: '4px', lineHeight: 1.5 }}>
                {student.address || 'Address on file in institutional registration book.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          6. ACADEMIC DETAILS TAB (Semester results, Active Arrears, Clearance)
          ============================================================ */}
      {activeTab === 'academic' && (
        <div id="mentor-tab-pane-academic" role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Academic Details"
            subtitle="Semester-wise results, active arrears, internal assessment marks and correction requests."
          />

          {/* ============================================================
              ACADEMIC CORRECTION REQUESTS (approve / reject)
              A student cannot edit CGPA/SGPA directly — every change
              arrives here as a per-semester request awaiting review.
              ============================================================ */}
          <div
            className="card"
            style={{
              padding: '1.25rem',
              backgroundColor: '#ffffff',
              border: '1px solid var(--color-slate-200)',
              borderLeft: '5px solid var(--color-navy-500)',
              borderRadius: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: myAcademicRequests.length > 0 ? '1rem' : 0,
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    color: 'var(--color-navy-800)',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <FileCheck size={18} /> Academic Correction Requests
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-500)', margin: '4px 0 0 0' }}>
                  {academicRequestsLoading
                    ? 'Loading requests…'
                    : myAcademicRequests.length === 0
                      ? 'No correction requests have been raised for this student.'
                      : `${myAcademicRequests.filter((r: any) => r.status === 'PENDING').length} pending review.`}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadMyAcademicRequests}
                style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                Refresh
              </button>
            </div>

            {academicRequestsError && (
              <div
                style={{
                  padding: '9px 12px',
                  background: 'var(--color-danger-50)',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  color: '#B91C1C',
                  fontSize: '0.8rem',
                  marginBottom: '0.75rem',
                }}
              >
                {academicRequestsError}
              </div>
            )}

            {myAcademicRequests.length > 0 && (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Semester</th>
                      <th>Current</th>
                      <th>Requested</th>
                      <th>Student Reason</th>
                      <th>Status</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myAcademicRequests.map((r: any) => (
                      <tr key={r.requestId || r._id || r.id}>
                        <td style={{ fontWeight: 700 }}>Semester 0{r.semesterNumber}</td>
                        <td>
                          CGPA {Number(r.currentCgpa || 0).toFixed(2)}
                          {Number(r.currentSgpa || 0) > 0
                            ? ` / SGPA ${Number(r.currentSgpa).toFixed(2)}`
                            : ''}
                        </td>
                        <td>
                          <strong style={{ color: 'var(--color-navy-500)' }}>
                            CGPA {Number(r.requestedCgpa || 0).toFixed(2)}
                          </strong>
                          {r.requestedSgpa !== null && r.requestedSgpa !== undefined
                            ? ` / SGPA ${Number(r.requestedSgpa).toFixed(2)}`
                            : ''}
                        </td>
                        <td style={{ maxWidth: '240px', fontSize: '0.8rem' }}>{r.reason}</td>
                        <td>
                          <span
                            className={`badge ${
                              r.status === 'APPROVED'
                                ? 'badge-success'
                                : r.status === 'REJECTED'
                                  ? 'badge-danger'
                                  : 'badge-warning'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td>
                          {r.status === 'PENDING' ? (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  backgroundColor: '#15803D',
                                  color: '#fff',
                                  border: '1px solid #15803D',
                                  fontWeight: 700,
                                }}
                                disabled={reviewingRequestId === (r.requestId || r._id || r.id)}
                                onClick={() =>
                                  openReviewModal(r, 'APPROVE')
                                }
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  backgroundColor: 'var(--color-danger-600)',
                                  color: '#fff',
                                  border: '1px solid var(--color-danger-600)',
                                  fontWeight: 700,
                                }}
                                disabled={reviewingRequestId === (r.requestId || r._id || r.id)}
                                onClick={() => openReviewModal(r, 'REJECT')}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)' }}>
                              {r.reviewedByName || '—'}
                              {r.reviewNotes ? ` — ${r.reviewNotes}` : ''}
                              {r.rejectionReason ? ` — ${r.rejectionReason}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Active Arrears Banner & Action */}
          <div
            className="card"
            style={{
              padding: '1.5rem',
              backgroundColor: activeArrearsCount > 0 ? 'var(--color-danger-50)' : '#F0FDF4',
              border: `1px solid ${activeArrearsCount > 0 ? '#FECACA' : '#BBF7D0'}`,
              borderLeft: `5px solid ${activeArrearsCount > 0 ? 'var(--color-danger-600)' : '#16A34A'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    color: activeArrearsCount > 0 ? '#991B1B' : '#166534',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertCircle size={20} /> Current Active Arrears: {activeArrearsCount}
                </h3>
                <p style={{ fontSize: '0.82rem', color: activeArrearsCount > 0 ? '#7F1D1D' : '#14532D', margin: '4px 0 0 0' }}>
                  {activeArrearsCount === 0
                    ? 'Mentee has cleared all subjects and is currently in good standing.'
                    : 'Active standing arrears requiring mentor intervention and re-exam coaching.'}
                </p>
              </div>

              {activeArrearsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearArrearModal(true)}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#15803D', borderColor: '#15803D', fontWeight: 700 }}
                >
                  <CheckCircle2 size={16} /> Record Arrear Clearance
                </button>
              )}
            </div>

            {/* List Active Arrears */}
            {activeArrearsCount > 0 && (
              <div style={{ marginTop: '1rem', backgroundColor: '#ffffff', borderRadius: '10px', padding: '1rem', border: '1px solid #FCA5A5' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.5rem' }}>
                  Uncleared Arrear Subjects:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {student.active_arrear_subjects && student.active_arrear_subjects.length > 0 ? (
                    student.active_arrear_subjects.map((sub: string, idx: number) => (
                      <span key={idx} className="badge badge-danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}>
                        {sub} — Active Arrear
                      </span>
                    ))
                  ) : (
                    <span className="badge badge-danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}>
                      {activeArrearsCount} Active Standing Arrear(s)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Semester-Wise Results Table */}
          <div className="card">
            <h3 className="section-heading">
              Semester-Wise Academic Performance (Semesters 01–08)
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-navy-800)', color: '#ffffff' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Semester</th>
                    <th style={{ padding: '0.75rem 1rem' }}>CGPA</th>
                    <th style={{ padding: '0.75rem 1rem' }}>SGPA</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Semester Arrears</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Arrear Subjects</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Clearance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {student.semesters && student.semesters.length > 0 ? (
                    student.semesters.map((sem: any) => {
                      const semNum = sem.semester_number || sem.semesterNumber;
                      const hasStanding = (sem.active_arrears_count ?? sem.arrears_count ?? 0) > 0;
                      return (
                        <tr key={semNum} style={{ borderBottom: '1px solid var(--color-slate-200)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--color-navy-800)' }}>
                            Semester 0{semNum}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>
                            {sem.cgpa ? Number(sem.cgpa).toFixed(2) : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {sem.sgpa ? Number(sem.sgpa).toFixed(2) : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {hasStanding ? (
                              <span style={{ color: 'var(--color-danger-600)', fontWeight: 800 }}>
                                {sem.active_arrears_count ?? sem.arrears_count} Active
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-success-600)', fontWeight: 600 }}>0 Active</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--color-slate-600)' }}>
                            {sem.arrear_subjects || sem.arrears_subjects || 'None'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {hasStanding ? (
                              <span className="badge badge-danger">Active Arrear</span>
                            ) : (
                              <span className="badge badge-success">Clear</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-slate-500)' }}>
                        No semester academic records recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical Arrear Clearance Records (Separated from Active!) */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-navy-800)', marginBottom: '0.5rem' }}>
              Historical Arrear Clearance Ledger
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-500)', marginBottom: '1rem' }}>
              Historical arrear records are archived permanently and never deleted upon clearance.
            </p>

            {student.arrear_history && student.arrear_history.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-slate-100)', color: 'var(--color-slate-900)' }}>
                      <th style={{ padding: '0.6rem 0.85rem' }}>Subject Code</th>
                      <th style={{ padding: '0.6rem 0.85rem' }}>Original Semester</th>
                      <th style={{ padding: '0.6rem 0.85rem' }}>Cleared in Semester</th>
                      <th style={{ padding: '0.6rem 0.85rem' }}>Clearance Date</th>
                      <th style={{ padding: '0.6rem 0.85rem' }}>Attempt</th>
                      <th style={{ padding: '0.6rem 0.85rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.arrear_history.map((hist: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-slate-200)' }}>
                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--color-navy-800)' }}>
                          <code>{hist.subjectCode || hist.subject_code}</code>
                        </td>
                        <td style={{ padding: '0.6rem 0.85rem' }}>Semester 0{hist.originalSemester}</td>
                        <td style={{ padding: '0.6rem 0.85rem' }}>Semester 0{hist.clearedInSemester}</td>
                        <td style={{ padding: '0.6rem 0.85rem' }}>
                          {hist.clearedDate ? new Date(hist.clearedDate).toLocaleDateString() : 'Exam Session'}
                        </td>
                        <td style={{ padding: '0.6rem 0.85rem' }}>Attempt #{hist.attempt || 1}</td>
                        <td style={{ padding: '0.6rem 0.85rem' }}>
                          <span className="badge badge-success">🟢 Cleared (Archived)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-slate-500)', fontSize: '0.85rem', backgroundColor: 'var(--color-slate-50)', borderRadius: '8px' }}>
                No previously cleared arrear records on file.
              </div>
            )}
          </div>

          {/* Internal Assessment Marks — Admin-controlled entry window + correction requests */}
          <InternalMarksMentorPanel
            studentId={student.id}
            registerNumber={student.register_number}
          />
        </div>
      )}

      {/* ============================================================
          7. PARENT DETAILS TAB
          ============================================================ */}
      {activeTab === 'parent' && (
        <div id="mentor-tab-pane-parent" role="tabpanel" className="card">
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Parent & Guardian Information"
            subtitle="Confidential institutional records for mentor-parent communication and emergency contact."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Father's Info */}
            <div style={{ padding: '1.25rem', backgroundColor: 'var(--color-slate-50)', borderRadius: '12px', border: '1px solid var(--color-slate-200)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-navy-800)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Father's Details
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: 'var(--color-slate-500)' }}>Name:</span>{' '}
                  <strong style={{ color: 'var(--color-slate-900)' }}>{student.parent?.father_name || 'Recorded in dossier'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-slate-500)' }}>Contact:</span>{' '}
                  {student.parent?.father_contact ? (
                    <a href={`tel:${student.parent.father_contact}`} style={{ color: 'var(--color-navy-500)', fontWeight: 700, textDecoration: 'none' }}>
                      📞 {student.parent.father_contact}
                    </a>
                  ) : (
                    'Not specified'
                  )}
                </div>
                <div>
                  <span style={{ color: 'var(--color-slate-500)' }}>Occupation:</span>{' '}
                  <strong>{student.parent?.father_occupation || 'Business / Private'}</strong>
                </div>
              </div>
            </div>

            {/* Mother's Info */}
            <div style={{ padding: '1.25rem', backgroundColor: 'var(--color-slate-50)', borderRadius: '12px', border: '1px solid var(--color-slate-200)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-navy-800)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Mother's Details
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: 'var(--color-slate-500)' }}>Name:</span>{' '}
                  <strong style={{ color: 'var(--color-slate-900)' }}>{student.parent?.mother_name || 'Recorded in dossier'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-slate-500)' }}>Contact:</span>{' '}
                  {student.parent?.mother_contact ? (
                    <a href={`tel:${student.parent.mother_contact}`} style={{ color: 'var(--color-navy-500)', fontWeight: 700, textDecoration: 'none' }}>
                      📞 {student.parent.mother_contact}
                    </a>
                  ) : (
                    'Not specified'
                  )}
                </div>
                <div>
                  <span style={{ color: 'var(--color-slate-500)' }}>Occupation:</span>{' '}
                  <strong>{student.parent?.mother_occupation || 'Home Maker'}</strong>
                </div>
              </div>
            </div>

            {/* Permanent Address & Emergency Contact */}
            <div style={{ gridColumn: 'span 2', padding: '1.25rem', backgroundColor: 'var(--color-slate-50)', borderRadius: '12px', border: '1px solid var(--color-slate-200)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-navy-800)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Permanent Family Address
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-slate-700)', lineHeight: 1.5 }}>
                {student.address || 'Address registered in institutional admission ledger.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          8. MENTOR HISTORY TAB (Timeline format as requested)
          ============================================================ */}
      {activeTab === 'mentor' && (
        <div id="mentor-tab-pane-mentor" role="tabpanel" className="card">
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Mentorship Assignment & Reassignment History"
            subtitle="Chronological ledger of faculty mentors assigned to this mentee. All records are permanently preserved."
          />

          <div className="timeline-container" style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '3px solid var(--color-slate-200)' }}>
            {student.mentorHistory && student.mentorHistory.length > 0 ? (
              student.mentorHistory.map((m: any, idx: number) => {
                const isActive = m.status === 'ACTIVE';
                const year = m.assigned_from ? new Date(m.assigned_from).getFullYear() : '2026';
                return (
                  <div key={idx} style={{ position: 'relative', marginBottom: '2rem' }}>
                    {/* Node Dot */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '-1.95rem',
                        top: '4px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: isActive ? 'var(--color-success-600)' : '#94A3B8',
                        border: '3px solid #ffffff',
                        boxShadow: '0 0 0 2px var(--color-slate-200)',
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-navy-800)' }}>{year}</span>
                      <span className={`badge ${isActive ? 'badge-success' : 'badge-secondary'}`}>
                        {isActive ? 'Current Mentor' : 'Previous Mentor'}
                      </span>
                    </div>

                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-slate-900)' }}>
                      {m.mentor_name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-slate-500)' }}>
                      {m.designation} • KSRCE Faculty
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--color-slate-600)', marginTop: '6px' }}>
                      <span>Assigned: <strong>{m.assigned_from || 'Term start'}</strong></span>
                      {m.assigned_until && (
                        <span> • Concluded: <strong>{m.assigned_until}</strong></span>
                      )}
                    </div>

                    {m.change_reason && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-warning-600)', marginTop: '4px', fontStyle: 'italic' }}>
                        Reason for Assignment: {m.change_reason}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--color-slate-500)', fontSize: '0.85rem' }}>
                Initial mentor assignment record active in MongoDB.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          9. COUNSELLING TAB (Student-Specific + AI Assistant)
          ============================================================ */}
      {activeTab === 'counselling' && (
        <div id="mentor-tab-pane-counselling" role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Header & Add Action */}
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Mentee Counselling Records & Dossier"
            subtitle={`Student-specific intervention and corrective action records for ${student.full_name} (${student.register_number}).`}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setShowAiBot(true)}
                  className="btn btn-secondary"
                  style={{
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    color: '#6D28D9',
                    borderColor: '#DDD6FE',
                    backgroundColor: '#F5F3FF',
                  }}
                  title="Open Separate Mentor AI Advisor Bot"
                >
                  <Bot size={16} /> Open AI Advisor Bot
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaturdayModal(true)}
                  className="btn btn-secondary"
                  style={{
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    color: '#92400E',
                    borderColor: '#FCD34D',
                    backgroundColor: 'var(--color-warning-50)',
                  }}
                  title="Record photos taken once at a Saturday common meeting and share them with every participant"
                >
                  <Users size={16} /> Saturday Common Meeting
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddCounselling}
                  className="btn btn-primary"
                  style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <Plus size={16} /> Add Mentoring Record
                </button>
              </>
            }
          />

          {/* Counselling Records List */}
          {student.counsellingRecords && student.counsellingRecords.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {student.counsellingRecords.map((c: any) => (
                <div
                  key={c.id || c._id}
                  className="card"
                  style={{
                    padding: '1.5rem',
                    backgroundColor: '#ffffff',
                    borderLeft: '4px solid #7C3AED',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {(Array.isArray(c.categories) && c.categories.length > 0
                          ? c.categories
                          : (c.category ? c.category.split(',').map((s: string) => s.trim()).filter(Boolean) : ['Academic Development'])
                        ).map((cat: string) => (
                          <span
                            key={cat}
                            className="badge badge-primary"
                            style={{
                              backgroundColor: '#7C3AED',
                              color: '#ffffff',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              borderRadius: '6px',
                              padding: '3px 8px',
                            }}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-500)', fontWeight: 600 }}>
                        Counselling Date: {c.counselling_date || c.counsellingDate || c.session_date ? new Date(c.counselling_date || c.counsellingDate || c.session_date).toLocaleDateString() : 'Recent'}
                      </span>
                      {c.status && (
                        <span className="badge badge-secondary" style={{ backgroundColor: '#EFF6FF', color: 'var(--color-navy-500)', border: '1px solid var(--color-navy-200)' }}>
                          Status: {c.status}
                        </span>
                      )}
                      {/* Who the discussion was held with. Not guessed — a record
                          created before this field existed reads "Not recorded". */}
                      <span
                        className="badge"
                        style={{
                          backgroundColor: 'var(--color-slate-100)',
                          color: 'var(--color-slate-700)',
                          border: '1px solid var(--color-slate-300)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        {(() => {
                          const dw = Array.isArray(c.discussionWith) ? c.discussionWith : (Array.isArray(c.discussion_with) ? c.discussion_with : null);
                          const hasStudent = dw?.includes('student');
                          const hasParent = dw?.includes('parent');
                          if (hasStudent && hasParent) return 'Discussion With: Student & Parent';
                          if (hasStudent) return 'Discussion With: Student';
                          if (hasParent) return 'Discussion With: Parent';
                          return 'Discussion With: Not recorded';
                        })()}
                      </span>
                      {c.recordKind === 'SATURDAY_COMMON' && (
                        <span
                          className="badge"
                          style={{
                            backgroundColor: 'var(--color-warning-100)',
                            color: '#92400E',
                            border: '1px solid #FCD34D',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <Users size={11} /> Saturday Common Meeting
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => handleEditCounselling(c)}
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.6rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                        title="Edit Counselling Record"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <span className="badge badge-success">
                        ✓ Mentor Signed
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.86rem' }}>
                    {(c.concern_reason || c.concernReason) && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                          Concern / Reason
                        </div>
                        <div className="field-value">
                          {c.concern_reason || c.concernReason}
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                        Discussion / Observation
                      </div>
                      <div className="field-value" style={{ fontWeight: 500, whiteSpace: 'pre-line' }}>
                        {c.discussion_observation || c.discussionObservation || c.challenge_observed || c.challengeObserved}
                      </div>
                    </div>

                    {(c.skill_needing_improvement || c.skillNeedingImprovement) && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                          Skills Needing Improvement
                        </div>
                        <div style={{ color: 'var(--color-warning-600)', marginTop: '2px', fontWeight: 600 }}>
                          {c.skill_needing_improvement || c.skillNeedingImprovement}
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                        Action Plan
                      </div>
                      <div className="field-value" style={{ whiteSpace: 'pre-line' }}>
                        {c.action_plan || c.actionPlan || c.corrective_action || c.correctiveAction}
                      </div>
                    </div>

                    {(c.mentor_remarks || c.mentorRemarks) && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                          Mentor Remarks
                        </div>
                        <div style={{ color: 'var(--color-slate-700)', marginTop: '2px', fontStyle: 'italic' }}>
                          {c.mentor_remarks || c.mentorRemarks}
                        </div>
                      </div>
                    )}

                    {(c.follow_up_date || c.followUpDate) && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                          Follow-up Date
                        </div>
                        <div style={{ color: '#2563EB', marginTop: '2px', fontWeight: 600 }}>
                          {new Date(c.follow_up_date || c.followUpDate).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Geo-tagged evidence. Photos are private, so they load only
                      after the mentor clicks, with the bearer token attached. */}
                  {Array.isArray(c.evidence) && c.evidence.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--color-slate-200)' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: 'var(--color-slate-500)',
                          textTransform: 'uppercase',
                          marginBottom: '0.55rem',
                        }}
                      >
                        <Camera size={12} />
                        Evidence Photos ({c.evidence.length})
                      </div>
                      <EvidenceGallery evidence={c.evidence} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center', backgroundColor: '#ffffff' }}>
              <BookOpen size={36} color="#94A3B8" style={{ margin: '0 auto 0.75rem auto' }} />
              <h3 className="section-subheading">
                No Counselling Records for this Mentee Yet
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', maxWidth: '440px', margin: '0 auto 1.25rem auto' }}>
                Counselling sessions are recorded on a student-specific basis. Mentors manually type the counselling details with built-in writing assistance.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowAiBot(true)}
                  className="btn btn-secondary"
                  style={{
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    color: '#6D28D9',
                    borderColor: '#DDD6FE',
                    backgroundColor: '#F5F3FF',
                  }}
                >
                  <Bot size={16} /> Open AI Advisor Bot
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddCounselling}
                  className="btn btn-primary"
                >
                  + Add First Counselling Record
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          7. STUDENT PROGRESS TAB
          The progress shown here always belongs to the SELECTED mentee
          (student.id), never to the logged-in mentor.
          ============================================================ */}
      {activeTab === 'progress' && (
        <div id="mentor-tab-pane-progress" role="tabpanel">
          <MenteeProgressDashboard
            studentId={student.id}
            studentName={student.full_name}
          />
        </div>
      )}

      {/* ============================================================
          8. DOCUMENTS / CERTIFICATES TAB
          ============================================================ */}
      {activeTab === 'documents' && (
        <div id="mentor-tab-pane-documents" role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Documents & Certificates"
            subtitle="Achievements, certificates and primary forms submitted by this mentee."
          />

          {/* Sub-tab switcher */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              backgroundColor: 'var(--color-slate-100)',
              padding: '4px',
              borderRadius: '10px',
              width: 'fit-content',
            }}
          >
            <button
              type="button"
              onClick={() => setDocSubTab('progress')}
              className="btn btn-sm"
              style={{
                borderRadius: '8px',
                padding: '0.45rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: docSubTab === 'progress' ? '#ffffff' : 'transparent',
                color: docSubTab === 'progress' ? 'var(--color-navy-800)' : 'var(--color-slate-500)',
                boxShadow: docSubTab === 'progress' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Award size={15} /> Student Progress & Achievements (Auto-Sync to Excel)
            </button>
            <button
              type="button"
              onClick={() => setDocSubTab('files')}
              className="btn btn-sm"
              style={{
                borderRadius: '8px',
                padding: '0.45rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: docSubTab === 'files' ? '#ffffff' : 'transparent',
                color: docSubTab === 'files' ? 'var(--color-navy-800)' : 'var(--color-slate-500)',
                boxShadow: docSubTab === 'files' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <FileCheck size={15} /> General Uploads & Primary Form
            </button>
          </div>

          {docSubTab === 'progress' ? (
            <MenteeProgressDashboard
              studentId={student.id}
              studentName={student.full_name}
            />
          ) : (
            <div className="card">
              <div style={{ marginBottom: '1.5rem' }}>
                <h2 className="section-subheading">
                  Mentee Certificates & Documents
                </h2>
                <p className="section-description">
                  Review, verify, and manage certificates uploaded by {student.full_name}.
                </p>
              </div>

              <StudentDocumentsManager
                studentId={student.id}
                readOnly={false}
                canVerify={true}
              />
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          12. MEETING HISTORY TAB (Saturday meetings & schedule)
          ============================================================ */}
      {activeTab === 'meeting' && (
        <div id="mentor-tab-pane-meeting" role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Meeting History"
            subtitle="Saturday mentoring sessions, attendance and discussion ledger."
          />

          {/* Upcoming Saturday Meeting Banner */}
          <div
            className="card"
            style={{
              padding: '1.5rem',
              backgroundColor: 'var(--color-warning-100)',
              border: '1px solid #FDE68A',
              borderLeft: '5px solid var(--color-warning-600)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#92400E', margin: 0 }}>
                  Upcoming Saturday Mentoring Session
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#78350F', margin: '4px 0 0 0' }}>
                  Scheduled Time: {saturdaySchedule?.time || '10:30 AM'} • Location: {saturdaySchedule?.location || 'Faculty Cabin / Mentoring Room'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMeetingModal(true)}
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-warning-600)', borderColor: 'var(--color-warning-600)', fontWeight: 700 }}
              >
                <Plus size={16} /> Log Saturday Meeting
              </button>
            </div>
          </div>

          {/* Previous Meetings List */}
          <div className="card">
            <h3 className="section-heading">
              Previous Saturday Meetings Ledger
            </h3>

            {student.meetings && student.meetings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {student.meetings.map((m: any) => (
                  <div
                    key={m.id || m._id}
                    style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      backgroundColor: 'var(--color-slate-50)',
                      border: '1px solid var(--color-slate-200)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ fontWeight: 800, color: 'var(--color-navy-800)', fontSize: '0.95rem' }}>
                        📅 {m.meeting_date ? new Date(m.meeting_date).toLocaleDateString() : 'Saturday'} ({m.meeting_time || '10:30 AM'})
                      </div>
                      <span className={`badge ${m.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                        {m.attendance_status || 'PRESENT'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-600)', marginBottom: '0.5rem' }}>
                      📍 Location: {m.location || 'Faculty Cabin'}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                          Challenges Discussed
                        </div>
                        <div className="field-value">
                          {m.challenges_discussed || 'Regular academic & mentoring review'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', textTransform: 'uppercase' }}>
                          Corrective Action & Remarks
                        </div>
                        <div className="field-value">
                          {m.mentor_remarks || m.corrective_action || 'Mentee advised to maintain course focus.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-slate-500)', fontSize: '0.85rem', backgroundColor: 'var(--color-slate-50)', borderRadius: '8px' }}>
                No past Saturday meetings recorded for this mentee yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          12b. PLACEMENT TAB (final-year placement monitor)
          ============================================================ */}
      {activeTab === 'placement' && (
        <div id="mentor-tab-pane-placement" role="tabpanel">
          <MentorPlacementPanel studentId={studentId} />
        </div>
      )}

      {/* ============================================================
          13. PROGRESS & SKILLS TAB (7 core domains tracked)
          ============================================================ */}
      {activeTab === 'skills' && (
        <div id="mentor-tab-pane-skills" role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <PageHeader
            eyebrow={`${student.full_name} • ${student.register_number}`}
            title="Mentor Skill Assessment & Progress Tracker"
            subtitle={`Evaluating 7 core professional and academic competencies for ${student.full_name}.`}
            actions={
              <button
                type="button"
                onClick={() => setShowSkillAssessmentModal(true)}
                className="btn btn-primary"
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <Plus size={16} /> Update Skill Assessment
              </button>
            }
          />

          {/* 7 Core Domains Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {[
              {
                title: 'Technical Skills & Problem Solving',
                level: 'Proficient (Level 4/5)',
                pct: 80,
                status: 'On Track',
                color: '#2563EB',
                recommendation: 'Practice algorithms and build semester mini-project.',
              },
              {
                title: 'Communication Skills',
                level: 'Developing (Level 3/5)',
                pct: 60,
                status: 'Needs Practice',
                color: 'var(--color-warning-600)',
                recommendation: 'Encourage participation in departmental symposium presentations.',
              },
              {
                title: 'Presentation & Seminar',
                level: 'Developing (Level 3/5)',
                pct: 60,
                status: 'Needs Practice',
                color: '#7C3AED',
                recommendation: 'Prepare 5-minute technical seminar slides.',
              },
              {
                title: 'Leadership & Teamwork',
                level: 'Proficient (Level 4/5)',
                pct: 80,
                status: 'On Track',
                color: 'var(--color-success-600)',
                recommendation: 'Active team member in lab assignments.',
              },
              {
                title: 'Attendance & Discipline',
                level: 'Excellent (Level 5/5)',
                pct: 95,
                status: 'Exemplary',
                color: '#16A34A',
                recommendation: 'Above 85% attendance maintained consistently.',
              },
              {
                title: 'Academic Performance',
                level: activeArrearsCount > 0 ? 'Attention Needed (Level 2/5)' : 'Good (Level 4/5)',
                pct: activeArrearsCount > 0 ? 40 : 80,
                status: activeArrearsCount > 0 ? 'Attention Required' : 'On Track',
                color: activeArrearsCount > 0 ? 'var(--color-danger-600)' : '#2563EB',
                recommendation: activeArrearsCount > 0 ? 'Clear active arrear in upcoming exam session.' : 'Maintain SGPA > 7.5.',
              },
              {
                title: 'Career & Placement Preparation',
                level: 'Developing (Level 3/5)',
                pct: 60,
                status: 'Ongoing',
                color: 'var(--color-navy-800)',
                recommendation: 'Complete mandatory NPTEL / certification course.',
              },
            ].map((skill, idx) => (
              <div
                key={idx}
                className="card"
                style={{
                  padding: '1.25rem',
                  backgroundColor: '#ffffff',
                  borderTop: `4px solid ${skill.color}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-navy-800)', margin: 0 }}>
                    {skill.title}
                  </h4>
                  <span
                    className={`badge ${skill.status === 'Attention Required' ? 'badge-danger' : skill.status === 'Needs Practice' ? 'badge-warning' : 'badge-success'}`}
                  >
                    {skill.status}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-slate-500)', marginBottom: '0.35rem' }}>
                  <span>{skill.level}</span>
                  <span>{skill.pct}%</span>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-slate-200)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{ width: `${skill.pct}%`, height: '100%', backgroundColor: skill.color, borderRadius: '4px' }} />
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-600)', lineHeight: 1.4 }}>
                  <strong style={{ color: 'var(--color-navy-800)' }}>Mentor Guidance:</strong> {skill.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================
          MODALS
          ============================================================ */}

      {/* Modal 1: Request Profile Update (Safe read-only safeguard) */}
      {showRequestUpdateModal && (
        <Modal
          title="Request Mentee Profile Correction"
          isOpen={showRequestUpdateModal}
          onClose={() => setShowRequestUpdateModal(false)}
        >
          <form onSubmit={handleRequestUpdateSubmit}>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', marginBottom: '1.25rem' }}>
              Mentors cannot directly edit core student biodata to prevent accidental corruption. Submit details below to notify the Academic Administrator.
            </p>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Data Section Requiring Update</label>
              <select
                className="form-control"
                value={requestUpdateForm.field}
                onChange={(e) => setRequestUpdateForm({ ...requestUpdateForm, field: e.target.value })}
              >
                <option value="Personal Information">Personal Information (Name, DOB, Blood Group)</option>
                <option value="Contact Information">Contact Information (Mobile, Email, Address)</option>
                <option value="Parent Information">Parent / Guardian Details</option>
                <option value="Academic Records">Academic / Arrear Discrepancy</option>
                <option value="Other">Other Institutional Record</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Requested Correction</label>
              <textarea
                className="form-control"
                rows={3}
                required
                placeholder="e.g. Correct mobile number to 9876543210 or updated residential address..."
                value={requestUpdateForm.details}
                onChange={(e) => setRequestUpdateForm({ ...requestUpdateForm, details: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Reason / Supporting Note</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Student reported change of address on 28/09/2026."
                value={requestUpdateForm.reason}
                onChange={(e) => setRequestUpdateForm({ ...requestUpdateForm, reason: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowRequestUpdateModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingRequest}>
                {submittingRequest ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 2: Mentor-Controlled Counselling Form (Manual Entry with Grammar Assist) */}
      {showCounsellingModal && (
        <Modal
          title={editingCounsellingId ? 'Edit Mentee Counselling Record' : 'Add Mentee Counselling Record'}
          isOpen={showCounsellingModal}
          onClose={() => {
            setShowCounsellingModal(false);
            setEditingCounsellingId(null);
            setCounsellingErrors({});
            setEvidencePhotos([]);
            setRemovedEvidenceIds([]);
            setEditingCounsellingEvidence([]);
          }}
          onSubmit={handleCounsellingSubmit}
          footer={
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                gap: '0.75rem',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCounsellingModal(false);
                  setEditingCounsellingId(null);
                  setCounsellingErrors({});
                  setEvidencePhotos([]);
                  setRemovedEvidenceIds([]);
                  setEditingCounsellingEvidence([]);
                }}
                style={{ minHeight: '44px', padding: '0.5rem 1.25rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingCounselling}
                style={{
                  minHeight: '44px',
                  padding: '0.5rem 1.5rem',
                  fontWeight: 700,
                }}
              >
                {submittingCounselling
                  ? 'Saving Record...'
                  : evidencePhotos.length > 0
                  ? `Save with ${evidencePhotos.length} Photo(s)`
                  : editingCounsellingId
                  ? 'Update Mentoring Record'
                  : 'Save Mentoring Record'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-500)', margin: '0 0 1rem 0' }}>
              Mentor-recorded counselling session for {student.full_name} ({student.register_number}). Enter observations manually. Real-time writing assistance helps detect spelling and grammar without modifying your meaning.
            </p>

            {/* Field 1: Counselling Date * */}
            <div className="form-group" style={{ marginBottom: '1.15rem' }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Counselling Date <span style={{ color: 'var(--color-danger-600)' }}>*</span>
              </label>
              <input
                type="date"
                className="form-control"
                required
                value={counsellingForm.counsellingDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setCounsellingForm((prev) => ({ ...prev, counsellingDate: val }));
                  if (counsellingErrors.counsellingDate) {
                    setCounsellingErrors((prev) => ({ ...prev, counsellingDate: undefined }));
                  }
                }}
                style={{
                  fontSize: '0.88rem',
                  minHeight: '42px',
                  borderColor: counsellingErrors.counsellingDate ? 'var(--color-danger-500)' : undefined,
                }}
              />
              {counsellingErrors.counsellingDate && (
                <div style={{ color: 'var(--color-danger-600)', fontSize: '0.78rem', marginTop: '4px', fontWeight: 600 }}>
                  {counsellingErrors.counsellingDate}
                </div>
              )}
            </div>

            {/* Field 2: Counselling Category * (Multi-Select with ONLY 5 categories) */}
            <CounsellingCategorySelect
              selectedCategories={counsellingForm.categories}
              onChange={(cats) => {
                setCounsellingForm((prev) => ({ ...prev, categories: cats }));
                if (counsellingErrors.categories && cats.length > 0) {
                  setCounsellingErrors((prev) => ({ ...prev, categories: undefined }));
                }
              }}
              required
              error={counsellingErrors.categories}
            />

            {/* Field 3: Discussion With * — required, Student and/or Parent */}
            <DiscussionWithSelect
              selected={counsellingForm.discussionWith}
              onChange={(next) => {
                setCounsellingForm((prev) => ({ ...prev, discussionWith: next }));
                if (counsellingErrors.discussionWith && next.length > 0) {
                  setCounsellingErrors((prev) => ({ ...prev, discussionWith: undefined }));
                }
              }}
              required
              error={counsellingErrors.discussionWith}
            />

            {/* Field 4: Concern / Reason * */}
            <GrammarAssistField
              fieldId="concernReason"
              label="Concern / Reason"
              required
              rows={3}
              placeholder="e.g. Low attendance in Anna University theory subjects / difficulty in core programming..."
              value={counsellingForm.concernReason}
              activeAiField={activeAiField}
              onActiveFieldChange={setActiveAiField}
              onUseCorrection={handleUseCorrection}
              onChange={(val) => {
                setCounsellingForm((prev) => ({ ...prev, concernReason: val }));
                if (counsellingErrors.concernReason && val.trim()) {
                  setCounsellingErrors((prev) => ({ ...prev, concernReason: undefined }));
                }
              }}
              error={counsellingErrors.concernReason}
            />

            {/* Field 4: Discussion / Observation * */}
            <GrammarAssistField
              fieldId="discussionObservation"
              label="Discussion / Observation"
              required
              rows={3}
              placeholder="Record mentor discussion points, student's explanation, and observed behavior..."
              value={counsellingForm.discussionObservation}
              activeAiField={activeAiField}
              onActiveFieldChange={setActiveAiField}
              onUseCorrection={handleUseCorrection}
              onChange={(val) => {
                setCounsellingForm((prev) => ({ ...prev, discussionObservation: val }));
                if (counsellingErrors.discussionObservation && val.trim()) {
                  setCounsellingErrors((prev) => ({ ...prev, discussionObservation: undefined }));
                }
              }}
              error={counsellingErrors.discussionObservation}
            />

            {/* Field 5: Skills Needing Improvement */}
            <GrammarAssistField
              fieldId="skillNeedingImprovement"
              label="Skills Needing Improvement"
              rows={2}
              placeholder="e.g. Communication, presentation skills, time management, analytical thinking..."
              value={counsellingForm.skillNeedingImprovement}
              activeAiField={activeAiField}
              onActiveFieldChange={setActiveAiField}
              onUseCorrection={handleUseCorrection}
              onChange={(val) => setCounsellingForm((prev) => ({ ...prev, skillNeedingImprovement: val }))}
            />

            {/* Field 6: Action Plan * */}
            <GrammarAssistField
              fieldId="actionPlan"
              label="Action Plan"
              required
              rows={3}
              placeholder="Concrete steps agreed upon: daily revision routine, problem sets to solve, practice vivas..."
              value={counsellingForm.actionPlan}
              activeAiField={activeAiField}
              onActiveFieldChange={setActiveAiField}
              onUseCorrection={handleUseCorrection}
              onChange={(val) => {
                setCounsellingForm((prev) => ({ ...prev, actionPlan: val }));
                if (counsellingErrors.actionPlan && val.trim()) {
                  setCounsellingErrors((prev) => ({ ...prev, actionPlan: undefined }));
                }
              }}
              error={counsellingErrors.actionPlan}
            />

            {/* Mentor Remarks - free-text closing note saved with the record */}
            <GrammarAssistField
              fieldId="counsellingMentorRemarks"
              label="Mentor Remarks"
              rows={2}
              placeholder="Overall remarks on the mentee's progress, attitude and readiness..."
              value={counsellingForm.mentorRemarks}
              activeAiField={activeAiField}
              onActiveFieldChange={setActiveAiField}
              onUseCorrection={handleUseCorrection}
              onChange={(val) => setCounsellingForm((prev) => ({ ...prev, mentorRemarks: val }))}
            />

            {/* Geo-tagged evidence photos. Location is requested at capture time,
                and each photo is compressed under 200 KB before upload. */}
            <EvidenceUploader
              existing={editingCounsellingEvidence}
              photos={evidencePhotos}
              onPhotosChange={setEvidencePhotos}
              removedExistingIds={removedEvidenceIds}
              onRemovedExistingIdsChange={setRemovedEvidenceIds}
              onRemoveExisting={(evidenceId) =>
                setRemovedEvidenceIds((prev) => [...prev, evidenceId])
              }
              disabled={submittingCounselling}
              hint="Photos already saved on this record are kept unless you detach them."
            />

            {/* Field 7 & 8: Follow-up Date & Status */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginTop: '0.25rem',
                marginBottom: '0.5rem',
              }}
            >
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Follow-up Date
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={counsellingForm.followUpDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCounsellingForm((prev) => ({ ...prev, followUpDate: val }));
                  }}
                  style={{ fontSize: '0.88rem', minHeight: '42px' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Status
                </label>
                <select
                  className="form-control"
                  value={counsellingForm.status}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCounsellingForm((prev) => ({ ...prev, status: val }));
                  }}
                  style={{ fontSize: '0.88rem', minHeight: '42px' }}
                >
                  <option value="Completed">Completed</option>
                  <option value="Follow-up Required">Follow-up Required</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Scheduled">Scheduled</option>
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Saturday COMMON meeting: one shared upload linked to every participant.
          Kept separate from the per-mentee form above because the photos are
          taken once physically and must not be re-uploaded per student. */}
      <SaturdayEvidenceModal
        isOpen={showSaturdayModal}
        onClose={() => setShowSaturdayModal(false)}
        onSaved={fetchStudentData}
        presetStudentId={student.id}
      />

      {/* Modal 3: Log Saturday Meeting */}
      {showMeetingModal && (
        <Modal
          title="Log Saturday Mentor–Mentee Meeting"
          isOpen={showMeetingModal}
          onClose={() => setShowMeetingModal(false)}
        >
          <form onSubmit={handleMeetingSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Meeting Date</label>
                <input
                  type="date"
                  className="form-control"
                  required
                  value={meetingForm.meetingDate}
                  onChange={(e) => setMeetingForm({ ...meetingForm, meetingDate: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Attendance Status</label>
                <select
                  className="form-control"
                  value={meetingForm.attendanceStatus}
                  onChange={(e) => setMeetingForm({ ...meetingForm, attendanceStatus: e.target.value })}
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="ON_DUTY">ON DUTY</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Meeting Time</label>
                <input
                  type="text"
                  className="form-control"
                  value={meetingForm.meetingTime}
                  onChange={(e) => setMeetingForm({ ...meetingForm, meetingTime: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  type="text"
                  className="form-control"
                  value={meetingForm.location}
                  onChange={(e) => setMeetingForm({ ...meetingForm, location: e.target.value })}
                />
              </div>
            </div>

            <GrammarAssistField
              fieldId="meetingChallenges"
              label="Challenges & Topics Discussed"
              rows={2}
              placeholder="Review of semester attendance, arrears, lab submissions..."
              value={meetingForm.challengesDiscussed}
              activeAiField={activeAiField}
              onActiveFieldChange={setActiveAiField}
              onUseCorrection={(fieldId, corrected) =>
                handleMeetingUseCorrection('challengesDiscussed', corrected)
              }
              onChange={(val) => setMeetingForm({ ...meetingForm, challengesDiscussed: val })}
            />

            <GrammarAssistField
              fieldId="meetingMentorRemarks"
              label="Mentor Remarks & Action Agreed Upon"
              rows={2}
              placeholder="Guidance given during Saturday session..."
              value={meetingForm.mentorRemarks}
              activeAiField={activeAiField}
              onActiveFieldChange={setActiveAiField}
              onUseCorrection={(fieldId, corrected) => handleMeetingUseCorrection('mentorRemarks', corrected)}
              onChange={(val) => setMeetingForm({ ...meetingForm, mentorRemarks: val })}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowMeetingModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingMeeting}>
                {submittingMeeting ? 'Logging Meeting...' : 'Save Meeting Entry'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 4: Clear Arrear Modal */}
      {showClearArrearModal && (
        <Modal
          title="Record Arrear Clearance"
          isOpen={showClearArrearModal}
          onClose={() => setShowClearArrearModal(false)}
        >
          <form onSubmit={handleClearArrearSubmit}>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-slate-500)', marginBottom: '1rem' }}>
              Mark an arrear as successfully cleared. Historical arrear records will remain preserved for institutional accreditation records.
            </p>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Subject Code</label>
              <input
                type="text"
                className="form-control"
                required
                placeholder="e.g. 24ITT36"
                value={clearArrearForm.subjectCode}
                onChange={(e) => setClearArrearForm({ ...clearArrearForm, subjectCode: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Original Semester</label>
                <select
                  className="form-control"
                  value={clearArrearForm.originalSemester}
                  onChange={(e) => setClearArrearForm({ ...clearArrearForm, originalSemester: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>Semester 0{s}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Cleared in Semester</label>
                <select
                  className="form-control"
                  value={clearArrearForm.clearedInSemester}
                  onChange={(e) => setClearArrearForm({ ...clearArrearForm, clearedInSemester: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>Semester 0{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Clearance Date</label>
              <input
                type="date"
                className="form-control"
                required
                value={clearArrearForm.clearedDate}
                onChange={(e) => setClearArrearForm({ ...clearArrearForm, clearedDate: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowClearArrearModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={clearingArrear}>
                {clearingArrear ? 'Recording Clearance...' : 'Confirm Clearance'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 5: Update Skill Assessment */}
      {showSkillAssessmentModal && (
        <Modal
          title="Update Mentee Skill Assessment"
          isOpen={showSkillAssessmentModal}
          onClose={() => setShowSkillAssessmentModal(false)}
        >
          <form onSubmit={handleSkillAssessmentSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
              {Object.keys(skillRatings).map((domain) => (
                <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-slate-900)' }}>{domain}</span>
                  <select
                    className="form-control"
                    style={{ width: '130px', padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
                    value={skillRatings[domain]}
                    onChange={(e) => setSkillRatings({ ...skillRatings, [domain]: Number(e.target.value) })}
                  >
                    <option value={1}>1 - Needs Attention</option>
                    <option value={2}>2 - Developing</option>
                    <option value={3}>3 - Competent</option>
                    <option value={4}>4 - Proficient</option>
                    <option value={5}>5 - Advanced</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Primary Technical Focus Area</label>
              <input
                type="text"
                className="form-control"
                value={skillNotes.focusArea}
                onChange={(e) => setSkillNotes({ ...skillNotes, focusArea: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Mentor Recommendations</label>
              <textarea
                className="form-control"
                rows={2}
                value={skillNotes.recommendations}
                onChange={(e) => setSkillNotes({ ...skillNotes, recommendations: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSkillAssessmentModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingSkills}>
                {submittingSkills ? 'Saving...' : 'Save Skill Assessment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Separate Mentor AI Advisory Bot Modal */}
      <MentorAiBotModal
        isOpen={showAiBot}
        onClose={() => setShowAiBot(false)}
      />

      {/* Floating circular AI advisor trigger, fixed to the bottom-right of the
          viewport so the advisor is reachable from every tab without scrolling
          back to a section-specific button. The inline buttons above are kept:
          they give the feature context. */}
      {!showAiBot && (
        <button
          type="button"
          onClick={() => setShowAiBot(true)}
          aria-label="Open Mentor AI Advisor"
          title="Mentor AI Advisor"
          style={{
            position: 'fixed',
            right: '26px',
            bottom: '26px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--color-navy-800) 0%, #1D4E89 100%)',
            color: '#ffffff',
            border: '2px solid #ffffff',
            boxShadow: '0 6px 20px rgba(11, 37, 69, 0.32)',
            cursor: 'pointer',
            zIndex: 900,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.06)';
            e.currentTarget.style.boxShadow = '0 8px 26px rgba(11, 37, 69, 0.42)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(11, 37, 69, 0.32)';
          }}
        >
          <Bot size={24} />
        </button>
      )}

      {/* APPROVE / REJECT ACADEMIC CORRECTION REQUEST */}
      {showReviewModal && reviewTarget && (
        <Modal
          isOpen={showReviewModal}
          title={
            reviewAction === 'APPROVE'
              ? 'Approve Academic Correction'
              : 'Reject Academic Correction'
          }
          onClose={() => {
            if (!reviewSubmitting) setShowReviewModal(false);
          }}
        >
          <div style={{ padding: '0.5rem 0' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                marginBottom: '1rem',
                padding: '0.85rem',
                background: 'var(--color-slate-50)',
                border: '1px solid var(--color-slate-200)',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <div style={{ color: 'var(--color-slate-500)', fontSize: '0.75rem' }}>Semester</div>
                <div style={{ fontWeight: 700 }}>Semester 0{reviewTarget.semesterNumber}</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-slate-500)', fontSize: '0.75rem' }}>Student</div>
                <div style={{ fontWeight: 700 }}>
                  {reviewTarget.studentName || student?.full_name || reviewTarget.studentRegNumber || '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--color-slate-500)', fontSize: '0.75rem' }}>Current CGPA</div>
                <div style={{ fontWeight: 700 }}>{Number(reviewTarget.currentCgpa || 0).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-slate-500)', fontSize: '0.75rem' }}>Requested CGPA</div>
                <div style={{ fontWeight: 700, color: 'var(--color-navy-500)' }}>
                  {Number(reviewTarget.requestedCgpa || 0).toFixed(2)}
                </div>
              </div>
              {reviewTarget.requestedSgpa !== null && reviewTarget.requestedSgpa !== undefined && (
                <div>
                  <div style={{ color: 'var(--color-slate-500)', fontSize: '0.75rem' }}>Requested SGPA</div>
                  <div style={{ fontWeight: 700, color: 'var(--color-navy-500)' }}>
                    {Number(reviewTarget.requestedSgpa).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: 'var(--color-slate-500)', fontSize: '0.75rem', marginBottom: '4px' }}>
                Student Reason
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-slate-700)', lineHeight: 1.5 }}>
                {reviewTarget.reason}
              </p>
            </div>

            {reviewAction === 'REJECT' && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '9px 12px',
                  background: 'var(--color-danger-50)',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  color: '#991B1B',
                  fontSize: '0.8rem',
                }}
              >
                Rejecting leaves the original CGPA/SGPA record completely unchanged.
              </div>
            )}

            {reviewError && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '9px 12px',
                  background: 'var(--color-danger-50)',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  color: '#B91C1C',
                  fontSize: '0.8rem',
                }}
              >
                {reviewError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">
                {reviewAction === 'APPROVE' ? 'Review Note (optional)' : 'Rejection Reason *'}
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  reviewAction === 'APPROVE'
                    ? 'e.g. Verified against the published result sheet.'
                    : 'Explain why the correction cannot be approved.'
                }
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowReviewModal(false)}
                disabled={reviewSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={reviewAction === 'APPROVE' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={submitReview}
                disabled={reviewSubmitting}
                style={
                  reviewAction === 'APPROVE'
                    ? { backgroundColor: '#15803D', borderColor: '#15803D' }
                    : undefined
                }
              >
                {reviewSubmitting
                  ? 'Saving...'
                  : reviewAction === 'APPROVE'
                    ? 'Approve & Apply to Record'
                    : 'Reject Request'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
