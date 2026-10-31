import { test } from 'node:test';
import assert from 'node:assert';
import {
  SELF_PAY_UKE_BLOCKED_MESSAGE,
  describeSelfPayExclusion,
  isExplicitSelfPayInsuranceType,
  isSelfPayPatient,
  partitionSelfPayClaims
} from './self_pay_claim.ts';
import { classifyInsuranceForBarcode } from './receipt_barcode.ts';
import { validateDispensingClaim } from './claim_validation.ts';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkeBundle,
  buildMonthlyClaimUkeResults,
  validateMonthlyClaimUkeBatch,
  type MonthlyClaimUkeCase
} from './monthly_claim_uke.ts';
import { buildDispensingUkeRecords } from './receipt/dispensing_uke.ts';
import { buildSingleDispensingUkeOfficial } from './receipt/dispensing_uke_official_single.ts';
import {
  calculateDashboardClaimRisks,
  calculateDashboardClaimWorkItems
} from './dashboard_tasks.ts';
import type { FacilitySettings, Patient, Visit } from '../db/types.ts';
import type { CalculationResultItem } from './calculator.ts';

// ---- 判定 (除外するのは、保険種別に「自費」と入れた患者だけ) ----

test('only a 保険種別 containing 自費 counts as self pay', () => {
  for (const type of ['自費', ' 自費 ', '自費診療', '自費(保険なし)']) {
    assert.strictEqual(isExplicitSelfPayInsuranceType(type), true, JSON.stringify(type));
  }
  for (const type of ['社保', '国保', '後期高齢', '協会けんぽ', '労災', '自賠責', '公費', '', '   ', undefined, null, 0, {}]) {
    assert.strictEqual(isExplicitSelfPayInsuranceType(type), false, JSON.stringify(type));
  }
});

test('a patient is self pay only when the insurance type says so, not when the insurance info is missing or unrecognised', () => {
  assert.strictEqual(isSelfPayPatient({ insuranceInfo: { insuranceType: '自費' } }), true);
  assert.strictEqual(isSelfPayPatient({ insuranceInfo: { insuranceType: '社保', provider: '01130012' } }), false);
  // 領収証のバーコードでは「自費扱い」になるが、請求からは外さない (いま請求できている患者を落とさないため)
  assert.strictEqual(isSelfPayPatient({ insuranceInfo: { insuranceType: '', provider: '12345' } }), false, 'blank type, unclassifiable provider');
  assert.strictEqual(isSelfPayPatient({ insuranceInfo: { provider: '1234567' } }), false, 'no type at all');
  assert.strictEqual(isSelfPayPatient({ insuranceInfo: {} }), false, 'empty insurance info');
  assert.strictEqual(isSelfPayPatient({}), false, 'no insurance info');
  assert.strictEqual(isSelfPayPatient({ insuranceInfo: { insuranceType: '労災' } }), false, 'workers comp is not excluded');
  assert.strictEqual(isSelfPayPatient(null), false);
  assert.strictEqual(isSelfPayPatient(undefined), false);
});

test('every patient the barcode calls 自費扱い (assumed) stays billable; only the explicit choice is excluded', () => {
  const unclassifiable = [
    {},
    { insuranceType: '労災' },
    { insuranceType: '自賠責' },
    { provider: '12345' },
    { provider: '1234567' },
    { insuranceType: '', provider: '123456789' }
  ];
  for (const info of unclassifiable) {
    const barcode = classifyInsuranceForBarcode(info);
    assert.strictEqual(barcode.category, 'self_pay');
    assert.strictEqual(barcode.assumed, true, JSON.stringify(info));
    assert.strictEqual(isSelfPayPatient({ insuranceInfo: info }), false, `billable: ${JSON.stringify(info)}`);
  }
  // 明示した自費は、バーコードでも請求でも自費
  const explicit = classifyInsuranceForBarcode({ insuranceType: '自費' });
  assert.deepStrictEqual([explicit.category, explicit.assumed], ['self_pay', false]);
  assert.strictEqual(isSelfPayPatient({ insuranceInfo: { insuranceType: '自費' } }), true);
});

// ---- 候補の仕分け ----

