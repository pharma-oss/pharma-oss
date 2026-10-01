import test from 'node:test';
import assert from 'node:assert/strict';
import type { Patient } from '@/db/types';
import {
  createEmptyEditableCopaymentSupport,
  toEditableCopaymentSupport,
  fromEditableCopaymentSupport,
  buildHighCostCopaymentBadges,
  buildVisitCopaymentGuidance,
  validateCopaymentSupportReadiness,
  type EditableCopaymentSupport
} from '../patient_copayment_support';

function createSamplePatient(insuranceInfoOverrides: Partial<NonNullable<Patient['insuranceInfo']>> = {}): Patient {
  return {
    patientId: 'p_test_copay',
    name: '田中 太郎',
    kana: 'タナカ タロウ',
    birthDate: '1985-05-15',
    gender: 'male',
    insuranceInfo: {
      provider: '06139999',
      number: '123456',
      burdenRatio: 30,
      insuranceType: '社保',
      ...insuranceInfoOverrides
    }
  };
}

test('patient_copayment_support: converts between Patient insuranceInfo and EditableCopaymentSupport safely', () => {
  // 1. 空の初期状態
  const empty = createEmptyEditableCopaymentSupport();
  assert.equal(empty.highCostLimitCategory, '');
  assert.equal(empty.highCostMultipleOccurrence, false);
  assert.equal(empty.copaymentCategoryCode, '');
  assert.equal(empty.reductionCode, '');

  // 2. insuranceInfo -> Editable
  const patient = createSamplePatient({
    highCostLimitCategory: 'ウ',
    highCostMultipleOccurrence: true,
    copaymentCategoryCode: '1',
    copaymentReduction: {
      code: '1',
      ratioPercent: 20,
      reducedYen: 5000,
      certificateNumber: '042'
    }
  });
  const editable = toEditableCopaymentSupport(patient.insuranceInfo);
  assert.equal(editable.highCostLimitCategory, 'ウ');
  assert.equal(editable.highCostMultipleOccurrence, true);
  assert.equal(editable.copaymentCategoryCode, '1');
  assert.equal(editable.reductionCode, '1');
  assert.equal(editable.reductionRatioPercent, '20');
  assert.equal(editable.reductionReducedYen, '5000');
  assert.equal(editable.reductionCertificateNumber, '042');

  // 3. Editable -> insuranceInfo patch
  const patch = fromEditableCopaymentSupport(editable);
  assert.equal(patch.highCostLimitCategory, 'ウ');
  assert.equal(patch.highCostMultipleOccurrence, true);
  assert.equal(patch.copaymentCategoryCode, '1');
  assert.deepEqual(patch.copaymentReduction, {
    code: '1',
    ratioPercent: 20,
    reducedYen: 5000,
    certificateNumber: '042'
  });

  // 4. 空入力時のクリア動作（undefined 化）
  const emptyPatch = fromEditableCopaymentSupport(empty);
  assert.equal(emptyPatch.highCostLimitCategory, undefined);
  assert.equal(emptyPatch.highCostMultipleOccurrence, undefined);
  assert.equal(emptyPatch.copaymentCategoryCode, undefined);
  assert.equal(emptyPatch.copaymentReduction, undefined);
});

test('patient_copayment_support: buildHighCostCopaymentBadges renders accurate labels and severity', () => {
  // A. 通常患者（未設定）
  const normalPatient = createSamplePatient();
  assert.deepEqual(buildHighCostCopaymentBadges(normalPatient.insuranceInfo), []);

  // B. 限度額区分ウ（多数回なし）
  const patientU = createSamplePatient({ highCostLimitCategory: 'ウ' });
  const badgesU = buildHighCostCopaymentBadges(patientU.insuranceInfo);
  assert.equal(badgesU.length, 1);
  assert.equal(badgesU[0].label, '限度額: 区ウ');
  assert.equal(badgesU[0].severity, 'teal');

  // C. 限度額区分ウ（多数回該当）+ 一部負担区分1 + 減免2（免除）
  const patientFull = createSamplePatient({
    highCostLimitCategory: 'ウ',
    highCostMultipleOccurrence: true,
    copaymentCategoryCode: '1',
    copaymentReduction: {
      code: '2',
      certificateNumber: '101'
    }
  });
  const badgesFull = buildHighCostCopaymentBadges(patientFull.insuranceInfo);
  assert.equal(badgesFull.length, 3);
  assert.equal(badgesFull[0].label, '限度額: 多ウ（多数回）');
  assert.equal(badgesFull[0].severity, 'orange');
  assert.equal(badgesFull[1].label, '一部負担区分: 1');
  assert.equal(badgesFull[2].label, '減免: 免除');
  assert.equal(badgesFull[2].severity, 'orange');
});

test('patient_copayment_support: buildVisitCopaymentGuidance formats warning alerts for print screen', () => {
  const patient = createSamplePatient({
    highCostLimitCategory: 'エ',
    copaymentReduction: {
      code: '2',
      certificateNumber: '007'
    }
  });
  const guidance = buildVisitCopaymentGuidance(patient, { patientCopayYen: 3000, burdenRatio: 30 });
  assert.equal(guidance.hasGuidance, true);
  assert.equal(guidance.alertType, 'warning');
  assert.equal(guidance.items.length, 2);
  assert.match(guidance.items[0], /高額療養費限度額適用認定証【区分エ】/);
  assert.match(guidance.items[1], /一部負担金減免【免除】/);
  assert.match(guidance.items[1], /窓口徴収額が0円であること/);
});

