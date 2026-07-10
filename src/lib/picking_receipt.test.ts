import { test } from 'node:test';
import assert from 'node:assert';
import { buildPickingReceiptHtml } from './picking_receipt.ts';

const baseInput = {
  pharmacyName: 'テスト薬局',
  patientName: '山田 太郎',
  dispensingDate: '2026-07-06',
  operatorName: '管理者',
  printedAt: new Date('2026-07-06T14:30:00'),
  items: [
    {
      location: 'A-12',
      drugName: 'アムロジピン錠5mg',
      totalQuantity: 14,
      usage: '1日1回朝食後',
      days: 14,
      isPicked: true,
      pickedLotNumber: 'LOT-A',
      pickedExpirationDate: '2027-06'
    },
    {
      location: '',
      drugName: 'モーラステープL40mg',
      totalQuantity: 7,
      usage: '1日1回 腰部に貼付',
      days: 7,
      isPicked: false,
      shortageQuantity: 3,
      shortageNote: '棚在庫切れ'
    }
  ]
};

test('buildPickingReceiptHtml renders register-roll layout with picking evidence', () => {
  const html = buildPickingReceiptHtml(baseInput);

  assert.ok(html.includes('size: 80mm auto'), 'uses 80mm roll paper page size');
  assert.ok(html.includes('ピッキングリスト'));
  assert.ok(html.includes('テスト薬局'));
  assert.ok(html.includes('山田 太郎 様'));
  assert.ok(html.includes('調剤日: 2026-07-06'));
  assert.ok(html.includes('担当: 管理者'));
  assert.ok(html.includes('アムロジピン錠5mg'));
  assert.ok(html.includes('✓照合済 Lot LOT-A 期限 2027-06'));
  assert.ok(html.includes('未照合'));
  assert.ok(html.includes('棚未設定'), 'items without location show a placeholder');
  assert.ok(html.includes('★不足 3（棚在庫切れ）'));
  assert.ok(html.includes('GS1照合 1 / 2 件'));
  assert.ok(html.includes('不足 1品目'));
  assert.ok(html.includes('window.print()'), 'auto-triggers printing on load');
});

test('buildPickingReceiptHtml escapes HTML in user-controlled fields', () => {
  const html = buildPickingReceiptHtml({
    ...baseInput,
    patientName: '<script>alert(1)</script>',
    items: [{
      drugName: '<b>薬</b>',
      totalQuantity: 1,
      isPicked: false,
      shortageQuantity: 1,
      shortageNote: '<img src=x>'
    }]
  });

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;b&gt;薬&lt;/b&gt;'));
  assert.ok(html.includes('&lt;img src=x&gt;'));
});

test('buildPickingReceiptHtml reports no shortage when nothing is missing', () => {
  const html = buildPickingReceiptHtml({
    ...baseInput,
    items: baseInput.items.map((item) => ({ ...item, shortageQuantity: 0, shortageNote: '' }))
  });
  assert.ok(html.includes('不足なし'));
  assert.ok(!html.includes('★不足'));
});
