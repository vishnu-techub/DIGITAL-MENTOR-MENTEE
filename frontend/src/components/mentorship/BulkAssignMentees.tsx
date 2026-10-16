import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type BulkAssignPreviewRow,
  type BulkAssignStatus,
  type BulkAssignValidationResponse,
  type BulkAssignExecuteResponse,
  type BulkAssignResultRow,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
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
  Eye,
  PlayCircle,
  ArrowRightLeft,
  FileWarning,
} from 'lucide-react';

type StepKey = 'UPLOAD' | 'PREVIEW' | 'CONFIRM' | 'RESULT';
type StatusFilter = 'ALL' | BulkAssignStatus;

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'UPLOAD', label: 'Upload' },
  { key: 'PREVIEW', label: 'Preview & Validate' },
  { key: 'CONFIRM', label: 'Confirm' },
  { key: 'RESULT', label: 'Results' },
];

const STATUS_BADGE: Record<BulkAssignStatus, string> = {
  VALID: 'badge-success',
  WARNING: 'badge-warning',
  INVALID: 'badge-danger',
  DUPLICATE: 'badge-warning',
  ALREADY_ASSIGNED: 'badge-info',
  REASSIGNMENT_REQUIRED: 'badge-primary',
};

const STATUS_LABEL: Record<BulkAssignStatus, string> = {
  VALID: 'Valid',
  WARNING: 'Warning',
  INVALID: 'Invalid',
  DUPLICATE: 'Duplicate',
  ALREADY_ASSIGNED: 'Already assigned',
  REASSIGNMENT_REQUIRED: 'Reassignment required',
};

const RESULT_BADGE: Record<BulkAssignResultRow['status'], string> = {
  ASSIGNED: 'badge-success',
  REASSIGNED: 'badge-primary',
  SKIPPED: 'badge-warning',
  FAILED: 'badge-danger',
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface BulkAssignMenteesProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after an execution completes, so the host page can refresh. */
  onCompleted?: (result: BulkAssignExecuteResponse) => void;
}

/**
 * Bulk Upload & Assign Mentees — a self-contained modal flow.
 *
 * Download a template (.xlsx / .csv) → upload → server-side validation preview →
 * review → explicit confirmation (with reassignment authorisation + reason) →
 * per-row execution results. No row is written until the confirmation step, and
 * invalid rows are never assigned.
 */
