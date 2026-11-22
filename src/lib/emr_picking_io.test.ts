import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrescriptionItem, Visit } from '@/db/types';
import type { EmrPickingItem } from './emr_helpers';
import {
  buildPickingResultConfirmMessage,
  executeExportPickingInstruction,
  executeImportPickingResultFile,
  executePrintPickingReceipt,
  type EmrPickingIoDbLike,
  type EmrPickingIoNotify
} from './emr_picking_io';
import type { PickingReceiptInput } from './picking_receipt';

function createNotifySpy() {
  const messages = { info: [] as string[], success: [] as string[], error: [] as string[], warning: [] as string[] };
  const notify: EmrPickingIoNotify = {
    info: (m) => messages.info.push(m),
    success: (m) => messages.success.push(m),
    error: (m) => messages.error.push(m),
    warning: (m) => messages.warning.push(m)
  };
  return { notify, messages };
}

function makePickingItem(overrides: Partial<EmrPickingItem> = {}): EmrPickingItem {
  return {
    itemId: 'item-1',
    visitId: 'visit-1',
    rpNumber: 1,
    drugId: 'd-1',
    stockDrugId: 's-1',
    prescribedDrugName: 'アムロジピン錠5mg',
    drugName: 'アムロジピン錠5mg',
    yjCode: '2171022F1020',
    janCodes: ['4987123456789'],
    amount: 1,
    totalQuantity: 14,
    usage: '1日1回朝食後',
    days: 14,
    location: 'A-1-2',
    isPicked: false,
    shortageQuantity: 0,
    stockLots: [{ id: 'lot-1', lotNumber: 'LOT01', expirationDate: '2027-06-30', quantity: 100 }],
    ...overrides
  };
}

function createFakeDb(itemsMap: Map<string, PrescriptionItem>): EmrPickingIoDbLike {
  return {
    audit_logs: {
      find: () => ({ exec: async () => [] }),
      insert: async () => ({})
    },
    patients: {
      findOne: (id: string) => ({
        exec: async () => (id === 'pt-1' ? { name: '山田 太郎', kana: 'ヤマダ タロウ' } : null)
      })
    },
    facility_settings: {
      findOne: () => ({
        exec: async () => ({ pharmacyName: 'ひまわり薬局' })
      })
    },
    prescription_items: {
      findOne: (itemId: string) => ({
        exec: async () => {
          const item = itemsMap.get(itemId);
          if (!item) return null;
          return {
            modify: async (fn: (data: PrescriptionItem) => PrescriptionItem) => {
              const next = fn(item);
              itemsMap.set(itemId, next);
              return next;
            }
          };
        }
      })
    }
  };
}

const SAMPLE_VISIT: Visit = {
  visitId: 'visit-1',
  patientId: 'pt-1',
  issueDate: '2026-11-22',
  prescriptionDate: '2026-11-22',
  dispensingDate: '2026-11-22',
  status: 'processing'
};

