import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CareChecklistCard,
  WarningInsightCard,
  SoapAiDraftInsightCard,
  VitalInsightCard,
  DocLinkInsightCard
} from './components/EmrInsightCards';
import type { SoapAiDraftSuggestion } from '@/lib/soap_ai_draft';

describe('EmrInsightCards renderToStaticMarkup contracts', () => {
  describe('CareChecklistCard', () => {
    it('renders all-clear state when there are no alerts or unpicked items', () => {
      const html = renderToStaticMarkup(
        React.createElement(CareChecklistCard, {
          warningCount: 0,
          isWarningsLoading: false,
          unpickedCount: 0,
          prescribedCount: 3,
          patientAlertCount: 0
        })
      );

      assert.ok(html.includes('服薬指導チェック'), 'Should render title');
      assert.ok(html.includes('確認済'), 'Patient alerts and warnings should be confirmed');
      assert.ok(html.includes('完了'), 'Picking status should be completed');
      assert.ok(html.includes('3薬'), 'Prescribed drug count should be displayed');
    });

    it('renders review state and pending warnings when loading or alerts exist', () => {
      const html = renderToStaticMarkup(
        React.createElement(CareChecklistCard, {
          warningCount: 2,
          isWarningsLoading: true,
          unpickedCount: 1,
          prescribedCount: 0,
          patientAlertCount: 1
        })
      );

      assert.ok(html.includes('1件'), 'Should render alert count');
      assert.ok(html.includes('解析中'), 'Should render parsing state when warnings loading');
      assert.ok(html.includes('未読込'), 'Should render unread state when 0 prescribed drugs');
    });
  });

  describe('WarningInsightCard', () => {
    it('renders loading state when isLoading is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(WarningInsightCard, {
          isLoading: true
        })
      );

      assert.ok(html.includes('相互作用・注意を解析中...'), 'Should render loading text');
    });

    it('renders is-clear state with green badge when warnings list is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(WarningInsightCard, {
          warnings: [],
          isLoading: false
        })
      );

      assert.ok(html.includes('id="emr-warning-insights"'), 'Should render container id');
      assert.ok(html.includes('is-clear'), 'Should render is-clear class');
      assert.ok(html.includes('相互作用・注意なし'), 'Should render clear title');
    });

    it('renders detailed contraindication and allergy alerts when warnings exist', () => {
      const mockWarnings = [
        {
          type: 'contraindication',
          severity: 'danger',
          drug1: 'イトラコナゾール錠50mg',
          drug2: 'シンバスタチン錠5mg',
          message: '併用によりシンバスタチンの血中濃度が著しく上昇するおそれ'
        },
        {
          type: 'patient_alert',
          severity: 'danger',
          alertType: 'allergy',
          drug: 'ペニシリン系抗生剤',
          message: '過去にアナフィラキシー既往あり'
        },
        {
          type: 'usage',
          severity: 'warning',
          drug: 'ロキソプロフェンナトリウム錠60mg',
          message: '胃潰瘍の既往があるため胃粘膜保護薬の併用を推奨'
        }
      ];

      const html = renderToStaticMarkup(
        React.createElement(WarningInsightCard, {
          warnings: mockWarnings,
          isLoading: false
        })
      );

      assert.ok(html.includes('相互作用・注意 (3件)'), 'Should render count in title');
      assert.ok(html.includes('併用禁忌:'), 'Should render contraindication label');
      assert.ok(html.includes('イトラコナゾール錠50mg と シンバスタチン錠5mg'), 'Should render interacting drugs');
      assert.ok(html.includes('薬剤アレルギー:'), 'Should render allergy alert label');
      assert.ok(html.includes('ペニシリン系抗生剤'), 'Should render allergenic drug');
      assert.ok(html.includes('用法注意:'), 'Should render usage precaution label');
      assert.ok(html.includes('ロキソプロフェンナトリウム錠60mg'), 'Should render precaution drug');
    });
  });

  describe('SoapAiDraftInsightCard', () => {
    it('renders clinical disclaimer and draft suggestion details with evidence links', () => {
      const mockSuggestions: SoapAiDraftSuggestion[] = [
        {
          draftId: 'draft-ckd-1',
          type: 'A',
          title: '腎機能低下に伴う用量確認',
          text: 'eGFR 38 mL/min/1.73m2 に応じた減量基準を満たしていることを確認済み。',
          severity: 'warning',
          confidence: 85,
          evidence: [
            {
              label: '検査値',
              detail: 'eGFR 38 (2026/09/15)',
              source: '検査データ',
              targetId: 'lab-egfr',
              targetLabel: '検査データ'
            }
          ],
          guardrail: '処方監査'
        }
      ];

      const html = renderToStaticMarkup(
        React.createElement(SoapAiDraftInsightCard, {
          suggestions: mockSuggestions,
          onApplyDraft: () => {},
          onFocusEvidence: () => {}
        })
      );

      assert.ok(html.includes('AI補助 SOAP下書き'), 'Should render card header');
      assert.ok(html.includes('【定型文】医薬品マスタ・監査ルールに基づく補助候補（臨床判断ではありません）'), 'Should render clinical disclaimer');
      assert.ok(html.includes('腎機能低下に伴う用量確認'), 'Should render draft title');
      assert.ok(html.includes('85%'), 'Should render confidence percentage');
      assert.ok(html.includes('検査値: eGFR 38 (2026/09/15)'), 'Should render evidence detail');
      assert.ok(html.includes('SOAPへ反映'), 'Should render apply button');
    });
  });

  describe('VitalInsightCard & DocLinkInsightCard', () => {
    it('renders vital insights placeholder card', () => {
      const html = renderToStaticMarkup(
        React.createElement(VitalInsightCard)
      );

      assert.ok(html.includes('バイタル・臨床検査値'), 'Should render vitals title');
      assert.ok(html.includes('最新の検査値（eGFR / Blood Pressure等）は未登録です'), 'Should render empty state');
    });

    it('renders drug documentation links when prescribed drugs are provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(DocLinkInsightCard, {
          prescribedDrugs: [
            { name: 'アムロジピン錠5mg' },
            { name: 'メトホルミン塩酸塩錠250mg' }
          ],
          onSelectGuidance: () => {}
        })
      );

      assert.ok(html.includes('指導文・患者説明資料'), 'Should render doc link header');
      assert.ok(html.includes('アムロジピン錠5mgの指導文書'), 'Should render drug 1 doc link button');
      assert.ok(html.includes('メトホルミン塩酸塩錠250mgの指導文書'), 'Should render drug 2 doc link button');
    });

    it('renders loading placeholder when prescribed drugs array is empty or undefined', () => {
      const html = renderToStaticMarkup(
        React.createElement(DocLinkInsightCard, {
          prescribedDrugs: [],
          onSelectGuidance: () => {}
        })
      );

      assert.ok(html.includes('処方薬を読み込み中...'), 'Should render loading placeholder when drugs are empty');
    });
  });
});