const candidate = (visitId: string, patientId: string, insuranceType?: string, name = `患者${patientId}`) => ({
  visit: { visitId },
  patient: { patientId, name, insuranceInfo: insuranceType === undefined ? undefined : { insuranceType } }
});

test('partitionSelfPayClaims separates self-pay patients and keeps the order of the rest', () => {
  const { claimable, excluded } = partitionSelfPayClaims([
    candidate('v1', 'p1', '社保'),
    candidate('v2', 'p2', '自費', '自費 花子'),
    candidate('v3', 'p3'),
    candidate('v4', 'p4', '国保'),
    candidate('v5', 'p5', '自費')
  ]);
  assert.deepStrictEqual(claimable.map((c) => c.visit.visitId), ['v1', 'v3', 'v4']);
  assert.deepStrictEqual(excluded, [
    { visitId: 'v2', patientId: 'p2', patientName: '自費 花子' },
    { visitId: 'v5', patientId: 'p5', patientName: '患者p5' }
  ]);
});

test('an excluded patient without a name is reported as 氏名未設定, not as an empty name', () => {
  const noName = { visit: { visitId: 'v1' }, patient: { patientId: 'p1', insuranceInfo: { insuranceType: '自費' } } };
  const emptyName = { visit: { visitId: 'v2' }, patient: { patientId: 'p2', name: '', insuranceInfo: { insuranceType: '自費' } } };
  const { excluded } = partitionSelfPayClaims([noName, emptyName]);
  assert.deepStrictEqual(excluded, [
    { visitId: 'v1', patientId: 'p1', patientName: '氏名未設定' },
    { visitId: 'v2', patientId: 'p2', patientName: '氏名未設定' }
  ]);
});

test('partitionSelfPayClaims handles nothing to bill and a month of only self-pay patients', () => {
  assert.deepStrictEqual(partitionSelfPayClaims([]), { claimable: [], excluded: [] });
  const allSelfPay = partitionSelfPayClaims([candidate('v1', 'p1', '自費'), candidate('v2', 'p2', '自費')]);
  assert.deepStrictEqual(allSelfPay.claimable, []);
  assert.strictEqual(allSelfPay.excluded.length, 2);
});

test('describeSelfPayExclusion tells how many were left out, and says so when nothing is left to bill', () => {
  assert.strictEqual(describeSelfPayExclusion([], 3), null);
  assert.strictEqual(describeSelfPayExclusion([], 0), null);
  const one = [{ visitId: 'v1', patientId: 'p1', patientName: 'A' }];
  assert.strictEqual(describeSelfPayExclusion(one, 2), '保険種別が「自費」の患者 1件は請求の対象外のため、除外しました。');
  assert.strictEqual(
    describeSelfPayExclusion(one, 0),
    '保険種別が「自費」の患者 1件は請求の対象外のため、除外しました。請求の対象はありません（すべて自費の患者でした）。'
  );
});

// ---- UKEの組み立て: 自費の患者のUKEは作らない ----

const settings: FacilitySettings = {
  id: 'default',
  pharmacyName: '青空薬局',
  pharmacyKana: 'アオゾラヤッキョク',
  pharmacyCode: '1234567',
  pharmacyPostalCode: '100-0001',
  pharmacyAddress: '東京都千代田区1-1-1',
  pharmacyPhone: '03-1111-2222',
  registrationNumber: 'T1234567890123',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none',
  genericDispensingReduction: false
};

const visit: Visit = {
  visitId: 'v_001',
  patientId: 'p_001',
  institutionId: 'clinic_001',
  doctorId: 'doctor_001',
  issueDate: '2026-06-02T09:30:00.000Z',
  prescriptionDate: '2026-06-02',
  dispensingDate: '2026-06-02',
  status: 'completed'
};

