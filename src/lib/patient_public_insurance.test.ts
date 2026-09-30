import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicInsurance } from '@/db/types';
import type { InsuranceEligibilityIssue } from '@/lib/insurance_eligibility';
import {
  getPublicInsuranceCategoryName,
  sanitizeDigits,
  createEmptyEditablePublicInsurance,
  toEditablePublicInsurances,
  sanitizePublicInsurance,
  toPublicInsurances,
  mergePreservingUneditedPublicInsurances,
  buildPublicInsuranceBadgeList,
  MAX_PUBLIC_INSURANCES
} from './patient_public_insurance';

test('getPublicInsuranceCategoryName resolves known legal category prefixes and handles edges', () => {
  assert.strictEqual(getPublicInsuranceCategoryName('51136018'), '特定疾患（指定難病等）');
  assert.strictEqual(getPublicInsuranceCategoryName('54136018'), '指定難病');
  assert.strictEqual(getPublicInsuranceCategoryName('21136018'), '精神通院医療');
  assert.strictEqual(getPublicInsuranceCategoryName('12136018'), '生活保護');
  assert.strictEqual(getPublicInsuranceCategoryName('15136018'), '更生医療');
  assert.strictEqual(getPublicInsuranceCategoryName('80136018'), '地方単独公費');
  assert.strictEqual(getPublicInsuranceCategoryName('89136018'), '地方単独公費');
  assert.strictEqual(getPublicInsuranceCategoryName('99136018'), undefined);
  assert.strictEqual(getPublicInsuranceCategoryName(''), undefined);
  assert.strictEqual(getPublicInsuranceCategoryName(undefined), undefined);
  // 全角数字もサニタイズされて判定される
  assert.strictEqual(getPublicInsuranceCategoryName('５４１３６０１８'), '指定難病');
});

test('sanitizeDigits converts full-width digits and removes whitespace', () => {
  assert.strictEqual(sanitizeDigits('５１１３６０１８'), '51136018');
  assert.strictEqual(sanitizeDigits(' 123 4567 '), '1234567');
  assert.strictEqual(sanitizeDigits(''), '');
});

test('toEditablePublicInsurances provides default empty row when input is empty or null', () => {
  const fromNull = toEditablePublicInsurances(null);
  assert.strictEqual(fromNull.length, 1);
  assert.strictEqual(fromNull[0].provider, '');
  assert.strictEqual(fromNull[0].recipient, '');
  assert.strictEqual(fromNull[0].burdenRatio, 10);

  const fromEmpty = toEditablePublicInsurances([]);
  assert.strictEqual(fromEmpty.length, 1);
  assert.strictEqual(fromEmpty[0].provider, '');
});

test('toEditablePublicInsurances and toPublicInsurances round-trip multiple public insurances accurately', () => {
  const source: PublicInsurance[] = [
    {
      provider: '51136018',
      recipient: '1234567',
      burdenRatio: 10,
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      monthlyLimitYen: 5000
    },
    {
      provider: '21136018',
      recipient: '7654321',
      burdenRatio: 10,
      startDate: '2026-05-01',
      endDate: '2027-04-30',
      monthlyLimitYen: 2500
    }
  ];

  const editable = toEditablePublicInsurances(source);
  assert.strictEqual(editable.length, 2);
  assert.strictEqual(editable[0].provider, '51136018');
  assert.strictEqual(editable[0].monthlyLimitYen, '5000');
  assert.strictEqual(editable[1].provider, '21136018');
  assert.strictEqual(editable[1].monthlyLimitYen, '2500');

  const restored = toPublicInsurances(editable);
  assert.strictEqual(restored.length, 2);
  assert.deepStrictEqual(restored, source);
});

