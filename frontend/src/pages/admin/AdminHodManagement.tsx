import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type AdminHodManagementRow,
  type AdminHodManagementData,
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
  Plus,
  Eye,
  Pencil,
  Power,
  UserCog,
  ShieldCheck,
  Clock,
  Mail,
  Building2,
  KeyRound,
  UserX,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

/**
 * Admin HOD Management tab.
 *
 * Backend surface: `GET/POST /api/admin/hods`, `PUT /api/admin/hods/:id`,
 * `PATCH /api/admin/hods/:id/status`, `DELETE /api/admin/hods/:id` — every one
 * ADMIN-only server-side. The one-active-HOD-per-department rule is enforced by
 * the backend too; this UI only previews it by disabling departments that
 * already have an active HOD. Deactivating a HOD flips status only — no account
 * or historical record is ever deleted. The "Delete HOD" action is the ONE
 * permanent-deletion path, shown ONLY for INACTIVE verified demo/test accounts
 * (`is_verified_demo === 1`, returned by the backend from its reviewed
 * allowlist) and re-gated 100% server-side; it is never shown for active,
 * genuine or unverified HODs.
 */

interface DeptOption {
  id: string;
  code: string;
  name: string;
}

interface HodForm {
  fullName: string;
  email: string;
  departmentId: string;
  username: string;
  password: string;
  isActive: boolean;
}

const EMPTY_FORM: HodForm = {
  fullName: '',
  email: '',
  departmentId: '',
  username: '',
  password: '',
  isActive: true,
};

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

type ModalMode = 'add' | 'edit';

