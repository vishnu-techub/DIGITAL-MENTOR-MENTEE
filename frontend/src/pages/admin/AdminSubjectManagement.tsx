import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type SubjectRow,
  type SubjectMeta,
  type SubjectInput,
  type SubjectType,
  type SubjectStatus,
} from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { MultiSelect } from '../../components/common/MultiSelect';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { DashboardSkeleton } from '../../components/common/SkeletonLoader';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import {
  BookOpen,
  Plus,
  Search,
  Pencil,
  Power,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

/**
 * ============================================================================
 * Admin → Subject Management
 * ============================================================================
 *
 * The master catalogue of subjects that marks are entered and uploaded against.
 *
 * Backend surface (all ADMIN-only, enforced server-side):
 *   GET    /api/admin/subjects            — list (search / filter / paginate)
 *   GET    /api/admin/subjects/meta       — filter vocabulary
 *   POST   /api/admin/subjects            — create
 *   PUT    /api/admin/subjects/:id        — edit
 *   PATCH  /api/admin/subjects/:id/status — activate / deactivate
 *   DELETE /api/admin/subjects/:id        — delete (no recorded marks only)
 *
 * Editing a subject never rewrites an existing InternalMark row, so historical
 * records keep the subject details they were entered with. Deactivation is the
 * intended way to retire a subject: it simply stops appearing as selectable for
 * new uploads while staying visible in the management list.
 */

const PAGE_SIZE = 10;

const SEMESTER_LABEL: Record<number, string> = {
  1: 'Sem 1',
  2: 'Sem 2',
  3: 'Sem 3',
  4: 'Sem 4',
  5: 'Sem 5',
  6: 'Sem 6',
  7: 'Sem 7',
  8: 'Sem 8',
};

/** Departments of a subject as {id, code, name}, tolerating a legacy scalar row. */
function departmentLabels(subject: SubjectRow): Array<{ id: string; code: string; name: string }> {
  if (subject.departments?.length) return subject.departments;
  if (subject.departmentId) {
    return [
      {
        id: subject.departmentId,
        code: subject.departmentCode || subject.departmentId.slice(0, 6),
        name: subject.departmentName || '',
      },
    ];
  }
  return [];
}

/** Semester labels of a subject, tolerating a legacy scalar row. */
function semesterLabels(subject: SubjectRow): string[] {
  const semesters = subject.semesters?.length ? subject.semesters : subject.semester ? [subject.semester] : [];
  return semesters.map((n) => SEMESTER_LABEL[n] ?? String(n));
}

interface FormState {
  code: string;
  name: string;
  departmentIds: string[];
  semesters: string[];
  academicYears: string[];
  regulations: string[];
  subjectType: SubjectType;
  maxMarks: string;
  passMarks: string;
  status: SubjectStatus;
}

const emptyForm = (defaults?: Partial<FormState>): FormState => ({
  code: '',
  name: '',
  departmentIds: [],
  semesters: [],
  academicYears: [],
  regulations: [],
  subjectType: 'THEORY',
  maxMarks: '',
  passMarks: '',
  status: 'ACTIVE',
  ...defaults,
});

const ACADEMIC_YEAR_RE = /^\d{4}-\d{4}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$/;

function validateForm(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const code = form.code.trim().toUpperCase();
  if (!code) errors.code = 'Subject code is required.';
  else if (!CODE_RE.test(code)) errors.code = 'Use letters, numbers and . _ / - only (1-30 chars).';

  if (!form.name.trim()) errors.name = 'Subject name is required.';
  else if (form.name.trim().length > 150) errors.name = 'At most 150 characters.';

  if (form.departmentIds.length === 0) errors.departmentIds = 'Select at least one department.';

  if (form.semesters.length === 0) {
    errors.semesters = 'Select at least one semester.';
  } else if (form.semesters.some((s) => !Number.isInteger(Number(s)) || Number(s) < 1 || Number(s) > 8)) {
    errors.semesters = 'Semesters must be between 1 and 8.';
  }

  if (form.academicYears.length === 0) {
    errors.academicYears = 'Select at least one academic year.';
  } else if (form.academicYears.some((ay) => !ACADEMIC_YEAR_RE.test(ay.trim()))) {
    errors.academicYears = 'Academic years must use the cohort format YYYY-YYYY (e.g. 2024-2028).';
  }

  if (form.regulations.some((r) => r.trim().length > 20)) {
    errors.regulations = 'Each regulation must be at most 20 characters.';
  }

  const max = Number(form.maxMarks);
  if (form.maxMarks === '' || !Number.isInteger(max) || max < 1 || max > 1000) {
    errors.maxMarks = 'Whole number between 1 and 1000.';
  }

  const pass = Number(form.passMarks);
  if (form.passMarks === '' || !Number.isInteger(pass) || pass < 0 || pass > 1000) {
    errors.passMarks = 'Whole number between 0 and 1000.';
  } else if (!errors.maxMarks && pass > max) {
    errors.passMarks = `Pass marks cannot exceed maximum marks (${max}).`;
  }

  return errors;
}

export const AdminSubjectManagement: React.FC = () => {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [meta, setMeta] = useState<SubjectMeta | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [semester, setSemester] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [status, setStatus] = useState('');

  const [listLoading, setListLoading] = useState(false);

  // Create / edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Status / delete confirmations
  const [statusTarget, setStatusTarget] = useState<SubjectRow | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubjectRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load the filter vocabulary once.
  const loadMeta = useCallback(async () => {
    const res = await api.admin.subjects.meta();
    setMeta(res.data);
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.admin.subjects.list({
        search: searchDebounced,
        departmentId,
        semester,
        academicYear,
        subjectType,
        status,
        page,
        limit: PAGE_SIZE,
      });
      setSubjects(res.data.subjects || []);
      setTotal(res.data.total || 0);
      setPageCount(res.data.pageCount || 1);
    } finally {
      setListLoading(false);
    }
  }, [searchDebounced, departmentId, semester, academicYear, subjectType, status, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([loadMeta(), loadList()]);
    } catch (err: any) {
      const e = err instanceof ApiError ? err : new ApiError(500, err?.message);
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [loadMeta, loadList]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload the list whenever a filter or the page changes (after initial load).
  useEffect(() => {
    if (loading) return;
    loadList().catch((err) => toast.error(err?.message || 'Could not load subjects.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDebounced, departmentId, semester, academicYear, subjectType, status, page]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDebounced, departmentId, semester, academicYear, subjectType, status]);

  const openCreate = () => {
    setEditing(null);
    setFormErrors({});
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (subject: SubjectRow) => {
    setEditing(subject);
    setFormErrors({});
    setForm({
      code: subject.code,
      name: subject.name,
      departmentIds: subject.departmentIds?.length ? subject.departmentIds : subject.departmentId ? [subject.departmentId] : [],
      semesters: (subject.semesters?.length ? subject.semesters : subject.semester ? [subject.semester] : []).map(String),
      academicYears: subject.academicYears?.length ? subject.academicYears : subject.academicYear ? [subject.academicYear] : [],
      regulations: subject.regulations?.length ? subject.regulations : subject.regulation ? [subject.regulation] : [],
      subjectType: subject.subjectType,
      maxMarks: String(subject.maxMarks),
      passMarks: String(subject.passMarks),
      status: subject.status,
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: SubjectInput = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      departmentIds: form.departmentIds,
      semesters: form.semesters.map(Number).sort((a, b) => a - b),
      academicYears: form.academicYears.map((y) => y.trim()).filter(Boolean),
      regulations: form.regulations.map((r) => r.trim().toUpperCase()).filter(Boolean),
      subjectType: form.subjectType,
      maxMarks: Number(form.maxMarks),
      passMarks: Number(form.passMarks),
      status: form.status,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.admin.subjects.update(editing.id, payload);
        toast.success(`Subject ${payload.code} updated.`);
      } else {
        await api.admin.subjects.create(payload);
        toast.success(`Subject ${payload.code} created.`);
      }
      setFormOpen(false);
      await Promise.all([loadList(), loadMeta()]);
    } catch (err: any) {
      const message = err?.message || 'Could not save the subject.';
      // Surface server-side validation on the code field when it is a duplicate.
      if (err instanceof ApiError && err.statusCode === 409) {
        setFormErrors((prev) => ({ ...prev, code: message }));
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    const next: SubjectStatus = statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setStatusBusy(true);
    try {
      await api.admin.subjects.setStatus(statusTarget.id, next);
      toast.success(
        next === 'ACTIVE'
          ? `Subject ${statusTarget.code} activated.`
          : `Subject ${statusTarget.code} deactivated.`
      );
      setStatusTarget(null);
      await loadList();
    } catch (err: any) {
      toast.error(err?.message || 'Could not change the subject status.');
    } finally {
      setStatusBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.admin.subjects.remove(deleteTarget.id);
      toast.success(`Subject ${deleteTarget.code} deleted.`);
      setDeleteTarget(null);
      await Promise.all([loadList(), loadMeta()]);
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete the subject.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const activeCount = useMemo(
    () => subjects.filter((s) => s.status === 'ACTIVE').length,
    [subjects]
  );

  // Multi-select option vocabulary (API-driven from `meta`).
  const departmentOptions = useMemo(
    () => (meta?.departments ?? []).map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` })),
    [meta]
  );
  const semesterOptions = useMemo(
    () =>
      (meta?.semesters ?? [1, 2, 3, 4, 5, 6, 7, 8]).map((s) => ({
        value: String(s),
        label: SEMESTER_LABEL[s] ?? `Semester ${s}`,
      })),
    [meta]
  );
  const academicYearOptions = useMemo(
    () => (meta?.academicYears ?? []).map((y) => ({ value: y, label: y })),
    [meta]
  );
  const regulationOptions = useMemo(
    () => (meta?.regulations ?? []).map((r) => ({ value: r, label: r })),
    [meta]
  );

  // ── Loading / error gates ─────────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (loadError) {
    if (loadError.statusCode === 0) return <NetworkErrorState onRetry={load} fullPage={false} />;
    if (loadError.statusCode === 503) return <ServiceUnavailableState onRetry={load} fullPage={false} />;
    return <ServerErrorState onRetry={load} fullPage={false} />;
  }

  const hasFilters = Boolean(
    searchDebounced || departmentId || semester || academicYear || subjectType || status
  );

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <BookOpen size={13} /> Administration
          </>
        }
        title="Subject Management"
        subtitle="Define the subjects each department may record marks for. Subjects filter by department, semester, academic year and regulation, and drive the marks upload workflow."
        actions={
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={16} /> Add Subject
          </button>
        }
      />

      {/* ==================== FILTERS ==================== */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            alignItems: 'end',
          }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="subject-search">
              Search
            </label>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-slate-400)',
                }}
              />
              <input
                id="subject-search"
                className="form-control"
                style={{ paddingLeft: '2rem' }}
                placeholder="Code or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="subject-dept">
              Department
            </label>
            <select
              id="subject-dept"
              className="form-control"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">All departments</option>
              {(meta?.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="subject-sem">
              Semester
            </label>
            <select
              id="subject-sem"
              className="form-control"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              <option value="">All semesters</option>
              {(meta?.semesters ?? [1, 2, 3, 4, 5, 6, 7, 8]).map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="subject-year">
              Academic year
            </label>
            <input
              id="subject-year"
              className="form-control"
              placeholder="e.g. 2024-2028"
              list="subject-academic-years"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
            <datalist id="subject-academic-years">
              {(meta?.academicYears ?? []).map((y) => (
                <option key={y} value={y} />
              ))}
            </datalist>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="subject-type">
              Type
            </label>
            <select
              id="subject-type"
              className="form-control"
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value)}
            >
              <option value="">All types</option>
              {(meta?.subjectTypes ?? []).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="subject-status">
              Status
            </label>
            <select
              id="subject-status"
              className="form-control"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadList()}
              disabled={listLoading}
              title="Refresh"
            >
              <RefreshCw size={15} className={listLoading ? 'spin' : undefined} /> Refresh
            </button>
            {hasFilters && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearch('');
                  setDepartmentId('');
                  setSemester('');
                  setAcademicYear('');
                  setSubjectType('');
                  setStatus('');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================== TABLE ==================== */}
      <div className="card">
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            <BookOpen size={18} /> {total} Subject{total === 1 ? '' : 's'}
            {subjects.length > 0 ? ` • ${activeCount} active on this page` : ''}
          </h3>
        </div>

        {listLoading && subjects.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-500)' }}>
            <RefreshCw size={20} className="spin" /> Loading subjects…
          </div>
        ) : subjects.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={24} />}
            title={hasFilters ? 'No subjects match these filters' : 'No subjects yet'}
            description={
              hasFilters
                ? 'Try clearing the filters or searching for a different code or name.'
                : 'Add the first subject so it can be selected when entering and uploading student marks.'
            }
            action={
              !hasFilters ? (
                <button className="btn btn-primary btn-sm" onClick={openCreate}>
                  <Plus size={16} /> Add Subject
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Subject</th>
                    <th>Department</th>
                    <th>Sem</th>
                    <th>Academic Year</th>
                    <th>Regulation</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'center' }}>Max / Pass</th>
                    <th style={{ textAlign: 'center' }}>Marks</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => {
                    const inactive = s.status === 'INACTIVE';
                    return (
                      <tr key={s.id} style={inactive ? { opacity: 0.72 } : undefined}>
                        <td style={{ fontWeight: 700 }}>{s.code}</td>
                        <td>{s.name}</td>
                        <td>
                          <div className="subj-tags">
                            {departmentLabels(s).map((d) => (
                              <span key={d.id} className="subj-tag" title={d.name}>
                                {d.code || '—'}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>{semesterLabels(s).join(', ') || '—'}</td>
                        <td>{s.academicYears?.length ? s.academicYears.join(', ') : s.academicYear || '—'}</td>
                        <td>{s.regulations?.length ? s.regulations.join(', ') : s.regulation || '—'}</td>
                        <td>{s.subjectTypeLabel}</td>
                        <td style={{ textAlign: 'center' }}>
                          {s.maxMarks} / {s.passMarks}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span title="Marks records / distinct students">
                            {s.marksRecordCount} / {s.studentCount}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${inactive ? 'badge-neutral' : 'badge-success'}`}>
                            {inactive ? 'INACTIVE' : 'ACTIVE'}
                          </span>
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              gap: '0.35rem',
                              justifyContent: 'flex-end',
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEdit(s)}
                              title="Edit subject"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              className={`btn btn-sm ${inactive ? 'btn-gold' : 'btn-secondary'}`}
                              onClick={() => setStatusTarget(s)}
                              title={inactive ? 'Activate subject' : 'Deactivate subject'}
                            >
                              <Power size={14} /> {inactive ? 'Activate' : 'Deactivate'}
                            </button>
                            {s.marksRecordCount === 0 && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => setDeleteTarget(s)}
                                title="Delete subject"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-500)' }}>
                  Page {page} of {pageCount} • {total} subject{total === 1 ? '' : 's'}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || listLoading}
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount || listLoading}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================== ADD / EDIT MODAL ==================== */}
      <Modal
        isOpen={formOpen}
        onClose={() => (saving ? undefined : setFormOpen(false))}
        title={editing ? `Edit Subject — ${editing.code}` : 'Add Subject'}
        maxWidth="720px"
        onSubmit={handleSave}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Subject'}
            </button>
          </>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.85rem',
          }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="f-code">
              Subject Code <span className="required-star">*</span>
            </label>
            <input
              id="f-code"
              className={`form-control ${formErrors.code ? 'error' : ''}`}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="e.g. CS8491"
              maxLength={30}
            />
            {formErrors.code && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.code}</small>
            )}
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="f-name">
              Subject Name <span className="required-star">*</span>
            </label>
            <input
              id="f-name"
              className={`form-control ${formErrors.name ? 'error' : ''}`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Object Oriented Analysis and Design"
              maxLength={150}
            />
            {formErrors.name && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.name}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-dept">
              Department(s) <span className="required-star">*</span>
            </label>
            <MultiSelect
              id="f-dept"
              ariaLabel="Departments"
              options={departmentOptions}
              value={form.departmentIds}
              onChange={(next) => setForm({ ...form, departmentIds: next })}
              placeholder="Select one or more departments…"
              searchPlaceholder="Search departments…"
              error={Boolean(formErrors.departmentIds)}
            />
            {formErrors.departmentIds && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.departmentIds}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-sem">
              Semester(s) <span className="required-star">*</span>
            </label>
            <MultiSelect
              id="f-sem"
              ariaLabel="Semesters"
              options={semesterOptions}
              value={form.semesters}
              onChange={(next) => setForm({ ...form, semesters: next })}
              placeholder="Select one or more semesters…"
              searchPlaceholder="Search semesters…"
              error={Boolean(formErrors.semesters)}
              maxVisibleChips={8}
            />
            {formErrors.semesters && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.semesters}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-year">
              Academic Year(s) <span className="required-star">*</span>
            </label>
            <MultiSelect
              id="f-year"
              ariaLabel="Academic years"
              options={academicYearOptions}
              value={form.academicYears}
              onChange={(next) => setForm({ ...form, academicYears: next })}
              placeholder="Select or type academic years…"
              searchPlaceholder="Search or type a year (YYYY-YYYY)…"
              error={Boolean(formErrors.academicYears)}
              creatable
              normaliseCustom={(raw) => raw.trim()}
              validateCustom={(raw) => (ACADEMIC_YEAR_RE.test(raw) ? null : 'Use the cohort format YYYY-YYYY.')}
              addLabel={(raw) => `Add academic year “${raw}”`}
            />
            {formErrors.academicYears && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.academicYears}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-reg">
              Regulation(s)
            </label>
            <MultiSelect
              id="f-reg"
              ariaLabel="Regulations"
              options={regulationOptions}
              value={form.regulations}
              onChange={(next) => setForm({ ...form, regulations: next })}
              placeholder="Select or type regulations…"
              searchPlaceholder="Search or type a regulation (e.g. R2021)…"
              error={Boolean(formErrors.regulations)}
              creatable
              normaliseCustom={(raw) => raw.trim().toUpperCase()}
              validateCustom={(raw) => (raw.length > 20 ? 'At most 20 characters.' : null)}
              addLabel={(raw) => `Add regulation “${raw}”`}
            />
            {formErrors.regulations && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.regulations}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-type">
              Subject Type
            </label>
            <select
              id="f-type"
              className="form-control"
              value={form.subjectType}
              onChange={(e) => setForm({ ...form, subjectType: e.target.value as SubjectType })}
            >
              {(meta?.subjectTypes ?? []).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-max">
              Maximum Marks <span className="required-star">*</span>
            </label>
            <input
              id="f-max"
              type="number"
              min={1}
              max={1000}
              className={`form-control ${formErrors.maxMarks ? 'error' : ''}`}
              value={form.maxMarks}
              onChange={(e) => setForm({ ...form, maxMarks: e.target.value })}
              placeholder="100"
            />
            {formErrors.maxMarks && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.maxMarks}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-pass">
              Pass Marks <span className="required-star">*</span>
            </label>
            <input
              id="f-pass"
              type="number"
              min={0}
              max={1000}
              className={`form-control ${formErrors.passMarks ? 'error' : ''}`}
              value={form.passMarks}
              onChange={(e) => setForm({ ...form, passMarks: e.target.value })}
              placeholder="40"
            />
            {formErrors.passMarks && (
              <small style={{ color: 'var(--color-danger, #B91C1C)' }}>{formErrors.passMarks}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="f-status">
              Status
            </label>
            <select
              id="f-status"
              className="form-control"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as SubjectStatus })}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        <div className="alert alert-info" style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
          Editing a subject never changes marks already recorded against it. A subject with recorded
          marks cannot be deleted — deactivate it instead.
        </div>
      </Modal>

      {/* ==================== STATUS CONFIRMATION ==================== */}
      <Modal
        isOpen={Boolean(statusTarget)}
        onClose={() => (statusBusy ? undefined : setStatusTarget(null))}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate Subject' : 'Activate Subject'}
        maxWidth="480px"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setStatusTarget(null)}
              disabled={statusBusy}
            >
              Cancel
            </button>
            <button
              className={`btn ${statusTarget?.status === 'ACTIVE' ? 'btn-danger' : 'btn-primary'}`}
              onClick={confirmStatusChange}
              disabled={statusBusy}
            >
              {statusBusy
                ? 'Working…'
                : statusTarget?.status === 'ACTIVE'
                ? 'Deactivate'
                : 'Activate'}
            </button>
          </>
        }
      >
        {statusTarget?.status === 'ACTIVE' ? (
          <div>
            <p style={{ marginTop: 0 }}>
              <AlertTriangle size={16} color="#B45309" /> Deactivating{' '}
              <strong>
                {statusTarget?.code} — {statusTarget?.name}
              </strong>{' '}
              removes it from the subjects selectable for new marks uploads.
            </p>
            <p style={{ color: 'var(--color-slate-600)' }}>
              Historical marks keep their subject information and stay viewable. You can reactivate the
              subject at any time.
            </p>
          </div>
        ) : (
          <p style={{ marginTop: 0 }}>
            <CheckCircle2 size={16} color="#047857" /> Reactivate{' '}
            <strong>
              {statusTarget?.code} — {statusTarget?.name}
            </strong>
            ? It will become selectable for new marks uploads again.
          </p>
        )}
      </Modal>

      {/* ==================== DELETE CONFIRMATION ==================== */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => (deleteBusy ? undefined : setDeleteTarget(null))}
        title="Delete Subject"
        maxWidth="480px"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBusy}
            >
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete Subject'}
            </button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Permanently delete{' '}
          <strong>
            {deleteTarget?.code} — {deleteTarget?.name}
          </strong>
          ? This cannot be undone. Only subjects with no recorded marks can be deleted.
        </p>
      </Modal>
    </div>
  );
};

export default AdminSubjectManagement;
