import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildTransferAuditDetail,
  buildTransferDocumentHtml,
  isTransferAuditDetail,
  parseTransferAuditDetail,
  type StockTransferRecord
} from './stock_transfer.ts';

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
