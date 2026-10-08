import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyStockTransferIn,
  applyStockTransferOut,
  buildTransferAuditDetail,
  buildTransferDocumentHtml,
  isTransferAuditDetail,
  parseTransferAuditDetail,
  STOCK_TRANSFER_AUDIT_FAILED,
  type StockTransferRecord
} from './stock_transfer.ts';
import { AuditLogFailedError, ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';

const outRecord: StockTransferRecord = {
  direction: 'out',
  drugCode: 'D-001',
  drugName: 'アムロジピンOD錠5mg「デモ」',
  quantity: 30,
  lotNumber: 'LOT-A',
  expirationDate: '2027-12-31',
  partnerName: 'ひかり薬局 中央店',
  partnerAddress: '東京都新宿区西新宿1-1-1',
  note: '急配のため融通',
  transferredAt: '2026-07-06T10:30:00.000Z',
  operatorName: '管理者'
};

test('transfer audit detail round-trips through build and parse', () => {
  const detail = buildTransferAuditDetail(outRecord);
  assert.ok(isTransferAuditDetail(detail));
  assert.match(detail, /^分譲出庫: 「アムロジピンOD錠5mg「デモ」」\(D-001\) 数量 30/);
  assert.match(detail, /相手先 ひかり薬局 中央店/);

  const parsed = parseTransferAuditDetail(detail)!;
  assert.strictEqual(parsed.direction, 'out');
  assert.strictEqual(parsed.drugCode, 'D-001');
  assert.strictEqual(parsed.drugName, 'アムロジピンOD錠5mg「デモ」');
  assert.strictEqual(parsed.quantity, 30);
  assert.strictEqual(parsed.lotNumber, 'LOT-A');
  assert.strictEqual(parsed.expirationDate, '2027-12-31');
  assert.strictEqual(parsed.partnerName, 'ひかり薬局 中央店');
  assert.strictEqual(parsed.partnerAddress, '東京都新宿区西新宿1-1-1');
  assert.strictEqual(parsed.note, '急配のため融通');
});

test('transfer audit detail parse tolerates omitted optional fields', () => {
  const detail = buildTransferAuditDetail({
    ...outRecord,
    direction: 'in',
    lotNumber: undefined,
    expirationDate: undefined,
    partnerAddress: undefined,
    note: undefined
  });
  const parsed = parseTransferAuditDetail(detail)!;
  assert.strictEqual(parsed.direction, 'in');
  assert.strictEqual(parsed.lotNumber, undefined);
  assert.strictEqual(parsed.expirationDate, undefined);
  assert.strictEqual(parsed.partnerAddress, undefined);
  assert.strictEqual(parsed.note, undefined);
});

test('parseTransferAuditDetail ignores unrelated audit details', () => {
  assert.strictEqual(parseTransferAuditDetail('在庫引落: 何かの更新'), null);
  assert.strictEqual(isTransferAuditDetail('ピッキング不足登録: x'), false);
});

test('transfer document renders required legal fields and escapes HTML', () => {
  const html = buildTransferDocumentHtml({
    record: { ...outRecord, drugName: '<b>薬</b>', partnerName: '<script>x</script>' },
    pharmacyName: 'テスト薬局',
    pharmacyAddress: '東京都渋谷区1-2-3',
    pharmacyPhone: '03-1234-5678'
  });

  assert.match(html, /医薬品 譲渡記録書/);
  assert.match(html, /size: A5/);
  assert.match(html, /記録日: 2026\/07\/06/);
  assert.match(html, /譲渡先\(譲受者\) 名称/);
  assert.match(html, /譲渡者 名称/);
  assert.match(html, /テスト薬局/);
  assert.match(html, /3年間保存/);
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;b&gt;薬&lt;/b&gt;'));

  const inHtml = buildTransferDocumentHtml({ record: { ...outRecord, direction: 'in' }, pharmacyName: 'テスト薬局' });
  assert.match(inHtml, /医薬品 譲受記録書/);
  assert.match(inHtml, /譲渡元\(譲渡者\) 名称/);
});

// ---- 在庫の増減と法定記録(監査ログ)は一緒に成立する ----

interface FakeLot { id: string; drugCode: string; lotNumber: string; expirationDate: string; quantity: number }

// 最小の RxDB 風インメモリDB。patch は自身のフィールドを更新し、failPatchOn に一致する書き込みは失敗させる。
function createFakeStockDb(options: { stockQuantity?: number; lots?: FakeLot[]; failPatchOn?: (field: string, value: number) => boolean } = {}) {
  const drug: { name: string; stockQuantity: number; patch: (v: { stockQuantity: number }) => Promise<void> } = {
    name: 'アムロジピン錠5mg',
    stockQuantity: options.stockQuantity ?? 100,
    async patch(values) {
      if (options.failPatchOn?.('stockQuantity', values.stockQuantity)) throw new Error('drug patch failed');
      drug.stockQuantity = values.stockQuantity;
    }
  };
  const lots: FakeLot[] = (options.lots ?? []).map((lot) => ({ ...lot }));
  const lotDoc = (lot: FakeLot) => Object.assign(lot, {
    async patch(values: { quantity: number }) {
      if (options.failPatchOn?.('quantity', values.quantity)) throw new Error('lot patch failed');
      lot.quantity = values.quantity;
    },
    async remove() { lots.splice(lots.indexOf(lot), 1); }
  });
  const db = {
    drugs: { findOne: () => ({ exec: async () => drug }) },
    drug_stocks: {
      find: () => ({ exec: async () => lots.map(lotDoc) }),
      findOne: (id: string) => ({ exec: async () => { const lot = lots.find((l) => l.id === id); return lot ? lotDoc(lot) : null; } }),
      insert: async (lot: FakeLot) => { lots.push({ ...lot }); }
    }
  };
  const snapshot = () => JSON.parse(JSON.stringify({ stockQuantity: drug.stockQuantity, lots: lots.map(({ id, drugCode, lotNumber, expirationDate, quantity }) => ({ id, drugCode, lotNumber, expirationDate, quantity })) }));
  return { db, drug, lots, snapshot };
}

const twoLots: FakeLot[] = [
  { id: 'lot_late', drugCode: 'D-001', lotNumber: 'LATE', expirationDate: '2028-06-30', quantity: 60 },
  { id: 'lot_soon', drugCode: 'D-001', lotNumber: 'SOON', expirationDate: '2027-01-31', quantity: 40 }
];
const outInput = { drugCode: 'D-001', quantity: 50, partnerName: 'ひかり薬局 中央店' };
const inInput = { drugCode: 'D-001', quantity: 20, partnerName: 'ひかり薬局 中央店', lotNumber: 'NEW', expirationDate: '2029-03-31' };

test('applyStockTransferOut draws the lots by expiry, lowers the stock, and records the statutory entry once', async () => {
  const { db, drug, lots } = createFakeStockDb({ lots: twoLots });
  const details: string[] = [];

  const record = await applyStockTransferOut(db, outInput, { logAudit: async (_db, detail) => { details.push(detail); return true; } });

  assert.strictEqual(drug.stockQuantity, 50);
  assert.strictEqual(lots.find((l) => l.id === 'lot_soon')!.quantity, 0, 'the lot that expires first is used up first');
  assert.strictEqual(lots.find((l) => l.id === 'lot_late')!.quantity, 50);
  assert.strictEqual(record.lotNumber, 'SOON,LATE');
  assert.deepStrictEqual(details, [buildTransferAuditDetail(record)], 'the entry is the statutory record, written once');
});

test('applyStockTransferOut gives the stock and every lot back when the statutory entry cannot be recorded', async () => {
  const { db, snapshot } = createFakeStockDb({ lots: twoLots });
  const before = snapshot();

  await assert.rejects(
    () => applyStockTransferOut(db, outInput, { logAudit: async () => false }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.message, STOCK_TRANSFER_AUDIT_FAILED);
      assert.strictEqual(error.rollbackFailed, false);
      return true;
    }
  );

  assert.deepStrictEqual(snapshot(), before, 'drug stock and both lots are exactly as before');
});

