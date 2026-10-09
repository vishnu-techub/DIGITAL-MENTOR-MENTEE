import React, { useRef, useState, useEffect } from 'react';
import { Camera, Trash2, Loader2, AlertTriangle, Users, MapPin, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  prepareEvidencePhotos,
  captureEvidenceLocation,
  describeLocationStatus,
  formatBytes,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  NOT_REQUESTED_LOCATION,
  type EvidenceLocationState,
  type PreparedEvidencePhoto,
} from '../../utils/evidence';

interface EvidenceUploaderProps {
  /** Photos already saved on the record. These are never dropped by an edit. */
  existing?: any[];
  /** Photos picked but not yet saved. */
  photos: PreparedEvidencePhoto[];
  onPhotosChange: (next: PreparedEvidencePhoto[]) => void;
  /** Device-reported location captured for this submission. */
  location?: EvidenceLocationState;
  onLocationChange?: (next: EvidenceLocationState) => void;
  /** Ids the mentor has chosen to detach on save. */
  removedExistingIds: string[];
  onRemovedExistingIdsChange: (next: string[]) => void;
  onRemoveExisting: (evidenceId: string) => void;
  disabled?: boolean;
  /** Rendered under the label, e.g. "shared with 12 participants". */
  hint?: React.ReactNode;
}

/** Existing evidence photo, as returned by the API. */
export interface StoredEvidenceView {
  evidenceId: string;
  fileName?: string;
  fileSize?: number | null;
  fileUrl?: string;
  uploadedAt?: string | null;
  serverUploadedAt?: string | null;
  context?: string;
  evidenceGroupId?: string | null;
  capturedBy?: string;
  linkedStudents?: number;
  // ---- Location (device-reported; null when not captured) ------------------
  locationStatus?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  locationCapturedAt?: string | null;
  placeName?: string | null;
  placeNameStatus?: string;
  // ---- Timestamps ----------------------------------------------------------
  captureTime?: string | null;
  captureTimeStatus?: string;
}

/**
 * Photo picker for mentoring evidence.
 *
 * Photos are compressed to under 200 KB before upload. When the mentor attaches
 * photos, the browser location is requested ONCE for this evidence submission.
 * A refusal, timeout or unsupported device never blocks the upload — the honest
 * outcome is shown and stored. Photos themselves are never watermarked, cropped
 * or resized beyond the documented compression.
 */
