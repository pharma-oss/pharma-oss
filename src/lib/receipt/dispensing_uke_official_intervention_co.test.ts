import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import encoding from 'encoding-japanese';
import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeItem } from './dispensing_uke';
import {
  OFFICIAL_COMMENT_MAX_SJIS_BYTES,
  OFFICIAL_FREE_TEXT_COMMENT_CODE,
  buildOfficialInterventionComments,
  sanitizeAndChunkOfficialCommentText
} from './dispensing_uke_official_supplemental';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkeResults,
  type MonthlyClaimUkeCase
} from '@/lib/monthly_claim_uke';
import { buildSingleDispensingUkeOfficial } from './dispensing_uke_official_single';
import {
  DISPENSING_UKE_OFFICIAL_RECORD_SPEC,
  buildDispensingUkeOfficialSubmissionGate,
  validateDispensingUkeRecords
} from './dispensing_uke_validation';

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
  patientId: 'pat_f2',
  name: '疑義 花子',
  kana: 'ギギ ハナコ',
  birthDate: '1978-09-20',
  gender: 'female',
  insuranceInfo: {
    provider: '06130012',
    number: '654321',
    burdenRatio: 30,
    relationship: '本人'
  }
};

function makeCase(visitOverrides: Partial<Visit> = {}): MonthlyClaimUkeCase {
  const visit: Visit = {
    visitId: 'visit_f2',
    patientId: 'pat_f2',
    prescriptionDate: '2026-06-10',
    dispensingDate: '2026-06-10',
    issueDate: '2026-06-10T10:00:00.000Z',
    status: 'completed',
    institutionId: '1312345',
    doctorId: 'doc_01',
    claimLifecycle: {
      status: 'rebilling',
      rebillingReason: 'F-2 CO摘要出力検証'
    },
    ...visitOverrides
  };
  const items: DispensingUkeItem[] = [
    {
      itemId: 'item_f2_1',
      visitId: 'visit_f2',
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
    }
  ];
  const calculatedFees: CalculationResultItem[] = [
    { code: 'base_fee', receiptFeeCode: '410004110', name: '調剤基本料1', points: 45, rationale: 'テスト' },
    { code: 'drug_preparation', receiptFeeCode: '420001810', name: '薬剤調製料', points: 24, rationale: 'テスト' },
    { code: 'drug_fee', name: '薬剤料', points: 14, rationale: 'テスト' }
  ];
  return { visit, patient, settings, items, calculatedFees };
}

