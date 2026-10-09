import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type MarkEntryPermissionState,
  type MarkEntryType,
  type MarkUpdateRequest,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { DashboardSkeleton } from '../../components/common/SkeletonLoader';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import {
  ClipboardList,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Inbox,
} from 'lucide-react';

/**
 * Admin Internal Marks tab.
 *
 * Backend surface (all ADMIN-only where noted):
 *   GET/PUT  /api/marks/permission          — the server-authoritative window
 *   GET      /api/marks/update-requests     — scoped correction queue
 *   PATCH    /api/marks/update-requests/:id/approve|reject
 *
 * The window this UI opens is enforced on the server at write time; hiding the
 * form here is display only. Approving a correction is the ONLY path that
 * changes an official mark while the window is closed, and the server
 * re-validates the stored request before it writes.
 */

const MARK_TYPE_OPTIONS: { value: MarkEntryType; label: string }[] = [
  { value: 'IA1', label: 'IA1 (out of 50)' },
  { value: 'IA2', label: 'IA2 (out of 50)' },
  { value: 'END_SEM', label: 'End Semester (out of 100)' },
];

type QueueFilter = 'PENDING' | 'APPROVED' | 'REJECTED';

interface DecisionTarget {
  request: MarkUpdateRequest;
  mode: 'approve' | 'reject';
}

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  ACTIVE: { className: 'badge badge-success', label: 'ACTIVE' },
  EXPIRED: { className: 'badge badge-warning', label: 'EXPIRED' },
  INACTIVE: { className: 'badge badge-neutral', label: 'DISABLED' },
};

