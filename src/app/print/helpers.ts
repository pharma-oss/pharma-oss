import React from 'react';
import type { PrescriptionItem } from '@/db/types';
import { isDailyAmountItem, type AmountSemanticsItem } from '@/lib/amount_semantics';
import { getFormulationType, type FeeCode, type FormulationType } from '@/lib/calculator';
import { validateDispensingUkeRecords } from '@/lib/receipt/dispensing_uke_validation';
import type { PrescriptionInputAuditIssue } from '@/lib/prescription_input_audit';
import type { ClaimValidationIssue } from '@/lib/claim_validation';
import { PATIENT_IDENTITY_MARKS, type PatientIdentityMark } from './types';

export function stableHashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function formatUkeValidationIssues(issues: ReturnType<typeof validateDispensingUkeRecords>): string {
  return issues
    .slice(0, 8)
    .map((issue) => `・${issue.title}: ${issue.message}`)
    .join('\n');
}

export function formatClaimValidationIssues(issues: ClaimValidationIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `・${issue.title}: ${issue.message}`)
    .join('\n');
}

export function formatPrescriptionAuditIssues(issues: PrescriptionInputAuditIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `・${issue.title}: ${issue.message}`)
    .join('\n');
}

export function toDateOnly(value: unknown): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function calculatePatientAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return Number.isFinite(age) ? age : undefined;
}

export function getPatientIdentityMark(patientIdOrId: string, visitId: string): PatientIdentityMark {
  const hash = stableHashText(`${patientIdOrId || ''}:${visitId}`);
  return PATIENT_IDENTITY_MARKS[hash % PATIENT_IDENTITY_MARKS.length];
}

export function getDisplayDrugName(item: { dispensedDrug?: string; drugName?: string; drugId?: string }): string {
  return item.dispensedDrug || item.drugName || item.drugId || '';
}

export function getPrescribedDrugName(item: { drugName?: string; drugId?: string }): string {
  return item.drugName || item.drugId || '';
}

export function getRecordDrugName(item: { dispensedDrug?: string; drugName?: string; drugId?: string }): string {
  const dispensedDrug = String(item.dispensedDrug || '').trim();
  if (dispensedDrug && !['変更なし', '変更調剤なし'].includes(dispensedDrug)) {
    return dispensedDrug;
  }
  return getPrescribedDrugName(item);
}

export function isLiquidItem(item: { usage?: string; dispensedDrug?: string; drugName?: string; drugId?: string }): boolean {
  const usage = String(item.usage || '');
  const drugName = getDisplayDrugName(item);
  return /シロップ|ドライシロップ|内用液|液剤|水剤/.test(drugName) || /内滴|水剤|内用液/.test(usage);
}

export function isOintmentItem(item: { usage?: string; dispensedDrug?: string; drugName?: string; drugId?: string }): boolean {
  const usage = String(item.usage || '');
  const drugName = getDisplayDrugName(item);
  return /軟膏|クリーム|ローション|ゲル|テープ|パップ|外用/.test(drugName) || /塗布|貼付|外用/.test(usage);
}

export function getRecordNotes(
  item: {
    dispensedDrug?: string;
    drugName?: string;
    changeReason?: string;
    isIppoka?: boolean;
    isCrushed?: boolean;
    rpComment?: string;
  },
  isFirstItem?: boolean
): string {
  const notes: string[] = [];
  if (item.dispensedDrug && item.dispensedDrug !== item.drugName) {
    notes.push(`後発変更: ${item.dispensedDrug}`);
  }
  if (item.changeReason) {
    notes.push(`変更理由: ${item.changeReason}`);
  }
  if (item.isIppoka) {
    notes.push('一包化');
  }
  if (item.isCrushed) {
    notes.push('粉砕');
  }
  if (item.rpComment) {
    notes.push(item.rpComment);
  }
  return notes.join(' / ');
}

export type AmountTextSourceItem = Partial<Pick<
  PrescriptionItem,
  'amount' | 'unitText' | 'electronicUnitConversion' | 'dosageCategory' | 'days' | 'usage'
