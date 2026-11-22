/**
 * UKE生成経路の統合・本番切替および旧形式安全廃止ポリシー
 *
 * 厚生労働省・支払基金・国保連公的電算処理仕様（RECEIPTY.CYO）への完全移行と、
 * 既存院内点検用独自UKE形式の安全な並行運用・完全廃止判定基準を定義する純粋モジュール。
 */

import type { OpsReviewStatus } from '../ops_review_status';

export type UkeExportCategory = 'official' | 'legacy_inspection' | 'unknown';

export const DEFAULT_UKE_RETIREMENT_WINDOW_DAYS = 90;

export interface UkeRetirementCriteria {
  pilotMonthsConfirmed: number;          // パイロット薬局での公式RECEIPTY.CYO運用実績月数（必須: 1ヶ月以上）
  legacyExportCountLast3Months: number;  // 直近3ヶ月の点検用旧形式出力回数合計（必須: 0回）
  stakeholderConsentObtained: boolean;   // 現場薬剤師・医療事務・院内独自連携システムの合意取得（必須: true）
}

export interface UkeRetirementEvaluation {
  canRetireLegacy: boolean;
  blockers: string[];
  currentStatus: 'active_parallel' | 'ready_for_ui_nesting' | 'ready_for_full_retirement';
}

export interface UkeExportAuditLogEntry {
  timestamp: string;
  actionType?: string;
  details: string;
}

export interface UkeExportAuditSummary {
  windowDays: number;
  evaluatedAt: string;
  windowStartAt: string;
  totalUkeExportLogsInWindow: number;
  officialExportCountInWindow: number;
  legacyExportCountInWindow: number;
  unknownUkeExportCountInWindow: number;
  lastLegacyExportAt?: string;
  lastOfficialExportAt?: string;
}

export interface UkeRetirementAuditReport {
  auditSummary: UkeExportAuditSummary;
  criteria: UkeRetirementCriteria;
  evaluation: UkeRetirementEvaluation;
  opsStatus: OpsReviewStatus;
  summaryLine: string;
}

/**
 * 監査ログメッセージから UKE 出力種別を厳密に分類する。
 * 事前検証や算定ルール確認で停止したログ（作成停止・出力停止・確認停止）は実出力に含めない。
 */
export function categorizeUkeExportAuditType(auditMessage: string): UkeExportCategory {
  if (
    auditMessage.includes('作成停止')
    || auditMessage.includes('出力停止')
    || auditMessage.includes('確認停止')
  ) {
    return 'unknown';
  }
  if (auditMessage.includes('公式レセプト') || auditMessage.includes('月次公式UKE') || auditMessage.includes('RECEIPTY.CYO')) {
    return 'official';
  }
  if (auditMessage.includes('点検用旧形式') || auditMessage.includes('旧形式')) {
    return 'legacy_inspection';
  }
  return 'unknown';
}

/**
 * 監査ログ配列（JSON / バックアップJSON / JSONL）から UKE 関連エントリを抽出する純粋パーサ。
 */
export function parseUkeAuditLogInput(rawText: string): UkeExportAuditLogEntry[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const toEntry = (item: unknown): UkeExportAuditLogEntry | null => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    if (typeof record.timestamp !== 'string' || typeof record.details !== 'string') {
      return null;
    }
    return {
      timestamp: record.timestamp,
      ...(typeof record.actionType === 'string' ? { actionType: record.actionType } : {}),
      details: record.details
    };
  };

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(toEntry).filter((entry): entry is UkeExportAuditLogEntry => entry !== null);
      }
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const collections = obj.collections as Record<string, unknown> | undefined;
        const candidateList = Array.isArray(obj.audit_logs)
          ? obj.audit_logs
          : Array.isArray(collections?.audit_logs)
            ? collections.audit_logs
            : Array.isArray(obj.logs)
              ? obj.logs
              : null;
        if (candidateList) {
          return candidateList.map(toEntry).filter((entry): entry is UkeExportAuditLogEntry => entry !== null);
        }
        const single = toEntry(obj);
        if (single) return [single];
      }
      throw new Error('監査ログ配列（JSON配列・バックアップJSON・JSONL）が見つかりません。');
    } catch (jsonError) {
      // JSONL（複数行の先頭が '{'）へフォールバックする
      if (!trimmed.includes('\n')) {
        throw jsonError instanceof Error
          ? jsonError
          : new Error('監査ログ入力のJSON解析に失敗しました。');
      }
    }
  }

  const entries: UkeExportAuditLogEntry[] = [];
  const lines = trimmed.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsedLine: unknown;
    try {
      parsedLine = JSON.parse(line);
    } catch {
      throw new Error(`監査ログJSONLの ${i + 1} 行目の解析に失敗しました。`);
    }
    const entry = toEntry(parsedLine);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * 監査ログから直近 windowDays 日（既定90日）の公式UKE・旧形式UKE出力回数を実測集計する。
 */
