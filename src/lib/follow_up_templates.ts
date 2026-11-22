import type { SoapEntry, Visit } from '../db/types.ts';
import { patchWithAuditRollback } from './doc_audit_write.ts';
import { toLocalDateKey } from './local_date.ts';
import { isGuidanceEntryType, type GuidanceEntryType } from './medication_guidance.ts';
import type { PatchableDocument } from './rxdb_restore.ts';

export const FOLLOW_UP_TEMPLATE_CATEGORIES = [
  'leftover',
  'adverse_event',
  'adherence',
  'next_check'
] as const;

export type FollowUpTemplateCategory = typeof FOLLOW_UP_TEMPLATE_CATEGORIES[number];

export const FOLLOW_UP_TEMPLATE_CATEGORY_LABELS: Record<FollowUpTemplateCategory, string> = {
  leftover: '残薬確認',
  adverse_event: '副作用確認',
  adherence: 'アドヒアランス',
  next_check: '次回確認事項'
};

export const FOLLOW_UP_REASON_FLAG_OPTIONS = [
  '残薬確認',
  '副作用確認',
  'アドヒアランス確認',
  '継続フォロー'
] as const;

export type FollowUpContactMethod = NonNullable<NonNullable<Visit['followUp']>['contactMethod']>;

export const FOLLOW_UP_CONTACT_METHOD_LABELS: Record<FollowUpContactMethod, string> = {
  phone: '電話',
  sms: 'SMS',
  visit: '来局時',
  other: 'その他'
};

export interface FollowUpTemplatePreset {
  category: FollowUpTemplateCategory;
  label: string;
  type: GuidanceEntryType;
  text: string;
  defaultReasonFlag: string;
  defaultNextAction: string;
}

export function buildDrugFollowUpTemplatePresets(drugName?: string | null): FollowUpTemplatePreset[] {
  const trimmedName = (drugName || '').trim();
  const target = trimmedName || '処方薬';

  return [
    {
      category: 'leftover',
      label: FOLLOW_UP_TEMPLATE_CATEGORY_LABELS.leftover,
      type: 'S',
      text: `残薬確認: ${target}の飲み忘れ・残薬数を確認し、必要に応じて残薬調整や服用タイミングの見直しを検討する。`,
      defaultReasonFlag: '残薬確認',
      defaultNextAction: `${target}の残薬数と飲み忘れ状況を確認する`
    },
    {
      category: 'adverse_event',
      label: FOLLOW_UP_TEMPLATE_CATEGORY_LABELS.adverse_event,
      type: 'A',
      text: `副作用確認: ${target}の服用後に体調変化や初期副作用兆候がないか確認し、症状出現時の受診・相談目安を説明する。`,
      defaultReasonFlag: '副作用確認',
      defaultNextAction: `${target}服用後の副作用兆候・体調変化の有無を確認する`
    },
    {
      category: 'adherence',
      label: FOLLOW_UP_TEMPLATE_CATEGORY_LABELS.adherence,
      type: 'O',
      text: `アドヒアランス確認: ${target}の服用タイミング・自己中断の有無・生活習慣との適合状況を確認する。`,
      defaultReasonFlag: 'アドヒアランス確認',
      defaultNextAction: `${target}の服薬アドヒアランス・継続状況を確認する`
    },
    {
      category: 'next_check',
      label: FOLLOW_UP_TEMPLATE_CATEGORY_LABELS.next_check,
      type: 'P',
      text: `次回確認事項: 次回来局またはフォロー連絡時に、${target}の継続服用状況・残薬・体調変化を再確認する。`,
      defaultReasonFlag: '継続フォロー',
      defaultNextAction: `次回来局・連絡時に${target}の継続状況と体調変化を再確認する`
    }
  ];
}

export interface GuidanceSoapInsertDetail {
  type: GuidanceEntryType;
  text: string;
  origin: 'ai_draft';
  aiStatus: 'unconfirmed';
  aiDraftId: string;
}

function sanitizeDraftToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'template';
}

/**
 * 薬剤別指導テンプレート・フォロー定型文を SOAP へ挿入する際の詳細ペイロードを生成する。
 * 金科玉条 第一条に従い、テンプレート由来の文言も必ず `origin: 'ai_draft'` / `aiStatus: 'unconfirmed'` として挿入し、
 * 薬剤師が確認・承認するまで確定記録やトレーシングレポートへ流出させない。
 */
