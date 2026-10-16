import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  X,
  GraduationCap,
  Users,
  UserCheck,
  UserPlus,
  AlertCircle,
  BookOpen,
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/Skeleton';

/**
 * Click-through behind the seven Admin overview statistics cards.
 *
 * Every card is an aggregate; clicking it opens the real records behind the
 * number. The four list-based aggregates reuse the existing paginated directory
 * endpoints; the three with no other college-wide list use the dedicated
 * `dashboard-details` endpoints. Nothing here re-derives a statistic or shows a
 * placeholder row — the list is always stored records, and the server total
 * drives the pager so it reconciles with the card.
 */

export type StatCardKey =
  | 'totalStudents'
  | 'totalFaculty'
  | 'assignedMentees'
  | 'unassignedStudents'
  | 'activeArrears'
  | 'mentoringSessions'
  | 'uploadedDocuments';

interface StatDetailsModalProps {
  /** Which card was clicked. `null` keeps the modal unmounted. */
  cardKey: StatCardKey | null;
  onClose: () => void;
  /** The card's own value (the aggregate's source of truth), shown in the header. */
  cardValue: number;
}

type Row = Record<string, any>;

interface FetchResult {
  rows: Row[];
  total: number;
  pages: number;
}

const PAGE_LIMIT = 25;

const CARD_META: Record<
  StatCardKey,
  { title: string; description: string; searchPlaceholder: string; icon: React.ReactNode }
> = {
  totalStudents: {
    title: 'Total Students',
    description: 'Every active student on record.',
    searchPlaceholder: 'Search by name or register number…',
    icon: <GraduationCap size={18} />,
  },
  totalFaculty: {
    title: 'Total Faculty',
    description: 'Every active faculty member / mentor on record.',
    searchPlaceholder: 'Search by name, employee ID, email or department…',
    icon: <Users size={18} />,
  },
  assignedMentees: {
    title: 'Assigned Mentees',
    description: 'Active students who currently have a mentor assigned.',
    searchPlaceholder: 'Search by name or register number…',
    icon: <UserCheck size={18} />,
  },
  unassignedStudents: {
    title: 'Unassigned Students',
    description: 'Active students with no current mentor assignment.',
    searchPlaceholder: 'Search by name or register number…',
    icon: <UserPlus size={18} />,
  },
  activeArrears: {
    title: 'Active Arrears',
    description: 'Students carrying at least one uncleared (active) arrear.',
    searchPlaceholder: 'Search by name or register number…',
    icon: <AlertCircle size={18} />,
  },
  mentoringSessions: {
    title: 'Mentoring Sessions',
    description: 'Every mentoring record captured across the college.',
    searchPlaceholder: 'Search by student, mentor, register number or category…',
    icon: <BookOpen size={18} />,
  },
  uploadedDocuments: {
    title: 'Uploaded Documents',
    description: 'Every document uploaded to the institutional repository.',
    searchPlaceholder: 'Search by student, register number, title or category…',
    icon: <FileText size={18} />,
  },
};

const fmtDate = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
};

