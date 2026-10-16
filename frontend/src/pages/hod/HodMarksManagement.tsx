import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  api,
  ApiError,
  type HodStudentRow,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Modal } from '../../components/common/Modal';
import { Download, Search, Save, Upload, FileText, AlertTriangle, CheckCircle, XCircle, Loader2, Eye, X } from 'lucide-react';

interface MarksStudentRow {
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

interface SubjectOption {
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

interface MarksData {
  students: MarksStudentRow[];
  subject: { subjectCode: string; subjectName: string; semesterNumber: number } | null;
  maxMarks: { ia1: number; ia2: number; endSem: number };
}

export const HodMarksManagement: React.FC = () => {
  const toast = useToast();

  // Selection state
  const [academicYear, setAcademicYear] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');
  const [semesterNumber, setSemesterNumber] = useState<number | ''>('');

  // Template assessment type selection
  const [templateAssessmentType, setTemplateAssessmentType] = useState<'IA1' | 'IA2' | 'END_SEM'>('IA1');

  // Data state
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [marksData, setMarksData] = useState<MarksData | null>(null);
  const [editedMarks, setEditedMarks] = useState<Record<string, { ia1?: number | null; ia2?: number | null; endSem?: number | null }>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, Record<string, string>>>({});

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload/Export state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<'file' | 'preview' | 'importing'>('file');
  const [validationPreview, setValidationPreview] = useState<{
    summary: { totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; existingRecords: number; readyForImport: number };
    rows: Array<{ rowNumber: number; registerNumber: string; studentName: string; status: string; reason: string; assessmentType: string; marksObtained: string }>;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Available academic years from batches
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(true);

  // Load academic years on mount
  useEffect(() => {
    const loadAcademicYears = async () => {
      setLoadingAcademicYears(true);
      try {
        const res = await api.hod.departmentOverview();
        const batches = res.data?.batches || [];
        const years = [...new Set(batches.map((b: any) => {
          const match = b.name?.match(/(\d{4}-\d{4})/);
          return match ? match[1] : null;
        }).filter(Boolean))].sort().reverse();
        setAcademicYears(years);
      } catch (err: any) {
        console.error('Failed to load academic years:', err);
        toast.error('Failed to load academic years: ' + (err.message || 'Unknown error'));
      } finally {
        setLoadingAcademicYears(false);
      }
    };
    loadAcademicYears();
  }, []);

  // Load subjects when academic context changes
  const loadSubjects = useCallback(async () => {
    if (!academicYear || year === '' || !section) return;
    setLoadingSubjects(true);
    try {
      const res = await api.hod.marks.getSubjects({ academicYear, year: Number(year), section });
      setSubjects(res.data || []);
      // Reset subject selection when subjects change
      setSubject('');
      setSemesterNumber('');
      setMarksData(null);
    } catch (err: any) {
      console.error('Failed to load subjects:', err);
      toast.error('Failed to load subjects: ' + err.message);
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  }, [academicYear, year, section, toast]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  // Load marks data when subject changes
  const loadMarks = useCallback(async () => {
    if (!academicYear || year === '' || !section || !subject || semesterNumber === '') return;
    setLoading(true);
    try {
      const res = await api.hod.marks.getClassSubjectMarks({ academicYear, year: Number(year), section, subjectCode: subject, semesterNumber: Number(semesterNumber) });
      setMarksData(res.data);
      setEditedMarks({});
      setValidationErrors({});
    } catch (err: any) {
      console.error('Failed to load marks:', err);
      toast.error('Failed to load marks: ' + err.message);
      setMarksData(null);
    } finally {
      setLoading(false);
    }
  }, [academicYear, year, section, subject, semesterNumber, toast]);

  useEffect(() => {
    loadMarks();
  }, [loadMarks]);

  // Handle mark cell edit
  const handleMarkChange = (studentId: string, field: 'ia1' | 'ia2' | 'endSem', value: string | number) => {
    const numValue = value === '' ? null : Number(value);
    setEditedMarks(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: numValue }
    }));
    // Clear validation error for this field
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (newErrors[studentId]) {
        newErrors[studentId] = { ...newErrors[studentId], [field]: '' };
        if (Object.keys(newErrors[studentId]).every(k => !newErrors[studentId][k])) {
          delete newErrors[studentId];
        }
      }
      return newErrors;
    });
  };

