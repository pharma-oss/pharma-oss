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

test('ピッキング支援は外部システム向け指示CSVを監査ログつきで書き出す', () => {
  assert.match(emrSource, /data-testid="picking-instruction-export"/);
  const exportBody = section('const handleExportPickingInstruction = useCallback', 'const handleImportPickingResultFile = useCallback');
  assert.match(exportBody, /buildPickingInstruction/);
  assert.match(exportBody, /buildPickingInstructionCsv/);
  assert.match(exportBody, /buildPickingInstructionFileName/);
  assert.match(exportBody, /stockDrugId \|\| item\.drugId/);
  assert.match(exportBody, /ピッキング指示CSV書き出し/);
  assert.match(exportBody, /店舗内利用限定/);
  assert.match(exportBody, /logAuditAction\(/);
});

test('ピッキング結果取込は編集ガードと確認を経てGS1照合と同じ形へ反映する', () => {
  assert.match(emrSource, /data-testid="picking-result-import"/);
  const importBody = section('const handleImportPickingResultFile = useCallback', 'useEffect(() => {');
  // 請求ロック中などは編集不可(院内のGS1照合・不足記録と同じガード)
  assert.match(importBody, /ensureActiveVisitEditable\('picking'\)/);
  assert.match(importBody, /parsePickingSystemResult/);
  assert.match(importBody, /buildPickingResultApplyPlan/);
  assert.match(importBody, /window\.confirm\(/);
  // 反映フィールドは院内GS1照合と同じ(isPicked/pickedAt/pickedLotNumber/pickedExpirationDate)
  assert.match(importBody, /data\.isPicked = true/);
  assert.match(importBody, /data\.pickedAt = appliedAt/);
  assert.match(importBody, /data\.pickedLotNumber = update\.lotNumber/);
  assert.match(importBody, /data\.pickedExpirationDate = update\.expirationDate/);
  // 外部結果はGS1スキャン由来ではないため生コード欄は残さない
  assert.match(importBody, /delete data\.pickedGs1Code/);
  // 不足は既存の不足記録と同じフィールドへ
  assert.match(importBody, /data\.shortageQuantity = update\.shortageQuantity/);
  assert.match(importBody, /data\.shortageRecordedAt = appliedAt/);
  assert.match(importBody, /buildPickingResultAuditDetail/);
  assert.match(importBody, /logAuditAction\(/);
  assert.match(importBody, /現物とロット・期限の一致を確認してください/);
});

test('ピッキング支援モーダルは指示CSV・結果取込・レジロール印刷を並べて提供する', () => {
  const footer = section('data-testid="picking-instruction-export"', 'レジロール印刷');
  assert.match(footer, /指示CSV/);
  assert.match(footer, /結果取込/);
  assert.match(footer, /accept="\.csv,\.tsv,\.txt"/);
  assert.match(emrSource, /onExportInstruction: \(\) => Promise<void>/);
  assert.match(emrSource, /onImportResultFile: \(file: File\) => Promise<void>/);
});
