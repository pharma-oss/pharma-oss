import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExternalConnectorSettingsTab from '@/components/settings/ExternalConnectorSettingsTab';
import { GET } from '@/app/api/system/connector-readiness/route';
import type { ExternalConnectorReadinessReport } from '@/lib/external_connector_readiness';

function createMockReadinessReport(): ExternalConnectorReadinessReport {
  return {
    type: 'yakureki-external-connector-readiness',
    schemaVersion: 9,
    generatedAt: '2026-10-06T12:00:00.000Z',
    overallStatus: 'ready',
    privacy: {
      containsEndpointUrl: false,
      containsBearerToken: false,
      omittedData: ['bearerToken', 'endpointUrl']
    },
    checks: [
      {
        id: 'online_eligibility',
        label: 'オンライン資格確認端末連携',
        status: 'ready',
        statusLabel: '接続準備完了',
        config: {
          mode: 'production',
          mockFallbackAllowed: false,
          endpointConfigured: true,
          endpointHostKind: 'private_network',
          timeoutMs: 5000,
          timeoutValid: true
        },
        lastAttempt: {
          attemptRecorded: true,
          outcome: 'success',
          outcomeLabel: '直近接続成功',
          attemptedAt: '2026-10-06T12:00:00.000Z',
          durationStatus: 'ok',
          responseShape: 'json_object',
          privacy: {
            containsRequestBody: false,
            containsResponseBody: false,
            containsEndpointUrl: false,
            containsBearerToken: false
          }
        },
        evidence: ['ローカル資格確認端末とのHTTP通信疎通確認済み'],
        requiredActions: []
      },
      {
        id: 'electronic_prescription',
        label: '電子処方箋管理サービス連携',
        status: 'ready',
        statusLabel: '機能準備完了',
        config: {
          mode: 'production',
          mockFallbackAllowed: false,
          endpointConfigured: true,
          endpointHostKind: 'private_network',
          timeoutMs: 8000,
          timeoutValid: true
        },
        lastAttempt: {
          attemptRecorded: true,
          outcome: 'success',
          outcomeLabel: '処方箋引換照合成功',
          attemptedAt: '2026-10-06T12:00:00.000Z',
          durationStatus: 'ok',
          responseShape: 'json_object',
          privacy: {
            containsRequestBody: false,
            containsResponseBody: false,
            containsEndpointUrl: false,
            containsBearerToken: false
          }
        },
        electronicPrescription: {
          connectorKind: 'qualification_terminal',
          configuredCapabilities: ['prescription_fetch', 'dispensing_result'],
          missingCapabilities: [],
          requiredDisplayItems: {
            configured: ['patient_name', 'prescription_date'],
            missing: []
          },
          sharedFolder: {
            mode: 'polling',
            retryPolicyConfirmed: true
          }
        },
        evidence: ['電子処方箋サーバーとの引換番号照合確認済み'],
        requiredActions: []
      },
      {
        id: 'pharmacy_device',
        label: '調剤機器・分包機連携 (NSIPS)',
        status: 'attention',
        statusLabel: '一部設定待ち',
        config: {
          mode: 'production',
          mockFallbackAllowed: false,
          endpointConfigured: true,
          endpointHostKind: 'localhost',
          timeoutMs: 3000,
          timeoutValid: true
        },
        lastAttempt: {
          attemptRecorded: false,
          outcome: 'not_run',
          outcomeLabel: '未試行',
          attemptedAt: '2026-10-06T12:00:00.000Z',
          durationStatus: 'unknown',
          responseShape: 'unknown',
          privacy: {
            containsRequestBody: false,
            containsResponseBody: false,
            containsEndpointUrl: false,
            containsBearerToken: false
          }
        },
        pharmacyDevice: {
          connectorKind: 'nsips_gateway',
          interfaceVersion: 'NSIPS Ver 1.4',
          facilityLocalOnlyConfirmed: true,
          nsipsLicenseConfirmed: true,
          configuredCapabilities: ['prescription_submit', 'prescription_replace'],
          missingCapabilities: []
        },
        evidence: ['NSIPS共有フォルダ書き出し権限確認済み'],
        requiredActions: ['分包機側受信フォルダの監視開始を確認してください']
      }
    ]
  };
}

