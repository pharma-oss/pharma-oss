import type { FacilitySettings, PrescriptionItem, Patient } from '@/db/types';

export type FeeCode =
  | 'base_fee'
  | 'base_additions'
  | 'drug_preparation'
  | 'dispensing_management'
  | 'medication_guidance'
  | 'special_management'
  | 'ippoka'
  | 'mixing'
  | 'drug_fee';

export interface MonthlyFeeHistoryEntry {
  visitId?: string;
  patientId?: string;
  serviceDate: string;
  feeKey?: string;
  feeCode?: FeeCode;
  feeName?: string;
  points?: number;
}

export interface FeeCalculationOptions {
  drugFeeOnly?: boolean;
  disabledFeeCodes?: string[];
  disabledFeeRationales?: { [feeCode: string]: string };
  currentVisitId?: string;
  monthlyFeeHistory?: MonthlyFeeHistoryEntry[];
}

export interface CalculationResultItem {
  code?: FeeCode;
  feeKey?: string;
  receiptFeeCode?: string;
  receiptRemarks?: { code: string; text: string }[];
  name: string;
  points: number;
  rationale: string;
}

export type FeeOffReasonCategory = 'monthly_count' | 'prohibited';

export interface FeeOffReason {
  feeKey: string;
  feeCode: FeeCode;
  feeName: string;
  category: FeeOffReasonCategory;
  issueCode: string;
  reason: string;
  serviceMonth?: string;
  relatedVisitId?: string;
  relatedServiceDate?: string;
}

export type OfficialFeeCodeOverrideKey =
  | 'base_fee_1'
  | 'base_fee_2'
  | 'base_fee_3_a'
  | 'base_fee_3_b'
  | 'base_fee_3_ro'
  | 'base_fee_special'
  | 'base_fee_special_b'
  | 'regional_support_addition_1'
  | 'regional_support_addition_2'
  | 'regional_support_addition_3'
  | 'regional_support_addition_4'
  | 'regional_support_addition_5'
  | 'medical_dx_addition'
  | 'generic_dispensing_reduction'
  | 'drug_preparation'
  | 'dispensing_management_internal'
  | 'dispensing_management_other'
  | 'medication_guidance_1'
  | 'special_management_1'
  | 'special_management_3_i'
  | 'outpatient_medication_support_2'
  | 'measurement_mixing_powder'
  | 'measurement_mixing_liquid'
  | 'measurement_mixing_ointment'
  | 'in_house_preparation';

export interface OfficialFeeCodeOverrideItem {
  key: OfficialFeeCodeOverrideKey;
  label: string;
  group: 'base' | 'addition' | 'preparation' | 'management';
}

export const DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS: OfficialFeeCodeOverrideItem[] = [
  { key: 'base_fee_1', label: '調剤基本料1', group: 'base' },
  { key: 'base_fee_2', label: '調剤基本料2', group: 'base' },
  { key: 'base_fee_3_a', label: '調剤基本料3(イ)', group: 'base' },
  { key: 'base_fee_3_b', label: '調剤基本料3(ロ)', group: 'base' },
  { key: 'base_fee_3_ro', label: '調剤基本料3(ハ)', group: 'base' },
  { key: 'base_fee_special', label: '特別調剤基本料A', group: 'base' },
  { key: 'base_fee_special_b', label: '特別調剤基本料B', group: 'base' },
  { key: 'regional_support_addition_1', label: '地域支援・医薬品供給対応体制加算1', group: 'addition' },
  { key: 'regional_support_addition_2', label: '地域支援・医薬品供給対応体制加算2', group: 'addition' },
  { key: 'regional_support_addition_3', label: '地域支援・医薬品供給対応体制加算3', group: 'addition' },
  { key: 'regional_support_addition_4', label: '地域支援・医薬品供給対応体制加算4', group: 'addition' },
  { key: 'regional_support_addition_5', label: '地域支援・医薬品供給対応体制加算5', group: 'addition' },
  { key: 'medical_dx_addition', label: '電子的調剤情報連携体制整備加算', group: 'addition' },
  { key: 'generic_dispensing_reduction', label: '後発医薬品減算', group: 'addition' },
  { key: 'drug_preparation', label: '薬剤調製料', group: 'preparation' },
  { key: 'dispensing_management_internal', label: '調剤管理料(内服薬)', group: 'management' },
  { key: 'dispensing_management_other', label: '調剤管理料(内服薬以外)', group: 'management' },
  { key: 'medication_guidance_1', label: '服薬管理指導料1', group: 'management' },
  { key: 'special_management_1', label: '特定薬剤管理指導加算1', group: 'management' },
  { key: 'special_management_3_i', label: '特定薬剤管理指導加算3(イ)', group: 'management' },
  { key: 'outpatient_medication_support_2', label: '外来服薬支援料2', group: 'management' },
  { key: 'measurement_mixing_powder', label: '計量混合調剤加算(散剤・顆粒剤)', group: 'preparation' },
  { key: 'measurement_mixing_liquid', label: '計量混合調剤加算(液剤)', group: 'preparation' },
  { key: 'measurement_mixing_ointment', label: '計量混合調剤加算(軟・硬膏剤)', group: 'preparation' },
  { key: 'in_house_preparation', label: '自家製剤加算', group: 'preparation' }
];

export interface ItemWithPrice extends PrescriptionItem {
  drugName?: string;
  isSpecialRoute?: boolean;
  agentGroupKey?: string;
  billingAgentGroupKey?: string;
  billingAgentGroupReason?: string;
  drugPrice?: number;
  yjCode?: string;
  isCrushed?: boolean;
  claimPreparation?: boolean;
  claimManagement?: boolean;
  claimDrugFee?: boolean;
  doc?: any; // ⚡ Bolt: Cache RxDocument to bypass findOne lookup during updates
}

const MEDICAL_DX_ADDITION_KEY = 'medical_dx_addition';
const MEDICAL_DX_ADDITION_NAME = '電子的調剤情報連携体制整備加算';

interface MonthlyOnceBaseAdditionRule {
  feeKey: string;
  feeCode: FeeCode;
  feeName: string;
  isConfigured: (settings: FacilitySettings) => boolean;
  getProhibitedReason?: (settings: FacilitySettings) => string | undefined;
}

const MONTHLY_ONCE_BASE_ADDITION_RULES: MonthlyOnceBaseAdditionRule[] = [
  {
    feeKey: MEDICAL_DX_ADDITION_KEY,
    feeCode: 'base_additions',
    feeName: MEDICAL_DX_ADDITION_NAME,
    isConfigured: (settings) => !!settings.medicalDxAddition,
    getProhibitedReason: (settings) => settings.baseFeeCategory === 'special_b'
      ? '特別調剤基本料Bの薬局では電子的調剤情報連携体制整備加算の算定対象外です'
      : undefined
  }
];

