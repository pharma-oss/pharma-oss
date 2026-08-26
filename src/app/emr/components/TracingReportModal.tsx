'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FileText, Sparkles, Printer, X, Save, Building2, UserCheck } from 'lucide-react';
import type { VisitTracingReport, SoapStructuredAssessment, TracingReportStatus } from '@/db/types';
import { tracingStatusLabel } from '@/lib/emr_helpers';
import {
  buildAutoTracingReportDraft,
  generateTracingReportPrintHtml,
  type TracingReportDraftInput
} from '@/lib/tracing_report';
import { MedicalInstitutionAutoComplete } from '@/components/MedicalInstitutionAutoComplete';

export interface TracingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  prescriptionItems?: Array<{ drugName: string; quantity?: number; usage?: string }>;
  soapProblems?: Array<{
    title: string;
    entries: Array<{ type: 'S' | 'O' | 'A' | 'P'; text: string }>;
  }>;
  assessment?: SoapStructuredAssessment;
  existingReport?: VisitTracingReport | null;
  pharmacyInfo?: {
    pharmacyName?: string;
    pharmacyPhone?: string;
    pharmacyFax?: string;
    defaultPharmacistName?: string;
  };
  onSaveReport: (report: VisitTracingReport) => Promise<void>;
}

const EMPTY_PRESCRIPTION_ITEMS: Array<{ drugName: string; quantity?: number; usage?: string }> = [];
const EMPTY_SOAP_PROBLEMS: Array<{ title: string; entries: Array<{ type: 'S' | 'O' | 'A' | 'P'; text: string }> }> = [];