describe('SettingsExternalConnector contracts and API readiness', () => {
  it('exports ExternalConnectorSettingsTab as a callable React component function', () => {
    assert.equal(typeof ExternalConnectorSettingsTab, 'function');
  });

  it('renders unconfirmed empty state with refresh button when report is null', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExternalConnectorSettingsTab, {
        externalConnectorReadiness: null,
        isLoadingExternalConnectorReadiness: false,
        refreshExternalConnectorReadiness: async () => {}
      })
    );

    assert.ok(html.includes('外部連携の接続準備は未確認です。'), 'Should render unconfirmed message');
    assert.ok(html.includes('data-testid="external-connector-refresh"'), 'Refresh button should be present');
    assert.ok(!html.includes('disabled=""'), 'Refresh button should not be disabled when not loading');
  });

  it('renders loading state with disabled refresh button and spinner', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExternalConnectorSettingsTab, {
        externalConnectorReadiness: null,
        isLoadingExternalConnectorReadiness: true,
        refreshExternalConnectorReadiness: async () => {}
      })
    );

    assert.ok(html.includes('接続準備を確認しています。'), 'Should render loading message');
    assert.ok(html.includes('確認中...'), 'Button should label loading');
    assert.ok(html.includes('disabled=""'), 'Button should be disabled during loading');
  });

  it('renders summary statistics, connector cards, capabilities, and action items when report is present', () => {
    const report = createMockReadinessReport();
    const html = renderToStaticMarkup(
      React.createElement(ExternalConnectorSettingsTab, {
        externalConnectorReadiness: report,
        isLoadingExternalConnectorReadiness: false,
        refreshExternalConnectorReadiness: async () => {}
      })
    );

    // Summary statistics cards
    assert.ok(html.includes('総合判定'), 'Should render overall status stat card');
    assert.ok(html.includes('診断版'), 'Should render schema version stat card');
    assert.ok(html.includes('v9'), 'Should render version string');
    assert.ok(html.includes('秘密情報'), 'Should render privacy stat card');
    assert.ok(html.includes('非表示'), 'Should show hidden privacy status');

    // Individual connector check cards
    assert.ok(html.includes('data-testid="external-connector-check-online_eligibility"'), 'Should render online eligibility check');
    assert.ok(html.includes('data-testid="external-connector-check-electronic_prescription"'), 'Should render electronic prescription check');
    assert.ok(html.includes('data-testid="external-connector-check-pharmacy_device"'), 'Should render pharmacy device check');

    // Electronic prescription capabilities
    assert.ok(html.includes('data-testid="electronic-prescription-connector-capabilities"'), 'Should render e-prescription capabilities');
    assert.ok(html.includes('資格確認端末経由'), 'Should render official connection mode');

    // Pharmacy device NSIPS capabilities
    assert.ok(html.includes('data-testid="pharmacy-device-connector-capabilities"'), 'Should render pharmacy device capabilities');
    assert.ok(html.includes('許諾済みNSIPSゲートウェイ'), 'Should render NSIPS gateway label');
    assert.ok(html.includes('NSIPS Ver 1.4'), 'Should render interface version');

    // Required actions
    assert.ok(html.includes('残対応'), 'Should render action items title');
    assert.ok(html.includes('分包機側受信フォルダの監視開始を確認してください'), 'Should render required action item');
  });

  it('connector readiness GET endpoint returns comprehensive connector metadata', async () => {
    const response = await GET();
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.ok(data);
    assert.equal(data.type, 'yakureki-external-connector-readiness');
    assert.ok(data.checks);
    assert.ok(Array.isArray(data.checks));
    assert.ok(data.overallStatus);
    assert.equal(data.privacy.containsBearerToken, false);
  });
});
