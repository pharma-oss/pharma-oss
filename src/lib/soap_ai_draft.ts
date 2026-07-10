import { AI_SUGGESTION_GUARDRAIL, type AiAssistSuggestion } from './ai_suggestion.ts';

export type SoapDraftEntryType = 'S' | 'O' | 'A' | 'P';
export type SoapDraftSeverity = 'critical' | 'warning' | 'info';

export interface SoapAiDraftEvidence {
  label: string;
  detail: string;
  source: string;
  targetId?: string;
  targetLabel?: string;
}

export interface SoapAiDraftSuggestion {
  draftId: string;
  type: SoapDraftEntryType;
  title: string;
  text: string;
  severity: SoapDraftSeverity;
  confidence: number;
  evidence: SoapAiDraftEvidence[];
  guardrail: string;
}

export interface SoapAiDraftInput {
  prescribedDrugs?: Array<{
    code?: string;
    name?: string;
    isHighRisk?: boolean;
    genericName?: string;
  }>;
  warnings?: Array<{
    type?: string;
    severity?: string;
    drug?: string;
    drug1?: string;
    drug2?: string;
    alertType?: string;
    message?: string;
  }>;
  patientAlerts?: Array<{
    type?: string;
    content?: string;
    status?: string;
  }>;
}

const typeLabel: Record<SoapDraftEntryType, string> = {
  S: 'S',
  O: 'O',
  A: 'A',
  P: 'P'
};

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'soap-draft';
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function drugLabel(drug: NonNullable<SoapAiDraftInput['prescribedDrugs']>[number], index: number): string {
  return drug.name || drug.genericName || drug.code || `処方薬${index + 1}`;
}

function addSuggestion(
  suggestions: SoapAiDraftSuggestion[],
  suggestion: Omit<SoapAiDraftSuggestion, 'draftId' | 'guardrail'>
): void {
  suggestions.push({
    ...suggestion,
    draftId: sanitizeId(`soap-${suggestion.type}-${suggestion.title}-${suggestions.length + 1}`),
    guardrail: AI_SUGGESTION_GUARDRAIL
  });
}