>>;

export type PickingEvidenceSourceItem = Partial<Pick<
  PrescriptionItem,
  'isPicked' | 'pickedGs1Code' | 'pickedGtin' | 'pickedLotNumber'
>>;

export interface AmountPresentationPair {
  amount: number;
  unit: string;
}

export function getAmountPresentationPair(item: AmountTextSourceItem): AmountPresentationPair | null {
  const conv = item.electronicUnitConversion;
  if (conv?.prescribedUnitText?.trim() && conv.prescribedAmount != null && conv.prescribedAmount.trim() !== '') {
    const parsedAmount = Number(conv.prescribedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return null;
    }
    return {
      amount: parsedAmount,
      unit: conv.prescribedUnitText.trim()
    };
  }

  if (item.amount == null || !Number.isFinite(item.amount) || item.amount <= 0) {
    return null;
  }
  return {
    amount: item.amount,
    unit: item.unitText?.trim() || ''
  };
}

export function getAmountLabel(item: AmountSemanticsItem): '1日量' | '全量' {
  return isDailyAmountItem(item) ? '1日量' : '全量';
}

export function getAmountText(item: AmountTextSourceItem): string {
  const pair = getAmountPresentationPair(item);
  if (!pair) {
    return '-';
  }
  return pair.unit ? `${pair.amount} ${pair.unit}` : `${pair.amount}`;
}

export function getTotalAmountText(item: AmountTextSourceItem): string {
  const pair = getAmountPresentationPair(item);
  if (!pair) {
    return '-';
  }

  if (isDailyAmountItem(item)) {
    const days = typeof item.days === 'number' ? item.days : 0;
    const total = Math.round(pair.amount * days * 1000) / 1000;
    return pair.unit ? `${total} ${pair.unit}` : `${total}`;
  }

  // 全量アイテム（外用・頓服・注射・内滴、または days <= 0）は amount がすでに総量
  return pair.unit ? `${pair.amount} ${pair.unit}` : `${pair.amount}`;
}

/**
 * 水剤ラベルの全量欄に併記する「調剤単位(薬価単位)での実量」。
 * 全量欄は投薬瓶の中身そのものを指すため、処方単位(例: 缶)だけでは患者が計量できない。
 * 換算がない明細は表示ペア = 薬価単位ペアなので併記不要 = 空文字を返す。
 */
export function getDispensingTotalAmountText(item: AmountTextSourceItem): string {
  const conv = item.electronicUnitConversion;
  if (!conv?.prescribedUnitText?.trim()) {
    return '';
  }
  if (item.amount == null || !Number.isFinite(item.amount) || item.amount <= 0) {
    return '';
  }
  const unit = item.unitText?.trim() || '';
  // isDailyAmountItem が true のときは days > 0 が保証される (days <= 0 なら false を返す)
  const days = typeof item.days === 'number' ? item.days : 0;
  const total = isDailyAmountItem(item)
    ? Math.round(item.amount * days * 1000) / 1000
    : item.amount;
  return unit ? `${total} ${unit}` : `${total}`;
}

export function getPickingEvidence(item: PickingEvidenceSourceItem): string {
  const hasGs1 = Boolean(item.pickedGs1Code || item.pickedGtin);
  if (hasGs1) {
    if (item.pickedLotNumber) {
      return `GS1照合済み (Lot ${item.pickedLotNumber})`;
    }
    if (item.pickedGtin) {
      return `GS1照合済み (${item.pickedGtin})`;
    }
    return 'GS1照合済み';
  }
  if (item.isPicked) {
    return 'ピッキング済み（GS1照合なし）';
  }
  return '未照合';
}

export function getBagDaysText(items: { days?: number }[]): string {
  const daysList = items.map((i) => i.days).filter((d): d is number => typeof d === 'number' && d > 0);
  if (daysList.length === 0) return '';
  const maxDays = Math.max(...daysList);
  return `${maxDays}日分`;
}

