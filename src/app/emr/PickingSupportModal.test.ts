import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import {
  PickingSupportModal,
  getPickingLoadErrorBannerMessage,
  INITIAL_MANUAL_VERIFY_STATE,
  PICKING_LOAD_ERROR_MESSAGE,
  submitPickingShortageSave,
  type ManualVerifyState,
  type PickingSupportModalProps
} from './components/PickingSupportModal';
import {
  buildManualPickingAuditMessage,
  executeManualVisualPicking,
  formatManualPickingMarker,
  isValidManualPickingReason,
  MANUAL_PICKING_VERIFICATION_REASONS,
  parseManualPickingReason,
  type PickingItem
} from '@/lib/emr_helpers';
import type { AuditLog, PrescriptionItem } from '@/db/types';
import { DEFAULT_ROLE_PERMISSION_POLICY } from '@/lib/audit';
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
    onManualVerify: async () => ({ success: true, message: '目視照合成功' }),
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
  editingShortageItemId?: string | null;
  isImportingSystemResult?: boolean;
  isSavingShortage?: boolean;
  manualVerifyState?: ManualVerifyState;
}

function renderWithStateOverrides(
  props: PickingSupportModalProps,
  overrides: PickingStateOverrides = {}
): string {
  const {
    scanInput = '',
    isVerifyingScan = false,
    editingShortageItemId = null,
    isImportingSystemResult = false,
    isSavingShortage = false,
    manualVerifyState = INITIAL_MANUAL_VERIFY_STATE
  } = overrides;
  return renderMarkupWithReactUseStateMock(
    () => React.createElement(PickingSupportModal, props),
    {
      componentName: 'PickingSupportModal',
      restoreAtCallIndex: 8,
      expectedCalls: 9,
      overrides: {
        0: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              '',
              `Expected PickingSupportModal useState call #0 initial value to be '', got ${String(initialState)}`
            ),
          value: scanInput
        },
        2: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              false,
              `Expected PickingSupportModal useState call #2 initial value to be false (isVerifyingScan), got ${String(initialState)}`
            ),
          value: isVerifyingScan
        },
        3: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              null,
              `Expected PickingSupportModal useState call #3 initial value to be null (editingShortageItemId), got ${String(initialState)}`
            ),
          value: editingShortageItemId
        },
        6: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              false,
              `Expected PickingSupportModal useState call #6 initial value to be false (isImportingSystemResult), got ${String(initialState)}`
            ),
          value: isImportingSystemResult
        },
        7: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              false,
              `Expected PickingSupportModal useState call #7 initial value to be false (isSavingShortage), got ${String(initialState)}`
            ),
          value: isSavingShortage
        },
        8: {
          assertInitial: (initialState) =>
            assert.deepEqual(
              initialState,
              INITIAL_MANUAL_VERIFY_STATE,
              `Expected PickingSupportModal useState call #8 initial value to be INITIAL_MANUAL_VERIFY_STATE`
            ),
          value: manualVerifyState
        }
      }
    }
  );
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

test('submitPickingShortageSave keeps shortage editor open on false return or error and closes on success', async () => {
  assert.deepEqual(
    await submitPickingShortageSave({ onSave: async () => false }),
    { shouldCloseEditor: false }
  );
  assert.deepEqual(
    await submitPickingShortageSave({
      onSave: async () => {
        throw new Error('CLAIM_LOCKED_OR_WRITE_FAILED');
      }
    }),
    { shouldCloseEditor: false }
  );
  assert.deepEqual(
    await submitPickingShortageSave({ onSave: async () => true }),
    { shouldCloseEditor: true }
  );
  assert.deepEqual(
    await submitPickingShortageSave({ onSave: async () => {} }),
    { shouldCloseEditor: true }
  );
});

