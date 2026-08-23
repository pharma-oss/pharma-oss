import React from 'react';
import { BookOpen, AlertTriangle } from 'lucide-react';
import { COMMON_RECEIPT_REMARKS } from '@/lib/data/receipt_remarks';
import type { MedicationInfoPrintContent } from '@/lib/patient_medication_info';
import type { PharmacyInfo } from '../types';
import {
  getDisplayDrugName,
  getPrescribedDrugName,
  getAmountText,
  getFormulationLabel,
  getDrugShapeClass,
  getTimingBadges,
  getMedicationFlags,
  getPickingEvidence
} from '../helpers';

export interface DrugInfoPrintProps {
  patientData: any;
  visitData: any;
  prescriptionItems: any[];
  pharmacyInfo: PharmacyInfo;
  pharmacyAddressLine: string;
  receiptRunId: string;
  patientBirthDateStr: string;
  dispensingDateStr: string;
  prescriptionDateStr: string;
  medicationInfoFallbackCount: number;
  getMedicationInfoContent: (item: any) => MedicationInfoPrintContent;
  canEditBilling: boolean;
  remarks: Record<string, string>;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
  handleToggleIppoka: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleToggleCrushed: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleItemClaimToggle: (itemId: string, field: string, checked: boolean, idx: number) => Promise<void>;
  handleTokkanChange: (itemId: string, value: string, idx: number) => Promise<void>;
  handleReceiptRemarkChange: (itemId: string, value: string, idx: number) => void;
  handleBillingAgentOverrideLocalChange: (itemId: string, field: string, value: string, idx: number) => void;
  persistBillingAgentOverride: (itemId: string, idx: number) => Promise<void>;
}

