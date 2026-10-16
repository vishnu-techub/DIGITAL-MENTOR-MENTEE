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
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/common/EmptyState';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import { PrincipalHeader } from '../../components/principal/PrincipalHeader';
import { PrincipalKpiCard } from '../../components/principal/PrincipalKpi';
import {
  PrincipalCoverageRing,
  PrincipalRankedBars,
  PrincipalWeeklyColumns,
  PrincipalDistributionBars,
  coverageColor,
  formatShortDay,
} from '../../components/principal/PrincipalCharts';
import { PrincipalDepartmentCard } from '../../components/principal/PrincipalDepartmentCard';
import {
  PrincipalActivityFeed,
  PrincipalAlerts,
} from '../../components/principal/PrincipalActivity';
import { PrincipalDashboardSkeleton } from '../../components/principal/PrincipalDashboardSkeleton';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck2,
  ChevronLeft,
  ClipboardList,
  FileText,
  GraduationCap,
  Hash,
  LayoutDashboard,
  Mail,
  MapPin,
  Phone,
  PieChart as PieChartIcon,
  Search,
  ShieldCheck,
  Target,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';

/**
 * ============================================================================
 * Principal portal — premium institutional dashboard (READ-ONLY)
 * ============================================================================
 *
 * The Principal is the institutional leadership role. This page is a
 * Principal-specific redesign: a compact executive heading, KPI grid, analytics
 * and department overview. It reads the SAME server-computed college-wide
 * surface as the Admin mentoring dashboard (every number comes from
 * `/api/admin/overview/*`), so the Principal and the Admin can never disagree.
 *
 * The shared `AdminMentoringDashboard` is intentionally NOT used or modified —
 * the Admin keeps its existing interface byte-for-byte. All styling lives in
 * `pd-` classes that only these Principal components render.
 *
 * The role's reach is unchanged: the backend still refuses every route outside
 * `/api/admin/overview/*` for a PRINCIPAL, so this page is view-only by
 * construction. It performs no writes and invents no data.
 */

const DEFAULT_TAB = 'mentoring-dashboard';
const NEVER = '—';

interface PrincipalDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

const TABS = [
  { key: 'mentoring-dashboard', label: 'College Dashboard', icon: LayoutDashboard },
  { key: 'mentoring-hods', label: 'HOD Coverage', icon: UserCog },
  { key: 'mentoring-departments', label: 'Department Overview', icon: Building2 },
  { key: 'mentoring-comparison', label: 'Department Comparison', icon: Award },
  { key: 'mentoring-reports', label: 'Institutional Reports', icon: FileText },
] as const;

interface DrillState {
  departmentId: string;
  departmentName: string;
  mentorId: string | null;
  mentorName: string | null;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Friendly month label from `YYYY-MM`. */
function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  const name = MONTHS_SHORT[Number(month) - 1];
  return name ? `${name} ${year}` : ym;
}

function coverageTone(percent: number): 'green' | 'amber' | 'red' {
  if (percent >= 80) return 'green';
  if (percent >= 50) return 'amber';
  return 'red';
}

