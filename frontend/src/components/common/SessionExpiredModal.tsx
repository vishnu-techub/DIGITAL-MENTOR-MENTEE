import React, { useEffect, useState } from 'react';
import { LogIn, Clock } from 'lucide-react';
import { removeAuthToken } from '../../api/client';

export const SessionExpiredModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleSessionExpired = () => {
      removeAuthToken();
      setIsOpen(true);
    };

    window.addEventListener('ksrce:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('ksrce:session-expired', handleSessionExpired);
    };
  }, []);

  if (!isOpen) return null;

  const handleLoginAgain = () => {
    removeAuthToken();
    setIsOpen(false);
    // Reload or redirect to trigger login page clean state
    window.location.href = '/';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(11, 37, 69, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          borderRadius: '18px',
          padding: '2rem',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          animation: 'fadeInScale 0.2s ease-out',
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#FEF3C7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem auto',
          }}
        >
          <Clock size={30} color="#D97706" />
        </div>

        <h3
          id="session-expired-title"
          style={{
            fontSize: '1.35rem',
            fontWeight: 800,
            color: '#0B2545',
            margin: '0 0 0.5rem 0',
          }}
        >
          Session Expired
        </h3>

        <p
          style={{
            fontSize: '0.92rem',
            color: '#64748B',
            lineHeight: 1.5,
            margin: '0 0 1.75rem 0',
          }}
        >
          Your session has expired. Please login again.
        </p>

        <button
          onClick={handleLoginAgain}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '0.75rem 1.25rem',
            fontSize: '0.95rem',
            fontWeight: 700,
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
          }}
        >
          <LogIn size={18} />
          Login Again
        </button>
      </div>
    </div>
  );
};