test('PickingSupportModal disables close/done while busy and shortage actions while isSavingShortage is true', () => {
  const props = createMockPickingSupportModalProps();
  const busyHtml = renderWithStateOverrides(props, {
    editingShortageItemId: 'item-002',
    isSavingShortage: true
  });
  const headerCloseBtn = findOpeningTag(busyHtml, 'aria-label="閉じる"', 'button');
  const footerDoneBtn = findOpeningTag(busyHtml, '>完了</button>', 'button');
  const shortageSaveBtn = findOpeningTag(busyHtml, '>保存中...</button>', 'button');
  const shortageCancelBtn = findOpeningTag(busyHtml, '>取消</button>', 'button');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(headerCloseBtn), 'Header close button must be disabled while busy');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(footerDoneBtn), 'Footer done button must be disabled while busy');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(shortageSaveBtn), 'Shortage save button must be disabled while saving');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(shortageCancelBtn), 'Shortage cancel button must be disabled while saving');

  const idleHtml = renderWithStateOverrides(props, {
    editingShortageItemId: 'item-002',
    isSavingShortage: false
  });
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(findOpeningTag(idleHtml, 'aria-label="閉じる"', 'button')));
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(findOpeningTag(idleHtml, '>完了</button>', 'button')));
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(findOpeningTag(idleHtml, '>保存</button>', 'button')));
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(findOpeningTag(idleHtml, '>取消</button>', 'button')));
});

test('PickingSupportModal renders manual visual-check button on unpicked items, requires reason selection, and shows manual badge', () => {
  const props = createMockPickingSupportModalProps({
    items: [
      {
        itemId: 'item-manual-done',
        drugName: 'アムロジピン錠5mg',
        totalQuantity: 14,
        location: 'A-01',
        isPicked: true,
        pickedGs1Code: formatManualPickingMarker('バーコードスキャナ未導入'),
        shortageQuantity: 0
      },
      {
        itemId: 'item-unpicked',
        drugName: 'ロキソプロフェンNa錠60mg',
        totalQuantity: 21,
        location: 'B-02',
        isPicked: false,
        shortageQuantity: 0
      }
    ]
  });

  // 初期状態: 未照合品目に「目視確認で照合」ボタンがあり、目視照合済み品目に理由付きバッジが出る
  const initialHtml = renderToStaticMarkup(React.createElement(PickingSupportModal, props));
  assert.ok(initialHtml.includes('data-testid="manual-verify-open-item-unpicked"'));
  assert.ok(initialHtml.includes('目視確認で照合'));
  assert.ok(initialHtml.includes('data-testid="manual-verified-badge-item-manual-done"'));
  assert.ok(initialHtml.includes('目視照合済み（理由: バーコードスキャナ未導入）'));

  // 理由未選択では確定ボタンが disabled
  const emptyReasonHtml = renderWithStateOverrides(props, {
    manualVerifyState: { itemId: 'item-unpicked', reason: '', isSubmitting: false }
  });
  const disabledConfirmBtn = findOpeningTag(emptyReasonHtml, 'data-testid="manual-verify-confirm-item-unpicked"', 'button');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(disabledConfirmBtn), '理由未選択時は目視照合確定ボタンが disabled であること');

  // 理由選択済みなら確定ボタンが enabled
  const selectedReasonHtml = renderWithStateOverrides(props, {
    manualVerifyState: {
      itemId: 'item-unpicked',
      reason: MANUAL_PICKING_VERIFICATION_REASONS[0].label,
      isSubmitting: false
    }
  });
  const enabledConfirmBtn = findOpeningTag(selectedReasonHtml, 'data-testid="manual-verify-confirm-item-unpicked"', 'button');
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(enabledConfirmBtn), '理由選択後は目視照合確定ボタンが enabled であること');
});

