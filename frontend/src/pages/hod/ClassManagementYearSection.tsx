import React from 'react';
import { ClassManagementClassCard, type ClassInfo } from './ClassManagementClassCard';

const YEAR_LABELS: Record<number, string> = {
  1: 'I Year',
  2: 'II Year',
  3: 'III Year',
  4: 'IV Year',
};

interface ClassManagementYearSectionProps {
  year: number;
  classes: ClassInfo[];
  onViewClass: (cls: ClassInfo) => void;
  onManageMarks: (cls: ClassInfo) => void;
}

/**
 * One academic year block: a heading with the section count and a responsive
 * grid of the sections that belong to that year.
 */
export const ClassManagementYearSection: React.FC<ClassManagementYearSectionProps> = ({
  year,
  classes,
  onViewClass,
  onManageMarks,
}) => {
  const label = YEAR_LABELS[year] || `Year ${year}`;
  const sectionCount = classes.length;

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="card-header">
        <h3 className="card-title" style={{ margin: 0 }}>
          {label}
          <span className="badge badge-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
            {sectionCount} section{sectionCount !== 1 ? 's' : ''}
          </span>
        </h3>
      </div>

      {sectionCount === 0 ? (
        <div className="alert alert-info" style={{ margin: '1rem' }}>
          No sections found for this year.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem',
          }}
        >
          {classes.map((cls) => (
            <ClassManagementClassCard
              key={`${cls.year}-${cls.section}`}
              cls={cls}
              onViewClass={onViewClass}
              onManageMarks={onManageMarks}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default ClassManagementYearSection;
