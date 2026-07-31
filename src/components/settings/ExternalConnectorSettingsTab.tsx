import React from 'react';
import { Loader2, RefreshCw, Network } from 'lucide-react';
import type { ExternalConnectorReadinessReport } from '@/lib/external_connector_readiness';

interface ExternalConnectorSettingsTabProps {
  externalConnectorReadiness: ExternalConnectorReadinessReport | null;
  isLoadingExternalConnectorReadiness: boolean;
  refreshExternalConnectorReadiness: () => Promise<void>;
}

export default function ExternalConnectorSettingsTab({
  externalConnectorReadiness,
  isLoadingExternalConnectorReadiness,
  refreshExternalConnectorReadiness
}: ExternalConnectorSettingsTabProps) {
  return (
    <div className="settings-section glass" data-testid="external-connector-settings">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>外部連携</h2>
          <p className="section-desc">オンライン資格確認、電子処方箋、施設内の調剤機器・POSへの接続準備を確認します。</p>
        </div>
        <button
          type="button"
          className="btn-secondary flex-center gap-2"
          onClick={refreshExternalConnectorReadiness}
          disabled={isLoadingExternalConnectorReadiness}
          data-testid="external-connector-refresh"
        >
          {isLoadingExternalConnectorReadiness ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} aria-hidden="true" />}
          <span>{isLoadingExternalConnectorReadiness ? '確認中...' : '再確認'}</span>
        </button>
      </div>

      {!externalConnectorReadiness && (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <Network size={32} aria-hidden="true" />
          <p>{isLoadingExternalConnectorReadiness ? '接続準備を確認しています。' : '外部連携の接続準備は未確認です。'}</p>
        </div>
      )}

      {externalConnectorReadiness && (
        <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {[
              ['総合判定', externalConnectorReadiness.overallStatus],
              ['診断版', `v${externalConnectorReadiness.schemaVersion}`],
              ['診断日時', new Date(externalConnectorReadiness.generatedAt).toLocaleString('ja-JP')],
              ['秘密情報', externalConnectorReadiness.privacy.containsEndpointUrl || externalConnectorReadiness.privacy.containsBearerToken ? '要確認' : '非表示']
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: '#fff', padding: '0.8rem' }}>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.75rem', fontWeight: 800 }}>{label}</div>
                <strong style={{ display: 'block', marginTop: '0.25rem', color: 'var(--text-main)' }}>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {externalConnectorReadiness.checks.map((check) => (
              <section
                key={check.id}
                data-testid={`external-connector-check-${check.id}`}
                style={{ border: '1px solid var(--border)', borderRadius: '8px', background: '#fff', padding: '0.9rem', display: 'grid', gap: '0.75rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>{check.label}</h3>
                    <p className="help-text" style={{ margin: '0.2rem 0 0' }}>
                      モード {check.config.mode} / 接続先 {check.config.endpointConfigured ? '設定済み' : '未設定'} / 直近試行 {check.lastAttempt.outcomeLabel}
                    </p>
                  </div>
                  <span className={`status-chip ${check.status === 'ready' ? 'confirmed' : check.status === 'blocked' ? 'unavailable' : 'warning'}`}>
                    {check.statusLabel}
                  </span>
                </div>

                {check.id === 'electronic_prescription' && check.electronicPrescription && (
                  <div data-testid="electronic-prescription-connector-capabilities" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>公式接続方式</div>
                      <strong>
                        {check.electronicPrescription.connectorKind === 'qualification_terminal'
                          ? '資格確認端末経由'
                          : check.electronicPrescription.connectorKind === 'web_api'
                            ? 'Web API'
                            : '未設定'}
                      </strong>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>必須機能</div>
                      <strong>
                        {check.electronicPrescription.configuredCapabilities.length}
                        /{check.electronicPrescription.configuredCapabilities.length + check.electronicPrescription.missingCapabilities.length}
                      </strong>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>未確認</div>
                      <strong>{check.electronicPrescription.missingCapabilities.length}件</strong>
                    </div>
                  </div>
                )}

                {check.id === 'pharmacy_device' && check.pharmacyDevice && (
                  <div data-testid="pharmacy-device-connector-capabilities" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>接続方式</div>
                      <strong>
                        {check.pharmacyDevice.connectorKind === 'nsips_gateway'
                          ? '許諾済みNSIPSゲートウェイ'
                          : check.pharmacyDevice.connectorKind === 'vendor_api'
                            ? 'メーカーAPI'
                            : '未設定'}
                      </strong>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>連携仕様版</div>
                      <strong>{check.pharmacyDevice.interfaceVersion || '未設定'}</strong>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>必須機能</div>
                      <strong>
                        {check.pharmacyDevice.configuredCapabilities.length}
                        /{check.pharmacyDevice.configuredCapabilities.length + check.pharmacyDevice.missingCapabilities.length}
                      </strong>
                    </div>
                  </div>
                )}

                {check.evidence.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                    {check.evidence.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {check.requiredActions.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <strong style={{ color: '#92400e', fontSize: '0.82rem' }}>残対応</strong>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#92400e', fontSize: '0.82rem', lineHeight: 1.55 }}>
                      {check.requiredActions.slice(0, 5).map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
