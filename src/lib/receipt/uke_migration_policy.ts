/**
 * UKE生成経路の統合・本番切替および旧形式安全廃止ポリシー
 * 
 * 厚生労働省・支払基金・国保連公的電算処理仕様（RECEIPTY.CYO）への完全移行と、
 * 既存院内点検用独自UKE形式の安全な並行運用・完全廃止判定基準を定義する純粋モジュール。
 */

export type UkeExportCategory = 'official' | 'legacy_inspection' | 'unknown';

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

/**
 * 監査ログメッセージから UKE 出力種別を厳密に分類する
 */
export function categorizeUkeExportAuditType(auditMessage: string): UkeExportCategory {
  if (auditMessage.includes('公式レセプト') || auditMessage.includes('月次公式UKE') || auditMessage.includes('RECEIPTY.CYO')) {
    return 'official';
  }
  if (auditMessage.includes('点検用旧形式') || auditMessage.includes('旧形式')) {
    return 'legacy_inspection';
  }
  return 'unknown';
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
