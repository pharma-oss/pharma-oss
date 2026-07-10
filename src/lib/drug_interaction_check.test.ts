import { test } from 'node:test';
import assert from 'node:assert';
import { findDrugInteractionWarnings } from './drug_interaction_check.ts';
import type { DrugInfo } from '../db/types.ts';

// PMDA公式添付文書（ガスターD錠10mg/20mg、171911_2325003F3035_2_04）の
// 「10.2 併用注意」に実在するエントリをそのまま使用する。
const famotidineInfo: DrugInfo = {
  id: 'drug_info_2325003F4031',
  drugName: 'ガスターＤ錠２０ｍｇ',
  genericName: 'ファモチジン口腔内崩壊錠２０ｍｇ',
  contraindications: [
    {
      targetDrugs: ['アゾール系抗真菌薬', 'イトラコナゾール'],
      severity: 'warning',
      clinicalEffect: '左記の薬剤の血中濃度が低下する。',
      mechanism: '本剤の胃酸分泌抑制作用が左記薬剤の経口吸収を低下させる。',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/171911_2325003F3035_2_04',
      fetchedAt: '2026-07-01T16:14:28.974Z'
    }
  ]
};

// 同じくPMDA公式添付文書（イトラコナゾールカプセル50mg、800155_6290004M1029_1_46）の
// 「10.1 併用禁忌」に実在するエントリ。
const itraconazoleInfo: DrugInfo = {
  id: 'drug_info_6290004M1010',
  drugName: 'イトラコナゾール５０ｍｇカプセル',
  genericName: 'イトラコナゾールカプセル５０ｍｇ',
  contraindications: [
    {
      targetDrugs: ['ピモジド', 'キニジン', 'ベプリジル', 'ベプリコール'],
      severity: 'danger',
      clinicalEffect: 'これらの薬剤の血中濃度上昇により、QT延長が発現する可能性がある。',
      mechanism: '本剤のCYP3A4に対する阻害作用により、これらの薬剤の代謝が阻害される。',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/800155_6290004M1029_1_46',
      fetchedAt: '2026-07-01T16:14:30.352Z'
    }
  ]
};

test('findDrugInteractionWarnings matches a real official-label warning entry against the actually prescribed drug', () => {
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[famotidineInfo.drugName, [famotidineInfo]]]);

  const result = findDrugInteractionWarnings(
    [
      { itemId: 'i1', drugId: 'd1', drugName: famotidineInfo.drugName, genericName: famotidineInfo.genericName },
      { itemId: 'i2', drugId: 'd2', drugName: 'イトラコナゾール５０ｍｇカプセル', genericName: 'イトラコナゾールカプセル５０ｍｇ' }
    ],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0].severity, 'warning');
  assert.strictEqual(result.warnings[0].drug1, famotidineInfo.drugName);
  assert.strictEqual(result.warnings[0].drug2, 'イトラコナゾール５０ｍｇカプセル');
  assert.strictEqual(result.warnings[0].sourceUrl, famotidineInfo.contraindications![0].sourceUrl);
});

test('findDrugInteractionWarnings does not warn when no interacting partner is actually prescribed', () => {
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[famotidineInfo.drugName, [famotidineInfo]]]);

  const result = findDrugInteractionWarnings(
    [{ itemId: 'i1', drugId: 'd1', drugName: famotidineInfo.drugName, genericName: famotidineInfo.genericName }],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 0);
});

test('findDrugInteractionWarnings surfaces a real 併用禁忌 (danger) row and matches on the brand name candidate too', () => {
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[itraconazoleInfo.drugName, [itraconazoleInfo]]]);

  const result = findDrugInteractionWarnings(
    [
      { itemId: 'i1', drugId: 'd1', drugName: itraconazoleInfo.drugName, genericName: itraconazoleInfo.genericName },
      { itemId: 'i2', drugId: 'd2', drugName: 'ベプリコール錠１００ｍｇ', genericName: 'ベプリジル塩酸塩水和物錠１００ｍｇ' }
    ],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0].severity, 'danger');
  assert.strictEqual(result.warnings[0].drug2, 'ベプリコール錠１００ｍｇ');
});

test('findDrugInteractionWarnings does not warn about a drug interacting with itself', () => {
  // Contrived: this drug's own generic name happens to match its own listed target.
  // A prescription containing only this one drug must not raise a self-interaction warning.
  const selfInteracting: DrugInfo = {
    id: 'drug_info_self',
    drugName: 'サンプル薬Ａ',
    genericName: 'ジゴキシン',
    contraindications: [{
      targetDrugs: ['ジゴキシン'],
      severity: 'warning',
      clinicalEffect: 'test',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/test',
      fetchedAt: '2026-07-01T00:00:00.000Z'
    }]
  };
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[selfInteracting.drugName, [selfInteracting]]]);

  const result = findDrugInteractionWarnings(
    [{ itemId: 'i1', drugId: 'd1', drugName: selfInteracting.drugName, genericName: selfInteracting.genericName }],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 0);
});
