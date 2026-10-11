import React, { useMemo, useState } from 'react';
import { FileText, Search, CheckCircle, AlertTriangle } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';

export type MarkField = 'ia1' | 'ia2' | 'endSem';

export interface MarksStudentRow {
  id: string;
  registerNumber: string;
  fullName: string;
  batch: string;
  year: number;
  section: string;
  ia1: number | null;
  ia2: number | null;
  endSem: number | null;
  markId: string | null;
}

export interface MarksData {
  students: MarksStudentRow[];
  subject: { subjectCode: string; subjectName: string; semesterNumber: number } | null;
  maxMarks: { ia1: number; ia2: number; endSem: number };
}

export type EditedMarks = Record<string, { ia1?: number | null; ia2?: number | null; endSem?: number | null }>;
export type ValidationErrors = Record<string, Record<string, string>>;

interface MarksEntryTableProps {
  marksData: MarksData;
  editedMarks: EditedMarks;
  validationErrors: ValidationErrors;
  onMarkChange: (studentId: string, field: MarkField, value: string) => void;
}

const cellInput = (extra: React.CSSProperties): React.CSSProperties => ({
  width: '80px',
  margin: '0 auto',
  textAlign: 'center',
  ...extra,
});

/**
 * Editable IA1 / IA2 / End-Sem marks table. Values are held in `editedMarks`
 * until the parent saves them, and a blank draft is sent as `null` — the server
 * treats a null field as "leave the stored mark unchanged", so clearing a cell
 * never silently erases an existing mark.
 */
export const MarksEntryTable: React.FC<MarksEntryTableProps> = ({
  marksData,
  editedMarks,
  validationErrors,
  onMarkChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery) return marksData.students;
    const q = searchQuery.toLowerCase();
    return marksData.students.filter(
      (s) =>
        s.registerNumber.toLowerCase().includes(q) || s.fullName.toLowerCase().includes(q)
    );
  }, [marksData.students, searchQuery]);

  const subjectLabel = marksData.subject
    ? `${marksData.subject.subjectCode} ${marksData.subject.subjectName} (Sem ${marksData.subject.semesterNumber})`
    : 'Marks';

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <FileText size={18} /> Marks Entry — {subjectLabel}
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge badge-info">
            Max: IA1: {marksData.maxMarks.ia1} | IA2: {marksData.maxMarks.ia2} | End Sem:{' '}
            {marksData.maxMarks.endSem}
          </span>
          <div style={{ position: 'relative', width: '220px' }}>
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
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No students found"
          description="No students match the selected criteria or search query."
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
                <th style={{ textAlign: 'center', width: '100px' }}>
                  IA1
                  <br />
                  <small>(Max {marksData.maxMarks.ia1})</small>
                </th>
                <th style={{ textAlign: 'center', width: '100px' }}>
                  IA2
                  <br />
                  <small>(Max {marksData.maxMarks.ia2})</small>
                </th>
                <th style={{ textAlign: 'center', width: '120px' }}>
                  End Sem
                  <br />
                  <small>(Max {marksData.maxMarks.endSem})</small>
                </th>
                <th style={{ width: '110px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, index) => {
                const edited = editedMarks[student.id] || {};
                const errors = validationErrors[student.id] || {};
                const isEdited = Object.keys(edited).length > 0;
                const hasStoredMark =
                  student.ia1 !== null || student.ia2 !== null || student.endSem !== null;

                return (
                  <tr key={student.id} style={{ backgroundColor: isEdited ? '#FEF3C7' : undefined }}>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{index + 1}</td>
                    <td style={{ fontWeight: 700 }}>{student.registerNumber}</td>
                    <td>
                      <strong>{student.fullName}</strong>
                    </td>
                    <td>{student.batch}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={cellInput({ borderColor: errors.ia1 ? '#E11D48' : undefined })}
                        value={edited.ia1 !== undefined ? edited.ia1 ?? '' : student.ia1 ?? ''}
                        onChange={(e) => onMarkChange(student.id, 'ia1', e.target.value)}
                        min={0}
                        max={marksData.maxMarks.ia1}
                        placeholder="—"
                      />
                      {errors.ia1 ? (
                        <div className="text-danger" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>
                          {errors.ia1}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={cellInput({ borderColor: errors.ia2 ? '#E11D48' : undefined })}
                        value={edited.ia2 !== undefined ? edited.ia2 ?? '' : student.ia2 ?? ''}
                        onChange={(e) => onMarkChange(student.id, 'ia2', e.target.value)}
                        min={0}
                        max={marksData.maxMarks.ia2}
                        placeholder="—"
                      />
                      {errors.ia2 ? (
                        <div className="text-danger" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>
                          {errors.ia2}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={cellInput({ width: '90px', borderColor: errors.endSem ? '#E11D48' : undefined })}
                        value={edited.endSem !== undefined ? edited.endSem ?? '' : student.endSem ?? ''}
                        onChange={(e) => onMarkChange(student.id, 'endSem', e.target.value)}
                        min={0}
                        max={marksData.maxMarks.endSem}
                        placeholder="—"
                      />
                      {errors.endSem ? (
                        <div className="text-danger" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>
                          {errors.endSem}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {hasStoredMark ? (
                        <span className="badge badge-success">
                          <CheckCircle size={12} /> Saved
                        </span>
                      ) : (
                        <span className="badge badge-neutral">—</span>
                      )}
                      {isEdited ? (
                        <span className="badge badge-warning" style={{ marginLeft: '0.25rem' }}>
                          <AlertTriangle size={12} /> Edited
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MarksEntryTable;
