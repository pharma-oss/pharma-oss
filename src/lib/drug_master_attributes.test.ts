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

test('resolveDrugMasterAttributes takes unitText and unitCode from master and preserves stored when missing', () => {
  const storedWithUnit = {
    name: '現行名',
    yjCode: '1234567F1020',
    unitText: '錠',
    unitCode: '001'
  };

  // 通常取込で新しい単位があれば更新
  const updated = resolveDrugMasterAttributes(storedWithUnit, {
    name: '現行名',
    isAbolished: false,
    unitText: 'カプセル',
    unitCode: '002'
  });
  assert.equal(updated.unitText, 'カプセル');
  assert.equal(updated.unitCode, '002');

  // 取込元に単位列がない場合は手元の単位を保持
  const preserved = resolveDrugMasterAttributes(storedWithUnit, {
    name: '現行名',
    isAbolished: false
  });
  assert.equal(preserved.unitText, '錠');
  assert.equal(preserved.unitCode, '001');

  // 古いファイルの場合は手元の単位を保持
  const olderPreserved = resolveDrugMasterAttributes(
    storedWithUnit,
    { name: '古い名', isAbolished: false, unitText: '包', unitCode: '003' },
    { sourceIsOlderThanStored: true }
  );
  assert.equal(olderPreserved.unitText, '錠');
  assert.equal(olderPreserved.unitCode, '001');
});