export const PrincipalDashboard: React.FC<PrincipalDashboardProps> = ({
  currentTab,
  onSelectTab,
}) => {
  const toast = useToast();

  const activeTab = currentTab.startsWith('mentoring-') ? currentTab : DEFAULT_TAB;

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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
      console.error('Failed to load Principal dashboard:', err);
      setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadReport = useCallback(
    async (weeks: number) => {
      setReportLoading(true);
      try {
        const res = await api.adminMentoring.report30Day(weeks);
        setReport(res.data);
      } catch (err: any) {
        toast.error('Could not load the institutional report: ' + err.message);
      } finally {
        setReportLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (activeTab === 'mentoring-reports') loadReport(reportWeeks);
  }, [activeTab, reportWeeks, loadReport]);

  const openDepartment = useCallback(
    async (row: AdminDepartmentRow) => {
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
    },
    [toast]
  );

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
  const deptRows = useMemo(() => departments?.departments || [], [departments]);

  /* --------------------------------------------------------------- loading */
  if (loading) return <PrincipalDashboardSkeleton />;

  if (loadError) {
    if (loadError.type === 'NETWORK_ERROR' || loadError.statusCode === 0) {
      return <NetworkErrorState onRetry={loadData} fullPage={false} />;
    }
    if (loadError.type === 'SERVICE_UNAVAILABLE' || loadError.statusCode === 503) {
      return <ServiceUnavailableState onRetry={loadData} fullPage={false} />;
    }
    return <ServerErrorState onRetry={loadData} fullPage={false} />;
  }

  /* -------------------------------------------------------- shared chrome */
  const tabBar = (
    <nav className="pd-tabs" role="tablist" aria-label="Principal dashboard sections">
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === activeTab;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`pd-tab${isActive ? ' active' : ''}`}
            onClick={() => onSelectTab(t.key)}
          >
            <Icon size={15} aria-hidden="true" /> {t.label}
          </button>
        );
      })}
    </nav>
  );

  const monthControl = (
    <label className="pd-toolbar" style={{ gap: '0.5rem' }}>
      <span className="pd-kpi-label" style={{ fontSize: 'var(--text-xs)' }}>
        Reporting month
      </span>
      <input
        type="month"
        className="pd-input"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        aria-label="Reporting month"
      />
    </label>
  );

  /* ------------------------------------------------------- drill-down view */
  if (drill) {
    return (
      <div className="pd-root">
        <div className="pd-toolbar" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="pd-btn pd-btn-ghost pd-btn-sm" onClick={closeDrill}>
            <ChevronLeft size={14} aria-hidden="true" /> Back
          </button>
          <nav className="pd-crumbs" aria-label="Drill-down path">
            <span>Principal Dashboard</span>
            <span className="sep">/</span>
            <strong>{drill.departmentName}</strong>
            {drill.mentorName ? (
              <>
                <span className="sep">/</span>
                <strong>{drill.mentorName}</strong>
              </>
            ) : null}
          </nav>
        </div>

        {drillLoading ? (
          <PrincipalDashboardSkeleton />
        ) : mentorDetail ? (
          renderMentorDetail(mentorDetail)
        ) : deptDetail ? (
          renderDepartmentDetail(deptDetail, openMentor)
        ) : (
          <EmptyState
            title="Department details unavailable"
            description="The department could not be loaded. Return to the dashboard and try again."
          />
        )}
      </div>
    );
  }

  /* --------------------------------------------------------------- reports */
  if (activeTab === 'mentoring-reports') {
    return (
      <div className="pd-root">
        {tabBar}
        <section className="pd-section">
          <div className="pd-section-head">
            <div>
              <h2 className="pd-section-title">
                <FileText size={18} aria-hidden="true" /> Institutional mentoring report
              </h2>
              <p className="pd-section-sub">
                Rolling window{report ? ` · ${report.from} to ${report.to}` : ''}. Coverage is
                server-computed from stored records.
              </p>
            </div>
            <label className="pd-toolbar" style={{ gap: '0.5rem' }}>
              <span className="pd-kpi-label" style={{ fontSize: 'var(--text-xs)' }}>
                Window
              </span>
              <select
                className="pd-input"
                value={reportWeeks}
                onChange={(e) => setReportWeeks(Number(e.target.value))}
                aria-label="Report window in weeks"
              >
                {[3, 4, 5, 6, 8, 10, 12].map((w) => (
                  <option key={w} value={w}>
                    Last {w} weeks
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {reportLoading && !report ? (
          <PrincipalDashboardSkeleton />
        ) : report ? (
          <>
            <div className="pd-kpi-grid">
              <PrincipalKpiCard label="Students" value={report.totals.totalStudents} icon={<GraduationCap size={22} />} tone="navy" />
              <PrincipalKpiCard label="Covered students" value={report.totals.coveredStudents} icon={<UserCheck size={22} />} tone="green" hint={`${report.totals.coveragePercent}% coverage`} />
              <PrincipalKpiCard label="Pending students" value={report.totals.pendingStudents} icon={<AlertTriangle size={22} />} tone="amber" />
              <PrincipalKpiCard label="Mentoring sessions" value={report.totals.mentoringSessions} icon={<ClipboardList size={22} />} tone="gold" />
              <PrincipalKpiCard label="Departments" value={report.totals.departments} icon={<Building2 size={22} />} tone="cyan" />
            </div>

            <div className="pd-card">
              <div className="pd-card-head">
                <h3 className="pd-card-title">
                  <Activity size={16} aria-hidden="true" /> Weekly mentoring activity
                </h3>
                <span className="pd-badge pd-badge-gold">Last {report.weeks} weeks</span>
              </div>
              <div className="pd-card-body">
                <PrincipalWeeklyColumns weeks={report.weekly} />
              </div>
            </div>

            <div className="pd-card">
              <div className="pd-card-head">
                <h3 className="pd-card-title">
                  <Building2 size={16} aria-hidden="true" /> Department breakdown
                </h3>
              </div>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Students</th>
                      <th>Covered</th>
                      <th>Pending</th>
                      <th>Unassigned</th>
                      <th>Sessions</th>
                      <th>Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.departments.map((d) => (
                      <tr key={d.departmentId}>
                        <td>
                          <strong>{d.departmentName}</strong>
                          {d.departmentCode ? (
                            <div className="pd-muted" style={{ fontSize: 'var(--text-xs)' }}>
                              {d.departmentCode}
                            </div>
                          ) : null}
                        </td>
                        <td>{d.totalStudents}</td>
                        <td>{d.coveredStudents}</td>
                        <td>{d.pendingStudents}</td>
                        <td>{d.unassignedStudents}</td>
                        <td>{d.mentoringSessions}</td>
                        <td>
                          <span style={{ fontWeight: 800, color: coverageColor(d.coveragePercent) }}>
                            {d.coveragePercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.departments.length === 0 && (
                <div className="pd-card-body">
                  <EmptyState
                    compact
                    title="No department activity in this window"
                    description="No mentoring sessions were recorded in the selected reporting window."
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            title="Report unavailable"
            description="The institutional report could not be loaded. Adjust the window and try again."
          />
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------ HOD surface */
  if (activeTab === 'mentoring-hods') {
    return (
      <div className="pd-root">
        {tabBar}
        <section className="pd-section">
          <div className="pd-section-head">
            <div>
              <h2 className="pd-section-title">
                <UserCog size={18} aria-hidden="true" /> HOD coverage
              </h2>
              <p className="pd-section-sub">
                {hods?.totalHODs ?? 0} HOD account{(hods?.totalHODs ?? 0) === 1 ? '' : 's'} · each
                department's own server-computed figures for {formatMonth(month)}.
              </p>
            </div>
            <div className="pd-toolbar">
              {monthControl}
              <label className="pd-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  className="pd-input"
                  placeholder="Search HOD, department…"
                  value={hodQuery}
                  onChange={(e) => setHodQuery(e.target.value)}
                  aria-label="Search HOD coverage"
                />
              </label>
            </div>
          </div>

          <div className="pd-card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>HOD</th>
                    <th>Department</th>
                    <th>Students</th>
                    <th>Faculty</th>
                    <th>Mentors</th>
                    <th>Coverage</th>
                    <th>Pending</th>
                    <th>Sessions</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHods.map((h) => (
                    <tr key={h.hodId}>
                      <td>
                        <strong>{h.hodName}</strong>
                        <div className="pd-muted" style={{ fontSize: 'var(--text-xs)' }}>
                          {h.email || h.username}
                        </div>
                      </td>
                      <td>
                        {h.departmentName || NEVER}
                        {h.departmentCode ? (
                          <div className="pd-muted" style={{ fontSize: 'var(--text-xs)' }}>
                            {h.departmentCode}
                          </div>
                        ) : null}
                      </td>
                      <td>{h.students}</td>
                      <td>{h.faculty}</td>
                      <td>{h.mentors}</td>
                      <td>
                        <span style={{ fontWeight: 800, color: coverageColor(h.mentoringCoverage) }}>
                          {h.mentoringCoverage}%
                        </span>
                      </td>
                      <td>{h.pendingStudents}</td>
                      <td>{h.totalMentoringSessions}</td>
                      <td>{h.lastMentoringActivity ? formatShortDay(h.lastMentoringActivity) : NEVER}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredHods.length === 0 && (
              <div className="pd-card-body">
                <EmptyState
                  compact
                  icon={<UserCog size={30} style={{ color: 'var(--color-slate-300)' }} />}
                  title={hodQuery ? 'No HODs match your search' : 'No HOD accounts yet'}
                  description={
                    hodQuery
                      ? 'Try a different name, department or email.'
                      : 'HOD accounts appear here once departments are assigned leadership.'
                  }
                />
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  /* ---------------------------------------------------- department overview */
  if (activeTab === 'mentoring-departments') {
    return (
      <div className="pd-root">
        {tabBar}
        <section className="pd-section">
          <div className="pd-section-head">
            <div>
              <h2 className="pd-section-title">
                <Building2 size={18} aria-hidden="true" /> Department overview
              </h2>
              <p className="pd-section-sub">
                {departments?.totalDepartments ?? 0} department
                {(departments?.totalDepartments ?? 0) === 1 ? '' : 's'} · select a card to open its
                read-only drill-down (HODs → mentors → mentees).
              </p>
            </div>
            <div className="pd-toolbar">
              {monthControl}
              <label className="pd-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  className="pd-input"
                  placeholder="Search department…"
                  value={deptQuery}
                  onChange={(e) => setDeptQuery(e.target.value)}
                  aria-label="Search departments"
                />
              </label>
            </div>
          </div>

          {filteredDepartments.length === 0 ? (
            <div className="pd-card">
              <div className="pd-card-body">
                <EmptyState
                  compact
                  icon={<Building2 size={30} style={{ color: 'var(--color-slate-300)' }} />}
                  title={deptQuery ? 'No departments match your search' : 'No departments yet'}
                  description={
                    deptQuery
                      ? 'Try a different department name, code or HOD name.'
                      : 'Departments appear here once they are created.'
                  }
                />
              </div>
            </div>
          ) : (
            <div className="pd-dept-grid">
              {filteredDepartments.map((d) => (
                <PrincipalDepartmentCard key={d.departmentId} row={d} onOpen={openDepartment} />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  /* -------------------------------------------------------- comparison tab */
  if (activeTab === 'mentoring-comparison') {
    const rows: AdminDepartmentComparisonRow[] = comparison?.departments || [];
    const ranked = rows
      .slice()
      .sort((a, b) => b.coveragePercent - a.coveragePercent)
      .slice(0, 12)
      .map((d) => ({
        key: d.departmentId,
        label: d.departmentName,
        value: d.coveragePercent,
        suffix: '%',
        color: coverageColor(d.coveragePercent),
      }));

    return (
      <div className="pd-root">
        {tabBar}
        <section className="pd-section">
          <div className="pd-section-head">
            <div>
              <h2 className="pd-section-title">
                <Award size={18} aria-hidden="true" /> Department comparison
              </h2>
              <p className="pd-section-sub">
                Highest department coverage this month:{' '}
                <strong>{comparison?.highestCoveragePercent ?? 0}%</strong>. Ranked highest first.
              </p>
            </div>
            {monthControl}
          </div>

          <div className="pd-card">
            <div className="pd-card-head">
              <h3 className="pd-card-title">
                <BarChart3 size={16} aria-hidden="true" /> Coverage ranking
              </h3>
            </div>
            <div className="pd-card-body">
              <PrincipalRankedBars
                rows={ranked}
                max={100}
                emptyTitle="No departments to compare yet"
                emptyDescription="Department coverage appears once students are registered and mentored."
              />
            </div>
          </div>

          <div className="pd-card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Students</th>
                    <th>Mentored</th>
                    <th>Pending</th>
                    <th>Sessions</th>
                    <th>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.departmentId}>
                      <td>
                        <strong>{d.departmentName}</strong>
                        {d.departmentCode ? (
                          <div className="pd-muted" style={{ fontSize: 'var(--text-xs)' }}>
                            {d.departmentCode}
                          </div>
                        ) : null}
                      </td>
                      <td>{d.students}</td>
                      <td>{d.mentored}</td>
                      <td>{d.pending}</td>
                      <td>{d.totalMentoringSessions}</td>
                      <td>
                        <span style={{ fontWeight: 800, color: coverageColor(d.coveragePercent) }}>
                          {d.coveragePercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && (
              <div className="pd-card-body">
                <EmptyState
                  compact
                  title="No department data for this month"
                  description="Coverage comparison appears once departments, students and mentoring records exist."
                />
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  /* --------------------------------------------------- executive overview */
  const definitions = dashboard?.definitions;

  return (
    <div className="pd-root">
      <PrincipalHeader />
      {tabBar}

      {/* KPI grid — every value is a server field; no client arithmetic. */}
      <section className="pd-section">
        <div className="pd-section-head">
          <div>
            <h2 className="pd-section-title">
              <Target size={18} aria-hidden="true" /> Key institutional metrics
            </h2>
            <p className="pd-section-sub">
              College-wide totals for {formatMonth(month)}
              {summary?.lastMentoringActivity
                ? ` · last mentoring activity ${formatShortDay(summary.lastMentoringActivity)}`
                : ' · no mentoring activity recorded yet'}
              .
            </p>
          </div>
          {monthControl}
        </div>

        <div className="pd-kpi-grid">
          <PrincipalKpiCard
            label="Departments"
            value={summary?.totalDepartments ?? 0}
            hint={
              summary
                ? `${summary.departmentsWithHod} with HOD · ${summary.departmentsWithoutHod} without`
                : undefined
            }
            icon={<Building2 size={22} />}
            tone="navy"
          />
          <PrincipalKpiCard
            label="Total students"
            value={summary?.totalStudents ?? 0}
            hint="Registered across all departments"
            icon={<GraduationCap size={22} />}
            tone="violet"
          />
          <PrincipalKpiCard
            label="Total faculty"
            value={summary?.totalFaculty ?? 0}
            hint="Teaching staff institution-wide"
            icon={<Users size={22} />}
            tone="cyan"
          />
          <PrincipalKpiCard
            label="Active mentors"
            value={summary?.totalMentors ?? 0}
            hint="Faculty currently mentoring"
            icon={<UserCheck size={22} />}
            tone="navy"
          />
          <PrincipalKpiCard
            label="Students with active mentoring"
            value={summary?.mentoredThisMonth ?? 0}
            hint="Mentored in the reporting month"
            icon={<CalendarCheck2 size={22} />}
            tone="green"
          />
          <PrincipalKpiCard
            label="Mentoring sessions"
            value={summary?.totalMentoringSessions ?? 0}
            hint="Mentoring records + Saturday meetings (all time)"
            icon={<ClipboardList size={22} />}
            tone="gold"
          />
          <PrincipalKpiCard
            label="Overall coverage"
            value={`${summary?.overallMentoringCoverage ?? 0}%`}
            hint="Share of students mentored this month"
            icon={<Target size={22} />}
            tone={coverageTone(summary?.overallMentoringCoverage ?? 0)}
          />
          <PrincipalKpiCard
            label="Pending this month"
            value={summary?.pendingStudents ?? 0}
            hint="Students not yet mentored this month"
            icon={<AlertTriangle size={22} />}
            tone={(summary?.pendingStudents ?? 0) > 0 ? 'amber' : 'green'}
          />
        </div>
      </section>

      {/* Analytics — distinct metrics, no duplicated charts. */}
      <section className="pd-section">
        <div className="pd-section-head">
          <h2 className="pd-section-title">
            <BarChart3 size={18} aria-hidden="true" /> Analytics
          </h2>
          <p className="pd-section-sub">Coverage, activity and distribution for {formatMonth(month)}.</p>
        </div>

        <div className="pd-analytics-grid">
          <div className="pd-card">
            <div className="pd-card-head">
              <h3 className="pd-card-title">
                <Target size={16} aria-hidden="true" /> Mentoring coverage by department
              </h3>
            </div>
            <div className="pd-card-body">
              <PrincipalRankedBars
                rows={deptRows
                  .slice()
                  .sort((a, b) => b.mentoringCoverage - a.mentoringCoverage)
                  .map((d) => ({
                    key: d.departmentId,
                    label: d.departmentName,
                    value: d.mentoringCoverage,
                    suffix: '%',
                    color: coverageColor(d.mentoringCoverage),
                  }))}
                max={100}
                emptyTitle="No coverage to chart yet"
                emptyDescription="Department coverage appears once students are registered and mentored."
              />
            </div>
          </div>

          <div className="pd-card">
            <div className="pd-card-head">
              <h3 className="pd-card-title">
                <PieChartIcon size={16} aria-hidden="true" /> Reporting month coverage
              </h3>
            </div>
            <div className="pd-card-body">
              <PrincipalCoverageRing pie={dashboard?.pie} />
            </div>
          </div>

          <div className="pd-card pd-analytics-wide">
            <div className="pd-card-head">
              <h3 className="pd-card-title">
                <Activity size={16} aria-hidden="true" /> Weekly mentoring activity
              </h3>
              <span className="pd-badge pd-badge-gold">
                Last {dashboard?.weeklyProgress?.length ?? 0} weeks
              </span>
            </div>
            <div className="pd-card-body">
              <PrincipalWeeklyColumns weeks={dashboard?.weeklyProgress || []} />
            </div>
          </div>

          <div className="pd-card pd-analytics-wide">
            <div className="pd-card-head">
              <h3 className="pd-card-title">
                <Users size={16} aria-hidden="true" /> Students, faculty &amp; mentors by department
              </h3>
            </div>
            <div className="pd-card-body">
              <PrincipalDistributionBars
                rows={deptRows.map((d) => ({
                  key: d.departmentId,
                  label: d.departmentName,
                  students: d.students,
                  faculty: d.faculty,
                  mentors: d.mentors,
                }))}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Department overview */}
      <section className="pd-section">
        <div className="pd-section-head">
          <h2 className="pd-section-title">
            <Building2 size={18} aria-hidden="true" /> Department overview
          </h2>
          <button
            type="button"
            className="pd-btn pd-btn-ghost pd-btn-sm"
            onClick={() => onSelectTab('mentoring-departments')}
          >
            Open full directory
          </button>
        </div>
        {deptRows.length === 0 ? (
          <div className="pd-card">
            <div className="pd-card-body">
              <EmptyState
                compact
                icon={<Building2 size={30} style={{ color: 'var(--color-slate-300)' }} />}
                title="No departments yet"
                description="Department summaries appear here once departments are created."
              />
            </div>
          </div>
        ) : (
          <div className="pd-dept-grid">
            {deptRows.map((d) => (
              <PrincipalDepartmentCard key={d.departmentId} row={d} onOpen={openDepartment} />
            ))}
          </div>
        )}
      </section>

      {/* Institutional activity + attention */}
      <section className="pd-section">
        <div className="pd-section-head">
          <h2 className="pd-section-title">
            <ShieldCheck size={18} aria-hidden="true" /> Institutional activity &amp; attention
          </h2>
        </div>
        <div className="pd-split">
          <div className="pd-card">
            <div className="pd-card-head">
              <h3 className="pd-card-title">
                <Activity size={16} aria-hidden="true" /> Recent institutional activity
              </h3>
            </div>
            <div className="pd-card-body">
              <PrincipalActivityFeed departments={deptRows} />
            </div>
          </div>
          <div className="pd-card">
            <div className="pd-card-head">
              <h3 className="pd-card-title">
                <AlertTriangle size={16} aria-hidden="true" /> Pending institutional attention
              </h3>
            </div>
            <div className="pd-card-body">
              <PrincipalAlerts summary={summary} departments={deptRows} />
            </div>
          </div>
        </div>
      </section>

      {definitions && (
        <details className="pd-card">
          <summary
            style={{
              cursor: 'pointer',
              padding: '1rem 1.25rem',
              fontWeight: 700,
              color: 'var(--color-navy-800)',
              fontSize: 'var(--text-sm)',
            }}
          >
            How these figures are computed
          </summary>
          <div className="pd-card-body" style={{ paddingTop: 0 }}>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.1rem',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-slate-500)',
                lineHeight: 1.8,
              }}
            >
              <li>
                <strong>Mentored:</strong> {definitions.mentored}
              </li>
              <li>
                <strong>Pending:</strong> {definitions.pending}
              </li>
              <li>
                <strong>Mentors:</strong> {definitions.mentors}
              </li>
              <li>
                <strong>Coverage:</strong> {definitions.coverage}
              </li>
              <li>
                <strong>Sessions:</strong> {definitions.sessions}
              </li>
            </ul>
          </div>
        </details>
      )}
    </div>
  );
};

/* ==========================================================================
 * Drill-down presenters (module-level so they never close over page state)
 * ======================================================================== */

function renderDepartmentDetail(
  dept: AdminDepartmentDetailData,
  onOpenMentor: (
    departmentId: string,
    departmentName: string,
    mentorId: string,
    mentorName: string
  ) => void
) {
  const s = dept.summary;
  return (
    <>
      <section className="pd-section">
        <div className="pd-section-head">
          <div>
            <h2 className="pd-section-title">
              <Building2 size={18} aria-hidden="true" /> {dept.department.departmentName}
            </h2>
            <p className="pd-section-sub">
              Read-only departmental drill-down
              {dept.department.departmentCode ? ` · ${dept.department.departmentCode}` : ''}
              {s.lastMentoringActivity
                ? ` · last mentoring activity ${formatShortDay(s.lastMentoringActivity)}`
                : ''}
            </p>
          </div>
        </div>
        <div className="pd-kpi-grid">
          <PrincipalKpiCard label="Students" value={s.totalStudents} icon={<GraduationCap size={22} />} tone="navy" />
          <PrincipalKpiCard label="Faculty" value={s.totalFaculty} icon={<Users size={22} />} tone="violet" />
          <PrincipalKpiCard label="Mentors" value={s.totalMentors} icon={<UserCheck size={22} />} tone="cyan" />
          <PrincipalKpiCard
            label="Mentoring coverage"
            value={`${s.overallMentoringCoverage}%`}
            hint={`${s.mentoredThisMonth} mentored this month`}
            icon={<Target size={22} />}
            tone={coverageTone(s.overallMentoringCoverage)}
          />
          <PrincipalKpiCard label="Sessions recorded" value={s.totalMentoringSessions} icon={<ClipboardList size={22} />} tone="gold" />
          <PrincipalKpiCard label="Pending students" value={s.pendingStudents} icon={<AlertTriangle size={22} />} tone={s.pendingStudents > 0 ? 'amber' : 'green'} />
        </div>
      </section>

      <div className="pd-analytics-grid">
        <div className="pd-card">
          <div className="pd-card-head">
            <h3 className="pd-card-title">
              <PieChartIcon size={16} aria-hidden="true" /> Reporting month coverage
            </h3>
          </div>
          <div className="pd-card-body">
            <PrincipalCoverageRing pie={dept.pie} />
          </div>
        </div>
        <div className="pd-card">
          <div className="pd-card-head">
            <h3 className="pd-card-title">
              <Activity size={16} aria-hidden="true" /> Weekly mentoring activity
            </h3>
          </div>
          <div className="pd-card-body">
            <PrincipalWeeklyColumns weeks={dept.weeklyProgress} />
          </div>
        </div>
      </div>

      <section className="pd-section">
        <div className="pd-section-head">
          <h2 className="pd-section-title">
            <UserCog size={18} aria-hidden="true" /> Department HODs
          </h2>
        </div>
        {dept.hods.length === 0 ? (
          <div className="pd-card">
            <div className="pd-card-body">
              <EmptyState
                compact
                icon={<UserCog size={30} style={{ color: 'var(--color-slate-300)' }} />}
                title="No HOD assigned"
                description="This department has no HOD account mapped to it yet."
              />
            </div>
          </div>
        ) : (
          <div className="pd-dept-grid">
            {dept.hods.map((h: AdminHodRow) => (
              <article className="pd-dept-card" key={h.hodId}>
                <div className="pd-dept-top">
                  <div>
                    <div className="pd-dept-name">{h.hodName}</div>
                    {h.email ? <div className="pd-dept-code">{h.email}</div> : null}
                  </div>
                  <span className={`pd-badge ${h.isActive ? 'pd-badge-green' : 'pd-badge-slate'}`}>
                    {h.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="pd-dept-stats">
                  <div className="pd-dept-stat">
                    <div className="pd-dept-stat-value">{h.students}</div>
                    <div className="pd-dept-stat-label">Students</div>
                  </div>
                  <div className="pd-dept-stat">
                    <div className="pd-dept-stat-value">{h.faculty}</div>
                    <div className="pd-dept-stat-label">Faculty</div>
                  </div>
                  <div className="pd-dept-stat">
                    <div className="pd-dept-stat-value">{h.mentors}</div>
                    <div className="pd-dept-stat-label">Mentors</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="pd-section">
        <div className="pd-section-head">
          <h2 className="pd-section-title">
            <Users size={18} aria-hidden="true" /> Mentor coverage
          </h2>
          <p className="pd-section-sub">Select a mentor to view their mentees (read-only).</p>
        </div>
        {dept.mentors.length === 0 ? (
          <div className="pd-card">
            <div className="pd-card-body">
              <EmptyState
                compact
                icon={<Users size={30} style={{ color: 'var(--color-slate-300)' }} />}
                title="No mentors yet"
                description="Mentors appear here once faculty take on mentees in this department."
              />
            </div>
          </div>
        ) : (
          <div className="pd-dept-grid">
            {dept.mentors.map((m: AdminMentorCoverageRow) => (
              <article className="pd-dept-card" key={m.mentorId}>
                <div className="pd-dept-top">
                  <div>
                    <div className="pd-dept-name">{m.mentorName}</div>
                    <div className="pd-dept-code">
                      {m.designation || 'Faculty'}
                      {m.employeeId ? ` · ${m.employeeId}` : ''}
                    </div>
                  </div>
                  <span className={`pd-badge ${m.isActive ? 'pd-badge-green' : 'pd-badge-slate'}`}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="pd-dept-stats">
                  <div className="pd-dept-stat">
                    <div className="pd-dept-stat-value">{m.totalMentees}</div>
                    <div className="pd-dept-stat-label">Mentees</div>
                  </div>
                  <div className="pd-dept-stat">
                    <div className="pd-dept-stat-value">{m.sessionCount}</div>
                    <div className="pd-dept-stat-label">Sessions</div>
                  </div>
                  <div className="pd-dept-stat">
                    <div className="pd-dept-stat-value">{m.mentoredThisMonth}</div>
                    <div className="pd-dept-stat-label">Mentored</div>
                  </div>
                </div>
                <div className="pd-dept-coverage">
                  <div className="pd-dept-coverage-head">
                    <span>Coverage</span>
                    <strong style={{ color: coverageColor(m.coveragePercent) }}>{m.coveragePercent}%</strong>
                  </div>
                  <div className="pd-bar-track">
                    <div
                      className="pd-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, m.coveragePercent))}%`,
                        background: coverageColor(m.coveragePercent),
                      }}
                    />
                  </div>
                </div>
                <div className="pd-dept-foot">
                  <span className="pd-dept-last">
                    {m.lastMentoringDate ? `Last ${formatShortDay(m.lastMentoringDate)}` : 'No sessions yet'}
                  </span>
                  <button
                    type="button"
                    className="pd-btn pd-btn-gold pd-btn-sm"
                    onClick={() => onOpenMentor(dept.department.departmentId, dept.department.departmentName, m.mentorId, m.mentorName)}
                  >
                    View mentees
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function renderMentorDetail(detail: AdminMentorDetailData) {
  const m = detail.mentor;
  const s = detail.summary;

  return (
    <>
      <section className="pd-card">
        <div
          className="pd-card-body"
          style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', paddingTop: '1.25rem' }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-navy-50)',
              color: 'var(--color-navy-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <UserCheck size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--color-navy-800)' }}>
              {m.fullName}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-500)', marginTop: 2 }}>
              {m.designation || 'Faculty'}
              {m.departmentName ? ` · ${m.departmentName}` : ''}
            </div>
            <div className="pd-legend" style={{ marginTop: '0.6rem', marginBottom: 0, gap: '1rem' }}>
              {m.employeeId ? (
                <span>
                  <Hash size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {m.employeeId}
                </span>
              ) : null}
              {m.email ? (
                <span>
                  <Mail size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {m.email}
                </span>
              ) : null}
              {m.phoneNumber ? (
                <span>
                  <Phone size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {m.phoneNumber}
                </span>
              ) : null}
              {m.cabinLocation ? (
                <span>
                  <MapPin size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {m.cabinLocation}
                </span>
              ) : null}
            </div>
          </div>
          <span className={`pd-badge ${m.isActive ? 'pd-badge-green' : 'pd-badge-slate'}`}>
            {m.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </section>

      <div className="pd-kpi-grid">
        <PrincipalKpiCard label="Mentees" value={s.totalMentees} icon={<GraduationCap size={22} />} tone="navy" />
        <PrincipalKpiCard label="Mentored this month" value={s.mentoredThisMonth} icon={<CalendarCheck2 size={22} />} tone="green" />
        <PrincipalKpiCard label="Pending" value={s.pending} icon={<AlertTriangle size={22} />} tone={s.pending > 0 ? 'amber' : 'green'} />
        <PrincipalKpiCard
          label="Coverage"
          value={`${s.coveragePercent}%`}
          hint={`Department coverage ${s.departmentCoveragePercent}%`}
          icon={<Target size={22} />}
          tone={coverageTone(s.coveragePercent)}
        />
        <PrincipalKpiCard label="Sessions recorded" value={s.sessionCount} icon={<ClipboardList size={22} />} tone="gold" />
      </div>

      <section className="pd-section">
        <div className="pd-section-head">
          <h2 className="pd-section-title">
            <GraduationCap size={18} aria-hidden="true" /> Assigned mentees
          </h2>
          <p className="pd-section-sub">
            {s.totalMentees} mentee{s.totalMentees === 1 ? '' : 's'} currently assigned to this mentor.
          </p>
        </div>
        <div className="pd-card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Register No.</th>
                  <th>Name</th>
                  <th>Class / Section</th>
                  <th>Year</th>
                  <th>This month</th>
                  <th>Last mentoring</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {detail.mentees.map((row) => (
                  <tr key={row.assignmentId || row.id}>
                    <td>
                      <strong>{row.registerNumber}</strong>
                    </td>
                    <td>{row.fullName}</td>
                    <td>
                      {row.batch || NEVER}
                      {row.section ? ` · Sec ${row.section}` : ''}
                    </td>
                    <td>{row.year ?? NEVER}</td>
                    <td>
                      {row.mentoredThisMonth ? (
                        <span className="pd-badge pd-badge-green">Mentored</span>
                      ) : (
                        <span className="pd-badge pd-badge-amber">Pending</span>
                      )}
                    </td>
                    <td>{row.lastMentoringDate ? formatShortDay(row.lastMentoringDate) : NEVER}</td>
                    <td>{row.sessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.mentees.length === 0 && (
            <div className="pd-card-body">
              <EmptyState
                compact
                icon={<GraduationCap size={30} style={{ color: 'var(--color-slate-300)' }} />}
                title="No mentees assigned"
                description="This mentor currently has no active mentee assignments."
              />
            </div>
          )}
        </div>
      </section>

      <p className="pd-muted" style={{ fontSize: 'var(--text-xs)', margin: '0 0 0.5rem' }}>
        <Briefcase size={12} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Mentoring
        notes and private documents remain governed by the existing role permissions and are not
        exposed here.
      </p>
    </>
  );
}

export default PrincipalDashboard;
