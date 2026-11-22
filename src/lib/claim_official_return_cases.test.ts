import test from 'node:test';
import assert from 'node:assert/strict';
import type { FacilitySettings, Patient } from '@/db/types';
import {
  buildAutomaticDisabledFeeRationales,
  calculateDispensingFees,
  getDispensingFeeOffReasons,
  getTotalPoints,
  type CalculationResultItem,
  type ItemWithPrice
} from './calculator.ts';
import { validateDispensingClaim, type ClaimValidationItem } from './claim_validation.ts';
import {
  CLAIM_OFFICIAL_RULE_SOURCE,
  buildClaimOfficialRuleReview,
  buildClaimOfficialRuleReviewCsv,
  type ClaimOfficialRuleReviewItem,
  type ClaimOfficialRuleSourceKind
} from './claim_rule_review.ts';
import { inferClaimReturnReasonCode } from './claim_return_manager.ts';

/**
 * トラック C-3: 厚労省令和8年度調剤報酬改定（告示・通知・疑義解釈）および返戻事例の
 * 構造化回帰フィクスチャ基盤。
 *
 * 新たな現物返戻事例や疑義解釈が追加された際は、このフィクスチャ配列へケースを追記することで
 * calculateDispensingFees -> validateDispensingClaim -> buildClaimOfficialRuleReview の
 * 3層を一貫検証できる（患者実名・実IDは一切入れない）。
 */
interface OfficialClaimRegressionFixture {
  fixtureId: string;
  title: string;
  sourceKind: ClaimOfficialRuleSourceKind;
  sourceCitation: string;
  sourceUrl: string;
  returnReasonDescription: string;
  expectedReturnReasonCode: string;
  serviceDate: string;
  settings: FacilitySettings;
  patient: Patient;
  items: ClaimValidationItem[];
  /** 計算結果へ意図的に不正加算を混入させてレビュー・事前検証の検知能力を確認したい場合に使用 */
  injectedFees?: CalculationResultItem[];
  expectedProhibitedOffReasonCodes?: string[];
  expectedValidationIssueCodes?: string[];
  expectedRuleAttentions?: ClaimOfficialRuleReviewItem['ruleId'][];
}

const BASE_SETTINGS: FacilitySettings = {
  id: 'default',
  pharmacyName: '検証薬局',
  pharmacyCode: '1310000001',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none'
};

const BASE_PATIENT: Patient = {
  patientId: 'fixture-patient-01',
  name: '匿名 検証患者',
  kana: 'トクメイ ケンショウカンジャ',
  birthDate: '1970-01-01',
  gender: 'male',
  insuranceInfo: {
    insuranceType: '社保',
    provider: '06130012',
    number: '1234-567890',
    burdenRatio: 3,
    validFrom: '2025-04-01',
    validTo: '2027-03-31'
  }
};

function makeItem(overrides: Partial<ClaimValidationItem> = {}): ClaimValidationItem {
  return {
    itemId: 'item-1',
    visitId: 'visit-c3-1',
    drugId: '620000001',
    drugName: 'テスト内服錠10mg',
    yjCode: '2171022F1020',
    amount: 1,
    days: 14,
    usage: '1日1回 朝食後',
    drugPrice: 12.3,
    ...overrides
  };
}

