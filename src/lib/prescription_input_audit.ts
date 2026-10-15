import type { Alert } from '@/db/types';
import type { DosageCategory } from './dosage_category';
import {
  DOSAGE_CATEGORY_LABELS,
  resolveEffectiveDosageCategory,
  resolveCalculationDosageFlags
} from './dosage_category';
import { getCalculationDosageCategory } from './dosage_category_conflict';
import { ELECTRONIC_USAGE_OPTIONS, filterUsageOptionsByCategory } from './master-data/usage_master';
import { findPatientAlertDrugWarnings } from './patient_alerts.ts';

export type PrescriptionInputAuditSeverity = 'error' | 'warning' | 'info';

export interface PrescriptionInputAuditItem {
  id?: string;
  rpId?: string;
  rpNumber?: number;
  drugCode?: string;
  drugName?: string;
  dispensedDrug?: string;
  dispensedDrugCode?: string;
  changeReason?: string;
  amount?: string | number;
  usage?: string;
  usageSupplementText?: string;
  days?: string | number;
  dosageCategory?: DosageCategory;
  dosageCategorySource?: 'auto' | 'manual';
  rpComment?: string;
  receiptRemark?: string;
  isIppoka?: boolean;
  isCrushed?: boolean;
  showReceiptRemark?: boolean;
  yjCode?: string;
  genericName?: string;
  isHighRisk?: boolean;
  isAbolished?: boolean;
  stockQuantity?: number;
  dispensedYjCode?: string;
  dispensedGenericName?: string;
  dispensedIsHighRisk?: boolean;
  dispensedIsAbolished?: boolean;
  dispensedStockQuantity?: number;
}

export interface PrescriptionInputAuditIssue {
  severity: PrescriptionInputAuditSeverity;
  code: string;
  title: string;
  message: string;
  itemIds?: string[];
  rpId?: string;
}

