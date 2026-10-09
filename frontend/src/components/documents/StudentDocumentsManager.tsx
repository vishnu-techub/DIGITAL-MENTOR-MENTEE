import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { PageHeader } from '../common/PageHeader';
import { RecordStatusBadge, readPermissions } from '../../lib/recordStatus';
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
  ShieldCheck,
  Calendar,
  ExternalLink,
  Edit,
  Send,
  Lock,
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
  'Global Certification',
  'MOOC Certificate',
  'Internship Certificate',
  'Paper Presentation',
  'Symposium',
  'Symposium Certificate',
  'Technical Event',
  'Award',
  'Award Certificate',
  'Achievement',
  'Extension Activity',
  'Extra Curricular',
  'Other',
];

export const StudentDocumentsManager: React.FC<StudentDocumentsManagerProps> = ({
  studentId,
  readOnly = false,
  canVerify = false,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const isStudent = user?.role === 'STUDENT';
  const isAdmin = user?.role === 'ADMIN';

  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'FORM' | 'CERTIFICATES' | 'OTHER'>('ALL');

  // Delete all documents state (Admin only)
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    documentType: 'certificate' as 'certificate' | 'other',
    category: 'Workshop Certificate',
    eventName: '',
    organizer: '',
    eventDate: '',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Verification modal state
  const [selectedDocForVerify, setSelectedDocForVerify] = useState<any | null>(null);
  // The review decision offered here. APPROVED is the PENDING -> APPROVED step
  // that lets the student edit; VERIFIED is the SUBMITTED -> CONFIRMED step.
  const [verifyAction, setVerifyAction] = useState<'Approved' | 'Verified' | 'Rejected'>('Verified');
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Edit / resubmit a certificate. Saving is a draft; submitting is separate.
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Preview modal state.
  // The file is private, so we hold an authenticated Blob URL rather than the
  // stored `fileUrl` path (which is no longer publicly reachable).
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl((current) => {
      if (current) window.URL.revokeObjectURL(current);
      return null;
    });
    setPreviewIsPdf(false);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const openPreview = async (doc: any) => {
    setPreviewDoc(doc);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const { blob, mimeType } = await api.documents.fetchViewBlob(doc.documentId || doc.id);
      const objectUrl = window.URL.createObjectURL(blob);
      setPreviewIsPdf(
        mimeType.includes('pdf') || (doc.fileName || '').toLowerCase().endsWith('.pdf')
      );
      setPreviewUrl(objectUrl);
    } catch (err: any) {
      setPreviewError(
        err?.message || 'You are not authorised to preview this document, or the file is missing.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreviewInNewTab = () => {
    if (!previewUrl) return;
    const win = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Popup blocked: keep the user informed rather than failing silently.
      setPreviewError('Your browser blocked the new tab. Allow pop-ups to open the document.');
    }
  };

  const handleDownload = async (doc: any) => {
    try {
      await api.documents.download(doc.documentId || doc.id, doc.fileName);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download the document.');
    }
  };

  // Revoke the object URL if the component unmounts while a preview is open.
  useEffect(() => {
    return () => {
      setPreviewUrl((current) => {
        if (current) window.URL.revokeObjectURL(current);
        return null;
      });
    };
  }, []);

  const fetchDocuments = async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.documents.getByStudent(studentId);
      if (res.success && Array.isArray(res.data)) {
        // Enforce ordering: Student Details Form (isPrimary: true) is ALWAYS first.
        // Followed by certificates/other documents sorted newest first.
        const sorted = [...res.data].sort((a, b) => {
          if (a.isPrimary && !b.isPrimary) return -1;
          if (!a.isPrimary && b.isPrimary) return 1;
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        });
        setDocuments(sorted);
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
        setUploadErrorMsg('Invalid file format. Please upload PDF, JPG, JPEG, or PNG files only.');
        setSelectedFile(null);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setUploadErrorMsg('File size exceeds the 10 MB limit.');
        setSelectedFile(null);
        return;
      }

      if (file.size === 0) {
        setUploadErrorMsg('File is empty.');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      // Auto-populate title if empty
      if (!form.title.trim()) {
        const defaultName = file.name.replace(/\.[^/.]+$/, '');
        setForm((prev) => ({ ...prev, title: defaultName }));
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setUploadErrorMsg('Document Title / Certificate Name is required.');
      return;
    }
    if (!selectedFile) {
      setUploadErrorMsg('Please select a certificate or document file to upload.');
      return;
    }

    setUploading(true);
    setUploadProgress(25);
    setUploadErrorMsg(null);
    setUploadSuccessMsg(null);

    const formData = new FormData();
    formData.append('studentId', studentId);
    formData.append('title', form.title.trim());
    formData.append('documentType', form.documentType);
    formData.append('category', form.category);
    formData.append('eventName', form.eventName.trim());
    formData.append('organizer', form.organizer.trim());
    formData.append('eventDate', form.eventDate);
    formData.append('description', form.description.trim());
    formData.append('file', selectedFile);

    try {
      setUploadProgress(65);
      const res = await api.documents.upload(formData);
      setUploadProgress(100);

      if (res.success) {
        setUploadSuccessMsg('Certificate uploaded and attached to student profile successfully.');
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadSuccessMsg(null);
          setUploadProgress(0);
          setForm({
            title: '',
            documentType: 'certificate',
            category: 'Workshop Certificate',
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

  /** Open the edit form for a certificate in a student-editable state. */
  const handleOpenEdit = (doc: any) => {
    setEditingDoc({
      id: doc.id || doc._id,
      title: doc.title || '',
      category: doc.category || '',
      eventName: doc.eventName || '',
      organizer: doc.organizer || '',
      eventDate: doc.eventDate || '',
      description: doc.description || '',
    });
  };

  /**
   * Save the certificate. A save is a DRAFT: the backend keeps the record in an
   * editable state, and the student submits it separately. The certificate file
   * itself is immutable after upload and is not part of this form.
   */
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    if (!editingDoc.title.trim()) {
      toast.warning('Please provide a title for this certificate.');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await api.documents.update(editingDoc.id, {
        title: editingDoc.title,
        category: editingDoc.category,
        eventName: editingDoc.eventName,
        organizer: editingDoc.organizer,
        eventDate: editingDoc.eventDate,
        description: editingDoc.description,
      });
      if (res.success) {
        setEditingDoc(null);
        toast.success(res.message || 'Changes saved. Submit it when you are ready for review.');
        fetchDocuments();
      } else {
        toast.error(res.message || 'Failed to save the certificate.');
      }
    } catch (err: any) {
      toast.error('Failed to save the certificate: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  /** Submit an editable certificate to the mentor. Moves it to SUBMITTED. */
  const handleSubmitForReview = async (docId: string) => {
    try {
      const res = await api.documents.submit(docId);
      if (res.success) {
        toast.success(res.message || 'Submitted for mentor review.');
        fetchDocuments();
      } else {
        toast.error(res.message || 'Failed to submit the certificate.');
      }
    } catch (err: any) {
      toast.error('Failed to submit for review: ' + err.message);
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

  const handleDeleteAll = async () => {
    if (!studentId) return;
    setDeletingAll(true);
    try {
      const res = await api.documents.deleteAll(studentId);
      if (res.success) {
        toast.success(res.message || 'All student documents have been permanently deleted.');
        setShowDeleteAllModal(false);
        fetchDocuments();
      } else {
        toast.error(res.message || 'Failed to delete all documents.');
      }
    } catch (err: any) {
      toast.error('Failed to delete all documents: ' + err.message);
    } finally {
      setDeletingAll(false);
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
        toast.success(res.message || 'Review decision recorded.');
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

  // Filter logic
  const filteredDocs = documents.filter((d) => {
    const isForm = d.isPrimary || d.documentType === 'student_details_form';
    const isCert = !isForm && (d.documentType === 'certificate' || d.category?.includes('Certificate'));
    const isOther = !isForm && !isCert;

    if (activeFilter === 'FORM') return isForm;
    if (activeFilter === 'CERTIFICATES') return isCert;
    if (activeFilter === 'OTHER') return isOther;
    return true; // 'ALL'
  });

  const formCount = documents.filter((d) => d.isPrimary || d.documentType === 'student_details_form').length;
  const certCount = documents.filter((d) => !d.isPrimary && d.documentType !== 'student_details_form' && (d.documentType === 'certificate' || d.category?.includes('Certificate'))).length;
  const otherCount = documents.filter((d) => !d.isPrimary && d.documentType !== 'student_details_form' && !(d.documentType === 'certificate' || d.category?.includes('Certificate'))).length;

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Header Bar */}
      <PageHeader
        eyebrow="Student"
        title={isStudent ? 'My Documents' : 'Student Documents'}
        subtitle="Permanent student dossier: Student Details Form followed by all verified certificates and documents."
        actions={
          <>
            {isAdmin && documents.length > 0 && (
              <button
                type="button"
                className="btn btn-danger"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 700,
                  padding: '0.55rem 1.15rem',
                  borderRadius: '8px',
                }}
                onClick={() => setShowDeleteAllModal(true)}
              >
                <Trash2 size={16} /> Delete All Documents
              </button>
            )}

            {!readOnly && (
              <button
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  padding: '0.55rem 1.15rem',
                  borderRadius: '8px',
                }}
                onClick={() => setShowUploadModal(true)}
              >
                <Upload size={16} /> Upload Certificate
              </button>
            )}
          </>
        }
      />

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveFilter('ALL')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: activeFilter === 'ALL' ? 700 : 500,
            border: 'none',
            backgroundColor: activeFilter === 'ALL' ? '#0B2545' : '#F1F5F9',
            color: activeFilter === 'ALL' ? '#ffffff' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          All Documents ({documents.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('FORM')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: activeFilter === 'FORM' ? 700 : 500,
            border: 'none',
            backgroundColor: activeFilter === 'FORM' ? '#C59B27' : '#F1F5F9',
            color: activeFilter === 'FORM' ? '#ffffff' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Student Details Form ({formCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('CERTIFICATES')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: activeFilter === 'CERTIFICATES' ? 700 : 500,
            border: 'none',
            backgroundColor: activeFilter === 'CERTIFICATES' ? '#0B2545' : '#F1F5F9',
            color: activeFilter === 'CERTIFICATES' ? '#ffffff' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Certificates ({certCount})
        </button>

        {otherCount > 0 && (
          <button
            type="button"
            onClick={() => setActiveFilter('OTHER')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: activeFilter === 'OTHER' ? 700 : 500,
              border: 'none',
              backgroundColor: activeFilter === 'OTHER' ? '#0B2545' : '#F1F5F9',
              color: activeFilter === 'OTHER' ? '#ffffff' : '#475569',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Other Documents ({otherCount})
          </button>
        )}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
          Loading student documents...
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDocs.length === 0 && (
        <EmptyState
          compact
          icon={<Award size={26} aria-hidden="true" />}
          title={documents.length === 0 ? 'No documents uploaded' : 'No documents found in this section'}
          description={
            activeFilter === 'FORM'
              ? 'The Student Details Form PDF will automatically generate and attach here when the student submits or updates their profile details.'
              : isStudent
              ? 'Upload your symposium, hackathon, workshop, NPTEL, and internship certificates to maintain your institutional credentials.'
              : 'This student has not uploaded any certificates or documents yet.'
          }
          action={
            !readOnly && activeFilter !== 'FORM' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowUploadModal(true)}
              >
                <Upload size={16} aria-hidden="true" /> Upload Certificate
              </button>
            ) : undefined
          }
        />
      )}

      {/* Mobile-Responsive Document Cards (No wide table, no horizontal scrolling) */}
      {!loading && filteredDocs.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem',
            width: '100%',
          }}
        >
          {filteredDocs.map((doc, index) => {
            const isPrimaryForm = doc.isPrimary || doc.documentType === 'student_details_form';
            const isPdf = doc.fileType?.includes('pdf') || doc.fileName?.toLowerCase().endsWith('.pdf');
            // Authoritative capabilities from the API. Every action button below
            // is gated on these, never on the role alone.
            const perms = readPermissions(doc);
            const state = perms?.state;
            const isVerified = isPrimaryForm || state === 'Verified';
            const isRejected = state === 'Rejected';

            // Document type display text
            const docTypeLabel = isPrimaryForm
              ? 'Student Details'
              : doc.documentType === 'certificate' || doc.category?.includes('Certificate')
              ? 'Certificate'
              : 'Other Document';

            const formattedDate = doc.uploadedAt
              ? new Date(doc.uploadedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'N/A';

            return (
              <div
                key={doc.id || doc._id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                  border: isPrimaryForm
                    ? '2px solid #C59B27'
                    : '1px solid #E2E8F0',
                  borderLeft: isPrimaryForm
                    ? '6px solid #C59B27'
                    : isVerified
                    ? '6px solid #10B981'
                    : isRejected
                    ? '6px solid #EF4444'
                    : '6px solid #F59E0B',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div>
                  {/* Top Row: Index Badge & Document Type Badge */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.75rem',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          backgroundColor: isPrimaryForm ? '#FEF3C7' : '#F1F5F9',
                          color: isPrimaryForm ? '#92400E' : '#475569',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        #{index + 1}
                      </span>

                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: isPrimaryForm ? '#0B2545' : '#EFF6FF',
                          color: isPrimaryForm ? '#FFFFFF' : '#1D4ED8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {isPrimaryForm && <ShieldCheck size={12} color="var(--gold-400)" aria-hidden="true" />}
                        Type: {docTypeLabel}
                      </span>
                    </div>

                    {/* Verification Status Badge */}
                    {isPrimaryForm ? (
                      <span
                        className="badge badge-success"
                        style={{ fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        title="System-maintained Student Details Form. It is generated from the student profile and is not an uploaded certificate."
                      >
                        <CheckCircle size={12} aria-hidden="true" /> Official
                      </span>
                    ) : (
                      <RecordStatusBadge record={doc} />
                    )}
                  </div>

                  {/* Document Name / Title */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '4px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: isPdf ? '#FEF2F2' : '#EFF6FF',
                        color: isPdf ? '#DC2626' : '#2563EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <FileText size={20} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: '#0B2545',
                          margin: 0,
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        {doc.fileName || doc.title}
                      </h4>

                      {doc.title && doc.title !== doc.fileName && (
                        <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px', wordBreak: 'break-word' }}>
                          {doc.title}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata: Uploaded Date, Category, Event Info */}
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#475569',
                      marginTop: '0.75rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px dashed #F1F5F9',
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B' }}>
                      <Calendar size={13} aria-hidden="true" />
                      <span>
                        Uploaded: <strong>{formattedDate}</strong>
                      </span>
                      {doc.fileSize ? (
                        <span>• {Math.round(doc.fileSize / 1024)} KB</span>
                      ) : null}
                    </div>

                    {!isPrimaryForm && doc.category && doc.category !== 'Other' && (
                      <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#C59B27', fontWeight: 600 }}>
                        Category: {doc.category}
                      </div>
                    )}

                    {!isPrimaryForm && doc.eventName && (
                      <div style={{ marginTop: '2px', fontSize: '0.75rem' }}>
                        Event: <strong>{doc.eventName}</strong>
                      </div>
                    )}

                    {!isPrimaryForm && doc.organizer && (
                      <div style={{ marginTop: '2px', fontSize: '0.75rem' }}>
                        Organizer: {doc.organizer}
                      </div>
                    )}

                    {/* Rejection Note */}
                    {isRejected && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '6px 8px',
                          backgroundColor: '#FEF2F2',
                          border: '1px solid #FCA5A5',
                          borderRadius: '6px',
                          color: '#991B1B',
                          fontSize: '0.75rem',
                        }}
                      >
                        <strong>Rejection Reason:</strong> {doc.rejectionReason || 'Requires revision.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer: View and Download buttons */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #F1F5F9',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                      onClick={() => openPreview(doc)}
                    >
                      <Eye size={13} /> View
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                      onClick={() => handleDownload(doc)}
                    >
                      <Download size={13} /> Download
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {/* Mentor review. Gated on the server's canReview /
                        canConfirm, so the two-stage approval and confirmation
                        flow is driven by the backend, not by guessing. */}
                    {perms?.canReview && !isPrimaryForm && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                        title={
                          perms.canConfirm
                            ? 'Confirm this submitted record as an official verified entry'
                            : 'Review this request'
                        }
                        onClick={() => {
                          setSelectedDocForVerify(doc);
                          setVerifyAction(perms.canConfirm ? 'Verified' : 'Approved');
                          setRejectionReason(doc.rejectionReason || '');
                        }}
                      >
                        <FileCheck size={13} /> {perms.canConfirm ? 'Confirm' : 'Review'}
                      </button>
                    )}

                    {/* Student edit + submit, only from a student-editable state. */}
                    {perms?.canEdit && !isPrimaryForm && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        title={
                          state === 'Editing'
                            ? 'Continue editing this certificate'
                            : state === 'Rejected'
                            ? 'Edit the changes your mentor requested'
                            : 'Edit this certificate'
                        }
                        style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                        onClick={() => handleOpenEdit(doc)}
                      >
                        <Edit size={13} />
                        {state === 'Editing'
                          ? 'Continue Editing'
                          : state === 'Rejected'
                          ? 'Edit & Resubmit'
                          : 'Edit'}
                      </button>
                    )}

                    {perms?.canSubmit && !isPrimaryForm && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                        title={
                          state === 'Rejected'
                            ? 'Resubmit this certificate to your mentor'
                            : 'Submit this certificate to your mentor for review'
                        }
                        onClick={() => handleSubmitForReview(doc.id || doc._id)}
                      >
                        <Send size={13} />
                        {state === 'Rejected' ? 'Resubmit' : 'Submit'}
                      </button>
                    )}

                    {/* Read-only states show the reason instead of a dead button. */}
                    {!perms?.canEdit && perms?.reason && !isPrimaryForm && (
                      <span className="unavailable-action" title={perms.explanation}>
                        <Lock size={13} aria-hidden="true" />
                        {perms.reason}
                      </span>
                    )}

                    {/* Delete Certificate. Gated on the server's canDelete, so a
                        read-only or confirmed record can never show a working
                        delete control. */}
                    {perms?.canDelete && !isPrimaryForm && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        title="Delete Document"
                        style={{ padding: '5px 8px' }}
                        onClick={() => handleDelete(doc.id || doc._id, doc.fileName || doc.title)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UPLOAD CERTIFICATE MODAL */}
      <Modal
        isOpen={showUploadModal}
        title="Upload Student Certificate"
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
              Certificate Title / Name <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Python Programming Certificate, Hackathon Certificate"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid-cols-2">
            <div className="form-group">
              <label className="form-label">
                Document Type <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select
                className="form-control"
                value={form.documentType}
                onChange={(e) =>
                  setForm({ ...form, documentType: e.target.value as 'certificate' | 'other' })
                }
              >
                <option value="certificate">Certificate</option>
                <option value="other">Other Document</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
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
          </div>

          <div className="grid-cols-2">
            <div className="form-group">
              <label className="form-label">Event Name (Optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. National Level Hackathon 2026"
                value={form.eventName}
                onChange={(e) => setForm({ ...form, eventName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Organizing Body / Issuer (Optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. IIT Madras, NPTEL, KSRCE"
                value={form.organizer}
                onChange={(e) => setForm({ ...form, organizer: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Event / Issue Date (Optional)</label>
            <input
              type="date"
              className="form-control"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description / Remarks (Optional)</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Brief details about the certificate or achievement..."
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
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '4px', fontWeight: 600 }}>
                Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
              </div>
            )}
          </div>

          {uploading && (
            <div style={{ margin: '1rem 0' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: '#64748B',
                  marginBottom: '4px',
                }}
              >
                <span>Attaching document to student profile...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#E2E8F0',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
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
              {uploading ? 'Uploading...' : 'Upload Certificate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* VERIFY / REJECT MODAL (For Mentor / Faculty) */}
      {selectedDocForVerify && (() => {
        // Which decisions are legal is a backend fact, read from the record's
        // own permission payload. Only a SUBMITTED record can be confirmed; only
        // a PENDING or REJECTED one can be approved for further editing.
        const sel = readPermissions(selectedDocForVerify);
        const canConfirmSelected = !!sel?.canConfirm;
        const canApproveSelected = sel?.state === 'Pending' || sel?.state === 'Rejected';
        return (
        <Modal
          isOpen={!!selectedDocForVerify}
          title={`Review Certificate: ${selectedDocForVerify.fileName || selectedDocForVerify.title}`}
          onClose={() => setSelectedDocForVerify(null)}
        >
          <form onSubmit={handleVerifySubmit}>
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
              <div>File: <strong>{selectedDocForVerify.fileName}</strong></div>
              <div>Category: <strong>{selectedDocForVerify.category}</strong></div>
              {selectedDocForVerify.eventName && <div>Event: <strong>{selectedDocForVerify.eventName}</strong></div>}
            </div>

            <div className="form-group">
              <label className="form-label">Review Decision</label>
              {/* The available decisions come from the server. A PENDING record
                  can only be approved or rejected; only a SUBMITTED record can
                  be confirmed to the terminal verified state. */}
              {canConfirmSelected && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="verifyAction"
                    value="Verified"
                    checked={verifyAction === 'Verified'}
                    onChange={() => setVerifyAction('Verified')}
                  />
                  <span style={{ color: '#059669', fontWeight: 600 }}>
                    Confirm — make this an official verified record
                  </span>
                </label>
              )}
              {canApproveSelected && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="verifyAction"
                    value="Approved"
                    checked={verifyAction === 'Approved'}
                    onChange={() => setVerifyAction('Approved')}
                  />
                  <span style={{ color: '#1D4ED8', fontWeight: 600 }}>
                    Approve — let the student edit and submit
                  </span>
                </label>
              )}
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
                className={`btn ${
                  verifyAction === 'Rejected'
                    ? 'btn-danger'
                    : verifyAction === 'Approved'
                    ? 'btn-primary'
                    : 'btn-success'
                }`}
                disabled={verifying}
              >
                {verifying
                  ? 'Saving...'
                  : verifyAction === 'Rejected'
                  ? 'Send Back for Changes'
                  : verifyAction === 'Approved'
                  ? 'Approve Request'
                  : 'Confirm as Verified'}
              </button>
            </div>
          </form>
        </Modal>
        );
      })()}

      {/* EDIT / RESUBMIT MODAL (student, editable states only) */}
      {editingDoc && (
        <Modal
          isOpen={!!editingDoc}
          title="Edit Certificate Details"
          onClose={() => !savingEdit && setEditingDoc(null)}
        >
          <form onSubmit={handleSaveEdit}>
            <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.6 }}>
              Correct the details below, then save. Saving keeps this record editable; use
              <strong> Submit</strong> afterwards to send it to your mentor for review. The
              certificate file itself cannot be changed after upload.
            </p>

            <div className="form-group">
              <label className="form-label">Title <span style={{ color: '#DC2626' }}>*</span></label>
              <input
                type="text"
                className="form-control"
                required
                value={editingDoc.title}
                onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <input
                type="text"
                className="form-control"
                value={editingDoc.category}
                onChange={(e) => setEditingDoc({ ...editingDoc, category: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Event Name</label>
              <input
                type="text"
                className="form-control"
                value={editingDoc.eventName}
                onChange={(e) => setEditingDoc({ ...editingDoc, eventName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Organizer</label>
              <input
                type="text"
                className="form-control"
                value={editingDoc.organizer}
                onChange={(e) => setEditingDoc({ ...editingDoc, organizer: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Event Date</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 12-08-2026"
                value={editingDoc.eventDate}
                onChange={(e) => setEditingDoc({ ...editingDoc, eventDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows={3}
                value={editingDoc.description}
                onChange={(e) => setEditingDoc({ ...editingDoc, description: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={savingEdit}
                onClick={() => setEditingDoc(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PREVIEW MODAL
          Certificates are private: the server no longer serves a public /uploads
          mount, so the file is fetched WITH the bearer token and displayed from
          a Blob URL. The object URL is revoked when the modal closes. */}
      {previewDoc && (
        <Modal
          isOpen={!!previewDoc}
          title={previewDoc.fileName || previewDoc.title}
          onClose={closePreview}
        >
          <div style={{ minHeight: '350px', maxHeight: '72vh', overflowY: 'auto', textAlign: 'center' }}>
            {previewLoading && (
              <div style={{ padding: '3rem 1rem' }}>
                <div className="skeleton" style={{ height: 300, borderRadius: '6px' }} />
                <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Loading secure preview…
                </p>
              </div>
            )}

            {!previewLoading && previewError && (
              <div style={{ padding: '2.5rem 1rem' }}>
                <AlertTriangle size={30} style={{ color: '#DC2626', marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: 600 }}>{previewError}</p>
              </div>
            )}

            {!previewLoading && !previewError && previewUrl && previewIsPdf && (
              <iframe
                src={previewUrl}
                title={previewDoc.fileName || previewDoc.title}
                style={{ width: '100%', height: '520px', border: 'none', borderRadius: '6px' }}
              />
            )}

            {!previewLoading && !previewError && previewUrl && !previewIsPdf && (
              <img
                src={previewUrl}
                alt={previewDoc.fileName || previewDoc.title}
                style={{ maxWidth: '100%', maxHeight: '520px', objectFit: 'contain', borderRadius: '6px' }}
              />
            )}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: previewDoc.isPrimary ? '#C59B27' : '#2563EB',
              }}
            >
              {previewDoc.isPrimary ? 'Official Student Details Form' : previewDoc.category}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={openPreviewInNewTab}
                disabled={!previewUrl}
              >
                <ExternalLink size={13} /> Open in New Tab
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => handleDownload(previewDoc)}
              >
                <Download size={13} /> Download File
              </button>
              <button className="btn btn-secondary btn-sm" onClick={closePreview}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE ALL CONFIRMATION MODAL (Admin only) */}
      {showDeleteAllModal && (
        <Modal
          isOpen={showDeleteAllModal}
          title="Confirm Permanent Deletion of All Documents"
          onClose={() => {
            if (!deletingAll) setShowDeleteAllModal(false);
          }}
        >
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#DC2626', marginBottom: '1rem' }}>
              <AlertTriangle size={24} />
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Permanent Deletion Warning
              </h4>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5, margin: '0 0 0.75rem 0' }}>
              Are you sure you want to permanently delete <strong>ALL</strong> uploaded documents and certificates for this student?
              This will remove all document records from MongoDB and permanently delete all physical files from disk.
              This action cannot be undone.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '1.25rem',
                fontSize: '0.8rem',
                color: '#92400E',
                lineHeight: 1.45,
              }}
            >
              <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                The system-generated <strong>Student Details Form</strong> is{' '}
                <strong>retained</strong> and cannot be deleted. Every other document and
                certificate, including its physical file, will be permanently removed.
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={deletingAll}
                onClick={() => setShowDeleteAllModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deletingAll}
                onClick={handleDeleteAll}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={14} />
                {deletingAll ? 'Deleting All Documents...' : 'Delete All'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
