import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { User } from '@/db/types';
import {
  getCurrentUser,
  isAuthenticatedUser,
  logAuditAction,
  setCurrentUser,
  UNAUTHENTICATED_USER
} from '@/lib/audit';

export const SESSION_LOCK_TIMEOUT_MS = 15 * 60 * 1000;
export const SESSION_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focus'] as const;

export function useSessionLock({
  isAuthenticated,
  currentUser,
  onSessionLocked
}: {
  isAuthenticated: boolean;
  currentUser: User;
  onSessionLocked: () => void;
}) {
  const sessionLockTimerRef = useRef<number | null>(null);

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
      if (db) {
        await logAuditAction(
          db,
          'session_lock',
          `無操作セッションロック: 操作者「${lockedUser.name} (${lockedUser.role})」を自動ログアウトしました。`
        );
      }
    } catch (err) {
      console.error('Failed to log session lock audit action:', err);
    } finally {
      setCurrentUser(UNAUTHENTICATED_USER);
      onSessionLocked();
      clearSessionLockTimer();
      toast.warning('一定時間操作がなかったため、スタッフセッションをロックしました。');
    }
  }, [clearSessionLockTimer, onSessionLocked]);

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
      window.addEventListener(SESSION_ACTIVITY_EVENTS[i], resetSessionLockTimer, {
        passive: true
      });
    }

    return () => {
      clearSessionLockTimer();
      for (let i = 0; i < SESSION_ACTIVITY_EVENTS.length; i++) {
        window.removeEventListener(SESSION_ACTIVITY_EVENTS[i], resetSessionLockTimer);
      }
    };
  }, [clearSessionLockTimer, currentUser.userId, isAuthenticated, lockCurrentSession]);
}
