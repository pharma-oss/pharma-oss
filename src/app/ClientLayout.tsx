'use client';

import { Download, FileText, LayoutDashboard, Package, Scan, Search, Settings, X, KeyRound, Fingerprint, Loader2, RefreshCw, UserRound, Sparkles, AlertOctagon, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { getCurrentUser, isAuthenticatedUser, setCurrentUser, logAuditAction, UNAUTHENTICATED_USER } from '@/lib/audit';
import { hasLoginCredential, isInitialAdminUser } from '@/lib/initial_staff';
import type { Patient, User } from '@/db/types';
import { toast } from 'sonner';
import FirstRunTutorial, { tutorialStorageKey } from '@/components/FirstRunTutorial';
import PreLoginTour from '@/components/PreLoginTour';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { CapsuleGlyph } from '@/components/brand/CapsuleMark';
import { DbSecurityBanner } from '@/components/DbSecurityBanner';
import { SatelliteQueueWarningBanner } from '@/components/sync/SatelliteQueueWarningBanner';
import { LoginModal } from '@/components/layout/LoginModal';
import { usePWA } from '@/hooks/usePWA';
import { useSessionLock } from '@/hooks/useSessionLock';

const navItems = [
  { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/ocr', label: '処方箋OCR', icon: Scan },
  { href: '/emr', label: '薬歴入力', icon: FileText },
  { href: '/inventory', label: '在庫管理', icon: Package },
];

export const STAFF_LOAD_TIMEOUT_MS = 8000;
// 初期管理者パスワード設定より前に、未ログインのまま体験できるデモの既読状態
export const PRE_LOGIN_TOUR_STORAGE_KEY = 'yakureki:pre-login-tour:v1';

const toUser = (doc: any): User => {
  const data = typeof doc?.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    userId: data.userId,
    name: data.name,
    role: data.role,
    passwordHash: data.passwordHash,
    salt: data.salt,
    passkeyCredentialId: data.passkeyCredentialId,
    passkeyPublicKey: data.passkeyPublicKey,
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
  const [isOfflineAuthMode, setIsOfflineAuthMode] = useState(false);
  const [isTerminalRevoked, setIsTerminalRevoked] = useState(false);
  const [offlineExpiresAt, setOfflineExpiresAt] = useState('');

  const isAuthenticated = isAuthenticatedUser(currentUser);
  const initialAdmin = users.find(isInitialAdminUser);
  const initialAdminNeedsCredential = !isOfflineAuthMode && !isTerminalRevoked && !!initialAdmin && !hasLoginCredential(initialAdmin);
  const [preLoginTourDismissed, setPreLoginTourDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(window.localStorage.getItem(PRE_LOGIN_TOUR_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const showPreLoginTour = !isAuthenticated && initialAdminNeedsCredential && !preLoginTourDismissed;
  // ゲスト体験中(パスワード未設定の初期管理者としてログインしている)かどうか。
  // 実際にパスワード/パスキーが設定されるとhasLoginCredentialがtrueになり自動的に外れる。
  const isGuestDemoSession = isAuthenticated && isInitialAdminUser(currentUser) && !hasLoginCredential(currentUser);

  // Custom hook for PWA
  const { showPwaBanner, handlePwaInstall, dismissPwaBanner } = usePWA();

  // Custom hook for Session Lock
  const handleSessionLocked = useCallback(() => {
    setShowLoginModal(false);
    setSelectedUser(null);
    setPasswordInput('');
    setLoginError('');
  }, []);

  useSessionLock({
    isAuthenticated,
    currentUser,
    onSessionLocked: handleSessionLocked
  });

  const handleFinishPreLoginTour = useCallback(() => {
    try {
      window.localStorage.setItem(PRE_LOGIN_TOUR_STORAGE_KEY, new Date().toISOString());
    } catch {
      // このセッション中はステートで既読を保持する
    }
    setPreLoginTourDismissed(true);
  }, []);

  // Load current user on mount to avoid hydration mismatch
  useEffect(() => {
    const user = getCurrentUser();
    setLocalCurrentUser(user);
  }, []);

  // Periodic and storage event check for satellite offline auth and revocation tombstone
  useEffect(() => {
    let active = true;
    const checkState = async () => {
      try {
        const { isSatelliteRevokedTombstone, getOfflineAuthCache } = await import('@/lib/sync/satellite_offline_auth');
        if (!active) return;
        if (isSatelliteRevokedTombstone()) {
          setIsTerminalRevoked(true);
          return;
        }
        setIsTerminalRevoked(false);

        // Check if role is satellite and probe hub status
        const { resolveClientSyncIdentity } = await import('@/lib/sync/client_role');
        const identity = await resolveClientSyncIdentity();
        if (!active) return;
        if (identity.role === 'satellite') {
          const res = await fetch('/api/sync/status').catch(() => null);
          const isReachable = res?.ok ? ((await res.json().catch(() => ({}))).hubReachable !== false) : false;
          if (!active) return;
          if (!isReachable) {
            setIsOfflineAuthMode(true);
            const offlineCache = getOfflineAuthCache();
            if (offlineCache.ok) {
              setOfflineExpiresAt(offlineCache.expiresAt);
            }
          } else {
            setIsOfflineAuthMode(false);
          }
        }
      } catch {}
    };

    checkState();
    const interval = window.setInterval(checkState, 2000);

    const handleStorage = (e: StorageEvent) => {
      checkState();
      if (
        e.key === 'yakureki_satellite_offline_auth_cache_v1' ||
        e.key === 'yakureki_satellite_revocation_tombstone'
      ) {
        setStaffLoadAttempt((a) => a + 1);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
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
  const [isResumingGuestDemo, setIsResumingGuestDemo] = useState(false);

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

      if (nextUsers.length > 0) {
        setUsers(nextUsers);
        setIsOfflineAuthMode(false);
        setIsTerminalRevoked(false);
        setStaffLoadTimedOut(false);
        setLocalCurrentUser((current) => {
          if (!isAuthenticatedUser(current)) return nextUsers.length > 0 ? current : UNAUTHENTICATED_USER;
          const refreshedCurrent = nextUsers.find((user) => user.userId === current.userId);
          return refreshedCurrent || UNAUTHENTICATED_USER;
        });
        setHasLoadedUsers(true);
        import('@/lib/sync/satellite_offline_auth').then(({ saveOfflineAuthCache }) => {
          saveOfflineAuthCache(nextUsers);
        }).catch(() => {});
      } else {
        import('@/lib/sync/satellite_offline_auth').then(({ isSatelliteRevokedTombstone, getOfflineAuthCache }) => {
          if (!isMounted) return;
          if (isSatelliteRevokedTombstone()) {
            setIsTerminalRevoked(true);
            setUsers([]);
            setLocalCurrentUser(UNAUTHENTICATED_USER);
            setHasLoadedUsers(true);
            return;
          }

          const offlineCache = getOfflineAuthCache();
          if (offlineCache.ok && offlineCache.users.length > 0) {
            setUsers(offlineCache.users);
            setIsOfflineAuthMode(true);
            setOfflineExpiresAt(offlineCache.expiresAt);
            setStaffLoadTimedOut(false);
            setLocalCurrentUser((current) => {
              if (!isAuthenticatedUser(current)) return offlineCache.users[0] || UNAUTHENTICATED_USER;
              const matched = offlineCache.users.find((u) => u.userId === current.userId);
              return matched || UNAUTHENTICATED_USER;
            });
            setHasLoadedUsers(true);
          } else {
            setUsers([]);
            setLocalCurrentUser(UNAUTHENTICATED_USER);
            setHasLoadedUsers(true);
          }
        }).catch(() => {
          if (isMounted) {
            setUsers([]);
            setLocalCurrentUser(UNAUTHENTICATED_USER);
            setHasLoadedUsers(true);
          }
        });
      }
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

      if (isOfflineAuthMode) {
        const { verifyOfflinePassword } = await import('@/lib/sync/satellite_offline_auth');
        if (await verifyOfflinePassword(passwordInput, selectedUser)) {
          await completeLogin(selectedUser);
          toast.success(`${selectedUser.name}（オフライン認証）としてログインしました。`);
        } else {
          setLoginError('パスワードが正しくありません。');
        }
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

  // 初回起動(管理者パスワード未設定)の間だけ、ログインなしで実際のアプリをデモデータ付きで
  // 操作できるようにする。認証は「未設定の初期管理者としてログイン」で成立させ、
  // RBAC・監査ログなど既存の仕組みをそのまま使う。パスワード自体は設定しないため、
  // 通常の初期セットアップ導線(パスワード/パスキー設定)は体験終了後もそのまま使える。
  const handleStartGuestDemo = async () => {
    if (!initialAdmin) {
      toast.error('初期管理者の準備が完了していません。再読み込みしてください。');
      return;
    }
    handleFinishPreLoginTour();
    // PreLoginTourで既に案内済みのため、ログイン直後に「3分デモ」を二重に自動表示しない。
    try {
      window.localStorage.setItem(tutorialStorageKey(initialAdmin.userId), new Date().toISOString());
    } catch {
      // 保存できなくても体験は継続できる(3分デモが1回多く出るだけ)
    }
    await completeLogin(initialAdmin);

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
        : 'デモ患者・受付・在庫を投入しました。ログインなしで実際の画面を操作できます。');
      router.push(`/emr?visitId=${encodeURIComponent(result.visitId)}`);
    } catch (err) {
      console.error('Failed to seed guest demo data:', err);
      toast.error('デモデータの投入に失敗しました。');
    }
  };

  // パスワード設定を促す認証ゲート画面から、ログアウト等でセッションが切れた
  // ゲスト体験にワンクリックで戻るための導線。処理自体はhandleStartGuestDemoと同じ
  // (初期管理者としてログイン+デモデータ投入)だが、この画面専用のローディング表示を持たせる。
  const handleResumeGuestDemoFromAuthGate = async () => {
    setIsResumingGuestDemo(true);
    try {
      await handleStartGuestDemo();
    } finally {
      setIsResumingGuestDemo(false);
    }
  };

  // ゲスト体験を終える。パスワードは設定していないので、通常の初期セットアップ画面へ戻る。
  const handleEndGuestDemo = () => {
    setCurrentUser(UNAUTHENTICATED_USER);
    setLocalCurrentUser(UNAUTHENTICATED_USER);
    toast.info('体験モードを終了しました。続けるには管理者パスワードを設定してください。');
  };

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
        result.removedPatients;
      toast.success(removedTotal > 0
        ? `デモデータを片づけました（患者${result.removedPatients}名・受付${result.removedVisits}件・処方${result.removedPrescriptionItems}件・在庫${result.removedStocks}件など）。`
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
                <div className="logo-spark" aria-hidden="true">
                  <CapsuleGlyph size={24} />
                </div>
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
              <DbSecurityBanner />
              <SatelliteQueueWarningBanner />
              {isGuestDemoSession && (
                <div className="pwa-install-banner guest-demo-banner animate-fade-in" data-testid="guest-demo-banner">
                  <div className="pwa-install-copy">
                    <div className="pwa-install-icon" aria-hidden="true">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <strong>体験モードで操作しています（パスワード未設定）</strong>
                      <span>
                        デモ患者・受付データで自由に試せます。実運用を始める前に管理者パスワードを設定してください。
                      </span>
                    </div>
                  </div>
                  <div className="pwa-install-actions">
                    <button
                      type="button"
                      className="pwa-install-button"
                      onClick={handleEndGuestDemo}
                      data-testid="guest-demo-end-button"
                    >
                      体験を終了してパスワードを設定
                    </button>
                  </div>
                </div>
              )}
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

                <div className="user-profile">
                  <SyncStatusIndicator />
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
                  >
                    <option value={UNAUTHENTICATED_USER.userId} disabled className="user-option">
                      スタッフを選択
                    </option>
                    {users.length > 0 ? (
                      users.map(u => (
                        <option key={u.userId} value={u.userId} className="user-option">
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
                {isTerminalRevoked ? (
                  <div className="card glass auth-card" role="alert" style={{ border: '2px solid var(--danger, #ef4444)', background: 'rgba(239, 68, 68, 0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger, #ef4444)', marginBottom: '0.75rem' }}>
                      <AlertOctagon size={28} aria-hidden="true" />
                      <h2 className="auth-title" style={{ margin: 0, color: 'var(--danger, #ef4444)' }}>この端末は失効されています</h2>
                    </div>
                    <p className="text-muted auth-desc-compact" style={{ lineHeight: 1.7 }}>
                      このサテライト端末は管理者によってアクセス権が失効（Revoke）されました。
                      患者データの保護のため、端末内の認証キャッシュおよび未送信データは安全に消去（Zeroize）されています。
                      オフライン状態であっても本端末からログインすることはできません。
                      業務を再開するには、メイン端末の「設定 &gt; 端末同期」から本端末を再登録してください。
                    </p>
                  </div>
                ) : staffLoadError ? (
                  <div className="card glass auth-card" role="alert">
                    <h2 className="auth-title">スタッフ情報を確認できません</h2>
                    <p className="text-muted auth-desc">
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
                  <div className="card glass auth-card" role="status">
                    <div className="auth-status-row">
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                      <span>スタッフ情報を確認しています...</span>
                    </div>
                    {staffLoadTimedOut && (
                      <p className="text-muted auth-timeout-note">
                        初回起動やデータ更新後は時間がかかることがあります。確認が終わるまで、このままお待ちください。
                      </p>
                    )}
                  </div>
                ) : isAuthenticated ? (
                  <>
                    {isOfflineAuthMode && (
                      <div style={{ background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: 'var(--radius-md)', padding: '0.6rem 1rem', margin: '0.75rem var(--space-4)', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                        <AlertTriangle size={17} style={{ color: '#ca8a04', flexShrink: 0 }} aria-hidden="true" />
                        <span>
                          <strong>【オフライン認証中】</strong> メイン端末と通信できないため、端末内認証キャッシュ（有効期限: {offlineExpiresAt ? new Date(offlineExpiresAt).toLocaleTimeString() : '24時間'}）でログインしています。
                        </span>
                      </div>
                    )}
                    {children}
                  </>
                ) : showPreLoginTour ? (
                  <PreLoginTour onFinish={handleFinishPreLoginTour} onStartGuestDemo={handleStartGuestDemo} />
                ) : initialAdminNeedsCredential ? (
                  <form className="card glass auth-setup-form" onSubmit={handleInitialAdminPasswordSetup}>
                    <div>
                      <h2 className="auth-title">初期管理者の認証を設定してください</h2>
                      <p className="text-muted auth-desc-compact">
                        初期管理者は登録済みです。パスワードまたはパスキーを設定するとログインできます。
                      </p>
                    </div>
                    {setupError && (
                      <div role="alert" className="auth-error-box">
                        {setupError}
                      </div>
                    )}
                    <label className="auth-label">
                      管理者名
                      <input
                        type="text"
                        value={setupAdminName}
                        onChange={(e) => setSetupAdminName(e.target.value)}
                        autoComplete="name"
                        className="auth-input"
                      />
                    </label>
                    <label className="auth-label">
                      初期パスワード（8文字以上）
                      <input
                        type="password"
                        value={setupAdminPassword}
                        onChange={(e) => setSetupAdminPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        className="auth-input"
                      />
                    </label>
                    <div className="auth-actions">
                      <button type="submit" className="btn-primary flex-center gap-2" disabled={isCreatingInitialAdmin}>
                        {isCreatingInitialAdmin && <Loader2 size={16} className="animate-spin" />}
                        <KeyRound size={16} />
                        <span>パスワードを設定して開始</span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex-center gap-2 btn-passkey-setup"
                        onClick={handleInitialAdminPasskeySetup}
                        disabled={isCreatingInitialAdmin}
                      >
                        {isCreatingInitialAdmin && <Loader2 size={16} className="animate-spin" />}
                        <Fingerprint size={16} />
                        <span>パスキーを登録して開始</span>
                      </button>
                    </div>
                    <div className="auth-demo-footer">
                      <p className="text-muted auth-demo-desc">
                        まだパスワードを決めていない場合は、デモ患者・受付データで自由に試せる体験モードに戻れます。
                      </p>
                      <button
                        type="button"
                        className="btn-secondary flex-center gap-2 btn-resume-demo"
                        onClick={handleResumeGuestDemoFromAuthGate}
                        disabled={isResumingGuestDemo || isCreatingInitialAdmin}
                      >
                        {isResumingGuestDemo && <Loader2 size={16} className="animate-spin" />}
                        <Sparkles size={16} />
                        <span>デモ体験を再開する</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="card glass auth-card" role="status">
                    <h2 className="auth-title">スタッフログインが必要です</h2>
                    <p className="text-muted auth-desc-compact">
                      右上の操作者メニューからスタッフを選択し、パスワードまたはパスキーで認証してください。未ログイン状態では患者情報、受付、印刷、設定を操作できません。
                    </p>
                  </div>
                )}
              </section>
            </main>
          </div>
      </DatabaseProvider>

      <style jsx>{`
        .user-profile {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .user-select {
          padding: var(--space-1-5) var(--space-3);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.65);
          color: var(--foreground);
          font-size: var(--fs-md);
          font-weight: 600;
          cursor: pointer;
          outline: none;
        }
        .user-option {
          color: #333;
        }
        .auth-card {
          margin: var(--space-8) auto;
          max-width: 720px;
          padding: var(--space-6);
        }
        .auth-title {
          margin: 0 0 var(--space-2);
          font-size: 1.25rem;
        }
        .auth-desc {
          margin: 0 0 var(--space-3-5);
          line-height: 1.7;
        }
        .auth-status-row {
          display: flex;
          align-items: center;
          gap: var(--space-2-5);
        }
        .auth-timeout-note {
          margin: var(--space-3) 0 0;
          line-height: 1.7;
        }
        .auth-setup-form {
          margin: var(--space-8) auto;
          max-width: 720px;
          padding: var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .auth-error-box {
          color: #b91c1c;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: var(--radius-md);
          padding: var(--space-3);
          font-size: var(--fs-base);
        }
        .auth-label {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          font-weight: 600;
        }
        .auth-input {
          padding: var(--space-2-5) var(--space-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: var(--fs-base);
        }
        .auth-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
        }
        .btn-passkey-setup {
          border: 1px solid #3b82f6;
          color: #2563eb;
          background: rgba(37, 99, 235, 0.04);
        }
        .auth-demo-footer {
          border-top: 1px solid var(--border);
          padding-top: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .auth-demo-desc {
          margin: 0;
          font-size: var(--fs-md);
        }
        .btn-resume-demo {
          align-self: flex-start;
        }
        .auth-desc-compact {
          margin: 0;
          line-height: 1.7;
        }
      `}</style>

      {/* Staff Login Modal */}
      {showLoginModal && selectedUser && (
        <LoginModal
          selectedUser={selectedUser}
          passwordInput={passwordInput}
          loginError={loginError}
          isVerifying={isVerifying}
          onPasswordInputChange={setPasswordInput}
          onPasswordSubmit={handlePasswordLogin}
          onPasskeyClick={handlePasskeyLogin}
          onCancel={() => {
            setShowLoginModal(false);
            setSelectedUser(null);
            setPasswordInput('');
            setLoginError('');
          }}
        />
      )}
    </>
  );
}
