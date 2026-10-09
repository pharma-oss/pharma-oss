import type { AiAssistMode, PharmacyDatabase } from '../db/types.ts';
import { restoreFields } from './rxdb_restore.ts';

export type AiAssistItemSeverity = 'critical' | 'warning' | 'info';

export const AI_ASSIST_MODE_LABELS: Record<AiAssistMode, string> = {
  enabled: '標準',
  limited: '制限',
  disabled: '停止'
};

export const AI_ASSIST_MODE_DESCRIPTIONS: Record<AiAssistMode, string> = {
  enabled: '根拠付きのAI補助候補をすべて表示します。',
  limited: '重大度が「要修正」の候補だけを表示します。',
  disabled: 'AI補助候補を表示しません。通常の監査・業務機能は継続します。'
};

export function normalizeAiAssistMode(value: unknown): AiAssistMode {
  return value === 'limited' || value === 'disabled' ? value : 'enabled';
}

export function isAiAssistItemVisible(
  mode: AiAssistMode | undefined,
  severity: AiAssistItemSeverity
): boolean {
  const normalizedMode = normalizeAiAssistMode(mode);
  if (normalizedMode === 'disabled') return false;
  if (normalizedMode === 'limited') return severity === 'critical';
  return true;
}

export function filterAiAssistItemsByMode<T extends { severity: AiAssistItemSeverity }>(
  items: readonly T[],
  mode: AiAssistMode | undefined
): T[] {
  return items.filter((item) => isAiAssistItemVisible(mode, item.severity));
}

export function compareAiAssistModeStrictness(
  currentMode: AiAssistMode | undefined,
  recommendedMode: AiAssistMode
): 'aligned' | 'stricter' | 'change_required' {
  const rank: Record<AiAssistMode, number> = {
    enabled: 0,
    limited: 1,
    disabled: 2
  };
  const normalizedCurrentMode = normalizeAiAssistMode(currentMode);
  if (normalizedCurrentMode === recommendedMode) return 'aligned';
  return rank[normalizedCurrentMode] > rank[recommendedMode] ? 'stricter' : 'change_required';
}

// 品質ゲートの推奨を反映したときに監査ログへ残す文言(変更前後のモードと、判断の根拠になった指標)
export function buildAiQualityGateApplyAuditDetail(
  previousMode: AiAssistMode,
  recommendedMode: AiAssistMode,
  qualityGate: { statusLabel: string; highConfidenceRejectedCount: number; rejectionRate: number }
): string {
  return `AI補助品質ゲート反映: 「${AI_ASSIST_MODE_LABELS[previousMode]}」から「${AI_ASSIST_MODE_LABELS[recommendedMode]}」へ変更 / 判定 ${qualityGate.statusLabel} / 高信頼度却下 ${qualityGate.highConfidenceRejectedCount}件 / 却下率 ${qualityGate.rejectionRate}%`;
}

// AI補助モードを施設設定へ書き込み、監査ログが残らなければ元のモードへ戻して失敗として扱う。
// 施設設定(id: 'default')が無いときは何も書かず、監査ログも残さない。
export async function applyAiAssistModeWithAudit(params: {
  db: Pick<PharmacyDatabase, 'facility_settings'>;
  previousMode: AiAssistMode;
  recommendedMode: AiAssistMode;
  auditDetail: string;
  logAudit: (detail: string) => Promise<boolean>;
}): Promise<void> {
  const { db, previousMode, recommendedMode, auditDetail, logAudit } = params;
  const doc = await db.facility_settings.findOne('default').exec();
  if (!doc) {
    throw new Error('施設設定が見つかりません。');
  }
  await doc.patch({ aiAssistMode: recommendedMode });
  const auditOk = await logAudit(auditDetail);
  if (!auditOk) {
    await restoreFields(doc, { aiAssistMode: previousMode });
    throw new Error('監査ログ記録に失敗したため、AI補助モードを元に戻しました。');
  }
}
