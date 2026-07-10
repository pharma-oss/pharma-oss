import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildSoapAiDraftSuggestions,
  soapDraftSuggestionToAiAssistSuggestion
} from './soap_ai_draft.ts';

test('buildSoapAiDraftSuggestions creates evidence-backed SOAP drafts from prescription context', () => {
  const drafts = buildSoapAiDraftSuggestions({
    prescribedDrugs: [
      { code: 'd1', name: 'ワルファリン錠1mg', isHighRisk: true },
      { code: 'd2', name: 'アムロジピン錠5mg' }
    ],
    warnings: [
      {
        type: 'patient_alert',
        severity: 'danger',
        drug: 'ワルファリン錠1mg',
        alertType: 'side_effect',
        message: '出血傾向の既往あり'
      }
    ],
    patientAlerts: [
      { type: 'side_effect', content: 'ワルファリンで鼻出血', status: 'active' }
    ]
  });

  assert.ok(drafts.some((draft) => draft.type === 'O' && draft.text.includes('本日処方')));
  assert.ok(drafts.some((draft) => draft.type === 'A' && draft.text.includes('ハイリスク薬')));
  assert.ok(drafts.some((draft) => draft.type === 'P' && draft.text.includes('服薬指導')));
  assert.ok(drafts.some((draft) => draft.type === 'S' && draft.text.includes('患者アラート')));
  assert.ok(drafts.every((draft) => draft.evidence.length > 0));
  assert.ok(drafts.some((draft) => draft.evidence.some((evidence) => evidence.targetId === 'emr-patient-alerts')));
  assert.ok(drafts.some((draft) => draft.evidence.some((evidence) => evidence.targetId === 'emr-prescription-doc-links')));
  assert.ok(drafts.every((draft) => draft.guardrail.includes('薬剤師')));
});

test('buildSoapAiDraftSuggestions falls back to a normal guidance plan when no risks are present', () => {
  const drafts = buildSoapAiDraftSuggestions({});

  assert.strictEqual(drafts.length, 1);
  assert.strictEqual(drafts[0].type, 'P');
  assert.strictEqual(drafts[0].severity, 'info');
  assert.match(drafts[0].text, /用法用量/);
});

test('soapDraftSuggestionToAiAssistSuggestion keeps confidence and human review guardrail', () => {
  const [draft] = buildSoapAiDraftSuggestions({
    prescribedDrugs: [{ code: 'd1', name: 'ワルファリン錠1mg', isHighRisk: true }]
  });
  const suggestion = soapDraftSuggestionToAiAssistSuggestion(draft);

  assert.strictEqual(suggestion.source, 'rule_based');
  assert.strictEqual(suggestion.requiresHumanReview, true);
  assert.strictEqual(suggestion.confidence, draft.confidence);
  assert.match(suggestion.title, /SOAP/);
  assert.match(suggestion.suggestedAction, /薬剤師/);
});
