import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildContraindicatedConditionPatientTexts,
  findContraindicatedConditionWarnings
} from './drug_contraindicated_condition_check.ts';
import type { Alert, DrugInfo, VisitInitialQuestionnaire } from '../db/types.ts';

// PMDA公式添付文書（ベシケア錠、ソリフェナシン、800126_2590011F1028_1_12）
// 「2. 禁忌」章に実在するエントリをそのまま使用する。
const solifenacinInfo: DrugInfo = {
  id: 'drug_info_2590011F1028',
  drugName: 'ベシケア錠５ｍｇ',
  genericName: 'コハク酸ソリフェナシン錠５ｍｇ',
  contraindicatedConditions: [
    {
      conditionText: '閉塞隅角緑内障の患者',
      reason: '抗コリン作用により眼圧が上昇し、症状が悪化するおそれがある。',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/800126_2590011F1028_1_12',
      fetchedAt: '2026-07-02T00:00:00.000Z'
    },
    {
      conditionText: '重度の肝機能障害患者（Child-Pugh分類C）',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/800126_2590011F1028_1_12',
      fetchedAt: '2026-07-02T00:00:00.000Z'
    }
  ]
};

test('findContraindicatedConditionWarnings matches a short patient alert (緑内障) against the verbose official condition text', () => {
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[solifenacinInfo.drugName, [solifenacinInfo]]]);

  const result = findContraindicatedConditionWarnings(
    [{ itemId: 'i1', drugId: 'd1', drugName: solifenacinInfo.drugName }],
    ['緑内障'],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0].drug, solifenacinInfo.drugName);
  assert.strictEqual(result.warnings[0].conditionText, '閉塞隅角緑内障の患者');
  assert.strictEqual(result.warnings[0].matchedPatientCondition, '緑内障');
  assert.match(result.warnings[0].reason || '', /眼圧が上昇/);
});

test('findContraindicatedConditionWarnings does not warn when the patient has no matching condition', () => {
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[solifenacinInfo.drugName, [solifenacinInfo]]]);

  const result = findContraindicatedConditionWarnings(
    [{ itemId: 'i1', drugId: 'd1', drugName: solifenacinInfo.drugName }],
    ['糖尿病'],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 0);
});

test('findContraindicatedConditionWarnings matches when the patient record uses a bare code contained in the verbose official text', () => {
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[solifenacinInfo.drugName, [solifenacinInfo]]]);

  const result = findContraindicatedConditionWarnings(
    [{ itemId: 'i1', drugId: 'd1', drugName: solifenacinInfo.drugName }],
    ['Child-Pugh分類C'],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0].conditionText, '重度の肝機能障害患者（Child-Pugh分類C）');
});

test('findContraindicatedConditionWarnings ignores very short/generic tokens to avoid over-matching', () => {
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[solifenacinInfo.drugName, [solifenacinInfo]]]);

  const result = findContraindicatedConditionWarnings(
    [{ itemId: 'i1', drugId: 'd1', drugName: solifenacinInfo.drugName }],
    ['他'],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 0);
});

test('buildContraindicatedConditionPatientTexts collects active disease alerts and questionnaire conditions, excluding negative answers', () => {
  const alerts: Alert[] = [
    { alertId: 'a1', patientId: 'p1', type: 'chronic_disease', content: '緑内障', status: 'active' },
    { alertId: 'a2', patientId: 'p1', type: 'chronic_disease', content: '喘息', status: 'resolved' },
    { alertId: 'a3', patientId: 'p1', type: 'allergy', content: 'ペニシリン', status: 'active' }
  ];
  const initialQuestionnaire: VisitInitialQuestionnaire = {
    sourceType: 'manual',
    capturedAt: '2026-07-02T00:00:00.000Z',
    medicalHistory: '肝機能障害、なし',
    currentSymptoms: '尿閉',
    pregnancyLactation: '該当なし'
  };

  const texts = buildContraindicatedConditionPatientTexts({ alerts, initialQuestionnaire });

  assert.ok(texts.includes('緑内障'));
  assert.ok(texts.includes('肝機能障害'));
  assert.ok(texts.includes('肝臓に障害'));
  assert.ok(texts.includes('尿閉'));
  assert.ok(!texts.includes('喘息'));
  assert.ok(!texts.includes('ペニシリン'));
  assert.ok(!texts.includes('該当なし'));
});

test('findContraindicatedConditionWarnings matches pregnancy wording from a short questionnaire answer', () => {
  const pregnancyInfo: DrugInfo = {
    id: 'drug_info_pregnancy',
    drugName: '妊婦禁忌サンプル薬',
    contraindicatedConditions: [
      {
        conditionText: '妊婦又は妊娠している可能性のある女性',
        sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/sample',
        fetchedAt: '2026-07-02T00:00:00.000Z'
      }
    ]
  };
  const drugInfoByDrugName = new Map<string, DrugInfo[]>([[pregnancyInfo.drugName, [pregnancyInfo]]]);

  const result = findContraindicatedConditionWarnings(
    [{ itemId: 'i1', drugId: 'd1', drugName: pregnancyInfo.drugName }],
    ['妊娠中'],
    drugInfoByDrugName
  );

  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0].matchedPatientCondition, '妊娠中');
});
