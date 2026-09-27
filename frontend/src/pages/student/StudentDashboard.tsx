import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StudentDocumentsManager } from '../../components/documents/StudentDocumentsManager';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';
import {
  StudentProfileSkeleton,
  CounsellingSkeleton,
  AcademicSkeleton,
  DocumentsSkeleton,
} from '../../components/common/SkeletonLoader';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import { Modal } from '../../components/common/Modal';
import {
  GraduationCap,
  CalendarCheck2,
  FileText,
  User,
  Phone,
  Mail,
  Home,
  Clock,
  BookOpen,
  Award,
  CheckCircle2,
  Lock,
  Save,
} from 'lucide-react';

interface StudentDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  justCompleted?: boolean;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ currentTab, onSelectTab, justCompleted }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState<boolean>(!!justCompleted);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Arrear Clearance State & Validation
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

  // Profile Edit State
  const [editForm, setEditForm] = useState({
    mobileNumber: '',
    email: '',
    dob: '',
    bloodGroup: '',
    residentialType: '',
    address: '',
    fatherName: '',
    fatherContact: '',
    fatherOccupation: '',
    motherName: '',
    motherContact: '',
    motherOccupation: '',
  });

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (user?.studentId || user?.username) {
        const studentIdentifier = user.studentId || user.username;
        const [stuRes, schedRes] = await Promise.all([
          api.students.getById(studentIdentifier),
          api.meetings.getSchedule(),
        ]);
        if (stuRes.success && stuRes.data) {
          setProfile(stuRes.data);
          setEditForm({
            mobileNumber: stuRes.data.mobile_number || '',
            email: stuRes.data.email || '',
            dob: stuRes.data.dob || '',
            bloodGroup: stuRes.data.blood_group || 'B+ve',
            residentialType: stuRes.data.residential_type || 'DAY_SCHOLAR',
            address: stuRes.data.address || '',
            fatherName: stuRes.data.parent?.father_name || '',
            fatherContact: stuRes.data.parent?.father_contact || '',
            fatherOccupation: stuRes.data.parent?.father_occupation || '',
            motherName: stuRes.data.parent?.mother_name || '',
            motherContact: stuRes.data.parent?.mother_contact || '',
            motherOccupation: stuRes.data.parent?.mother_occupation || '',
          });
        }
        if (schedRes.success) setSchedule(schedRes.data);
      }
    } catch (err: any) {
      console.error('Failed to load student data:', err);
      setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleDownloadPdf = async () => {
    if (!profile) return;
    setPdfDownloading(true);
    try {
      await api.pdf.downloadStudentPdf(
        profile.id,
        `KSRCE_RecordBook_${profile.register_number}.pdf`
      );
    } catch (err: any) {
      toast.error('Error downloading PDF: ' + err.message);
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleClearArrearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClearArrearError(null);

    if (!profile) return;
    const cleanSubject = clearArrearForm.subjectCode.trim().toUpperCase();
    if (!cleanSubject) {
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
      const res = await api.students.clearArrear(profile.id, {
        subjectCode: cleanSubject,
        originalSemester: origSem,
        clearedInSemester: semCleared,
        clearedDate: clearArrearForm.clearedDate,
        remarks: clearArrearForm.remarks.trim(),
        attempt: clearArrearForm.attempt || 1,
      });

      if (res.success) {
        setShowClearArrearModal(false);
        await loadData();
      } else {
        setClearArrearError(res.message || 'Failed to record clearance.');
      }
    } catch (err: any) {
      setClearArrearError(err.message || 'Error recording clearance.');
    } finally {
      setClearingArrear(false);
    }
  };

  if (loading) {
    if (currentTab === 'counselling') return <CounsellingSkeleton />;
    if (currentTab === 'academics') return <AcademicSkeleton />;
    if (currentTab === 'documents') return <DocumentsSkeleton />;
    return <StudentProfileSkeleton />;
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

  if (!profile) {
    return (
      <EmptyState
        title="Unable to Load Student Profile"
        description="We couldn't retrieve your student records from the institutional database. Please click below to reload."
        action={
          <button className="btn btn-primary" onClick={loadData}>
            Reload Profile
          </button>
        }
      />
    );
  }

  const activeArrears = profile?.active_arrears_count !== undefined 
    ? Number(profile.active_arrears_count) 
    : (profile?.total_arrears || 0);
  const historicalArrears = Number(profile?.historical_arrears_count || profile?.semesters?.reduce((a: any, c: any) => a + (Number(c.arrears_count) || 0), 0) || 0);
  const clearedArrears = Number(profile?.cleared_arrears_count || 0);
  const arrearStatusLabel = profile?.arrear_status_label || (activeArrears === 0 ? '🟢 No Active Arrears' : `🔴 ${activeArrears} Active Arrear${activeArrears > 1 ? 's' : ''}`);
  const latestCgpa = Number(profile?.semesters?.filter((s: any) => Number(s.cgpa) > 0).slice(-1)[0]?.cgpa || 0);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    setSaveSuccessMsg(null);
    try {
      const res = await api.students.update(profile.id, {
        mobileNumber: editForm.mobileNumber,
        email: editForm.email,
        dob: editForm.dob,
        bloodGroup: editForm.bloodGroup,
        residentialType: editForm.residentialType,
        address: editForm.address,
        fatherName: editForm.fatherName,
        fatherContact: editForm.fatherContact,
        fatherOccupation: editForm.fatherOccupation,
        motherName: editForm.motherName,
        motherContact: editForm.motherContact,
        motherOccupation: editForm.motherOccupation,
      });
      if (res.success) {
        setSaveSuccessMsg('Your profile changes have been saved successfully.');
        loadData();
      } else {
        toast.error(res.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div>
      {/* Profile Completion Success Alert Banner */}
      {showSuccessBanner && (
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
            <CheckCircle2 size={24} color="#059669" />
            <div>
              <strong style={{ fontSize: '1rem' }}>Your profile has been successfully completed.</strong>
              <div style={{ fontSize: '0.85rem', color: '#047857', marginTop: '2px' }}>
                All personal, family, and academic details have been permanently recorded in the institutional database.
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowSuccessBanner(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1.25rem',
              color: '#065F46',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Overview Tab */}
      {currentTab === 'overview' && (
        <div>
          {/* Welcome Banner */}
          <div
            className="card"
            style={{
              marginBottom: '1.5rem',
              background: 'linear-gradient(135deg, #0B2545 0%, #13315C 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <span className="badge badge-warning" style={{ marginBottom: '8px' }}>
                  Permanent Institutional Record
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '4px 0' }}>
                  Welcome, {profile?.full_name}
                </h2>
                <div style={{ fontSize: '0.875rem', color: '#CBD5E1', display: 'flex', gap: '0.75rem' }}>
                  <span>Register No: <strong>{profile?.register_number}</strong></span>
                  <span>•</span>
                  <span>{profile?.department_name}</span>
                  <span>•</span>
                  <span>Batch {profile?.batch_name}</span>
                </div>
              </div>

              {/* Prominent PDF Download */}
              <button
                className="btn btn-pdf"
                onClick={handleDownloadPdf}
                disabled={pdfDownloading}
                style={{ padding: '0.65rem 1.5rem', fontSize: '0.9rem' }}
              >
                <FileText size={18} />
                {pdfDownloading ? 'Generating...' : 'DOWNLOAD MY RECORD BOOK (PDF)'}
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EEF2F6', color: '#0B2545' }}>
                <GraduationCap size={24} />
              </div>
              <div className="stat-info">
                <h3>Cumulative CGPA</h3>
                <div className="stat-value">{latestCgpa > 0 ? latestCgpa.toFixed(2) : 'N/A'}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: activeArrears > 0 ? '#FEF2F2' : '#ECFDF5', color: activeArrears > 0 ? '#DC2626' : '#059669' }}>
                <Clock size={24} />
              </div>
              <div className="stat-info">
                <h3>Current Active Arrears</h3>
                <div className="stat-value" style={{ color: activeArrears > 0 ? '#DC2626' : '#059669' }}>
                  {activeArrears}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                  {activeArrears === 0 ? '🟢 No Active Arrears' : '🔴 Uncleared Subjects'}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#F1F5F9', color: '#334155' }}>
                <BookOpen size={24} />
              </div>
              <div className="stat-info">
                <h3>Total Arrear History</h3>
                <div className="stat-value" style={{ color: '#1E293B' }}>
                  {historicalArrears}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                  Preserved Records
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                <CheckCircle2 size={24} />
              </div>
              <div className="stat-info">
                <h3>Cleared Arrears</h3>
                <div className="stat-value" style={{ color: '#059669' }}>
                  {clearedArrears}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                  Successfully Cleared
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                <CheckCircle2 size={24} />
              </div>
              <div className="stat-info">
                <h3>Profile Completion</h3>
                <div className="stat-value" style={{ color: profile?.profileCompleted ? '#059669' : '#D97706' }}>
                  {profile?.profileCompleted ? '100%' : 'Incomplete'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Saturday Meeting Notice Card */}
            <div className="card" style={{ borderLeft: '4px solid #C59B27' }}>
              <div className="card-header">
                <h3 className="card-title"><CalendarCheck2 size={18} /> Upcoming Saturday Meeting</h3>
                <span className="badge badge-warning">Fixed Saturday</span>
              </div>
              <div style={{ padding: '0.5rem 0' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545', marginBottom: '4px' }}>
                  Every Saturday at {schedule?.time || '10:30 AM'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.75rem' }}>
                  Location: <strong>{profile?.currentMentor?.cabin_location || schedule?.location || 'Faculty Cabin'}</strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', backgroundColor: '#F8FAFC', padding: '0.6rem 0.8rem', borderRadius: '8px' }}>
                  Next Scheduled Date: <strong>{schedule?.nextSaturdayDate}</strong>. Attendance is mandatory as per college mentoring regulations.
                </div>
              </div>
            </div>

            {/* Assigned Mentor Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><User size={18} /> Assigned Faculty Mentor</h3>
                <span className="badge badge-success">Active Mentor</span>
              </div>
              {profile?.currentMentor ? (
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545' }}>
                    {profile.currentMentor.mentor_name}
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    {profile.currentMentor.designation} • Cabin: {profile.currentMentor.cabin_location}
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                    <div><Phone size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> {profile.currentMentor.phone_number || 'N/A'}</div>
                    <div><Mail size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> {profile.currentMentor.mentor_email || 'N/A'}</div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Mentor allocation in progress.</div>
              )}
            </div>
          </div>

          {/* Recent Meetings */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><CalendarCheck2 size={18} /> Recent Saturday Mentoring Log</h3>
            </div>
            {profile?.meetings && profile.meetings.length > 0 ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Saturday Date</th>
                      <th>Time & Venue</th>
                      <th>Attendance</th>
                      <th>Challenges Discussed</th>
                      <th>Corrective Action Taken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.meetings.map((m: any) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 700 }}>{m.meeting_date}</td>
                        <td>{m.meeting_time} ({m.location})</td>
                        <td>
                          <span className={`badge ${m.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                            {m.attendance_status}
                          </span>
                        </td>
                        <td>{m.challenges_discussed}</td>
                        <td>{m.corrective_action}</td>
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

      {/* My Profile Tab */}
      {currentTab === 'profile' && (
        <div style={{ maxWidth: '900px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                My Student Profile
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                View and update your contact, demographic, and parental information.
              </p>
            </div>
            <button className="btn btn-pdf btn-sm" onClick={handleDownloadPdf}>
              <FileText size={16} /> Download Student Record PDF
            </button>
          </div>

          {saveSuccessMsg && (
            <div
              style={{
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '8px',
                padding: '0.85rem 1.25rem',
                marginBottom: '1.25rem',
                color: '#065F46',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.9rem',
              }}
            >
              <CheckCircle2 size={18} color="#059669" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Section 1: Immutable Identity Information */}
          <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div className="card-header" style={{ borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={16} color="#64748B" />
                <h3 className="card-title" style={{ fontSize: '1rem', color: '#1E293B' }}>
                  Institutional Identity (Read-Only)
                </h3>
              </div>
              <span className="badge badge-secondary">Locked by Administration</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1rem 0' }}>
              Core academic identity fields are strictly managed by college administration to maintain data integrity.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Full Name</label>
                <input type="text" className="form-control" value={profile?.full_name || ''} disabled style={{ backgroundColor: '#EDF2F7', cursor: 'not-allowed' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Register Number</label>
                <input type="text" className="form-control" value={profile?.register_number || ''} disabled style={{ backgroundColor: '#EDF2F7', cursor: 'not-allowed' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Student ID</label>
                <input type="text" className="form-control" value={profile?.id || ''} disabled style={{ backgroundColor: '#EDF2F7', cursor: 'not-allowed' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Department</label>
                <input type="text" className="form-control" value={profile?.department_name || ''} disabled style={{ backgroundColor: '#EDF2F7', cursor: 'not-allowed' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Batch</label>
                <input type="text" className="form-control" value={profile?.batch_name || ''} disabled style={{ backgroundColor: '#EDF2F7', cursor: 'not-allowed' }} />
              </div>
            </div>
          </div>

          {/* Form for Permitted Edits */}
          <form onSubmit={handleSaveProfile}>
            {/* Permitted Personal Details */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <h3 className="card-title" style={{ fontSize: '1rem' }}>
                  <User size={16} /> Personal Information
                </h3>
                <span className="badge badge-primary">Editable</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Mobile Number *</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={editForm.mobileNumber}
                    onChange={(e) => setEditForm({ ...editForm, mobileNumber: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Email ID *</label>
                  <input
                    type="email"
                    className="form-control"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editForm.dob}
                    onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Blood Group</label>
                  <select
                    className="form-control"
                    value={editForm.bloodGroup}
                    onChange={(e) => setEditForm({ ...editForm, bloodGroup: e.target.value })}
                  >
                    <option value="A+ve">A+ve</option>
                    <option value="A-ve">A-ve</option>
                    <option value="B+ve">B+ve</option>
                    <option value="B-ve">B-ve</option>
                    <option value="O+ve">O+ve</option>
                    <option value="O-ve">O-ve</option>
                    <option value="AB+ve">AB+ve</option>
                    <option value="AB-ve">AB-ve</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Residential Type</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="residentialType"
                        value="DAY_SCHOLAR"
                        checked={editForm.residentialType === 'DAY_SCHOLAR'}
                        onChange={(e) => setEditForm({ ...editForm, residentialType: e.target.value })}
                      />
                      Day Scholar
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="residentialType"
                        value="HOSTELLER"
                        checked={editForm.residentialType === 'HOSTELLER'}
                        onChange={(e) => setEditForm({ ...editForm, residentialType: e.target.value })}
                      />
                      Hosteller
                    </label>
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Permanent Address</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Permitted Family Details */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <h3 className="card-title" style={{ fontSize: '1rem' }}>
                  <Home size={16} /> Family Information
                </h3>
                <span className="badge badge-primary">Editable</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Father's Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.fatherName}
                    onChange={(e) => setEditForm({ ...editForm, fatherName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Father Contact No</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={editForm.fatherContact}
                    onChange={(e) => setEditForm({ ...editForm, fatherContact: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Father Occupation</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.fatherOccupation}
                    onChange={(e) => setEditForm({ ...editForm, fatherOccupation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Mother's Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.motherName}
                    onChange={(e) => setEditForm({ ...editForm, motherName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Mother Contact No</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={editForm.motherContact}
                    onChange={(e) => setEditForm({ ...editForm, motherContact: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Mother Occupation</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.motherOccupation}
                    onChange={(e) => setEditForm({ ...editForm, motherOccupation: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingProfile}
                style={{ padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Save size={18} />
                {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Academic Ledger Tab */}
      {currentTab === 'academics' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Permanent Academic Ledger (Semesters 1 to 8)
            </h2>
            <button className="btn btn-pdf btn-sm" onClick={handleDownloadPdf}>
              <FileText size={16} /> Download Academic Transcript PDF
            </button>
          </div>

          {/* Schooling */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">Admission & School Marks</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>10th Mark & School</th>
                    <th>12th Mark & School</th>
                    <th>TNEA Cut-off</th>
                    <th>Mode</th>
                    <th>Scholarship</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div><strong>{profile?.school?.tenth_mark ? `${profile.school.tenth_mark}/500` : 'N/A'}</strong></div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {profile?.school?.tenth_school || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <div><strong>{profile?.school?.twelfth_mark ? `${profile.school.twelfth_mark}/600` : 'N/A'}</strong></div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {profile?.school?.twelfth_school || 'N/A'}
                      </div>
                    </td>
                    <td><strong>{profile?.school?.cutoff_mark || 'N/A'}</strong> / 200</td>
                    <td><span className="badge badge-primary">{profile?.school?.admission_type || 'COUNSELLING'}</span></td>
                    <td>{profile?.school?.scholarship_details || 'Nil'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Semesters 1-8 */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <h3 className="card-title">Semesters 1 through 8 Grades</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge ${activeArrears === 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
                  {arrearStatusLabel}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  (Historical: {historicalArrears} • Cleared: {clearedArrears})
                </span>
              </div>
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
                    const s = profile?.semesters?.find((x: any) => x.semester_number === sem);
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
                        <td>{s && Number(s.cgpa) > 0 ? <strong>{Number(s.cgpa).toFixed(2)}</strong> : '-'}</td>
                        <td>{s && Number(s.sgpa) > 0 ? Number(s.sgpa).toFixed(2) : '-'}</td>
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
                  Current Active: {activeArrears} • Total History: {historicalArrears} • Cleared: {clearedArrears}
                </span>
              </div>
              {activeArrears > 0 && (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const firstActive = profile?.active_arrear_subjects?.[0] || '';
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
            {(!profile?.arrear_history || profile.arrear_history.length === 0) ? (
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
                    {profile.arrear_history.map((h: any, idx: number) => {
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

      {/* Saturday Meetings Tab */}
      {currentTab === 'meetings' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              My Saturday Mentor–Mentee Meeting Records
            </h2>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time & Venue</th>
                    <th>Attendance</th>
                    <th>Challenges Discussed</th>
                    <th>Corrective Action Taken</th>
                    <th>Mentor Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {profile?.meetings?.map((m: any) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 700 }}>{m.meeting_date}</td>
                      <td>{m.meeting_time} ({m.location})</td>
                      <td>
                        <span className={`badge ${m.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                          {m.attendance_status}
                        </span>
                      </td>
                      <td>{m.challenges_discussed || '-'}</td>
                      <td>{m.corrective_action || '-'}</td>
                      <td>{m.mentor_remarks || 'Satisfactory'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mentoring & Counselling History Tab */}
      {currentTab === 'mentoring-history' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              5-Domain Counselling & Mentoring History
            </h2>
          </div>

          {/* Counselling Table */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title"><BookOpen size={18} /> Counselling Sessions Recorded</h3>
            </div>
            {profile?.counsellingRecords && profile.counsellingRecords.length > 0 ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category Domain</th>
                      <th>Challenge Observed</th>
                      <th>Corrective Action</th>
                      <th>Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.counsellingRecords.map((c: any) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.session_date}</td>
                        <td><span className="badge badge-info">{c.category}</span></td>
                        <td>{c.challenge_observed}</td>
                        <td>{c.corrective_action}</td>
                        <td>{c.student_feedback || 'Acknowledged'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748B', fontSize: '0.85rem' }}>
                No counselling records available.
              </div>
            )}
          </div>

          {/* Mentor Lineage */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Mentor Assignment Lineage</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mentor Name</th>
                    <th>Tenure</th>
                    <th>Status</th>
                    <th>Reason / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {profile?.mentorHistory?.map((h: any) => (
                    <tr key={h.assignment_id}>
                      <td style={{ fontWeight: 600 }}>{h.mentor_name}</td>
                      <td>{h.assigned_from} to {h.assigned_until || 'Present'}</td>
                      <td>
                        <span className={`badge ${h.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}>
                          {h.status}
                        </span>
                      </td>
                      <td>{h.change_reason || 'Initial Allocation'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Documents / Certificates Tab */}
      {currentTab === 'documents' && profile && (
        <div>
          <StudentDocumentsManager
            studentId={profile.id || profile._id}
            readOnly={false}
            canVerify={false}
          />
        </div>
      )}

      {/* PDF Tab */}
      {currentTab === 'pdf' && (
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
              Download your complete verified academic dossier containing demographics, parents information, schooling, semesters 1 to 8 CGPA/arrears, mentor assignment lineage, and all Saturday meeting & counselling logs.
            </p>
            <button
              className="btn btn-pdf"
              style={{ padding: '0.85rem 2.25rem', fontSize: '1rem' }}
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
            >
              <FileText size={20} />
              {pdfDownloading ? 'Generating PDF Dossier...' : 'DOWNLOAD OFFICIAL PDF'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Record Arrear Clearance with Validation */}
      <Modal
        isOpen={showClearArrearModal}
        onClose={() => setShowClearArrearModal(false)}
        title="Record Arrear Clearance"
        maxWidth="560px"
      >
        <form onSubmit={handleClearArrearSubmit}>
          <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.85rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', color: '#166534' }}>
            <strong>Academic History Integrity:</strong><br />
            Original semester records are permanently preserved. Clearing an arrear updates the latest status to CLEARED, sets the current semester arrears to 0, and records clearance details.
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
            {profile?.active_arrear_subjects && profile.active_arrear_subjects.length > 0 && (
              <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#64748B' }}>
                Active uncleared subjects detected:{' '}
                {profile.active_arrear_subjects.map((sub: string) => (
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
            <label className="form-label">Clearance Remarks *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. 24ITT36 Cleared in Semester 04"
              value={clearArrearForm.remarks}
              onChange={(e) => setClearArrearForm({ ...clearArrearForm, remarks: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowClearArrearModal(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={clearingArrear}
              style={{ backgroundColor: '#059669', borderColor: '#059669' }}
            >
              {clearingArrear ? 'Recording...' : 'Confirm & Save Clearance'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
