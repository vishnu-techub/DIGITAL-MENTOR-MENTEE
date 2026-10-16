import React from 'react';
import { Eye, Upload, Users, BookOpen } from 'lucide-react';

/** A subject available to a class (derived server-side from recorded marks). */
export interface SubjectOption {
  subjectCode: string;
  subjectName: string;
  semesterNumber: number;
  /** Present once the department has a subject catalogue (Admin → Subject Management). */
  id?: string | null;
  maxMarks?: number | null;
  passMarks?: number | null;
  subjectTypeLabel?: string | null;
  regulation?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  source?: 'MASTER' | 'MARKS';
  isActive?: boolean;
}

/** One class section for a given study year. */
export interface ClassInfo {
  year: number;
  section: string;
  studentCount: number;
  academicYear: string;
  subjects: SubjectOption[];
}

interface ClassManagementClassCardProps {
  cls: ClassInfo;
  onViewClass: (cls: ClassInfo) => void;
  onManageMarks: (cls: ClassInfo) => void;
}

/**
 * Presentational card for a single class section shown on the HOD
 * Class Management page. "View Class" opens the roster/analytics view while
 * "Manage Marks" opens the same class in the marks-entry workflow.
 */
export const ClassManagementClassCard: React.FC<ClassManagementClassCardProps> = ({
  cls,
  onViewClass,
  onManageMarks,
}) => {
  return (
    <div
      className="card class-card"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '230px' }}
    >
      <div className="card-header" style={{ flexShrink: 0 }}>
        <h4 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
          Section {cls.section}
          {cls.academicYear ? (
            <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
              {cls.academicYear}
            </span>
          ) : null}
        </h4>
      </div>

      <div
        className="card-body"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
              color: 'var(--color-slate-600)',
            }}
          >
            <Users size={14} />
            <strong>{cls.studentCount}</strong> student{cls.studentCount !== 1 ? 's' : ''}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.8rem',
              color: 'var(--color-slate-500)',
            }}
          >
            <BookOpen size={14} />
            {cls.subjects.length} subject{cls.subjects.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onViewClass(cls)}
            style={{ flex: 1, minWidth: '120px' }}
          >
            <Eye size={14} /> View Class
          </button>
          <button
            type="button"
            className="btn btn-gold btn-sm"
            onClick={() => onManageMarks(cls)}
            style={{ flex: 1, minWidth: '120px' }}
          >
            <Upload size={14} /> Manage Marks
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassManagementClassCard;