export function summarizeUkeExportsFromAuditLogs(
  logs: ReadonlyArray<UkeExportAuditLogEntry>,
  options: { now?: Date; windowDays?: number } = {}
): UkeExportAuditSummary {
  const now = options.now ?? new Date();
  const windowDays = Math.max(1, Math.floor(options.windowDays ?? DEFAULT_UKE_RETIREMENT_WINDOW_DAYS));
  const nowMs = now.getTime();
  const windowStartMs = nowMs - windowDays * 24 * 60 * 60 * 1000;

  let totalUkeExportLogsInWindow = 0;
  let officialExportCountInWindow = 0;
  let legacyExportCountInWindow = 0;
  let unknownUkeExportCountInWindow = 0;
  let lastLegacyMs = -Infinity;
  let lastLegacyExportAt: string | undefined;
  let lastOfficialMs = -Infinity;
  let lastOfficialExportAt: string | undefined;

  for (const log of logs) {
    if (log.actionType !== undefined && log.actionType !== 'uke_export') {
      continue;
    }
    const tsMs = Date.parse(log.timestamp);
    if (!Number.isFinite(tsMs) || tsMs < windowStartMs || tsMs > nowMs) {
      continue;
    }

    const category = categorizeUkeExportAuditType(log.details);
    if (category === 'official') {
      totalUkeExportLogsInWindow += 1;
      officialExportCountInWindow += 1;
      if (tsMs > lastOfficialMs) {
        lastOfficialMs = tsMs;
        lastOfficialExportAt = new Date(tsMs).toISOString();
      }
    } else if (category === 'legacy_inspection') {
      totalUkeExportLogsInWindow += 1;
      legacyExportCountInWindow += 1;
      if (tsMs > lastLegacyMs) {
        lastLegacyMs = tsMs;
        lastLegacyExportAt = new Date(tsMs).toISOString();
      }
    } else if (log.actionType === 'uke_export') {
      totalUkeExportLogsInWindow += 1;
      unknownUkeExportCountInWindow += 1;
    }
  }

  return {
    windowDays,
    evaluatedAt: now.toISOString(),
    windowStartAt: new Date(windowStartMs).toISOString(),
    totalUkeExportLogsInWindow,
    officialExportCountInWindow,
    legacyExportCountInWindow,
    unknownUkeExportCountInWindow,
    ...(lastLegacyExportAt ? { lastLegacyExportAt } : {}),
    ...(lastOfficialExportAt ? { lastOfficialExportAt } : {})
  };
}

/**
 * 監査ログ実測値と現場確認条件（A/C）から、旧形式UKE完全廃止（ステップ5b）の可否レポートを生成する。
 */
