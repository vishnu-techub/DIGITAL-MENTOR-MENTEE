import React from 'react';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';

export interface BulkDeleteItem {
  id: string;
  /** Bold identifier, e.g. the student name. */
  primary: string;
  /** Muted identifier, e.g. "73152421125 · CSE". */
  secondary?: string;
}

interface BulkDeleteModalProps {
  isOpen: boolean;
  /** Noun for the record type, e.g. "student" / "faculty member". */
  entityLabel: string;
  items: BulkDeleteItem[];
  /** True while the request is in flight (blocks close + double submit). */
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Explicit, irreversible-action confirmation for a bulk delete.
 *
 * It names the record type, the exact count and every affected record, and it
 * cannot be dismissed or re-submitted while the request is running, so a
 * double-click can never fire two deletions.
 */
export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  entityLabel,
  items,
  busy,
  onClose,
  onConfirm,
}) => {
  const count = items.length;
  const plural = count === 1 ? entityLabel : `${entityLabel}s`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Permanently Delete ${count} ${plural === entityLabel ? entityLabel : plural}`}
      maxWidth="560px"
    >
      <div className="bulk-delete-modal">
        <div className="bulk-delete-modal__warning">
          <AlertCircle size={24} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-danger-600)' }}>
              This action cannot be undone.
            </p>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--color-slate-700)' }}>
              You are about to permanently delete <strong>{count}</strong> {plural}
              {' '}and all associated records. The corresponding login accounts will also be
              removed.
            </p>
          </div>
        </div>

        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-slate-600)' }}>
          The following {plural} will be deleted:
        </p>

        <ul className="bulk-delete-modal__list" aria-label={`${count} ${plural} to delete`}>
          {items.map((item) => (
            <li key={item.id} className="bulk-delete-modal__item">
              <span className="bulk-delete-modal__item-primary">{item.primary}</span>
              {item.secondary ? (
                <span className="bulk-delete-modal__item-secondary">{item.secondary}</span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="bulk-delete-modal__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            {busy ? 'Deleting…' : `Delete ${count} ${plural}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};