export const BulkAssignMentees: React.FC<BulkAssignMenteesProps> = ({
  isOpen,
  onClose,
  onCompleted,
}) => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const [previewData, setPreviewData] = useState<BulkAssignValidationResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [authorizeReassignments, setAuthorizeReassignments] = useState(false);
  const [reassignReason, setReassignReason] = useState('');
  const [execResult, setExecResult] = useState<BulkAssignExecuteResponse | null>(null);

  const resetFlow = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setExecResult(null);
    setSearchQuery('');
    setStatusFilter('ALL');
    setIsDragging(false);
    setShowConfirmModal(false);
    setAuthorizeReassignments(false);
    setReassignReason('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Fresh state every time the modal is opened.
  useEffect(() => {
    if (isOpen) resetFlow();
  }, [isOpen]);

  const summary = previewData?.summary;
  const hasResult = execResult !== null;
  const activeStepIndex = hasResult ? 3 : previewData ? 2 : selectedFile ? 1 : 0;

  const reassignCount = summary?.reassignmentRequired ?? 0;
  const assignableCount = (summary?.validAssignments ?? 0) + reassignCount;

  const counts = useMemo(
    () => ({
      ALL: previewData?.rows.length ?? 0,
      VALID: summary ? previewData!.rows.filter((r) => r.status === 'VALID').length : 0,
      WARNING: previewData?.rows.filter((r) => r.status === 'WARNING').length ?? 0,
      INVALID: previewData?.rows.filter((r) => r.status === 'INVALID').length ?? 0,
      DUPLICATE: previewData?.rows.filter((r) => r.status === 'DUPLICATE').length ?? 0,
      ALREADY_ASSIGNED: summary?.alreadyAssigned ?? 0,
      REASSIGNMENT_REQUIRED: reassignCount,
    }),
    [previewData, summary, reassignCount]
  );

  const filteredRows = useMemo(() => {
    const rows = previewData?.rows ?? [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.registerNumber.toLowerCase().includes(q) ||
        row.studentName.toLowerCase().includes(q) ||
        row.employeeId.toLowerCase().includes(q) ||
        row.mentorName.toLowerCase().includes(q) ||
        (row.currentMentorName || '').toLowerCase().includes(q)
      );
    });
  }, [previewData, searchQuery, statusFilter]);

  const resultIssues = execResult ? execResult.results.filter((r) => r.status === 'SKIPPED' || r.status === 'FAILED') : [];

  /* ---- Handlers --------------------------------------------------------- */

  const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
    setIsDownloadingTemplate(true);
    try {
      await api.bulkAssignment.downloadTemplate(format);
      toast.success(`${format === 'csv' ? 'CSV' : 'Excel'} template downloaded.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to download template.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      toast.error('Only .xlsx and .csv files are supported.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('File size exceeds the 5 MB limit.');
      return;
    }
    setSelectedFile(file);
    setPreviewData(null);
    setExecResult(null);
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

  const handleValidateFile = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first.');
      return;
    }
    setIsValidating(true);
    try {
      const response = await api.bulkAssignment.validate(selectedFile);
      if (response.success && response.data) {
        setPreviewData(response.data);
        setStatusFilter('ALL');
        setSearchQuery('');
        const s = response.data.summary;
        toast.success(
          `Validated ${s.totalRows} row${s.totalRows === 1 ? '' : 's'} — ${s.readyForAssignment} assignable, ${s.invalidRows} invalid.`
        );
      } else {
        toast.error(response.message || 'Validation failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Validation failed. Please check the file format.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleDownloadValidationReport = async (format: 'CSV' | 'XLSX') => {
    if (!previewData || previewData.rows.length === 0) return;
    setIsDownloadingReport(true);
    try {
      await api.bulkAssignment.downloadReport({ type: 'VALIDATION', format, rows: previewData.rows });
      toast.success('Validation report downloaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download the validation report.');
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const canConfirm =
    !!previewData &&
    assignableCount > 0 &&
    (reassignCount === 0 || (authorizeReassignments && reassignReason.trim() !== ''));

  const handleConfirmAssignments = async () => {
    if (!previewData || assignableCount === 0) return;
    if (reassignCount > 0 && !authorizeReassignments) {
      toast.error('Please authorise the reassignments before confirming.');
      return;
    }
    if (reassignCount > 0 && reassignReason.trim() === '') {
      toast.error('A reason is required for reassignments.');
      return;
    }

    setShowConfirmModal(false);
    setIsAssigning(true);
    try {
      const rowsToSend = previewData.rows
        .filter(
          (r) =>
            r.status === 'VALID' ||
            r.status === 'WARNING' ||
            r.status === 'REASSIGNMENT_REQUIRED'
        )
        .map((r) => ({
          rowNumber: r.rowNumber,
          registerNumber: r.registerNumber === '—' ? '' : r.registerNumber,
          employeeId: r.employeeId === '—' ? '' : r.employeeId,
        }));

      const response = await api.bulkAssignment.assign({
        rows: rowsToSend,
        authorizeReassignments: reassignCount > 0 ? authorizeReassignments : false,
        reason: reassignReason.trim() !== '' ? reassignReason.trim() : undefined,
      });

      if (response.success && response.data) {
        setExecResult(response.data);
        const s = response.data.summary;
        if (s.failed > 0 || s.skipped > 0) {
          toast.info(
            `Completed ${s.successful} of ${s.totalRows} rows (${s.skipped} skipped, ${s.failed} failed).`
          );
        } else {
          toast.success(`All ${s.successful} row(s) processed successfully.`);
        }
        onCompleted?.(response.data);
      } else {
        toast.error(response.message || 'Assignment failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute the assignments.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDownloadResultReport = async (format: 'CSV' | 'XLSX') => {
    if (!execResult || execResult.results.length === 0) return;
    setIsDownloadingReport(true);
    try {
      await api.bulkAssignment.downloadReport({ type: 'RESULT', format, rows: execResult.results });
      toast.success('Results report downloaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download the results report.');
    } finally {
      setIsDownloadingReport(false);
    }
  };

  /* ---- Render ----------------------------------------------------------- */

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Bulk Upload & Assign Mentees"
        maxWidth="1000px"
        footer={
          <div className="ba-footer">
            <div className="ba-footer-meta">
              <span className="badge badge-neutral">.xlsx / .csv</span>
              <span className="badge badge-neutral">Max 5 MB · 1000 rows</span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {hasResult ? 'Close' : 'Cancel'}
            </button>
          </div>
        }
      >
        {/* Stepper */}
        <nav className="bu-steps" aria-label="Bulk assignment progress">
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
                <span className={`bu-step ${state}`} aria-current={i === activeStepIndex ? 'step' : undefined}>
                  <span className="bu-step-circle" aria-hidden="true">
                    {state === 'done' ? <Check size={14} /> : i + 1}
                  </span>
                  <span className="bu-step-label">{step.label}</span>
                </span>
              </React.Fragment>
            );
          })}
        </nav>

        {/* ---------- Step 1: Upload ---------- */}
        {!previewData && !hasResult && (
          <div>
            <div className="notice notice-info" role="note" style={{ marginBottom: '1.25rem' }}>
              <Info size={16} aria-hidden="true" />
              <div>
                <strong>How it works.</strong> Download the template, list one student per row
                (<code>Student Register Number</code>, <code>Mentor Employee ID</code>), upload it,
                review the validated preview, then confirm. Only valid rows are written; students who
                already have a mentor require an explicit, reason-backed reassignment and their
                previous mentor is preserved in history.
              </div>
            </div>

            {/* Template downloads */}
            <div className="ba-template-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleDownloadTemplate('xlsx')}
                disabled={isDownloadingTemplate}
              >
                <FileSpreadsheet size={16} aria-hidden="true" />
                Download Excel Template (.xlsx)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleDownloadTemplate('csv')}
                disabled={isDownloadingTemplate}
              >
                <Download size={16} aria-hidden="true" />
                Download CSV Template (.csv)
              </button>
            </div>

            {/* Dropzone */}
            <div
              className={`bu-dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={
                selectedFile
                  ? `Selected file ${selectedFile.name}. Press Enter to choose a different file.`
                  : 'Upload an assignment file. Press Enter or Space to browse.'
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
                accept=".xlsx,.csv"
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
                  <p className="bu-dropzone-hint">Ready to validate. Click to choose a different file.</p>
                  <p className="bu-file-meta">
                    <span className="badge badge-success">
                      <Check size={12} aria-hidden="true" /> Selected
                    </span>
                    <span className="bu-file-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="bu-dropzone-title">
                    Drag &amp; drop your file, or <span className="bu-dropzone-browse">browse</span>
                  </p>
                  <p className="bu-dropzone-hint">
                    Only <strong>.xlsx</strong> and <strong>.csv</strong> files up to 5 MB are accepted.
                  </p>
                </>
              )}
            </div>

            <div className="bu-action-row">
              {selectedFile && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={resetFlow}>
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

        {/* ---------- Steps 2 & 3: Preview + Confirm ---------- */}
        {previewData && !hasResult && (
          <div>
            <div className="section-heading">
              <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Eye size={20} aria-hidden="true" /> Assignment preview &amp; validation
              </h2>
              <p className="section-description">
                Nothing is written yet. Invalid and duplicate rows are never assigned, and existing
                assignments are not silently overwritten.
              </p>
            </div>

            {/* Summary cards */}
            <div className="bu-stat-grid">
              <div className="bu-stat total">
                <p className="bu-stat-label">
                  <FileSpreadsheet size={13} aria-hidden="true" /> Total rows
                </p>
                <p className="bu-stat-value">{summary?.totalRows ?? 0}</p>
              </div>
              <div className="bu-stat valid">
                <p className="bu-stat-label">
                  <CheckCircle2 size={13} aria-hidden="true" /> Valid assignments
                </p>
                <p className="bu-stat-value">{summary?.validAssignments ?? 0}</p>
              </div>
              <div className="bu-stat duplicate">
                <p className="bu-stat-label">
                  <ArrowRightLeft size={13} aria-hidden="true" /> Requiring reassignment
                </p>
                <p className="bu-stat-value">{summary?.reassignmentRequired ?? 0}</p>
              </div>
              <div className="bu-stat existing">
                <p className="bu-stat-label">
                  <Info size={13} aria-hidden="true" /> Already assigned
                </p>
                <p className="bu-stat-value">{summary?.alreadyAssigned ?? 0}</p>
              </div>
              <div className="bu-stat invalid">
                <p className="bu-stat-label">
                  <XCircle size={13} aria-hidden="true" /> Invalid / duplicate
                </p>
                <p className="bu-stat-value">{summary?.invalidRows ?? 0}</p>
              </div>
              <div className="bu-stat ready">
                <p className="bu-stat-label">
                  <PlayCircle size={13} aria-hidden="true" /> Affected mentors
                </p>
                <p className="bu-stat-value">{summary?.affectedMentors ?? 0}</p>
              </div>
            </div>

            {reassignCount > 0 && (
              <div className="notice notice-warning" role="note" style={{ marginBottom: '1.25rem' }}>
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  <strong>{reassignCount} row(s) require reassignment.</strong> These students already
                  have an active mentor. Reassignments must be explicitly authorised on the
                  confirmation step and their previous mentor is preserved in history.
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bu-filter-bar">
              <div className="bu-chip-row" role="group" aria-label="Filter rows by status">
                {(
                  [
                    ['ALL', 'All'],
                    ['VALID', 'Valid'],
                    ['WARNING', 'Warning'],
                    ['REASSIGNMENT_REQUIRED', 'Reassignment'],
                    ['ALREADY_ASSIGNED', 'Already assigned'],
                    ['INVALID', 'Invalid'],
                    ['DUPLICATE', 'Duplicate'],
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
                  placeholder="Search by register no., student, employee ID or mentor…"
                  aria-label="Search preview rows"
                />
              </div>
            </div>

            {/* Preview table */}
            <div className="bu-table-wrap" tabIndex={0} aria-label="Preview of assignment rows">
              <table className="bu-table ba-table" style={{ minWidth: 940 }}>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Student (Register No.)</th>
                    <th scope="col">Mentor (Employee ID)</th>
                    <th scope="col">Current Mentor</th>
                    <th scope="col">Proposed Mentor</th>
                    <th scope="col">Status</th>
                    <th scope="col">Message</th>
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
                        key={`${row.rowNumber}-${row.registerNumber}-${row.employeeId}`}
                        className={
                          row.status === 'VALID'
                            ? 'row-valid'
                            : row.status === 'WARNING'
                            ? 'row-duplicate'
                            : row.status === 'INVALID'
                            ? 'row-invalid'
                            : row.status === 'DUPLICATE'
                            ? 'row-duplicate'
                            : 'row-existing'
                        }
                      >
                        <td>{row.rowNumber}</td>
                        <td>
                          <span className="ba-cell-strong">{row.registerNumber}</span>
                          <span className="ba-cell-sub">{row.studentName}</span>
                        </td>
                        <td>
                          <span className="ba-cell-strong">{row.employeeId}</span>
                          <span className="ba-cell-sub">{row.mentorName}</span>
                        </td>
                        <td>{row.currentMentorName || '—'}</td>
                        <td>{row.proposedMentorName}</td>
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
                                : row.status === 'ALREADY_ASSIGNED'
                                ? 'info'
                                : 'warn'
                            }`}
                          >
                            {row.message}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bu-action-row split">
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={resetFlow}>
                  Upload another file
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleDownloadValidationReport('CSV')}
                  disabled={isDownloadingReport}
                >
                  <FileWarning size={16} aria-hidden="true" />
                  Validation report (CSV)
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {assignableCount === 0 && (
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--danger-600)', fontWeight: 600 }}>
                    No assignable rows — fix the file and re-upload.
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={assignableCount === 0 || isAssigning}
                >
                  <ArrowRightLeft size={16} aria-hidden="true" />
                  Review &amp; assign {assignableCount} row{assignableCount === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- Step 4: Results ---------- */}
        {hasResult && execResult && (
          <div>
            <div className={`bu-result-banner ${execResult.summary.failed > 0 || execResult.summary.skipped > 0 ? 'partial' : ''}`} role="status">
              {execResult.summary.failed > 0 || execResult.summary.skipped > 0 ? (
                <AlertTriangle size={26} aria-hidden="true" style={{ color: 'var(--warning-600)' }} />
              ) : (
                <CheckCircle2 size={26} aria-hidden="true" style={{ color: 'var(--success-600)' }} />
              )}
              <div>
                <h2 className="bu-result-title">
                  {execResult.summary.failed > 0
                    ? 'Bulk assignment finished with failures'
                    : execResult.summary.skipped > 0
                    ? 'Bulk assignment completed with skips'
                    : 'Bulk assignment completed'}
                </h2>
                <p className="bu-result-text">
                  {execResult.summary.successful} of {execResult.summary.totalRows} row(s) processed
                  {execResult.summary.reassigned > 0 && ` (${execResult.summary.reassigned} reassignment(s))`}.
                  {execResult.summary.skipped > 0 && ` ${execResult.summary.skipped} skipped.`}
                  {execResult.summary.failed > 0 && ` ${execResult.summary.failed} failed.`}
                </p>
              </div>
            </div>

            <div className="bu-stat-grid">
              <div className="bu-stat total">
                <p className="bu-stat-label">Total rows</p>
                <p className="bu-stat-value">{execResult.summary.totalRows}</p>
              </div>
              <div className="bu-stat valid">
                <p className="bu-stat-label">Assigned</p>
                <p className="bu-stat-value">{execResult.summary.assigned}</p>
              </div>
              <div className="bu-stat ready">
                <p className="bu-stat-label">Reassigned</p>
                <p className="bu-stat-value">{execResult.summary.reassigned}</p>
              </div>
              <div className="bu-stat duplicate">
                <p className="bu-stat-label">Skipped</p>
                <p className="bu-stat-value">{execResult.summary.skipped}</p>
              </div>
              <div className="bu-stat invalid">
                <p className="bu-stat-label">Failed</p>
                <p className="bu-stat-value">{execResult.summary.failed}</p>
              </div>
            </div>

            <div className="bu-table-wrap" style={{ maxHeight: '22rem', marginBottom: '1.25rem' }}>
              <table className="bu-table" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Register No.</th>
                    <th scope="col">Student</th>
                    <th scope="col">Mentor</th>
                    <th scope="col">Result</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {execResult.results.map((res) => (
                    <tr key={`${res.rowNumber}-${res.registerNumber}-${res.employeeId}`}>
                      <td>{res.rowNumber}</td>
                      <td className="bu-cell-strong">{res.registerNumber}</td>
                      <td>{res.studentName}</td>
                      <td>
                        <span className="bu-cell-strong">{res.employeeId}</span>
                        <span className="ba-cell-sub">{res.mentorName}</span>
                      </td>
                      <td>
                        <span className={`badge ${RESULT_BADGE[res.status]}`}>{res.status}</span>
                      </td>
                      <td>
                        <span
                          className={`bu-reason ${
                            res.status === 'ASSIGNED'
                              ? 'ok'
                              : res.status === 'REASSIGNED'
                              ? 'info'
                              : res.status === 'SKIPPED'
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
              <button type="button" className="btn btn-secondary" onClick={resetFlow}>
                <Upload size={16} aria-hidden="true" />
                Assign more mentees
              </button>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleDownloadResultReport('CSV')}
                  disabled={isDownloadingReport}
                >
                  <Download size={16} aria-hidden="true" />
                  Results (CSV)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleDownloadResultReport('XLSX')}
                  disabled={isDownloadingReport}
                  title={resultIssues.length === 0 ? 'Every row processed successfully.' : undefined}
                >
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  Results (Excel)
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm bulk assignment"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-gold"
              onClick={handleConfirmAssignments}
              disabled={isAssigning || !canConfirm}
            >
              {isAssigning ? (
                <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              Confirm assignments
            </button>
          </>
        }
      >
        {previewData && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="notice notice-warning">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <strong>Review before confirming.</strong> Invalid and duplicate rows are skipped and
                are never assigned. Existing single-student assignment and reassignment history is
                preserved.
              </div>
            </div>

            <div className="bu-summary-list">
              <div className="bu-summary-row">
                <span>Total rows in the file</span>
                <strong>{previewData.summary.totalRows}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Valid new assignments</span>
                <strong className="ok">{previewData.summary.validAssignments}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Requiring reassignment</span>
                <strong className={reassignCount > 0 ? 'warn' : ''}>{reassignCount}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Already assigned (no change)</span>
                <strong className="warn">{previewData.summary.alreadyAssigned}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Invalid / duplicate rows (skipped)</span>
                <strong className="warn">{previewData.summary.invalidRows}</strong>
              </div>
              <div className="bu-summary-row">
                <span>Affected mentors</span>
                <strong>{previewData.summary.affectedMentors}</strong>
              </div>
            </div>

            {reassignCount > 0 && (
              <div className="ba-confirm-reassign">
                <label className="ba-check">
                  <input
                    type="checkbox"
                    checked={authorizeReassignments}
                    onChange={(e) => setAuthorizeReassignments(e.target.checked)}
                  />
                  <span>
                    I authorise the {reassignCount} reassignment(s). The previous mentor will be
                    recorded in history.
                  </span>
                </label>
                <div className="form-group" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  <label className="form-label">Reason for reassignment (required)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    placeholder="e.g. Workload rebalancing for the 2026-27 academic year"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};

export default BulkAssignMentees;