test('executeManualVisualPicking enforces mandatory reason, marks item picked with marker, and writes audit log', async () => {
  assert.equal(isValidManualPickingReason(''), false);
  assert.equal(isValidManualPickingReason('任意の不正テキスト'), false);
  assert.equal(isValidManualPickingReason('バーコードスキャナ未導入'), true);
  assert.equal(parseManualPickingReason(formatManualPickingMarker('GS1・JAN未登録品目')), 'GS1・JAN未登録品目');
  assert.equal(parseManualPickingReason('0104987001001001'), null);
  assert.ok(
    buildManualPickingAuditMessage({ drugName: 'アムロジピン錠5mg', reason: 'バーコードスキャナ未導入', operatorName: '佐藤', operatorRoleLabel: '薬剤師' })
      .includes('[目視照合]')
  );

  let storedItem: PrescriptionItem = {
    itemId: 'item-100',
    visitId: 'visit-1',
    drugId: '620000001',
    dispensedDrug: 'アムロジピン錠5mg',
    amount: 1,
    days: 14,
    usage: '1日1回朝食後',
    isPicked: false,
    pickedGtin: '04987000000000'
  };
  const insertedAudits: AuditLog[] = [];
  const notifications: string[] = [];

  const mockDb = {
    prescription_items: {
      findOne: (id: string) => ({
        exec: async () => (id === 'item-100'
          ? {
            visitId: storedItem.visitId,
            dispensedDrug: storedItem.dispensedDrug,
            drugId: storedItem.drugId,
            modify: async (fn: (data: PrescriptionItem) => PrescriptionItem) => {
              storedItem = fn({ ...storedItem });
              return storedItem;
            }
          }
          : null)
      })
    },
    visits: {
      findOne: (id: string) => ({
        exec: async () => (id === 'visit-1' ? { patientId: 'pt-77' } : null)
      })
    },
    patients: {
      findOne: (id: string) => ({
        exec: async () => (id === 'pt-77' ? { name: '目視 花子' } : null)
      })
    },
    audit_logs: {
      find: () => ({ exec: async () => insertedAudits }),
      insert: async (doc: AuditLog) => {
        insertedAudits.push(doc);
        return doc;
      }
    }
  };

  // 理由が空なら拒否して DB を変更しない
  const rejected = await executeManualVisualPicking({
    db: mockDb,
    ensureActiveVisitEditable: async () => ({ ok: true }),
    itemId: 'item-100',
    reason: '',
    operatorName: '佐藤',
    operatorRoleLabel: '薬剤師',
    canVerify: true,
    permissionDeniedMessage: '権限がありません',
    notify: {
      success: (m) => notifications.push(`ok:${m}`),
      error: (m) => notifications.push(`err:${m}`),
      warning: (m) => notifications.push(`warn:${m}`)
    }
  });
  assert.equal(rejected.success, false);
  assert.equal(storedItem.isPicked, false);
  assert.equal(insertedAudits.length, 0);

  // 有効な理由で確定すると isPicked=true, MANUAL_VISUAL_CHECK マーカー付与, 監査ログ記録
  const accepted = await executeManualVisualPicking({
    db: mockDb,
    ensureActiveVisitEditable: async () => ({ ok: true }),
    itemId: 'item-100',
    reason: 'バーコードスキャナ未導入',
    operatorName: '佐藤',
    operatorRoleLabel: '薬剤師',
    canVerify: true,
    permissionDeniedMessage: '権限がありません',
    notify: {
      success: (m) => notifications.push(`ok:${m}`),
      error: (m) => notifications.push(`err:${m}`),
      warning: (m) => notifications.push(`warn:${m}`)
    }
  });
  assert.equal(accepted.success, true);
  assert.equal(storedItem.isPicked, true);
  assert.equal(parseManualPickingReason(storedItem.pickedGs1Code), 'バーコードスキャナ未導入');
  assert.equal(storedItem.pickedGtin, undefined);
  assert.equal(insertedAudits.length, 1);
  assert.ok(insertedAudits[0].details.includes('[目視照合]'));
  assert.ok(insertedAudits[0].details.includes('バーコードスキャナ未導入'));
  assert.ok(insertedAudits[0].details.includes('確認者: 佐藤（薬剤師）'));
  assert.ok(insertedAudits[0].details.includes('GS1照合なし'));
  // GS1 の裏付けが無い照合なので、患者別の監査ログ検索で拾えるよう明細の受付→患者に紐付ける
  assert.equal(insertedAudits[0].patientId, 'pt-77');
  assert.equal(insertedAudits[0].patientName, '目視 花子');
});