const REQUEST_BADGE: Record<string, string> = {
  PENDING: 'badge badge-warning',
  APPROVED: 'badge badge-success',
  REJECTED: 'badge badge-danger',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export const AdminInternalMarks: React.FC = () => {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [permission, setPermission] = useState<MarkEntryPermissionState | null>(null);

  const [selectedTypes, setSelectedTypes] = useState<MarkEntryType[]>([
    'IA1',
    'IA2',
    'END_SEM',
  ]);
  const [durationDays, setDurationDays] = useState(7);
  const [savingWindow, setSavingWindow] = useState(false);

  const [queueFilter, setQueueFilter] = useState<QueueFilter>('PENDING');
  const [requests, setRequests] = useState<MarkUpdateRequest[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const [decision, setDecision] = useState<DecisionTarget | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  const loadPermission = useCallback(async () => {
    const res = await api.marks.getPermission();
    setPermission(res.data.permission);
  }, []);

  const loadQueue = useCallback(async (filter: QueueFilter) => {
    setQueueLoading(true);
    try {
      const res = await api.marks.listUpdateRequests({ status: filter });
      setRequests(res.data.requests || []);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadPermission();
      await loadQueue(queueFilter);
    } catch (err: any) {
      const e = err instanceof ApiError ? err : new ApiError(500, err?.message);
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [loadPermission, loadQueue, queueFilter]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeQueueFilter = (filter: QueueFilter) => {
    setQueueFilter(filter);
    loadQueue(filter).catch((err) =>
      toast.error(err?.message || 'Could not load the correction queue.')
    );
  };

  const toggleType = (type: MarkEntryType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleEnable = async () => {
    if (selectedTypes.length === 0) {
      toast.error('Select at least one mark type to enable.');
      return;
    }
    const days = Number(durationDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      toast.error('Duration must be a whole number of days between 1 and 365.');
      return;
    }
    setSavingWindow(true);
    try {
      const res = await api.marks.setPermission({
        enabled: true,
        markTypes: selectedTypes,
        durationDays: days,
      });
      setPermission(res.data.permission);
      toast.success(
        res.message || 'Mark entry enabled. Mentors can now enter marks until the window expires.'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Could not enable mark entry.');
    } finally {
      setSavingWindow(false);
    }
  };

  const handleDisable = async () => {
    setSavingWindow(true);
    try {
      const res = await api.marks.setPermission({ enabled: false });
      setPermission(res.data.permission);
      toast.success(res.message || 'Mark entry disabled.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not disable mark entry.');
    } finally {
      setSavingWindow(false);
    }
  };

  const openDecision = (request: MarkUpdateRequest, mode: 'approve' | 'reject') => {
    setRejectReason('');
    setDecision({ request, mode });
  };

  const submitDecision = async () => {
    if (!decision) return;
    if (decision.mode === 'reject' && rejectReason.trim().length === 0) {
      toast.error('A rejection reason is required.');
      return;
    }
    setDeciding(true);
    try {
      if (decision.mode === 'approve') {
        const res = await api.marks.approveUpdateRequest(decision.request.id);
        toast.success(res.message || 'Correction approved. The official mark has been changed.');
      } else {
        const res = await api.marks.rejectUpdateRequest(decision.request.id, rejectReason.trim());
        toast.success(res.message || 'Correction rejected. The official mark is unchanged.');
      }
      setDecision(null);
      await loadQueue(queueFilter);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the decision.');
    } finally {
      setDeciding(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (loadError) {
    if (loadError.statusCode === 0) {
      return <NetworkErrorState onRetry={load} fullPage={false} />;
    }
    if (loadError.statusCode === 503) {
      return <ServiceUnavailableState onRetry={load} fullPage={false} />;
    }
    return <ServerErrorState onRetry={load} fullPage={false} />;
  }

  const status = permission?.status ?? 'INACTIVE';
  const badge = STATUS_BADGE[status] || STATUS_BADGE.INACTIVE;

  return (
    <div>
      {/* ==================== HEADER ==================== */}
      <PageHeader
        eyebrow={
          <>
            <ClipboardList size={13} /> Administration
          </>
        }
        title="Internal Marks"
        subtitle="Control the mark-entry window and review mentor correction requests for IA1, IA2 and End Semester marks."
        actions={
          <>
            <span className={badge.className}>{badge.label}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)' }}>
              IA1 / 50 &nbsp;•&nbsp; IA2 / 50 &nbsp;•&nbsp; End Semester / 100
            </span>
          </>
        }
      />

      {/* ==================== PERMISSION WINDOW ==================== */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 className="section-heading">
          <ShieldCheck size={18} color="#0B2545" />
          Mark-entry window
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Current window state */}
          <div
            style={{
              background: '#F8F9FA',
              border: '1px solid var(--color-slate-200)',
              borderRadius: '8px',
              padding: '0.9rem 1rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', marginBottom: '0.35rem' }}>
              CURRENT WINDOW
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--color-slate-800)', lineHeight: 1.7 }}>
              <div>
                <strong>Status:</strong> {status}
                {permission?.enabled && status === 'EXPIRED'
                  ? ' (enabled, but the configured days have elapsed)'
                  : ''}
              </div>
              <div>
                <strong>Mark types enabled:</strong>{' '}
                {permission?.markTypes?.length
                  ? permission.markTypes.join(', ')
                  : 'none'}
              </div>
              <div>
                <strong>Editable right now:</strong>{' '}
                {permission?.editableMarkTypes?.length
                  ? permission.editableMarkTypes.join(', ')
                  : 'nothing'}
              </div>
              <div>
                <strong>Started:</strong> {formatDate(permission?.startsAt ?? null)}
              </div>
              <div>
                <strong>Expires:</strong> {formatDate(permission?.expiresAt ?? null)}
              </div>
            </div>
          </div>

          {/* Enable form */}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', marginBottom: '0.5rem' }}>
              ENABLE A NEW WINDOW
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {MARK_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                    color: 'var(--color-slate-800)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(opt.value)}
                    onChange={() => toggleType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem', maxWidth: '220px' }}>
              <label className="form-label">Window duration (days, 1–365)</label>
              <input
                type="number"
                className="form-control"
                min={1}
                max={365}
                step={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEnable}
                disabled={savingWindow}
              >
                <Clock size={15} style={{ marginRight: '0.35rem' }} />
                {savingWindow ? 'Saving…' : 'Enable mark entry'}
              </button>
              {permission?.enabled && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleDisable}
                  disabled={savingWindow}
                >
                  <XCircle size={15} style={{ marginRight: '0.35rem' }} />
                  Disable now
                </button>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)', marginTop: '0.6rem' }}>
              Enabling restarts the window. Expiry is enforced by the server on every
              write — mentors see a correction-request prompt once the window closes.
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CORRECTION QUEUE ==================== */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '0.9rem',
          }}
        >
          <h3 className="section-heading" style={{ margin: 0 }}>
            <Inbox size={18} color="#0B2545" />
            Mentor correction requests
          </h3>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['PENDING', 'APPROVED', 'REJECTED'] as QueueFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn-sm ${queueFilter === f ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => changeQueueFilter(f)}
              >
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {queueLoading ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', padding: '1rem 0' }}>
            Loading requests…
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            compact
            icon={<Inbox size={26} color="#94A3B8" />}
            title={`No ${queueFilter.toLowerCase()} requests`}
            description={
              queueFilter === 'PENDING'
                ? 'Mentors raise a correction request with a reason whenever they need an official mark changed after the entry window closes. Approving one here is the only way an official mark changes while the window is shut.'
                : `There are no ${queueFilter.toLowerCase()} correction requests.`
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subject</th>
                  <th>Sem</th>
                  <th>Mark</th>
                  <th>Existing → Requested</th>
                  <th>Raised by</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.studentName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)' }}>
                        {r.registerNumber}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{r.subjectCode}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)' }}>{r.subjectName}</div>
                    </td>
                    <td>{r.semesterNumber}</td>
                    <td>
                      {r.markTypeLabel}
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-slate-500)' }}>
                        out of {r.maxMarks ?? '—'}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {r.existingMark ?? '—'} → {r.requestedMark}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{r.requestedByName}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-slate-500)' }}>
                        {formatDate(r.requestedAt)}
                      </div>
                    </td>
                    <td style={{ maxWidth: '240px', fontSize: '0.78rem' }} title={r.reason}>
                      {r.reason.length > 90 ? `${r.reason.slice(0, 90)}…` : r.reason}
                    </td>
                    <td>
                      <span className={REQUEST_BADGE[r.status] || 'badge badge-neutral'}>
                        {r.status}
                      </span>
                      {r.status === 'APPROVED' && r.resolvedMark != null && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-slate-500)', marginTop: '0.2rem' }}>
                          set to {r.resolvedMark} by {r.approvedByName}
                        </div>
                      )}
                      {r.status === 'REJECTED' && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-slate-500)', marginTop: '0.2rem' }}>
                          {r.rejectedByName}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() => openDecision(r, 'approve')}
                            title="Approve — writes the requested mark"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => openDecision(r, 'reject')}
                            title="Reject — official mark unchanged"
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-400)' }}>
                          {formatDate(r.approvedAt || r.rejectedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== MODAL: Approve / Reject ==================== */}
      <Modal
        isOpen={decision !== null}
        onClose={() => setDecision(null)}
        title={
          decision?.mode === 'approve'
            ? 'Approve correction request'
            : 'Reject correction request'
        }
        maxWidth="520px"
        onSubmit={submitDecision}
        formId="mark-decision-form"
      >
        {decision && (
          <form id="mark-decision-form" onSubmit={submitDecision}>
            <div
              style={{
                background: '#F8F9FA',
                border: '1px solid var(--color-slate-200)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                fontSize: '0.85rem',
                lineHeight: 1.7,
                marginBottom: '1rem',
              }}
            >
              <div>
                <strong>Student:</strong> {decision.request.studentName} (
                {decision.request.registerNumber})
              </div>
              <div>
                <strong>Subject:</strong> {decision.request.subjectCode} —{' '}
                {decision.request.subjectName} (Semester {decision.request.semesterNumber})
              </div>
              <div>
                <strong>{decision.request.markTypeLabel}:</strong>{' '}
                {decision.request.existingMark ?? '—'} → {decision.request.requestedMark} (
                {decision.request.maxMarks ?? '—'})
              </div>
              <div>
                <strong>Reason:</strong> {decision.request.reason}
              </div>
            </div>

            {decision.mode === 'approve' ? (
              <p style={{ fontSize: '0.83rem', color: 'var(--color-slate-800)', margin: 0 }}>
                Approving writes <strong>{decision.request.requestedMark}</strong> to the
                official mark for this subject. The change is recorded in the audit trail with
                the previous and new values.
              </p>
            ) : (
              <div className="form-group">
                <label className="form-label">
                  Rejection reason <span className="required-star">*</span>
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this correction cannot be applied…"
                  required
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)', marginTop: '0.3rem' }}>
                  The official mark stays exactly as it is. The mentor sees this reason on the
                  request.
                </div>
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
};