function makePatient(insuranceInfo: Patient['insuranceInfo']): Patient {
  return { patientId: 'p_001', name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1980-04-05', gender: 'male', insuranceInfo };
}

const fees: CalculationResultItem[] = [
  { code: 'base_fee', name: '調剤基本料1', points: 47, rationale: 'test', receiptFeeCode: '410004110' },
  { code: 'drug_preparation', name: '薬剤調製料', points: 24, rationale: 'test', receiptFeeCode: '420001810' },
  { code: 'drug_fee', name: '薬剤料', points: 56, rationale: 'test' }
];

const items = [
  { itemId: 'i1', visitId: 'v_001', drugId: 'd1', drugName: 'テスト錠', yjCode: '1234567F1010', dispensedDrugCode: '620124201', amount: 1, days: 7, usage: '1日1回 朝食後', drugPrice: 8 }
];

function makeCase(insuranceInfo: Patient['insuranceInfo'], visitId = 'v_001'): MonthlyClaimUkeCase {
  return {
    visit: { ...visit, visitId },
    patient: makePatient(insuranceInfo),
    settings,
    items: items.map((item) => ({ ...item, visitId })),
    calculatedFees: fees
  };
}

const selfPayInfo = { insuranceType: '自費', burdenRatio: 100 };
const socialInfo = { insuranceType: '社保', provider: '01130012', number: '1234', burdenRatio: 30 };

test('the UKE builder refuses a self-pay patient, so no path can emit one by mistake', () => {
  const input = { visit, settings, items, calculatedFees: fees, interventions: [] };
  assert.throws(
    () => buildDispensingUkeRecords({ ...input, patient: makePatient(selfPayInfo) }),
    new RegExp(SELF_PAY_UKE_BLOCKED_MESSAGE)
  );
  // 社保・保険種別が空・保険情報なしは、これまでどおり作れる
  for (const info of [socialInfo, { provider: '1234567' }, undefined]) {
    assert.ok(buildDispensingUkeRecords({ ...input, patient: makePatient(info) }).length > 0, JSON.stringify(info));
  }
});

test('the monthly and single official builders go through the same refusal', () => {
  assert.throws(() => buildMonthlyClaimUkeResults([makeCase(selfPayInfo)]), new RegExp(SELF_PAY_UKE_BLOCKED_MESSAGE));
  assert.throws(
    () => buildSingleDispensingUkeOfficial({
      visit,
      patient: makePatient(selfPayInfo),
      settings,
      items,
      calculatedFees: fees
    }),
    new RegExp(SELF_PAY_UKE_BLOCKED_MESSAGE)
  );
  // 自費を混ぜても、外してから渡せば、残りは出せる
  const { claimable } = partitionSelfPayClaims([makeCase(socialInfo, 'v_a'), makeCase(selfPayInfo, 'v_b'), makeCase(socialInfo, 'v_c')]);
  const results = buildMonthlyClaimUkeResults(claimable);
  assert.deepStrictEqual(results.map((r) => r.visitId), ['v_a', 'v_c']);
});

// ---- 全件が自費の月: 外した結果、請求が1件も無いとき ----

test('with every case excluded the builders report an empty batch instead of producing a file', () => {
  const { claimable, excluded } = partitionSelfPayClaims([makeCase(selfPayInfo, 'v_a'), makeCase(selfPayInfo, 'v_b')]);
  assert.strictEqual(claimable.length, 0);
  assert.strictEqual(excluded.length, 2);

  // 結果の組み立て自体は空で返る (エラーにはならない)
  const results = buildMonthlyClaimUkeResults(claimable);
  assert.deepStrictEqual(results, []);

  // 空のままファイルを作ろうとすると、どちらも理由つきで止まる (空のUKEは出ない)
  assert.throws(() => buildMonthlyClaimOfficialUkeBundle(claimable, results), /公式提出用UKEの受付と事前チェック結果が一致していません/);
  assert.throws(() => buildMonthlyClaimUkeBundle(results), /オンライン請求受付前チェックで1件の修正が必要です/);
  const batchIssues = validateMonthlyClaimUkeBatch(results);
  assert.deepStrictEqual(batchIssues.map((issue) => issue.code), ['monthly_uke_empty']);
});

// ---- 請求前チェック ----

test('claim validation skips the insurance checks for a self-pay patient and says why', () => {
  const issues = validateDispensingClaim({
    settings,
    patient: makePatient(selfPayInfo),
    items,
    calculatedFees: fees
  });
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'info');
  assert.strictEqual(issues[0].code, 'self_pay_claim_excluded');
  assert.match(issues[0].message, /領収証は、これまでどおり保険点数×負担割合で計算されます/);
});