test('toPublicInsurances discards empty rows and clips at MAX_PUBLIC_INSURANCES (4)', () => {
  const editable = [
    {
      id: '1',
      provider: '51136018',
      recipient: '1234567',
      burdenRatio: 10,
      startDate: '',
      endDate: '',
      monthlyLimitYen: ''
    },
    {
      id: '2',
      provider: '',
      recipient: '',
      burdenRatio: 10,
      startDate: '',
      endDate: '',
      monthlyLimitYen: ''
    },
    {
      id: '3',
      provider: '21136018',
      recipient: '2345678',
      burdenRatio: 10,
      startDate: '',
      endDate: '',
      monthlyLimitYen: '1000'
    },
    {
      id: '4',
      provider: '54136018',
      recipient: '3456789',
      burdenRatio: 20,
      startDate: '',
      endDate: '',
      monthlyLimitYen: ''
    },
    {
      id: '5',
      provider: '80136018',
      recipient: '4567890',
      burdenRatio: 0,
      startDate: '',
      endDate: '',
      monthlyLimitYen: ''
    },
    {
      id: '6',
      provider: '12136018',
      recipient: '5678901',
      burdenRatio: 0,
      startDate: '',
      endDate: '',
      monthlyLimitYen: ''
    }
  ];

  const result = toPublicInsurances(editable);
  // 空の行2がスキップされ、1, 3, 4, 5 が採用され、6は上限4件でカットされる
  assert.strictEqual(result.length, 4);
  assert.strictEqual(result[0].provider, '51136018');
  assert.strictEqual(result[1].provider, '21136018');
  assert.strictEqual(result[2].provider, '54136018');
  assert.strictEqual(result[3].provider, '80136018');
});

test('sanitizePublicInsurance sanitizes full-width digits and parses limit properly', () => {
  const sanitized = sanitizePublicInsurance({
    provider: '５４１３６０１８',
    recipient: ' １２３４５６７ ',
    burdenRatio: 10,
    monthlyLimitYen: 10000.8
  });

  assert.deepStrictEqual(sanitized, {
    provider: '54136018',
    recipient: '1234567',
    burdenRatio: 10,
    monthlyLimitYen: 10000
  });

  // 両方空なら null
  assert.strictEqual(sanitizePublicInsurance({ provider: '', recipient: '' }), null);
});

test('mergePreservingUneditedPublicInsurances protects 2nd and subsequent public insurances from being lost in single-slot mode', () => {
  const existing: PublicInsurance[] = [
    { provider: '51136018', recipient: '1111111', burdenRatio: 10 },
    { provider: '21136018', recipient: '2222222', burdenRatio: 10 },
    { provider: '80136018', recipient: '3333333', burdenRatio: 0 }
  ];

  // 1件目を編集した場合
  const editedSlot1: PublicInsurance[] = [
    { provider: '51136018', recipient: '9999999', burdenRatio: 10 }
  ];

  const preserved = mergePreservingUneditedPublicInsurances({
    existingPublicInsurances: existing,
    savedPublicInsurances: editedSlot1,
    mode: 'single_slot_preserve_rest'
  });

  assert.strictEqual(preserved.length, 3);
  assert.strictEqual(preserved[0].recipient, '9999999'); // 1件目は更新される
  assert.strictEqual(preserved[1].recipient, '2222222'); // 2件目は維持される
  assert.strictEqual(preserved[2].recipient, '3333333'); // 3件目は維持される

  // full_replace モードでは渡された配列で全置換される
  const replaced = mergePreservingUneditedPublicInsurances({
    existingPublicInsurances: existing,
    savedPublicInsurances: editedSlot1,
    mode: 'full_replace'
  });
  assert.strictEqual(replaced.length, 1);
  assert.strictEqual(replaced[0].recipient, '9999999');
});

test('buildPublicInsuranceBadgeList produces badges with category names and reflects issues', () => {
  const insurances: PublicInsurance[] = [
    { provider: '54136018', recipient: '1234567', burdenRatio: 20 },
    { provider: '21136018', recipient: '7654321', burdenRatio: 10 }
  ];

  const issues: InsuranceEligibilityIssue[] = [
    {
      severity: 'error',
      code: 'public_insurance_expired',
      title: '公費1が期限切れです',
      message: '有効期限を過ぎています'
    },
    {
      severity: 'warning',
      code: 'public_insurance_monthly_limit_missing',
      title: '公費2の負担上限が未設定です',
      message: '自己負担上限を設定してください'
    }
  ];

  const badges = buildPublicInsuranceBadgeList(insurances, issues);
  assert.strictEqual(badges.length, 2);

  // 公費1: 指定難病 (20%)、エラーあり
  assert.strictEqual(badges[0].categoryName, '指定難病');
  assert.strictEqual(badges[0].label, '指定難病 (20%)');
  assert.strictEqual(badges[0].hasError, true);
  assert.strictEqual(badges[0].hasWarning, false);

  // 公費2: 精神通院医療 (10%)、警告あり
  assert.strictEqual(badges[1].categoryName, '精神通院医療');
  assert.strictEqual(badges[1].label, '精神通院医療 (10%)');
  assert.strictEqual(badges[1].hasError, false);
  assert.strictEqual(badges[1].hasWarning, true);
});
