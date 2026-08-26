import type { VisitTracingReport, SoapStructuredAssessment } from '@/db/types';

export interface TracingReportDraftInput {
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  prescriptionItems?: Array<{ drugName: string; quantity?: number; usage?: string }>;
  soapProblems?: Array<{
    title: string;
    entries: Array<{
      type: 'S' | 'O' | 'A' | 'P';
      text: string;
      origin?: 'manual' | 'ai_draft' | 'legacy_unspecified';
      aiStatus?: 'unconfirmed' | 'reviewed' | 'approved' | 'modified';
    }>;
  }>;
  assessment?: SoapStructuredAssessment;
  existingReport?: Partial<VisitTracingReport>;
}

export function buildAutoTracingReportDraft(input: TracingReportDraftInput): Partial<VisitTracingReport> {
  const { patientName, prescriptionItems = [], soapProblems = [], assessment, existingReport } = input;

  let subject = existingReport?.subject || '';
  if (!subject) {
    if (assessment?.adverseEvent === 'has') {
      subject = `【服薬情報提供】副作用疑い・体調変化に関する報告 (${patientName}様)`;
    } else if (assessment?.leftoverMedicine === 'has') {
      subject = `【服薬情報提供】残薬調整および服薬状況報告 (${patientName}様)`;
    } else if (assessment?.genericChangePreference === 'declined') {
      subject = `【服薬情報提供】後発医薬品変更意向に関する報告 (${patientName}様)`;
    } else {
      subject = `【服薬情報提供】服薬状況・継続管理に関する報告 (${patientName}様)`;
    }
  }

  const medSummaryLines: string[] = [];
  if (prescriptionItems.length > 0) {
    prescriptionItems.forEach((item) => {
      medSummaryLines.push(`・${item.drugName} ${item.usage || ''}`.trim());
    });
  } else {
    medSummaryLines.push('・処方内容確認済み');
  }
  const medicationSummary = existingReport?.medicationSummary || medSummaryLines.join('\n');

  const conditionLines: string[] = [];
  if (assessment) {
    if (assessment.adherence === 'good') conditionLines.push('・服薬状況: 良好（指示通り服用中）');
    else if (assessment.adherence === 'partial') conditionLines.push('・服薬状況: 一部飲み忘れ・飲み残しあり');
    else if (assessment.adherence === 'poor') conditionLines.push('・服薬状況: 不良（服用中断・不規則）');

    if (assessment.leftoverMedicine === 'has') conditionLines.push('・残薬: あり（次回処方日数調整のご検討を推奨）');
    if (assessment.adverseEvent === 'has') conditionLines.push('・体調変化・副作用疑い症状が観察されました');
  }

  soapProblems.forEach((problem) => {
    // 未確認の AI 下書き（aiStatus: 'unconfirmed'）は院外文書（トレーシングレポート）への誤流出を防ぐため除外
    const confirmedEntries = (problem.entries || []).filter((e) => e.aiStatus !== 'unconfirmed');
    const sEntries = confirmedEntries.filter((e) => e.type === 'S');
    if (sEntries.length > 0) {
      conditionLines.push(`【${problem.title}】 ${sEntries.map((e) => e.text).join(' / ')}`);
    }
  });

  const patientCondition = existingReport?.patientCondition || conditionLines.join('\n');

  const assessmentLines: string[] = [];
  soapProblems.forEach((problem) => {
    const confirmedEntries = (problem.entries || []).filter((e) => e.aiStatus !== 'unconfirmed');
    const aEntries = confirmedEntries.filter((e) => e.type === 'A');
    if (aEntries.length > 0) {
      assessmentLines.push(`【${problem.title}】 ${aEntries.map((e) => e.text).join(' / ')}`);
    }
  });
  if (assessmentLines.length === 0 && assessment) {
    if (assessment.adverseEvent === 'has') {
      assessmentLines.push('副作用の初期症状または体調悪化が懸念されるため、注意深い経過観察が必要です。');
    } else {
      assessmentLines.push('現在の処方内容に基づき継続的な服薬指導・フォローアップを実施しています。');
    }
  }
  const reportAssessment = existingReport?.assessment || assessmentLines.join('\n');

  const proposalLines: string[] = [];
  soapProblems.forEach((problem) => {
    const confirmedEntries = (problem.entries || []).filter((e) => e.aiStatus !== 'unconfirmed');
    const pEntries = confirmedEntries.filter((e) => e.type === 'P');
    if (pEntries.length > 0) {
      proposalLines.push(`【${problem.title}】 ${pEntries.map((e) => e.text).join(' / ')}`);
    }
  });
  if (proposalLines.length === 0) {
    if (assessment?.leftoverMedicine === 'has') {
      proposalLines.push('次回処方時に残薬分の日数減算処方をご検討いただけますと幸いです。');
    } else {
      proposalLines.push('現状の処方方針の継続および経過確認を推奨いたします。');
    }
  }
  const proposal = existingReport?.proposal || proposalLines.join('\n');

  const followUpPlan = existingReport?.followUpPlan || '次回ご来局時に服用状況および体調変化を継続して再確認いたします。';

  return {
    subject,
    medicationSummary,
    patientCondition,
    assessment: reportAssessment,
    proposal,
    followUpPlan,
    destinationInstitution: existingReport?.destinationInstitution || '',
    destinationDepartment: existingReport?.destinationDepartment || '',
    destinationDoctor: existingReport?.destinationDoctor || '',
    status: existingReport?.status || 'draft',
    reportDate: existingReport?.reportDate || new Date().toISOString().slice(0, 10)
  };
}

