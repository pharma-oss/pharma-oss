import { test } from 'node:test';
import assert from 'node:assert';
import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import {
  buildDispensingUkeRecords,
  type DispensingUkeItem
} from '@/lib/receipt/dispensing_uke';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkeBundle,
  buildMonthlyClaimUkePreflightReport,
  buildMonthlyClaimUkeResults,
  type MonthlyClaimUkeCase
} from '@/lib/monthly_claim_uke';
import { generateUkeContent } from '@/lib/receipt/uke_generator';

const testSettings: FacilitySettings = {
  id: 'default',
  pharmacyName: 'pharma-ossテスト薬局',
  pharmacyKana: 'テストヤッキョク',
  pharmacyCode: '1312345',
  pharmacyPostalCode: '100-0001',
  pharmacyAddress: '東京都千代田区千代田1-1',
  pharmacyPhone: '03-1234-5678',
  registrationNumber: 'T1234567890123',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false
};

function createStandardSocialCase(
  patientId: string,
  visitId: string,
  claimLifecycleOverrides?: Partial<NonNullable<Visit['claimLifecycle']>>
): MonthlyClaimUkeCase {
  const patient: Patient = {
    patientId,
    name: '社保 太郎',
    kana: 'シャホ タロウ',
    birthDate: '1985-05-15',
    gender: 'male',
    insuranceInfo: {
      provider: '06130012',
      number: '123456',
      burdenRatio: 30,
      relationship: '本人'
    }
  };

  const visit: Visit = {
    visitId,
    patientId,
    prescriptionDate: '2026-06-10',
    dispensingDate: '2026-06-10',
    issueDate: '2026-06-10T10:00:00.000Z',
    status: 'completed',
    institutionId: '1312345',
    doctorId: 'doc_01',
    claimLifecycle: claimLifecycleOverrides ? {
      status: 'rebilling',
      rebillingReason: '通常月次請求準備',
      ...claimLifecycleOverrides
    } : undefined
  };

  const items: DispensingUkeItem[] = [
    {
      itemId: `item_${visitId}_01`,
      visitId,
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'アムロジピンOD錠5mg',
      amount: 1,
      days: 14,
      usage: '1日1回 朝食後',
      rpNumber: 1,
      dosageCategory: 'internal',
      drugPrice: 10.1,
      claimDrugFee: true
    }
  ];

  const calculatedFees: CalculationResultItem[] = [
    {
      code: 'base_fee',
      receiptFeeCode: '410004110',
      name: '調剤基本料1',
      points: 45,
      rationale: '調剤基本料1 (45点)'
    },
    {
      code: 'drug_preparation',
      receiptFeeCode: '420001810',
      name: '薬剤調製料 (内服薬)',
      points: 24,
      rationale: '薬剤調製料 内服薬 (14日分: 24点)'
    },
    {
      code: 'drug_fee',
      name: '薬剤料',
      points: 14,
      rationale: '薬剤料 (14点)'
    }
  ];

  return { visit, patient, settings: testSettings, items, calculatedFees };
}

test('Track C-1 Step 1: verify preflight blocking conditions across paths', () => {
  // 1. claimLifecycle 未設定（draft 状態）の場合
  const unreadyCase = createStandardSocialCase('pt_01', 'v_01', undefined);
  const unreadyResults = buildMonthlyClaimUkeResults([unreadyCase]);
  const preflightReport = buildMonthlyClaimUkePreflightReport(unreadyResults);

  // 月次通常 UKE はドラフト状態の受付でブロックされる（停止条件の実証）
  assert.strictEqual(preflightReport.batchErrorIssues.length, 1);
  assert.strictEqual(preflightReport.batchErrorIssues[0].code, 'monthly_uke_unprepared_claim_mixed');
  assert.throws(
    () => buildMonthlyClaimUkeBundle(unreadyResults),
    /オンライン請求受付前チェックで1件の修正が必要です/
  );

  // 一方、単票通常出力はドラフト状態でも即時生成できる（単票出力の実証）
  const singleRecords = buildDispensingUkeRecords({
    visit: unreadyCase.visit,
    patient: unreadyCase.patient,
    settings: unreadyCase.settings,
    items: unreadyCase.items,
    calculatedFees: unreadyCase.calculatedFees
  });
  assert.strictEqual(singleRecords.length > 0, true);
});

