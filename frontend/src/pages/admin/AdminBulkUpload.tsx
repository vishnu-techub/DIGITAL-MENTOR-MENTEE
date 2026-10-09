import React, { useMemo, useRef, useState } from 'react';
import {
  api,
  type BulkPreviewRow,
  type BulkValidationResponse,
  type BulkImportResultRow,
  type BulkImportResponse,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/common/Modal';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Check,
  Info,
  ShieldCheck,
  Eye,
  PlayCircle,
} from 'lucide-react';

type UploadTarget = 'STUDENTS' | 'FACULTY';
type StepKey = 'UPLOAD' | 'PREVIEW' | 'VALIDATE' | 'IMPORT';
type StatusFilter = 'ALL' | 'VALID' | 'INVALID' | 'DUPLICATE' | 'ALREADY_EXISTS';

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'UPLOAD', label: 'Upload' },
  { key: 'PREVIEW', label: 'Preview' },
  { key: 'VALIDATE', label: 'Validate' },
  { key: 'IMPORT', label: 'Import' },
];

const STATUS_BADGE: Record<string, string> = {
  VALID: 'badge-success',
  INVALID: 'badge-danger',
  DUPLICATE: 'badge-warning',
  ALREADY_EXISTS: 'badge-info',
};

const STATUS_LABEL: Record<string, string> = {
  VALID: 'Valid',
  INVALID: 'Invalid',
  DUPLICATE: 'Duplicate',
  ALREADY_EXISTS: 'Already Exists',
};

