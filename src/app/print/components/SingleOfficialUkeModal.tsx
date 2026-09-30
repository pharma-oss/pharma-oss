'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  FileCheck2,
  Download,
  Copy,
  Check,
  AlertCircle,
  X,
  FileCode,
  ShieldCheck,
  Layers
} from 'lucide-react';
import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeItem } from '@/lib/receipt/dispensing_uke';
import {
  buildSingleDispensingUkeOfficial,
  type SingleDispensingUkeOfficialResult
} from '@/lib/receipt/dispensing_uke_official_single';

export interface SingleOfficialUkeModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitData: Visit;
  patientData: Patient;
  settingsData: FacilitySettings;
  prescriptionItems: DispensingUkeItem[];
  calculatedFees: CalculationResultItem[];
  interventions?: any[];
  onExportSuccess?: (result: SingleDispensingUkeOfficialResult) => Promise<void> | void;
}

export function SingleOfficialUkeModal({
  isOpen,
  onClose,
  visitData,
  patientData,
  settingsData,
  prescriptionItems,
  calculatedFees,
  interventions,
  onExportSuccess
}: SingleOfficialUkeModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // 1件公式 UKE の生成試行
  const { officialResult, buildError } = useMemo(() => {
    if (!isOpen) return { officialResult: null, buildError: null };
    try {
      const result = buildSingleDispensingUkeOfficial({
        visit: visitData,
        patient: patientData,
        settings: settingsData,
        items: prescriptionItems,
        calculatedFees,
        interventions
      });
      return { officialResult: result, buildError: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : '公式提出用UKEの生成に失敗しました。';
      return { officialResult: null, buildError: message };
    }
  }, [isOpen, visitData, patientData, settingsData, prescriptionItems, calculatedFees, interventions]);

  // レコード種別のユニーク一覧
  const recordTypes = useMemo(() => {
    if (!officialResult) return [];
    return Array.from(new Set(officialResult.records.map((r) => r.type)));
  }, [officialResult]);

  // テキストのクリップボードコピー
  const handleCopyText = useCallback(async () => {
    if (!officialResult) return;
    try {
      await navigator.clipboard.writeText(officialResult.text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy UKE text:', err);
    }
  }, [officialResult]);

  // ダウンロード実行
  const handleDownload = useCallback(async () => {
    if (!officialResult) return;
    setIsExporting(true);
    setExportError(null);
    try {
      // Uint8Array から Shift_JIS バイナリ Blob を生成
      const blob = new Blob([officialResult.content as unknown as BlobPart], {
        type: 'application/octet-stream'
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = officialResult.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      if (onExportSuccess) {
        await onExportSuccess(officialResult);
      }
    } catch (err) {
      console.error('Failed to export official UKE:', err);
      setExportError(err instanceof Error ? err.message : '公式UKEファイルのダウンロードに失敗しました。');
    } finally {
      setIsExporting(false);
    }
  }, [officialResult, onExportSuccess]);

  if (!isOpen) return null;

  return (
    <div
      className="official-uke-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="official-uke-modal-title"
    >
      <div
        className="official-uke-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="official-uke-modal-header">
          <div className="official-uke-header-title-wrap">
            <FileCheck2 className="official-uke-header-icon" size={22} aria-hidden="true" />
            <div>
              <h2 id="official-uke-modal-title" className="official-uke-modal-title">
                公式提出用 UKE 点検・プレビュー
              </h2>
              <span className="official-uke-modal-subtitle">
                社保・国保審査支払機関（レセ電電算処理システム）公式仕様
              </span>
            </div>
          </div>
          <button
            type="button"
            className="official-uke-close-btn"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* ボディ */}
        <div className="official-uke-modal-body">
          {buildError ? (
            <div className="official-uke-alert-box error" role="alert">
              <AlertCircle size={20} aria-hidden="true" />
              <div>
                <strong>公式仕様未充足による出力制限</strong>
                <p>{buildError}</p>
                <span className="official-uke-alert-hint">
                  ※ 厚労省コード（レセ電医薬品コード・調剤基本料コード）の確認、または受付の必須入力項目を点検してください。
                </span>
              </div>
            </div>
          ) : officialResult ? (
            <>
              {/* ステータスバナー */}
              <div className="official-uke-status-banner">
                <ShieldCheck size={20} className="status-success-icon" aria-hidden="true" />
                <div className="status-text-wrap">
                  <span className="status-title">公式提出仕様 適合確認済み</span>
                  <span className="status-desc">
                    YKヘッダー、RE患者共通、HO/KO保険者、SH処方、CZ調剤料、IY医薬品、末尾 GO 集計および EOF (0x1A) が正常に構成されています。
                  </span>
                </div>
              </div>

              {/* 集計サマリーグリッド */}
              <div className="official-uke-summary-grid">
                <div className="official-uke-summary-card">
                  <span className="summary-label">出力ファイル名</span>
                  <strong className="summary-value highlight">{officialResult.fileName}</strong>
                </div>
                <div className="official-uke-summary-card">
                  <span className="summary-label">レセプト件数</span>
                  <strong className="summary-value">{officialResult.totalClaims} 件</strong>
                </div>
                <div className="official-uke-summary-card">
                  <span className="summary-label">合計請求点数</span>
                  <strong className="summary-value">{officialResult.totalPoints} 点</strong>
                </div>
                <div className="official-uke-summary-card">
                  <span className="summary-label">総レコード数</span>
                  <strong className="summary-value">{officialResult.records.length} 行</strong>
                </div>
              </div>

              {/* 構成レコード種別チップ */}
              <div className="official-uke-records-chips-panel">
                <div className="chips-panel-header">
                  <Layers size={15} aria-hidden="true" />
                  <span>構成レコード種別（{recordTypes.length} 種類）</span>
                </div>
                <div className="official-uke-chips-container">
                  {recordTypes.map((type) => (
                    <span key={type} className="official-uke-type-chip">
                      {type}
                    </span>
                  ))}
                  <span className="official-uke-type-chip eof-chip">
                    EOF (0x1A)
                  </span>
                </div>
              </div>

              {/* プレビューテキスト領域 */}
              <div className="official-uke-preview-section">
                <div className="preview-section-header">
                  <div className="preview-header-left">
                    <FileCode size={16} aria-hidden="true" />
                    <span>UKE 電算テキストプレビュー（CRLF）</span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary official-copy-btn"
                    onClick={handleCopyText}
                    title="プレビューテキストをクリップボードにコピー"
                  >
                    {copySuccess ? (
                      <>
                        <Check size={14} aria-hidden="true" />
                        <span>コピー完了</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} aria-hidden="true" />
                        <span>テキストをコピー</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  className="official-uke-preview-textarea"
                  readOnly
                  value={officialResult.text}
                  aria-label="公式UKEテキストプレビュー"
                  rows={8}
                />
              </div>

              {exportError && (
                <div className="official-uke-alert-box error" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <div>
                    <strong>ダウンロードエラー</strong>
                    <p>{exportError}</p>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* フッターアクション */}
        <div className="official-uke-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            閉じる
          </button>
          <button
            type="button"
            className="btn-primary official-download-btn"
            onClick={handleDownload}
            disabled={!officialResult || isExporting}
            data-testid="download-official-cyo-button"
          >
            <Download size={16} aria-hidden="true" />
            <span>{isExporting ? 'ダウンロード中...' : 'RECEIPTY.CYO をダウンロード'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
