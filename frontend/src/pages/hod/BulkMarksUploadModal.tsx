import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Upload, X } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../context/ToastContext';

export interface BulkUploadContext {
  academicYear: string;
  year: number;
  section: string;
  subjectCode: string;
  subjectName: string;
  semesterNumber: number;
}

interface ValidationRow {
  rowNumber: number;
  registerNumber: string;
  studentName: string;
  status: string;
  reason: string;
  assessmentType: string;
  marksObtained: string;
}

interface ValidationPreview {
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    existingRecords: number;
    readyForImport: number;
  };
  rows: ValidationRow[];
}

interface BulkMarksUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Selected class + subject + semester; uploads are refused without it. */
  context: BulkUploadContext | null;
  /** Called after a successful import so the parent can reload the marks. */
  onImported: () => void;
}

const rowBackground = (status: string): string | undefined => {
  if (status === 'VALID') return '#ECFDF5';
  if (status === 'INVALID') return '#FEF2F2';
  if (status === 'DUPLICATE') return '#FFF7ED';
  if (status === 'ALREADY_EXISTS') return '#EFF6FF';
  return undefined;
};

const statusBadgeClass = (status: string): string => {
  if (status === 'VALID') return 'badge-success';
  if (status === 'INVALID') return 'badge-danger';
  if (status === 'DUPLICATE') return 'badge-warning';
  return 'badge-info';
};

/**
 * Excel bulk-upload workflow for a class/subject: file select → server-side
 * validation preview (per-row status + reason) → import of the VALID rows only.
 * Existing marks are never overwritten by the import service.
 */
export const BulkMarksUploadModal: React.FC<BulkMarksUploadModalProps> = ({
  isOpen,
  onClose,
  context,
  onImported,
}) => {
  const toast = useToast();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<'file' | 'preview'>('file');
  const [validationPreview, setValidationPreview] = useState<ValidationPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Reset the workflow whenever the modal is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setUploadFile(null);
      setUploadStage('file');
      setValidationPreview(null);
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadFile(file);
  };

  const handleValidateUpload = async () => {
    if (!uploadFile || !context) {
      toast.error('Please select a class, subject, and semester first.');
      return;
    }
    setUploading(true);
    try {
      const result = await api.hod.marks.validateUpload(uploadFile, context);
      setValidationPreview(result.data as ValidationPreview);
      setUploadStage('preview');
    } catch (err: any) {
      toast.error('Validation failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleImportUpload = async () => {
    if (!validationPreview || !context) return;
    setImporting(true);
    try {
      const validRows = validationPreview.rows.filter((r) => r.status === 'VALID');
      const result = await api.hod.marks.importRows(validRows, context);
      toast.success(
        `Import complete: ${result.data.summary.imported} imported, ${result.data.summary.updated} updated, ${result.data.summary.skipped} skipped, ${result.data.summary.failed} failed.`
      );
      onImported();
      onClose();
    } catch (err: any) {
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Marks from Excel" maxWidth="900px">
      {uploadStage === 'file' ? (
        <div style={{ padding: '1rem 0' }}>
          <p style={{ marginBottom: '1rem', color: 'var(--color-slate-600)' }}>
            Upload an Excel file (.xlsx) with marks for the selected class and subject. The template
            should contain Register Number and Marks Obtained columns.
          </p>
          <div className="form-group">
            <label className="form-label">Excel File (.xlsx)</label>
            <input
              type="file"
              className="form-control"
              accept=".xlsx"
              onChange={handleFileSelect}
            />
            <small className="form-text">Max file size: 10 MB. Only .xlsx files accepted.</small>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleValidateUpload}
              disabled={uploading || !uploadFile || !context}
            >
              {uploading ? <Loader2 size={16} className="spin" /> : 'Validate & Preview'}
            </button>
          </div>
        </div>
      ) : null}

      {uploadStage === 'preview' && validationPreview ? (
        <div style={{ padding: '1rem 0', maxHeight: '70vh', overflowY: 'auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <h4 style={{ margin: 0 }}>Validation Preview</h4>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-slate-600)' }}>
                {validationPreview.summary.totalRows} rows &bull;{' '}
                <span className="badge badge-success">{validationPreview.summary.validRows} Valid</span>
                <span className="badge badge-danger">{validationPreview.summary.invalidRows} Invalid</span>
                <span className="badge badge-warning">
                  {validationPreview.summary.duplicateRows} Duplicate
                </span>
                <span className="badge badge-info">
                  {validationPreview.summary.existingRecords} Existing
                </span>
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
                  <tr key={row.rowNumber} style={{ backgroundColor: rowBackground(row.status) }}>
                    <td style={{ fontSize: '0.7rem', color: 'var(--color-slate-500)' }}>
                      {row.rowNumber}
                    </td>
                    <td style={{ fontWeight: 700 }}>{row.registerNumber}</td>
                    <td>{row.studentName}</td>
                    <td>{row.assessmentType}</td>
                    <td style={{ textAlign: 'center' }}>{row.marksObtained || '—'}</td>
                    <td>
                      <span className={`badge ${statusBadgeClass(row.status)}`}>{row.status}</span>
                    </td>
                    <td
                      style={{
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validationPreview.summary.invalidRows > 0 ? (
            <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
              <AlertTriangle size={16} /> <strong>Invalid rows will be skipped.</strong> Please
              correct the Excel file and re-upload, or go back to select a different file.
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
};

export default BulkMarksUploadModal;
