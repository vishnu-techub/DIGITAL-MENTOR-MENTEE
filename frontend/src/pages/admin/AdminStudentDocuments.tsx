import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { RecordStatusBadge } from '../../lib/recordStatus';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';
import {
  ArrowLeft,
  Calendar,
  Download,
  Eye,
  FileCheck,
  FileText,
  FileX,
  Hash,
  ImageOff,
  ShieldCheck,
  User,
} from 'lucide-react';

/**
 * ADMIN → Student Documents — dedicated document list + viewer.
 *
 * Deliberately NOT the Student Profile. Clicking a student's document opens
 * `DocumentViewer` below (authenticated blob preview + metadata + download/back
 * actions). Reuses the existing document APIs and the StudentDocument rows
 * (`api.documents.getByStudent` / `fetchViewBlob` / `download`) so no storage,
 * upload, permission or verification rule changes.
 *
 * Admin authorization is exactly what it already was: `getByStudent`,
 * `fetchViewBlob` and `download` all run `checkStudentAccess` server-side,
 * which allows ADMIN unconditionally and refuses every other role.
 */

interface AdminStudentDocumentsProps {
  student: any;
  onBack: () => void;
}

const IMAGE_MIME =
  /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i;
const PREVIEWABLE_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|svg)$/i;

function canPreviewMime(mime: string): boolean {
  return mime.includes('pdf') || IMAGE_MIME.test(mime);
}

function looksPreviewable(doc: any): boolean {
  const mime = doc?.fileType || '';
  const name = doc?.fileName || '';
  return canPreviewMime(mime) || PREVIEWABLE_EXT.test(name);
}

function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function categoryLabel(doc: any): string {
  if (doc?.isPrimary || doc?.documentType === 'student_details_form') return 'Student Details Form';
  if (doc?.documentType === 'other') return 'Other';
  return doc?.category || doc?.documentType || 'Certificate';
}

