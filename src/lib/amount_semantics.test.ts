import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDailyAmountItem, type AmountSemanticsItem } from './amount_semantics';
import { calculateDispensingFees, type ItemWithPrice } from './calculator.ts';
import type { FacilitySettings, Patient } from '../db/types.ts';

const mockSettings: FacilitySettings = {
  id: 'test-settings',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none',
  genericDispensingReduction: false
};

const mockPatient: Patient = {
  patientId: 'test-patient',
  name: 'テスト 患者',
  kana: 'テスト カンジャ',
  birthDate: '1980-01-01'
};

test('isDailyAmountItem classifies typical domain cases correctly via table driven tests', () => {
  const cases: { item: AmountSemanticsItem; expected: boolean; description: string }[] = [
    {
      description: '小児用シロップ (内服, days > 0) は 1日量',
      item: { days: 3, usage: '1日3回毎食後', dosageCategory: 'internal' },
      expected: true
    },
    {
      description: '錠剤 (内服, カテゴリ未設定だが用法内服, days > 0) は 1日量',
      item: { days: 14, usage: '1日2回朝夕食後' },
      expected: true
    },
    {
      description: 'モーラステープ (外用, days > 0) は 全量 (dosageCategory: external)',
      item: { days: 14, usage: '1日1回貼付', dosageCategory: 'external' },
      expected: false
    },
    {
      description: '外用薬 (用法に外用行為語なし, dosageCategory: external, days > 0) は 全量',
      item: { days: 14, usage: '1日1回', dosageCategory: 'external' },
      expected: false
    },
    {
      description: '軟膏 (外用, カテゴリ未設定だが用法塗布, days > 0) は 全量',
      item: { days: 7, usage: '1日2回患部に塗布' },
      expected: false
    },
    {
      description: 'ラキソベロン内用液 (内滴, days > 0) は 全量 (dosageCategory: internal_drop)',
      item: { days: 7, usage: '1日1回10滴', dosageCategory: 'internal_drop' },
      expected: false
    },
    {
      description: 'ラキソベロン内用液 (内滴, 用法に「内滴」あり) は 全量',
      item: { days: 7, usage: '就寝前10滴 内滴' },
      expected: false
    },
    {
      description: '静脈内注射 (注射) は 全量',
      item: { days: 1, usage: '静脈内注射', dosageCategory: 'injection' },
      expected: false
    },
    {
      description: '静脈内注射 (カテゴリ未設定だが用法に「注射」あり) は 全量',
      item: { days: 1, usage: '静脈内注射' },
      expected: false
    },
    {
      description: '解熱鎮痛剤 (頓服) は 全量',
      item: { days: 5, usage: '頭痛時頓服', dosageCategory: 'as_needed' },
      expected: false
    },
    {
      description: '日数未設定 (days: undefined) は システム規約通り 全量',
      item: { days: undefined, usage: '1日3回毎食後' },
      expected: false
    },
    {
      description: '日数ゼロ (days: 0) は システム規約通り 全量',
      item: { days: 0, usage: '外用1', dosageCategory: 'external' },
      expected: false
    }
  ];

  for (const c of cases) {
    assert.equal(
      isDailyAmountItem(c.item),
      c.expected,
      `Failed case: ${c.description}`
    );
  }
});

test('amount semantics and calculator agreement for tape with days (PR-E8)', () => {
  // モーラステープ days: 14 「1日1回患部に貼る」:
  // 帳票側（amount_semantics）: 外用全量（isDailyAmountItem === false）と判定。
  // 算定側（calculator.ts calculateDispensingFees）: 外用薬（薬剤調製料 10点、調剤管理料2）として算定。
  // 帳票側と算定側の判定が一致し、内服として誤算定・誤印字されない契約を本物の関数同士で担保する。
  const tapeItem: ItemWithPrice = {
    itemId: 'tape-1',
    visitId: 'v-1',
    drugId: 'drug-tape',
    drugName: 'モーラステープ20mg',
    amount: 14,
    days: 14,
    unitText: '枚',
    usage: '1日1回患部に貼る',
    dosageCategory: 'external',
    dosageCategorySource: 'auto',
    drugPrice: 30
  };

  // 帳票側の検証: 外用全量
  const printIsDaily = isDailyAmountItem(tapeItem);
  assert.equal(printIsDaily, false, '帳票側は外用全量（isDailyAmountItem === false）と判定すること');

  // 算定側の実地検証: 本物の calculateDispensingFees を実行
  const results = calculateDispensingFees(mockSettings, [tapeItem], mockPatient, '2024-01-01');
  const prepFee = results.find((r) => r.code === 'drug_preparation');
  assert.ok(prepFee, '薬剤調製料が算定されること');
  assert.equal(
    prepFee.points,
    10,
    '算定側は外用調製料（10点）として算定し、内服調製料（24点）としないこと'
  );

  const mgmtFee = results.find((r) => r.code === 'dispensing_management');
  assert.ok(mgmtFee, '調剤管理料が算定されること');
  assert.ok(
    mgmtFee.rationale?.includes('内服薬以外'),
    '算定側も内服薬以外（調剤管理料2）として扱うこと'
  );
});

