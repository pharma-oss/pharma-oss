import { test } from 'node:test';
import assert from 'node:assert';
import {
  AI_SUGGESTION_GUARDRAIL,
  buildAiSuggestionDecisionAuditDetail,
  buildAiSuggestionsFromPrescriptionAudit,
  formatAiSuggestionConfidence,
  getAiSuggestionDecisionLabel,
  summarizeAiSuggestions
} from './ai_suggestion.ts';
import type { PrescriptionInputAuditResult } from './prescription_input_audit.ts';

const prescriptionAudit: PrescriptionInputAuditResult = {
  errorCount: 1,
  warningCount: 1,
  infoCount: 0,
  issues: [
    {
      severity: 'error',
      code: 'patient_allergy_match',
      title: 'ペニシリンVカリウム錠 が患者アレルギー情報に一致します',
      message: 'アレルギー: ペニシリン',
      itemIds: ['item_1'],
      rpId: 'rp_1'
    },
    {
      severity: 'warning',
      code: 'high_risk_without_comment',
      title: 'ワルファリン錠1mg はハイリスク薬です',
      message: '指導・確認ポイントをRpコメントまたは薬歴に残してください。',
      itemIds: ['item_2'],
      rpId: 'rp_2'
    }
  ]
};

test('buildAiSuggestionsFromPrescriptionAudit adds evidence, confidence, and human review guardrails', () => {
  const suggestions = buildAiSuggestionsFromPrescriptionAudit(prescriptionAudit);

  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[0].domain, 'prescription_audit');
  assert.strictEqual(suggestions[0].source, 'rule_based');
  assert.strictEqual(suggestions[0].severity, 'critical');
  assert.strictEqual(suggestions[0].confidence, 96);
  assert.strictEqual(formatAiSuggestionConfidence(suggestions[0]), '96%');
  assert.strictEqual(suggestions[0].requiresHumanReview, true);
  assert.strictEqual(suggestions[0].guardrail, AI_SUGGESTION_GUARDRAIL);
  assert.ok(suggestions[0].evidence.some((evidence) => evidence.label === '検出理由'));
  assert.ok(suggestions[0].evidence.some((evidence) => evidence.detail === 'item_1'));
  assert.match(suggestions[0].suggestedAction, /疑義照会/);
});

test('summarizeAiSuggestions counts severity buckets and maximum confidence', () => {
  const summary = summarizeAiSuggestions(buildAiSuggestionsFromPrescriptionAudit(prescriptionAudit));

  assert.deepStrictEqual(summary, {
    totalCount: 2,
    criticalCount: 1,
    warningCount: 1,
    infoCount: 0,
    maxConfidence: 96
  });
});

test('buildAiSuggestionDecisionAuditDetail records accept, modify, and reject decisions', () => {
  const [suggestion] = buildAiSuggestionsFromPrescriptionAudit(prescriptionAudit);
  const decidedAt = new Date('2026-06-16T03:00:00.000Z');
  const modifiedDetail = buildAiSuggestionDecisionAuditDetail({
    suggestion,
    decision: 'modified',
    reviewerName: '薬剤師 一郎',
    modifiedAction: '処方医へ確認後、代替薬へ変更',
    feedback: '患者アレルギー情報と薬品名が一致したため確認した',
    decidedAt
  });

  assert.strictEqual(getAiSuggestionDecisionLabel('accepted'), '採用');
  assert.strictEqual(getAiSuggestionDecisionLabel('modified'), '修正');
  assert.strictEqual(getAiSuggestionDecisionLabel('rejected'), '却下');
  assert.match(modifiedDetail, /AI提案採否: 修正/);
  assert.match(modifiedDetail, /確認者: 薬剤師 一郎/);
  assert.match(modifiedDetail, /信頼度: 96%/);
  assert.match(modifiedDetail, /根拠:/);
  assert.match(modifiedDetail, /修正後対応: 処方医へ確認後、代替薬へ変更/);
  assert.match(modifiedDetail, /フィードバック: 患者アレルギー情報/);
  assert.match(modifiedDetail, /薬剤師確認必須: はい/);
  assert.match(modifiedDetail, /ガードレール:/);

  const acceptedDetail = buildAiSuggestionDecisionAuditDetail({
    suggestion,
    decision: 'accepted',
    reviewerName: '薬剤師 一郎',
    decidedAt
  });
  const rejectedDetail = buildAiSuggestionDecisionAuditDetail({
    suggestion,
    decision: 'rejected',
    reviewerName: '薬剤師 一郎',
    feedback: '処方意図を確認済み',
    decidedAt
  });

  assert.match(acceptedDetail, /AI提案採否: 採用/);
  assert.match(rejectedDetail, /AI提案採否: 却下/);
});
