import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PickingSupportModal,
  getPickingLoadErrorBannerMessage,
  PICKING_LOAD_ERROR_MESSAGE,
  type PickingSupportModalProps
} from './components/PickingSupportModal';
import type { PickingItem } from '@/lib/emr_helpers';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';

const DISABLED_ATTRIBUTE_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;

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
    hasLoadError: false,
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

interface PickingStateOverrides {
  scanInput?: string;
  isVerifyingScan?: boolean;
  isImportingSystemResult?: boolean;
}

function renderWithStateOverrides(
  props: PickingSupportModalProps,
  overrides: PickingStateOverrides = {}
): string {
  const { scanInput = '', isVerifyingScan = false, isImportingSystemResult = false } = overrides;
  let callCount = 0;

  function Wrapper(): React.ReactNode {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
        H?: { useState?: (init: unknown) => [unknown, (v: unknown) => void] }
      }
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    const dispatcher = internals?.H;
    if (dispatcher?.useState) {
      const origUseState = dispatcher.useState;
      dispatcher.useState = (initialState: unknown) => {
        const currentIndex = callCount++;
        if (currentIndex === 0) {
          // 0: const [scanInput, setScanInput] = useState('');
          assert.equal(
            initialState,
            '',
            `Expected PickingSupportModal useState call #0 initial value to be '', got ${String(initialState)}`
          );
          return [scanInput, () => {}];
        }
        if (currentIndex === 2) {
          // 2: const [isVerifyingScan, setIsVerifyingScan] = useState(false);
          assert.equal(
            initialState,
            false,
            `Expected PickingSupportModal useState call #2 initial value to be false (isVerifyingScan), got ${String(initialState)}`
          );
          return [isVerifyingScan, () => {}];
        }
        if (currentIndex === 6) {
          // 6: const [isImportingSystemResult, setIsImportingSystemResult] = useState(false);
          assert.equal(
            initialState,
            false,
            `Expected PickingSupportModal useState call #6 initial value to be false (isImportingSystemResult), got ${String(initialState)}`
          );
          // Restore immediately after the last hook of PickingSupportModal so children use unpatched hook
          dispatcher.useState = origUseState;
          return [isImportingSystemResult, () => {}];
        }
        return origUseState(initialState);
      };
    }
    return React.createElement(PickingSupportModal, props);
  }

  const html = renderToStaticMarkup(React.createElement(Wrapper));
  assert.equal(
    callCount,
    7,
    `Expected PickingSupportModal to call useState exactly 7 times before children, got ${callCount}`
  );
  return html;
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

  it('pins scan submit button as disabled when scanInput is empty or whitespace-only', () => {
    const props = createMockPickingSupportModalProps();

    // Case 1: Empty scanInput
    const emptyHtml = renderWithStateOverrides(props, { scanInput: '', isVerifyingScan: false });
    const emptyBtnTag = findOpeningTag(emptyHtml, 'btn-scan-submit', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(emptyBtnTag),
      `Scan button must be disabled when scanInput is empty: ${emptyBtnTag}`
    );
    assert.ok(emptyHtml.includes('照合'), 'Scan button label should be "照合"');

    // Case 2: Whitespace-only scanInput
    const whitespaceHtml = renderWithStateOverrides(props, { scanInput: '   ', isVerifyingScan: false });
    const whitespaceBtnTag = findOpeningTag(whitespaceHtml, 'btn-scan-submit', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(whitespaceBtnTag),
      `Scan button must be disabled when scanInput is whitespace-only: ${whitespaceBtnTag}`
    );
  });

  it('pins scan submit button as enabled when barcode is entered and idle', () => {
    const props = createMockPickingSupportModalProps();
    const validHtml = renderWithStateOverrides(props, {
      scanInput: '04987001001001',
      isVerifyingScan: false
    });
    const validBtnTag = findOpeningTag(validHtml, 'btn-scan-submit', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(validBtnTag),
      `Scan button must be enabled when barcode is entered: ${validBtnTag}`
    );
    assert.ok(validHtml.includes('照合'), 'Scan button label should be "照合"');
    assert.ok(!validHtml.includes('照合中...'), 'Scan button label should not show verifying state');
  });

  it('pins scan submit button as disabled and displays verifying text when isVerifyingScan is true', () => {
    const props = createMockPickingSupportModalProps();
    const verifyingHtml = renderWithStateOverrides(props, {
      scanInput: '04987001001001',
      isVerifyingScan: true
    });
    const verifyingBtnTag = findOpeningTag(verifyingHtml, 'btn-scan-submit', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(verifyingBtnTag),
      `Scan button must be disabled when isVerifyingScan is true: ${verifyingBtnTag}`
    );
    assert.ok(verifyingHtml.includes('照合中...'), 'Scan button label should show "照合中..."');
    assert.ok(!verifyingHtml.includes('>照合</button>'), 'Scan button label should not remain idle "照合"');
  });

  it('pins result import file input disabled state and label based on isImportingSystemResult', () => {
    const props = createMockPickingSupportModalProps();

    // Idle state
    const idleHtml = renderWithStateOverrides(props, { isImportingSystemResult: false });
    const idleInputTag = findOpeningTag(idleHtml, 'file-input-hidden', 'input');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(idleInputTag),
      `File input must not be disabled when idle: ${idleInputTag}`
    );
    assert.ok(idleHtml.includes('結果取込'), 'Result import label should show "結果取込"');
    assert.ok(!idleHtml.includes('取込中...'), 'Result import label should not show "取込中..."');

    // Importing state
    const importingHtml = renderWithStateOverrides(props, { isImportingSystemResult: true });
    const importingInputTag = findOpeningTag(importingHtml, 'file-input-hidden', 'input');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(importingInputTag),
      `File input must be disabled when isImportingSystemResult is true: ${importingInputTag}`
    );
    assert.ok(importingHtml.includes('取込中...'), 'Result import label should show "取込中..."');
    assert.ok(!importingHtml.includes('>結果取込<'), 'Result import label should not show "結果取込"');
  });
});

test('getPickingLoadErrorBannerMessage returns error message when hasLoadError is true and null when false', () => {
  assert.equal(getPickingLoadErrorBannerMessage(false), null);
  assert.equal(getPickingLoadErrorBannerMessage(true), PICKING_LOAD_ERROR_MESSAGE);
});

test('PickingSupportModal renders load error banner above picking list when hasLoadError is true and hides it when false', () => {
  const withoutErrorHtml = renderToStaticMarkup(
    React.createElement(PickingSupportModal, createMockPickingSupportModalProps({ hasLoadError: false }))
  ).replace(/<style[\s\S]*?<\/style>/g, '');
  assert.ok(!withoutErrorHtml.includes(PICKING_LOAD_ERROR_MESSAGE));
  assert.ok(!withoutErrorHtml.includes('picking-load-error'));

  const withErrorHtml = renderToStaticMarkup(
    React.createElement(PickingSupportModal, createMockPickingSupportModalProps({ hasLoadError: true }))
  ).replace(/<style[\s\S]*?<\/style>/g, '');
  assert.ok(withErrorHtml.includes(PICKING_LOAD_ERROR_MESSAGE));
  assert.ok(withErrorHtml.includes('picking-load-error'));
  assert.ok(
    withErrorHtml.indexOf('picking-load-error') < withErrorHtml.indexOf('picking-list'),
    'Should render load error banner above picking-list'
  );
});
