import React from 'react';
import { FileText } from 'lucide-react';
import type { VisitElectronicPrescription } from '@/db/types';
import type { PharmacyInfo } from '../types';
import { ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS } from '../types';
import {
  getRecordDrugName,
  getAmountLabel,
  getAmountText,
  getRecordNotes
} from '../helpers';

export interface DispensingRecordPrintProps {
  patientData: any;
  visitData: any;
  prescriptionItems: any[];
  pharmacyInfo: PharmacyInfo;
  pharmacyAddressLine: string;
  receiptRunId: string;
  currentDateStr: string;
  patientBirthDateStr: string;
  dispensingDateStr: string;
  prescriptionDateStr: string;
  patientAge?: number;
  electronicPrescription?: VisitElectronicPrescription;
  electronicPrescriptionIds: string[];
  electronicPrescriptionDispensingResultStatus: VisitElectronicPrescription['dispensingResultStatus'];
  electronicPrescriptionDispensingInformationSignatureText: string;
  electronicPrescriptionDispensingInformationHpkiText: string;
  electronicPrescriptionDispensingInformationHashText: string;
  electronicPrescriptionComments: string[];
  electronicPrescriptionLaboratoryResults: any[];
  electronicPrescriptionNarcoticAdministration?: any;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
  isFirstItemInRp: (item: any, index: number) => boolean;
}

