import React, { createContext, useContext, useState, useEffect } from 'react';

interface PwaContextType {
  isInstallable: boolean;
  isInstalled: boolean;
  isIos: boolean;
  showIosInstructions: boolean;
  setShowIosInstructions: (show: boolean) => void;
  promptInstall: () => Promise<boolean>;
  dismissBanner: () => void;
  isBannerDismissed: boolean;
}

const PwaContext = createContext<PwaContextType | undefined>(undefined);

export const PwaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    return localStorage.getItem('ksrce_pwa_dismissed') === 'true';
  });

  useEffect(() => {
    // Check if app is already running as an installed PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Listen for beforeinstallprompt event (Chromium, Android, Edge, Desktop Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      console.log('✓ KSRCE PWA install prompt ready.');
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('✓ KSRCE PWA installed successfully.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (isIos) {
      setShowIosInstructions(true);
      return true;
    }

    if (!deferredPrompt) {
      // Fallback instruction if browser prompt not ready
      alert(
        'To install this web app on your device:\n\n' +
        '• On Chrome/Edge: Click the Install icon in the address bar (or Menu > "Install KSRCE Mentoring")\n' +
        '• On Android: Tap Menu (⋮) > "Add to Home screen" or "Install app"\n' +
        '• On iOS: Tap Share (⎋) > "Add to Home Screen"'
      );
      return false;
    }

    try {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the PWA installation prompt.');
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
        return true;
      } else {
        console.log('User dismissed the PWA installation prompt.');
        return false;
      }
    } catch (err) {
      console.error('PWA install prompt error:', err);
      return false;
    }
  };

  const dismissBanner = () => {
    setIsBannerDismissed(true);
    localStorage.setItem('ksrce_pwa_dismissed', 'true');
  };

  return (
    <PwaContext.Provider
      value={{
        isInstallable,
        isInstalled,
        isIos,
        showIosInstructions,
        setShowIosInstructions,
        promptInstall,
        dismissBanner,
        isBannerDismissed,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
};

export const usePwa = () => {
  const context = useContext(PwaContext);
  if (!context) {
    throw new Error('usePwa must be used within a PwaProvider');
  }
  return context;
};