export const EvidenceUploader: React.FC<EvidenceUploaderProps> = ({
  existing = [],
  photos,
  onPhotosChange,
  location = NOT_REQUESTED_LOCATION,
  onLocationChange,
  removedExistingIds,
  onRemovedExistingIdsChange,
  onRemoveExisting,
  disabled = false,
  hint,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  // Keep the newest previews in a ref so the unmount cleanup can revoke them all.
  // Reading `photos` inside the effect would capture the initial empty array and
  // leak every preview the mentor actually added.
  const photosRef = useRef<PreparedEvidencePhoto[]>(photos);
  photosRef.current = photos;

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  const requestLocation = async () => {
    if (disabled) return;
    setLocating(true);
    try {
      const state = await captureEvidenceLocation();
      onLocationChange?.(state);
    } finally {
      setLocating(false);
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError('');

    const remaining = MAX_EVIDENCE_FILES - photos.length;
    if (remaining <= 0) {
      setError(`You can attach at most ${MAX_EVIDENCE_FILES} photos at a time.`);
      return;
    }
    const files = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) {
      setError(`Only the first ${remaining} photo(s) were added (limit ${MAX_EVIDENCE_FILES}).`);
    }

    setBusy(true);
    try {
      const prepared = await prepareEvidencePhotos(files);
      // Revoke the previews we are replacing, so their URLs are not leaked.
      for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
      onPhotosChange([...photos, ...prepared]);

      // Ask for the location as a direct result of the user attaching photos.
      // Never re-prompt after an explicit denial; offer a manual retry instead.
      const status = location?.status ?? 'NOT_REQUESTED';
      if (status === 'NOT_REQUESTED' || status === 'UNAVAILABLE' || status === 'TIMEOUT' || status === 'ERROR') {
        await requestLocation();
      }
    } catch (err: any) {
      setError(err?.message || 'Could not attach the photo.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePending = (index: number) => {
    const target = photos[index];
    if (target) URL.revokeObjectURL(target.previewUrl);
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  const undoRemoval = (evidenceId: string) => {
    onRemovedExistingIdsChange(removedExistingIds.filter((id) => id !== evidenceId));
  };

  const markedForRemoval = (evidenceId: string) => removedExistingIds.includes(evidenceId);

  const captured = location.status === 'CAPTURED' && location.latitude != null && location.longitude != null;
  const retryable = location.status === 'DENIED' || location.status === 'UNAVAILABLE' || location.status === 'TIMEOUT' || location.status === 'ERROR';

  return (
    <div className="form-group" style={{ marginBottom: '1.15rem' }}>
      <label
        className="form-label"
        style={{
          display: 'block',
          fontWeight: 700,
          fontSize: '0.85rem',
          color: '#0F172A',
          marginBottom: '0.35rem',
        }}
      >
        Evidence Photos
      </label>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.45rem',
          fontSize: '0.75rem',
          color: '#64748B',
          marginBottom: '0.6rem',
          lineHeight: 1.45,
        }}
      >
        <MapPin size={14} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Each photo is compressed to under {Math.round(MAX_EVIDENCE_BYTES / 1024)} KB before upload. Location is
          requested once, when you attach photos, and stored with the evidence record (device-reported, not
          independently verified).
          {hint ? <> {hint}</> : null}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        capture="environment"
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: 'none' }}
        id="mentoring-evidence-input"
      />

      <button
        type="button"
        disabled={disabled || busy || photos.length >= MAX_EVIDENCE_FILES}
        onClick={() => fileInputRef.current?.click()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          width: '100%',
          minHeight: '46px',
          borderRadius: '8px',
          border: '1.5px dashed #94A3B8',
          backgroundColor: '#F8FAFC',
          color: '#334155',
          fontSize: '0.86rem',
          fontWeight: 600,
          cursor: disabled || busy ? 'not-allowed' : 'pointer',
          opacity: disabled || busy ? 0.6 : 1,
        }}
      >
        {busy ? (
          <>
            <Loader2 size={16} className="spin" />
            Compressing photos...
          </>
        ) : (
          <>
            <Camera size={16} />
            {photos.length > 0 ? 'Add more photos' : 'Add evidence photos'}
          </>
        )}
      </button>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.45rem',
            marginTop: '0.55rem',
            padding: '0.6rem 0.7rem',
            borderRadius: '8px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            fontSize: '0.79rem',
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Location status — shown only for a submission that has photos. */}
      {photos.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.6rem',
            padding: '0.5rem 0.65rem',
            borderRadius: '8px',
            border: `1px solid ${captured ? '#BBF7D0' : '#FDE68A'}`,
            backgroundColor: captured ? '#F0FDF4' : '#FFFBEB',
            fontSize: '0.76rem',
            color: captured ? '#166534' : '#92400E',
            fontWeight: 600,
          }}
        >
          {locating ? (
            <Loader2 size={14} className="spin" />
          ) : captured ? (
            <CheckCircle2 size={14} />
          ) : (
            <MapPin size={14} />
          )}
          <span style={{ flex: 1 }}>
            {locating ? 'Getting location...' : describeLocationStatus(location.status)}
            {captured && !locating ? (
              <span style={{ display: 'block', fontWeight: 500, fontSize: '0.71rem', marginTop: 1 }}>
                {location.latitude!.toFixed(6)}, {location.longitude!.toFixed(6)}
                {location.accuracy != null ? ` · ±${Math.round(location.accuracy)} m` : ''}
              </span>
            ) : null}
          </span>
          {retryable && !locating ? (
            <button
              type="button"
              onClick={requestLocation}
              disabled={disabled}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'transparent',
                border: '1px solid currentColor',
                borderRadius: '6px',
                padding: '0.2rem 0.45rem',
                color: 'inherit',
                fontSize: '0.71rem',
                fontWeight: 700,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={11} />
              Retry
            </button>
          ) : null}
        </div>
      )}

      {/* Photos already saved on the record */}
      {existing.length > 0 && (
        <div style={{ marginTop: '0.85rem' }}>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#64748B',
              marginBottom: '0.4rem',
            }}
          >
            Saved on this record ({existing.length - removedExistingIds.filter((id) => existing.some((e) => e.evidenceId === id)).length} of {existing.length} kept)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {existing.map((item: StoredEvidenceView) => {
              const removing = markedForRemoval(item.evidenceId);
              return (
                <div
                  key={item.evidenceId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.5rem 0.6rem',
                    borderRadius: '8px',
                    border: `1px solid ${removing ? '#FECACA' : '#E2E8F0'}`,
                    backgroundColor: removing ? '#FEF2F2' : '#ffffff',
                    opacity: removing ? 0.65 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.79rem', fontWeight: 600, color: '#1E293B' }}>
                      {item.fileName || 'Evidence photo'}
                      {item.fileSize ? ` · ${formatBytes(item.fileSize)}` : ''}
                    </div>
                    <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: 2 }}>
                      {item.context === 'SATURDAY_MEETING' ? (
                        <>
                          {' '}
                          · <Users size={10} style={{ verticalAlign: -1 }} /> Saturday common meeting
                        </>
                      ) : null}
                      {item.capturedBy ? ` · by ${item.capturedBy}` : ''}
                      {item.uploadedAt ? ` · uploaded ${new Date(item.uploadedAt).toLocaleString()}` : ''}
                    </div>
                  </div>
                  {removing ? (
                    <button
                      type="button"
                      onClick={() => undoRemoval(item.evidenceId)}
                      style={{
                        background: '#1D4ED8',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.3rem 0.55rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRemoveExisting(item.evidenceId)}
                      disabled={disabled}
                      title="Detach this photo when you save"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#DC2626',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        padding: '0.25rem',
                        display: 'flex',
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Photos picked but not yet saved */}
      {photos.length > 0 && (
        <div style={{ marginTop: '0.85rem' }}>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#64748B',
              marginBottom: '0.4rem',
            }}
          >
            New photos to be saved ({photos.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
            {photos.map((photo, index) => (
              <div
                key={photo.previewUrl}
                style={{
                  position: 'relative',
                  width: '104px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#ffffff',
                }}
              >
                <img
                  src={photo.previewUrl}
                  alt={`Evidence ${index + 1}`}
                  style={{ width: '100%', height: '78px', objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '0.35rem 0.4rem' }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#166534' }}>
                    {formatBytes(photo.file.size)} ✓
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#64748B', marginTop: 1 }}>
                    from {formatBytes(photo.originalBytes)}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: photo.captureTime ? '#334155' : '#94A3B8', marginTop: 1 }}>
                    {photo.captureTime
                      ? new Date(photo.captureTime).toLocaleString()
                      : 'Capture time unavailable'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePending(index)}
                  disabled={disabled}
                  aria-label={`Remove photo ${index + 1}`}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'rgba(15,23,42,0.75)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