function getServiceMonth(value?: string): string | undefined {
  if (!value) return undefined;
  const matched = /^(\d{4})-(\d{2})/.exec(value.trim());
  return matched ? `${matched[1]}-${matched[2]}` : undefined;
}

function feeHistoryMatchesRule(
  entry: MonthlyFeeHistoryEntry,
  rule: MonthlyOnceBaseAdditionRule
): boolean {
  if (entry.points !== undefined && entry.points <= 0) return false;
  if (entry.feeKey && entry.feeKey === rule.feeKey) return true;
  if (entry.feeName && entry.feeName === rule.feeName) return true;
  return entry.feeCode === rule.feeCode && entry.feeName === rule.feeName;
}

function findMonthlyFeeHistoryEntry(
  patient: Patient,
  visitDateStr: string,
  rule: MonthlyOnceBaseAdditionRule,
  options?: FeeCalculationOptions,
  currentVisitId?: string
): MonthlyFeeHistoryEntry | undefined {
  const serviceMonth = getServiceMonth(visitDateStr);
  if (!serviceMonth) return undefined;
  const history = options?.monthlyFeeHistory || [];
  const patientId = patient.patientId;

  return history.find((entry) => {
    if (getServiceMonth(entry.serviceDate) !== serviceMonth) return false;
    if (currentVisitId && entry.visitId === currentVisitId) return false;
    if (entry.patientId && patientId && entry.patientId !== patientId) return false;
    return feeHistoryMatchesRule(entry, rule);
  });
}

function inferCurrentVisitId(items: ItemWithPrice[], options?: FeeCalculationOptions): string | undefined {
  if (options?.currentVisitId) return options.currentVisitId;
  for (let i = 0; i < items.length; i++) {
    if (items[i].visitId) return items[i].visitId;
  }
  return undefined;
}

function evaluateFeeOffReasons(
  settings: FacilitySettings,
  patient: Patient,
  visitDateStr: string,
  options?: FeeCalculationOptions,
  currentVisitId?: string
): FeeOffReason[] {
  const reasons: FeeOffReason[] = [];
  const serviceMonth = getServiceMonth(visitDateStr);

  for (const rule of MONTHLY_ONCE_BASE_ADDITION_RULES) {
    if (!rule.isConfigured(settings)) continue;

    const prohibitedReason = rule.getProhibitedReason?.(settings);
    if (prohibitedReason) {
      reasons.push({
        feeKey: rule.feeKey,
        feeCode: rule.feeCode,
        feeName: rule.feeName,
        category: 'prohibited',
        issueCode: 'medical_dx_special_b_prohibited',
        reason: prohibitedReason,
        serviceMonth
      });
      continue;
    }

    const historyEntry = findMonthlyFeeHistoryEntry(patient, visitDateStr, rule, options, currentVisitId);
    if (!historyEntry) continue;

    const relatedText = historyEntry.visitId
      ? `受付 ${historyEntry.visitId}`
      : historyEntry.serviceDate;
    reasons.push({
      feeKey: rule.feeKey,
      feeCode: rule.feeCode,
      feeName: rule.feeName,
      category: 'monthly_count',
      issueCode: 'monthly_once_fee_already_claimed',
      reason: `${serviceMonth || '同月'}内に同じ患者で${rule.feeName}を算定済み（${relatedText}）のため、今回分は算定対象外です`,
      serviceMonth,
      relatedVisitId: historyEntry.visitId,
      relatedServiceDate: historyEntry.serviceDate
    });
  }

  return reasons;
}

export function getDispensingFeeOffReasons(
  settings: FacilitySettings,
  patient: Patient,
  visitDateStr: string,
  options?: FeeCalculationOptions
): FeeOffReason[] {
  return evaluateFeeOffReasons(settings, patient, visitDateStr, options, options?.currentVisitId);
}

export function buildAutomaticDisabledFeeRationales(
  settings: FacilitySettings,
  patient: Patient,
  visitDateStr: string,
  options?: FeeCalculationOptions
): { [feeKey: string]: string } {
  const existing = options?.disabledFeeRationales || {};
  const rationales: { [feeKey: string]: string } = {};
  for (const reason of getDispensingFeeOffReasons(settings, patient, visitDateStr, options)) {
    if (!existing[reason.feeKey]) {
      rationales[reason.feeKey] = reason.reason;
    }
  }
  return rationales;
}

// ⚡ Bolt: Helper to normalize usage string to group internal medicines correctly
function normalizeUsage(usage: string | undefined): string {
  if (!usage) return '';
  // Convert full-width to half-width, trim spaces
  let normalized = usage.replace(/　/g, ' ').trim();

  // Basic normalization rules based on common Japanese medical usage
  if (normalized.includes('食直前')) {
    return '食前';
  }
  if (normalized.includes('食直後')) {
    return '食後';
  }
  if (normalized.includes('就寝前')) {
    return '就寝前';
  }
  if (normalized.includes('食間')) {
    return '食間';
  }
  if (normalized.includes('起床時')) {
    return '起床時';
  }
  if (normalized.includes('食前')) {
    return '食前';
  }
  if (normalized.includes('食後')) {
    return '食後';
  }

  return normalized; // Fallback to exact match for uncommon usages
}

type IntermittentScheduleKind = 'weekly' | 'alternate_day' | 'cycle';

interface IntermittentSchedule {
  kind: IntermittentScheduleKind;
  administrationsPerCycle: number;
  cycleDays: number;
  signature: string;
}

const JAPANESE_NUMERAL_VALUES: Record<string, number> = {
  '一': 1,
  '二': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9
};

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
}

function parseJapaneseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = normalizeDigits(value.trim());
  if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
  if (normalized === '十') return 10;
  if (normalized.includes('十')) {
    const [tensText, onesText] = normalized.split('十');
    const tens = tensText ? JAPANESE_NUMERAL_VALUES[tensText] : 1;
    const ones = onesText ? JAPANESE_NUMERAL_VALUES[onesText] : 0;
    if (tens && ones !== undefined) return tens * 10 + ones;
  }
  return JAPANESE_NUMERAL_VALUES[normalized];
}

