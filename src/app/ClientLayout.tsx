'use client';

import { Download, FileText, LayoutDashboard, Package, Scan, Search, Settings, X, KeyRound, Fingerprint, Loader2, RefreshCw, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { getCurrentUser, isAuthenticatedUser, setCurrentUser, logAuditAction, UNAUTHENTICATED_USER } from '@/lib/audit';
import { hasLoginCredential, isInitialAdminUser } from '@/lib/initial_staff';
import type { Patient, User } from '@/db/types';
import { toast } from 'sonner';
import FirstRunTutorial from '@/components/FirstRunTutorial';
import PreLoginTour from '@/components/PreLoginTour';

const navItems = [
  { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/ocr', label: '処方箋OCR', icon: Scan },
  { href: '/emr', label: '薬歴入力', icon: FileText },
  { href: '/inventory', label: '在庫管理', icon: Package },
];

const SESSION_LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focus'] as const;
const STAFF_LOAD_TIMEOUT_MS = 8000;
// 初期管理者パスワード設定より前に、未ログインのまま体験できるデモの既読状態
const PRE_LOGIN_TOUR_STORAGE_KEY = 'yakureki:pre-login-tour:v1';

const toUser = (doc: any): User => {
  const data = typeof doc?.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    userId: data.userId,
    name: data.name,
    role: data.role,
    passwordHash: data.passwordHash,
    salt: data.salt,
    passkeyCredentialId: data.passkeyCredentialId,
    passkeyPublicKey: data.passkeyPublicKey
  };
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUser, setLocalCurrentUser] = useState<User>(UNAUTHENTICATED_USER);
  const [users, setUsers] = useState<User[]>([]);
  const [hasLoadedUsers, setHasLoadedUsers] = useState(false);
  const [staffLoadTimedOut, setStaffLoadTimedOut] = useState(false);
  const [staffLoadError, setStaffLoadError] = useState('');
  const [staffLoadAttempt, setStaffLoadAttempt] = useState(0);
  const sessionLockTimerRef = useRef<number | null>(null);
  const isAuthenticated = isAuthenticatedUser(currentUser);
  const initialAdmin = users.find(isInitialAdminUser);
  const initialAdminNeedsCredential = !!initialAdmin && !hasLoginCredential(initialAdmin);
  const [preLoginTourDismissed, setPreLoginTourDismissed] = useState(false);
  const showPreLoginTour = !isAuthenticated && initialAdminNeedsCredential && !preLoginTourDismissed;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(PRE_LOGIN_TOUR_STORAGE_KEY)) {
        setPreLoginTourDismissed(true);
      }
    } catch {
      // ストレージにアクセスできない場合は毎回表示されるが、スキップは常に可能
    }
  }, []);

  const handleFinishPreLoginTour = useCallback(() => {
    try {
      window.localStorage.setItem(PRE_LOGIN_TOUR_STORAGE_KEY, new Date().toISOString());
    } catch {
      // このセッション中はステートで既読を保持する
    }
    setPreLoginTourDismissed(true);
  }, []);

  // PWA States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPWA, setIsPWA] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  // Register Service Worker and manage PWA prompts
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already launched in PWA standalone mode
    const checkPwaMode = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
        || (window.navigator as any).standalone 
        || document.referrer.includes('android-app://');
      
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
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      const dismissed = sessionStorage.getItem('pwa_banner_dismissed') === 'true';
      if (!isStandalone && !dismissed) {
        setShowPwaBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Register sw.js
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
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

  // Load current user on mount to avoid hydration mismatch
  useEffect(() => {
    const user = getCurrentUser();
    setLocalCurrentUser(user);
  }, []);

  // Login Modal State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [setupAdminName, setSetupAdminName] = useState('管理者');
  const [setupAdminPassword, setSetupAdminPassword] = useState('');
  const [setupError, setSetupError] = useState('');
  const [isCreatingInitialAdmin, setIsCreatingInitialAdmin] = useState(false);

  // Load and subscribe to DB users
  useEffect(() => {
    let sub: any;
    let isMounted = true;
    let hasCompletedStaffLoad = false;
    setHasLoadedUsers(false);
    setStaffLoadTimedOut(false);
    setStaffLoadError('');
    const staffLoadTimeout = window.setTimeout(() => {
      if (!isMounted || hasCompletedStaffLoad) return;
      setStaffLoadTimedOut(true);
    }, STAFF_LOAD_TIMEOUT_MS);

    const applyUsers = (list: any[] | null | undefined) => {
      if (!isMounted) return;
      hasCompletedStaffLoad = true;
      window.clearTimeout(staffLoadTimeout);
      const nextUsers = (list || []).map(toUser);

      setUsers(nextUsers);
      setStaffLoadTimedOut(false);
      setLocalCurrentUser((current) => {
        if (!isAuthenticatedUser(current)) return nextUsers.length > 0 ? current : UNAUTHENTICATED_USER;
        const refreshedCurrent = nextUsers.find((user) => user.userId === current.userId);
        return refreshedCurrent || UNAUTHENTICATED_USER;
      });
      setHasLoadedUsers(true);
    };

    const initUsers = async () => {
      try {
        const { getDatabase } = await import('@/db');
        const db = await getDatabase();
        if (!db) {
          applyUsers([]);
          return;
        }

        const initialUsers = await db.users.find().exec();
        applyUsers(initialUsers);

        sub = db.users.find().$.subscribe({
          next: applyUsers,
          error: (error: unknown) => {
            console.error('Failed to subscribe to users:', error);
            if (isMounted) {
              hasCompletedStaffLoad = true;
              window.clearTimeout(staffLoadTimeout);
              setStaffLoadError('スタッフ情報を継続して確認できませんでした。再試行してください。');
              setHasLoadedUsers(true);
            }
          }
        });
      } catch (err) {
        console.error('Failed to subscribe to users:', err);
        if (isMounted) {
          hasCompletedStaffLoad = true;
          window.clearTimeout(staffLoadTimeout);
          setStaffLoadError('スタッフ情報を読み込めませんでした。再試行してください。');
          setHasLoadedUsers(true);
        }
      }
    };
    initUsers();
    return () => {
      isMounted = false;
      window.clearTimeout(staffLoadTimeout);
      if (sub) sub.unsubscribe();
    };
  }, [staffLoadAttempt]);

  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = users.find(u => u.userId === e.target.value);
    if (selected) {
      if (selected.userId === currentUser.userId) return; // Ignore if same
      
      if (!hasLoginCredential(selected)) {
        if (isInitialAdminUser(selected)) {
          setSetupAdminName(selected.name || '管理者');
          toast.info('初期管理者の認証情報を先に設定してください。');
          return;
        }
        toast.error('このスタッフには認証情報が設定されていません。管理者がパスワードまたはパスキーを登録してください。');
        return;
      }

      setSelectedUser(selected);
      setPasswordInput('');
      setLoginError('');
      setShowLoginModal(true);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsVerifying(true);
    setLoginError('');

    try {
      if (!selectedUser.passwordHash || !selectedUser.salt) {
        setLoginError('このスタッフにはパスワードが設定されていません。パスキーで認証するか、管理者がパスワードを登録してください。');
        return;
      }

      const { verifyPassword } = await import('@/lib/auth');
      if (await verifyPassword(passwordInput, selectedUser)) {
        await completeLogin(selectedUser);
      } else {
        setLoginError('パスワードが正しくありません。');
      }
    } catch (err: any) {
      setLoginError(err.message || 'ログイン中にエラーが発生しました。');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!selectedUser) return;
    setIsVerifying(true);
    setLoginError('');

    try {
      const { authenticatePasskey } = await import('@/lib/auth');
      const success = await authenticatePasskey(selectedUser);
      if (success) {
        await completeLogin(selectedUser);
      } else {
        setLoginError('パスキー認証に失敗しました。');
      }
    } catch (err: any) {
      setLoginError(err.message || 'パスキー認証に失敗しました。');
    } finally {
      setIsVerifying(false);
    }
  };

  const completeLogin = async (user: User, options?: { continueOnboarding?: boolean }) => {
    setCurrentUser(user);
    setLocalCurrentUser(user);
    setShowLoginModal(false);
    setSelectedUser(null);
    setPasswordInput('');
    toast.success(`${user.name}としてログインしました。`);

    try {
      const { getDatabase } = await import('@/db');
      const db = await getDatabase();
      if (!db) return;
      await logAuditAction(
        db,
        'login',
        `スタッフログイン: 操作者「${user.name} (${user.role})」としてログインしました。`
      );
    } catch (err) {
      console.error('Failed to log login audit action:', err);
    }

    if (options?.continueOnboarding) {
      router.push('/settings?tab=staff&onboarding=1');
    }
  };

  const clearSessionLockTimer = useCallback(() => {
    if (sessionLockTimerRef.current) {
      window.clearTimeout(sessionLockTimerRef.current);
      sessionLockTimerRef.current = null;
    }
  }, []);

  const lockCurrentSession = useCallback(async () => {
    const lockedUser = getCurrentUser();
    if (!isAuthenticatedUser(lockedUser)) return;

    try {
      const { getDatabase } = await import('@/db');
      const db = await getDatabase();
      await logAuditAction(
        db,
        'session_lock',
        `無操作セッションロック: 操作者「${lockedUser.name} (${lockedUser.role})」を自動ログアウトしました。`
      );
    } catch (err) {
      console.error('Failed to log session lock audit action:', err);
    } finally {
      setCurrentUser(UNAUTHENTICATED_USER);
      setLocalCurrentUser(UNAUTHENTICATED_USER);
      setShowLoginModal(false);
      setSelectedUser(null);
      setPasswordInput('');
      setLoginError('');
      clearSessionLockTimer();
      toast.warning('一定時間操作がなかったため、スタッフセッションをロックしました。');
    }
  }, [clearSessionLockTimer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    clearSessionLockTimer();
    if (!isAuthenticated) return;

    const resetSessionLockTimer = () => {
      clearSessionLockTimer();
      sessionLockTimerRef.current = window.setTimeout(() => {
        void lockCurrentSession();
      }, SESSION_LOCK_TIMEOUT_MS);
    };

    resetSessionLockTimer();
    for (let i = 0; i < SESSION_ACTIVITY_EVENTS.length; i++) {
      window.addEventListener(SESSION_ACTIVITY_EVENTS[i], resetSessionLockTimer, { passive: true });
    }

    return () => {
      clearSessionLockTimer();
      for (let i = 0; i < SESSION_ACTIVITY_EVENTS.length; i++) {
        window.removeEventListener(SESSION_ACTIVITY_EVENTS[i], resetSessionLockTimer);
      }
    };
  }, [clearSessionLockTimer, currentUser.userId, isAuthenticated, lockCurrentSession]);

  const handleInitialAdminPasswordSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    if (!initialAdmin) {
      setSetupError('初期管理者の準備が完了していません。再読み込みしてください。');
      return;
    }

    const name = setupAdminName.trim();
    const password = setupAdminPassword.trim();
    if (!name) {
      setSetupError('管理者名を入力してください。');
      return;
    }
    if (password.length < 8) {
      setSetupError('初期管理者パスワードは8文字以上にしてください。');
      return;
    }

    setIsCreatingInitialAdmin(true);
    try {
      const { getDatabase } = await import('@/db');
      const { generateSalt, hashPassword } = await import('@/lib/auth');
      const db = await getDatabase();

      const doc = await db.users.findOne(initialAdmin.userId).exec();
      if (!doc) {
        setSetupError('初期管理者が見つかりません。再読み込みしてください。');
        return;
      }

      const salt = generateSalt();
      const adminUser: User = {
        ...initialAdmin,
        name,
        salt,
        passwordHash: await hashPassword(password, salt)
      };
      await doc.patch({
        name: adminUser.name,
        salt: adminUser.salt,
        passwordHash: adminUser.passwordHash
      });
      await completeLogin(adminUser, { continueOnboarding: true });
      setSetupAdminName('');
      setSetupAdminPassword('');
      toast.success('初期管理者のパスワードを設定しました。');
    } catch (err: any) {
      console.error('Failed to set initial administrator password:', err);
      setSetupError(err.message || '初期管理者パスワードの設定に失敗しました。');
    } finally {
      setIsCreatingInitialAdmin(false);
    }
  };

  const handleInitialAdminPasskeySetup = async () => {
    setSetupError('');

    if (!initialAdmin) {
      setSetupError('初期管理者の準備が完了していません。再読み込みしてください。');
      return;
    }

    const name = setupAdminName.trim();
    if (!name) {
      setSetupError('管理者名を入力してください。');
      return;
    }

    setIsCreatingInitialAdmin(true);
    try {
      const { getDatabase } = await import('@/db');
      const { registerPasskey } = await import('@/lib/auth');
      const db = await getDatabase();
      const doc = await db.users.findOne(initialAdmin.userId).exec();
      if (!doc) {
        setSetupError('初期管理者が見つかりません。再読み込みしてください。');
        return;
      }

      const adminUser: User = {
        ...initialAdmin,
        name
      };
      const creds = await registerPasskey(adminUser);
      const updatedUser: User = {
        ...adminUser,
        passkeyCredentialId: creds.credentialId,
        passkeyPublicKey: creds.publicKey
      };

      await doc.patch({
        name: updatedUser.name,
        passkeyCredentialId: updatedUser.passkeyCredentialId,
        passkeyPublicKey: updatedUser.passkeyPublicKey
      });
      await completeLogin(updatedUser, { continueOnboarding: true });
      setSetupAdminName('');
      toast.success('初期管理者のパスキーを登録しました。');
    } catch (err: any) {
      console.error('Failed to set initial administrator passkey:', err);
      setSetupError(err.message || '初期管理者パスキーの登録に失敗しました。');
    } finally {
      setIsCreatingInitialAdmin(false);
    }
  };

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPillRef = useRef<HTMLDivElement>(null);
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Patient search over the local DB (name / kana partial match)
  useEffect(() => {
    const query = searchQuery.trim();
    if (!isAuthenticated || !query) {
      setPatientResults([]);
      setIsSearchOpen(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { getDatabase } = await import('@/db');
        const db = await getDatabase();
        if (!db || cancelled) return;
        const docs = await db.patients.find().exec();
        const lower = query.toLowerCase();
        const matches: Patient[] = (docs || [])
          .map((doc: any) => (typeof doc?.toJSON === 'function' ? doc.toJSON() : doc))
          .filter((p: any) =>
            (p.name || '').toLowerCase().includes(lower) || (p.kana || '').toLowerCase().includes(lower)
          )
          .slice(0, 8);
        if (cancelled) return;
        setPatientResults(matches);
        setIsSearchOpen(true);
      } catch (err) {
        console.error('Failed to search patients:', err);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, isAuthenticated]);

  // Close the search dropdown on outside click
  useEffect(() => {
    if (!isSearchOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (searchPillRef.current && !searchPillRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isSearchOpen]);

  // チュートリアルから呼ばれるデモデータ投入(デモ患者・受付・処方・在庫一式)
  const handleStartTutorialDemo = useCallback(async () => {
    try {
      const { getDatabase } = await import('@/db');
      const db = await getDatabase();
      if (!db) {
        toast.error('データベースに接続できませんでした。');
        return;
      }
      const { seedTutorialDemoData } = await import('@/lib/demo_data');
      const result = await seedTutorialDemoData(db);
      toast.success(result.alreadySeeded
        ? '進行中のデモ受付を開きます。'
        : 'デモ患者・受付・在庫を投入しました。ピッキングや不足記録まで練習できます。');
      router.push(`/emr?visitId=${encodeURIComponent(result.visitId)}`);
    } catch (err) {
      console.error('Failed to seed tutorial demo data:', err);
      toast.error('デモデータの投入に失敗しました。');
    }
  }, [router]);

  // 練習後のデモデータ(患者・受付・処方・薬歴・アラート・在庫)を一括削除する
  const handleCleanupTutorialDemo = useCallback(async () => {
    try {
      const { getDatabase } = await import('@/db');
      const db = await getDatabase();
      if (!db) {
        toast.error('データベースに接続できませんでした。');
        return;
      }
      const { cleanupTutorialDemoData } = await import('@/lib/demo_data');
      const result = await cleanupTutorialDemoData(db);
      const removedTotal =
        result.removedVisits +
        result.removedPrescriptionItems +
        result.removedSoapRecords +
        result.removedInterventions +
        result.removedAlerts +
        result.removedDrugs +
        result.removedStocks +
        (result.removedPatient ? 1 : 0);
      toast.success(removedTotal > 0
        ? `デモデータを片づけました（受付${result.removedVisits}件・処方${result.removedPrescriptionItems}件・在庫${result.removedStocks}件など）。`
        : '削除対象のデモデータはありませんでした。');
    } catch (err) {
      console.error('Failed to cleanup tutorial demo data:', err);
      toast.error('デモデータの削除に失敗しました。');
    }
  }, []);

  const handleSelectPatient = async (patient: Patient) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    try {
      const { getDatabase } = await import('@/db');
      const db = await getDatabase();
      if (!db) return;
      const visitDocs = await db.visits.find({ selector: { patientId: patient.patientId } }).exec();
      const visits = (visitDocs || []).map((doc: any) => (typeof doc?.toJSON === 'function' ? doc.toJSON() : doc));
      if (visits.length === 0) {
        toast.info(`「${patient.name}」の受付履歴がまだありません。処方箋OCRから受付してください。`);
        router.push('/ocr');
        return;
      }
      visits.sort((a: any, b: any) => (b.issueDate || '').localeCompare(a.issueDate || ''));
      router.push(`/emr?visitId=${encodeURIComponent(visits[0].visitId)}`);
    } catch (err) {
      console.error('Failed to open patient from search:', err);
      toast.error('患者情報を開けませんでした。');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const idleCallback = 'requestIdleCallback' in window
      ? window.requestIdleCallback.bind(window)
      : (cb: () => void) => window.setTimeout(cb, 1000);

    const handle = idleCallback(() => {
      import('@/lib/ocr/processor').then(({ preloadOcr }) => {
        preloadOcr();
      }).catch(() => {});
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if ('cancelIdleCallback' in window) {
        window.cancelIdleCallback(handle as number);
      } else {
        clearTimeout(handle as number);
      }
    };
  }, []);

  return (
    <>
      <DatabaseProvider>
          <div className="layout-wrapper">
            <aside className="sidebar">
              <div className="brand">
                <div className="logo-spark" aria-hidden="true">薬</div>
                <div>
                  <h1>pharma-oss</h1>
                  <span>薬局業務支援</span>
                </div>
              </div>

              <nav className="side-nav" aria-label="メインナビゲーション">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                      <Icon size={19} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="side-footer">
                <div className="status-panel">
                  <span className="status-dot" aria-hidden="true" />
                  <div>
                    <strong>ローカル保存</strong>
                    <span>端末内データベース稼働中</span>
                  </div>
                </div>
                <Link href="/settings" className={`nav-item ${pathname === '/settings' ? 'active' : ''}`}>
                  <Settings size={19} aria-hidden="true" />
                  <span>設定</span>
                </Link>
              </div>
            </aside>

            <main className="main-viewport">
              {showPwaBanner && (
                <div className="pwa-install-banner animate-fade-in">
                  <div className="pwa-install-copy">
                    <div className="pwa-install-icon" aria-hidden="true">
                      <Download size={18} />
                    </div>
                    <div>
                      <strong>薬局OS（PWA）をインストール</strong>
                      <span>
                        アプリとしてインストールすることで、ブラウザの容量逼迫によるデータベース自動削除から永久に保護されます。
                      </span>
                    </div>
                  </div>
                  <div className="pwa-install-actions">
                    <button 
                      type="button"
                      className="pwa-install-button"
                      onClick={handlePwaInstall}
                    >
                      インストール
                    </button>
                    <button 
                      type="button"
                      className="pwa-dismiss-button"
                      onClick={dismissPwaBanner}
                      aria-label="案内を閉じる"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              )}
              <header className="top-bar">
                <div className="search-pill" ref={searchPillRef}>
                  <Search size={18} className="icon-ghost" aria-hidden="true" />
                  <input
                    id="global-search"
                    ref={searchInputRef}
                    type="search"
                    placeholder="患者名・カナで検索"
                    aria-label="患者名・カナで検索"
                    aria-keyshortcuts="Meta+K Control+K"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if (searchQuery.trim() && patientResults.length > 0) setIsSearchOpen(true); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsSearchOpen(false);
                      } else if (e.key === 'Enter' && isSearchOpen && patientResults.length > 0) {
                        e.preventDefault();
                        void handleSelectPatient(patientResults[0]);
                      }
                    }}
                  />
                  {!searchQuery ? (
                    <div className="search-shortcut" aria-hidden="true"><kbd>Ctrl</kbd><kbd>K</kbd></div>
                  ) : (
                    <button
                      className="btn-clear"
                      onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                      aria-label="検索キーワードをクリア"
                      title="検索キーワードをクリア"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                  {isSearchOpen && (
                    <div className="search-results" role="listbox" aria-label="患者検索結果">
                      {patientResults.length === 0 ? (
                        <p className="search-results-empty">一致する患者がいません</p>
                      ) : (
                        patientResults.map((patient) => (
                          <button
                            key={patient.patientId}
                            type="button"
                            role="option"
                            aria-selected="false"
                            className="search-result-item"
                            onClick={() => void handleSelectPatient(patient)}
                          >
                            <span className="search-result-name">{patient.name}</span>
                            <span className="search-result-meta">
                              {[patient.kana, patient.birthDate].filter(Boolean).join(' / ') || '詳細未登録'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {isAuthenticated && (
                    <FirstRunTutorial
                      userId={currentUser.userId}
                      autoOpen={true}
                      onStartReception={() => router.push('/ocr')}
                      onStartDemo={handleStartTutorialDemo}
                      onCleanupDemo={handleCleanupTutorialDemo}
                    />
                  )}
                  <select
                    aria-label="操作者切り替え"
                    value={currentUser.userId}
                    onChange={handleUserChange}
                    className="user-select glass"
                    style={{
                      padding: '0.4rem 0.75rem',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.65)',
                      color: 'var(--foreground)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value={UNAUTHENTICATED_USER.userId} disabled style={{ color: '#333' }}>
                      スタッフを選択
                    </option>
                    {users.length > 0 ? (
                      users.map(u => (
                        <option key={u.userId} value={u.userId} style={{ color: '#333' }}>
                          {u.name} ({u.role === 'pharmacist' ? '薬剤師' : u.role === 'clerk' ? '事務' : '管理者'})
                        </option>
                      ))
                    ) : (
                      <option value={currentUser.userId}>{currentUser.name}</option>
                    )}
                  </select>
                  <div className="avatar" aria-label={currentUser.name}>
                    {isAuthenticated ? currentUser.name.substring(0, 2) : <UserRound size={18} aria-hidden="true" />}
                  </div>
                </div>
              </header>

              <section className="content-scroll">
                {staffLoadError ? (
                  <div className="card glass" role="alert" style={{ margin: '2rem auto', maxWidth: '720px', padding: '1.5rem' }}>
                    <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>スタッフ情報を確認できません</h2>
                    <p className="text-muted" style={{ margin: '0 0 0.9rem', lineHeight: 1.7 }}>
                      {staffLoadError} 患者情報や受付は、確認が完了するまで表示しません。
                    </p>
                    <button
                      type="button"
                      className="btn-secondary flex-center gap-2"
                      onClick={() => setStaffLoadAttempt((attempt) => attempt + 1)}
                    >
                      <RefreshCw size={15} aria-hidden="true" />
                      <span>再試行</span>
                    </button>
                  </div>
                ) : !hasLoadedUsers ? (
                  <div className="card glass" role="status" style={{ margin: '2rem auto', maxWidth: '720px', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                      <span>スタッフ情報を確認しています...</span>
                    </div>
                    {staffLoadTimedOut && (
                      <p className="text-muted" style={{ margin: '0.75rem 0 0', lineHeight: 1.7 }}>
                        初回起動やデータ更新後は時間がかかることがあります。確認が終わるまで、このままお待ちください。
                      </p>
                    )}
                  </div>
                ) : isAuthenticated ? (
                  children
                ) : showPreLoginTour ? (
                  <PreLoginTour onFinish={handleFinishPreLoginTour} />
                ) : initialAdminNeedsCredential ? (
                  <form className="card glass" onSubmit={handleInitialAdminPasswordSetup} style={{ margin: '2rem auto', maxWidth: '720px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>初期管理者の認証を設定してください</h2>
                      <p className="text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                        初期管理者は登録済みです。パスワードまたはパスキーを設定するとログインできます。
                      </p>
                    </div>
                    {setupError && (
                      <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', fontSize: '0.9rem' }}>
                        {setupError}
                      </div>
                    )}
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 600 }}>
                      管理者名
                      <input
                        type="text"
                        value={setupAdminName}
                        onChange={(e) => setSetupAdminName(e.target.value)}
                        autoComplete="name"
                        style={{ padding: '0.7rem', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem' }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 600 }}>
                      初期パスワード（8文字以上）
                      <input
                        type="password"
                        value={setupAdminPassword}
                        onChange={(e) => setSetupAdminPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        style={{ padding: '0.7rem', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem' }}
                      />
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <button type="submit" className="btn-primary flex-center gap-2" disabled={isCreatingInitialAdmin}>
                        {isCreatingInitialAdmin && <Loader2 size={16} className="animate-spin" />}
                        <KeyRound size={16} />
                        <span>パスワードを設定して開始</span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex-center gap-2"
                        onClick={handleInitialAdminPasskeySetup}
                        disabled={isCreatingInitialAdmin}
                        style={{
                          border: '1px solid #3b82f6',
                          color: '#2563eb',
                          background: 'rgba(37, 99, 235, 0.04)'
                        }}
                      >
                        {isCreatingInitialAdmin && <Loader2 size={16} className="animate-spin" />}
                        <Fingerprint size={16} />
                        <span>パスキーを登録して開始</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="card glass" role="status" style={{ margin: '2rem auto', maxWidth: '720px', padding: '1.5rem' }}>
                    <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>スタッフログインが必要です</h2>
                    <p className="text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                      右上の操作者メニューからスタッフを選択し、パスワードまたはパスキーで認証してください。未ログイン状態では患者情報、受付、印刷、設定を操作できません。
                    </p>
                  </div>
                )}
              </section>
            </main>
          </div>
      </DatabaseProvider>

      {/* Staff Login Modal */}
      {showLoginModal && selectedUser && (
        <div 
          className="login-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            className="login-modal card glass animate-fade-in"
            style={{
              width: '90%',
              maxWidth: '420px',
              padding: '2rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: 'var(--shadow-xl)',
              background: 'rgba(255, 255, 255, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              color: 'var(--foreground)'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                スタッフログイン
              </h2>
              <p className="text-muted text-sm">
                「{selectedUser.name}」として認証してください
              </p>
            </div>

            {loginError && (
              <div 
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  fontWeight: 500
                }}
              >
                ⚠️ {loginError}
              </div>
            )}

            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="staff-password" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  パスワード
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="staff-password"
                    type="password"
                    placeholder="パスワードを入力してください"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.9rem',
                      outline: 'none',
                      background: 'rgba(255, 255, 255, 0.8)',
                      color: 'var(--foreground)'
                    }}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                  />
                  <KeyRound 
                    size={16} 
                    className="text-ghost" 
                    style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  className="btn-primary flex-center gap-2"
                  style={{ width: '100%', padding: '0.7rem' }}
                  disabled={isVerifying}
                >
                  {isVerifying && <Loader2 size={16} className="animate-spin" />}
                  <span>パスワードでログイン</span>
                </button>

                {selectedUser.passkeyCredentialId && (
                  <button
                    type="button"
                    className="btn-secondary flex-center gap-2"
                    style={{
                      width: '100%',
                      padding: '0.7rem',
                      border: '1px solid #3b82f6',
                      color: '#2563eb',
                      background: 'rgba(37, 99, 235, 0.04)'
                    }}
                    onClick={handlePasskeyLogin}
                    disabled={isVerifying}
                  >
                    <Fingerprint size={16} />
                    <span>パスキーでログイン</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-secondary text-sm"
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.7rem' }}
                  onClick={() => {
                    setShowLoginModal(false);
                    setSelectedUser(null);
                    setPasswordInput('');
                    setLoginError('');
                  }}
                  disabled={isVerifying}
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
