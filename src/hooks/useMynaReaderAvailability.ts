import { useEffect, useState } from 'react';
import type { MynaReaderAvailabilityState } from '@/lib/myna_read_display';

/**
 * マイナ読取ボタンを押せるか(接続先が設定されているか)を、サーバーの設定から調べる。
 * 患者情報は読まない。確認が終わるまでと、設定が無いときは、ボタンを押せない状態にする。
 */
export function useMynaReaderAvailability(): MynaReaderAvailabilityState {
  const [state, setState] = useState<MynaReaderAvailabilityState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/myna/status', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { available?: boolean; reason?: string } | null;
        if (cancelled) return;
        if (!response.ok || !payload) {
          setState({ status: 'ready', available: false, reason: 'マイナ読取の状態を確認できませんでした。' });
          return;
        }
        setState({ status: 'ready', available: payload.available === true, reason: payload.reason });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'ready', available: false, reason: 'マイナ読取の状態を確認できませんでした。' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
