import { v4 as uuidv4 } from 'uuid';
import type { Drug, Visit, InsuranceEligibilityStatus, Patient } from '@/db/types';
import type { DrugMasterRecord } from '@/lib/master-data/drug_master';
import { inferDosageCategory, type DosageCategory } from '@/lib/dosage_category';
import type { ElectronicPrescriptionItem } from '@/lib/electronic_prescription';
import type { InsuranceEligibilityIssue } from '@/lib/insurance_eligibility';
import { getPublicInsuranceCategoryName } from '@/lib/patient_public_insurance';
import type { PreviousDoSnapshot } from '@/lib/previous_prescription_do';
import type { Prescription, PrescriptionGroup } from './types';

export type EligibilityStatus = 'unchecked' | 'checking' | 'confirmed' | 'warning' | 'unavailable';

export const NO_SUBSTITUTION_LABEL = '変更なし';
export const LEGACY_NO_SUBSTITUTION_LABELS = new Set(['変更なし', '変更調剤なし']);
export const isNoSubstitutionValue = (value: string) => LEGACY_NO_SUBSTITUTION_LABELS.has((value || '').trim());

export const toPatientEligibilityStatus = (status: EligibilityStatus): InsuranceEligibilityStatus | undefined => {
  if (status === 'confirmed') return 'valid';
  if (status === 'warning') return 'warning';
  if (status === 'unavailable') return 'unavailable';
  return undefined;
};

export const getDrugAuditMeta = (drug: Pick<Drug, 'yjCode' | 'genericName' | 'isHighRisk' | 'isAbolished' | 'stockQuantity'>) => ({
  yjCode: drug.yjCode || '',
  genericName: drug.genericName || '',
  isHighRisk: !!drug.isHighRisk,
  isAbolished: !!drug.isAbolished,
  stockQuantity: drug.stockQuantity
});

export const getDispensedDrugAuditMeta = (drug: Pick<Drug, 'yjCode' | 'genericName' | 'isHighRisk' | 'isAbolished' | 'stockQuantity'>) => ({
  dispensedYjCode: drug.yjCode || '',
  dispensedGenericName: drug.genericName || '',
  dispensedIsHighRisk: !!drug.isHighRisk,
  dispensedIsAbolished: !!drug.isAbolished,
  dispensedStockQuantity: drug.stockQuantity
});

export const clearDispensedDrugAuditMeta = {
  dispensedYjCode: '',
  dispensedGenericName: '',
  dispensedIsHighRisk: false,
  dispensedIsAbolished: false,
  dispensedStockQuantity: undefined
};

export const auditSeverityLabel = {
  error: '要修正',
  warning: '要確認',
  info: '確認'
} as const;

export const historyChangeLabel = {
  added: '追加',
  stopped: '中止',
  changed: '変更',
  unchanged: '継続'
} as const;

export const createEmptyPrescription = (
  rpId: string = `rp_${uuidv4()}`,
  overrides: Partial<Prescription> = {}
): Prescription => ({
  id: `item_${uuidv4()}`,
  rpId,
  drugCode: '',
  drugName: '',
  dispensedDrug: '',
  dispensedDrugCode: '',
  changeReason: '',
  amount: '',
  usage: '',
  days: '',
  ...overrides
});

export const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const dateInputToIso = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const now = new Date();
  const date = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
  return date.toISOString();
};

export const normalizeDateInputValue = (value?: string): string => {
  const normalized = (value || '').trim();
  const compactMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return '';
};

