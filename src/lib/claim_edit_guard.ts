import { isClaimLifecycleLocked, type ClaimLifecycleState } from './claim_lifecycle';

export type ClaimEditGuardScope = 'billing' | 'prescription' | 'soap' | 'picking' | 'stock';

const SCOPE_LABELS: Record<ClaimEditGuardScope, string> = {
  billing: '算定',
  prescription: '処方内容',
  soap: '薬歴',
  picking: 'ピッキング照合',
  stock: '在庫引き落とし'
};

export function isClaimEditBlocked(lifecycle?: ClaimLifecycleState | null): boolean {
  return isClaimLifecycleLocked(lifecycle);
}

export function getClaimEditBlockedMessage(
  lifecycle: ClaimLifecycleState | undefined | null,
  scope: ClaimEditGuardScope = 'billing'
): string {
  const label = SCOPE_LABELS[scope];
  const fileName = lifecycle?.exportedFileName || 'UKE出力';
  return `${fileName} 後の請求はロックされています。${label}を変更する場合は、返戻登録または再請求/月遅れ準備に切り替えてから操作してください。`;
}

export function canEditClaimScopedData(
  lifecycle: ClaimLifecycleState | undefined | null
): boolean {
  return !isClaimEditBlocked(lifecycle);
}
