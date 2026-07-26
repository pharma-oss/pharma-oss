import { test } from 'node:test';
import assert from 'node:assert';
import type { Drug } from '../db/types.ts';
import {
  applyDrugMasterRollback,
  buildDrugMasterSyncPreview
} from './drug_master_sync.ts';

const drugA: Drug = {
  code: '610000001',
  name: 'アスピリン錠100mg',
  yjCode: '1179001F1022',
  price: 10.5,
  isGeneric: false,
  isAbolished: false
};

const drugB: Drug = {
  code: '610000002',
  name: 'ロキソニン錠60mg',
  yjCode: '1149019F1023',
  price: 15.2,
  isGeneric: false,
  isAbolished: false
};

const drugBUpdated: Drug = {
  ...drugB,
  price: 16.0
};

const drugC: Drug = {
  code: '610000003',
  name: 'カロナール錠200mg',
  yjCode: '1141007F1020',
  price: 9.8,
  isGeneric: true,
  isAbolished: false
};

test('buildDrugMasterSyncPreview generates diff, summary, and valid rollback payload', () => {
  const currentDrugs = [drugA, drugB];
  const incomingDrugs = [drugA, drugBUpdated, drugC];

  const preview = buildDrugMasterSyncPreview({
    currentDrugs,
    incomingDrugs
  });

  assert.strictEqual(preview.summary.changedCount, 2); // 1 updated, 1 new
  assert.strictEqual(preview.summary.newCount, 1);
  assert.strictEqual(preview.summary.updatedCount, 1);
  assert.strictEqual(preview.nextDrugList.length, 3);

  // Test Rollback
  const rollbackResult = applyDrugMasterRollback({
    currentDrugs: preview.nextDrugList,
    rollbackPayload: preview.rollbackPayload
  });

  assert.strictEqual(rollbackResult.ok, true);
  assert.ok(rollbackResult.restoredDrugs);
  assert.strictEqual(rollbackResult.restoredDrugs.length, 2);
  const restoredB = rollbackResult.restoredDrugs.find((d) => d.code === drugB.code);
  assert.strictEqual(restoredB?.price, 15.2); // Original price restored
});
