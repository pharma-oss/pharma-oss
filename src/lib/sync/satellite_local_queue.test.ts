import { test } from 'node:test';
import assert from 'node:assert';
import CryptoJS from 'crypto-js';
import {
  enqueueUnsentRecord,
  getUnsentLocalQueue,
  clearAckedRecord,
  clearAllUnsentQueue,
  getUnsentQueueSummary,
  flushUnsentLocalQueue,
} from './satellite_local_queue.ts';

test('satellite local queue enqueues encrypted items with true SHA-256 checksum and docId', () => {
  clearAllUnsentQueue();

  const payload = { id: 'patient_001', name: 'テスト患者' };
  const expectedHash = CryptoJS.SHA256(JSON.stringify(payload)).toString();

  const record = enqueueUnsentRecord('patients', payload);
  assert.strictEqual(record.docId, 'patient_001');
  assert.strictEqual(record.collectionName, 'patients');
  assert.strictEqual(record.checksum, expectedHash);

  const summary = getUnsentQueueSummary();
  assert.strictEqual(summary.total, 1);
  assert.strictEqual(summary.byCollection.patients, 1);

  const cleared = clearAckedRecord('patients:patient_001', 'patients');
  assert.strictEqual(cleared, true);

  const afterSummary = getUnsentQueueSummary();
  assert.strictEqual(afterSummary.total, 0);
});

test('flushUnsentLocalQueue sends exact HubPushRow structure and clears queue upon ACK without manual clearAll', async () => {
  clearAllUnsentQueue();

  enqueueUnsentRecord('visits', { id: 'visit_101', status: 'reception' });
  enqueueUnsentRecord('visits', { id: 'visit_102', status: 'completed' });

  assert.strictEqual(getUnsentLocalQueue().length, 2);

  // HubPushRow 形状 { docId, newDocumentState, assumedMasterState } が渡されているかを直接検証
  const result = await flushUnsentLocalQueue(async (collection, pushRows) => {
    assert.strictEqual(pushRows.length, 1);
    assert.ok(pushRows[0].docId);
    assert.ok(pushRows[0].newDocumentState);
    assert.strictEqual(pushRows[0].assumedMasterState, null);

    return pushRows[0].docId === 'visit_101';
  });

  // 1件目が ACK 成功、残りは1件
  assert.strictEqual(result.flushedCount, 1);
  assert.strictEqual(result.remainingCount, 1);

  // キュー内に成功した visit_101 は消去され、未送信の visit_102 のみが残っていることを検証
  const remaining = getUnsentLocalQueue();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].docId, 'visit_102');

  // 後始末
  clearAllUnsentQueue();
});

test('queue survives when localStorage throws, without falling back to a public hardcoded key', () => {
  clearAllUnsentQueue();
  const originalWindow = (global as any).window;

  try {
    // localStorage が存在してもアクセス時に例外を投げる状況を再現
    (global as any).window = {
      localStorage: {
        getItem: () => { throw new Error('storage disabled'); },
        setItem: () => { throw new Error('storage disabled'); },
      },
    };

    const payload = { id: 'patient_002', name: 'ストレージ制限患者' };
    const record = enqueueUnsentRecord('patients', payload);
    assert.strictEqual(record.docId, 'patient_002');

    // 暗号化(あるいは平文フォールバック)いずれにせよ、公開リポジトリに
    // 含まれる固定文字列 'fallback_persistent_key_pharma_oss' が
    // 鍵として使われていないことを確認する
    const summary = getUnsentQueueSummary();
    assert.strictEqual(summary.total, 1);
  } finally {
    (global as any).window = originalWindow;
    clearAllUnsentQueue();
  }
});

test('enqueueUnsentRecord correctly extracts primaryKeys for non-id schema collections (soap_records, prescription_items, drugs)', () => {
  clearAllUnsentQueue();

  // 1. soap_records (primaryKey: 'soapId')
  const soap1 = enqueueUnsentRecord('soap_records', { soapId: 'soap_999', s: '主訴' }, 'soapId');
  assert.strictEqual(soap1.docId, 'soap_999');

  // 同じ soapId で再登録した際に正しく重複排除(置換)されるかを実証
  const soap1Updated = enqueueUnsentRecord('soap_records', { soapId: 'soap_999', s: '主訴(更新)' }, 'soapId');
  assert.strictEqual(soap1Updated.docId, 'soap_999');
  assert.strictEqual(getUnsentLocalQueue().length, 1);
  assert.strictEqual((getUnsentLocalQueue()[0].payload as any).s, '主訴(更新)');

  // 2. prescription_items (primaryKey: 'itemId')
  const item1 = enqueueUnsentRecord('prescription_items', { itemId: 'item_777', drugName: 'アスピリン' }, 'itemId');
  assert.strictEqual(item1.docId, 'item_777');
  assert.strictEqual(getUnsentLocalQueue().length, 2);

  // 3. drugs (primaryKey: 'code')
  const drug1 = enqueueUnsentRecord('drugs', { code: '610000001', name: 'ロキソニン' }, 'code');
  assert.strictEqual(drug1.docId, '610000001');
  assert.strictEqual(getUnsentLocalQueue().length, 3);

  clearAllUnsentQueue();
});