  // Validate a single mark value
  const validateMark = (value: number | null, maxMark: number, fieldName: string): string | null => {
    if (value === null || value === undefined) return null;
    if (isNaN(value)) return `${fieldName} must be a number`;
    if (value < 0) return `${fieldName} cannot be negative`;
    if (value > maxMark) return `${fieldName} cannot exceed ${maxMark}`;
    return null;
  };

  // Validate all edited marks
  const validateAllMarks = (): boolean => {
    if (!marksData) return false;
    const errors: Record<string, Record<string, string>> = {};
    let hasErrors = false;

    for (const student of marksData.students) {
      const edited = editedMarks[student.id];
      if (!edited) continue;

      const studentErrors: Record<string, string> = {};
      
      const ia1Error = validateMark(edited.ia1, marksData.maxMarks.ia1, 'IA1');
      const ia2Error = validateMark(edited.ia2, marksData.maxMarks.ia2, 'IA2');
      const endSemError = validateMark(edited.endSem, marksData.maxMarks.endSem, 'End Sem');

      if (ia1Error) studentErrors.ia1 = ia1Error;
      if (ia2Error) studentErrors.ia2 = ia2Error;
      if (endSemError) studentErrors.endSem = endSemError;

      if (Object.keys(studentErrors).length > 0) {
        errors[student.id] = studentErrors;
        hasErrors = true;
      }
    }

    setValidationErrors(errors);
    return !hasErrors;
  };

