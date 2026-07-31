import React from 'react';
import { UploadCloud, CheckCircle, Loader2, Save, FileText, Search, Download } from 'lucide-react';
import { FacilitySettings, User } from '@/db/types';
import { DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS, type OfficialFeeCodeOverrideKey } from '@/lib/calculator';
import { type OfficialFeeCodeMasterProposal } from '@/lib/official_fee_code_overrides';
import { getPermissionDeniedMessage } from '@/lib/audit';
import { AI_ASSIST_MODE_DESCRIPTIONS, normalizeAiAssistMode } from '@/lib/ai_assist_policy';

interface FacilitySettingsTabProps {
  settings: FacilitySettings;
  currentUser: User;
  canManageFacility: boolean;
  isSavingSettings: boolean;
  isImportingOfficialFeeCodeCsv: boolean;
  isReviewingOfficialFeeCodeMasterCsv: boolean;
  officialFeeCodeMasterProposal: OfficialFeeCodeMasterProposal | null;
  handleSettingsChange: <K extends keyof FacilitySettings>(field: K, value: FacilitySettings[K]) => void;
  handleExportOfficialFeeCodeCsv: () => Promise<void>;
  handleImportOfficialFeeCodeCsv: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleReviewOfficialFeeCodeMasterCsv: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleApplyOfficialFeeCodeMasterProposal: () => Promise<void>;
  handleExportOfficialFeeCodeMasterProposalReviewCsv: () => Promise<void>;
  handleOfficialFeeCodeChange: (key: OfficialFeeCodeOverrideKey, value: string) => void;
  handleSaveSettings: () => Promise<void>;
}