test('Track C-1 Step 1: verify output differences between single claim, monthly regular, and monthly official UKE', () => {
  const case1 = createStandardSocialCase('pt_01', 'v_01', {
    status: 'rebilling',
    rebillingReason: '2026年6月定期請求1'
  });
  const generatedAt = new Date('2026-06-10T12:00:00.000Z');

  // 1. 単票通常 UKE (Single Claim UKE)
  const singleRecords = buildDispensingUkeRecords({
    visit: case1.visit,
    patient: case1.patient,
    settings: case1.settings,
    items: case1.items,
    calculatedFees: case1.calculatedFees,
    generatedAt
  });
  const singleContent = generateUkeContent(singleRecords);

  // 2. 月次通常 UKE (Monthly Regular UKE)
  const monthlyResults = buildMonthlyClaimUkeResults([case1], generatedAt);
  const monthlyRegularBundle = buildMonthlyClaimUkeBundle(monthlyResults, 'TEST_MONTHLY_REGULAR.uke');

  // 3. 月次公式提出用 UKE (Monthly Official UKE)
  const monthlyOfficialBundle = buildMonthlyClaimOfficialUkeBundle([case1], monthlyResults);

  // === レコード種別列の対照比較 ===
  const singleRecordTypes = singleRecords.map((r) => r.type);
  const regularRecordTypes = monthlyRegularBundle.records.map((r) => r.type);
  const officialRecordTypes = monthlyOfficialBundle.records.map((r) => r.type);

  // 単票: YK, RE, HO, JD, SH, KI (base_fee), CZ (drug_preparation), TO (drug_fee), IY, TK, ST
  assert.deepStrictEqual(singleRecordTypes, [
    'YK', 'RE', 'HO', 'JD', 'SH', 'KI', 'CZ', 'TO', 'IY', 'TK', 'ST'
  ]);

  // 月次通常: YK, RE, HO, JD, SH, KI, CZ, TO, IY, TK, ST
  // combineMonthlyClaimUkeRecords は第1レセプトの通常 YK をヘッダーとし、末尾に ST を付与
  assert.deepStrictEqual(regularRecordTypes, [
    'YK', 'RE', 'HO', 'JD', 'SH', 'KI', 'CZ', 'TO', 'IY', 'TK', 'ST'
  ]);

  // 月次公式: YK, RE, HO, SH, CZ, IY, KI, GO
  // 公式仕様では独自 TK, TO は排除され、末尾は GO（総合計集計）で締められる
  assert.deepStrictEqual(officialRecordTypes, [
    'YK', 'RE', 'HO', 'SH', 'CZ', 'IY', 'KI', 'GO'
  ]);

  // === 構造・レコード内容の精密差分突合 ===

  // 差分 1: ヘッダーレコードの仕様差異
  // 通常 YK: [pharmacyCode, pharmacyName, kana, postalCode, address, phone, registrationNumber, ''] (8列)
  const singleYk = singleRecords.find((r) => r.type === 'YK')!;
  assert.strictEqual(singleYk.fields[0], '1312345');
  assert.strictEqual(singleYk.fields[1], 'pharma-ossテスト薬局');

  // 公式 YK: [payerOrg, prefCode, tenhyoCode('4'), pharmacyCode, pharmacyName, claimMonth, volumeId('00'), phone]
  const officialYk = monthlyOfficialBundle.records.find((r) => r.type === 'YK')!;
  assert.strictEqual(officialYk.fields[0], '1'); // 社保
  assert.strictEqual(officialYk.fields[1], '13'); // 東京都
  assert.strictEqual(officialYk.fields[2], '4'); // 保険薬局コード区分
  assert.strictEqual(officialYk.fields[3], '1312345');
  assert.strictEqual(officialYk.fields[4], 'pharma-ossテスト薬局');
  assert.strictEqual(officialYk.fields[5], '202606'); // 請求年月

  // 差分 2: レセプト基本レコード (RE) の仕様差異
  // 通常 RE: 第1項目は '1', 第2項目は年月 '202606', 第3項目は visitId 'v_01'（独自）
  const singleRe = singleRecords.find((r) => r.type === 'RE')!;
  assert.strictEqual(singleRe.fields[2], 'v_01');

  // 公式 RE: 第1項目はレセプト番号 '1', 第2項目は種別コード '4112' (社保・単独・本人等), 第3項目は調剤年月 '202606'
  const officialRe = monthlyOfficialBundle.records.find((r) => r.type === 'RE')!;
  assert.strictEqual(officialRe.fields[0], '1'); // レセプト番号
  assert.strictEqual(officialRe.fields[1], '4112'); // 厚労省公式レセプト種別コード
  assert.strictEqual(officialRe.fields[2], '202606'); // 調剤年月

  // 差分 3: 医薬品レコード (IY) の仕様差異
  // 通常 IY: 独自日本語名称（'アムロジピンOD錠5mg'）や日本語用法（'1日1回 朝食後'）が直接含まれる
  const singleIy = singleRecords.find((r) => r.type === 'IY')!;
  assert.strictEqual(singleIy.fields[4], 'アムロジピンOD錠5mg');
  assert.strictEqual(singleIy.fields[7], '1日1回 朝食後');

  // 公式 IY: 厚労省公式仕様に基づき、日本語テキストは一切含まず [負担区分, 医薬品コード(9桁), 数量] の構造
  const officialIy = monthlyOfficialBundle.records.find((r) => r.type === 'IY')!;
  assert.strictEqual(officialIy.fields[0], '1'); // 負担区分
  assert.strictEqual(officialIy.fields[1], '620000001'); // 厚労省レセ電医薬品コード
  assert.strictEqual(officialIy.fields[2], '1'); // 1日量

  // 差分 4: 調剤行為レコード (CZ / KI) の仕様差異
  // 通常: 独自キー（BASE, PREP）と日本語名称（'調剤基本料1'）が出力される
  const singleKi = singleRecords.find((r) => r.type === 'KI')!;
  assert.strictEqual(singleKi.fields[1], 'BASE');
  assert.strictEqual(singleKi.fields[2], '調剤基本料1');

  // 公式: 支払基金コード体系（410004110 等の厚労省算定コード）が出力される
  const officialKi = monthlyOfficialBundle.records.find((r) => r.type === 'KI')!;
  assert.strictEqual(officialKi.fields[3], '410004110'); // 厚労省調剤基本料1コード

  // 差分 5: トレーラーレコードと終了記号
  // 通常: 独自集計 TK と終了 ST ('yakureki')
  assert.strictEqual(singleRecords.some((r) => r.type === 'TK'), true);
  assert.strictEqual(singleRecords.some((r) => r.type === 'ST'), true);
  assert.strictEqual(singleRecords.some((r) => r.type === 'GO'), false);

  // 公式: 独自 TK/ST はゼロ、末尾は GO レコード（件数 1, 点数 83, 完了区分 '99'）
  assert.strictEqual(monthlyOfficialBundle.records.some((r) => r.type === 'TK'), false);
  assert.strictEqual(monthlyOfficialBundle.records.some((r) => r.type === 'ST'), false);
  const officialGo = monthlyOfficialBundle.records.find((r) => r.type === 'GO')!;
  assert.deepStrictEqual(officialGo.fields, ['1', '83', '99']);

  // 公式出力バイト列は末尾に EOF (0x1A) が付与されている
  assert.strictEqual(monthlyOfficialBundle.content.at(-1), 0x1A);

  // 通常出力は Uint8Array で末尾に 0x1A は付かない（最終レコードの末尾文字で終わる）
  assert.strictEqual(singleContent instanceof Uint8Array, true);
  assert.notStrictEqual(singleContent.at(-1), 0x1A);
});

