import React, { useEffect, useState } from 'react';
import { Download, Loader2, X, Users } from 'lucide-react';
import { api } from '../../api/client';
import type { StoredEvidenceView } from './EvidenceUploader';

/**
 * Read-only gallery of the photos already saved on a mentoring record.
 *
 * Photos are private, so the bytes are fetched with the bearer token and shown
 * from a temporary object URL — a plain `<img src>` cannot work because
 * `/uploads` is not a public static mount. The URL is revoked when the viewer
 * closes so the blob is not held in memory.
 */
interface EvidenceGalleryProps {
  evidence: StoredEvidenceView[];
  /** Shown when a record has no photos, so the mentor is not left guessing. */
  emptyHint?: string;
}

export const EvidenceGallery: React.FC<EvidenceGalleryProps> = ({ evidence = [], emptyHint }) => {
  const [viewing, setViewing] = useState<{ item: StoredEvidenceView; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const open = async (item: StoredEvidenceView) => {
    setError('');
    setLoading(true);
    try {
      const blob = await api.counselling.fetchEvidenceBlob(item.evidenceId);
      setViewing({ item, url: URL.createObjectURL(blob) });
    } catch (err: any) {
      setError(err?.message || 'This photo could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    if (viewing) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  };

  // Release the object URL if the gallery unmounts while a photo is open.
  useEffect(() => {
    return () => {
      if (viewing) URL.revokeObjectURL(viewing.url);
    };
  }, [viewing]);

  if (evidence.length === 0) {
    if (!emptyHint) return null;
    return (
      <div style={{ fontSize: '0.78rem', color: '#64748B', fontStyle: 'italic' }}>{emptyHint}</div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
        {evidence.map((item) => (
          <button
            key={item.evidenceId}
            type="button"
            onClick={() => open(item)}
            style={{
              position: 'relative',
              width: '96px',
              padding: 0,
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              cursor: 'pointer',
            }}
            title={item.fileName || 'Evidence photo'}
          >
            <div
              style={{
                height: '68px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                fontSize: '0.66rem',
                fontWeight: 700,
              }}
            >
              PHOTO
            </div>
            <div style={{ padding: '0.3rem 0.35rem', textAlign: 'left' }}>
              <div style={{ fontSize: '0.6rem', color: '#64748B', marginTop: 1 }}>
                {item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : ''}
              </div>
            </div>
            {item.context === 'SATURDAY_MEETING' && (
              <span
                title="Saturday common meeting evidence, shared across participants"
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '4px',
                  background: 'rgba(180,83,9,0.9)',
                  color: '#ffffff',
                  borderRadius: '4px',
                  padding: '1px 4px',
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Users size={9} />
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.76rem', color: '#991B1B', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '620px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                {viewing.item.fileName || 'Evidence photo'}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  display: 'flex',
                  padding: '0.2rem',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <img
              src={viewing.url}
              alt="Mentoring evidence"
              style={{
                width: '100%',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                display: 'block',
              }}
            />

            <div
              style={{
                marginTop: '0.75rem',
                fontSize: '0.78rem',
                color: '#334155',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
              }}
            >
              {viewing.item.uploadedAt && (
                <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                  Uploaded {new Date(viewing.item.uploadedAt).toLocaleString()}
                  {viewing.item.fileSize ? ` · ${Math.round(viewing.item.fileSize / 1024)} KB` : ''}
                  {viewing.item.capturedBy ? ` · by ${viewing.item.capturedBy}` : ''}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => api.counselling.downloadEvidence(viewing.item.evidenceId, viewing.item.fileName)}
              style={{
                marginTop: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#1D4ED8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '7px',
                padding: '0.5rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Download size={14} />
              Download photo
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#0F172A',
            }}
          >
            <Loader2 size={16} className="spin" />
            Loading photo...
          </div>
        </div>
      )}
    </div>
  );
};