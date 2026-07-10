import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8');

function section(start: string, end: string): string {
  const startIndex = settingsSource.indexOf(start);
  const endIndex = settingsSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return settingsSource.slice(startIndex, endIndex);
}

test('マスタ更新タブは薬品重複点検から統合まで実行できる', () => {
  assert.match(settingsSource, /data-testid="drug-duplicate-review-section"/);
  assert.match(settingsSource, /data-testid="drug-duplicate-scan-button"/);
  assert.match(settingsSource, /findDuplicateDrugGroups\(drugs, usage\)/);
  assert.match(settingsSource, /buildDrugDuplicateScanAuditDetail/);

  const scanBody = section('const handleScanDrugDuplicates = async', 'const openDrugMergeReview = async');
  assert.match(scanBody, /ensurePermission\('update_drug_master'\)/);
  assert.match(scanBody, /buildDrugUsageStats/);

  // 統合はdrug_merge実行系(計画→適用→失敗時ロールバック→監査ログ)を使う
  const applyBody = section('const handleApplyDrugMerge = async', 'const handleApplyDuplicateMerge = async');
  assert.match(applyBody, /ensurePermission\('update_drug_master'\)/);
  assert.match(applyBody, /window\.confirm\(/);
  assert.match(applyBody, /createRxdbDrugMergeExecutionStore\(db\)/);
  assert.match(applyBody, /applyDrugMergeExecutionPlan\(store, executionPlan\)/);
  assert.match(applyBody, /薬品統合実行: \$\{plan\.summary\}/);
  assert.match(applyBody, /DrugMergeExecutionError/);
  assert.match(applyBody, /rollbackOperations/);
});

test('薬品統合レビューは統合元の参照・在庫・テンプレ件数を実データから作る', () => {
  const reviewBody = section('const openDrugMergeReview = async', 'const handleApplyDrugMerge = async');
  assert.match(reviewBody, /selector: \{ drugId: sourceCode \}/);
  assert.match(reviewBody, /selector: \{ dispensedDrugCode: sourceCode \}/);
  assert.match(reviewBody, /selector: \{ drugCode: sourceCode \}/);
  assert.match(reviewBody, /patient_medication_info_templates/);
  assert.match(reviewBody, /medication_guidances/);
  assert.match(reviewBody, /sourceTemplateCount: templateDocs\.length/);

  // YJコード不一致グループは統合ボタンを無効化する
  assert.match(settingsSource, /group\.hasYjConflict/);
  assert.match(settingsSource, /YJコードが異なるため統合不可/);
});
