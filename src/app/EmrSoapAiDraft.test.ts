import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const emrSource = readFileSync(new URL('./emr/page.tsx', import.meta.url), 'utf8');

function section(start: string, end: string): string {
  const startIndex = emrSource.indexOf(start);
  const endIndex = emrSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return emrSource.slice(startIndex, endIndex);
}

test('emr page surfaces evidence-backed SOAP AI drafts and logs application', () => {
  assert.match(emrSource, /buildSoapAiDraftSuggestions/);
  assert.match(emrSource, /SoapAiDraftInsightCard/);
  assert.match(emrSource, /AI補助 SOAP下書き/);
  assert.match(emrSource, /SOAPへ反映/);
  assert.match(emrSource, /onFocusEvidence/);
  assert.match(emrSource, /handleFocusSoapEvidence/);
  assert.match(emrSource, /emr-patient-alerts/);
  assert.match(emrSource, /emr-warning-insights/);
  assert.match(emrSource, /emr-prescription-doc-links/);
  assert.match(emrSource, /soap-evidence-focus/);
  assert.match(emrSource, /soapDraftSuggestionToAiAssistSuggestion/);
  assert.match(emrSource, /buildAiSuggestionDecisionAuditDetail/);
  assert.match(emrSource, /review_ai_suggestions/);
  assert.match(emrSource, /ai_suggestion_review/);
  assert.match(emrSource, /insert-soap-guidance/);
  assert.match(emrSource, /filterAiAssistItemsByMode/);
  assert.match(emrSource, /data-testid="soap-ai-mode-notice"/);
  assert.match(emrSource, /通常の薬歴入力は継続できます/);
});

test('emr completion rolls back stock and visit status when audit logging fails', () => {
  const body = section('const handleCompleteVisit = async', 'const handleSave = async');

  assert.match(emrSource, /type ReversiblePatch =/);
  assert.match(emrSource, /async function rollbackAppliedPatches/);
  assert.match(body, /const patchOperations: ReversiblePatch\[\] = \[\]/);
  assert.match(body, /rollbackPatch: \{ quantity: stock\.quantity \}/);
  assert.match(body, /rollbackPatch: \{ stockQuantity: drug\.stockQuantity \|\| 0 \}/);
  assert.match(body, /rollbackPatch: \{ status: visit\.status \}/);
  assert.match(body, /const appliedPatches: ReversiblePatch\[\] = \[\]/);
  assert.match(body, /await operation\.doc\.patch\(operation\.patch\)/);
  assert.match(body, /await rollbackAppliedPatches\(appliedPatches\)/);
  assert.match(body, /const auditOk = await logAuditAction\(/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /薬歴完了の監査ログ記録に失敗したため、在庫と受付ステータスを元に戻しました。/);

  const auditIndex = body.indexOf('const auditOk = await logAuditAction(');
  const successIndex = body.indexOf("toast.success('薬歴を完了し、在庫を引き落としました。')");
  assert.ok(auditIndex > -1);
  assert.ok(successIndex > auditIndex);
});

test('emr intervention record rolls back when audit logging fails', () => {
  const body = section('const handleAddIntervention = async', 'useEffect(() => {');

  assert.match(body, /const insertedDoc = await db\.interventions\.insert\(newRecord\)/);
  assert.match(body, /const auditOk = await logAuditAction\(/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /await insertedDoc\.remove\(\)/);
  assert.match(body, /疑義照会記録の監査ログ記録に失敗したため、記録を元に戻しました。/);

  const auditIndex = body.indexOf('const auditOk = await logAuditAction(');
  const stateIndex = body.indexOf('setInterventions(prev => [...prev, newRecord])');
  assert.ok(auditIndex > -1);
  assert.ok(stateIndex > auditIndex);
});
