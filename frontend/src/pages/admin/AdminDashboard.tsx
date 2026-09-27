import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';
import { StudentDetailsView } from '../common/StudentDetailsView';
import {
  DashboardSkeleton,
  StudentsSkeleton,
  FacultySkeleton,
  ReportsSkeleton,
} from '../../components/common/SkeletonLoader';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import {
  Users,
  GraduationCap,
  CalendarCheck2,
  FileText,
  UserCheck,
  UserCog,
  ShieldAlert,
  BarChart3,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Download,
  Settings,
  Key,
  Copy,
  Check,
  UserPlus,
  Eye,
  Edit,
  X,
  Trash2,
  School,
  FileCheck,
  Award,
  Bell,
  History,
  BookOpen,
  AlertCircle,
  Send,
  Sparkles,
} from 'lucide-react';

interface AdminDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentTab, onSelectTab }) => {
  const toast = useToast();
  const [stats, setStats] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [faculty, setFaculty] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  // Additional institutional tabs state
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');
  const [schoolDistrictFilter, setSchoolDistrictFilter] = useState('');

  const [meetings, setMeetings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifTriggerLoading, setNotifTriggerLoading] = useState(false);
  const [notifTriggerSuccess, setNotifTriggerSuccess] = useState<string | null>(null);

  const [selectedPdfStudentId, setSelectedPdfStudentId] = useState<string>('');
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // Selected student for details view
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');

  // Modals
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showAddFacultyModal, setShowAddFacultyModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [newDeptForm, setNewDeptForm] = useState({ code: '', name: '' });

  // Assign Mentees modal state
  const [assignMenteesTarget, setAssignMenteesTarget] = useState<any | null>(null);
  // View Mentees modal state
  const [viewMenteesTarget, setViewMenteesTarget] = useState<any | null>(null);

  // Form states
  const [newStudentForm, setNewStudentForm] = useState({
    fullName: '',
    registerNumber: '',
    departmentId: '',
    batchId: '',
    username: '',
    temporaryPassword: 'Password@123',
    isActive: 1,
  });

