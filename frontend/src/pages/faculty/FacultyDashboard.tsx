import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StudentDetailsView, StudentDetailsTab } from '../common/StudentDetailsView';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';
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
} from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentInitialTab, setStudentInitialTab] = useState<StudentDetailsTab>('overview');

  const loadData = async () => {
    setLoading(true);
    try {
      const [menteesRes, meetingsRes, scheduleRes] = await Promise.all([
        api.students.list({ mentorId: user?.facultyId || '' }),
        api.meetings.list({ mentorId: user?.facultyId || '' }),
        api.meetings.getSchedule(),
      ]);

      if (menteesRes.success) setMentees(menteesRes.data);
      if (meetingsRes.success) setMeetings(meetingsRes.data);
      if (scheduleRes.success) setSchedule(scheduleRes.data);
    } catch (err) {
      console.error('Failed to load faculty data:', err);
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
      <StudentDetailsView
        studentId={selectedStudentId}
        initialTab={studentInitialTab}
        onBack={() => {
          setSelectedStudentId(null);
          setStudentInitialTab('overview');
        }}
      />
    );
  }

  // Filtered mentees
  const filteredMentees = mentees.filter((m) => {
    return (
      !searchQuery ||
      m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.register_number?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const studentsWithArrears = mentees.filter((m) => (m.total_arrears || 0) > 0);

  return (
    <div>
      {/* Overview Tab */}
      {currentTab === 'overview' && (
        <div>
          {/* Stat Cards */}
          <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EEF2F6', color: '#0B2545' }}>
                <Users size={24} />
              </div>
              <div className="stat-info">
                <h3>Total Assigned Mentees</h3>
                <div className="stat-value">{mentees.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
                <AlertTriangle size={24} />
              </div>
              <div className="stat-info">
                <h3>Students Needing Attention</h3>
                <div className="stat-value">{studentsWithArrears.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                <CalendarCheck2 size={24} />
              </div>
              <div className="stat-info">
                <h3>Meetings Conducted</h3>
                <div className="stat-value">{meetings.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                <Clock size={24} />
              </div>
              <div className="stat-info">
                <h3>Next Saturday Session</h3>
                <div className="stat-value" style={{ fontSize: '1rem', marginTop: '6px' }}>
                  {schedule?.nextSaturdayDate || 'Saturday'}
                </div>
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

            <div className="table-responsive">
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
          </div>
        </div>
      )}

      {/* Mentees Full Directory Tab */}
      {currentTab === 'mentees' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
              My Assigned Mentees Directory
            </h2>
            <div style={{ width: '280px', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '2rem' }}
                placeholder="Search by Name or Reg No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredMentees.length === 0 ? (
            <EmptyState
              icon={<Users size={32} />}
              title={searchQuery ? "No Mentees Found" : "No Mentees Assigned Yet"}
              description={searchQuery ? "No assigned mentees match your search filter." : "When the administrator or HOD allocates mentees to your profile, their student cards and academic dossiers will appear here."}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
              {filteredMentees.map((m) => {
              const studentInitials = m.full_name
                ? m.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                : 'ST';
              const completion = m.profile_completion_percentage ?? (m.profile_completed ? 100 : 40);
              const arrears = m.total_arrears ?? 0;
              const cgpaVal = m.cgpa ? Number(m.cgpa).toFixed(2) : (m.latest_cgpa ? Number(m.latest_cgpa).toFixed(2) : 'N/A');
              const nextMeeting = m.next_meeting_date || schedule?.nextSaturdayDate || 'Next Saturday';
              const meetingStatus = m.meeting_status || 'SCHEDULED';

              return (
                <div
                  key={m.id || m._id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 12px rgba(11, 37, 69, 0.05)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top Header: Photo/Avatar + Identity */}
                  <div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      {/* Student Photo / Avatar */}
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          minWidth: '56px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #0B2545 0%, #134074 100%)',
                          color: '#C59B27',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1.25rem',
                          border: '2px solid #C59B27',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h4
                            style={{
                              fontSize: '1.1rem',
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
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: '#B45309',
                              backgroundColor: '#FEF3C7',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {m.register_number}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '6px', flexWrap: 'wrap' }}>
                          <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>
                            {m.department_code || m.department_name || 'ENGINEERING'}
                          </span>
                          <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                            {m.batch_name || 'Batch'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Academic Performance Indicators */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        border: '1px solid #EDF2F7',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                          Current CGPA
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0B2545', marginTop: '2px' }}>
                          {cgpaVal}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                          Arrears Count
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <span
                            className={`badge ${arrears > 0 ? 'badge-danger' : 'badge-success'}`}
                            style={{ fontWeight: 700, fontSize: '0.8rem' }}
                          >
                            {arrears > 0 ? `${arrears} Standing` : '0 (Clear)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Profile Completion Progress */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        <span>Profile Completion</span>
                        <span style={{ color: completion >= 100 ? '#059669' : '#D97706' }}>{completion}%</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
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

                    {/* Mentorship & Meeting Details */}
                    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.7, marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Current Mentor:</span>
                        <strong style={{ color: '#0B2545' }}>{m.current_mentor_name || user?.fullName || 'Assigned Mentor'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Next Saturday Meeting:</span>
                        <strong style={{ color: '#0B2545' }}>{nextMeeting}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <span style={{ color: '#64748B' }}>Meeting Status:</span>
                        <span
                          className={`badge ${
                            meetingStatus === 'COMPLETED'
                              ? 'badge-success'
                              : meetingStatus === 'SCHEDULED'
                              ? 'badge-info'
                              : 'badge-warning'
                          }`}
                          style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}
                        >
                          {meetingStatus.toLowerCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #F1F5F9' }}>
                    <button
                      className="btn btn-primary"
                      style={{
                        flex: 1,
                        padding: '0.6rem 1rem',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        letterSpacing: '0.3px',
                      }}
                      onClick={() => {
                        setStudentInitialTab('overview');
                        setSelectedStudentId(m.id || m._id);
                      }}
                    >
                      VIEW DETAILS <ArrowRight size={15} />
                    </button>
                    <button
                      className="btn btn-pdf btn-sm"
                      title="Download Dossier PDF"
                      onClick={() => api.pdf.downloadStudentPdf(m.id || m._id, `KSRCE_Mentee_${m.register_number}_Dossier.pdf`)}
                      style={{ padding: '0.6rem 0.85rem' }}
                    >
                      <FileText size={16} /> PDF
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

    </div>
  );
};
