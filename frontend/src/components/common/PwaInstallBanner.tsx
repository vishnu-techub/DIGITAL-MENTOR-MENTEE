import React, { useState } from 'react';
import { usePwa } from '../../context/PwaContext';
import {
  X,
  Smartphone,
  Share,
  PlusSquare,
  Check,
  CheckCircle2,
  MoreVertical,
  Laptop,
  Download,
} from 'lucide-react';

export const PwaInstallBanner: React.FC = () => {
  const {
    isInstalled,
    showInstructionsModal,
    setShowInstructionsModal,
    isIos,
  } = usePwa();

  const [activeInstructionTab, setActiveInstructionTab] = useState<'android' | 'ios' | 'desktop'>(
    isIos ? 'ios' : 'android'
  );

  // If the instructions modal is not requested by the user, don't show anything (Requirement 7)
  if (!showInstructionsModal) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PWA Installation Instructions"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(11, 37, 69, 0.78)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeInPwa 0.2s ease-out',
      }}
      onClick={() => setShowInstructionsModal(false)}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          maxWidth: '500px',
          width: '100%',
          padding: '1.75rem',
          color: '#0F172A',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={() => setShowInstructionsModal(false)}
          aria-label="Close installation instructions"
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: '#F1F5F9',
            border: 'none',
            borderRadius: '50%',
            width: '34px',
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#475569',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#E2E8F0')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#F1F5F9')}
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#0B2545',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 8px rgba(11, 37, 69, 0.25)',
              padding: '6px',
            }}
          >
            <img
              src="/ksrce-logo.png"
              alt="KSRCE Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0B2545', margin: 0 }}>
              Install KSRCE Mentoring App
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0' }}>
              Progressive Web App • No App Store required
            </p>
          </div>
        </div>

        {/* Tab Selectors (Android / iOS / Desktop) */}
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            backgroundColor: '#F1F5F9',
            padding: '4px',
            borderRadius: '10px',
            marginBottom: '1.25rem',
          }}
        >
          <button
            onClick={() => setActiveInstructionTab('android')}
            style={{
              flex: 1,
              padding: '0.45rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              backgroundColor: activeInstructionTab === 'android' ? '#0B2545' : 'transparent',
              color: activeInstructionTab === 'android' ? '#ffffff' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            <Smartphone size={14} /> Android Chrome
          </button>
          <button
            onClick={() => setActiveInstructionTab('ios')}
            style={{
              flex: 1,
              padding: '0.45rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              backgroundColor: activeInstructionTab === 'ios' ? '#0B2545' : 'transparent',
              color: activeInstructionTab === 'ios' ? '#ffffff' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            <Share size={14} /> iPhone Safari
          </button>
          <button
            onClick={() => setActiveInstructionTab('desktop')}
            style={{
              flex: 1,
              padding: '0.45rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              backgroundColor: activeInstructionTab === 'desktop' ? '#0B2545' : 'transparent',
              color: activeInstructionTab === 'desktop' ? '#ffffff' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            <Laptop size={14} /> Desktop (PC/Mac)
          </button>
        </div>

        {/* Tab 1: Android Chrome Instructions */}
        {activeInstructionTab === 'android' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem', marginBottom: '1.5rem' }}>
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                1
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Tap the Chrome menu <MoreVertical size={16} color="#0B2545" />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Tap the three vertical dots (<strong>⋮</strong>) in the top-right corner of Chrome.
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                2
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Tap "Install app" or "Add to Home screen" <Download size={15} color="#0B2545" />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Select <strong>Install app</strong> (or <strong>Add to Home screen</strong>) from the menu list.
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                3
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Confirm "Install" <Check size={16} color="#16A34A" />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  The KSRCE Mentoring App icon will be added to your mobile home screen with full offline support.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: iPhone / iPad Safari Instructions */}
        {activeInstructionTab === 'ios' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem', marginBottom: '1.5rem' }}>
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                1
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Tap the Safari Share button <Share size={16} color="#0284C7" />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Located in the bottom toolbar of Safari on iPhone (or top right on iPad).
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                2
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Scroll down & tap "Add to Home Screen" <PlusSquare size={16} color="#0284C7" />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Tap the <strong>Add to Home Screen</strong> action in the share sheet.
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                3
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Tap "Add" <Check size={16} color="#16A34A" />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Tap <strong>Add</strong> in the top-right corner to install on your iOS device.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Desktop Chrome / Edge Instructions */}
        {activeInstructionTab === 'desktop' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem', marginBottom: '1.5rem' }}>
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                1
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>
                  Check the Browser Address Bar
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Look at the right side of the address bar for the <strong>Install</strong> icon (💻 or ⊕).
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
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                2
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B' }}>
                  Or use the Browser Menu
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                  Click the three dots (<strong>⋮</strong>) in Chrome/Edge &gt; <strong>Save and share</strong> &gt; <strong>Install KSRCE Mentoring</strong>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dismiss Button */}
        <button
          onClick={() => setShowInstructionsModal(false)}
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
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#133E68')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B2545')}
        >
          Got It
        </button>
      </div>
    </div>
  );
};
