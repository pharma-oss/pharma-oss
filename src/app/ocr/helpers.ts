import { v4 as uuidv4 } from 'uuid';
import type {
  Drug,
  Visit,
  InsuranceEligibilityStatus,
  Patient,
  PharmacyDatabase,
  PrescriptionItem,
  VisitElectronicPrescription,
  VisitElectronicPrescriptionLink
} from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import {
  findDrugMasterRecordByCode,
  isGeneralNameDrugRecord,
  searchDrugMaster,
  type DrugMasterRecord
} from '@/lib/master-data/drug_master';
import { formatDrugDisplayName } from '@/lib/master-data/drug_display';
import { findElectronicUsageOptionByLabel } from '@/lib/master-data/usage_master';
import { inferDosageCategory, type DosageCategory } from '@/lib/dosage_category';
import type {
  ElectronicPrescriptionDuplicateCheckStatus,
  ElectronicPrescriptionItem,
  ElectronicPrescriptionPayload
} from '@/lib/electronic_prescription';
import type { InsuranceEligibilityIssue } from '@/lib/insurance_eligibility';
import type { DrugItem as JahisDrugItem } from '@/lib/ocr/processor';
import type { PatientMergeOperation } from '@/lib/patient_merge';
import { getPublicInsuranceCategoryName } from '@/lib/patient_public_insurance';
import type { PreviousDoSnapshot } from '@/lib/previous_prescription_do';
import type { Prescription, PrescriptionFieldValue, PrescriptionGroup } from './types';

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

