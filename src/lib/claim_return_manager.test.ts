import { test } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_CLAIM_RETURN_REASON_CODE,
  OFFICIAL_CLAIM_RETURN_REASONS,
  buildReturnCorrectionSummary,
  formatClaimReturnReasonLabel,
  getClaimReturnReasonByCode,
  inferClaimReturnReasonCode
} from './claim_return_manager.ts';

test('OFFICIAL_CLAIM_RETURN_REASONS contains standard return codes', () => {
  assert.ok(OFFICIAL_CLAIM_RETURN_REASONS.length >= 5);
  const r01 = getClaimReturnReasonByCode('R01');
  assert.ok(r01);
  assert.strictEqual(r01.title, '保険資格失効・変更');
  assert.strictEqual(r01.category, 'insurance');
});

test('buildReturnCorrectionSummary formats correction memo and audit log correctly', () => {
  const summary = buildReturnCorrectionSummary({
    reasonCode: 'R02',
    customNote: '枝番01を追記',
    operatorName: '薬剤師A'
  });

  assert.strictEqual(summary.reason.code, 'R02');
  assert.ok(summary.formattedMemo.includes('【返戻修正 [R02: 被保険者記号・番号誤り]】'));
  assert.ok(summary.formattedMemo.includes('枝番01を追記'));
  assert.ok(summary.auditDetails.includes('対応者: 薬剤師A'));
});

test('inferClaimReturnReasonCode maps free-text acceptance reasons to codes', () => {
  // オンライン請求受付結果の返戻事由は施設ごとに文言が揺れる。
  // 集計は患者情報を含まないコードで行うため、ここで寄せる。
  assert.strictEqual(inferClaimReturnReasonCode('保険資格が失効しています'), 'R01');
  assert.strictEqual(inferClaimReturnReasonCode('保険者番号不一致'), 'R01');
  assert.strictEqual(inferClaimReturnReasonCode('記号・番号誤り'), 'R02');
  assert.strictEqual(inferClaimReturnReasonCode('枝番未入力'), 'R02');
  assert.strictEqual(inferClaimReturnReasonCode('公費受給者番号が一致しません'), 'R03');
  assert.strictEqual(inferClaimReturnReasonCode('特定薬剤管理指導加算の算定要件不備'), 'R04');
  assert.strictEqual(inferClaimReturnReasonCode('処方箋の用法と相違'), 'R05');
});

test('inferClaimReturnReasonCode resolves overlapping wording by fixed priority', () => {
  // 「公費負担者番号」は「負担者番号」を、「被保険者番号」は「保険者番号」を含む。
  // 判定順を固定していないと取り違えるため、その順序を固定する。
  assert.strictEqual(inferClaimReturnReasonCode('公費負担者番号の誤り'), 'R03');
  assert.strictEqual(inferClaimReturnReasonCode('被保険者番号の桁数誤り'), 'R02');
  assert.strictEqual(inferClaimReturnReasonCode('公費と保険の記号番号が両方相違'), 'R03');
});

test('inferClaimReturnReasonCode falls back to R99 instead of guessing', () => {
  // 取り違えるより「その他（審査機関照会）」へ落とす。
  assert.strictEqual(inferClaimReturnReasonCode(''), DEFAULT_CLAIM_RETURN_REASON_CODE);
  assert.strictEqual(inferClaimReturnReasonCode(undefined), DEFAULT_CLAIM_RETURN_REASON_CODE);
  assert.strictEqual(inferClaimReturnReasonCode('   '), DEFAULT_CLAIM_RETURN_REASON_CODE);
  assert.strictEqual(inferClaimReturnReasonCode('審査支払機関からの照会'), DEFAULT_CLAIM_RETURN_REASON_CODE);
  assert.strictEqual(getClaimReturnReasonByCode(DEFAULT_CLAIM_RETURN_REASON_CODE)?.category, 'other');
});

test('every return reason except the fallback can be inferred from its own keywords', () => {
  for (const reason of OFFICIAL_CLAIM_RETURN_REASONS) {
    if (reason.code === DEFAULT_CLAIM_RETURN_REASON_CODE) {
      assert.deepStrictEqual(reason.matchKeywords, [], 'その他は語で引き当てない');
      continue;
    }
    assert.ok(reason.matchKeywords.length > 0, `${reason.code} に照合語がありません`);
  }
});

test('formatClaimReturnReasonLabel gives one label for the screen and the audit log', () => {
  assert.strictEqual(formatClaimReturnReasonLabel('R03'), 'R03 公費負担者・受給者番号不一致');
  // 未知のコードでも落とさない (外部取込で想定外の値が来ても表示は続ける)
  assert.strictEqual(formatClaimReturnReasonLabel('X99'), 'X99');
});
