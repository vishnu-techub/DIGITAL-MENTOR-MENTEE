import React, { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';

export interface ClassRosterStudent {
  id: string;
  registerNumber: string;
  fullName: string;
  batch: string;
  year: number;
  section: string;
}

interface ClassRosterPanelProps {
  students: ClassRosterStudent[];
  loading: boolean;
}

/**
 * Read-only roster of the students in the selected class (no marks). Search is
 * client-side over the already department-scoped rows returned by the server.
 */
export const ClassRosterPanel: React.FC<ClassRosterPanelProps> = ({ students, loading }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) =>
        s.registerNumber.toLowerCase().includes(q) || s.fullName.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <Users size={18} /> Class Roster
        </h3>
        <div style={{ position: 'relative', width: '240px' }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-slate-400)' }}
          />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2rem', fontSize: '0.825rem' }}
            placeholder="Search by register no. or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-500)' }}>
          Loading students...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title="No students found"
          description={
            students.length === 0
              ? 'No students are enrolled in this class.'
              : 'No students match your search.'
          }
        />
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>#</th>
                <th>Register Number</th>
                <th>Student Name</th>
                <th>Batch</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Year</th>
                <th style={{ textAlign: 'center', width: '90px' }}>Section</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, index) => (
                <tr key={student.id}>
                  <td style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{index + 1}</td>
                  <td style={{ fontWeight: 700 }}>{student.registerNumber}</td>
                  <td>
                    <strong>{student.fullName}</strong>
                  </td>
                  <td>{student.batch}</td>
                  <td style={{ textAlign: 'center' }}>{student.year}</td>
                  <td style={{ textAlign: 'center' }}>{student.section}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ClassRosterPanel;
