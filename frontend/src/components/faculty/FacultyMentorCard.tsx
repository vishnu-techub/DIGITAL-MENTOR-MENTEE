import React from 'react';
import { Eye, Pencil, Mail, Phone, MapPin, IdCard, Users } from 'lucide-react';
import type { HodFacultyRow, HodMentorWiseRow } from '../../api/client';

interface FacultyMentorCardProps {
  faculty: HodFacultyRow;
  /** Rollup for the selected reporting month, keyed by the faculty's stable id. */
  coverage?: HodMentorWiseRow;
  /** True while this card's detail payload is being fetched. */
  busy?: boolean;
  onView: (faculty: HodFacultyRow) => void;
  onEdit: (faculty: HodFacultyRow) => void;
}

/** Two-letter monogram from the faculty member's real name (never invented). */
const initialsOf = (name: string): string => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const FacultyMentorCard: React.FC<FacultyMentorCardProps> = ({
  faculty,
  coverage,
  busy = false,
  onView,
  onEdit,
}) => {
  const menteeCount = coverage?.totalMentees ?? faculty.mentee_count ?? 0;
  const coveragePercent = coverage?.coveragePercent ?? 0;

  // Clicking anywhere on the card opens the detail view. The two action
  // buttons stop propagation so an Edit click never also navigates, and the
  // same guard on keydown keeps Enter/Space on a focused button from bubbling
  // up to the card's own keyboard handler.
  const openDetail = () => onView(faculty);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail();
    }
  };
  const stop = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <article
      className="faculty-card"
      role="button"
      tabIndex={0}
      aria-label={`View mentoring details for ${faculty.full_name}`}
      onClick={openDetail}
      onKeyDown={handleKeyDown}
    >
      <header className="faculty-card-head">
        <div className="faculty-avatar" aria-hidden="true">
          {initialsOf(faculty.full_name)}
        </div>
        <div className="faculty-card-title">
          <h3 className="faculty-card-name">{faculty.full_name}</h3>
          <p className="faculty-card-designation">{faculty.designation || 'Faculty'}</p>
          <span className={`badge ${faculty.is_active ? 'badge-success' : 'badge-danger'}`}>
            {faculty.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </header>

      <ul className="faculty-card-meta">
        <li>
          <IdCard size={15} aria-hidden="true" />
          <span>{faculty.employee_id || '—'}</span>
        </li>
        <li>
          <Mail size={15} aria-hidden="true" />
          <span className="faculty-card-ellipsis" title={faculty.email || undefined}>
            {faculty.email || '—'}
          </span>
        </li>
        <li>
          <MapPin size={15} aria-hidden="true" />
          <span className="faculty-card-ellipsis" title={faculty.cabin_location || faculty.department || undefined}>
            {faculty.cabin_location || faculty.department || '—'}
          </span>
        </li>
        <li>
          <Phone size={15} aria-hidden="true" />
          <span>{faculty.phone_number || 'Not available'}</span>
        </li>
      </ul>

      <div className="faculty-card-stats">
        <div className="faculty-stat">
          <span className="faculty-stat-icon" aria-hidden="true">
            <Users size={16} />
          </span>
          <span className="faculty-stat-value">{menteeCount}</span>
          <span className="faculty-stat-label">
            {menteeCount === 1 ? 'Mentee' : 'Mentees'}
          </span>
        </div>
        <div className="faculty-stat faculty-stat-wide">
          <div className="faculty-coverage-row">
            <span className="faculty-stat-label">Coverage</span>
            <span className="faculty-stat-value">{coveragePercent}%</span>
          </div>
          <div className="progress-track" role="img" aria-label={`Mentee coverage ${coveragePercent}%`}>
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, Math.max(0, coveragePercent))}%`,
                background:
                  coveragePercent >= 80
                    ? 'var(--color-success-600)'
                    : coveragePercent >= 50
                      ? 'var(--color-warning-600)'
                      : '#E11D48',
              }}
            />
          </div>
        </div>
      </div>

      <div className="faculty-card-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={stop(openDetail)}
          onKeyDown={(e) => e.stopPropagation()}
          disabled={busy}
        >
          <Eye size={15} /> View Details
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={stop(() => onEdit(faculty))}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Pencil size={14} /> Edit
        </button>
      </div>
    </article>
  );
};

export default FacultyMentorCard;
