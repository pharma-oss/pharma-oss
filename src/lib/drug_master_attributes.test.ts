import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDrugMasterAttributes } from './drug_master_attributes.ts';

// 名称・YJコード・廃止フラグには適用開始日が無い。マスターの行は「今こうである」と
// しか言っていないので、取込済みより古いファイルの値で上書きしてはいけない。

const stored = { name: '現行名', yjCode: '1234567F1020', isAbolished: false };

test('the ordinary import takes the values the master carries', () => {
  const update = resolveDrugMasterAttributes(
    stored,
    { name: '新しい名', yjCode: '1234567F9999', isAbolished: true }
  );

  assert.deepEqual(update, {
    name: '新しい名',
    yjCode: '1234567F9999',
    isAbolished: true,
    keptStored: false
  });
});

test('a blank name or code in the master does not erase what is stored', () => {
  const update = resolveDrugMasterAttributes(stored, { name: '', yjCode: '', isAbolished: false });

  assert.equal(update.name, '現行名');
  assert.equal(update.yjCode, '1234567F1020');
});

test('an abolished flag is taken even when it turns the drug back on', () => {
  // 現行のファイルなら、廃止の取り消しもマスターの言うとおりにする
  const revived = resolveDrugMasterAttributes(
    { ...stored, isAbolished: true },
    { name: '現行名', yjCode: '1234567F1020', isAbolished: false }
  );

  assert.equal(revived.isAbolished, false);
});

test('an older master does not revive a drug that has since been abolished', () => {
  // ここが一番まずい経路。古いファイルの取込で廃止済みが復活すると、
  // 廃止コードのまま調剤・請求してしまう。
  const update = resolveDrugMasterAttributes(
    { ...stored, isAbolished: true },
    { name: '古い名', yjCode: '1234567F0000', isAbolished: false },
    { sourceIsOlderThanStored: true }
  );

  assert.deepEqual(update, {
    name: '現行名',
    yjCode: '1234567F1020',
    isAbolished: true,
    keptStored: true
  });
});

test('an older master does not abolish a drug that is still current either', () => {
  const update = resolveDrugMasterAttributes(
    stored,
    { name: '古い名', yjCode: '1234567F0000', isAbolished: true },
    { sourceIsOlderThanStored: true }
  );

  assert.equal(update.isAbolished, false);
  assert.equal(update.name, '現行名');
});

test('a stored drug missing the abolished flag is read as not abolished', () => {
  // 項目を持たない古いドキュメントを、古いファイルの取込で廃止扱いにしないこと
  const update = resolveDrugMasterAttributes(
    { name: '現行名' },
    { name: '古い名', isAbolished: true },
    { sourceIsOlderThanStored: true }
  );

  assert.equal(update.isAbolished, false);
  assert.equal(update.yjCode, undefined);
});