export interface PrescriptionInputAuditResult {
  issues: PrescriptionInputAuditIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

const DEFAULT_NO_SUBSTITUTION_LABELS = new Set(['変更なし', '変更調剤なし']);

const severityRank: Record<PrescriptionInputAuditSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

const normalizeDrugKey = (value: string) => (
  value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[「」"']/g, '')
);

const toNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return Number.NaN;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatQuantity = (value: number) => (
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
);

const isNoSubstitution = (value: string, labels: Set<string>) => {
  const normalized = value.trim();
  return !normalized || labels.has(normalized);
};

const getEffectiveYjCode = (item: PrescriptionInputAuditItem) => (
  normalizeText(item.dispensedYjCode) || normalizeText(item.yjCode)
);

const getEffectiveGenericName = (item: PrescriptionInputAuditItem) => (
  normalizeText(item.dispensedGenericName) || normalizeText(item.genericName)
);

const getEffectiveDrugLabel = (item: PrescriptionInputAuditItem, index: number) => (
  normalizeText(item.dispensedDrug && !DEFAULT_NO_SUBSTITUTION_LABELS.has(item.dispensedDrug) ? item.dispensedDrug : item.drugName) ||
  `処方薬${index + 1}`
);

const addIssue = (issues: PrescriptionInputAuditIssue[], issue: PrescriptionInputAuditIssue) => {
  issues.push(issue);
};

export function buildPrescriptionInputAudit(
  items: PrescriptionInputAuditItem[],
  options: { noSubstitutionLabels?: Set<string>; patientAlerts?: Alert[]; hasPatientAlertsFetchError?: boolean } = {}
): PrescriptionInputAuditResult {
  const noSubstitutionLabels = options.noSubstitutionLabels || DEFAULT_NO_SUBSTITUTION_LABELS;
  const patientAlerts = options.patientAlerts || [];
  const hasPatientAlertsFetchError = options.hasPatientAlertsFetchError || false;
  const issues: PrescriptionInputAuditIssue[] = [];
  const drugGroups = new Map<string, PrescriptionInputAuditItem[]>();
  const yjCategoryGroups = new Map<string, PrescriptionInputAuditItem[]>();
  const rpGroups = new Map<string, PrescriptionInputAuditItem[]>();

  items.forEach((item, index) => {
    const itemId = item.id;
    const drugName = normalizeText(item.drugName);
    const drugCode = normalizeText(item.drugCode);
    const label = getEffectiveDrugLabel(item, index);
    const amount = toNumber(item.amount);
    const days = toNumber(item.days);
    const usage = normalizeText(item.usage);
    const rpComment = normalizeText(item.rpComment);
    const dispensedDrug = normalizeText(item.dispensedDrug);
    const changeReason = normalizeText(item.changeReason);
    const yjCode = getEffectiveYjCode(item);
    const genericName = getEffectiveGenericName(item);
    const stockQuantity = item.dispensedStockQuantity ?? item.stockQuantity;

    if (!drugName) {
      addIssue(issues, {
        severity: 'error',
        code: 'drug_missing',
        title: `処方薬${index + 1} の薬品名が未入力です`,
        message: '薬品名を薬品マスタから選択してください。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    } else if (!drugCode) {
      addIssue(issues, {
        severity: 'warning',
        code: 'drug_master_unselected',
        title: `${label} が薬品マスタ未選択です`,
        message: 'YJコード、薬価、在庫、監査判定の精度が下がります。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'amount_invalid',
        title: `${label} の1日量が未確定です`,
        message: '1日量は0より大きい数値で入力してください。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    if (!usage) {
      addIssue(issues, {
        severity: 'error',
        code: 'usage_missing',
        title: `${label} の用法が未入力です`,
        message: 'Rp単位の用法を入力してください。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    if (!Number.isFinite(days) || days < 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'days_invalid',
        title: `${label} の日数が未確定です`,
        message: '日数は0以上の数値で入力してください。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    } else if (days > 90 && !rpComment) {
      addIssue(issues, {
        severity: 'info',
        code: 'long_days_without_comment',
        title: `${label} が長期日数です`,
        message: '長期処方の意図や確認事項をRpコメントに残せます。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    if ((item.isHighRisk || item.dispensedIsHighRisk) && !rpComment) {
      addIssue(issues, {
        severity: 'warning',
        code: 'high_risk_without_comment',
        title: `${label} はハイリスク薬です`,
        message: '指導・確認ポイントをRpコメントまたは薬歴に残してください。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    if (item.isAbolished || item.dispensedIsAbolished) {
      addIssue(issues, {
        severity: 'error',
        code: 'abolished_drug_selected',
        title: `${label} は廃止薬品です`,
        message: '現行マスタの薬品に置き換えてください。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    if (!isNoSubstitution(dispensedDrug, noSubstitutionLabels) && !changeReason) {
      addIssue(issues, {
        severity: 'warning',
        code: 'substitution_reason_missing',
        title: `${label} の変更理由が未入力です`,
        message: '変更調剤の理由を記録してください。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    if (Number.isFinite(stockQuantity) && Number.isFinite(amount)) {
      const requiredQuantity = amount * Math.max(Number.isFinite(days) ? days : 1, 1);
      if ((stockQuantity as number) <= 0) {
        addIssue(issues, {
          severity: 'warning',
          code: 'stock_empty',
          title: `${label} の在庫がありません`,
          message: 'ピッキング前に在庫または代替候補を確認してください。',
          itemIds: itemId ? [itemId] : undefined,
          rpId: item.rpId
        });
      } else if (requiredQuantity > (stockQuantity as number)) {
        addIssue(issues, {
          severity: 'warning',
          code: 'stock_shortage',
          title: `${label} の在庫が不足する可能性があります`,
          message: `必要量 ${formatQuantity(requiredQuantity)} に対して在庫 ${formatQuantity(stockQuantity as number)} です。`,
          itemIds: itemId ? [itemId] : undefined,
          rpId: item.rpId
        });
      }
    }

    if ((item.isIppoka || item.isCrushed || item.showReceiptRemark) && !rpComment && !normalizeText(item.receiptRemark)) {
      addIssue(issues, {
        severity: 'info',
        code: 'special_preparation_without_note',
        title: `${label} に調製指定があります`,
        message: '一包化、粉砕、レセ適の判断理由を残せます。',
        itemIds: itemId ? [itemId] : undefined,
        rpId: item.rpId
      });
    }

    const drugKey = drugCode || normalizeDrugKey(drugName);
    if (drugKey) {
      const group = drugGroups.get(drugKey) || [];
      group.push(item);
      drugGroups.set(drugKey, group);
    }

    if (yjCode.length >= 4) {
      const category = yjCode.slice(0, 4);
      const group = yjCategoryGroups.get(category) || [];
      group.push(item);
      yjCategoryGroups.set(category, group);
    } else if (genericName) {
      const category = `generic:${normalizeDrugKey(genericName)}`;
      const group = yjCategoryGroups.get(category) || [];
      group.push(item);
      yjCategoryGroups.set(category, group);
    }

    const rpKey = item.rpId || `row-${index}`;
    const rpGroup = rpGroups.get(rpKey) || [];
    rpGroup.push(item);
    rpGroups.set(rpKey, rpGroup);
  });

  for (const group of drugGroups.values()) {
    if (group.length <= 1) continue;
    const labels = Array.from(new Set(group.map((item, index) => getEffectiveDrugLabel(item, index))));
    addIssue(issues, {
      severity: 'warning',
      code: 'same_drug_duplicated',
      title: '同一薬剤が複数行にあります',
      message: `${labels.join('、')} が重複しています。Rp分割または処方意図を確認してください。`,
      itemIds: group.map((item) => item.id).filter(Boolean) as string[],
      rpId: group[0].rpId
    });
  }

  for (const [category, group] of yjCategoryGroups.entries()) {
    if (group.length <= 1) continue;
    const uniqueDrugs = new Map<string, PrescriptionInputAuditItem>();
    // 一般名だけで束ねた群 (YJコードが無い薬) では、同じ一般名でも処方された薬品コードが違えば別の薬として数える。
    // 一般名をキーにすると、先発品と後発品のような同成分の2剤が1剤に畳まれ、重複が指摘されない。
    // 同じ薬品コードの重複は same_drug_duplicated が別に扱う。
    const isGenericGroup = category.startsWith('generic:');
    for (const item of group) {
      const key = isGenericGroup
        ? normalizeText(item.drugCode) || normalizeText(item.drugName) || getEffectiveGenericName(item)
        : getEffectiveYjCode(item) || getEffectiveGenericName(item) || normalizeText(item.drugCode) || normalizeText(item.drugName);
      if (key) uniqueDrugs.set(key, item);
    }
    if (uniqueDrugs.size <= 1) continue;
    const labels = Array.from(uniqueDrugs.values()).map((item, index) => getEffectiveDrugLabel(item, index));
    addIssue(issues, {
      severity: 'warning',
      code: 'similar_therapy_detected',
      title: '同効薬の重複候補があります',
      message: `${labels.join('、')} は近い薬効群（${category.replace('generic:', '成分:')}）として確認対象です。`,
      itemIds: Array.from(uniqueDrugs.values()).map((item) => item.id).filter(Boolean) as string[]
    });
  }

  let rpLoopIndex = 0;
  for (const [rpId, group] of rpGroups.entries()) {
    rpLoopIndex++;
    if (group.length > 1) {
      const usages = new Set(group.map((item) => normalizeText(item.usage)).filter(Boolean));
      const days = new Set(group.map((item) => normalizeText(item.days)).filter(Boolean));
      if (usages.size > 1 || days.size > 1) {
        addIssue(issues, {
          severity: 'warning',
          code: 'rp_fields_mismatch',
          title: '同一Rp内で用法または日数が揃っていません',
          message: '同じRpの薬品は用法・日数が揃っているか確認してください。',
          itemIds: group.map((item) => item.id).filter(Boolean) as string[],
          rpId
        });
      }
    }

    const itemWithCategory = group.find((item) => item.dosageCategory);
    const dosageCategory = itemWithCategory?.dosageCategory;
    const usage = normalizeText(group.find((item) => normalizeText(item.usage))?.usage);

    if (usage && dosageCategory) {
      const allowedOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, dosageCategory);
      const isMatched = allowedOptions.some((opt) => opt.label === usage);
      if (!isMatched) {
        const categoryLabel = DOSAGE_CATEGORY_LABELS[dosageCategory] || dosageCategory;
        const rpNum = group[0]?.rpNumber ?? rpLoopIndex;
        addIssue(issues, {
          severity: 'warning',
          code: 'usage_dosage_category_mismatch',
          title: `Rp${rpNum} の用法が調剤区分「${categoryLabel}」の候補にありません`,
          message: '用法を選び直すか、調剤区分を確認してください。このままでも保存できます。',
          itemIds: group.map((item) => item.id).filter(Boolean) as string[],
          rpId
        });
      }
    }

    const representativeItem = group.find((item) => item.dosageCategory) || group[0];
    if (representativeItem) {
      const effectiveCategory = resolveEffectiveDosageCategory(representativeItem);
      const isNonDailyCategory = (
        effectiveCategory === 'external' ||
        effectiveCategory === 'as_needed' ||
        effectiveCategory === 'internal_drop' ||
        effectiveCategory === 'injection'
      );
      const hasPositiveDays = group.some((item) => {
        const d = typeof item.days === 'number' ? item.days : Number(item.days);
        return Number.isFinite(d) && d > 0;
      });

      if (isNonDailyCategory && hasPositiveDays) {
        const categoryLabel = DOSAGE_CATEGORY_LABELS[effectiveCategory] || effectiveCategory;
        const rpNum = group[0]?.rpNumber ?? rpLoopIndex;
        addIssue(issues, {
          severity: 'warning',
          code: 'dosage_days_mismatch',
          title: `Rp${rpNum} は調剤区分「${categoryLabel}」ですが日数が入っています`,
          message: '外用・屯服・内滴・注射の数量は総量です。日数を空欄にするか、調剤区分を確認してください。このままでも保存できます。',
          itemIds: group.map((item) => item.id).filter(Boolean) as string[],
          rpId
        });
      }
    }

    // 手動指定（dosageCategorySource === 'manual'）がある明細において、
    // 算定側の判定（resolveCalculationDosageFlags 'legacy'）と帳票側の実効剤形（resolveEffectiveDosageCategory）が
    // 食い違っている場合、点数計算・レセプトと帳票で剤形解釈の齟齬が生じるため警告を提示する（第八条・第四条・トラック A-3）
    const manualItem = group.find((item) => item.dosageCategorySource === 'manual' && item.dosageCategory);
    if (manualItem) {
      const effectiveCategory = resolveEffectiveDosageCategory(manualItem);
      const calcFlags = resolveCalculationDosageFlags(manualItem, 'legacy');
      const calcCategory = getCalculationDosageCategory(calcFlags);

      if (effectiveCategory !== calcCategory) {
        const effectiveLabel = DOSAGE_CATEGORY_LABELS[effectiveCategory] || effectiveCategory;
        const calcLabel = DOSAGE_CATEGORY_LABELS[calcCategory] || calcCategory;
        const rpNum = group[0]?.rpNumber ?? rpLoopIndex;
        addIssue(issues, {
          severity: 'warning',
          code: 'dosage_category_calculation_conflict',
          title: `Rp${rpNum} の調剤区分（${effectiveLabel}）と算定判定（${calcLabel}）が食い違っています`,
          message: `手動指定は「${effectiveLabel}」ですが、算定では「${calcLabel}」として計算されます。用法の記載または調剤区分をご確認ください。`,
          itemIds: group.map((item) => item.id).filter(Boolean) as string[],
          rpId
        });
      }
    }

    if (usage) {
      const matchingUsage = ELECTRONIC_USAGE_OPTIONS.find((opt) => opt.label === usage);
      if (matchingUsage) {
        const supplement = matchingUsage.supplement;
        const supplementText = normalizeText(group.find((item) => normalizeText(item.usageSupplementText))?.usageSupplementText);
        const rpNum = group[0]?.rpNumber ?? rpLoopIndex;

        if (!supplementText) {
          if (supplement?.asNeededCondition) {
            addIssue(issues, {
              severity: 'warning',
              code: 'usage_supplement_required_condition',
              title: `Rp${rpNum} の用法に頓用条件の補足が必要です`,
              message: '「頭痛時」「発熱時」などの具体的な服用条件を用法補足欄に入力してください。',
              itemIds: group.map((item) => item.id).filter(Boolean) as string[],
              rpId
            });
          }
          if (supplement?.administrationTime) {
            addIssue(issues, {
              severity: 'warning',
              code: 'usage_supplement_required_time',
              title: `Rp${rpNum} の用法に投与時刻の補足が必要です`,
              message: '具体的な投与時刻（例: 朝8時、就寝30分前など）を用法補足欄に入力してください。',
              itemIds: group.map((item) => item.id).filter(Boolean) as string[],
              rpId
            });
          }
          if (supplement?.site === 'required') {
            addIssue(issues, {
              severity: 'warning',
              code: 'usage_supplement_required_site',
              title: `Rp${rpNum} の用法に部位の補足が必要です`,
              message: '貼付・塗布する部位（例: 腰部、患部など）を用法補足欄に入力してください。',
              itemIds: group.map((item) => item.id).filter(Boolean) as string[],
              rpId
            });
          }
          if (matchingUsage.codeKind === 'guide') {
            addIssue(issues, {
              severity: 'warning',
              code: 'usage_supplement_required_guide',
              title: `Rp${rpNum} の用法に詳細指示の補足が必要です`,
              message: '案内用法のため、具体的な指示内容を用法補足欄に入力してください。',
              itemIds: group.map((item) => item.id).filter(Boolean) as string[],
              rpId
            });
          }
        }
      }
    }
  }

  const patientAlertWarnings = findPatientAlertDrugWarnings(
    patientAlerts,
    items.map((item, index) => {
      const dispensedDrug = normalizeText(item.dispensedDrug);
      const effectiveDispensedDrug = isNoSubstitution(dispensedDrug, noSubstitutionLabels) ? '' : dispensedDrug;
      return {
        itemId: item.id || `audit-item-${index}`,
        drugId: normalizeText(item.drugCode),
        drugName: normalizeText(item.drugName),
        dispensedDrug: effectiveDispensedDrug,
        genericName: getEffectiveGenericName(item)
      };
    })
  );

  for (const warning of patientAlertWarnings) {
    addIssue(issues, {
      severity: warning.severity === 'danger' ? 'error' : 'warning',
      code: warning.alertType === 'allergy' ? 'patient_allergy_match' : 'patient_side_effect_match',
      title: warning.title,
      message: warning.message,
      itemIds: warning.itemId ? [warning.itemId] : undefined
    });
  }

  if (hasPatientAlertsFetchError) {
    addIssue(issues, {
      severity: 'warning',
      code: 'patient_alerts_fetch_failed',
      title: '患者アラート（アレルギー・副作用歴）を取得できませんでした',
      message: '患者のアレルギー・副作用歴の取得に失敗したため、禁忌・注意の照合ができていません。患者情報を確認してください。'
    });
  }

  issues.sort((a, b) => {
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.title.localeCompare(b.title, 'ja');
  });

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    infoCount: issues.filter((issue) => issue.severity === 'info').length
  };
}
