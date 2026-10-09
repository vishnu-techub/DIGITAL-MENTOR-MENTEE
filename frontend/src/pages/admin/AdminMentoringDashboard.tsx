import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type AdminMentoringDashboardData,
  type AdminHodOverviewData,
  type AdminHodRow,
  type AdminDepartmentOverviewData,
  type AdminDepartmentRow,
  type AdminDepartmentComparisonData,
  type AdminDepartmentComparisonRow,
  type AdminDepartmentDetailData,
  type AdminMentorCoverageRow,
  type AdminMentorDetailData,
  type AdminReport30DayData,
  type AdminWeeklyProgress,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { DashboardSkeleton, ReportsSkeleton } from '../../components/common/SkeletonLoader';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Building2,
  Users,
  GraduationCap,
  UserCheck,
  UserCog,
  CalendarCheck2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Search,
  FileText,
  Award,
  ShieldCheck,
} from 'lucide-react';

interface AdminMentoringDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

/** Inner tabs of the mentoring dashboard. `onSelectTab` moves the sidebar too. */
const TABS = [
  { id: 'overview', label: 'Overall', icon: BarChart3 },
  { id: 'hods', label: 'HOD Overview', icon: UserCog },
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'comparison', label: 'Comparison', icon: Award },
  { id: 'reports', label: '30-Day Report', icon: FileText },
] as const;

const NEVER = 'â€”';

/* ------------------------------------------------------------------ charts */

/**
 * College-wide PIE â€” Mentored vs Pending for the reporting month.
 *
 * Inline SVG (no charting dependency), matching the HOD dashboard. The two
 * slice values come straight from the server response, which de-duplicates by
 * student identity, so the two slices always sum to the student total.
 */
const CoveragePie: React.FC<{ pie: AdminMentoringDashboardData['pie'] | undefined }> = ({ pie }) => {
  const total = pie ? Math.max(0, pie.mentored + pie.pending) : 0;
  const radius = 60;
  const cx = 70;
  const cy = 70;

  const arc = (fraction: number) => {
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const largeArc = fraction > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y} Z`;
  };

  if (!pie || total === 0) {
    return (
      <EmptyState
        compact
        icon={<PieChartIcon size={32} style={{ color: 'var(--color-slate-300)' }} />}
        title="No students to report on yet"
        description="Once students are registered against a department, the mentored vs pending split appears here."
      />
    );
  }

  const mentoredFraction = pie.mentored / total;
  const pendingFraction = pie.pending / total;

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
        {mentoredFraction > 0 && <path d={arc(mentoredFraction)} fill="#059669" />}
        {pendingFraction > 0 && <path d={arc(1 - mentoredFraction)} fill="#E11D48" />}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          style={{ fontSize: '20px', fontWeight: 800, fill: '#0B2545' }}
        >
          {Math.round(mentoredFraction * 100)}%
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" style={{ fontSize: '9px', fill: '#64748B' }}>
          COVERAGE
        </text>
      </svg>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <span className="badge badge-success">Mentored â€” {pie.mentored}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', marginTop: '0.25rem' }}>
            {Math.round(mentoredFraction * 100)}% of {pie.total} students
          </div>
        </div>
        <div>
          <span className="badge badge-danger">Pending â€” {pie.pending}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', marginTop: '0.25rem' }}>
            {Math.round(pendingFraction * 100)}% of {pie.total} students
          </div>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-400)' }}>
          Reporting month: {pie.month} Â· each student counted once
        </div>
      </div>
    </div>
  );
};

/** Horizontal coverage track. The percentage is always a server figure. */
const CoverageBar: React.FC<{ percent: number }> = ({ percent }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '120px' }}>
    <div className="progress-track" style={{ flex: 1 }}>
      <div
        className="progress-fill"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          background: percent >= 80 ? '#059669' : percent >= 50 ? '#D97706' : '#E11D48',
        }}
      />
    </div>
    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-navy-800)', minWidth: '34px' }}>
      {percent}%
    </span>
  </div>
);

const WeeklyProgressList: React.FC<{ weeks: AdminWeeklyProgress[] }> = ({ weeks }) => {
  if (!weeks || weeks.length === 0) return null;
  const max = Math.max(1, ...weeks.map((w) => w.sessions));
  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      {weeks.map((w) => (
        <div
          key={w.weekStart}
          style={{
            display: 'grid',
            gridTemplateColumns: '150px 1fr 62px',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-600)' }}>{w.weekLabel}</span>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${(w.sessions / max) * 100}%`, background: '#0B2545' }}
            />
          </div>
          <span
            style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-navy-800)', textAlign: 'right' }}
          >
            {w.sessions}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------ small pieces */