test('amount semantics infers dosage category when dosageCategory is undefined (PR-E2)', async () => {
  const { getAmountLabel, getTotalAmountText } = await import('../app/print/helpers');

  // テープ剤 (dosageCategory 未設定) -> 全量, 14 枚 (196 枚に膨張しないこと)
  const tapeItem = {
    drugName: 'モーラステープ20mg',
    usage: '1日1回患部に貼る',
    amount: 14,
    days: 14,
    unitText: '枚'
  };
  assert.equal(isDailyAmountItem(tapeItem), false);
  assert.equal(getAmountLabel(tapeItem), '全量');
  assert.equal(getTotalAmountText(tapeItem), '14 枚');

  // 点眼液 (dosageCategory 未設定) -> 全量 3 mL (90 mL に膨張しないこと)
  const eyeDropItem = {
    drugName: 'ヒアレイン点眼液0.1%',
    usage: '1日5回両眼に1滴ずつ',
    amount: 3,
    days: 30,
    unitText: 'mL'
  };
  assert.equal(isDailyAmountItem(eyeDropItem), false);
  assert.equal(getAmountLabel(eyeDropItem), '全量');
  assert.equal(getTotalAmountText(eyeDropItem), '3 mL');

  // 内服の回帰 (dosageCategory 未設定) -> 1日量, 28 錠
  const internalItem = {
    drugName: 'アムロジピン錠5mg',
    usage: '1日1回朝食後',
    amount: 1,
    days: 28,
    unitText: '錠'
  };
  assert.equal(isDailyAmountItem(internalItem), true);
  assert.equal(getAmountLabel(internalItem), '1日量');
  assert.equal(getTotalAmountText(internalItem), '28 錠');
});

test('amount semantics restores usage-based external override for legacy records (PR-E7)', async () => {
  const { getAmountLabel, getTotalAmountText } = await import('../app/print/helpers');

  // 耳科用液 (PR-E1以前に保存され dosageCategory: 'internal', dosageCategorySource: 'auto' となったレガシー明細)
  // -> 全量, 5 mL (70 mL に14倍過大表示されないこと)
  const legacyEarDropItem = {
    drugName: 'タリビッド耳科用液',
    usage: '1日2回点耳',
    amount: 5,
    days: 14,
    unitText: 'mL',
    dosageCategory: 'internal' as const,
    dosageCategorySource: 'auto' as const
  };
  assert.equal(isDailyAmountItem(legacyEarDropItem), false);
  assert.equal(getAmountLabel(legacyEarDropItem), '全量');
  assert.equal(getTotalAmountText(legacyEarDropItem), '5 mL');

  // 手動指定 (dosageCategorySource === 'manual') は最優先で尊重されること
  const manualOverrideItem = {
    drugName: 'ヒアレイン点眼液0.1%',
    usage: '1日5回点眼',
    amount: 1,
    days: 14,
    unitText: '本',
    dosageCategory: 'internal' as const,
    dosageCategorySource: 'manual' as const
  };
  assert.equal(isDailyAmountItem(manualOverrideItem), true);
  assert.equal(getAmountLabel(manualOverrideItem), '1日量');
  assert.equal(getTotalAmountText(manualOverrideItem), '14 本');

  // 内服の回帰 (アムロジピン 1錠/28日) -> 1日量, 28 錠
  const internalItem = {
    drugName: 'アムロジピン錠5mg',
    usage: '1日1回朝食後',
    amount: 1,
    days: 28,
    unitText: '錠',
    dosageCategory: 'internal' as const,
    dosageCategorySource: 'auto' as const
  };
  assert.equal(isDailyAmountItem(internalItem), true);
  assert.equal(getAmountLabel(internalItem), '1日量');
  assert.equal(getTotalAmountText(internalItem), '28 錠');
});

