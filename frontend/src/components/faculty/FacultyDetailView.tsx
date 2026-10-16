import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users,
  ClipboardList,
  CalendarCheck2,
  FileText,
  History,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Building2,
  IdCard,
  BadgeCheck,
  Eye,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../../context/ToastContext';
import {
  api,
  type HodFacultyRow,
  type HodMentorDetail,
  type HodMentorDocumentRow,
} from '../../api/client';

export type FacultyDetailTab =
  | 'overview'
  | 'mentees'
  | 'counselling'
  | 'meetings'
  | 'documents'
  | 'assignments';

interface FacultyDetailViewProps {
  isOpen: boolean;
  onClose: () => void;
  /** The faculty row that was clicked (used for the title while loading). */
  faculty: HodFacultyRow | null;
  detail: HodMentorDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onEdit: (faculty: HodFacultyRow) => void;
  onOpenMentee: (studentId: string) => void;
  monthLabel: string;
  monthShort: string;
}

const TAB_DEFS: { key: FacultyDetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'mentees', label: 'Mentees' },
  { key: 'counselling', label: 'Mentoring History' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'documents', label: 'Documents' },
  { key: 'assignments', label: 'Assignment History' },
];

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDay = (value: string | null | undefined): string => {
  if (!value) return '—';
  return String(value).slice(0, 10);
};

const titleCase = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/(^|[\s_-])([a-z])/g, (_m, sep, ch) => `${sep === '_' || sep === '-' ? ' ' : sep}${ch.toUpperCase()}`);

const assignmentBadgeClass = (status: string): string => {
  const s = String(status).toUpperCase();
  if (s === 'ACTIVE') return 'badge-success';
  if (s === 'TRANSFERRED') return 'badge-warning';
  return 'badge-neutral';
};

/** A labelled block of free text; renders an em dash when empty. */
const NoteField: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="faculty-note">
    <span className="faculty-note-label">{label}</span>
    <span className="faculty-note-value">{value && String(value).trim() ? value : '—'}</span>
  </div>
);