const statCard = (
  icon: React.ReactNode,
  bg: string,
  fg: string,
  label: string,
  value: React.ReactNode,
  hint?: string
) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ backgroundColor: bg, color: fg }}>
      {icon}
    </div>
    <div className="stat-info">
      <h3>{label}</h3>
      <div className="stat-value">{value}</div>
      {hint ? <div style={{ fontSize: '0.68rem', color: 'var(--color-slate-400)' }}>{hint}</div> : null}
    </div>
  </div>
);

/** Renders a server day string (`YYYY-MM-DD`) or null. Never invents a date. */
const Day: React.FC<{ value: string | null | undefined }> = ({ value }) => (
  <>{value || <span style={{ color: 'var(--color-slate-400)' }}>{NEVER}</span>}</>
);

/**
 * Explains the metric definitions once, at the top of the dashboard.
 *
 * Coverage / mentored / pending are defined on the server and shipped in the
 * response precisely so this screen never re-derives them â€” that is what keeps
 * the college figure and a department's own HOD figure identical.
 */
const DefinitionsNote: React.FC<{ data: AdminMentoringDashboardData | null }> = ({ data }) => {
  const d = data?.definitions;
  if (!d) return null;
  return (
    <details style={{ marginBottom: '1.25rem' }}>
      <summary
        style={{
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: 'var(--color-navy-800)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        <ShieldCheck size={15} /> How each figure is measured
      </summary>
      <ul
        style={{
          margin: '0.75rem 0 0',
          paddingLeft: '1.1rem',
          display: 'grid',
          gap: '0.35rem',
          fontSize: '0.78rem',
          color: 'var(--color-slate-600)',
        }}
      >
        <li>
          <strong>Mentored:</strong> {d.mentored}
        </li>
        <li>
          <strong>Pending:</strong> {d.pending}
        </li>
        <li>
          <strong>Mentors:</strong> {d.mentors}
        </li>
        <li>
          <strong>Coverage:</strong> {d.coverage}
        </li>
        <li>
          <strong>Sessions:</strong> {d.sessions}
        </li>
      </ul>
    </details>
  );
};

/* ------------------------------------------------------------ drill-downs */

interface DrillState {
  departmentId: string;
  departmentName: string;
  mentorId: string | null;
  mentorName: string | null;
}

/* ------------------------------------------------------------------ screen */

export const AdminMentoringDashboard: React.FC<AdminMentoringDashboardProps> = ({
  currentTab,
  onSelectTab,
}) => {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const [dashboard, setDashboard] = useState<AdminMentoringDashboardData | null>(null);
  const [hods, setHods] = useState<AdminHodOverviewData | null>(null);
  const [departments, setDepartments] = useState<AdminDepartmentOverviewData | null>(null);
  const [comparison, setComparison] = useState<AdminDepartmentComparisonData | null>(null);
  const [report, setReport] = useState<AdminReport30DayData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [drill, setDrill] = useState<DrillState | null>(null);
  const [deptDetail, setDeptDetail] = useState<AdminDepartmentDetailData | null>(null);
  const [mentorDetail, setMentorDetail] = useState<AdminMentorDetailData | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const [hodQuery, setHodQuery] = useState('');
  const [deptQuery, setDeptQuery] = useState('');
  const [reportWeeks, setReportWeeks] = useState(5);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  });
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dash, hodRes, deptRes, cmpRes] = await Promise.all([
        api.adminMentoring.dashboard({ month }),
        api.adminMentoring.hods({ month }),
        api.adminMentoring.departments({ month }),
        api.adminMentoring.departmentComparison({ month }),
      ]);
      setDashboard(dash.data);
      setHods(hodRes.data);
      setDepartments(deptRes.data);
      setComparison(cmpRes.data);
    } catch (err: any) {
      console.error('Failed to load admin mentoring dashboard:', err);
      setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));
    } finally {
      setLoading(false);
    }
  }, [month]);  const loadReport = useCallback(
    async (weeks: number) => {
      setReportLoading(true);
      try {
        const res = await api.adminMentoring.report30Day(weeks);
        setReport(res.data);
      } catch (err: any) {
        toast.error('Could not load the 30-day report: ' + err.message);
      } finally {
        setReportLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (currentTab === 'reports') loadReport(reportWeeks);
  }, [currentTab, reportWeeks, loadReport]);

  /** Drill-down: Admin -> Department -> HOD -> Mentor -> Student. */
  const openDepartment = useCallback(async (row: AdminDepartmentRow) => {
    setDrill({
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      mentorId: null,
      mentorName: null,
    });
    setMentorDetail(null);
    setDeptDetail(null);
    setDrillLoading(true);
    try {
      const res = await api.adminMentoring.departmentDetail(row.departmentId);
      setDeptDetail(res.data);
    } catch (err: any) {
      toast.error('Could not load department: ' + err.message);
      setDrill(null);
    } finally {
      setDrillLoading(false);
    }
  }, [toast]);

  const openMentor = useCallback(
    async (departmentId: string, departmentName: string, mentorId: string, mentorName: string) => {
      setDrill((prev) =>
        prev ? { ...prev, departmentId, departmentName, mentorId, mentorName } : prev
      );
      setMentorDetail(null);
      setDrillLoading(true);
      try {
        const res = await api.adminMentoring.mentorDetail(mentorId);
        setMentorDetail(res.data);
      } catch (err: any) {
        toast.error('Could not load mentor: ' + err.message);
      } finally {
        setDrillLoading(false);
      }
    },
    [toast]
  );

  const closeDrill = () => {
    setDrill(null);
    setDeptDetail(null);
    setMentorDetail(null);
  };

  const filteredHods = useMemo(() => {
    const rows = hods?.hods || [];
    if (!hodQuery.trim()) return rows;
    const q = hodQuery.toLowerCase();
    return rows.filter(
      (h) =>
        h.hodName.toLowerCase().includes(q) ||
        (h.departmentName || '').toLowerCase().includes(q) ||
        (h.departmentCode || '').toLowerCase().includes(q) ||
        (h.email || '').toLowerCase().includes(q)
    );
  }, [hods, hodQuery]);

  const filteredDepartments = useMemo(() => {
    const rows = departments?.departments || [];
    if (!deptQuery.trim()) return rows;
    const q = deptQuery.toLowerCase();
    return rows.filter(
      (d) =>
        d.departmentName.toLowerCase().includes(q) ||
        (d.departmentCode || '').toLowerCase().includes(q) ||
        d.hodNames.some((n) => (n || '').toLowerCase().includes(q))
    );
  }, [departments, deptQuery]);

  const summary = dashboard?.summary;
  const hasCollegeData = (summary?.totalStudents ?? 0) > 0;

  if (loading) {
    return currentTab === 'reports' ? <ReportsSkeleton /> : <DashboardSkeleton />;
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

  /* ------------------------------------------------------ drill-down screen */
  if (drill) {
    const mentorRows: AdminMentorCoverageRow[] = deptDetail?.mentors || [];
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={closeDrill}>
            <ChevronLeft size={16} /> Back to dashboard
          </button>
          <nav
            aria-label="Drill-down path"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--color-slate-600)' }}
          >
            <span style={{ fontWeight: 700, color: 'var(--color-navy-800)' }}>Admin</span>
            <ChevronRight size={14} />
            <span style={{ fontWeight: 700, color: 'var(--color-navy-800)' }}>{drill.departmentName || 'Department'}</span>
            {drill.mentorId && (
              <>
                <ChevronRight size={14} />
                <span style={{ fontWeight: 700, color: 'var(--color-navy-800)' }}>{drill.mentorName || 'Mentor'}</span>
              </>
            )}
          </nav>
        </div>

        {drillLoading && !deptDetail && !mentorDetail ? <DashboardSkeleton /> : null}

        {/* Level 2 + 3: Department summary, its HOD(s), and its mentors */}
        {deptDetail && !mentorDetail && (
          <>
            <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
              {statCard(<GraduationCap size={24} />, '#EEF2F6', '#0B2545', 'Students', deptDetail.summary.totalStudents)}
              {statCard(<Users size={24} />, '#EFF6FF', '#1D4ED8', 'Faculty', deptDetail.summary.totalFaculty)}
              {statCard(<UserCheck size={24} />, '#F5F3FF', '#6D28D9', 'Mentors', deptDetail.summary.totalMentors)}
              {statCard(<CalendarCheck2 size={24} />, '#ECFDF5', '#059669', 'Mentored This Month', deptDetail.summary.mentoredThisMonth)}
              {statCard(<AlertTriangle size={24} />, '#FFF1F2', '#E11D48', 'Pending', deptDetail.summary.pendingStudents)}
              {statCard(<BarChart3 size={24} />, '#FFFBEB', '#D97706', 'Coverage %', `${deptDetail.summary.overallMentoringCoverage}%`)}
              {statCard(<UserCog size={24} />, '#F1F5F9', '#334155', 'Unassigned Students', deptDetail.summary.unassignedStudents)}
              {statCard(<TrendingUp size={24} />, '#ECFEFF', '#0E7490', 'Sessions (all time)', deptDetail.summary.totalMentoringSessions)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title"><PieChartIcon size={18} /> {deptDetail.department.departmentName} Split</h3>
                </div>
                <CoveragePie pie={deptDetail.pie} />
              </div>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title"><TrendingUp size={18} /> Weekly Progress</h3>
                  <span className="badge badge-neutral">Sessions per week</span>
                </div>
                <WeeklyProgressList weeks={deptDetail.weeklyProgress} />
              </div>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <h3 className="card-title"><UserCog size={18} /> Head of Department</h3>
              </div>
              {deptDetail.hods.length === 0 ? (
                <div style={{ padding: '1rem' }}>
                  <span className="badge badge-warning">No HOD assigned to this department</span>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>HOD</th><th>Email</th><th>Students</th><th>Mentors</th>
                        <th>Mentored</th><th>Coverage</th><th>Pending</th><th>Sessions</th><th>Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptDetail.hods.map((h: AdminHodRow) => (
                        <tr key={h.hodId}>
                          <td><strong>{h.hodName}</strong></td>
                          <td>{h.email}</td>
                          <td>{h.students}</td>
                          <td>{h.mentors}</td>
                          <td><span className="badge badge-success">{h.mentoredThisMonth}</span></td>
                          <td><CoverageBar percent={h.mentoringCoverage} /></td>
                          <td><span className="badge badge-danger">{h.pendingStudents}</span></td>
                          <td>{h.totalMentoringSessions}</td>
                          <td><Day value={h.lastMentoringActivity} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><UserCheck size={18} /> Mentors in this Department</h3>
                <span className="badge badge-neutral">Select a mentor to see mentees</span>
              </div>
              {mentorRows.length === 0 ? (
                <EmptyState
                  compact
                  title="No faculty in this department"
                  description="Mentors are faculty holding at least one active mentor assignment."
                />
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mentor</th><th>Employee ID</th><th>Designation</th><th>Mentees</th>
                        <th>Mentored</th><th>Pending</th><th>Coverage</th><th>Sessions</th>
                        <th>Last Mentored</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mentorRows.map((m) => (
                        <tr key={m.mentorId}>
                          <td><strong>{m.mentorName}</strong></td>
                          <td>{m.employeeId || NEVER}</td>
                          <td>{m.designation || NEVER}</td>
                          <td>{m.totalMentees}</td>
                          <td>{m.mentoredThisMonth}</td>
                          <td><span className="badge badge-danger">{m.pending}</span></td>
                          <td><CoverageBar percent={m.coveragePercent} /></td>
                          <td>{m.sessionCount}</td>
                          <td><Day value={m.lastMentoringDate} /></td>
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openMentor(deptDetail.department.departmentId, deptDetail.department.departmentName, m.mentorId, m.mentorName)}
                              disabled={m.totalMentees === 0}
                              title={m.totalMentees === 0 ? 'This mentor has no mentees yet' : 'View mentees'}
                            >
                              View Mentees
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Level 4: Mentor -> Student */}
        {mentorDetail && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <UserCheck size={18} /> {mentorDetail.mentor.fullName} Â· Mentees
              </h3>
              <span className="badge badge-neutral">{mentorDetail.mentor.departmentName}</span>
            </div>

            <div className="grid-cols-4" style={{ marginBottom: '1rem' }}>
              {statCard(<Users size={22} />, '#EEF2F6', '#0B2545', 'Mentees', mentorDetail.summary.totalMentees)}
              {statCard(<CalendarCheck2 size={22} />, '#ECFDF5', '#059669', 'Mentored This Month', mentorDetail.summary.mentoredThisMonth)}
              {statCard(<AlertTriangle size={22} />, '#FFF1F2', '#E11D48', 'Pending', mentorDetail.summary.pending)}
              {statCard(<BarChart3 size={22} />, '#FFFBEB', '#D97706', 'Coverage %', `${mentorDetail.summary.coveragePercent}%`)}
              {statCard(<TrendingUp size={22} />, '#ECFEFF', '#0E7490', 'Sessions (all time)', mentorDetail.summary.sessionCount)}
              {statCard(
                <Building2 size={22} />,
                '#F5F3FF',
                '#6D28D9',
                'Share of Dept',
                `${mentorDetail.summary.departmentCoveragePercent}%`
              )}
            </div>

            {mentorDetail.mentees.length === 0 ? (
              <EmptyState
                compact
                title="No mentees assigned"
                description="This mentor holds no active mentee assignment yet."
              />
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Register Number</th><th>Student Name</th><th>Batch</th><th>Year / Section</th>
                      <th>This Month</th><th>Last Mentored</th><th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mentorDetail.mentees.map((s) => (
                      <tr key={s.id}>
                        <td>{s.registerNumber}</td>
                        <td><strong>{s.fullName}</strong></td>
                        <td>{s.batch || NEVER}</td>
                        <td>{s.year ?? NEVER} {s.section ? `/ ${s.section}` : ''}</td>
                        <td>
                          {s.mentoredThisMonth ? (
                            <span className="badge badge-success">Mentored</span>
                          ) : (
                            <span className="badge badge-danger">Pending</span>
                          )}
                        </td>
                        <td><Day value={s.lastMentoringDate} /></td>
                        <td>{s.sessionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------- dashboard */
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = currentTab === `mentoring-${t.id}` || (t.id === 'overview' && currentTab === 'mentoring-dashboard');
          return (
            <button
              key={t.id}
              className={`btn ${active ? 'btn-gold' : 'btn-secondary'} btn-sm`}
              onClick={() => onSelectTab(t.id === 'overview' ? 'mentoring-dashboard' : `mentoring-${t.id}`)}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ============================ OVERALL ============================ */}
      {(currentTab === 'mentoring-dashboard' || currentTab === 'mentoring-overview') && (
        <div>
          <PageHeader
            eyebrow="Administration"
            title="Mentoring Dashboard"
            subtitle="College-wide mentoring coverage, sessions and weekly progress for the selected month."
          />
          <DefinitionsNote data={dashboard} />

          <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
            {statCard(<Building2 size={24} />, '#EEF2F6', '#0B2545', 'Departments', summary?.totalDepartments ?? 0, `${summary?.departmentsWithHod ?? 0} with a HOD`)}
            {statCard(<UserCog size={24} />, '#F1F5F9', '#334155', 'HODs', summary?.totalHODs ?? 0)}
            {statCard(<Users size={24} />, '#EFF6FF', '#1D4ED8', 'Faculty', summary?.totalFaculty ?? 0)}
            {statCard(<UserCheck size={24} />, '#F5F3FF', '#6D28D9', 'Mentors', summary?.totalMentors ?? 0)}
            {statCard(<GraduationCap size={24} />, '#ECFEFF', '#0E7490', 'Students', summary?.totalStudents ?? 0)}
            {statCard(<CalendarCheck2 size={24} />, '#ECFDF5', '#059669', 'Mentored This Month', summary?.mentoredThisMonth ?? 0)}
            {statCard(<AlertTriangle size={24} />, '#FFF1F2', '#E11D48', 'Pending', summary?.pendingStudents ?? 0)}
            {statCard(<BarChart3 size={24} />, '#FFFBEB', '#D97706', 'Overall Coverage', `${summary?.overallMentoringCoverage ?? 0}%`)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><PieChartIcon size={18} /> College Mentoring Split</h3>
              </div>
              <CoveragePie pie={dashboard?.pie} />
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><TrendingUp size={18} /> Weekly Progress (8 weeks)</h3>
                <span className="badge badge-neutral">Sessions per week</span>
              </div>
              <WeeklyProgressList weeks={dashboard?.weeklyProgress || []} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><Building2 size={18} /> Department Snapshot</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => onSelectTab('mentoring-departments')}>
                View all departments
              </button>
            </div>
            {hasCollegeData ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Department</th><th>HOD</th><th>Students</th><th>Faculty</th>
                      <th>Mentors</th><th>Mentored</th><th>Coverage</th><th>Pending</th><th>Sessions</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(departments?.departments || []).slice(0, 8).map((d) => (
                      <tr key={d.departmentId}>
                        <td><strong>{d.departmentName}</strong> {d.departmentCode ? `(${d.departmentCode})` : ''}</td>
                        <td>{d.hodNames.length > 0 ? d.hodNames.join(', ') : <span className="badge badge-warning">No HOD</span>}</td>
                        <td>{d.students}</td>
                        <td>{d.faculty}</td>
                        <td>{d.mentors}</td>
                        <td><span className="badge badge-success">{d.mentoredThisMonth}</span></td>
                        <td><CoverageBar percent={d.mentoringCoverage} /></td>
                        <td><span className="badge badge-danger">{d.pendingStudents}</span></td>
                        <td>{d.totalMentoringSessions}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => openDepartment(d)}>
                            Drill Down <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                compact
                title="No students registered yet"
                description="The college-wide mentoring figures appear once students are registered against a department."
              />
            )}
          </div>
        </div>
      )}

      {/* ============================ HOD OVERVIEW ============================ */}
      {currentTab === 'mentoring-hods' && (
        <>
          <PageHeader
            eyebrow="Administration"
            title="HOD Overview"
            subtitle="Mentoring coverage, sessions and pending figures for every Head of Department."
          />
          <div className="card">
            <div className="card-header">
              <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--color-slate-400)' }} />
              <input
                className="input"
                placeholder="Search HOD or department"
                value={hodQuery}
                onChange={(e) => setHodQuery(e.target.value)}
                style={{ paddingLeft: '2rem', minWidth: '220px' }}
                aria-label="Search HOD or department"
              />
            </div>
          </div>
          {filteredHods.length === 0 ? (
            <EmptyState
              compact
              title="No HOD accounts found"
              description="HOD accounts appear here as soon as a user is created with the HOD role."
            />
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>HOD</th><th>Department</th><th>Students</th><th>Faculty</th><th>Mentors</th>
                    <th>Mentored</th><th>Coverage</th><th>Pending</th><th>Sessions</th><th>Last Activity</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHods.map((h) => (
                    <tr key={h.hodId}>
                      <td>
                        <strong>{h.hodName}</strong>
                        {!h.isActive && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Inactive</span>}
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-400)' }}>{h.email}</div>
                      </td>
                      <td>
                        {h.hasDepartment ? (
                          `${h.departmentName}${h.departmentCode ? ` (${h.departmentCode})` : ''}`
                        ) : (
                          <span className="badge badge-warning">Unassigned</span>
                        )}
                      </td>
                      <td>{h.students}</td>
                      <td>{h.faculty}</td>
                      <td>{h.mentors}</td>
                      <td><span className="badge badge-success">{h.mentoredThisMonth}</span></td>
                      <td><CoverageBar percent={h.mentoringCoverage} /></td>
                      <td><span className="badge badge-danger">{h.pendingStudents}</span></td>
                      <td>{h.totalMentoringSessions}</td>
                      <td><Day value={h.lastMentoringActivity} /></td>
                      <td>
                        {h.hasDepartment ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              openDepartment({
                                departmentId: h.departmentId,
                                departmentName: h.departmentName,
                                departmentCode: h.departmentCode,
                                hodNames: [h.hodName],
                                hodCount: 1,
                                students: h.students,
                                faculty: h.faculty,
                                mentors: h.mentors,
                                mentoredThisMonth: h.mentoredThisMonth,
                                mentoringCoverage: h.mentoringCoverage,
                                pendingStudents: h.pendingStudents,
                                unassignedStudents: 0,
                                totalMentoringSessions: h.totalMentoringSessions,
                                lastMentoringActivity: h.lastMentoringActivity,
                              })
                            }
                          >
                            Department <ChevronRight size={14} />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-slate-400)', fontSize: '0.75rem' }}>No department</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
      )}

      {/* ============================ DEPARTMENTS ============================ */}
      {currentTab === 'mentoring-departments' && (
        <>
          <PageHeader
            eyebrow="Administration"
            title="Department Overview"
            subtitle="Department-level mentoring coverage, sessions and HOD assignment status."
          />
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="month"
                className="input"
                value={month}
                onChange={(e) => { setMonth(e.target.value); loadData(); }}
                style={{ minWidth: '160px' }}
                aria-label="Select month"
              />
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--color-slate-400)' }} />
                <input
                  className="input"
                  placeholder="Search department or HOD"
                  value={deptQuery}
                  onChange={(e) => setDeptQuery(e.target.value)}
                  style={{ paddingLeft: '2rem', minWidth: '220px' }}
                  aria-label="Search department or HOD"
                />
              </div>
            </div>
          </div>
          {filteredDepartments.length === 0 ? (
            <EmptyState
              compact
              title="No departments found"
              description="Departments appear here once they are created in the Departments section."
            />
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Department</th><th>HOD</th><th>Students</th><th>Faculty</th><th>Mentors</th>
                    <th>Mentored</th><th>Coverage</th><th>Pending</th><th>Unassigned</th><th>Sessions</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDepartments.map((d) => (
                    <tr key={d.departmentId}>
                      <td><strong>{d.departmentName}</strong> {d.departmentCode ? `(${d.departmentCode})` : ''}</td>
                      <td>
                        {d.hodCount > 0 ? (
                          d.hodNames.join(', ')
                        ) : (
                          <span className="badge badge-warning">No HOD assigned</span>
                        )}
                      </td>
                      <td>{d.students}</td>
                      <td>{d.faculty}</td>
                      <td>{d.mentors}</td>
                      <td><span className="badge badge-success">{d.mentoredThisMonth}</span></td>
                      <td><CoverageBar percent={d.mentoringCoverage} /></td>
                      <td><span className="badge badge-danger">{d.pendingStudents}</span></td>
                      <td>{d.unassignedStudents}</td>
                      <td>{d.totalMentoringSessions}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => openDepartment(d)}>
                          Drill Down <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
      )}

      {/* ============================ COMPARISON ============================ */}
      {currentTab === 'mentoring-comparison' && (
        <div>
          <PageHeader
            eyebrow="Administration"
            title="Department Comparison"
            subtitle="Side-by-side mentoring coverage across every department for the current month."
          />
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title"><Award size={18} /> Department Comparison â€” current month</h3>
              <span className="badge badge-success">
                Highest: {comparison?.highestCoveragePercent ?? 0}%
              </span>
            </div>
            {(comparison?.departments || []).length === 0 ? (
              <EmptyState
                compact
                title="No departments to compare"
                description="Create a department and register students to compare mentoring coverage across the college."
              />
            ) : (
              <div style={{ padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
                {(comparison?.departments || []).map((d: AdminDepartmentComparisonRow) => (
                  <div key={d.departmentId} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) 1fr 90px', gap: '1rem', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-navy-800)' }}>{d.departmentName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-400)' }}>
                        {d.students} students Â· {d.totalMentoringSessions} sessions
                      </div>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, d.coveragePercent))}%`,
                          background: d.coveragePercent >= 80 ? '#059669' : d.coveragePercent >= 50 ? '#D97706' : '#E11D48',
                        }}
                      />
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-navy-800)' }}>
                      {d.coveragePercent}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><BarChart3 size={18} /> Comparison Table</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th><th>Department</th><th>Students</th><th>Mentored</th>
                    <th>Pending</th><th>Coverage</th><th>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {(comparison?.departments || []).map((d, i) => (
                    <tr key={d.departmentId}>
                      <td>{i + 1}</td>
                      <td><strong>{d.departmentName}</strong> {d.departmentCode ? `(${d.departmentCode})` : ''}</td>
                      <td>{d.students}</td>
                      <td>{d.mentored}</td>
                      <td><span className="badge badge-danger">{d.pending}</span></td>
                      <td><CoverageBar percent={d.coveragePercent} /></td>
                      <td>{d.totalMentoringSessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================ 30-DAY REPORT ============================ */}
      {currentTab === 'mentoring-reports' && (
        <div>
          <PageHeader
            eyebrow="Administration"
            title="30-Day Mentoring Report"
            subtitle="Weekly mentoring sessions and coverage across departments for the selected reporting window."
          />
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title"><FileText size={18} /> Department-wise 30-Day Mentoring Report</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label htmlFor="report-weeks" style={{ fontSize: '0.75rem', color: 'var(--color-slate-600)' }}>Weeks</label>
                <select
                  id="report-weeks"
                  className="input"
                  value={reportWeeks}
                  onChange={(e) => setReportWeeks(Number(e.target.value))}
                  style={{ width: '90px' }}
                >
                  {[4, 5, 6, 8, 12].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>

            {reportLoading ? (
              <ReportsSkeleton />
            ) : !report ? (
              <EmptyState compact title="Report unavailable" description="The 30-day report could not be loaded." />
            ) : (
              <>
                <div className="card-body">
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)', marginBottom: '1rem' }}>
                    Reporting window: <strong>{report.from}</strong> to <strong>{report.to}</strong> Â·{' '}
                    {report.totals.mentoringSessions} sessions Â· {report.totals.coveredStudents} of{' '}
                    {report.totals.totalStudents} students covered ({report.totals.coveragePercent}%)
                  </div>
                  <WeeklyProgressList weeks={report.weekly} />
                </div>
              </>
            )}
          </div>

          {report && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><Building2 size={18} /> Department-wise Breakdown</h3>
                <span className="badge badge-neutral">{report.departments.length} departments</span>
              </div>
              {report.departments.length === 0 ? (
                <EmptyState compact title="No departments to report" description="Create departments to receive a 30-day report." />
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Department</th><th>Students</th><th>Covered</th><th>Pending</th>
                        <th>Unassigned</th><th>Sessions</th><th>Coverage</th><th>Weekly Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.departments.map((d) => (
                        <tr key={d.departmentId}>
                          <td><strong>{d.departmentName}</strong> {d.departmentCode ? `(${d.departmentCode})` : ''}</td>
                          <td>{d.totalStudents}</td>
                          <td><span className="badge badge-success">{d.coveredStudents}</span></td>
                          <td><span className="badge badge-danger">{d.pendingStudents}</span></td>
                          <td>{d.unassignedStudents}</td>
                          <td>{d.mentoringSessions}</td>
                          <td><CoverageBar percent={d.coveragePercent} /></td>
                          <td style={{ minWidth: '160px' }}>
                            <WeeklyProgressList weeks={d.weekly} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminMentoringDashboard;


