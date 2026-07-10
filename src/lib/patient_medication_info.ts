import type { PatientMedicationInfoTemplate } from '@/db/types';

export type MedicationInfoPrintSource = 'approved_template' | 'safe_fallback';

export interface MedicationInfoPrintContent {
  source: MedicationInfoPrintSource;
  drugName: string;
  sideEffectText: string;
  usageCautionText: string;
  officialSearchUrl: string;
  templateId?: string;
  sourceUrl?: string;
  sourceRevisionDate?: string;
  approvedAt?: string;
  reviewerId?: string;
}

export interface MedicationInfoPrintInput {
  drugName: string;
  genericName?: string;
  isHighRisk?: boolean;
  isLiquid?: boolean;
  isOintment?: boolean;
  approvedTemplate?: PatientMedicationInfoTemplate | null;
}

export type MedicationInfoApprovalIssueCode =
  | 'missing_template'
  | 'drug_code'
  | 'drug_name'
  | 'status'
  | 'side_effect_text'
  | 'usage_caution_text'
  | 'source_type'
  | 'source_revision_date'
  | 'source_evidence'
  | 'source_url'
  | 'source_url_domain'
  | 'unsupported_scraped_source'
  | 'reviewer_id'
  | 'approved_at';

export interface MedicationInfoApprovalIssue {
  code: MedicationInfoApprovalIssueCode;
  message: string;
}

export interface MedicationInfoApprovalWriteSet {
  writes: PatientMedicationInfoTemplate[];
  supersededTemplateIds: string[];
}

const PMDA_IYAKU_SEARCH_URL = 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/';
const MEDICATION_INFO_SOURCE_TYPES = new Set([
  'pmda_insert',
  'pmda_patient_guide',
  'pharmacy_authored',
  'licensed',
  'other'
]);
const PMDA_SOURCE_TYPES = new Set(['pmda_insert', 'pmda_patient_guide']);
const UNSUPPORTED_SCRAPED_SOURCE_URL_PATTERNS = [
  /kusuri-no-shiori/i,
  /rad-ar\.or\.jp\/siori/i
];

const hasText = (value?: string): boolean => !!value?.trim();

const formatLocalDateOnly = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isValidDateOnly = (value?: string): boolean => {
  const normalized = value?.trim();
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) return false;
  return normalized <= formatLocalDateOnly();
};

