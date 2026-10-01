import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVENTION_CATEGORY_LABELS,
  suggestInterventionCategory,
  normalizeVisitInterventionEvents,
  formatDispensingRecordInterventions,
  formatReceiptInterventionSummary,
  validateInterventionReadiness,
  type VisitInterventionEvent
} from '../prescription_intervention_support';
import { VISIT_SCHEMA } from '@/db/schema';

test('prescription_intervention_support: suggestInterventionCategory identifies categories deterministically', () => {
  assert.strictEqual(suggestInterventionCategory('残薬があるため7日分削除'), 'leftover_adjustment');
  assert.strictEqual(suggestInterventionCategory('後発医薬品を希望', 'ロキソニン', 'ロキソプロフェン'), 'generic_change');
  assert.strictEqual(suggestInterventionCategory('1日2回から1日3回へ用法変更'), 'dosage_change');
  assert.strictEqual(suggestInterventionCategory('併用禁忌の疑いにより照会'), 'interaction_inquiry');
  assert.strictEqual(suggestInterventionCategory('症状軽快のため処方中止'), 'discontinuation');
  assert.strictEqual(suggestInterventionCategory('医師の指示により確認'), 'other');
});

test('prescription_intervention_support: normalizeVisitInterventionEvents prioritizes visit events and converts legacy records', () => {
  const structuredEvent: VisitInterventionEvent = {
    eventId: 'vie_1',
    category: 'generic_change',
    reason: '患者希望による後発品変更',
    beforeDrugName: '先発品A',
    afterDrugName: '後発品A',
    inquiryStatus: 'completed',
    inquiryMethod: 'phone',
    inquiryDoctor: '山田',
    inquiryResult: '了承',
    patientConsented: true,
    contactedAt: '2026-10-01T10:00:00Z',
    respondedAt: '2026-10-01T10:05:00Z',
    handledBy: '鈴木',
    note: '次回も後発品希望'
  };

  // 1. visit.interventionEvents がある場合はそれをそのまま返す
  const normalizedFromVisit = normalizeVisitInterventionEvents(
    { visitId: 'v_1', interventionEvents: [structuredEvent] },
    []
  );
  assert.strictEqual(normalizedFromVisit.length, 1);
  assert.strictEqual(normalizedFromVisit[0].eventId, 'vie_1');
  assert.strictEqual(normalizedFromVisit[0].category, 'generic_change');

  // 2. visit.interventionEvents が無い場合、legacyInterventions から安全に変換する
  const legacyList = [
    {
      interventionId: 'legacy_1',
      visitId: 'v_2',
      reason: '残薬調整のため',
      beforeSnapshot: '薬B 14日分',
      afterSnapshot: '薬B 7日分',
      inquiryStatus: 'completed',
      inquiryMethod: 'fax',
      inquiryDoctor: '佐藤',
      inquiryResult: '同意',
      patientConsented: true,
      contactedAt: '2026-10-01T11:00:00Z',
      respondedAt: '2026-10-01T11:15:00Z',
      handledBy: '田中',
      note: '自宅残薬7日あり'
    }
  ];

  const normalizedFromLegacy = normalizeVisitInterventionEvents(
    { visitId: 'v_2' },
    legacyList
  );
  assert.strictEqual(normalizedFromLegacy.length, 1);
  assert.strictEqual(normalizedFromLegacy[0].eventId, 'legacy_1');
  assert.strictEqual(normalizedFromLegacy[0].category, 'leftover_adjustment');
  assert.strictEqual(normalizedFromLegacy[0].beforeDrugName, '薬B 14日分');
  assert.strictEqual(normalizedFromLegacy[0].inquiryDoctor, '佐藤');
  assert.strictEqual(normalizedFromLegacy[0].patientConsented, true);
});

test('prescription_intervention_support: formatDispensingRecordInterventions formats statutory dispensing record fields', () => {
  const events: VisitInterventionEvent[] = [
    {
      eventId: 'vie_test',
      category: 'leftover_adjustment',
      reason: '残薬7日分あり',
      beforeDrugName: 'アムロジピン錠5mg 14日分',
      afterDrugName: 'アムロジピン錠5mg 7日分',
      inquiryStatus: 'completed',
      inquiryMethod: 'phone',
      inquiryDoctor: '山田 太郎',
      inquiryResult: '7日分へ減数了承',
      patientConsented: true,
      contactedAt: '2026-10-01T14:30:00Z',
      respondedAt: '2026-10-01T14:35:00Z',
      handledBy: '鈴木薬剤師',
      note: '手帳持参'
    }
  ];

  const formatted = formatDispensingRecordInterventions(events);
  assert.strictEqual(formatted.length, 1);
  assert.strictEqual(formatted[0].categoryLabel, '残薬調整（日数/数量）');
  assert.ok(formatted[0].targetDoctor.includes('山田 太郎'));
  assert.ok(formatted[0].targetDoctor.includes('電話'));
  assert.ok(formatted[0].inquiryContent.includes('残薬7日分あり'));
  assert.ok(formatted[0].inquiryContent.includes('アムロジピン錠5mg 14日分'));
  assert.ok(formatted[0].resultContent.includes('7日分へ減数了承'));
  assert.ok(formatted[0].resultContent.includes('アムロジピン錠5mg 7日分'));
  assert.strictEqual(formatted[0].consentText, '同意済');
  assert.strictEqual(formatted[0].pharmacist, '鈴木薬剤師');
  assert.strictEqual(formatted[0].statusLabel, '回答済');
});