  // Credentials dialog state
  const [createdStudentCredentials, setCreatedStudentCredentials] = useState<any | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // Reset password dialog state
  const [resetPasswordModalData, setResetPasswordModalData] = useState<{ studentId: string; registerNumber: string; studentName: string } | null>(null);
  const [tempNewPassword, setTempNewPassword] = useState('Password@123');
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);

  // Edit Student Modal state
  const [editStudentTarget, setEditStudentTarget] = useState<any | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);
  const [editStudentForm, setEditStudentForm] = useState({
    fullName: '',
    registerNumber: '',
    departmentId: '',
    batchId: '',
    mobileNumber: '',
    email: '',
    residentialType: 'DAY_SCHOLAR',
    bloodGroup: '',
    dob: '',
    address: '',
    fatherName: '',
    fatherContact: '',
    motherName: '',
    motherContact: '',
    isActive: 1,
    newPassword: '',
  });

  // Delete Confirmation Modals state
  const [deleteStudentTarget, setDeleteStudentTarget] = useState<any | null>(null);
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [deleteFacultyTarget, setDeleteFacultyTarget] = useState<any | null>(null);
  const [deletingFaculty, setDeletingFaculty] = useState(false);

  const [newFacultyForm, setNewFacultyForm] = useState({
    username: '',
    fullName: '',
    email: '',
    departmentId: '',
    employeeId: '',
    designation: 'Assistant Professor',
    cabinLocation: 'IT Block Cabin 201',
    phoneNumber: '',
  });

  const [reassignForm, setReassignForm] = useState({
    studentId: '',
    newMentorId: '',
    reasonForChange: 'Academic restructuring and faculty research sabbatical',
    effectiveDate: new Date().toISOString().split('T')[0],
  });

  const [settingsForm, setSettingsForm] = useState({
    meetingDay: 'Saturday',
    meetingTime: '10:30 AM',
    meetingLocation: 'Faculty Cabin / Mentoring Room',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, studentsRes, facultyRes, deptsRes, batchesRes, auditRes, settingsRes, meetingsRes, notifsRes, schoolsRes] =
        await Promise.all([
          api.admin.getStats(),
          api.students.list(),
          api.admin.getFaculty(),
          api.admin.getDepartments(),
          api.admin.getBatches(),
          api.audit.list({ limit: '30' }),
          api.admin.getSettings(),
          api.meetings.list().catch(() => ({ success: false, data: [] })),
          api.notifications.list().catch(() => ({ success: false, data: { notifications: [] } })),
          api.schools.list({ limit: 100 }).catch(() => ({ success: false, data: { schools: [] } })),
        ]);

      if (statsRes.success) setStats(statsRes.data);
      if (studentsRes.success) setStudents(studentsRes.data);
      if (facultyRes.success) setFaculty(facultyRes.data);
      if (deptsRes.success) {
        setDepartments(deptsRes.data);
        const itDept = deptsRes.data.find((d: any) => d.code === 'IT') || deptsRes.data[0];
        if (itDept) {
          setNewStudentForm(prev => ({ ...prev, departmentId: prev.departmentId || itDept.id }));
          setNewFacultyForm(prev => ({ ...prev, departmentId: prev.departmentId || itDept.id }));
        }
      }
      if (batchesRes.success) {
        setBatches(batchesRes.data);
        if (batchesRes.data.length > 0) {
          setNewStudentForm(prev => ({ ...prev, batchId: prev.batchId || batchesRes.data[0].id }));
        }
      }
      if (auditRes.success) setAuditLogs(auditRes.data);
      if (meetingsRes.success && Array.isArray(meetingsRes.data)) setMeetings(meetingsRes.data);
      if (notifsRes.success && notifsRes.data?.notifications) setNotifications(notifsRes.data.notifications);
      if (schoolsRes.success && schoolsRes.data?.schools) setSchools(schoolsRes.data.schools);
      if (settingsRes.success && settingsRes.data?.map) {
        setSettings(settingsRes.data.map);
        setSettingsForm({
          meetingDay: settingsRes.data.map.saturday_meeting_day || 'Saturday',
          meetingTime: settingsRes.data.map.saturday_meeting_time || '10:30 AM',
          meetingLocation: settingsRes.data.map.saturday_meeting_location || 'Faculty Cabin',
        });
      }
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
      setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Add Student (Admin creates basic identity only)
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newStudentForm,
        username: newStudentForm.username ? newStudentForm.username.trim() : newStudentForm.registerNumber.trim(),
      };
      const res = await api.students.create(payload);
      setShowAddStudentModal(false);
      loadData();
      if (res.success && res.data) {
        const deptObj = departments.find(d => d.id === newStudentForm.departmentId);
        const batchObj = batches.find(b => b.id === newStudentForm.batchId);
        setCreatedStudentCredentials({
          fullName: newStudentForm.fullName,
          registerNumber: res.data.registerNumber || newStudentForm.registerNumber,
          department: deptObj ? `${deptObj.name} (${deptObj.code})` : 'CSE Department',
          batch: batchObj ? batchObj.name : '2023-2027',
          username: res.data.username || payload.username,
          temporaryPassword: res.data.temporaryPassword || newStudentForm.temporaryPassword,
          studentId: res.data.studentId,
          isActive: newStudentForm.isActive === 1 ? 'Active' : 'Inactive',
        });
        setCopiedCredentials(false);
        setShowCredentialsModal(true);
        // Reset form
        const itDept = departments.find(d => d.code === 'IT') || departments[0];
        setNewStudentForm({
          fullName: '',
          registerNumber: '',
          departmentId: itDept?.id || '',
          batchId: batches[0]?.id || '',
          username: '',
          temporaryPassword: 'Password@123',
          isActive: 1,
        });
      } else {
        toast.success('Student account created successfully.');
      }
    } catch (err: any) {
      toast.error('Error creating student account: ' + err.message);
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordModalData) return;
    try {
      const res = await api.students.resetPassword(resetPasswordModalData.studentId, tempNewPassword);
      if (res.success) {
        toast.success(`Password for student ${resetPasswordModalData.registerNumber} (${resetPasswordModalData.studentName}) reset to: ${tempNewPassword}`);
        setShowResetPasswordModal(false);
      } else {
        toast.error(res.message || 'Failed to reset password.');
      }
    } catch (err: any) {
      toast.error('Error resetting password: ' + err.message);
    }
  };

  // Handle Save (Edit) Student
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudentTarget) return;
    setSavingStudent(true);
    try {
      const payload: any = {
        fullName: editStudentForm.fullName,
        mobileNumber: editStudentForm.mobileNumber,
        email: editStudentForm.email,
        residentialType: editStudentForm.residentialType,
        bloodGroup: editStudentForm.bloodGroup,
        dob: editStudentForm.dob,
        address: editStudentForm.address,
        fatherName: editStudentForm.fatherName,
        fatherContact: editStudentForm.fatherContact,
        motherName: editStudentForm.motherName,
        motherContact: editStudentForm.motherContact,
        registerNumber: editStudentForm.registerNumber,
        departmentId: editStudentForm.departmentId,
        batchId: editStudentForm.batchId,
        isActive: editStudentForm.isActive,
      };
      if (editStudentForm.newPassword.trim()) {
        payload.newPassword = editStudentForm.newPassword.trim();
      }
      const res = await api.students.update(editStudentTarget.id, payload);
      if (res.success) {
        toast.success(`Student "${editStudentForm.fullName}" updated successfully.`);
        setEditStudentTarget(null);
        loadData();
      } else {
        toast.error(res.message || 'Failed to update student.');
      }
    } catch (err: any) {
      toast.error('Error updating student: ' + err.message);
    } finally {
      setSavingStudent(false);
    }
  };

  // Toggle student active status
  const handleToggleStudent = async (studentId: string) => {
    try {
      const res = await api.students.toggleStatus(studentId);
      if (res.success) {
        loadData();
      } else {
        toast.error(res.message || 'Failed to toggle status.');
      }
    } catch (err: any) {
      toast.error('Failed to toggle status: ' + err.message);
    }
  };

  // Handle Add Faculty
  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.admin.createFaculty(newFacultyForm);
      setShowAddFacultyModal(false);
      loadData();
      toast.success('Faculty registered successfully.');
    } catch (err: any) {
      toast.error('Error creating faculty: ' + err.message);
    }
  };

  // Handle Reassign Mentor
  const handleReassignMentor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.mentorship.reassign(reassignForm);
      setShowReassignModal(false);
      loadData();
      toast.success(res.message || 'Mentor reassigned successfully. All historical records remain intact.');
    } catch (err: any) {
      toast.error('Reassignment failed: ' + err.message);
    }
  };

  // Handle Update Settings
  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.admin.updateSettings(settingsForm);
      loadData();
      toast.success('Institutional Saturday meeting schedule updated.');
    } catch (err: any) {
      toast.error('Failed to update settings: ' + err.message);
    }
  };

  // Create Department
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.admin.createDepartment(newDeptForm);
      setShowAddDeptModal(false);
      setNewDeptForm({ code: '', name: '' });
      loadData();
      toast.success('Academic department created successfully.');
    } catch (err: any) {
      toast.error('Failed to create department: ' + err.message);
    }
  };

  // Toggle faculty status
  const handleToggleFaculty = async (facultyId: string) => {
    try {
      await api.admin.toggleFacultyStatus(facultyId);
      loadData();
    } catch (err: any) {
      toast.error('Failed to toggle status: ' + err.message);
    }
  };

  // Permanently delete student
  const handleConfirmDeleteStudent = async () => {
    if (!deleteStudentTarget) return;
    setDeletingStudent(true);
    try {
      const res = await api.students.delete(deleteStudentTarget.id);
      if (res.success) {
        toast.success(res.message || 'Student and all associated records deleted permanently.');
        setDeleteStudentTarget(null);
        loadData();
      } else {
        toast.error(res.message || 'Failed to delete student.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting student.');
    } finally {
      setDeletingStudent(false);
    }
  };

  // Permanently delete faculty
  const handleConfirmDeleteFaculty = async () => {
    if (!deleteFacultyTarget) return;
    setDeletingFaculty(true);
    try {
      const res = await api.admin.deleteFaculty(deleteFacultyTarget.id);
      if (res.success) {
        toast.success(res.message || 'Faculty member deleted successfully. Mentee assignments terminated.');
        setDeleteFacultyTarget(null);
        loadData();
      } else {
        toast.error(res.message || 'Failed to delete faculty member.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting faculty member.');
    } finally {
      setDeletingFaculty(false);
    }
  };

  // Refresh a single faculty's mentee count in state
  const refreshFacultyMenteeCount = (facultyId: string, newCount: number) => {
    setFaculty((prev) =>
      prev.map((f) => (f.id === facultyId ? { ...f, mentee_count: newCount } : f))
    );
  };

  // Reset student details view when sidebar tab changes
  useEffect(() => {
    setSelectedStudentId(null);
  }, [currentTab]);

  if (selectedStudentId) {
    return (
      <StudentDetailsView
        studentId={selectedStudentId}
        onBack={() => setSelectedStudentId(null)}
      />
    );
  }

  if (loading) {
    if (currentTab === 'students') return <StudentsSkeleton />;
    if (currentTab === 'faculty') return <FacultySkeleton />;
    if (currentTab === 'reports') return <ReportsSkeleton />;
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

  // Filtered students
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.register_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !selectedDept || s.department_id === selectedDept;
    const matchesBatch = !selectedBatch || s.batch_id === selectedBatch;
    return matchesSearch && matchesDept && matchesBatch;
  });

  return (
    <div>
      {/* Overview Tab */}
      {currentTab === 'overview' && (
        <div>
          {/* Stat Cards */}
          <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EEF2F6', color: '#0B2545' }}>
                <GraduationCap size={24} />
              </div>
              <div className="stat-info">
                <h3>Total Students</h3>
                <div className="stat-value">{stats?.totalStudents ?? '...'}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                <Users size={24} />
              </div>
              <div className="stat-info">
                <h3>Total Faculty</h3>
                <div className="stat-value">{stats?.totalFaculty ?? '...'}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                <UserCheck size={24} />
              </div>
              <div className="stat-info">
                <h3>Active Mentors</h3>
                <div className="stat-value">{stats?.activeAssignments ?? '...'}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
                <UserCog size={24} />
              </div>
              <div className="stat-info">
                <h3>Reassignments</h3>
                <div className="stat-value">{stats?.reassignmentsCount ?? '...'}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Saturday Meeting Compliance */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><CalendarCheck2 size={18} /> Saturday Meeting Rhythm</h3>
                <span className="badge badge-primary">Institutional Saturday</span>
              </div>
              <div style={{ padding: '0.5rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ color: '#64748B', fontSize: '0.9rem' }}>Configured Meeting Day:</span>
                  <strong style={{ color: '#0B2545' }}>Every Saturday (Fixed)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ color: '#64748B', fontSize: '0.9rem' }}>Meeting Time:</span>
                  <strong style={{ color: '#0B2545' }}>{settings.saturday_meeting_time || '10:30 AM'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ color: '#64748B', fontSize: '0.9rem' }}>Configured Venue:</span>
                  <strong style={{ color: '#0B2545' }}>{settings.saturday_meeting_location || 'Faculty Cabin'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid #F1F5F9' }}>
                  <span style={{ color: '#64748B', fontSize: '0.9rem' }}>Completed Saturday Sessions:</span>
                  <strong style={{ color: '#059669' }}>{stats?.totalMeetings || 0} Sessions</strong>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><Settings size={18} /> Administrative Operations</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowAddStudentModal(true)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Plus size={16} /> Add Student
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAddFacultyModal(true)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Plus size={16} /> Add Faculty
                </button>
                <button
                  className="btn btn-gold"
                  onClick={() => setShowReassignModal(true)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  <UserCog size={16} /> Reassign Mentor
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => api.reports.downloadCsv()}
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Download size={16} /> Export Student CSV
                </button>
              </div>
            </div>
          </div>

          {/* Recent Audit Log */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><ShieldAlert size={18} /> Recent Compliance Audit Trail</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => onSelectTab('audit-trail')}>
                View Complete Trail
              </button>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {!stats?.recentActivities || stats.recentActivities.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                        No audit activities recorded.
                      </td>
                    </tr>
                  ) : (
                    stats.recentActivities.map((a: any) => (
                      <tr key={a.id}>
                        <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600 }}>{a.user_name || 'System'}</td>
                        <td><span className="badge badge-primary">{a.role || 'ADMIN'}</span></td>
                        <td><strong>{a.action}</strong></td>
                        <td>{a.entity}</td>
                        <td style={{ fontSize: '0.78rem', color: '#475569' }}>
                          {a.entity_id ? `ID: ${a.entity_id}` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Student Master Tab */}
      {currentTab === 'students' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional Student Directory ({filteredStudents.length} Students)
            </h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddStudentModal(true)}>
              <Plus size={16} /> Add Student with Permanent ID
            </button>
          </div>

          {/* Filters Bar */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '2rem' }}
                  placeholder="Search by Name or Register Number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="form-control"
                style={{ width: '180px' }}
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>

              <select
                className="form-control"
                style={{ width: '150px' }}
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
              >
                <option value="">All Batches</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Students Table */}
          <div className="card" style={{ padding: 0 }}>
            <div className="table-responsive desktop-only">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name & ID</th>
                    <th>Department & Batch</th>
                    <th>Profile Status</th>
                    <th>Account</th>
                    <th>Assigned Mentor</th>
                    <th>Arrears</th>
                    <th>Saturday Sessions</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '1.5rem', border: 'none' }}>
                        <EmptyState
                          icon={<GraduationCap size={28} />}
                          title="No Students Found"
                          description={searchQuery ? "No student records matched your search query or filters." : "No student records currently enrolled."}
                          compact
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700, color: '#0B2545' }}>{s.register_number}</td>
                      <td>
                        <strong>{s.full_name}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>ID: {s.id}</div>
                      </td>
                      <td>
                        {s.department_code} • {s.batch_name}
                      </td>
                      <td>
                        {s.profile_completed === 1 ? (
                          <span className="badge badge-success">Completed</span>
                        ) : (
                          <span className="badge badge-warning">Pending (First Login)</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleStudent(s.id)}
                          className={`badge ${s.is_active === 1 ? 'badge-success' : 'badge-danger'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                          title="Click to activate/deactivate account"
                        >
                          {s.is_active === 1 ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        {s.current_mentor_name ? (
                          <span className="badge badge-success">{s.current_mentor_name}</span>
                        ) : (
                          <span className="badge badge-warning">Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${s.total_arrears > 0 ? 'badge-danger' : 'badge-primary'}`}>
                          {s.total_arrears || 0}
                        </span>
                      </td>
                      <td>{s.completed_meetings_count || 0}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'nowrap' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedStudentId(s.id)}
                            title="View Complete Student Record Book"
                          >
                            View
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Edit Student Profile"
                            style={{ backgroundColor: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}
                            onClick={() => {
                              setEditStudentTarget(s);
                              setEditStudentForm({
                                fullName: s.full_name || '',
                                registerNumber: s.register_number || '',
                                departmentId: s.department_id || '',
                                batchId: s.batch_id || '',
                                mobileNumber: s.mobile_number || '',
                                email: s.email || '',
                                residentialType: s.residential_type || 'DAY_SCHOLAR',
                                bloodGroup: s.blood_group || '',
                                dob: s.dob ? s.dob.split('T')[0] : '',
                                address: s.address || '',
                                fatherName: s.father_name || '',
                                fatherContact: s.father_contact || '',
                                motherName: s.mother_name || '',
                                motherContact: s.mother_contact || '',
                                isActive: s.is_active ?? 1,
                                newPassword: '',
                              });
                            }}
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Reset Student Password"
                            onClick={() => {
                              setResetPasswordModalData({
                                studentId: s.id,
                                registerNumber: s.register_number,
                                studentName: s.full_name,
                              });
                              setTempNewPassword('Password@123');
                              setShowResetPasswordModal(true);
                            }}
                          >
                            <Key size={13} />
                          </button>
                          <button
                            className="btn btn-pdf btn-sm"
                            title="Download Official PDF"
                            onClick={() => api.pdf.downloadStudentPdf(s.id, `KSRCE_Mentee_${s.register_number}_Dossier.pdf`)}
                          >
                            <FileText size={13} /> PDF
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{
                              padding: '0.35rem 0.6rem',
                              backgroundColor: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title={`Permanently Delete Student ${s.full_name}`}
                            onClick={() => setDeleteStudentTarget(s)}
                          >
                            <Trash2 size={13} />
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
              {filteredStudents.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748B' }}>
                  No students found.
                </div>
              ) : (
                filteredStudents.map((s) => (
                  <div
                    key={s.id}
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
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0B2545', letterSpacing: '0.5px' }}>
                          {s.register_number}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B', marginTop: '1px' }}>
                          {s.full_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                          {s.department_code} • {s.batch_name}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span className={`badge ${s.is_active === 1 ? 'badge-success' : 'badge-danger'}`}>
                          {s.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                        <span className={`badge ${s.total_arrears > 0 ? 'badge-danger' : 'badge-primary'}`} style={{ fontSize: '0.7rem' }}>
                          {s.total_arrears || 0} Arrears
                        </span>
                      </div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: '0.65rem 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Assigned Mentor:</span>
                        <strong>{s.current_mentor_name || 'Unassigned'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Profile Setup:</span>
                        <span>{s.profile_completed === 1 ? '✓ Completed' : '⚠ Pending'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Saturday Sessions:</span>
                        <strong>{s.completed_meetings_count || 0} Completed</strong>
                      </div>
                    </div>

                    {/* Mobile Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedStudentId(s.id)}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                      >
                        <Eye size={15} /> View
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          setEditStudentTarget(s);
                          setEditStudentForm({
                            fullName: s.full_name || '',
                            registerNumber: s.register_number || '',
                            departmentId: s.department_id || '',
                            batchId: s.batch_id || '',
                            mobileNumber: s.mobile_number || '',
                            email: s.email || '',
                            residentialType: s.residential_type || 'DAY_SCHOLAR',
                            bloodGroup: s.blood_group || '',
                            dob: s.dob ? s.dob.split('T')[0] : '',
                            address: s.address || '',
                            fatherName: s.father_name || '',
                            fatherContact: s.father_contact || '',
                            motherName: s.mother_name || '',
                            motherContact: s.mother_contact || '',
                            isActive: s.is_active ?? 1,
                            newPassword: '',
                          });
                        }}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600, backgroundColor: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '8px' }}
                      >
                        <Edit size={15} /> Edit
                      </button>
                      <button
                        className="btn btn-pdf btn-sm"
                        onClick={() => api.pdf.downloadStudentPdf(s.id, `KSRCE_Mentee_${s.register_number}_Dossier.pdf`)}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                      >
                        <FileText size={15} /> PDF
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          setResetPasswordModalData({ studentId: s.id, registerNumber: s.register_number, studentName: s.full_name });
                          setTempNewPassword('Password@123');
                          setShowResetPasswordModal(true);
                        }}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600, backgroundColor: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', borderRadius: '8px' }}
                      >
                        <Key size={15} /> Reset Pwd
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Faculty Directory Tab */}
      {currentTab === 'faculty' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Faculty &amp; Mentor Master ({faculty.length} Faculty Members)
            </h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddFacultyModal(true)}>
              <Plus size={16} /> Add Faculty Member
            </button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            {/* Desktop Table View */}
            <div className="table-responsive desktop-only">
              <table className="table">
                <thead>
                  <tr>
                    <th>Emp ID</th>
                    <th>Faculty Name</th>
                    <th>Department</th>
                    <th>Designation &amp; Cabin</th>
                    <th>Contact</th>
                    <th>Assigned Mentees</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No faculty members available.
                      </td>
                    </tr>
                  ) : (
                    faculty.map((f) => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 700 }}>{f.employee_id}</td>
                      <td>
                        <strong>{f.full_name}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{f.email}</div>
                      </td>
                      <td>{f.department_code || 'CSE'}</td>
                      <td>
                        {f.designation}
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{f.cabin_location || '-'}</div>
                      </td>
                      <td>{f.phone_number || '-'}</td>
                      {/* ── Assigned Mentees column ── */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                          <button
                            onClick={() => setViewMenteesTarget(f)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            title={`View mentees of ${f.full_name}`}
                          >
                            <Eye size={13} style={{ color: '#1D4ED8' }} />
                            <strong style={{ color: f.mentee_count > 0 ? '#0B2545' : '#94A3B8', fontSize: '0.875rem' }}>
                              {f.mentee_count || 0} Mentee{f.mentee_count !== 1 ? 's' : ''}
                            </strong>
                          </button>
                          {f.is_active === 1 && (
                            <button
                              className="btn btn-sm"
                              style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                              onClick={() => setAssignMenteesTarget(f)}
                              title={`Assign students to ${f.full_name}`}
                            >
                              <UserPlus size={11} /> Assign
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${f.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {f.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            className={`btn btn-sm ${f.is_active ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => handleToggleFaculty(f.id)}
                          >
                            {f.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{
                              padding: '0.35rem 0.6rem',
                              backgroundColor: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title={`Permanently Delete Faculty ${f.full_name}`}
                            onClick={() => setDeleteFacultyTarget(f)}
                          >
                            <Trash2 size={13} />
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
              {faculty.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                  No faculty members available.
                </div>
              ) : (
                faculty.map((f) => (
                  <div
                    key={f.id}
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
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.5px' }}>
                          EMP: {f.employee_id}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B2545', marginTop: '1px' }}>
                          {f.full_name}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748B' }}>{f.email}</div>
                      </div>
                      <span className={`badge ${f.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {f.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '0.75rem', borderRadius: '8px', fontSize: '0.82rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', margin: '0.65rem 0' }}>
                      <div>
                        <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Department</span>
                        <strong>{f.department_code || 'IT'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Designation</span>
                        <strong>{f.designation || 'Faculty'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Cabin</span>
                        <strong>{f.cabin_location || 'IT Lab'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Contact</span>
                        <strong>{f.phone_number || '-'}</strong>
                      </div>
                      <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #E2E8F0', paddingTop: '0.4rem', marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748B', fontSize: '0.78rem' }}>Assigned Mentees</span>
                        <strong style={{ color: '#1D4ED8', fontSize: '0.95rem' }}>{f.mentee_count || 0} Students</strong>
                      </div>
                    </div>

                    {/* Mobile Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewMenteesTarget(f)}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                      >
                        <Eye size={15} /> View Mentees
                      </button>
                      {f.is_active === 1 && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setAssignMenteesTarget(f)}
                          style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                        >
                          <UserPlus size={15} /> Assign Mentees
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Assign Mentees Modal */}
          {assignMenteesTarget && (
            <AssignMenteesModal
              faculty={assignMenteesTarget}
              departments={departments}
              batches={batches}
              onClose={() => setAssignMenteesTarget(null)}
              onAssigned={(newCount) => {
                refreshFacultyMenteeCount(assignMenteesTarget.id, newCount);
                setAssignMenteesTarget(null);
              }}
            />
          )}

          {/* View Mentees Modal */}
          {viewMenteesTarget && (
            <ViewMenteesModal
              faculty={viewMenteesTarget}
              onClose={() => setViewMenteesTarget(null)}
              onCountChanged={(newCount) => refreshFacultyMenteeCount(viewMenteesTarget.id, newCount)}
              onViewStudent={(sid) => { setViewMenteesTarget(null); setSelectedStudentId(sid); }}
            />
          )}
        </div>
      )}

      {/* Academic Departments Master Tab */}
      {currentTab === 'departments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Academic Departments Master ({departments.length} Departments)
            </h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddDeptModal(true)}>
              <Plus size={16} /> Add Department
            </button>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Department Code</th>
                    <th>Department Name</th>
                    <th>Enrolled Students</th>
                    <th>Faculty Members</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No departments found.
                      </td>
                    </tr>
                  ) : (
                    departments.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 700, color: '#0B2545' }}>
                          <span className="badge badge-primary">{d.code}</span>
                        </td>
                        <td><strong>{d.name}</strong></td>
                        <td>{d.student_count || 0} Students</td>
                        <td>{d.faculty_count || 0} Faculty</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mentor Reassignment Desk Tab */}
      {currentTab === 'reassignment' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional Mentor Reassignment Desk
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
              Enforces the Cardinal Rule: <strong>Student Data is Permanent</strong>. When Mentor A is changed to Mentor B, all academic, meeting, and counselling records are preserved.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="card" style={{ borderLeft: '4px solid #C59B27' }}>
              <div className="card-header">
                <h3 className="card-title"><UserCog size={18} /> Execute Mentor Reassignment</h3>
              </div>
              <form onSubmit={handleReassignMentor}>
                <div className="form-group">
                  <label className="form-label">Select Student / Mentee</label>
                  <select
                    className="form-control"
                    value={reassignForm.studentId}
                    onChange={(e) => setReassignForm({ ...reassignForm, studentId: e.target.value })}
                    required
                  >
                    <option value="">-- Choose Student --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.register_number}) — Current: {s.current_mentor_name || 'None'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assign New Mentor</label>
                  <select
                    className="form-control"
                    value={reassignForm.newMentorId}
                    onChange={(e) => setReassignForm({ ...reassignForm, newMentorId: e.target.value })}
                    required
                  >
                    <option value="">-- Choose New Faculty Mentor --</option>
                    {faculty
                      .filter((f) => f.is_active)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name} ({f.designation}, {f.cabin_location})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Effective Transfer Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={reassignForm.effectiveDate}
                    onChange={(e) => setReassignForm({ ...reassignForm, effectiveDate: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Institutional Reason for Change (Mandatory Audit Requirement)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={reassignForm.reasonForChange}
                    onChange={(e) => setReassignForm({ ...reassignForm, reasonForChange: e.target.value })}
                    placeholder="e.g. Faculty sabbatical, department rotation, student section change..."
                    required
                  />
                </div>

                <button type="submit" className="btn btn-gold" style={{ width: '100%', padding: '0.75rem' }}>
                  Execute Reassignment with Full Historical Ledger
                </button>
              </form>
            </div>

            <div className="card" style={{ backgroundColor: '#F8FAFC' }}>
              <div className="card-header">
                <h3 className="card-title"><CheckCircle2 size={18} /> Institutional Guarantee</h3>
              </div>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#475569', lineHeight: 1.8 }}>
                <li><strong>Permanent Student ID</strong>: Student retains the exact same ID and Register Number.</li>
                <li><strong>Academic Persistence</strong>: 10th/12th, Cut-off, and Semesters 1-8 CGPA/arrears remain 100% untouched.</li>
                <li><strong>Past Counselling Preservation</strong>: Prior counselling entries made by old mentors remain intact.</li>
                <li><strong>Saturday Meetings Record</strong>: Past Saturday meeting records retain previous mentor references.</li>
                <li><strong>Audited Transition</strong>: Old assignment status becomes <code>COMPLETED</code>; new assignment becomes <code>ACTIVE</code>.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Saturday Settings Tab */}
      {currentTab === 'saturday-settings' && (
        <div style={{ maxWidth: '650px' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional Saturday Meeting Configuration
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
              Saturday is institutionally fixed. Mentors and students automatically follow this configured schedule.
            </p>
          </div>

          <div className="card">
            <form onSubmit={handleUpdateSettings}>
              <div className="form-group">
                <label className="form-label">Fixed Meeting Day</label>
                <input
                  type="text"
                  className="form-control"
                  value={settingsForm.meetingDay}
                  disabled
                  style={{ backgroundColor: '#F1F5F9' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Institutional policy dictates Saturday is fixed.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Configured Meeting Time</label>
                <input
                  type="text"
                  className="form-control"
                  value={settingsForm.meetingTime}
                  onChange={(e) => setSettingsForm({ ...settingsForm, meetingTime: e.target.value })}
                  placeholder="e.g. 10:30 AM"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Default Meeting Venue / Location</label>
                <input
                  type="text"
                  className="form-control"
                  value={settingsForm.meetingLocation}
                  onChange={(e) => setSettingsForm({ ...settingsForm, meetingLocation: e.target.value })}
                  placeholder="e.g. Faculty Cabin / Mentoring Room"
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ padding: '0.65rem 1.5rem' }}>
                Save Saturday Configuration
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Audit Trail Tab */}
      {currentTab === 'audit-trail' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional Compliance & Security Audit Logs
            </h2>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                    <th>IP / Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No audit records logged.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{log.user_name || log.username || 'System'}</td>
                      <td><span className="badge badge-primary">{log.user_role || 'ADMIN'}</span></td>
                      <td><span className="badge badge-info">{log.action}</span></td>
                      <td>{log.entity}</td>
                      <td style={{ fontSize: '0.78rem' }}>{log.entity_id || '-'}</td>
                      <td style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{log.ip_address || '127.0.0.1'}</td>
                    </tr>
                  ))
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {currentTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional Reports & Exports
            </h2>
            <button className="btn btn-secondary" onClick={() => api.reports.downloadCsv()}>
              <Download size={16} /> Download Full Mentee CSV
            </button>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><BarChart3 size={18} /> Departmental Mentoring Progress Summary</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Dept Code</th>
                    <th>Department Name</th>
                    <th>Total Students</th>
                    <th>Assigned Students</th>
                    <th>Faculty Count</th>
                    <th>Saturday Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700 }}>{d.code}</td>
                      <td>{d.name}</td>
                      <td>{d.student_count || 0}</td>
                      <td><span className="badge badge-success">{d.student_count || 0}</span></td>
                      <td>{d.faculty_count || 0}</td>
                      <td>{stats?.totalMeetings || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Feeder Schools Directory Tab */}
      {currentTab === 'schools' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional Feeder Schools Directory ({schools.length} Schools)
            </h2>
          </div>

          <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '2rem' }}
                  placeholder="Search feeder schools by name, city, district..."
                  value={schoolSearchQuery}
                  onChange={(e) => setSchoolSearchQuery(e.target.value)}
                />
              </div>
              <input
                type="text"
                className="form-control"
                style={{ width: '180px' }}
                placeholder="Filter by District..."
                value={schoolDistrictFilter}
                onChange={(e) => setSchoolDistrictFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>School Code</th>
                    <th>School Name</th>
                    <th>City / Town</th>
                    <th>District</th>
                    <th>Board</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schools
                    .filter((s) => {
                      const name = s.schoolName || s.name || '';
                      const city = s.city || '';
                      const dist = s.district || '';
                      const matchQuery =
                        !schoolSearchQuery ||
                        name.toLowerCase().includes(schoolSearchQuery.toLowerCase()) ||
                        city.toLowerCase().includes(schoolSearchQuery.toLowerCase()) ||
                        dist.toLowerCase().includes(schoolSearchQuery.toLowerCase());
                      const matchDist =
                        !schoolDistrictFilter || dist.toLowerCase().includes(schoolDistrictFilter.toLowerCase());
                      return matchQuery && matchDist;
                    })
                    .map((s, idx) => (
                      <tr key={s._id || s.id || idx}>
                        <td style={{ fontWeight: 700, color: '#0B2545' }}>SCH-{(idx + 1).toString().padStart(3, '0')}</td>
                        <td style={{ fontWeight: 600 }}>{s.schoolName || s.name}</td>
                        <td>{s.city}</td>
                        <td>{s.district}</td>
                        <td><span className="badge badge-info">{s.schoolType || s.board || 'State Board'}</span></td>
                        <td><span className="badge badge-success">Active</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mentor Assignment Tab */}
      {currentTab === 'assignment' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Mentor Assignment Desk
            </h2>
          </div>

          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <UserCheck size={24} color="#1D4ED8" />
              <div>
                <h4 style={{ margin: 0, color: '#1E40AF', fontWeight: 700 }}>Faculty Mentoring Roster</h4>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#3B82F6' }}>
                  Assign students to faculty mentors. Total Faculty: <strong>{faculty.length}</strong> • Total Enrolled Students: <strong>{students.length}</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Faculty Name</th>
                    <th>Employee ID</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Assigned Mentees</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.map((f) => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.full_name}</td>
                      <td>{f.employee_id}</td>
                      <td>{f.dept_name}</td>
                      <td>{f.designation}</td>
                      <td>
                        <span className={`badge ${f.mentee_count > 0 ? 'badge-success' : 'badge-warning'}`}>
                          {f.mentee_count || 0} Students
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setAssignMenteesTarget(f)}
                          >
                            <UserPlus size={14} /> Assign Mentees
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setViewMenteesTarget(f)}
                          >
                            <Eye size={14} /> View Roster
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Student Documents Tab */}
      {currentTab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional Student Documents & Verification Desk
            </h2>
          </div>

          <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '2rem' }}
                  placeholder="Filter student documents by name or register number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Department</th>
                    <th>Batch</th>
                    <th>Profile Status</th>
                    <th>Assigned Mentor</th>
                    <th>Document Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                        No student documents records found.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700, color: '#0B2545' }}>{s.register_number}</td>
                        <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                        <td>{s.dept_code}</td>
                        <td>{s.batch_name}</td>
                        <td>
                          {s.profile_completed ? (
                            <span className="badge badge-success">Completed</span>
                          ) : (
                            <span className="badge badge-warning">Pending Wizard</span>
                          )}
                        </td>
                        <td>{s.mentor_name || 'Unassigned'}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedStudentId(s.id)}
                          >
                            <FileCheck size={14} /> Open Student Documents
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Counselling Records Tab */}
      {currentTab === 'counselling' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional 5-Domain Counselling Hub
            </h2>
          </div>

          <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
            {[
              { title: 'Academic Domain', desc: 'Arrears, internal marks, study habits', color: '#1D4ED8' },
              { title: 'Attendance Domain', desc: 'Biometric tracking, Saturday sessions', color: '#D97706' },
              { title: 'Career Guidance', desc: 'Skill upgrades, internships, placements', color: '#059669' },
              { title: 'Emotional & Social', desc: 'Wellbeing, stress, discipline, personal', color: '#7C3AED' },
            ].map((d, i) => (
              <div key={i} className="card" style={{ padding: '1rem', borderTop: `3px solid ${d.color}` }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: '#0B2545' }}>{d.title}</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>{d.desc}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><FileText size={18} /> Student Counselling Directory</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Department</th>
                    <th>Arrears</th>
                    <th>Assigned Mentor</th>
                    <th>Counselling Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700 }}>{s.register_number}</td>
                      <td>{s.full_name}</td>
                      <td>{s.dept_code}</td>
                      <td>
                        <span className={`badge ${s.arrear_count > 0 ? 'badge-danger' : 'badge-success'}`}>
                          {s.arrear_count || 0} Arrears
                        </span>
                      </td>
                      <td>{s.mentor_name || 'Unassigned'}</td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setSelectedStudentId(s.id)}
                        >
                          <FileText size={14} /> View Student Counselling
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Saturday Meetings Tab */}
      {currentTab === 'meetings' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                Institutional Saturday Mentoring Meetings Monitor
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                Fixed Institutional Day: <strong>{settingsForm.meetingDay}</strong> at <strong>{settingsForm.meetingTime}</strong> in <strong>{settingsForm.meetingLocation}</strong>
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  setNotifTriggerLoading(true);
                  await api.notifications.triggerReminders('SATURDAY_TODAY');
                  toast.success('Saturday mentoring reminders successfully dispatched to all mentors and mentees.');
                  setTimeout(() => setNotifTriggerSuccess(null), 4000);
                } catch (e: any) {
                  toast.error(e.message || 'Failed to dispatch reminders');
                } finally {
                  setNotifTriggerLoading(false);
                }
              }}
              disabled={notifTriggerLoading}
            >
              <CalendarCheck2 size={16} /> {notifTriggerLoading ? 'Sending Alerts...' : 'Trigger Saturday Meeting Alerts'}
            </button>
          </div>

          {notifTriggerSuccess && (
            <div style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #6EE7B7' }}>
              ✓ {notifTriggerSuccess}
            </div>
          )}

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Meeting Date</th>
                    <th>Department</th>
                    <th>Mentor</th>
                    <th>Mentee</th>
                    <th>Attendance</th>
                    <th>Topics Discussed</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No Saturday meetings logged yet. As faculty conduct weekly Saturday sessions, records will stream here.
                      </td>
                    </tr>
                  ) : (
                    meetings.map((m) => (
                      <tr key={m._id || m.id}>
                        <td style={{ fontWeight: 600 }}>{m.meeting_date || m.date || 'Saturday'}</td>
                        <td>{m.dept_name || 'Engineering'}</td>
                        <td>{m.mentor_name || 'Faculty'}</td>
                        <td>{m.student_name || 'Mentee'}</td>
                        <td>
                          <span className={`badge ${m.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                            {m.attendance_status || 'PRESENT'}
                          </span>
                        </td>
                        <td>{m.topics_discussed || 'Academic Performance & Review'}</td>
                        <td>{m.remarks || 'Regular Saturday review session.'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Progress Tab */}
      {currentTab === 'monthly-progress' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Monthly Student Progress & Action Plans
            </h2>
          </div>

          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Award size={24} color="#0B2545" />
              <div>
                <h4 style={{ margin: 0, color: '#0B2545', fontWeight: 700 }}>Continuous Academic Monitoring</h4>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                  Evaluate monthly targets, arrears clearance commitments, and academic improvement plans across all batches.
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Department</th>
                    <th>Batch</th>
                    <th>Current Arrears</th>
                    <th>Assigned Mentor</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700 }}>{s.register_number}</td>
                      <td>{s.full_name}</td>
                      <td>{s.dept_code}</td>
                      <td>{s.batch_name}</td>
                      <td>
                        <span className={`badge ${s.arrear_count > 0 ? 'badge-danger' : 'badge-success'}`}>
                          {s.arrear_count || 0} Arrears
                        </span>
                      </td>
                      <td>{s.mentor_name || 'Unassigned'}</td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedStudentId(s.id)}
                        >
                          <Award size={14} /> Open Student Progress
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {currentTab === 'notifications' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              System Notifications & Mentoring Alerts
            </h2>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  setNotifTriggerLoading(true);
                  await api.notifications.triggerReminders('SATURDAY_TODAY');
                  toast.success('Automated Saturday mentoring reminders sent successfully.');
                  setTimeout(() => setNotifTriggerSuccess(null), 4000);
                } catch (e: any) {
                  toast.error(e.message || 'Failed to dispatch reminders');
                } finally {
                  setNotifTriggerLoading(false);
                }
              }}
              disabled={notifTriggerLoading}
            >
              <Bell size={16} /> {notifTriggerLoading ? 'Sending...' : 'Dispatch Saturday Meeting Reminders'}
            </button>
          </div>

          {notifTriggerSuccess && (
            <div style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #6EE7B7' }}>
              ✓ {notifTriggerSuccess}
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><Bell size={18} /> Recent System Notifications</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Message</th>
                    <th>Type</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No system notifications logged yet.
                      </td>
                    </tr>
                  ) : (
                    notifications.map((n) => (
                      <tr key={n.id || n._id}>
                        <td style={{ fontWeight: 600 }}>{n.title}</td>
                        <td>{n.message}</td>
                        <td><span className="badge badge-info">{n.type}</span></td>
                        <td>{new Date(n.created_at || Date.now()).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PDF Downloads Tab */}
      {currentTab === 'pdf-downloads' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Institutional PDF Dossier Downloads
            </h2>
          </div>

          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0B2545', marginBottom: '0.75rem' }}>
              Download Autonomous KSRCE 6-Page Student Mentoring Dossier
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.25rem' }}>
              Generate complete, official Anna University Autonomous compliant PDF records containing bio-data, feeder school history, 8-semester marks, arrears tracking, Saturday session logs, and 5-domain counselling summaries.
            </p>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-control"
                style={{ flex: 1, minWidth: '260px' }}
                value={selectedPdfStudentId}
                onChange={(e) => setSelectedPdfStudentId(e.target.value)}
              >
                <option value="">-- Select a Student to Download PDF --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.register_number} - {s.full_name} ({s.dept_code})
                  </option>
                ))}
              </select>

              <button
                className="btn btn-primary"
                disabled={!selectedPdfStudentId || pdfDownloading}
                onClick={async () => {
                  if (!selectedPdfStudentId) return;
                  setPdfDownloading(true);
                  try {
                    const st = students.find((s) => s.id === selectedPdfStudentId);
                    await api.pdf.downloadStudentPdf(
                      selectedPdfStudentId,
                      `KSRCE_Mentee_${st?.register_number || selectedPdfStudentId}_Dossier.pdf`
                    );
                    toast.success('Student Dossier PDF downloaded successfully.');
                  } catch (err: any) {
                    toast.error('PDF generation error: ' + err.message);
                  } finally {
                    setPdfDownloading(false);
                  }
                }}
              >
                <Download size={16} /> {pdfDownloading ? 'Generating PDF...' : 'Download Student Dossier PDF'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><Download size={18} /> Quick Student PDF Roster</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Department</th>
                    <th>Batch</th>
                    <th>Assigned Mentor</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700 }}>{s.register_number}</td>
                      <td>{s.full_name}</td>
                      <td>{s.dept_code}</td>
                      <td>{s.batch_name}</td>
                      <td>{s.mentor_name || 'Unassigned'}</td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            api.pdf.downloadStudentPdf(s.id, `KSRCE_Mentee_${s.register_number}_Dossier.pdf`);
                          }}
                        >
                          <Download size={14} /> Download PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* MODAL: Add Student (Admin creates basic login account identity only) */}
      <Modal
        isOpen={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        title="Create Student Login Account"
      >
        <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', padding: '0.85rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#1E40AF' }}>
          <strong>Admin Account Creation:</strong> Admin creates ONLY the student's login account and basic identity. The student will personally complete their personal, family, and academic details after logging in.
        </div>

        <form onSubmit={handleAddStudent}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Student Name *</label>
              <input
                type="text"
                className="form-control"
                value={newStudentForm.fullName}
                onChange={(e) => setNewStudentForm({ ...newStudentForm, fullName: e.target.value })}
                placeholder="e.g. K. Priya"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Register Number *</label>
              <input
                type="text"
                className="form-control"
                value={newStudentForm.registerNumber}
                onChange={(e) => {
                  const reg = e.target.value;
                  setNewStudentForm({
                    ...newStudentForm,
                    registerNumber: reg,
                    username: newStudentForm.username === '' || newStudentForm.username === newStudentForm.registerNumber ? reg : newStudentForm.username,
                  });
                }}
                placeholder="e.g. 731523104088"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Department *</label>
              <select
                className="form-control"
                value={newStudentForm.departmentId}
                onChange={(e) => setNewStudentForm({ ...newStudentForm, departmentId: e.target.value })}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Academic Batch *</label>
              <select
                className="form-control"
                value={newStudentForm.batchId}
                onChange={(e) => setNewStudentForm({ ...newStudentForm, batchId: e.target.value })}
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Username / Login ID</label>
              <input
                type="text"
                className="form-control"
                value={newStudentForm.username}
                onChange={(e) => setNewStudentForm({ ...newStudentForm, username: e.target.value })}
                placeholder="Defaults to Register Number"
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Leave blank to auto-use Register Number</span>
            </div>
            <div className="form-group">
              <label className="form-label">Temporary Password *</label>
              <input
                type="text"
                className="form-control"
                value={newStudentForm.temporaryPassword}
                onChange={(e) => setNewStudentForm({ ...newStudentForm, temporaryPassword: e.target.value })}
                placeholder="e.g. Password@123"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Account Status</label>
            <select
              className="form-control"
              value={newStudentForm.isActive}
              onChange={(e) => setNewStudentForm({ ...newStudentForm, isActive: parseInt(e.target.value, 10) })}
            >
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddStudentModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Student Login
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Student Login Credentials Dialog */}
      <Modal
        isOpen={showCredentialsModal}
        onClose={() => setShowCredentialsModal(false)}
        title="Student Login Account Created"
      >
        {createdStudentCredentials && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1rem', borderRadius: '8px', color: '#065F46', marginBottom: '1.25rem' }}>
              <CheckCircle2 size={24} color="#059669" />
              <div>
                <strong style={{ fontSize: '0.95rem' }}>Account created successfully!</strong>
                <div style={{ fontSize: '0.8rem', color: '#047857' }}>
                  Hand over these login credentials to the student. They will complete their profile upon first login.
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Student Name</span>
                  <strong style={{ color: '#0B2545' }}>{createdStudentCredentials.fullName}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Register Number</span>
                  <strong style={{ color: '#0B2545' }}>{createdStudentCredentials.registerNumber}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Permanent Student ID</span>
                  <code style={{ color: '#1E293B', backgroundColor: '#EDF2F7', padding: '2px 6px', borderRadius: '4px' }}>{createdStudentCredentials.studentId}</code>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Department & Batch</span>
                  <strong style={{ color: '#0B2545' }}>{createdStudentCredentials.department} • {createdStudentCredentials.batch}</strong>
                </div>
                <div style={{ gridColumn: 'span 2', height: '1px', backgroundColor: '#E2E8F0', margin: '4px 0' }} />
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Login Username</span>
                  <strong style={{ color: '#1D4ED8', fontSize: '1rem' }}>{createdStudentCredentials.username}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Temporary Password</span>
                  <strong style={{ color: '#DC2626', fontSize: '1rem' }}>{createdStudentCredentials.temporaryPassword}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Account Status</span>
                  <span className="badge badge-success">{createdStudentCredentials.isActive}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Profile Status</span>
                  <span className="badge badge-warning">Pending First Login</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const text = `KSRCE Digital Mentor–Mentee Management System\nStudent Login Credentials\n==========================================\nName: ${createdStudentCredentials.fullName}\nRegister Number: ${createdStudentCredentials.registerNumber}\nStudent ID: ${createdStudentCredentials.studentId}\nDepartment: ${createdStudentCredentials.department}\nBatch: ${createdStudentCredentials.batch}\nUsername / Login ID: ${createdStudentCredentials.username}\nTemporary Password: ${createdStudentCredentials.temporaryPassword}\nStatus: ${createdStudentCredentials.isActive}\nPortal: http://localhost:3000\n==========================================\nUpon your first login, you will complete your student profile.`;
                  navigator.clipboard.writeText(text);
                  setCopiedCredentials(true);
                  setTimeout(() => setCopiedCredentials(false), 2500);
                }}
              >
                {copiedCredentials ? <Check size={16} /> : <Copy size={16} />}
                {copiedCredentials ? 'Copied to Clipboard!' : 'Copy Credentials'}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCredentialsModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Reset Student Password */}
      <Modal
        isOpen={showResetPasswordModal}
        onClose={() => setShowResetPasswordModal(false)}
        title="Reset Student Password"
      >
        {resetPasswordModalData && (
          <form onSubmit={handleResetPassword}>
            <div style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              Resetting password for: <strong>{resetPasswordModalData.studentName}</strong> (Reg No: <strong>{resetPasswordModalData.registerNumber}</strong>)
            </div>

            <div className="form-group">
              <label className="form-label">New Temporary Password *</label>
              <input
                type="text"
                className="form-control"
                value={tempNewPassword}
                onChange={(e) => setTempNewPassword(e.target.value)}
                placeholder="e.g. Password@123"
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Provide this new temporary password to the student.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowResetPasswordModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Update Password
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: Edit Student */}
      <Modal
        isOpen={!!editStudentTarget}
        onClose={() => setEditStudentTarget(null)}
        title={`Edit Student — ${editStudentTarget?.full_name || ''}`}
      >
        {editStudentTarget && (
          <form onSubmit={handleSaveStudent}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>

              {/* Identity Fields */}
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudentForm.fullName}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, fullName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Register Number *</label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudentForm.registerNumber}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, registerNumber: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Department *</label>
                <select
                  className="form-control"
                  value={editStudentForm.departmentId}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, departmentId: e.target.value })}
                  required
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Batch *</label>
                <select
                  className="form-control"
                  value={editStudentForm.batchId}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, batchId: e.target.value })}
                  required
                >
                  <option value="">-- Select Batch --</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Contact Details */}
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input
                  type="tel"
                  className="form-control"
                  value={editStudentForm.mobileNumber}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, mobileNumber: e.target.value })}
                  placeholder="9876543210"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={editStudentForm.email}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, email: e.target.value })}
                  placeholder="student@ksrce.ac.in"
                />
              </div>

              {/* Personal Details */}
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input
                  type="date"
                  className="form-control"
                  value={editStudentForm.dob}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, dob: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Blood Group</label>
                <select
                  className="form-control"
                  value={editStudentForm.bloodGroup}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, bloodGroup: e.target.value })}
                >
                  <option value="">-- Select --</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Residential Type</label>
                <select
                  className="form-control"
                  value={editStudentForm.residentialType}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, residentialType: e.target.value })}
                >
                  <option value="DAY_SCHOLAR">Day Scholar</option>
                  <option value="HOSTELLER">Hosteller</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Address</label>
                <textarea
                  className="form-control"
                  value={editStudentForm.address}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, address: e.target.value })}
                  rows={2}
                  placeholder="Door No, Street, City, District - Pincode"
                />
              </div>

              {/* Parent Details */}
              <div className="form-group">
                <label className="form-label">Father's Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudentForm.fatherName}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, fatherName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Father's Contact</label>
                <input
                  type="tel"
                  className="form-control"
                  value={editStudentForm.fatherContact}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, fatherContact: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mother's Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudentForm.motherName}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, motherName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mother's Contact</label>
                <input
                  type="tel"
                  className="form-control"
                  value={editStudentForm.motherContact}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, motherContact: e.target.value })}
                />
              </div>

              {/* Account Settings */}
              <div className="form-group">
                <label className="form-label">Account Status</label>
                <select
                  className="form-control"
                  value={editStudentForm.isActive}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, isActive: Number(e.target.value) })}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">New Password <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>(leave blank to keep current)</span></label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudentForm.newPassword}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, newPassword: e.target.value })}
                  placeholder="Optional — e.g. NewPass@456"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditStudentTarget(null)} disabled={savingStudent}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingStudent}>
                {savingStudent ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: Add Faculty */}
      <Modal
        isOpen={showAddFacultyModal}
        onClose={() => setShowAddFacultyModal(false)}
        title="Add New Faculty Member"
      >
        <form onSubmit={handleAddFaculty}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-control"
                value={newFacultyForm.username}
                onChange={(e) => setNewFacultyForm({ ...newFacultyForm, username: e.target.value })}
                placeholder="e.g. faculty_c"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Faculty Full Name</label>
              <input
                type="text"
                className="form-control"
                value={newFacultyForm.fullName}
                onChange={(e) => setNewFacultyForm({ ...newFacultyForm, fullName: e.target.value })}
                placeholder="Dr. S. Karthi"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Employee ID</label>
              <input
                type="text"
                className="form-control"
                value={newFacultyForm.employeeId}
                onChange={(e) => setNewFacultyForm({ ...newFacultyForm, employeeId: e.target.value })}
                placeholder="KSRCE-FAC-0201"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <select
                className="form-control"
                value={newFacultyForm.departmentId}
                onChange={(e) => setNewFacultyForm({ ...newFacultyForm, departmentId: e.target.value })}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <input
                type="text"
                className="form-control"
                value={newFacultyForm.designation}
                onChange={(e) => setNewFacultyForm({ ...newFacultyForm, designation: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cabin Location</label>
              <input
                type="text"
                className="form-control"
                value={newFacultyForm.cabinLocation}
                onChange={(e) => setNewFacultyForm({ ...newFacultyForm, cabinLocation: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              value={newFacultyForm.email}
              onChange={(e) => setNewFacultyForm({ ...newFacultyForm, email: e.target.value })}
              placeholder="faculty@ksrce.ac.in"
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddFacultyModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Register Faculty
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Reassign Mentor (Quick Launch) */}
      <Modal
        isOpen={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        title="Quick Mentor Reassignment"
      >
        <form onSubmit={handleReassignMentor}>
          <div className="form-group">
            <label className="form-label">Select Student / Mentee</label>
            <select
              className="form-control"
              value={reassignForm.studentId}
              onChange={(e) => setReassignForm({ ...reassignForm, studentId: e.target.value })}
              required
            >
              <option value="">-- Choose Student --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.register_number}) — Current: {s.current_mentor_name || 'None'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Assign New Mentor</label>
            <select
              className="form-control"
              value={reassignForm.newMentorId}
              onChange={(e) => setReassignForm({ ...reassignForm, newMentorId: e.target.value })}
              required
            >
              <option value="">-- Choose New Faculty Mentor --</option>
              {faculty
                .filter((f) => f.is_active)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.full_name} ({f.designation}, {f.cabin_location})
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Institutional Reason for Change (Required)</label>
            <input
              type="text"
              className="form-control"
              value={reassignForm.reasonForChange}
              onChange={(e) => setReassignForm({ ...reassignForm, reasonForChange: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowReassignModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-gold">
              Submit Reassignment
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Add Department */}
      <Modal
        isOpen={showAddDeptModal}
        onClose={() => setShowAddDeptModal(false)}
        title="Add Academic Department"
      >
        <form onSubmit={handleCreateDepartment}>
          <div className="form-group">
            <label className="form-label">Department Code (e.g. AI-DS, EEE, CIVIL)</label>
            <input
              type="text"
              className="form-control"
              value={newDeptForm.code}
              onChange={(e) => setNewDeptForm({ ...newDeptForm, code: e.target.value.toUpperCase() })}
              placeholder="e.g. AI-DS"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Department Name</label>
            <input
              type="text"
              className="form-control"
              value={newDeptForm.name}
              onChange={(e) => setNewDeptForm({ ...newDeptForm, name: e.target.value })}
              placeholder="e.g. Artificial Intelligence and Data Science"
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddDeptModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Department
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Delete Student Confirmation */}
      <Modal
        isOpen={!!deleteStudentTarget}
        onClose={() => !deletingStudent && setDeleteStudentTarget(null)}
        title="Permanently Delete Student Record"
        maxWidth="520px"
      >
        {deleteStudentTarget && (
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
                  Are you sure you want to permanently delete this student record? This will delete the student profile, academic semester ledger, counselling history, meeting records, and portal login account.
                </p>
              </div>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #E2E8F0', fontSize: '0.875rem' }}>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Student Name: </span>
                <strong style={{ color: '#0B2545' }}>{deleteStudentTarget.full_name}</strong>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Register Number: </span>
                <strong>{deleteStudentTarget.register_number}</strong>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Department & Batch: </span>
                <span>{deleteStudentTarget.department_code} • {deleteStudentTarget.batch_name}</span>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Permanent Student ID: </span>
                <code>{deleteStudentTarget.id}</code>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteStudentTarget(null)}
                disabled={deletingStudent}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDeleteStudent}
                disabled={deletingStudent}
                style={{ backgroundColor: '#DC2626', borderColor: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={16} />
                {deletingStudent ? 'Deleting Student...' : 'Permanently Delete Student'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Delete Faculty Confirmation */}
      <Modal
        isOpen={!!deleteFacultyTarget}
        onClose={() => !deletingFaculty && setDeleteFacultyTarget(null)}
        title="Permanently Delete Faculty Profile"
        maxWidth="520px"
      >
        {deleteFacultyTarget && (
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
                  Are you sure you want to permanently delete this faculty profile? Their login account will be deleted and any currently assigned mentees will be safely released to 'Unassigned' status for reallocation.
                </p>
              </div>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #E2E8F0', fontSize: '0.875rem' }}>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Faculty Name: </span>
                <strong style={{ color: '#0B2545' }}>{deleteFacultyTarget.full_name}</strong>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Employee ID: </span>
                <strong>{deleteFacultyTarget.employee_id}</strong>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Designation: </span>
                <span>{deleteFacultyTarget.designation}</span>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Active Mentees: </span>
                <span className="badge badge-warning">{deleteFacultyTarget.mentee_count || 0} Mentees</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteFacultyTarget(null)}
                disabled={deletingFaculty}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDeleteFaculty}
                disabled={deletingFaculty}
                style={{ backgroundColor: '#DC2626', borderColor: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={16} />
                {deletingFaculty ? 'Deleting Faculty...' : 'Permanently Delete Faculty'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   ASSIGN MENTEES MODAL
   ═══════════════════════════════════════════════════════════════ */
interface AssignMenteesModalProps {
  faculty: any;
  departments: any[];
  batches: any[];
  onClose: () => void;
  onAssigned: (newCount: number) => void;
}

const AssignMenteesModal: React.FC<AssignMenteesModalProps> = ({
  faculty, departments, batches, onClose, onAssigned,
}) => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('unassigned');
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStudents = useCallback(async (params: Record<string, string>) => {
    setLoading(true);
    try {
      const res = await api.admin.getStudentsForAssignment(params);
      if (res.success) setStudents(res.data?.students || []);
    } catch { setStudents([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params: Record<string, string> = { limit: '50' };
      if (search.trim()) params.search = search.trim();
      if (deptFilter) params.department = deptFilter;
      if (batchFilter) params.batch = batchFilter;
      if (statusFilter) params.assignmentStatus = statusFilter;
      fetchStudents(params);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, deptFilter, batchFilter, statusFilter, fetchStudents]);

  const toggleSelect = (id: string, hasActiveMentor: boolean) => {
    if (hasActiveMentor) return; // already assigned elsewhere
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const eligibleIds = students.filter((s) => !s.has_active_mentor).map((s) => s.student_id);
    const allSelected = eligibleIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => { const n = new Set(prev); eligibleIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((prev) => { const n = new Set(prev); eligibleIds.forEach((id) => n.add(id)); return n; });
    }
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setAssigning(true);
    setResultMsg(null);
    try {
      const res = await api.admin.assignMentees(faculty.id, Array.from(selected));
      if (res.success) {
        const { assigned, alreadyAssigned, newMenteeCount } = res.data;
        let msg = `✅ ${assigned.length} student(s) assigned to ${faculty.full_name}.`;
        if (alreadyAssigned.length > 0) msg += ` (${alreadyAssigned.length} skipped — already have a mentor)`;
        setResultMsg(msg);
        toast.success(msg);
        setSelected(new Set());
        setShowConfirm(false);
        onAssigned(newMenteeCount);
        // Refresh list
        const params: Record<string, string> = { limit: '50', assignmentStatus: statusFilter };
        if (search.trim()) params.search = search.trim();
        fetchStudents(params);
      } else {
        const errMsg = res.message || 'Assignment failed.';
        setResultMsg('❌ ' + errMsg);
        toast.error(errMsg);
        setShowConfirm(false);
      }
    } catch (err: any) {
      setResultMsg('❌ ' + err.message);
      toast.error(err.message || 'Error assigning mentees.');
      setShowConfirm(false);
    } finally { setAssigning(false); }
  };

  const eligibleCount = students.filter((s) => !s.has_active_mentor && selected.has(s.student_id)).length;

  return (
    <div className="school-mobile-overlay" style={{ alignItems: 'center' }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '700px',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.18)', animation: 'scaleUp 0.18s ease',
        margin: '0 1rem',
      }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontWeight: 800, color: '#0B2545', fontSize: '1.1rem', marginBottom: '2px' }}>Assign Mentees</h3>
            <div style={{ fontSize: '0.82rem', color: '#475569' }}>
              <strong>{faculty.full_name}</strong> — {faculty.department_name} ({faculty.department_code})
              <span style={{ marginLeft: '0.75rem', color: '#64748B' }}>Currently: {faculty.mentee_count || 0} mentees</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}><X size={20} /></button>
        </div>

        {/* Filters */}
        <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or register number..."
              style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={{ padding: '0.5rem 0.6rem', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.82rem', flex: '0 0 auto' }}>
            <option value="">All Depts</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
          </select>
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} style={{ padding: '0.5rem 0.6rem', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.82rem', flex: '0 0 auto' }}>
            <option value="">All Batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.5rem 0.6rem', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.82rem', flex: '0 0 auto' }}>
            <option value="">All Status</option>
            <option value="unassigned">Unassigned Only</option>
            <option value="assigned">Already Assigned</option>
          </select>
        </div>

        {/* Result message */}
        {resultMsg && (
          <div style={{ padding: '0.6rem 1.5rem', background: resultMsg.startsWith('✅') ? '#D1FAE5' : '#FEE2E2', color: resultMsg.startsWith('✅') ? '#065F46' : '#DC2626', fontSize: '0.82rem', fontWeight: 600 }}>
            {resultMsg}
          </div>
        )}

        {/* Student List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.9rem' }}>⏳ Loading students...</div>
          ) : students.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.9rem' }}>
              {search ? `No students found for "${search}"` : 'No students found with current filters.'}
            </div>
          ) : (
            <>
              {/* Select All */}
              <div style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #F1F5F9' }}>
                <input
                  type="checkbox"
                  checked={students.filter((s) => !s.has_active_mentor).length > 0 && students.filter((s) => !s.has_active_mentor).every((s) => selected.has(s.student_id))}
                  onChange={toggleAll}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                  Select all unassigned ({students.filter((s) => !s.has_active_mentor).length})
                </span>
                {selected.size > 0 && (
                  <span style={{ marginLeft: 'auto', background: '#0B2545', color: '#fff', fontSize: '0.72rem', padding: '2px 10px', borderRadius: '9999px', fontWeight: 700 }}>
                    {selected.size} selected
                  </span>
                )}
              </div>

              {students.map((s) => {
                const isSelected = selected.has(s.student_id);
                const hasOtherMentor = s.has_active_mentor;
                return (
                  <div
                    key={s.student_id}
                    onClick={() => toggleSelect(s.student_id, hasOtherMentor)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1.5rem',
                      borderBottom: '1px solid #F8FAFC', cursor: hasOtherMentor ? 'not-allowed' : 'pointer',
                      background: isSelected ? '#EFF6FF' : hasOtherMentor ? '#FAFAFA' : 'transparent',
                      opacity: hasOtherMentor ? 0.7 : 1, transition: 'background 0.1s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(s.student_id, hasOtherMentor)}
                      disabled={hasOtherMentor}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '16px', height: '16px', marginTop: '2px', cursor: hasOtherMentor ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.875rem' }}>{s.full_name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '2px' }}>
                        <span style={{ background: '#F1F5F9', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>{s.register_number}</span>
                        <span>{s.department_code} • Year {s.year_of_study}</span>
                        <span>Batch: {s.batch_name}</span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      {hasOtherMentor ? (
                        <span style={{ fontSize: '0.72rem', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          ✓ Assigned: {s.current_mentor_name || 'Another mentor'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', background: '#F0FDF4', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '0 0 16px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {!showConfirm ? (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={selected.size === 0 || assigning}
                onClick={() => setShowConfirm(true)}
                style={{ minWidth: '200px' }}
              >
                <UserPlus size={16} /> Assign {selected.size > 0 ? `${selected.size} Student${selected.size !== 1 ? 's' : ''}` : 'Selected Students'}
              </button>
            </>
          ) : (
            <div style={{ width: '100%' }}>
              <div style={{ background: '#FEF3C7', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.88rem', color: '#92400E', fontWeight: 600 }}>
                ⚠ Assign <strong>{selected.size} student(s)</strong> to <strong>{faculty.full_name}</strong>?
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowConfirm(false)} disabled={assigning}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAssign} disabled={assigning} style={{ backgroundColor: '#059669' }}>
                  <CheckCircle2 size={16} /> {assigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   VIEW MENTEES MODAL
   ═══════════════════════════════════════════════════════════════ */
interface ViewMenteesModalProps {
  faculty: any;
  onClose: () => void;
  onCountChanged: (newCount: number) => void;
  onViewStudent: (studentId: string) => void;
}

const ViewMenteesModal: React.FC<ViewMenteesModalProps> = ({ faculty, onClose, onCountChanged, onViewStudent }) => {
  const toast = useToast();
  const [mentees, setMentees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [removeTarget, setRemoveTarget] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMentees = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '100' };
      if (q.trim()) params.search = q.trim();
      const res = await api.admin.getMentees(faculty.id, params);
      if (res.success) setMentees(res.data?.mentees || []);
    } catch { setMentees([]); }
    finally { setLoading(false); }
  }, [faculty.id]);

  useEffect(() => { fetchMentees(); }, [fetchMentees]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMentees(search), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchMentees]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await api.admin.removeAssignment(removeTarget.assignment_id);
      if (res.success) {
        const newCount = res.data?.newMenteeCount ?? 0;
        onCountChanged(newCount);
        setRemoveTarget(null);
        fetchMentees(search);
        toast.success('Assignment removed successfully.');
      } else {
        toast.error(res.message || 'Failed to remove assignment.');
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally { setRemoving(false); }
  };

  return (
    <div className="school-mobile-overlay" style={{ alignItems: 'center' }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '680px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.18)', animation: 'scaleUp 0.18s ease',
        margin: '0 1rem',
      }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontWeight: 800, color: '#0B2545', fontSize: '1.1rem', marginBottom: '2px' }}>
              {faculty.full_name}'s Mentees
            </h3>
            <div style={{ fontSize: '0.82rem', color: '#475569' }}>
              {faculty.department_name} ({faculty.department_code}) — {mentees.length} active mentee{mentees.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}><X size={20} /></button>
        </div>

        {/* Search */}
        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mentee name or register number..."
              style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
        </div>

        {/* Removal confirmation banner */}
        {removeTarget && (
          <div style={{ padding: '0.875rem 1.5rem', background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
            <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#991B1B', marginBottom: '0.6rem' }}>
              Remove <strong>{removeTarget.full_name}</strong> ({removeTarget.register_number}) from {faculty.full_name}?<br />
              <span style={{ fontWeight: 400, color: '#B91C1C', fontSize: '0.8rem' }}>Student data, meetings, counselling records remain intact.</span>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</button>
              <button className="btn btn-sm" style={{ background: '#DC2626', color: '#fff' }} onClick={handleRemove} disabled={removing}>
                {removing ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>⏳ Loading mentees...</div>
          ) : mentees.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.9rem' }}>
              {search ? `No mentees matching "${search}"` : `${faculty.full_name} has no assigned mentees yet.`}
            </div>
          ) : (
            mentees.map((m) => (
              <div
                key={m.student_id}
                style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}
              >
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.875rem' }}>{m.full_name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '2px' }}>
                    <span style={{ background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{m.register_number}</span>
                    <span>{m.department_code} • Yr {m.year_of_study}</span>
                    <span>{m.batch_name}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
                  {m.cgpa !== null && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: m.cgpa >= 7.5 ? '#059669' : m.cgpa >= 6 ? '#D97706' : '#DC2626' }}>
                      CGPA: {Number(m.cgpa).toFixed(2)}
                    </span>
                  )}
                  {m.total_arrears > 0 && (
                    <span style={{ fontSize: '0.72rem', background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      {m.total_arrears} Arrear{m.total_arrears !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                    onClick={() => onViewStudent(m.student_id)}
                    title="View full student details"
                  >
                    <Eye size={12} /> Details
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                    onClick={() => setRemoveTarget(m)}
                    title="Remove assignment (data preserved)"
                    disabled={!!removeTarget && removeTarget.student_id !== m.student_id}
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '0 0 16px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