export const TracingReportModal: React.FC<TracingReportModalProps> = ({
  isOpen,
  onClose,
  patientName,
  prescriptionItems = EMPTY_PRESCRIPTION_ITEMS,
  soapProblems = EMPTY_SOAP_PROBLEMS,
  assessment,
  existingReport,
  pharmacyInfo = {},
  onSaveReport
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [report, setReport] = useState<Partial<VisitTracingReport>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (existingReport) {
        setReport({ ...existingReport });
      } else {
        const draft = buildAutoTracingReportDraft({
          patientName,
          prescriptionItems,
          soapProblems,
          assessment
        });
        setReport(draft);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, existingReport]);

  if (!isOpen) return null;

  const handleGenerateDraft = () => {
    const draft = buildAutoTracingReportDraft({
      patientName,
      prescriptionItems,
      soapProblems,
      assessment,
      existingReport: report
    });
    setReport(draft);
  };

  const handleSave = async () => {
    if (!report.subject?.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const fullReport: VisitTracingReport = {
        reportId: report.reportId || `tr-${Date.now()}`,
        status: (report.status as TracingReportStatus) || 'draft',
        reportDate: report.reportDate || now.slice(0, 10),
        destinationInstitution: report.destinationInstitution || '',
        destinationInstitutionCode: report.destinationInstitutionCode || '',
        destinationDepartment: report.destinationDepartment || '',
        destinationDoctor: report.destinationDoctor || '',
        subject: report.subject || '',
        medicationSummary: report.medicationSummary || '',
        patientCondition: report.patientCondition || '',
        assessment: report.assessment || '',
        proposal: report.proposal || '',
        followUpPlan: report.followUpPlan || '',
        sentAt: report.sentAt,
        createdAt: report.createdAt || now,
        updatedAt: now
      };
      await onSaveReport(fullReport);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    const html = generateTracingReportPrintHtml(report, pharmacyInfo, patientName);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-overlay tracing-dialog"
      aria-labelledby="tracing-title"
      onClose={onClose}
    >
      <div className="modal-header tracing-header">
        <div className="tracing-title-box">
          <FileText size={22} />
          <h3 id="tracing-title" className="tracing-title">
            服薬情報提供書 (トレーシングレポート) 作成
          </h3>
        </div>
        <div className="tracing-header-actions">
          <button
            type="button"
            className="btn-secondary btn-auto-draft"
            onClick={handleGenerateDraft}
            title="SOAPおよび薬歴チェック結果から文章を自動補完します"
          >
            <Sparkles size={14} className="icon-sparkles" />
            <span>SOAPから自動下書き</span>
          </button>
          <button
            type="button"
            className="btn-close btn-modal-close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="modal-body tracing-body">
        <div className="tracing-institution-card">
          <MedicalInstitutionAutoComplete
            valueCode={(report as any).destinationInstitutionCode || ''}
            valueName={report.destinationInstitution || ''}
            onChange={({ code, name }) => {
              setReport((prev) => ({
                ...prev,
                destinationInstitution: name,
                destinationInstitutionCode: code
              } as any));
            }}
          />
        </div>

        <div className="tracing-grid-2col">
          <div>
            <label className="tracing-field-label">
              <Building2 size={14} /> 診療科 (任意)
            </label>
            <input
              type="text"
              className="input-field tracing-input"
              placeholder="例: 循環器内科"
              value={report.destinationDepartment || ''}
              onChange={(e) => setReport({ ...report, destinationDepartment: e.target.value })}
            />
          </div>
          <div>
            <label className="tracing-field-label">
              <UserCheck size={14} /> 担当医師名
            </label>
            <input
              type="text"
              className="input-field tracing-input"
              placeholder="例: 山田 太郎 先生"
              value={report.destinationDoctor || ''}
              onChange={(e) => setReport({ ...report, destinationDoctor: e.target.value })}
            />
          </div>
        </div>

        <div className="tracing-grid-2-1">
          <div>
            <label className="tracing-field-label">報告件名</label>
            <input
              type="text"
              className="input-field tracing-input"
              placeholder="例: 【服薬情報提供】残薬調整および服薬状況報告"
              value={report.subject || ''}
              onChange={(e) => setReport({ ...report, subject: e.target.value })}
            />
          </div>
          <div>
            <label className="tracing-field-label">ステータス</label>
            <select
              className="input-field tracing-input"
              value={report.status || 'draft'}
              onChange={(e) => setReport({ ...report, status: e.target.value as TracingReportStatus })}
            >
              {(Object.keys(tracingStatusLabel) as TracingReportStatus[]).map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {tracingStatusLabel[statusKey]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="tracing-field-label">1. 処方薬剤概要</label>
          <textarea
            className="input-field tracing-input"
            rows={2}
            value={report.medicationSummary || ''}
            onChange={(e) => setReport({ ...report, medicationSummary: e.target.value })}
          />
        </div>

        <div>
          <label className="tracing-field-label">2. 患者の服薬状況・主訴・経過</label>
          <textarea
            className="input-field tracing-input"
            rows={3}
            value={report.patientCondition || ''}
            onChange={(e) => setReport({ ...report, patientCondition: e.target.value })}
          />
        </div>

        <div>
          <label className="tracing-field-label">3. 薬剤師アセスメント</label>
          <textarea
            className="input-field tracing-input"
            rows={2}
            value={report.assessment || ''}
            onChange={(e) => setReport({ ...report, assessment: e.target.value })}
          />
        </div>

        <div>
          <label className="tracing-field-label">4. 処方提案・ご検討事項</label>
          <textarea
            className="input-field tracing-input"
            rows={2}
            value={report.proposal || ''}
            onChange={(e) => setReport({ ...report, proposal: e.target.value })}
          />
        </div>
      </div>

      <div className="modal-footer tracing-footer">
        <button
          type="button"
          className="btn-secondary flex-center gap-1 btn-tracing-print"
          onClick={handlePrint}
        >
          <Printer size={16} />
          <span>A4印刷 / PDF出力</span>
        </button>

        <div className="tracing-footer-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn-primary flex-center gap-1"
            disabled={isSaving || !report.subject?.trim()}
            onClick={() => void handleSave()}
          >
            <Save size={16} />
            <span>{isSaving ? '保存中...' : '保存'}</span>
          </button>
        </div>
      </div>
      <style jsx>{`
        .tracing-dialog {
          width: 760px;
          max-width: 95%;
          padding: var(--space-6);
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        }
        .tracing-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
          padding-bottom: var(--space-3);
        }
        .tracing-title-box {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--primary);
        }
        .tracing-title {
          font-size: 1.2rem;
          font-weight: 800;
          margin: 0;
        }
        .tracing-header-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .btn-auto-draft {
          font-size: var(--fs-sm);
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
        }
        .icon-sparkles {
          color: var(--warning);
        }
        .btn-modal-close {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: var(--space-0-5);
          display: flex;
          align-items: center;
        }
        .tracing-body {
          padding: var(--space-4) 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          max-height: 65vh;
          overflow-y: auto;
        }
        .tracing-institution-card {
          border: 1px solid var(--border);
          padding: var(--space-3);
          border-radius: 8px;
          background: var(--bg-subtle);
        }
        .tracing-grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-3);
        }
        .tracing-grid-2-1 {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--space-3);
        }
        .tracing-field-label {
          font-size: var(--fs-sm);
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
        .tracing-input {
          width: 100%;
          padding: var(--space-1-5) var(--space-2);
          font-size: var(--fs-md);
          margin-top: var(--space-1);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-main);
        }
        .tracing-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid var(--border);
          padding-top: var(--space-3);
          margin-top: var(--space-2);
        }
        .btn-tracing-print {
          padding: var(--space-1-5) var(--space-3);
        }
        .tracing-footer-actions {
          display: flex;
          gap: var(--space-2);
        }
      `}</style>
    </dialog>
  );
};