  // Save all marks
  const handleSave = async () => {
    if (!marksData || !validateAllMarks()) {
      toast.error('Please fix validation errors before saving.');
      return;
    }

    const marksToSave = marksData.students
      .filter(s => editedMarks[s.id] && Object.keys(editedMarks[s.id]).length > 0)
      .map(s => ({
        studentId: s.id,
        registerNumber: s.registerNumber,
        ...editedMarks[s.id],
      }));

    if (marksToSave.length === 0) {
      toast.info('No changes to save.');
      return;
    }

    setSaving(true);
    try {
      const res = await api.hod.marks.saveMarks({
        academicYear,
        year: Number(year),
        section,
        subjectCode: marksData.subject?.subjectCode || '',
        subjectName: marksData.subject?.subjectName || '',
        semesterNumber: Number(semesterNumber),
        marks: marksToSave,
      });

      if (res.data.errors && res.data.errors.length > 0) {
        toast.error(`Saved ${res.data.saved}, failed ${res.data.failed}. Check errors.`);
      } else {
        toast.success(`Successfully saved marks for ${res.data.saved} student(s).`);
      }

      // Reload marks to get updated data
      await loadMarks();
    } catch (err: any) {
      console.error('Failed to save marks:', err);
      toast.error('Failed to save marks: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Download enhanced template with assessment type
  const handleDownloadTemplateEnhanced = async () => {
    const assessmentType = templateAssessmentType;
    const selectedSubject = subjects.find(s => s.subjectCode === subject);
    if (!selectedSubject) {
      toast.error('Subject not found. Please select a subject first.');
      return;
    }
    try {
      await api.hod.marks.downloadTemplateEnhanced({
        academicYear,
        year: Number(year),
        section,
        subjectCode: selectedSubject.subjectCode,
        subjectName: selectedSubject.subjectName,
        semesterNumber: Number(semesterNumber),
        assessmentType,
      });
      toast.success(`${assessmentType} template downloaded.`);
    } catch (err: any) {
      toast.error('Failed to download template: ' + err.message);
    }
  };

  // Download basic template (uses default assessment type)
  const handleDownloadTemplate = async () => {
    const selectedSubject = subjects.find(s => s.subjectCode === subject);
    if (!selectedSubject) {
      toast.error('Subject not found. Please select a subject first.');
      return;
    }
    try {
      await api.hod.marks.downloadTemplateEnhanced({
        academicYear,
        year: Number(year),
        section,
        subjectCode: selectedSubject.subjectCode,
        subjectName: selectedSubject.subjectName,
        semesterNumber: Number(semesterNumber),
        assessmentType: templateAssessmentType,
      });
      toast.success('Template downloaded.');
    } catch (err: any) {
      toast.error('Failed to download template: ' + err.message);
    }
  };

  // Open upload modal
  const handleOpenUploadModal = () => {
    if (!subject || !semesterNumber) {
      toast.error('Please select a subject and semester first.');
      return;
    }
    setUploadFile(null);
    setUploadStage('file');
    setValidationPreview(null);
    setUploadModalOpen(true);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
  };

  // Validate upload
  const handleValidateUpload = async () => {
    if (!uploadFile || !subject || !semesterNumber) {
      toast.error('Please select a subject and semester first.');
      return;
    }
    const selectedSubject = subjects.find(s => s.subjectCode === subject);
    if (!selectedSubject) {
      toast.error('Subject not found. Please select a subject first.');
      return;
    }
    setUploading(true);
    try {
      const result = await api.hod.marks.validateUpload(uploadFile, {
        academicYear,
        year: Number(year),
        section,
        subjectCode: selectedSubject.subjectCode,
        subjectName: selectedSubject.subjectName,
        semesterNumber: Number(semesterNumber),
      });
      setValidationPreview(result.data);
      setUploadStage('preview');
    } catch (err: any) {
      toast.error('Validation failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Import validated rows
  const handleImportUpload = async () => {
    if (!validationPreview) return;
    const selectedSubject = subjects.find(s => s.subjectCode === subject);
    if (!selectedSubject) {
      toast.error('Subject not found. Please select a subject first.');
      return;
    }
    setImporting(true);
    try {
      const validRows = validationPreview.rows.filter(r => r.status === 'VALID');
      const result = await api.hod.marks.importRows(validRows, {
        academicYear,
        year: Number(year),
        section,
        subjectCode: selectedSubject.subjectCode,
        subjectName: selectedSubject.subjectName,
        semesterNumber: Number(semesterNumber),
      });
      
      toast.success(`Import complete: ${result.data.summary.imported} imported, ${result.data.summary.updated} updated, ${result.data.summary.skipped} skipped, ${result.data.summary.failed} failed.`);
      
      setUploadModalOpen(false);
      setValidationPreview(null);
      await loadMarks();
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // Export marks
  const handleExportMarks = async () => {
    if (!academicYear) {
      toast.error('Please select an academic year first.');
      return;
    }
    setExporting(true);
    try {
      await api.hod.marks.exportReport({
        academicYear,
        year: year || undefined,
        section: section || undefined,
        subjectCode: subject || undefined,
        semesterNumber: semesterNumber || undefined,
      });
      toast.success('Export downloaded.');
    } catch (err: any) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Filter students by search query
  const filteredStudents = useMemo(() => {
    if (!marksData?.students) return [];
    if (!searchQuery) return marksData.students;
    const q = searchQuery.toLowerCase();
    return marksData.students.filter(s => 
      s.registerNumber.toLowerCase().includes(q) || 
      s.fullName.toLowerCase().includes(q)
    );
  }, [marksData, searchQuery]);

  // Check if a student has edited marks
  const hasEdits = (studentId: string) => {
    const edited = editedMarks[studentId];
    return edited && Object.keys(edited).length > 0;
  };

  // Check if a field has validation error
  const hasFieldError = (studentId: string, field: string) => {
    return !!validationErrors[studentId]?.[field];
  };

  const getFieldError = (studentId: string, field: string) => {
    return validationErrors[studentId]?.[field] || '';
  };

  const selectedSubject = subjects.find(s => s.subjectCode === subject);

  return (
    <div>
      <PageHeader
        eyebrow="Academic"
        title="Marks Management"
        subtitle="Enter and manage IA1, IA2, and End-Semester marks for your department's students."
      />

      {/* Selection Form */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">Select Class & Subject</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
            <label className="form-label">Academic Year <span className="text-danger">*</span></label>
            <select className="form-control" value={academicYear} onChange={e => setAcademicYear(e.target.value)} required disabled={loadingAcademicYears}>
              <option value="">-- Select Academic Year --</option>
              {loadingAcademicYears ? <option value="" disabled>Loading...</option> : academicYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {loadingAcademicYears && <small className="form-text text-muted">Loading academic years...</small>}
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
            <label className="form-label">Year <span className="text-danger">*</span></label>
            <select className="form-control" value={year} onChange={e => setYear(e.target.value === '' ? '' : Number(e.target.value))} required>
              <option value="">-- Year --</option>
              <option value={1}>I Year</option>
              <option value={2}>II Year</option>
              <option value={3}>III Year</option>
              <option value={4}>IV Year</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
            <label className="form-label">Section <span className="text-danger">*</span></label>
            <select className="form-control" value={section} onChange={e => setSection(e.target.value.toUpperCase())} required>
              <option value="">-- Section --</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
            <label className="form-label">Subject <span className="text-danger">*</span></label>
            <select className="form-control" value={subject} onChange={e => setSubject(e.target.value)} disabled={loadingSubjects || subjects.length === 0} required>
              <option value="">-- Select Subject --</option>
              {subjects.map(s => {
                const inactive = s.isActive === false;
                return (
                  <option
                    key={`${s.subjectCode}|${s.semesterNumber}`}
                    value={s.subjectCode}
                    disabled={inactive}
                  >
                    {s.subjectCode} - {s.subjectName} (Sem {s.semesterNumber})
                    {inactive ? ' — not available for new uploads' : ''}
                  </option>
                );
              })}
            </select>
            {selectedSubject && selectedSubject.isActive !== false && selectedSubject.maxMarks != null && (
              <small className="form-hint">
                Max marks: {selectedSubject.maxMarks} · Pass: {selectedSubject.passMarks ?? '—'}
                {selectedSubject.subjectTypeLabel ? ` · ${selectedSubject.subjectTypeLabel}` : ''}
              </small>
            )}
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
            <label className="form-label">Semester <span className="text-danger">*</span></label>
            <select className="form-control" value={semesterNumber} onChange={e => setSemesterNumber(e.target.value === '' ? '' : Number(e.target.value))} disabled={!selectedSubject} required>
              <option value="">-- Semester --</option>
              {selectedSubject ? Array.from({ length: selectedSubject.semesterNumber }, (_, i) => i + 1).map(s => (
                <option key={s} value={s}>{s}</option>
              )) : null}
            </select>
          </div>

          {(subject && semesterNumber) && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-600)', alignSelf: 'center', marginRight: '0.5rem' }}>Template:</span>
                <select className="form-control" style={{ width: 'auto', minWidth: '100px', fontSize: '0.75rem' }} 
                  onChange={e => setTemplateAssessmentType(e.target.value as 'IA1' | 'IA2' | 'END_SEM')}
                  value={templateAssessmentType}>
                  <option value="IA1">IA1 (Max 50)</option>
                  <option value="IA2">IA2 (Max 50)</option>
                  <option value="END_SEM">End Sem (Max 100)</option>
                </select>
              </div>
              <button className="btn btn-gold" onClick={handleDownloadTemplateEnhanced} disabled={loading}>
                <Download size={16} /> Download Template
              </button>
              <button className="btn btn-secondary" onClick={handleOpenUploadModal} disabled={loading}>
                <Upload size={16} /> Upload Marks (Bulk)
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || Object.keys(editedMarks).length === 0 || !marksData}>
                <Save size={16} /> {saving ? <Loader2 size={16} className="spin" /> : 'Save All Changes'}
              </button>
              <button className="btn btn-secondary" onClick={handleExportMarks} disabled={exporting || !academicYear}>
                <FileText size={16} /> {exporting ? <Loader2 size={16} className="spin" /> : 'Export Marks'}
              </button>
            </div>
          )}
        </div>

        {validationErrors && Object.keys(validationErrors).length > 0 && (
          <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
            <AlertTriangle size={16} /> Please fix validation errors before saving.
          </div>
        )}
      </div>

      {/* Marks Table */}
      {marksData && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FileText size={18} /> Marks Entry — {marksData.subject?.subjectCode} {marksData.subject?.subjectName} (Sem {marksData.subject?.semesterNumber})
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-info">Max: IA1: {marksData.maxMarks.ia1} | IA2: {marksData.maxMarks.ia2} | End Sem: {marksData.maxMarks.endSem}</span>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-slate-400)' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '2rem', fontSize: '0.825rem' }}
                  placeholder="Search by register no. or name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {filteredStudents.length === 0 ? (
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
                    <th style={{ textAlign: 'center', width: '100px' }}>IA1<br/><small>(Max {marksData.maxMarks.ia1})</small></th>
                    <th style={{ textAlign: 'center', width: '100px' }}>IA2<br/><small>(Max {marksData.maxMarks.ia2})</small></th>
                    <th style={{ textAlign: 'center', width: '120px' }}>End Sem<br/><small>(Max {marksData.maxMarks.endSem})</small></th>
                    <th style={{ width: '100px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, index) => {
                    const edited = editedMarks[student.id] || {};
                    const errors = validationErrors[student.id] || {};
                    const isEdited = hasEdits(student.id);

                    return (
                      <tr key={student.id} style={{ backgroundColor: isEdited ? '#FEF3C7' : undefined }}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{index + 1}</td>
                        <td style={{ fontWeight: 700 }}>{student.registerNumber}</td>
                        <td><strong>{student.fullName}</strong></td>
                        <td>{student.batch}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="form-control"
                            style={{ width: '80px', margin: '0 auto', textAlign: 'center', borderColor: errors.ia1 ? '#E11D48' : undefined }}
                            value={edited.ia1 !== undefined ? edited.ia1 : (student.ia1 ?? '')}
                            onChange={e => handleMarkChange(student.id, 'ia1', e.target.value)}
                            min={0}
                            max={marksData.maxMarks.ia1}
                            placeholder="—"
                          />
                          {errors.ia1 && <div className="text-danger" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>{errors.ia1}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="form-control"
                            style={{ width: '80px', margin: '0 auto', textAlign: 'center', borderColor: errors.ia2 ? '#E11D48' : undefined }}
                            value={edited.ia2 !== undefined ? edited.ia2 : (student.ia2 ?? '')}
                            onChange={e => handleMarkChange(student.id, 'ia2', e.target.value)}
                            min={0}
                            max={marksData.maxMarks.ia2}
                            placeholder="—"
                          />
                          {errors.ia2 && <div className="text-danger" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>{errors.ia2}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="form-control"
                            style={{ width: '90px', margin: '0 auto', textAlign: 'center', borderColor: errors.endSem ? '#E11D48' : undefined }}
                            value={edited.endSem !== undefined ? edited.endSem : (student.endSem ?? '')}
                            onChange={e => handleMarkChange(student.id, 'endSem', e.target.value)}
                            min={0}
                            max={marksData.maxMarks.endSem}
                            placeholder="—"
                          />
                          {errors.endSem && <div className="text-danger" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>{errors.endSem}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {student.ia1 !== null || student.ia2 !== null || student.endSem !== null ? (
                            <span className="badge badge-success"><CheckCircle size={12} /> Saved</span>
                          ) : (
                            <span className="badge badge-neutral">—</span>
                          )}
                          {isEdited && <span className="badge badge-warning" style={{ marginLeft: '0.25rem' }}><AlertTriangle size={12} /> Edited</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Marks Report Section */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">
            <FileText size={18} /> Marks Report
          </h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
            <label className="form-label">Academic Year <span className="text-danger">*</span></label>
            <select className="form-control" value={academicYear} onChange={e => setAcademicYear(e.target.value)} required disabled={loadingAcademicYears}>
              <option value="">-- Select Academic Year --</option>
              {loadingAcademicYears ? <option value="" disabled>Loading...</option> : academicYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
            <label className="form-label">Year</label>
            <select className="form-control" value={year} onChange={e => setYear(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">All</option>
              <option value={1}>I</option>
              <option value={2}>II</option>
              <option value={3}>III</option>
              <option value={4}>IV</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
            <label className="form-label">Section</label>
            <select className="form-control" value={section} onChange={e => setSection(e.target.value.toUpperCase())}>
              <option value="">All</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
            <label className="form-label">Subject</label>
            <select className="form-control" value={subject} onChange={e => setSubject(e.target.value)} disabled={loadingSubjects || subjects.length === 0}>
              <option value="">All</option>
              {subjects.map(s => (
                <option key={`${s.subjectCode}|${s.semesterNumber}`} value={s.subjectCode}>
                  {s.subjectCode} - {s.subjectName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={async () => {
            try {
              const res = await api.hod.marks.getReport({
                academicYear,
                year: year || undefined,
                section: section || undefined,
                subjectCode: subject || undefined,
                semesterNumber: semesterNumber || undefined,
              });
              // Could open in modal or new view
              toast.success(`Found ${res.data.total} mark records.`);
            } catch (err: any) {
              toast.error('Failed to load report: ' + err.message);
            }
          }}>
            <FileText size={16} /> View Report
          </button>
          <button className="btn btn-secondary" onClick={handleExportMarks} disabled={exporting || !academicYear}>
            <FileText size={16} /> {exporting ? <Loader2 size={16} className="spin" /> : 'Export Marks'}
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setUploadFile(null);
          setUploadStage('file');
          setValidationPreview(null);
        }}
        title="Upload Marks from Excel"
        maxWidth="900px"
      >
        {uploadStage === 'file' && (
          <div style={{ padding: '1rem 0' }}>
            <p style={{ marginBottom: '1rem', color: 'var(--color-slate-600)' }}>
              Upload an Excel file (.xlsx) with marks for the selected class and subject.
              The template should contain Register Number and Marks Obtained columns.
            </p>
            <div className="form-group">
              <label className="form-label">Excel File (.xlsx)</label>
              <input
                type="file"
                className="form-control"
                accept=".xlsx"
                onChange={handleFileSelect}
                required
              />
              <small className="form-text">Max file size: 10 MB. Only .xlsx files accepted.</small>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setUploadModalOpen(false)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={handleValidateUpload} 
                disabled={uploading || !uploadFile}
              >
                {uploading ? <Loader2 size={16} className="spin" /> : 'Validate & Preview'}
              </button>
            </div>
          </div>
        )}

        {uploadStage === 'preview' && validationPreview && (
          <div style={{ padding: '1rem 0', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h4 style={{ margin: 0 }}>Validation Preview</h4>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-slate-600)' }}>
                  {validationPreview.summary.totalRows} rows &bull; 
                  <span className="badge badge-success">{validationPreview.summary.validRows} Valid</span>
                  <span className="badge badge-danger">{validationPreview.summary.invalidRows} Invalid</span>
                  <span className="badge badge-warning">{validationPreview.summary.duplicateRows} Duplicate</span>
                  <span className="badge badge-info">{validationPreview.summary.existingRecords} Existing</span>
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setUploadStage('file')}>
                  <X size={14} /> Back
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleImportUpload} 
                  disabled={importing || validationPreview.summary.validRows === 0}
                >
                  {importing ? <Loader2 size={16} className="spin" /> : 'Import Valid Rows'}
                </button>
              </div>
            </div>
            
            <div className="table-responsive" style={{ maxHeight: '50vh' }}>
              <table className="table" style={{ fontSize: '0.75rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>Row</th>
                    <th>Register No.</th>
                    <th>Student Name</th>
                    <th>Assessment</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Marks</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {validationPreview.rows.map((row) => (
                    <tr key={row.rowNumber} style={{ 
                      backgroundColor: row.status === 'VALID' ? '#ECFDF5' : 
                                     row.status === 'INVALID' ? '#FEF2F2' :
                                     row.status === 'DUPLICATE' ? '#FFF7ED' :
                                     row.status === 'ALREADY_EXISTS' ? '#EFF6FF' : undefined
                    }}>
                      <td style={{ fontSize: '0.7rem', color: 'var(--color-slate-500)' }}>{row.rowNumber}</td>
                      <td style={{ fontWeight: 700 }}>{row.registerNumber}</td>
                      <td>{row.studentName}</td>
                      <td>{row.assessmentType}</td>
                      <td style={{ textAlign: 'center' }}>{row.marksObtained || '—'}</td>
                      <td>
                        <span className={`badge ${
                          row.status === 'VALID' ? 'badge-success' :
                          row.status === 'INVALID' ? 'badge-danger' :
                          row.status === 'DUPLICATE' ? 'badge-warning' :
                          'badge-info'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {validationPreview.summary.invalidRows > 0 && (
              <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
                <AlertTriangle size={16} /> 
                <strong>Invalid rows will be skipped.</strong> Please correct the Excel file and re-upload, or go back to select a different file.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};