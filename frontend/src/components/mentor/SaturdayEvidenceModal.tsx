import React, { useEffect, useState } from 'react';
import { Users, Loader2, Check, CalendarCheck2 } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../common/Modal';
import { CounsellingCategorySelect } from './CounsellingCategorySelect';
import { DiscussionWithSelect, type DiscussionParticipant } from './DiscussionWithSelect';
import { EvidenceUploader } from './EvidenceUploader';
import type { PreparedEvidencePhoto } from '../../utils/evidence';

/**
 * Records a Saturday COMMON meeting.
 *
 * The point of this screen is that the photos are taken ONCE physically and
 * shared. So there is no per-student photo pick here: one upload goes to every
 * selected participant, who each get their own reference to the same stored
 * file. That keeps N students at 1 copy on disk instead of N.
 *
 * GPS/geolocation is NOT required. Photos are compressed and uploaded without
 * location data.
 */
interface SaturdayEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** Optional student to preselect, e.g. the mentee whose profile was opened. */
  presetStudentId?: string;
}

interface MenteeOption {
  id: string;
  name: string;
  registerNumber?: string;
  year?: string | number;
  section?: string;
}

export const SaturdayEvidenceModal: React.FC<SaturdayEvidenceModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  presetStudentId,
}) => {
  const toast = useToast();
  const { user } = useAuth();
  const [mentees, setMentees] = useState<MenteeOption[]>([]);
  const [loadingMentees, setLoadingMentees] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    meetingDate: new Date().toISOString().split('T')[0],
    categories: ['Academic Development'] as string[],
    discussionWith: [] as DiscussionParticipant[],
    discussionObservation: '',
    actionPlan: '',
    mentorRemarks: '',
  });
  const [photos, setPhotos] = useState<PreparedEvidencePhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMentees([]);
    setSelectedStudentIds(presetStudentId ? [presetStudentId] : []);
    setForm({
      meetingDate: new Date().toISOString().split('T')[0],
      categories: ['Academic Development'],
      discussionWith: [],
      discussionObservation: '',
      actionPlan: '',
      mentorRemarks: '',
    });
    setPhotos([]);
    setErrors({});

    // Only students the logged-in user is the ACTIVE mentor for are offered,
    // because the server refuses the entire batch if any id is not theirs.
    setLoadingMentees(true);
    api.students
      .list({ mentorId: user?.facultyId || '' })
      .then((res: any) => {
        const list: any[] = Array.isArray(res?.data?.students)
          ? res.data.students
          : Array.isArray(res?.data)
            ? res.data
            : [];
        setMentees(
          list.map((s) => ({
            id: String(s._id || s.id),
            name: s.fullName || s.full_name || s.name || 'Unnamed student',
            registerNumber: s.registerNumber || s.register_number,
            year: s.year,
            section: s.section,
          }))
        );
      })
      .catch(() => {
        setMentees([]);
        toast.error('Could not load your mentees. Reopen this screen to try again.');
      })
      .finally(() => setLoadingMentees(false));
  }, [isOpen, presetStudentId, user?.facultyId]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.meetingDate) next.meetingDate = 'Meeting Date is required.';
    if (selectedStudentIds.length === 0) next.studentIds = 'Select at least one participating student.';
    if (form.categories.length === 0) next.categories = 'Select at least one Mentoring Category.';
    if (form.discussionWith.length === 0) next.discussionWith = 'Select who the discussion was held with.';
    if (!form.discussionObservation.trim()) next.discussionObservation = 'Discussion / Observation is required.';
    if (!form.actionPlan.trim()) next.actionPlan = 'Action Plan is required.';
    if (photos.length === 0) next.photos = 'Attach at least one geo-tagged photo for the meeting.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res: any = await api.counselling.saveSaturdayEvidence(
        {
          meetingDate: form.meetingDate,
          categories: form.categories,
          discussionWith: form.discussionWith,
          discussionObservation: form.discussionObservation.trim(),
          actionPlan: form.actionPlan.trim(),
          correctiveAction: form.actionPlan.trim(),
          mentorRemarks: form.mentorRemarks.trim(),
          studentIds: selectedStudentIds,
        },
        photos
      );

      const data: any = res?.data ?? res;
      // `physicalFilesStored` is how many copies hit disk. It stays small no
      // matter how many students were selected — that is the whole point.
      const physical = Number(data?.physicalFilesStored ?? 0);

      toast.success(
        `Saturday meeting saved for ${selectedStudentIds.length} student(s). ` +
          `${physical || 1} shared physical photo set(s) stored once and linked to every participant.`
      );

      setPhotos([]);
      onClose();
      await onSaved();
    } catch (err: any) {
      toast.error('Failed to save the Saturday meeting: ' + (err?.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Saturday Common Meeting Evidence">
      <form onSubmit={handleSubmit}>
        <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
          Photos taken at a Saturday meeting are shared by everyone present. Upload once and each
          selected participant gets a reference to the same file.
        </div>

        <div className="form-group" style={{ marginBottom: '1.15rem' }}>
          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Meeting Date <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <input
            type="date"
            className="form-control"
            value={form.meetingDate}
            onChange={(e) => setForm((p) => ({ ...p, meetingDate: e.target.value }))}
            style={{ fontSize: '0.88rem', minHeight: '42px' }}
          />
          {errors.meetingDate && (
            <div style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '0.3rem', fontWeight: 600 }}>
              {errors.meetingDate}
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="form-group" style={{ marginBottom: '1.15rem' }}>
          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Participating Students <span style={{ color: '#DC2626' }}>*</span>
          </label>
          {loadingMentees ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: '#64748B' }}>
              <Loader2 size={14} className="spin" /> Loading your mentees...
            </div>
          ) : mentees.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#991B1B', fontWeight: 600 }}>
              No mentees are assigned to you, so there is no one to record a meeting for.
            </div>
          ) : (
            <>
              <div
                style={{
                  maxHeight: '190px',
                  overflowY: 'auto',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '0.35rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                {mentees.map((m) => {
                  const checked = selectedStudentIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleStudent(m.id)}
                      aria-pressed={checked}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        padding: '0.45rem 0.55rem',
                        borderRadius: '6px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: checked ? '#1D4ED8' : 'transparent',
                        backgroundColor: checked ? '#EFF6FF' : 'transparent',
                      }}
                    >
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '4px',
                          border: `1.5px solid ${checked ? '#1D4ED8' : '#94A3B8'}`,
                          backgroundColor: checked ? '#1D4ED8' : 'transparent',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {checked && <Check size={11} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.83rem', fontWeight: 700, color: '#1E293B' }}>
                          {m.name}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748B' }}>
                          {[m.registerNumber, m.year, m.section].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedStudentIds.length > 0 && (
                <div style={{ fontSize: '0.74rem', color: '#1E40AF', fontWeight: 700, marginTop: '0.4rem' }}>
                  <Users size={11} style={{ verticalAlign: -1 }} /> {selectedStudentIds.length} participant(s) selected — they will share these photos.
                </div>
              )}
              {errors.studentIds && (
                <div style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '0.3rem', fontWeight: 600 }}>
                  {errors.studentIds}
                </div>
              )}
            </>
          )}
        </div>

        <CounsellingCategorySelect
          selectedCategories={form.categories}
          onChange={(cats) => {
            setForm((p) => ({ ...p, categories: cats }));
            if (errors.categories && cats.length > 0) setErrors((p) => ({ ...p, categories: '' }));
          }}
          required
          error={errors.categories}
        />

        <DiscussionWithSelect
          selected={form.discussionWith}
          onChange={(next) => {
            setForm((p) => ({ ...p, discussionWith: next }));
            if (errors.discussionWith && next.length > 0) setErrors((p) => ({ ...p, discussionWith: '' }));
          }}
          required
          error={errors.discussionWith}
        />

        <div className="form-group" style={{ marginBottom: '1.15rem' }}>
          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Discussion / Observation <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <textarea
            className="form-control"
            rows={3}
            value={form.discussionObservation}
            onChange={(e) => setForm((p) => ({ ...p, discussionObservation: e.target.value }))}
            placeholder="What was discussed at the Saturday meeting, and who took part..."
          />
          {errors.discussionObservation && (
            <div style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '0.3rem', fontWeight: 600 }}>
              {errors.discussionObservation}
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: '1.15rem' }}>
          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Action Plan <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <textarea
            className="form-control"
            rows={3}
            value={form.actionPlan}
            onChange={(e) => setForm((p) => ({ ...p, actionPlan: e.target.value }))}
            placeholder="Concrete steps every participant agreed to..."
          />
          {errors.actionPlan && (
            <div style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '0.3rem', fontWeight: 600 }}>
              {errors.actionPlan}
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: '1.15rem' }}>
          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Mentor Remarks
          </label>
          <textarea
            className="form-control"
            rows={2}
            value={form.mentorRemarks}
            onChange={(e) => setForm((p) => ({ ...p, mentorRemarks: e.target.value }))}
            placeholder="Optional closing remarks..."
          />
        </div>

        <EvidenceUploader
          photos={photos}
          onPhotosChange={setPhotos}
          removedExistingIds={[]}
          onRemovedExistingIdsChange={() => {}}
          onRemoveExisting={() => {}}
          disabled={submitting}
          hint="These photos are shared by every participant selected above."
        />
        {errors.photos && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.78rem',
              color: '#DC2626',
              marginTop: '-0.6rem',
              marginBottom: '1rem',
              fontWeight: 600,
            }}
          >
            {errors.photos}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? (
              <>
                <Loader2 size={14} className="spin" /> Saving shared evidence...
              </>
            ) : (
              <>
                <CalendarCheck2 size={14} /> Save Saturday Meeting
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};