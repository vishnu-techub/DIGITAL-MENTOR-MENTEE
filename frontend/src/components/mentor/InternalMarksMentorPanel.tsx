import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type InternalMarkRow,
  type MarkEntryPermissionState,
  type MarkEntryType,
  type MarkUpdateRequest,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { ClipboardList, Lock, Clock, FilePlus2, RefreshCw, Inbox } from 'lucide-react';

/**
 * Mentor-facing Internal Assessment Marks panel.
 *
 * Reads the same server-authoritative `MarkEntryPermissionState` as the Admin
 * tab. Marks are editable ONLY while the window is ACTIVE and the mark type is
 * in `editableMarkTypes` — the backend enforces both at write time, this UI is
 * display only. As soon as the window closes (or expires) the mentor can still
 * raise a correction request with a reason, which an Admin approves or rejects.
 */

const MARK_MAX: Record<MarkEntryType, number> = { IA1: 50, IA2: 50, END_SEM: 100 };
const MARK_KEY: Record<MarkEntryType, 'ia1' | 'ia2' | 'endSem'> = {
  IA1: 'ia1',
  IA2: 'ia2',
  END_SEM: 'endSem',
};

interface DraftRow {
  ia1: string;
  ia2: string;
  endSem: string;
}

interface Props {
  studentId: string;
  registerNumber?: string;
}

interface CorrectionTarget {
  row: InternalMarkRow;
  markType: MarkEntryType;
  requestedMark: string;
  reason: string;
}

