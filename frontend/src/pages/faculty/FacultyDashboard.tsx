import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { MentorStudentProfileView } from '../mentor/MentorStudentProfileView';
import { StudentDetailsTab } from '../common/StudentDetailsView';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';
import { DashboardSkeleton, StudentsSkeleton } from '../../components/common/SkeletonLoader';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import { MentorAiBotModal } from '../../components/mentor/MentorAiBotModal';
import { Modal } from '../../components/common/Modal';
import {
  Users,
  CalendarCheck2,
  AlertTriangle,
  FileText,
  Search,
  BookOpen,
  Award,
  ArrowRight,
  Clock,
  CheckCircle2,
  Sparkles,
  Download,
  Filter,
  FileCheck,
  AlertCircle,
  GraduationCap,
  Plus,
  Folder,
  FileSpreadsheet,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface FacultyDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({ currentTab, onSelectTab }) => {
  const { user } = useAuth();
  const [mentees, setMentees] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  // Search & Filter states (Section 8)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('');
  const [selectedArrearFilter, setSelectedArrearFilter] = useState<'ALL' | 'ARREARS' | 'CLEAR'>('ALL');
  const [selectedCompletionFilter, setSelectedCompletionFilter] = useState<'ALL' | 'COMPLETED' | 'INCOMPLETE'>('ALL');

  // Quick Action Modal states
  const [isAiBotOpen, setIsAiBotOpen] = useState(false);
  const [showQuickPdfModal, setShowQuickPdfModal] = useState(false);
  const [quickPdfStudentId, setQuickPdfStudentId] = useState('');
  const [showQuickCounsellingModal, setShowQuickCounsellingModal] = useState(false);
  const [quickCounsellingStudentId, setQuickCounsellingStudentId] = useState('');

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentInitialTab, setStudentInitialTab] = useState<StudentDetailsTab>('overview');

  const toast = useToast();
  // Download Overall Mentee Data (Excel) state (Requirements 10 & 14)
  const [downloadExcelState, setDownloadExcelState] = useState<'idle' | 'generating' | 'downloading' | 'complete' | 'error'>('idle');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportAcademicYear, setExportAcademicYear] = useState('');

  const handleDownloadOverallExcel = async (customYear?: string) => {
    if (downloadExcelState === 'generating' || downloadExcelState === 'downloading') return;

    if (!mentees || mentees.length === 0) {
      toast.error('No mentees are currently assigned to you.', 'Export Not Available');
      return;
    }

    try {
      setDownloadExcelState('generating');
      // Smooth visual progression: Generating Excel... -> Downloading... -> Download Complete
      const timer = setTimeout(() => {
        setDownloadExcelState((prev) => (prev === 'generating' ? 'downloading' : prev));
      }, 600);

      const res = await api.mentorship.downloadOverallMenteesExcel({
        mentorId: user?.facultyId || '',
        academicYear: customYear || exportAcademicYear || undefined,
      });

      clearTimeout(timer);
      setDownloadExcelState('complete');
      toast.success(
        `Overall mentee dataset successfully generated & downloaded (${res.filename}).`,
        'Download Complete'
      );
      setShowExportModal(false);

      setTimeout(() => {
        setDownloadExcelState('idle');
      }, 2500);
    } catch (err: any) {
      setDownloadExcelState('error');
      console.error('Error downloading overall mentee excel:', err);
      const safeMsg = err?.message || 'Unable to generate the report. Please try again.';
      toast.error(safeMsg, 'Export Error');
      setTimeout(() => {
        setDownloadExcelState('idle');
      }, 3000);
    }
  };

  const getDownloadButtonLabel = () => {
    switch (downloadExcelState) {
      case 'generating':
        return 'Generating Excel...';
      case 'downloading':
        return 'Downloading...';
      case 'complete':
        return 'Download Complete';
      default:
        return 'Download Overall Data';
    }
  };

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [menteesRes, meetingsRes, scheduleRes] = await Promise.all([
        api.students.list({ mentorId: user?.facultyId || '' }),
        api.meetings.list({ mentorId: user?.facultyId || '' }),
        api.meetings.getSchedule(),
      ]);

      if (menteesRes.success) setMentees(menteesRes.data?.students || []);
      if (meetingsRes.success) setMeetings(meetingsRes.data);
      if (scheduleRes.success) setSchedule(scheduleRes.data);
    } catch (err: any) {
      console.error('Failed to load faculty data:', err);
      setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Sync sidebar tab navigation with student view tabs or return to list
  useEffect(() => {
    if (selectedStudentId) {
      if (currentTab === 'counselling') {
        setStudentInitialTab('counselling');
      } else if (currentTab === 'meetings') {
        setStudentInitialTab('meeting');
      } else if (currentTab === 'progress') {
        setStudentInitialTab('progress');
      } else if (currentTab === 'mentees' || currentTab === 'overview') {
        setSelectedStudentId(null);
        setStudentInitialTab('overview');
      }
    }
  }, [currentTab]);

  if (selectedStudentId) {
    return (
      <MentorStudentProfileView
        studentId={selectedStudentId}
        initialTab={studentInitialTab}
        onBack={() => {
          setSelectedStudentId(null);
          setStudentInitialTab('overview');
        }}
      />
    );
  }

  if (loading) {
    if (currentTab === 'mentees') return <StudentsSkeleton />;
    return <DashboardSkeleton />;
  }

  if (loadError) {
    if (loadError.type === 'NETWORK_ERROR' || loadError.statusCode === 0) {
      return <NetworkErrorState onRetry={loadData} fullPage={false} />;
    }
    if (loadError.type === 'SERVICE_UNAVAILABLE' || loadError.statusCode === 503) {
      return <ServiceUnavailableState onRetry={loadData} fullPage={false} />;
    }
    return <ServerErrorState onRetry={loadData} fullPage={false} />;
  }

  // Computed filter options
  const uniqueDepartments = Array.from(
    new Set(mentees.map((m) => m.department_name || m.department_code).filter(Boolean))
  );
  const uniqueYears = Array.from(new Set(mentees.map((m) => m.year || 2))).sort();
  const uniqueSections = Array.from(new Set(mentees.map((m) => m.section || 'A'))).sort();

  // Filtered mentees (Section 8)
  const filteredMentees = mentees.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      m.full_name?.toLowerCase().includes(q) ||
      m.register_number?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q);

    const matchesDept =
      !selectedDeptFilter ||
      m.department_name === selectedDeptFilter ||
      m.department_code === selectedDeptFilter;

    const matchesYear =
      !selectedYearFilter ||
      String(m.year) === selectedYearFilter ||
      m.batch_name?.includes(selectedYearFilter);

    const matchesSection =
      !selectedSectionFilter ||
      (m.section && m.section.toUpperCase() === selectedSectionFilter.toUpperCase());

    const matchesArrear =
      selectedArrearFilter === 'ALL' ||
      (selectedArrearFilter === 'ARREARS' && (m.total_arrears || 0) > 0) ||
      (selectedArrearFilter === 'CLEAR' && (!m.total_arrears || m.total_arrears === 0));

    const comp = m.profile_completion_percentage ?? (m.profile_completed ? 100 : 40);
    const matchesCompletion =
      selectedCompletionFilter === 'ALL' ||
      (selectedCompletionFilter === 'COMPLETED' && comp >= 100) ||
      (selectedCompletionFilter === 'INCOMPLETE' && comp < 100);

    return matchesSearch && matchesDept && matchesYear && matchesSection && matchesArrear && matchesCompletion;
  });

  // Section 7 Dashboard Metrics
  const studentsWithArrears = mentees.filter((m) => (m.total_arrears || 0) > 0);
  const totalActiveArrears = mentees.reduce((acc, m) => acc + (m.total_arrears || 0), 0);
  const totalCounsellingSessions = mentees.reduce((acc, m) => acc + (m.counselling_count || 0), 0);
  const pendingCounsellingCount = mentees.filter(
    (m) => (m.total_arrears > 0 && (m.counselling_count || 0) === 0) || (m.counselling_count || 0) === 0
  ).length;
  const totalUploadedDocuments = mentees.reduce((acc, m) => acc + (m.document_count || 0), 0);
  const monthlyImprovementCount = mentees.filter((m) => (m.completed_meetings_count || 0) > 0).length;

  return (
    <div>
      {/* Overview Tab */}
      {currentTab === 'overview' && (
        <div>
          {/* Quick Actions Bar (Section 7) */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.65rem',
              marginBottom: '1.5rem',
              background: '#ffffff',
              padding: '0.85rem 1.25rem',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0B2545', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.35rem' }}>
              Quick Actions:
            </span>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onSelectTab('mentees')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Users size={14} /> View Mentees
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowQuickCounsellingModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <BookOpen size={14} /> Add Counselling
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onSelectTab('meetings')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <CalendarCheck2 size={14} /> Saturday Meeting
            </button>
            <button
              className="btn btn-gold btn-sm"
              onClick={() => setIsAiBotOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Sparkles size={14} /> AI Assistant
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onSelectTab('documents')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <FileCheck size={14} /> Documents
            </button>
            <button
              className="btn btn-pdf btn-sm"
              onClick={() => setShowQuickPdfModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Download size={14} /> Download Student PDF
            </button>
            {/* Download Overall Mentee Data (Excel .xlsx) Button */}
            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button
                className="btn btn-sm"
                onClick={() => handleDownloadOverallExcel()}
                disabled={downloadExcelState === 'generating' || downloadExcelState === 'downloading'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  backgroundColor: downloadExcelState === 'complete' ? '#059669' : '#0B2545',
                  borderColor: downloadExcelState === 'complete' ? '#059669' : '#0B2545',
                  color: '#ffffff',
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                }}
                title="Download Overall Data (Excel .xlsx) for all assigned mentees"
              >
                {downloadExcelState === 'generating' || downloadExcelState === 'downloading' ? (
                  <span className="spinner-border spinner-border-sm" style={{ width: 13, height: 13 }} />
                ) : downloadExcelState === 'complete' ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <FileSpreadsheet size={14} />
                )}
                <span>{getDownloadButtonLabel()}</span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  .xlsx
                </span>
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setShowExportModal(true)}
                disabled={downloadExcelState === 'generating' || downloadExcelState === 'downloading'}
                style={{
                  backgroundColor: '#071A30',
                  borderColor: '#0B2545',
                  color: '#ffffff',
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  paddingLeft: '6px',
                  paddingRight: '6px',
                  borderLeft: '1px solid rgba(255,255,255,0.15)',
                }}
                title="Export Options & Academic Year"
              >
                ▾
              </button>
            </div>
          </div>

          {/* Stat Cards - 7 Key Mentor Metrics (Section 7) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EEF2F6', color: '#0B2545' }}>
                <Users size={22} />
              </div>
              <div className="stat-info">
                <h3>My Mentees</h3>
                <div className="stat-value">{mentees.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                <CalendarCheck2 size={22} />
              </div>
              <div className="stat-info">
                <h3>Upcoming Saturday Meeting</h3>
                <div className="stat-value" style={{ fontSize: '1.05rem', marginTop: '4px' }}>
                  {schedule?.nextSaturdayDate || 'Saturday'}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
                <AlertTriangle size={22} />
              </div>
              <div className="stat-info">
                <h3>Pending Counselling</h3>
                <div className="stat-value">{pendingCounsellingCount}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}>
                <BookOpen size={22} />
              </div>
              <div className="stat-info">
                <h3>Recent Counselling</h3>
                <div className="stat-value">{totalCounsellingSessions}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                <AlertCircle size={22} />
              </div>
              <div className="stat-info">
                <h3>Student Arrears</h3>
                <div className="stat-value">{totalActiveArrears}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>
                <FileText size={22} />
              </div>
              <div className="stat-info">
                <h3>Student Documents</h3>
                <div className="stat-value">{totalUploadedDocuments}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                <Award size={22} />
              </div>
              <div className="stat-info">
                <h3>Monthly Improvement</h3>
                <div className="stat-value">{monthlyImprovementCount}</div>
              </div>
            </div>
          </div>

          {/* Saturday Meeting Banner Card */}
          <div
            className="card"
            style={{
              marginBottom: '1.5rem',
              background: 'linear-gradient(135deg, #0B2545 0%, #134074 100%)',
              color: '#ffffff',
              border: 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <span className="badge badge-warning" style={{ marginBottom: '6px' }}>
                  Mandatory Weekly Rhythm
                </span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '4px 0' }}>
                  Weekly Saturday Mentor–Mentee Meeting
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#E0E7FF' }}>
                  Fixed Schedule: Every <strong>Saturday at {schedule?.time || '10:30 AM'}</strong> in{' '}
                  <strong>{user?.faculty?.cabin_location || schedule?.location || 'Faculty Cabin'}</strong>.
                </p>
              </div>

              <button
                className="btn btn-gold"
                onClick={() => onSelectTab('meetings')}
              >
                <CalendarCheck2 size={16} /> Log Saturday Meeting Status
              </button>
            </div>
          </div>

          {/* Mentee List Quick View */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><Users size={18} /> My Assigned Mentees ({mentees.length})</h3>
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '2rem', padding: '0.4rem 2rem 0.4rem 2rem', fontSize: '0.825rem' }}
                  placeholder="Quick search mentee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="table-responsive desktop-only">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Mentee Name</th>
                    <th>Batch</th>
                    <th>Residential</th>
                    <th>Arrears</th>
                    <th>Meetings</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMentees.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748B' }}>
                        No students have been assigned yet.
                      </td>
                    </tr>
                  ) : (
                    filteredMentees.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 700, color: '#0B2545' }}>{m.register_number}</td>
                        <td>
                          <strong>{m.full_name}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{m.mobile_number || 'No phone'}</div>
                        </td>
                        <td>{m.batch_name}</td>
                        <td>
                          <span className="badge badge-primary">
                            {m.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${m.total_arrears > 0 ? 'badge-danger' : 'badge-success'}`}>
                            {m.total_arrears || 0}
                          </span>
                        </td>
                        <td>{m.completed_meetings_count || 0}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setStudentInitialTab('overview');
                                setSelectedStudentId(m.id);
                              }}
                            >
                              Open Record Book <ArrowRight size={13} />
                            </button>
                            <button
                              className="btn btn-pdf btn-sm"
                              title="Download PDF Dossier"
                              onClick={() => api.pdf.downloadStudentPdf(m.id, `KSRCE_Mentee_${m.register_number}_Dossier.pdf`)}
                            >
                              <FileText size={14} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-only" style={{ flexDirection: 'column', gap: '0.85rem', padding: '0.85rem' }}>
              {filteredMentees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748B' }}>
                  No students have been assigned yet.
                </div>
              ) : (
                filteredMentees.map((m) => (
                  <div
                    key={m.id}
                    className="card"
                    style={{
                      padding: '1rem',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0B2545', letterSpacing: '0.5px' }}>
                          {m.register_number}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B', marginTop: '1px' }}>
                          {m.full_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                          {m.batch_name} • {m.residential_type?.replace('_', ' ') || 'DAY SCHOLAR'}
                        </div>
                      </div>
                      <span className={`badge ${m.total_arrears > 0 ? 'badge-danger' : 'badge-success'}`}>
                        {m.total_arrears || 0} Arrears
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setStudentInitialTab('overview');
                          setSelectedStudentId(m.id);
                        }}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                      >
                        Open Record Book <ArrowRight size={14} />
                      </button>
                      <button
                        className="btn btn-pdf btn-sm"
                        onClick={() => api.pdf.downloadStudentPdf(m.id, `KSRCE_Mentee_${m.register_number}_Dossier.pdf`)}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                      >
                        <FileText size={14} /> PDF
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mentees Full Directory Tab (Section 8) */}
      {currentTab === 'mentees' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                My Assigned Mentees Directory
              </h2>
              <div style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                Showing {filteredMentees.length} of {mentees.length} assigned students
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowQuickCounsellingModal(true)}
              >
                <BookOpen size={14} /> Add Counselling
              </button>
              <button
                className="btn btn-pdf btn-sm"
                onClick={() => setShowQuickPdfModal(true)}
              >
                <Download size={14} /> Download Dossier PDF
              </button>

              {/* Download Overall Mentee Data (Excel .xlsx) Button */}
              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                <button
                  className="btn btn-sm"
                  onClick={() => handleDownloadOverallExcel()}
                  disabled={downloadExcelState === 'generating' || downloadExcelState === 'downloading'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                    backgroundColor: downloadExcelState === 'complete' ? '#059669' : '#0B2545',
                    borderColor: downloadExcelState === 'complete' ? '#059669' : '#0B2545',
                    color: '#ffffff',
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                  }}
                  title="Download Overall Mentee Data as Excel (.xlsx)"
                >
                  {downloadExcelState === 'generating' || downloadExcelState === 'downloading' ? (
                    <span className="spinner-border spinner-border-sm" style={{ width: 13, height: 13 }} />
                  ) : downloadExcelState === 'complete' ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <FileSpreadsheet size={14} />
                  )}
                  <span>{getDownloadButtonLabel()}</span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                    }}
                  >
                    .xlsx
                  </span>
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setShowExportModal(true)}
                  disabled={downloadExcelState === 'generating' || downloadExcelState === 'downloading'}
                  style={{
                    backgroundColor: '#071A30',
                    borderColor: '#0B2545',
                    color: '#ffffff',
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    paddingLeft: '6px',
                    paddingRight: '6px',
                    borderLeft: '1px solid rgba(255,255,255,0.15)',
                  }}
                  title="Download Options & Academic Year"
                >
                  ▾
                </button>
              </div>
            </div>
          </div>

          {/* Section 8 Search & Multi-criteria Filter Bar */}
          <div
            className="card"
            style={{
              padding: '1rem',
              marginBottom: '1.25rem',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '2.1rem', fontSize: '0.85rem' }}
                  placeholder="Search name, reg no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Department Filter */}
              <div>
                <select
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {uniqueDepartments.map((dept: any) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {/* Year Filter */}
              <div>
                <select
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  value={selectedYearFilter}
                  onChange={(e) => setSelectedYearFilter(e.target.value)}
                >
                  <option value="">All Years</option>
                  <option value="1">I Year</option>
                  <option value="2">II Year</option>
                  <option value="3">III Year</option>
                  <option value="4">IV Year</option>
                </select>
              </div>

              {/* Section Filter */}
              <div>
                <select
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  value={selectedSectionFilter}
                  onChange={(e) => setSelectedSectionFilter(e.target.value)}
                >
                  <option value="">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>

              {/* Arrear Filter */}
              <div>
                <select
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  value={selectedArrearFilter}
                  onChange={(e: any) => setSelectedArrearFilter(e.target.value)}
                >
                  <option value="ALL">All Arrear Statuses</option>
                  <option value="ARREARS">Active Arrears Only</option>
                  <option value="CLEAR">Clear / 0 Arrears</option>
                </select>
              </div>

              {/* Profile Completion Filter */}
              <div>
                <select
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  value={selectedCompletionFilter}
                  onChange={(e: any) => setSelectedCompletionFilter(e.target.value)}
                >
                  <option value="ALL">All Profiles</option>
                  <option value="COMPLETED">100% Completed</option>
                  <option value="INCOMPLETE">Incomplete Profile</option>
                </select>
              </div>
            </div>

            {/* Active Filters Reset Row */}
            {(searchQuery || selectedDeptFilter || selectedYearFilter || selectedSectionFilter || selectedArrearFilter !== 'ALL' || selectedCompletionFilter !== 'ALL') && (
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Showing <strong>{filteredMentees.length}</strong> matching students
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedDeptFilter('');
                    setSelectedYearFilter('');
                    setSelectedSectionFilter('');
                    setSelectedArrearFilter('ALL');
                    setSelectedCompletionFilter('ALL');
                  }}
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </div>

          {filteredMentees.length === 0 ? (
            <EmptyState
              icon={<Users size={32} />}
              title={searchQuery || selectedDeptFilter || selectedYearFilter || selectedSectionFilter ? "No Mentees Match Filter" : "No Mentees Assigned Yet"}
              description={searchQuery || selectedDeptFilter || selectedYearFilter || selectedSectionFilter ? "Try adjusting your search query or filters above to find students." : "When the administrator or HOD allocates mentees to your profile, their student cards and academic dossiers will appear here."}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
              {filteredMentees.map((m) => {
              const studentInitials = m.full_name
                ? m.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                : 'ST';
              const completion = m.profile_completion_percentage ?? (m.profile_completed ? 100 : 40);
              const arrears = m.total_arrears ?? 0;
              const cgpaVal = m.cgpa ? Number(m.cgpa).toFixed(2) : (m.latest_cgpa ? Number(m.latest_cgpa).toFixed(2) : 'N/A');
              const studentYear = m.year ? `${m.year === 1 ? 'I' : m.year === 2 ? 'II' : m.year === 3 ? 'III' : 'IV'} Year` : 'II Year';
              const studentSec = m.section || 'A';

              return (
                <div
                  key={m.id || m._id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '1.25rem',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 8px rgba(11, 37, 69, 0.04)',
                    position: 'relative',
                  }}
                >
                  {/* Top Header: Photo/Avatar + Identity */}
                  <div>
                    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                      <div
                        style={{
                          width: '50px',
                          height: '50px',
                          minWidth: '50px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #0B2545 0%, #134074 100%)',
                          color: '#C59B27',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1.15rem',
                          border: '2px solid #C59B27',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                          overflow: 'hidden',
                        }}
                      >
                        {m.avatar_url ? (
                          <img
                            src={m.avatar_url}
                            alt={m.full_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          studentInitials
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            color: '#0B2545',
                            margin: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={m.full_name}
                        >
                          {m.full_name}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: '#B45309',
                              backgroundColor: '#FEF3C7',
                              padding: '1px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {m.register_number}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '5px', flexWrap: 'wrap' }}>
                          <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            {m.department_code || m.department_name || 'IT'}
                          </span>
                          <span className="badge badge-secondary" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            {studentYear}
                          </span>
                          <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            Sec {studentSec}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Section 8 Required Indicators Grid (CGPA, Active Arrears, Counselling Sessions, Document Count) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.5rem',
                        padding: '0.65rem',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '8px',
                        marginBottom: '0.85rem',
                        border: '1px solid #EDF2F7',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                          Current CGPA
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0B2545', marginTop: '2px' }}>
                          {cgpaVal}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                          Active Arrears
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <span
                            className={`badge ${arrears > 0 ? 'badge-danger' : 'badge-success'}`}
                            style={{ fontWeight: 700, fontSize: '0.75rem', padding: '2px 6px' }}
                          >
                            {arrears > 0 ? `${arrears} Active` : '0 (Clear)'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                          Counselling
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                          {m.counselling_count || 0} Sessions
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                          Documents
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                          {m.document_count || 0} Uploaded
                        </div>
                      </div>
                    </div>

                    {/* Profile Completion Progress */}
                    <div style={{ marginBottom: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>
                        <span>Profile Completion</span>
                        <span style={{ color: completion >= 100 ? '#059669' : '#D97706' }}>{completion}%</span>
                      </div>
                      <div style={{ width: '100%', height: '5px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, completion)}%`,
                            height: '100%',
                            backgroundColor: completion >= 100 ? '#059669' : '#C59B27',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 8 Actions Footer (4 Required Buttons) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.5rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.78rem', padding: '0.45rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      onClick={() => {
                        setStudentInitialTab('overview');
                        setSelectedStudentId(m.id || m._id);
                      }}
                    >
                      View Details
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.78rem', padding: '0.45rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      onClick={() => {
                        setStudentInitialTab('counselling');
                        setSelectedStudentId(m.id || m._id);
                      }}
                    >
                      <BookOpen size={13} /> Counselling
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.78rem', padding: '0.45rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      onClick={() => {
                        setStudentInitialTab('documents');
                        setSelectedStudentId(m.id || m._id);
                      }}
                    >
                      <FileCheck size={13} /> Documents
                    </button>
                    <button
                      className="btn btn-pdf btn-sm"
                      style={{ fontSize: '0.78rem', padding: '0.45rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      title="Download Student Dossier PDF"
                      onClick={() => api.pdf.downloadStudentPdf(m.id || m._id, `KSRCE_Mentee_${m.register_number}_Dossier.pdf`)}
                    >
                      <Download size={13} /> Download PDF
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* Saturday Meetings Tab */}
      {currentTab === 'meetings' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                Saturday Mentor–Mentee Meetings Log
              </h2>
              <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Next Meeting: {schedule?.nextSaturdayDate} • {schedule?.time}
              </div>
            </div>
          </div>

          {meetings.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3.5rem 1.5rem',
                backgroundColor: '#F8FAFC',
                border: '2px dashed #CBD5E1',
              }}
            >
              <CalendarCheck2 size={48} style={{ color: '#94A3B8', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.25rem' }}>
                No meeting records available.
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                Saturday mentor-mentee interaction logs will appear here once logged.
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Meeting Date</th>
                      <th>Mentee Name & Reg No</th>
                      <th>Venue & Time</th>
                      <th>Attendance</th>
                      <th>Challenges Discussed</th>
                      <th>Corrective Action Taken</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.map((meet) => (
                      <tr key={meet.id}>
                        <td style={{ fontWeight: 700 }}>{meet.meeting_date}</td>
                        <td>
                          <strong>{meet.student_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{meet.register_number}</div>
                        </td>
                        <td>
                          {meet.meeting_time}
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{meet.location}</div>
                        </td>
                        <td>
                          <span className={`badge ${meet.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                            {meet.attendance_status}
                          </span>
                        </td>
                        <td>{meet.challenges_discussed || '-'}</td>
                        <td>{meet.corrective_action || '-'}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setStudentInitialTab('meeting');
                              setSelectedStudentId(meet.student_id);
                            }}
                          >
                            View Student
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5-Domain Counselling Tab */}
      {currentTab === 'counselling' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              5-Domain Counselling & Specialized Interventions
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
              Select any mentee from your roster to record interventions across Academic, Training & Placement, Extra-Curricular, Innovation, and Skill Development.
            </p>
          </div>

          {mentees.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3.5rem 1.5rem',
                backgroundColor: '#F8FAFC',
                border: '2px dashed #CBD5E1',
              }}
            >
              <BookOpen size={48} style={{ color: '#94A3B8', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.25rem' }}>
                No counselling records available.
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                Counselling records will be listed once students are assigned and sessions are conducted.
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Register Number</th>
                      <th>Mentee Name</th>
                      <th>Batch</th>
                      <th>Total Counselling Sessions</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mentees.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 700 }}>{m.register_number}</td>
                        <td><strong>{m.full_name}</strong></td>
                        <td>{m.batch_name}</td>
                        <td>
                          <span className="badge badge-info">{m.counselling_count || 0} Sessions</span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setStudentInitialTab('counselling');
                              setSelectedStudentId(m.id);
                            }}
                          >
                            Open Counselling Desk
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Progress Tab */}
      {currentTab === 'progress' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              Monthly Mentoring Improvement Progress
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
              Continuous evaluation across End of Month 1, Month 2, Month 3, and End of Semester milestones.
            </p>
          </div>

          {mentees.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3.5rem 1.5rem',
                backgroundColor: '#F8FAFC',
                border: '2px dashed #CBD5E1',
              }}
            >
              <Award size={48} style={{ color: '#94A3B8', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.25rem' }}>
                No progress records available.
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                Monthly progress ratings and evaluations will appear here once recorded.
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Register Number</th>
                      <th>Mentee Name</th>
                      <th>Batch</th>
                      <th>Academic Standing</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mentees.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 700 }}>{m.register_number}</td>
                        <td><strong>{m.full_name}</strong></td>
                        <td>{m.batch_name}</td>
                        <td>
                          <span className={`badge ${m.total_arrears > 0 ? 'badge-danger' : 'badge-success'}`}>
                            {m.total_arrears || 0} Arrears
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setStudentInitialTab('progress');
                              setSelectedStudentId(m.id);
                            }}
                          >
                            Record / View Monthly Progress
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student Documents Tab (Section 14 & Quick Action) */}
      {currentTab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                Mentee Documents & Institutional Portfolios
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                View uploaded certificates, Student Details Form PDFs, and document archives for all assigned mentees.
              </p>
            </div>
            <button
              className="btn btn-pdf btn-sm"
              onClick={() => setShowQuickPdfModal(true)}
            >
              <Download size={14} /> Download Student PDF
            </button>
          </div>

          {mentees.length === 0 ? (
            <EmptyState
              icon={<FileCheck size={40} />}
              title="No Student Documents"
              description="Uploaded certificates and system-generated student form PDFs will appear here once mentees are assigned."
            />
          ) : (
            <div className="card">
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Register No</th>
                      <th>Student Name</th>
                      <th>Department & Year</th>
                      <th>Uploaded Files</th>
                      <th>Profile PDF Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mentees.map((m) => (
                      <tr key={m.id || m._id}>
                        <td style={{ fontWeight: 700, color: '#0B2545' }}>{m.register_number}</td>
                        <td>
                          <strong>{m.full_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{m.email}</div>
                        </td>
                        <td>
                          {m.department_code || m.department_name} • {m.year || 2} Year
                        </td>
                        <td>
                          <span className="badge badge-info" style={{ fontWeight: 700 }}>
                            {m.document_count || 0} Documents
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-success" style={{ fontWeight: 600 }}>
                            Auto-Attached
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setStudentInitialTab('documents');
                                setSelectedStudentId(m.id || m._id);
                              }}
                            >
                              <FileCheck size={13} /> View Documents
                            </button>
                            <button
                              className="btn btn-pdf btn-sm"
                              onClick={() => api.pdf.downloadStudentPdf(m.id || m._id, `KSRCE_Mentee_${m.register_number}_Dossier.pdf`)}
                            >
                              <Download size={13} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Assistant Tab (Section 13) */}
      {currentTab === 'ai-advisor' && (
        <div>
          <div
            className="card"
            style={{
              padding: '2rem',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #0B2545 0%, #134074 100%)',
              color: '#ffffff',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(197, 155, 39, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#C59B27',
                }}
              >
                <Sparkles size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Faculty Mentorship AI Advisory Assistant
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#CBD5E1' }}>
                  Institutional Guidance • Communication Coaching • Arrear Remediation Strategies
                </div>
              </div>
            </div>

            <p style={{ color: '#E2E8F0', fontSize: '0.925rem', maxWidth: '720px', lineHeight: 1.6 }}>
              A specialized consultative assistant for mentors. Formulate discussion agendas, design remedial action plans, and prepare personalized intervention strategies for your mentees.
            </p>

            <div style={{ marginTop: '1.25rem' }}>
              <button
                className="btn btn-gold"
                style={{ padding: '0.75rem 1.5rem', fontWeight: 700, fontSize: '0.95rem' }}
                onClick={() => setIsAiBotOpen(true)}
              >
                <Sparkles size={16} /> Open Interactive AI Advisor Chat
              </button>
            </div>
          </div>

          {/* Sample Prompts Grid */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0B2545', marginBottom: '1rem' }}>
              Frequently Asked Guidance Prompts
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {[
                "How can I improve a student's communication skills?",
                "What activities can help improve presentation skills?",
                "How should I guide a student with repeated arrears?",
                "Give me counselling discussion points for poor attendance.",
                "Suggest questions to ask during a mentor meeting.",
                "How to motivate a student with semester 1 and 2 standing arrears?",
              ].map((prompt, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.875rem',
                    color: '#334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => setIsAiBotOpen(true)}
                >
                  <span>"{prompt}"</span>
                  <ArrowRight size={14} style={{ color: '#0B2545', flexShrink: 0, marginLeft: '0.5rem' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Separate AI Advisory Assistant Modal (Section 13) */}
      <MentorAiBotModal isOpen={isAiBotOpen} onClose={() => setIsAiBotOpen(false)} />

      {/* Quick PDF Download Modal */}
      <Modal
        isOpen={showQuickPdfModal}
        onClose={() => setShowQuickPdfModal(false)}
        title="Download Student Dossier PDF"
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1rem' }}>
            Select any assigned mentee to download their complete institutional dossier PDF including profile, academic history, arrears, and counselling records.
          </p>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ fontWeight: 700 }}>Select Mentee *</label>
            <select
              className="form-control"
              value={quickPdfStudentId}
              onChange={(e) => setQuickPdfStudentId(e.target.value)}
            >
              <option value="">-- Choose an assigned mentee --</option>
              {mentees.map((m) => (
                <option key={m.id || m._id} value={m.id || m._id}>
                  {m.register_number} — {m.full_name} ({m.department_code || 'IT'} {m.batch_name || ''})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowQuickPdfModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-pdf"
              disabled={!quickPdfStudentId}
              onClick={() => {
                const target = mentees.find((m) => (m.id || m._id) === quickPdfStudentId);
                const regNo = target?.register_number || 'Mentee';
                api.pdf.downloadStudentPdf(quickPdfStudentId, `KSRCE_Mentee_${regNo}_Dossier.pdf`);
                setShowQuickPdfModal(false);
              }}
            >
              <Download size={15} /> Download Complete Dossier PDF
            </button>
          </div>
        </div>
      </Modal>

      {/* Quick Add Counselling Modal */}
      <Modal
        isOpen={showQuickCounsellingModal}
        onClose={() => setShowQuickCounsellingModal(false)}
        title="Add Mentee Counselling Session"
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1rem' }}>
            Select an assigned mentee to open their counselling record book and add an intervention record with multi-category classification and grammar assistance.
          </p>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ fontWeight: 700 }}>Select Mentee *</label>
            <select
              className="form-control"
              value={quickCounsellingStudentId}
              onChange={(e) => setQuickCounsellingStudentId(e.target.value)}
            >
              <option value="">-- Choose an assigned mentee --</option>
              {mentees.map((m) => (
                <option key={m.id || m._id} value={m.id || m._id}>
                  {m.register_number} — {m.full_name} ({m.counselling_count || 0} Sessions)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowQuickCounsellingModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!quickCounsellingStudentId}
              onClick={() => {
                const id = quickCounsellingStudentId;
                setShowQuickCounsellingModal(false);
                setStudentInitialTab('counselling');
                setSelectedStudentId(id);
              }}
            >
              <BookOpen size={15} /> Open Counselling Desk
            </button>
          </div>
        </div>
      </Modal>

      {/* Download Overall Mentee Data (Excel .xlsx) Modal (Requirements 1, 8, 9, 10, 13, 14) */}
      {showExportModal && (
        <Modal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Download Overall Mentee Data (Excel .xlsx)"
          maxWidth="560px"
        >
          <div style={{ padding: '0.5rem 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                padding: '1rem',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
                marginBottom: '1.25rem',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileSpreadsheet size={22} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#065F46' }}>
                  K.S.R. College of Engineering — Domain-Wise Mentee Ledger
                </h4>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#047857', lineHeight: 1.4 }}>
                  Generates an institutional spreadsheet (.xlsx) for all <strong>{mentees.length}</strong> assigned mentees formatted to exact reference specifications.
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#1E293B',
                  marginBottom: '0.4rem',
                }}
              >
                Academic Year (Optional)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 2025-2026 (Leave empty for automatic current year)"
                value={exportAcademicYear}
                onChange={(e) => setExportAcademicYear(e.target.value)}
                style={{ fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                Default automatically detects the current autonomous collegiate academic cycle.
              </span>
            </div>

            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                fontSize: '0.8rem',
                color: '#475569',
              }}
            >
              <div style={{ fontWeight: 600, color: '#0B2545', marginBottom: '6px' }}>
                16 Institutional Columns Included:
              </div>
              <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.5 }}>
                <li>S.NO &bull; MENTOR NAME &bull; S.NO &bull; REG NUMBER &bull; STUDENT NAME &bull; CLASS & SECTION</li>
                <li>NPTEL COMPLETED &bull; GLOBAL CERTIFICATION &bull; ALL CLEAR (Live Arrear Status)</li>
                <li>FINAL YEAR PLACED &bull; HACKATHON &bull; SYMPOSIUM &bull; OTHER STATE PROGRAMS</li>
                <li>EXTENSION ACTIVITIES &bull; EXTRA CURRICULAR &bull; AWARDS</li>
              </ol>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowExportModal(false)}
                disabled={downloadExcelState === 'generating' || downloadExcelState === 'downloading'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleDownloadOverallExcel()}
                disabled={downloadExcelState === 'generating' || downloadExcelState === 'downloading'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  backgroundColor: downloadExcelState === 'complete' ? '#059669' : '#0B2545',
                  borderColor: downloadExcelState === 'complete' ? '#059669' : '#0B2545',
                  fontWeight: 600,
                }}
              >
                {downloadExcelState === 'generating' || downloadExcelState === 'downloading' ? (
                  <>
                    <span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }} />
                    <span>{getDownloadButtonLabel()}</span>
                  </>
                ) : downloadExcelState === 'complete' ? (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Download Complete</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>Download Excel (.xlsx)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};
