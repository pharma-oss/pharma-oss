import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPWA, setIsPWA] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already launched in PWA standalone mode
    const checkPwaMode = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone ||
        document.referrer.includes('android-app://');

      setIsPWA(isStandalone);

      // If already PWA, make sure banner is hidden
      if (isStandalone) {
        setShowPwaBanner(false);
      }
    };

    checkPwaMode();

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Only show banner if NOT in PWA mode AND not manually dismissed this session
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone;
      const dismissed = sessionStorage.getItem('pwa_banner_dismissed') === 'true';
      if (!isStandalone && !dismissed) {
        setShowPwaBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Register sw.js
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => console.log('Service Worker registered:', reg.scope))
        .catch((err) => console.warn('Service Worker registration failed:', err));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handlePwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPwaBanner(false);
      toast.success('薬局OSのインストールを開始しました！');
    }
  };

  const dismissPwaBanner = () => {
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
    setShowPwaBanner(false);
  };

  return {
    isPWA,
    showPwaBanner,
    handlePwaInstall,
    dismissPwaBanner
  };
}