export const StatDetailsModal: React.FC<StatDetailsModalProps> = ({ cardKey, onClose, cardValue }) => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Total-arrears subject count for the active-arrears drill-down header.
  const [arrearsSubjectTotal, setArrearsSubjectTotal] = useState<number | null>(null);

  // Reset the modal's transient state whenever a different card opens it.
  useEffect(() => {
    setSearchInput('');
    setSearch('');
    setPage(1);
    setRows([]);
    setTotal(0);
    setPages(1);
    setError(null);
    setArrearsSubjectTotal(null);
  }, [cardKey]);

  // Debounce the search box so a request is not issued per keystroke.
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const fetchRows = useCallback(async (): Promise<FetchResult> => {
    const base: Record<string, string> = { page: String(page), limit: String(PAGE_LIMIT) };
    if (search) base.search = search;

    switch (cardKey) {
      case 'totalStudents':
      case 'assignedMentees':
      case 'unassignedStudents': {
        const params: Record<string, string> = { ...base, isActive: 'true' };
        if (cardKey === 'assignedMentees') params.assignmentStatus = 'assigned';
        if (cardKey === 'unassignedStudents') params.assignmentStatus = 'unassigned';
        const res = await api.students.list(params);
        const data = res.data;
        return { rows: data?.students || [], total: data?.total || 0, pages: data?.pages || 1 };
      }
      case 'totalFaculty': {
        // The faculty endpoint returns the whole (already role-scoped) roster in
        // one response and does not paginate. Filter to active + the query, then
        // page the result client-side.
        const res = await api.admin.getFaculty();
        const all: Row[] = (res.data || []).filter((f: any) => f.is_active === 1 || f.is_active === true);
        const q = search.toLowerCase();
        const filtered = q
          ? all.filter((f: any) =>
              [f.full_name, f.employee_id, f.email, f.designation, f.department_name, f.department_code]
                .filter(Boolean)
                .some((v: any) => String(v).toLowerCase().includes(q))
            )
          : all;
        const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_LIMIT));
        const start = (page - 1) * PAGE_LIMIT;
        return { rows: filtered.slice(start, start + PAGE_LIMIT), total: filtered.length, pages: pageCount };
      }
      case 'activeArrears': {
        const res = await api.admin.getActiveArrearsDetails(base);
        const data = res.data;
        setArrearsSubjectTotal(data?.totalActiveArrears ?? 0);
        return { rows: data?.students || [], total: data?.total || 0, pages: data?.pages || 1 };
      }
      case 'mentoringSessions': {
        const res = await api.admin.getMentoringSessionsDetails(base);
        const data = res.data;
        return { rows: data?.records || [], total: data?.total || 0, pages: data?.pages || 1 };
      }
      case 'uploadedDocuments': {
        const res = await api.admin.getUploadedDocumentsDetails(base);
        const data = res.data;
        return { rows: data?.documents || [], total: data?.total || 0, pages: data?.pages || 1 };
      }
      default:
        return { rows: [], total: 0, pages: 1 };
    }
  }, [cardKey, page, search]);

  useEffect(() => {
    if (!cardKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRows()
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
        setPages(result.pages);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load records.');
        setRows([]);
        setTotal(0);
        setPages(1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardKey, fetchRows, reloadKey]);

  if (!cardKey) return null;

  const meta = CARD_META[cardKey];
  const from = total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const to = Math.min(page * PAGE_LIMIT, total);

  const subtitle =
    cardKey === 'activeArrears' && arrearsSubjectTotal !== null
      ? `${cardValue} arrears across ${total} student${total === 1 ? '' : 's'}`
      : `${cardValue} record${cardValue === 1 ? '' : 's'}`;

  return (
    <Modal isOpen onClose={onClose} title={meta.title} maxWidth="960px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Header summary — the card's own value, plus the honest filtered view. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-navy-50)',
              color: 'var(--color-navy-800)',
              flexShrink: 0,
            }}
          >
            {meta.icon}
          </span>
          <div style={{ flex: 1, minWidth: '12rem' }}>
            <div data-testid="stat-detail-summary" style={{ fontWeight: 700, color: 'var(--color-navy-800)' }}>{subtitle}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-slate-500)' }}>{meta.description}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-400)' }}
            aria-hidden="true"
          />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2rem', paddingRight: '2.25rem' }}
            placeholder={meta.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={meta.searchPlaceholder}
          />
          {searchInput.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              title="Clear search"
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--color-slate-400)',
                lineHeight: 0,
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <Skeleton variant="table" rows={6} />
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={22} />}
            title="Could not load records"
            description={error}
            compact
            action={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                <RefreshCw size={14} /> Try again
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={meta.icon}
            title={search ? 'No matching records' : 'Nothing to show'}
            description={
              search
                ? 'No records match your search. Try a different name, register number or keyword.'
                : meta.description
            }
            compact
          />
        ) : (
          <div className="table-responsive" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                {cardKey === 'totalStudents' || cardKey === 'assignedMentees' || cardKey === 'unassignedStudents' ? (
                  <tr>
                    <th>Register No</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Section</th>
                    <th>Batch</th>
                    <th>Mentor</th>
                  </tr>
                ) : cardKey === 'totalFaculty' ? (
                  <tr>
                    <th>Name</th>
                    <th>Employee ID</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th style={{ textAlign: 'right' }}>Mentees</th>
                  </tr>
                ) : cardKey === 'activeArrears' ? (
                  <tr>
                    <th>Register No</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th style={{ textAlign: 'center' }}>Arrears</th>
                    <th>Subjects (semester — code — name)</th>
                  </tr>
                ) : cardKey === 'mentoringSessions' ? (
                  <tr>
                    <th>Date</th>
                    <th>Student</th>
                    <th>Register No</th>
                    <th>Mentor</th>
                    <th>Categories</th>
                    <th>Type</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Student</th>
                    <th>Register No</th>
                    <th>Document</th>
                    <th>Category</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((r) => {
                  if (cardKey === 'totalStudents' || cardKey === 'assignedMentees' || cardKey === 'unassignedStudents') {
                    return (
                      <tr key={r.id || r.student_id}>
                        <td style={{ fontWeight: 700 }}>{r.register_number}</td>
                        <td>{r.full_name}</td>
                        <td>{r.department_code || r.department_name || '—'}</td>
                        <td>{r.section || '—'}</td>
                        <td>{r.batch_name || '—'}</td>
                        <td>{r.current_mentor_name && r.current_mentor_name !== 'Not Assigned' ? r.current_mentor_name : 'Not Assigned'}</td>
                      </tr>
                    );
                  }
                  if (cardKey === 'totalFaculty') {
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                        <td>{r.employee_id}</td>
                        <td>{r.department_code || r.department_name || '—'}</td>
                        <td>{r.designation}</td>
                        <td style={{ textAlign: 'right' }}>{r.mentee_count ?? 0}</td>
                      </tr>
                    );
                  }
                  if (cardKey === 'activeArrears') {
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700 }}>{r.register_number}</td>
                        <td>{r.full_name}</td>
                        <td>{r.department_code || r.department_name || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-danger">{r.active_arrears}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {(r.subjects || []).map((s: any, i: number) => (
                              <span key={i} style={{ fontSize: '0.8rem', color: 'var(--color-slate-600)' }}>
                                <strong>Sem {s.semester ?? '—'}</strong>
                                {s.subject_code ? ` — ${s.subject_code}` : ''}
                                {s.subject_name && s.subject_name !== 'Not Provided' ? ` — ${s.subject_name}` : ''}
                              </span>
                            ))}
                            {(!r.subjects || r.subjects.length === 0) && (
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-500)' }}>—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  if (cardKey === 'mentoringSessions') {
                    return (
                      <tr key={r.id}>
                        <td>{fmtDate(r.date)}</td>
                        <td style={{ fontWeight: 600 }}>{r.student_name || '—'}</td>
                        <td>{r.register_number || '—'}</td>
                        <td>{r.mentor_name || '—'}</td>
                        <td>{Array.isArray(r.categories) && r.categories.length ? r.categories.join(', ') : '—'}</td>
                        <td>
                          <span className="badge badge-primary">
                            {r.record_kind === 'SATURDAY_COMMON' ? 'Saturday Common' : 'Individual'}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  // uploadedDocuments
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.student_name || '—'}</td>
                      <td>{r.register_number || '—'}</td>
                      <td>{r.title || r.file_name || '—'}</td>
                      <td>{r.category || '—'}</td>
                      <td>{fmtDate(r.uploaded_at)}</td>
                      <td>
                        <span
                          className={`badge ${
                            r.verification_status === 'Verified' || r.verification_status === 'Approved'
                              ? 'badge-success'
                              : r.verification_status === 'Rejected'
                                ? 'badge-danger'
                                : 'badge-warning'
                          }`}
                        >
                          {r.verification_status || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pager */}
        {!loading && !error && total > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
              borderTop: '1px solid var(--color-slate-200, #E2E8F0)',
              paddingTop: '0.75rem',
            }}
          >
            <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-500)' }} aria-live="polite">
              Showing {from}–{to} of {total.toLocaleString()}
              {search ? ` matching “${search}”` : ''}
            </span>
            {pages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-600)' }}>
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