export const InternalMarksMentorPanel: React.FC<Props> = ({ studentId, registerNumber }) => {
  const toast = useToast();

  const [permission, setPermission] = useState<MarkEntryPermissionState | null>(null);
  const [marks, setMarks] = useState<InternalMarkRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [requests, setRequests] = useState<MarkUpdateRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const [correction, setCorrection] = useState<CorrectionTarget | null>(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [marksRes, requestsRes] = await Promise.all([
        api.marks.getStudentMarks(studentId),
        api.marks.listUpdateRequests({ studentId }).catch(() => null),
      ]);
      setPermission(marksRes.data.permission);
      const rows = marksRes.data.marks || [];
      setMarks(rows);
      const next: Record<string, DraftRow> = {};
      for (const r of rows) {
        next[r.id] = {
          ia1: r.ia1 != null ? String(r.ia1) : '',
          ia2: r.ia2 != null ? String(r.ia2) : '',
          endSem: r.endSem != null ? String(r.endSem) : '',
        };
      }
      setDrafts(next);
      if (requestsRes) setRequests(requestsRes.data.requests || []);
    } catch (err: any) {
      setLoadError(err instanceof ApiError ? err.message : err?.message || 'Could not load internal marks.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await api.marks.listUpdateRequests({ studentId });
      setRequests(res.data.requests || []);
    } catch {
      /* the main load will surface errors; listing here is best-effort */
    } finally {
      setRequestsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    reloadRequests();
  }, [reloadRequests]);

  const editable = (type: MarkEntryType): boolean =>
    permission?.isActive === true && (permission.editableMarkTypes || []).includes(type);

  const setDraft = (rowId: string, field: keyof DraftRow, value: string) => {
    setDrafts((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] || { ia1: '', ia2: '', endSem: '' }), [field]: value } }));
  };

  const draftChanged = (row: InternalMarkRow): boolean => {
    const d = drafts[row.id];
    if (!d) return false;
    return (
      (row.ia1 != null ? String(row.ia1) : '') !== (d.ia1 || '') ||
      (row.ia2 != null ? String(row.ia2) : '') !== (d.ia2 || '') ||
      (row.endSem != null ? String(row.endSem) : '') !== (d.endSem || '')
    );
  };

  const handleSave = async (row: InternalMarkRow) => {
    const d = drafts[row.id];
    if (!d) return;
    const toNumber = (raw: string): number | null => {
      if (raw.trim() === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const values = { ia1: toNumber(d.ia1), ia2: toNumber(d.ia2), endSem: toNumber(d.endSem) };
    if (values.ia1 !== null && (values.ia1 < 0 || values.ia1 > 50)) {
      toast.error('IA1 must be between 0 and 50.');
      return;
    }
    if (values.ia2 !== null && (values.ia2 < 0 || values.ia2 > 50)) {
      toast.error('IA2 must be between 0 and 50.');
      return;
    }
    if (values.endSem !== null && (values.endSem < 0 || values.endSem > 100)) {
      toast.error('End Semester must be between 0 and 100.');
      return;
    }
    setSavingId(row.id);
    try {
      await api.marks.updateStudentMarks(studentId, {
        semesterNumber: row.semesterNumber,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        ...values,
      });
      toast.success(`Marks saved for ${row.subjectCode}.`);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the marks.');
    } finally {
      setSavingId(null);
    }
  };

  const openCorrection = (row: InternalMarkRow) => {
    setCorrection({ row, markType: 'IA1', requestedMark: '', reason: '' });
  };

  const submitCorrection = async () => {
    if (!correction) return;
    const max = MARK_MAX[correction.markType];
    const value = Number(correction.requestedMark);
    if (!Number.isFinite(value) || value < 0 || value > max) {
      toast.error(`The requested ${correction.markType} mark must be between 0 and ${max}.`);
      return;
    }
    if (correction.reason.trim().length < 5) {
      toast.error('The reason must be at least 5 characters.');
      return;
    }
    setSubmittingCorrection(true);
    try {
      await api.marks.createUpdateRequest({
        studentId,
        semesterNumber: correction.row.semesterNumber,
        subjectCode: correction.row.subjectCode,
        markType: correction.markType,
        requestedMark: Math.round(value * 100) / 100,
        reason: correction.reason.trim(),
      });
      toast.success(
        'Correction request submitted. The official mark is unchanged until an administrator approves it.'
      );
      setCorrection(null);
      await reloadRequests();
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit the correction request.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const status = permission?.status ?? 'INACTIVE';

  return (
    <div
      className="card"
      style={{
        padding: '1.25rem',
        backgroundColor: '#ffffff',
        border: '1px solid var(--color-slate-200)',
        borderLeft: '5px solid #1976D2',
        borderRadius: '10px',
      }}
    >
      {/* Header */}
      <PageHeader
        eyebrow="Mentor Panel"
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <ClipboardList size={18} aria-hidden="true" /> Internal Assessment Marks
          </span>
        }
        subtitle={
          registerNumber
            ? `Official IA1 / 50, IA2 / 50 and End Semester / 100 record for ${registerNumber}.`
            : 'Official IA1 / 50, IA2 / 50 and End Semester / 100 record.'
        }
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            disabled={loading}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {/* Window banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.82rem',
          padding: '0.6rem 0.85rem',
          borderRadius: '6px',
          marginBottom: '0.9rem',
          background:
            status === 'ACTIVE' ? 'var(--color-success-50)' : status === 'EXPIRED' ? 'var(--color-warning-50)' : 'var(--color-slate-100)',
          border:
            status === 'ACTIVE'
              ? '1px solid #A7F3D0'
              : status === 'EXPIRED'
                ? '1px solid #FDE68A'
                : '1px solid var(--color-slate-200)',
          color: status === 'ACTIVE' ? '#065F46' : status === 'EXPIRED' ? '#92400E' : 'var(--color-slate-600)',
        }}
      >
        {status === 'ACTIVE' ? (
          <Clock size={15} />
        ) : status === 'EXPIRED' ? (
          <Lock size={15} />
        ) : (
          <Lock size={15} />
        )}
        {loading ? (
          'Loading mark-entry window…'
        ) : status === 'ACTIVE' ? (
          <span>
            <strong>Mark entry is open</strong> until{' '}
            {permission?.expiresAt ? new Date(permission.expiresAt).toLocaleString() : '—'}. You
            may enter: {(permission?.editableMarkTypes || []).join(', ') || 'nothing'}.
          </span>
        ) : status === 'EXPIRED' ? (
          <span>
            <strong>Mark entry period has expired.</strong> You can raise a correction request
            with a reason — the official mark only changes after an administrator approves it.
          </span>
        ) : (
          <span>
            <strong>Mark entry is not enabled.</strong> The administrator must enable mark entry
            before marks can be edited. You can still raise correction requests.
          </span>
        )}
      </div>

      {loadError && (
        <div
          style={{
            padding: '9px 12px',
            background: 'var(--color-danger-50)',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            color: '#B91C1C',
            fontSize: '0.8rem',
            marginBottom: '0.75rem',
          }}
        >
          {loadError}
        </div>
      )}

      {/* Marks table */}
      {marks.length === 0 ? (
        !loading && (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: 'var(--color-slate-500)',
              fontSize: '0.85rem',
              backgroundColor: 'var(--color-slate-50)',
              borderRadius: '8px',
            }}
          >
            No internal assessment marks have been recorded for this student yet.
            {status === 'ACTIVE'
              ? ' Enter subject marks below once the student\'s subjects are available, or use the correction flow after the window opens for the first term.'
              : ' Once mark entry is enabled, subject-wise marks can be entered here.'}
          </div>
        )
      ) : (
        <div className="table-responsive">
          <table className="table" style={{ fontSize: '0.83rem' }}>
            <thead>
              <tr>
                <th>Sem</th>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>IA1 / 50</th>
                <th>IA2 / 50</th>
                <th>End Sem / 100</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((row) => {
                const d = drafts[row.id] || { ia1: '', ia2: '', endSem: '' };
                return (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 700 }}>Semester {row.semesterNumber}</td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <code>{row.subjectCode}</code>
                    </td>
                    <td>{row.subjectName || '—'}</td>
                    {(['IA1', 'IA2', 'END_SEM'] as MarkEntryType[]).map((type) => (
                      <td key={type} style={{ textAlign: 'center' }}>
                        {editable(type) ? (
                          <input
                            type="number"
                            min={0}
                            max={MARK_MAX[type]}
                            step="any"
                            style={{ width: '70px', padding: '0.3rem 0.4rem' }}
                            value={d[MARK_KEY[type]] ?? ''}
                            placeholder="—"
                            onChange={(e) => setDraft(row.id, MARK_KEY[type], e.target.value)}
                          />
                        ) : d[MARK_KEY[type]] !== '' && d[MARK_KEY[type]] != null ? (
                          d[MARK_KEY[type]]
                        ) : (
                          <span style={{ color: 'var(--color-slate-400)' }}>—</span>
                        )}
                      </td>
                    ))}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {editable('IA1') || editable('IA2') || editable('END_SEM') ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSave(row)}
                            disabled={savingId === row.id || !draftChanged(row)}
                          >
                            {savingId === row.id ? 'Saving…' : 'Save'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-400)' }}>
                            read-only outside the entry window
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => openCorrection(row)}
                          title="Raise a correction request with a reason (approved by Admin)"
                        >
                          <FilePlus2 size={13} /> Correction
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Correction requests for this student */}
      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-slate-200)', paddingTop: '0.75rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: 'var(--color-navy-800)',
            marginBottom: '0.5rem',
          }}
        >
          <Inbox size={15} /> Correction requests for this student
          {requestsLoading && (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-400)', fontWeight: 400 }}>
              loading…
            </span>
          )}
        </div>
        {requests.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-400)' }}>No correction requests.</div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Mark</th>
                  <th>Change</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {r.subjectCode}
                    </td>
                    <td>{r.markTypeLabel}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {r.existingMark ?? '—'} → {r.requestedMark}
                    </td>
                    <td style={{ maxWidth: '260px', fontSize: '0.76rem' }} title={r.reason}>
                      {r.reason.length > 80 ? `${r.reason.slice(0, 80)}…` : r.reason}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === 'APPROVED'
                            ? 'badge-success'
                            : r.status === 'REJECTED'
                              ? 'badge-danger'
                              : 'badge-warning'
                        }`}
                      >
                        {r.status}
                      </span>
                      {r.status === 'REJECTED' && r.rejectionReason && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-slate-500)', marginTop: '0.2rem' }}>
                          {r.rejectionReason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== MODAL: Raise correction ==================== */}
      <Modal
        isOpen={correction !== null}
        onClose={() => setCorrection(null)}
        title="Raise a correction request"
        maxWidth="520px"
        onSubmit={submitCorrection}
        formId="mark-correction-form"
      >
        {correction && (
          <form id="mark-correction-form" onSubmit={submitCorrection}>
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
                <strong>Subject:</strong> {correction.row.subjectCode} —{' '}
                {correction.row.subjectName} (Semester {correction.row.semesterNumber})
              </div>
              <div>
                <strong>Mark entry is currently:</strong> {status}.{' '}
                {status === 'ACTIVE'
                  ? 'You can also edit the marks directly in the table above.'
                  : 'Only an Admin can change the official mark, and only by approving this request.'}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Mark type</label>
              <select
                className="form-control"
                value={correction.markType}
                onChange={(e) =>
                  setCorrection({ ...correction, markType: e.target.value as MarkEntryType })
                }
              >
                {(['IA1', 'IA2', 'END_SEM'] as MarkEntryType[]).map((t) => (
                  <option key={t} value={t}>
                    {t} (out of {MARK_MAX[t]})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Requested mark (0–{MARK_MAX[correction.markType]})</label>
              <input
                type="number"
                className="form-control"
                min={0}
                max={MARK_MAX[correction.markType]}
                step="any"
                value={correction.requestedMark}
                onChange={(e) => setCorrection({ ...correction, requestedMark: e.target.value })}
                placeholder={`Current value: ${correction.row[MARK_KEY[correction.markType]] ?? 'not recorded'}`}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Reason <span className="required-star">*</span>
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={correction.reason}
                onChange={(e) => setCorrection({ ...correction, reason: e.target.value })}
                placeholder="Why should this mark be corrected? (attachments stay in the department file)"
                required
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)', marginTop: '0.3rem' }}>
                The official mark is NOT changed until an administrator approves this request.
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};