import type { DrugInfo, PatientMedicationInfoTemplate } from '../db/types.ts';

export interface PatientMedicationInfoSafetyDraftInput {
  drugCode: string;
  drugName: string;
  genericName?: string;
  drugInfo?: DrugInfo | null;
  generatedAt?: Date;
}

export interface PatientMedicationInfoSafetyDraft {
  sideEffectText: string;
  usageCautionText: string;
  sourceType: NonNullable<PatientMedicationInfoTemplate['sourceType']>;
  sourceHash: string;
  needsReviewReason: string;
  matchedDrugInfoId?: string;
}

const SAFETY_DRAFT_SOURCE_PREFIX = 'yakureki-safety-draft:v2';

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export function extractDrugCodeFromDrugInfoId(id: string): string {
  return id.replace(/^drug_info_/, '').trim();
}

export function makePatientMedicationInfoSafetyDraftCsvFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `yakureki_medication_safety_drafts_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.csv`;
}

export function buildPatientMedicationInfoSafetyDraft(
  input: PatientMedicationInfoSafetyDraftInput
): PatientMedicationInfoSafetyDraft {
  const hasInteractionCautions = (input.drugInfo?.contraindications || []).length > 0;
  const hasContraindicatedInteractions = (input.drugInfo?.contraindications || []).some(
    (entry) => entry.severity === 'danger'
  );
  const hasUsageWarnings = (input.drugInfo?.usageWarnings || []).length > 0;

  const sideEffectText = normalizeWhitespace([
    '発疹、かゆみ、息苦しさなどのアレルギー症状や、その他いつもと違う症状が出た場合は、薬剤師または医師へ相談してください。'
  ].join(' '));

  const usageCautionText = normalizeWhitespace([
    '用法・用量を守って使用してください。飲み忘れ、使い忘れ、中止で迷う場合は自己判断せず薬局へ相談してください。',
    hasUsageWarnings
      ? '処方量や使用回数の確認が必要な薬です。指示された量を超えて使用しないでください。'
      : '',
    hasInteractionCautions
      ? [
      hasContraindicatedInteractions
        ? '併用できない薬、または併用に特に注意が必要な薬がある可能性があります。'
        : '他の薬との飲み合わせで注意が必要な場合があります。',
      '医療用医薬品、市販薬、健康食品を追加・中止する前に薬剤師へ相談してください。'
      ].join(' ')
      : '他の薬、市販薬、健康食品との飲み合わせで迷う場合は、使用前に薬剤師へ相談してください。'
  ].filter(Boolean).join(' '));

  const sourceDrugCode = (input.drugCode.trim() || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'unknown';
  const usageWarningCount = input.drugInfo?.usageWarnings?.length || 0;
  const interactionCautionCount = input.drugInfo?.contraindications?.length || 0;
  const sourceHash = input.drugInfo?.id
    ? `${SAFETY_DRAFT_SOURCE_PREFIX}:${input.drugInfo.id.slice(0, 80)}:u${usageWarningCount}:i${interactionCautionCount}`
    : `${SAFETY_DRAFT_SOURCE_PREFIX}:unmatched:${sourceDrugCode}`;
  const needsReviewReason = input.drugInfo
    ? `副作用・使用上の注意の自動下書き案です。参照データ一致（用量注意 ${usageWarningCount}件、飲み合わせ注意 ${interactionCautionCount}件）。添付文書等で薬剤師確認後に承認してください。`
    : '副作用・使用上の注意の汎用下書き案です。一致する薬剤参照データがないため、添付文書等で薬剤師確認後に承認してください。';

  return {
    sideEffectText,
    usageCautionText,
    sourceType: 'other',
    sourceHash,
    needsReviewReason,
    matchedDrugInfoId: input.drugInfo?.id
  };
}

export function buildPatientMedicationInfoSafetyDraftTemplate(
  input: PatientMedicationInfoSafetyDraftInput
): PatientMedicationInfoTemplate {
  const generatedAt = input.generatedAt || new Date();
  const draft = buildPatientMedicationInfoSafetyDraft({ ...input, generatedAt });
  return {
    templateId: `pmit_safety_draft_${input.drugCode.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'drug'}_${generatedAt.getTime()}`,
    drugCode: input.drugCode,
    drugName: input.drugName,
    genericName: input.genericName,
    status: 'draft',
    sideEffectText: draft.sideEffectText,
    counselingText: draft.usageCautionText,
    sourceType: draft.sourceType,
    sourceHash: draft.sourceHash,
    needsReviewReason: draft.needsReviewReason,
    createdAt: generatedAt.toISOString(),
    updatedAt: generatedAt.toISOString()
  };
}