export function buildGuidanceSoapInsertDetail(params: {
  type: string;
  text: string;
  sourceKey?: string;
}): GuidanceSoapInsertDetail {
  const normalizedType: GuidanceEntryType = isGuidanceEntryType(params.type) ? params.type : 'P';
  const sourceToken = sanitizeDraftToken(params.sourceKey || 'medication-guidance');
  return {
    type: normalizedType,
    text: params.text,
    origin: 'ai_draft',
    aiStatus: 'unconfirmed',
    aiDraftId: `guidance-${normalizedType.toLowerCase()}-${sourceToken}`
  };
}

const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeFollowUpDueDate(
  dueDate: string | undefined | null,
  basisDate: Date = new Date()
): string {
  const trimmed = (dueDate || '').trim();
  if (ISO_DATE_ONLY_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const fallback = new Date(basisDate.getTime());
  fallback.setDate(fallback.getDate() + 7);
  return toLocalDateKey(fallback);
}

export interface BuildEmrFollowUpSchedulePatchInput {
  existingFollowUp?: Visit['followUp'];
  reasonFlags: readonly string[];
  nextAction: string;
  dueDate?: string;
  contactMethod?: FollowUpContactMethod;
  summary?: string;
  nowIso?: string;
  basisDate?: Date;
}

export function buildEmrFollowUpSchedulePatch(
  input: BuildEmrFollowUpSchedulePatchInput
): NonNullable<Visit['followUp']> {
  const nowIso = input.nowIso || new Date().toISOString();
  const normalizedFlags = Array.from(
    new Set(
      input.reasonFlags
        .map((flag) => flag.trim())
        .filter(Boolean)
    )
  );
  const effectiveFlags = normalizedFlags.length > 0 ? normalizedFlags : ['継続フォロー'];
  const nextAction = input.nextAction.trim() || '次回確認事項（服薬状況・副作用・残薬）を再確認する';
  const summary = (input.summary || '').trim() || `${effectiveFlags.join('・')}: ${nextAction}`;
  const dueDate = normalizeFollowUpDueDate(input.dueDate, input.basisDate);
  const contactMethod: FollowUpContactMethod = input.contactMethod || input.existingFollowUp?.contactMethod || 'phone';

  return {
    ...(input.existingFollowUp || {}),
    status: 'open',
    reasonFlags: effectiveFlags,
    summary,
    dueDate,
    contactMethod,
    nextAction,
    riskScore: Math.max(input.existingFollowUp?.riskScore || 0, 50),
    updatedAt: nowIso
  };
}

export const EMR_FOLLOW_UP_AUDIT_FAILED_MESSAGE =
  '監査ログの記録に失敗したため、フォロー予定の保存を取り消しました。';

export async function saveEmrFollowUpSchedule(params: {
  visitDoc: PatchableDocument;
  previousFollowUp: Visit['followUp'];
  followUpPatch: NonNullable<Visit['followUp']>;
  logAudit: (detail: string) => Promise<boolean>;
}): Promise<NonNullable<Visit['followUp']>> {
  const methodLabel = FOLLOW_UP_CONTACT_METHOD_LABELS[params.followUpPatch.contactMethod || 'phone'];
  const detail = `服薬フォロー予定登録: 期限 ${params.followUpPatch.dueDate} / 方法 ${methodLabel} / 理由 ${(params.followUpPatch.reasonFlags || []).join('・')} / 次回確認: ${params.followUpPatch.nextAction}`;

  await patchWithAuditRollback({
    doc: params.visitDoc,
    patch: { followUp: params.followUpPatch },
    previous: { followUp: params.previousFollowUp },
    logAudit: () => params.logAudit(detail),
    failureMessage: EMR_FOLLOW_UP_AUDIT_FAILED_MESSAGE
  });

  return params.followUpPatch;
}

export function createUnconfirmedSoapEntryFromGuidance(
  detail: GuidanceSoapInsertDetail
): SoapEntry {
  return {
    type: detail.type,
    text: detail.text,
    origin: detail.origin,
    aiStatus: detail.aiStatus,
    aiDraftId: detail.aiDraftId
  };
}
