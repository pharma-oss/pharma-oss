'use meemo';
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

export const TracingReportModal: React.FC<TracingReportModalProps> = ({
  isOpen,
  onClose,
  patientName,
  prescriptionItems = [],
  soapProblems = [],
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
  }, [isOpen, existingReport, patientName, prescriptionItems, soapProblems, assessment]);

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
      className="tracing-modal glass"
      aria-labelledby="tracing-title"
      onClose={onClose}
      style={{
        width: '760px',
        maxWidth: '95%',
        padding: '1.5rem',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
      }}
    >
      <div
        className="modal-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.85rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <FileText size={22} />
          <h3 id="tracing-title" style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
            服薬情報提供書 (トレーシングレポート) 作成
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleGenerateDraft}
            style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem' }}
            title="SOAPおよび薬歴チェック結果から文章を自動補完します"
          >
            <Sparkles size={14} style={{ color: 'var(--warning)' }} />
            <span>SOAPから自動下書き</span>
          </button>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.2rem' }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="modal-body" style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '65vh', overflowY: 'auto' }}>
        <div style={{ border: '1px solid var(--border)', padding: '0.85rem', borderRadius: '8px', background: 'var(--bg-subtle)' }}>
          <MedicalInstitutionAutoComplete
            valueName={report.destinationInstitution || ''}
            onChange={({ code, name }) => {
              setReport((prev) => ({
                ...prev,
                destinationInstitution: name
              }));
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Building2 size={14} /> 診療科 (任意)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="例: 循環器内科"
              value={report.destinationDepartment || ''}
              onChange={(e) => setReport({ ...report, destinationDepartment: e.target.value })}
              style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.88rem', marginTop: '0.25rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <UserCheck size={14} /> 担当医師名
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="例: 山田 太郎 先生"
              value={report.destinationDoctor || ''}
              onChange={(e) => setReport({ ...report, destinationDoctor: e.target.value })}
              style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.88rem', marginTop: '0.25rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>報告件名</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: 【服薬情報提供】残薬調整および服薬状況報告"
              value={report.subject || ''}
              onChange={(e) => setReport({ ...report, subject: e.target.value })}
              style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.88rem', marginTop: '0.25rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>ステータス</label>
            <select
              className="input-field"
              value={report.status || 'draft'}
              onChange={(e) => setReport({ ...report, status: e.target.value as TracingReportStatus })}
              style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.88rem', marginTop: '0.25rem' }}
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
          <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>1. 処方薬剤概要</label>
          <textarea
            className="input-field"
            rows={2}
            value={report.medicationSummary || ''}
            onChange={(e) => setReport({ ...report, medicationSummary: e.target.value })}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', marginTop: '0.25rem' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>2. 患者の服薬状況・主訴・経過</label>
          <textarea
            className="input-field"
            rows={3}
            value={report.patientCondition || ''}
            onChange={(e) => setReport({ ...report, patientCondition: e.target.value })}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', marginTop: '0.25rem' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>3. 薬剤師アセスメント</label>
          <textarea
            className="input-field"
            rows={2}
            value={report.assessment || ''}
            onChange={(e) => setReport({ ...report, assessment: e.target.value })}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', marginTop: '0.25rem' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>4. 処方提案・ご検討事項</label>
          <textarea
            className="input-field"
            rows={2}
            value={report.proposal || ''}
            onChange={(e) => setReport({ ...report, proposal: e.target.value })}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', marginTop: '0.25rem' }}
          />
        </div>
      </div>

      <div
        className="modal-footer"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border)',
          paddingTop: '0.85rem',
          marginTop: '0.5rem'
        }}
      >
        <button
          type="button"
          className="btn-secondary flex-center gap-1"
          onClick={handlePrint}
          style={{ padding: '0.4rem 0.8rem' }}
        >
          <Printer size={16} />
          <span>A4印刷 / PDF出力</span>
        </button>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
    </dialog>
  );
};
