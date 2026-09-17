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

test('buildPrescriptionInputAudit flags usage_dosage_category_mismatch as warning (G5-3, G5-4)', () => {
  // 1. 剤形 external ＋ 用法「１日３回朝昼夕食後　服用」（内服） → warning 1件
  const audit1 = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ロキソニンテープ50mg',
      amount: '1',
      usage: '１日３回朝昼夕食後　服用',
      days: '14',
      dosageCategory: 'external'
    }
  ]);
  const mismatch1 = audit1.issues.filter((issue) => issue.code === 'usage_dosage_category_mismatch');
  assert.equal(mismatch1.length, 1, '外用に内服用法を指定した場合は不一致警告が1件出ること');
  assert.equal(mismatch1[0].severity, 'warning', '不一致は error ではなく warning であること (G5-3)');
  assert.match(mismatch1[0].title, /外用/);

  // 2. 剤形 internal_drop ＋ 用法「便秘時　服用」 → issue が出ないこと（許可リストに含まれるため） (G5-4)
  const audit2 = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ラキソベロン内用液0.75%',
      amount: '1',
      usage: '便秘時　服用',
      days: '1',
      dosageCategory: 'internal_drop'
    }
  ]);
  const mismatch2 = audit2.issues.filter((issue) => issue.code === 'usage_dosage_category_mismatch');
  assert.equal(mismatch2.length, 0, '内滴に許可リスト「便秘時　服用」を指定した場合は警告が出ないこと');

  // 3. 剤形 internal_drop ＋ 用法「１日３回朝昼夕食後　服用」 → warning 1件（内滴3件に含まれない）
  const audit3 = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ラキソベロン内用液0.75%',
      amount: '1',
      usage: '１日３回朝昼夕食後　服用',
      days: '1',
      dosageCategory: 'internal_drop'
    }
  ]);
  const mismatch3 = audit3.issues.filter((issue) => issue.code === 'usage_dosage_category_mismatch');
  assert.equal(mismatch3.length, 1, '内滴に内服の一般用法を指定した場合は警告が1件出ること');
  assert.equal(mismatch3[0].severity, 'warning');

  // 4. 剤形 external ＋ 用法「疼痛時　貼付」 → issue が出ないこと
  const audit4 = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ロキソニンテープ50mg',
      amount: '1',
      usage: '疼痛時　貼付',
      days: '14',
      dosageCategory: 'external'
    }
  ]);
  const mismatch4 = audit4.issues.filter((issue) => issue.code === 'usage_dosage_category_mismatch');
  assert.equal(mismatch4.length, 0, '外用に外服用法を指定した場合は警告が出ないこと');

  // 5. 用法未入力 → usage_dosage_category_mismatch は出ないこと（usage_missing の担当）
  const audit5 = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ロキソニンテープ50mg',
      amount: '1',
      usage: '',
      days: '14',
      dosageCategory: 'external'
    }
  ]);
  const mismatch5 = audit5.issues.filter((issue) => issue.code === 'usage_dosage_category_mismatch');
  assert.equal(mismatch5.length, 0, '用法未入力時は剤形不一致警告は出ないこと');
});

