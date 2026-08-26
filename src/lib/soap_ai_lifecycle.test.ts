import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SOAP_RECORD_SCHEMA } from '../db/schema.ts';
import { buildSoapAiDraftSuggestions } from './soap_ai_draft.ts';
import { buildAutoTracingReportDraft } from './tracing_report.ts';
import { escapeCsvCell, buildCsvRow, buildCsvDocument } from './csv_escape.ts';
import type { SoapRecord } from '../db/types.ts';

describe('P2-7 AI Output Lifecycle & Safety Suite', () => {
  describe('1. SOAP_RECORD_SCHEMA (v4) & AI Lifecycle Metadata', () => {
    test('SOAP_RECORD_SCHEMA is version 4', () => {
      assert.strictEqual(SOAP_RECORD_SCHEMA.version, 4);
    });

    test('validates full AI draft lifecycle entry (origin: ai_draft, aiStatus: unconfirmed/approved/modified)', () => {
      const validDoc: SoapRecord = {
        soapId: 'soap_test_101',
        visitId: 'visit_test_101',
        authorId: 'pharmacist_1',
        updatedAt: '2026-08-24T12:00:00.000Z',
        problems: [
          {
            id: 'prob_1',
            title: '#1 高血圧・服薬指導',
            entries: [
              {
                id: 'ent_1',
                type: 'S',
                text: '血圧は朝130台で安定しているとのこと。',
                origin: 'manual',
                aiStatus: 'approved',
                confirmedAt: '2026-08-24T12:05:00.000Z',
                confirmedBy: 'pharmacist_1'
              },
              {
                id: 'ent_2',
                type: 'O',
                text: '本日処方: アムロジピン錠5mg 1T 1x 朝食後 28日分',
                origin: 'ai_draft',
                aiStatus: 'unconfirmed',
                aiDraftId: 'soap-o-1'
              },
              {
                id: 'ent_3',
                type: 'P',
                text: '【過去の記録】以前の服薬指導メモ',
                origin: 'legacy_unspecified'
              }
            ]
          }
        ],
        structuredAssessment: {
          adherence: 'good',
          leftoverMedicine: 'none',
          adverseEvent: 'none',
          genericChangePreference: 'accepted',
          medicationNotebook: 'issued'
        }
      };

      assert.strictEqual(validDoc.problems[0].entries[0].origin, 'manual');
      assert.strictEqual(validDoc.problems[0].entries[1].origin, 'ai_draft');
      assert.strictEqual(validDoc.problems[0].entries[1].aiStatus, 'unconfirmed');
      assert.strictEqual(validDoc.problems[0].entries[2].origin, 'legacy_unspecified');
    });
  });

  describe('2. Tracing Report Exclusion for Unconfirmed AI Drafts', () => {
    test('buildAutoTracingReportDraft strictly excludes unconfirmed AI drafts and includes confirmed/legacy entries', () => {
      const draft = buildAutoTracingReportDraft({
        patientName: '患者 太郎',
        soapProblems: [
          {
            title: '糖尿病管理',
            entries: [
              {
                type: 'S',
                text: '【未確認S】患者は食事制限が難しいと漏らした',
                origin: 'ai_draft',
                aiStatus: 'unconfirmed'
              },
              {
                type: 'S',
                text: '【承認済S】朝食後の血糖値測定を欠かさず実施',
                origin: 'ai_draft',
                aiStatus: 'approved'
              },
              {
                type: 'A',
                text: '【未確認A】HbA1cの上昇傾向を懸念',
                origin: 'ai_draft',
                aiStatus: 'unconfirmed'
              },
              {
                type: 'A',
                text: '【手書きA】アドヒアランス良好、低血糖症状なし',
                origin: 'manual',
                aiStatus: 'approved'
              },
              {
                type: 'P',
                text: '【未確認P】次回処方時にインスリン増量を医師に提案検討',
                origin: 'ai_draft',
                aiStatus: 'unconfirmed'
              },
              {
                type: 'P',
                text: '【レガシーP】運動療法と水分補給の指導を継続',
                origin: 'legacy_unspecified'
              }
            ]
          }
        ]
      });

      // 未確認テキスト（unconfirmed）が院外文書（トレーシングレポート）に含まれていないこと
      assert.strictEqual(draft.patientCondition?.includes('【未確認S】'), false);
      assert.strictEqual(draft.assessment?.includes('【未確認A】'), false);
      assert.strictEqual(draft.proposal?.includes('【未確認P】'), false);

      // 承認済み（approved）、手書き（manual）、レガシー（legacy_unspecified）は正しく含まれること
      assert.ok(draft.patientCondition?.includes('【承認済S】'));
      assert.ok(draft.assessment?.includes('【手書きA】'));
      assert.ok(draft.proposal?.includes('【レガシーP】'));
    });
  });

  describe('3. AI Suggestion Guardrail & Disclaimer Transparency', () => {
    test('buildSoapAiDraftSuggestions includes explicit rule-based disclaimer in all suggestions', () => {
      const suggestions = buildSoapAiDraftSuggestions({
        prescribedDrugs: [
          {
            code: '2149004F1030',
            name: 'ワーファリン錠1mg',
            isHighRisk: true
          }
        ],
        warnings: [],
        patientAlerts: []
      });

      assert.ok(suggestions.length > 0);
      for (const s of suggestions) {
        assert.ok(
          s.guardrail.includes('【定型文】医薬品マスタ・監査ルールに基づく補助候補（臨床判断ではありません）'),
          `Suggestion ${s.draftId} should include the rule-based disclaimer`
        );
      }
    });
  });

  describe('4. CSV Formula Injection Prevention', () => {
    test('escapeCsvCell neutralizes spreadsheet command characters (=, +, -, @, \\t, \\r)', () => {
      assert.strictEqual(escapeCsvCell('=CMD|/C calc!A0'), '"\'=CMD|/C calc!A0"');
      assert.strictEqual(escapeCsvCell('+1+2'), '"\'+1+2"');
      assert.strictEqual(escapeCsvCell('-SUM(1..10)'), '"\'-SUM(1..10)"');
      assert.strictEqual(escapeCsvCell('@SUM(A1:B2)'), '"\'@SUM(A1:B2)"');
      assert.strictEqual(escapeCsvCell('\tcmd'), '"\'\tcmd"');
      assert.strictEqual(escapeCsvCell('\rcmd'), '"\'\rcmd"');
    });

    test('escapeCsvCell safely escapes normal text with double quotes', () => {
      assert.strictEqual(escapeCsvCell('カロナール細粒20% "アメル"'), '"カロナール細粒20% ""アメル"""');
      assert.strictEqual(escapeCsvCell(500), '"500"');
      assert.strictEqual(escapeCsvCell(null), '""');
    });

    test('buildCsvDocument builds valid CRLF RFC-4180 document with sanitized cells', () => {
      const doc = buildCsvDocument([
        ['ID', 'Name', 'Formula'],
        ['1', '患者A', '=1+1']
      ]);
      assert.strictEqual(doc, '"ID","Name","Formula"\r\n"1","患者A","\'=1+1"');
    });
  });
});