export const DrugInfoPrint = React.memo(function DrugInfoPrint({
  patientData,
  visitData,
  prescriptionItems,
  pharmacyInfo,
  pharmacyAddressLine,
  receiptRunId,
  patientBirthDateStr,
  dispensingDateStr,
  prescriptionDateStr,
  medicationInfoFallbackCount,
  getMedicationInfoContent,
  canEditBilling,
  remarks,
  renderIdentityMark,
  handleToggleIppoka,
  handleToggleCrushed,
  handleItemClaimToggle,
  handleTokkanChange,
  handleReceiptRemarkChange,
  handleBillingAgentOverrideLocalChange,
  persistBillingAgentOverride
}: DrugInfoPrintProps) {
  return (
    <section className="print-preview-card card paper-preview-card">
      <div className="preview-header no-print">
        <div>
          <h3><BookOpen size={18} aria-hidden="true" /> 薬剤情報提供文書</h3>
        </div>
      </div>

      {medicationInfoFallbackCount > 0 && (
        <div className="fallback-alert no-print" role="alert" data-testid="medication-info-fallback-alert">
          <AlertTriangle size={17} aria-hidden="true" />
          承認済み薬情がない薬剤 {medicationInfoFallbackCount}件。定型文で印刷されます。
        </div>
      )}

      <div className="print-document yakujo-doc drug-info-doc" data-testid="drug-info-doc">
        <div className="drug-info-titlebar">
          <div>
            <div className="doc-title">薬剤情報提供文書</div>
            <div className="doc-submeta">処方日 {prescriptionDateStr} / 調剤日 {dispensingDateStr}</div>
          </div>
          <div className="drug-info-stamp-stack">
            {renderIdentityMark('compact')}
            <div className="drug-info-pharmacy-stamp">
              <strong>{pharmacyInfo.name}</strong>
              <span>担当 {pharmacyInfo.pharmacistName}</span>
            </div>
          </div>
        </div>

        <div className="drug-info-patient-line">
          <strong>{patientData.name} 様</strong>
          <span>生年月日 {patientBirthDateStr}</span>
          <span>処方元 {visitData.institutionName || visitData.institutionId || '未設定'}</span>
          <span>受付番号 {receiptRunId}</span>
        </div>

        <div className="drug-info-list">
          {prescriptionItems.length > 0 ? (
            prescriptionItems.map((item, idx) => {
              const medicationInfo = getMedicationInfoContent(item);
              return (
                <section className={`drug-info-row drug-info-card ${item.isHighRisk ? 'high-risk' : ''}`} key={item.itemId}>
                  <div className="drug-info-med-header">
                    <div className="drug-appearance-cell">
                      <span className={`drug-shape ${getDrugShapeClass(item)}`} aria-hidden="true"></span>
                      <small>{getFormulationLabel(item)}</small>
                    </div>

                    <div className="drug-info-med-title">
                      <span>お薬 {idx + 1}</span>
                      <strong>{getDisplayDrugName(item)}</strong>
                    </div>

                    <div className="drug-info-flag-list">
                      {getMedicationFlags(item).length > 0 ? (
                        getMedicationFlags(item).map((flag) => (
                          <span key={`${item.itemId}-${flag}`}>{flag}</span>
                        ))
                      ) : (
                        <span>通常薬</span>
                      )}
                    </div>
                  </div>

                  {getDisplayDrugName(item) !== getPrescribedDrugName(item) && (
                    <p className="drug-info-change">
                      処方: {getPrescribedDrugName(item)}
                      {item.changeReason ? ` / 変更理由: ${item.changeReason}` : ''}
                    </p>
                  )}

                  <div className="drug-info-counseling-grid">
                    <div className="drug-info-usage-hero">
                      <span>使い方</span>
                      <strong>{item.usage || '用法未設定'}</strong>
                      <div className="drug-info-timing-row">
                        {(getTimingBadges(item.usage).length > 0 ? getTimingBadges(item.usage) : ['指示どおり']).map((badge) => (
                          <em key={`${item.itemId}-timing-${badge}`}>{badge}</em>
                        ))}
                      </div>
                    </div>
                    <div className="drug-info-fact">
                      <span>1日量</span>
                      <strong>{getAmountText(item)}</strong>
                    </div>
                    <div className="drug-info-fact">
                      <span>日数</span>
                      <strong>{item.days ? `${item.days}日分` : '-'}</strong>
                    </div>
                  </div>

                  <div className="drug-info-safety-grid">
                    <div>
                      <span>副作用・相談目安</span>
                      <p>{medicationInfo.sideEffectText}</p>
                    </div>
                    <div>
                      <span>使用上の注意</span>
                      <p>{medicationInfo.usageCautionText}</p>
                    </div>
                  </div>

                  <div className="drug-info-source-line">
                    <div>
                      <span>
                        {medicationInfo.source === 'approved_template'
                          ? `薬局確認済み情報（参照版日 ${medicationInfo.sourceRevisionDate}）`
                          : '詳しい薬剤情報は薬剤師へ確認してください'}
                      </span>
                      <small>{getPickingEvidence(item)}</small>
                    </div>
                    {medicationInfo.officialSearchUrl && (
                      <a href={medicationInfo.officialSearchUrl} target="_blank" rel="noreferrer" className="no-print">
                        PMDAで公式情報を確認
                      </a>
                    )}
                  </div>

                  <div className="drug-info-control-panel paper-embedded-control no-print">
                    <label>
                      <input
                        type="checkbox"
                        checked={item.isIppoka || false}
                        disabled={!canEditBilling}
                        onChange={(e) => handleToggleIppoka(item.itemId, e.target.checked, idx)}
                      />
                      一包化
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.isCrushed || false}
                        disabled={!canEditBilling}
                        onChange={(e) => handleToggleCrushed(item.itemId, e.target.checked, idx)}
                      />
                      粉砕
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.claimPreparation !== false}
                        disabled={!canEditBilling}
                        onChange={(e) => handleItemClaimToggle(item.itemId, 'claimPreparation', e.target.checked, idx)}
                      />
                      調製
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.claimManagement !== false}
                        disabled={!canEditBilling}
                        onChange={(e) => handleItemClaimToggle(item.itemId, 'claimManagement', e.target.checked, idx)}
                      />
                      薬管
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.isDiagnosticTest || false}
                        disabled={!canEditBilling}
                        onChange={(e) => handleItemClaimToggle(item.itemId, 'isDiagnosticTest', e.target.checked, idx)}
                      />
                      検査薬
                    </label>

                    {item.isHighRisk && (
                      <select
                        value={item.tokkanType || 'none'}
                        onChange={(e) => handleTokkanChange(item.itemId, e.target.value, idx)}
                        disabled={!canEditBilling}
                      >
                        <option value="none">特定薬剤: なし</option>
                        <option value="1">加算1 (10点)</option>
                        <option value="3_i">加算3イ (5点)</option>
                      </select>
                    )}

                    <input
                      type="text"
                      list="receipt-remarks-list"
                      placeholder="レセ適"
                      value={remarks[item.itemId] ?? item.receiptRemark ?? ''}
                      onChange={(e) => handleReceiptRemarkChange(item.itemId, e.target.value, idx)}
                      disabled={!canEditBilling}
                    />
                    <label className="agent-override-field">
                      <span>剤</span>
                      <input
                        type="text"
                        placeholder="剤キー"
                        maxLength={50}
                        value={item.billingAgentGroupKey || ''}
                        onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupKey', e.target.value, idx)}
                        onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
                        disabled={!canEditBilling}
                      />
                    </label>
                  </div>
                </section>
              );
            })
          ) : (
            <div className="drug-info-empty">処方データがありません</div>
          )}
          <datalist id="receipt-remarks-list">
            {COMMON_RECEIPT_REMARKS.map((rm) => (
              <option key={rm.code} value={`${rm.code} ${rm.label}`} />
            ))}
          </datalist>
        </div>

        <div className="drug-info-bottom-note">
          <strong>ご注意</strong>
          <span>体調の変化、飲み合わせ、飲み忘れで迷う場合は、服用前に薬剤師へご相談ください。</span>
        </div>

        <div className="doc-footer drug-info-footer">
          <div className="pharmacy-info">
            <strong>{pharmacyInfo.name}</strong><br/>
            {pharmacyAddressLine}<br/>
            TEL: {pharmacyInfo.phone}<br/>
            調剤薬剤師: {pharmacyInfo.pharmacistName}
          </div>
          <div className="pharmacist-seal-box">印</div>
        </div>
      </div>

      <div className="drug-info-claim-tools no-print" aria-label="薬剤情報提供書の算定調整">
        {prescriptionItems.map((item, idx) => (
          <div className="drug-info-claim-row" key={`drug-info-claim-${item.itemId}`}>
            <strong>{getDisplayDrugName(item)}</strong>
            <div className="drug-info-control-panel">
              <label>
                <input
                  type="checkbox"
                  checked={item.isIppoka || false}
                  disabled={!canEditBilling}
                  onChange={(e) => handleToggleIppoka(item.itemId, e.target.checked, idx)}
                />
                一包化
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.isCrushed || false}
                  disabled={!canEditBilling}
                  onChange={(e) => handleToggleCrushed(item.itemId, e.target.checked, idx)}
                />
                粉砕
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.claimPreparation !== false}
                  disabled={!canEditBilling}
                  onChange={(e) => handleItemClaimToggle(item.itemId, 'claimPreparation', e.target.checked, idx)}
                />
                調製
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.claimManagement !== false}
                  disabled={!canEditBilling}
                  onChange={(e) => handleItemClaimToggle(item.itemId, 'claimManagement', e.target.checked, idx)}
                />
                薬管
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.isDiagnosticTest || false}
                  disabled={!canEditBilling}
                  onChange={(e) => handleItemClaimToggle(item.itemId, 'isDiagnosticTest', e.target.checked, idx)}
                />
                検査薬
              </label>
              {item.isHighRisk && (
                <select
                  value={item.tokkanType || 'none'}
                  onChange={(e) => handleTokkanChange(item.itemId, e.target.value, idx)}
                  disabled={!canEditBilling}
                >
                  <option value="none">特定薬剤: なし</option>
                  <option value="1">加算1 (10点)</option>
                  <option value="3_i">加算3イ (5点)</option>
                </select>
              )}
              <input
                type="text"
                placeholder="剤グループ"
                value={item.billingAgentGroupKey || ''}
                disabled={!canEditBilling}
                onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupKey', e.target.value, idx)}
                onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
                style={{ width: '80px', fontSize: '0.75rem', padding: '2px 4px' }}
              />
              <input
                type="text"
                placeholder="摘要コメント"
                value={remarks[item.itemId] ?? (item.receiptRemark || '')}
                disabled={!canEditBilling}
                onChange={(e) => handleReceiptRemarkChange(item.itemId, e.target.value, idx)}
                style={{ width: '120px', fontSize: '0.75rem', padding: '2px 4px' }}
              />
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .paper-preview-card {
          align-items: center;
          overflow-x: auto;
          background:
            linear-gradient(90deg, rgba(226, 232, 240, 0.7) 1px, transparent 1px),
            linear-gradient(rgba(226, 232, 240, 0.7) 1px, transparent 1px),
            #f7f8fb;
          background-size: 16px 16px;
          padding: 1.25rem;
        }

        .paper-embedded-control {
          display: none;
        }

        .preview-header {
          align-self: stretch;
          margin-bottom: 1rem;
        }

        .preview-header h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          color: var(--text-main);
        }

        .fallback-alert {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 1rem 0.75rem;
          padding: 0.65rem 0.75rem;
          border: 1px solid #d97706;
          border-radius: 8px;
          color: #92400e;
          background: #fffbeb;
          font-weight: 700;
          font-size: 0.84rem;
        }

        .yakujo-doc {
          width: 210mm;
          max-width: 100%;
          min-height: 297mm;
          max-height: 297mm;
          height: 297mm;
          padding: 11mm 13mm;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          background: white;
          color: #111;
          border: 1px solid #b7b7b7;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
          box-sizing: border-box;
          overflow: hidden;
        }

        .drug-info-doc {
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
        }

        .drug-info-titlebar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 68mm;
          gap: 6mm;
          align-items: start;
          border-bottom: 2px solid #111;
          padding-bottom: 3.5mm;
          margin-bottom: 3.5mm;
        }

        .doc-title {
          font-size: 1.45rem;
          font-weight: bold;
          color: #111;
        }

        .doc-submeta {
          font-size: 0.75rem;
          color: #444;
          margin-top: 0.2rem;
        }

        .drug-info-stamp-stack {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 2.5mm;
          align-items: stretch;
        }

        .drug-info-pharmacy-stamp {
          border: 1px solid #222;
          padding: 2.4mm;
          min-height: 11mm;
          font-size: 0.7rem;
          line-height: 1.4;
        }

        .drug-info-pharmacy-stamp strong,
        .drug-info-pharmacy-stamp span {
          display: block;
        }

        .drug-info-patient-line {
          display: grid;
          grid-template-columns: 1.1fr 0.85fr 1.45fr 0.85fr;
          gap: 0;
          border: 1px solid #222;
          margin-bottom: 4mm;
          font-size: 0.72rem;
        }

        .drug-info-patient-line strong,
        .drug-info-patient-line span {
          padding: 1.8mm 2mm;
          border-right: 1px solid #222;
        }

        .drug-info-patient-line span:last-child {
          border-right: none;
        }

        .drug-info-list {
          display: grid;
          gap: 2.8mm;
        }

        .drug-info-row.drug-info-card {
          display: block;
          border: 1.5px solid #111;
          padding: 0;
          page-break-inside: avoid;
        }

        .drug-info-row.drug-info-card.high-risk {
          border-left: 5px solid #b91c1c;
        }

        .drug-info-med-header {
          display: grid;
          grid-template-columns: 23mm minmax(0, 1fr) auto;
          gap: 3mm;
          align-items: stretch;
          border-bottom: 1px solid #111;
          background: #f8fafc;
        }

        .drug-info-card .drug-appearance-cell {
          min-height: 24mm;
          border-right: 1px solid #111;
          background: #fff;
          padding: 2.5mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2.5mm;
          text-align: center;
        }

        .drug-info-card .drug-appearance-cell small {
          font-size: 0.68rem;
          color: #444;
          font-weight: 700;
        }

        .drug-info-med-title {
          min-width: 0;
          display: grid;
          align-content: center;
          gap: 1mm;
          padding: 2.2mm 0;
        }

        .drug-info-med-title span {
          font-size: 0.72rem;
          color: #6b7280;
          font-weight: 700;
        }

        .drug-info-med-title strong {
          min-width: 0;
          font-size: 1.02rem;
          line-height: 1.25;
        }

        .drug-info-flag-list {
          display: flex;
          align-content: center;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 1.2mm;
          max-width: 38mm;
          padding: 2mm 2.5mm 2mm 0;
        }

        .drug-info-flag-list span {
          border: 1px solid #111;
          background: #fff;
          color: #111;
          font-size: 0.64rem;
          font-style: normal;
          font-weight: 900;
          line-height: 1;
          padding: 1mm 1.7mm;
          white-space: nowrap;
        }

        .drug-info-card .drug-info-change {
          margin: 0;
          padding: 1.5mm 2.5mm;
          border-bottom: 1px solid #111;
          background: #fff7ed;
          color: #7c2d12;
          font-size: 0.7rem;
        }

        .drug-info-counseling-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 25mm 22mm;
          border-bottom: 1px solid #111;
        }

        .drug-info-counseling-grid > div {
          min-height: 20mm;
          padding: 2.2mm 2.5mm;
          border-right: 1px solid #111;
        }

        .drug-info-counseling-grid > div:last-child {
          border-right: none;
        }

        .drug-info-usage-hero strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.92rem;
          line-height: 1.35;
        }

        .drug-info-timing-row {
          display: flex;
          flex-wrap: wrap;
          gap: 1mm;
          margin-top: 2mm;
        }

        .drug-info-timing-row em {
          border: 1px solid #111;
          background: #fff;
          color: #111;
          font-size: 0.64rem;
          font-style: normal;
          font-weight: 900;
          line-height: 1;
          padding: 1mm 1.7mm;
          white-space: nowrap;
        }

        .drug-info-fact strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.92rem;
        }

        .drug-info-safety-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border-bottom: 1px solid #111;
        }

        .drug-info-safety-grid > div {
          min-height: 19mm;
          padding: 2mm 2.5mm;
          border-right: 1px solid #111;
        }

        .drug-info-safety-grid > div:last-child {
          border-right: none;
        }

        .drug-info-safety-grid span {
          display: block;
          color: #0f766e;
          font-size: 0.62rem;
          font-weight: 900;
          margin-bottom: 0.8mm;
        }

        .drug-info-safety-grid p {
          margin: 0;
          color: #111;
          font-size: 0.68rem;
          line-height: 1.35;
        }

        .drug-info-source-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2mm;
          padding: 1.7mm 2.5mm;
          border-bottom: 1px solid #111;
          background: #f8fafc;
        }

        .drug-info-source-line small {
          display: block;
          color: #4b5563;
          font-size: 0.6rem;
          font-weight: 800;
        }

        .drug-info-source-line span {
          margin-bottom: 0;
          color: #334155;
          font-size: 0.62rem;
          font-weight: 900;
        }

        .drug-info-source-line a {
          color: #0f766e;
          font-size: 0.66rem;
          font-weight: 900;
          text-decoration: underline;
        }

        .drug-info-bottom-note {
          border: 1px solid #111;
          padding: 1.8mm 2.5mm;
          margin: 3mm 0;
          font-size: 0.7rem;
          display: flex;
          gap: 2mm;
        }

        .doc-footer.drug-info-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-top: 1px solid #111;
          padding-top: 2.5mm;
          font-size: 0.72rem;
        }

        .pharmacist-seal-box {
          width: 14mm;
          height: 14mm;
          border: 1px solid #111;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
        }

        .drug-shape {
          display: inline-block;
          position: relative;
          width: 17mm;
          height: 10mm;
          background: #fefefe;
          border: 1.5px solid #8792a2;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9);
        }

        .drug-shape.tablet {
          border-radius: 999px;
        }

        .drug-shape.tablet::after {
          content: "";
          position: absolute;
          inset: 1mm auto 1mm 50%;
          border-left: 1px solid #b9c0ca;
        }

        .drug-shape.high-risk {
          border-color: #b91c1c;
          background: #fff5f5;
        }

        .drug-shape.powder {
          width: 15mm;
          height: 17mm;
          border-radius: 1mm;
          background: linear-gradient(160deg, #ffffff 0 58%, #d8e6f3 59% 100%);
        }

        .drug-shape.liquid {
          width: 12mm;
          height: 20mm;
          border-radius: 2mm 2mm 4mm 4mm;
          background: linear-gradient(#ffffff 0 38%, #bae6fd 39% 100%);
          border-color: #0284c7;
        }

        .drug-shape.ointment {
          width: 20mm;
          height: 8mm;
          border-radius: 999px 2mm 2mm 999px;
          background: linear-gradient(90deg, #dcfce7 0 25%, #ffffff 26% 100%);
          border-color: #15803d;
        }

        .drug-info-claim-tools {
          width: 100%;
          max-width: 210mm;
          margin-top: 0.85rem;
          display: grid;
          gap: 0.55rem;
          align-self: center;
        }

        .drug-info-claim-row {
          display: grid;
          grid-template-columns: minmax(160px, 0.8fr) minmax(0, 2.2fr);
          gap: 0.75rem;
          align-items: center;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #ffffff;
          padding: 0.65rem;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .drug-info-claim-row > strong {
          min-width: 0;
          color: #111827;
          font-size: 0.84rem;
          line-height: 1.4;
        }

        .drug-info-control-panel {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .drug-info-control-panel label {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          color: #334155;
          font-size: 0.76rem;
          font-weight: 700;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .paper-preview-card {
            background: none !important;
            padding: 0 !important;
            border: none !important;
          }
          .yakujo-doc {
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
          }
        }
      `}</style>
    </section>
  );
});
