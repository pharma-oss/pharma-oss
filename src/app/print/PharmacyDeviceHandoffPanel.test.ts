import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VisitPharmacyDeviceHandoff } from '@/db/types';
import {
  listDisabledOpeningTags,
  findOpeningTag
} from '@/lib/test_support/html_disabled_tags';
import {
  PharmacyDeviceHandoffPanel,
  type PharmacyDeviceHandoffPanelProps
} from './components/PharmacyDeviceHandoffPanel';

function createMockPharmacyDeviceHandoffPanelProps(
  overrides?: Partial<PharmacyDeviceHandoffPanelProps>
): PharmacyDeviceHandoffPanelProps {
  return {
    pharmacyDeviceFlowStatus: 'ready',
    pharmacyDeviceReadiness: {
      status: 'ready',
      statusLabel: '準備完了',
      requiredActions: [],
      pharmacyDevice: {
        connectorKind: 'nsips_gateway',
        interfaceVersion: 'NSIPS-v2.1'
      }
    } as any,
    pharmacyDeviceHandoff: undefined,
    isLoadingPharmacyDeviceReadiness: false,
    pharmacyDeviceConnectorReady: true,
    pharmacyDeviceOperationBusy: false,
    pharmacyDeviceOperationInFlight: null,
    canSubmitPharmacyDevice: true,
    canReplacePharmacyDevice: true,
    canCancelPharmacyDevice: true,
    pharmacyDeviceBlockedTitle: undefined,
    handlePharmacyDeviceOperation: () => {},
    ...overrides
  };
}

const ACTION_BUTTONS = [
  {
    name: '送信',
    testId: 'pharmacy-device-submit-button',
    propKey: 'canSubmitPharmacyDevice' as const
  },
  {
    name: '差替',
    testId: 'pharmacy-device-replace-button',
    propKey: 'canReplacePharmacyDevice' as const
  },
  {
    name: '取消',
    testId: 'pharmacy-device-cancel-button',
    propKey: 'canCancelPharmacyDevice' as const
  }
] as const;

