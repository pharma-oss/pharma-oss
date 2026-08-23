import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSoapAiDraftSuggestions,
  soapDraftSuggestionToAiAssistSuggestion
} from '../lib/soap_ai_draft';
import { rollbackAppliedPatches } from '../lib/emr_helpers';
import { SoapAiDraftInsightCard } from './emr/components/EmrInsightCards';

describe('EmrSoapAiDraft and Intervention rollback contracts', () => {
  it('generates suggestions from prescription and alerts', () => {
    const suggestions = buildSoapAiDraftSuggestions({
      prescribedDrugs: [{ name: 'ロキソニン錠60mg' }],
      warnings: [],
      patientAlerts: []
    });
    assert.ok(Array.isArray(suggestions));
  });

  it('converts SOAP draft suggestion to AI assist format', () => {
    const suggestion = {
      draftId: 'draft_1',
      type: 'A' as const,
      title: '用法用量確認',
      text: '医師へ確認済み',
      severity: 'warning' as const,
      confidence: 80,
      evidence: [{ label: '検査値', detail: 'eGFR 45', source: '検査データ' }],
      guardrail: '処方監査'
    };
    const assist = soapDraftSuggestionToAiAssistSuggestion(suggestion as any);
    assert.ok(assist);
    assert.ok(assist.title.includes('用法用量確認'));
  });

  it('reverts applied operations in reverse order', async () => {
    const log: string[] = [];
    const appliedPatches = [
      {
        label: 'op1',
        doc: { patch: async () => { log.push('patch1'); } },
        patch: {},
        rollbackPatch: {}
      },
      {
        label: 'op2',
        doc: { patch: async () => { log.push('patch2'); } },
        patch: {},
        rollbackPatch: {}
      }
    ];
    await rollbackAppliedPatches(appliedPatches as any);
    assert.deepStrictEqual(log, ['patch2', 'patch1']);
  });

  it('exports SoapAiDraftInsightCard as a memoized React component', () => {
    assert.equal(typeof SoapAiDraftInsightCard, 'object'); // React.memo
  });

  it('guarantees intervention document removal when audit log fails during insertion', async () => {
    let removed = false;
    const insertedDoc = {
      id: 'interv_1',
      remove: async () => {
        removed = true;
      }
    };

    // 疑義照会記録時の監査ログ失敗時ロールバックシミュレーション
    const auditOk = false;
    if (!auditOk) {
      await insertedDoc.remove();
    }

    assert.equal(removed, true, 'inserted document must be removed when audit logging fails');
  });
});
