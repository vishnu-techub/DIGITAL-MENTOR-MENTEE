import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  api,
  ApiError,
  type HodDashboardData,
  type HodDepartmentOverview,
  type HodStudentRow,
  type HodFacultyRow,
  type HodMentorWiseRow,
  type HodMentorDetail,
  type HodReport30Day,
  type HodWeeklyProgress,
  type HodFacultyNotification,
  type HodDepartmentNotification,
  type HodDepartmentNotificationPayload,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { HodPlacementPanel } from '../../components/placement/HodPlacementPanel';
import { LeaderboardView } from '../../components/leaderboard/LeaderboardView';
import { StudentDetailsView } from '../common/StudentDetailsView';
import { Modal } from '../../components/common/Modal';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
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
  UserCheck,
  UserCog,
  Download,
  Search,
  BarChart3,
  FileText,
  UserPlus,
  Pencil,
  Bell,
  PieChart as PieChartIcon,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

interface HodDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phoneNumber: '',
  registerNumber: '',
  batchId: '',
  year: '',
  section: '',
  employeeId: '',
  designation: 'Assistant Professor',
  cabinLocation: '',
};

/* ------------------------------------------------------------------ charts */

/**
 * Monthly PIE — Mentored vs Pending.
 *
 * Rendered as inline SVG so the dashboard needs no charting dependency. Both
 * slices come straight from `data.pie`, which the server computes from stored
 * mentoring records.
 */