export function getBagRpComments(items: { rpComment?: string }[]): string[] {
  const comments = items.map((i) => i.rpComment).filter(Boolean) as string[];
  return Array.from(new Set(comments));
}

export function getFeeSectionLabel(code?: FeeCode): string {
  switch (code) {
    case 'base_fee':
    case 'base_additions':
      return '基本料・加算';
    case 'drug_preparation':
      return '調製料';
    case 'dispensing_management':
      return '調剤管理料';
    case 'medication_guidance':
      return '服薬指導料';
    case 'special_management':
      return '特定薬剤管理指導料';
    case 'ippoka':
      return '外来服薬支援料';
    case 'mixing':
      return '自家製剤・計量混合';
    case 'drug_fee':
      return '薬剤料';
    default:
      return 'その他';
  }
}

export function getFormulationLabel(item: { yjCode?: string; usage?: string; dispensedDrug?: string; drugName?: string; drugId?: string }): string {
  if (isLiquidItem(item)) return '内用液剤';
  if (isOintmentItem(item)) return '外用塗布剤';
  const type: FormulationType = getFormulationType(item.yjCode);
  switch (type) {
    case 'powder': return '散剤・顆粒剤';
    case 'liquid': return '内用液剤';
    case 'ointment': return '外用塗布剤';
    case 'tablet': return '内用錠剤';
    default: return '内用薬';
  }
}

export function getDrugShapeClass(item: { isHighRisk?: boolean; yjCode?: string; usage?: string; dispensedDrug?: string; drugName?: string; drugId?: string }): string {
  if (item.isHighRisk) return 'high-risk';
  if (isLiquidItem(item)) return 'liquid';
  if (isOintmentItem(item)) return 'ointment';
  const form = getFormulationLabel(item);
  if (form.includes('散') || form.includes('顆粒') || form.includes('粉')) return 'powder';
  return 'tablet';
}

export function getTimingBadges(usage?: string): string[] {
  if (!usage) return [];
  const badges: string[] = [];
  if (usage.includes('朝')) badges.push('朝');
  if (usage.includes('昼')) badges.push('昼');
  if (usage.includes('夕') || usage.includes('晩')) badges.push('夕');
  if (usage.includes('寝') || usage.includes('就寝')) badges.push('就寝前');
  if (usage.includes('食直前')) badges.push('食直前');
  else if (usage.includes('食前')) badges.push('食前');
  else if (usage.includes('食後')) badges.push('食後');
  else if (usage.includes('食間')) badges.push('食間');
  if (usage.includes('頓服') || usage.includes('痛むとき') || usage.includes('発熱時')) badges.push('頓服');
  return badges;
}

export function getMedicationFlags(item: { isHighRisk?: boolean; isGeneric?: boolean; isIppoka?: boolean; isCrushed?: boolean }): string[] {
  const flags: string[] = [];
  if (item.isHighRisk) flags.push('ハイリスク薬');
  if (item.isGeneric) flags.push('後発医薬品');
  if (item.isIppoka) flags.push('一包化対象');
  if (item.isCrushed) flags.push('粉砕対象');
  return flags;
}

export function getBagKindLabel(usage: string): string {
  if (/外用|塗布|貼付|点眼|点鼻|吸入/.test(usage)) return '外用薬';
  if (/頓服|痛むとき|発熱時|発作時/.test(usage)) return '頓服薬';
  return '内服薬';
}

export function getElectronicPrescriptionDocumentKinds(electronicPrescription: any): any[] {
  return electronicPrescription?.linkedPrescriptions?.length
    ? electronicPrescription.linkedPrescriptions.map((link: any) => link.documentKind)
    : [electronicPrescription?.documentKind || 'prescription'];
}

export function getClaimItemFlagValue(item: object, field: string): boolean {
  if (field === 'isDiagnosticTest') {
    return !!(item as { isDiagnosticTest?: unknown }).isDiagnosticTest;
  }
  return (item as Record<string, unknown>)[field] !== false;
}
