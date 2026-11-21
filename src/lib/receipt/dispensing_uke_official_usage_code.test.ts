import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeItem } from './dispensing_uke';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkePreflightReport,
  buildMonthlyClaimUkeResults,
  deriveOfficialUsageCode,
  formatMonthlyClaimUkePreflightReport,
  type MonthlyClaimUkeCase
} from '@/lib/monthly_claim_uke';
import { buildSingleDispensingUkeOfficial } from './dispensing_uke_official_single';
import { buildDispensingUkeOfficialSubmissionGate } from './dispensing_uke_validation';

const settings: FacilitySettings = {
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

const patient: Patient = {
  patientId: 'pat_a4',
  name: '用法 太郎',
  kana: 'ヨウホウ タロウ',
  birthDate: '1980-05-12',
  gender: 'male',
  insuranceInfo: {
    provider: '06130012',
    number: '123456',
    burdenRatio: 30,
    relationship: '本人'
  }
};

function makeCase(items: DispensingUkeItem[]): MonthlyClaimUkeCase {
  const visit: Visit = {
    visitId: 'visit_a4',
    patientId: 'pat_a4',
    prescriptionDate: '2026-06-10',
    dispensingDate: '2026-06-10',
    issueDate: '2026-06-10T10:00:00.000Z',
    status: 'completed',
    institutionId: '1312345',
    doctorId: 'doc_01',
    claimLifecycle: {
      status: 'rebilling',
      rebillingReason: 'A-4 用法コード検証'
    }
  };
  const calculatedFees: CalculationResultItem[] = [
    { code: 'base_fee', receiptFeeCode: '410004110', name: '調剤基本料1', points: 45, rationale: 'テスト' },
    { code: 'drug_preparation', receiptFeeCode: '420001810', name: '薬剤調製料', points: 34, rationale: 'テスト' },
    { code: 'drug_fee', name: '薬剤料', points: 20, rationale: 'テスト' }
  ];
  return { visit, patient, settings, items, calculatedFees };
}

describe('A-4: official UKE SH usage code wiring and missing-usage-code readiness check', () => {
  it('populates SH field 3 with official 3-digit receipt usage codes (internal 005 / external 900) across single & monthly official UKE', () => {
    const items: DispensingUkeItem[] = [
      {
        itemId: 'item_internal',
        visitId: 'visit_a4',
        rpNumber: 1,
        drugId: '620000001',
        dispensedDrugCode: '620000001',
        drugName: 'アムロジピン錠5mg',
        amount: 1,
        days: 14,
        usage: '１日１回朝食前　服用',
        electronicUsageCode: '1011000100000000',
        dosageCategory: 'internal',
        drugPrice: 10,
        claimDrugFee: true
      },
      {
        itemId: 'item_external',
        visitId: 'visit_a4',
        rpNumber: 2,
        drugId: '620000002',
        dispensedDrugCode: '620000002',
        drugName: 'ロキソニンテープ50mg',
        amount: 7,
        days: 0,
        usage: '疼痛時　貼付',
        dosageCategory: 'external',
        drugPrice: 10,
        claimDrugFee: true
      }
    ];

    const claimCase = makeCase(items);
    const results = buildMonthlyClaimUkeResults([claimCase], new Date('2026-06-10T10:00:00Z'));
    const preflight = buildMonthlyClaimUkePreflightReport(results);
    const monthlyBundle = buildMonthlyClaimOfficialUkeBundle([claimCase], results);
    const singleOfficial = buildSingleDispensingUkeOfficial(claimCase);

    assert.strictEqual(results[0].officialReadinessReport.checkedUsageGroupCount, 2);
    assert.strictEqual(results[0].officialReadinessReport.missingUsageCodeCount, 0);
    assert.strictEqual(preflight.officialReadinessSummary.missingUsageCodeCount, 0);
    assert.doesNotMatch(formatMonthlyClaimUkePreflightReport(preflight), /用法コード未設定/);

    const monthlySh = monthlyBundle.records.filter((r) => r.type === 'SH');
    const singleSh = singleOfficial.records.filter((r) => r.type === 'SH');
    assert.strictEqual(monthlySh.length, 2);
    assert.strictEqual(monthlySh[0].fields[1], '1');
    assert.strictEqual(monthlySh[0].fields[2], '005');
    assert.strictEqual(monthlySh[1].fields[1], '5');
    assert.strictEqual(monthlySh[1].fields[2], '900');
    assert.deepStrictEqual(singleSh, monthlySh);
    assert.strictEqual(buildDispensingUkeOfficialSubmissionGate(monthlyBundle.records).ok, true);
    assert.strictEqual(monthlyBundle.content.at(-1), 0x1a);
  });

  it('leaves SH usage code empty and reports missingUsageCodeCount for free-text / unmatched usages without fabricating codes', () => {
    const items: DispensingUkeItem[] = [
      {
        itemId: 'item_free',
        visitId: 'visit_a4',
        rpNumber: 1,
        drugId: '620000001',
        dispensedDrugCode: '620000001',
        drugName: 'テスト錠',
        amount: 1,
        days: 7,
        usage: '1日3回 独自自由記載',
        dosageCategory: 'internal',
        drugPrice: 10,
        claimDrugFee: true
      }
    ];

    assert.strictEqual(deriveOfficialUsageCode(items), undefined);

    const claimCase = makeCase(items);
    const results = buildMonthlyClaimUkeResults([claimCase], new Date('2026-06-10T10:00:00Z'));
    const preflight = buildMonthlyClaimUkePreflightReport(results);
    const bundle = buildMonthlyClaimOfficialUkeBundle([claimCase], results);

    assert.strictEqual(results[0].officialReadinessReport.ok, true);
    assert.strictEqual(results[0].officialReadinessReport.checkedUsageGroupCount, 1);
    assert.strictEqual(results[0].officialReadinessReport.missingUsageCodeCount, 1);
    assert.strictEqual(preflight.officialReadinessSummary.missingUsageCodeCount, 1);
    assert.match(formatMonthlyClaimUkePreflightReport(preflight), /用法コード未設定 1件/);

    const sh = bundle.records.find((r) => r.type === 'SH');
    assert.ok(sh);
    assert.strictEqual(sh.fields[2], '');
    assert.strictEqual(buildDispensingUkeOfficialSubmissionGate(bundle.records).ok, true);
  });
});
