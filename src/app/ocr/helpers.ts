import { v4 as uuidv4 } from 'uuid';
import type { Drug, Visit, InsuranceEligibilityStatus } from '@/db/types';
import type { DrugMasterRecord } from '@/lib/master-data/drug_master';
import { inferDosageCategory, type DosageCategory } from '@/lib/dosage_category';
import type { ElectronicPrescriptionItem } from '@/lib/electronic_prescription';
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