export function evaluateUkeRetirementFromAuditLogs(params: {
  logs: ReadonlyArray<UkeExportAuditLogEntry>;
  pilotMonthsConfirmed: number;
  stakeholderConsentObtained: boolean;
  now?: Date;
  windowDays?: number;
}): UkeRetirementAuditReport {
  const auditSummary = summarizeUkeExportsFromAuditLogs(params.logs, {
    now: params.now,
    windowDays: params.windowDays
  });
  const criteria: UkeRetirementCriteria = {
    pilotMonthsConfirmed: Math.max(0, Math.floor(params.pilotMonthsConfirmed)),
    legacyExportCountLast3Months: auditSummary.legacyExportCountInWindow,
    stakeholderConsentObtained: params.stakeholderConsentObtained
  };
  const evaluation = evaluateUkeRetirementReadiness(criteria);
  const opsStatus: OpsReviewStatus = evaluation.canRetireLegacy
    ? 'pass'
    : evaluation.currentStatus === 'ready_for_ui_nesting'
      ? 'attention'
      : 'blocked';
  const statusLabel = opsStatus === 'pass'
    ? '完全廃止可（条件A/B/C達成）'
    : opsStatus === 'attention'
      ? '合意待ち（条件A・B達成）'
      : `廃止ブロック中（未達 ${evaluation.blockers.length}件）`;

  return {
    auditSummary,
    criteria,
    evaluation,
    opsStatus,
    summaryLine: `${statusLabel} / 直近${auditSummary.windowDays}日: 旧形式 ${auditSummary.legacyExportCountInWindow}回・公式 ${auditSummary.officialExportCountInWindow}回 / 公式運用 ${criteria.pilotMonthsConfirmed}ヶ月`
  };
}

export function formatUkeRetirementStatusBadge(summary: UkeExportAuditSummary): string {
  if (summary.legacyExportCountInWindow === 0) {
    return `直近${summary.windowDays}日 旧形式0回（公式${summary.officialExportCountInWindow}回 / 条件A・C確認待ち）`;
  }
  return `直近${summary.windowDays}日 旧形式${summary.legacyExportCountInWindow}回（公式${summary.officialExportCountInWindow}回 / 廃止ブロック中）`;
}