test('buildPrescriptionInputAudit flags required usage supplement omissions (G6-3)', () => {
  // 1. 「適宜　服用」（asNeededCondition: true）＋ 補足空 → warning 1件
  const audit1 = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'カロナール錠300',
      amount: '1',
      usage: '適宜　服用',
      usageSupplementText: '',
      days: '10',
      dosageCategory: 'as_needed'
    }
  ]);
  const condIssues1 = audit1.issues.filter((i) => i.code === 'usage_supplement_required_condition');
  assert.equal(condIssues1.length, 1, '「適宜　服用」で補足が空なら warning 1件 (G6-3)');
  assert.equal(condIssues1[0].severity, 'warning');

  // 補足あり → 0件
  const audit1WithSupplement = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'カロナール錠300',
      amount: '1',
      usage: '適宜　服用',
      usageSupplementText: '頭痛時または38.5度以上の発熱時',
      days: '10',
      dosageCategory: 'as_needed'
    }
  ]);
  const condIssues1WithSupp = audit1WithSupplement.issues.filter((i) => i.code === 'usage_supplement_required_condition');
  assert.equal(condIssues1WithSupp.length, 0, '「適宜　服用」に補足があれば警告は出ないこと');

  // 2. 「疼痛時　貼付」（site: 'required'）＋ 補足空 → warning 1件
  const audit2 = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ロキソニンテープ50mg',
      amount: '1',
      usage: '疼痛時　貼付',
      usageSupplementText: '',
      days: '14',
      dosageCategory: 'external'
    }
  ]);
  const siteIssues2 = audit2.issues.filter((i) => i.code === 'usage_supplement_required_site');
  assert.equal(siteIssues2.length, 1, '「疼痛時　貼付」で部位補足が空なら warning 1件 (G6-3)');
  assert.equal(siteIssues2[0].severity, 'warning');

  // 補足あり → 0件
  const audit2WithSupplement = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ロキソニンテープ50mg',
      amount: '1',
      usage: '疼痛時　貼付',
      usageSupplementText: '腰部または右肩',
      days: '14',
      dosageCategory: 'external'
    }
  ]);
  const siteIssues2WithSupp = audit2WithSupplement.issues.filter((i) => i.code === 'usage_supplement_required_site');
  assert.equal(siteIssues2WithSupp.length, 0, '「疼痛時　貼付」に部位補足があれば警告は出ないこと');
});

test('buildPrescriptionInputAudit warns on dosage_days_mismatch for non-daily dosage categories with days > 0', () => {
  // 1. 外用 ＋ days: 14 → dosage_days_mismatch が warning で 1 件出る
  const auditExternalWithDays = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      drugCode: 'd1',
      drugName: 'ロキソニンテープ50mg',
      amount: '7',
      usage: '1日1回貼付',
      days: 14,
      dosageCategory: 'external'
    }
  ]);
  const externalIssues = auditExternalWithDays.issues.filter((i) => i.code === 'dosage_days_mismatch');
  assert.equal(externalIssues.length, 1, '外用で days: 14 のとき dosage_days_mismatch が 1 件出ること');
  assert.equal(externalIssues[0].severity, 'warning', 'severity は warning であること');

  // 2. 内滴 ＋ days: 7 → 1 件出る
  const auditInternalDropWithDays = buildPrescriptionInputAudit([
    {
      id: 'i2',
      rpId: 'rp2',
      drugCode: 'd2',
      drugName: 'セレネース内用液0.2%',
      amount: '5',
      usage: '不穏時　点滴',
      days: 7,
      dosageCategory: 'internal_drop'
    }
  ]);
  const dropIssues = auditInternalDropWithDays.issues.filter((i) => i.code === 'dosage_days_mismatch');
  assert.equal(dropIssues.length, 1, '内滴で days: 7 のとき dosage_days_mismatch が 1 件出ること');
  assert.equal(dropIssues[0].severity, 'warning', 'severity は warning であること');

  // 3. 内服 ＋ days: 14 → 出ない
  const auditInternalWithDays = buildPrescriptionInputAudit([
    {
      id: 'i3',
      rpId: 'rp3',
      drugCode: 'd3',
      drugName: 'アムロジピン錠5mg',
      amount: '1',
      usage: '1日1回朝食後',
      days: 14,
      dosageCategory: 'internal'
    }
  ]);
  const internalIssues = auditInternalWithDays.issues.filter((i) => i.code === 'dosage_days_mismatch');
  assert.equal(internalIssues.length, 0, '内服で days: 14 のときは dosage_days_mismatch が出ないこと');

  // 4. 外用 ＋ days: 0 → 出ない
  const auditExternalZeroDays = buildPrescriptionInputAudit([
    {
      id: 'i4',
      rpId: 'rp4',
      drugCode: 'd4',
      drugName: 'ロキソニンテープ50mg',
      amount: '7',
      usage: '1日1回貼付',
      days: 0,
      dosageCategory: 'external'
    }
  ]);
  const zeroDaysIssues = auditExternalZeroDays.issues.filter((i) => i.code === 'dosage_days_mismatch');
  assert.equal(zeroDaysIssues.length, 0, '外用で days: 0 のときは dosage_days_mismatch が出ないこと');
});


