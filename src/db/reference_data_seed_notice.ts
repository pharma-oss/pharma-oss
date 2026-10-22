export type ReferenceDataSeedTarget = 'medication_guidances' | 'drugs';

export interface ReferenceDataSeedWarningOutcome {
  shouldWarn: boolean;
  warningMessage: string | null;
}

export type ReferenceDataSeedFailureListener = (
  target: ReferenceDataSeedTarget,
  error: unknown
) => void;

const referenceDataSeedFailures = new Set<ReferenceDataSeedTarget>();
const referenceDataSeedListeners = new Set<ReferenceDataSeedFailureListener>();

/**
 * 初期シード失敗の記録とリスナー通知
 */
export function recordReferenceDataSeedFailure(
  target: ReferenceDataSeedTarget,
  error?: unknown
): void {
  referenceDataSeedFailures.add(target);
  for (const listener of referenceDataSeedListeners) {
    try {
      listener(target, error);
    } catch (listenerError) {
      console.error('[ReferenceDataSeed] Listener invocation failed:', listenerError);
    }
  }
}

/**
 * 記録された初期シード失敗ターゲットの一覧を取得
 */
export function getReferenceDataSeedFailures(): ReadonlySet<ReferenceDataSeedTarget> {
  return referenceDataSeedFailures;
}

/**
 * 初期シード失敗の通知を購読する。
 * すでに記録されている失敗があれば即座にリスナーを呼び出す。
 */
export function subscribeReferenceDataSeedFailure(
  listener: ReferenceDataSeedFailureListener
): () => void {
  referenceDataSeedListeners.add(listener);
  for (const target of referenceDataSeedFailures) {
    try {
      listener(target, undefined);
    } catch (listenerError) {
      console.error('[ReferenceDataSeed] Initial replay listener failed:', listenerError);
    }
  }
  return () => {
    referenceDataSeedListeners.delete(listener);
  };
}

/**
 * テスト用内部状態リセット
 */
export function _resetReferenceDataSeedFailuresForTesting(): void {
  referenceDataSeedFailures.clear();
  referenceDataSeedListeners.clear();
}

/**
 * 初期シード失敗時の警告通知（原因と次の行動）の判定を行う純粋関数
 */
export function resolveReferenceDataSeedWarningOutcome(params: {
  target: ReferenceDataSeedTarget;
  alreadyWarned: boolean;
}): ReferenceDataSeedWarningOutcome {
  if (params.alreadyWarned) {
    return {
      shouldWarn: false,
      warningMessage: null
    };
  }

  if (params.target === 'medication_guidances') {
    return {
      shouldWarn: true,
      warningMessage:
        '服薬指導テンプレートの初期データの取り込みに失敗しました。ページを再読み込みしてください。解消しない場合は管理者に連絡してください。'
    };
  }

  if (params.target === 'drugs') {
    return {
      shouldWarn: true,
      warningMessage:
        '医薬品マスターの初期データの取り込みに失敗しました。ページを再読み込みしてください。解消しない場合は「設定 > マスタ更新」から取り込むか管理者に連絡してください。'
    };
  }

  return {
    shouldWarn: false,
    warningMessage: null
  };
}
