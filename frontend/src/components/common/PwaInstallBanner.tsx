import React from 'react';
import { usePwa } from '../../context/PwaContext';
import { Download, X, Smartphone, Share, PlusSquare, Check } from 'lucide-react';

export const PwaInstallBanner: React.FC = () => {
  const {
    isInstalled,
    isBannerDismissed,
    showIosInstructions,
    setShowIosInstructions,
    promptInstall,
    dismissBanner,
  } = usePwa();

  // If already installed in standalone mode, do not display the banner
  if (isInstalled) return null;

  return (
    <>
      {/* 1. Main Install Notification Banner */}
      {!isBannerDismissed && (
        <div
          role="region"
          aria-label="App Installation Notification"
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            right: '1.25rem',
            zIndex: 9999,
            maxWidth: '430px',
            width: 'calc(100vw - 2.5rem)',
            background: 'linear-gradient(135deg, #0B2545 0%, #133E68 100%)',
            color: '#ffffff',
            borderRadius: '16px',
            padding: '1.15rem 1.25rem',
            boxShadow: '0 16px 36px rgba(11, 37, 69, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 215, 0, 0.35)',
            animation: 'slideUpPwa 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                padding: '4px',
              }}
            >
              <img
                src="/ksrce-logo.png"
                alt="KSRCE Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.75px',
                    color: '#FDE047',
                  }}
                >
                  Autonomous Web App
                </span>
                <button
                  onClick={dismissBanner}
                  aria-label="Dismiss app install notification"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Dismiss notification"
                >
                  <X size={18} />
                </button>
              </div>

              <h4
                style={{
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  margin: '3px 0 4px',
                  color: '#ffffff',
                  letterSpacing: '0.2px',
                }}
              >
                Download KSRCE Mentoring App
              </h4>

              <p
                style={{
                  fontSize: '0.8rem',
                  color: '#CBD5E1',
                  margin: '0 0 0.85rem',
                  lineHeight: 1.45,
                }}
              >
                Install as a mobile or desktop app for quick one-tap access, full screen, and offline support.
              </p>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  onClick={promptInstall}
                  style={{
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.5rem 1rem',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 4px 10px rgba(217, 119, 6, 0.4)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Download size={15} /> Download / Install App
                </button>

                <button
                  onClick={dismissBanner}
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.5rem 0.75rem',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. iOS Installation Guided Modal */}
      {showIosInstructions && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowIosInstructions(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              maxWidth: '440px',
              width: '100%',
              padding: '1.75rem',
              color: '#0F172A',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIosInstructions(false)}
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#475569',
              }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: '#0B2545',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Smartphone size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
                  Install on iOS (iPhone / iPad)
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  KSRCE Digital Mentor-Mentee Portal
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Follow these simple steps in <strong>Safari</strong> to install the portal to your home screen:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Tap the Share Button <Share size={16} color="#0284C7" />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Located in the bottom navigation bar of Safari on iPhone (or top bar on iPad).
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Tap "Add to Home Screen" <PlusSquare size={16} color="#0284C7" />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Scroll down through the share options and tap <strong>Add to Home Screen</strong>.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Confirm "Add" <Check size={16} color="#16A34A" />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Tap <strong>Add</strong> in the top-right corner to launch with full-screen experience.
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosInstructions(false)}
              style={{
                width: '100%',
                backgroundColor: '#0B2545',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '0.75rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
