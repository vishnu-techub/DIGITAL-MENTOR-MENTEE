import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const toast = useToast();

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success('Your internet connection has been restored.', 'Back Online');
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="ksrce-offline-banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 99998,
        backgroundColor: '#7F1D1D',
        color: '#ffffff',
        padding: '0.65rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        animation: 'slideDown 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <WifiOff size={18} color="#FCA5A5" />
        <span style={{ fontWeight: 800, letterSpacing: '0.02em', color: '#FEE2E2' }}>
          You're Offline
        </span>
      </div>
      <span style={{ color: '#E2E8F0', fontSize: '0.82rem' }}>
        — Some features may not be available until your connection is restored.
      </span>
    </div>
  );
};