export const FacultyDetailView: React.FC<FacultyDetailViewProps> = ({
  isOpen,
  onClose,
  faculty,
  detail,
  loading,
  error,
  onRetry,
  onEdit,
  onOpenMentee,
  monthLabel,
  monthShort,
}) => {
  const toast = useToast();
  const [tab, setTab] = useState<FacultyDetailTab>('overview');
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; mimeType: string; fileName: string } | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Reset to the first tab whenever a different faculty member is opened.
  useEffect(() => {
    if (isOpen) setTab('overview');
  }, [isOpen, faculty?.id]);

  const closePreview = useCallback(() => {
    if (previewUrlRef.current) {
      window.URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
  }, []);

  useEffect(() => () => closePreview(), [closePreview]);

  const viewDocument = async (doc: HodMentorDocumentRow) => {
    setDocBusyId(doc.id);
    try {
      const { blob, mimeType, fileName } = await api.documents.fetchViewBlob(doc.id);
      if (previewUrlRef.current) window.URL.revokeObjectURL(previewUrlRef.current);
      const url = window.URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreview({ url, mimeType, fileName: fileName || doc.fileName || 'document' });
    } catch (err: any) {
      toast.error('Could not open document: ' + err.message);
    } finally {
      setDocBusyId(null);
    }
  };

  const downloadDocument = async (doc: HodMentorDocumentRow) => {
    setDocBusyId(doc.id);
    try {
      await api.documents.download(doc.id, doc.fileName || doc.title);
    } catch (err: any) {
      toast.error('Download failed: ' + err.message);
    } finally {
      setDocBusyId(null);
    }
  };

  const title = faculty?.full_name ? `${faculty.full_name} — Faculty Detail` : 'Faculty Detail';

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % TAB_DEFS.length
        : (index - 1 + TAB_DEFS.length) % TAB_DEFS.length;
    setTab(TAB_DEFS[next].key);
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="1100px">
        {loading && !detail ? (
          <div className="faculty-detail-status" role="status" aria-live="polite">
            <Loader2 size={26} className="faculty-detail-spinner" aria-hidden="true" />
            <p>Loading mentoring records…</p>
          </div>
        ) : error && !detail ? (
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title="Could not load this faculty member"
            description={error}
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
                Try again
              </button>
            }
          />
        ) : detail ? (
          <>
            {/* ---------- profile header ---------- */}
            <div className="faculty-detail-profile">
              <div className="faculty-detail-profile-main">
                <h3 className="faculty-detail-name">{detail.mentor.fullName}</h3>
                <p className="faculty-detail-designation">
                  {detail.mentor.designation || 'Faculty'}
                  {detail.mentor.department ? ` · ${detail.mentor.department}` : ''}
                </p>
                <span className={`badge ${detail.mentor.isActive ? 'badge-success' : 'badge-danger'}`}>
                  {detail.mentor.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="faculty-detail-facts">
                <span><IdCard size={15} aria-hidden="true" /> {detail.mentor.employeeId || '—'}</span>
                <span><Mail size={15} aria-hidden="true" /> {detail.mentor.email || '—'}</span>
                <span><Phone size={15} aria-hidden="true" /> {detail.mentor.phoneNumber || 'Not available'}</span>
                <span><MapPin size={15} aria-hidden="true" /> {detail.mentor.cabinLocation || '—'}</span>
                <span><Building2 size={15} aria-hidden="true" /> {detail.mentor.department || '—'}</span>
              </div>
              {faculty && (
                <button type="button" className="btn btn-outline btn-sm faculty-detail-edit" onClick={() => onEdit(faculty)}>
                  <BadgeCheck size={15} /> Edit Faculty
                </button>
              )}
            </div>

            {/* ---------- tabs ---------- */}
            <div className="tabs" role="tablist" aria-label="Faculty mentoring sections">
              {TAB_DEFS.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`faculty-tab-${t.key}`}
                  aria-selected={tab === t.key}
                  aria-controls={`faculty-panel-${t.key}`}
                  tabIndex={tab === t.key ? 0 : -1}
                  className={`tab-btn ${tab === t.key ? 'active' : ''}`}
                  onClick={() => setTab(t.key)}
                  onKeyDown={(e) => onTabKeyDown(e, i)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              className="faculty-tab-panel"
              role="tabpanel"
              id={`faculty-panel-${tab}`}
              aria-labelledby={`faculty-tab-${tab}`}
            >
              {tab === 'overview' && <OverviewPanel detail={detail} monthLabel={monthLabel} monthShort={monthShort} />}
              {tab === 'mentees' && <MenteesPanel detail={detail} onOpenMentee={onOpenMentee} />}
              {tab === 'counselling' && <CounsellingPanel detail={detail} />}
              {tab === 'meetings' && <MeetingsPanel detail={detail} />}
              {tab === 'documents' && (
                <DocumentsPanel
                  detail={detail}
                  docBusyId={docBusyId}
                  onView={viewDocument}
                  onDownload={downloadDocument}
                />
              )}
              {tab === 'assignments' && <AssignmentsPanel detail={detail} />}
            </div>
          </>
        ) : null}
      </Modal>

      {/* ---------- inline document preview ---------- */}
      <Modal
        isOpen={Boolean(preview)}
        onClose={closePreview}
        title={preview?.fileName || 'Document Preview'}
        maxWidth="900px"
      >
        {preview ? (
          <div className="faculty-doc-preview">
            {preview.mimeType.startsWith('image/') ? (
              <img src={preview.url} alt={preview.fileName} className="faculty-doc-preview-img" />
            ) : preview.mimeType.includes('pdf') ? (
              <iframe src={preview.url} title={preview.fileName} className="faculty-doc-preview-frame" />
            ) : (
              <div className="faculty-detail-status">
                <FileText size={26} aria-hidden="true" />
                <p>This file type cannot be previewed. Use the download action instead.</p>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
};

/* ------------------------------------------------------------- panels */

const OverviewPanel: React.FC<{ detail: HodMentorDetail; monthLabel: string; monthShort: string }> = ({
  detail,
  monthLabel,
  monthShort,
}) => {
  const historicalCount = detail.assignments.filter((a) => !a.isCurrent).length;
  return (
    <>
      <div className="overview-summary-grid">
        <div className="overview-summary-card">
          <span className="overview-summary-label">Total Mentees</span>
          <span className="overview-summary-value">{detail.summary.totalMentees}</span>
        </div>
        <div className="overview-summary-card">
          <span className="overview-summary-label">Mentored {monthShort}</span>
          <span className="overview-summary-value">{detail.summary.mentoredThisMonth}</span>
        </div>
        <div className="overview-summary-card">
          <span className="overview-summary-label">Pending</span>
          <span className="overview-summary-value">{detail.summary.pending}</span>
        </div>
        <div className="overview-summary-card">
          <span className="overview-summary-label">Coverage</span>
          <span className="overview-summary-value">{detail.summary.coveragePercent}%</span>
        </div>
        <div className="overview-summary-card">
          <span className="overview-summary-label">Sessions This Month</span>
          <span className="overview-summary-value">{detail.summary.sessionsThisMonth}</span>
        </div>
        <div className="overview-summary-card">
          <span className="overview-summary-label">Sessions (All Time)</span>
          <span className="overview-summary-value">{detail.summary.sessionCount}</span>
        </div>
      </div>

      <div className="faculty-overview-grid">
        <div className="faculty-overview-block">
          <div className="section-heading">Mentoring Progress</div>
          <div className="faculty-coverage-row">
            <span className="faculty-stat-label">Coverage for {monthLabel}</span>
            <span className="faculty-stat-value">{detail.summary.coveragePercent}%</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, Math.max(0, detail.summary.coveragePercent))}%`,
                background:
                  detail.summary.coveragePercent >= 80
                    ? 'var(--color-success-600)'
                    : detail.summary.coveragePercent >= 50
                      ? 'var(--color-warning-600)'
                      : '#E11D48',
              }}
            />
          </div>
          <ul className="faculty-overview-list">
            <li>
              <span>Reporting month</span>
              <strong>{monthLabel}</strong>
            </li>
            <li>
              <span>Last mentoring date</span>
              <strong>{detail.summary.lastMentoringDate || 'Never'}</strong>
            </li>
            <li>
              <span>Mentoring records</span>
              <strong>{detail.counselling.length}</strong>
            </li>
            <li>
              <span>Meetings recorded</span>
              <strong>{detail.meetings.length}</strong>
            </li>
            <li>
              <span>Documents on file</span>
              <strong>{detail.documents.length}</strong>
            </li>
          </ul>
        </div>
        <div className="faculty-overview-block">
          <div className="section-heading">Assignment Summary</div>
          <ul className="faculty-overview-list">
            <li>
              <span>Current mentees</span>
              <strong>{detail.summary.totalMentees}</strong>
            </li>
            <li>
              <span>Historical assignments</span>
              <strong>{historicalCount}</strong>
            </li>
            <li>
              <span>Total assignment records</span>
              <strong>{detail.assignments.length}</strong>
            </li>
          </ul>
          <p className="faculty-overview-hint">
            Every figure above is read from stored mentoring records. No value is estimated.
          </p>
        </div>
      </div>
    </>
  );
};

const MenteesPanel: React.FC<{ detail: HodMentorDetail; onOpenMentee: (id: string) => void }> = ({
  detail,
  onOpenMentee,
}) => {
  if (detail.mentees.length === 0) {
    return (
      <EmptyState
        icon={<Users size={24} />}
        title="No mentees assigned"
        description="This faculty member currently has no active mentor assignments in your department."
      />
    );
  }
  return (
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Register Number</th>
            <th>Student Name</th>
            <th>Class</th>
            <th>Assignment</th>
            <th>Sessions</th>
            <th>Last Mentoring</th>
            <th>This Month</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {detail.mentees.map((m) => (
            <tr key={m.id}>
              <td style={{ fontWeight: 700 }}>{m.registerNumber || '—'}</td>
              <td><strong>{m.fullName || '—'}</strong></td>
              <td>
                {[m.year ? `Year ${m.year}` : '', m.section || '', m.batch || '']
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </td>
              <td>
                <span className={`badge ${m.isActive === false ? 'badge-danger' : 'badge-success'}`}>
                  {m.isActive === false ? 'Student inactive' : 'Active'}
                </span>
              </td>
              <td>{m.sessionCount ?? 0}</td>
              <td>{m.lastMentoringDate || '—'}</td>
              <td>
                <span className={`badge ${m.mentoredThisMonth ? 'badge-success' : 'badge-danger'}`}>
                  {m.mentoredThisMonth ? 'Covered' : 'Pending'}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onOpenMentee(m.id)}
                >
                  <Eye size={14} /> Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CounsellingPanel: React.FC<{ detail: HodMentorDetail }> = ({ detail }) => {
  if (detail.counselling.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList size={24} />}
        title="No mentoring records"
        description="No mentoring sessions have been recorded by this faculty member yet."
      />
    );
  }
  return (
    <div className="timeline">
      {detail.counselling.map((c) => (
        <div className="timeline-item" key={c.id}>
          <span className="timeline-dot active" aria-hidden="true" />
          <div className="faculty-timeline-card">
            <div className="faculty-timeline-head">
              <span className="faculty-timeline-date">{formatDay(c.date)}</span>
              <strong>{c.studentName || 'Student'}</strong>
              <span className="faculty-timeline-sub">{c.registerNumber}</span>
            </div>
            <div className="faculty-chip-row">
              {(c.categories.length ? c.categories : ['Uncategorised']).map((cat) => (
                <span className="badge badge-info" key={cat}>{cat}</span>
              ))}
              <span className="badge badge-neutral">
                {c.recordKind === 'SATURDAY_COMMON' ? 'Saturday Common' : 'Individual'}
              </span>
              {c.discussionWith.length > 0 && (
                <span className="badge badge-primary">
                  With {c.discussionWith.map(titleCase).join(' & ')}
                </span>
              )}
              {c.status && <span className="badge badge-secondary">{c.status}</span>}
              {c.followUpDate && <span className="badge badge-warning">Follow-up {formatDay(c.followUpDate)}</span>}
            </div>
            <div className="faculty-note-grid">
              <NoteField label="Concern / Reason" value={c.concernReason} />
              <NoteField label="Observation" value={c.observation} />
              <NoteField label="Skill needing improvement" value={c.skillNeedingImprovement} />
              <NoteField label="Action plan" value={c.actionPlan} />
              <NoteField label="Expected improvement" value={c.expectedImprovement} />
              <NoteField label="Student feedback" value={c.studentFeedback} />
              <NoteField label="Mentor remarks" value={c.mentorRemarks} />
            </div>
            {c.evidenceCount > 0 && (
              <p className="faculty-timeline-sub">{c.evidenceCount} evidence photo(s) attached to the original record.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const MeetingsPanel: React.FC<{ detail: HodMentorDetail }> = ({ detail }) => {
  if (detail.meetings.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck2 size={24} />}
        title="No meetings recorded"
        description="No Saturday or individual meetings have been recorded by this faculty member yet."
      />
    );
  }
  return (
    <div className="timeline">
      {detail.meetings.map((m) => (
        <div className="timeline-item" key={m.id}>
          <span className="timeline-dot" aria-hidden="true" />
          <div className="faculty-timeline-card">
            <div className="faculty-timeline-head">
              <span className="faculty-timeline-date">{formatDay(m.meetingDate)}</span>
              <strong>{m.studentName || 'Student'}</strong>
              <span className="faculty-timeline-sub">{m.registerNumber}</span>
            </div>
            <div className="faculty-chip-row">
              {m.meetingStatus && <span className="badge badge-secondary">{titleCase(m.meetingStatus)}</span>}
              {m.attendanceStatus && <span className="badge badge-info">{titleCase(m.attendanceStatus)}</span>}
              {m.meetingTime && <span className="badge badge-neutral">{m.meetingTime}</span>}
              {m.location && <span className="badge badge-neutral">{m.location}</span>}
              {m.followUpRequired && (
                <span className="badge badge-warning">
                  Follow-up{m.followUpDate ? ` ${formatDay(m.followUpDate)}` : ''}
                </span>
              )}
            </div>
            <div className="faculty-note-grid">
              <NoteField label="Challenges / topics discussed" value={m.challengesDiscussed} />
              <NoteField label="Mentoring provided" value={m.counsellingProvided} />
              <NoteField label="Corrective action" value={m.correctiveAction} />
              <NoteField label="Student feedback" value={m.studentFeedback} />
              <NoteField label="Mentor remarks" value={m.mentorRemarks} />
            </div>
            {m.evidenceCount > 0 && (
              <p className="faculty-timeline-sub">{m.evidenceCount} evidence photo(s) attached to the original record.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const DocumentsPanel: React.FC<{
  detail: HodMentorDetail;
  docBusyId: string | null;
  onView: (doc: HodMentorDocumentRow) => void;
  onDownload: (doc: HodMentorDocumentRow) => void;
}> = ({ detail, docBusyId, onView, onDownload }) => {
  if (detail.documents.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={24} />}
        title="No documents available"
        description="None of this faculty member's current mentees have uploaded certificates or supporting documents."
      />
    );
  }
  return (
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Student</th>
            <th>Category</th>
            <th>Type</th>
            <th>Status</th>
            <th>Size</th>
            <th>Uploaded</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {detail.documents.map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.title || d.fileName || 'Document'}</strong>
                {d.isPrimary && <span className="badge badge-primary" style={{ marginLeft: '0.4rem' }}>Primary</span>}
              </td>
              <td>
                {d.studentName || '—'}
                <br />
                <span className="faculty-timeline-sub">{d.registerNumber}</span>
              </td>
              <td>{d.category || '—'}</td>
              <td>{d.documentType === 'student_details_form' ? 'Details Form' : titleCase(d.documentType)}</td>
              <td>
                <span
                  className={`badge ${
                    d.verificationStatus === 'Verified' || d.verificationStatus === 'Approved'
                      ? 'badge-success'
                      : d.verificationStatus === 'Rejected'
                        ? 'badge-danger'
                        : 'badge-neutral'
                  }`}
                >
                  {d.verificationStatus || 'Pending'}
                </span>
              </td>
              <td>{formatBytes(d.fileSize)}</td>
              <td>{formatDateTime(d.uploadedAt)}</td>
              <td>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onView(d)}
                    disabled={docBusyId === d.id}
                  >
                    {docBusyId === d.id ? <Loader2 size={14} className="faculty-detail-spinner" /> : <Eye size={14} />} View
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onDownload(d)}
                    disabled={docBusyId === d.id}
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AssignmentsPanel: React.FC<{ detail: HodMentorDetail }> = ({ detail }) => {
  if (detail.assignments.length === 0) {
    return (
      <EmptyState
        icon={<History size={24} />}
        title="No assignment history"
        description="No mentor-assignment records exist for this faculty member in your department."
      />
    );
  }
  return (
    <div className="timeline">
      {detail.assignments.map((a) => (
        <div className="timeline-item" key={a.id}>
          <span className={`timeline-dot ${a.isCurrent ? 'active' : ''}`} aria-hidden="true" />
          <div className="faculty-timeline-card">
            <div className="faculty-timeline-head">
              <strong>{a.studentName || 'Student'}</strong>
              <span className="faculty-timeline-sub">{a.registerNumber}</span>
              <span className={`badge ${assignmentBadgeClass(a.status)}`}>
                {a.isCurrent ? 'Current' : titleCase(a.status)}
              </span>
            </div>
            <div className="faculty-chip-row">
              <span className="badge badge-neutral">From {formatDay(a.assignedFrom)}</span>
              <span className="badge badge-neutral">
                {a.assignedUntil ? `Until ${formatDay(a.assignedUntil)}` : 'Ongoing'}
              </span>
            </div>
            {a.changeReason && <p className="faculty-timeline-note">{a.changeReason}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default FacultyDetailView;
