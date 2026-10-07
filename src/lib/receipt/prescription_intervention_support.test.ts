import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVENTION_CATEGORY_LABELS,
  buildInterventionAuditDetail,
  buildInterventionEvent,
  buildInterventionRecord,
  resolveInterventionCategory,
  suggestInterventionCategory,
  normalizeVisitInterventionEvents,
  formatDispensingRecordInterventions,
  formatReceiptInterventionSummary,
  validateInterventionReadiness,
  type InterventionInput,
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

// ---- 疑義照会モーダルの入力 -> 保存レコード / 構造化イベント / 監査ログ文言 ----

const NOW = '2026-10-08T01:02:03.000Z';

function interventionInput(overrides: Partial<InterventionInput> = {}): InterventionInput {
  return {
    reason: '残薬があるため日数調整',
    beforeSnapshot: 'アムロジピン錠5mg 28日分',
    afterSnapshot: 'アムロジピン錠5mg 14日分',
    inquiryStatus: 'completed',
    inquiryMethod: 'phone',
    inquiryDoctor: '鈴木 一郎',
    inquiryResult: '14日分へ変更で了承',
    responseDueDate: '',
    note: '',
    patientConsented: true,
    ...overrides
  };
}

test('prescription_intervention_support: resolveInterventionCategory keeps the pharmacist\'s choice and only guesses when none was made', () => {
  const text = { reason: '残薬があるため日数調整' };
  assert.strictEqual(resolveInterventionCategory(interventionInput({ ...text, category: 'discontinuation' })), 'discontinuation');
  assert.strictEqual(resolveInterventionCategory(interventionInput({ ...text, category: undefined })), 'leftover_adjustment');
  assert.strictEqual(
    resolveInterventionCategory(interventionInput({ reason: '', beforeSnapshot: '', afterSnapshot: '', category: undefined })),
    'other'
  );
});

test('prescription_intervention_support: buildInterventionRecord stamps times and sets the response time only for answered inquiries', () => {
  const context = { interventionId: 'int_1', visitId: 'visit_9', handledBy: '薬剤師A', now: NOW };

  const answered = buildInterventionRecord(interventionInput({ inquiryStatus: 'completed', responseDueDate: '2026-10-31' }), context);
  assert.strictEqual(answered.interventionId, 'int_1');
  assert.strictEqual(answered.visitId, 'visit_9');
  assert.strictEqual(answered.handledBy, '薬剤師A');
  assert.strictEqual(answered.contactedAt, NOW);
  assert.strictEqual(answered.respondedAt, NOW);
  assert.strictEqual(answered.createdAt, NOW);
  assert.strictEqual(answered.updatedAt, NOW);
  assert.strictEqual(answered.responseDueDate, '2026-10-31');
  assert.strictEqual(answered.inquiryResult, '14日分へ変更で了承');
  assert.strictEqual(answered.patientConsented, true);

  const pending = buildInterventionRecord(interventionInput({ inquiryStatus: 'pending', inquiryResult: '', responseDueDate: '' }), context);
  assert.strictEqual(pending.respondedAt, undefined, 'a pending inquiry has no response time');
  assert.strictEqual(pending.contactedAt, NOW);
  assert.strictEqual(pending.responseDueDate, undefined, 'a blank due date is not stored as an empty string');
});

test('prescription_intervention_support: buildInterventionEvent drops blank optional text and keeps patientConsented=false', () => {
  const context = { eventId: 'int_1', handledBy: '薬剤師A', now: NOW };

  const full = buildInterventionEvent(interventionInput({ note: '患者へ説明済み' }), 'leftover_adjustment', context);
  assert.deepStrictEqual(full, {
    eventId: 'int_1',
    category: 'leftover_adjustment',
    reason: '残薬があるため日数調整',
    beforeDrugName: 'アムロジピン錠5mg 28日分',
    afterDrugName: 'アムロジピン錠5mg 14日分',
    inquiryStatus: 'completed',
    inquiryMethod: 'phone',
    inquiryDoctor: '鈴木 一郎',
    inquiryResult: '14日分へ変更で了承',
    patientConsented: true,
    contactedAt: NOW,
    respondedAt: NOW,
    handledBy: '薬剤師A',
    note: '患者へ説明済み'
  });

  const sparse = buildInterventionEvent(
    interventionInput({
      beforeSnapshot: '', afterSnapshot: '', inquiryDoctor: '', inquiryResult: '', note: '',
      inquiryStatus: 'pending', patientConsented: false
    }),
    'other',
    context
  );
  assert.strictEqual(sparse.beforeDrugName, undefined);
  assert.strictEqual(sparse.afterDrugName, undefined);
  assert.strictEqual(sparse.inquiryDoctor, undefined);
  assert.strictEqual(sparse.inquiryResult, undefined);
  assert.strictEqual(sparse.note, undefined);
  assert.strictEqual(sparse.respondedAt, undefined);
  assert.strictEqual(sparse.patientConsented, false, 'an explicit "not consented" must not be dropped');
});

test('prescription_intervention_support: buildInterventionAuditDetail writes the full wording, with fallbacks and the optional due date', () => {
  assert.strictEqual(
    buildInterventionAuditDetail(interventionInput(), 'leftover_adjustment'),
    '疑義照会登録 [残薬調整（日数/数量）]: 状態 回答済 / 方法 電話 / 照会先「鈴木 一郎」 / 理由: 残薬があるため日数調整 / 結果: 14日分へ変更で了承。'
  );

  const pending = buildInterventionAuditDetail(
    interventionInput({
      inquiryStatus: 'pending', inquiryMethod: 'fax', inquiryDoctor: '', inquiryResult: '', responseDueDate: '2026-10-31'
    }),
    'interaction_inquiry'
  );
  assert.strictEqual(
    pending,
    '疑義照会登録 [重複投薬・相互作用・禁忌]: 状態 照会中 / 方法 FAX / 照会先「未指定」 / 理由: 残薬があるため日数調整 / 結果: 未回答 / 回答期限: 2026-10-31。'
  );
  assert.ok(!buildInterventionAuditDetail(interventionInput(), 'other').includes('回答期限'));
});

test('prescription_intervention_support: events built from the modal input flow through the real downstream checks', () => {
  const context = { eventId: 'int_1', handledBy: '薬剤師A', now: NOW };
  const answered = buildInterventionEvent(interventionInput(), 'leftover_adjustment', context);
  const pending = buildInterventionEvent(
    interventionInput({ inquiryStatus: 'pending', inquiryResult: '' }), 'leftover_adjustment', { ...context, eventId: 'int_2' }
  );

  assert.deepStrictEqual(validateInterventionReadiness([answered]), []);
  const issues = validateInterventionReadiness([pending]);
  assert.deepStrictEqual(issues.map((i) => [i.code, i.eventId]), [['intervention_inquiry_pending', 'int_2']]);

  const summary = formatReceiptInterventionSummary(answered);
  assert.ok(summary.includes('鈴木 一郎医師(電話)'));
  assert.ok(summary.includes('[残薬調整（日数/数量）]'));
  assert.ok(summary.includes('(アムロジピン錠5mg 28日分→アムロジピン錠5mg 14日分)'));

  const [row] = formatDispensingRecordInterventions([pending]);
  assert.ok(row.resultContent.startsWith('照会中（未回答）'), 'a pending inquiry is shown as unanswered on the dispensing record');
});
