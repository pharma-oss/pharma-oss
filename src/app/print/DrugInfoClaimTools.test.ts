import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import React from 'react';
import { DrugInfoClaimTools } from './components/DrugInfoClaimTools';

test('DrugInfoClaimTools contracts and style encapsulation', () => {
  // 1. コンポーネントが React コンポーネントとして正しくエクスポートされていること
  assert.ok(DrugInfoClaimTools, 'DrugInfoClaimTools should be exported');
  assert.strictEqual(typeof DrugInfoClaimTools, 'object', 'React.memo returns an object component');

  // 2. ソースコードの静的契約検証: DrugInfoPrint からの分離と重複排除
  const drugInfoPrintSource = readFileSync(new URL('./components/DrugInfoPrint.tsx', import.meta.url), 'utf8');
  const claimToolsSource = readFileSync(new URL('./components/DrugInfoClaimTools.tsx', import.meta.url), 'utf8');

  // DrugInfoPrint.tsx は DrugInfoClaimTools を呼び出していること
  assert.match(drugInfoPrintSource, /<DrugInfoClaimTools\b/);

  // 移動対象5セレクタが DrugInfoPrint.tsx から完全に削除（移動）されていること
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-claim-tools\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-claim-row\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-control-panel\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.input-agent-group\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.input-receipt-remark\s*\{/);

  // 3. 移動対象5セレクタが DrugInfoClaimTools.tsx に漏れなく定義されていること
  assert.match(claimToolsSource, /\.drug-info-claim-tools\s*\{/);
  assert.match(claimToolsSource, /\.drug-info-claim-row\s*\{/);
  assert.match(claimToolsSource, /\.drug-info-control-panel\s*\{/);
  assert.match(claimToolsSource, /\.input-agent-group\s*\{/);
  assert.match(claimToolsSource, /\.input-receipt-remark\s*\{/);

  // 4. 定義値の厳格検証 (print.css にない 80px と 120px の維持)
  assert.match(claimToolsSource, /\.input-agent-group\s*\{[^}]*width:\s*80px/);
  assert.match(claimToolsSource, /\.input-receipt-remark\s*\{[^}]*width:\s*120px/);

  // 5. 印刷時非表示（@media print）が含まれていること
  assert.match(claimToolsSource, /@media\s+print\s*\{[^}]*\.no-print\s*\{[^}]*display:\s*none\s*!important/);
});
