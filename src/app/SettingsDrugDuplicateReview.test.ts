import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const drugMasterTabSource = readFileSync(
  new URL('../components/settings/DrugMasterSettingsTab.tsx', import.meta.url),
  'utf8'
);

test('マスタ更新タブは薬品重複点検パネルとスキャンボタンを描画する', () => {
  // UI 契約: 薬品重複点検・名寄せパネルの data-testid とボタン
  assert.match(drugMasterTabSource, /data-testid="drug-duplicate-review-section"/);
  assert.match(drugMasterTabSource, /data-testid="drug-duplicate-scan-button"/);
  assert.match(drugMasterTabSource, /重複候補を確認/);
});

test('薬品統合レビューはYJコード不一致時に統合不可を警告する', () => {
  // UI 契約: YJコード不一致グループの統合不可警告
  assert.match(drugMasterTabSource, /group\.hasYjConflict/);
  assert.match(drugMasterTabSource, /YJコードが異なるため統合不可/);
});
