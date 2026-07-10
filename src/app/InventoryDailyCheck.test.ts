import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const inventorySource = readFileSync(new URL('./inventory/page.tsx', import.meta.url), 'utf8');

test('controlled drug daily check keeps unentered counts distinct from system stock', () => {
  assert.match(inventorySource, /actualCount: hasActualCount \? actualCounts\[drug\.code\] : undefined/);
  assert.match(inventorySource, /differenceReason: dailyCheckReasons\[drug\.code\]/);
  assert.match(inventorySource, /value=\{row\.actualCount \?\? ''\}/);
  assert.match(inventorySource, /未入力のみ/);
  assert.match(inventorySource, /差異ありのみ/);
  assert.match(inventorySource, /dailyCheckSummary\.unenteredCount/);
});

test('controlled drug daily check supports quick entry, filters, and CSV export', () => {
  assert.match(inventorySource, /表示中を一致/);
  assert.match(inventorySource, /handleAdjustDailyCheckCount/);
  assert.match(inventorySource, /dailyCheckKindFilter/);
  assert.match(inventorySource, /dailyCheckStatusFilter/);
  assert.match(inventorySource, /buildDailyControlledDrugCheckCsv/);
  assert.match(inventorySource, /yakureki-controlled-drug-daily-check/);
});

test('controlled drug daily check requires mismatch reasons and preserves previous results', () => {
  assert.match(inventorySource, /DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS/);
  assert.match(inventorySource, /差異理由を選択/);
  assert.match(inventorySource, /getDailyControlledDrugMissingReasonRows/);
  assert.match(inventorySource, /previousDailyCheckSnapshot/);
  assert.match(inventorySource, /DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY/);
  assert.match(inventorySource, /前回なし/);
});

test('controlled drug daily check warns on partial save and audits reasoned checks', () => {
  assert.match(inventorySource, /未入力が \$\{unenteredCount\} 件あります/);
  assert.match(inventorySource, /buildDailyControlledDrugCheckAuditDetail/);
  assert.match(inventorySource, /persistDailyCheckSnapshot\(dailyCheckRows\)/);
});

test('controlled drug daily check supports Enter flow to the next unentered row', () => {
  assert.match(inventorySource, /dailyCountInputRefs/);
  assert.match(inventorySource, /dailyReasonSelectRefs/);
  assert.match(inventorySource, /handleDailyCheckInputKeyDown/);
  assert.match(inventorySource, /onKeyDown=\{\(event\) => handleDailyCheckInputKeyDown\(row, event\)\}/);
  assert.match(inventorySource, /focusNextDailyCheckInput/);
});