export const AdminStudentDocuments: React.FC<AdminStudentDocumentsProps> = ({ student, onBack }) => {
  const toast = useToast();

  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dedicated viewer state — one document at a time, never a profile route.
  const [viewing, setViewing] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('');
  const previewUrlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.documents.getByStudent(student.id || student._id);
      const rows = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
      setDocs(rows);
    } catch (err: any) {
      setError(err?.message || 'Failed to load this student\'s documents.');
    } finally {
      setLoading(false);
    }
  }, [student.id, student._id]);

  useEffect(() => {
    load();
  }, [load]);

  // Revoke the authenticated blob URL when the viewer closes or unmounts — the
  // URL holds a private file, so it must not outlive this component.
  const closeViewer = useCallback(() => {
    if (previewUrlRef.current) {
      window.URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewMime('');
    setViewing(null);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        window.URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const openViewer = async (doc: any) => {
    const documentId = doc.documentId || doc.id;
    if (!documentId) return;
    if (previewUrlRef.current) {
      window.URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setViewing(doc);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewMime('');

    // Preview is only attempted for types this UI can render (PDF / image).
    // Everything else gets a clean "Preview unavailable" state with Download.
    if (!looksPreviewable(doc)) {
      setPreviewError('unavailable');
      return;
    }

    setPreviewLoading(true);
    try {
      const { blob, mimeType } = await api.documents.fetchViewBlob(documentId);
      if (canPreviewMime(mimeType)) {
        const url = window.URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewMime(mimeType);
        setPreviewUrl(url);
      } else {
        setPreviewError('unavailable');
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'You are not authorised to preview this document, or the file is missing.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (doc: any) => {
    try {
      await api.documents.download(doc.documentId || doc.id, doc.fileName);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download the document.');
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader
          eyebrow="Administration"
          title="Student Documents"
          subtitle="Loading this student's uploaded documents…"
          actions={
            <button className="btn btn-secondary btn-sm" onClick={onBack}>
              <ArrowLeft size={15} /> Back to Student Documents
            </button>
          }
        />
        <div className="card" style={{ padding: '1.5rem' }}>
          <Skeleton width="180px" height="22px" />
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
            <Skeleton width="100%" height="72px" />
            <Skeleton width="100%" height="72px" />
            <Skeleton width="100%" height="72px" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          eyebrow="Administration"
          title="Student Documents"
          subtitle={
            student.full_name
              ? `${student.full_name}${student.register_number ? ` · ${student.register_number}` : ''}`
              : undefined
          }
          actions={
            <button className="btn btn-secondary btn-sm" onClick={onBack}>
              <ArrowLeft size={15} /> Back to Student Documents
            </button>
          }
        />
        <div className="card">
          <EmptyState
            compact
            icon={<FileX size={32} style={{ color: 'var(--color-slate-400)' }} />}
            title="Could not load documents"
            description={error}
            action={
              <button className="btn btn-secondary btn-sm" onClick={load}>
                Retry
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header — switches copy for the list vs. the per-student viewer. */}
      <PageHeader
        eyebrow={viewing ? 'Document Viewer' : 'Administration'}
        title={viewing ? (student.full_name || 'Student Documents') : 'Student Documents'}
        subtitle={
          viewing
            ? `Viewing ${viewing.title || viewing.fileName || 'document'} · ${student.register_number || '—'}`
            : `Certificates and records uploaded for ${student.full_name || 'this student'}${
                student.register_number ? ` (${student.register_number})` : ''
              }.`
        }
        actions={
          <button className="btn btn-secondary btn-sm" onClick={onBack}>
            <ArrowLeft size={15} /> Back to Student Documents
          </button>
        }
      />

      {/* Student context header (not the full profile). */}
      <div className="card" style={{ borderLeft: '4px solid var(--color-gold-500)', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-navy-800)' }}>{student.full_name}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', marginTop: '0.25rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginRight: '1rem' }}>
                <Hash size={13} /> {student.register_number || '—'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginRight: '1rem' }}>
                <FileCheck size={13} /> {student.dept_code || '—'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <ShieldCheck size={13} /> Mentor: {student.mentor_name || 'Unassigned'}
              </span>
            </div>
          </div>
          <button
            className="btn btn-gold btn-sm"
            onClick={() => { if (viewing) closeViewer(); }}
            disabled={!viewing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <ArrowLeft size={15} /> Back to Document List
          </button>
        </div>
      </div>

      {viewing ? (
        /* ==================== DEDICATED DOCUMENT VIEWER ==================== */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              <FileText size={18} /> {viewing.title || viewing.fileName || 'Document'}
            </h3>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <RecordStatusBadge record={viewing} />
            </span>
          </div>

          {/* Preview pane */}
          <div
            style={{
              background: 'var(--color-slate-100)',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '340px',
              maxHeight: '62vh',
              overflow: 'auto',
              borderBottom: '1px solid var(--color-slate-200)',
            }}
          >
            {previewLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--color-slate-500)', fontSize: '0.9rem' }}>
                <div className="skeleton" style={{ width: '120px', height: '140px', margin: '0 auto 1rem' }} />
                Loading preview…
              </div>
            ) : previewUrl ? (
              previewMime.includes('pdf') ? (
                <iframe
                  src={previewUrl}
                  title={viewing.title || viewing.fileName || 'Document preview'}
                  style={{ width: '100%', height: '56vh', border: 'none', borderRadius: '8px', background: '#fff' }}
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={`Preview of ${viewing.title || viewing.fileName || 'document'}`}
                  style={{ maxWidth: '100%', maxHeight: '56vh', borderRadius: '8px', boxShadow: '0 10px 30px rgba(2,6,23,0.15)' }}
                />
              )
            ) : (
              <div
                role="status"
                style={{
                  textAlign: 'center',
                  color: 'var(--color-slate-500)',
                  maxWidth: '340px',
                }}
              >
                <div style={{ margin: '0 auto 0.75rem', width: '64px', height: '64px', borderRadius: '14px', background: 'var(--color-slate-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {previewError === 'unavailable' ? <ImageOff size={28} /> : <FileX size={28} />}
                </div>
                <strong style={{ display: 'block', color: 'var(--color-slate-700)', marginBottom: '0.25rem' }}>
                  {previewError === 'unavailable' ? 'Preview unavailable' : 'Could not load preview'}
                </strong>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                  {previewError === 'unavailable'
                    ? 'This file type cannot be previewed here. Use Download to view the original file.'
                    : previewError || 'This document cannot be displayed.'}
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownload(viewing)}
                  style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Download size={14} /> Download
                </button>
              </div>
            )}
          </div>

          {/* Document information */}
          <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem 1.25rem' }}>
            <Info label="Document Name" value={viewing.fileName || '—'} />
            <Info label="Category" value={categoryLabel(viewing)} />
            <Info label="Student Name" value={student.full_name || '—'} icon={<User size={13} />} />
            <Info label="Register Number" value={student.register_number || '—'} icon={<Hash size={13} />} />
            <Info label="Uploaded" value={formatDate(viewing.uploadedAt)} icon={<Calendar size={13} />} />
            <Info label="Uploaded By" value={viewing.uploadedByName || '—'} />
            <Info label="File Type" value={viewing.fileType || '—'} />
            <Info label="File Size" value={formatBytes(viewing.fileSize)} />
            {viewing.eventDate && <Info label="Event Date" value={formatDate(viewing.eventDate)} />}
            {(viewing.rejectionReason || (viewing.verificationStatus === 'Rejected' && viewing.permissions?.label)) && (
              <Info label="Rejection Note" value={viewing.rejectionReason || viewing.permissions?.label || '—'} />
            )}
          </div>

          {/* Actions */}
          <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-start' }}>
            <button
              className="btn btn-primary"
              onClick={() => handleDownload(viewing)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Download size={15} /> Download
            </button>
            <button className="btn btn-secondary" onClick={closeViewer}>
              Back to Document List
            </button>
            <button className="btn btn-secondary" onClick={onBack}>
              Back to Student Documents
            </button>
          </div>
        </div>
      ) : (
        /* ==================== DOCUMENT LIST ==================== */
        <div className="card" style={{ padding: 0 }}>
          {docs.length === 0 ? (
            <EmptyState
              compact
              icon={<FileCheck size={32} style={{ color: 'var(--color-slate-400)' }} />}
              title="No documents uploaded yet"
              description="This student has not uploaded any certificates or documents."
              action={
                <button className="btn btn-secondary btn-sm" onClick={onBack}>
                  Back to Student Documents
                </button>
              }
            />
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Category / Type</th>
                    <th>Verification</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.documentId || doc.id}>
                      <td>
                        <strong>{doc.title || doc.fileName}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{doc.fileName}</div>
                      </td>
                      <td>
                        {categoryLabel(doc)}
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)' }}>{formatBytes(doc.fileSize)}</div>
                      </td>
                      <td>
                        <RecordStatusBadge record={doc} />
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--color-slate-600)' }}>{formatDate(doc.uploadedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openViewer(doc)}
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleDownload(doc)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            <Download size={13} /> Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-slate-500)', letterSpacing: '0.4px', marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.9rem', color: 'var(--color-navy-800)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}