export default function FacilitySettingsTab({
  settings,
  currentUser,
  canManageFacility,
  isSavingSettings,
  isImportingOfficialFeeCodeCsv,
  isReviewingOfficialFeeCodeMasterCsv,
  officialFeeCodeMasterProposal,
  handleSettingsChange,
  handleExportOfficialFeeCodeCsv,
  handleImportOfficialFeeCodeCsv,
  handleReviewOfficialFeeCodeMasterCsv,
  handleApplyOfficialFeeCodeMasterProposal,
  handleExportOfficialFeeCodeMasterProposalReviewCsv,
  handleOfficialFeeCodeChange,
  handleSaveSettings
}: FacilitySettingsTabProps) {
  return (
    <div className="settings-section glass">
      <h2>薬局・施設基準設定 (令和8年6月改定対応)</h2>
      <p className="section-desc">調剤基本料や加算の算定に用いる薬局の施設基準を設定します。<br />
      <strong style={{ color: 'var(--primary)' }}>令和8年6月1日施行の調剤報酬点数表に合わせた区分を選択できます。</strong></p>

      <h3 className="subsection-title">薬局基本情報</h3>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="pharmacyName">薬局名</label>
          <input
            id="pharmacyName"
            value={settings.pharmacyName || ''}
            onChange={(e) => handleSettingsChange('pharmacyName', e.target.value)}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label htmlFor="pharmacyCode">保険薬局コード</label>
          <input
            id="pharmacyCode"
            value={settings.pharmacyCode || ''}
            onChange={(e) => handleSettingsChange('pharmacyCode', e.target.value)}
            className="form-control"
            inputMode="numeric"
          />
        </div>

        <div className="form-group">
          <label htmlFor="pharmacyPostalCode">郵便番号</label>
          <input
            id="pharmacyPostalCode"
            value={settings.pharmacyPostalCode || ''}
            onChange={(e) => handleSettingsChange('pharmacyPostalCode', e.target.value)}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label htmlFor="pharmacyPhone">電話番号</label>
          <input
            id="pharmacyPhone"
            value={settings.pharmacyPhone || ''}
            onChange={(e) => handleSettingsChange('pharmacyPhone', e.target.value)}
            className="form-control"
          />
        </div>

        <div className="form-group form-grid-wide">
          <label htmlFor="pharmacyAddress">所在地</label>
          <input
            id="pharmacyAddress"
            value={settings.pharmacyAddress || ''}
            onChange={(e) => handleSettingsChange('pharmacyAddress', e.target.value)}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label htmlFor="registrationNumber">適格請求書登録番号</label>
          <input
            id="registrationNumber"
            value={settings.registrationNumber || ''}
            onChange={(e) => handleSettingsChange('registrationNumber', e.target.value)}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label htmlFor="defaultPharmacistName">既定の担当薬剤師</label>
          <input
            id="defaultPharmacistName"
            value={settings.defaultPharmacistName || ''}
            onChange={(e) => handleSettingsChange('defaultPharmacistName', e.target.value)}
            className="form-control"
          />
        </div>
      </div>

      <h3 className="subsection-title">施設基準</h3>
      <div className="form-group">
        <label htmlFor="baseFeeCategory">調剤基本料の区分</label>
        <select
          id="baseFeeCategory"
          value={settings.baseFeeCategory}
          onChange={(e) => handleSettingsChange('baseFeeCategory', e.target.value as FacilitySettings['baseFeeCategory'])}
          className="form-control"
        >
          <option value="1">調剤基本料1 (47点)</option>
          <option value="2">調剤基本料2 (30点)</option>
          <option value="3_a">調剤基本料3(イ) (25点)</option>
          <option value="3_b">調剤基本料3(ロ) (20点)</option>
          <option value="3_ro">調剤基本料3(ハ) (37点)</option>
          <option value="special">特別調剤基本料A (5点)</option>
          <option value="special_b">特別調剤基本料B (3点)</option>
        </select>
        <small className="help-text">処方箋受付回数や特定の医療機関への集中率に応じて選択してください。</small>
      </div>

      <div className="form-group">
        <label htmlFor="regionalSupportAddition">地域支援・医薬品供給対応体制加算</label>
        <select
          id="regionalSupportAddition"
          value={settings.regionalSupportAddition}
          onChange={(e) => handleSettingsChange('regionalSupportAddition', e.target.value as FacilitySettings['regionalSupportAddition'])}
          className="form-control"
        >
          <option value="none">算定なし</option>
          <option value="1">加算1 (27点)</option>
          <option value="2">加算2 (59点)</option>
          <option value="3">加算3 (67点)</option>
          <option value="4">加算4 (37点)</option>
          <option value="5">加算5 (59点)</option>
        </select>
        <small className="help-text">地域の医薬品供給拠点としての体制を整備している場合</small>
      </div>

      <div className="form-group checkbox-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.medicalDxAddition}
            onChange={(e) => handleSettingsChange('medicalDxAddition', e.target.checked)}
          />
          <span>電子的調剤情報連携体制整備加算 (8点)</span>
        </label>
        <small className="help-text">医療DX推進体制の施設基準に適合する場合</small>
      </div>

      <div className="form-group checkbox-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.genericDispensingReduction || false}
            onChange={(e) => handleSettingsChange('genericDispensingReduction', e.target.checked)}
          />
          <span>後発医薬品減算 (-5点)</span>
        </label>
        <small className="help-text">該当する施設基準の場合のみ選択してください。</small>
      </div>

      <h3 className="subsection-title">AI補助運用</h3>
      <div className="form-group">
        <label htmlFor="aiAssistMode">候補の表示範囲</label>
        <select
          id="aiAssistMode"
          value={normalizeAiAssistMode(settings.aiAssistMode)}
          onChange={(event) => handleSettingsChange(
            'aiAssistMode',
            event.target.value as FacilitySettings['aiAssistMode']
          )}
          className="form-control"
          data-testid="ai-assist-mode-select"
        >
          <option value="enabled">標準: 根拠付き候補をすべて表示</option>
          <option value="limited">制限: 要修正の候補だけ表示</option>
          <option value="disabled">停止: AI補助候補を表示しない</option>
        </select>
        <small className="help-text">
          {AI_ASSIST_MODE_DESCRIPTIONS[normalizeAiAssistMode(settings.aiAssistMode)]}
        </small>
      </div>

      <h3 className="subsection-title">公式算定コード</h3>
      <div className="actions" style={{ marginTop: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <span
          className="btn-tooltip-wrapper"
          data-disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : ''}
        >
          <button
            className="btn-secondary flex-center gap-2"
            type="button"
            onClick={handleExportOfficialFeeCodeCsv}
            disabled={!canManageFacility}
            data-testid="official-fee-code-csv-export"
          >
            <Download size={16} aria-hidden="true" />
            <span>CSVひな形</span>
          </button>
        </span>
        <span
          className="btn-tooltip-wrapper"
          data-disabled={isImportingOfficialFeeCodeCsv || !canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : isImportingOfficialFeeCodeCsv ? '読み込み中...' : ''}
        >
          <label
            className="btn-secondary flex-center gap-2"
            aria-disabled={isImportingOfficialFeeCodeCsv || !canManageFacility}
            style={{
              cursor: isImportingOfficialFeeCodeCsv || !canManageFacility ? 'not-allowed' : 'pointer',
              opacity: isImportingOfficialFeeCodeCsv || !canManageFacility ? 0.6 : 1
            }}
          >
            {isImportingOfficialFeeCodeCsv ? (
              <Loader2 size={16} className="spin" aria-hidden="true" />
            ) : (
              <UploadCloud size={16} aria-hidden="true" />
            )}
            <span>{isImportingOfficialFeeCodeCsv ? '読み込み中...' : 'CSVを読み込む'}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportOfficialFeeCodeCsv}
              className="hidden-input"
              disabled={isImportingOfficialFeeCodeCsv || !canManageFacility}
              data-testid="official-fee-code-csv-input"
              aria-label="公式算定コードCSVを読み込む"
            />
          </label>
        </span>
        <span
          className="btn-tooltip-wrapper"
          data-disabled={isReviewingOfficialFeeCodeMasterCsv || !canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : isReviewingOfficialFeeCodeMasterCsv ? '照合中...' : ''}
        >
          <label
            className="btn-secondary flex-center gap-2"
            aria-disabled={isReviewingOfficialFeeCodeMasterCsv || !canManageFacility}
            style={{
              cursor: isReviewingOfficialFeeCodeMasterCsv || !canManageFacility ? 'not-allowed' : 'pointer',
              opacity: isReviewingOfficialFeeCodeMasterCsv || !canManageFacility ? 0.6 : 1
            }}
          >
            {isReviewingOfficialFeeCodeMasterCsv ? (
              <Loader2 size={16} className="spin" aria-hidden="true" />
            ) : (
              <Search size={16} aria-hidden="true" />
            )}
            <span>{isReviewingOfficialFeeCodeMasterCsv ? '照合中...' : '公式表CSVで候補'}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleReviewOfficialFeeCodeMasterCsv}
              className="hidden-input"
              disabled={isReviewingOfficialFeeCodeMasterCsv || !canManageFacility}
              data-testid="official-fee-code-master-csv-input"
              aria-label="公式算定コードの公式表CSVを照合する"
            />
          </label>
        </span>
        <button
          className="btn-secondary flex-center gap-2"
          type="button"
          onClick={handleApplyOfficialFeeCodeMasterProposal}
          disabled={!officialFeeCodeMasterProposal || officialFeeCodeMasterProposal.matchedCount === 0 || !canManageFacility}
          data-testid="official-fee-code-master-apply"
        >
          <CheckCircle size={16} aria-hidden="true" />
          <span>候補を反映</span>
        </button>
        <button
          className="btn-secondary flex-center gap-2"
          type="button"
          onClick={handleExportOfficialFeeCodeMasterProposalReviewCsv}
          disabled={!officialFeeCodeMasterProposal || !canManageFacility}
          data-testid="official-fee-code-master-review-csv"
        >
          <FileText size={16} aria-hidden="true" />
          <span>照合結果CSV</span>
        </button>
      </div>
      {officialFeeCodeMasterProposal && (
        <>
          <div
            data-testid="official-fee-code-master-summary"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              color: 'var(--text-muted)',
              fontSize: '0.82rem'
            }}
          >
            <span>候補 {officialFeeCodeMasterProposal.matchedCount}件</span>
            <span>未一致 {officialFeeCodeMasterProposal.unresolvedCount}件</span>
            <span>重複 {officialFeeCodeMasterProposal.duplicateCount}件</span>
            <span>読み飛ばし {officialFeeCodeMasterProposal.skippedRowCount}行</span>
          </div>
          <div
            data-testid="official-fee-code-master-preview"
            style={{
              display: 'grid',
              gap: '0.5rem',
              marginBottom: '0.85rem'
            }}
          >
            {officialFeeCodeMasterProposal.candidates.slice(0, 8).map((candidate) => (
              <div
                key={`${candidate.key}-${candidate.officialFeeCode}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.3fr) minmax(86px, 0.6fr) minmax(0, 1.2fr) minmax(56px, 0.5fr)',
                  gap: '0.5rem',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  wordBreak: 'break-word'
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{candidate.label}</span>
                <code>{candidate.officialFeeCode}</code>
                <span>{candidate.masterName}</span>
                <span>{candidate.rowNumber}行目</span>
              </div>
            ))}
            {officialFeeCodeMasterProposal.unresolvedItems.slice(0, 5).map((item) => (
              <div
                key={`${item.key}-${item.reason}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.3fr) minmax(86px, 0.6fr) minmax(0, 1.2fr) minmax(56px, 0.5fr)',
                  gap: '0.5rem',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  wordBreak: 'break-word'
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.label}</span>
                <span>{item.reason === 'duplicate' ? '重複' : '未一致'}</span>
                <span>{item.reason === 'duplicate' ? '複数候補あり' : '候補なし'}</span>
                <span>-</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="form-grid" data-testid="official-fee-code-overrides">
        {DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.map((item) => (
          <div className="form-group" key={item.key}>
            <label htmlFor={`officialFeeCode-${item.key}`}>{item.label}</label>
            <input
              id={`officialFeeCode-${item.key}`}
              value={settings.officialFeeCodeOverrides?.[item.key] || ''}
              onChange={(e) => handleOfficialFeeCodeChange(item.key, e.target.value)}
              className="form-control"
              inputMode="numeric"
              maxLength={9}
              placeholder="9桁"
            />
          </div>
        ))}
      </div>

      <div className="actions">
        <span
          className="btn-tooltip-wrapper"
          data-disabled={isSavingSettings || !canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : isSavingSettings ? '保存中...' : ''}
        >
          <button
            className="btn-primary flex-center gap-2"
            onClick={handleSaveSettings}
            disabled={isSavingSettings || !canManageFacility}
          >
            {isSavingSettings ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
            {isSavingSettings ? '保存中...' : '設定を保存する'}
          </button>
        </span>
      </div>
    </div>
  );
}