test('Track C-1 Step 1: verify multiple claim bundling behavior difference between regular and official paths', () => {
  const case1 = createStandardSocialCase('pt_01', 'v_01', {
    status: 'rebilling',
    rebillingReason: '2026年6月定期請求1'
  });
  const case2 = createStandardSocialCase('pt_02', 'v_02', {
    status: 'rebilling',
    rebillingReason: '2026年6月定期請求2'
  });
  const generatedAt = new Date('2026-06-10T12:00:00.000Z');

  const multiResults = buildMonthlyClaimUkeResults([case1, case2], generatedAt);
  const regularBundle = buildMonthlyClaimUkeBundle(multiResults, 'TEST_MULTI.uke');
  const officialBundle = buildMonthlyClaimOfficialUkeBundle([case1, case2], multiResults);

  // 複数件バンドル時の件数と点数合算
  assert.strictEqual(regularBundle.totalClaims, 2);
  assert.strictEqual(regularBundle.totalPoints, 166); // 83 * 2
  assert.strictEqual(officialBundle.totalClaims, 2);
  assert.strictEqual(officialBundle.totalPoints, 166);

  // 通常月次: YK (1つ), RE (2つ), TK (2つ), ST (1つ)
  const regularYkCount = regularBundle.records.filter((r) => r.type === 'YK').length;
  const regularReCount = regularBundle.records.filter((r) => r.type === 'RE').length;
  const regularTkCount = regularBundle.records.filter((r) => r.type === 'TK').length;
  const regularStCount = regularBundle.records.filter((r) => r.type === 'ST').length;
  assert.strictEqual(regularYkCount, 1);
  assert.strictEqual(regularReCount, 2);
  assert.strictEqual(regularTkCount, 2);
  assert.strictEqual(regularStCount, 1);

  // 公式月次: YK (1つ), RE (2つ), GO (1つ、件数=2, 点数=166, 完了='99')
  const officialYkCount = officialBundle.records.filter((r) => r.type === 'YK').length;
  const officialReCount = officialBundle.records.filter((r) => r.type === 'RE').length;
  const officialGoCount = officialBundle.records.filter((r) => r.type === 'GO').length;
  assert.strictEqual(officialYkCount, 1);
  assert.strictEqual(officialReCount, 2);
  assert.strictEqual(officialGoCount, 1);

  const goRecord = officialBundle.records.find((r) => r.type === 'GO')!;
  assert.deepStrictEqual(goRecord.fields, ['2', '166', '99']);
  assert.strictEqual(officialBundle.officialReconciliationReport.ok, true);
  assert.strictEqual(officialBundle.officialReconciliationReport.goClaimCount, 2);
  assert.strictEqual(officialBundle.officialReconciliationReport.goTotalPoints, 166);
});