function escapeHtml(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateTracingReportPrintHtml(
  report: Partial<VisitTracingReport>,
  pharmacyInfo: { pharmacyName?: string; pharmacyPhone?: string; pharmacyFax?: string; defaultPharmacistName?: string },
  patientName: string
): string {
  const safeDestInst = escapeHtml(report.destinationInstitution || '医療機関');
  const safeDestDept = escapeHtml(report.destinationDepartment);
  const safeDestDoc = escapeHtml(report.destinationDoctor);
  const safePatientName = escapeHtml(patientName);
  const safeReportDate = escapeHtml(report.reportDate || new Date().toISOString().slice(0, 10));
  const safePharmName = escapeHtml(pharmacyInfo.pharmacyName || '保険薬局');
  const safePharmPhone = escapeHtml(pharmacyInfo.pharmacyPhone || '-');
  const safePharmFax = escapeHtml(pharmacyInfo.pharmacyFax || '-');
  const safePharmacist = escapeHtml(pharmacyInfo.defaultPharmacistName || '薬剤師');
  const safeSubject = escapeHtml(report.subject || '服薬情報のご報告');

  const safeMedSummary = escapeHtml(report.medicationSummary);
  const safePatientCondition = escapeHtml(report.patientCondition);
  const safeAssessment = escapeHtml(report.assessment);
  const safeProposal = escapeHtml(report.proposal);
  const safeFollowUp = escapeHtml(report.followUpPlan);

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>服薬情報提供書 (トレーシングレポート)</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif; font-size: 11pt; line-height: 1.5; color: #111; margin: 0; padding: 0; }
    .header-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
    .title { font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 25px; letter-spacing: 2px; border-bottom: 2px solid #333; padding-bottom: 5px; }
    .dest-info { width: 60%; vertical-align: top; }
    .sender-info { width: 40%; vertical-align: top; text-align: right; font-size: 10pt; }
    .box { border: 1px solid #444; border-radius: 4px; padding: 10px; margin-bottom: 15px; page-break-inside: avoid; break-inside: avoid; }
    .box-title { font-weight: bold; font-size: 10.5pt; background: #f0f0f0; padding: 4px 8px; margin: -10px -10px 8px -10px; border-bottom: 1px solid #444; border-top-left-radius: 3px; border-top-right-radius: 3px; }
    .field-content { white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <div class="title">服薬情報提供書 (トレーシングレポート)</div>

  <table class="header-table">
    <tr>
      <td class="dest-info">
        <div style="font-size: 13pt; font-weight: bold;">${safeDestInst} 御中</div>
        ${safeDestDept ? `<div>${safeDestDept}</div>` : ''}
        ${safeDestDoc ? `<div>${safeDestDoc} 先生</div>` : ''}
        <div style="margin-top: 15px; font-size: 12pt;">
          患者様氏名: <strong>${safePatientName}</strong> 様
        </div>
      </td>
      <td class="sender-info">
        <div>報告日: ${safeReportDate}</div>
        <div style="margin-top: 10px; font-weight: bold; font-size: 11pt;">${safePharmName}</div>
        <div>TEL: ${safePharmPhone} / FAX: ${safePharmFax}</div>
        <div>担当薬剤師: ${safePharmacist}</div>
      </td>
    </tr>
  </table>

  <div style="margin-bottom: 15px; font-weight: bold; font-size: 12pt;">
    件名: ${safeSubject}
  </div>

  ${safeMedSummary ? `
  <div class="box">
    <div class="box-title">1. 対象処方・調剤薬剤概要</div>
    <div class="field-content">${safeMedSummary}</div>
  </div>` : ''}

  ${safePatientCondition ? `
  <div class="box">
    <div class="box-title">2. 患者の服薬状況・主訴・経過</div>
    <div class="field-content">${safePatientCondition}</div>
  </div>` : ''}

  ${safeAssessment ? `
  <div class="box">
    <div class="box-title">3. 薬剤師アセスメント・懸念事項</div>
    <div class="field-content">${safeAssessment}</div>
  </div>` : ''}

  ${safeProposal ? `
  <div class="box">
    <div class="box-title">4. 処方提案・ご検討いただきたい事項</div>
    <div class="field-content">${safeProposal}</div>
  </div>` : ''}

  ${safeFollowUp ? `
  <div class="box">
    <div class="box-title">5. 薬局での今後のフォローアップ計画</div>
    <div class="field-content">${safeFollowUp}</div>
  </div>` : ''}
</body>
</html>
  `.trim();
}
