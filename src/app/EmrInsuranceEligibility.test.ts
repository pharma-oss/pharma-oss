import { test } from 'node:test';
import assert from 'node:assert';
import { toDateInputValue } from '../lib/emr_helpers';
import { formatPatientInsuranceInfo } from '../lib/myna_read_display';
import { PatientBanner } from './emr/components/PatientBanner';

test('toDateInputValue handles dates and timestamps correctly', () => {
  assert.strictEqual(toDateInputValue('2026-08-22T00:00:00.000Z'), '2026-08-22');
  assert.strictEqual(toDateInputValue('2026-08-22'), '2026-08-22');
  assert.strictEqual(toDateInputValue(''), '');
  assert.strictEqual(toDateInputValue(undefined), '');
});

test('formatPatientInsuranceInfo correctly formats insurance display', () => {
  const info = {
    provider: '06139999',
    number: '記号123 番号456',
    burdenRatio: 30,
    insuranceType: '社保',
    relationship: '本人'
  };
  const formatted = formatPatientInsuranceInfo(info as any);
  assert.ok(formatted.includes('社保'));
  assert.ok(formatted.includes('3割'));
});

test('PatientBanner component is properly exported as React component', () => {
  assert.strictEqual(typeof PatientBanner, 'object'); // React.memo
});

test('multi-public insurance preservation contract: multiple public insurances preserve order, dates, limits and burden', async () => {
  const { toEditablePublicInsurances, toPublicInsurances, buildPublicInsuranceBadgeList } = await import('../lib/patient_public_insurance');
  const { evaluateInsuranceEligibility } = await import('../lib/insurance_eligibility');

  const multiPublicInsurances = [
    {
      provider: '51136018',
      recipient: '1234567',
      burdenRatio: 10,
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      monthlyLimitYen: 10000
    },
    {
      provider: '21136018',
      recipient: '7654321',
      burdenRatio: 10,
      startDate: '2026-05-01',
      endDate: '2027-04-30',
      monthlyLimitYen: 2500
    },
    {
      provider: '80136018',
      recipient: '9999999',
      burdenRatio: 0,
      startDate: '2026-01-01',
      endDate: '2026-12-31'
    }
  ];

  // 1. フォームへのロード
  const editables = toEditablePublicInsurances(multiPublicInsurances);
  assert.strictEqual(editables.length, 3);
  assert.strictEqual(editables[0].provider, '51136018');
  assert.strictEqual(editables[1].provider, '21136018');
  assert.strictEqual(editables[2].provider, '80136018');

  // 2. 1件目の患者情報や公費を編集しても、2件目以降が消失・破損しないこと
  editables[0].monthlyLimitYen = '12000'; // 1件目の上限のみ変更
  const saved = toPublicInsurances(editables);

  assert.strictEqual(saved.length, 3, 'All 3 public insurances must be preserved');
  assert.strictEqual(saved[0].monthlyLimitYen, 12000);
  assert.strictEqual(saved[1].provider, '21136018');
  assert.strictEqual(saved[1].recipient, '7654321');
  assert.strictEqual(saved[1].monthlyLimitYen, 2500);
  assert.strictEqual(saved[2].provider, '80136018');
  assert.strictEqual(saved[2].recipient, '9999999');
  assert.strictEqual(saved[2].burdenRatio, 0);

  // 3. バッジ生成と期限警告の連動
  const issues = evaluateInsuranceEligibility({
    patient: {
      patientId: 'PT-TEST-001',
      name: 'テスト患者',
      kana: 'テストカンジャ',
      birthDate: '1980-01-01',
      insuranceInfo: {
        provider: '06139999',
        number: '123456',
        burdenRatio: 30,
        insuranceType: '社保',
        relationship: '本人',
        eligibilityStatus: 'valid',
        eligibilityCheckedAt: '2026-09-01'
      },
      publicInsurances: saved
    },
    serviceDate: '2026-09-30'
  });

  const badges = buildPublicInsuranceBadgeList(saved, issues);
  assert.strictEqual(badges.length, 3);
  assert.strictEqual(badges[0].categoryName, '特定疾患（指定難病等）');
  assert.strictEqual(badges[0].label, '特定疾患（指定難病等） (10%)');
  assert.strictEqual(badges[1].categoryName, '精神通院医療');
  assert.strictEqual(badges[1].label, '精神通院医療 (10%)');
  assert.strictEqual(badges[2].categoryName, '地方単独公費');
  assert.strictEqual(badges[2].label, '地方単独公費 (0%)');
});

