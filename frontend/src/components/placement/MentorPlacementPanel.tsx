import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import {
  api,
  type PlacementRow,
  type PlacementStatus,
} from '../../api/client';
import { EmptyState } from '../common/EmptyState';
import { DashboardSkeleton } from '../common/SkeletonLoader';

const STATUS_LABEL: Record<PlacementStatus, string> = {
  NOT_STARTED: 'Not started',
  TRAINING: 'In training',
  APPLYING: 'Applying',
  INTERVIEW: 'Interview phase',
  SELECTED: 'Selected',
  NOT_SELECTED: 'Not selected (continues)',
  PLACED: 'Placed',
  NOT_PLACED: 'Not placed',
};

/**
 * Mentor placement panel for ONE student. Read + update of the final-year
 * placement record. Transitions are suggested by the server's
 * `allowedTransitions` and re-checked by the server on save.
 */
export const MentorPlacementPanel: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PlacementRow | null>(null);
  const [allowed, setAllowed] = useState<PlacementStatus[]>([]);
  const [studentLabel, setStudentLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<any>({});
  const [packageValue, setPackageValue] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.placements.get(studentId);
      const d = res.data ?? res;
      setPlacement(d.placement ?? null);
      setAllowed(d.allowedTransitions ?? []);
      setStudentLabel(`${d.student?.fullName} (${d.student?.registerNumber})`);
      if (d.placement) {
        setForm(d.placement);
        setPackageValue(d.placement.package != null ? String(d.placement.package) : '');
      }
    } catch (e: any) {
      setError(e?.message || 'Unable to load the placement record.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));

  const canEdit = placement?.overallStatus !== 'PLACED' || true;
  void canEdit;

  const transitionOptions: PlacementStatus[] = placement
    ? [placement.overallStatus, ...allowed.filter((a) => a !== placement.overallStatus)]
    : (['NOT_STARTED'] as PlacementStatus[]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const payload: any = {
      overallStatus: form.overallStatus,
    };
    if (form.trainingStatus !== undefined) payload.trainingStatus = form.trainingStatus;
    if (form.trainingProgress !== undefined) payload.trainingProgress = Number(form.trainingProgress || 0);
    if (form.assessmentStatus !== undefined) payload.assessmentStatus = form.assessmentStatus;
    if (form.companyName !== undefined) payload.companyName = form.companyName;
    if (form.applicationStatus !== undefined) payload.applicationStatus = form.applicationStatus;
    if (form.interviewStatus !== undefined) payload.interviewStatus = form.interviewStatus;
    if (form.selectionStatus !== undefined) payload.selectionStatus = form.selectionStatus;
    if (form.placementDate) payload.placementDate = form.placementDate;
    if (form.placedCompanyName) payload.placedCompanyName = form.placedCompanyName;
    if (packageValue !== '') payload.package = Number(packageValue);
    if (form.salaryDetails !== undefined) payload.salaryDetails = form.salaryDetails;
    if (form.mentorRemarks !== undefined) payload.mentorRemarks = form.mentorRemarks;

    try {
      const res: any = await api.placements.update(studentId, payload);
      const d = res.data ?? res;
      setPlacement(d.placement ?? null);
      setAllowed(d.allowedTransitions ?? []);
      setForm(d.placement ?? {});
      setSuccess('Placement record saved.');
      setPackageValue(d.placement?.package != null ? String(d.placement.package) : '');
    } catch (err: any) {
      setError(err?.message || 'Unable to save the placement record.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (error && !placement) {
    return (
      <EmptyState
        icon={<Briefcase size={28} />}
        title="Placement record unavailable"
        description={error}
        action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Retry
          </button>
        }
      />
    );
  }

  const placed = placement?.placed === true;
  const notPlaced = placement?.notPlaced === true;

  return (
    <div>
      <div
        className="section-heading"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}
      >
        <div>
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Briefcase size={22} /> Placement Monitoring
          </h2>
          <p className="section-subtitle">
            {studentLabel || 'Final-year student'} · final-year placement record
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {placed && (
            <span className="badge" style={{ background: 'var(--good-100, #dcfce7)', color: 'var(--good-600, #15803d)' }}>
              <CheckCircle2 size={14} /> PLACED
            </span>
          )}
          {notPlaced && (
            <span className="badge" style={{ background: 'var(--danger-100, #fee2e2)', color: 'var(--danger-600, #b91c1c)' }}>
              <XCircle size={14} /> NOT PLACED
            </span>
          )}
          {!placed && !notPlaced && (
            <span className="badge badge-info">
              <RotateCcw size={14} /> IN PROGRESS
            </span>
          )}
        </div>
      </div>

      {success && (
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--good-100, #dcfce7)',
            color: 'var(--good-700, #15803d)',
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--danger-100, #fee2e2)',
            color: 'var(--danger-700, #b91c1c)',
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="card">
        <div className="card-body">
          <div className="form-group">
            <label htmlFor="pe-overall-status">Placement status</label>
            <select
              id="pe-overall-status"
              className="form-control"
              value={form.overallStatus ?? (placement?.overallStatus ?? 'NOT_STARTED')}
              onChange={(e) => set('overallStatus', e.target.value)}
              required
            >
              {transitionOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
            <small style={{ color: 'var(--slate-400)' }}>
              Allowed next states: {allowed.length === 0 ? 'none (PLACED is terminal)' : allowed.map((a) => STATUS_LABEL[a] ?? a).join(', ') || 'update details only'}
            </small>
          </div>

          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="pe-training-status">Training status</label>
              <select
                id="pe-training-status"
                className="form-control"
                value={form.trainingStatus ?? 'NOT_STARTED'}
                onChange={(e) => set('trainingStatus', e.target.value)}
              >
                {['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NA'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pe-training-progress">Training progress (%)</label>
              <input
                id="pe-training-progress"
                type="number"
                min={0}
                max={100}
                className="form-control"
                value={form.trainingProgress ?? 0}
                onChange={(e) => set('trainingProgress', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pe-assessment-status">Assessment status</label>
              <select
                id="pe-assessment-status"
                className="form-control"
                value={form.assessmentStatus ?? 'NOT_STARTED'}
                onChange={(e) => set('assessmentStatus', e.target.value)}
              >
                {['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PASSED', 'FAILED'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pe-company">Current company</label>
              <input
                id="pe-company"
                className="form-control"
                placeholder="e.g. Infosys"
                value={form.companyName ?? ''}
                onChange={(e) => set('companyName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pe-application-status">Application status</label>
              <select
                id="pe-application-status"
                className="form-control"
                value={form.applicationStatus ?? 'NOT_APPLIED'}
                onChange={(e) => set('applicationStatus', e.target.value)}
              >
                {['NOT_APPLIED', 'APPLIED', 'PENDING', 'REJECTED'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pe-interview-status">Interview status</label>
              <select
                id="pe-interview-status"
                className="form-control"
                value={form.interviewStatus ?? 'NOT_SCHEDULED'}
                onChange={(e) => set('interviewStatus', e.target.value)}
              >
                {['NOT_SCHEDULED', 'SCHEDULED', 'COMPLETED', 'REJECTED'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pe-selection-status">Selection status</label>
              <select
                id="pe-selection-status"
                className="form-control"
                value={form.selectionStatus ?? 'PENDING'}
                onChange={(e) => set('selectionStatus', e.target.value)}
              >
                {['PENDING', 'SELECTED', 'NOT_SELECTED', 'WAITLIST'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pe-placed-company">Offered / placed company</label>
              <input
                id="pe-placed-company"
                className="form-control"
                placeholder="required before marking PLACED"
                value={form.placedCompanyName ?? ''}
                onChange={(e) => set('placedCompanyName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pe-placement-date">Placement date</label>
              <input
                id="pe-placement-date"
                type="date"
                className="form-control"
                value={form.placementDate ?? ''}
                onChange={(e) => set('placementDate', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pe-package">Package (LPA)</label>
              <input
                id="pe-package"
                type="number"
                min={0}
                step="0.1"
                className="form-control"
                value={packageValue}
                onChange={(e) => setPackageValue(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pe-salary-details">Salary details</label>
              <input
                id="pe-salary-details"
                className="form-control"
                value={form.salaryDetails ?? ''}
                onChange={(e) => set('salaryDetails', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label htmlFor="pe-remarks">Mentor remarks</label>
            <textarea
              id="pe-remarks"
              className="form-control"
              rows={3}
              value={form.mentorRemarks ?? ''}
              onChange={(e) => set('mentorRemarks', e.target.value)}
            />
          </div>
        </div>
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-gold" disabled={saving}>
            {saving ? 'Saving…' : placement ? 'Save placement record' : 'Create placement record'}
          </button>
        </div>
      </form>
    </div>
  );
};