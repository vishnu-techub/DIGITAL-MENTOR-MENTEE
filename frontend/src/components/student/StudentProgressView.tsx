import React, { useState, useEffect } from 'react';
import { api, type RecordState, type RecordPermissions } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import { RecordStatusBadge, readPermissions } from '../../lib/recordStatus';
import { PageHeader } from '../common/PageHeader';
import {
  Award,
  Trophy,
  Sparkles,
  Plus,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  Trash2,
  Edit,
  ExternalLink,
  Calendar,
  Building,
  Upload,
  RefreshCw,
  Eye,
  Send,
  Lock,
} from 'lucide-react';

interface StudentProgressRecord {
  _id: string;
  category: string;
  activityName: string;
  organization?: string;
  eventName?: string;
  date?: string;
  level?: string;
  description?: string;
  certificateUrl?: string;
  fileName?: string;
  fileSize?: number;
  /**
   * The persisted state, sent by the server. Never derived on the client.
   * `permissions` is the authoritative capability set; when it is absent the
   * record is treated as read-only rather than assumed editable.
   */
  status: RecordState;
  permissions?: RecordPermissions;
  rejectionReason?: string;
  reviewerName?: string;
  reviewedAt?: string;
  createdAt: string;
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

const LEVELS = ['College', 'State', 'National', 'International'];

export const StudentProgressView: React.FC = () => {
  const toast = useToast();
  const [records, setRecords] = useState<StudentProgressRecord[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('ALL');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<StudentProgressRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: 'Hackathon Certificate',
    activityName: '',
    organization: '',
    eventName: '',
    date: new Date().toISOString().split('T')[0],
    level: 'National',
    description: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const res = await api.studentProgress.getMyProgress();
      if (res.success && res.data) {
        setRecords(res.data.records || []);
        setCategoryCounts(res.data.categoryCounts || {});
      }
    } catch (err: any) {
      toast.error('Failed to load your progress records: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, []);

  const handleOpenAdd = () => {
    setEditingRecord(null);
    setSelectedFile(null);
    setErrors({});
    setForm({
      category: 'Hackathon Certificate',
      activityName: '',
      organization: '',
      eventName: '',
      date: new Date().toISOString().split('T')[0],
      level: 'National',
      description: '',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (record: StudentProgressRecord) => {
    setEditingRecord(record);
    setSelectedFile(null);
    setErrors({});
    setForm({
      category: record.category || 'Hackathon Certificate',
      activityName: record.activityName || '',
      organization: record.organization || '',
      eventName: record.eventName || '',
      date: record.date || new Date().toISOString().split('T')[0],
      level: record.level || 'College',
      description: record.description || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!form.category.trim()) newErrors.category = 'Category is required.';
    if (!form.activityName.trim()) newErrors.activityName = 'Activity / Certificate Name is required.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', form.category);
      formData.append('activityName', form.activityName);
      formData.append('organization', form.organization);
      formData.append('eventName', form.eventName);
      formData.append('date', form.date);
      formData.append('level', form.level);
      formData.append('description', form.description);

      if (selectedFile) {
        formData.append('certificate', selectedFile);
      }

      if (editingRecord) {
        await api.studentProgress.update(editingRecord._id, formData);
        toast.success(
          'Changes saved. Use "Submit for Review" to send this to your mentor.'
        );
      } else {
        await api.studentProgress.create(formData);
        toast.success('Achievement added successfully! Automatically shared with your mentor.');
      }

      setShowModal(false);
      await fetchProgress();
    } catch (err: any) {
      toast.error('Failed to save achievement: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Submit an editable record for mentor review. This is a distinct action from
   * saving: the backend moves the record to SUBMITTED, after which the student
   * is read-only until the mentor responds.
   */
  const handleSubmitForReview = async (id: string) => {
    setSubmittingId(id);
    try {
      const res: any = await api.studentProgress.submit(id);
      toast.success(
        res?.message || 'Submitted for mentor review. The record is read-only until they respond.'
      );
      await fetchProgress();
    } catch (err: any) {
      toast.error('Failed to submit for review: ' + (err.message || ''));
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this achievement record?')) return;
    setDeletingId(id);
    try {
      await api.studentProgress.delete(id);
      toast.success('Record deleted successfully.');
      await fetchProgress();
    } catch (err: any) {
      toast.error('Failed to delete record: ' + (err.message || ''));
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered records
  const filteredRecords = selectedFilter === 'ALL'
    ? records
    : records.filter((r) => r.category === selectedFilter);

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Hackathon Certificate':
        return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };
      case 'NPTEL Certificate':
        return { bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8' };
      case 'Global Certification':
        return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' };
      case 'Symposium Certificate':
        return { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' };
      case 'Award Certificate':
        return { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' };
      case 'Event Certificate':
        return { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' };
      default:
        return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' };
    }
  };

  /**
   * The badge is rendered from the backend's own state + permission payload via
   * the shared component, so this screen and the mentor screen can never disagree
   * about what state a record is in.
   */
  const getStatusBadge = (record: StudentProgressRecord) => {
    const perms = readPermissions(record);
    const reason = record.rejectionReason
      ? `Changes requested: ${record.rejectionReason}`
      : perms?.explanation;
    return (
      <span title={reason}>
        <RecordStatusBadge record={record} />
      </span>
    );
  };

  /** The state as sent by the server, for copy that mentions the state by name. */
  const stateOf = (record: StudentProgressRecord) => readPermissions(record)?.state ?? record.status;

  return (
    <div className="student-progress-container" style={{ padding: '0.5rem 0' }}>
      <PageHeader
        eyebrow={<><Trophy size={14} aria-hidden="true" /> Student</>}
        title="My Progress & Achievements"
        subtitle="Maintain your accomplishments, certifications, hackathons, and activities. Submissions automatically sync with your assigned mentor and appear in institutional Excel records."
        actions={
          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn btn-primary"
            style={{
              backgroundColor: '#F59E0B',
              borderColor: '#F59E0B',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Add Achievement
          </button>
        }
      />

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="card" style={{ padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #3B82F6' }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Hackathons
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1E3A8A', marginTop: '0.25rem' }}>
            {categoryCounts['Hackathon Certificate'] || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #EC4899' }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            NPTEL Certs
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#831843', marginTop: '0.25rem' }}>
            {categoryCounts['NPTEL Certificate'] || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #10B981' }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Global Certs
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#064E3B', marginTop: '0.25rem' }}>
            {categoryCounts['Global Certification'] || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #8B5CF6' }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Symposiums
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4C1D95', marginTop: '0.25rem' }}>
            {categoryCounts['Symposium Certificate'] || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Awards & Prizes
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#78350F', marginTop: '0.25rem' }}>
            {categoryCounts['Award Certificate'] || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #0284C7' }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Event Certs
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0C4A6E', marginTop: '0.25rem' }}>
            {categoryCounts['Event Certificate'] || 0}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {[
          { key: 'ALL', label: 'All Records' },
          { key: 'Hackathon Certificate', label: 'Hackathons' },
          { key: 'NPTEL Certificate', label: 'NPTEL' },
          { key: 'Global Certification', label: 'Global Certs' },
          { key: 'Symposium Certificate', label: 'Symposiums' },
          { key: 'Award Certificate', label: 'Awards' },
          { key: 'Event Certificate', label: 'Events' },
          { key: 'Extension Activity', label: 'Extension' },
          { key: 'Extra Curricular', label: 'Extra Curricular' },
        ].map((tab) => {
          const active = selectedFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedFilter(tab.key)}
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: active ? '1px solid #2563EB' : '1px solid #E2E8F0',
                backgroundColor: active ? '#EFF6FF' : '#ffffff',
                color: active ? '#1D4ED8' : '#64748B',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Records Section */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748B' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
          <div>Loading your achievements...</div>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            borderRadius: '12px',
            backgroundColor: '#F8FAFC',
            border: '2px dashed #CBD5E1',
          }}
        >
          <Award size={40} color="#94A3B8" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ margin: '0 0 0.4rem 0', color: '#1E293B', fontWeight: 700 }}>
            No Achievements Recorded Yet
          </h4>
          <p style={{ margin: '0 auto 1.25rem', color: '#64748B', fontSize: '0.85rem', maxWidth: '450px' }}>
            Click "+ Add Achievement" to register your hackathons, NPTEL certificates, symposiums, or awards.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn btn-primary btn-sm"
            style={{ fontWeight: 700 }}
          >
            <Plus size={14} /> Add First Achievement
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filteredRecords.map((r) => {
            const styleBadge = getCategoryColor(r.category);
            // Authoritative capabilities, computed by the backend. A missing
            // payload means the record is rendered read-only: the client never
            // assumes editability.
            const perms = readPermissions(r);
            return (
              <div
                key={r._id}
                className="card"
                style={{
                  padding: '1.1rem 1.25rem',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '6px',
                          backgroundColor: styleBadge.bg,
                          color: styleBadge.text,
                          border: `1px solid ${styleBadge.border}`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {r.category}
                      </span>
                      {getStatusBadge(r)}
                      {r.level && (
                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                          • {r.level} Level
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                      {r.activityName}
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#475569' }}>
                      {(r.eventName || r.organization) && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Building size={14} color="#64748B" />
                          <span>{[r.eventName, r.organization].filter(Boolean).join(' — ')}</span>
                        </div>
                      )}
                      {r.date && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Calendar size={14} color="#64748B" />
                          <span>{r.date}</span>
                        </div>
                      )}
                    </div>

                    {r.description && (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem', color: '#475569', fontStyle: 'italic' }}>
                        "{r.description}"
                      </p>
                    )}

                    {r.status === 'Rejected' && r.rejectionReason && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          backgroundColor: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          color: '#991B1B',
                        }}
                      >
                        <strong>Review Feedback:</strong> {r.rejectionReason}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {r.certificateUrl ? (
                      <a
                        href={r.certificateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-outline"
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          color: '#0284C7',
                          borderColor: '#BAE6FD',
                          backgroundColor: '#F0F9FF',
                        }}
                      >
                        <Eye size={13} /> View Certificate
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.74rem', color: '#94A3B8', fontStyle: 'italic' }}>
                        No file uploaded
                      </span>
                    )}

                    {/* Every action below is gated on the SERVER-derived
                        capability set. In a read-only state the edit control is
                        not rendered at all; the reason is shown instead, so the
                        student is never left guessing why nothing is clickable. */}
                    {perms?.canEdit ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(r)}
                          className="btn btn-sm btn-secondary"
                          style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', borderRadius: '6px' }}
                          title={
                            stateOf(r) === 'Editing'
                              ? 'Continue editing this achievement'
                              : 'Edit this achievement'
                          }
                        >
                          <Edit size={13} />
                          {stateOf(r) === 'Editing' ? 'Continue Editing' : 'Edit'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSubmitForReview(r._id)}
                          disabled={submittingId === r._id}
                          className="btn btn-sm btn-primary"
                          style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', borderRadius: '6px' }}
                          title={
                            stateOf(r) === 'Rejected'
                              ? 'Resubmit to your mentor'
                              : 'Submit to your mentor for review'
                          }
                        >
                          <Send size={13} />
                          {stateOf(r) === 'Rejected' ? 'Resubmit' : 'Submit for Review'}
                        </button>
                      </>
                    ) : (
                      perms?.reason && (
                        <span className="unavailable-action" title={perms.explanation}>
                          <Lock size={13} aria-hidden="true" />
                          {perms.reason}
                        </span>
                      )
                    )}

                    {perms?.canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(r._id)}
                        disabled={deletingId === r._id}
                        className="btn btn-sm btn-danger"
                        style={{
                          fontSize: '0.78rem',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          backgroundColor: '#FEE2E2',
                          color: '#DC2626',
                          borderColor: '#FECACA',
                        }}
                        title="Delete Achievement"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    ) : perms?.locked ? (
                      <span className="unavailable-action" title={perms.explanation}>
                        <Lock size={13} aria-hidden="true" />
                        Permanently Locked
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Achievement Modal */}
      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingRecord ? 'Edit Achievement / Progress Record' : 'Add New Achievement / Certificate'}
          maxWidth="640px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="student-progress-form"
                className="btn btn-primary"
                disabled={submitting}
                style={{ fontWeight: 700 }}
              >
                {submitting ? 'Saving...' : editingRecord ? 'Update Achievement' : 'Submit Achievement'}
              </button>
            </div>
          }
        >
          <form id="student-progress-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
              Enter your verified activity details below. This will immediately be available to your mentor and reflected in official reports.
            </p>

            {/* Category * */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Category <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select
                className="form-control"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{ fontSize: '0.88rem', minHeight: '42px' }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.category && (
                <div style={{ color: '#DC2626', fontSize: '0.76rem', marginTop: '3px' }}>
                  {errors.category}
                </div>
              )}
            </div>

            {/* Activity / Certificate Name * */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Activity / Certificate Name <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                className="form-control"
                required
                placeholder="e.g. Smart India Hackathon 2026 / AWS Cloud Practitioner / NPTEL Python"
                value={form.activityName}
                onChange={(e) => setForm({ ...form, activityName: e.target.value })}
                style={{ fontSize: '0.88rem', minHeight: '42px' }}
              />
              {errors.activityName && (
                <div style={{ color: '#DC2626', fontSize: '0.76rem', marginTop: '3px' }}>
                  {errors.activityName}
                </div>
              )}
            </div>

            {/* Event / Program Name & Organization */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Event / Program Name
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. National Hackathon / TechSymposium"
                  value={form.eventName}
                  onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                  style={{ fontSize: '0.88rem', minHeight: '42px' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Organization / Institution
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. AICTE / IIT Madras / Amazon"
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                  style={{ fontSize: '0.88rem', minHeight: '42px' }}
                />
              </div>
            </div>

            {/* Date & Level */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Date of Completion / Event
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  style={{ fontSize: '0.88rem', minHeight: '42px' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Level
                </label>
                <select
                  className="form-control"
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                  style={{ fontSize: '0.88rem', minHeight: '42px' }}
                >
                  {LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Description / Key Learnings
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Brief summary of your project, score/percentile, or role in the activity..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                style={{ fontSize: '0.88rem', resize: 'vertical' }}
              />
            </div>

            {/* Certificate / Proof Upload */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Certificate / Proof Upload (PDF, JPG, PNG - Max 10MB)
              </label>
              <div
                style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  textAlign: 'center',
                  backgroundColor: '#F8FAFC',
                }}
              >
                <Upload size={24} color="#64748B" style={{ margin: '0 auto 0.5rem' }} />
                <div style={{ fontSize: '0.85rem', color: '#1E293B', fontWeight: 600 }}>
                  {selectedFile ? selectedFile.name : editingRecord?.fileName || 'Select certificate file from your device'}
                </div>
                {selectedFile && (
                  <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                )}
                <input
                  type="file"
                  id="certificate-file-input"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                  style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
