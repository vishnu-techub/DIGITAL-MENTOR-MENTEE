import React from 'react';
import { ArrowRight, UserCog } from 'lucide-react';
import type { AdminDepartmentRow } from '../../api/client';
import { formatShortDay, coverageColor } from './PrincipalCharts';

/**
 * Premium department overview card — Principal role ONLY.
 *
 * Every figure is a server-provided field on `AdminDepartmentRow`; the card
 * never recomputes coverage or invents a metric. Clicking the card opens the
 * read-only department drill-down (HODs → mentors → mentees).
 */
export const PrincipalDepartmentCard: React.FC<{
  row: AdminDepartmentRow;
  onOpen: (row: AdminDepartmentRow) => void;
}> = ({ row, onOpen }) => {
  const hasHod = row.hodCount > 0;
  const lastActivity = row.lastMentoringActivity ? formatShortDay(row.lastMentoringActivity) : null;

  return (
    <article className="pd-dept-card">
      <div className="pd-dept-top">
        <div>
          <div className="pd-dept-name">{row.departmentName}</div>
          {row.departmentCode ? <div className="pd-dept-code">{row.departmentCode}</div> : null}
        </div>
        <span className={`pd-badge ${hasHod ? 'pd-badge-green' : 'pd-badge-slate'}`}>
          <UserCog size={12} aria-hidden="true" />
          {hasHod ? row.hodNames[0] || 'HOD assigned' : 'No HOD'}
        </span>
      </div>

      <div className="pd-dept-stats">
        <div className="pd-dept-stat">
          <div className="pd-dept-stat-value">{row.students}</div>
          <div className="pd-dept-stat-label">Students</div>
        </div>
        <div className="pd-dept-stat">
          <div className="pd-dept-stat-value">{row.faculty}</div>
          <div className="pd-dept-stat-label">Faculty</div>
        </div>
        <div className="pd-dept-stat">
          <div className="pd-dept-stat-value">{row.mentors}</div>
          <div className="pd-dept-stat-label">Mentors</div>
        </div>
      </div>

      <div className="pd-dept-coverage">
        <div className="pd-dept-coverage-head">
          <span>Mentoring coverage</span>
          <strong style={{ color: coverageColor(row.mentoringCoverage) }}>{row.mentoringCoverage}%</strong>
        </div>
        <div className="pd-bar-track">
          <div
            className="pd-bar-fill"
            style={{
              width: `${Math.min(100, Math.max(0, row.mentoringCoverage))}%`,
              background: coverageColor(row.mentoringCoverage),
            }}
          />
        </div>
      </div>

      <div className="pd-dept-foot">
        <span className="pd-dept-last">
          {lastActivity ? `Last mentoring activity ${lastActivity}` : 'No mentoring activity yet'}
        </span>
        <button
          type="button"
          className="pd-btn pd-btn-gold pd-btn-sm"
          onClick={() => onOpen(row)}
          aria-label={`View department details for ${row.departmentName}`}
        >
          View <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};

export default PrincipalDepartmentCard;
