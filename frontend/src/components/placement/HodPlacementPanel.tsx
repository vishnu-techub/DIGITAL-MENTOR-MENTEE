import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, Users, UserCheck, TrendingUp, CircleCheckBig, FileWarning, BarChart3 } from 'lucide-react';
import {
  api,
  type HodMentorWiseRow,
  type HodPlacementSummaryResponse,
  type HodStudentWiseResponse,
  type PlacementStatus,
} from '../../api/client';
import { EmptyState } from '../common/EmptyState';
import { PageHeader } from '../common/PageHeader';
import { DashboardSkeleton } from '../common/SkeletonLoader';

const STATUS_FILTERS: Array<PlacementStatus | 'ALL'> = [
  'ALL',
  'NOT_STARTED',
  'TRAINING',
  'APPLYING',
  'INTERVIEW',
  'SELECTED',
  'NOT_SELECTED',
  'PLACED',
  'NOT_PLACED',
];

type HodSubTab = 'summary' | 'students' | 'mentors';

/**
 * HOD-facing placement monitoring. Three views share one department scope:
 * summary (all departs from the server), student-wise rows (server-filtered by
 * status), and mentor-wise aggregates.
 */
export const HodPlacementPanel: React.FC = () => {
  const [tab, setTab] = useState<HodSubTab>('summary');
  const [summary, setSummary] = useState<HodPlacementSummaryResponse | null>(null);
  const [studentWise, setStudentWise] = useState<HodStudentWiseResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [mentors, setMentors] = useState<HodMentorWiseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const res: any = await api.placements.hodSummary();
      setSummary(res.data ?? res);
    } catch (e: any) {
      setError(e?.message || 'Unable to load the placement summary.');
    }
  }, []);

  const loadStudentWise = useCallback(async (status: string) => {
    try {
      const res: any = await api.placements.hodStudentWise(status === 'ALL' ? undefined : status);
      setStudentWise(res.data ?? res);
    } catch (e: any) {
      setError(e?.message || 'Unable to load student-wise placement progress.');
    }
  }, []);

  const loadMentors = useCallback(async () => {
    try {
      const res: any = await api.placements.hodMentorWise();
      const d = res.data ?? res;
      setMentors(d.mentors ?? []);
    } catch (e: any) {
      setError(e?.message || 'Unable to load mentor-wise placement progress.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadSummary(), loadStudentWise('ALL'), loadMentors()])
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [loadSummary, loadStudentWise, loadMentors]);

  const changeFilter = (status: string) => {
    setStatusFilter(status);
    void loadStudentWise(status);
  };

  if (loading) return <DashboardSkeleton />;

  if (error && !summary) {
    return (
      <EmptyState
        icon={<Briefcase size={28} />}
        title="Placement data unavailable"
        description={error}
        action={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setLoading(true);
              Promise.all([loadSummary(), loadStudentWise(statusFilter), loadMentors()]).finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        }
      />
    );
  }

  const s = summary?.summary;
  const statusDistribution: Record<string, number> = summary?.statusDistribution ?? {};

  const distributionRow = (status: string, count: number) => {
    const total = s?.totalFinalYearStudents ?? 1;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ minWidth: 130, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--slate-600)' }}>
          {status.replace('_', ' ')}
        </span>
        <div className="progress-track" style={{ flex: 1 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span style={{ minWidth: 28, textAlign: 'right', fontWeight: 700, color: 'var(--primary-700, #1e40af)' }}>
          {count}
        </span>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow="Department"
        title="Placement Monitoring"
        subtitle="Final-year placement progress for your department, tracked by student and by mentor."
      />
      <div className="tabs" role="tablist" aria-label="Placement monitoring views" style={{ borderBottom: 'none', flexWrap: 'wrap' }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'summary'}
          className={`btn btn-sm ${tab === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 'var(--radius-md)', fontWeight: tab === 'summary' ? 700 : 500 }}
          onClick={() => setTab('summary')}
        >
          Summary
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'students'}
          className={`btn btn-sm ${tab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 'var(--radius-md)', fontWeight: tab === 'students' ? 700 : 500 }}
          onClick={() => setTab('students')}
        >
          Student-wise
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mentors'}
          className={`btn btn-sm ${tab === 'mentors' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 'var(--radius-md)', fontWeight: tab === 'mentors' ? 700 : 500 }}
          onClick={() => setTab('mentors')}
        >
          Mentor-wise
        </button>
      </div>

      {tab === 'summary' && s && (
        <div>
          <div className="section-heading">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Briefcase size={22} /> Department Placement Monitor
            </h2>
            <p className="section-subtitle">
              {summary?.department?.name} · final-year students only. Derived statuses (placed / not
              placed) are computed server-side from the stored status.
            </p>
          </div>

          <div className="overview-summary-grid" style={{ marginBottom: '1.25rem' }}>
            <div className="overview-summary-card">
              <Users size={20} />
              <div>
                <div className="overview-summary-value">{s.totalFinalYearStudents}</div>
                <div className="overview-summary-label">Final-year students</div>
              </div>
            </div>
            <div className="overview-summary-card" style={{ borderLeftColor: 'var(--good-500, #22c55e)' }}>
              <CircleCheckBig size={20} />
              <div>
                <div className="overview-summary-value" style={{ color: 'var(--good-600, #15803d)' }}>
                  {s.placed}
                </div>
                <div className="overview-summary-label">Placed · {s.placementPercentage}%</div>
              </div>
            </div>
            <div className="overview-summary-card" style={{ borderLeftColor: 'var(--danger-500, #ef4444)' }}>
              <FileWarning size={20} />
              <div>
                <div className="overview-summary-value" style={{ color: 'var(--danger-600, #b91c1c)' }}>
                  {s.notPlaced}
                </div>
                <div className="overview-summary-label">Not placed</div>
              </div>
            </div>
            <div className="overview-summary-card">
              <TrendingUp size={20} />
              <div>
                <div className="overview-summary-value">{s.inProgress}</div>
                <div className="overview-summary-label">Still in progress</div>
              </div>
            </div>
            <div className="overview-summary-card">
              <BarChart3 size={20} />
              <div>
                <div className="overview-summary-value">{s.withRecord}</div>
                <div className="overview-summary-label">With record · {s.withoutRecord} without</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <strong>Status distribution</strong>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(statusDistribution).map(([status, count]) =>
                distributionRow(status, count as number)
              )}
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--slate-500)',
                  borderTop: '1px solid var(--slate-100)',
                  paddingTop: '0.5rem',
                }}
              >
                placement percentage = PLACED ÷ total final-year students. Students without a stored
                record count as NOT STARTED.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <div>
          <div className="section-heading">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserCheck size={22} /> Student-wise placement
            </h2>
            <p className="section-subtitle">
              Filter the department roster by current status. Filtering is server-side.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn-sm ${statusFilter === f ? 'btn-gold' : 'btn-secondary'}`}
                onClick={() => changeFilter(f)}
              >
                {f === 'ALL' ? 'All statuses' : f.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="card">
            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th scope="col">Register No.</th>
                    <th scope="col">Name</th>
                    <th scope="col">Mentor</th>
                    <th scope="col">Status</th>
                    <th scope="col">Training</th>
                    <th scope="col">Company</th>
                    <th scope="col">Offered</th>
                    <th scope="col">Package</th>
                  </tr>
                </thead>
                <tbody>
                  {(studentWise?.students ?? []).map((row) => (
                    <tr key={row.studentId}>
                      <td style={{ fontWeight: 600 }}>{row.registerNumber}</td>
                      <td>{row.fullName}</td>
                      <td>{row.mentorName || '—'}</td>
                      <td>
                        <span className={`badge ${row.placed ? 'badge-success' : row.overallStatus === 'NOT_PLACED' ? 'badge-danger' : 'badge-info'}`}>
                          {row.overallStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {row.trainingStatus === 'NOT_STARTED' ? '—' : row.trainingStatus.replace('_', ' ')}
                        {row.trainingProgress > 0 && ` (${row.trainingProgress}%)`}
                      </td>
                      <td>{row.companyName || '—'}</td>
                      <td>{row.placedCompanyName || '—'}</td>
                      <td>{row.package != null ? `${row.package} LPA` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(studentWise?.students ?? []).length === 0 && (
                <p style={{ padding: '1rem', color: 'var(--slate-500)' }}>
                  No final-year students match this status filter.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'mentors' && (
        <div>
          <div className="section-heading">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={22} /> Mentor-wise placement coverage
            </h2>
            <p className="section-subtitle">
              Coverage is driven by ACTIVE mentor assignments in this department, never by client input.
            </p>
          </div>
          <div className="card">
            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 860 }}>
                <thead>
                  <tr>
                    <th scope="col">Mentor</th>
                    <th scope="col">Mentees</th>
                    <th scope="col">With record</th>
                    <th scope="col">Placed</th>
                    <th scope="col">In progress</th>
                    <th scope="col">Not placed</th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {mentors.map((m) => (
                    <tr key={m.mentorId}>
                      <td style={{ fontWeight: 600 }}>{m.mentorName}</td>
                      <td>{m.finalYearMentees}</td>
                      <td>{m.withRecord}</td>
                      <td style={{ color: 'var(--good-600, #15803d)', fontWeight: 700 }}>{m.placed}</td>
                      <td>{m.inProgress}</td>
                      <td style={{ color: 'var(--danger-600, #b91c1c)' }}>{m.notPlaced}</td>
                      <td>{m.placementPercentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mentors.length === 0 && <p style={{ padding: '1rem', color: 'var(--slate-500)' }}>No mentors with active assignments in this department.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};