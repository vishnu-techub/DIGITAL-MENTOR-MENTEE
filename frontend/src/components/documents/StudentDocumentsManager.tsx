import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import {
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Award,
  Filter,
  FileCheck,
} from 'lucide-react';

interface StudentDocumentsManagerProps {
  studentId: string;
  readOnly?: boolean;
  canVerify?: boolean;
}

const DOCUMENT_CATEGORIES = [
  'Event Certificate',
  'Workshop Certificate',
  'Hackathon Certificate',
  'SIH Certificate',
  'NPTEL Certificate',
  'MOOC Certificate',
  'Internship Certificate',
  'Paper Presentation',
  'Symposium',
  'Technical Event',
  'Award',
  'Achievement',
  'Other',
];

export const StudentDocumentsManager: React.FC<StudentDocumentsManagerProps> = ({
  studentId,
  readOnly = false,
  canVerify = false,
}) => {
  const toast = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    category: 'Event Certificate',
    eventName: '',
    organizer: '',
    eventDate: '',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Verification modal state
  const [selectedDocForVerify, setSelectedDocForVerify] = useState<any | null>(null);
  const [verifyAction, setVerifyAction] = useState<'Verified' | 'Rejected'>('Verified');
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Preview modal state
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  const fetchDocuments = async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.documents.getByStudent(studentId);
      if (res.success) {
        setDocuments(res.data);
      } else {
        setError(res.message || 'Failed to load documents.');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching student certificates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [studentId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadErrorMsg(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

      if (!validTypes.includes(file.type)) {
        setUploadErrorMsg('Invalid file format. Only PDF, JPG, JPEG, and PNG files are allowed.');
        setSelectedFile(null);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setUploadErrorMsg('File size exceeds the 10 MB institutional limit.');
        setSelectedFile(null);
        return;
      }

      if (file.size === 0) {
        setUploadErrorMsg('File is empty.');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setUploadErrorMsg('Document Title is required.');
      return;
    }
    if (!selectedFile) {
      setUploadErrorMsg('Please select a certificate/document file to upload.');
      return;
    }

    setUploading(true);
    setUploadProgress(20);
    setUploadErrorMsg(null);
    setUploadSuccessMsg(null);

    const formData = new FormData();
    formData.append('studentId', studentId);
    formData.append('title', form.title.trim());
    formData.append('category', form.category);
    formData.append('eventName', form.eventName.trim());
    formData.append('organizer', form.organizer.trim());
    formData.append('eventDate', form.eventDate);
    formData.append('description', form.description.trim());
    formData.append('file', selectedFile);

    try {
      setUploadProgress(60);
      const res = await api.documents.upload(formData);
      setUploadProgress(100);

      if (res.success) {
        setUploadSuccessMsg('Document uploaded successfully.');
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadSuccessMsg(null);
          setUploadProgress(0);
          setForm({
            title: '',
            category: 'Event Certificate',
            eventName: '',
            organizer: '',
            eventDate: '',
            description: '',
          });
          setSelectedFile(null);
          fetchDocuments();
        }, 1200);
      } else {
        setUploadErrorMsg(res.message || 'Upload failed.');
      }
    } catch (err: any) {
      setUploadErrorMsg(err.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${title}"?`)) return;

    try {
      const res = await api.documents.delete(docId);
      if (res.success) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId && d._id !== docId));
        toast.success('Document deleted successfully.');
      } else {
        toast.error(res.message || 'Failed to delete document.');
      }
    } catch (err: any) {
      toast.error('Error deleting document: ' + err.message);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForVerify) return;

    if (verifyAction === 'Rejected' && !rejectionReason.trim()) {
      toast.warning('Please provide a reason for rejecting this document.');
      return;
    }

    setVerifying(true);
    try {
      const res = await api.documents.verify(selectedDocForVerify.id || selectedDocForVerify._id, {
        verificationStatus: verifyAction,
        rejectionReason: verifyAction === 'Rejected' ? rejectionReason.trim() : '',
      });

      if (res.success) {
        setSelectedDocForVerify(null);
        setRejectionReason('');
        toast.success('Document verification status updated.');
        fetchDocuments();
      } else {
        toast.error(res.message || 'Verification update failed.');
      }
    } catch (err: any) {
      toast.error('Error during verification: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const filteredDocs = documents.filter((d) => {
    if (selectedCategory === 'ALL') return true;
    return d.category === selectedCategory;
  });

  return (
    <div>
      {/* Header Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={16} /> Filter Category:
          </div>
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: '200px', fontSize: '0.85rem' }}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">All Categories ({documents.length})</option>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({documents.filter((d) => d.category === cat).length})
              </option>
            ))}
          </select>
        </div>

        {!readOnly && (
          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            <Upload size={16} /> Upload Document / Certificate
          </button>
        )}
      </div>

      {/* Loading & Error */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
          Loading uploaded certificates...
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDocs.length === 0 && (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '3.5rem 1.5rem',
            border: '2px dashed #CBD5E1',
            backgroundColor: '#F8FAFC',
          }}
        >
          <Award size={48} style={{ color: '#94A3B8', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.25rem' }}>
            No documents uploaded yet.
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', margin: '0 auto 1.25rem' }}>
            {readOnly
              ? 'This mentee has not uploaded any co-curricular certificates or technical achievements yet.'
              : 'Upload your symposium, hackathon, workshop, NPTEL, and internship certificates to maintain your institutional credentials.'}
          </p>
          {!readOnly && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowUploadModal(true)}>
              <Upload size={14} /> Upload First Document
            </button>
          )}
        </div>
      )}

      {/* Documents Grid / Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {filteredDocs.map((doc) => {
          const isPdf = doc.fileType?.includes('pdf') || doc.fileName?.toLowerCase().endsWith('.pdf');
          const isVerified = doc.verificationStatus === 'Verified';
          const isRejected = doc.verificationStatus === 'Rejected';

          return (
            <div
              key={doc.id || doc._id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: isVerified
                  ? '4px solid #10B981'
                  : isRejected
                  ? '4px solid #EF4444'
                  : '4px solid #F59E0B',
              }}
            >
              <div>
                {/* Header: Type icon + Status Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: isPdf ? '#FEF2F2' : '#EFF6FF',
                        color: isPdf ? '#DC2626' : '#2563EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FileText size={20} />
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: '#C59B27',
                        }}
                      >
                        {doc.category}
                      </span>
                      <h4
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: '#0B2545',
                          margin: 0,
                          lineHeight: 1.3,
                        }}
                      >
                        {doc.title}
                      </h4>
                    </div>
                  </div>

                  <span
                    className={`badge ${
                      isVerified
                        ? 'badge-success'
                        : isRejected
                        ? 'badge-danger'
                        : 'badge-warning'
                    }`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {isVerified && <CheckCircle size={12} />}
                    {isRejected && <XCircle size={12} />}
                    {!isVerified && !isRejected && <Clock size={12} />}
                    {doc.verificationStatus}
                  </span>
                </div>

                {/* Event & Organizer details */}
                <div style={{ fontSize: '0.825rem', color: '#475569', lineHeight: 1.6, marginTop: '0.5rem' }}>
                  {doc.eventName && (
                    <div>
                      Event: <strong>{doc.eventName}</strong>
                    </div>
                  )}
                  {doc.organizer && (
                    <div>
                      Organizer: <strong>{doc.organizer}</strong>
                    </div>
                  )}
                  {doc.eventDate && (
                    <div>
                      Event Date: <strong>{doc.eventDate}</strong>
                    </div>
                  )}
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginTop: '4px' }}>
                    Uploaded: {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} • {Math.round((doc.fileSize || 0) / 1024)} KB
                  </div>

                  {doc.description && (
                    <p style={{ fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic', marginTop: '6px' }}>
                      "{doc.description}"
                    </p>
                  )}

                  {/* Rejection Alert */}
                  {isRejected && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 8px',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '4px',
                        color: '#991B1B',
                        fontSize: '0.75rem',
                      }}
                    >
                      <strong>Rejection Note:</strong> {doc.rejectionReason || 'Requires re-submission.'}
                      {doc.rejectedByName && (
                        <div style={{ fontSize: '0.7rem', color: '#B91C1C', marginTop: '2px' }}>
                          Reviewed by {doc.rejectedByName}
                        </div>
                      )}
                    </div>
                  )}

                  {isVerified && doc.rejectedByName && (
                    <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '4px' }}>
                      ✓ Endorsed by {doc.rejectedByName}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #F1F5F9',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    title="View Document"
                    onClick={() => setPreviewDoc(doc)}
                  >
                    <Eye size={14} /> View
                  </button>

                  <a
                    href={doc.fileUrl}
                    download={doc.fileName}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-outline"
                    title="Download File"
                  >
                    <Download size={14} /> Download
                  </a>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {canVerify && (
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                      onClick={() => {
                        setSelectedDocForVerify(doc);
                        setVerifyAction('Verified');
                        setRejectionReason(doc.rejectionReason || '');
                      }}
                    >
                      <FileCheck size={14} /> Review
                    </button>
                  )}

                  {!readOnly && (
                    <button
                      className="btn btn-sm btn-danger"
                      title="Delete Certificate"
                      onClick={() => handleDelete(doc.id || doc._id, doc.title)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* UPLOAD DOCUMENT MODAL */}
      <Modal
        isOpen={showUploadModal}
        title="Upload Student Certificate / Document"
        onClose={() => {
          if (!uploading) setShowUploadModal(false);
        }}
      >
        <form onSubmit={handleUploadSubmit}>
          {uploadSuccessMsg && (
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              ✓ {uploadSuccessMsg}
            </div>
          )}

          {uploadErrorMsg && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              ✗ {uploadErrorMsg}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Document Title <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Winner - Smart India Hackathon 2026"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid-cols-2">
            <div className="form-group">
              <label className="form-label">
                Category <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select
                className="form-control"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Event Date</label>
              <input
                type="date"
                className="form-control"
                value={form.eventDate}
                onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid-cols-2">
            <div className="form-group">
              <label className="form-label">Event Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. National Level Technical Symposium"
                value={form.eventName}
                onChange={(e) => setForm({ ...form, eventName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Organizing Institution / Agency</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. IIT Madras / AICTE / KSRCE"
                value={form.organizer}
                onChange={(e) => setForm({ ...form, organizer: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Brief Description / Project Title</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Provide brief context of achievement or topic presented..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Select Certificate File (PDF, JPG, JPEG, PNG • Max 10MB) <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              type="file"
              className="form-control"
              accept=".pdf,.jpg,.jpeg,.png"
              required
              onChange={handleFileChange}
            />
            {selectedFile && (
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '4px' }}>
                Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
              </div>
            )}
          </div>

          {uploading && (
            <div style={{ margin: '1rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>
                <span>Uploading file...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    backgroundColor: '#C59B27',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={uploading}
              onClick={() => setShowUploadModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </form>
      </Modal>

      {/* VERIFY / REJECT MODAL (For Mentor / HOD / Admin) */}
      {selectedDocForVerify && (
        <Modal
          isOpen={!!selectedDocForVerify}
          title={`Review Certificate: ${selectedDocForVerify.title}`}
          onClose={() => setSelectedDocForVerify(null)}
        >
          <form onSubmit={handleVerifySubmit}>
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
              <div>Category: <strong>{selectedDocForVerify.category}</strong></div>
              <div>Event: <strong>{selectedDocForVerify.eventName || 'N/A'}</strong></div>
              <div>Organizer: <strong>{selectedDocForVerify.organizer || 'N/A'}</strong></div>
              <div>File: <strong>{selectedDocForVerify.fileName}</strong></div>
            </div>

            <div className="form-group">
              <label className="form-label">Review Decision</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="verifyAction"
                    value="Verified"
                    checked={verifyAction === 'Verified'}
                    onChange={() => setVerifyAction('Verified')}
                  />
                  <span style={{ color: '#059669', fontWeight: 600 }}>Verify & Endorse</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="verifyAction"
                    value="Rejected"
                    checked={verifyAction === 'Rejected'}
                    onChange={() => setVerifyAction('Rejected')}
                  />
                  <span style={{ color: '#DC2626', fontWeight: 600 }}>Reject with Reason</span>
                </label>
              </div>
            </div>

            {verifyAction === 'Rejected' && (
              <div className="form-group">
                <label className="form-label">
                  Rejection Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  required
                  placeholder="Explain why the certificate was rejected (e.g. illegible scan, invalid date, wrong event name)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={verifying}
                onClick={() => setSelectedDocForVerify(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${verifyAction === 'Verified' ? 'btn-success' : 'btn-danger'}`}
                disabled={verifying}
              >
                {verifying ? 'Saving...' : `Confirm ${verifyAction}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PREVIEW MODAL */}
      {previewDoc && (
        <Modal
          isOpen={!!previewDoc}
          title={previewDoc.title}
          onClose={() => setPreviewDoc(null)}
        >
          <div style={{ minHeight: '350px', maxHeight: '70vh', overflowY: 'auto', textAlign: 'center' }}>
            {previewDoc.fileType?.includes('pdf') || previewDoc.fileName?.toLowerCase().endsWith('.pdf') ? (
              <iframe
                src={previewDoc.fileUrl}
                title={previewDoc.title}
                style={{ width: '100%', height: '500px', border: 'none', borderRadius: '4px' }}
              />
            ) : (
              <img
                src={previewDoc.fileUrl}
                alt={previewDoc.title}
                style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain', borderRadius: '4px' }}
              />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <span className="badge badge-primary">{previewDoc.category}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a
                href={previewDoc.fileUrl}
                download={previewDoc.fileName}
                className="btn btn-primary btn-sm"
              >
                <Download size={14} /> Download File
              </a>
              <button className="btn btn-secondary btn-sm" onClick={() => setPreviewDoc(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
