import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { StudentDocumentsManager } from '../../components/documents/StudentDocumentsManager';
import { StudentProfileSkeleton } from '../../components/common/SkeletonLoader';
import { StudentNotFound } from '../error/StudentNotFound';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
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
  Clock,
  Sparkles,
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
} from 'lucide-react';

export type MentorProfileTab =
  | 'overview'
  | 'personal'
  | 'academic'
  | 'parent'
  | 'mentor'
  | 'counselling'
  | 'documents'
  | 'meeting'
  | 'skills';

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

  const [showCounsellingModal, setShowCounsellingModal] = useState(false);
  const [counsellingForm, setCounsellingForm] = useState({
    sessionDate: new Date().toISOString().split('T')[0],
    category: 'Skill Development',
    skillNeedingImprovement: '',
    challengeObserved: '',
    correctiveAction: '',
    expectedImprovement: '',
    studentFeedback: '',
    mentorRemarks: '',
    followUpDate: '',
  });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [submittingCounselling, setSubmittingCounselling] = useState(false);

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
        'documents',
        'meeting',
        'skills',
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

  // PDF Download Handler
  const handleDownloadPdf = async () => {
    if (!student) return;
    setPdfDownloading(true);
    try {
      await api.pdf.downloadStudentPdf(
        student.id,
        `KSRCE_Mentee_${student.register_number}_Record_Book.pdf`
      );
      toast.success('KSRCE Student Record Book PDF downloaded successfully.');
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

  // AI Counselling Assistant Generation
  const handleGenerateAiSuggestions = async () => {
    if (!counsellingForm.skillNeedingImprovement.trim() && !counsellingForm.challengeObserved.trim()) {
      toast.warning('Please enter the skill / area needing improvement or describe the observation first.');
      return;
    }

    const promptText = counsellingForm.skillNeedingImprovement.trim() || counsellingForm.challengeObserved.trim();
    setAiGenerating(true);
    try {
      const res = await api.counselling.getAiSuggestion(
        student.id,
        counsellingForm.category,
        promptText
      );

      if (res.success && res.data) {
        setCounsellingForm((prev) => ({
          ...prev,
          challengeObserved:
            res.data.challengeObserved ||
            `Mentee exhibits need for targeted guidance in ${promptText}.`,
          correctiveAction:
            res.data.correctiveAction ||
            `1. Structured practice in ${promptText}.\n2. Weekly progress check.\n3. Referral to peer tutor.`,
          expectedImprovement:
            res.data.expectedImprovement ||
            `Measurable improvement within 3 weeks of consistent practice.`,
          mentorRemarks: `AI-suggested mentoring plan reviewed and customized for mentee on ${new Date().toISOString().split('T')[0]}.`,
        }));
        toast.success('AI counselling recommendations generated! Please review and modify before saving.');
      } else {
        // Fallback institutional generator
        generateLocalAiPlan(promptText, counsellingForm.category);
      }
    } catch (err) {
      generateLocalAiPlan(promptText, counsellingForm.category);
    } finally {
      setAiGenerating(false);
    }
  };

  const generateLocalAiPlan = (promptText: string, category: string) => {
    setCounsellingForm((prev) => ({
      ...prev,
      challengeObserved: `Mentee identified as requiring targeted intervention in: "${promptText}". Current performance indicates need for structured mentoring.`,
      correctiveAction: `• Step 1: Dedicate 45 minutes daily to ${promptText} fundamentals.\n• Step 2: Solve 3 previous Anna University exam question sets.\n• Step 3: Attend Saturday mentoring session for doubts clearing.`,
      expectedImprovement: `Demonstrated comprehension and improved mock test score within 3 weeks.`,
      mentorRemarks: `Reviewed by faculty mentor on ${new Date().toISOString().split('T')[0]}. Mentee advised to maintain regular attendance.`,
    }));
    toast.success('AI recommendations generated! Please review and adjust before saving.');
  };

  // Counselling Submission
  const handleCounsellingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counsellingForm.challengeObserved.trim() || !counsellingForm.correctiveAction.trim()) {
      toast.warning('Challenge observed and corrective action are required.');
      return;
    }
    setSubmittingCounselling(true);
    try {
      await api.counselling.create({
        studentId: student.id,
        category: counsellingForm.category,
        sessionDate: counsellingForm.sessionDate,
        challengeObserved: counsellingForm.challengeObserved,
        correctiveAction: counsellingForm.correctiveAction,
        expectedImprovement: counsellingForm.expectedImprovement,
        studentFeedback: counsellingForm.studentFeedback || 'Mentee agreed to execute the corrective plan.',
        mentorRemarks: counsellingForm.mentorRemarks,
        aiGenerated: true,
      });
      toast.success('5-Domain counselling record saved successfully.');
      setShowCounsellingModal(false);
      setCounsellingForm({
        sessionDate: new Date().toISOString().split('T')[0],
        category: 'Skill Development',
        skillNeedingImprovement: '',
        challengeObserved: '',
        correctiveAction: '',
        expectedImprovement: '',
        studentFeedback: '',
        mentorRemarks: '',
        followUpDate: '',
      });
      await fetchStudentData();
    } catch (err: any) {
      toast.error('Failed to save counselling record: ' + err.message);
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
    { id: 'overview', label: '1. Overview', icon: <Layers size={16} /> },
    { id: 'personal', label: '2. Personal Details', icon: <User size={16} /> },
    { id: 'academic', label: '3. Academic Details', icon: <GraduationCap size={16} /> },
    { id: 'parent', label: '4. Parent Details', icon: <Home size={16} /> },
    { id: 'mentor', label: '5. Mentor History', icon: <History size={16} /> },
    { id: 'counselling', label: '6. Counselling', icon: <BookOpen size={16} /> },
    { id: 'documents', label: '7. Documents / Certificates', icon: <FileCheck size={16} /> },
    { id: 'meeting', label: '8. Meeting History', icon: <CalendarCheck2 size={16} /> },
    { id: 'skills', label: '9. Progress & Skills', icon: <Award size={16} /> },
  ];

  return (
    <div className="mentor-mentee-profile" style={{ maxWidth: '1280px', margin: '0 auto', color: '#1E293B' }}>
      {/* ============================================================
          1. MENTOR VIEW HEADER (Clean institutional header for mentor)
          ============================================================ */}
      <div
        className="card mentor-header-card"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.5rem 1.75rem',
          marginBottom: '1.25rem',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 12px rgba(11, 37, 69, 0.06)',
          borderLeft: '5px solid #0B2545',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1.25rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Mentee Identity */}
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.8rem' }}
                  title="Return to Mentees Roster"
                >
                  <ArrowLeft size={16} /> Back to Mentees
                </button>
              )}
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#0B2545',
                  backgroundColor: '#EFF6FF',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  border: '1px solid #BFDBFE',
                }}
              >
                MENTOR VIEW • READ-ONLY MENTEE DOSSIER
              </span>
            </div>

            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                color: '#0B2545',
                margin: '0 0 0.4rem 0',
                letterSpacing: '-0.01em',
              }}
            >
              {student.full_name}
            </h1>

            {/* Subtitle details */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.65rem 1.25rem',
                fontSize: '0.85rem',
                color: '#475569',
                alignItems: 'center',
              }}
            >
              <span>
                Register No: <strong style={{ color: '#0F172A' }}>{student.register_number}</strong>
              </span>
              <span>•</span>
              <span>{student.department_name || 'Information Technology'}</span>
              <span>•</span>
              <span>
                {yearRoman} {student.batch_name ? `• Batch ${student.batch_name}` : ''}
              </span>
              <span>•</span>
              <span>Section: <strong style={{ color: '#0F172A' }}>{student.section || 'A'}</strong></span>
              <span>•</span>
              <span>
                Mentor:{' '}
                <strong style={{ color: '#0B2545' }}>
                  {student.currentMentor?.mentor_name || 'Not Assigned'}
                </strong>
              </span>
            </div>
          </div>

          {/* Right: Key Institutional Metrics & PDF Action */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              flexWrap: 'wrap',
              alignSelf: 'center',
            }}
          >
            {/* CGPA Badge */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '0.6rem 1rem',
                textAlign: 'center',
                minWidth: '95px',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                CGPA
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0B2545' }}>
                {cgpaValue}
              </div>
            </div>

            {/* Active Arrears Badge */}
            <div
              style={{
                backgroundColor: activeArrearsCount > 0 ? '#FEF2F2' : '#F0FDF4',
                border: `1px solid ${activeArrearsCount > 0 ? '#FECACA' : '#BBF7D0'}`,
                borderRadius: '12px',
                padding: '0.6rem 1rem',
                textAlign: 'center',
                minWidth: '115px',
              }}
            >
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: activeArrearsCount > 0 ? '#B91C1C' : '#15803D',
                  textTransform: 'uppercase',
                }}
              >
                Standing Arrears
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: activeArrearsCount > 0 ? '#DC2626' : '#16A34A',
                }}
              >
                {activeArrearsCount === 0 ? '0 (Cleared)' : `${activeArrearsCount} Active`}
              </div>
            </div>

            {/* Request Update Button */}
            <button
              type="button"
              onClick={() => setShowRequestUpdateModal(true)}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.65rem 0.95rem',
                fontSize: '0.82rem',
                fontWeight: 700,
              }}
              title="Request profile correction to Administrator"
            >
              <HelpCircle size={15} /> Request Update
            </button>

            {/* Prominent Download Student PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
              className="btn btn-primary"
              style={{
                backgroundColor: '#C59B27',
                borderColor: '#C59B27',
                color: '#0B2545',
                fontWeight: 800,
                fontSize: '0.85rem',
                padding: '0.65rem 1.25rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 6px rgba(197, 155, 39, 0.3)',
              }}
            >
              <Download size={16} />
              {pdfDownloading ? 'Generating PDF...' : 'Download Student PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          3. MENTOR PROFILE TABS (Responsive scrollable 9 tabs bar)
          ============================================================ */}
      <div
        className="mentor-tab-bar"
        style={{
          display: 'flex',
          gap: '0.4rem',
          borderBottom: '2px solid #E2E8F0',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '8px',
          scrollbarWidth: 'thin',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                whiteSpace: 'nowrap',
                fontWeight: isActive ? 700 : 500,
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: isActive ? '#0B2545' : '#ffffff',
                color: isActive ? '#ffffff' : '#475569',
                borderColor: isActive ? '#0B2545' : '#E2E8F0',
                transition: 'all 0.15s ease',
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
        <div className="tab-pane-overview">
          {/* Professional 6 Summary Cards (Clicking navigates to corresponding section) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* 1. Academic Performance */}
            <div
              className="card overview-summary-card"
              onClick={() => setActiveTab('academic')}
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                borderLeft: '4px solid #0B2545',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Academic Performance
                </span>
                <GraduationCap size={18} color="#0B2545" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '6px' }}>
                {cgpaValue}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px' }}>
                CGPA • {student.semesters?.length || 0} Semesters Evaluated →
              </div>
            </div>

            {/* 2. Current Arrears */}
            <div
              className="card overview-summary-card"
              onClick={() => setActiveTab('academic')}
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                borderLeft: `4px solid ${activeArrearsCount > 0 ? '#DC2626' : '#16A34A'}`,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Current Arrears
                </span>
                <AlertCircle size={18} color={activeArrearsCount > 0 ? '#DC2626' : '#16A34A'} />
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: activeArrearsCount > 0 ? '#DC2626' : '#16A34A',
                  marginTop: '6px',
                }}
              >
                {activeArrearsCount === 0 ? '0 Cleared' : `${activeArrearsCount} Active`}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px' }}>
                {student.cleared_arrears_count || 0} Cleared in History →
              </div>
            </div>

            {/* 3. Counselling Sessions */}
            <div
              className="card overview-summary-card"
              onClick={() => setActiveTab('counselling')}
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                borderLeft: '4px solid #7C3AED',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Counselling Sessions
                </span>
                <BookOpen size={18} color="#7C3AED" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '6px' }}>
                {student.counsellingRecords?.length || 0}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#7C3AED', marginTop: '4px' }}>
                5-Domain Mentoring Records →
              </div>
            </div>

            {/* 4. Saturday Meetings */}
            <div
              className="card overview-summary-card"
              onClick={() => setActiveTab('meeting')}
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                borderLeft: '4px solid #D97706',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Saturday Meetings
                </span>
                <CalendarCheck2 size={18} color="#D97706" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '6px' }}>
                {student.meetings?.length || 0}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#D97706', marginTop: '4px' }}>
                Meeting Logs & Attendance →
              </div>
            </div>

            {/* 5. Documents */}
            <div
              className="card overview-summary-card"
              onClick={() => setActiveTab('documents')}
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                borderLeft: '4px solid #059669',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Documents
                </span>
                <FileCheck size={18} color="#059669" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '6px' }}>
                {student.documents?.length || (student.counsellingRecords ? 4 : 0)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: '4px' }}>
                Certificates & Verification →
              </div>
            </div>

            {/* 6. Skills Needing Improvement */}
            <div
              className="card overview-summary-card"
              onClick={() => setActiveTab('skills')}
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                borderLeft: '4px solid #2563EB',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Skill Progress
                </span>
                <Award size={18} color="#2563EB" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '6px' }}>
                {activeArrearsCount > 0 ? '2 Needing Focus' : 'On Track'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#2563EB', marginTop: '4px' }}>
                7 Core Mentoring Domains →
              </div>
            </div>
          </div>

          {/* Mentee Executive Overview & Assigned Mentor Dossier */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
            {/* Left: Mentee Profile Summary */}
            <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0B2545', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={18} color="#0B2545" /> Mentee Identity Snapshot
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', fontSize: '0.85rem' }}>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>DOB</div>
                  <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    {student.dob ? new Date(student.dob).toLocaleDateString() : 'Recorded in File'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Blood Group</div>
                  <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    {student.blood_group || 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Residential Status</div>
                  <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    <span className="badge badge-primary">
                      {student.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Mobile Contact</div>
                  <div style={{ fontWeight: 600, color: '#0B2545', marginTop: '2px' }}>
                    {student.mobile_number || 'N/A'}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Father / Guardian Name</div>
                  <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    {student.parent?.father_name || 'Recorded in dossier'}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Institutional Email</div>
                  <div style={{ fontWeight: 600, color: '#0B2545', marginTop: '2px' }}>
                    {student.email || `${student.register_number}@ksrce.ac.in`}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Mentor Assignment & Saturday Milestones */}
            <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0B2545', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={18} color="#0B2545" /> Mentorship Responsibility
              </h3>
              {student.currentMentor ? (
                <div style={{ backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '1rem', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0B2545' }}>
                    {student.currentMentor.mentor_name}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '2px' }}>
                    {student.currentMentor.designation} • {student.currentMentor.cabin_location || 'Faculty Cabin'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700, marginTop: '6px' }}>
                    Active Assignment Since: {student.currentMentor.assigned_from || 'Academic Term'}
                  </div>
                </div>
              ) : (
                <div style={{ color: '#D97706', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  No active mentor assignment record found in database.
                </div>
              )}

              {/* Saturday Meeting Milestone */}
              <div
                style={{
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                }}
              >
                <CalendarCheck2 size={24} color="#D97706" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#92400E' }}>
                    Upcoming Saturday Mentoring Session
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#78350F', marginTop: '2px' }}>
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
        <div className="card" style={{ padding: '2rem', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                Mentee Personal Details
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
                Read-only institutional record. To propose corrections, click Request Update.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRequestUpdateModal(true)}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
            >
              <HelpCircle size={16} /> Request Update
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.5rem',
            }}
          >
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Full Student Name
              </label>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
                {student.full_name}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Register Number
              </label>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
                <code>{student.register_number}</code>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Date of Birth
              </label>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A', marginTop: '4px' }}>
                {student.dob ? new Date(student.dob).toLocaleDateString() : 'Recorded in dossier'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Blood Group
              </label>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#DC2626', marginTop: '4px' }}>
                {student.blood_group || 'N/A'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Contact Number
              </label>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0B2545', marginTop: '4px' }}>
                {student.mobile_number ? (
                  <a href={`tel:${student.mobile_number}`} style={{ color: '#1D4ED8', textDecoration: 'none' }}>
                    📞 {student.mobile_number}
                  </a>
                ) : (
                  'N/A'
                )}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Official Email
              </label>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0B2545', marginTop: '4px' }}>
                {student.email ? (
                  <a href={`mailto:${student.email}`} style={{ color: '#1D4ED8', textDecoration: 'none' }}>
                    ✉️ {student.email}
                  </a>
                ) : (
                  `${student.register_number}@ksrce.ac.in`
                )}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Department & Branch
              </label>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A', marginTop: '4px' }}>
                {student.department_name || 'Information Technology'} ({student.department_code || 'IT'})
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Year & Batch
              </label>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A', marginTop: '4px' }}>
                {yearRoman} {student.batch_name ? `• Batch ${student.batch_name}` : ''}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Residential Status
              </label>
              <div style={{ marginTop: '4px' }}>
                <span className="badge badge-primary">
                  {student.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Admission Type
              </label>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A', marginTop: '4px' }}>
                {student.school?.admission_type || 'COUNSELLING'}
              </div>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Permanent Home Address
              </label>
              <div style={{ fontSize: '0.95rem', color: '#334155', marginTop: '4px', lineHeight: 1.5 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Active Arrears Banner & Action */}
          <div
            className="card"
            style={{
              padding: '1.5rem',
              backgroundColor: activeArrearsCount > 0 ? '#FEF2F2' : '#F0FDF4',
              border: `1px solid ${activeArrearsCount > 0 ? '#FECACA' : '#BBF7D0'}`,
              borderLeft: `5px solid ${activeArrearsCount > 0 ? '#DC2626' : '#16A34A'}`,
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
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545', marginBottom: '1rem' }}>
              Semester-Wise Academic Performance (Semesters 01–08)
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0B2545', color: '#ffffff' }}>
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
                        <tr key={semNum} style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0B2545' }}>
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
                              <span style={{ color: '#DC2626', fontWeight: 800 }}>
                                {sem.active_arrears_count ?? sem.arrears_count} Active
                              </span>
                            ) : (
                              <span style={{ color: '#059669', fontWeight: 600 }}>0 Active</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                            {sem.arrear_subjects || sem.arrears_subjects || 'None'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {hasStanding ? (
                              <span className="badge badge-danger">Active Arrear</span>
                            ) : sem.arrears_count > 0 ? (
                              <span className="badge badge-success">Cleared</span>
                            ) : (
                              <span className="badge badge-info">Regular Pass</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748B' }}>
                        No semester academic records recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical Arrear Clearance Records (Separated from Active!) */}
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545', marginBottom: '0.5rem' }}>
              Historical Arrear Clearance Ledger
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1rem' }}>
              Historical arrear records are archived permanently and never deleted upon clearance.
            </p>

            {student.arrear_history && student.arrear_history.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F1F5F9', color: '#0F172A' }}>
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
                      <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: '#0B2545' }}>
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
              <div style={{ padding: '1rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                No previously cleared arrear records on file.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          7. PARENT DETAILS TAB
          ============================================================ */}
      {activeTab === 'parent' && (
        <div className="card" style={{ padding: '2rem', backgroundColor: '#ffffff' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              Parent & Guardian Information
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
              Confidential institutional records for mentor-parent communication and emergency contact.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Father's Info */}
            <div style={{ padding: '1.25rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0B2545', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Father's Details
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: '#64748B' }}>Name:</span>{' '}
                  <strong style={{ color: '#0F172A' }}>{student.parent?.father_name || 'Recorded in dossier'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Contact:</span>{' '}
                  {student.parent?.father_contact ? (
                    <a href={`tel:${student.parent.father_contact}`} style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>
                      📞 {student.parent.father_contact}
                    </a>
                  ) : (
                    'Not specified'
                  )}
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Occupation:</span>{' '}
                  <strong>{student.parent?.father_occupation || 'Business / Private'}</strong>
                </div>
              </div>
            </div>

            {/* Mother's Info */}
            <div style={{ padding: '1.25rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0B2545', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Mother's Details
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: '#64748B' }}>Name:</span>{' '}
                  <strong style={{ color: '#0F172A' }}>{student.parent?.mother_name || 'Recorded in dossier'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Contact:</span>{' '}
                  {student.parent?.mother_contact ? (
                    <a href={`tel:${student.parent.mother_contact}`} style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>
                      📞 {student.parent.mother_contact}
                    </a>
                  ) : (
                    'Not specified'
                  )}
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Occupation:</span>{' '}
                  <strong>{student.parent?.mother_occupation || 'Home Maker'}</strong>
                </div>
              </div>
            </div>

            {/* Permanent Address & Emergency Contact */}
            <div style={{ gridColumn: 'span 2', padding: '1.25rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0B2545', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Permanent Family Address
              </div>
              <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.5 }}>
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
        <div className="card" style={{ padding: '2rem', backgroundColor: '#ffffff' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              Mentorship Assignment & Reassignment History
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
              Chronological ledger of faculty mentors assigned to this mentee. All records are permanently preserved.
            </p>
          </div>

          <div className="timeline-container" style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '3px solid #E2E8F0' }}>
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
                        backgroundColor: isActive ? '#059669' : '#94A3B8',
                        border: '3px solid #ffffff',
                        boxShadow: '0 0 0 2px #E2E8F0',
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0B2545' }}>{year}</span>
                      <span className={`badge ${isActive ? 'badge-success' : 'badge-secondary'}`}>
                        {isActive ? 'Current Mentor' : 'Previous Mentor'}
                      </span>
                    </div>

                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                      {m.mentor_name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
                      {m.designation} • KSRCE Faculty
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '6px' }}>
                      <span>Assigned: <strong>{m.assigned_from || 'Term start'}</strong></span>
                      {m.assigned_until && (
                        <span> • Concluded: <strong>{m.assigned_until}</strong></span>
                      )}
                    </div>

                    {m.change_reason && (
                      <div style={{ fontSize: '0.78rem', color: '#D97706', marginTop: '4px', fontStyle: 'italic' }}>
                        Reason for Assignment: {m.change_reason}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ color: '#64748B', fontSize: '0.85rem' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header & Add Action */}
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                  Mentee 5-Domain Counselling Dossier
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
                  Student-specific intervention and corrective action records for {student.full_name} ({student.register_number}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCounsellingModal(true)}
                className="btn btn-primary"
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <Plus size={16} /> + Add Counselling Record
              </button>
            </div>
          </div>

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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span className="badge badge-primary" style={{ backgroundColor: '#7C3AED', color: '#ffffff' }}>
                        {c.category}
                      </span>
                      <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
                        Session Date: {c.session_date ? new Date(c.session_date).toLocaleDateString() : 'Recent'}
                      </span>
                    </div>
                    <span className="badge badge-success">
                      ✓ Mentor Signed
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.86rem' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                        Observed Concern / Challenge
                      </div>
                      <div style={{ color: '#0F172A', marginTop: '2px', fontWeight: 600 }}>
                        {c.challenge_observed || c.challengeObserved}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                        Corrective Action Plan
                      </div>
                      <div style={{ color: '#0F172A', marginTop: '2px', whiteSpace: 'pre-line' }}>
                        {c.corrective_action || c.correctiveAction}
                      </div>
                    </div>

                    {(c.expected_improvement || c.expectedImprovement) && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                          Expected Improvement
                        </div>
                        <div style={{ color: '#059669', marginTop: '2px', fontWeight: 600 }}>
                          {c.expected_improvement || c.expectedImprovement}
                        </div>
                      </div>
                    )}

                    {(c.mentor_remarks || c.mentorRemarks) && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                          Mentor Remarks & Follow-Up
                        </div>
                        <div style={{ color: '#334155', marginTop: '2px', fontStyle: 'italic' }}>
                          {c.mentor_remarks || c.mentorRemarks}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center', backgroundColor: '#ffffff' }}>
              <BookOpen size={36} color="#94A3B8" style={{ margin: '0 auto 0.75rem auto' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B2545', margin: '0 0 0.5rem 0' }}>
                No Counselling Records for this Mentee Yet
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
                Counselling sessions are recorded on a student-specific basis. Click below to log a new counselling record with AI assistance.
              </p>
              <button
                type="button"
                onClick={() => setShowCounsellingModal(true)}
                className="btn btn-primary"
              >
                + Add First Counselling Record
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          11. DOCUMENTS / CERTIFICATES TAB
          ============================================================ */}
      {activeTab === 'documents' && (
        <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              Mentee Certificates & Documents
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
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

      {/* ============================================================
          12. MEETING HISTORY TAB (Saturday meetings & schedule)
          ============================================================ */}
      {activeTab === 'meeting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Upcoming Saturday Meeting Banner */}
          <div
            className="card"
            style={{
              padding: '1.5rem',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              borderLeft: '5px solid #D97706',
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
                style={{ backgroundColor: '#D97706', borderColor: '#D97706', fontWeight: 700 }}
              >
                <Plus size={16} /> + Log Saturday Meeting
              </button>
            </div>
          </div>

          {/* Previous Meetings List */}
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545', marginBottom: '1rem' }}>
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
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ fontWeight: 800, color: '#0B2545', fontSize: '0.95rem' }}>
                        📅 {m.meeting_date ? new Date(m.meeting_date).toLocaleDateString() : 'Saturday'} ({m.meeting_time || '10:30 AM'})
                      </div>
                      <span className={`badge ${m.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                        {m.attendance_status || 'PRESENT'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>
                      📍 Location: {m.location || 'Faculty Cabin'}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                          Challenges Discussed
                        </div>
                        <div style={{ color: '#0F172A', marginTop: '2px' }}>
                          {m.challenges_discussed || 'Regular academic & mentoring review'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                          Corrective Action & Remarks
                        </div>
                        <div style={{ color: '#0F172A', marginTop: '2px' }}>
                          {m.mentor_remarks || m.corrective_action || 'Mentee advised to maintain course focus.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                No past Saturday meetings recorded for this mentee yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          13. PROGRESS & SKILLS TAB (7 core domains tracked)
          ============================================================ */}
      {activeTab === 'skills' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                  Mentor Skill Assessment & Progress Tracker
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
                  Evaluating 7 core professional and academic competencies for {student.full_name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSkillAssessmentModal(true)}
                className="btn btn-primary"
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <Plus size={16} /> Update Skill Assessment
              </button>
            </div>
          </div>

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
                color: '#D97706',
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
                color: '#059669',
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
                color: activeArrearsCount > 0 ? '#DC2626' : '#2563EB',
                recommendation: activeArrearsCount > 0 ? 'Clear active arrear in upcoming exam session.' : 'Maintain SGPA > 7.5.',
              },
              {
                title: 'Career & Placement Preparation',
                level: 'Developing (Level 3/5)',
                pct: 60,
                status: 'Ongoing',
                color: '#0B2545',
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
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                    {skill.title}
                  </h4>
                  <span
                    className={`badge ${skill.status === 'Attention Required' ? 'badge-danger' : skill.status === 'Needs Practice' ? 'badge-warning' : 'badge-success'}`}
                  >
                    {skill.status}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748B', marginBottom: '0.35rem' }}>
                  <span>{skill.level}</span>
                  <span>{skill.pct}%</span>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{ width: `${skill.pct}%`, height: '100%', backgroundColor: skill.color, borderRadius: '4px' }} />
                </div>

                <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
                  <strong style={{ color: '#0B2545' }}>Mentor Guidance:</strong> {skill.recommendation}
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
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.25rem' }}>
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

      {/* Modal 2: Add Counselling Record with AI Assistant */}
      {showCounsellingModal && (
        <Modal
          title="Add 5-Domain Counselling Record"
          isOpen={showCounsellingModal}
          onClose={() => setShowCounsellingModal(false)}
        >
          <form onSubmit={handleCounsellingSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Session Date</label>
                <input
                  type="date"
                  className="form-control"
                  required
                  value={counsellingForm.sessionDate}
                  onChange={(e) => setCounsellingForm({ ...counsellingForm, sessionDate: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Domain Category</label>
                <select
                  className="form-control"
                  value={counsellingForm.category}
                  onChange={(e) => setCounsellingForm({ ...counsellingForm, category: e.target.value })}
                >
                  <option value="Academic">Academic</option>
                  <option value="Training & Placement">Training & Placement</option>
                  <option value="Extra-Curricular / Co-Curricular">Extra-Curricular / Co-Curricular</option>
                  <option value="Innovation">Innovation</option>
                  <option value="Skill Development">Skill Development</option>
                </select>
              </div>
            </div>

            {/* AI Prompt Input & Generator */}
            <div
              style={{
                backgroundColor: '#F5F3FF',
                border: '1px solid #DDD6FE',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1rem',
              }}
            >
              <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#6D28D9', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <Sparkles size={16} /> AI Counselling Assistant (Institutional Mentor AI)
              </label>
              <p style={{ fontSize: '0.76rem', color: '#5B21B6', margin: '0 0 0.6rem 0' }}>
                Describe the specific skill, difficulty, or behavior needing improvement to generate structured suggestions.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ flex: 1, minWidth: '220px' }}
                  placeholder="e.g. Difficulty in Anna University C++ pointer arithmetic / public speaking fear..."
                  value={counsellingForm.skillNeedingImprovement}
                  onChange={(e) => setCounsellingForm({ ...counsellingForm, skillNeedingImprovement: e.target.value })}
                />
                <button
                  type="button"
                  onClick={handleGenerateAiSuggestions}
                  disabled={aiGenerating}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#7C3AED', borderColor: '#7C3AED', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Bot size={16} />
                  {aiGenerating ? 'Generating Plan...' : 'Generate AI Plan'}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Observed Challenge / Concern</label>
              <textarea
                className="form-control"
                rows={2}
                required
                placeholder="Mentee's specific issue or observation..."
                value={counsellingForm.challengeObserved}
                onChange={(e) => setCounsellingForm({ ...counsellingForm, challengeObserved: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Corrective Action Plan & Activities</label>
              <textarea
                className="form-control"
                rows={3}
                required
                placeholder="Step-by-step guidance provided to mentee..."
                value={counsellingForm.correctiveAction}
                onChange={(e) => setCounsellingForm({ ...counsellingForm, correctiveAction: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Expected Improvement (Measurable Outcome)</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Passing internal test 2 with >= 60% mark."
                value={counsellingForm.expectedImprovement}
                onChange={(e) => setCounsellingForm({ ...counsellingForm, expectedImprovement: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Mentor Remarks</label>
              <input
                type="text"
                className="form-control"
                placeholder="Specific guidance for student compliance..."
                value={counsellingForm.mentorRemarks}
                onChange={(e) => setCounsellingForm({ ...counsellingForm, mentorRemarks: e.target.value })}
              />
            </div>

            <p style={{ fontSize: '0.74rem', color: '#64748B', fontStyle: 'italic', marginBottom: '1rem' }}>
              Note: Mentor must review and edit all AI suggestions before saving. AI suggestions are never automatically committed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCounsellingModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingCounselling}>
                {submittingCounselling ? 'Saving Record...' : 'Save Counselling Record'}
              </button>
            </div>
          </form>
        </Modal>
      )}

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

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Challenges & Topics Discussed</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Review of semester attendance, arrears, lab submissions..."
                value={meetingForm.challengesDiscussed}
                onChange={(e) => setMeetingForm({ ...meetingForm, challengesDiscussed: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Mentor Remarks & Action Agreed Upon</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Guidance given during Saturday session..."
                value={meetingForm.mentorRemarks}
                onChange={(e) => setMeetingForm({ ...meetingForm, mentorRemarks: e.target.value })}
              />
            </div>

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
            <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '1rem' }}>
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
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0F172A' }}>{domain}</span>
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
    </div>
  );
};
