import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  verifyPrintLayoutStructure,
  type PrintLayoutCheckRule
} from './visual_print_regression';
import { generateTracingReportPrintHtml } from './tracing_report';

describe('Visual Print Layout Regression Suite', () => {
  test('A4 Tracing Report HTML complies with layout rules', () => {
    const html = generateTracingReportPrintHtml(
      {
        subject: '【服薬情報提供】残薬調整のご報告',
        destinationInstitution: '日本中央病院',
        destinationDoctor: '山田 太郎 医師',
        reportDate: '2026-07-26',
        proposal: '次回処方を7日間減算ご検討ください。'
      },
      {
        pharmacyName: 'サクラ薬局',
        pharmacyPhone: '03-1234-5678',
        defaultPharmacistName: '緑川 薬剤師'
      },
      '佐藤 花子'
    );

    const rule: PrintLayoutCheckRule = {
      target: 'a4_tracing',
      requiredPageSize: 'A4',
      requiredSelectors: ['table', 'div'],
      requiredTextKeywords: [
        '服薬情報提供書',
        '日本中央病院',
        '山田 太郎 医師',
        'サクラ薬局',
        '佐藤 花子'
      ]
    };

    const result = verifyPrintLayoutStructure(html, rule);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test('Roll 80mm Picking Receipt complies with layout rules', () => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    @page { size: 80mm auto; margin: 0; }
    body { width: 72mm; font-family: monospace; font-size: 10pt; }
  </style>
</head>
<body>
  <div class="receipt-title">ピッキング指示書</div>
  <div class="patient-name">患者: 山田 太郎 様</div>
  <div class="item-line">・アムロジピン5mg 28錠 (棚: A-01)</div>
</body>
</html>
    `.trim();

    const rule: PrintLayoutCheckRule = {
      target: 'roll_80mm',
      requiredPageSize: '80mm',
      requiredSelectors: ['.receipt-title', '.patient-name'],
      requiredTextKeywords: ['ピッキング指示書', '山田 太郎']
    };

    const result = verifyPrintLayoutStructure(html, rule);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test('Detects missing required keywords and invalid page size', () => {
    const invalidHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>@page { size: B5; }</style>
</head>
<body>
  <div>領収書</div>
</body>
</html>
    `.trim();

    const rule: PrintLayoutCheckRule = {
      target: 'a4_receipt',
      requiredPageSize: 'A4',
      requiredSelectors: ['table'],
      requiredTextKeywords: ['保険薬局']
    };

    const result = verifyPrintLayoutStructure(invalidHtml, rule);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('A4')));
    assert.ok(result.errors.some((e) => e.includes('保険薬局')));
  });
});
