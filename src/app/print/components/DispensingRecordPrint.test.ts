import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  Intervention,
  VisitElectronicPrescription,
  VisitElectronicPrescriptionLaboratoryResult
} from '@/db/types';
import {
  findOpeningTag,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';
import {
  ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS,
  type PharmacyInfo,
  type PrintPrescriptionItem
} from '../types';
import {
  DispensingRecordPrint,
  type DispensingRecordPrintProps
} from './DispensingRecordPrint';

const DEFAULT_PHARMACY_INFO: PharmacyInfo = {
  name: 'テスト調剤薬局',
  code: '1312345',
  postalCode: '100-0001',
  address: '千代田区',
  phone: '03-1234-5678',
  registrationNumber: 'T1234567890123',
  pharmacistName: '鈴木 花子'
};

function createMockElectronicPrescription(
  overrides: Partial<VisitElectronicPrescription> = {}
): VisitElectronicPrescription {
  return {
    prescriptionId: 'ep-record-001',
    documentKind: 'electronic_prescription',
    sourceMode: 'connector',
    receivedAt: '2026-11-03T10:00:00Z',
    appliedAt: '2026-11-03T10:05:00Z',
    validUntil: '2026-11-07T23:59:59Z',
    signatureStatus: 'valid',
    duplicateCheckStatus: 'passed',
    integrityHash: 'test-hash-sha256',
    receptionStatus: 'accepted',
    dispensingResultStatus: 'registered',
    dispensingResultId: 'disp-result-001',
    dispensingResultUpdatedAt: '2026-11-03T10:30:00Z',
    ...overrides
  };
}

function createMockPrintPrescriptionItem(
  overrides: Partial<PrintPrescriptionItem> = {}
): PrintPrescriptionItem {
  return {
    itemId: 'item-001',
    visitId: 'visit-001',
    drugId: '620000001',
    drugName: 'テスト錠10mg',
    genericName: 'テスト成分',
    dispensedGenericName: 'テスト成分',
    amount: 3,
    days: 7,
    usage: '1日3回食後',
    unitText: '錠',
    rpNumber: 1,
    dosageCategory: 'internal',
    price: 12.5,
    drugPrice: 12.5,
    drugPriceResolution: {
      price: 12.5,
      source: 'current'
    },
    yjCode: '1111001F1011',
    isHighRisk: false,
    ...overrides
  };
}

function createMockDispensingRecordPrintProps(
  overrides: Partial<DispensingRecordPrintProps> = {}
): DispensingRecordPrintProps {
  return {
    patientData: {
      patientId: 'pat-001',
      name: '調剤 太郎',
      birthDate: '1980-01-01'
    },
    visitData: {
      visitId: 'visit-001',
      institutionId: 'inst-001',
      institutionName: '中央総合病院',
      departmentId: 'dept-01',
      departmentName: '内科',
      doctorId: 'doc-01',
      doctorName: '佐藤 一郎',
      prescriptionDate: '2026-11-03',
      dispensingDate: '2026-11-03'
    },
    prescriptionItems: [],
    pharmacyInfo: DEFAULT_PHARMACY_INFO,
    pharmacyAddressLine: '東京都千代田区1-1-1',
    receiptRunId: 'REC-20261103-001',
    currentDateStr: '2026年11月3日',
    patientBirthDateStr: '1980年1月1日',
    dispensingDateStr: '2026年11月3日',
    prescriptionDateStr: '2026年11月3日',
    patientAge: 46,
    electronicPrescription: undefined,
    electronicPrescriptionIds: [],
    electronicPrescriptionDispensingResultStatus: 'pending',
    electronicPrescriptionDispensingInformationSignatureText: '',
    electronicPrescriptionDispensingInformationHpkiText: '',
    electronicPrescriptionDispensingInformationHashText: '',
    electronicPrescriptionComments: [],
    electronicPrescriptionLaboratoryResults: [],
    electronicPrescriptionNarcoticAdministration: undefined,
    renderIdentityMark: (variant) => React.createElement(
      'span',
      { 'data-testid': 'mock-identity-mark', 'data-variant': variant },
      '識別印A'
    ),
    isFirstItemInRp: () => true,
    interventions: [],
    ...overrides
  };
}

function extractClassTokens(tag: string): string[] {
  const match = tag.match(/\bclass="([^"]*)"/);
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

describe('DispensingRecordPrint SSR rendering contracts', () => {
  it('renders core dispensing record structure, metadata, pharmacy footer, and compact identity mark', () => {
    const requestedVariants: Array<'paper' | 'compact' | 'tiny' | undefined> = [];
    const html = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            renderIdentityMark: (variant) => {
              requestedVariants.push(variant);
              return React.createElement(
                'span',
                { 'data-testid': 'mock-identity-mark', 'data-variant': variant },
                '識別印A'
              );
            }
          })
        )
      )
    );

    const cardTag = findOpeningTag(html, '調剤録', 'section');
    assert.ok(extractClassTokens(cardTag).includes('dispensing-record-card'));
    const docTag = findOpeningTag(html, 'data-testid="dispensing-record-doc"', 'div');
    assert.ok(extractClassTokens(docTag).includes('dispensing-record-doc'));

    assert.deepEqual(requestedVariants, ['compact']);
    assert.ok(html.includes('data-testid="mock-identity-mark"'));
    assert.ok(html.includes('data-variant="compact"'));
    assert.ok(html.includes('受付番号: REC-20261103-001 / 発行 2026年11月3日'));
    assert.ok(html.includes('<th>患者氏名</th><td>調剤 太郎</td>'));
    assert.ok(html.includes('<th>年齢</th><td>46歳</td>'));
    assert.ok(html.includes('<th>生年月日</th><td>1980年1月1日</td>'));
    assert.ok(html.includes('<th>調剤年月日</th><td>2026年11月3日</td>'));
    assert.ok(html.includes('<th>処方箋発行年月日</th><td>2026年11月3日</td>'));
    assert.ok(html.includes('<th>情報提供・指導年月日</th><td>2026年11月3日</td>'));
    assert.ok(html.includes('<th>保険医療機関</th><td colSpan="3">中央総合病院</td>'));
    assert.ok(html.includes('<th>診療科</th><td>内科</td>'));
    assert.ok(html.includes('<th>処方医氏名</th><td>佐藤 一郎</td>'));
    assert.ok(html.includes('<th>調剤薬剤師</th><td>鈴木 花子</td>'));
    assert.ok(html.includes('<th>発行年月日</th><td>2026年11月3日</td>'));
    assert.ok(html.includes('<strong>テスト調剤薬局</strong>'));
    assert.ok(html.includes('東京都千代田区1-1-1'));
    assert.ok(html.includes('TEL: 03-1234-5678'));
    assert.ok(html.includes('調剤薬剤師: 鈴木 花子'));
    assert.ok(html.includes('<div class="pharmacist-seal-box">印</div>'));
  });

  it('falls back to IDs, 未設定 labels, and hyphen age while preserving 0歳', () => {
    const htmlWithIdsAndZeroAge = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            patientAge: 0,
            visitData: {
              visitId: 'visit-id-only',
              institutionId: '1319999',
              departmentId: '01',
              doctorId: 'DR-09'
            }
          })
        )
      )
    );

    assert.ok(htmlWithIdsAndZeroAge.includes('<th>年齢</th><td>0歳</td>'));
    assert.ok(htmlWithIdsAndZeroAge.includes('<th>保険医療機関</th><td colSpan="3">1319999</td>'));
    assert.ok(htmlWithIdsAndZeroAge.includes('<th>診療科</th><td>01</td>'));
    assert.ok(htmlWithIdsAndZeroAge.includes('<th>処方医氏名</th><td>DR-09</td>'));

    const htmlWithAllMissing = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            patientAge: undefined,
            visitData: {}
          })
        )
      )
    );

    assert.ok(htmlWithAllMissing.includes('<th>年齢</th><td>-</td>'));
    assert.ok(htmlWithAllMissing.includes('<th>保険医療機関</th><td colSpan="3">未設定</td>'));
    assert.ok(htmlWithAllMissing.includes('<th>診療科</th><td>未設定</td>'));
    assert.ok(htmlWithAllMissing.includes('<th>処方医氏名</th><td>未設定</td>'));
  });

  it('renders electronic prescription row across all dispensingResultStatus values and toggles SHA-256 hash display', () => {
    const htmlWithoutEp = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescription: undefined,
            electronicPrescriptionIds: ['ep-1', 'ep-2'],
            electronicPrescriptionDispensingInformationSignatureText: '署名検証済（有効）',
            electronicPrescriptionDispensingInformationHpkiText: 'HPKIカード認証済',
            electronicPrescriptionDispensingInformationHashText: 'hash-abc'
          })
        )
      )
    );

    assert.ok(!htmlWithoutEp.includes('<th>電子処方箋</th>'));
    assert.ok(!htmlWithoutEp.includes('<th>調剤情報提供ファイル署名</th>'));

    for (const [status, label] of Object.entries(ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS) as Array<
      [VisitElectronicPrescription['dispensingResultStatus'], string]
    >) {
      const htmlWithHash = stripStyleBlocks(
        renderToStaticMarkup(
          React.createElement(
            DispensingRecordPrint,
            createMockDispensingRecordPrintProps({
              electronicPrescription: createMockElectronicPrescription({ dispensingResultStatus: status }),
              electronicPrescriptionIds: ['ep-1', 'ep-2'],
              electronicPrescriptionDispensingResultStatus: status,
              electronicPrescriptionDispensingInformationSignatureText: '署名検証済（有効）',
              electronicPrescriptionDispensingInformationHpkiText: 'HPKIカード認証済',
              electronicPrescriptionDispensingInformationHashText: 'hash-abc'
            })
          )
        )
      );

      assert.ok(htmlWithHash.includes('<th>電子処方箋</th>'));
      assert.ok(htmlWithHash.includes(`処方箋 2件 / ${label}`));
      assert.ok(htmlWithHash.includes('<th>調剤情報提供ファイル署名</th>'));
      assert.ok(htmlWithHash.includes('署名検証済（有効） / HPKIカード認証済 / SHA-256 hash-abc'));
    }

    const htmlWithoutHash = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescription: createMockElectronicPrescription(),
            electronicPrescriptionIds: ['ep-1'],
            electronicPrescriptionDispensingResultStatus: 'registered',
            electronicPrescriptionDispensingInformationSignatureText: '署名検証済（有効）',
            electronicPrescriptionDispensingInformationHpkiText: 'HPKIカード認証済',
            electronicPrescriptionDispensingInformationHashText: ''
          })
        )
      )
    );

    assert.ok(htmlWithoutHash.includes('処方箋 1件 / 登録済み'));
    assert.ok(htmlWithoutHash.includes('<td>署名検証済（有効） / HPKIカード認証済</td>'));
    assert.ok(!htmlWithoutHash.includes('SHA-256'));
  });

  it('renders prescription items with Rp, drug name, daily/total amounts, usage fallbacks, days, and notes', () => {
    const firstInRpCalls: Array<{ itemId: string; index: number }> = [];
    const internalItem = createMockPrintPrescriptionItem({
      itemId: 'item-internal',
      rpNumber: 1,
      drugName: '先発品A錠10mg',
      dispensedDrug: '後発品A錠10mg',
      changeReason: '患者希望',
      amount: 3,
      days: 7,
      unitText: '錠',
      usage: '1日3回毎食後',
      dosageCategory: 'internal',
      isIppoka: true,
      isCrushed: true,
      rpComment: '粉砕分包指示'
    });
    const externalItem = createMockPrintPrescriptionItem({
      itemId: 'item-external',
      rpNumber: 0,
      drugName: '外用軟膏B 10g',
      dispensedDrug: undefined,
      amount: 2,
      days: 0,
      unitText: '本',
      usage: '',
      dosageCategory: 'external',
      isIppoka: false,
      isCrushed: false,
      rpComment: undefined
    });

    const html = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            prescriptionItems: [internalItem, externalItem],
            isFirstItemInRp: (item, index) => {
              firstInRpCalls.push({ itemId: item.itemId, index });
              return index === 0;
            }
          })
        )
      )
    );

    assert.deepEqual(firstInRpCalls, [
      { itemId: 'item-internal', index: 0 },
      { itemId: 'item-external', index: 1 }
    ]);

    assert.ok(
      html.includes(
        '<tr><td class="text-center">1</td><td>後発品A錠10mg</td><td>1日量 3 錠</td><td>1日3回毎食後</td><td>7 日分</td><td class="text-sm">後発変更: 後発品A錠10mg / 変更理由: 患者希望 / 一包化 / 粉砕 / 粉砕分包指示</td></tr>'
      )
    );
    assert.ok(
      html.includes(
        '<tr><td class="text-center">-</td><td>外用軟膏B 10g</td><td>全量 2 本</td><td>未設定</td><td>-</td><td class="text-sm">-</td></tr>'
      )
    );
  });

  it('omits supplementary info section when comments, laboratory results, and narcotic administration are empty', () => {
    const html = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescriptionComments: [],
            electronicPrescriptionLaboratoryResults: [],
            electronicPrescriptionNarcoticAdministration: undefined
          })
        )
      )
    );

    assert.ok(!html.includes('data-testid="electronic-prescription-supplementary-print"'));
    assert.ok(!html.includes('電子処方箋の処方補足情報'));
    assert.ok(!html.includes('electronic-prescription-supplementary-print'));
  });

  it('renders only prescription comments when only electronicPrescriptionComments are provided', () => {
    const html = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescriptionComments: ['一包化指示あり', '嚥下困難のため粉砕希望'],
            electronicPrescriptionLaboratoryResults: [],
            electronicPrescriptionNarcoticAdministration: undefined
          })
        )
      )
    );

    const suppTag = findOpeningTag(html, 'data-testid="electronic-prescription-supplementary-print"', 'div');
    assert.ok(extractClassTokens(suppTag).includes('electronic-prescription-supplementary-print'));
    assert.ok(html.includes('電子処方箋の処方補足情報'));
    assert.ok(html.includes('<p>処方コメント: 一包化指示あり</p>'));
    assert.ok(html.includes('<p>処方コメント: 嚥下困難のため粉砕希望</p>'));
    assert.ok(!html.includes('検査値:'));
    assert.ok(!html.includes('麻薬施用情報:'));
  });

  it('renders laboratory results with optional unit, referenceRange, and measuredAt formatting', () => {
    const measuredAtIso = '2026-11-03T01:30:00Z';
    const expectedMeasuredText = new Date(measuredAtIso).toLocaleString('ja-JP');
    const labResults: VisitElectronicPrescriptionLaboratoryResult[] = [
      {
        testName: 'eGFR',
        value: '52.4',
        unit: 'mL/min/1.73m2',
        referenceRange: '60以上',
        measuredAt: measuredAtIso
      },
      {
        testName: 'HbA1c',
        value: '6.8'
      }
    ];

    const html = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescriptionComments: [],
            electronicPrescriptionLaboratoryResults: labResults,
            electronicPrescriptionNarcoticAdministration: undefined
          })
        )
      )
    );

    const suppTag = findOpeningTag(html, 'data-testid="electronic-prescription-supplementary-print"', 'div');
    assert.ok(extractClassTokens(suppTag).includes('electronic-prescription-supplementary-print'));
    assert.ok(html.includes(`<p>検査値: eGFR 52.4 mL/min/1.73m2 / 基準 60以上 / ${expectedMeasuredText}</p>`));
    assert.ok(html.includes('<p>検査値: HbA1c 6.8</p>'));
    assert.ok(!html.includes('処方コメント:'));
    assert.ok(!html.includes('麻薬施用情報:'));
  });

  it('renders narcotic administration text and falls back to 表示不可 when displayText is empty', () => {
    const htmlWithText = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescriptionNarcoticAdministration: {
              isNarcoticPrescription: true,
              recordPresent: true,
              displayText: '麻薬施用者番号 123456'
            }
          })
        )
      )
    );

    const suppTagWithText = findOpeningTag(htmlWithText, 'data-testid="electronic-prescription-supplementary-print"', 'div');
    assert.ok(extractClassTokens(suppTagWithText).includes('electronic-prescription-supplementary-print'));
    assert.ok(htmlWithText.includes('<p>麻薬施用情報: 麻薬施用者番号 123456</p>'));
    assert.ok(!htmlWithText.includes('表示不可'));

    const htmlEmptyText = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescriptionNarcoticAdministration: {
              isNarcoticPrescription: true,
              recordPresent: false,
              displayText: ''
            }
          })
        )
      )
    );

    const suppTagEmptyText = findOpeningTag(htmlEmptyText, 'data-testid="electronic-prescription-supplementary-print"', 'div');
    assert.ok(extractClassTokens(suppTagEmptyText).includes('electronic-prescription-supplementary-print'));
    assert.ok(htmlEmptyText.includes('<p>麻薬施用情報: 表示不可</p>'));
  });

  it('renders all three supplementary info sections together when comments, labs, and narcotic info exist', () => {
    const html = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            electronicPrescriptionComments: ['腎機能確認の上で減量済み'],
            electronicPrescriptionLaboratoryResults: [
              { testName: 'Cr', value: '1.35', unit: 'mg/dL', referenceRange: '0.65-1.07' }
            ],
            electronicPrescriptionNarcoticAdministration: {
              isNarcoticPrescription: true,
              recordPresent: true,
              displayText: '麻薬処方箋確認済'
            }
          })
        )
      )
    );

    assert.ok(html.includes('<p>処方コメント: 腎機能確認の上で減量済み</p>'));
    assert.ok(html.includes('<p>検査値: Cr 1.35 mg/dL / 基準 0.65-1.07</p>'));
    assert.ok(html.includes('<p>麻薬施用情報: 麻薬処方箋確認済</p>'));
  });

  it('falls back to matching legacy interventions when visitData.interventionEvents is absent and prioritizes visitData.interventionEvents', () => {
    const legacyInterventions: Intervention[] = [
      {
        interventionId: 'int-match',
        visitId: 'visit-001',
        reason: '重複投薬の疑義照会',
        inquiryMethod: 'fax',
        inquiryDoctor: '田中 次郎',
        inquiryResult: '削除了承',
        patientConsented: true,
        contactedAt: '2026-11-03T01:00:00Z',
        handledBy: '山田 薬剤師'
      },
      {
        interventionId: 'int-other-visit',
        visitId: 'visit-999',
        reason: '別来局の照会',
        inquiryMethod: 'phone',
        inquiryDoctor: '別医師',
        inquiryResult: '別結果',
        patientConsented: false,
        contactedAt: '2026-11-03T02:00:00Z',
        handledBy: '別担当者'
      }
    ];

    const htmlLegacyFallback = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            visitData: {
              visitId: 'visit-001'
            },
            interventions: legacyInterventions
          })
        )
      )
    );

    assert.ok(htmlLegacyFallback.includes('record-intervention-table'));
    assert.ok(htmlLegacyFallback.includes('田中 次郎 医師 (FAX)'));
    assert.ok(htmlLegacyFallback.includes('重複投薬の疑義照会'));
    assert.ok(htmlLegacyFallback.includes('削除了承'));
    assert.ok(htmlLegacyFallback.includes('山田 薬剤師'));
    assert.ok(!htmlLegacyFallback.includes('別来局の照会'));
    assert.ok(!htmlLegacyFallback.includes('疑義照会・処方変更なし'));

    const htmlPriority = stripStyleBlocks(
      renderToStaticMarkup(
        React.createElement(
          DispensingRecordPrint,
          createMockDispensingRecordPrintProps({
            visitData: {
              visitId: 'visit-001',
              interventionEvents: [
                {
                  eventId: 'ev-priority',
                  category: 'dosage_change',
                  reason: '減量照会（visitイベント優先）',
                  inquiryStatus: 'completed',
                  inquiryMethod: 'in_person',
                  inquiryDoctor: '優先 医師',
                  inquiryResult: '半量へ変更',
                  patientConsented: true,
                  contactedAt: '2026-11-03T03:00:00Z',
                  handledBy: '優先 薬剤師'
                }
              ]
            },
            interventions: legacyInterventions
          })
        )
      )
    );

    assert.ok(htmlPriority.includes('減量照会（visitイベント優先）'));
    assert.ok(htmlPriority.includes('優先 医師 医師 (対面)'));
    assert.ok(htmlPriority.includes('<span class="intervention-cat-badge">用法・用量変更</span>'));
    assert.ok(!htmlPriority.includes('重複投薬の疑義照会'));
  });
});
