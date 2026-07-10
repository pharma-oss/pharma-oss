import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPickingInstruction,
  buildPickingInstructionCsv,
  buildPickingInstructionFileName,
  buildPickingResultApplyPlan,
  buildPickingResultAuditDetail,
  normalizePickingResultDate,
  parsePickingSystemResult,
  PICKING_INSTRUCTION_FORMAT_VERSION
} from './picking_system.ts';

const instructionInput = {
  visitId: 'v_test_1',
  patientName: '点検 太郎',
  patientKana: 'テンケン タロウ',
  dispensingDate: '2026-07-10',
  pharmacyName: 'テスト薬局',
  items: [
    {
      itemId: 'item_1',
      rpNumber: 1,
      drugCode: 'drug_a',
      yjCode: '2171022G1023',
      janCodes: ['4987000000011'],
      drugName: 'アムロジピンOD錠5mg「テスト」',
      totalQuantity: 14,
      usage: '1日1回朝食後',
      days: 14,
      location: 'A-01',
      stockLots: [{ lotNumber: 'LOT-A', expirationDate: '2028-12-31', quantity: 100 }]
    },
    {
      itemId: 'item_2',
      rpNumber: 2,
      drugCode: 'drug_b',
      drugName: '=注意 テープ剤',
      totalQuantity: 14,
      location: 'B-03'
    }
  ]
};

test('ピッキング指示は版数付きで、CSVに棚番地・JAN・ロット候補を含める', () => {
  const instruction = buildPickingInstruction(instructionInput, new Date('2026-07-10T09:00:00.000Z'));
  assert.strictEqual(instruction.formatVersion, PICKING_INSTRUCTION_FORMAT_VERSION);
  assert.strictEqual(instruction.items.length, 2);

  const csv = buildPickingInstructionCsv(instruction);
  const lines = csv.split('\n');
  assert.match(lines[0], /受付ID.*棚番地.*在庫ロット候補/);
  assert.match(lines[1], /"v_test_1"/);
  assert.match(lines[1], /"A-01"/);
  assert.match(lines[1], /"4987000000011"/);
  assert.match(lines[1], /"LOT-A:2028-12-31:100"/);
  // 先頭が=の薬品名は表計算式として解釈されないよう無害化する
  assert.match(lines[2], /"'=注意 テープ剤"/);

  const fileName = buildPickingInstructionFileName('v_test/1', new Date(2026, 6, 10, 9, 8, 7));
  assert.strictEqual(fileName, 'picking_instruction_v_test_1_20260710_090807.csv');
});

test('結果CSVは列名ゆれ・区切り・日付形式を吸収して読み取る', () => {
  const csv = [
    '明細ID,受付ID,結果,数量,ロット番号,有効期限,備考',
    'item_1,v_test_1,完了,14,LOT-A,2028/12/31,自動払出',
    'item_2,v_test_1,不足,,,,棚に無し'
  ].join('\r\n');
  const parsed = parsePickingSystemResult(csv);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.rows.length, 2);
  assert.strictEqual(parsed.rows[0].status, 'picked');
  assert.strictEqual(parsed.rows[0].expirationDate, '2028-12-31');
  assert.strictEqual(parsed.rows[1].status, 'shortage');

  const tsv = [
    'drug_code\tstatus\tqty\tlot',
    'drug_a\tpicked\t14\tLOT-A'
  ].join('\n');
  const parsedTsv = parsePickingSystemResult(tsv);
  assert.strictEqual(parsedTsv.ok, true);
  assert.strictEqual(parsedTsv.rows[0].drugCode, 'drug_a');

  // 状態列がなくても不足数列があれば不足として読める
  const shortageOnly = ['JANコード,不足数', '4987000000011,3'].join('\n');
  const parsedShortage = parsePickingSystemResult(shortageOnly);
  assert.strictEqual(parsedShortage.ok, true);
  assert.strictEqual(parsedShortage.rows[0].status, 'shortage');
  assert.strictEqual(parsedShortage.rows[0].shortageQuantity, 3);
});

test('結果CSVの必須列がない場合や不明な状態は取り込まない', () => {
  const noKey = parsePickingSystemResult(['数量,ロット', '14,LOT-A'].join('\n'));
  assert.strictEqual(noKey.ok, false);
  assert.match(noKey.message || '', /明細ID・薬品コード・JANコード/);

  const noStatus = parsePickingSystemResult(['明細ID,数量', 'item_1,14'].join('\n'));
  assert.strictEqual(noStatus.ok, false);

  const badStatus = parsePickingSystemResult(['明細ID,結果', 'item_1,保留'].join('\n'));
  assert.strictEqual(badStatus.ok, false);
  assert.strictEqual(badStatus.issues.length, 1);

  const badDate = parsePickingSystemResult(['明細ID,結果,有効期限', 'item_1,完了,2028-13-99'].join('\n'));
  assert.strictEqual(badDate.ok, false);
  assert.match(badDate.issues[0].message, /日付として解釈できません/);
});