export function buildSoapAiDraftSuggestions(input: SoapAiDraftInput): SoapAiDraftSuggestion[] {
  const prescribedDrugs = input.prescribedDrugs || [];
  const warnings = input.warnings || [];
  const activeAlerts = (input.patientAlerts || []).filter((alert) => alert.status !== 'resolved');
  const suggestions: SoapAiDraftSuggestion[] = [];

  const drugNames = uniqueText(prescribedDrugs.map(drugLabel));
  if (drugNames.length > 0) {
    addSuggestion(suggestions, {
      type: 'O',
      title: '処方内容の客観情報',
      text: `本日処方: ${drugNames.slice(0, 6).join('、')}${drugNames.length > 6 ? ' ほか' : ''}。`,
      severity: 'info',
      confidence: 72,
      evidence: [
        {
          label: '処方薬',
          detail: `${drugNames.length}薬`,
          source: '処方入力',
          targetId: 'emr-prescription-doc-links',
          targetLabel: '処方薬・添付文書'
        }
      ]
    });
  }

  const highRiskDrugs = uniqueText(prescribedDrugs
    .filter((drug) => !!drug.isHighRisk)
    .map(drugLabel));
  if (highRiskDrugs.length > 0) {
    addSuggestion(suggestions, {
      type: 'A',
      title: 'ハイリスク薬の評価',
      text: `ハイリスク薬（${highRiskDrugs.join('、')}）について、服薬状況、副作用兆候、検査値・併用薬を確認する必要あり。`,
      severity: 'warning',
      confidence: 82,
      evidence: [
        {
          label: 'ハイリスク薬',
          detail: highRiskDrugs.join('、'),
          source: '医薬品マスター',
          targetId: 'emr-prescription-doc-links',
          targetLabel: '処方薬・添付文書'
        }
      ]
    });
    addSuggestion(suggestions, {
      type: 'P',
      title: 'ハイリスク薬の指導計画',
      text: `服薬指導で${highRiskDrugs.join('、')}の副作用初期症状、飲み忘れ時対応、検査・受診継続の確認事項を説明し、患者理解を確認する。`,
      severity: 'warning',
      confidence: 80,
      evidence: [
        {
          label: '指導対象',
          detail: highRiskDrugs.join('、'),
          source: '医薬品マスター',
          targetId: 'emr-prescription-doc-links',
          targetLabel: '処方薬・添付文書'
        }
      ]
    });
  }

  for (const warning of warnings.slice(0, 4)) {
    const target = warning.drug || warning.drug1 || warning.drug2 || '処方薬';
    const severity: SoapDraftSeverity = warning.severity === 'danger' ? 'critical' : 'warning';
    const title = warning.type === 'patient_alert'
      ? '患者アラートに基づく評価'
      : warning.type === 'contraindication'
        ? '併用注意に基づく評価'
        : '用法用量注意に基づく評価';
    addSuggestion(suggestions, {
      type: 'A',
      title,
      text: `${target}について、${warning.message || '注意事項'}を確認。必要に応じて疑義照会または服薬指導で重点確認する。`,
      severity,
      confidence: severity === 'critical' ? 90 : 78,
      evidence: [
        {
          label: '検出理由',
          detail: warning.message || warning.type || '注意事項',
          source: '相互作用・患者アラート',
          targetId: warning.type === 'patient_alert' ? 'emr-patient-alerts' : 'emr-warning-insights',
          targetLabel: warning.type === 'patient_alert' ? '患者アラート' : '相互作用・注意'
        }
      ]
    });
  }

  const alertSummaries = activeAlerts
    .slice(0, 4)
    .map((alert) => `${alert.type === 'allergy' ? 'アレルギー' : alert.type === 'side_effect' ? '副作用歴' : '疾患'}: ${alert.content || ''}`);
  if (alertSummaries.length > 0) {
    addSuggestion(suggestions, {
      type: 'S',
      title: '患者アラート確認',
      text: `患者アラート（${alertSummaries.join('、')}）について、今回処方との関連と患者申告を確認する。`,
      severity: 'warning',
      confidence: 76,
      evidence: [
        {
          label: '患者アラート',
          detail: alertSummaries.join(' / '),
          source: '患者アラート',
          targetId: 'emr-patient-alerts',
          targetLabel: '患者アラート'
        }
      ]
    });
  }

  if (suggestions.length === 0) {
    addSuggestion(suggestions, {
      type: 'P',
      title: '通常服薬指導',
      text: '用法用量、飲み忘れ時対応、保管方法、体調変化時の相談先を確認し、患者理解を確認する。',
      severity: 'info',
      confidence: 60,
      evidence: [
        {
          label: '処方監査',
          detail: '重大な注意候補なし',
          source: 'SOAP下書き補助',
          targetId: 'emr-warning-insights',
          targetLabel: '相互作用・注意'
        }
      ]
    });
  }

  return suggestions.slice(0, 8);
}

export function soapDraftSuggestionToAiAssistSuggestion(
  suggestion: SoapAiDraftSuggestion
): AiAssistSuggestion {
  return {
    suggestionId: suggestion.draftId,
    domain: 'soap_draft',
    source: 'rule_based',
    severity: suggestion.severity,
    title: `SOAP ${typeLabel[suggestion.type]} 下書き: ${suggestion.title}`,
    message: suggestion.text,
    suggestedAction: `SOAP ${typeLabel[suggestion.type]} に下書きを反映し、薬剤師が内容を確認・修正してください。`,
    confidence: suggestion.confidence,
    evidence: suggestion.evidence.map((evidence) => ({
      label: evidence.label,
      detail: evidence.detail,
      source: evidence.source
    })),
    requiresHumanReview: true,
    guardrail: suggestion.guardrail
  };
}