describe('PharmacyDeviceHandoffPanel component disabled and lifecycle contracts', () => {
  it('exports PharmacyDeviceHandoffPanel component', () => {
    assert.strictEqual(typeof PharmacyDeviceHandoffPanel, 'object');
  });

  it('renders ready state with submit button enabled and replace/cancel disabled', () => {
    const props = createMockPharmacyDeviceHandoffPanelProps({
      pharmacyDeviceFlowStatus: 'ready',
      canSubmitPharmacyDevice: true,
      canReplacePharmacyDevice: false,
      canCancelPharmacyDevice: false
    });
    const html = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, props));

    // 1. ルート要素とタイトル
    assert.ok(html.includes('data-testid="pharmacy-device-handoff-panel"'), '機器連携パネル要素が存在すること');
    assert.ok(html.includes('外部調剤機器連携'), '外部調剤機器連携タイトルが表示されること');
    assert.ok(html.includes('許諾済みNSIPSゲートウェイ'), 'コネクタ種別が表示されること');

    // 2. ステータスカード（接続準備、連携結果、連携ID）
    assert.ok(html.includes('送信可能'), '送信可能ステータスが表示されること');
    assert.ok(html.includes('未送信'), '未送信ステータスが表示されること');
    assert.ok(html.includes('未発行'), '未発行IDが表示されること');

    // 3. アクションボタンの活性・非活性制御
    const submitTag = findOpeningTag(html, 'data-testid="pharmacy-device-submit-button"', 'button');
    const replaceTag = findOpeningTag(html, 'data-testid="pharmacy-device-replace-button"', 'button');
    const cancelTag = findOpeningTag(html, 'data-testid="pharmacy-device-cancel-button"', 'button');

    assert.ok(!/\sdisabled=""(?=[\s/>]|$)/.test(submitTag), '送信ボタンが有効であること');
    assert.ok(/\sdisabled=""(?=[\s/>]|$)/.test(replaceTag), '差替ボタンがdisabledであること');
    assert.ok(/\sdisabled=""(?=[\s/>]|$)/.test(cancelTag), '取消ボタンがdisabledであること');
  });

  it('renders completed state with transferId, timestamps, and active replace/cancel buttons with disabled submit', () => {
    const mockHandoff: VisitPharmacyDeviceHandoff = {
      connectorKind: 'nsips_gateway',
      interfaceVersion: 'NSIPS-v2.1',
      transferId: 'TRF-98765',
      payloadHash: 'sha256-abcdef0123456789',
      status: 'accepted',
      lastOperation: 'submit',
      submittedAt: '2026-10-06T10:00:00.000Z',
      updatedAt: '2026-10-06T10:00:00.000Z'
    };

    const props = createMockPharmacyDeviceHandoffPanelProps({
      pharmacyDeviceFlowStatus: 'ok',
      pharmacyDeviceReadiness: null,
      pharmacyDeviceHandoff: mockHandoff,
      canSubmitPharmacyDevice: false,
      canReplacePharmacyDevice: true,
      canCancelPharmacyDevice: true
    });
    const html = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, props));

    // 1. 連携結果と転送ID
    assert.ok(html.includes('TRF-98765'), '転送IDが表示されること');
    assert.ok(html.includes('重複防止 sha256-abcde...'), 'ペイロードハッシュが表示されること');

    // 2. 差替・取消ボタンが有効、送信ボタンが無効
    const submitTag = findOpeningTag(html, 'data-testid="pharmacy-device-submit-button"', 'button');
    const replaceTag = findOpeningTag(html, 'data-testid="pharmacy-device-replace-button"', 'button');
    const cancelTag = findOpeningTag(html, 'data-testid="pharmacy-device-cancel-button"', 'button');

    assert.ok(/\sdisabled=""(?=[\s/>]|$)/.test(submitTag), '送信済み時は送信ボタンがdisabledであること');
    assert.ok(!/\sdisabled=""(?=[\s/>]|$)/.test(replaceTag), '差替ボタンが有効であること');
    assert.ok(!/\sdisabled=""(?=[\s/>]|$)/.test(cancelTag), '取消ボタンが有効であること');
  });

  it('enables all 3 action buttons when all action conditions are true', () => {
    const props = createMockPharmacyDeviceHandoffPanelProps({
      canSubmitPharmacyDevice: true,
      canReplacePharmacyDevice: true,
      canCancelPharmacyDevice: true
    });
    const html = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      0,
      `Expected 0 disabled buttons when all permitted, got: ${disabledTags.join(', ')}`
    );

    for (const btn of ACTION_BUTTONS) {
      const tag = findOpeningTag(html, `data-testid="${btn.testId}"`, 'button');
      assert.ok(
        !/\sdisabled=""(?=[\s/>]|$)/.test(tag),
        `Button ${btn.name} (${btn.testId}) must be enabled when ${btn.propKey} is true`
      );
    }
  });

  it('disables all 3 action buttons when all action conditions are false', () => {
    const props = createMockPharmacyDeviceHandoffPanelProps({
      canSubmitPharmacyDevice: false,
      canReplacePharmacyDevice: false,
      canCancelPharmacyDevice: false
    });
    const html = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      3,
      `Expected exactly 3 disabled buttons when all false, got: ${disabledTags.join(', ')}`
    );

    for (const btn of ACTION_BUTTONS) {
      const tag = findOpeningTag(html, `data-testid="${btn.testId}"`, 'button');
      assert.ok(
        /\sdisabled=""(?=[\s/>]|$)/.test(tag),
        `Button ${btn.name} (${btn.testId}) must be disabled when ${btn.propKey} is false`
      );
    }
  });

  for (const targetBtn of ACTION_BUTTONS) {
    it(`pins disabled state for ${targetBtn.name} button when ${targetBtn.propKey} is false`, () => {
      const overrides: Partial<PharmacyDeviceHandoffPanelProps> = {
        canSubmitPharmacyDevice: true,
        canReplacePharmacyDevice: true,
        canCancelPharmacyDevice: true,
        [targetBtn.propKey]: false
      };
      const props = createMockPharmacyDeviceHandoffPanelProps(overrides);
      const html = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, props));

      const disabledTags = listDisabledOpeningTags(html);
      assert.strictEqual(
        disabledTags.length,
        1,
        `Expected exactly 1 disabled button when only ${targetBtn.propKey} is false, got: ${disabledTags.join(', ')}`
      );

      const targetTag = findOpeningTag(html, `data-testid="${targetBtn.testId}"`, 'button');
      assert.ok(
        /\sdisabled=""(?=[\s/>]|$)/.test(targetTag),
        `Target button ${targetBtn.name} must have disabled=""`
      );

      for (const otherBtn of ACTION_BUTTONS) {
        if (otherBtn.testId === targetBtn.testId) continue;
        const otherTag = findOpeningTag(html, `data-testid="${otherBtn.testId}"`, 'button');
        assert.ok(
          !/\sdisabled=""(?=[\s/>]|$)/.test(otherTag),
          `Other button ${otherBtn.name} must remain enabled`
        );
      }
    });
  }

  it('reflects pharmacyDeviceOperationBusy via aria-busy attribute on actions container', () => {
    const busyProps = createMockPharmacyDeviceHandoffPanelProps({
      pharmacyDeviceOperationBusy: true
    });
    const busyHtml = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, busyProps));
    const busyTag = findOpeningTag(busyHtml, 'class="claim-lifecycle-actions"', 'div');
    assert.ok(
      busyTag.includes('aria-busy="true"'),
      `Actions container must have aria-busy="true" when busy, got: ${busyTag}`
    );

    const idleProps = createMockPharmacyDeviceHandoffPanelProps({
      pharmacyDeviceOperationBusy: false
    });
    const idleHtml = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, idleProps));
    const idleTag = findOpeningTag(idleHtml, 'class="claim-lifecycle-actions"', 'div');
    assert.ok(
      idleTag.includes('aria-busy="false"'),
      `Actions container must have aria-busy="false" when idle, got: ${idleTag}`
    );
  });

  it('renders loading spinner when pharmacyDeviceOperationInFlight is active and normal icon when idle', () => {
    const operations = ['submit', 'replace', 'cancel'] as const;

    for (const op of operations) {
      const inFlightProps = createMockPharmacyDeviceHandoffPanelProps({
        pharmacyDeviceOperationInFlight: op
      });
      const inFlightHtml = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, inFlightProps));
      assert.ok(
        inFlightHtml.includes('animate-spin'),
        `Expected animate-spin spinner when in flight for operation: ${op}`
      );
    }

    const idleProps = createMockPharmacyDeviceHandoffPanelProps({
      pharmacyDeviceOperationInFlight: null
    });
    const idleHtml = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, idleProps));
    assert.ok(
      !idleHtml.includes('animate-spin'),
      'Expected no animate-spin spinner when pharmacyDeviceOperationInFlight is null'
    );
  });

  it('applies custom pharmacyDeviceBlockedTitle to all 3 action buttons when specified', () => {
    const blockedTitle = '設定で調剤機器連携が無効化されています。';
    const props = createMockPharmacyDeviceHandoffPanelProps({
      pharmacyDeviceBlockedTitle: blockedTitle
    });
    const html = renderToStaticMarkup(React.createElement(PharmacyDeviceHandoffPanel, props));

    for (const btn of ACTION_BUTTONS) {
      const tag = findOpeningTag(html, `data-testid="${btn.testId}"`, 'button');
      assert.ok(
        tag.includes(`title="${blockedTitle}"`),
        `Button ${btn.name} (${btn.testId}) must have custom blocked title, got: ${tag}`
      );
    }
  });
});