test('claim validation still checks a patient with a blank insurance type', () => {
  // 保険種別が空で保険者番号もない患者は、請求の対象のまま。保険者番号の不足は、これまでどおりエラー
  const issues = validateDispensingClaim({ settings, patient: makePatient({ burdenRatio: 30 }), items, calculatedFees: fees });
  assert.ok(issues.some((issue) => issue.code === 'insurance_provider_missing' && issue.severity === 'error'));
  assert.ok(!issues.some((issue) => issue.code === 'self_pay_claim_excluded'));
});

// ---- ダッシュボード ----

test('dashboard claim risks count self-pay patients and keep a blank-type patient on the list', () => {
  const claimReadyVisits = [
    { visitId: 'v_self', patientId: 'p_self', issueDate: '2026-08-23T10:00:00' },
    { visitId: 'v_blank', patientId: 'p_blank', issueDate: '2026-08-23T11:00:00' },
    { visitId: 'v_self2', patientId: 'p_self2', issueDate: '2026-08-23T12:00:00' }
  ];
  const patientMap = new Map<string, any>([
    ['p_self', { id: 'p_self', patientId: 'p_self', name: '自費 一郎', insuranceInfo: { insuranceType: '自費' } }],
    ['p_blank', { id: 'p_blank', patientId: 'p_blank', name: '保険情報なし 二郎' }],
    ['p_self2', { id: 'p_self2', patientId: 'p_self2', name: '自費 三郎', insuranceInfo: { insuranceType: '自費' } }]
  ]);
  const itemsByVisitId = new Map(claimReadyVisits.map((v) => [v.visitId, [
    { itemId: `item_${v.visitId}`, visitId: v.visitId, drugId: 'd1', amount: 1, days: 7, isPicked: true }
  ]]));
  const result = calculateDashboardClaimRisks({
    claimReadyVisits,
    patientMap,
    itemsByVisitId,
    drugMap: new Map([['d1', { id: 'd1', name: '通常薬', price: 50, yjCode: '222222222222' }]]),
    settingsData: { facility: { code: '1312345678' } },
    alertsByPatientId: new Map()
  });
  assert.strictEqual(result.selfPayExcludedCount, 2);
  assert.deepStrictEqual(result.claimRisks.map((risk) => risk.visitId), ['v_blank'], 'the blank-type patient is still checked and shown');
  assert.strictEqual(result.claimRiskCount, 1);
});

// 自費の患者を外す判定が、画面の一覧から本当に外しているのかを区別して確かめる。
// 請求前チェックは自費の患者に「対象外」の情報しか返さないので、点検の結果が空なのは、
// 判定で外したからか、点検が何も返さないからか、区別がつかない。そこで次の2通りで見る。
//  (1) 同じ受付で保険種別だけを「社保」にすると、請求リスクが出る (= 自費でなければ必ず出る条件)
//  (2) 算定の計算が失敗する設定にすると、自費の患者を点検に回していれば「算出に失敗」のリスクが出る

const dashboardPatient = (patientId: string, insuranceType: string | undefined) => ({
  id: patientId,
  patientId,
  name: `患者 ${patientId}`,
  // 保険者番号・番号・本人家族区分が無い = 保険の請求なら、必ずエラーの請求リスクが出る
  ...(insuranceType === undefined ? {} : { insuranceInfo: { insuranceType } })
});

function runDashboardRisks(insuranceType: string | undefined, settingsData: Record<string, unknown> | null) {
  return calculateDashboardClaimRisks({
    claimReadyVisits: [{ visitId: 'v1', patientId: 'p1', issueDate: '2026-08-23T10:00:00' }],
    patientMap: new Map<string, any>([['p1', dashboardPatient('p1', insuranceType)]]),
    itemsByVisitId: new Map([['v1', [{ itemId: 'item1', visitId: 'v1', drugId: 'd1', amount: 1, days: 14, usage: '内服 1日1回朝食後', isPicked: true }]]]),
    drugMap: new Map([['d1', { id: 'd1', code: '620000001', name: '通常薬', price: 100, yjCode: '2149001F1020' }]]),
    settingsData,
    alertsByPatientId: new Map()
  });
}

const normalSettings = { id: 'default', baseFeeCategory: '1' as const, pharmacyCode: '1312345678', pharmacyName: 'テスト薬局' };
const failingSettings = {
  ...normalSettings,
  get medicalDxAddition(): boolean {
    throw new Error('Forced dispensing fee calculation failure');
  }
};

