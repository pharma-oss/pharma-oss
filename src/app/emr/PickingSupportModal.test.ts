import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PickingSupportModal, type PickingSupportModalProps } from './components/PickingSupportModal';
import type { PickingItem } from '@/lib/emr_helpers';

function createMockPickingSupportModalProps(
  overrides: Partial<PickingSupportModalProps> = {}
): PickingSupportModalProps {
  const dummyItemA: PickingItem = {
    itemId: 'item-001',
    drugName: 'アムロジピン錠5mg「サワイ」',
    totalQuantity: 28,
    location: 'A-02',
    isPicked: true,
    shortageQuantity: 0,
    pickedGtin: '04987001001001',
    pickedLotNumber: 'LOT-987'
  };

  const dummyItemB: PickingItem = {
    itemId: 'item-002',
    drugName: 'ロキソプロフェンNa錠60mg',
    totalQuantity: 21,
    location: 'B-15',
    isPicked: false,
    shortageQuantity: 5,
    shortageNote: 'メーカー欠品'
  };

  return {
    isOpen: true,
    onClose: () => {},
    items: [dummyItemA, dummyItemB],
    patientName: '患者 太郎',
    prescriptionId: 'rx-20261007-001',
    userId: 'user-ph-01',
    onScanGs1: async () => ({ success: true, message: '照合成功' }),
    onRecordShortage: async () => {},
    onResetPick: () => {},
    onExportInstruction: async () => {},
    onImportResultFile: async () => {},
    onPrintReceipt: () => {},
    ...overrides
  };
}

describe('PickingSupportModal renderToStaticMarkup contracts', () => {
  it('exports PickingSupportModal as a callable React component function', () => {
    assert.equal(typeof PickingSupportModal, 'function');
  });

  it('renders nothing when isOpen is false', () => {
    const props = createMockPickingSupportModalProps({ isOpen: false });
    const html = renderToStaticMarkup(React.createElement(PickingSupportModal, props));
    assert.equal(html, '', 'Should render empty string when closed');
  });

  it('renders modal header, patient info, scan form, picking cards and footer actions when isOpen is true', () => {
    const props = createMockPickingSupportModalProps();
    const html = renderToStaticMarkup(React.createElement(PickingSupportModal, props));

    // Header & Titles
    assert.ok(html.includes('GS1ピッキング支援 (リアルタイム照合)'), 'Should render modal title');
    assert.ok(html.includes('患者 太郎'), 'Should render patient name');
    assert.ok(html.includes('rx-20261007-001'), 'Should render prescription ID');

    // Barcode scan form
    assert.ok(html.includes('GS1バーコード / JANコード スキャン'), 'Should render scan form label');
    assert.ok(html.includes('照合'), 'Should render verify submit button');

    // Picking summary
    assert.ok(html.includes('進捗: <strong>1</strong> / 2 調剤完了'), 'Should render progress counts');
    assert.ok(!html.includes('全調剤完了'), 'Should not show all-picked badge when incomplete');

    // Item details
    assert.ok(html.includes('アムロジピン錠5mg「サワイ」'), 'Should render item A drug name');
    assert.ok(html.includes('A-02'), 'Should render item A location');
    assert.ok(html.includes('04987001001001'), 'Should render item A GTIN');
    assert.ok(html.includes('LOT-987'), 'Should render item A lot number');
    assert.ok(html.includes('解除'), 'Should render reset button for picked item');

    assert.ok(html.includes('ロキソプロフェンNa錠60mg'), 'Should render item B drug name');
    assert.ok(html.includes('B-15'), 'Should render item B location');
    assert.ok(html.includes('未照合'), 'Should render unpicked label for item B');
    assert.ok(html.includes('不足数: 5 (メーカー欠品)'), 'Should render shortage quantity and note');
    assert.ok(html.includes('不足記録'), 'Should render shortage button');

    // Footer actions
    assert.ok(html.includes('data-testid="picking-instruction-export"'), 'Should render instruction CSV export button');
    assert.ok(html.includes('data-testid="picking-result-import"'), 'Should render result import label');
    assert.ok(html.includes('レジロール印刷'), 'Should render print receipt button');
    assert.ok(html.includes('完了'), 'Should render complete close button');
  });

  it('renders all-picked badge when all items are picked', () => {
    const allPickedItems: PickingItem[] = [
      {
        itemId: 'item-001',
        drugName: 'アムロジピン錠5mg「サワイ」',
        totalQuantity: 28,
        isPicked: true,
        shortageQuantity: 0
      }
    ];

    const props = createMockPickingSupportModalProps({
      items: allPickedItems
    });
    const html = renderToStaticMarkup(React.createElement(PickingSupportModal, props));

    assert.ok(html.includes('全調剤完了'), 'Should render all-picked badge when all items are picked');
    assert.ok(html.includes('進捗: <strong>1</strong> / 1 調剤完了'), 'Should render 1/1 completed count');
  });
});
