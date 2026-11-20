import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export const PWA_BANNER_DISMISSED_STORAGE_KEY = 'pwa_banner_dismissed';

export interface PwaSessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export function isPwaBannerDismissed(
  storage: Pick<PwaSessionStorageLike, 'getItem'> | null | undefined
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PWA_BANNER_DISMISSED_STORAGE_KEY) === 'true';
  } catch (error) {
    console.warn('Failed to read PWA banner dismissal state:', error);
    return false;
  }
}

export function markPwaBannerDismissed(
  storage: Pick<PwaSessionStorageLike, 'setItem'> | null | undefined
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PWA_BANNER_DISMISSED_STORAGE_KEY, 'true');
    return true;
  } catch (error) {
    console.warn('Failed to persist PWA banner dismissal state:', error);
    return false;
  }
}

export type PwaInstallPromptOutcome = 'noop' | 'accepted' | 'dismissed' | 'error';

export async function executePwaInstallPrompt(
  promptEvent: Pick<BeforeInstallPromptEvent, 'prompt' | 'userChoice'> | null
): Promise<PwaInstallPromptOutcome> {
  if (!promptEvent) return 'noop';
  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    return outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch (error) {
    console.warn('PWA install prompt failed:', error);
    return 'error';
  }
}

function getSafeSessionStorage(): PwaSessionStorageLike | null {
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn('Failed to access sessionStorage:', error);
    return null;
  }
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPWA, setIsPWA] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already launched in PWA standalone mode
    const checkPwaMode = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as NavigatorWithStandalone).standalone ||
        document.referrer.includes('android-app://');

      setIsPWA(isStandalone);

      // If already PWA, make sure banner is hidden
      if (isStandalone) {
        setShowPwaBanner(false);
      }
    };

    checkPwaMode();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Only show banner if NOT in PWA mode AND not manually dismissed this session
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as NavigatorWithStandalone).standalone;
      const dismissed = isPwaBannerDismissed(getSafeSessionStorage());
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
    const outcome = await executePwaInstallPrompt(deferredPrompt);
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPwaBanner(false);
      toast.success('薬局OSのインストールを開始しました！');
    } else if (outcome === 'error') {
      setDeferredPrompt(null);
      toast.error('アプリのインストールを開始できませんでした。ブラウザのメニューから追加してください。');
    }
  };

  const dismissPwaBanner = () => {
    markPwaBannerDismissed(getSafeSessionStorage());
    setShowPwaBanner(false);
  };

  return {
    isPWA,
    showPwaBanner,
    handlePwaInstall,
    dismissPwaBanner
  };
}