const OFFICIAL_REGRESSION_FIXTURES: OfficialClaimRegressionFixture[] = [
  {
    fixtureId: 'MHLW-R8-SPECIAL-B-REGIONAL-2',
    title: '特別調剤基本料Bでは地域支援・医薬品供給対応体制加算2を算定不可',
    sourceKind: 'notification',
    sourceCitation: '令和8年度調剤報酬改定 調剤基本料 注（特別調剤基本料Bは地域支援・医薬品供給対応体制加算を算定できない）',
    sourceUrl: CLAIM_OFFICIAL_RULE_SOURCE.url,
    returnReasonDescription: '特別調剤基本料Bにおける地域支援・医薬品供給対応体制加算の算定要件不備',
    expectedReturnReasonCode: 'R04',
    serviceDate: '2026-06-15',
    settings: {
      ...BASE_SETTINGS,
      baseFeeCategory: 'special_b',
      regionalSupportAddition: '2'
    },
    patient: BASE_PATIENT,
    items: [makeItem()],
    injectedFees: [
      {
        code: 'base_additions',
        feeKey: 'regional_support_addition_2',
        name: '地域支援・医薬品供給対応体制加算2',
        points: 59,
        rationale: '不正混入テスト'
      }
    ],
    expectedProhibitedOffReasonCodes: ['regional_support_special_b_prohibited'],
    expectedValidationIssueCodes: ['regional_support_special_b_prohibited'],
    expectedRuleAttentions: ['regional_support_special_b_prohibited']
  },
  {
    fixtureId: 'MHLW-R8-SPECIAL-B-MEDICAL-DX',
    title: '特別調剤基本料Bでは電子的調剤情報連携体制整備加算を算定不可',
    sourceKind: 'notification',
    sourceCitation: '令和8年度調剤報酬改定 調剤基本料 注（特別調剤基本料Bは電子的調剤情報連携体制整備加算を算定できない）',
    sourceUrl: CLAIM_OFFICIAL_RULE_SOURCE.url,
    returnReasonDescription: '特別調剤基本料Bの電子的調剤情報連携体制整備加算の算定要件不備',
    expectedReturnReasonCode: 'R04',
    serviceDate: '2026-06-15',
    settings: {
      ...BASE_SETTINGS,
      baseFeeCategory: 'special_b',
      medicalDxAddition: true
    },
    patient: BASE_PATIENT,
    items: [makeItem()],
    injectedFees: [
      {
        code: 'base_additions',
        feeKey: 'medical_dx_addition',
        name: '電子的調剤情報連携体制整備加算',
        points: 8,
        rationale: '不正混入テスト'
      }
    ],
    expectedProhibitedOffReasonCodes: ['medical_dx_special_b_prohibited'],
    expectedValidationIssueCodes: ['medical_dx_special_b_prohibited'],
    expectedRuleAttentions: ['medical_dx_special_b_prohibited']
  },
  {
    fixtureId: 'MHLW-R8-DIAGNOSTIC-ONLY-RETURN',
    title: '検査薬のみの処方で薬剤調製料・薬学管理料を算定した返戻ケース',
    sourceKind: 'qa',
    sourceCitation: '疑義解釈・返戻事例（検査薬は薬剤料のみ算定し、調剤技術料・薬学管理料を算定しない）',
    sourceUrl: CLAIM_OFFICIAL_RULE_SOURCE.url,
    returnReasonDescription: '検査薬の薬剤調製料・薬学管理料の算定不備',
    expectedReturnReasonCode: 'R04',
    serviceDate: '2026-06-15',
    settings: BASE_SETTINGS,
    patient: BASE_PATIENT,
    items: [makeItem({ isDiagnosticTest: true, drugName: '検査用試薬テスト', claimPreparation: true, claimManagement: true })],
    expectedValidationIssueCodes: ['diagnostic_preparation_enabled', 'diagnostic_management_enabled', 'diagnostic_drug_fee_only_required'],
    expectedRuleAttentions: ['diagnostic_drug_fee_only']
  },
  {
    fixtureId: 'RETURN-CASE-INSURANCE-EXPIRED',
    title: '保険資格の有効期限切れによる資格不一致返戻ケース',
    sourceKind: 'return_case',
    sourceCitation: '審査支払機関 資格確認返戻事例（調剤日が保険有効期限を超過）',
    sourceUrl: CLAIM_OFFICIAL_RULE_SOURCE.url,
    returnReasonDescription: '調剤日時点で保険資格が失効している',
    expectedReturnReasonCode: 'R01',
    serviceDate: '2026-06-15',
    settings: BASE_SETTINGS,
    patient: {
      ...BASE_PATIENT,
      insuranceInfo: {
        ...BASE_PATIENT.insuranceInfo,
        validTo: '2026-05-31'
      }
    },
    items: [makeItem()],
    expectedValidationIssueCodes: ['insurance_expired'],
    expectedRuleAttentions: ['insurance_effective_period']
  },
  {
    fixtureId: 'RETURN-CASE-ABOLISHED-DRUG',
    title: '経過措置切れ・廃止薬品のまま請求した返戻ケース',
    sourceKind: 'return_case',
    sourceCitation: '審査支払機関 医薬品コード返戻事例（廃止・経過措置満了医薬品コードの請求）',
    sourceUrl: CLAIM_OFFICIAL_RULE_SOURCE.url,
    returnReasonDescription: '処方箋の医薬品コードが廃止済みで不一致',
    expectedReturnReasonCode: 'R05',
    serviceDate: '2026-06-15',
    settings: BASE_SETTINGS,
    patient: BASE_PATIENT,
    items: [makeItem({ isAbolished: true, drugName: '経過措置満了テスト錠' })],
    expectedValidationIssueCodes: ['abolished_drug_claimed'],
    expectedRuleAttentions: ['drug_master_claim_eligibility']
  }
];