export const AdminHodManagement: React.FC = () => {
  const toast = useToast();

  const [hods, setHods] = useState<AdminHodManagementRow[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [editingHod, setEditingHod] = useState<AdminHodManagementRow | null>(null);
  const [viewingHod, setViewingHod] = useState<AdminHodManagementRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminHodManagementRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminHodManagementRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminHodManagementRow | null>(null);
  const [form, setForm] = useState<HodForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [hodRes, deptRes] = await Promise.all([
        api.admin.getHods(),
        api.admin.getDepartments(),
      ]);
      const data = hodRes.data as AdminHodManagementData;
      setHods(data.hods || []);
      const rows: any[] = Array.isArray(deptRes.data) ? deptRes.data : [];
      setDepartments(
        rows.map((d) => ({ id: String(d.id || d._id), code: d.code, name: d.name }))
      );
    } catch (err: any) {
      const e = err instanceof ApiError ? err : new ApiError(500, err?.message);
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Departments that could legally receive this HOD (or the current one on edit). */
  const assignableDepartments = useCallback(
    (forHod: AdminHodManagementRow | null) => {
      const occupied = new Set(
        hods.filter((h) => h.is_active === 1 && h.department_id).map((h) => h.department_id)
      );
      return departments.map((d) => ({
        ...d,
        available: !occupied.has(d.id) || (forHod !== null && forHod.department_id === d.id),
      }));
    },
    [hods, departments]
  );

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingHod(null);
    setFormError('');
    setModalMode('add');
  };

  const openEdit = (hod: AdminHodManagementRow) => {
    setEditingHod(hod);
    setForm({
      fullName: hod.full_name || '',
      email: hod.email || '',
      departmentId: hod.department_id || '',
      username: hod.username || '',
      password: '',
      isActive: hod.is_active === 1,
    });
    setFormError('');
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingHod(null);
    setFormError('');
  };

  const validate = (): string => {
    const name = form.fullName.trim();
    const email = form.email.trim();
    if (!name) return 'Full name is required.';
    if (!email) return 'Email is required.';
    if (!EMAIL_RE.test(email)) return '"' + email + '" is not a valid email address.';
    if (!form.departmentId) return 'Please select a department.';
    if (form.username.trim().length > 0 && !/^[a-z0-9._-]{2,40}$/i.test(form.username.trim())) {
      return 'Username may only contain letters, digits, dots, dashes and underscores.';
    }
    if (modalMode === 'add' && form.password && form.password.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    return '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modalMode === 'add') {
        await api.admin.createHod({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          departmentId: form.departmentId,
          username: form.username.trim() || undefined,
          password: form.password || undefined,
          isActive: form.isActive,
        });
        toast.success('HOD account created successfully.');
      } else if (editingHod) {
        await api.admin.updateHod(editingHod.id, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          departmentId: form.departmentId,
          isActive: form.isActive,
        });
        toast.success('HOD account updated successfully.');
      }
      closeModal();
      await load();
    } catch (err: any) {
      const msg = err?.message || 'Save failed.';
      setFormError(msg);
      toast.error('Save failed: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setSaving(true);
    try {
      const next = statusTarget.is_active !== 1;
      const res = await api.admin.setHodStatus(statusTarget.id, next);
      toast.success(
        next ? 'HOD account reactivated.' : 'HOD account deactivated. Historical records are retained.'
      );
      setStatusTarget(null);
      if (res.data && (res.data as AdminHodManagementRow).id === statusTarget.id) {
        setHods((prev) =>
          prev.map((h) => (h.id === statusTarget.id ? (res.data as AdminHodManagementRow) : h))
        );
      }
      await load();
    } catch (err: any) {
      toast.error('Status change failed: ' + (err?.message || 'unknown error'));
      setStatusTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string | null | undefined): string => {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  /**
   * "Remove HOD" is a deactivation-only action. It deliberately reuses the
   * existing status endpoint (`PATCH /api/admin/hods/:id/status`, audits
   * DEACTIVATE_HOD) so the account and every historical mentoring/HOD record
   * keep their author — nothing is ever permanently deleted. The department
   * slot is freed for a successor exactly like a normal deactivation, and the
   * auth layer already refuses login for an inactive user.
   */
  const confirmRemoveHod = async () => {
    if (!removeTarget) return;
    if (removeTarget.is_active !== 1) {
      toast.info(`${removeTarget.full_name} is already inactive — no duplicate removal performed.`);
      setRemoveTarget(null);
      return;
    }
    setSaving(true);
    try {
      const res = await api.admin.setHodStatus(removeTarget.id, false);
      toast.success(
        `${removeTarget.full_name} removed as active HOD of ${removeTarget.department_name || 'the department'}. Historical records are retained.`
      );
      setRemoveTarget(null);
      if (res.data && (res.data as AdminHodManagementRow).id === removeTarget.id) {
        setHods((prev) =>
          prev.map((h) => (h.id === removeTarget.id ? (res.data as AdminHodManagementRow) : h))
        );
      }
      await load();
    } catch (err: any) {
      toast.error('Remove failed: ' + (err?.message || 'unknown error'));
      setRemoveTarget(null);
    } finally {
      setSaving(false);
    }
  };

  /** Only INACTIVE accounts the backend flags as verified demo/test HODs are deletable. */
  const isDeletableDemoHod = (h: AdminHodManagementRow) => h.is_active === 0 && h.is_verified_demo === 1;

  /**
   * "Delete HOD" is the permanent-deletion safety valve, shown only for
   * INACTIVE verified demo/test accounts and re-gated entirely on the server
   * (Admin role, target role = HOD, inactive, reviewed allowlist, dependent-
   * record scan). A successful delete writes a DELETE_HOD audit event and the
   * account is gone for good — it can never log in again and never reappears.
   */
  const confirmDeleteHod = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.is_active !== 0 || deleteTarget.is_verified_demo !== 1) {
      toast.error('This account is not eligible for permanent deletion.');
      setDeleteTarget(null);
      return;
    }
    setSaving(true);
    try {
      await api.admin.deleteHod(deleteTarget.id);
      toast.success(
        `${deleteTarget.full_name} was permanently deleted. The DELETE_HOD action is recorded in the audit trail.`
      );
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast.error('Delete failed: ' + (err?.message || 'unknown error'));
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (loadError) {
    if (loadError.type === 'NETWORK_ERROR' || loadError.statusCode === 0) {
      return <NetworkErrorState onRetry={load} fullPage={false} />;
    }
    if (loadError.type === 'SERVICE_UNAVAILABLE' || loadError.statusCode === 503) {
      return <ServiceUnavailableState onRetry={load} fullPage={false} />;
    }
    return <ServerErrorState onRetry={load} fullPage={false} />;
  }

  const activeCount = hods.filter((h) => h.is_active === 1).length;
  const deptOptions = assignableDepartments(modalMode === 'edit' ? editingHod : null);

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={`HOD Management (${hods.length} HOD${hods.length !== 1 ? 's' : ''})`}
        subtitle={`${activeCount} active · ${hods.length - activeCount} inactive. One active HOD per department.`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <Plus size={16} /> Add HOD
          </button>
        }
      />

      <div className="card" style={{ padding: 0 }}>
        {hods.length === 0 ? (
          <EmptyState
            compact
            icon={<UserCog size={32} style={{ color: 'var(--color-slate-400)' }} />}
            title="No HOD accounts yet"
            description="Create the first HOD account to give a department its Head of Department login."
            action={
              <button className="btn btn-primary btn-sm" onClick={openAdd}>
                <Plus size={16} /> Add HOD
              </button>
            }
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-responsive desktop-only">
              <table className="table">
                <thead>
                  <tr>
                    <th>HOD Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {hods.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <strong>{h.full_name}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>@{h.username}</div>
                      </td>
                      <td>{h.email}</td>
                      <td>
                        {h.department_name || '—'}
                        {h.department_code && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{h.department_code}</div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${h.is_active === 1 ? 'badge-success' : 'badge-danger'}`}>
                          {h.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            title={`View ${h.full_name}`}
                            onClick={() => setViewingHod(h)}
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            title={`Edit ${h.full_name}`}
                            onClick={() => openEdit(h)}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            className={`btn btn-sm ${h.is_active === 1 ? 'btn-danger' : 'btn-success'}`}
                            title={h.is_active === 1 ? `Deactivate ${h.full_name}` : `Activate ${h.full_name}`}
                            onClick={() => setStatusTarget(h)}
                          >
                            <Power size={13} /> {h.is_active === 1 ? 'Deactivate' : 'Activate'}
                          </button>
                          {h.is_active === 1 && (
                            <button
                              className="btn btn-sm"
                              title={`Remove ${h.full_name} as the active HOD`}
                              onClick={() => setRemoveTarget(h)}
                              style={{
                                background: 'var(--color-danger-50)',
                                color: 'var(--color-danger-600)',
                                border: '1px solid #FECACA',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <UserX size={13} /> Remove
                            </button>
                          )}
                          {isDeletableDemoHod(h) && (
                            <button
                              className="btn btn-sm"
                              title={`Permanently delete ${h.full_name} (verified demo/test account)`}
                              onClick={() => setDeleteTarget(h)}
                              style={{
                                background: '#FEE2E2',
                                color: '#991B1B',
                                border: '1px solid #FECACA',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <Trash2 size={13} /> Delete HOD
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-only" style={{ flexDirection: 'column', gap: '0.85rem', padding: '0.85rem' }}>
              {hods.map((h) => (
                <div
                  key={h.id}
                  className="card"
                  style={{
                    padding: '1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--color-slate-200)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <strong style={{ color: 'var(--color-navy-800)' }}>{h.full_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>@{h.username}</div>
                    </div>
                    <span className={`badge ${h.is_active === 1 ? 'badge-success' : 'badge-danger'}`}>
                      {h.is_active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-600)', marginTop: '0.6rem' }}>
                    {h.email}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--color-slate-500)' }}>
                    <Building2 size={13} /> {h.department_name || 'No department'} {h.department_code ? `(${h.department_code})` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setViewingHod(h)}>
                      <Eye size={13} /> View
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(h)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      className={`btn btn-sm ${h.is_active === 1 ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => setStatusTarget(h)}
                    >
                      <Power size={13} /> {h.is_active === 1 ? 'Deactivate' : 'Activate'}
                    </button>
                    {h.is_active === 1 && (
                      <button
                        className="btn btn-sm"
                        onClick={() => setRemoveTarget(h)}
                        style={{
                          background: 'var(--color-danger-50)',
                          color: 'var(--color-danger-600)',
                          border: '1px solid #FECACA',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        <UserX size={13} /> Remove
                      </button>
                    )}
                    {isDeletableDemoHod(h) && (
                      <button
                        className="btn btn-sm"
                        title="Permanently delete this verified demo/test HOD account"
                        onClick={() => setDeleteTarget(h)}
                        style={{
                          background: '#FEE2E2',
                          color: '#991B1B',
                          border: '1px solid #FECACA',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        <Trash2 size={13} /> Delete HOD
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ==================== MODAL: View HOD ==================== */}
      <Modal isOpen={viewingHod !== null} onClose={() => setViewingHod(null)} title="HOD Details">
        {viewingHod && (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <Field label="Full Name" icon={<UserCog size={15} />} value={viewingHod.full_name || '—'} />
            <Field label="Email" icon={<Mail size={15} />} value={viewingHod.email || '—'} />
            <Field label="Username" icon={<KeyRound size={15} />} value={'@' + (viewingHod.username || '—')} />
            <Field
              label="Department"
              icon={<Building2 size={15} />}
              value={
                viewingHod.department_name
                  ? `${viewingHod.department_name}${viewingHod.department_code ? ` (${viewingHod.department_code})` : ''}`
                  : 'No department'
              }
            />
            <Field
              label="Status"
              icon={<ShieldCheck size={15} />}
              value={viewingHod.is_active === 1 ? 'Active' : 'Inactive'}
            />
            <Field label="Last Login" icon={<Clock size={15} />} value={formatDate(viewingHod.last_login_at)} />
            <Field label="Created" icon={<Clock size={15} />} value={formatDate(viewingHod.created_at)} />
            <div className="modal-footer" style={{ padding: 0, marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setViewingHod(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ==================== MODAL: Add / Edit HOD ==================== */}
      <Modal
        isOpen={modalMode !== null}
        onClose={closeModal}
        title={modalMode === 'add' ? 'Add HOD' : 'Edit HOD'}
        onSubmit={submit}
        formId="hod-form"
      >
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                Full Name <span className="required-star">*</span>
              </label>
              <input
                type="text"
                className="form-control"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Dr. S. Karthi"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Email <span className="required-star">*</span>
              </label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="hod.cse@ksrce.ac.in"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                Department <span className="required-star">*</span>
              </label>
              <select
                className="form-control"
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                required
              >
                <option value="">Select department</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id} disabled={!d.available}>
                    {d.name} ({d.code}){d.available ? '' : ' — has an active HOD'}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)', marginTop: '0.3rem' }}>
                One active HOD per department. Departments with an active HOD are disabled.
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-control"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Auto-generated from email"
                disabled={modalMode === 'edit'}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            {modalMode === 'add' && (
              <div className="form-group">
                <label className="form-label">Temporary Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Default: Password@123"
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-500)', marginTop: '0.3rem' }}>
                  Minimum 6 characters. Leave blank to use the default.
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-control"
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {formError && (
            <div
              className="alert alert-warning"
              role="alert"
              style={{ marginTop: '1rem' }}
            >
              {formError}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '1.5rem',
              borderTop: '1px solid var(--color-slate-200)',
              paddingTop: '1rem',
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : modalMode === 'add' ? 'Create HOD' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ==================== MODAL: Confirm deactivate / activate ==================== */}
      <Modal
        isOpen={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title={statusTarget && statusTarget.is_active === 1 ? 'Deactivate HOD' : 'Activate HOD'}
      >
        {statusTarget && (
          <div>
            <p style={{ margin: 0, color: 'var(--color-slate-600)', lineHeight: 1.6 }}>
              {statusTarget.is_active === 1 ? (
                <>
                  Deactivate <strong>{statusTarget.full_name}</strong> ({statusTarget.department_name || 'no department'})?
                  The account will not be able to log in. No historical mentoring or academic record is deleted — only the
                  account's status changes, and the department slot is freed for a successor HOD.
                </>
              ) : (
                <>
                  Activate <strong>{statusTarget.full_name}</strong>? The backend refuses if the department already has an
                  active HOD.
                </>
              )}
            </p>
            <div className="modal-footer" style={{ padding: 0, marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setStatusTarget(null)} disabled={saving}>
                Cancel
              </button>
              <button
                className={`btn ${statusTarget.is_active === 1 ? 'btn-danger' : 'btn-success'}`}
                onClick={confirmStatusChange}
                disabled={saving}
              >
                {saving ? 'Saving…' : statusTarget.is_active === 1 ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ==================== MODAL: Confirm Remove HOD ==================== */}
      <Modal
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="Remove HOD"
      >
        {removeTarget && (
          <div>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#7F1D1D' }}>
              Remove HOD?
            </p>
            <p style={{ margin: '0.6rem 0 0', color: 'var(--color-slate-600)', lineHeight: 1.6 }}>
              Are you sure you want to remove <strong>{removeTarget.full_name}</strong> as the
              active HOD for <strong>{removeTarget.department_name || 'the department'}</strong>?
            </p>

            <div
              style={{
                background: 'var(--color-slate-50)',
                border: '1px solid var(--color-slate-200)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginTop: '1rem',
                display: 'grid',
                gap: '0.4rem',
                fontSize: '0.9rem',
                color: 'var(--color-slate-700)',
              }}
            >
              <div>Username: <strong>@{removeTarget.username || '—'}</strong></div>
              <div>Email: <strong>{removeTarget.email || '—'}</strong></div>
              <div>Department: <strong>{removeTarget.department_name || '—'}{removeTarget.department_code ? ` (${removeTarget.department_code})` : ''}</strong></div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'flex-start',
                background: 'var(--color-gold-50)',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginTop: '0.85rem',
                fontSize: '0.9rem',
                color: '#78350F',
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>{removeTarget.full_name} will lose active HOD access immediately.</strong>{' '}
                The account is <strong>deactivated, not deleted</strong> — historical mentoring and
                academic records keep their HOD author, and the department slot is freed for a
                successor HOD.
              </div>
            </div>

            <div className="modal-footer" style={{ padding: 0, marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setRemoveTarget(null)} disabled={saving}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmRemoveHod}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <UserX size={15} /> {saving ? 'Removing…' : 'Remove HOD'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ==================== MODAL: Confirm Permanent Delete (verified demo HOD only) ==================== */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete HOD (Permanent)"
      >
        {deleteTarget && (
          <div>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#7F1D1D' }}>
              Permanently delete this HOD account?
            </p>
            <p style={{ margin: '0.6rem 0 0', color: 'var(--color-slate-600)', lineHeight: 1.6 }}>
              <strong>{deleteTarget.full_name}</strong> is a <strong>verified demo/test account</strong>{' '}
              and is currently inactive. Permanent deletion removes the account entirely — it cannot be
              undone and the account can never log in again.
            </p>

            <div
              style={{
                background: 'var(--color-slate-50)',
                border: '1px solid var(--color-slate-200)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginTop: '1rem',
                display: 'grid',
                gap: '0.4rem',
                fontSize: '0.9rem',
                color: 'var(--color-slate-700)',
              }}
            >
              <div>Username: <strong>@{deleteTarget.username || '—'}</strong></div>
              <div>Email: <strong>{deleteTarget.email || '—'}</strong></div>
              <div>Department: <strong>{deleteTarget.department_name || '—'}{deleteTarget.department_code ? ` (${deleteTarget.department_code})` : ''}</strong></div>
              <div>Account type: <strong>Verified demo / test account</strong></div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'flex-start',
                background: 'var(--color-gold-50)',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginTop: '0.85rem',
                fontSize: '0.9rem',
                color: '#78350F',
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>This action is permanent and cannot be undone.</strong> The backend re-verifies
                that this account is on the reviewed demo-cleanup allowlist and that no historical
                record references it before deleting. The <strong>DELETE_HOD</strong> action is recorded
                in the audit trail; all other accounts and records are untouched.
              </div>
            </div>

            <div className="modal-footer" style={{ padding: 0, marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmDeleteHod}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Trash2 size={15} /> {saving ? 'Deleting…' : 'Delete HOD permanently'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

function Field({ label, icon, value }: { label: string; icon: React.ReactNode; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          color: 'var(--color-slate-500)',
          fontSize: '0.8rem',
          width: '130px',
          flexShrink: 0,
        }}
      >
        {icon} {label}
      </span>
      <strong style={{ color: 'var(--color-navy-800)', fontSize: '0.9rem' }}>{value}</strong>
    </div>
  );
}