export const attachStockQuantities = async (
  db: PharmacyDatabase | null | undefined,
  drugs: DrugMasterRecord[]
) => {
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

// 並び順: 在庫あり → 最近選んだ薬 → (一般名/銘柄の希望) → 入力に近い順 → 名前が短い順 → 名前順。
// 名前が短い順を挟むのは、「アムロ」と打ったときに OD錠10mg の銘柄違いだけが先頭8件を埋めて、
// 基本の「アムロジピン錠5mg」が候補に出ない並びを避けるため。
export const sortDrugSuggestions = (
  drugs: DrugMasterRecord[],
  query: string,
  recentCodes: readonly string[] = []
) => {
  const recentRank = new Map(recentCodes.map((code, index) => [code, index]));
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

    const aRecent = recentRank.get(a.code);
    const bRecent = recentRank.get(b.code);
    if (aRecent !== undefined || bRecent !== undefined) {
      if (aRecent === undefined) return 1;
      if (bRecent === undefined) return -1;
      if (aRecent !== bRecent) return aRecent - bRecent;
    }

    const generalDiff = Number(isGeneralNameDrug(a) !== preferGeneral) - Number(isGeneralNameDrug(b) !== preferGeneral);
    if (generalDiff !== 0) return generalDiff;

    const rankDiff = matchRank(a) - matchRank(b);
    if (rankDiff !== 0) return rankDiff;

    const lengthDiff = a.name.length - b.name.length;
    if (lengthDiff !== 0) return lengthDiff;

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
  '該当する患者がいません。初めての方は、先に「新規患者を登録」から患者登録をしてください。';

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

export const PATIENT_CANDIDATES_PARTIAL_ONLY_NOTE =
  '入力した条件すべてに一致する患者はいません。初めての方は、先に「新規患者を登録」から患者登録をしてください。';

/**
 * 検索しても探している患者が見つからないときに、新規患者の登録へ案内する文言。案内が要らないときは null。
 * - 検索したのに誰も該当しない
 * - 該当した患者がみな「一部の条件だけ」の一致(別人のおそれがあり、選ぶより新規登録が正しいことがある)
 * 検索に失敗しているときは、見つからないのか調べられなかったのか分からないので案内しない。
 */
export function getPatientRegistrationPrompt(params: {
  candidateCount: number;
  hasFetchError: boolean;
  hasQuery: boolean;
  hasOnlyPartialMatches: boolean;
}): string | null {
  if (params.hasFetchError) return null;
  if (params.candidateCount === 0) return params.hasQuery ? PATIENT_CANDIDATES_EMPTY_NOTE : null;
  return params.hasOnlyPartialMatches ? PATIENT_CANDIDATES_PARTIAL_ONLY_NOTE : null;
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

export const PATIENT_MERGE_COLLECTION_LABEL = {
  visits: '受付',
  alerts: 'アラート'
} as const;

export function formatPatientMergeOperationLabel(operation: PatientMergeOperation): string {
  switch (operation.type) {
    case 'upsert_patient':
      return `残す患者情報を更新: ${operation.patientId}`;
    case 'delete_patient':
      return `統合元患者を削除: ${operation.patientId}`;
    case 'patch_visit_patient':
      return `受付を付け替え: ${operation.visitId} -> ${operation.afterPatientId}`;
    case 'patch_alert_patient':
      return `アラートを付け替え: ${operation.alertId} -> ${operation.afterPatientId}`;
  }
}

export const normalizeDrugComparableText = (value?: string) => (
  String(value || '')
    .normalize('NFKC')
    .replace(/[【［\[]\s*般\s*[】］\]]/g, '')
    .replace(/\s|　/g, '')
    .toLowerCase()
);

export const toQrDrugCodeStatus = (
  drug?: Pick<DrugMasterRecord, 'isAbolished'>
): Prescription['prescribedDrugCodeStatus'] => {
  if (!drug) return 'unknown';
  return drug.isAbolished ? 'abolished' : 'active';
};

export const QR_SOURCE_LABEL = {
  camera: 'カメラ',
  image: '画像',
  manual: 'スキャナー'
} as const;

export async function findBestDrugMasterForQrItem(item: JahisDrugItem): Promise<DrugMasterRecord | undefined> {
  const drugCode = item.drugCode?.trim();
  if (drugCode) {
    const exactDrug = await findDrugMasterRecordByCode(drugCode);
    if (exactDrug) return exactDrug;
  }

  const drugName = item.drugName.trim();
  if (!drugName) return undefined;

  const candidates = await searchDrugMaster(drugName, 25);
  if (candidates.length === 0) return undefined;
  const normalizedName = normalizeDrugComparableText(drugName);
  return candidates.find((drug) => (
    normalizeDrugComparableText(drug.name) === normalizedName ||
    normalizeDrugComparableText(formatDrugDisplayName(drug.name)) === normalizedName ||
    normalizeDrugComparableText(drug.genericName) === normalizedName ||
    normalizeDrugComparableText(drug.code) === normalizeDrugComparableText(drugCode) ||
    normalizeDrugComparableText(drug.yjCode) === normalizeDrugComparableText(drugCode)
  )) || candidates[0];
}

export const getEffectiveDispensedDrug = (prescription: Pick<Prescription, 'dispensedDrug'>) => {
  const dispensedDrug = prescription.dispensedDrug.trim();
  if (!dispensedDrug || isNoSubstitutionValue(dispensedDrug)) return '';
  return dispensedDrug;
};

// QR・OCRで読み取った薬品行を、薬品マスタ照合込みで編集フォームの行へ変換する
export const buildPrescriptionsFromParsedItems = async (
  items: JahisDrugItem[],
  idPrefix: string
): Promise<Prescription[]> => (
  Promise.all(items.map(async (item, index) => {
    const matchedDrug = await findBestDrugMasterForQrItem(item);
    const auditMeta = matchedDrug ? getDrugAuditMeta(matchedDrug) : undefined;
    const rpNumber = item.rpNumber || index + 1;
    return createEmptyPrescription(`rp_${idPrefix}_${rpNumber}`, {
      id: `item_${idPrefix}_${generateUUID()}`,
      drugCode: matchedDrug?.code || item.drugCode || '',
      drugName: matchedDrug?.name ? formatDrugDisplayName(matchedDrug.name) : item.drugName,
      amount: item.amount || '1',
      unitText: item.unit || '',
      electronicUsageCode: item.usageCode || '',
      electronicUsageFallbackText: item.usage || '',
      prescribedDrugCodeStatus: toQrDrugCodeStatus(matchedDrug),
      usage: item.usage || '',
      days: item.days || '',
      rpComment: item.rpComment || '',
      dispensedDrug: NO_SUBSTITUTION_LABEL,
      changeReason: '',
      ...(auditMeta || {})
    });
  }))
);

export interface PrescriptionMetrics {
  rpCount: number;
  drugCount: number;
  missingDrugCount: number;
  missingAmountCount: number;
  missingUsageCount: number;
  missingDaysCount: number;
  missingTotal: number;
  substitutionCount: number;
  specialPrepCount: number;
}

export function calculatePrescriptionMetrics(
  prescriptions: ReadonlyArray<Prescription>,
  prescriptionGroups: ReadonlyArray<PrescriptionGroup>
): PrescriptionMetrics {
  const missingDrugCount = prescriptions.filter((prescription) => !prescription.drugName.trim()).length;
  const missingAmountCount = prescriptions.filter((prescription) => !prescription.amount.trim()).length;
  const missingUsageCount = prescriptionGroups.filter((group) => !group.usage.trim()).length;
  const missingDaysCount = prescriptionGroups.filter((group) => !group.days.trim()).length;
  const substitutionCount = prescriptions.filter((prescription) => {
    const dispensedDrug = prescription.dispensedDrug.trim();
    return Boolean(dispensedDrug && !isNoSubstitutionValue(dispensedDrug));
  }).length;
  const specialPrepCount = prescriptions.filter((prescription) => (
    prescription.isIppoka || prescription.isCrushed || prescription.showReceiptRemark
  )).length;

  return {
    rpCount: prescriptionGroups.length,
    drugCount: prescriptions.length,
    missingDrugCount,
    missingAmountCount,
    missingUsageCount,
    missingDaysCount,
    missingTotal: missingDrugCount + missingAmountCount + missingUsageCount + missingDaysCount,
    substitutionCount,
    specialPrepCount
  };
}

export function buildPrescriptionAuditInputItems(
  prescriptions: ReadonlyArray<Prescription>,
  prescriptionGroups: ReadonlyArray<PrescriptionGroup>
) {
  return prescriptions.map((p) => {
    const group = prescriptionGroups.find((g) => g.rpId === p.rpId);
    const groupCategory = group ? getGroupDosageCategory(group) : undefined;
    const groupIndex = group ? prescriptionGroups.indexOf(group) : undefined;
    return {
      ...p,
      usageSupplementText: p.usageSupplementText || group?.usageSupplementText,
      dosageCategory: groupCategory?.category ?? p.dosageCategory,
      dosageCategorySource: (groupCategory?.isManual ? 'manual' : 'auto') as 'auto' | 'manual',
      rpNumber: groupIndex !== undefined ? groupIndex + 1 : undefined
    };
  });
}

export function resolveExistingElectronicPrescriptionLinks(
  applied: VisitElectronicPrescription | null
): VisitElectronicPrescriptionLink[] {
  if (!applied) return [];
  if (applied.linkedPrescriptions && applied.linkedPrescriptions.length > 0) {
    return applied.linkedPrescriptions;
  }
  return [{
    prescriptionId: applied.prescriptionId,
    documentKind: applied.documentKind,
    validUntil: applied.validUntil,
    signatureStatus: applied.signatureStatus,
    signatureHpkiVerification: applied.signatureHpkiVerification,
    duplicateCheckStatus: applied.duplicateCheckStatus,
    integrityHash: applied.integrityHash,
    paperOriginalConfirmed: applied.paperOriginalConfirmed,
    supplementaryInformation: applied.supplementaryInformation
  }];
}

const normalizeProviderComparableText = (value: string | undefined) => String(value || '')
  .normalize('NFKC')
  .replace(/[\s　]/g, '')
  .toUpperCase();

export function isElectronicPrescriptionInstitutionMismatch(
  current: { institutionCode: string; institutionName: string },
  next: { institutionCode?: string; institutionName?: string }
): boolean {
  const currentInstitutionCode = normalizeProviderComparableText(current.institutionCode);
  const nextInstitutionCode = normalizeProviderComparableText(next.institutionCode);
  const currentInstitutionName = normalizeProviderComparableText(current.institutionName);
  const nextInstitutionName = normalizeProviderComparableText(next.institutionName);
  return currentInstitutionCode && nextInstitutionCode
    ? currentInstitutionCode !== nextInstitutionCode
    : !currentInstitutionName || !nextInstitutionName || currentInstitutionName !== nextInstitutionName;
}

export function buildAppliedElectronicPrescriptionState(params: {
  applied: VisitElectronicPrescription | null;
  existingLinks: ReadonlyArray<VisitElectronicPrescriptionLink>;
  prescription: ElectronicPrescriptionPayload;
  duplicateCheckStatus?: ElectronicPrescriptionDuplicateCheckStatus;
  integrityHash: string;
  paperOriginalConfirmed: boolean;
  appliedAt?: string;
}): VisitElectronicPrescription {
  const {
    applied,
    existingLinks,
    prescription,
    duplicateCheckStatus: incomingDuplicateStatus,
    integrityHash,
    paperOriginalConfirmed,
    appliedAt = new Date().toISOString()
  } = params;

  const nextLink: VisitElectronicPrescriptionLink = {
    prescriptionId: prescription.prescriptionId!,
    documentKind: prescription.documentKind!,
    validUntil: prescription.validUntil!,
    signatureStatus: prescription.signatureVerification!.status,
    signatureHpkiVerification: prescription.signatureVerification?.hpkiVerification,
    duplicateCheckStatus: incomingDuplicateStatus || 'not_checked',
    integrityHash,
    paperOriginalConfirmed: prescription.documentKind === 'prescription_information'
      ? paperOriginalConfirmed
      : undefined,
    supplementaryInformation: prescription.supplementaryInformation
  };
  const linkedPrescriptions = [...existingLinks, nextLink];
  const duplicateStatuses = linkedPrescriptions.map((link) => link.duplicateCheckStatus);
  const duplicateCheckStatus = duplicateStatuses.includes('blocked')
    ? 'blocked'
    : duplicateStatuses.includes('warning')
      ? 'warning'
      : duplicateStatuses.every((status) => status === 'passed')
        ? 'passed'
        : 'not_checked';
  const earliestValidUntil = linkedPrescriptions
    .map((link) => link.validUntil)
    .sort()[0] || prescription.validUntil!;

  return {
    prescriptionId: applied?.prescriptionId || prescription.prescriptionId!,
    linkedPrescriptions,
    documentKind: applied?.documentKind || prescription.documentKind!,
    sourceMode: 'connector',
    receivedAt: applied?.receivedAt || appliedAt,
    appliedAt,
    validUntil: earliestValidUntil,
    signatureStatus: applied?.signatureStatus || prescription.signatureVerification!.status,
    signatureHpkiVerification: applied?.signatureHpkiVerification || prescription.signatureVerification?.hpkiVerification,
    duplicateCheckStatus,
    integrityHash: applied?.integrityHash || integrityHash,
    paperOriginalConfirmed: linkedPrescriptions.every((link) => (
      link.documentKind !== 'prescription_information' || link.paperOriginalConfirmed === true
    )) || undefined,
    refill: applied?.refill || prescription.refill,
    supplementaryInformation: applied?.supplementaryInformation || prescription.supplementaryInformation,
    receptionStatus: 'accepted',
    dispensingResultStatus: 'pending',
    dispensingResultEverRegistered: false
  };
}

function resolveManualElectronicUsageCode(
  usageValue: string,
  meta?: { electronicUsageCode?: string }
): string {
  if (meta && meta.electronicUsageCode !== undefined) {
    return meta.electronicUsageCode.trim();
  }
  const matched = findElectronicUsageOptionByLabel(usageValue);
  return matched?.prescriptionCode || '';
}

export function updatePrescriptionFieldAt(
  prev: Prescription[],
  id: string,
  field: string,
  value: PrescriptionFieldValue,
  index: number
): Prescription[] {
  const targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
  if (targetIndex === -1) return prev;
  const next = [...prev];
  if (field === 'usage' || field === 'days' || field === 'rpComment') {
    const targetRpId = next[targetIndex].rpId;
    const electronicUsageCodePatch = field === 'usage' && typeof value === 'string'
      ? { electronicUsageCode: resolveManualElectronicUsageCode(value) }
      : {};
    return next.map((prescription) => (
      prescription.rpId === targetRpId
        ? { ...prescription, [field]: value, ...electronicUsageCodePatch }
        : prescription
    ));
  }
  next[targetIndex] = { ...next[targetIndex], [field]: value };
  return next;
}

export function updateRpGroupField(
  prev: Prescription[],
  rpId: string,
  field: 'usage' | 'usageSupplementText' | 'days' | 'rpComment',
  value: string,
  meta?: { electronicUsageCode?: string }
): Prescription[] {
  const electronicUsageCodePatch = field === 'usage'
    ? { electronicUsageCode: resolveManualElectronicUsageCode(value, meta) }
    : {};
  return prev.map((prescription) => (
    prescription.rpId === rpId
      ? { ...prescription, [field]: value, ...electronicUsageCodePatch }
      : prescription
  ));
}

export function updateRpGroupDosageCategory(
  prev: Prescription[],
  rpId: string,
  category: DosageCategory | null
): Prescription[] {
  return prev.map((prescription) => (
    prescription.rpId === rpId
      ? {
        ...prescription,
        dosageCategory: category || undefined,
        dosageCategorySource: category ? 'manual' as const : undefined
      }
      : prescription
  ));
}

export function appendDrugToRpGroup(
  prev: Prescription[],
  rpId: string
): Prescription[] {
  const next = [...prev];
  const lastIndex = next.reduce((foundIndex, prescription, index) => (
    prescription.rpId === rpId ? index : foundIndex
  ), -1);
  const template = next[lastIndex];
  const insertIndex = lastIndex >= 0 ? lastIndex + 1 : next.length;
  next.splice(insertIndex, 0, createEmptyPrescription(rpId, {
    usage: template?.usage || '',
    days: template?.days || '',
    rpComment: template?.rpComment || '',
    dosageCategory: template?.dosageCategory,
    dosageCategorySource: template?.dosageCategorySource
  }));
  return next;
}

export function insertEmptyRpGroupAfter(
  prev: Prescription[],
  rpId: string
): Prescription[] {
  const next = [...prev];
  const lastIndex = next.reduce((foundIndex, prescription, index) => (
    prescription.rpId === rpId ? index : foundIndex
  ), -1);
  const insertIndex = lastIndex >= 0 ? lastIndex + 1 : next.length;
  next.splice(insertIndex, 0, createEmptyPrescription());
  return next;
}

export function removePrescriptionItemOrReset(
  prev: Prescription[],
  id: string
): Prescription[] {
  if (prev.length <= 1) {
    return [createEmptyPrescription('rp_initial', { id: 'item_initial' })];
  }
  const next = prev.filter((prescription) => prescription.id !== id);
  return next.length > 0 ? next : [createEmptyPrescription('rp_initial', { id: 'item_initial' })];
}

export function togglePrescriptionIppokaAt(
  prev: Prescription[],
  id: string,
  checked: boolean,
  index: number
): Prescription[] {
  const targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
  if (targetIndex === -1) return prev;
  const next = [...prev];
  next[targetIndex] = { ...next[targetIndex], isIppoka: checked };
  return next;
}

export function togglePrescriptionCrushedAt(
  prev: Prescription[],
  id: string,
  checked: boolean,
  index: number
): Prescription[] {
  const targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
  if (targetIndex === -1) return prev;
  const next = [...prev];
  next[targetIndex] = { ...next[targetIndex], isCrushed: checked };
  return next;
}

export function togglePrescriptionReceiptRemarkAt(
  prev: Prescription[],
  id: string,
  checked: boolean,
  index: number
): Prescription[] {
  const targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
  if (targetIndex === -1) return prev;
  const next = [...prev];
  next[targetIndex] = {
    ...next[targetIndex],
    showReceiptRemark: checked,
    receiptRemark: checked ? next[targetIndex].receiptRemark : ''
  };
  return next;
}

/**
 * 処方受付保存時の各処方明細の入力チェック。
 * 問題があればトースト表示用のエラー文言を返し、すべて妥当なら null を返す。
 */
export function validateReceptionPrescriptionItems(
  prescriptions: ReadonlyArray<Prescription>
): string | null {
  for (let i = 0; i < prescriptions.length; i++) {
    const p = prescriptions[i];
    if (!p.drugName.trim() || !p.drugCode) {
      return `処方薬${i + 1}: 薬品名を選択してください。`;
    }
    if (!p.amount || isNaN(parseFloat(p.amount)) || parseFloat(p.amount) <= 0) {
      return `処方薬${i + 1}: 数量を正しく入力してください。`;
    }
    if (p.days === '' || isNaN(parseInt(p.days, 10)) || parseInt(p.days, 10) < 0) {
      return `処方薬${i + 1}: 日数を0以上で入力してください。`;
    }
    // 【般】一般名処方は記載上の概念であり、在庫・ピッキングは銘柄(調剤薬)で追跡する。
    // 調剤薬が未選択のままだと般コードで在庫参照してしまうため、ここで止める。
    if (isGeneralNameDrugRecord({ code: p.drugCode, name: p.drugName }) && !p.dispensedDrugCode) {
      return `処方薬${i + 1}: 一般名処方です。調剤薬(銘柄)を候補から選択してください。`;
    }
  }
  return null;
}

/**
 * 処方フォーム配列から、DB保存用の PrescriptionItem 配列を生成する純粋関数。
 */
export function buildReceptionPrescriptionItemsPayload(
  prescriptions: ReadonlyArray<Prescription>,
  visitId: string,
  idGenerator: () => string = generateUUID
): Array<PrescriptionItem & Record<string, unknown>> {
  const prescriptionItems = new Array<PrescriptionItem & Record<string, unknown>>(prescriptions.length);
  const rpNumberById = new Map<string, number>();
  let nextRpNumber = 1;
  for (let i = 0; i < prescriptions.length; i++) {
    const item = prescriptions[i];
    if (!rpNumberById.has(item.rpId)) {
      rpNumberById.set(item.rpId, nextRpNumber);
      nextRpNumber++;
    }
    prescriptionItems[i] = {
      itemId: `item_${idGenerator()}`,
      visitId,
      rpNumber: rpNumberById.get(item.rpId) || i + 1,
      drugId: item.drugCode,
      dispensedDrug: getEffectiveDispensedDrug(item) || item.drugName,
      dispensedDrugCode: item.dispensedDrugCode || '',
      prescribedDrugCodeStatus: item.prescribedDrugCodeStatus,
      // 空文字はスキーマの format: 'date' 検証に落ちるため、値があるときだけ含める
      ...(item.prescribedDrugCodeAbolishedAt
        ? { prescribedDrugCodeAbolishedAt: item.prescribedDrugCodeAbolishedAt }
        : {}),
      electronicSourceDrugName: item.electronicSourceDrugName || '',
      electronicMasterDrugName: item.electronicMasterDrugName || '',
      electronicDrugNameVerificationStatus: item.electronicDrugNameVerificationStatus,
      ...(item.electronicDrugNameVerificationCheckedAt
        ? { electronicDrugNameVerificationCheckedAt: item.electronicDrugNameVerificationCheckedAt }
        : {}),
      unitCode: item.unitCode || '',
      unitText: item.unitText || '',
      electronicUnitConversion: item.electronicUnitConversion,
      electronicUsageCode: item.electronicUsageCode || '',
      electronicUsageFallbackText: item.electronicUsageFallbackText || '',
      electronicUsageSupplementText: item.electronicUsageSupplementText || '',
      usageSupplementText: item.usageSupplementText?.trim() || '',
      changeReason: item.changeReason,
      amount: parseFloat(item.amount) || 1,
      usage: item.usage,
      days: Number.isFinite(parseInt(item.days, 10)) ? parseInt(item.days, 10) : 0,
      rpComment: item.rpComment?.trim() || '',
      dosageCategory: (item.dosageCategorySource === 'manual' && item.dosageCategory)
        ? item.dosageCategory
        : inferDosageCategory(item.drugName || getEffectiveDispensedDrug(item), item.usage),
      dosageCategorySource: item.dosageCategorySource === 'manual' ? 'manual' as const : 'auto' as const,
      isIppoka: !!item.isIppoka,
      isCrushed: !!item.isCrushed,
      tokkanType: item.tokkanType || 'none',
      receiptRemark: item.showReceiptRemark ? (item.receiptRemark || '') : '',
      billingAgentGroupKey: item.billingAgentGroupKey?.trim() || '',
      billingAgentGroupReason: item.billingAgentGroupKey?.trim() ? (item.billingAgentGroupReason?.trim() || '') : ''
    };
  }
  return prescriptionItems;
}