test('applyStockTransferOut says so when the undo fails too', async () => {
  let writes = 0;
  // 引き落としの3書き込み(ロット2つ+薬品)は通し、取り消しの書き込みだけ失敗させる
  const { db } = createFakeStockDb({ lots: twoLots, failPatchOn: () => ++writes > 3 });

  await assert.rejects(
    () => applyStockTransferOut(db, outInput, { logAudit: async () => false }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.rollbackFailed, true);
      assert.ok(error.message.endsWith(ROLLBACK_ALSO_FAILED_NOTE));
      return true;
    }
  );
});

test('applyStockTransferOut writes nothing when the lots cannot cover the quantity', async () => {
  // 薬品マスタの在庫数(100)はあるが、ロットの合計(70)が足りない: 以前はロットだけ減ったまま例外になった
  const { db, snapshot } = createFakeStockDb({ stockQuantity: 100, lots: [
    { id: 'lot_a', drugCode: 'D-001', lotNumber: 'A', expirationDate: '2027-01-31', quantity: 40 },
    { id: 'lot_b', drugCode: 'D-001', lotNumber: 'B', expirationDate: '2028-01-31', quantity: 30 }
  ] });
  const before = snapshot();
  let audited = false;

  await assert.rejects(
    () => applyStockTransferOut(db, { ...outInput, quantity: 90 }, { logAudit: async () => { audited = true; return true; } }),
    /ロット在庫の合計が数量に足りません/
  );

  assert.deepStrictEqual(snapshot(), before);
  assert.strictEqual(audited, false);
});

