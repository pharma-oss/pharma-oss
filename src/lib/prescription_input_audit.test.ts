import { test } from 'node:test';
import assert from 'node:assert';
import { buildPrescriptionInputAudit } from './prescription_input_audit.ts';

test('buildPrescriptionInputAudit reports missing required prescription fields', () => {
  const audit = buildPrescriptionInputAudit([
    { id: 'i1', rpId: 'rp1', drugName: '', amount: '', usage: '', days: '' }
  ]);

  assert.strictEqual(audit.errorCount, 4);
  assert.ok(audit.issues.some((issue) => issue.code === 'drug_missing'));
  assert.ok(audit.issues.some((issue) => issue.code === 'amount_invalid'));
  assert.ok(audit.issues.some((issue) => issue.code === 'usage_missing'));
  assert.ok(audit.issues.some((issue) => issue.code === 'days_invalid'));
});

test('buildPrescriptionInputAudit flags duplicate and similar therapy candidates', () => {
  const audit = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'アムロジピン錠5mg',
      amount: '1',
      usage: '1日1回朝食後',
      days: '14',
      yjCode: '2171022F1010'
    },
    {
      id: 'i2',
      rpId: 'rp2',
      drugCode: 'd2',
      drugName: 'ニフェジピンCR錠20mg',
      amount: '1',
      usage: '1日1回朝食後',
      days: '14',
      yjCode: '2171014G1012'
    },
    {
      id: 'i3',
      rpId: 'rp3',
      drugCode: 'd1',
      drugName: 'アムロジピン錠5mg',
      amount: '1',
      usage: '1日1回夕食後',
      days: '14',
      yjCode: '2171022F1010'
    }
  ]);

  assert.ok(audit.issues.some((issue) => issue.code === 'same_drug_duplicated'));
  assert.ok(audit.issues.some((issue) => issue.code === 'similar_therapy_detected'));
});

test('buildPrescriptionInputAudit flags high risk drugs, missing substitution reason, and stock shortage', () => {
  const audit = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ワルファリン錠1mg',
      dispensedDrug: 'ワーファリン錠1mg',
      changeReason: '',
      amount: '2',
      usage: '1日1回夕食後',
      days: '14',
      yjCode: '3332001F1018',
      isHighRisk: true,
      stockQuantity: 10
    }
  ]);

  assert.strictEqual(audit.errorCount, 0);
  assert.ok(audit.issues.some((issue) => issue.code === 'high_risk_without_comment'));
  assert.ok(audit.issues.some((issue) => issue.code === 'substitution_reason_missing'));
  assert.ok(audit.issues.some((issue) => issue.code === 'stock_shortage'));
});

test('buildPrescriptionInputAudit surfaces patient allergy and side effect alerts during input', () => {
  const audit = buildPrescriptionInputAudit(
    [
      {
        id: 'i1',
        rpId: 'rp1',
        drugCode: 'd1',
        drugName: 'ロキソニン錠60mg',
        genericName: 'ロキソプロフェンナトリウム水和物',
        amount: '3',
        usage: '1日3回毎食後',
        days: '7'
      },
      {
        id: 'i2',
        rpId: 'rp2',
        drugCode: 'd2',
        drugName: 'ペニシリンVカリウム錠',
        amount: '3',
        usage: '1日3回毎食後',
        days: '7'
      }
    ],
    {
      patientAlerts: [
        {
          alertId: 'a1',
          patientId: 'p1',
          type: 'side_effect',
          content: 'ロキソプロフェンで発疹',
          status: 'active'
        },
        {
          alertId: 'a2',
          patientId: 'p1',
          type: 'allergy',
          content: 'アレルギー: ペニシリン',
          status: 'active'
        },
        {
          alertId: 'a3',
          patientId: 'p1',
          type: 'allergy',
          content: 'セフェム',
          status: 'resolved'
        }
      ]
    }
  );

  assert.ok(audit.issues.some((issue) => issue.code === 'patient_allergy_match' && issue.severity === 'error'));
  assert.ok(audit.issues.some((issue) => issue.code === 'patient_side_effect_match' && issue.severity === 'warning'));
  assert.ok(!audit.issues.some((issue) => issue.message.includes('セフェム')));
});

test('buildPrescriptionInputAudit accepts clean prescriptions', () => {
  const audit = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'アムロジピン錠5mg',
      amount: '1',
      usage: '1日1回朝食後',
      days: '14',
      yjCode: '2171022F1010',
      stockQuantity: 28
    }
  ]);

  assert.deepStrictEqual(audit.issues, []);
});
