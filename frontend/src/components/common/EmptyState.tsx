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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '2rem 1rem' : '3.5rem 1.5rem',
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px dashed #CBD5E1',
        margin: '0.75rem 0',
      }}
    >
      {icon && (
        <div
          style={{
            width: compact ? '44px' : '56px',
            height: compact ? '44px' : '56px',
            borderRadius: '50%',
            backgroundColor: '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748B',
            marginBottom: '1rem',
          }}
        >
          {icon}
        </div>
      )}
      <h4
        style={{
          fontSize: compact ? '0.95rem' : '1.05rem',
          fontWeight: 700,
          color: '#0B2545',
          marginBottom: '0.35rem',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: '0.85rem',
          color: '#64748B',
          maxWidth: '420px',
          lineHeight: 1.5,
          marginBottom: action ? '1.25rem' : 0,
        }}
      >
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};
