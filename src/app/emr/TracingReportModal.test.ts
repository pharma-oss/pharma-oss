import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TracingReportModal, type TracingReportModalProps } from './components/TracingReportModal';
import type { VisitTracingReport } from '@/db/types';

function createMockTracingReportModalProps(
  overrides: Partial<TracingReportModalProps> = {}
): TracingReportModalProps {
  return {
    isOpen: true,
    onClose: () => {},
    patientName: '患者 太郎',
    prescriptionItems: [
      { drugName: 'カルベジロール錠10mg', quantity: 28, usage: '1日1回 朝食後' }
    ],
    soapProblems: [
      {
        title: '#1 高血圧症',
        entries: [
          { type: 'S', text: 'めまいは特になく血圧も安定している' },
          { type: 'O', text: 'BP 128/82 mmHg' },
          { type: 'A', text: '降圧効果良好で副作用徴候なし' },
          { type: 'P', text: '現行処方を継続し次回も家庭血圧を確認' }
        ]
      }
    ],
    pharmacyInfo: {
      pharmacyName: 'テスト薬局 本店',
      pharmacyPhone: '03-1234-5678',
      pharmacyFax: '03-1234-5679',
      defaultPharmacistName: '薬剤師 花子'
    },
    onSaveReport: async () => {},
    ...overrides
  };
}

describe('TracingReportModal renderToStaticMarkup contracts', () => {
  it('exports TracingReportModal as a callable React component function', () => {
    assert.equal(typeof TracingReportModal, 'function');
  });

  it('renders nothing when isOpen is false', () => {
    const props = createMockTracingReportModalProps({ isOpen: false });
    const html = renderToStaticMarkup(React.createElement(TracingReportModal, props));
    assert.equal(html, '', 'Should render empty string when closed');
  });

  it('renders tracing report modal fields, sections, and action buttons when isOpen is true', () => {
    const props = createMockTracingReportModalProps();
    const html = renderToStaticMarkup(React.createElement(TracingReportModal, props));

    // Header & Actions
    assert.ok(html.includes('服薬情報提供書 (トレーシングレポート) 作成'), 'Should render modal title');
    assert.ok(html.includes('SOAPから自動下書き'), 'Should render auto draft button');

    // Form labels and inputs
    assert.ok(html.includes('診療科 (任意)'), 'Should render department label');
    assert.ok(html.includes('担当医師名'), 'Should render doctor name label');
    assert.ok(html.includes('報告件名'), 'Should render subject label');
    assert.ok(html.includes('ステータス'), 'Should render status label');

    // Section textareas
    assert.ok(html.includes('1. 処方薬剤概要'), 'Should render medication summary section');
    assert.ok(html.includes('2. 患者の服薬状況・主訴・経過'), 'Should render patient condition section');
    assert.ok(html.includes('3. 薬剤師アセスメント'), 'Should render assessment section');
    assert.ok(html.includes('4. 処方提案・ご検討事項'), 'Should render proposal section');

    // Footer actions
    assert.ok(html.includes('A4印刷 / PDF出力'), 'Should render print preview button');
    assert.ok(html.includes('保存'), 'Should render save button');
  });

  it('populates fields when existingReport is provided', () => {
    const existingReport: VisitTracingReport = {
      reportId: 'tr-test-existing-001',
      reportDate: '2026-10-06',
      status: 'ready',
      destinationInstitution: '聖マリア記念病院',
      destinationInstitutionCode: '1310123456',
      destinationDepartment: '循環器内科',
      destinationDoctor: '鈴木 一郎 先生',
      subject: '【服薬情報提供】残薬調整および服薬状況報告',
      medicationSummary: 'カルベジロール錠10mg 1日1回 朝食後',
      patientCondition: '朝の服用忘れが週に1〜2回あり、残薬が14錠発生している',
      assessment: '血圧は安定しているが朝の内服アドヒアランス低下が懸念される',
      proposal: '朝食後から夕食後への服用時点変更、または一包化を提案いたします',
      followUpPlan: '次回来局時に残薬数および血圧手帳の記録を確認します',
      createdAt: '2026-10-06T10:00:00Z',
      updatedAt: '2026-10-06T10:00:00Z'
    };

    const props = createMockTracingReportModalProps({
      existingReport
    });
    const html = renderToStaticMarkup(React.createElement(TracingReportModal, props));

    assert.ok(html.includes('聖マリア記念病院'), 'Should render destination institution');
    assert.ok(html.includes('value="循環器内科"'), 'Should populate destination department');
    assert.ok(html.includes('value="鈴木 一郎 先生"'), 'Should populate doctor name');
    assert.ok(html.includes('value="【服薬情報提供】残薬調整および服薬状況報告"'), 'Should populate report subject');
    assert.ok(html.includes('カルベジロール錠10mg 1日1回 朝食後'), 'Should populate medication summary');
    assert.ok(html.includes('朝の服用忘れが週に1〜2回あり'), 'Should populate patient condition');
  });
});
