import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildMockOnlineEligibilityResponse,
  formatOnlineEligibilityFieldMappingReport,
  normalizeOnlineEligibilityResponse
} from './online_eligibility.ts';

test('normalizeOnlineEligibilityResponse maps formal response fields to patient insurance patch', () => {
  const normalized = normalizeOnlineEligibilityResponse({
    resultCode: '00',
    resultMessage: '資格有効',
    resultDateTime: '2026-06-15T09:00:00.000Z',
    insurerNumber: '06123456',
    insuredNumber: '記号123 番号456',
    burdenRatio: 20,
    certificateValidFrom: '2026-04-01',
    certificateValidTo: '2026-12-31',
    publicExpenses: [
      {
        payerNumber: '51136018',
        recipientNumber: '1234567',
        certificateValidFrom: '2026-04-01',
        certificateValidTo: '2026-12-31',
        selfPaymentLimitYen: 5000
      }
    ]
  });

  assert.strictEqual(normalized.uiStatus, 'confirmed');
  assert.strictEqual(normalized.patientStatus, 'valid');
  assert.strictEqual(normalized.insuranceInfoPatch.provider, '06123456');
  assert.strictEqual(normalized.insuranceInfoPatch.number, '記号123 番号456');
  assert.strictEqual(normalized.insuranceInfoPatch.burdenRatio, 20);
  assert.strictEqual(normalized.insuranceInfoPatch.validTo, '2026-12-31');
  assert.strictEqual(normalized.insuranceInfoPatch.eligibilityCheckedAt, '2026-06-15T09:00:00.000Z');
  assert.strictEqual(normalized.publicInsurances?.[0].monthlyLimitYen, 5000);
  assert.strictEqual(normalized.fieldMapping.recognized.insurerNumber, 'insurerNumber');
  assert.ok(!normalized.fieldMapping.missing.includes('insurerNumber'));
});

test('normalizeOnlineEligibilityResponse maps formal-style Japanese sample fields and reports source mapping', () => {
  const normalized = normalizeOnlineEligibilityResponse({
    資格情報: {
      資格確認結果: '資格有効',
      照会日時: '2026-06-16T10:30:00.000Z',
      メッセージ: '資格有効として確認しました。',
      保険者番号: '06123456',
      被保険者証記号番号: '記号１２３ 番号４５６',
      一部負担金割合: '２０％',
      資格取得年月日: '2026-04-01',
      有効期限: '2026-12-31',
      公費情報: [
        {
          公費負担者番号: '51136018',
          公費受給者番号: '1234567',
          公費開始日: '2026-04-01',
          公費有効期限: '2026-12-31',
          自己負担上限額: '５,０００円'
        }
      ]
    }
  });

  assert.strictEqual(normalized.patientStatus, 'valid');
  assert.strictEqual(normalized.insuranceInfoPatch.provider, '06123456');
  assert.strictEqual(normalized.insuranceInfoPatch.number, '記号123 番号456');
  assert.strictEqual(normalized.insuranceInfoPatch.burdenRatio, 20);
  assert.strictEqual(normalized.insuranceInfoPatch.validFrom, '2026-04-01');
  assert.strictEqual(normalized.insuranceInfoPatch.validTo, '2026-12-31');
  assert.strictEqual(normalized.publicInsurances?.[0].monthlyLimitYen, 5000);
  assert.strictEqual(normalized.fieldMapping.recognized.status, '資格情報.資格確認結果');
  assert.strictEqual(normalized.fieldMapping.recognized.insurerNumber, '資格情報.保険者番号');
  assert.deepStrictEqual(normalized.fieldMapping.missing, []);
  assert.match(formatOnlineEligibilityFieldMappingReport(normalized.fieldMapping), /認識項目/);
  assert.match(formatOnlineEligibilityFieldMappingReport(normalized.fieldMapping), /未認識項目: なし/);
});

