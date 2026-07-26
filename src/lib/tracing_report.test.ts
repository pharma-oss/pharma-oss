import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  buildAutoTracingReportDraft,
  generateTracingReportPrintHtml
} from './tracing_report';
import type { SoapStructuredAssessment } from '@/db/types';

describe('Tracing Report Helpers & Engine', () => {
  test('buildAutoTracingReportDraft generates appropriate subject for adverse event', () => {
    const assessment: SoapStructuredAssessment = {
      adherence: 'good',
      leftoverMedicine: 'none',
      adverseEvent: 'has',
      genericChangePreference: 'unknown',
      medicationNotebook: 'issued'
    };

    const draft = buildAutoTracingReportDraft({
      patientName: '山田 太郎',
      assessment
    });

    assert.ok(draft.subject?.includes('副作用疑い'));
    assert.ok(draft.subject?.includes('山田 太郎'));
    assert.ok(draft.patientCondition?.includes('体調変化・副作用疑い'));
  });

  test('buildAutoTracingReportDraft generates leftover medicine proposal', () => {
    const assessment: SoapStructuredAssessment = {
      adherence: 'partial',
      leftoverMedicine: 'has',
      adverseEvent: 'none',
      genericChangePreference: 'unknown',
      medicationNotebook: 'issued'
    };

    const draft = buildAutoTracingReportDraft({
      patientName: '佐藤 花子',
      assessment
    });

    assert.ok(draft.subject?.includes('残薬調整'));
    assert.ok(draft.proposal?.includes('残薬分の日数減算'));
  });

  test('buildAutoTracingReportDraft extracts SOAP P entries into proposal', () => {
    const draft = buildAutoTracingReportDraft({
      patientName: '鈴木 一郎',
      soapProblems: [
        {
          title: '高血圧',
          entries: [
            { type: 'S', text: 'めまいが少しする' },
            { type: 'P', text: '血圧手帳の持参指導と減塩指導を継続' }
          ]
        }
      ]
    });

    assert.ok(draft.patientCondition?.includes('めまいが少しする'));
    assert.ok(draft.proposal?.includes('血圧手帳の持参指導'));
  });

  test('generateTracingReportPrintHtml produces clean A4 printable HTML', () => {
    const html = generateTracingReportPrintHtml(
      {
        subject: '【服薬情報提供】残薬調整のご報告',
        destinationInstitution: '中央病院',
        destinationDoctor: '高橋 医師',
        reportDate: '2026-07-26',
        proposal: '次回処方を7日間減算ご検討ください。'
      },
      {
        pharmacyName: 'サクラ薬局',
        pharmacyPhone: '03-1234-5678',
        defaultPharmacistName: '緑川 薬剤師'
      },
      '山田 太郎'
    );

    assert.ok(html.includes('服薬情報提供書'));
    assert.ok(html.includes('中央病院'));
    assert.ok(html.includes('高橋 医師'));
    assert.ok(html.includes('サクラ薬局'));
    assert.ok(html.includes('山田 太郎'));
    assert.ok(html.includes('7日間減算'));
  });
});