test('C-3: calculator suppresses all regionalSupportAddition tiers (1..5) under special_b with exact point deltas and rationales', () => {
  const tiers: Array<{ tier: Exclude<FacilitySettings['regionalSupportAddition'], 'none'>; points: number }> = [
    { tier: '1', points: 27 },
    { tier: '2', points: 59 },
    { tier: '3', points: 67 },
    { tier: '4', points: 37 },
    { tier: '5', points: 59 }
  ];
  const items: ItemWithPrice[] = [makeItem()];

  for (const { tier, points } of tiers) {
    const specialBSettings: FacilitySettings = {
      ...BASE_SETTINGS,
      baseFeeCategory: 'special_b',
      regionalSupportAddition: tier
    };
    const base1Settings: FacilitySettings = {
      ...BASE_SETTINGS,
      baseFeeCategory: '1',
      regionalSupportAddition: tier
    };

    const specialBFees = calculateDispensingFees(specialBSettings, items, BASE_PATIENT, '2026-06-15');
    const base1Fees = calculateDispensingFees(base1Settings, items, BASE_PATIENT, '2026-06-15');

    // 調剤基本料1では地域支援加算が規定点数で算定される（非 special_b への副作用なし）
    const base1Rs = base1Fees.find((fee) => fee.feeKey === `regional_support_addition_${tier}`);
    assert.ok(base1Rs, `調剤基本料1で加算${tier}が算定されること`);
    assert.equal(base1Rs.points, points);

    // 特別調剤基本料Bでは地域支援加算が除外される（基本料差 47-3=44点 + 加算分 points 点の差）
    assert.equal(
      specialBFees.some((fee) => fee.feeKey === `regional_support_addition_${tier}`),
      false,
      `特別調剤基本料Bでは地域支援加算${tier}が算定されないこと`
    );
    assert.equal(getTotalPoints(base1Fees) - getTotalPoints(specialBFees), (47 - 3) + points);

    const reasons = getDispensingFeeOffReasons(specialBSettings, BASE_PATIENT, '2026-06-15');
    assert.ok(reasons.some((r) => r.issueCode === 'regional_support_special_b_prohibited' && r.feeKey === `regional_support_addition_${tier}`));

    const rationales = buildAutomaticDisabledFeeRationales(specialBSettings, BASE_PATIENT, '2026-06-15');
    assert.match(rationales[`regional_support_addition_${tier}`], /特別調剤基本料B/);
  }
});