function parseIntermittentSchedule(text: string): IntermittentSchedule | undefined {
  if (!text) return undefined;
  const normalized = normalizeDigits(text.replace(/　/g, ' '));

  const cycleMatch = normalized.match(/([0-9一二三四五六七八九十]+)\s*日(?:間)?\s*(?:服用|内服|投与).*?([0-9一二三四五六七八九十]+)\s*日(?:間)?\s*休薬/);
  const cycleDoseDays = parseJapaneseNumber(cycleMatch?.[1]);
  const cycleOffDays = parseJapaneseNumber(cycleMatch?.[2]);
  if (cycleDoseDays && cycleOffDays && cycleDoseDays > 0 && cycleOffDays > 0) {
    return {
      kind: 'cycle',
      administrationsPerCycle: cycleDoseDays,
      cycleDays: cycleDoseDays + cycleOffDays,
      signature: `cycle:${cycleDoseDays}:${cycleOffDays}`
    };
  }

  const weeklyMatch =
    normalized.match(/週\s*(?:に)?\s*([0-9一二三四五六七八九十]+)\s*回/)
    || normalized.match(/([0-9一二三四五六七八九十]+)\s*回\s*(?:\/|／|につき)?\s*週/);
  const weeklyCount = parseJapaneseNumber(weeklyMatch?.[1]);
  if (weeklyCount && weeklyCount > 0) {
    return {
      kind: 'weekly',
      administrationsPerCycle: weeklyCount,
      cycleDays: 7,
      signature: `weekly:${weeklyCount}:${getWeekdaySignature(normalized)}`
    };
  }

  if (/(隔日|1日おき|一日おき)/.test(normalized)) {
    return {
      kind: 'alternate_day',
      administrationsPerCycle: 1,
      cycleDays: 2,
      signature: 'alternate-day'
    };
  }

  if (/毎週/.test(normalized)) {
    const weekdaySignature = getWeekdaySignature(normalized);
    const administrationsPerCycle = weekdaySignature === 'unspecified' ? 1 : weekdaySignature.length;
    return {
      kind: 'weekly',
      administrationsPerCycle,
      cycleDays: 7,
      signature: `weekly:${administrationsPerCycle}:${weekdaySignature}`
    };
  }

  return undefined;
}

function shouldTreatAsIntermittentInternalMedicine(
  schedule: IntermittentSchedule | undefined,
  item: { drugName?: string; usageStr?: string },
  flags: { isNaiteki: boolean; isTonpuku: boolean; isInjection: boolean }
): boolean {
  if (!schedule || flags.isNaiteki || flags.isTonpuku || flags.isInjection) return false;
  const text = `${item.drugName || ''} ${item.usageStr || ''}`;
  return !/(外用|塗布|貼付|点眼|点鼻|吸入|坐剤|注射)/.test(text);
}

function getWeekdaySignature(text: string): string {
  const weekdays = new Set<string>();
  const weekdayMatches = text.match(/(?:月曜|火曜|水曜|木曜|金曜|土曜|日曜|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日)/g) || [];
  weekdayMatches.forEach((weekday) => weekdays.add(weekday.charAt(0)));

  const bracketPattern = /[（(]\s*([月火水木金土日](?:\s*[・･、,\/／]\s*[月火水木金土日])*)\s*[）)]/g;
  let bracketMatch: RegExpExecArray | null;
  while ((bracketMatch = bracketPattern.exec(text)) !== null) {
    bracketMatch[1].replace(/[月火水木金土日]/g, (weekday) => {
      weekdays.add(weekday);
      return weekday;
    });
  }

  return Array.from(weekdays).sort().join('') || 'unspecified';
}

function normalizeBillingAgentGroupKey(value: string | undefined): string | undefined {
  const normalized = normalizeDigits(String(value || '').replace(/　/g, ' ').trim());
  if (!normalized) return undefined;
  return normalized.replace(/\s+/g, '_').slice(0, 50);
}

function getAutomaticInternalAgentGroupKey(
  normalizedUsage: string,
  schedule: IntermittentSchedule | undefined
): string {
  if (!schedule) return normalizedUsage;
  // 週1回・隔日・服用休薬サイクルは通常の同一服用時点とは別の剤候補として扱う。
  return `intermittent:${schedule.signature}:${normalizedUsage || 'usage'}`;
}

interface BillingAgentGroupItem {
  billingAgentGroupKey?: string;
  sameIngredientFormKey?: string;
  agentGroupKey?: string;
  normalizedUsage?: string;
  drugId?: string;
}

function getPreparationManagementAgentGroupKey(item: BillingAgentGroupItem): string {
  const manualKey = normalizeBillingAgentGroupKey(item.billingAgentGroupKey);
  if (manualKey) return `manual:${manualKey}`;
  if (item.agentGroupKey?.startsWith('special_') || item.agentGroupKey?.startsWith('intermittent:')) {
    return item.agentGroupKey;
  }
  return item.sameIngredientFormKey || item.agentGroupKey || item.normalizedUsage || item.drugId || 'unknown';
}

function getUsageAgentGroupKey(item: BillingAgentGroupItem): string {
  const manualKey = normalizeBillingAgentGroupKey(item.billingAgentGroupKey);
  if (manualKey) return `manual:${manualKey}`;
  return item.agentGroupKey || item.normalizedUsage || item.drugId || 'unknown';
}


export type FormulationType = 'powder' | 'liquid' | 'tablet' | 'ointment' | 'other';

export function getFormulationType(yjCode?: string): FormulationType {
  if (!yjCode || yjCode.length < 8) return 'other';
  // YJ Code 8th character defines the formulation
  const typeChar = yjCode.charAt(7).toUpperCase();

  // 散剤・顆粒剤 (Powders/Granules)
  if (['B', 'C', 'D', 'M'].includes(typeChar)) {
    return 'powder';
  }
  // 液剤 (Liquids)
  if (typeChar === 'A') {
    return 'liquid';
  }
  // 錠剤・カプセル剤 (Tablets/Capsules/Pills)
  if (['F', 'G', 'H'].includes(typeChar)) {
    return 'tablet';
  }
  // 軟・硬膏剤 (Ointments/Creams)
  // For external medicines, often M, N, P, Q, R, S, T, V, W are used.
  // R, Q are often ointments/creams.
  // Let's use common external medicine characters that map to ointment.
  if (['Q', 'R', 'S', 'V', 'W'].includes(typeChar)) {
    return 'ointment';
  }
  return 'other';
}

function isFeeEnabled(code: FeeCode, options?: FeeCalculationOptions): boolean {
  if (options?.drugFeeOnly) {
    return code === 'drug_fee';
  }
  if (!options?.disabledFeeCodes) {
    return true;
  }
  return !options.disabledFeeCodes.includes(code);
}