const isValidHttpUrl = (value?: string): boolean => {
  if (!hasText(value)) return false;
  try {
    const url = new URL(value!.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const isUnsupportedScrapedSourceUrl = (value?: string): boolean => {
  const normalized = value?.trim() || '';
  return UNSUPPORTED_SCRAPED_SOURCE_URL_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isPmdaSourceUrl = (value?: string): boolean => {
  if (!hasText(value)) return false;
  try {
    const { hostname, protocol } = new URL(value!.trim());
    return protocol === 'https:' && (hostname === 'pmda.go.jp' || hostname.endsWith('.pmda.go.jp'));
  } catch {
    return false;
  }
};

export function buildPmdaMedicationSearchUrl(drugName: string): string {
  const normalizedDrugName = drugName.trim();
  if (!normalizedDrugName) return PMDA_IYAKU_SEARCH_URL;
  return `${PMDA_IYAKU_SEARCH_URL}#search=${encodeURIComponent(normalizedDrugName)}`;
}

export function getPatientMedicationInfoApprovalIssues(
  template?: PatientMedicationInfoTemplate | null
): MedicationInfoApprovalIssue[] {
  if (!template) {
    return [{ code: 'missing_template', message: 'テンプレートがありません' }];
  }

  const issues: MedicationInfoApprovalIssue[] = [];
  const requireText = (
    code: MedicationInfoApprovalIssueCode,
    value: string | undefined,
    message: string
  ) => {
    if (!hasText(value)) issues.push({ code, message });
  };

  requireText('drug_code', template.drugCode, '薬品コードがありません');
  requireText('drug_name', template.drugName, '薬品名がありません');
  if (template.status !== 'approved') {
    issues.push({ code: 'status', message: '状態が承認済みではありません' });
  }
  requireText('side_effect_text', template.sideEffectText, '副作用・相談目安がありません');
  requireText('usage_caution_text', template.counselingText, '使用上の注意がありません');

  if (!template.sourceType || !MEDICATION_INFO_SOURCE_TYPES.has(template.sourceType)) {
    issues.push({ code: 'source_type', message: '参照元区分がありません' });
  }
  if (!isValidDateOnly(template.sourceRevisionDate)) {
    issues.push({ code: 'source_revision_date', message: '参照元版日が未入力または不正です' });
  }
  if (!hasText(template.sourceUrl) && !hasText(template.sourceHash)) {
    issues.push({ code: 'source_evidence', message: '参照元URLまたは管理番号がありません' });
  } else if (hasText(template.sourceUrl) && !isValidHttpUrl(template.sourceUrl)) {
    issues.push({ code: 'source_url', message: '参照元URLが不正です' });
  } else if (isUnsupportedScrapedSourceUrl(template.sourceUrl)) {
    issues.push({
      code: 'unsupported_scraped_source',
      message: '薬のしおり等の転載元URLは承認根拠にできません'
    });
  } else if (hasText(template.sourceUrl) && PMDA_SOURCE_TYPES.has(template.sourceType || '') && !isPmdaSourceUrl(template.sourceUrl)) {
    issues.push({
      code: 'source_url_domain',
      message: 'PMDA区分の参照元URLはhttps://pmda.go.jp配下のURLにしてください'
    });
  }

  requireText('reviewer_id', template.reviewerId, '承認者が記録されていません');
  if (!hasText(template.approvedAt) || Number.isNaN(Date.parse(template.approvedAt!))) {
    issues.push({ code: 'approved_at', message: '承認日時が未入力または不正です' });
  }

  return issues;
}

export function isApprovedPatientMedicationInfoTemplate(
  template?: PatientMedicationInfoTemplate | null
): template is PatientMedicationInfoTemplate {
  return !!template && getPatientMedicationInfoApprovalIssues(template).length === 0;
}

export function getPatientMedicationInfoApprovalReadinessIssues(
  template?: PatientMedicationInfoTemplate | null
): MedicationInfoApprovalIssue[] {
  if (!template) return getPatientMedicationInfoApprovalIssues(template);
  return getPatientMedicationInfoApprovalIssues({
    ...template,
    status: 'approved',
    reviewerId: template.reviewerId || 'approval-readiness-probe',
    approvedAt: template.approvedAt || '2000-01-01T00:00:00.000Z'
  }).filter((issue) => (
    issue.code !== 'status'
    && issue.code !== 'reviewer_id'
    && issue.code !== 'approved_at'
  ));
}

export function isPatientMedicationInfoTemplateReadyForApproval(
  template?: PatientMedicationInfoTemplate | null
): template is PatientMedicationInfoTemplate {
  return !!template && getPatientMedicationInfoApprovalReadinessIssues(template).length === 0;
}

export function selectApprovedPatientMedicationInfoTemplate(
  templates: PatientMedicationInfoTemplate[]
): PatientMedicationInfoTemplate | null {
  const approvedTemplates = templates.filter(isApprovedPatientMedicationInfoTemplate);
  approvedTemplates.sort((a, b) => {
    const approvedAtOrder = Date.parse(b.approvedAt!) - Date.parse(a.approvedAt!);
    if (approvedAtOrder !== 0) return approvedAtOrder;
    const updatedAtOrder = (b.updatedAt || '').localeCompare(a.updatedAt || '');
    if (updatedAtOrder !== 0) return updatedAtOrder;
    return b.templateId.localeCompare(a.templateId);
  });
  return approvedTemplates[0] || null;
}

export function shouldForkPatientMedicationInfoTemplate(
  existingTemplate: PatientMedicationInfoTemplate | undefined,
  targetStatus: PatientMedicationInfoTemplate['status']
): boolean {
  return !!existingTemplate
    && existingTemplate.status !== 'draft'
    && (targetStatus === 'draft' || targetStatus === 'approved');
}

const MEDICATION_INFO_REVISION_CONTENT_FIELDS = [
  'drugCode',
  'drugName',
  'genericName',
  'sideEffectText',
  'counselingText',
  'sourceType',
  'sourceUrl',
  'sourceRevisionDate',
  'sourceHash'
] as const satisfies readonly (keyof PatientMedicationInfoTemplate)[];

export function hasPatientMedicationInfoTemplateContentChanges(
  existingTemplate: PatientMedicationInfoTemplate,
  editedTemplate: PatientMedicationInfoTemplate
): boolean {
  return MEDICATION_INFO_REVISION_CONTENT_FIELDS.some((field) => (
    String(existingTemplate[field] || '').trim() !== String(editedTemplate[field] || '').trim()
  ));
}

export function buildPatientMedicationInfoApprovalWriteSet(
  approvedTemplate: PatientMedicationInfoTemplate,
  existingTemplates: PatientMedicationInfoTemplate[],
  changedAt = approvedTemplate.updatedAt || new Date().toISOString()
): MedicationInfoApprovalWriteSet {
  const approvalIssues = getPatientMedicationInfoApprovalIssues(approvedTemplate);
  if (approvalIssues.length > 0) {
    throw new Error(`承認条件を満たしていません: ${approvalIssues.map((issue) => issue.message).join('、')}`);
  }

  const supersededTemplates = existingTemplates.filter((template) => (
    template.drugCode === approvedTemplate.drugCode
    && template.templateId !== approvedTemplate.templateId
    && template.status === 'approved'
  ));
  const retiredTemplates = supersededTemplates.map((template) => ({
    ...template,
    status: 'retired' as const,
    needsReviewReason: `承認版 ${approvedTemplate.templateId} に置換`,
    updatedAt: changedAt
  }));

  return {
    writes: [approvedTemplate, ...retiredTemplates],
    supersededTemplateIds: retiredTemplates.map((template) => template.templateId)
  };
}

export function buildMedicationInfoPrintContent(input: MedicationInfoPrintInput): MedicationInfoPrintContent {
  const drugName = input.drugName.trim() || '薬剤';
  const template = isApprovedPatientMedicationInfoTemplate(input.approvedTemplate)
    ? input.approvedTemplate
    : null;

  if (template) {
    return {
      source: 'approved_template',
      drugName,
      sideEffectText: template.sideEffectText!.trim(),
      usageCautionText: template.counselingText!.trim(),
      officialSearchUrl: buildPmdaMedicationSearchUrl(drugName),
      templateId: template.templateId,
      sourceUrl: template.sourceUrl,
      sourceRevisionDate: template.sourceRevisionDate,
      approvedAt: template.approvedAt,
      reviewerId: template.reviewerId
    };
  }

  return {
    source: 'safe_fallback',
    drugName,
    sideEffectText: '発疹、かゆみ、息苦しさなどのアレルギー症状や、その他いつもと違う症状が出た場合は、薬剤師または医師へ相談してください。',
    usageCautionText: '用法・用量を守って使用してください。飲み忘れ、使い忘れ、増減、中止で迷う場合や、他の薬、市販薬、健康食品との飲み合わせが気になる場合は、自己判断せず薬剤師へ相談してください。',
    officialSearchUrl: buildPmdaMedicationSearchUrl(drugName)
  };
}
