import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuditLog, Drug, DrugStock, PrescriptionItem, Visit } from '../db/types.ts';
import { DEMO_PATIENT_ID } from './demo_data.ts';
import { detectFefoPickingDeviation } from './stock.ts';
import {
  CONTROLLED_DRUG_LEDGER_DISCLAIMER,
  buildControlledDrugAuxiliaryLedgerCsv,
  buildControlledDrugAuxiliaryLedgerPrintHtml,
  buildControlledDrugAuxiliaryLedgerRows,
  buildInventoryStructuredAuditEntry
} from './inventory_audit_log.ts';
import { InventoryAuditToolsPanel } from '../app/inventory/components/InventoryAuditToolsPanel';

describe('G-1: FEFO picking deviation detection, structured inventory audit logs, and controlled-drug auxiliary ledger', () => {
  it('detects FEFO deviation when an earlier-expiring positive-quantity lot exists', () => {
    const lots = [
      { id: 'lot-early', lotNumber: 'LOT-EARLY', expirationDate: '2026-12-31', quantity: 20 },
      { id: 'lot-late', lotNumber: 'LOT-LATE', expirationDate: '2027-06-30', quantity: 50 }
    ];

    const deviation = detectFefoPickingDeviation(lots[1], lots, 'アムロジピン錠5mg');
    assert.ok(deviation);
    assert.equal(deviation.isDeviation, true);
    assert.equal(deviation.earliestLot.id, 'lot-early');
    assert.match(deviation.warningMessage || '', /先入先出（FEFO）注意/);
    assert.match(deviation.warningMessage || '', /LOT-EARLY/);
    assert.match(deviation.warningMessage || '', /LOT-LATE/);

    // Picking the earliest lot is NOT a deviation
    const compliant = detectFefoPickingDeviation(lots[0], lots, 'アムロジピン錠5mg');
    assert.ok(compliant);
    assert.equal(compliant.isDeviation, false);
    assert.equal(compliant.warningMessage, undefined);

    // Depleted (quantity === 0) earlier lot does NOT trigger a false-positive deviation
    const depletedEarlier = detectFefoPickingDeviation(
      lots[1],
      [
        { id: 'lot-empty', lotNumber: 'LOT-EMPTY', expirationDate: '2026-10-01', quantity: 0 },
        lots[1]
      ],
      'アムロジピン錠5mg'
    );
    assert.ok(depletedEarlier);
    assert.equal(depletedEarlier.isDeviation, false);

    // Undated picked lot cannot be judged -> null
    assert.equal(detectFefoPickingDeviation({ id: 'lot-nodate', quantity: 10 }, lots), null);
  });

  it('builds structured audit entries for cancel, return, disposal, and stocktake_variance and validates inputs', () => {
    const cancel = buildInventoryStructuredAuditEntry({
      kind: 'cancel',
      drugCode: '620000101',
      drugName: 'オキシコンチンTR錠5mg',
      quantityDelta: 14,
      lotNumber: 'LOT-01',
      expirationDate: '2027-03-31',
      reason: '処方取消による戻し'
    });
    assert.equal(cancel.actionType, 'stock_cancel');
    assert.match(cancel.detail, /\[調剤取消・在庫戻し\]/);
    assert.match(cancel.detail, /数量変動=\+14/);

    const disposal = buildInventoryStructuredAuditEntry({
      kind: 'disposal',
      drugCode: '620000101',
      drugName: 'オキシコンチンTR錠5mg',
      quantityDelta: -2,
      lotNumber: 'LOT-01',
      reason: '落床破損のため廃棄'
    });
    assert.equal(disposal.actionType, 'stock_disposal');
    assert.match(disposal.detail, /数量変動=-2/);

    const ret = buildInventoryStructuredAuditEntry({
      kind: 'return',
      drugCode: '620000202',
      drugName: 'ゾルピデム酒石酸塩錠5mg',
      quantityDelta: -100,
      reason: '卸返品'
    });
    assert.equal(ret.actionType, 'stock_return');

    const variance = buildInventoryStructuredAuditEntry({
      kind: 'stocktake_variance',
      drugCode: '620000101',
      drugName: 'オキシコンチンTR錠5mg',
      quantityDelta: -1,
      reason: '日次棚卸差異'
    });
    assert.equal(variance.actionType, 'stock_take_variance');

    assert.throws(() => buildInventoryStructuredAuditEntry({
      kind: 'disposal',
      drugCode: '620000101',
      drugName: 'オキシコンチンTR錠5mg',
      quantityDelta: 0,
      reason: 'テスト'
    }), /0 以外/);

    assert.throws(() => buildInventoryStructuredAuditEntry({
      kind: 'disposal',
      drugCode: '620000101',
      drugName: 'オキシコンチンTR錠5mg',
      quantityDelta: -1,
      reason: '   '
    }), /理由を入力/);
  });

  it('builds controlled-drug auxiliary ledger CSV and printable HTML labeled 法定帳簿の補助記録 with zero patient PII and XSS/CSV protection', () => {
    const drugs: Array<Pick<Drug, 'code' | 'yjCode' | 'name' | 'stockQuantity' | 'isNarcotic' | 'isPsychotropic'>> = [
      { code: '620000101', yjCode: '8119002G1020', name: 'オキシコンチンTR錠5mg', stockQuantity: 84, isNarcotic: true, isPsychotropic: false },
      { code: '620000202', yjCode: '1129009F1020', name: 'ゾルピデム酒石酸塩錠5mg', stockQuantity: 200, isNarcotic: false, isPsychotropic: true },
      { code: '620000999', yjCode: '2171022F1020', name: 'アムロジピン錠5mg', stockQuantity: 500, isNarcotic: false, isPsychotropic: false }
    ];
    const stockLots: DrugStock[] = [
      { id: 'st_1', drugCode: '620000101', quantity: 100, lotNumber: 'LOT-N1', expirationDate: '2027-08-31', arrivalDate: '2026-11-01', supplier: '=HYPERLINK("bad")' }
    ];
    const visits: Array<Pick<Visit, 'visitId' | 'patientId' | 'dispensingDate' | 'issueDate' | 'status'>> = [
      { visitId: 'v_1', patientId: 'pt_real_01', dispensingDate: '2026-11-10', issueDate: '2026-11-10T10:00:00Z', status: 'completed' },
      { visitId: 'v_demo', patientId: DEMO_PATIENT_ID, dispensingDate: '2026-11-10', issueDate: '2026-11-10T11:00:00Z', status: 'completed' }
    ];
    const prescriptionItems: Array<Pick<PrescriptionItem, 'visitId' | 'drugId' | 'dispensedDrugCode' | 'amount' | 'days' | 'pickedLotNumber' | 'pickedExpirationDate'>> = [
      { visitId: 'v_1', drugId: '620000101', amount: 2, days: 7, pickedLotNumber: 'LOT-N1', pickedExpirationDate: '2027-08-31' },
      // Demo visit MUST be excluded from ledger dispensing totals
      { visitId: 'v_demo', drugId: '620000101', amount: 10, days: 10, pickedLotNumber: 'LOT-N1', pickedExpirationDate: '2027-08-31' }
    ];
    const auditLogs: AuditLog[] = [
      {
        logId: 'log_disp_1',
        timestamp: '2026-11-15T12:00:00Z',
        userId: 'u_1',
        userName: '薬剤師 太郎',
        userRole: 'pharmacist',
        actionType: 'stock_disposal',
        patientId: 'pt_secret_999',
        patientName: '極秘 患者氏名',
        details: '[破損・期限切れ廃棄] / 薬品=オキシコンチンTR錠5mg (620000101) / 数量変動=-2 / ロット=LOT-N1 / 期限=2027-08-31 / 理由=破損廃棄<script>alert(1)</script>'
      }
    ];

    const rows = buildControlledDrugAuxiliaryLedgerRows({
      drugs,
      stockLots,
      visits,
      prescriptionItems,
      auditLogs,
      asOfDate: '2026-11-22'
    });

    // Non-controlled drug excluded
    assert.ok(!rows.some((r) => r.drugCode === '620000999'));
    // Dispensing total excludes demo visit (2*7 = 14, not 114)
    const dispensed = rows.find((r) => r.drugCode === '620000101' && r.eventType === '調剤払出');
    assert.equal(dispensed?.dispensedQuantity, 14);
    const disposalRow = rows.find((r) => r.drugCode === '620000101' && r.eventType === '廃棄');
    assert.equal(disposalRow?.adjustedQuantity, -2);
    const balanceRow = rows.find((r) => r.drugCode === '620000101' && r.eventType === '現在庫残高');
    assert.equal(balanceRow?.balanceQuantity, 84);

    const meta = { pharmacyName: '青山薬局<本店>', generatedAt: '2026-11-22T10:00:00Z' };
    const csv = buildControlledDrugAuxiliaryLedgerCsv(rows, meta);
    assert.ok(csv.includes('法定帳簿の補助記録'));
    assert.ok(csv.includes(CONTROLLED_DRUG_LEDGER_DISCLAIMER));
    // Rule 2: ZERO patient PII in CSV
    assert.ok(!csv.includes('極秘 患者氏名'));
    assert.ok(!csv.includes('pt_secret_999'));

    // Formula neutralization: check dangerous leading character cell gets prefixed if a cell starts with '='
    const formulaCsv = buildControlledDrugAuxiliaryLedgerCsv(
      [{
        date: '2026-11-22',
        kind: '麻薬',
        drugCode: '620000101',
        yjCode: '8119002G1020',
        drugName: '=CMD|calc',
        eventType: '受入',
        lotNumber: 'LOT-1',
        expirationDate: '2027-08-31',
        receivedQuantity: 10,
        dispensedQuantity: null,
        adjustedQuantity: null,
        balanceQuantity: null,
        note: '+FORMULA'
      }],
      meta
    );
    assert.ok(formulaCsv.includes(`"'=CMD|calc"`));
    assert.ok(formulaCsv.includes(`"'+FORMULA"`));

    const html = buildControlledDrugAuxiliaryLedgerPrintHtml(rows, meta);
    assert.ok(html.includes('法定帳簿の補助記録'));
    assert.ok(!html.includes('極秘 患者氏名'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('青山薬局&lt;本店&gt;'));
  });

  it('InventoryAuditToolsPanel renders auxiliary ledger buttons, disclaimer, and structured audit form', () => {
    const html = renderToStaticMarkup(
      React.createElement(InventoryAuditToolsPanel, {
        db: null,
        drugs: [
          {
            code: '620000101',
            name: 'オキシコンチンTR錠5mg',
            isGeneric: false,
            isNarcotic: true,
            stockQuantity: 50,
            searchNameLower: 'オキシコンチンtr錠5mg',
            searchYjCodeLower: ''
          }
        ],
        stockLots: []
      })
    );
    assert.ok(html.includes('麻薬・向精神薬 受払・残高 補助帳簿出力'));
    assert.ok(html.includes('法定帳簿の補助記録'));
    assert.ok(html.includes('controlled-ledger-csv-btn'));
    assert.ok(html.includes('controlled-ledger-print-btn'));
    assert.ok(html.includes('取消・返品・廃棄・棚卸差異の構造化記録'));
  });
});
