import React from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import type { AdminMentoringDashboardData, AdminWeeklyProgress } from '../../api/client';
import { EmptyState } from '../common/EmptyState';

/**
 * ============================================================================
 * Principal dashboard charts — Principal role ONLY
 * ============================================================================
 *
 * The project ships no charting dependency; every visual here is a small,
 * dependency-free inline SVG / CSS bar built from the same server-computed
 * values the shared admin component uses. Nothing is recomputed on the client
 * and nothing is fabricated — a series with no records renders an EmptyState.
 */

const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

/** Coverage colour ramp, matching the shared dashboard thresholds. */
export const coverageColor = (percent: number): string =>
  percent >= 80
    ? 'var(--color-success-600)'
    : percent >= 50
      ? 'var(--color-warning-600)'
      : 'var(--color-danger-600)';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** `YYYY-MM-DD` → `Aug 17`. Presentation only. */
export function formatShortDay(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const month = MONTHS_SHORT[Number(parts[1]) - 1];
  const day = Number(parts[2]);
  if (!month || !Number.isFinite(day)) return iso;
  return `${month} ${day}`;
}

/* --------------------------------------------------------- coverage ring */

export const PrincipalCoverageRing: React.FC<{
  pie: AdminMentoringDashboardData['pie'] | undefined;
}> = ({ pie }) => {
  const total = pie ? Math.max(0, pie.mentored + pie.pending) : 0;

  if (!pie || total === 0) {
    return (
      <EmptyState
        compact
        icon={<PieChartIcon size={30} style={{ color: 'var(--color-slate-300)' }} />}
        title="No student coverage to show yet"
        description="Once students are registered against a department, the mentored-versus-pending split for the reporting month appears here."
      />
    );
  }

  const coverage = Math.round((pie.mentored / total) * 100);
  const pendingPct = Math.round((pie.pending / total) * 100);
  const R = 44;
  const C = 2 * Math.PI * R;
  const fraction = pie.mentored / total;

  return (
    <div className="pd-ring-wrap">
      <svg
        className="pd-ring"
        width="108"
        height="108"
        viewBox="0 0 108 108"
        role="img"
        aria-label={`Coverage ${coverage}% — ${pie.mentored} mentored, ${pie.pending} pending for ${pie.month}`}
      >
        <defs>
          <linearGradient id="pdRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-navy-500)" />
            <stop offset="100%" stopColor="var(--color-gold-400)" />
          </linearGradient>
        </defs>
        <circle className="pd-ring-track" cx="54" cy="54" r={R} />
        {coverage > 0 && (
          <circle
            className="pd-ring-fill"
            cx="54"
            cy="54"
            r={R}
            strokeDasharray={C.toFixed(2)}
            strokeDashoffset={(C * (1 - fraction)).toFixed(2)}
          />
        )}
        <text x="54" y="56" textAnchor="middle" className="pd-ring-pct">
          {coverage}%
        </text>
        <text x="54" y="68" textAnchor="middle" className="pd-ring-label">
          COVERAGE
        </text>
      </svg>

      <div className="pd-ring-stats">
        <div className="pd-ring-stat">
          <span className="pd-ring-stat-dot" style={{ background: 'var(--color-success-500)' }} aria-hidden="true" />
          <span className="pd-ring-stat-label">Mentored this month</span>
          <span className="pd-ring-stat-count">{pie.mentored}</span>
          <span className="pd-ring-stat-pct">{coverage}%</span>
        </div>
        <div className="pd-ring-stat">
          <span className="pd-ring-stat-dot" style={{ background: 'var(--color-warning-500)' }} aria-hidden="true" />
          <span className="pd-ring-stat-label">Pending</span>
          <span className="pd-ring-stat-count">{pie.pending}</span>
          <span className="pd-ring-stat-pct">{pendingPct}%</span>
        </div>
        <p className="pd-ring-foot">
          Reporting month <strong>{pie.month}</strong> · {total} students, each counted once.
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------- ranked bar list */

export interface RankedBarRow {
  key: string;
  label: string;
  value: number;
  suffix?: string;
  /** Explicit fill (defaults to the navy gradient). */
  color?: string;
}

export const PrincipalRankedBars: React.FC<{
  rows: RankedBarRow[];
  max?: number;
  emptyTitle: string;
  emptyDescription: string;
}> = ({ rows, max, emptyTitle, emptyDescription }) => {
  if (!rows.length) {
    return (
      <EmptyState
        compact
        icon={<PieChartIcon size={30} style={{ color: 'var(--color-slate-300)' }} />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const maxValue = Math.max(1, max ?? Math.max(...rows.map((r) => r.value)));

  return (
    <div className="pd-bars">
      {rows.map((row) => (
        <div className="pd-bar-row" key={row.key}>
          <span className="pd-bar-name" title={row.label}>
            {row.label}
          </span>
          <div className="pd-bar-track">
            <div
              className="pd-bar-fill"
              style={{
                width: `${clampPct((row.value / maxValue) * 100)}%`,
                background:
                  row.color ?? 'linear-gradient(90deg, var(--color-navy-500), var(--color-navy-700))',
              }}
            />
          </div>
          <span className="pd-bar-value">
            {row.value}
            {row.suffix ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------ weekly activity */

export const PrincipalWeeklyColumns: React.FC<{ weeks: AdminWeeklyProgress[] }> = ({ weeks }) => {
  if (!weeks || weeks.length === 0) {
    return (
      <EmptyState
        compact
        icon={<PieChartIcon size={30} style={{ color: 'var(--color-slate-300)' }} />}
        title="No weekly activity yet"
        description="Weekly mentoring activity appears once mentoring sessions or Saturday meetings are recorded."
      />
    );
  }

  const maxValue = Math.max(1, ...weeks.map((w) => w.sessions));
  const peak = Math.max(...weeks.map((w) => w.sessions));

  return (
    <div className="pd-weeks-wrap">
      <div
        className="pd-weeks"
        role="img"
        aria-label={`Weekly mentoring sessions for the last ${weeks.length} weeks`}
      >
        {weeks.map((week) => (
          <div
            className={`pd-week${peak > 0 && week.sessions === peak ? ' is-peak' : ''}`}
            key={week.weekStart}
            title={`${week.weekLabel}: ${week.sessions} sessions, ${week.studentsMentored} students mentored`}
          >
            <span className="pd-week-count">{week.sessions}</span>
            <div className="pd-week-bar-area">
              <div
                className="pd-week-col"
                style={{ height: `${Math.round((week.sessions / maxValue) * 100)}%` }}
              />
            </div>
            <span className="pd-week-label">{formatShortDay(week.weekStart)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------------------------------- students / faculty / mentor split */

export interface DistributionRow {
  key: string;
  label: string;
  students: number;
  faculty: number;
  mentors: number;
}

export const PrincipalDistributionBars: React.FC<{ rows: DistributionRow[] }> = ({ rows }) => {
  if (!rows.length) {
    return (
      <EmptyState
        compact
        icon={<PieChartIcon size={30} style={{ color: 'var(--color-slate-300)' }} />}
        title="No departments to compare yet"
        description="Student, faculty and mentor distribution appears once departments are created."
      />
    );
  }

  const maxValue = Math.max(1, ...rows.flatMap((r) => [r.students, r.faculty, r.mentors]));

  return (
    <>
      <div className="pd-legend">
        <span>
          <span className="pd-legend-dot" style={{ background: 'var(--color-navy-600)' }} aria-hidden="true" />
          Students
        </span>
        <span>
          <span className="pd-legend-dot" style={{ background: 'var(--color-gold-500)' }} aria-hidden="true" />
          Faculty
        </span>
        <span>
          <span className="pd-legend-dot" style={{ background: 'var(--color-info-500)' }} aria-hidden="true" />
          Mentors
        </span>
      </div>
      <div className="pd-dist">
        {rows.map((row) => (
          <div className="pd-dist-row" key={row.key}>
            <span className="pd-bar-name" title={row.label}>
              {row.label}
            </span>
            <div className="pd-dist-tracks">
              <div className="pd-dist-track" title={`${row.students} students`}>
                <div
                  className="pd-dist-fill"
                  style={{
                    width: `${(row.students / maxValue) * 100}%`,
                    background: 'linear-gradient(90deg, var(--color-navy-500), var(--color-navy-700))',
                  }}
                />
              </div>
              <div className="pd-dist-track" title={`${row.faculty} faculty`}>
                <div
                  className="pd-dist-fill"
                  style={{
                    width: `${(row.faculty / maxValue) * 100}%`,
                    background: 'linear-gradient(90deg, var(--color-gold-400), var(--color-gold-600))',
                  }}
                />
              </div>
              <div className="pd-dist-track" title={`${row.mentors} mentors`}>
                <div
                  className="pd-dist-fill"
                  style={{
                    width: `${(row.mentors / maxValue) * 100}%`,
                    background: 'linear-gradient(90deg, var(--color-info-500), var(--color-info-600))',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
