import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import React from 'react';
import {
  DrugInfoItemCard,
  hasPrescriptionChange,
  formatDaysText,
  formatUsageText,
  formatMedicationSourceText
} from './components/DrugInfoItemCard';

test('DrugInfoItemCard exports and component type', () => {
  assert.ok(DrugInfoItemCard, 'DrugInfoItemCard should be exported');
  assert.strictEqual(typeof DrugInfoItemCard, 'object', 'React.memo returns an object component');
});

test('DrugInfoItemCard pure functions: hasPrescriptionChange', () => {
  // 1. 処方名と調剤名が同一（dispensedDrug なし、または一致）
  assert.strictEqual(
    hasPrescriptionChange({ drugName: 'アモキシシリンカプセル250mg' }),
    false,
    'No dispensedDrug should not be marked as change'
  );
  assert.strictEqual(
    hasPrescriptionChange({ drugName: 'アモキシシリンカプセル250mg', dispensedDrug: 'アモキシシリンカプセル250mg' }),
    false,
    'Same name should not be marked as change'
  );

  // 2. 先発から後発への変更
  assert.strictEqual(
    hasPrescriptionChange({ drugName: 'サワシリンカプセル250mg', dispensedDrug: 'アモキシシリンカプセル250mg「日医工」' }),
    true,
    'Different name should be marked as change'
  );

  // 3. 一般名処方からの調剤
  assert.strictEqual(
    hasPrescriptionChange({ drugName: '【般】アモキシシリンカプセル２５０ｍｇ', dispensedDrug: 'アモキシシリンカプセル250mg「トーワ」' }),
    true,
    'Generic prescription to brand should be marked as change'
  );
});

test('DrugInfoItemCard pure functions: formatDaysText', () => {
  assert.strictEqual(formatDaysText(14), '14日分');
  assert.strictEqual(formatDaysText('7'), '7日分');
  assert.strictEqual(formatDaysText(0), '-');
  assert.strictEqual(formatDaysText(undefined), '-');
  assert.strictEqual(formatDaysText(null), '-');
});

test('DrugInfoItemCard pure functions: formatUsageText', () => {
  assert.strictEqual(formatUsageText('1日3回毎食後'), '1日3回毎食後');
  assert.strictEqual(formatUsageText(''), '用法未設定');
  assert.strictEqual(formatUsageText(undefined), '用法未設定');
  assert.strictEqual(formatUsageText(null), '用法未設定');
});

test('DrugInfoItemCard pure functions: formatMedicationSourceText', () => {
  assert.strictEqual(
    formatMedicationSourceText({ source: 'approved_template', sourceRevisionDate: '2026-04-01' }),
    '薬局確認済み情報（参照版日 2026-04-01）'
  );
  assert.strictEqual(
    formatMedicationSourceText({ source: 'fallback', sourceRevisionDate: '' }),
    '詳しい薬剤情報は薬剤師へ確認してください'
  );
});

test('DrugInfoItemCard static contract and style relocation', () => {
  const drugInfoPrintSource = readFileSync(new URL('./components/DrugInfoPrint.tsx', import.meta.url), 'utf8');
  const itemCardSource = readFileSync(new URL('./components/DrugInfoItemCard.tsx', import.meta.url), 'utf8');

  // DrugInfoPrint.tsx は DrugInfoItemCard を呼び出していること
  assert.match(drugInfoPrintSource, /<DrugInfoItemCard\b/);

  // カード専用セレクタが DrugInfoPrint.tsx から移動（削除）されていること
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-row\.drug-info-card\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-appearance-cell/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.tablet/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.powder/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.liquid/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.ointment/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-counseling-grid\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-safety-grid\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-source-line\s*\{/);

  // カード専用セレクタが DrugInfoItemCard.tsx に漏れなく定義されていること
  assert.match(itemCardSource, /\.drug-info-row\.drug-info-card\s*\{/);
  assert.match(itemCardSource, /\.drug-appearance-cell/);
  assert.match(itemCardSource, /\.drug-shape\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.tablet\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.powder\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.liquid\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.ointment\s*\{/);
  assert.match(itemCardSource, /\.drug-info-counseling-grid\s*\{/);
  assert.match(itemCardSource, /\.drug-info-safety-grid\s*\{/);
  assert.match(itemCardSource, /\.drug-info-source-line\s*\{/);
  assert.match(itemCardSource, /\.paper-embedded-control\s*\{[^}]*display:\s*none/);

  // 親 DrugInfoPrint.tsx が文書枠組みスタイルを維持していること
  assert.match(drugInfoPrintSource, /\.yakujo-doc\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-doc\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-titlebar\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-patient-line\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-list\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-bottom-note\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-footer\s*\{/);

  // PrintLayoutRegression で要求される契約キーワードが存在すること
  assert.match(itemCardSource, /参照版日/);
  assert.match(itemCardSource, /PMDAで公式情報を確認/);
  assert.match(itemCardSource, /副作用・相談目安/);
  assert.match(itemCardSource, /使用上の注意/);
  assert.match(itemCardSource, /medicationInfo\.sideEffectText/);
  assert.match(itemCardSource, /medicationInfo\.usageCautionText/);

  // 禁止キーワードが含まれていないこと
  assert.doesNotMatch(itemCardSource, /identity-copy/);
  assert.doesNotMatch(itemCardSource, /shiori/i);
  assert.doesNotMatch(itemCardSource, /medicationInfo\.effectText/);
  assert.doesNotMatch(itemCardSource, /medicationInfo\.interactionText/);
  assert.doesNotMatch(itemCardSource, /medicationInfo\.storageText/);
  assert.doesNotMatch(itemCardSource, /drug-info-message-box/);
});
