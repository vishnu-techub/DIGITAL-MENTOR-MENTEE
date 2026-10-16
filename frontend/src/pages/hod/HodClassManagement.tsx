import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import {
  ClassManagementYearSection,
} from './ClassManagementYearSection';
import type { ClassInfo, SubjectOption } from './ClassManagementClassCard';
import { ClassAnalyticsPanel, type ClassAnalyticsData } from './ClassAnalyticsPanel';
import { ClassRosterPanel, type ClassRosterStudent } from './ClassRosterPanel';
import {
  MarksEntryTable,
  type MarksData,
  type MarkField,
  type EditedMarks,
  type ValidationErrors,
} from './MarksEntryTable';
import { BulkMarksUploadModal, type BulkUploadContext } from './BulkMarksUploadModal';
import { Download, Upload, FileText, Loader2, ChevronRight, Eye, Save } from 'lucide-react';

type DetailMode = 'view' | 'marks';

export const HodClassManagement: React.FC = () => {
  const toast = useToast();

  // Class list
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  // Selected class / detail view
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>('view');

  // Class overview data
  const [classRoster, setClassRoster] = useState<ClassRosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [classAnalytics, setClassAnalytics] = useState<ClassAnalyticsData | null>(null);

  // Marks workflow
  const [classSubjects, setClassSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<number | ''>('');
  const [marksData, setMarksData] = useState<MarksData | null>(null);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [editedMarks, setEditedMarks] = useState<EditedMarks>({});
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [templateAssessmentType, setTemplateAssessmentType] = useState<'IA1' | 'IA2' | 'END_SEM'>('IA1');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Remembers which class already had a subject auto-applied, so that clearing
  // the subject dropdown does not immediately re-select the first subject.
  const autoSelectKeyRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      // No filters: every year (I–IV) and every section for the department.
      const res = await api.hod.marks.getClasses();
      setClasses(res.data || []);
    } catch (err: any) {
      console.error('Failed to load classes:', err);
      toast.error('Failed to load classes: ' + (err.message || 'Unknown error'));
      setClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  }, [toast]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const loadClassRoster = useCallback(async () => {
    if (!selectedClass) return;
    setLoadingRoster(true);
    try {
      const res = await api.hod.marks.getClassStudents({
        academicYear: selectedClass.academicYear || undefined,
        year: selectedClass.year,
        section: selectedClass.section,
      });
      setClassRoster(res.data || []);
    } catch (err: any) {
      console.error('Failed to load class roster:', err);
      toast.error('Failed to load class roster: ' + (err.message || 'Unknown error'));
      setClassRoster([]);
    } finally {
      setLoadingRoster(false);
    }
  }, [selectedClass, toast]);

  useEffect(() => {
    loadClassRoster();
  }, [loadClassRoster]);

  const loadClassSubjects = useCallback(async () => {
    if (!selectedClass) return;
    try {
      const res = await api.hod.marks.getSubjects({
        academicYear: selectedClass.academicYear,
        year: selectedClass.year,
        section: selectedClass.section,
      });
      setClassSubjects(res.data || []);
      setSelectedSubject('');
      setSelectedSemester('');
      setMarksData(null);
      setEditedMarks({});
      setValidationErrors({});
    } catch (err: any) {
      console.error('Failed to load subjects:', err);
      toast.error('Failed to load subjects: ' + (err.message || 'Unknown error'));
      setClassSubjects([]);
    }
  }, [selectedClass, toast]);

  useEffect(() => {
    loadClassSubjects();
  }, [loadClassSubjects]);

  // When the HOD opens the marks workflow, apply the class immediately by
  // selecting its first available subject (and that subject's semester). This
  // runs once per class so the HOD can still clear the subject afterwards.
  useEffect(() => {
    if (detailMode !== 'marks') return;
    if (classSubjects.length === 0 || !selectedClass) return;
    const key = `${selectedClass.year}|${selectedClass.section}|${selectedClass.academicYear}`;
    if (autoSelectKeyRef.current === key) return;
    autoSelectKeyRef.current = key;
    const first = classSubjects.find((s) => s.isActive !== false) || classSubjects[0];
    setSelectedSubject(first.subjectCode);
    setSelectedSemester(first.semesterNumber);
  }, [detailMode, classSubjects, selectedClass]);

  const loadClassMarks = useCallback(async () => {
    if (!selectedClass || !selectedSubject || selectedSemester === '') return;
    setLoadingMarks(true);
    try {
      const res = await api.hod.marks.getClassSubjectMarks({
        academicYear: selectedClass.academicYear,
        year: selectedClass.year,
        section: selectedClass.section,
        subjectCode: selectedSubject,
        semesterNumber: Number(selectedSemester),
      });
      setMarksData(res.data);
      setEditedMarks({});
      setValidationErrors({});
    } catch (err: any) {
      console.error('Failed to load marks:', err);
      toast.error('Failed to load marks: ' + (err.message || 'Unknown error'));
      setMarksData(null);
    } finally {
      setLoadingMarks(false);
    }
  }, [selectedClass, selectedSubject, selectedSemester, toast]);

  useEffect(() => {
    loadClassMarks();
  }, [loadClassMarks]);

  const loadClassAnalytics = useCallback(async () => {
    if (!selectedClass) return;
    try {
      const res = await api.hod.marks.getReport({
        academicYear: selectedClass.academicYear,
        year: selectedClass.year,
        section: selectedClass.section,
      });
      const marks = res.data?.marks || [];
      const totalStudents = selectedClass.studentCount;
      const expected = totalStudents * selectedClass.subjects.length;

      let ia1Recorded = 0;
      let ia1Sum = 0;
      let ia2Recorded = 0;
      let ia2Sum = 0;
      let endSemRecorded = 0;
      let endSemSum = 0;

      marks.forEach((m) => {
        if (m.ia1 !== null) {
          ia1Recorded += 1;
          ia1Sum += m.ia1;
        }
        if (m.ia2 !== null) {
          ia2Recorded += 1;
          ia2Sum += m.ia2;
        }
        if (m.endSem !== null) {
          endSemRecorded += 1;
          endSemSum += m.endSem;
        }
      });

      const pendingFor = (recorded: number) => Math.max(0, expected - recorded);

      setClassAnalytics({
        totalStudents,
        ia1: {
          recorded: ia1Recorded,
          pending: pendingFor(ia1Recorded),
          average: ia1Recorded > 0 ? ia1Sum / ia1Recorded : null,
        },
        ia2: {
          recorded: ia2Recorded,
          pending: pendingFor(ia2Recorded),
          average: ia2Recorded > 0 ? ia2Sum / ia2Recorded : null,
        },
        endSem: {
          recorded: endSemRecorded,
          pending: pendingFor(endSemRecorded),
          average: endSemRecorded > 0 ? endSemSum / endSemRecorded : null,
        },
      });
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      toast.error('Failed to load analytics: ' + (err.message || 'Unknown error'));
      setClassAnalytics(null);
    }
  }, [selectedClass, toast]);

  useEffect(() => {
    if (selectedClass) {
      loadClassAnalytics();
    } else {
      setClassAnalytics(null);
    }
  }, [selectedClass, loadClassAnalytics]);

  // -------------------------------------------------------------------------
  // Detail view actions
  // -------------------------------------------------------------------------

  const handleViewClass = useCallback((cls: ClassInfo) => {
    setSelectedClass(cls);
    setDetailMode('view');
  }, []);

  const handleManageMarks = useCallback((cls: ClassInfo) => {
    setSelectedClass(cls);
    setDetailMode('marks');
  }, []);

  const handleCloseClassDetails = () => {
    setSelectedClass(null);
    setDetailMode('view');
    autoSelectKeyRef.current = null;
    setClassRoster([]);
    setClassAnalytics(null);
    setClassSubjects([]);
    setSelectedSubject('');
    setSelectedSemester('');
    setMarksData(null);
    setEditedMarks({});
    setValidationErrors({});
  };

  // -------------------------------------------------------------------------
  // Marks editing / saving
  // -------------------------------------------------------------------------

  const handleMarkChange = (studentId: string, field: MarkField, value: string) => {
    const numValue = value === '' ? null : Number(value);
    setEditedMarks((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: numValue },
    }));
    setValidationErrors((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      const studentErrors = { ...next[studentId] };
      delete studentErrors[field];
      if (Object.keys(studentErrors).length === 0) {
        delete next[studentId];
      } else {
        next[studentId] = studentErrors;
      }
      return next;
    });
  };

  const validateMark = (value: number | null, maxMark: number, fieldName: string): string | null => {
    if (value === null || value === undefined) return null;
    if (Number.isNaN(value)) return `${fieldName} must be a number`;
    if (value < 0) return `${fieldName} cannot be negative`;
    if (value > maxMark) return `${fieldName} cannot exceed ${maxMark}`;
    return null;
  };

  const validateAllMarks = (): boolean => {
    if (!marksData) return false;
    const errors: ValidationErrors = {};
    let hasErrors = false;

    for (const student of marksData.students) {
      const edited = editedMarks[student.id];
      if (!edited) continue;

      const studentErrors: Record<string, string> = {};
      const ia1Error = validateMark(edited.ia1 ?? null, marksData.maxMarks.ia1, 'IA1');
      const ia2Error = validateMark(edited.ia2 ?? null, marksData.maxMarks.ia2, 'IA2');
      const endSemError = validateMark(edited.endSem ?? null, marksData.maxMarks.endSem, 'End Sem');

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

  const handleSave = async () => {
    if (!selectedClass || !marksData) return;
    if (!validateAllMarks()) {
      toast.error('Please fix validation errors before saving.');
      return;
    }

    const marksToSave = marksData.students
      .filter((s) => editedMarks[s.id] && Object.keys(editedMarks[s.id]).length > 0)
      .map((s) => ({
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
        academicYear: selectedClass.academicYear,
        year: selectedClass.year,
        section: selectedClass.section,
        subjectCode: marksData.subject?.subjectCode || selectedSubject,
        subjectName: marksData.subject?.subjectName || '',
        semesterNumber: Number(selectedSemester),
        marks: marksToSave,
      });

      if (res.data.errors && res.data.errors.length > 0) {
        toast.error(`Saved ${res.data.saved}, failed ${res.data.failed}. Check errors.`);
      } else {
        toast.success(`Successfully saved marks for ${res.data.saved} student(s).`);
      }
      await loadClassMarks();
    } catch (err: any) {
      console.error('Failed to save marks:', err);
      toast.error('Failed to save marks: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Template / upload / export
  // -------------------------------------------------------------------------

  const selectedSubjectObj = classSubjects.find((s) => s.subjectCode === selectedSubject);
  const semesterOptions = selectedSubjectObj
    ? Array.from({ length: selectedSubjectObj.semesterNumber }, (_, i) => i + 1)
    : [];

  const handleDownloadTemplate = async () => {
    if (!selectedClass || !selectedSubjectObj) {
      toast.error('Please select a subject first.');
      return;
    }
    if (selectedSemester === '') {
      toast.error('Please select a semester first.');
      return;
    }
    try {
      await api.hod.marks.downloadTemplateEnhanced({
        academicYear: selectedClass.academicYear,
        year: selectedClass.year,
        section: selectedClass.section,
        subjectCode: selectedSubjectObj.subjectCode,
        subjectName: selectedSubjectObj.subjectName,
        semesterNumber: Number(selectedSemester),
        assessmentType: templateAssessmentType,
      });
      toast.success(`${templateAssessmentType} template downloaded.`);
    } catch (err: any) {
      toast.error('Failed to download template: ' + (err.message || 'Unknown error'));
    }
  };

  const handleOpenUploadModal = () => {
    if (!selectedClass || !selectedSubjectObj || selectedSemester === '') {
      toast.error('Please select a subject and semester first.');
      return;
    }
    setUploadModalOpen(true);
  };

  const handleExportMarks = async () => {
    if (!selectedClass) return;
    setExporting(true);
    try {
      await api.hod.marks.exportReport({
        academicYear: selectedClass.academicYear,
        year: selectedClass.year,
        section: selectedClass.section,
        subjectCode: selectedSubject || undefined,
        semesterNumber: selectedSemester === '' ? undefined : Number(selectedSemester),
      });
      toast.success('Export downloaded.');
    } catch (err: any) {
      toast.error('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const uploadContext: BulkUploadContext | null =
    selectedClass && selectedSubjectObj && selectedSemester !== ''
      ? {
          academicYear: selectedClass.academicYear,
          year: selectedClass.year,
          section: selectedClass.section,
          subjectCode: selectedSubjectObj.subjectCode,
          subjectName: selectedSubjectObj.subjectName,
          semesterNumber: Number(selectedSemester),
        }
      : null;

  // -------------------------------------------------------------------------
  // Year groupings
  // -------------------------------------------------------------------------

  const YEAR_ORDER = [1, 2, 3, 4];

  const classesForYear = useCallback(
    (year: number) => classes.filter((c) => c.year === year),
    [classes]
  );

  const hasPendingEdits = Object.keys(editedMarks).length > 0;

  // -------------------------------------------------------------------------
  // Render — class detail view
  // -------------------------------------------------------------------------

  const renderDetailView = () => {
    if (!selectedClass) return null;

    return (
      <div className="class-details-view">
        <PageHeader
          eyebrow={`Year ${selectedClass.year} - Section ${selectedClass.section}`}
          title={`Class ${selectedClass.year} ${selectedClass.section}`}
          subtitle={`${selectedClass.academicYear ? `Cohort ${selectedClass.academicYear} • ` : ''}${selectedClass.studentCount} students • ${selectedClass.subjects.length} subjects`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={handleCloseClassDetails}>
                <ChevronRight size={16} /> Back
              </button>
              <button className="btn btn-secondary" onClick={handleExportMarks} disabled={exporting}>
                <FileText size={16} />{' '}
                {exporting ? <Loader2 size={16} className="spin" /> : 'Export Marks'}
              </button>
            </div>
          }
        />

        {classAnalytics ? <ClassAnalyticsPanel analytics={classAnalytics} /> : null}

        {/* Mode switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${detailMode === 'view' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDetailMode('view')}
          >
            <Eye size={16} /> Class Overview
          </button>
          <button
            className={`btn ${detailMode === 'marks' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDetailMode('marks')}
          >
            <FileText size={16} /> Marks Entry
          </button>
        </div>

        {detailMode === 'view' ? (
          <ClassRosterPanel students={classRoster} loading={loadingRoster} />
        ) : (
          <div>
            {/* Subject / semester + actions */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <h3 className="card-title">
                  <FileText size={18} /> Marks Entry
                </h3>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
                  <label className="form-label">
                    Subject <span className="text-danger">*</span>
                  </label>
                  <select
                    className="form-control"
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    disabled={loadingMarks || classSubjects.length === 0}
                    required
                  >
                    <option value="">-- Select Subject --</option>
                    {classSubjects.map((s) => {
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
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
                  <label className="form-label">
                    Semester <span className="text-danger">*</span>
                  </label>
                  <select
                    className="form-control"
                    value={selectedSemester}
                    onChange={(e) =>
                      setSelectedSemester(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    disabled={!selectedSubjectObj}
                    required
                  >
                    <option value="">-- Semester --</option>
                    {semesterOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-600)', marginRight: '0.5rem' }}>
                      Template:
                    </span>
                    <select
                      className="form-control"
                      style={{ width: 'auto', minWidth: '120px', fontSize: '0.75rem' }}
                      onChange={(e) =>
                        setTemplateAssessmentType(e.target.value as 'IA1' | 'IA2' | 'END_SEM')
                      }
                      value={templateAssessmentType}
                    >
                      <option value="IA1">IA1 (Max 50)</option>
                      <option value="IA2">IA2 (Max 50)</option>
                      <option value="END_SEM">End Sem (Max 100)</option>
                    </select>
                  </div>
                  <button className="btn btn-gold" onClick={handleDownloadTemplate} disabled={!selectedSubjectObj}>
                    <Download size={16} /> Download Template
                  </button>
                  <button className="btn btn-secondary" onClick={handleOpenUploadModal} disabled={!uploadContext}>
                    <Upload size={16} /> Upload Marks (Bulk)
                  </button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving || !marksData || !hasPendingEdits}>
                    <Save size={16} /> {saving ? <Loader2 size={16} className="spin" /> : 'Save All Changes'}
                  </button>
                  <button className="btn btn-secondary" onClick={handleExportMarks} disabled={exporting}>
                    <FileText size={16} /> {exporting ? <Loader2 size={16} className="spin" /> : 'Export Marks'}
                  </button>
                </div>
              </div>

              {classSubjects.length === 0 ? (
                <div className="alert alert-info" style={{ marginTop: '1rem' }}>
                  No subjects with recorded marks were found for this class yet. Excel templates and
                  bulk upload become available once a subject has at least one recorded mark.
                </div>
              ) : null}
              {hasPendingEdits && validationErrors && Object.keys(validationErrors).length > 0 ? (
                <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
                  Please fix validation errors before saving.
                </div>
              ) : null}
            </div>

            {loadingMarks ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <Loader2 size={24} className="spin" />
                <p style={{ marginTop: '0.5rem', color: 'var(--color-slate-500)' }}>Loading marks...</p>
              </div>
            ) : marksData && marksData.students.length > 0 ? (
              <MarksEntryTable
                marksData={marksData}
                editedMarks={editedMarks}
                validationErrors={validationErrors}
                onMarkChange={handleMarkChange}
              />
            ) : (
              <EmptyState
                icon={<FileText size={24} />}
                title="No marks data"
                description="Select a subject and semester to view or edit marks, or use the Excel bulk upload."
              />
            )}
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render — class list (year-wise sections)
  // -------------------------------------------------------------------------

  const renderClassList = () => (
    <div>
      <PageHeader
        eyebrow="Academic"
        title="Class Management"
        subtitle="View every class in your department by year, open a roster and manage IA1 / IA2 / End-Sem marks."
      />

      {loadingClasses ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-500)' }}>
          <Loader2 size={28} className="spin" />
          <p style={{ marginTop: '0.5rem' }}>Loading classes...</p>
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No classes found"
          description="No students with an assigned year and section were found in your department."
        />
      ) : (
        YEAR_ORDER.map((year) => (
          <ClassManagementYearSection
            key={year}
            year={year}
            classes={classesForYear(year)}
            onViewClass={handleViewClass}
            onManageMarks={handleManageMarks}
          />
        ))
      )}
    </div>
  );

  return (
    <div>
      {selectedClass ? renderDetailView() : renderClassList()}

      <BulkMarksUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        context={uploadContext}
        onImported={loadClassMarks}
      />
    </div>
  );
};

export default HodClassManagement;
