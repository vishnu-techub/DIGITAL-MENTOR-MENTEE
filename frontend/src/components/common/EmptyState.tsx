import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
}) => {
  return (
    <div
      className="empty-state"
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? 'var(--space-8) var(--space-4)' : 'var(--space-10) var(--space-6)',
        backgroundColor: 'var(--slate-50)',
        borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--slate-300)',
        margin: '0.75rem 0',
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            width: compact ? '44px' : '56px',
            height: compact ? '44px' : '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--slate-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--slate-500)',
            marginBottom: 'var(--space-4)',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
      <h4
        style={{
          fontSize: compact ? 'var(--text-md)' : 'var(--text-lg)',
          fontWeight: 700,
          color: 'var(--primary-800)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: 'var(--text-base)',
          color: 'var(--slate-500)',
          maxWidth: '420px',
          lineHeight: 1.55,
          marginBottom: action ? 'var(--space-5)' : 0,
        }}
      >
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};