const RESULT_BADGE: Record<BulkImportResultRow['status'], string> = {
  Imported: 'badge-success',
  Skipped: 'badge-warning',
  Failed: 'badge-danger',
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const AdminBulkUpload: React.FC = () => {
  const toast = useToast();

  const [activeTarget, setActiveTarget] = useState<UploadTarget>('STUDENTS');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const [previewData, setPreviewData] = useState<BulkValidationResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResponse | null>(null);

  const resetFlow = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
    setSearchQuery('');
    setStatusFilter('ALL');
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTargetSwitch = (target: UploadTarget) => {
    if (target === activeTarget) return;
    setActiveTarget(target);
    resetFlow();
  };

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      if (activeTarget === 'STUDENTS') {
        await api.bulkUpload.downloadStudentTemplate();
        toast.success('Student Excel template downloaded.');
      } else {
        await api.bulkUpload.downloadFacultyTemplate();
        toast.success('Faculty Excel template downloaded.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to download template.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Only .xlsx files are supported. CSV and other formats are not accepted.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('File size exceeds the 10 MB limit.');
      return;
    }
    setSelectedFile(file);
    setPreviewData(null);
    setImportResult(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleDropzoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleClearFile = () => {
    resetFlow();
  };

  const handleValidateFile = async () => {
    if (!selectedFile) {
      toast.error('Please select an .xlsx file first.');
      return;
    }
    setIsValidating(true);
    try {
      const response =
        activeTarget === 'STUDENTS'
          ? await api.bulkUpload.validateStudents(selectedFile)
          : await api.bulkUpload.validateFaculty(selectedFile);

      if (response.success && response.data) {
        setPreviewData(response.data);
        setImportResult(null);
        setStatusFilter('ALL');
        setSearchQuery('');
        const s = response.data.summary;
        toast.success(
          `Validated ${s.totalRows} row${s.totalRows === 1 ? '' : 's'} — ${s.validRows} ready to import.`
        );
      } else {
        toast.error(response.message || 'Validation failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Validation failed. Please check the Excel file format.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || previewData.rows.length === 0) return;
    setShowConfirmModal(false);
    setIsImporting(true);
    try {
      const response =
        activeTarget === 'STUDENTS'
          ? await api.bulkUpload.importStudents(previewData.rows)
          : await api.bulkUpload.importFaculty(previewData.rows);

      if (response.success && response.data) {
        setImportResult(response.data);
        toast.success(`Bulk import completed: ${response.data.summary.imported} records imported.`);
      } else {
        toast.error(response.message || 'Import failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute import.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadErrorReport = async () => {
    if (!importResult || importResult.results.length === 0) return;
    setIsDownloadingReport(true);
    try {
      await api.bulkUpload.downloadErrorReport(importResult.results, activeTarget);
      toast.success('Error report downloaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download error report.');
    } finally {
      setIsDownloadingReport(false);
    }
  };

  /* ---- Derived view state ---------------------------------------------- */

  const summary = previewData?.summary;
  const hasResult = importResult !== null;

  const activeStepIndex = hasResult
    ? 3
    : previewData
    ? 2
    : selectedFile
    ? 1
    : 0;

  const counts = useMemo(
    () => ({
      ALL: previewData?.rows.length ?? 0,
      VALID: summary?.validRows ?? 0,
      INVALID: summary?.invalidRows ?? 0,
      DUPLICATE: summary?.duplicateRows ?? 0,
      ALREADY_EXISTS: summary?.existingRecords ?? 0,
    }),
    [previewData, summary]
  );

  const filteredRows = useMemo(() => {
    const rows = previewData?.rows ?? [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (!q) return true;
      const raw = row.rawData || {};
      return (
        row.name.toLowerCase().includes(q) ||
        row.identifier.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q) ||
        String(raw.emailAddress || raw.email || '').toLowerCase().includes(q) ||
        String(raw.studentName || raw.fullName || '').toLowerCase().includes(q)
      );
    });
  }, [previewData, searchQuery, statusFilter]);

  const resultIssues = importResult
    ? importResult.results.filter((r) => r.status !== 'Imported')
    : [];

  const targetLabel = activeTarget === 'STUDENTS' ? 'Students' : 'Faculty / Mentors';

  /* ---- Render ----------------------------------------------------------- */

  return (
    <div>
      {/* Page header */}
      <header className="bu-page-header">
        <div>
          <h1 className="bu-page-title">
            <span className="bu-page-title-icon" aria-hidden="true">
              <Upload size={22} />
            </span>
            Bulk Import Management
          </h1>
          <p className="bu-page-sub">
            Import {targetLabel} in bulk from Microsoft Excel (<strong>.xlsx</strong>). Every row is
            validated and previewed before anything is written — existing records are never
            overwritten automatically.
          </p>
        </div>
        <span className="bu-admin-chip">
          <ShieldCheck size={14} aria-hidden="true" /> Admin only
        </span>
      </header>

      {/* Target selector cards */}
      <div className="bu-selector-grid" role="radiogroup" aria-label="Choose what to import">
        <button
          type="button"
          role="radio"
          aria-checked={activeTarget === 'STUDENTS'}
          aria-pressed={activeTarget === 'STUDENTS'}
          className="bu-selector-card"
          onClick={() => handleTargetSwitch('STUDENTS')}
        >
          <span className="bu-selector-emoji" aria-hidden="true">
            🎓
          </span>
          <span className="bu-selector-body">
            <span className="bu-selector-title">
              Students
              {activeTarget === 'STUDENTS' && (
                <span className="bu-selector-active-tag">Selected</span>
              )}
            </span>
            <span className="bu-selector-desc">
              25-column student sheet: basic info, family details and schooling/admission
              particulars. Creates student profiles, login accounts and 8-semester record books.
            </span>
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={activeTarget === 'FACULTY'}
          aria-pressed={activeTarget === 'FACULTY'}
          className="bu-selector-card"
          onClick={() => handleTargetSwitch('FACULTY')}
        >
          <span className="bu-selector-emoji" aria-hidden="true">
            👨‍🏫
          </span>
          <span className="bu-selector-body">
            <span className="bu-selector-title">
              Faculty / Mentors
              {activeTarget === 'FACULTY' && (
                <span className="bu-selector-active-tag">Selected</span>
              )}
            </span>
            <span className="bu-selector-desc">
              Faculty sheet with the fields the Faculty/User models actually store (name, employee
              ID, department, designation, mobile, e-mail, cabin, username). Creates mentor
              profiles and login accounts.
            </span>
          </span>
        </button>
      </div>

      {/* Template download card */}
      <section className="bu-template-card" aria-label="Template download">
        <div className="bu-template-info">
          <span className="bu-template-icon" aria-hidden="true">
            <FileSpreadsheet size={24} />
          </span>
          <div>
            <h2 className="bu-template-title">
              {activeTarget === 'STUDENTS' ? 'Student' : 'Faculty'} Excel Template
            </h2>
            <p className="bu-template-desc">
              Three sheets — <strong>Instructions</strong>,{' '}
              <strong>{activeTarget === 'STUDENTS' ? 'Students' : 'Faculty'}</strong> and{' '}
              <strong>Reference Values</strong> — with live department/batch lists, drop-downs for
              controlled fields and one clearly marked sample row that can never be imported.
            </p>
            <div className="bu-template-meta">
              <span className="badge badge-primary">.xlsx</span>
              <span className="badge badge-neutral">Drop-downs included</span>
              <span className="badge badge-neutral">Max 10 MB</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleDownloadTemplate}
          disabled={isDownloadingTemplate}
        >
          {isDownloadingTemplate ? (
            <RefreshCw className="animate-spin" size={16} aria-hidden="true" />
          ) : (
            <Download size={16} aria-hidden="true" />
          )}
          Download {activeTarget === 'STUDENTS' ? 'Student' : 'Faculty'} Template (.xlsx)
        </button>
      </section>

      {/* Workflow stepper */}
      <nav className="bu-steps" aria-label="Bulk import progress">
        {STEPS.map((step, i) => {
          const state = i < activeStepIndex ? 'done' : i === activeStepIndex ? 'active' : '';
          return (
            <React.Fragment key={step.key}>
              {i > 0 && (
                <span
                  className={`bu-step-divider ${i <= activeStepIndex ? 'done' : ''}`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`bu-step ${state}`}
                aria-current={i === activeStepIndex ? 'step' : undefined}
              >
                <span className="bu-step-circle" aria-hidden="true">
                  {state === 'done' ? <Check size={14} /> : i + 1}
                </span>
                <span className="bu-step-label">{step.label}</span>
              </span>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="card">
        {/* ---------- Step 1: Upload ---------- */}
        {!previewData && !hasResult && (
          <div>
            <div className="section-heading">
              <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={20} aria-hidden="true" /> Upload your Excel file
              </h2>
              <p className="section-description">
                Drag the completed template here, or browse to it from your computer.
              </p>
            </div>

            <div
              className={`bu-dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={
                selectedFile
                  ? `Selected file ${selectedFile.name}. Press Enter to choose a different file.`
                  : 'Upload an Excel file. Press Enter or Space to browse.'
              }
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={handleDropzoneKeyDown}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) validateAndSetFile(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                tabIndex={-1}
                aria-hidden="true"
              />

              <span className="bu-dropzone-icon" aria-hidden="true">
                {selectedFile ? <CheckCircle2 size={30} /> : <Upload size={30} />}
              </span>

              {selectedFile ? (
                <>
                  <p className="bu-dropzone-title">{selectedFile.name}</p>
                  <p className="bu-dropzone-hint">
                    Ready to validate. Click to choose a different file.
                  </p>
                  <p className="bu-file-meta">
                    <span className="badge badge-success">
                      <Check size={12} aria-hidden="true" /> Selected
                    </span>
                    <span className="bu-file-size">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="bu-dropzone-title">
                    Drag &amp; drop your file, or{' '}
                    <span className="bu-dropzone-browse">browse</span>
                  </p>
                  <p className="bu-dropzone-hint">
                    Only <strong>.xlsx</strong> files up to 10 MB are accepted. CSV is not
                    supported.
                  </p>
                </>
              )}
            </div>

            <div className="bu-action-row">
              {selectedFile && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={handleClearFile}>
                    Clear file
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleValidateFile}
                    disabled={isValidating}
                  >
                    {isValidating ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
                        Validating rows…
                      </>
                    ) : (
                      <>
                        <Eye size={16} aria-hidden="true" />
                        Validate &amp; Preview
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---------- Steps 2 & 3: Preview + Validate ---------- */}
        {previewData && !hasResult && (
          <div>
            <div className="section-heading">
              <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Eye size={20} aria-hidden="true" /> Preview &amp; validation results
              </h2>
              <p className="section-description">
                Only rows marked <strong>Valid</strong> will be created. Duplicate and already
                existing rows are skipped automatically — nothing in the system is overwritten.
              </p>
            </div>

            {/* Summary cards */}
            <div className="bu-stat-grid">
              <div className="bu-stat total">
                <p className="bu-stat-label">
                  <FileSpreadsheet size={13} aria-hidden="true" /> Total rows
                </p>
                <p className="bu-stat-value">{previewData.summary.totalRows}</p>
              </div>
              <div className="bu-stat valid">
                <p className="bu-stat-label">
                  <CheckCircle2 size={13} aria-hidden="true" /> Valid
                </p>
                <p className="bu-stat-value">{previewData.summary.validRows}</p>
              </div>
              <div className="bu-stat invalid">
                <p className="bu-stat-label">
                  <XCircle size={13} aria-hidden="true" /> Invalid
                </p>
                <p className="bu-stat-value">{previewData.summary.invalidRows}</p>
              </div>
              <div className="bu-stat duplicate">
                <p className="bu-stat-label">
                  <AlertTriangle size={13} aria-hidden="true" /> Duplicates
                </p>
                <p className="bu-stat-value">{previewData.summary.duplicateRows}</p>
              </div>
              <div className="bu-stat existing">
                <p className="bu-stat-label">
                  <Info size={13} aria-hidden="true" /> Already exists
                </p>
                <p className="bu-stat-value">{previewData.summary.existingRecords}</p>
              </div>
              <div className="bu-stat ready">
                <p className="bu-stat-label">
                  <PlayCircle size={13} aria-hidden="true" /> Ready to import
                </p>
                <p className="bu-stat-value">{previewData.summary.readyForImport}</p>
              </div>
            </div>

            <div className="notice notice-info" role="note" style={{ marginBottom: '1.25rem' }}>
              <Info size={16} aria-hidden="true" />
              <div>
                <strong>Review before importing.</strong> Sample rows from the template, rows with
                invalid values, duplicates inside the file and records that already exist are all
                reported below and are never written to the database.
              </div>
            </div>

            {/* Search + status filter */}
            <div className="bu-filter-bar">
              <div className="bu-chip-row" role="group" aria-label="Filter rows by status">
                {(
                  [
                    ['ALL', 'All'],
                    ['VALID', 'Valid'],
                    ['INVALID', 'Invalid'],
                    ['DUPLICATE', 'Duplicate'],
                    ['ALREADY_EXISTS', 'Already Exists'],
                  ] as Array<[StatusFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`bu-chip ${statusFilter === key ? 'active' : ''}`}
                    aria-pressed={statusFilter === key}
                    onClick={() => setStatusFilter(key)}
                  >
                    {label}
                    <span className="bu-chip-count">{counts[key]}</span>
                  </button>
                ))}
              </div>

              <div className="bu-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, ID, department, e-mail…"
                  aria-label="Search preview rows"
                />
              </div>
            </div>

            {/* Preview table */}
            <div className="bu-table-wrap" tabIndex={0} aria-label="Preview of uploaded rows">
              <table className="bu-table">
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">
                      {activeTarget === 'STUDENTS' ? 'Register No.' : 'Employee ID'}
                    </th>
                    <th scope="col">Name</th>
                    <th scope="col">Department</th>
                    <th scope="col">Details</th>
                    <th scope="col">Status</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="bu-empty">
                        No rows match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.identifier}`}
                        className={
                          row.status === 'VALID'
                            ? 'row-valid'
                            : row.status === 'INVALID'
                            ? 'row-invalid'
                            : row.status === 'DUPLICATE'
                            ? 'row-duplicate'
                            : 'row-existing'
                        }
                      >
                        <td>{row.rowNumber}</td>
                        <td className="bu-cell-strong">{row.identifier || '—'}</td>
                        <td>{row.name || '—'}</td>
                        <td>{row.department || '—'}</td>
                        <td>
                          <PreviewDetails row={row} target={activeTarget} />
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[row.status]}`}>
                            {STATUS_LABEL[row.status]}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`bu-reason ${
                              row.status === 'VALID'
                                ? 'ok'
                                : row.status === 'INVALID'
                                ? 'bad'
                                : row.status === 'DUPLICATE'
                                ? 'warn'
                                : 'info'
                            }`}
                          >
                            {row.reason}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bu-action-row split">
              <button type="button" className="btn btn-secondary" onClick={handleClearFile}>
                Upload another file
              </button>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {previewData.summary.readyForImport === 0 && (
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--danger-600)', fontWeight: 600 }}>
                    No valid rows to import yet — fix the Excel file and re-upload.
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={previewData.summary.readyForImport === 0 || isImporting}
                >
                  <Check size={16} aria-hidden="true" />
                  Import {previewData.summary.readyForImport} record
                  {previewData.summary.readyForImport === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- Step 4: Import result ---------- */}
        {hasResult && importResult && (
          <div>
            <div
              className={`bu-result-banner ${
                importResult.summary.failed > 0 ? 'partial' : ''
              }`}
              role="status"
            >
              {importResult.summary.failed > 0 ? (
                <AlertTriangle size={26} aria-hidden="true" style={{ color: 'var(--warning-600)' }} />
              ) : (
                <CheckCircle2 size={26} aria-hidden="true" style={{ color: 'var(--success-600)' }} />
              )}
              <div>
                <h2 className="bu-result-title">
                  {importResult.summary.failed > 0
                    ? 'Bulk import finished with some failures'
                    : 'Bulk import completed'}
                </h2>
                <p className="bu-result-text">
                  {importResult.summary.imported} of {importResult.summary.totalRows}{' '}
                  {activeTarget === 'STUDENTS' ? 'student' : 'faculty'} records were created.
                  {importResult.summary.skipped > 0 &&
                    ` ${importResult.summary.skipped} skipped (duplicates or existing records).`}
                  {importResult.summary.failed > 0 && ` ${importResult.summary.failed} failed.`}
                </p>
              </div>
            </div>

            <div className="bu-stat-grid">
              <div className="bu-stat total">
                <p className="bu-stat-label">Total processed</p>
                <p className="bu-stat-value">{importResult.summary.totalRows}</p>
              </div>
              <div className="bu-stat valid">
                <p className="bu-stat-label">Imported</p>
                <p className="bu-stat-value">{importResult.summary.imported}</p>
              </div>
              <div className="bu-stat duplicate">
                <p className="bu-stat-label">Skipped</p>
                <p className="bu-stat-value">{importResult.summary.skipped}</p>
              </div>
              <div className="bu-stat invalid">
                <p className="bu-stat-label">Failed</p>
                <p className="bu-stat-value">{importResult.summary.failed}</p>
              </div>
            </div>

            <div className="bu-table-wrap" style={{ maxHeight: '20rem', marginBottom: '1.25rem' }}>
              <table className="bu-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">
                      {activeTarget === 'STUDENTS' ? 'Register No.' : 'Employee ID'}
                    </th>
                    <th scope="col">Name</th>
                    <th scope="col">Status</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.results.map((res) => (
                    <tr key={`${res.rowNumber}-${res.identifier}`}>
                      <td>{res.rowNumber}</td>
                      <td className="bu-cell-strong">{res.identifier}</td>
                      <td>{res.name}</td>
                      <td>
                        <span className={`badge ${RESULT_BADGE[res.status]}`}>{res.status}</span>
                      </td>
                      <td>
                        <span
                          className={`bu-reason ${
                            res.status === 'Imported'
                              ? 'ok'
                              : res.status === 'Skipped'
                              ? 'warn'
                              : 'bad'
                          }`}
                        >
                          {res.reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bu-action-row split">
              <button type="button" className="btn btn-secondary" onClick={handleClearFile}>
                <Upload size={16} aria-hidden="true" />
                Upload another file
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownloadErrorReport}
                disabled={isDownloadingReport || resultIssues.length === 0}
                title={
                  resultIssues.length === 0
                    ? 'Every row imported successfully.'
                    : undefined
                }
              >
                {isDownloadingReport ? (
                  <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )}
                Download error report
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={`Confirm bulk import — ${targetLabel}`}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-gold"
              onClick={handleConfirmImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              Confirm import
            </button>
          </>
        }
      >
        {previewData && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="notice notice-warning">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <strong>Only valid, new rows are created.</strong> Existing records are never
                overwritten. New accounts get the default password{' '}
                <code style={{ fontFamily: 'monospace', fontWeight: 700 }}>Password@123</code>.
              </div>
            </div>

            <div className="bu-summary-list">
              <div className="bu-summary-row">
                <span>Total rows in the Excel file</span>
                <strong>{previewData.summary.totalRows}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Records that will be created</span>
                <strong className="ok">{previewData.summary.readyForImport}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Invalid rows (skipped)</span>
                <strong className="warn">{previewData.summary.invalidRows}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Duplicates inside the file (skipped)</span>
                <strong className="warn">{previewData.summary.duplicateRows}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Already existing records (skipped)</span>
                <strong className="warn">{previewData.summary.existingRecords}</strong>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ---- Small helper: per-row secondary details ---------------------------- */

const PreviewDetails: React.FC<{ row: BulkPreviewRow; target: UploadTarget }> = ({
  row,
  target,
}) => {
  const raw = row.rawData || {};

  if (target === 'STUDENTS') {
    const parts = [
      raw.academicBatch && `Batch ${raw.academicBatch}`,
      raw.year && `Yr ${raw.year}`,
      raw.section && `Sec ${raw.section}`,
      raw.residentialStatus,
      raw.mobile,
      raw.emailAddress,
    ].filter(Boolean) as string[];
    return (
      <span>
        {parts.length > 0 ? parts.join(' · ') : '—'}
        <span className="bu-cell-muted">{raw.bloodGroup || ''}</span>
      </span>
    );
  }

  const parts = [
    raw.designation,
    raw.mobile || raw.phoneNumber,
    raw.emailAddress || raw.email,
    raw.cabinLocation,
  ].filter(Boolean) as string[];
  return <span>{parts.length > 0 ? parts.join(' · ') : '—'}</span>;
};