test('C-3: multiple high-risk drugs in a single prescription produce only one 特定薬剤管理指導加算1 (10 points)', () => {
  const items: ItemWithPrice[] = [
    makeItem({ itemId: 'hr-1', drugId: '620000101', drugName: 'ワルファリンカリウム錠1mg', isHighRisk: true, tokkanType: '1' }),
    makeItem({ itemId: 'hr-2', drugId: '620000102', drugName: 'インスリン製剤テスト', isHighRisk: true, tokkanType: '1' }),
    makeItem({ itemId: 'hr-3', drugId: '620000103', drugName: 'RMP対象薬テスト', tokkanType: '3_i' })
  ];
  const fees = calculateDispensingFees(BASE_SETTINGS, items, BASE_PATIENT, '2026-06-15');
  const specialFees = fees.filter((fee) => fee.code === 'special_management');

  assert.equal(specialFees.length, 1);
  assert.equal(specialFees[0].name, '特定薬剤管理指導加算1');
  assert.equal(specialFees[0].points, 10);

  // 服薬管理指導料をOFFにすると特定薬剤管理指導加算も連動して算定されない
  const withoutGuidance = calculateDispensingFees(BASE_SETTINGS, items, BASE_PATIENT, '2026-06-15', {
    disabledFeeCodes: ['medication_guidance']
  });
  assert.equal(withoutGuidance.some((fee) => fee.code === 'special_management'), false);
});

test('C-3: structured MHLW R8 official notice, Q&A, and return-case fixtures pass end-to-end across calculator, validation, and rule review', () => {
  for (const fixture of OFFICIAL_REGRESSION_FIXTURES) {
    assert.equal(
      inferClaimReturnReasonCode(fixture.returnReasonDescription),
      fixture.expectedReturnReasonCode,
      `${fixture.fixtureId}: return reason code mismatch`
    );

    const calculatedFees = calculateDispensingFees(
      fixture.settings,
      fixture.items,
      fixture.patient,
      fixture.serviceDate
    );

    if (fixture.expectedProhibitedOffReasonCodes) {
      const offReasons = getDispensingFeeOffReasons(fixture.settings, fixture.patient, fixture.serviceDate);
      for (const expectedCode of fixture.expectedProhibitedOffReasonCodes) {
        assert.ok(
          offReasons.some((reason) => reason.issueCode === expectedCode && reason.category === 'prohibited'),
          `${fixture.fixtureId}: expected prohibited off-reason ${expectedCode}`
        );
      }
    }

    const feesUnderReview = fixture.injectedFees
      ? [...calculatedFees, ...fixture.injectedFees]
      : calculatedFees;

    const validationIssues = validateDispensingClaim({
      settings: fixture.settings,
      patient: fixture.patient,
      items: fixture.items,
      calculatedFees: feesUnderReview,
      totalPoints: getTotalPoints(feesUnderReview),
      serviceDate: fixture.serviceDate
    });

    for (const expectedCode of fixture.expectedValidationIssueCodes ?? []) {
      assert.ok(
        validationIssues.some((issue) => issue.code === expectedCode && issue.severity === 'error'),
        `${fixture.fixtureId}: expected validation error ${expectedCode}, got ${validationIssues.map((i) => i.code).join(',')}`
      );
    }

    const reviewReport = buildClaimOfficialRuleReview({
      currentCase: {
        caseId: fixture.fixtureId,
        patientKey: fixture.patient.patientId,
        serviceDate: fixture.serviceDate,
        baseFeeCategory: fixture.settings.baseFeeCategory,
        calculatedFees: feesUnderReview,
        validationIssues
      }
    });

    for (const expectedRuleId of fixture.expectedRuleAttentions ?? []) {
      const ruleItem = reviewReport.items.find((item) => item.ruleId === expectedRuleId);
      assert.ok(ruleItem, `${fixture.fixtureId}: missing rule ${expectedRuleId}`);
      assert.equal(ruleItem.status, 'attention', `${fixture.fixtureId}: expected attention on ${expectedRuleId}`);
      assert.equal(ruleItem.severity, 'error', `${fixture.fixtureId}: expected error severity on ${expectedRuleId}`);
    }

    // 患者氏名・患者ID・薬品名が患者情報なしCSVに漏洩しないこと
    const csv = buildClaimOfficialRuleReviewCsv(reviewReport);
    assert.doesNotMatch(csv, /匿名 検証患者|fixture-patient-01|経過措置満了テスト錠|検査用試薬テスト/);
  }
});
