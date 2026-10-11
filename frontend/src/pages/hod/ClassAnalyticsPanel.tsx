import React from 'react';
import { BarChart3 } from 'lucide-react';

export interface AssessmentStat {
  recorded: number;
  pending: number;
  average: number | null;
}

export interface ClassAnalyticsData {
  totalStudents: number;
  ia1: AssessmentStat;
  ia2: AssessmentStat;
  endSem: AssessmentStat;
}

interface ClassAnalyticsPanelProps {
  analytics: ClassAnalyticsData;
}

const StatCard: React.FC<{ label: string; value: string; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
    <div
      style={{
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'var(--color-slate-500)',
        marginBottom: '0.25rem',
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-navy-800, #0f172a)' }}>
      {value}
    </div>
    {sub ? (
      <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', marginTop: '0.15rem' }}>
        {sub}
      </div>
    ) : null}
  </div>
);

const assessmentValue = (stat: AssessmentStat): string =>
  stat.average !== null ? stat.average.toFixed(1) : '—';

const assessmentSub = (stat: AssessmentStat): string =>
  `${stat.recorded}/${stat.recorded + stat.pending} recorded`;

/**
 * Read-only analytics summary for the selected class. Every figure is derived
 * from stored marks (via the marks report) — nothing is estimated client-side.
 */
export const ClassAnalyticsPanel: React.FC<ClassAnalyticsPanelProps> = ({ analytics }) => {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="card-header">
        <h3 className="card-title">
          <BarChart3 size={18} /> Class Analytics
        </h3>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatCard label="Total Students" value={String(analytics.totalStudents)} />
        <StatCard
          label="IA1 Average"
          value={assessmentValue(analytics.ia1)}
          sub={assessmentSub(analytics.ia1)}
        />
        <StatCard
          label="IA2 Average"
          value={assessmentValue(analytics.ia2)}
          sub={assessmentSub(analytics.ia2)}
        />
        <StatCard
          label="End Sem Average"
          value={assessmentValue(analytics.endSem)}
          sub={assessmentSub(analytics.endSem)}
        />
      </div>
    </div>
  );
};

export default ClassAnalyticsPanel;
