import type { AiAssistMode } from '../db/types.ts';

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