test('applyStockTransferOut undoes the lots already drawn when a later write fails', async () => {
  // 2つ目のロットの書き込みで失敗(1つ目は書き込み済み)
  const { db, snapshot } = createFakeStockDb({ lots: twoLots, failPatchOn: (field, value) => field === 'quantity' && value === 50 });
  const before = snapshot();
  let audited = false;

  await assert.rejects(
    () => applyStockTransferOut(db, outInput, { logAudit: async () => { audited = true; return true; } }),
    /lot patch failed/
  );

  assert.deepStrictEqual(snapshot(), before, 'the lot written before the failure is put back');
  assert.strictEqual(audited, false, 'nothing is recorded for a transfer that did not happen');
});

test('applyStockTransferIn registers the lot and raises the stock, and records the statutory entry once', async () => {
  const { db, drug, lots } = createFakeStockDb({ lots: twoLots });
  const details: string[] = [];

  const record = await applyStockTransferIn(db, inInput, { logAudit: async (_db, detail) => { details.push(detail); return true; } });

  assert.strictEqual(drug.stockQuantity, 120);
  assert.strictEqual(lots.length, 3);
  assert.ok(lots.some((l) => l.lotNumber === 'NEW' && l.quantity === 20));
  assert.deepStrictEqual(details, [buildTransferAuditDetail(record)]);
});

test('applyStockTransferIn removes the new lot and restores the stock when the statutory entry cannot be recorded', async () => {
  const { db, snapshot } = createFakeStockDb({ lots: twoLots });
  const before = snapshot();

  await assert.rejects(
    () => applyStockTransferIn(db, inInput, { logAudit: async () => false }),
    (error: unknown) => error instanceof AuditLogFailedError && error.message === STOCK_TRANSFER_AUDIT_FAILED
  );

  assert.deepStrictEqual(snapshot(), before, 'no leftover lot, stock back to the original count');
});

test('applyStockTransferIn removes the new lot when the stock update fails', async () => {
  const { db, snapshot } = createFakeStockDb({ lots: twoLots, failPatchOn: (field) => field === 'stockQuantity' });
  const before = snapshot();

  await assert.rejects(() => applyStockTransferIn(db, inInput, { logAudit: async () => true }), /drug patch failed/);

  assert.deepStrictEqual(snapshot(), before);
});