test('executeManualVisualPicking refuses operators without the manual picking permission before touching the item', async () => {
  let modifyCalls = 0;
  let auditInserts = 0;
  const notifications: string[] = [];
  const mockDb = {
    prescription_items: {
      findOne: () => ({
        exec: async () => ({
          visitId: 'visit-1',
          dispensedDrug: 'アムロジピン錠5mg',
          drugId: '620000001',
          modify: async () => { modifyCalls++; }
        })
      })
    },
    audit_logs: {
      find: () => ({ exec: async () => [] }),
      insert: async () => { auditInserts++; }
    }
  };
  const denied = '事務員（事務）には「ピッキングの目視照合」の権限がありません。';

  const result = await executeManualVisualPicking({
    db: mockDb,
    ensureActiveVisitEditable: async () => ({ ok: true }),
    itemId: 'item-100',
    reason: 'バーコードスキャナ未導入',
    operatorName: '事務員',
    operatorRoleLabel: '事務',
    canVerify: false,
    permissionDeniedMessage: denied,
    notify: {
      success: (m) => notifications.push(`ok:${m}`),
      error: (m) => notifications.push(`err:${m}`),
      warning: (m) => notifications.push(`warn:${m}`)
    }
  });

  assert.deepEqual(result, { success: false, message: denied });
  assert.equal(modifyCalls, 0);
  assert.equal(auditInserts, 0);
  assert.deepEqual(notifications, [`err:${denied}`]);
});

test('PickingSupportModal disables the manual visual-check button and explains why when the operator lacks the permission', () => {
  const items = [
    {
      itemId: 'item-unpicked',
      drugName: 'ロキソプロフェンNa錠60mg',
      totalQuantity: 21,
      location: 'B-02',
      isPicked: false,
      shortageQuantity: 0
    }
  ];
  const deniedMessage = '事務員（事務）には「ピッキングの目視照合」の権限がありません。';
  const deniedHtml = renderToStaticMarkup(React.createElement(PickingSupportModal, createMockPickingSupportModalProps({
    items,
    canManualVerify: false,
    manualVerifyDeniedMessage: deniedMessage
  })));
  const deniedBtn = findOpeningTag(deniedHtml, 'data-testid="manual-verify-open-item-unpicked"', 'button');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(deniedBtn), '権限が無ければ目視照合ボタンを押せない');
  assert.ok(deniedHtml.includes('data-testid="manual-verify-denied-note"'));
  assert.ok(deniedHtml.includes(deniedMessage));

  const allowedHtml = renderToStaticMarkup(React.createElement(PickingSupportModal, createMockPickingSupportModalProps({
    items,
    canManualVerify: true
  })));
  const allowedBtn = findOpeningTag(allowedHtml, 'data-testid="manual-verify-open-item-unpicked"', 'button');
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(allowedBtn), '権限があれば押せる');
  assert.ok(!allowedHtml.includes('data-testid="manual-verify-denied-note"'));
});

test('default role policy gives manual picking verification to pharmacists and admins but not clerks', () => {
  assert.ok(DEFAULT_ROLE_PERMISSION_POLICY.admin.includes('manual_picking_verification'));
  assert.ok(DEFAULT_ROLE_PERMISSION_POLICY.pharmacist.includes('manual_picking_verification'));
  assert.ok(!DEFAULT_ROLE_PERMISSION_POLICY.clerk.includes('manual_picking_verification'));
});
