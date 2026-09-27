import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';
import { StudentDocumentsManager } from '../../components/documents/StudentDocumentsManager';
import {
  FileText,
  CalendarCheck2,
  BookOpen,
  Award,
  ArrowLeft,
  GraduationCap,
  User,
  History,
  Phone,
  Mail,
  Home,
  AlertCircle,
  Plus,
  CheckCircle2,
  Clock,
  Edit,
  School,
  Sparkles,
  Bot,
  FileCheck,
  RefreshCw,
  Check,
  LayoutDashboard,
  Trash2,
} from 'lucide-react';

interface StudentDetailsViewProps {
  studentId: string;
  onBack?: () => void;
}

export type StudentDetailsTab =
  | 'overview'
  | 'personal'
  | 'academic'
  | 'parent'
  | 'family' // alias for parent
  | 'mentor'
  | 'counselling'
  | 'documents'
  | 'meeting'
  | 'progress'
  | 'improvement' // alias for progress
  | 'pdf'
  | 'timeline';

export const StudentDetailsView: React.FC<StudentDetailsViewProps> = ({ studentId, onBack }) => {
  const { user } = useAuth();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudentDetailsTab>('overview');

  // AI Counselling Assistant State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCategory, setAiCategory] = useState('Skill Development');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    challengeObserved: string;
    correctiveAction: string;
    expectedImprovement: string;
    studentFeedback?: string;
    mentorRemarks?: string;
  } | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);
  const [aiIsEditing, setAiIsEditing] = useState(true);

  // Modals state
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showCounsellingModal, setShowCounsellingModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showAcademicModal, setShowAcademicModal] = useState(false);
  const [showClearArrearModal, setShowClearArrearModal] = useState(false);
  const [clearingArrear, setClearingArrear] = useState(false);
  const [clearArrearError, setClearArrearError] = useState<string | null>(null);
  const [clearArrearForm, setClearArrearForm] = useState({
    subjectCode: '',
    originalSemester: 1,
    clearedInSemester: 1,
    clearedDate: new Date().toISOString().split('T')[0],
    remarks: '',
    attempt: 1,
  });
  const [showDeleteStudentModal, setShowDeleteStudentModal] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(false);

  // Form states
  const [meetingForm, setMeetingForm] = useState({
    meetingDate: new Date().toISOString().split('T')[0],
    meetingTime: '10:30 AM',
    location: 'Faculty Cabin',
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

  const [counsellingForm, setCounsellingForm] = useState({
    sessionDate: new Date().toISOString().split('T')[0],
    category: 'Skill Development',
    challengeObserved: '',
    correctiveAction: '',
    expectedImprovement: '',
    studentFeedback: '',
    mentorRemarks: '',
  });

  const [progressForm, setProgressForm] = useState({
    academicYear: '2026-2027',
    monthName: 'End of Month 1',
    academicRating: 4,
    academicNotes: '',
    placementRating: 4,
    placementNotes: '',
    ecRating: 4,
    ecNotes: '',
    innovationRating: 4,
    innovationNotes: '',
    skillRating: 4,
    skillNotes: '',
  });

  const [semesterForms, setSemesterForms] = useState<any[]>([]);

  const fetchStudentData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.students.getById(studentId);
      if (res.success && res.data) {
        setStudent(res.data);
        // Pre-fill semester forms
        if (res.data.semesters && res.data.semesters.length > 0) {
          setSemesterForms(res.data.semesters);
        } else {
          setSemesterForms(
            [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
              semester_number: s,
              cgpa: 0,
              sgpa: 0,
              arrears_count: 0,
              arrears_subjects: '',
            }))
          );
        }
      } else {
        setError(res.message || 'Student not found.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load student dossier.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [studentId]);

  const handleDownloadPdf = async () => {
    if (!student) return;
    setPdfDownloading(true);
    try {
      await api.pdf.downloadStudentPdf(
        student.id,
        `KSRCE_Mentee_${student.register_number}_Dossier.pdf`
      );
    } catch (err: any) {
      alert('Error downloading PDF: ' + err.message);
    } finally {
      setPdfDownloading(false);
    }
  };

  // Submit Meeting
  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.meetings.create({
        studentId: student.id,
        ...meetingForm,
      });
      setShowMeetingModal(false);
      fetchStudentData();
    } catch (err: any) {
      alert('Failed to log meeting: ' + err.message);
    }
  };

  // Submit Counselling
  const handleCounsellingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.counselling.create({
        studentId: student.id,
        ...counsellingForm,
      });
      setShowCounsellingModal(false);
      fetchStudentData();
    } catch (err: any) {
      alert('Failed to log counselling: ' + err.message);
    }
  };

  const handleClearArrearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClearArrearError(null);
    if (!student || !clearArrearForm.subjectCode.trim()) {
      setClearArrearError('Subject Code is required.');
      return;
    }

    const semCleared = Number(clearArrearForm.clearedInSemester);
    const origSem = Number(clearArrearForm.originalSemester);

    if (isNaN(semCleared) || semCleared < 1 || semCleared > 8) {
      setClearArrearError('Cleared Semester must be between 1 and 8.');
      return;
    }

    if (isNaN(origSem) || origSem < 1 || origSem > 8) {
      setClearArrearError('Original Semester must be between 1 and 8.');
      return;
    }

    if (semCleared < origSem) {
      setClearArrearError(
        `Cleared Semester (Semester 0${semCleared}) cannot be earlier than Original Semester (Semester 0${origSem}).`
      );
      return;
    }

    if (!clearArrearForm.clearedDate) {
      setClearArrearError('Clearance date is required.');
      return;
    }

    if (!clearArrearForm.remarks.trim()) {
      setClearArrearError('Clearance remarks are required.');
      return;
    }

    setClearingArrear(true);
    try {
      const res = await api.students.clearArrear(student.id, {
        subjectCode: clearArrearForm.subjectCode.trim().toUpperCase(),
        clearedInSemester: semCleared,
        originalSemester: origSem,
        clearedDate: clearArrearForm.clearedDate,
        remarks: clearArrearForm.remarks.trim(),
        attempt: clearArrearForm.attempt || 1,
      });
      if (res.success) {
        setShowClearArrearModal(false);
        fetchStudentData();
      } else {
        setClearArrearError(res.message || 'Failed to record arrear clearance.');
      }
    } catch (err: any) {
      setClearArrearError(err.message || 'Error recording arrear clearance.');
    } finally {
      setClearingArrear(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!student) return;
    setDeletingStudent(true);
    try {
      const res = await api.students.delete(student.id);
      if (res.success) {
        alert(res.message || 'Student deleted successfully.');
        setShowDeleteStudentModal(false);
        if (onBack) onBack();
      } else {
        alert(res.message || 'Failed to delete student.');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting student.');
    } finally {
      setDeletingStudent(false);
    }
  };

  // AI Counselling Assistant Handlers
  const handleGenerateAiSuggestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiPrompt.trim()) {
      alert("Please describe the student's improvement need (e.g. 'weak in academic' or 'need skill improvement').");
      return;
    }
    setAiLoading(true);
    setAiSuccessMsg(null);
    try {
      const res = await api.counselling.getAiSuggestion(student.id, aiPrompt.trim(), aiCategory);
      if (res.success && res.data) {
        setAiResult({
          challengeObserved: res.data.challengeObserved || '',
          correctiveAction: res.data.correctiveAction || '',
          expectedImprovement: res.data.expectedImprovement || '',
          studentFeedback: 'Student acknowledged the observation and agreed to adhere to the corrective guidance.',
          mentorRemarks: `AI-assisted evaluation conducted on ${new Date().toISOString().split('T')[0]}. Follow-up scheduled for next Saturday.`,
        });
        setAiIsEditing(true);
      } else {
        alert(res.message || 'Failed to generate AI counselling suggestion.');
      }
    } catch (err: any) {
      alert('Error contacting AI service: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAcceptAndSaveAi = async () => {
    if (!aiResult) return;
    if (!aiResult.challengeObserved.trim() || !aiResult.correctiveAction.trim()) {
      alert('Challenge observed and corrective action are required.');
      return;
    }
    setAiSaving(true);
    try {
      const res = await api.counselling.create({
        studentId: student.id,
        category: aiCategory,
        sessionDate: new Date().toISOString().split('T')[0],
        challengeObserved: aiResult.challengeObserved,
        correctiveAction: aiResult.correctiveAction,
        expectedImprovement: aiResult.expectedImprovement,
        studentFeedback: aiResult.studentFeedback || 'Acknowledged',
        mentorRemarks: aiResult.mentorRemarks || 'Verified by Mentor',
        aiGenerated: true,
      });
      if (res.success) {
        setAiSuccessMsg('AI counselling suggestion officially accepted and permanently saved to student record!');
        setAiResult(null);
        setAiPrompt('');
        fetchStudentData();
      } else {
        alert(res.message || 'Failed to save official counselling record.');
      }
    } catch (err: any) {
      alert('Error saving record: ' + err.message);
    } finally {
      setAiSaving(false);
    }
  };

  // Submit Monthly Progress
  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.progress.create({
        studentId: student.id,
        ...progressForm,
      });
      setShowProgressModal(false);
      fetchStudentData();
    } catch (err: any) {
      alert('Failed to log monthly progress: ' + err.message);
    }
  };

  // Submit Academics Update
  const handleAcademicsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.students.updateAcademics(student.id, {
        semesters: semesterForms.map((s) => ({
          semesterNumber: s.semester_number,
          cgpa: s.cgpa,
          sgpa: s.sgpa,
          arrearsCount: s.arrears_count,
          arrearsSubjects: s.arrears_subjects,
        })),
      });
      setShowAcademicModal(false);
      fetchStudentData();
    } catch (err: any) {
      alert('Failed to update academic records: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <Skeleton variant="card" height="130px" style={{ marginBottom: '1.5rem', borderRadius: '16px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Skeleton variant="card" height="80px" />
          <Skeleton variant="card" height="80px" />
          <Skeleton variant="card" height="80px" />
          <Skeleton variant="card" height="80px" />
        </div>
        <Skeleton variant="table" rows={6} />
      </div>
    );
  }

  if (error || !student) {
    return (
      <EmptyState
        icon={<AlertCircle size={32} color="#DC2626" />}
        title="Student Record Unavailable"
        description={error || "We could not find the requested student dossier in the institutional database."}
        action={
          onBack && (
            <button className="btn btn-primary" onClick={onBack}>
              <ArrowLeft size={16} /> Back to Directory
            </button>
          )
        }
      />
    );
  }

  const isMentorOrAdmin = user?.role === 'ADMIN' || user?.role === 'HOD' || user?.role === 'FACULTY';

  return (
    <div>
      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onBack && (
            <button className="btn btn-secondary btn-sm" onClick={onBack}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              {student.full_name}
            </h2>
            <div style={{ fontSize: '0.825rem', color: '#64748B', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>Reg No: <strong>{student.register_number}</strong></span>
              <span>•</span>
              <span>{student.department_name}</span>
              <span>•</span>
              <span>Batch {student.batch_name}</span>
            </div>
          </div>
        </div>

        {/* PROMINENT MANDATORY PDF BUTTON & ACTIONS */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {isMentorOrAdmin && (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowMeetingModal(true)}
              >
                <CalendarCheck2 size={16} /> Log Saturday Meeting
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCounsellingModal(true)}
              >
                <BookOpen size={16} /> 5-Domain Counselling
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowProgressModal(true)}
              >
                <Award size={16} /> Monthly Progress
              </button>
            </>
          )}

          {/* MANDATORY PROMINENT BUTTON */}
          <button
            className="btn btn-pdf"
            onClick={handleDownloadPdf}
            disabled={pdfDownloading}
            style={{ padding: '0.6rem 1.4rem', fontSize: '0.9rem' }}
          >
            <FileText size={18} />
            {pdfDownloading ? 'Generating KSRCE PDF...' : 'DOWNLOAD STUDENT PDF'}
          </button>

          {user?.role === 'ADMIN' && (
            <button
              className="btn btn-sm"
              onClick={() => setShowDeleteStudentModal(true)}
              style={{
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                padding: '0.6rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title={`Permanently Delete ${student.full_name}`}
            >
              <Trash2 size={16} /> Delete Student
            </button>
          )}
        </div>
      </div>

      {/* Primary Highlights Card */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #C59B27' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>
              Current Assigned Mentor
            </span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B2545', marginTop: '3px' }}>
              {student.currentMentor ? student.currentMentor.mentor_name : 'No Active Mentor'}
            </div>
            {student.currentMentor && (
              <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                {student.currentMentor.designation} • {student.currentMentor.cabin_location}
              </div>
            )}
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>
              Academic Standing
            </span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B2545', marginTop: '3px' }}>
              {student.semesters && student.semesters.length > 0 && student.semesters[student.semesters.length - 1].cgpa > 0
                ? `${student.semesters[student.semesters.length - 1].cgpa.toFixed(2)} CGPA`
                : 'Initial Evaluation'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
              Total Standing Arrears:{' '}
              <strong style={{ color: (student.semesters?.reduce((a: any, c: any) => a + (c.arrears_count || 0), 0) || 0) > 0 ? '#DC2626' : '#059669' }}>
                {student.semesters?.reduce((a: any, c: any) => a + (c.arrears_count || 0), 0) || 0}
              </strong>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>
              Saturday Meetings & Counselling
            </span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B2545', marginTop: '3px' }}>
              {student.meetings?.length || 0} Meetings Logged
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
              {student.counsellingRecords?.length || 0} Counselling Sessions Recorded
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>
              Residential Status
            </span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B2545', marginTop: '3px' }}>
              <span className="badge badge-primary">
                {student.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
              Blood Group: <strong>{student.blood_group || 'N/A'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 10-Tab Navigation Bar as required by institutional guidelines */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          borderBottom: '2px solid #E2E8F0',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '6px',
        }}
      >
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('overview')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <LayoutDashboard size={15} /> 1. Overview
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'personal' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('personal')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <User size={15} /> 2. Personal Details
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'academic' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('academic')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <GraduationCap size={15} /> 3. Academic Details
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'parent' || activeTab === 'family' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('parent')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <Home size={15} /> 4. Parent Details
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'mentor' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('mentor')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <History size={15} /> 5. Mentor History
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'counselling' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('counselling')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <BookOpen size={15} /> 6. Counselling
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'documents' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('documents')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <FileCheck size={15} /> 7. Documents / Certificates
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'meeting' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('meeting')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <CalendarCheck2 size={15} /> 8. Meeting History
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'progress' || activeTab === 'improvement' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('progress')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <Award size={15} /> 9. Monthly Progress
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'pdf' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('pdf')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <FileText size={15} /> 10. Download PDF
        </button>
      </div>

      {/* 1. Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ maxWidth: '1000px' }}>
          {/* Quick Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #0B2545' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                Cumulative CGPA
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
                {student.semesters && student.semesters.length > 0 && student.semesters[student.semesters.length - 1].cgpa > 0
                  ? student.semesters[student.semesters.length - 1].cgpa.toFixed(2)
                  : 'N/A'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                Standing Arrears:{' '}
                <strong style={{ color: (student.active_arrears_count ?? student.total_arrears ?? 0) > 0 ? '#DC2626' : '#059669' }}>
                  {student.arrear_status_label || ((student.active_arrears_count ?? student.total_arrears ?? 0) === 0 ? '🟢 No Active Arrears' : `🔴 ${student.active_arrears_count ?? student.total_arrears} Active`)}
                </strong>
                {(student.historical_arrears_count || 0) > 0 && (
                  <span style={{ fontSize: '0.72rem', color: '#64748B', marginLeft: '6px' }}>
                    (Hist: {student.historical_arrears_count} • Cleared: {student.cleared_arrears_count || 0})
                  </span>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #C59B27' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                Profile Completion
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
                {student.profile_completed ? '100%' : '75%'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#059669', marginTop: '4px' }}>
                Permanent Student ID: <code>{student.id?.slice(-6) || student.register_number}</code>
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #059669' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                Saturday Meetings
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
                {student.meetings?.length || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                Next: <strong>Upcoming Saturday</strong>
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #3B82F6' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                Counselling Sessions
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
                {student.counsellingRecords?.length || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#3B82F6', marginTop: '4px' }}>
                5-Domain Tracking Active
              </div>
            </div>
          </div>

          {/* Quick Shortcuts & Navigation Card */}
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545', marginBottom: '1rem' }}>
              Student Information Portal — Quick Access
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
                onClick={() => setActiveTab('personal')}
              >
                <User size={16} /> 2. Personal Details
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
                onClick={() => setActiveTab('academic')}
              >
                <GraduationCap size={16} /> 3. Academic Details
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
                onClick={() => setActiveTab('counselling')}
              >
                <Sparkles size={16} color="#7C3AED" /> 6. AI Counselling Bot
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
                onClick={() => setActiveTab('documents')}
              >
                <FileCheck size={16} color="#059669" /> 7. Certificates & Documents
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
                onClick={() => setActiveTab('meeting')}
              >
                <CalendarCheck2 size={16} /> 8. Meeting History
              </button>
              <button
                className="btn btn-pdf"
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
                onClick={() => setActiveTab('pdf')}
              >
                <FileText size={16} /> 10. Official Record PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Personal Information */}
      {activeTab === 'personal' && (
        <div style={{ maxWidth: '900px' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><User size={18} /> 2. Personal & Demographic Details</h3>
              {student.profile_completed === 1 ? (
                <span className="badge badge-success">
                  Profile Completed {student.profile_completed_at ? `(${student.profile_completed_at.split('T')[0]})` : ''}
                </span>
              ) : (
                <span className="badge badge-warning">Pending Profile Completion (First Login)</span>
              )}
            </div>
            <table className="table" style={{ fontSize: '0.875rem' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, width: '30%', color: '#64748B' }}>Full Name</td>
                  <td style={{ fontWeight: 700, color: '#0B2545' }}>{student.full_name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Register Number</td>
                  <td><strong>{student.register_number}</strong></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Permanent Student ID</td>
                  <td><code style={{ backgroundColor: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', color: '#1E293B' }}>{student.id}</code></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Department & Batch</td>
                  <td>{student.department_name} ({student.department_code}) • Batch {student.batch_name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Mobile Number</td>
                  <td>{student.mobile_number || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Institutional Email ID</td>
                  <td>{student.email || `${student.register_number}@ksrce.ac.in`}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Date of Birth</td>
                  <td>{student.dob || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Blood Group</td>
                  <td><span className="badge badge-primary">{student.blood_group || 'N/A'}</span></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Residential Type</td>
                  <td><span className="badge badge-info">{student.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}</span></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Permanent Address</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{student.address || 'KSRCE Kalvi Nagar, Tiruchengode'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Parent / Family Information */}
      {(activeTab === 'parent' || activeTab === 'family') && (
        <div style={{ maxWidth: '900px' }}>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title"><Home size={18} /> 4. Parent & Family Details</h3>
            </div>
            <table className="table" style={{ fontSize: '0.875rem' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, width: '30%', color: '#64748B' }}>Father's Name</td>
                  <td style={{ fontWeight: 700, color: '#0B2545' }}>{student.parent?.father_name || 'N/A'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Father Contact Number</td>
                  <td>{student.parent?.father_contact || 'N/A'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Father Occupation</td>
                  <td>{student.parent?.father_occupation || 'N/A'}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #F1F5F9' }}>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Mother's Name</td>
                  <td style={{ fontWeight: 700, color: '#0B2545' }}>{student.parent?.mother_name || 'N/A'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Mother Contact Number</td>
                  <td>{student.parent?.mother_contact || 'N/A'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#64748B' }}>Mother Occupation</td>
                  <td>{student.parent?.mother_occupation || 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Sibling Particulars</h3>
            </div>
            {student.siblings && student.siblings.length > 0 ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Sibling Name</th>
                      <th>Contact Number</th>
                      <th>Occupation / Studies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.siblings.map((sib: any, idx: number) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{sib.sibling_name}</td>
                        <td>{sib.sibling_contact || 'N/A'}</td>
                        <td>{sib.sibling_occupation || 'Student'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '1.25rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                No siblings registered.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Academic Information */}
      {activeTab === 'academic' && (
        <div>
          {/* Prior Schooling */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title"><School size={18} /> TAB 3: Admission & Prior Schooling Particulars</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>10th Mark & School</th>
                    <th>12th Mark & School</th>
                    <th>TNEA Cut-off</th>
                    <th>Admission Mode</th>
                    <th>Scholarship Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        {student.school?.tenth_mark ? `${student.school.tenth_mark} / 500` : 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '4px' }}>
                        {student.school?.tenth_school_obj ? (
                          <>
                            <div style={{ fontWeight: 600, color: '#1e40af' }}>{student.school.tenth_school_obj.schoolName}</div>
                            <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
                              📍 {student.school.tenth_school_obj.city}, {student.school.tenth_school_obj.district}
                            </div>
                          </>
                        ) : (
                          student.school?.tenth_school || 'N/A'
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        {student.school?.twelfth_mark ? `${student.school.twelfth_mark} / 600` : 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '4px' }}>
                        {student.school?.twelfth_school_obj ? (
                          <>
                            <div style={{ fontWeight: 600, color: '#1e40af' }}>{student.school.twelfth_school_obj.schoolName}</div>
                            <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
                              📍 {student.school.twelfth_school_obj.city}, {student.school.twelfth_school_obj.district}
                            </div>
                          </>
                        ) : (
                          student.school?.twelfth_school || 'N/A'
                        )}
                      </div>
                    </td>
                    <td><strong>{student.school?.cutoff_mark || 'N/A'}</strong> / 200</td>
                    <td><span className="badge badge-primary">{student.school?.admission_type || 'COUNSELLING'}</span></td>
                    <td>{student.school?.scholarship_details || 'Nil'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Semesters 1 through 8 */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 className="card-title"><GraduationCap size={18} /> Semesters 1 to 8 Academic Ledger</h3>
                <span className={`badge ${(student.active_arrears_count ?? student.total_arrears ?? 0) === 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.825rem', padding: '0.3rem 0.65rem' }}>
                  {student.arrear_status_label || ((student.active_arrears_count ?? student.total_arrears ?? 0) === 0 ? '🟢 No Active Arrears' : `🔴 ${student.active_arrears_count ?? student.total_arrears} Active Arrears`)}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  (Historical: {student.historical_arrears_count || 0} • Cleared: {student.cleared_arrears_count || 0})
                </span>
              </div>
              {isMentorOrAdmin && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      // Pre-fill subject if active arrear detected
                      const activeSub = student?.active_arrear_subjects?.[0] || '';
                      setClearArrearForm({
                        subjectCode: activeSub,
                        originalSemester: 1,
                        clearedInSemester: 1,
                        clearedDate: new Date().toISOString().split('T')[0],
                        remarks: activeSub ? `${activeSub} Cleared` : '',
                        attempt: 1,
                      });
                      setClearArrearError(null);
                      setShowClearArrearModal(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: '1px solid #10B981',
                      color: '#047857',
                      backgroundColor: '#ECFDF5',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <CheckCircle2 size={14} /> Record Arrear Clearance
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAcademicModal(true)}>
                    <Edit size={14} /> Update Semester Marks
                  </button>
                </div>
              )}
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Semester</th>
                    <th>CGPA</th>
                    <th>SGPA</th>
                    <th>Semester Arrears</th>
                    <th>Arrear Subjects</th>
                    <th>Clearance Remarks & Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => {
                    const s = student.semesters?.find((x: any) => x.semester_number === sem);
                    const arrearsCount = s ? Number(s.arrears_count || 0) : 0;
                    const subjects = s ? (s.arrears_subjects || '—') : '—';
                    const hasActive = arrearsCount > 0;
                    const isCleared = !hasActive && (
                      s?.status === 'Cleared' ||
                      (s?.historical_arrears_count && s.historical_arrears_count > 0) ||
                      (s?.cleared_in_later_semesters && s.cleared_in_later_semesters.length > 0)
                    );

                    let clearanceStatus = 'Clear / Regular';
                    if (hasActive) {
                      clearanceStatus = 'Active Arrear';
                    } else if (isCleared) {
                      clearanceStatus = s?.clearance_remarks || (s?.cleared_in_later_semesters?.[0]?.subjectCode ? `${s.cleared_in_later_semesters[0].subjectCode} Cleared` : 'Cleared');
                    } else if (s?.cleared_subjects && s.cleared_subjects.length > 0) {
                      clearanceStatus = s.cleared_subjects.map((c: any) => `${c.subjectCode} Cleared`).join(', ') + ' / Clear';
                    } else if (s?.remarks) {
                      clearanceStatus = s.remarks;
                    }

                    return (
                      <tr key={sem}>
                        <td style={{ fontWeight: 600 }}>Semester 0{sem}</td>
                        <td>{s && s.cgpa > 0 ? <strong>{s.cgpa.toFixed(2)}</strong> : '-'}</td>
                        <td>{s && s.sgpa > 0 ? s.sgpa.toFixed(2) : '-'}</td>
                        <td>
                          <span className={`badge ${hasActive ? 'badge-danger' : 'badge-success'}`}>
                            {hasActive ? `${arrearsCount} Arrear${arrearsCount > 1 ? 's' : ''}` : '0'}
                          </span>
                        </td>
                        <td>
                          {hasActive && subjects !== '—' ? (
                            <strong style={{ color: '#DC2626' }}>{subjects}</strong>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>—</span>
                          )}
                        </td>
                        <td>
                          {hasActive ? (
                            <span className="badge badge-danger">Active Arrear</span>
                          ) : isCleared ? (
                            <span className="badge badge-success" style={{ fontWeight: 600 }}>
                              ✓ {clearanceStatus}
                            </span>
                          ) : (
                            <span style={{ color: '#059669', fontSize: '0.85rem' }}>
                              {clearanceStatus}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ARREAR HISTORY (Preserved Records) */}
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 className="card-title"><Clock size={18} /> ARREAR HISTORY (Preserved Records)</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Current Active: {student.active_arrears_count ?? student.total_arrears ?? 0} • Total History: {student.historical_arrears_count || 0} • Cleared: {student.cleared_arrears_count || 0}
                </span>
              </div>
              {isMentorOrAdmin && (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const firstActive = student?.active_arrear_subjects?.[0] || '';
                    setClearArrearForm({
                      subjectCode: firstActive,
                      originalSemester: 1,
                      clearedInSemester: 1,
                      clearedDate: new Date().toISOString().split('T')[0],
                      remarks: firstActive ? `${firstActive} Cleared` : '',
                      attempt: 1,
                    });
                    setClearArrearError(null);
                    setShowClearArrearModal(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#ECFDF5',
                    color: '#047857',
                    border: '1px solid #10B981',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <CheckCircle2 size={15} /> Record Arrear Clearance
                </button>
              )}
            </div>
            {(!student?.arrear_history || student.arrear_history.length === 0) ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                <CheckCircle2 size={36} color="#10B981" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 600, color: '#1E293B' }}>Clean Academic Record</div>
                <div style={{ fontSize: '0.85rem' }}>No arrears recorded across all semesters.</div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Subject Code</th>
                      <th>Original Semester</th>
                      <th>Attempt</th>
                      <th>Status</th>
                      <th>Cleared In</th>
                      <th>Clearance Date</th>
                      <th>Ledger Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.arrear_history.map((h: any, idx: number) => {
                      const isCleared = h.status === 'CLEARED';
                      return (
                        <tr key={idx}>
                          <td>
                            <strong style={{ color: isCleared ? '#1E293B' : '#DC2626' }}>
                              {h.subjectCode}
                            </strong>
                          </td>
                          <td>Semester 0{h.originalSemester}</td>
                          <td>
                            <span className="badge badge-secondary">Attempt {h.attempt || 1}</span>
                          </td>
                          <td>
                            <span className={`badge ${isCleared ? 'badge-success' : 'badge-danger'}`}>
                              {isCleared ? 'CLEARED' : 'ACTIVE ARREAR'}
                            </span>
                          </td>
                          <td>
                            {isCleared && h.clearedInSemester ? (
                              <span className="badge badge-success">Semester 0{h.clearedInSemester}</span>
                            ) : (
                              <span style={{ color: '#94A3B8' }}>—</span>
                            )}
                          </td>
                          <td>
                            {h.clearedDate ? (
                              <span style={{ fontSize: '0.85rem' }}>{h.clearedDate}</span>
                            ) : (
                              <span style={{ color: '#94A3B8' }}>—</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.85rem', color: '#475569' }}>
                            {h.remarks || (isCleared ? 'Cleared' : 'Pending Clearance')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Mentor History */}
      {activeTab === 'mentor' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: '#F8FAFC' }}>
            <div className="card-header">
              <h3 className="card-title"><History size={18} /> TAB 4: Mentor Assignment & Lineage History</h3>
              <span className="badge badge-primary">Permanent Student Record</span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#EFF6FF', borderRadius: '6px', margin: '0.75rem 0 1rem', fontSize: '0.85rem', color: '#1E40AF' }}>
              <strong>Data Retention Guarantee:</strong> Student data belongs permanently to the student. Changing mentors preserves 100% of student profile, meeting history, and counselling logs.
            </div>

            <div className="timeline" style={{ padding: '0.5rem 0' }}>
              {student.mentorHistory && student.mentorHistory.length > 0 ? (
                student.mentorHistory.map((h: any) => (
                  <div key={h.assignment_id} className="timeline-item">
                    <div className={`timeline-dot ${h.status === 'ACTIVE' ? 'active' : ''}`} />
                    <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.95rem', color: '#0B2545' }}>
                          {h.mentor_name} ({h.designation || 'Faculty Mentor'})
                        </strong>
                        <span className={`badge ${h.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}>
                          {h.status === 'ACTIVE' ? 'Active Current Mentor' : 'Previous Mentor (Completed)'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                        Tenure: <strong>{h.assigned_from}</strong> to <strong>{h.assigned_until || 'Present'}</strong>
                      </div>
                      <div style={{ fontSize: '0.825rem', color: '#334155', marginTop: '6px', backgroundColor: '#F1F5F9', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                        Assignment Note / Reason: <em>{h.change_reason || 'Initial Allocation'}</em>
                        {h.assigned_by_name && <span> (Recorded by: {h.assigned_by_name})</span>}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#64748B', fontSize: '0.85rem' }}>No historical assignments recorded.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Meeting History */}
      {activeTab === 'meeting' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title"><CalendarCheck2 size={18} /> TAB 5: Weekly Saturday Mentor–Mentee Meeting Records</h3>
              {isMentorOrAdmin && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowMeetingModal(true)}>
                  <Plus size={14} /> Log Saturday Meeting
                </button>
              )}
            </div>
            {student.meetings && student.meetings.length > 0 ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Saturday Date</th>
                      <th>Time & Venue</th>
                      <th>Attendance</th>
                      <th>Challenges Discussed</th>
                      <th>Corrective Action Taken</th>
                      <th>Mentor Remarks</th>
                      <th>Student Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.meetings.map((m: any) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 600 }}>{m.meeting_date}</td>
                        <td>{m.meeting_time}<br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{m.location}</span></td>
                        <td>
                          <span className={`badge ${m.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                            {m.attendance_status}
                          </span>
                        </td>
                        <td>{m.challenges_discussed || 'None'}</td>
                        <td>{m.corrective_action || 'Regular mentoring guidance'}</td>
                        <td>{m.mentor_remarks || 'Satisfactory'}</td>
                        <td>{m.student_feedback || 'Acknowledged'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748B', fontSize: '0.85rem' }}>
                No meeting records available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: Counselling (with AI Counselling Assistant) */}
      {activeTab === 'counselling' && (
        <div style={{ maxWidth: '1000px' }}>
          {/* AI Counselling Assistant Success Alert */}
          {aiSuccessMsg && (
            <div
              style={{
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#065F46',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <CheckCircle2 size={22} color="#059669" />
                <strong style={{ fontSize: '0.95rem' }}>{aiSuccessMsg}</strong>
              </div>
              <button
                onClick={() => setAiSuccessMsg(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.25rem', color: '#065F46' }}
              >
                ×
              </button>
            </div>
          )}

          {/* AI Counselling Assistant Card */}
          <div
            className="card"
            style={{
              marginBottom: '2rem',
              border: '1px solid #C7D2FE',
              borderRadius: '12px',
              backgroundColor: '#F8FAFC',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
                color: '#ffffff',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FDE047',
                  }}
                >
                  <Bot size={24} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, letterSpacing: '0.3px', color: '#ffffff' }}>
                    🤖 AI Counselling Assistant
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#E0E7FF', marginTop: '2px' }}>
                    KSRCE Institutional Mentoring AI • Formulates challenge, corrective action & expected improvement
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: 'rgba(253, 224, 71, 0.2)',
                  color: '#FEF08A',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  border: '1px solid rgba(253, 224, 71, 0.4)',
                }}
              >
                Human-in-the-Loop • Never Auto-Saves
              </span>
            </div>

            {/* AI Assistant Form Body */}
            <div style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 700, color: '#0B2545', fontSize: '0.9rem' }}>
                  Describe the student's improvement need:
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Enter your requirement here... (e.g. 'Student needs improvement in communication skill', 'weak in academic', 'not participating in events', 'need placement preparation', 'need skill improvement')..."
                  style={{ fontSize: '0.9rem', resize: 'vertical' }}
                />
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '6px' }}>
                  <strong>Example inputs:</strong> <em>"weak in academic"</em>, <em>"need communication improvement"</em>, <em>"not participating in events"</em>, <em>"need placement preparation"</em>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                  marginBottom: aiResult ? '1.5rem' : '0.5rem',
                }}
              >
                <div style={{ minWidth: '240px', flex: 1 }}>
                  <label className="form-label" style={{ fontWeight: 700, color: '#0B2545', fontSize: '0.85rem' }}>
                    Category Domain:
                  </label>
                  <select
                    className="form-control"
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    style={{ fontWeight: 600 }}
                  >
                    <option value="Academic">1. Academic</option>
                    <option value="Training & Placement">2. Training & Placement</option>
                    <option value="Extra-Curricular / Co-Curricular">3. Extra-Curricular / Co-Curricular</option>
                    <option value="Innovation">4. Innovation</option>
                    <option value="Skill Development">5. Skill Development</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={handleGenerateAiSuggestion}
                  disabled={aiLoading || !aiPrompt.trim()}
                  style={{ padding: '0.65rem 1.75rem', fontWeight: 800, fontSize: '0.9rem', minWidth: '200px' }}
                >
                  {aiLoading ? (
                    <>
                      <RefreshCw size={16} className="spin" /> Generating Advice...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> ✨ Generate Suggestion
                    </>
                  )}
                </button>
              </div>

              {/* AI Generated Structured Suggestion (Editable) */}
              {aiResult && (
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #E0E7FF',
                    borderRadius: '10px',
                    padding: '1.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                    marginTop: '1.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                      paddingBottom: '0.75rem',
                      borderBottom: '1px solid #EEF2F6',
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E1B4B', margin: 0 }}>
                        Review & Refine AI Suggestion
                      </h4>
                      <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                        Domain: <strong>{aiCategory}</strong> • Edit any field below before committing to the official permanent record book.
                      </div>
                    </div>
                    <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                      Pending Mentor Acceptance
                    </span>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label" style={{ fontWeight: 700, color: '#0B2545' }}>
                      Challenge Observed:
                    </label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={aiResult.challengeObserved}
                      onChange={(e) => setAiResult({ ...aiResult, challengeObserved: e.target.value })}
                      style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label" style={{ fontWeight: 700, color: '#0B2545' }}>
                      Corrective Action:
                    </label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={aiResult.correctiveAction}
                      onChange={(e) => setAiResult({ ...aiResult, correctiveAction: e.target.value })}
                      style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label className="form-label" style={{ fontWeight: 700, color: '#0B2545' }}>
                      Expected Improvement:
                    </label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={aiResult.expectedImprovement}
                      onChange={(e) => setAiResult({ ...aiResult, expectedImprovement: e.target.value })}
                      style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        Student Feedback / Commitment:
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={aiResult.studentFeedback || ''}
                        onChange={(e) => setAiResult({ ...aiResult, studentFeedback: e.target.value })}
                        placeholder="Student agreed to action plan..."
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        Mentor Remarks / Sign-off:
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={aiResult.mentorRemarks || ''}
                        onChange={(e) => setAiResult({ ...aiResult, mentorRemarks: e.target.value })}
                        placeholder="Mentor sign-off..."
                      />
                    </div>
                  </div>

                  {/* Action Buttons: [ EDIT ], [ REGENERATE ], [ ACCEPT & SAVE ] */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '0.75rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #EEF2F6',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setAiResult(null)}
                    >
                      Clear / Discard
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleGenerateAiSuggestion}
                      disabled={aiLoading}
                    >
                      <RefreshCw size={15} /> [ REGENERATE ]
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAcceptAndSaveAi}
                      disabled={aiSaving}
                      style={{
                        backgroundColor: '#059669',
                        borderColor: '#059669',
                        padding: '0.65rem 1.5rem',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                      }}
                    >
                      {aiSaving ? (
                        <>
                          <RefreshCw size={15} className="spin" /> Saving to MongoDB...
                        </>
                      ) : (
                        <>
                          <Check size={16} /> [ ACCEPT & SAVE ]
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Historical 5-Domain Counselling Records Table */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">
                <BookOpen size={18} /> 6. Logged 5-Domain Counselling & Action Records ({student.counsellingRecords?.length || 0})
              </h3>
              {isMentorOrAdmin && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowCounsellingModal(true)}>
                  <Plus size={14} /> Add Manual Counselling
                </button>
              )}
            </div>
            {student.counsellingRecords && student.counsellingRecords.length > 0 ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Session Date</th>
                      <th>Category Domain</th>
                      <th>Challenge Observed</th>
                      <th>Corrective Action</th>
                      <th>Expected Improvement</th>
                      <th>Feedback & Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.counsellingRecords.map((c: any) => (
                      <tr key={c.id || c._id}>
                        <td style={{ fontWeight: 600 }}>{c.session_date}</td>
                        <td>
                          <span className="badge badge-info">{c.category}</span>
                          {c.aiGenerated && (
                            <span
                              className="badge"
                              style={{
                                display: 'block',
                                marginTop: '4px',
                                backgroundColor: '#EEF2FF',
                                color: '#4338CA',
                                fontSize: '0.7rem',
                                border: '1px solid #C7D2FE',
                              }}
                            >
                              🤖 AI Assisted
                            </span>
                          )}
                        </td>
                        <td>{c.challenge_observed}</td>
                        <td>{c.corrective_action}</td>
                        <td style={{ color: '#047857' }}>{c.expected_improvement || c.expectedImprovement || 'Continuous monitoring'}</td>
                        <td>
                          <div style={{ fontSize: '0.8rem' }}>
                            <strong>Feedback:</strong> {c.student_feedback || 'Acknowledged'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                            <strong>Mentor:</strong> {c.mentor_remarks || 'Signed'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B', fontSize: '0.85rem' }}>
                No counselling records available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: Documents / Certificates */}
      {activeTab === 'documents' && (
        <div>
          <StudentDocumentsManager
            studentId={student.id || student._id}
            readOnly={false}
            canVerify={isMentorOrAdmin}
          />
        </div>
      )}

      {/* TAB 9: Monthly Progress */}
      {(activeTab === 'progress' || activeTab === 'improvement') && (
        <div>
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="card-header">
              <h3 className="card-title"><Award size={18} /> 9. Monthly Progress Improvement Ledger</h3>
              {isMentorOrAdmin && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowProgressModal(true)}>
                  <Plus size={14} /> Record Monthly Progress
                </button>
              )}
            </div>
            {student.monthlyProgress && student.monthlyProgress.length > 0 ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Academic (1-5)</th>
                      <th>Placement (1-5)</th>
                      <th>Extra-Curricular (1-5)</th>
                      <th>Innovation (1-5)</th>
                      <th>Skill Dev (1-5)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.monthlyProgress.map((p: any) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.month_name} ({p.academic_year})</td>
                        <td><strong>{p.academic_rating}/5</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.academic_notes}</span></td>
                        <td><strong>{p.placement_rating}/5</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.placement_notes}</span></td>
                        <td><strong>{p.ec_rating}/5</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.ec_notes}</span></td>
                        <td><strong>{p.innovation_rating}/5</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.innovation_notes}</span></td>
                        <td><strong>{p.skill_rating}/5</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.skill_notes}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748B', fontSize: '0.85rem' }}>
                No progress records available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 10: Download PDF */}
      {activeTab === 'pdf' && (
        <div style={{ maxWidth: '650px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                backgroundColor: '#FFFBEB',
                color: '#B8860B',
                borderRadius: '50%',
                margin: '0 auto 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={36} />
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0B2545', marginBottom: '0.5rem' }}>
              Official Institutional Record Book (PDF)
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#64748B', marginBottom: '1.75rem', lineHeight: 1.6 }}>
              Download the complete institutional academic dossier for <strong>{student.full_name}</strong> ({student.register_number}), including personal details, academic ledger (Sem 1-8), mentor lineage history, 5-domain counselling sessions, and Saturday meetings.
            </p>
            <button
              className="btn btn-pdf"
              style={{ padding: '0.85rem 2.25rem', fontSize: '1rem' }}
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
            >
              <FileText size={20} />
              {pdfDownloading ? 'Generating Dossier PDF...' : 'DOWNLOAD OFFICIAL PDF'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 8: Complete Timeline */}
      {activeTab === 'timeline' && (
        <div style={{ maxWidth: '850px' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><Clock size={18} /> TAB 8: Complete Student Lifecycle Timeline</h3>
              <span className="badge badge-primary">Comprehensive Audit Feed</span>
            </div>
            <div style={{ padding: '0.5rem 0' }}>
              <div className="timeline">
                {(() => {
                  const events: any[] = [];
                  if (student.created_at) {
                    events.push({
                      date: student.created_at.split('T')[0],
                      title: 'Institutional Account Created',
                      desc: `Account registered with permanent Student ID: ${student.id}`,
                      badge: 'Identity Created',
                      badgeClass: 'badge-primary',
                    });
                  }
                  if (student.profile_completed && student.profile_completed_at) {
                    events.push({
                      date: student.profile_completed_at.split('T')[0],
                      title: 'Student Profile Self-Submitted',
                      desc: 'Student verified and submitted full personal, demographic, parental, and schooling dossier.',
                      badge: 'Profile Completed',
                      badgeClass: 'badge-success',
                    });
                  }
                  if (student.mentorHistory) {
                    student.mentorHistory.forEach((h: any) => {
                      events.push({
                        date: h.assigned_from,
                        title: `Mentor Allocation: ${h.mentor_name}`,
                        desc: `Tenure: ${h.assigned_from} to ${h.assigned_until || 'Present'}. Reason: ${h.change_reason || 'Initial Allocation'}`,
                        badge: h.status === 'ACTIVE' ? 'Active Mentor' : 'Previous Mentor',
                        badgeClass: h.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary',
                      });
                    });
                  }
                  if (student.meetings) {
                    student.meetings.forEach((m: any) => {
                      events.push({
                        date: m.meeting_date,
                        title: `Saturday Mentoring Meeting (${m.attendance_status})`,
                        desc: `Challenges: ${m.challenges_discussed || 'None'}. Action: ${m.corrective_action || 'Mentoring guidance'}. Venue: ${m.location}`,
                        badge: 'Saturday Meeting',
                        badgeClass: 'badge-warning',
                      });
                    });
                  }
                  if (student.counsellingRecords) {
                    student.counsellingRecords.forEach((c: any) => {
                      events.push({
                        date: c.session_date,
                        title: `5-Domain Counselling (${c.category})`,
                        desc: `Challenge: ${c.challenge_observed}. Action: ${c.corrective_action}. Feedback: ${c.student_feedback || 'Acknowledged'}`,
                        badge: c.category,
                        badgeClass: 'badge-info',
                      });
                    });
                  }
                  if (student.monthlyProgress) {
                    student.monthlyProgress.forEach((p: any) => {
                      events.push({
                        date: p.created_at ? p.created_at.split('T')[0] : 'Monthly',
                        title: `Monthly Improvement Evaluation (${p.month_name})`,
                        desc: `Academic ${p.academic_rating}/5, Placement ${p.placement_rating}/5, E&C ${p.ec_rating}/5, Innovation ${p.innovation_rating}/5, Skill ${p.skill_rating}/5`,
                        badge: 'Monthly Progress',
                        badgeClass: 'badge-primary',
                      });
                    });
                  }
                  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

                  return events.length > 0 ? (
                    events.map((ev, i) => (
                      <div key={i} className="timeline-item">
                        <div className="timeline-dot active" />
                        <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#0B2545' }}>{ev.title}</strong>
                            <span className={`badge ${ev.badgeClass}`}>{ev.badge}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '3px' }}>
                            Date: <strong>{ev.date}</strong>
                          </div>
                          <div style={{ fontSize: '0.825rem', color: '#334155', marginTop: '6px', lineHeight: 1.5 }}>
                            {ev.desc}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#64748B', fontSize: '0.85rem' }}>No lifecycle events recorded.</div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Saturday Meeting Entry */}
      <Modal
        isOpen={showMeetingModal}
        onClose={() => setShowMeetingModal(false)}
        title="Log Weekly Saturday Meeting Record"
      >
        <form onSubmit={handleMeetingSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Saturday Date</label>
              <input
                type="date"
                className="form-control"
                value={meetingForm.meetingDate}
                onChange={(e) => setMeetingForm({ ...meetingForm, meetingDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Institution Time</label>
              <input
                type="text"
                className="form-control"
                value={meetingForm.meetingTime}
                onChange={(e) => setMeetingForm({ ...meetingForm, meetingTime: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Location / Cabin</label>
              <input
                type="text"
                className="form-control"
                value={meetingForm.location}
                onChange={(e) => setMeetingForm({ ...meetingForm, location: e.target.value })}
                required
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
                <option value="ON_DUTY">ON DUTY (OD)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Challenges Discussed</label>
            <textarea
              className="form-control"
              rows={2}
              value={meetingForm.challengesDiscussed}
              onChange={(e) => setMeetingForm({ ...meetingForm, challengesDiscussed: e.target.value })}
              placeholder="e.g. Exam preparation, attendance backlog, project hurdles..."
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Corrective Action Taken</label>
            <textarea
              className="form-control"
              rows={2}
              value={meetingForm.correctiveAction}
              onChange={(e) => setMeetingForm({ ...meetingForm, correctiveAction: e.target.value })}
              placeholder="Action plan advised to the student..."
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Student Feedback</label>
            <input
              type="text"
              className="form-control"
              value={meetingForm.studentFeedback}
              onChange={(e) => setMeetingForm({ ...meetingForm, studentFeedback: e.target.value })}
              placeholder="Student's response or commitment..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mentor Remarks</label>
            <input
              type="text"
              className="form-control"
              value={meetingForm.mentorRemarks}
              onChange={(e) => setMeetingForm({ ...meetingForm, mentorRemarks: e.target.value })}
              placeholder="e.g. Progressing satisfactorily..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowMeetingModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Meeting Record
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: 5-Domain Counselling Entry */}
      <Modal
        isOpen={showCounsellingModal}
        onClose={() => setShowCounsellingModal(false)}
        title="Record 5-Domain Counselling Session"
      >
        <form onSubmit={handleCounsellingSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Session Date</label>
              <input
                type="date"
                className="form-control"
                value={counsellingForm.sessionDate}
                onChange={(e) => setCounsellingForm({ ...counsellingForm, sessionDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Counselling Category</label>
              <select
                className="form-control"
                value={counsellingForm.category}
                onChange={(e) => setCounsellingForm({ ...counsellingForm, category: e.target.value })}
              >
                <option value="Academic">1. Academic</option>
                <option value="Training & Placement">2. Training & Placement</option>
                <option value="Extra-Curricular / Co-Curricular">3. Extra-Curricular / Co-Curricular</option>
                <option value="Innovation">4. Innovation</option>
                <option value="Skill Development">5. Skill Development</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Challenge Observed</label>
            <textarea
              className="form-control"
              rows={2}
              value={counsellingForm.challengeObserved}
              onChange={(e) => setCounsellingForm({ ...counsellingForm, challengeObserved: e.target.value })}
              placeholder="Specific behavioral or performance issue observed..."
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Corrective Action Prescribed</label>
            <textarea
              className="form-control"
              rows={2}
              value={counsellingForm.correctiveAction}
              onChange={(e) => setCounsellingForm({ ...counsellingForm, correctiveAction: e.target.value })}
              placeholder="Intervention strategy, assignments or peer-tutoring assigned..."
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Expected Improvement</label>
            <input
              type="text"
              className="form-control"
              value={counsellingForm.expectedImprovement}
              onChange={(e) => setCounsellingForm({ ...counsellingForm, expectedImprovement: e.target.value })}
              placeholder="e.g. Expected increase in test marks, active engagement in lab..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Student Feedback</label>
            <input
              type="text"
              className="form-control"
              value={counsellingForm.studentFeedback}
              onChange={(e) => setCounsellingForm({ ...counsellingForm, studentFeedback: e.target.value })}
              placeholder="Student acknowledgement..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mentor Remarks</label>
            <input
              type="text"
              className="form-control"
              value={counsellingForm.mentorRemarks}
              onChange={(e) => setCounsellingForm({ ...counsellingForm, mentorRemarks: e.target.value })}
              placeholder="Faculty sign-off notes..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCounsellingModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Record Counselling
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Monthly Progress Entry */}
      <Modal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        title="Record Monthly Improvement Progress"
      >
        <form onSubmit={handleProgressSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Academic Year</label>
              <input
                type="text"
                className="form-control"
                value={progressForm.academicYear}
                onChange={(e) => setProgressForm({ ...progressForm, academicYear: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Evaluation Period</label>
              <select
                className="form-control"
                value={progressForm.monthName}
                onChange={(e) => setProgressForm({ ...progressForm, monthName: e.target.value })}
              >
                <option value="End of Month 1">End of Month 1</option>
                <option value="End of Month 2">End of Month 2</option>
                <option value="End of Month 3">End of Month 3</option>
                <option value="End of Semester Evaluation">End of Semester Evaluation</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
            <div>
              <label className="form-label">Academic</label>
              <select
                className="form-control"
                value={progressForm.academicRating}
                onChange={(e) => setProgressForm({ ...progressForm, academicRating: parseInt(e.target.value) })}
              >
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} / 5</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Academic Notes</label>
              <input
                type="text"
                className="form-control"
                value={progressForm.academicNotes}
                onChange={(e) => setProgressForm({ ...progressForm, academicNotes: e.target.value })}
                placeholder="GPA consistency, test scores..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
            <div>
              <label className="form-label">Placement</label>
              <select
                className="form-control"
                value={progressForm.placementRating}
                onChange={(e) => setProgressForm({ ...progressForm, placementRating: parseInt(e.target.value) })}
              >
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} / 5</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Placement Notes</label>
              <input
                type="text"
                className="form-control"
                value={progressForm.placementNotes}
                onChange={(e) => setProgressForm({ ...progressForm, placementNotes: e.target.value })}
                placeholder="Aptitude, mock interviews, coding..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
            <div>
              <label className="form-label">Extra-Curr</label>
              <select
                className="form-control"
                value={progressForm.ecRating}
                onChange={(e) => setProgressForm({ ...progressForm, ecRating: parseInt(e.target.value) })}
              >
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} / 5</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">E&C Notes</label>
              <input
                type="text"
                className="form-control"
                value={progressForm.ecNotes}
                onChange={(e) => setProgressForm({ ...progressForm, ecNotes: e.target.value })}
                placeholder="Symposiums, sports, clubs..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
            <div>
              <label className="form-label">Innovation</label>
              <select
                className="form-control"
                value={progressForm.innovationRating}
                onChange={(e) => setProgressForm({ ...progressForm, innovationRating: parseInt(e.target.value) })}
              >
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} / 5</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Innovation Notes</label>
              <input
                type="text"
                className="form-control"
                value={progressForm.innovationNotes}
                onChange={(e) => setProgressForm({ ...progressForm, innovationNotes: e.target.value })}
                placeholder="Projects, hackathons, patents..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label className="form-label">Skill Dev</label>
              <select
                className="form-control"
                value={progressForm.skillRating}
                onChange={(e) => setProgressForm({ ...progressForm, skillRating: parseInt(e.target.value) })}
              >
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} / 5</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Skill Notes</label>
              <input
                type="text"
                className="form-control"
                value={progressForm.skillNotes}
                onChange={(e) => setProgressForm({ ...progressForm, skillNotes: e.target.value })}
                placeholder="Certifications, online courses..."
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowProgressModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Progress Ledger
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Edit Academic Marks */}
      <Modal
        isOpen={showAcademicModal}
        onClose={() => setShowAcademicModal(false)}
        title="Update Semester 1 to 8 Academic Grades"
        maxWidth="800px"
      >
        <form onSubmit={handleAcademicsSubmit}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {semesterForms.map((sem, idx) => (
              <div
                key={sem.semester_number}
                style={{
                  padding: '0.75rem',
                  backgroundColor: idx % 2 === 0 ? '#F8FAFC' : '#ffffff',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: '0.4rem' }}>
                  Semester 0{sem.semester_number}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>CGPA</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={sem.cgpa}
                      onChange={(e) => {
                        const copy = [...semesterForms];
                        copy[idx].cgpa = parseFloat(e.target.value) || 0;
                        setSemesterForms(copy);
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>SGPA</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={sem.sgpa}
                      onChange={(e) => {
                        const copy = [...semesterForms];
                        copy[idx].sgpa = parseFloat(e.target.value) || 0;
                        setSemesterForms(copy);
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Arrears</label>
                    <input
                      type="number"
                      className="form-control"
                      value={sem.arrears_count}
                      onChange={(e) => {
                        const copy = [...semesterForms];
                        copy[idx].arrears_count = parseInt(e.target.value) || 0;
                        setSemesterForms(copy);
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Subjects</label>
                    <input
                      type="text"
                      className="form-control"
                      value={sem.arrears_subjects || ''}
                      onChange={(e) => {
                        const copy = [...semesterForms];
                        copy[idx].arrears_subjects = e.target.value;
                        setSemesterForms(copy);
                      }}
                      placeholder="e.g. CS8401"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAcademicModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Academic Ledger
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 5: Record Arrear Clearance (Preserves Historical Semester Records) */}
      <Modal
        isOpen={showClearArrearModal}
        onClose={() => setShowClearArrearModal(false)}
        title="Record Arrear Clearance (Preserves Academic History)"
        maxWidth="600px"
      >
        <form onSubmit={handleClearArrearSubmit}>
          <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.85rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#166534' }}>
            <strong>Institutional Academic History Integrity:</strong><br />
            Arrears are semester-specific. Recording clearance in a later semester preserves the original semester's historical record without deletion while updating the latest status to CLEARED.
          </div>

          {clearArrearError && (
            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', color: '#DC2626', fontSize: '0.85rem' }}>
              {clearArrearError}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label className="form-label">Subject Code *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. 24ITT36"
              value={clearArrearForm.subjectCode}
              onChange={(e) => setClearArrearForm({ ...clearArrearForm, subjectCode: e.target.value.toUpperCase() })}
              required
              style={{ textTransform: 'uppercase', fontWeight: 600 }}
            />
            {student?.active_arrear_subjects && student.active_arrear_subjects.length > 0 && (
              <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#64748B' }}>
                Active uncleared subjects detected:{' '}
                {student.active_arrear_subjects.map((sub: string) => (
                  <button
                    key={sub}
                    type="button"
                    className="badge badge-warning"
                    style={{ marginRight: '6px', cursor: 'pointer', border: 'none' }}
                    onClick={() => setClearArrearForm({ ...clearArrearForm, subjectCode: sub, remarks: `${sub} Cleared` })}
                  >
                    Select {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label className="form-label">Original Semester Incurred *</label>
              <select
                className="form-control"
                value={clearArrearForm.originalSemester}
                onChange={(e) => setClearArrearForm({ ...clearArrearForm, originalSemester: parseInt(e.target.value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={sem}>Semester 0{sem}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Cleared in Semester *</label>
              <select
                className="form-control"
                value={clearArrearForm.clearedInSemester}
                onChange={(e) => setClearArrearForm({ ...clearArrearForm, clearedInSemester: parseInt(e.target.value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={sem}>Semester 0{sem}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label className="form-label">Clearance Date *</label>
              <input
                type="date"
                className="form-control"
                value={clearArrearForm.clearedDate}
                onChange={(e) => setClearArrearForm({ ...clearArrearForm, clearedDate: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="form-label">Attempt Number</label>
              <input
                type="number"
                min="1"
                max="10"
                className="form-control"
                value={clearArrearForm.attempt}
                onChange={(e) => setClearArrearForm({ ...clearArrearForm, attempt: parseInt(e.target.value, 10) || 1 })}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Remarks / Ledger Note *</label>
            <input
              type="text"
              className="form-control"
              placeholder={clearArrearForm.subjectCode ? `${clearArrearForm.subjectCode} Cleared` : 'e.g. 24ITT36 Cleared'}
              value={clearArrearForm.remarks}
              onChange={(e) => setClearArrearForm({ ...clearArrearForm, remarks: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowClearArrearModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={clearingArrear} style={{ backgroundColor: '#059669', borderColor: '#059669' }}>
              {clearingArrear ? 'Recording Clearance...' : 'Confirm & Save Clearance'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Permanently Delete Student */}
      <Modal
        isOpen={showDeleteStudentModal}
        onClose={() => !deletingStudent && setShowDeleteStudentModal(false)}
        title="Permanently Delete Student Record"
        maxWidth="500px"
      >
        <div>
          <div
            style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.25rem',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <AlertCircle size={24} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#991B1B', fontSize: '0.95rem' }}>Irreversible Administrative Action</strong>
              <p style={{ color: '#B91C1C', fontSize: '0.85rem', margin: '4px 0 0' }}>
                Are you sure you want to permanently delete student <strong>{student?.full_name}</strong> ({student?.register_number})? All academic history, meeting logs, counselling records, and login access will be permanently removed.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowDeleteStudentModal(false)}
              disabled={deletingStudent}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteStudent}
              disabled={deletingStudent}
              style={{ backgroundColor: '#DC2626', borderColor: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={16} />
              {deletingStudent ? 'Deleting Student...' : 'Confirm Permanent Deletion'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
