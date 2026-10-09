import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  onSubmit?: (e: React.FormEvent) => void;
  formId?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = '680px',
  onSubmit,
  formId,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    // Lock background scroll while open, then restore whatever was there
    // before (usually '') so we never leave a stale inline overflow that
    // would turn <body> into a scroll container and break the sticky layout.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  // Move focus into the dialog when it opens so keyboard users are not stranded behind the overlay.
  useEffect(() => {
    if (isOpen && contentRef.current) {
      contentRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const ContentTag = onSubmit ? 'form' : 'div';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <ContentTag
        id={formId}
        className="modal-content"
        ref={contentRef as React.RefObject<never>}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth }}
        onSubmit={onSubmit}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--primary-800)' }}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--slate-500)',
              display: 'flex',
              padding: '0.4rem',
              borderRadius: 'var(--radius-sm)',
              minHeight: 'var(--touch-target)',
              minWidth: 'var(--touch-target)',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--slate-100)'; e.currentTarget.style.color = 'var(--slate-800)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--slate-500)'; }}
            aria-label={`Close ${title}`}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </ContentTag>
    </div>
  );
};
