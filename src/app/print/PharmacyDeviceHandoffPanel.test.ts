import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PharmacyDeviceHandoffPanel } from './components/PharmacyDeviceHandoffPanel';
import type { VisitPharmacyDeviceHandoff } from '@/db/types';

test('PharmacyDeviceHandoffPanel renders ready state with submit button enabled and replace/cancel disabled', () => {
  const html = renderToStaticMarkup(
    React.createElement(PharmacyDeviceHandoffPanel, {
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
      isLoadingPharmacyDeviceReadiness: false,
      pharmacyDeviceConnectorReady: true,
      pharmacyDeviceOperationBusy: false,
      pharmacyDeviceOperationInFlight: null,
      canSubmitPharmacyDevice: true,
      canReplacePharmacyDevice: false,
      canCancelPharmacyDevice: false,
      handlePharmacyDeviceOperation: () => {}
    })
  );

  // 1. ルート要素とタイトル
  assert.ok(html.includes('data-testid="pharmacy-device-handoff-panel"'), '機器連携パネル要素が存在すること');
  assert.ok(html.includes('外部調剤機器連携'), '外部調剤機器連携タイトルが表示されること');
  assert.ok(html.includes('許諾済みNSIPSゲートウェイ'), 'コネクタ種別が表示されること');

  // 2. ステータスカード（接続準備、連携結果、連携ID）
  assert.ok(html.includes('送信可能'), '送信可能ステータスが表示されること');
  assert.ok(html.includes('未送信'), '未送信ステータスが表示されること');
  assert.ok(html.includes('未発行'), '未発行IDが表示されること');

  // 3. アクションボタンの活性・非活性制御
  assert.ok(html.includes('data-testid="pharmacy-device-submit-button"'), '送信ボタンが存在すること');
  assert.ok(!html.includes('data-testid="pharmacy-device-submit-button" disabled=""'), '送信ボタンが有効であること');
  assert.ok(html.includes('data-testid="pharmacy-device-replace-button" disabled=""'), '差替ボタンがdisabledであること');
  assert.ok(html.includes('data-testid="pharmacy-device-cancel-button" disabled=""'), '取消ボタンがdisabledであること');
});

test('PharmacyDeviceHandoffPanel renders completed state with transferId, timestamps, and active replace/cancel buttons', () => {
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

  const html = renderToStaticMarkup(
    React.createElement(PharmacyDeviceHandoffPanel, {
      pharmacyDeviceFlowStatus: 'ok',
      pharmacyDeviceReadiness: null,
      pharmacyDeviceHandoff: mockHandoff,
      isLoadingPharmacyDeviceReadiness: false,
      pharmacyDeviceConnectorReady: true,
      pharmacyDeviceOperationBusy: false,
      pharmacyDeviceOperationInFlight: null,
      canSubmitPharmacyDevice: false,
      canReplacePharmacyDevice: true,
      canCancelPharmacyDevice: true,
      handlePharmacyDeviceOperation: () => {}
    })
  );

  // 1. 連携結果と転送ID
  assert.ok(html.includes('TRF-98765'), '転送IDが表示されること');
  assert.ok(html.includes('重複防止 sha256-abcde...'), 'ペイロードハッシュが表示されること');

  // 2. 差替・取消ボタンが有効
  assert.ok(!html.includes('data-testid="pharmacy-device-replace-button" disabled=""'), '差替ボタンが有効であること');
  assert.ok(!html.includes('data-testid="pharmacy-device-cancel-button" disabled=""'), '取消ボタンが有効であること');
});