export function buildUkeRetirementChecklist(report: UkeRetirementAuditReport): string {
  const lines = [
    '# 旧形式UKE 完全廃止ゲート（ステップ 5b）判定チェックリスト',
    `判定日時: ${report.auditSummary.evaluatedAt}`,
    `集計期間: ${report.auditSummary.windowStartAt} 〜 ${report.auditSummary.evaluatedAt}（直近${report.auditSummary.windowDays}日）`,
    `総合判定: ${report.opsStatus} (${report.evaluation.currentStatus})`,
    `要約: ${report.summaryLine}`,
    '',
    '## 条件チェック',
    `- [${report.criteria.pilotMonthsConfirmed >= 1 ? 'x' : ' '}] 条件A: 公式RECEIPTY.CYO 受付確認実績 >= 1ヶ月（現在: ${report.criteria.pilotMonthsConfirmed}ヶ月）`,
    `- [${report.criteria.legacyExportCountLast3Months === 0 ? 'x' : ' '}] 条件B: 直近${report.auditSummary.windowDays}日の旧形式UKE出力 0回（実測: ${report.auditSummary.legacyExportCountInWindow}回 / 公式: ${report.auditSummary.officialExportCountInWindow}回）`,
    `- [${report.criteria.stakeholderConsentObtained ? 'x' : ' '}] 条件C: 現場スタッフ・独自連携システムの廃止合意取得（現在: ${report.criteria.stakeholderConsentObtained ? '取得済み' : '未取得'}）`,
    ''
  ];
  if (report.evaluation.blockers.length > 0) {
    lines.push('## 未達ブロッカー');
    for (const blocker of report.evaluation.blockers) {
      lines.push(`- ${blocker}`);
    }
  } else {
    lines.push('## 次のアクション');
    lines.push('- 全条件（A/B/C）を満たしています。承認のうえ <details> 内旧形式UKE削除（ステップ5b）を実施できます。');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * 点検用旧形式 UKE の完全廃止条件を満たしているかを客観的に判定する
 */
export function evaluateUkeRetirementReadiness(criteria: UkeRetirementCriteria): UkeRetirementEvaluation {
  const blockers: string[] = [];

  if (criteria.pilotMonthsConfirmed < 1) {
    blockers.push('公式RECEIPTY.CYOによる支払基金・国保連への請求受付確認実績が不足しています（最低1ヶ月以上の成功実績が必要）。');
  }

  if (criteria.legacyExportCountLast3Months > 0) {
    blockers.push(`直近3ヶ月間に点検用旧形式の出力が ${criteria.legacyExportCountLast3Months} 件記録されています。現場での利用が完全にゼロになるまで廃止できません。`);
  }

  if (!criteria.stakeholderConsentObtained) {
    blockers.push('現場スタッフ（薬剤師・医療事務）および独自院内点検システム管理者からの完全廃止合意が得られていません。');
  }

  let currentStatus: UkeRetirementEvaluation['currentStatus'] = 'active_parallel';
  if (blockers.length === 0) {
    currentStatus = 'ready_for_full_retirement';
  } else if (criteria.pilotMonthsConfirmed >= 1 && criteria.legacyExportCountLast3Months === 0 && !criteria.stakeholderConsentObtained) {
    currentStatus = 'ready_for_ui_nesting';
  }

  return {
    canRetireLegacy: blockers.length === 0,
    blockers,
    currentStatus
  };
}

/**
 * UI表示用のボタン属性・ガイダンス定義
 */
export const UKE_UI_GUIDANCE = {
  singleVisit: {
    officialButtonTitle: '公式提出用UKE（正本: RECEIPTY.CYO / 支払基金・国保連電算仕様 / GO集計 / EOF 0x1A）の点検とダウンロード',
    legacyButtonTitleWithErrors: '請求前チェックのエラーを解消してください。',
    legacyButtonTitleReady: '点検用UKE出力（旧形式・独自フォーマット: RECEIPT_{id}.uke）'
  },
  monthlyClaim: {
    officialButtonTitle: '公式提出用UKE出力（正本: RECEIPTY.CYO / 支払基金・国保連仕様 / 突合点検付き）',
    legacyButtonTitle: '月次一括UKE出力（点検用・旧形式: RECEIPT_{month}.uke）'
  }
} as const;

export function formatSingleOfficialUkeExportAuditMessage(params: {
  patientName?: string;
  totalPoints: number;
  recordCount: number;
}): string {
  return `公式レセプト（UKE / RECEIPTY.CYO）エクスポート: 患者「${params.patientName}」の公式電子レセプト（点数: ${params.totalPoints}点、レコード数: ${params.recordCount}行）を出力しました。`;
}

export function formatSingleLegacyUkeExportAuditMessage(params: {
  patientName?: string;
  totalPoints: number;
  fileName: string;
}): string {
  return `レセプト（UKE・点検用旧形式）エクスポート: 患者「${params.patientName}」の電子レセプト（点数: ${params.totalPoints}点、ファイル: ${params.fileName}）を出力しました。`;
}

export function formatMonthlyOfficialUkeExportAuditMessage(params: {
  officialFileName: string;
  claimCount: number;
  totalPoints: number;
  totalSupplementalRecordCount: number;
  totalPrescriptionRecordCount: number;
  totalSplitRecordCount: number;
  goTotalPoints?: number;
}): string {
  return `月次公式UKE出力: ${params.officialFileName} / RECEIPTY.CYO|bundle.fileName / 受付 ${params.claimCount}件 / 合計 ${params.totalPoints}点 / 提出準備確認済み / 集計突合OK (IR加算・情報料・調基 ${params.totalSupplementalRecordCount} / 処方 ${params.totalPrescriptionRecordCount} / 剤 ${params.totalSplitRecordCount} / 請求 ${params.goTotalPoints}点)。`;
}

export function formatMonthlyLegacyUkeExportAuditMessage(params: {
  ukeFileName: string;
  claimCount: number;
  totalPoints: number;
}): string {
  return `月次一括UKE（点検用旧形式）出力: ${params.ukeFileName} / 受付 ${params.claimCount}件 / 合計 ${params.totalPoints}点。`;
}
