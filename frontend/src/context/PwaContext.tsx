import React, { createContext, useContext, useState, useEffect } from 'react';

interface PwaContextType {
  isInstallable: boolean;
  isInstalled: boolean;
  isIos: boolean;
  showInstructionsModal: boolean;
  setShowInstructionsModal: (show: boolean) => void;
  promptInstall: () => Promise<boolean>;
}

const PwaContext = createContext<PwaContextType | undefined>(undefined);

export const PwaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    return typeof window !== 'undefined' ? (window as any).deferredPrompt || null : null;
  });
  const [isInstallable, setIsInstallable] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Boolean((window as any).deferredPrompt);
  });
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState<boolean>(false);

  useEffect(() => {
    // 1. Check if running in standalone display mode (already installed PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      setIsInstallable(false);
      return;
    }

    // 2. Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    // 3. Pick up prompt if captured early by index.html script
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
      setIsInstallable(true);
    }

    // 4. Listen for prompt ready event dispatched from index.html or future prompts
    const handlePromptReady = () => {
      if ((window as any).deferredPrompt) {
        setDeferredPrompt((window as any).deferredPrompt);
        setIsInstallable(true);
      }
    };

    // Standard listener in case not fired before mount
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setDeferredPrompt(e);
      setIsInstallable(true);
      console.log('✓ KSRCE PWA beforeinstallprompt captured.');
    };

    // 5. Handle successful installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
      setShowInstructionsModal(false);
      console.log('✓ KSRCE PWA installed successfully.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed', handleAppInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    // If native prompt is available (Android Chrome, Desktop Chrome, Edge)
    const promptEvent = deferredPrompt || (window as any).deferredPrompt;
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          console.log('✓ User accepted PWA installation.');
          setIsInstalled(true);
          setIsInstallable(false);
          setDeferredPrompt(null);
          (window as any).deferredPrompt = null;
          return true;
        } else {
          console.log('User cancelled PWA installation.');
          return false;
        }
      } catch (err) {
        console.error('Error triggering PWA install prompt:', err);
        setShowInstructionsModal(true);
        return false;
      }
    }

    // If browser doesn't support beforeinstallprompt or on iOS: show responsive instructions modal
    // Note: Absolutely NO browser alert() is used
    setShowInstructionsModal(true);
    return false;
  };

  return (
    <PwaContext.Provider
      value={{
        isInstallable,
        isInstalled,
        isIos,
        showInstructionsModal,
        setShowInstructionsModal,
        promptInstall,
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