export const DispensingRecordPrint = React.memo(function DispensingRecordPrint({
  patientData,
  visitData,
  prescriptionItems,
  pharmacyInfo,
  pharmacyAddressLine,
  receiptRunId,
  currentDateStr,
  patientBirthDateStr,
  dispensingDateStr,
  prescriptionDateStr,
  patientAge,
  electronicPrescription,
  electronicPrescriptionIds,
  electronicPrescriptionDispensingResultStatus,
  electronicPrescriptionDispensingInformationSignatureText,
  electronicPrescriptionDispensingInformationHpkiText,
  electronicPrescriptionDispensingInformationHashText,
  electronicPrescriptionComments,
  electronicPrescriptionLaboratoryResults,
  electronicPrescriptionNarcoticAdministration,
  renderIdentityMark,
  isFirstItemInRp
}: DispensingRecordPrintProps) {
  return (
    <section className="print-preview-card card dispensing-record-card">
      <div className="preview-header no-print">
        <div>
          <h3><FileText size={18} aria-hidden="true" /> 調剤録</h3>
        </div>
      </div>

      <div className="print-document yakujo-doc dispensing-record-doc" data-testid="dispensing-record-doc">
        <div className="record-titlebar">
          <div>
            <div className="doc-title">調剤録</div>
            <div className="record-number">受付番号: {receiptRunId} / 発行 {currentDateStr}</div>
          </div>
          {renderIdentityMark('compact')}
        </div>

        <table className="record-info-table">
          <tbody>
            <tr>
              <th>患者氏名</th>
              <td>{patientData.name}</td>
              <th>年齢</th>
              <td>{patientAge !== undefined ? `${patientAge}歳` : '-'}</td>
            </tr>
            <tr>
              <th>生年月日</th>
              <td>{patientBirthDateStr}</td>
              <th>調剤年月日</th>
              <td>{dispensingDateStr}</td>
            </tr>
            <tr>
              <th>処方箋発行年月日</th>
              <td>{prescriptionDateStr}</td>
              <th>情報提供・指導年月日</th>
              <td>{dispensingDateStr}</td>
            </tr>
            <tr>
              <th>保険医療機関</th>
              <td colSpan={3}>{visitData.institutionName || visitData.institutionId || '未設定'}</td>
            </tr>
            <tr>
              <th>診療科</th>
              <td>{visitData.departmentName || visitData.departmentId || '未設定'}</td>
              <th>処方医氏名</th>
              <td>{visitData.doctorName || visitData.doctorId || '未設定'}</td>
            </tr>
            <tr>
              <th>調剤薬剤師</th>
              <td>{pharmacyInfo.pharmacistName}</td>
              <th>発行年月日</th>
              <td>{currentDateStr}</td>
            </tr>
            {electronicPrescription && (
              <tr>
                <th>電子処方箋</th>
                <td>
                  処方箋 {electronicPrescriptionIds.length}件 / {ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus]}
                </td>
                <th>調剤情報提供ファイル署名</th>
                <td>
                  {electronicPrescriptionDispensingInformationSignatureText}
                  {' / '}
                  {electronicPrescriptionDispensingInformationHpkiText}
                  {electronicPrescriptionDispensingInformationHashText ? ` / SHA-256 ${electronicPrescriptionDispensingInformationHashText}` : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="doc-body">
          <h4 className="doc-subtitle">薬名・1日量・用法</h4>
          <table className="drug-table record-drug-table">
            <thead>
              <tr>
                <th>Rp</th>
                <th>薬品名</th>
                <th>用量</th>
                <th>用法</th>
                <th>日数</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {prescriptionItems.map((item, index) => (
                <tr key={`record-${item.itemId}`}>
                  <td className="text-center">{item.rpNumber || '-'}</td>
                  <td>{getRecordDrugName(item)}</td>
                  <td>{getAmountLabel(item)} {getAmountText(item)}</td>
                  <td>{item.usage || '未設定'}</td>
                  <td>{item.days ? `${item.days} 日分` : '-'}</td>
                  <td className="text-sm">{getRecordNotes(item, isFirstItemInRp(item, index)) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(electronicPrescriptionComments.length > 0
            || electronicPrescriptionLaboratoryResults.length > 0
            || electronicPrescriptionNarcoticAdministration) && (
            <div className="record-guidance-box electronic-prescription-supplementary-print" data-testid="electronic-prescription-supplementary-print">
              <div className="record-guidance-label">電子処方箋の処方補足情報</div>
              {electronicPrescriptionComments.map((comment) => (
                <p key={`print-comment-${comment}`}>処方コメント: {comment}</p>
              ))}
              {electronicPrescriptionLaboratoryResults.map((result, index) => (
                <p key={`print-lab-${result.testName}-${index}`}>
                  検査値: {result.testName} {result.value}{result.unit ? ` ${result.unit}` : ''}
                  {result.referenceRange ? ` / 基準 ${result.referenceRange}` : ''}
                  {result.measuredAt ? ` / ${new Date(result.measuredAt).toLocaleString('ja-JP')}` : ''}
                </p>
              ))}
              {electronicPrescriptionNarcoticAdministration && (
                <p>麻薬施用情報: {electronicPrescriptionNarcoticAdministration.displayText || '表示不可'}</p>
              )}
            </div>
          )}

          <div className="record-guidance-box">
            <div className="record-guidance-label">情報提供・指導の要点</div>
            <div className="record-guidance-lines">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>

        <div className="doc-footer">
          <div className="pharmacy-info">
            <strong>{pharmacyInfo.name}</strong><br/>
            {pharmacyAddressLine}<br/>
            TEL: {pharmacyInfo.phone}<br/>
            調剤薬剤師: {pharmacyInfo.pharmacistName}
          </div>
          <div className="pharmacist-seal-box">印</div>
        </div>
      </div>

      <style jsx>{`
        .dispensing-record-card {
          align-items: center;
        }

        .dispensing-record-card .preview-header {
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

        .yakujo-doc {
          width: 210mm;
          min-height: 297mm;
          background: white;
          padding: 15mm;
          font-size: 0.85rem;
          color: #111;
          border: 1px solid #111;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          box-sizing: border-box;
          position: relative;
        }

        .dispensing-record-doc {
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          color: #111;
        }

        .dispensing-record-doc .doc-title {
          font-size: 1.45rem;
          text-align: left;
          font-weight: bold;
        }

        .record-titlebar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          gap: 12px;
          border-bottom: 2px solid #111;
          padding-bottom: 3.5mm;
          margin-bottom: 4mm;
        }

        .record-number {
          margin-top: 1mm;
          font-size: 0.78rem;
          color: #333;
          white-space: nowrap;
        }

        .record-info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5mm;
          font-size: 0.82rem;
        }

        .record-info-table th,
        .record-info-table td {
          border: 1px solid #333;
          padding: 2.1mm 2.4mm;
          vertical-align: top;
        }

        .record-info-table th {
          width: 22%;
          background: #f7f7f7;
          font-weight: 700;
          text-align: left;
          white-space: nowrap;
          word-break: keep-all;
        }

        .record-info-table td {
          width: 28%;
        }

        .doc-body {
          margin-bottom: 15px;
        }

        .doc-subtitle {
          font-size: 0.95rem;
          font-weight: bold;
          margin-bottom: 2mm;
          border-bottom: 1px solid #333;
          padding-bottom: 1mm;
        }

        .drug-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5mm;
        }

        .record-drug-table {
          font-size: 0.78rem;
          table-layout: fixed;
        }

        .record-drug-table th,
        .record-drug-table td {
          border: 1px solid #333;
          padding: 1.8mm;
          vertical-align: top;
        }

        .record-drug-table th {
          background: #f7f7f7;
          font-weight: bold;
          text-align: left;
          white-space: nowrap;
          word-break: keep-all;
        }

        .record-drug-table th:nth-child(1),
        .record-drug-table td:nth-child(1) {
          width: 42px;
        }

        .record-drug-table th:nth-child(2),
        .record-drug-table td:nth-child(2) {
          width: 30%;
        }

        .record-drug-table th:nth-child(3),
        .record-drug-table td:nth-child(3) {
          width: 74px;
        }

        .record-drug-table th:nth-child(5),
        .record-drug-table td:nth-child(5) {
          width: 72px;
        }

        .record-drug-table th:nth-child(6),
        .record-drug-table td:nth-child(6) {
          width: 30%;
        }

        .text-center { text-align: center; }
        .text-sm { font-size: 0.75rem; }

        .record-guidance-box {
          border: 1px solid #333;
          margin-top: 5mm;
          min-height: 31mm;
          padding: 3mm;
        }

        .record-guidance-label {
          font-size: 0.86rem;
          font-weight: 700;
          margin-bottom: 3mm;
        }

        .record-guidance-lines {
          display: grid;
          gap: 9mm;
        }

        .record-guidance-lines span {
          display: block;
          border-bottom: 1px solid #999;
          min-height: 1px;
        }

        .electronic-prescription-supplementary-print {
          background: #fafafa;
          font-size: 0.8rem;
          margin-bottom: 4mm;
        }

        .electronic-prescription-supplementary-print p {
          margin: 1mm 0;
        }

        .dispensing-record-doc .doc-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-top: 18px;
          text-align: left;
        }

        .pharmacy-info {
          font-size: 0.8rem;
          line-height: 1.4;
        }

        .pharmacist-seal-box {
          width: 18mm;
          height: 18mm;
          border: 1px solid #333;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.9rem;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .dispensing-record-card {
            border: none;
            padding: 0;
            background: none;
          }
          .yakujo-doc {
            border: none;
            box-shadow: none;
            padding: var(--print-margin-top, 10mm) 10mm var(--print-margin-bottom, 10mm) 10mm;
            page-break-after: always;
          }
        }
      `}</style>
    </section>
  );
});