function getReceiptFeeCode(
  settings: FacilitySettings,
  key: OfficialFeeCodeOverrideKey
): string | undefined {
  const value = settings.officialFeeCodeOverrides?.[key]?.trim();
  return value && /^\d{9}$/.test(value) ? value : undefined;
}

function getBaseFeeOverrideKey(category: FacilitySettings['baseFeeCategory']): OfficialFeeCodeOverrideKey {
  switch (category) {
    case '2':
      return 'base_fee_2';
    case '3_a':
      return 'base_fee_3_a';
    case '3_b':
      return 'base_fee_3_b';
    case '3_ro':
      return 'base_fee_3_ro';
    case 'special':
      return 'base_fee_special';
    case 'special_b':
      return 'base_fee_special_b';
    case '1':
    default:
      return 'base_fee_1';
  }
}

function getIngredientFormKey(item: { yjCode?: string; drugId?: string }): string | undefined {
  if (!item.yjCode || item.yjCode.length < 8) return undefined;
  return `${item.yjCode.substring(0, 7)}_${getFormulationType(item.yjCode)}`;
}


export function calculateDispensingFees(
  settings: FacilitySettings,
  items: ItemWithPrice[],
  _patient: Patient,
  _visitDateStr: string,
  options?: FeeCalculationOptions
): CalculationResultItem[] {
  const results: CalculationResultItem[] = [];
  const currentVisitId = inferCurrentVisitId(items, options);
  const feeOffReasonByKey = new Map(
    evaluateFeeOffReasons(settings, _patient, _visitDateStr, options, currentVisitId)
      .map((reason) => [reason.feeKey, reason])
  );

  // ⚡ Bolt: Precompute derived item properties to avoid redundant string manipulations across multiple loops
  const enrichedItems = new Array(items.length);
  let totalDays = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const usage = item.usage || '';
    const isNaiteki = usage.includes('内滴') || usage.includes('内用滴剤');
    const isTonpuku = usage.includes('頓服');
    const isInjection = usage.includes('注射');
    const normalizedUsg = normalizeUsage(usage);
    const days = item.days || 0;

    if (days > totalDays) {
      totalDays = days;
    }

    // Determine if it's a special route like sublingual or chewable tablet
    const name = item.drugName || (item.doc && item.doc.name) || '';
    const isSpecialRoute = !!(name.includes('舌下錠') || name.includes('チュアブル'));
    const scheduleText = `${usage} ${item.rpComment || ''} ${name}`;
    const intermittentSchedule = parseIntermittentSchedule(scheduleText);
    const isIntermittentInternalMedicine = shouldTreatAsIntermittentInternalMedicine(
      intermittentSchedule,
      { drugName: name, usageStr: usage },
      { isNaiteki, isTonpuku, isInjection }
    );
    const isInternalMedicine = !!(
      ((days && days > 0) || isIntermittentInternalMedicine)
      && !isNaiteki
      && !isTonpuku
      && !isInjection
    );
    const automaticAgentGroupKey = getAutomaticInternalAgentGroupKey(normalizedUsg, intermittentSchedule);

    enrichedItems[i] = {
      ...item,
      drugName: name,
      usageStr: usage,
      isNaiteki,
      isTonpuku,
      isInjection,
      isInternalMedicine,
      isSpecialRoute,
      normalizedUsage: normalizedUsg,
      days,
      intermittentSchedule,
      sameIngredientFormKey: getIngredientFormKey(item),
      claimPreparation: item.claimPreparation !== false,
      claimManagement: item.claimManagement !== false,
      claimDrugFee: item.claimDrugFee !== false,
      agentGroupKey: automaticAgentGroupKey
    };
  }

  // Determine if we need to separate special routes (sublingual/chewable)
  // "わざわざチュアブルとか舌下錠を毎回別剤にしないでください。3剤以上で、必要な時だけ書くようにして"
  // This means we only separate special routes if the number of regular internal medicine agents is >= 3.
  const normalUsageGroups = new Set<string>();
  let hasSpecialRoute = false;

  for (let i = 0; i < enrichedItems.length; i++) {
    const item = enrichedItems[i];
    if (item.isInternalMedicine) {
      if (item.isSpecialRoute) {
        hasSpecialRoute = true;
      }
      if (!item.isSpecialRoute) {
        normalUsageGroups.add(item.normalizedUsage);
      }
    }
  }

  const normalAgentsCount = normalUsageGroups.size;
  // If normal agents >= 3 and we have special route items, we separate them so they can be billed.
  const separateSpecialRoute = normalAgentsCount >= 3 && hasSpecialRoute;

  let includesSpecialRouteAgent = false;

  for (let i = 0; i < enrichedItems.length; i++) {
    const item = enrichedItems[i];
    if (item.isInternalMedicine && item.isSpecialRoute && separateSpecialRoute) {
      // Separate the agent by giving it a unique group key
      item.agentGroupKey = 'special_' + item.normalizedUsage;
      includesSpecialRouteAgent = true;
    }
  }

  // 1. 調剤基本料 (令和8年6月1日施行)
  let baseFee = 0;
  let baseFeeName = '調剤基本料';
  let baseFeeRationale = '';

  switch (settings.baseFeeCategory) {
    case '1':
      baseFee = 47;
      baseFeeName = '調剤基本料1';
      baseFeeRationale = '調剤基本料2・3、特別調剤基本料A・B以外、または医療資源の少ない地域等の基準に該当する薬局';
      break;
    case '2':
      baseFee = 30;
      baseFeeName = '調剤基本料2';
      baseFeeRationale = '処方箋受付回数および特定医療機関への集中率等が調剤基本料2の施設基準に該当する薬局';
      break;
    case '3_a':
      baseFee = 25;
      baseFeeName = '調剤基本料3(イ)';
      baseFeeRationale = '同一グループ薬局の処方箋受付回数等が調剤基本料3(イ)の施設基準に該当する薬局';
      break;
    case '3_b':
      baseFee = 20;
      baseFeeName = '調剤基本料3(ロ)';
      baseFeeRationale = '同一グループ薬局の処方箋受付回数等が調剤基本料3(ロ)の施設基準に該当する薬局';
      break;
    case '3_ro':
      baseFee = 37;
      baseFeeName = '調剤基本料3(ハ)';
      baseFeeRationale = '同一グループ薬局の処方箋受付回数等が調剤基本料3(ハ)の施設基準に該当する薬局';
      break;
    case 'special':
      baseFee = 5;
      baseFeeName = '特別調剤基本料Ａ';
      baseFeeRationale = '医療機関の敷地内等に設置された薬局';
      break;
    case 'special_b':
      baseFee = 3;
      baseFeeName = '特別調剤基本料Ｂ';
      baseFeeRationale = '調剤基本料に係る届出を行っていない等、特別調剤基本料Bの基準に該当する薬局';
      break;
    default:
      baseFee = 47;
      baseFeeName = '調剤基本料1';
      baseFeeRationale = '標準的な基準を満たす薬局';
  }

  if (isFeeEnabled('base_fee', options)) {
    results.push({
      code: 'base_fee',
      feeKey: getBaseFeeOverrideKey(settings.baseFeeCategory),
      receiptFeeCode: getReceiptFeeCode(settings, getBaseFeeOverrideKey(settings.baseFeeCategory)),
      name: baseFeeName,
      points: baseFee,
      rationale: baseFeeRationale
    });
  }

  // 2. 地域支援・医薬品供給対応体制加算
  if (isFeeEnabled('base_additions', options) && settings.regionalSupportAddition !== 'none') {
    let rsPoints = 0;
    let rsName = '';

    switch(settings.regionalSupportAddition) {
      case '1':
        rsPoints = 27;
        rsName = '地域支援・医薬品供給対応体制加算1';
        break;
      case '2':
        rsPoints = 59;
        rsName = '地域支援・医薬品供給対応体制加算2';
        break;
      case '3':
        rsPoints = 67;
        rsName = '地域支援・医薬品供給対応体制加算3';
        break;
      case '4':
        rsPoints = 37;
        rsName = '地域支援・医薬品供給対応体制加算4';
        break;
      case '5':
        rsPoints = 59;
        rsName = '地域支援・医薬品供給対応体制加算5';
        break;
    }

    if (rsPoints > 0) {
      results.push({
        code: 'base_additions',
        feeKey: `regional_support_addition_${settings.regionalSupportAddition}`,
        receiptFeeCode: getReceiptFeeCode(settings, `regional_support_addition_${settings.regionalSupportAddition}` as OfficialFeeCodeOverrideKey),
        name: rsName,
        points: rsPoints,
        rationale: '地域の医薬品供給拠点としての体制を整備し、該当する施設基準を届け出ているため'
      });
    }
  }

  // 3. 電子的調剤情報連携体制整備加算
  if (
    isFeeEnabled('base_additions', options)
    && settings.medicalDxAddition
    && !feeOffReasonByKey.has(MEDICAL_DX_ADDITION_KEY)
  ) {
    results.push({
      code: 'base_additions',
      feeKey: MEDICAL_DX_ADDITION_KEY,
      receiptFeeCode: getReceiptFeeCode(settings, 'medical_dx_addition'),
      name: MEDICAL_DX_ADDITION_NAME,
      points: 8,
      rationale: '医療DX推進に係る体制として施設基準に適合し、月1回の算定対象となるため'
    });
  }

  // 4. 後発医薬品減算
  if (isFeeEnabled('base_additions', options) && settings.genericDispensingReduction) {
    results.push({
      code: 'base_additions',
      feeKey: 'generic_dispensing_reduction',
      receiptFeeCode: getReceiptFeeCode(settings, 'generic_dispensing_reduction'),
      name: '後発医薬品減算',
      points: -5,
      rationale: '後発医薬品の調剤に関する基準に該当し、処方箋受付回数600回/月超の保険薬局であるため'
    });
  }

  // 5. 薬剤調製料 (Drug Preparation Fee)
  let prepPoints = 0;
  let hasInjection = false;
  let hasTonpukuPrep = false;

  // To count agents (剤) for internal and external medicine
  const internalPrepGroups = new Set<string>();
  const externalPrepGroups = new Set<string>();
  const naitekiPrepGroups = new Set<string>();

  for (let i = 0; i < enrichedItems.length; i++) {
    const item = enrichedItems[i];
    if (!item.claimPreparation) continue;

    if (item.isTonpuku) {
      hasTonpukuPrep = true;
    } else if (item.isInjection) {
      hasInjection = true;
    } else if (item.isNaiteki) {
      naitekiPrepGroups.add(item.sameIngredientFormKey || item.normalizedUsage);
    } else if (item.isInternalMedicine) {
      internalPrepGroups.add(getPreparationManagementAgentGroupKey(item));
    } else {
      externalPrepGroups.add(item.sameIngredientFormKey || item.drugId);
    }
  }

  // Calculate internal medicine preparation fee
  // Normal internal medicine is max 3 agents. If special route is separated, it's counted in addition.
  let normalPrepCount = 0;
  let specialPrepCount = 0;
  internalPrepGroups.forEach(key => {
    if (key.startsWith('special_')) {
      specialPrepCount++;
    } else {
      normalPrepCount++;
    }
  });

  const billedNormalPrepCount = Math.min(normalPrepCount, 3);
  const totalInternalPrepAgents = billedNormalPrepCount + specialPrepCount;

  if (totalInternalPrepAgents > 0) {
    prepPoints += totalInternalPrepAgents * 24;
  }

  // Calculate external medicine preparation fee (10 points per agent, max 3)
  const externalPrepAgents = Math.min(externalPrepGroups.size, 3);
  if (externalPrepAgents > 0) {
    prepPoints += externalPrepAgents * 10;
  }

  // Calculate naiteki preparation fee (10 points per agent)
  if (naitekiPrepGroups.size > 0) {
    prepPoints += naitekiPrepGroups.size * 10;
  }

  // Tonpuku preparation fee (21 points per prescription reception)
  if (hasTonpukuPrep) {
    prepPoints += 21;
  }

  // Injection preparation fee (26 points per prescription)
  if (hasInjection) {
    prepPoints += 26;
  }

  if (prepPoints > 0 && isFeeEnabled('drug_preparation', options)) {
    results.push({
      code: 'drug_preparation',
      receiptFeeCode: getReceiptFeeCode(settings, 'drug_preparation'),
      name: '薬剤調製料',
      points: prepPoints,
      rationale: '調剤業務における薬剤の調製・取り揃え、最終監査等の対物業務の評価として算定'
    });
  }

  // 6. 調剤管理料 (Dispensing Management Fee)
  if (items.length > 0 && isFeeEnabled('dispensing_management', options)) {
    // 令和8年基準を前提にした計算補助。公式資料との最終確認は別途必要。
    // 調剤管理料は対人業務の評価。
    // 内服薬（調剤管理料１）: 1剤につき算定 (最大3剤まで)
    // 28日分以上: 60点, 27日分以下: 10点
    // 内服薬以外（調剤管理料２）: 10点 (併算定不可)

    let hasInternalMedicine = false;
    let hasOtherMedicine = false;
    // Map to keep track of max days per internal medicine agent
    const agentDaysMap: Record<string, number> = {};

    for (let i = 0; i < enrichedItems.length; i++) {
      const item = enrichedItems[i];
      if (!item.claimManagement) continue;

      if (item.isInternalMedicine) {
        hasInternalMedicine = true;
        const key = getPreparationManagementAgentGroupKey(item);
        if (!agentDaysMap[key] || item.days > agentDaysMap[key]) {
          agentDaysMap[key] = item.days;
        }
      } else {
        hasOtherMedicine = true;
      }
    }

    if (hasInternalMedicine) {
      // 調剤管理料１
      const agentPointsList: number[] = [];

      // ⚡ Bolt: Use for...in loop to iterate over objects instead of Object.keys() to prevent unnecessary array allocations
      for (const usageKey in agentDaysMap) {
        if (Object.prototype.hasOwnProperty.call(agentDaysMap, usageKey)) {
          const days = agentDaysMap[usageKey];
          let pts = 0;
          if (days >= 28) pts = 60;
          else pts = 10;
          agentPointsList.push(pts);
        }
      }

      // Calculate normal and special points separately
      const normalPointsList: number[] = [];
      const specialPointsList: number[] = [];

      for (const usageKey in agentDaysMap) {
        if (Object.prototype.hasOwnProperty.call(agentDaysMap, usageKey)) {
          const days = agentDaysMap[usageKey];
          let pts = days >= 28 ? 60 : 10;
          if (usageKey.startsWith('special_')) {
            specialPointsList.push(pts);
          } else {
            normalPointsList.push(pts);
          }
        }
      }

      normalPointsList.sort((a, b) => b - a);
      let totalMgmtPoints = 0;
      for (let i = 0; i < Math.min(normalPointsList.length, 3); i++) {
        totalMgmtPoints += normalPointsList[i];
      }
      for (let i = 0; i < specialPointsList.length; i++) {
        totalMgmtPoints += specialPointsList[i];
      }

      const receiptRemarks = includesSpecialRouteAgent
          ? [{ code: '820100369', text: '内服錠、チュアブル錠及び舌下錠等のように服用方法が異なる場合' }]
          : undefined;

      results.push({
        code: 'dispensing_management',
        receiptFeeCode: getReceiptFeeCode(settings, 'dispensing_management_internal'),
        name: '調剤管理料',
        points: totalMgmtPoints,
        rationale: `内服薬の処方に対する薬学的分析と調剤設計の評価（1剤につき算定、最大3剤まで合算）。` + (includesSpecialRouteAgent ? '※投与経路の異なる内服薬は別剤として加算。' : ''),
        receiptRemarks
      });
    } else if (hasOtherMedicine) {
      // 調剤管理料２
      results.push({
        code: 'dispensing_management',
        receiptFeeCode: getReceiptFeeCode(settings, 'dispensing_management_other'),
        name: '調剤管理料',
        points: 10,
        rationale: `内服薬以外の処方のため（調剤管理料2）。薬剤の適正使用に向けた処方内容の薬学的分析と調剤設計の評価。`
      });
    }
  }

  // 7. 服薬管理指導料 (Medication Management and Guidance Fee)
  if (items.length > 0 && isFeeEnabled('medication_guidance', options)) {
    // 原則として服薬指導を行った場合の基本点数を算定
    let hasGuidanceTarget = false;
    for (let i = 0; i < enrichedItems.length; i++) {
      if (enrichedItems[i].claimManagement) {
        hasGuidanceTarget = true;
        break;
      }
    }

    if (hasGuidanceTarget) {
      results.push({
        code: 'medication_guidance',
        receiptFeeCode: getReceiptFeeCode(settings, 'medication_guidance_1'),
        name: '服薬管理指導料1',
        points: 45,
        rationale: '患者の服薬状況や副作用等を確認し、必要な薬学的管理と服薬指導を行ったため'
      });
    }

    // 7.5 特定薬剤管理指導加算 (Special Medication Management and Guidance Fee / Tokkan)
    let tokkanType = 'none';
    if (hasGuidanceTarget && isFeeEnabled('special_management', options)) {
      for (let i = 0; i < enrichedItems.length; i++) {
        const item = enrichedItems[i];
        if (!item.claimManagement) continue;
        if (item.tokkanType === '1' || item.tokkanType === '3_i') {
          // We take the highest if multiple exist (1 is 10 points, 3_i is 5 points)
          if (item.tokkanType === '1') {
            tokkanType = '1';
            break; // Max points found
          }
          tokkanType = '3_i';
        }
      }
    }

    if (tokkanType === '1') {
      results.push({
        code: 'special_management',
        receiptFeeCode: getReceiptFeeCode(settings, 'special_management_1'),
        name: '特定薬剤管理指導加算1',
        points: 10,
        rationale: '特に安全管理が必要な医薬品が処方されており、患者に適切な指導を行ったため'
      });
    } else if (tokkanType === '3_i') {
      results.push({
        code: 'special_management',
        receiptFeeCode: getReceiptFeeCode(settings, 'special_management_3_i'),
        name: '特定薬剤管理指導加算3(イ)',
        points: 5,
        rationale: '特に安全管理が必要な医薬品に関して、必要な情報提供と服薬指導を行ったため'
      });
    }
  }

  // 8. 外来服薬支援料2 (旧：一包化加算)
  // 要件: 2剤以上の内服薬、または1剤で3種類以上の内服薬の一包化
  if (items.length > 0 && isFeeEnabled('ippoka', options)) {
    let hasIppoka = false;
    let ippokaMaxDays = 0;

    // Check if conditions for 外来服薬支援料2 are met
    // 1. Group internal medicines by usage (agents/剤) to count agents and types (種類) per agent.
    // We only consider items that have isIppoka explicitly true.
    const ippokaInternalGroups: Record<string, Set<string>> = {};
    let totalIppokaInternalAgents = 0;

    for (let i = 0; i < enrichedItems.length; i++) {
      const item = enrichedItems[i];
      if (!item.isIppoka) continue;
      if (!item.claimPreparation || !item.claimManagement) continue;

      if (item.isInternalMedicine) {
        hasIppoka = true;
        if (item.days > ippokaMaxDays) {
          ippokaMaxDays = item.days;
        }

        const key = getUsageAgentGroupKey(item);
        if (!ippokaInternalGroups[key]) {
          ippokaInternalGroups[key] = new Set<string>();
          totalIppokaInternalAgents++;
        }
        // Count unique drug IDs to check for "3 types in 1 agent"
        ippokaInternalGroups[key].add(item.drugId);
      }
    }

    if (hasIppoka && totalIppokaInternalAgents > 0) {
      let isEligible = false;
      if (totalIppokaInternalAgents >= 2) {
        // 2剤以上
        isEligible = true;
      } else if (totalIppokaInternalAgents === 1) {
        // 1剤の場合は、その剤に3種類以上含まれているか
        // ⚡ Bolt: Use for...in to get the first property instead of allocating an array with Object.keys()
        for (const agentKey in ippokaInternalGroups) {
          if (Object.prototype.hasOwnProperty.call(ippokaInternalGroups, agentKey)) {
            if (ippokaInternalGroups[agentKey].size >= 3) {
              isEligible = true;
            }
            break;
          }
        }
      }

      if (isEligible) {
        let ippokaPoints = 0;
        if (ippokaMaxDays <= 42) {
          ippokaPoints = Math.ceil(ippokaMaxDays / 7) * 34;
        } else {
          ippokaPoints = 240;
        }

        results.push({
          code: 'ippoka',
          receiptFeeCode: getReceiptFeeCode(settings, 'outpatient_medication_support_2'),
          name: '外来服薬支援料2',
          points: ippokaPoints,
          rationale: '多種類の薬剤が処方されている等の理由により、服薬管理に係る支援の必要性があり、一包化および必要な服薬指導を行ったため'
        });
      }
    }
  }


  // 8.5 計量混合調剤加算 / 自家製剤加算 (Measurement Mixing Addition / In-house Preparation Addition)
  // Group internal/tonpuku medicines by RP (usage) and external by RP to determine if we should add mixing points.
  if (enrichedItems.length > 0 && isFeeEnabled('mixing', options)) {
    const rpGroups: Record<string, any[]> = {};
    for (let i = 0; i < enrichedItems.length; i++) {
      const item = enrichedItems[i];
      if (!item.claimPreparation) continue;
      let usageKey = item.usageStr ? getUsageAgentGroupKey(item) : 'unknown';
      if (item.agentGroupKey && item.agentGroupKey.startsWith('special_')) {
        usageKey = item.agentGroupKey;
      }
      if (!rpGroups[usageKey]) rpGroups[usageKey] = [];
      rpGroups[usageKey].push(item);
    }

    // ⚡ Bolt: Use for...in loop to iterate over objects instead of Object.keys() to prevent unnecessary array allocations
    for (const rpKey in rpGroups) {
      if (!Object.prototype.hasOwnProperty.call(rpGroups, rpKey)) continue;

      const rpItems = rpGroups[rpKey];

      let hasCrushedItem = false;
      for (let j = 0; j < rpItems.length; j++) {
        if (rpItems[j].isCrushed) {
          hasCrushedItem = true;
          break;
        }
      }

      if (rpItems.length < 2 && !hasCrushedItem) continue; // Needs at least 2 items to mix, OR 1 item if it is crushed

      let powderCount = 0;
      let liquidCount = 0;
      let ointmentCount = 0;
      let tabletCount = 0;

      for (let j = 0; j < rpItems.length; j++) {
        const form = getFormulationType(rpItems[j].yjCode);
        if (form === 'powder') powderCount++;
        else if (form === 'liquid') liquidCount++;
        else if (form === 'ointment') ointmentCount++;
        else if (form === 'tablet') tabletCount++;
      }

      // 1. Calculate potential Mixed Points
      let mixedPoints = 0;
      let mixedName = '';

      if (ointmentCount >= 2) {
        mixedPoints = 80;
        mixedName = '計量混合調剤加算(軟・硬膏剤)';
      } else if (powderCount >= 2) {
        mixedPoints = 45;
        mixedName = '計量混合調剤加算(散剤・顆粒剤)';
      } else if (liquidCount >= 2) {
        mixedPoints = 35;
        mixedName = '計量混合調剤加算(液剤)';
      }

      // 2. Calculate potential In-house Prep Points
      let prepPoints = 0;
      let crushedMaxDays = 0;

      for (let j = 0; j < rpItems.length; j++) {
        if (rpItems[j].isCrushed) {
          const days = rpItems[j].days ?? 0;
          if (days > crushedMaxDays) {
            crushedMaxDays = days;
          }
        }
      }

      if (hasCrushedItem) {
        let maxDays = crushedMaxDays;

        if (maxDays > 0) {
          prepPoints = Math.ceil(maxDays / 7) * 20;
        } else {
          prepPoints = 90;
        }
      }

      // 3. Resolve overlap: cannot claim both for the same agent.
      // Rule: Take the higher points.
      if (mixedPoints > 0 || prepPoints > 0) {
        if (prepPoints > mixedPoints) {
          results.push({
            code: 'mixing',
            receiptFeeCode: getReceiptFeeCode(settings, 'in_house_preparation'),
            name: '自家製剤加算',
            points: prepPoints,
            rationale: '市販されている医薬品の剤形では対応できず、医師の指示に基づき調剤上の特殊な技術工夫を行ったため（自家製剤加算）'
          });
        } else {
          const mixingCodeKey: OfficialFeeCodeOverrideKey =
            ointmentCount >= 2
              ? 'measurement_mixing_ointment'
              : powderCount >= 2
                ? 'measurement_mixing_powder'
                : 'measurement_mixing_liquid';
          results.push({
            code: 'mixing',
            receiptFeeCode: getReceiptFeeCode(settings, mixingCodeKey),
            name: mixedName,
            points: mixedPoints,
            rationale: '2種類以上の医薬品を計量し、かつ混合して調剤したため（計量混合調剤加算）'
          });
        }
      }
    }
  }

  // 9. 薬剤料 (Drug Fee)

  let totalDrugPoints = 0;

  // Group items to calculate correct Goshagochonyu
  const internalMedicineGroups: Record<string, (typeof enrichedItems[0])[]> = {};
  const externalMedicineGroups: Record<string, { totalAmountPrice: number }> = {};

  // ⚡ Bolt: Replace for...of with classic for loop to avoid iterator allocation
  for (let i = 0; i < enrichedItems.length; i++) {
    const item = enrichedItems[i];
    if (!item.claimDrugFee) continue;
    if (!item.drugPrice) continue;

    if (item.isInternalMedicine) {
      // For internal medicine, items with the same group belong to the same agent (剤),
      // even if their days differ. We must group them by group key to calculate overlapping days correctly.
      const key = getUsageAgentGroupKey(item);
      if (!internalMedicineGroups[key]) {
        internalMedicineGroups[key] = [];
      }
      internalMedicineGroups[key].push(item);
    } else {
      // Tonpuku, External Medicine, and Naiteki
      // For external/tonpuku/naiteki, amount is the total amount (total doses or total quantity).
      // External medicine is 1調剤 per drugId. Tonpuku is grouped by usage AND doses. Naiteki is grouped by usage.
      let groupKey = `external_${item.drugId}`;
      if (item.isTonpuku) groupKey = `tonpuku_${item.normalizedUsage}_${item.amount}`;
      else if (item.isNaiteki) groupKey = `naiteki_${item.normalizedUsage}`;
      if (!externalMedicineGroups[groupKey]) {
        externalMedicineGroups[groupKey] = { totalAmountPrice: 0 };
      }
      externalMedicineGroups[groupKey].totalAmountPrice += item.drugPrice * item.amount;
    }
  }

  // Calculate points for internal medicine groups by segmenting overlapping days
  let internalDrugPoints = 0;

  // ⚡ Bolt: Use for...in loop to iterate over objects instead of Object.keys() to prevent unnecessary array allocations
  for (const groupKey in internalMedicineGroups) {
    if (!Object.prototype.hasOwnProperty.call(internalMedicineGroups, groupKey)) continue;

    const agentItems = internalMedicineGroups[groupKey];

    // Find unique days boundaries
    const uniqueDays = new Set<number>();
    for (let j = 0; j < agentItems.length; j++) {
      uniqueDays.add(agentItems[j].days);
    }

    const boundaries = Array.from(uniqueDays).sort((a, b) => a - b);
    let previousDay = 0;

    for (let j = 0; j < boundaries.length; j++) {
      const currentDay = boundaries[j];
      const intervalDays = currentDay - previousDay;
      if (intervalDays <= 0) continue;

      let segmentDailyPrice = 0;
      for (let k = 0; k < agentItems.length; k++) {
        if (agentItems[k].days >= currentDay) {
          // amount for internal medicine is daily amount
          segmentDailyPrice += agentItems[k].drugPrice * agentItems[k].amount;
        }
      }

      // Use exact integer math to avoid floating point precision issues (e.g. 5.6 * 3 = 16.799999999999997)
      const exactTotalInt = Math.round(segmentDailyPrice * 100);
      let dailyPoints = 0;

      if (exactTotalInt <= 1500) {
        dailyPoints = 1;
      } else {
        const integerPart = Math.floor(exactTotalInt / 1000);
        const remainder = exactTotalInt % 1000;
        if (remainder > 500) {
          dailyPoints = integerPart + 1;
        } else {
          dailyPoints = integerPart;
        }
      }
      internalDrugPoints += dailyPoints * intervalDays;
      previousDay = currentDay;
    }
  }

  // Calculate points for external/tonpuku medicine groups
  let externalDrugPoints = 0;

  // ⚡ Bolt: Use for...in loop to iterate over objects instead of Object.keys() to prevent unnecessary array allocations
  for (const groupKey in externalMedicineGroups) {
    if (!Object.prototype.hasOwnProperty.call(externalMedicineGroups, groupKey)) continue;

    const group = externalMedicineGroups[groupKey];
    // Use exact integer math to avoid floating point precision issues
    const exactTotalInt = Math.round(group.totalAmountPrice * 100);
    let points = 0;

    if (exactTotalInt <= 1500) {
      points = 1;
    } else {
      const integerPart = Math.floor(exactTotalInt / 1000);
      const remainder = exactTotalInt % 1000;
      if (remainder > 500) {
        points = integerPart + 1;
      } else {
        points = integerPart;
      }
    }
    externalDrugPoints += points;
  }

  // Count internal medicine types with 205 yen rule
  let internalMedicineTypeCount = 0;

  // ⚡ Bolt: Use for...in loop to iterate over objects instead of Object.keys() to prevent unnecessary array allocations
  for (const groupKey in internalMedicineGroups) {
    if (!Object.prototype.hasOwnProperty.call(internalMedicineGroups, groupKey)) continue;

    const agentItems = internalMedicineGroups[groupKey];
    let agentDailyPrice = 0;
    const uniqueDrugIds = new Set<string>();

    for (let j = 0; j < agentItems.length; j++) {
      const item = agentItems[j];
      if (!item.drugPrice) continue;
      agentDailyPrice += item.drugPrice * item.amount;
      uniqueDrugIds.add(item.drugId);
    }

    // 205円ルール：1剤の1日分の薬価が205円以下の場合は、その剤に含まれるすべての内服薬をまとめて「1種類」としてカウントする
    // Use exact integer math to avoid floating point precision issues (e.g. 28.52 * 5 + 6.24 * 10 = 205.00000000000003)
    if (Math.round(agentDailyPrice * 100) <= 20500) {
      internalMedicineTypeCount += 1;
    } else {
      internalMedicineTypeCount += uniqueDrugIds.size;
    }
  }

  // 1. Polypharmacy Reduction in Special Base Fee Category: 90% reduction for internal medicine if >= 7 types of internal meds AND baseFeeCategory is 'special' (特別調剤基本料A)
  let appliedPolypharmacyReduction = false;
  if ((settings.baseFeeCategory === 'special' || settings.baseFeeCategory === 'special_b') && internalMedicineTypeCount >= 7 && internalDrugPoints > 0) {
    internalDrugPoints = Math.round(internalDrugPoints * 0.9);
    appliedPolypharmacyReduction = true;
  }

  totalDrugPoints = internalDrugPoints + externalDrugPoints;

  if (totalDrugPoints > 0 && isFeeEnabled('drug_fee', options)) {
    let rationaleText = '処方された医薬品の薬価に基づく薬剤料（同一剤での合算・五捨五超入による端数処理）';
    if (appliedPolypharmacyReduction) {
        rationaleText = '処方された医薬品の薬価に基づく薬剤料（特別調剤基本料Ａかつ7種類以上の内服薬による100分の90減算）';
    }

    results.push({
      code: 'drug_fee',
      name: '薬剤料',
      points: totalDrugPoints,
      rationale: rationaleText
    });
  }

  return results;
}

export function getTotalPoints(results: CalculationResultItem[]): number {
  // ⚡ Bolt: Replace reduce with manual for loop to prevent closure allocations
  let sum = 0;
  for (let i = 0; i < results.length; i++) {
    sum += results[i].points;
  }
  return sum;
}