test('prescription_intervention_support: formatReceiptInterventionSummary generates standard billing remarks', () => {
  const event: VisitInterventionEvent = {
    eventId: 'vie_claim',
    category: 'dosage_change',
    reason: '腎機能低下のため減量照会',
    beforeDrugName: 'クラリスロマイシン200mg 1日2錠',
    afterDrugName: 'クラリスロマイシン200mg 1日1錠',
    inquiryStatus: 'completed',
    inquiryMethod: 'phone',
    inquiryDoctor: '山田',
    inquiryResult: '1日1錠へ変更',
    patientConsented: true,
    contactedAt: '2026-10-01T10:00:00Z',
    respondedAt: '2026-10-01T10:05:00Z',
    handledBy: '鈴木'
  };

  const summary = formatReceiptInterventionSummary(event);
  assert.ok(summary.startsWith('【疑義照会・処方変更】'));
  assert.ok(summary.includes('山田医師'));
  assert.ok(summary.includes('用法・用量変更'));
  assert.ok(summary.includes('腎機能低下のため減量照会'));
  assert.ok(summary.includes('1日1錠へ変更'));
  assert.ok(summary.includes('患者同意済'));
});

test('prescription_intervention_support: validateInterventionReadiness catches pending status and missing reasons', () => {
  const issues = validateInterventionReadiness([
    {
      eventId: 'vie_pending',
      category: 'interaction_inquiry',
      reason: '併用禁忌の確認',
      inquiryStatus: 'pending',
      inquiryMethod: 'phone',
      inquiryDoctor: '山田',
      patientConsented: true,
      contactedAt: '2026-10-01T10:00:00Z',
      handledBy: '鈴木'
    },
    {
      eventId: 'vie_empty_reason',
      category: 'other',
      reason: '   ',
      inquiryStatus: 'completed',
      inquiryMethod: 'fax',
      inquiryDoctor: '佐藤',
      patientConsented: false,
      contactedAt: '2026-10-01T10:00:00Z',
      handledBy: '鈴木'
    },
    {
      eventId: 'vie_missing_doctor',
      category: 'generic_change',
      reason: '後発変更',
      inquiryStatus: 'completed',
      inquiryMethod: 'phone',
      patientConsented: true,
      contactedAt: '2026-10-01T10:00:00Z',
      handledBy: '鈴木'
    }
  ]);

  assert.strictEqual(issues.length, 3);
  assert.ok(issues.some((i) => i.code === 'intervention_inquiry_pending'));
  assert.ok(issues.some((i) => i.code === 'intervention_reason_missing'));
  assert.ok(issues.some((i) => i.code === 'intervention_doctor_missing'));
});

test('prescription_intervention_support: VISIT_SCHEMA validates interventionEvents array properly', () => {
  assert.strictEqual(VISIT_SCHEMA.version, 23);
  assert.ok(VISIT_SCHEMA.properties.interventionEvents);
  assert.ok(VISIT_SCHEMA.encrypted?.includes('interventionEvents'));
});

test('prescription_intervention_support: monthly claim readiness report catches pending inquiry', async () => {
  const { buildMonthlyClaimUkeOfficialReadinessReport } = await import('../monthly_claim_uke');

  const pendingCase = {
    visit: {
      visitId: 'v_pending',
      patientId: 'p_1',
      issueDate: '2026-10-01T10:00:00Z',
      dispensingDate: '2026-10-01',
      status: 'completed' as const,
      interventionEvents: [
        {
          eventId: 'vie_pend_1',
          category: 'leftover_adjustment' as const,
          reason: '残薬確認中',
          inquiryStatus: 'pending' as const,
          inquiryMethod: 'phone' as const,
          inquiryDoctor: '山田',
          patientConsented: true,
          contactedAt: '2026-10-01T10:00:00Z',
          handledBy: '鈴木'
        }
      ]
    },
    patient: {
      patientId: 'p_1',
      name: 'テスト 患者',
      kana: 'テスト カンジャ',
      birthDate: '1980-01-01',
      gender: 'male' as const,
      insuranceInfo: {
        provider: '12345678',
        number: '12345',
        burdenRatio: 30
      }
    },
    settings: {
      id: 'default',
      pharmacyName: 'テスト薬局',
      pharmacyCode: '1312345678',
      pharmacyPostalCode: '100-0001',
      pharmacyAddress: '東京都千代田区',
      pharmacyPhone: '03-1234-5678',
      registrationNumber: 'T1234567890123',
      defaultPharmacistName: '鈴木',
      baseFeeCategory: '1' as const,
      regionalSupportAddition: 'none' as const,
      medicalDxAddition: false
    },
    items: [],
    calculatedFees: []
  };

  const report = buildMonthlyClaimUkeOfficialReadinessReport(pendingCase);
  const codes = report.issues.map((i) => i.code);
  assert.ok(codes.includes('official_uke_intervention_inquiry_pending'));
});