test('normalizePickingResultDate は複数の日付表記をYYYY-MM-DDへそろえる', () => {
  assert.strictEqual(normalizePickingResultDate('2028-12-31'), '2028-12-31');
  assert.strictEqual(normalizePickingResultDate('2028/1/5'), '2028-01-05');
  assert.strictEqual(normalizePickingResultDate('20281231'), '2028-12-31');
  assert.strictEqual(normalizePickingResultDate('2028年12月31日'), '2028-12-31');
  assert.strictEqual(normalizePickingResultDate('2028-02-30'), undefined);
  assert.strictEqual(normalizePickingResultDate(''), undefined);
});

const targetItems = [
  {
    itemId: 'item_1',
    drugId: 'drug_a',
    stockDrugId: 'drug_a',
    yjCode: '2171022G1023',
    janCodes: ['4987000000011'],
    drugName: 'アムロジピンOD錠5mg「テスト」',
    totalQuantity: 14,
    isPicked: false
  },
  {
    itemId: 'item_2',
    drugId: 'drug_b',
    stockDrugId: 'drug_b',
    janCodes: ['4987000000028'],
    drugName: 'ロキソプロフェンNaテープ',
    totalQuantity: 14,
    isPicked: true
  }
];

test('反映計画は明細ID・薬品コード・JAN/GTINで突合し、受付違いを除外する', () => {
  const plan = buildPickingResultApplyPlan({
    visitId: 'v_test_1',
    items: targetItems,
    rows: [
      { lineNumber: 2, itemId: 'item_1', status: 'picked', quantity: 14, lotNumber: 'LOT-A', expirationDate: '2028-12-31' },
      // GTIN(14桁)でも JAN と同一視して一致する(ただし照合済みはスキップ)
      { lineNumber: 3, janCode: '04987000000028', status: 'picked' },
      { lineNumber: 4, visitId: 'v_other', itemId: 'item_1', status: 'picked' },
      { lineNumber: 5, drugCode: 'drug_unknown', status: 'picked' }
    ]
  });

  assert.strictEqual(plan.pickedCount, 1);
  assert.strictEqual(plan.updates[0].itemId, 'item_1');
  assert.strictEqual(plan.updates[0].lotNumber, 'LOT-A');
  assert.strictEqual(plan.skippedAlreadyPicked, 1);
  assert.strictEqual(plan.issues.length, 2);
  assert.match(plan.issues[0].message, /一致しません/);
  assert.strictEqual(plan.canApply, true);
});

test('数量不一致は警告、不足行は不足数つきで反映計画に入る', () => {
  const plan = buildPickingResultApplyPlan({
    visitId: 'v_test_1',
    items: [{ ...targetItems[0] }, { ...targetItems[1], isPicked: false }],
    rows: [
      { lineNumber: 2, itemId: 'item_1', status: 'picked', quantity: 10 },
      { lineNumber: 3, itemId: 'item_2', status: 'shortage', shortageQuantity: 4, note: '棚在庫切れ' },
      { lineNumber: 4, itemId: 'item_1', status: 'shortage' }
    ]
  });

  assert.strictEqual(plan.updates[0].warnings.length, 1);
  assert.match(plan.updates[0].warnings[0], /必要数量14と異なります/);
  assert.strictEqual(plan.shortageCount, 1);
  assert.strictEqual(plan.updates[1].shortageQuantity, 4);
  assert.strictEqual(plan.updates[1].note, '棚在庫切れ');
  // 不足数のない不足行は取込不可
  assert.ok(plan.issues.some((issue) => issue.lineNumber === 4));
});

test('同じ明細への二重反映を防ぎ、監査ログ要約は件数のみ', () => {
  const plan = buildPickingResultApplyPlan({
    visitId: 'v_test_1',
    items: [{ ...targetItems[0] }],
    rows: [
      { lineNumber: 2, drugCode: 'drug_a', status: 'picked' },
      { lineNumber: 3, drugCode: 'drug_a', status: 'picked' }
    ]
  });
  assert.strictEqual(plan.pickedCount, 1);
  assert.strictEqual(plan.issues.length, 1);

  const detail = buildPickingResultAuditDetail(plan);
  assert.match(detail, /外部ピッキング結果取込: 照合 1件 \/ 不足 0件/);
  assert.doesNotMatch(detail, /アムロジピン/);
  assert.doesNotMatch(detail, /太郎/);
});