export const normalizeJahisDateInputValue = (value?: string): string => {
  const normalized = (value || '').trim().toUpperCase();
  const westernDate = normalizeDateInputValue(normalized);
  if (westernDate) return westernDate;

  const eraMatch = normalized.match(/^([MTSHR])(\d{2})(\d{2})(\d{2})$/);
  if (!eraMatch) return '';
  const eraStartYear = {
    M: 1867,
    T: 1911,
    S: 1925,
    H: 1988,
    R: 2018
  }[eraMatch[1] as 'M' | 'T' | 'S' | 'H' | 'R'];
  const year = eraStartYear + Number(eraMatch[2]);
  const month = Number(eraMatch[3]);
  const day = Number(eraMatch[4]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Rpグループの実効調剤区分。手動指定があればそれを優先し、
// なければ薬品名・用法からの自動推定を毎回導出する(入力経路を問わず追従する)。
export const getGroupDosageCategory = (group: PrescriptionGroup): { category: DosageCategory; isManual: boolean } => {
  const manualItem = group.prescriptions.find((p) => p.dosageCategorySource === 'manual' && p.dosageCategory);
  if (manualItem?.dosageCategory) return { category: manualItem.dosageCategory, isManual: true };
  const namedItem = group.prescriptions.find((p) => (p.drugName || p.dispensedDrug || '').trim());
  return {
    category: inferDosageCategory(namedItem ? (namedItem.drugName || namedItem.dispensedDrug || '') : '', group.usage),
    isManual: false
  };
};

export const attachStockQuantities = async (db: any, drugs: DrugMasterRecord[]) => {
  if (!db || drugs.length === 0) {
    return drugs.map((drug) => ({ ...drug, stockQuantity: drug.stockQuantity || 0 }));
  }

  const drugCodes = drugs.map((drug) => drug.code);
  const stocks = await db.drug_stocks.find({
    selector: { drugCode: { $in: drugCodes } }
  }).exec();
  const stocksMap = new Map<string, number>();

  for (const stock of stocks) {
    stocksMap.set(stock.drugCode, (stocksMap.get(stock.drugCode) || 0) + stock.quantity);
  }

  return drugs.map((drug) => ({
    ...drug,
    stockQuantity: stocksMap.get(drug.code) ?? drug.stockQuantity ?? 0
  }));
};

export const stockTitle = (quantity?: number) => (
  (quantity || 0) > 0 ? `在庫 ${quantity}` : '在庫なし'
);

export const stockClassName = (quantity?: number) => (
  (quantity || 0) > 0 ? 'in-stock' : 'out-of-stock'
);

export const formatVisitDateLabel = (visit: Partial<Visit>) => {
  const rawDate = visit.dispensingDate || visit.prescriptionDate || visit.issueDate || '';
  if (!rawDate) return '日付未設定';
  const parsed = new Date(rawDate);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}/${parsed.getMonth() + 1}/${parsed.getDate()}`;
  }
  return rawDate.replace(/-/g, '/').slice(0, 10);
};

export const getVisitSortTime = (visit: Partial<Visit>) => {
  const rawDate = visit.dispensingDate || visit.prescriptionDate || visit.issueDate || '';
  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

export const isGeneralNameDrug = (drug: DrugMasterRecord) => (
  drug.name.includes('【般】') || drug.code.endsWith('ZZZ')
);

export const sortDrugSuggestions = (drugs: DrugMasterRecord[], query: string) => {
  const preferGeneral = query.includes('【般】');
  const normalizedQuery = query
    .toLowerCase()
    .replace(/[【［\[]\s*般\s*[】］\]]/g, '')
    .trim();
  const matchRank = (drug: DrugMasterRecord) => {
    if (!normalizedQuery) return 0;
    if (drug.searchNameLower === normalizedQuery) return 0;
    if (drug.searchNameLower.startsWith(normalizedQuery)) return 1;
    if (drug.searchNameLower.includes(normalizedQuery)) return 2;
    if (drug.searchGenericLower.startsWith(normalizedQuery)) return 3;
    if (drug.searchGenericLower.includes(normalizedQuery)) return 4;
    return 5;
  };

  return [...drugs].sort((a, b) => {
    const stockDiff = (b.stockQuantity || 0) - (a.stockQuantity || 0);
    if (stockDiff !== 0) return stockDiff;

    const generalDiff = Number(isGeneralNameDrug(a) !== preferGeneral) - Number(isGeneralNameDrug(b) !== preferGeneral);
    if (generalDiff !== 0) return generalDiff;

    const rankDiff = matchRank(a) - matchRank(b);
    if (rankDiff !== 0) return rankDiff;

    return a.name.localeCompare(b.name, 'ja');
  });
};

/**
 * 電子処方箋明細を編集フォーム用 Prescription に変換する純粋関数。
 * 【PR-D2】調剤・レセプト・在庫計算のため、amount / unitCode / unitText には
 * 薬価単位側（item.amount / item.unitCode / item.unitText）を格納し、
 * 処方指示（換算前用量・単位）は electronicUnitConversion に保持する。
 */
export function buildPrescriptionFromElectronicItem(
  item: ElectronicPrescriptionItem,
  prescriptionId: string,
  index: number,
  idGenerator: () => string = () => Math.random().toString(36).substring(2, 9)
): Prescription {
  const rpNumber = item.rpNumber || index + 1;
  return createEmptyPrescription(`rp_ep_${prescriptionId}_${rpNumber}`, {
    id: `item_ep_${idGenerator()}`,
    drugCode: item.drugCode || item.receiptCode || item.yjCode || '',
    drugName: item.drugName,
    amount: item.amount,
    unitCode: item.unitCode || '',
    unitText: item.unitText || '',
    electronicUnitConversion: item.unitConversion,
    electronicUsageCode: item.usageCode || '',
    electronicUsageFallbackText: item.usageFallbackText || '',
    electronicUsageSupplementText: item.usageSupplementText || '',
    prescribedDrugCodeStatus: item.drugCodeStatus || 'unknown',
    prescribedDrugCodeAbolishedAt: item.drugCodeAbolishedAt || '',
    electronicSourceDrugName: item.sourceDrugName || '',
    electronicMasterDrugName: item.masterDrugName || '',
    electronicDrugNameVerificationStatus: item.drugNameVerificationStatus || 'not_checked',
    electronicDrugNameVerificationCheckedAt: item.drugNameVerificationCheckedAt || '',
    usage: [item.usage || item.usageFallbackText || '', item.usageSupplementText || '']
      .filter(Boolean)
      .join(' '),
    days: item.days,
    rpComment: item.rpComment || '',
    dispensedDrug: NO_SUBSTITUTION_LABEL,
    changeReason: ''
  });
}

/**
 * 選択中患者の公費・保険適合性判定結果から、受付画面で表面化すべき警告（公費全般および保険期限切れ・資格不備）を抽出する純粋関数
 */
export function filterReceptionEligibilityAlerts(
  issues: ReadonlyArray<InsuranceEligibilityIssue>,
  options: { hasPatientAlertsFetchError: boolean }
): InsuranceEligibilityIssue[] {
  const filtered = issues.filter((issue) => {
    // 公費関連のエラー・警告はすべて表面化
    if (issue.code.startsWith('public_insurance_')) return true;
    // 保険資格切れ・開始日前・資格確認未完了などの重大警告も表面化
    if (
      issue.code === 'insurance_expired' ||
      issue.code === 'insurance_expiring_soon' ||
      issue.code === 'insurance_valid_from_future' ||
      issue.code === 'insurance_eligibility_invalid' ||
      issue.code === 'insurance_eligibility_unchecked' ||
      issue.code === 'insurance_provider_format_invalid'
    ) {
      return true;
    }
    return false;
  });

  if (options.hasPatientAlertsFetchError) {
    filtered.push({
      code: 'patient_alerts_fetch_failed',
      severity: 'warning',
      title: '患者アラート取得失敗',
      message: 'アレルギー・副作用歴等の取得に失敗したため確認できません。患者情報を確認してください。'
    });
  }

  return filtered;
}

/**
 * 患者候補カード表示用の公費サマリーおよび簡易バッジ情報を生成する純粋関数
 */
export function buildCandidatePublicInsuranceSummary(
  patient: Pick<Patient, 'publicInsurances'>,
  issues: ReadonlyArray<InsuranceEligibilityIssue>
): {
  summary: string;
  hasExpired: boolean;
  hasWarning: boolean;
} | undefined {
  if (!patient.publicInsurances || patient.publicInsurances.length === 0) {
    return undefined;
  }
  const summaryParts: string[] = [];
  for (const [idx, pub] of patient.publicInsurances.entries()) {
    const cat = getPublicInsuranceCategoryName(pub.provider);
    const prefix = pub.provider ? pub.provider.slice(0, 2) : '';
    const name = cat || (prefix ? `公費${prefix}` : `公費${idx + 1}`);
    summaryParts.push(name);
  }
  const hasExpired = issues.some((i) => i.code === 'public_insurance_expired');
  const hasWarning = issues.some((i) => i.code.startsWith('public_insurance_') && i.severity === 'warning');

  return {
    summary: summaryParts.join(' / '),
    hasExpired,
    hasWarning
  };
}

export const PATIENT_CANDIDATES_EMPTY_NOTE =
  '一致する患者がいない場合は、名前・生年月日・保険者番号だけで簡易登録して取り揃えを開始します。';

export const PATIENT_CANDIDATES_FETCH_ERROR_MESSAGE =
  '患者候補の検索に失敗したため、既存患者との照合ができていません。再読み込みして確認してください。';

export const PATIENT_CANDIDATES_STALE_FETCH_ERROR_MESSAGE =
  '患者候補の検索に失敗したため、既存患者との照合ができていません。表示中の候補は最新の入力の結果でない可能性があります。再読み込みして確認してください。';

export interface PatientCandidatePanelViewState {
  status: 'candidates' | 'empty' | 'error_empty' | 'error_with_stale_candidates';
  showCandidates: boolean;
  errorBannerMessage: string | null;
  emptyNoteMessage: string | null;
}

export function getPatientCandidatePanelViewState(params: {
  candidateCount: number;
  hasFetchError: boolean;
}): PatientCandidatePanelViewState {
  const hasCandidates = params.candidateCount > 0;
  if (params.hasFetchError) {
    if (hasCandidates) {
      return {
        status: 'error_with_stale_candidates',
        showCandidates: true,
        errorBannerMessage: PATIENT_CANDIDATES_STALE_FETCH_ERROR_MESSAGE,
        emptyNoteMessage: null
      };
    }
    return {
      status: 'error_empty',
      showCandidates: false,
      errorBannerMessage: PATIENT_CANDIDATES_FETCH_ERROR_MESSAGE,
      emptyNoteMessage: null
    };
  }
  if (hasCandidates) {
    return {
      status: 'candidates',
      showCandidates: true,
      errorBannerMessage: null,
      emptyNoteMessage: null
    };
  }
  return {
    status: 'empty',
    showCandidates: false,
    errorBannerMessage: null,
    emptyNoteMessage: PATIENT_CANDIDATES_EMPTY_NOTE
  };
}

export const PREVIOUS_DO_LOAD_ERROR_DISABLED_REASON =
  '前回処方の読み込みに失敗したため投入できません。再読み込みして確認してください。';
export const PREVIOUS_DO_LOAD_ERROR_SUMMARY = '確認失敗';

export interface PreviousDoViewState {
  disabledReason: string;
  summary: string;
}

export function getPreviousDoViewState(params: {
  selectedPatientId: string | null;
  isLoadingPreviousDo: boolean;
  hasPreviousDoError: boolean;
  previousDoSnapshot: PreviousDoSnapshot | null;
}): PreviousDoViewState {
  const disabledReason = (() => {
    if (!params.selectedPatientId) return '患者選択後に利用できます';
    if (params.isLoadingPreviousDo) return '前回処方を確認しています';
    if (params.hasPreviousDoError) return PREVIOUS_DO_LOAD_ERROR_DISABLED_REASON;
    if (!params.previousDoSnapshot || params.previousDoSnapshot.items.length === 0) {
      return '直近完了受付の処方がありません';
    }
    return '';
  })();

  const summary = (() => {
    if (params.isLoadingPreviousDo) return '確認中';
    if (params.hasPreviousDoError) return PREVIOUS_DO_LOAD_ERROR_SUMMARY;
    if (!params.previousDoSnapshot) return '前回なし';
    return `${formatVisitDateLabel(params.previousDoSnapshot.visit)} / ${params.previousDoSnapshot.items.length}薬品`;
  })();

  return {
    disabledReason,
    summary
  };
}

export const DISPENSED_DRUG_CANDIDATES_FETCH_ERROR_MESSAGE =
  '調剤薬品の候補を取得できませんでした。薬品検索を開くから選んでください。';

export type DispensedDrugCandidateStatus = 'error' | 'candidates' | 'empty';

export interface DispensedDrugCandidateViewState {
  status: DispensedDrugCandidateStatus;
  hasError: boolean;
  errorMessage: string | null;
  candidateCount: number;
}

export function getDispensedDrugCandidateViewState(params: {
  candidateCount: number;
  hasFetchError: boolean;
}): DispensedDrugCandidateViewState {
  if (params.hasFetchError) {
    return {
      status: 'error',
      hasError: true,
      errorMessage: DISPENSED_DRUG_CANDIDATES_FETCH_ERROR_MESSAGE,
      candidateCount: 0
    };
  }
  if (params.candidateCount > 0) {
    return {
      status: 'candidates',
      hasError: false,
      errorMessage: null,
      candidateCount: params.candidateCount
    };
  }
  return {
    status: 'empty',
    hasError: false,
    errorMessage: null,
    candidateCount: 0
  };
}

export const PROVIDER_HISTORY_FETCH_ERROR_TOAST_MESSAGE =
  '過去の医療機関の入力履歴を読み込めませんでした。';

export const PROVIDER_HISTORY_FETCH_ERROR_ALERT_MESSAGE =
  '過去の医療機関の入力履歴を読み込めなかったため、医療機関の候補を表示できません。医療機関コードと名前は手入力してください。';

export type ProviderHistoryCandidateStatus = 'error' | 'candidates' | 'empty';

export interface ProviderHistoryCandidateViewState {
  status: ProviderHistoryCandidateStatus;
  hasError: boolean;
  errorMessage: string | null;
  candidateCount: number;
}

export function getProviderHistoryCandidateViewState(params: {
  candidateCount: number;
  hasFetchError: boolean;
}): ProviderHistoryCandidateViewState {
  if (params.hasFetchError) {
    return {
      status: 'error',
      hasError: true,
      errorMessage: PROVIDER_HISTORY_FETCH_ERROR_ALERT_MESSAGE,
      candidateCount: 0
    };
  }
  if (params.candidateCount > 0) {
    return {
      status: 'candidates',
      hasError: false,
      errorMessage: null,
      candidateCount: params.candidateCount
    };
  }
  return {
    status: 'empty',
    hasError: false,
    errorMessage: null,
    candidateCount: 0
  };
}