test('normalizeOnlineEligibilityResponse maps nested official-style insurance and public expense sample', () => {
  const normalized = normalizeOnlineEligibilityResponse({
    result: { statusCode: '00', statusMessage: '資格有効' },
    referenceDate: '20260617',
    資格情報: {
      保険情報: {
        保険者番号: '０６１２３４５６',
        被保険者証記号: '記号１２３',
        被保険者証番号: '番号４５６',
        一部負担金割合: '３割',
        資格取得年月日: '令和8年4月1日',
        有効期限: '20261231'
      },
      公費情報一覧: [
        {
          負担者番号: '５１１３６０１８',
          受給者番号: '１２３４５６７',
          自己負担割合: '１割',
          有効開始年月日: '令和8年4月1日',
          有効終了年月日: '2026/12/31',
          月額上限額: '5,000円'
        }
      ]
    }
  });

  assert.strictEqual(normalized.patientStatus, 'valid');
  assert.strictEqual(normalized.insuranceInfoPatch.provider, '06123456');
  assert.strictEqual(normalized.insuranceInfoPatch.number, '記号123 番号456');
  assert.strictEqual(normalized.insuranceInfoPatch.burdenRatio, 30);
  assert.strictEqual(normalized.insuranceInfoPatch.validFrom, '2026-04-01');
  assert.strictEqual(normalized.insuranceInfoPatch.validTo, '2026-12-31');
  assert.strictEqual(normalized.publicInsurances?.[0].provider, '51136018');
  assert.strictEqual(normalized.publicInsurances?.[0].recipient, '1234567');
  assert.strictEqual(normalized.publicInsurances?.[0].burdenRatio, 10);
  assert.strictEqual(normalized.publicInsurances?.[0].startDate, '2026-04-01');
  assert.strictEqual(normalized.publicInsurances?.[0].endDate, '2026-12-31');
  assert.strictEqual(normalized.publicInsurances?.[0].monthlyLimitYen, 5000);
  assert.strictEqual(
    normalized.fieldMapping.recognized.insuredNumber,
    '資格情報.保険情報.被保険者証記号+資格情報.保険情報.被保険者証番号'
  );
  assert.deepStrictEqual(normalized.fieldMapping.missing, []);
});

test('normalizeOnlineEligibilityResponse maps invalid and unavailable statuses safely', () => {
  const invalid = normalizeOnlineEligibilityResponse({ qualificationStatus: 'expired' });
  const lost = normalizeOnlineEligibilityResponse({ 資格確認結果: '資格 喪失' });
  const unavailable = normalizeOnlineEligibilityResponse({ qualificationStatus: 'system_error' });

  assert.strictEqual(invalid.patientStatus, 'invalid');
  assert.strictEqual(lost.patientStatus, 'invalid');
  assert.strictEqual(invalid.uiStatus, 'warning');
  assert.ok(invalid.fieldMapping.missing.includes('insurerNumber'));
  assert.strictEqual(unavailable.patientStatus, 'unavailable');
  assert.strictEqual(unavailable.uiStatus, 'unavailable');
});

test('buildMockOnlineEligibilityResponse returns normalized-compatible qualification fields', () => {
  const response = buildMockOnlineEligibilityResponse({
    insuranceNumber: '06123456',
    insuredNumber: '記号123',
    burdenRatio: 30,
    checkedAt: '2026-06-15T09:00:00.000Z'
  });
  const normalized = normalizeOnlineEligibilityResponse(response);

  assert.strictEqual(normalized.patientStatus, 'valid');
  assert.strictEqual(normalized.insuranceInfoPatch.provider, '06123456');
  assert.strictEqual(normalized.insuranceInfoPatch.number, '記号123');
  assert.strictEqual(normalized.insuranceInfoPatch.validFrom, '2026-01-01');
  assert.strictEqual(normalized.insuranceInfoPatch.validTo, '2026-12-31');
});
