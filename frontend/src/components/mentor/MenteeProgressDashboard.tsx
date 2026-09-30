import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Download,
  Filter,
  ExternalLink,
  Calendar,
  Building,
  Layers,
  Sparkles,
  FileCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface MenteeProgressDashboardProps {
  studentId: string;
  studentName?: string;
}

const CATEGORIES = [
  'Event Certificate',
  'NPTEL Certificate',
  'Global Certification',
  'Hackathon Certificate',
  'Symposium Certificate',
  'Award Certificate',
  'Program attended in other state',
  'Extension Activity',
  'Extra Curricular',
  'Other approved achievements/activities',
];

export const MenteeProgressDashboard: React.FC<MenteeProgressDashboardProps> = ({
  studentId,
  studentName,
}) => {
  const toast = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    eventCertificates: 0,
    nptelCertificates: 0,
    globalCertificates: 0,
    hackathons: 0,
    symposiums: 0,
    awards: 0,
    totalRecords: 0,
    pendingVerification: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Verification modal state
  const [verifyTarget, setVerifyTarget] = useState<any | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'Verified' | 'Rejected'>('Verified');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingVerify, setSubmittingVerify] = useState(false);

  // Preview modal state
  const [previewFile, setPreviewFile] = useState<{ url: string; title: string; type: string } | null>(null);

  const fetchProgress = async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await api.studentProgress.getMenteeProgress(studentId);
      if (res.success && res.data) {
        setRecords(res.data.records || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
      }
    } catch (err: any) {
      console.error('Failed to load mentee progress records:', err);
      toast.error('Unable to fetch mentee progress records: ' + (err.message || 'Server error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, [studentId]);

  const handleOpenVerifyModal = (record: any, status: 'Verified' | 'Rejected') => {
    setVerifyTarget(record);
    setVerifyStatus(status);
    setRejectionReason('');
  };

  const handleConfirmVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTarget) return;

    if (verifyStatus === 'Rejected' && !rejectionReason.trim()) {
      toast.error('Please specify a valid rejection reason.');
      return;
    }

    setSubmittingVerify(true);
    try {
      const res = await api.studentProgress.verifyMenteeProgress(
        studentId,
        verifyTarget._id || verifyTarget.id,
        verifyStatus,
        verifyStatus === 'Rejected' ? rejectionReason : undefined,
        verifyTarget.source
      );

      if (res.success) {
        toast.success(`Achievement marked as ${verifyStatus} successfully.`);
        setVerifyTarget(null);
        await fetchProgress();
      } else {
        toast.error(res.message || 'Verification update failed.');
      }
    } catch (err: any) {
      toast.error('Failed to update verification status: ' + err.message);
    } finally {
      setSubmittingVerify(false);
    }
  };

  const getFullFileUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  // Filter records
  const filteredRecords = records.filter((r) => {
    const matchCat = selectedCategory === 'ALL' || r.category === selectedCategory;
    const matchStat = selectedStatus === 'ALL' || r.status === selectedStatus;
    return matchCat && matchStat;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ============================================================
          1. STATS OVERVIEW CARDS (Per Section 5 of Prompt)
          ============================================================ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          className="card"
          style={{
            padding: '1.15rem 1.25rem',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: '4px solid #2563EB',
            borderRadius: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Event Certificates
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
            {summary.eventCertificates || 0}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1.15rem 1.25rem',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: '4px solid #059669',
            borderRadius: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            NPTEL Certificates
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
            {summary.nptelCertificates || 0}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1.15rem 1.25rem',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: '4px solid #7C3AED',
            borderRadius: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Global Certifications
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
            {summary.globalCertificates || 0}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1.15rem 1.25rem',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: '4px solid #D97706',
            borderRadius: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Hackathons
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
            {summary.hackathons || 0}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1.15rem 1.25rem',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: '4px solid #0284C7',
            borderRadius: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Symposiums
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
            {summary.symposiums || 0}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1.15rem 1.25rem',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: '4px solid #E11D48',
            borderRadius: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Awards
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>
            {summary.awards || 0}
          </div>
        </div>
      </div>

      {/* ============================================================
          2. CONTROLS BAR: CATEGORY & STATUS FILTERS
          ============================================================ */}
      <div
        className="card"
        style={{
          padding: '1.25rem',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              Student Progress & Certificate Verifications
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0 0' }}>
              Every certificate uploaded under Student Documents and every achievement submitted under Student
              Progress is listed here as one review queue. Nothing is copied or duplicated: a certificate that exists
              in both places is shown once.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchProgress}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Data
          </button>
        </div>

        {/* Filter Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginRight: '0.5rem' }}>
            Filter Category:
          </span>
          <button
            type="button"
            className={`btn btn-sm ${selectedCategory === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedCategory('ALL')}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
          >
            All Categories ({records.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = records.filter((r) => r.category === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedCategory(cat)}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginRight: '0.5rem' }}>
            Filter Status:
          </span>
          {['ALL', 'Pending', 'Verified', 'Rejected'].map((status) => {
            const count = status === 'ALL' ? records.length : records.filter((r) => r.status === status).length;
            return (
              <button
                key={status}
                type="button"
                className={`btn btn-sm ${selectedStatus === status ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedStatus(status)}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
              >
                {status} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          3. RECORDS LIST
          ============================================================ */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
          Loading mentee progress records...
        </div>
      ) : filteredRecords.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px dashed #CBD5E1',
          }}
        >
          <Award size={44} color="#94A3B8" style={{ margin: '0 auto 0.75rem auto' }} />
          <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B2545', margin: '0 0 0.5rem 0' }}>
            No Progress Records Found
          </h4>
          <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
            {selectedCategory !== 'ALL' || selectedStatus !== 'ALL'
              ? 'No achievements match the current filters. Try selecting All Categories or All Status.'
              : `${studentName || 'The mentee'} has not submitted any achievements or certificates yet.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredRecords.map((r) => {
                    const isVerified = r.status === 'Verified';
                    const isRejected = r.status === 'Rejected';
                    const isPending = !isVerified && !isRejected;
                    // A mentor-confirmed record is permanently locked. The
                    // backend rejects any attempt to reopen it with HTTP 409, so
                    // the buttons are removed here to match that behaviour
                    // rather than offering a control that would only fail.
                    const isLocked = isVerified;
                    const key = `${r.source || 'RECORD'}-${r._id || r.id}`;

                    return (
                      <div
                        key={key}
                className="card"
                style={{
                  padding: '1.35rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 6px rgba(11, 37, 69, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: isVerified
                    ? '4px solid #16A34A'
                    : isRejected
                    ? '4px solid #DC2626'
                    : '4px solid #D97706',
                }}
              >
                <div>
                  {/* Top Bar: Category & Status */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: '#2563EB',
                        backgroundColor: '#EFF6FF',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #BFDBFE',
                      }}
                      title={
                        r.source === 'DOCUMENT'
                          ? 'Uploaded through Student Documents'
                          : 'Submitted through Student Progress'
                      }
                    >
                      {r.rawCategory && r.rawCategory !== r.category ? `${r.category} · ${r.rawCategory}` : r.category}
                    </span>

                    <span
                      className={`badge ${
                        isVerified ? 'badge-success' : isRejected ? 'badge-danger' : 'badge-warning'
                      }`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {isVerified && <CheckCircle2 size={12} />}
                      {isRejected && <XCircle size={12} />}
                      {isPending && <Clock size={12} />}
                      {r.status || 'Pending'}
                    </span>
                  </div>

                  {/* Title */}
                  <h4
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      color: '#0B2545',
                      margin: '0 0 0.5rem 0',
                      lineHeight: 1.3,
                    }}
                  >
                    {r.activityName}
                  </h4>

                  {/* Program / Organization */}
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: '#475569',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    {r.eventName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Layers size={14} color="#64748B" />
                        <span>
                          <strong>Event:</strong> {r.eventName}
                        </span>
                      </div>
                    )}
                    {r.organization && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Building size={14} color="#64748B" />
                        <span>
                          <strong>Org:</strong> {r.organization}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {r.date && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Calendar size={13} color="#64748B" />
                          <span>{new Date(r.date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {r.level && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: '4px',
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                          }}
                        >
                          Level: {r.level}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {r.description && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: '#64748B',
                        backgroundColor: '#F8FAFC',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '6px',
                        marginBottom: '0.75rem',
                        lineHeight: 1.4,
                      }}
                    >
                      {r.description}
                    </div>
                  )}

                  {/* Rejection Reason Display if Rejected */}
                  {isRejected && r.rejectionReason && (
                    <div
                      style={{
                        padding: '0.65rem 0.75rem',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '6px',
                        marginBottom: '0.75rem',
                        fontSize: '0.78rem',
                        color: '#991B1B',
                      }}
                    >
                      <strong>Rejection Note:</strong> {r.rejectionReason}
                      {r.reviewerName && <div style={{ fontSize: '0.72rem', marginTop: '2px' }}>Reviewer: {r.reviewerName}</div>}
                    </div>
                  )}
                </div>

                {/* Footer Controls: Proof Certificate & Mentor Verification */}
                <div
                  style={{
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  {/* Certificate Link. When the database record exists but the
                      bytes are gone (uploads live on ephemeral local disk) the
                      link is replaced by an honest explanation instead of a
                      dead link that looks like a broken application. */}
                  {r.certificateUrl ? (
                    r.fileAvailable === false ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#B45309',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                        title={`Registered as ${r.certificateUrl}, but no file is present on the server.`}
                      >
                        <AlertTriangle size={13} /> File missing on server
                      </span>
                    ) : (
                      <a
                        href={getFullFileUrl(r.certificateUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: '0.78rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          color: '#2563EB',
                        }}
                      >
                        <Eye size={13} /> View Certificate <ExternalLink size={11} />
                      </a>
                    )
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
                      No certificate file attached
                    </span>
                  )}

                  {/* Verification Buttons */}
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {isLocked ? (
                      <span
                        className="badge badge-success"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.74rem',
                          padding: '4px 9px',
                        }}
                        title="Confirmed by your mentor. This record is permanently locked and can no longer be edited, deleted or re-submitted."
                      >
                        <FileCheck size={12} /> Confirmed & Locked
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenVerifyModal(r, 'Verified')}
                          className="btn btn-sm"
                          style={{
                            fontSize: '0.76rem',
                            padding: '0.35rem 0.7rem',
                            backgroundColor: '#F0FDF4',
                            color: '#166534',
                            borderColor: '#BBF7D0',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                          title="Verify Achievement"
                        >
                          <CheckCircle2 size={13} /> Verify
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenVerifyModal(r, 'Rejected')}
                          className="btn btn-sm"
                          style={{
                            fontSize: '0.76rem',
                            padding: '0.35rem 0.7rem',
                            backgroundColor: isRejected ? '#FEE2E2' : '#FFF1F2',
                            color: '#991B1B',
                            borderColor: '#FECDD3',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                          title="Reject with Reason"
                        >
                          <XCircle size={13} /> {isRejected ? 'Rejected ✕' : 'Reject'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================
          4. VERIFICATION / REJECTION MODAL
          ============================================================ */}
      {verifyTarget && (
        <Modal
          title={verifyStatus === 'Verified' ? 'Verify Achievement Record' : 'Reject Achievement Record'}
          isOpen={!!verifyTarget}
          onClose={() => setVerifyTarget(null)}
          onSubmit={handleConfirmVerification}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setVerifyTarget(null)}
                disabled={submittingVerify}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${verifyStatus === 'Verified' ? 'btn-success' : 'btn-danger'}`}
                disabled={submittingVerify}
                style={{
                  backgroundColor: verifyStatus === 'Verified' ? '#16A34A' : '#DC2626',
                  color: '#ffffff',
                  fontWeight: 700,
                }}
              >
                {submittingVerify
                  ? 'Saving...'
                  : verifyStatus === 'Verified'
                  ? 'Confirm Verification'
                  : 'Confirm Rejection'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>
              {verifyStatus === 'Verified' ? (
                <>
                  Are you sure you want to verify <strong>"{verifyTarget.activityName}"</strong> under{' '}
                  <strong>{verifyTarget.category}</strong>? This will confirm the validity of the achievement.
                </>
              ) : (
                <>
                  Please provide a clear reason for rejecting <strong>"{verifyTarget.activityName}"</strong>. The
                  student will be notified and can view your feedback.
                </>
              )}
            </p>

            {verifyStatus === 'Rejected' && (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Rejection Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  required
                  placeholder="e.g. Certificate blur or invalid institution credentials; please re-upload clear certificate copy..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
