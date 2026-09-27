import React from 'react';

export interface ErrorAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
}

export interface ErrorStateLayoutProps {
  code?: string;
  title: string;
  message: string;
  icon?: React.ReactNode;
  primaryAction?: ErrorAction;
  secondaryAction?: ErrorAction;
  fullPage?: boolean;
}

export const ErrorStateLayout: React.FC<ErrorStateLayoutProps> = ({
  code,
  title,
  message,
  icon,
  primaryAction,
  secondaryAction,
  fullPage = true,
}) => {
  const content = (
    <div
      className="ksrce-error-card"
      style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        boxShadow: '0 20px 40px -15px rgba(11, 37, 69, 0.12), 0 0 1px 1px rgba(11, 37, 69, 0.05)',
        border: '1px solid #E2E8F0',
        padding: '2.5rem 2rem',
        textAlign: 'center',
        margin: '0 auto',
      }}
    >
      {/* College Institutional Branding Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
        <img
          src="/ksrce-logo.png"
          alt="K.S.R. College of Engineering"
          style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '0.75rem' }}
        />
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0B2545', letterSpacing: '0.04em' }}>
          K.S.R. COLLEGE OF ENGINEERING
        </div>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#C59B27', letterSpacing: '0.08em', marginTop: '2px' }}>
          AUTONOMOUS • AFFILIATED TO ANNA UNIVERSITY
        </div>
      </div>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #CBD5E1, transparent)', marginBottom: '1.75rem' }} />

      {/* Error Code & Icon */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.25rem' }}>
        {icon && (
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#F8FAFC',
              border: '2px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}
          >
            {icon}
          </div>
        )}

        {code && (
          <div
            style={{
              fontSize: '3rem',
              fontWeight: 900,
              lineHeight: 1,
              color: '#0B2545',
              letterSpacing: '-0.03em',
              marginBottom: '0.5rem',
            }}
          >
            {code}
          </div>
        )}

        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            color: '#0B2545',
            margin: '0 0 0.5rem 0',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>

        <p
          style={{
            fontSize: '0.92rem',
            color: '#64748B',
            lineHeight: 1.55,
            margin: 0,
            maxWidth: '420px',
          }}
        >
          {message}
        </p>
      </div>

      {/* Action Buttons */}
      {(primaryAction || secondaryAction) && (
        <div
          className="ksrce-error-actions"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.85rem',
            marginTop: '2rem',
            flexWrap: 'wrap',
          }}
        >
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.7rem 1.4rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: '10px',
                minWidth: '150px',
                cursor: 'pointer',
              }}
            >
              {primaryAction.icon}
              {primaryAction.label}
            </button>
          )}

          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.7rem 1.4rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: '10px',
                minWidth: '150px',
                cursor: 'pointer',
              }}
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (!fullPage) {
    return (
      <div style={{ padding: '2rem 1rem', display: 'flex', justifyContent: 'center' }}>
        {content}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        boxSizing: 'border-box',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {content}
      <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#94A3B8', textAlign: 'center' }}>
        K.S.R. College of Engineering (Autonomous) • Digital Mentor–Mentee Management System
      </div>
    </div>
  );
};
