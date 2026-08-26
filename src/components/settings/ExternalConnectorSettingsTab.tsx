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
      <div className="connector-header">
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
        <div className="empty-state connector-empty">
          <Network size={32} aria-hidden="true" />
          <p>{isLoadingExternalConnectorReadiness ? '接続準備を確認しています。' : '外部連携の接続準備は未確認です。'}</p>
        </div>
      )}

      {externalConnectorReadiness && (
        <div className="connector-content">
          <div className="connector-summary-grid">
            {[
              ['総合判定', externalConnectorReadiness.overallStatus],
              ['診断版', `v${externalConnectorReadiness.schemaVersion}`],
              ['診断日時', new Date(externalConnectorReadiness.generatedAt).toLocaleString('ja-JP')],
              ['秘密情報', externalConnectorReadiness.privacy.containsEndpointUrl || externalConnectorReadiness.privacy.containsBearerToken ? '要確認' : '非表示']
            ].map(([label, value]) => (
              <div key={label} className="connector-stat-card">
                <div className="connector-stat-label">{label}</div>
                <strong className="connector-stat-value">{value}</strong>
              </div>
            ))}
          </div>

          <div className="connector-checks-list">
            {externalConnectorReadiness.checks.map((check) => (
              <section
                key={check.id}
                data-testid={`external-connector-check-${check.id}`}
                className="connector-check-card"
              >
                <div className="connector-check-head">
                  <div>
                    <h3 className="connector-check-title">{check.label}</h3>
                    <p className="help-text connector-check-sub">
                      モード {check.config.mode} / 接続先 {check.config.endpointConfigured ? '設定済み' : '未設定'} / 直近試行 {check.lastAttempt.outcomeLabel}
                    </p>
                  </div>
                  <span className={`status-chip ${check.status === 'ready' ? 'confirmed' : check.status === 'blocked' ? 'unavailable' : 'warning'}`}>
                    {check.statusLabel}
                  </span>
                </div>

                {check.id === 'electronic_prescription' && check.electronicPrescription && (
                  <div data-testid="electronic-prescription-connector-capabilities" className="connector-capabilities-grid">
                    <div className="connector-cap-box">
                      <div className="connector-cap-label">公式接続方式</div>
                      <strong>
                        {check.electronicPrescription.connectorKind === 'qualification_terminal'
                          ? '資格確認端末経由'
                          : check.electronicPrescription.connectorKind === 'web_api'
                            ? 'Web API'
                            : '未設定'}
                      </strong>
                    </div>
                    <div className="connector-cap-box">
                      <div className="connector-cap-label">必須機能</div>
                      <strong>
                        {check.electronicPrescription.configuredCapabilities.length}
                        /{check.electronicPrescription.configuredCapabilities.length + check.electronicPrescription.missingCapabilities.length}
                      </strong>
                    </div>
                    <div className="connector-cap-box">
                      <div className="connector-cap-label">未確認</div>
                      <strong>{check.electronicPrescription.missingCapabilities.length}件</strong>
                    </div>
                  </div>
                )}

                {check.id === 'pharmacy_device' && check.pharmacyDevice && (
                  <div data-testid="pharmacy-device-connector-capabilities" className="connector-capabilities-grid">
                    <div className="connector-cap-box">
                      <div className="connector-cap-label">接続方式</div>
                      <strong>
                        {check.pharmacyDevice.connectorKind === 'nsips_gateway'
                          ? '許諾済みNSIPSゲートウェイ'
                          : check.pharmacyDevice.connectorKind === 'vendor_api'
                            ? 'メーカーAPI'
                            : '未設定'}
                      </strong>
                    </div>
                    <div className="connector-cap-box">
                      <div className="connector-cap-label">連携仕様版</div>
                      <strong>{check.pharmacyDevice.interfaceVersion || '未設定'}</strong>
                    </div>
                    <div className="connector-cap-box">
                      <div className="connector-cap-label">必須機能</div>
                      <strong>
                        {check.pharmacyDevice.configuredCapabilities.length}
                        /{check.pharmacyDevice.configuredCapabilities.length + check.pharmacyDevice.missingCapabilities.length}
                      </strong>
                    </div>
                  </div>
                )}

                {check.evidence.length > 0 && (
                  <ul className="connector-evidence-list">
                    {check.evidence.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {check.requiredActions.length > 0 && (
                  <div className="connector-actions-box">
                    <strong className="connector-actions-title">残対応</strong>
                    <ul className="connector-actions-list">
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

      <style jsx>{`
        .connector-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .connector-empty {
          margin-top: 1rem;
        }
        .connector-content {
          display: grid;
          gap: 1rem;
          margin-top: 1rem;
        }
        .connector-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
        }
        .connector-stat-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          padding: 0.8rem;
        }
        .connector-stat-label {
          color: var(--text-ghost);
          fontSize: var(--fs-xs);
          font-weight: 800;
        }
        .connector-stat-value {
          display: block;
          margin-top: 0.25rem;
          color: var(--text-main);
        }
        .connector-checks-list {
          display: grid;
          gap: 0.75rem;
        }
        .connector-check-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          padding: 0.9rem;
          display: grid;
          gap: 0.75rem;
        }
        .connector-check-head {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .connector-check-title {
          margin: 0;
          font-size: 1rem;
          color: var(--text-main);
        }
        .connector-check-sub {
          margin: 0.2rem 0 0;
        }
        .connector-capabilities-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.55rem;
        }
        .connector-cap-box {
          background: #f8fafc;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.6rem;
        }
        .connector-cap-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .connector-evidence-list {
          margin: 0;
          padding-left: 1.2rem;
          color: var(--text-muted);
          font-size: var(--fs-md);
          line-height: 1.55;
        }
        .connector-actions-box {
          display: grid;
          gap: 0.35rem;
        }
        .connector-actions-title {
          color: #92400e;
          font-size: var(--fs-md);
        }
        .connector-actions-list {
          margin: 0;
          padding-left: 1.2rem;
          color: #92400e;
          font-size: var(--fs-md);
          line-height: 1.55;
        }
      `}</style>
    </div>
  );
}