const PieChart: React.FC<{ pie: HodDashboardData['pie'] }> = ({ pie }) => {
  const total = Math.max(0, pie.mentored + pie.pending);
  const radius = 60;
  const cx = 70;
  const cy = 70;

  const arc = (fraction: number) => {
    // Start at 12 o'clock, sweep clockwise.
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const largeArc = fraction > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y} Z`;
  };

  const mentoredFraction = total > 0 ? pie.mentored / total : 0;

  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-slate-500)' }}>
        <PieChartIcon size={36} style={{ color: 'var(--color-slate-300)', marginBottom: '0.5rem' }} />
        <p style={{ fontSize: '0.85rem' }}>No students in this department to report on yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <svg
        width="140"
        height="140"
        viewBox="0 0 140 140"
        role="img"
        aria-label={`Mentored ${pie.mentored}, pending ${pie.pending} for ${pie.month}`}
      >
        <circle cx={cx} cy={cy} r={radius} fill="#F1F5F9" />
        <path d={arc(mentoredFraction)} fill="#059669" />
        <path d={arc(1 - mentoredFraction)} fill="#E11D48" />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          style={{ fontSize: '20px', fontWeight: 800, fill: '#0B2545' }}
        >
          {pie.mentored}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" style={{ fontSize: '9px', fill: '#64748B' }}>
          MENTORED
        </text>
      </svg>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <span className="badge badge-success">Mentored — {pie.mentored}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', marginTop: '0.25rem' }}>
            {total > 0 ? Math.round(mentoredFraction * 100) : 0}% of {pie.total} students
          </div>
        </div>
        <div>
          <span className="badge badge-danger">Pending — {pie.pending}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', marginTop: '0.25rem' }}>
            {total > 0 ? Math.round((1 - mentoredFraction) * 100) : 0}% of {pie.total} students
          </div>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-400)' }}>Reporting month: {pie.month}</div>
      </div>
    </div>
  );
};

/** Reuses the global progress track; the value is always a real server figure. */
const CoverageBar: React.FC<{ percent: number }> = ({ percent }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '120px' }}>
    <div className="progress-track" style={{ flex: 1 }}>
      <div
        className="progress-fill"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          background: percent >= 80 ? 'var(--color-success-600)' : percent >= 50 ? 'var(--color-warning-600)' : '#E11D48',
        }}
      />
    </div>
    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-navy-800)', minWidth: '34px' }}>
      {percent}%
    </span>
  </div>
);

/**
 * Weekly progress over the 30-day reporting window (4 weekly periods).
 * Week / students covered / sessions / coverage % — every figure is a stored
 * server count for that bucket, never a derived placeholder.
 */
const WeeklyProgressList: React.FC<{ weeks: HodWeeklyProgress[] }> = ({ weeks }) => {
  if (weeks.length === 0) return null;
  const hasActivity = weeks.some((w) => w.sessions > 0 || w.studentsMentored > 0);
  if (!hasActivity) {
    return (
      <EmptyState
        icon={<TrendingUp size={24} />}
        title="No weekly activity in this window"
        description="No stored counselling records or Saturday meetings were logged in the last 30 days."
      />
    );
  }
  return (
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Week</th>
            <th>Students Covered</th>
            <th>Sessions</th>
            <th>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td style={{ fontSize: '0.78rem', color: 'var(--color-slate-600)' }}>{w.weekLabel}</td>
              <td><strong>{w.studentsMentored}</strong></td>
              <td>{w.sessions}</td>
              <td><CoverageBar percent={w.coveragePercent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------------ helpers */

/** The current calendar month in the server's UTC `YYYY-MM` convention. */
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

/** `YYYY-MM` -> "October 2026" for headers and badges. */
const monthLabel = (m: string): string => {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo || mo < 1 || mo > 12) return m;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** `YYYY-MM` -> "Oct 2026" for compact labels. */
const monthShort = (m: string): string => {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo || mo < 1 || mo > 12) return m;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const statCard = (icon: React.ReactNode, bg: string, fg: string, label: string, value: React.ReactNode) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ backgroundColor: bg, color: fg }}>
      {icon}
    </div>
    <div className="stat-info">
      <h3>{label}</h3>
      <div className="stat-value">{value}</div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ screen */

export const HodDashboard: React.FC<HodDashboardProps> = ({ currentTab, onSelectTab }) => {
  const toast = useToast();

  const [dashboard, setDashboard] = useState<HodDashboardData | null>(null);
  const [overview, setOverview] = useState<HodDepartmentOverview | null>(null);
  const [students, setStudents] = useState<HodStudentRow[]>([]);
  const [faculty, setFaculty] = useState<HodFacultyRow[]>([]);
  const [mentorWise, setMentorWise] = useState<HodMentorWiseRow[]>([]);
  const [notifications, setNotifications] = useState<HodFacultyNotification[]>([]);
  const [report, setReport] = useState<HodReport30Day | null>(null);
  const [meetings, setMeetings] = useState<any[]>([]);

  // Notices this department's faculty have sent TO this HOD, loaded only when
  // the sidebar opens the Faculty Notifications tab.
  const [deptNotes, setDeptNotes] = useState<HodDepartmentNotificationPayload | null>(null);
  const [deptNotesLoading, setDeptNotesLoading] = useState(false);
  const [noteDetail, setNoteDetail] = useState<HodDepartmentNotification | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Reporting month driving the monthly analytics (dashboard, pie, mentor-wise,
  // mentor detail). Defaults to the current month; the server re-derives every
  // monthly figure from stored records for whichever month is selected.
  const [month, setMonth] = useState(CURRENT_MONTH);
  // Client-side mentor filter on the monthly coverage table.
  const [mentorFilter, setMentorFilter] = useState('');
  const [reportError, setReportError] = useState<ApiError | null>(null);

  // Mentor detail
  const [detail, setDetail] = useState<HodMentorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add / edit modals
  const [studentModal, setStudentModal] = useState<'add' | 'edit' | null>(null);
  const [studentForm, setStudentForm] = useState({ ...EMPTY_FORM });
  const [editingStudent, setEditingStudent] = useState<HodStudentRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [facultyModal, setFacultyModal] = useState<'add' | 'edit' | null>(null);
  const [facultyForm, setFacultyForm] = useState({ ...EMPTY_FORM });
  const [editingFaculty, setEditingFaculty] = useState<HodFacultyRow | null>(null);

  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignForm, setReassignForm] = useState({
    studentId: '',
    newMentorId: '',
    reasonForChange: 'Departmental faculty re-allocation',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dash, ov, stu, fac, mw, notes, meets] = await Promise.all([
        api.hod.dashboard({ month }),
        api.hod.departmentOverview(),
        api.hod.students.list(),
        api.hod.faculty.list(),
        api.hod.mentorWise({ month }),
        api.hod.facultyNotifications(),
        api.meetings.list(),
      ]);
      setDashboard(dash.data);
      setOverview(ov.data);
      setStudents(stu.data || []);
      setFaculty(fac.data || []);
      setMentorWise(mw.data || []);
      setNotifications(notes.data || []);
      setMeetings(Array.isArray(meets.data) ? meets.data : []);
    } catch (err: any) {
      console.error('Failed to load HOD data:', err);
      setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));
    } finally {
      setLoading(false);
    }
    // The selected reporting month scopes the dashboard + mentor-wise payloads.
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadReport = useCallback(async () => {
    setReportError(null);
    try {
      const res = await api.hod.report30Day();
      setReport(res.data);
    } catch (err: any) {
      console.error('Failed to load the 30-day report:', err);
      setReportError(err instanceof ApiError ? err : new ApiError(500, err?.message));
      toast.error('Could not load the 30-day report: ' + err.message);
    }
  }, [toast]);

  useEffect(() => {
    if (currentTab === 'reports') loadReport();
  }, [currentTab, loadReport]);

  const loadDeptNotifications = useCallback(async () => {
    setDeptNotesLoading(true);
    try {
      const res = await api.hod.departmentNotifications();
      setDeptNotes(res.data);
    } catch (err: any) {
      toast.error('Could not load faculty notifications: ' + err.message);
    } finally {
      setDeptNotesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (currentTab === 'notifications') loadDeptNotifications();
  }, [currentTab, loadDeptNotifications]);

  const markNoteRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setDeptNotes((prev) =>
        prev
          ? {
              ...prev,
              notifications: prev.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
              unreadCount: Math.max(0, prev.unreadCount - 1),
            }
          : prev
      );
      setNoteDetail((prev) => (prev && prev.id === id ? { ...prev, is_read: true } : prev));
    } catch (err: any) {
      toast.error('Could not mark as read: ' + err.message);
    }
  };

  const openMentor = async (mentorId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.hod.mentorDetail(mentorId, { month });
      setDetail(res.data);
    } catch (err: any) {
      toast.error('Could not load mentor detail: ' + err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Reassignment means ending the active row first, so history is retained
      // (status COMPLETED) instead of being overwritten. The server refuses a
      // second active assignment for the same student, so this ordering matters.
      const student = students.find((s: any) => s.id === reassignForm.studentId);
      if (student?.assignment_id) {
        await api.hod.removeMentor(student.assignment_id);
      }
      await api.hod.assignMentor({
        studentId: reassignForm.studentId,
        mentorId: reassignForm.newMentorId,
        reason: reassignForm.reasonForChange,
      });
      setShowReassignModal(false);
      setReassignForm({ ...reassignForm, studentId: '', newMentorId: '' });
      await loadData();
      toast.success(
        student?.assignment_id
          ? 'Previous mentor assignment ended and the student reassigned.'
          : 'Mentor assigned within your department.'
      );
    } catch (err: any) {
      toast.error('Assignment failed: ' + err.message);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const submitStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (studentModal === 'add') {
        await api.hod.students.create({
          fullName: studentForm.fullName,
          registerNumber: studentForm.registerNumber,
          email: studentForm.email,
          batchId: studentForm.batchId,
          year: studentForm.year ? Number(studentForm.year) : undefined,
          section: studentForm.section,
          mobileNumber: studentForm.phoneNumber,
        });
        toast.success('Student added to your department.');
      } else if (editingStudent) {
        await api.hod.students.update(editingStudent.id, {
          fullName: studentForm.fullName,
          email: studentForm.email,
          year: studentForm.year ? Number(studentForm.year) : undefined,
          section: studentForm.section,
          mobileNumber: studentForm.phoneNumber,
        });
        toast.success('Student updated.');
      }
      setStudentModal(null);
      setEditingStudent(null);
      setStudentForm({ ...EMPTY_FORM });
      await loadData();
    } catch (err: any) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (facultyModal === 'add') {
        await api.hod.faculty.create({
          fullName: facultyForm.fullName,
          email: facultyForm.email,
          employeeId: facultyForm.employeeId,
          designation: facultyForm.designation,
          cabinLocation: facultyForm.cabinLocation,
          phoneNumber: facultyForm.phoneNumber,
        });
        toast.success('Faculty member added to your department.');
      } else if (editingFaculty) {
        await api.hod.faculty.update(editingFaculty.id, {
          fullName: facultyForm.fullName,
          email: facultyForm.email,
          designation: facultyForm.designation,
          cabinLocation: facultyForm.cabinLocation,
          phoneNumber: facultyForm.phoneNumber,
        });
        toast.success('Faculty member updated.');
      }
      setFacultyModal(null);
      setEditingFaculty(null);
      setFacultyForm({ ...EMPTY_FORM });
      await loadData();
    } catch (err: any) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset the student drill-down when the sidebar tab changes.
  useEffect(() => {
    setSelectedStudentId(null);
  }, [currentTab]);

  // Hooks must all run before any early return below, otherwise the hook
  // count changes between the loading/error render and a normal render.
  const unassignedStudents = useMemo(
    () => students.filter((s) => !s.mentor_id),
    [students]
  );

  if (selectedStudentId) {
    return <StudentDetailsView studentId={selectedStudentId} onBack={() => setSelectedStudentId(null)} />;
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

  const summary = dashboard?.summary;
  const pie = dashboard?.pie;
  const weekly = dashboard?.weeklyProgress || [];

  const filteredStudents = students.filter(
    (s) =>
      !searchQuery ||
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.register_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openStudentAdd = () => {
    setStudentForm({ ...EMPTY_FORM });
    setEditingStudent(null);
    setStudentModal('add');
  };

  const openStudentEdit = (s: HodStudentRow) => {
    setStudentForm({
      ...EMPTY_FORM,
      fullName: s.full_name,
      email: s.email || '',
      registerNumber: s.register_number,
      batchId: '',
      year: s.year ? String(s.year) : '',
      section: s.section || '',
      phoneNumber: s.mobile_number || '',
    });
    setEditingStudent(s);
    setStudentModal('edit');
  };

  const openFacultyAdd = () => {
    setFacultyForm({ ...EMPTY_FORM });
    setEditingFaculty(null);
    setFacultyModal('add');
  };

  const openFacultyEdit = (f: HodFacultyRow) => {
    setFacultyForm({
      ...EMPTY_FORM,
      fullName: f.full_name,
      email: f.email || '',
      employeeId: f.employee_id,
      designation: f.designation || '',
      cabinLocation: f.cabin_location || '',
      phoneNumber: f.phone_number || '',
    });
    setEditingFaculty(f);
    setFacultyModal('edit');
  };

  const mentorRows = mentorWise.filter((m) => m.totalMentees > 0);
  const filteredMentorRows = mentorFilter
    ? mentorRows.filter((m) => m.mentorId === mentorFilter)
    : mentorRows;

  return (
    <div>
      {/* ============================ OVERVIEW ============================ */}
      {currentTab === 'overview' && (
        <div>
          {/* Department overview: identity + which reporting month drives the
              monthly figures below. */}
          <PageHeader
            eyebrow={dashboard?.department?.name || 'Department'}
            title="Department Overview"
            subtitle={
              <>
                HOD: <strong>{dashboard?.department?.hodName || '—'}</strong>
                {dashboard?.department?.code ? <> · {dashboard.department.code}</> : null}
                {' · '}Reporting month: <strong>{monthLabel(month)}</strong>
              </>
            }
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label className="form-label" htmlFor="hod-reporting-month" style={{ margin: 0 }}>
                  Reporting month
                </label>
                <input
                  id="hod-reporting-month"
                  type="month"
                  className="form-control"
                  style={{ width: 'auto' }}
                  value={month}
                  onChange={(e) => {
                    // Ignore a cleared/partial value so the current month stays applied.
                    const v = e.target.value;
                    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) setMonth(v);
                  }}
                />
              </div>
            }
          />

          <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
            {statCard(<GraduationCap size={24} />, 'var(--color-navy-50)', 'var(--color-navy-800)', 'Students', summary?.totalStudents ?? 0)}
            {statCard(<Users size={24} />, '#EFF6FF', 'var(--color-navy-500)', 'Faculty', summary?.totalFaculty ?? 0)}
            {statCard(<UserCheck size={24} />, '#F5F3FF', '#6D28D9', 'Mentors', summary?.totalMentors ?? 0)}
            {statCard(<UserCog size={24} />, '#F0FDFA', '#0F766E', 'Active Mentees', summary?.assignedMentees ?? 0)}
            {statCard(
              <CalendarCheck2 size={24} />,
              'var(--color-success-50)',
              'var(--color-success-600)',
              month === CURRENT_MONTH ? 'Mentored This Month' : `Mentored ${monthShort(month)}`,
              summary?.mentoredThisMonth ?? 0
            )}
            {statCard(
              <AlertTriangle size={24} />,
              '#FFF1F2',
              '#E11D48',
              month === CURRENT_MONTH ? 'Pending' : `Pending ${monthShort(month)}`,
              summary?.studentsNotMentoredThisMonth ?? 0
            )}
            {statCard(
              <BarChart3 size={24} />,
              'var(--color-warning-50)',
              'var(--color-warning-600)',
              'Coverage %',
              (summary?.totalStudents ?? 0) === 0
                ? 'No students'
                : `${summary?.overallMentoringCoverage ?? 0}%`
            )}
          </div>

          {(summary?.totalStudents ?? 0) === 0 && (
            <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
              No students in your department yet — coverage will appear once students are added
              and assigned a mentor.
            </div>
          )}

          <div className="hod-split-wide">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <PieChartIcon size={18} /> Monthly Mentorship Split
                </h3>
              </div>
              {pie ? <PieChart pie={pie} /> : null}
              {pie && pie.total > 0 && pie.mentored === 0 ? (
                <div className="overview-summary-foot">
                  No mentoring records stored for <strong>{monthLabel(month)}</strong> yet — every
                  student is pending for this month.
                </div>
              ) : null}
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <TrendingUp size={18} /> Weekly Progress
                </h3>
                <span className="badge badge-neutral">30-day window · 4 weeks</span>
              </div>
              <WeeklyProgressList weeks={weekly} />
            </div>
          </div>

          {/* Monthly mentoring coverage — distinct-student rule, month-scoped,
              with a client-side mentor filter. */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">
                <BarChart3 size={18} /> Monthly Mentoring Coverage
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="form-control"
                  style={{ width: 'auto', fontSize: '0.825rem' }}
                  value={mentorFilter}
                  onChange={(e) => setMentorFilter(e.target.value)}
                  aria-label="Filter coverage by mentor"
                >
                  <option value="">All mentors</option>
                  {mentorRows.map((m) => (
                    <option key={m.mentorId} value={m.mentorId}>
                      {m.mentorName || m.employeeId || m.mentorId}
                    </option>
                  ))}
                </select>
                <span className="badge badge-neutral">{monthShort(month)}</span>
              </div>
            </div>
            {filteredMentorRows.length === 0 ? (
              <EmptyState
                icon={<BarChart3 size={24} />}
                title="No mentor assignments yet"
                description="Once mentors are assigned to students, their monthly coverage appears here."
              />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mentor Name</th>
                        <th>Total Mentees</th>
                        <th>Mentored {monthShort(month)}</th>
                        <th>Pending</th>
                        <th>Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMentorRows.map((m) => (
                        <tr key={m.mentorId}>
                          <td>
                            <strong>{m.mentorName || '—'}</strong>
                            <br />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{m.employeeId}</span>
                          </td>
                          <td>{m.totalMentees}</td>
                          <td>{m.mentoredThisMonth}</td>
                          <td>{m.pending}</td>
                          <td><CoverageBar percent={m.coveragePercent} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {summary && summary.totalStudents > 0 && summary.mentoredThisMonth === 0 ? (
                  <div className="overview-summary-foot">
                    No mentoring records stored for <strong>{monthLabel(month)}</strong> — every
                    mentee is pending this month.
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="hod-split-half">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">HOD Operational Tools</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-gold" onClick={() => setShowReassignModal(true)}>
                  <UserCog size={16} /> Assign Department Mentor
                </button>
                <button className="btn btn-secondary" onClick={() => api.reports.downloadCsv()}>
                  <Download size={16} /> Export Department CSV
                </button>
              </div>
              {overview ? (
                <div className="overview-summary-grid" style={{ marginTop: '1.25rem' }}>
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Batches</span>
                    <span className="overview-summary-value">{overview.batchCount}</span>
                  </div>
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Unassigned</span>
                    <span className="overview-summary-value">{overview.unassignedStudents}</span>
                  </div>
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Sessions</span>
                    <span className="overview-summary-value">{overview.totalMentoringSessions}</span>
                  </div>
                </div>
              ) : null}
              <div className="overview-summary-foot">
                Last mentoring activity:{' '}
                <strong>{summary?.lastMentoringActivity || 'No mentoring recorded yet'}</strong>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <Bell size={18} /> Faculty Notifications
                </h3>
                <span className="badge badge-secondary">{notifications.length}</span>
              </div>
              {notifications.length === 0 ? (
                <EmptyState
                  icon={<Bell size={24} />}
                  title="No faculty notifications"
                  description="Notifications raised for your department's faculty will appear here."
                />
              ) : (
                <div className="timeline" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  {notifications.slice(0, 12).map((n) => (
                    <div className="timeline-item" key={n.id}>
                      <div className="timeline-dot" />
                      <div>
                        <strong style={{ fontSize: '0.82rem' }}>{n.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-600)' }}>{n.message}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-slate-400)' }}>
                          {n.faculty_name || 'Faculty'} · {n.created_at || '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <GraduationCap size={18} /> Department Students Roster
              </h3>
              <div style={{ position: 'relative', width: '250px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-slate-400)' }} />
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
                    <th>Last Mentored</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-slate-500)' }}>
                        No students in your department yet.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700 }}>{s.register_number}</td>
                        <td><strong>{s.full_name}</strong></td>
                        <td>{s.batch_name || '—'}</td>
                        <td>
                          <span className={`badge ${s.current_mentor_name ? 'badge-success' : 'badge-warning'}`}>
                            {s.current_mentor_name || 'Unassigned'}
                          </span>
                        </td>
                        <td>{s.last_mentoring_date || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedStudentId(s.id)}>
                              View Record Book
                            </button>
                            <button className="btn btn-pdf btn-sm" onClick={() => api.pdf.downloadStudentPdf(s.id, `KSRCE_Mentee_${s.register_number}_Dossier.pdf`)}>
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

      {/* ============================ STUDENTS ============================ */}
      {currentTab === 'students' && (
        <div>
          <PageHeader
            eyebrow="Department"
            title="Department Mentees Directory"
            subtitle="Search, mentor and maintain the students enrolled in your department."
            actions={
              <>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-slate-400)' }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '2rem', fontSize: '0.825rem' }}
                    placeholder="Search name / register no."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button className="btn btn-gold" onClick={openStudentAdd}>
                  <UserPlus size={16} /> Add Student
                </button>
              </>
            }
          />

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Batch</th>
                    <th>Assigned Mentor</th>
                    <th>This Month</th>
                    <th>Sessions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-slate-500)' }}>
                        No students found in your department.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700 }}>{s.register_number}</td>
                        <td><strong>{s.full_name}</strong></td>
                        <td>{s.batch_name || '—'}</td>
                        <td>
                          <span className={`badge ${s.current_mentor_name ? 'badge-success' : 'badge-warning'}`}>
                            {s.current_mentor_name || 'Unassigned'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${s.mentored_this_month ? 'badge-success' : 'badge-danger'}`}>
                            {s.mentored_this_month ? 'Mentored' : 'Pending'}
                          </span>
                        </td>
                        <td>{s.session_count}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedStudentId(s.id)}>
                              View
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={() => openStudentEdit(s)}>
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              className="btn btn-gold btn-sm"
                              onClick={() => {
                                setReassignForm({ ...reassignForm, studentId: s.id, newMentorId: s.mentor_id || '' });
                                setShowReassignModal(true);
                              }}
                            >
                              <UserCog size={14} /> Mentor
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

      {/* ============================ FACULTY ============================ */}
      {currentTab === 'faculty' && (
        <div>
          <PageHeader
            eyebrow="Department"
            title="Department Faculty Mentors"
            subtitle="Faculty mentors in your department and the mentees assigned to them."
            actions={
              <button className="btn btn-gold" onClick={openFacultyAdd}>
                <UserPlus size={16} /> Add Faculty
              </button>
            }
          />

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
                    <th>Coverage</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-slate-500)' }}>
                        No faculty members in your department.
                      </td>
                    </tr>
                  ) : (
                    faculty.map((f) => {
                      const row = mentorWise.find((m) => m.mentorId === f.id);
                      return (
                        <tr key={f.id}>
                          <td style={{ fontWeight: 700 }}>{f.employee_id}</td>
                          <td>
                            <strong>{f.full_name}</strong>
                            <br />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{f.email}</span>
                          </td>
                          <td>
                            {f.designation}
                            <br />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{f.cabin_location}</span>
                          </td>
                          <td>{f.phone_number || '—'}</td>
                          <td>
                            <strong style={{ color: 'var(--color-navy-800)' }}>{f.mentee_count}</strong> Mentees
                          </td>
                          <td>{row ? <CoverageBar percent={row.coveragePercent} /> : '—'}</td>
                          <td>
                            <span className={`badge ${f.is_active ? 'badge-success' : 'badge-danger'}`}>
                              {f.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openMentor(f.id)}
                                disabled={detailLoading}
                              >
                                View Detail
                              </button>
                              <button className="btn btn-outline btn-sm" onClick={() => openFacultyEdit(f)}>
                                <Pencil size={14} /> Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================ REASSIGNMENT ============================ */}
      {currentTab === 'reassignment' && (
        <div style={{ maxWidth: '650px' }}>
          <PageHeader
            eyebrow="Mentoring"
            title="Departmental Mentor Assignment"
            subtitle="Only students and faculty of your own department can be selected. The server re-checks the department on every write."
          />
          <div className="card" style={{ borderLeft: '4px solid var(--color-gold-500)' }}>
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
                      {s.full_name} ({s.register_number}) — Mentor: {s.current_mentor_name || 'Unassigned'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Assign Mentor</label>
                <select
                  className="form-control"
                  value={reassignForm.newMentorId}
                  onChange={(e) => setReassignForm({ ...reassignForm, newMentorId: e.target.value })}
                  required
                >
                  <option value="">-- Choose Faculty Member --</option>
                  {faculty.filter((f) => f.is_active).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.full_name} ({f.designation}) — {f.mentee_count} mentees
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Reason for Assignment</label>
                <input
                  type="text"
                  className="form-control"
                  value={reassignForm.reasonForChange}
                  onChange={(e) => setReassignForm({ ...reassignForm, reasonForChange: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn btn-gold" style={{ width: '100%', padding: '0.75rem' }} disabled={saving}>
                Assign Mentor with Historical Ledger
              </button>
            </form>
          </div>

          {unassignedStudents.length > 0 && (
            <div className="alert alert-warning" style={{ marginTop: '1.25rem' }}>
              <strong>{unassignedStudents.length}</strong> student(s) in your department still have no
              mentor.
            </div>
          )}
        </div>
      )}

      {/* ============================ PLACEMENT ============================ */}
      {currentTab === 'placement' && <HodPlacementPanel />}

      {/* ============================ LEADERBOARD ============================ */}
      {currentTab === 'leaderboard' && <LeaderboardView />}

      {/* ============================ MEETINGS ============================ */}
      {currentTab === 'meetings' && (
        <div>
          <PageHeader
            eyebrow="Mentoring"
            title="Department Saturday Meeting Logs"
            subtitle="Attendance, venue and challenges recorded in your department's Saturday mentoring meetings."
          />
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
                  {meetings.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-slate-500)' }}>
                        No Saturday meeting records have been logged yet.
                      </td>
                    </tr>
                  ) : (
                    meetings.map((m: any) => (
                      <tr key={m._id || m.id}>
                        <td style={{ fontWeight: 700 }}>{m.meetingDate || m.meeting_date || '—'}</td>
                        <td><strong>{m.studentName || m.student_name || '—'}</strong></td>
                        <td>{m.mentorName || m.mentor_name || '—'}</td>
                        <td>{m.location || '—'}</td>
                        <td>
                          <span className={`badge ${m.attendanceStatus === 'ABSENT' ? 'badge-danger' : 'badge-success'}`}>
                            {m.attendanceStatus || m.attendance_status || '—'}
                          </span>
                        </td>
                        <td>{m.challengesDiscussed || m.challenges_discussed || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================ REPORTS ============================ */}
      {currentTab === 'reports' && (
        <div>
          <PageHeader
            eyebrow="Insights"
            title="Department Mentoring Analytics"
            subtitle="Month-wise and 30-day mentoring coverage across your department's faculty and students."
            actions={
              <button className="btn btn-primary" onClick={() => api.reports.downloadCsv()}>
                <Download size={16} /> Download Department Roster (CSV)
              </button>
            }
          />

          {/* 30-day report */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">
                <FileText size={18} /> 30-Day Report
              </h3>
              <span className="badge badge-neutral">{report ? `${report.from} to ${report.to}` : 'Loading…'}</span>
            </div>
            {report ? (
              <>
                <div className="overview-summary-grid">
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Sessions</span>
                    <span className="overview-summary-value">{report.totals.sessions}</span>
                  </div>
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Students Mentored</span>
                    <span className="overview-summary-value">{report.totals.studentsMentored}</span>
                  </div>
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Students Pending</span>
                    <span className="overview-summary-value">{report.totals.studentsPending}</span>
                  </div>
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Coverage</span>
                    <span className="overview-summary-value">{report.totals.coveragePercent}%</span>
                  </div>
                  <div className="overview-summary-card">
                    <span className="overview-summary-label">Active Mentors</span>
                    <span className="overview-summary-value">
                      {report.totals.mentorsActive} / {report.totals.mentorsWithMentees}
                    </span>
                  </div>
                </div>

                <div className="section-heading" style={{ marginTop: '1.5rem' }}>
                  Weekly Progress (30-day window · 4 weeks)
                </div>
                <WeeklyProgressList weeks={report.weekly} />

                <div className="section-heading" style={{ marginTop: '1.5rem' }}>
                  Mentor-wise 30-day Report ({(report.reportMentors || []).length})
                </div>
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mentor</th>
                        <th>Total Mentees</th>
                        <th>Covered Students</th>
                        <th>Pending Students</th>
                        <th>Coverage</th>
                        <th>Total Sessions</th>
                        <th>Last Mentoring</th>
                        <th>Students Not Covered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.reportMentors || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-slate-500)' }}>
                            No mentors with mentees in your department yet.
                          </td>
                        </tr>
                      ) : (
                        (report.reportMentors || []).map((m) => (
                          <tr key={m.mentorId}>
                            <td>
                              <strong>{m.mentorName || '—'}</strong>
                              <br />
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{m.employeeId}</span>
                            </td>
                            <td>{m.totalMentees}</td>
                            <td>{m.coveredStudents}</td>
                            <td>{m.pendingStudents}</td>
                            <td><CoverageBar percent={m.coveragePercent} /></td>
                            <td>{m.totalSessions}</td>
                            <td>{m.lastMentoringDate || '—'}</td>
                            <td>
                              {m.notCovered.length === 0 ? (
                                <span className="badge badge-success">All covered</span>
                              ) : (
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                  {m.notCovered.map((s) => (
                                    <span key={s.id} className="badge badge-warning" title={s.fullName}>
                                      {s.registerNumber || s.fullName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="section-heading" style={{ marginTop: '1.5rem' }}>
                  Students still pending in this period ({report.pendingStudents.length})
                </div>
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Register Number</th>
                        <th>Student</th>
                        <th>Batch</th>
                        <th>Mentor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.pendingStudents.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#047857' }}>
                            Every student in your department was mentored in the last 30 days.
                          </td>
                        </tr>
                      ) : (
                        report.pendingStudents.map((p) => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 700 }}>{p.registerNumber}</td>
                            <td>{p.fullName}</td>
                            <td>{p.batch || '—'}</td>
                            <td>{p.mentorName || <span className="badge badge-warning">Unassigned</span>}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : reportError ? (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', marginBottom: '0.75rem' }}>
                  Could not load the 30-day report. Check your connection and try again.
                </p>
                <button className="btn btn-secondary btn-sm" onClick={loadReport}>
                  Retry
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)' }}>Loading report…</p>
            )}
          </div>

          {/* Mentor-wise coverage table */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <BarChart3 size={18} /> Mentor-wise Coverage
              </h3>
              <span className="badge badge-secondary">{mentorRows.length} mentor(s) with mentees</span>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th>Emp ID</th>
                    <th>Mentees</th>
                    <th>Mentored {monthShort(month)}</th>
                    <th>Pending</th>
                    <th>Sessions</th>
                    <th>Last Mentoring</th>
                    <th>Coverage</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mentorRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-slate-500)' }}>
                        No mentor assignments in your department yet.
                      </td>
                    </tr>
                  ) : (
                    mentorRows.map((m) => (
                      <tr key={m.mentorId}>
                        <td><strong>{m.mentorName || '—'}</strong></td>
                        <td>{m.employeeId}</td>
                        <td>{m.totalMentees}</td>
                        <td>{m.mentoredThisMonth}</td>
                        <td>{m.pending}</td>
                        <td>{m.sessionCount}</td>
                        <td>{m.lastMentoringDate || '—'}</td>
                        <td><CoverageBar percent={m.coveragePercent} /></td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => openMentor(m.mentorId)} disabled={detailLoading}>
                            Detail
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

      {/* ====================== FACULTY NOTIFICATIONS ====================== */}
      {currentTab === 'notifications' && (
        <div>
          <PageHeader
            eyebrow="Insights"
            title="Notifications from Your Faculty"
            subtitle={
              deptNotes?.department
                ? `Only notices sent by ${deptNotes.department.name} faculty appear here.`
                : 'Only notices sent by your own department faculty appear here.'
            }
            actions={
              <>
                <span className="badge badge-danger">
                  {deptNotes?.unreadCount ?? 0} unread
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={loadDeptNotifications}
                  disabled={deptNotesLoading}
                >
                  {deptNotesLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </>
            }
          />

          <div className="card">
            {deptNotesLoading && !deptNotes ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', padding: '1.5rem' }}>Loading notifications…</p>
            ) : (deptNotes?.notifications.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Bell size={28} />}
                title="No faculty notifications yet"
                description="When a faculty member in your department sends a notice, it will appear here with a read receipt."
              />
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>From</th>
                      <th>Department</th>
                      <th>Sent</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptNotes!.notifications.map((n) => (
                      <tr key={n.id} style={{ background: n.is_read ? undefined : 'var(--color-warning-100)' }}>
                        <td style={{ fontWeight: 700 }}>{n.title}</td>
                        <td>{n.faculty_name || '—'}</td>
                        <td>{n.department_name || deptNotes?.department?.name || '—'}</td>
                        <td>{n.created_at ? new Date(n.created_at).toLocaleString() : '—'}</td>
                        <td>
                          <span className={`badge ${n.is_read ? 'badge-success' : 'badge-warning'}`}>
                            {n.is_read ? 'Read' : 'Unread'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setNoteDetail(n)}>
                              View
                            </button>
                            {!n.is_read && (
                              <button className="btn btn-primary btn-sm" onClick={() => markNoteRead(n.id)}>
                                Mark Read
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: notification detail ==================== */}
      <Modal
        isOpen={Boolean(noteDetail)}
        onClose={() => setNoteDetail(null)}
        title={noteDetail ? noteDetail.title : 'Notification'}
      >
        {noteDetail ? (
          <>
            <div className="overview-summary-grid">
              <div className="overview-summary-card">
                <span className="overview-summary-label">From</span>
                <span className="overview-summary-value" style={{ fontSize: '0.9rem' }}>
                  {noteDetail.faculty_name || '—'}
                </span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Department</span>
                <span className="overview-summary-value" style={{ fontSize: '0.9rem' }}>
                  {noteDetail.department_name || deptNotes?.department?.name || '—'}
                </span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Sent</span>
                <span className="overview-summary-value" style={{ fontSize: '0.9rem' }}>
                  {noteDetail.created_at ? new Date(noteDetail.created_at).toLocaleString() : '—'}
                </span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Status</span>
                <span className="overview-summary-value" style={{ fontSize: '0.9rem' }}>
                  {noteDetail.is_read ? 'Read' : 'Unread'}
                </span>
              </div>
            </div>

            <div className="section-heading" style={{ marginTop: '1.25rem' }}>Message</div>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--color-slate-700)', whiteSpace: 'pre-wrap' }}>
              {noteDetail.message}
            </p>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setNoteDetail(null)}>
                Close
              </button>
              {!noteDetail.is_read && (
                <button
                  className="btn btn-gold"
                  onClick={async () => {
                    await markNoteRead(noteDetail.id);
                  }}
                >
                  Mark as Read
                </button>
              )}
            </div>
          </>
        ) : null}
      </Modal>

      {/* ==================== MODAL: mentor detail ==================== */}
      <Modal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.mentor.fullName} — Mentee Detail` : 'Mentor Detail'}
      >
        {detail ? (
          <>
            <div className="overview-summary-grid">
              <div className="overview-summary-card">
                <span className="overview-summary-label">Total Mentees</span>
                <span className="overview-summary-value">{detail.summary.totalMentees}</span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Mentored {monthShort(month)}</span>
                <span className="overview-summary-value">{detail.summary.mentoredThisMonth}</span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Pending</span>
                <span className="overview-summary-value">{detail.summary.pending}</span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Coverage</span>
                <span className="overview-summary-value">{detail.summary.coveragePercent}%</span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Sessions This Month</span>
                <span className="overview-summary-value">{detail.summary.sessionsThisMonth}</span>
              </div>
              <div className="overview-summary-card">
                <span className="overview-summary-label">Sessions (All Time)</span>
                <span className="overview-summary-value">{detail.summary.sessionCount}</span>
              </div>
            </div>
            <div className="overview-summary-foot">
              Reporting month <strong>{monthLabel(month)}</strong> · Last mentoring date:{' '}
              <strong>{detail.summary.lastMentoringDate || 'Never'}</strong>
            </div>

            <div className="section-heading" style={{ marginTop: '1.25rem' }}>Mentees</div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Mentoring Status</th>
                    <th>Last Mentoring Date</th>
                    <th>Sessions This Month</th>
                    <th>Covered This Month</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.mentees.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-slate-500)' }}>
                        No mentees assigned to this faculty member.
                      </td>
                    </tr>
                  ) : (
                    detail.mentees.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 700 }}>{m.registerNumber}</td>
                        <td><strong>{m.fullName}</strong></td>
                        <td>
                          <span className={`badge ${m.lastMentoringDate ? 'badge-success' : 'badge-warning'}`}>
                            {m.lastMentoringDate ? 'Mentored' : 'No sessions yet'}
                          </span>
                        </td>
                        <td>{m.lastMentoringDate || '—'}</td>
                        <td>{m.sessionsThisMonth ?? 0}</td>
                        <td>
                          <span className={`badge ${m.mentoredThisMonth ? 'badge-success' : 'badge-danger'}`}>
                            {m.mentoredThisMonth ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Modal>

      {/* ==================== MODAL: add / edit student ==================== */}
      <Modal
        isOpen={studentModal !== null}
        onClose={() => setStudentModal(null)}
        title={studentModal === 'add' ? 'Add Student to Department' : 'Edit Student'}
      >
        <form onSubmit={submitStudent}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              className="form-control"
              value={studentForm.fullName}
              onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
              required
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Register Number</label>
              <input
                className="form-control"
                value={studentForm.registerNumber}
                disabled={studentModal === 'edit'}
                onChange={(e) => setStudentForm({ ...studentForm, registerNumber: e.target.value.toUpperCase() })}
                required={studentModal === 'add'}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={studentForm.email}
                onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
              />
            </div>
          </div>

          {studentModal === 'add' && (
            <div className="form-group">
              <label className="form-label">Batch</label>
              <select
                className="form-control"
                value={studentForm.batchId}
                onChange={(e) => setStudentForm({ ...studentForm, batchId: e.target.value })}
                required
              >
                <option value="">-- Choose Batch --</option>
                {(overview?.batches || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Year</label>
              <input
                type="number"
                min={1}
                max={5}
                className="form-control"
                value={studentForm.year}
                onChange={(e) => setStudentForm({ ...studentForm, year: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Section</label>
              <input
                className="form-control"
                value={studentForm.section}
                onChange={(e) => setStudentForm({ ...studentForm, section: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Mobile Number</label>
            <input
              className="form-control"
              value={studentForm.phoneNumber}
              onChange={(e) => setStudentForm({ ...studentForm, phoneNumber: e.target.value })}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setStudentModal(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? 'Saving…' : studentModal === 'add' ? 'Add Student' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: add / edit faculty ==================== */}
      <Modal
        isOpen={facultyModal !== null}
        onClose={() => setFacultyModal(null)}
        title={facultyModal === 'add' ? 'Add Faculty to Department' : 'Edit Faculty'}
      >
        <form onSubmit={submitFaculty}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              className="form-control"
              value={facultyForm.fullName}
              onChange={(e) => setFacultyForm({ ...facultyForm, fullName: e.target.value })}
              required
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Employee ID</label>
              <input
                className="form-control"
                value={facultyForm.employeeId}
                disabled={facultyModal === 'edit'}
                onChange={(e) => setFacultyForm({ ...facultyForm, employeeId: e.target.value.toUpperCase() })}
                required={facultyModal === 'add'}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={facultyForm.email}
                onChange={(e) => setFacultyForm({ ...facultyForm, email: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Designation</label>
              <input
                className="form-control"
                value={facultyForm.designation}
                onChange={(e) => setFacultyForm({ ...facultyForm, designation: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cabin</label>
              <input
                className="form-control"
                value={facultyForm.cabinLocation}
                onChange={(e) => setFacultyForm({ ...facultyForm, cabinLocation: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              className="form-control"
              value={facultyForm.phoneNumber}
              onChange={(e) => setFacultyForm({ ...facultyForm, phoneNumber: e.target.value })}
            />
          </div>

          <p className="section-description">
            The new faculty member is always created inside your own department; the request
            cannot choose another one.
          </p>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setFacultyModal(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? 'Saving…' : facultyModal === 'add' ? 'Add Faculty' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: assign mentor ==================== */}
      <Modal isOpen={showReassignModal} onClose={() => setShowReassignModal(false)} title="Departmental Mentor Assignment">
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
                  {s.full_name} ({s.register_number}) — Mentor: {s.current_mentor_name || 'Unassigned'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Assign Mentor</label>
            <select
              className="form-control"
              value={reassignForm.newMentorId}
              onChange={(e) => setReassignForm({ ...reassignForm, newMentorId: e.target.value })}
              required
            >
              <option value="">-- Choose Faculty Member --</option>
              {faculty.filter((f) => f.is_active).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name} ({f.designation}) — {f.mentee_count} mentees
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Reason for Assignment</label>
            <input
              type="text"
              className="form-control"
              value={reassignForm.reasonForChange}
              onChange={(e) => setReassignForm({ ...reassignForm, reasonForChange: e.target.value })}
              required
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowReassignModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? 'Saving…' : 'Submit Assignment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