test('the same visit shows a claim risk for 社保 and none for 自費 (the risk would otherwise be certain)', () => {
  const social = runDashboardRisks('社保', normalSettings);
  assert.strictEqual(social.claimRisks.length, 1, 'a 社保 patient without a provider number must show a risk');
  assert.ok(social.claimRisks[0].errorCount > 0);
  assert.strictEqual(social.selfPayExcludedCount, 0);

  const selfPay = runDashboardRisks('自費', normalSettings);
  assert.deepStrictEqual(selfPay.claimRisks, []);
  assert.strictEqual(selfPay.claimRiskCount, 0);
  assert.strictEqual(selfPay.selfPayExcludedCount, 1);

  // 保険種別が空は、社保と同じく請求の対象のまま (請求リストに出る)
  const blank = runDashboardRisks(undefined, normalSettings);
  assert.strictEqual(blank.claimRisks.length, 1);
  assert.strictEqual(blank.selfPayExcludedCount, 0);
});

test('a self-pay patient is not sent through the fee calculation at all: a calculation failure shows for 社保 but not for 自費', () => {
  // 請求前チェックだけで外していると、算定の計算に失敗したときに「算出に失敗」のリスクが自費の患者にも出てしまう
  const social = runDashboardRisks('社保', failingSettings);
  assert.strictEqual(social.claimRisks.length, 1);
  assert.ok(
    social.claimRisks[0].topIssueTitles.some((title) => title.includes('調剤報酬点数の算出に失敗しました')),
    `the 社保 patient shows the failure: ${JSON.stringify(social.claimRisks[0].topIssueTitles)}`
  );

  const selfPay = runDashboardRisks('自費', failingSettings);
  assert.deepStrictEqual(selfPay.claimRisks, [], 'the self-pay patient is left out before any calculation');
  assert.strictEqual(selfPay.claimRiskCount, 0);
  assert.strictEqual(selfPay.urgentClaimRiskCount, 0);
  assert.strictEqual(selfPay.selfPayExcludedCount, 1);
});

test('dashboard claim risks with only self-pay patients is empty, not an error', () => {
  const result = calculateDashboardClaimRisks({
    claimReadyVisits: [{ visitId: 'v1', patientId: 'p1', issueDate: '2026-08-23T10:00:00' }],
    patientMap: new Map<string, any>([['p1', { id: 'p1', patientId: 'p1', name: 'A', insuranceInfo: { insuranceType: '自費' } }]]),
    itemsByVisitId: new Map(),
    drugMap: new Map(),
    settingsData: null,
    alertsByPatientId: new Map()
  });
  assert.deepStrictEqual(result, { claimRisks: [], claimRiskCount: 0, urgentClaimRiskCount: 0, selfPayExcludedCount: 1 });
});

test('a claim already in the billing pipeline stays on the list when the patient becomes self pay, but is flagged', () => {
  const { claimWorkItems, rebillingClaimCount } = calculateDashboardClaimWorkItems({
    monthlyClaimVisits: [
      { visitId: 'v1', patientId: 'p1', issueDate: '2026-08-05', claimLifecycle: { status: 'rebilling', rebillingAt: '2026-08-20', rebillingReason: '修正', totalPoints: 500 } },
      { visitId: 'v2', patientId: 'p2', issueDate: '2026-08-06', claimLifecycle: { status: 'rebilling', rebillingAt: '2026-08-21', rebillingReason: '修正', totalPoints: 600 } }
    ],
    patientMap: new Map<string, any>([
      ['p1', { id: 'p1', name: '自費に変更', insuranceInfo: { insuranceType: '自費' } }],
      ['p2', { id: 'p2', name: '社保のまま', insuranceInfo: { insuranceType: '社保' } }]
    ]),
    itemsByVisitId: new Map()
  });
  assert.strictEqual(claimWorkItems.length, 2, 'nothing silently drops off the list');
  assert.strictEqual(rebillingClaimCount, 2);
  const byId = new Map(claimWorkItems.map((item) => [item.visitId, item]));
  assert.strictEqual(byId.get('v1')?.selfPayExcluded, true);
  assert.strictEqual(byId.get('v2')?.selfPayExcluded, undefined);
});