describe('F-2: structured visit.interventionEvents -> official UKE CO comment records', () => {
  it('sanitizes UKE-prohibited / non-SJIS characters and splits comments cleanly within 76 Shift-JIS bytes', () => {
    const raw = '理由:残薬調整, "7日分へ変更"\n処方変更 ⚠️ 確認済み'.repeat(3);
    const chunks = sanitizeAndChunkOfficialCommentText(raw);
    assert.ok(chunks.length >= 2, 'long summary must split into multiple chunks');

    for (const chunk of chunks) {
      assert.strictEqual(/[",\r\n]/.test(chunk), false, 'chunk must not contain CSV-prohibited characters');
      const unicode = encoding.stringToCode(chunk);
      const sjis = encoding.convert(unicode, { to: 'SJIS', from: 'UNICODE' });
      const roundTrip = encoding.codeToString(encoding.convert(sjis, { to: 'UNICODE', from: 'SJIS' }));
      assert.strictEqual(roundTrip, chunk, 'chunk must round-trip cleanly in Shift-JIS');
      assert.ok(
        sjis.length <= OFFICIAL_COMMENT_MAX_SJIS_BYTES,
        `chunk SJIS length ${sjis.length} must be <= ${OFFICIAL_COMMENT_MAX_SJIS_BYTES}`
      );
    }
  });

  it('emits official CO (810000001) records in both monthly and single RECEIPTY.CYO and skips cancelled / duplicate events', () => {
    const event = {
      eventId: 'ev_1',
      category: 'leftover_adjustment' as const,
      reason: '残薬調整のため14日分から7日分へ変更',
      beforeDrugName: 'アムロジピン錠5mg 14日分',
      afterDrugName: 'アムロジピン錠5mg 7日分',
      inquiryStatus: 'completed' as const,
      inquiryMethod: 'phone' as const,
      inquiryDoctor: '佐藤',
      inquiryResult: '7日分へ減数了承',
      patientConsented: true,
      contactedAt: '2026-06-10T01:30:00.000Z',
      respondedAt: '2026-06-10T01:40:00.000Z',
      handledBy: '山田薬剤師'
    };
    const cancelledEvent = {
      ...event,
      eventId: 'ev_cancelled',
      reason: '取消済みのテスト照会',
      inquiryStatus: 'cancelled' as const
    };
    const duplicateEvent = {
      ...event,
      eventId: 'ev_dup'
    };

    const claimCase = makeCase({
      interventionEvents: [event, cancelledEvent, duplicateEvent]
    });

    const comments = buildOfficialInterventionComments({ visit: claimCase.visit });
    assert.ok(comments.length >= 2, 'structured intervention event should produce chunked CO comments');
    assert.strictEqual(
      comments.some((c) => (c.text || '').includes('取消済みのテスト照会')),
      false,
      'cancelled inquiry must not be emitted to official CO records'
    );

    const results = buildMonthlyClaimUkeResults([claimCase], new Date('2026-06-10T10:00:00Z'));
    const monthlyBundle = buildMonthlyClaimOfficialUkeBundle([claimCase], results);
    const singleOfficial = buildSingleDispensingUkeOfficial(claimCase);

    const monthlyCo = monthlyBundle.records.filter((r) => r.type === 'CO');
    const singleCo = singleOfficial.records.filter((r) => r.type === 'CO');
    assert.strictEqual(monthlyCo.length, comments.length);
    assert.deepStrictEqual(singleCo, monthlyCo);
    assert.ok(monthlyCo.every((r) => r.fields[0] === OFFICIAL_FREE_TEXT_COMMENT_CODE));

    const combinedText = monthlyCo.map((r) => r.fields[1] || '').join('');
    assert.match(combinedText, /【疑義照会・処方変更】/);
    assert.match(combinedText, /佐藤医師\(電話\)/);
    assert.match(combinedText, /残薬調整のため14日分から7日分へ変更/);
    assert.match(combinedText, /7日分へ減数了承/);

    // Verify no duplicate CO rows from duplicateEvent
    const uniqueLines = new Set(monthlyCo.map((r) => r.fields.join(',')));
    assert.strictEqual(uniqueLines.size, monthlyCo.length, 'duplicate CO rows must be eliminated');

    // Official skeleton gate, official spec validation, allFields, reconciliation, and EOF 0x1A must all pass
    assert.strictEqual(buildDispensingUkeOfficialSubmissionGate(monthlyBundle.records).ok, true);
    const validationIssues = validateDispensingUkeRecords(monthlyBundle.records, {
      context: 'official_submission',
      officialSubmission: true,
      recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
    });
    assert.strictEqual(validationIssues.filter((i) => i.severity === 'error').length, 0);
    assert.strictEqual(monthlyBundle.officialReconciliationReport.ok, true);
    assert.strictEqual(monthlyBundle.officialReconciliationReport.totalCommentRecordCount, monthlyCo.length);
    assert.strictEqual(monthlyBundle.content.at(-1), 0x1a);
  });

  it('emits zero CO records when a visit has no intervention events', () => {
    const claimCase = makeCase({ interventionEvents: [] });
    const singleOfficial = buildSingleDispensingUkeOfficial(claimCase);
    assert.strictEqual(singleOfficial.records.filter((r) => r.type === 'CO').length, 0);
    assert.strictEqual(singleOfficial.bundle.officialReconciliationReport.totalCommentRecordCount, 0);
  });
});
