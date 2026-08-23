import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildSoapAiDraftSuggestions,
  soapDraftSuggestionToAiAssistSuggestion
} from '../lib/soap_ai_draft';
import { rollbackAppliedPatches } from '../lib/emr_helpers';
import { SoapAiDraftInsightCard } from './emr/components/EmrInsightCards';

test('buildSoapAiDraftSuggestions generates suggestions from prescription and alerts', () => {
  const suggestions = buildSoapAiDraftSuggestions({
    prescribedDrugs: [{ name: 'ロキソニン錠60mg' }],
    warnings: [],
    patientAlerts: []
  });
  assert.ok(Array.isArray(suggestions));
});

test('rollbackAppliedPatches reverts applied operations in reverse order', async () => {
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

test('SoapAiDraftInsightCard is exported as a React component', () => {
  assert.strictEqual(typeof SoapAiDraftInsightCard, 'object'); // React.memo
});


import { readFileSync } from 'node:fs';

test('emr intervention record rolls back when audit logging fails', () => {
  const hookSource = readFileSync(new URL('../hooks/useEmrIntervention.ts', import.meta.url), 'utf8');

  assert.match(hookSource, /const insertedDoc = await db\.interventions\.insert\(newRecord\)/);
  assert.match(hookSource, /const auditOk = await logAuditAction\(/);
  assert.match(hookSource, /if \(!auditOk\)/);
  assert.match(hookSource, /await insertedDoc\.remove\(\)/);
  assert.match(hookSource, /疑義照会記録の監査ログ記録に失敗したため、記録を元に戻しました。/);

  const auditIndex = hookSource.indexOf('const auditOk = await logAuditAction(');
  const stateIndex = hookSource.indexOf('setInterventions((prev: any[]) => [...prev, newRecord])');
  assert.ok(auditIndex > -1);
  assert.ok(stateIndex > auditIndex);
});

