import type { Visit } from '@/db/types';
import { getClaimEditBlockedMessage, isClaimEditBlocked } from '@/lib/claim_edit_guard';

export type EmrEditableScope = 'prescription' | 'soap' | 'picking' | 'stock';

export interface ParsedEmrLocationSearch {
  visitId: string | null;
  openPicking: boolean;
  openIntervention: boolean;
  reason: string | null;
}

/**
 * 薬歴画面（/emr）の URL クエリパラメータを解釈する純粋関数。
 * 印刷画面の「ピッキングへ」「疑義照会を記録」導線から受け取った対象受付・モーダル指定を返す。
 */
export function parseEmrLocationSearch(search: string): ParsedEmrLocationSearch {
  const searchParams = new URLSearchParams(search);
  const rawVisitId = searchParams.get('visitId');
  const rawReason = searchParams.get('reason');
  return {
    visitId: rawVisitId || null,
    openPicking: searchParams.get('openPicking') === '1',
    openIntervention: searchParams.get('openIntervention') === '1',
    reason: rawReason || null
  };
}

export type ActiveVisitEditabilityResult<TVisit extends Pick<Visit, 'claimLifecycle'>> =
  | { ok: false; visit: null; message: string }
  | { ok: false; visit: TVisit; message: string }
  | { ok: true; visit: TVisit; message: '' };

/**
 * 対象受付が編集可能か（UKE出力済み・請求完了でロックされていないか）を判定する純粋関数。
 * 処方・SOAP・ピッキング・在庫の4スコープで共通のロック防御を適用する。
 */
export function evaluateActiveVisitEditability<TVisit extends Pick<Visit, 'claimLifecycle'>>(
  visit: TVisit | null | undefined,
  scope: EmrEditableScope
): ActiveVisitEditabilityResult<TVisit> {
  if (!visit) {
    return { ok: false, visit: null, message: '処理中の患者が見つかりません' };
  }
  if (isClaimEditBlocked(visit.claimLifecycle)) {
    return {
      ok: false,
      visit,
      message: getClaimEditBlockedMessage(visit.claimLifecycle, scope)
    };
  }
  return { ok: true, visit, message: '' };
}
