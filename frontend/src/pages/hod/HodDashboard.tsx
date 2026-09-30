import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StudentDetailsView } from '../common/StudentDetailsView';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';
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
  Download,
  Search,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';

interface HodDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const HodDashboard: React.FC<HodDashboardProps> = ({ currentTab, onSelectTab }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [faculty, setFaculty] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Reassignment Modal State for HOD
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignForm, setReassignForm] = useState({
    studentId: '',
    newMentorId: '',
    reasonForChange: 'Departmental faculty re-allocation',
    effectiveDate: new Date().toISOString().split('T')[0],
  });

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [stuRes, facRes, meetRes] = await Promise.all([
        api.students.list({ departmentId: user?.departmentId || '' }),
        api.admin.getFaculty(),
        api.meetings.list(),
      ]);

      if (stuRes.success) setStudents(stuRes.data?.students || []);
      if (facRes.success) setFaculty(facRes.data);
      if (meetRes.success) setMeetings(meetRes.data);
    } catch (err: any) {
      console.error('Failed to load HOD data:', err);
      setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.mentorship.reassign(reassignForm);
      setShowReassignModal(false);
      loadData();
      toast.success('Mentor reassigned successfully within department.');
    } catch (err: any) {
      toast.error('Reassignment failed: ' + err.message);
    }
  };

  // Reset student view when switching sidebar tabs
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

  const filteredStudents = students.filter(
    (s) =>
      !searchQuery ||
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.register_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {/* Overview Tab */}
      {currentTab === 'overview' && (
        <div>
          {/* Metrics */}
          <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EEF2F6', color: '#0B2545' }}>
                <GraduationCap size={24} />
              </div>
              <div className="stat-info">
                <h3>Department Mentees</h3>
                <div className="stat-value">{students.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                <Users size={24} />
              </div>
              <div className="stat-info">
                <h3>Department Faculty</h3>
                <div className="stat-value">{faculty.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                <CalendarCheck2 size={24} />
              </div>
              <div className="stat-info">
                <h3>Completed Sessions</h3>
                <div className="stat-value">{meetings.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
                <UserCheck size={24} />
              </div>
              <div className="stat-info">
                <h3>Allocation Rate</h3>
                <div className="stat-value">100%</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Quick Actions */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">HOD Operational Tools</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-gold" onClick={() => setShowReassignModal(true)}>
                  <UserCog size={16} /> Reassign Dept Mentor
                </button>
                <button className="btn btn-secondary" onClick={() => api.reports.downloadCsv()}>
                  <Download size={16} /> Export Department CSV
                </button>
              </div>
            </div>

            {/* Saturday Compliance */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><CalendarCheck2 size={18} /> Saturday Compliance</h3>
                <span className="badge badge-success">Active Rhythm</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
                All mentors conduct weekly sessions every Saturday at 10:30 AM. Session completion logs are monitored at the departmental level.
              </p>
            </div>
          </div>

          {/* Student Roster Quick View */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><GraduationCap size={18} /> Department Students Roster</h3>
              <div style={{ position: 'relative', width: '250px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '2rem', padding: '0.4rem 1rem 0.4rem 2rem', fontSize: '0.825rem' }}
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Batch</th>
                    <th>Assigned Mentor</th>
                    <th>Arrears</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No students have been assigned yet.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700 }}>{s.register_number}</td>
                        <td><strong>{s.full_name}</strong></td>
                        <td>{s.batch_name}</td>
                        <td><span className="badge badge-success">{s.current_mentor_name || 'Assigned'}</span></td>
                        <td>
                          <span className={`badge ${s.total_arrears > 0 ? 'badge-danger' : 'badge-primary'}`}>
                            {s.total_arrears || 0}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setSelectedStudentId(s.id)}
                            >
                              View Record Book
                            </button>
                            <button
                              className="btn btn-pdf btn-sm"
                              onClick={() => api.pdf.downloadStudentPdf(s.id, `KSRCE_Mentee_${s.register_number}_Dossier.pdf`)}
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
          </div>
        </div>
      )}

      {/* Students Tab */}
      {currentTab === 'students' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Department Mentees Directory
            </h2>
          </div>
          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Batch</th>
                    <th>Assigned Mentor</th>
                    <th>Standing Arrears</th>
                    <th>Saturday Sessions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No students have been assigned yet.
                      </td>
                    </tr>
                  ) : (
                    students.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700 }}>{s.register_number}</td>
                        <td><strong>{s.full_name}</strong></td>
                        <td>{s.batch_name}</td>
                        <td><span className="badge badge-success">{s.current_mentor_name}</span></td>
                        <td>
                          <span className={`badge ${s.total_arrears > 0 ? 'badge-danger' : 'badge-primary'}`}>
                            {s.total_arrears || 0}
                          </span>
                        </td>
                        <td>{s.completed_meetings_count || 0}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setSelectedStudentId(s.id)}
                            >
                              View Record Book
                            </button>
                            <button
                              className="btn btn-pdf btn-sm"
                              onClick={() => api.pdf.downloadStudentPdf(s.id, `KSRCE_Mentee_${s.register_number}_Dossier.pdf`)}
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
          </div>
        </div>
      )}

      {/* Faculty Mentors Tab */}
      {currentTab === 'faculty' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Department Faculty Mentors
            </h2>
          </div>
          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Emp ID</th>
                    <th>Faculty Name</th>
                    <th>Designation & Cabin</th>
                    <th>Contact</th>
                    <th>Assigned Mentees</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No faculty members available.
                      </td>
                    </tr>
                  ) : (
                    faculty.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 700 }}>{f.employee_id}</td>
                        <td><strong>{f.full_name}</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{f.email}</span></td>
                        <td>{f.designation}<br /><span style={{ fontSize: '0.75rem', color: '#64748B' }}>{f.cabin_location}</span></td>
                        <td>{f.phone_number || '-'}</td>
                        <td><strong style={{ color: '#0B2545' }}>{f.mentee_count || 0}</strong> Mentees</td>
                        <td>
                          <span className={`badge ${f.is_active ? 'badge-success' : 'badge-danger'}`}>
                            {f.is_active ? 'Active' : 'Inactive'}
                          </span>
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

      {/* Reassignment Tab */}
      {currentTab === 'reassignment' && (
        <div style={{ maxWidth: '650px' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Departmental Mentor Reassignment
            </h2>
          </div>
          <div className="card" style={{ borderLeft: '4px solid #C59B27' }}>
            <form onSubmit={handleReassign}>
              <div className="form-group">
                <label className="form-label">Select Student</label>
                <select
                  className="form-control"
                  value={reassignForm.studentId}
                  onChange={(e) => setReassignForm({ ...reassignForm, studentId: e.target.value })}
                  required
                >
                  <option value="">-- Choose Student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.register_number}) — Mentor: {s.current_mentor_name}
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
                  <option value="">-- Choose Faculty Member --</option>
                  {faculty.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.full_name} ({f.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Reason for Reassignment</label>
                <input
                  type="text"
                  className="form-control"
                  value={reassignForm.reasonForChange}
                  onChange={(e) => setReassignForm({ ...reassignForm, reasonForChange: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn btn-gold" style={{ width: '100%', padding: '0.75rem' }}>
                Reassign Mentor with Historical Ledger
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Saturday Meetings Tab */}
      {currentTab === 'meetings' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              Department Saturday Meeting Logs
            </h2>
          </div>
          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Student Name</th>
                    <th>Mentor Name</th>
                    <th>Venue</th>
                    <th>Attendance</th>
                    <th>Challenges Discussed</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 700 }}>{m.meeting_date}</td>
                      <td><strong>{m.student_name}</strong></td>
                      <td>{m.mentor_name}</td>
                      <td>{m.location}</td>
                      <td>
                        <span className={`badge ${m.attendance_status === 'PRESENT' ? 'badge-success' : 'badge-danger'}`}>
                          {m.attendance_status}
                        </span>
                      </td>
                      <td>{m.challenges_discussed || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {currentTab === 'reports' && (
        <div style={{ maxWidth: '650px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <BarChart3 size={40} style={{ color: '#0B2545', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545', marginBottom: '0.5rem' }}>
              Department Mentoring Analytics
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.5rem' }}>
              Export complete student rosters, standing arrears, meeting attendances, and counselling summaries.
            </p>
            <button className="btn btn-primary" onClick={() => api.reports.downloadCsv()}>
              <Download size={16} /> Download Department Mentee Roster (CSV)
            </button>
          </div>
        </div>
      )}

      {/* Modal: Reassign */}
      <Modal
        isOpen={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        title="Departmental Mentor Reassignment"
      >
        <form onSubmit={handleReassign}>
          <div className="form-group">
            <label className="form-label">Select Student</label>
            <select
              className="form-control"
              value={reassignForm.studentId}
              onChange={(e) => setReassignForm({ ...reassignForm, studentId: e.target.value })}
              required
            >
              <option value="">-- Choose Student --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.register_number}) — Mentor: {s.current_mentor_name}
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
              <option value="">-- Choose Faculty Member --</option>
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name} ({f.designation})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Reason for Reassignment</label>
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
    </div>
  );
};
