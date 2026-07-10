import { test } from 'node:test';
import assert from 'node:assert';
import { extractInitialQuestionnaireOcrDraft } from './initial_questionnaire_ocr.ts';

test('extractInitialQuestionnaireOcrDraft maps common questionnaire headings to fields', () => {
  const draft = extractInitialQuestionnaireOcrDraft(`
    初回質問表
    アレルギー: ペニシリン
    副作用: 眠気が強く出た薬あり
    既往歴: 高血圧
    症状: 咳が続く
    妊娠・授乳: 該当なし
    飲酒: 週1回
    備考: 錠剤が苦手
  `);

  assert.strictEqual(draft.allergies, 'ペニシリン');
  assert.match(draft.adverseDrugReactions, /眠気/);
  assert.strictEqual(draft.medicalHistory, '高血圧');
  assert.strictEqual(draft.currentSymptoms, '咳が続く');
  assert.strictEqual(draft.pregnancyLactation, '該当なし');
  assert.strictEqual(draft.lifestyle, '週1回');
  assert.strictEqual(draft.notes, '錠剤が苦手');
  assert.deepStrictEqual(draft.warnings, []);
});

test('extractInitialQuestionnaireOcrDraft keeps raw text and warns when no headings are found', () => {
  const draft = extractInitialQuestionnaireOcrDraft('読取が崩れて見出しを判定できない本文');

  assert.match(draft.rawText, /読取が崩れて/);
  assert.strictEqual(draft.allergies, '');
  assert.ok(draft.warnings.some((warning) => warning.includes('見出し')));
});