test('patient_copayment_support: validateCopaymentSupportReadiness flags invalid codes and missing cert numbers', () => {
  // 1. 正常ケース
  const validPatient = createSamplePatient({
    highCostLimitCategory: 'ウ',
    copaymentCategoryCode: '1',
    copaymentReduction: {
      code: '1',
      ratioPercent: 50,
      certificateNumber: '123'
    }
  });
  const validIssues = validateCopaymentSupportReadiness(validPatient, '2026-06-15');
  assert.equal(validIssues.length, 0);

  // 2. 不正コード・未設定ケース
  const invalidPatient = createSamplePatient({
    highCostLimitCategory: 'カ', // 社保の若年者に区カは不可（後期高齢者のみ）
    copaymentCategoryCode: '2', // 別表8に「2」は存在しない
    copaymentReduction: {
      code: '1', // 減額なのに割合も金額もない
      certificateNumber: '12' // 3桁ではない
    }
  });
  const invalidIssues = validateCopaymentSupportReadiness(invalidPatient, '2026-06-15');
  assert.ok(invalidIssues.length >= 4);

  const codes = invalidIssues.map((i) => i.code);
  assert.ok(codes.includes('copayment_high_cost_special_note_error'));
  assert.ok(codes.includes('copayment_invalid_category_code'));
  assert.ok(codes.includes('copayment_reduction_amount_missing'));
  assert.ok(codes.includes('copayment_reduction_cert_number_invalid'));
});

test('patient_copayment_support: PatientBanner modal surfaces structured inputs and preserves data on save', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const bannerPath = path.resolve(process.cwd(), 'src/app/emr/components/PatientBanner.tsx');
  const bannerSource = fs.readFileSync(bannerPath, 'utf8');

  // 1. 高額療養費・減免の構造化入力フォームがモーダル内に存在すること
  assert.match(bannerSource, /data-testid="emr-high-cost-editor"/);
  assert.match(bannerSource, /data-testid="m-high-cost-category"/);
  assert.match(bannerSource, /data-testid="m-copay-category-code"/);
  assert.match(bannerSource, /data-testid="m-high-cost-multiple"/);
  assert.match(bannerSource, /data-testid="emr-reduction-editor"/);
  assert.match(bannerSource, /data-testid="m-reduction-code"/);
  assert.match(bannerSource, /data-testid="m-reduction-cert"/);

  // 2. 保存処理で fromEditableCopaymentSupport を通してデータ消失を防止していること
  assert.match(bannerSource, /const copaymentPatch = fromEditableCopaymentSupport\(editCopaymentSupport\);/);
  assert.match(bannerSource, /\.\.\.copaymentPatch/);

  // 3. バナー上に高額療養費・減免のバッジが表示されること
  assert.match(bannerSource, /data-testid=\{`patient-copay-badge-\$\{idx\}`\}/);
});

test('patient_copayment_support: ocr page and print page surface copayment badges and guidance', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // 1. 処方受付画面（/ocr）
  const ocrPath = path.resolve(process.cwd(), 'src/app/ocr/page.tsx');
  const ocrSource = fs.readFileSync(ocrPath, 'utf8');
  assert.match(ocrSource, /selectedPatientCopaymentBadges/);
  assert.match(ocrSource, /data-testid=\{`selected-patient-copay-badge-\$\{idx\}`\}/);

  // 2. 印刷画面（/print/[visitId]）
  const printPath = path.resolve(process.cwd(), 'src/app/print/[visitId]/page.tsx');
  const printSource = fs.readFileSync(printPath, 'utf8');
  assert.match(printSource, /buildVisitCopaymentGuidance/);
  assert.match(printSource, /data-testid="copayment-guidance-banner"/);
  assert.match(printSource, /copayment-guidance-item/);
});

test('patient_copayment_support: monthly claim readiness report detects invalid copayment settings', async () => {
  const { buildMonthlyClaimUkeOfficialReadinessReport } = await import('@/lib/monthly_claim_uke');
  const invalidPatient = createSamplePatient({
    copaymentCategoryCode: '2', // 別表8に存在しない
    copaymentReduction: {
      code: '1',
      certificateNumber: '12' // 3桁ではない
    }
  });

  const report = buildMonthlyClaimUkeOfficialReadinessReport({
    visit: {
      visitId: 'v_copay_test',
      patientId: 'p_test_copay',
      issueDate: '2026-06-15',
      dispensingDate: '2026-06-15',
      prescriptionDate: '2026-06-15',
      status: 'waiting'
    },
    patient: invalidPatient,
    settings: {
      facilityCode: '1312345',
      name: 'テスト薬局',
      address: '東京都',
      phone: '03-1234-5678',
      postalCode: '100-0001'
    } as any,
    items: [],
    calculatedFees: []
  });

  const readinessCodes = report.issues.map((i) => i.code);
  assert.ok(readinessCodes.includes('official_uke_copayment_invalid_category_code'));
  assert.ok(readinessCodes.includes('official_uke_copayment_reduction_amount_missing'));
  assert.ok(readinessCodes.includes('official_uke_copayment_reduction_cert_number_invalid'));
});