describe('emr_picking_io', () => {
  it('buildPickingResultConfirmMessage formats picked/shortage lines, truncates >8 updates, and lists up to 3 issues', () => {
    const updates = Array.from({ length: 10 }, (_, idx) => (
      idx === 0
        ? {
            itemId: `i-${idx}`,
            drugName: 'アムロジピン錠5mg',
            action: 'picked' as const,
            lotNumber: 'L100',
            warnings: ['払出数量が異なります。']
          }
        : {
            itemId: `i-${idx}`,
            drugName: `薬品${idx}`,
            action: 'shortage' as const,
            shortageQuantity: 3,
            warnings: []
          }
    ));
    const issues = [
      { lineNumber: 2, message: '受付ID不一致' },
      { lineNumber: 3, message: '明細なし' },
      { lineNumber: 4, message: '不足数なし' },
      { lineNumber: 5, message: '4件目は省略' }
    ];
    const msg = buildPickingResultConfirmMessage(
      {
        updates,
        issues,
        skippedAlreadyPicked: 0,
        pickedCount: 1,
        shortageCount: 9,
        canApply: true,
        summary: '照合 1件 / 不足 9件'
      },
      issues
    );
    assert.ok(msg.includes('照合: アムロジピン錠5mg (Lot L100) ※払出数量が異なります。'));
    assert.ok(msg.includes('不足: 薬品1 (3)'));
    assert.ok(msg.includes('ほか2件'));
    assert.ok(msg.includes('取込不可 4行目: 不足数なし'));
    assert.ok(!msg.includes('4件目は省略'));
  });

  it('executePrintPickingReceipt handles empty items, popup-blocked without audit, and success with audit', async () => {
    const db = createFakeDb(new Map());
    const { notify, messages } = createNotifySpy();

    const emptyRes = await executePrintPickingReceipt({
      db,
      pickingItems: [],
      findActiveVisit: async () => SAMPLE_VISIT,
      operatorName: '佐藤 薬剤師',
      notify
    });
    assert.deepStrictEqual(emptyRes, { ok: false, reason: 'empty' });
    assert.equal(messages.info.length, 1);

    let auditCalls = 0;
    const blockedRes = await executePrintPickingReceipt({
      db,
      pickingItems: [makePickingItem()],
      findActiveVisit: async () => SAMPLE_VISIT,
      operatorName: '佐藤 薬剤師',
      notify,
      openPrintWindow: () => false,
      logAudit: async () => {
        auditCalls++;
        return true;
      }
    });
    assert.deepStrictEqual(blockedRes, { ok: false, reason: 'popup_blocked' });
    assert.equal(auditCalls, 0);
    assert.ok(messages.error.some((m) => m.includes('ポップアップ')));

    let capturedInput: PickingReceiptInput | null = null;
    const okRes = await executePrintPickingReceipt({
      db,
      pickingItems: [makePickingItem()],
      findActiveVisit: async () => ({ toJSON: () => SAMPLE_VISIT }),
      operatorName: '佐藤 薬剤師',
      notify,
      openPrintWindow: (input) => {
        capturedInput = input;
        return true;
      },
      logAudit: async () => {
        auditCalls++;
        return true;
      }
    });
    assert.deepStrictEqual(okRes, { ok: true });
    assert.equal(auditCalls, 1);
    assert.ok(capturedInput !== null);
    const printed: PickingReceiptInput = capturedInput;
    assert.equal(printed.pharmacyName, 'ひまわり薬局');
    assert.equal(printed.patientName, '山田 太郎');
    assert.equal(printed.items.length, 1);
  });

  it('executeExportPickingInstruction enforces audit-first and blocks download when audit fails', async () => {
    const db = createFakeDb(new Map());
    const { notify, messages } = createNotifySpy();
    const order: string[] = [];

    const failRes = await executeExportPickingInstruction({
      db,
      pickingItems: [makePickingItem()],
      findActiveVisit: async () => SAMPLE_VISIT,
      notify,
      logAudit: async () => {
        order.push('audit-fail');
        return false;
      },
      downloadFile: () => {
        order.push('download-must-not-run');
      }
    });
    assert.deepStrictEqual(failRes, { ok: false, reason: 'audit_failed' });
    assert.deepStrictEqual(order, ['audit-fail']);
    assert.equal(messages.error.length, 1);

    let downloadedCsv = '';
    const okRes = await executeExportPickingInstruction({
      db,
      pickingItems: [makePickingItem()],
      findActiveVisit: async () => SAMPLE_VISIT,
      notify,
      logAudit: async () => {
        order.push('audit-ok');
        return true;
      },
      downloadFile: (_fileName, content) => {
        order.push('download');
        downloadedCsv = content;
      }
    });
    assert.equal(okRes.ok, true);
    assert.deepStrictEqual(order, ['audit-fail', 'audit-ok', 'download']);
    assert.ok(downloadedCsv.startsWith('\ufeff'));
    assert.ok(downloadedCsv.includes('アムロジピン錠5mg'));
    assert.equal(messages.success.length, 1);
  });

  it('executeImportPickingResultFile blocks locked visits, respects confirm cancel, and applies picked + shortage updates', async () => {
    const item1: PrescriptionItem = {
      itemId: 'item-1',
      visitId: 'visit-1',
      drugId: 'd-1',
      dispensedDrug: 'アムロジピン錠5mg',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      isPicked: false,
      pickedGs1Code: 'STALE_CODE',
      pickedGtin: 'STALE_GTIN',
      pickedStockId: 'STALE_STOCK'
    };
    const item2: PrescriptionItem = {
      itemId: 'item-2',
      visitId: 'visit-1',
      drugId: 'd-2',
      dispensedDrug: 'ロキソプロフェン錠60mg',
      amount: 3,
      days: 5,
      usage: '1日3回毎食後',
      isPicked: false
    };
    const itemsMap = new Map<string, PrescriptionItem>([
      ['item-1', item1],
      ['item-2', item2]
    ]);
    const db = createFakeDb(itemsMap);
    const { notify, messages } = createNotifySpy();
    const pickingItems = [
      makePickingItem({ itemId: 'item-1', drugName: 'アムロジピン錠5mg', totalQuantity: 14 }),
      makePickingItem({ itemId: 'item-2', drugId: 'd-2', stockDrugId: 's-2', drugName: 'ロキソプロフェン錠60mg', totalQuantity: 15 })
    ];
    const csvFile = {
      name: 'result.csv',
      text: async () => [
        '明細ID,結果,ロット番号,有効期限,不足数,備考',
        'item-1,完了,LOT999,2027-08-31,,',
        'item-2,不足,,,5,メーカー欠品'
      ].join('\n')
    };

    const lockedRes = await executeImportPickingResultFile({
      db,
      pickingItems,
      file: csvFile,
      ensureActiveVisitEditable: async () => ({ ok: false, message: '請求済みのため変更不可' }),
      findActiveVisit: async () => SAMPLE_VISIT,
      notify
    });
    assert.deepStrictEqual(lockedRes, { ok: false, reason: 'not_editable' });
    assert.ok(messages.error.includes('請求済みのため変更不可'));

    const cancelledRes = await executeImportPickingResultFile({
      db,
      pickingItems,
      file: csvFile,
      ensureActiveVisitEditable: async () => ({ ok: true }),
      findActiveVisit: async () => SAMPLE_VISIT,
      notify,
      confirmApply: () => false
    });
    assert.deepStrictEqual(cancelledRes, { ok: false, reason: 'cancelled' });
    assert.equal(itemsMap.get('item-1')?.isPicked, false);

    let auditDetail = '';
    const appliedRes = await executeImportPickingResultFile({
      db,
      pickingItems,
      file: csvFile,
      ensureActiveVisitEditable: async () => ({ ok: true }),
      findActiveVisit: async () => SAMPLE_VISIT,
      notify,
      confirmApply: () => true,
      now: () => new Date('2026-11-22T10:00:00.000Z'),
      logAudit: async (_db, _action, detail) => {
        auditDetail = detail;
        return true;
      }
    });
    assert.equal(appliedRes.ok, true);
    if (appliedRes.ok) {
      assert.equal(appliedRes.appliedCount, 2);
    }
    const updated1 = itemsMap.get('item-1');
    const updated2 = itemsMap.get('item-2');
    assert.equal(updated1?.isPicked, true);
    assert.equal(updated1?.pickedLotNumber, 'LOT999');
    assert.equal(updated1?.pickedExpirationDate, '2027-08-31');
    assert.equal(updated1?.pickedGs1Code, undefined);
    assert.equal(updated1?.pickedGtin, undefined);
    assert.equal(updated1?.pickedStockId, undefined);
    assert.equal(updated2?.shortageQuantity, 5);
    assert.equal(updated2?.shortageNote, 'メーカー欠品');
    assert.equal(updated2?.shortageRecordedAt, '2026-11-22T10:00:00.000Z');
    assert.ok(auditDetail.includes('result.csv'));
  });
});
