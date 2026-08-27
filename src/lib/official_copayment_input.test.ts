import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOfficialCopaymentFieldChange,
  buildOfficialCopaymentAuditDetail,
  isOfficialCopaymentChanged,
  parseOfficialCopaymentDraft,
  toOfficialCopaymentDraft
} from './official_copayment_input.ts';

// 窓口で徴収した額を記録する項目。点数×負担割合から算出してはいけない。
// 空欄は「記録しない」であって 0円ではない。

test('a blank field records nothing rather than zero', () => {
  const parsed = parseOfficialCopaymentDraft({ insuranceYen: '', publicExpenses: [] });

  assert.deepEqual(parsed, { issues: [] });
  assert.equal('insuranceCopaymentYen' in parsed, false);
});

test('zero yen collected is recorded, not treated as blank', () => {
  // 全額公費などで窓口負担が無い場合。記録した 0 と未記録は別物。
  const parsed = parseOfficialCopaymentDraft({ insuranceYen: '0', publicExpenses: [] });

  assert.equal(parsed.insuranceCopaymentYen, 0);
});

test('amounts written the way a receipt shows them are accepted', () => {
  const parsed = parseOfficialCopaymentDraft({
    insuranceYen: ' ¥1,250 ',
    publicExpenses: [{ copaymentYen: '５００', publicBenefitCopaymentYen: '' }]
  });

  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.insuranceCopaymentYen, 1250);
  assert.deepEqual(parsed.publicExpenseCopayments, [{ copaymentYen: 500 }]);
});

test('anything that is not a whole yen amount is rejected', () => {
  for (const insuranceYen of ['-1', '12.5', '1,2.5', 'abc', '１２３円たぶん']) {
    const parsed = parseOfficialCopaymentDraft({ insuranceYen, publicExpenses: [] });
    assert.equal(parsed.issues[0]?.code, 'copayment_not_a_whole_yen', `${insuranceYen} を通してはいけない`);
    assert.equal(parsed.issues[0]?.field, 'insurance');
    assert.equal(parsed.insuranceCopaymentYen, undefined);
  }
});

test('an amount wider than the official field is rejected at input, not at export', () => {
  // 公式UKEの一部負担金は8桁まで。出力時に落ちると月末に気づくことになる。
  assert.deepEqual(parseOfficialCopaymentDraft({ insuranceYen: '99999999', publicExpenses: [] }).issues, []);

  const tooWide = parseOfficialCopaymentDraft({ insuranceYen: '100000000', publicExpenses: [] });
  assert.equal(tooWide.issues[0]?.code, 'copayment_too_many_digits');

  // 先頭の 0 は桁数に数えない
  assert.equal(
    parseOfficialCopaymentDraft({ insuranceYen: '0000001250', publicExpenses: [] }).insuranceCopaymentYen,
    1250
  );
});

test('each public expense row is reported against its own field', () => {
  const parsed = parseOfficialCopaymentDraft({
    insuranceYen: '',
    publicExpenses: [
      { copaymentYen: '500', publicBenefitCopaymentYen: 'あ' },
      { copaymentYen: '-1', publicBenefitCopaymentYen: '' }
    ]
  });

  assert.deepEqual(parsed.issues.map((issue) => issue.field), ['public-0-benefit', 'public-1-copayment']);
  assert.match(parsed.issues[0].message, /公費1の公費負担額/);
  assert.match(parsed.issues[1].message, /公費2の一部負担金額/);
});

test('trailing blank public expense rows are dropped, gaps are kept', () => {
  // 並び順で公費と対応させているので、間の空欄を詰めると別の公費に付いてしまう
  const parsed = parseOfficialCopaymentDraft({
    insuranceYen: '',
    publicExpenses: [
      { copaymentYen: '', publicBenefitCopaymentYen: '' },
      { copaymentYen: '500', publicBenefitCopaymentYen: '' },
      { copaymentYen: '', publicBenefitCopaymentYen: '' }
    ]
  });

  assert.deepEqual(parsed.publicExpenseCopayments, [{}, { copaymentYen: 500 }]);
});

test('every public expense row left blank stores no array at all', () => {
  const parsed = parseOfficialCopaymentDraft({
    insuranceYen: '1250',
    publicExpenses: [
      { copaymentYen: '', publicBenefitCopaymentYen: '' },
      { copaymentYen: '', publicBenefitCopaymentYen: '' }
    ]
  });

  assert.equal('publicExpenseCopayments' in parsed, false);
});

test('stored values load back into the fields, padded to the number of public insurances', () => {
  const draft = toOfficialCopaymentDraft(
    {
      officialInsuranceCopaymentYen: 1250,
      officialPublicExpenseCopayments: [{ copaymentYen: 0 }]
    },
    2
  );

  assert.deepEqual(draft, {
    insuranceYen: '1250',
    publicExpenses: [
      { copaymentYen: '0', publicBenefitCopaymentYen: '' },
      { copaymentYen: '', publicBenefitCopaymentYen: '' }
    ]
  });
  // 0円の記録が空欄として読み戻されないこと
  assert.equal(draft.publicExpenses[0].copaymentYen, '0');
});

test('nothing recorded loads as empty fields', () => {
  assert.deepEqual(toOfficialCopaymentDraft(undefined, 1), {
    insuranceYen: '',
    publicExpenses: [{ copaymentYen: '', publicBenefitCopaymentYen: '' }]
  });
});

test('the same values are not written again', () => {
  const stored = {
    officialInsuranceCopaymentYen: 1250,
    officialPublicExpenseCopayments: [{ copaymentYen: 500 }]
  };
  const same = parseOfficialCopaymentDraft(toOfficialCopaymentDraft(stored, 1));
  assert.equal(isOfficialCopaymentChanged(stored, same), false);

  const cleared = parseOfficialCopaymentDraft({ insuranceYen: '', publicExpenses: [{ copaymentYen: '', publicBenefitCopaymentYen: '' }] });
  assert.equal(isOfficialCopaymentChanged(stored, cleared), true);
});

test('recording zero over a blank counts as a change', () => {
  const changed = isOfficialCopaymentChanged(
    {},
    parseOfficialCopaymentDraft({ insuranceYen: '0', publicExpenses: [] })
  );
  assert.equal(changed, true);
});

test('a public expense row changing only its benefit amount counts as a change', () => {
  const stored = { officialPublicExpenseCopayments: [{ copaymentYen: 500 }] };
  const next = parseOfficialCopaymentDraft({
    insuranceYen: '',
    publicExpenses: [{ copaymentYen: '500', publicBenefitCopaymentYen: '300' }]
  });

  assert.equal(isOfficialCopaymentChanged(stored, next), true);
});

test('the audit detail names both sides, including what was not recorded', () => {
  const detail = buildOfficialCopaymentAuditDetail(
    { officialInsuranceCopaymentYen: 1250, officialPublicExpenseCopayments: [{ copaymentYen: 500 }] },
    parseOfficialCopaymentDraft({
      insuranceYen: '1000',
      publicExpenses: [{ copaymentYen: '', publicBenefitCopaymentYen: '300' }]
    })
  );

  assert.match(detail, /保険 1,250円 → 1,000円/);
  assert.match(detail, /公費1 一部負担 500円 → 未記録/);
  assert.match(detail, /公費負担 未記録 → 300円/);
});

test('recording a public expense amount for the first time counts as a change', () => {
  // 記録が無い状態から1件目を入れる経路。ここを取りこぼすと保存されない。
  const changed = isOfficialCopaymentChanged(
    { officialInsuranceCopaymentYen: 1250 },
    parseOfficialCopaymentDraft({
      insuranceYen: '1250',
      publicExpenses: [{ copaymentYen: '500', publicBenefitCopaymentYen: '' }]
    })
  );

  assert.equal(changed, true);
});

test('the audit detail still shows a public expense amount that was removed', () => {
  // 消した記録こそログに残らないと、何を消したのか分からなくなる
  const detail = buildOfficialCopaymentAuditDetail(
    { officialPublicExpenseCopayments: [{ copaymentYen: 500, publicBenefitCopaymentYen: 300 }] },
    parseOfficialCopaymentDraft({
      insuranceYen: '',
      publicExpenses: [{ copaymentYen: '', publicBenefitCopaymentYen: '' }]
    })
  );

  assert.match(detail, /公費1 一部負担 500円 → 未記録/);
  assert.match(detail, /公費負担 300円 → 未記録/);
});

// --- 入力欄の振り分け -----------------------------------------------------
// 公費の欄を取り違えると、別の公費に金額が付く。件数が変わっても壊れないこと。

const twoPublicExpenses = {
  insuranceYen: '1250',
  publicExpenses: [
    { copaymentYen: '', publicBenefitCopaymentYen: '' },
    { copaymentYen: '', publicBenefitCopaymentYen: '' }
  ]
};

test('each field identifier writes to exactly the field it names', () => {
  let draft = applyOfficialCopaymentFieldChange(twoPublicExpenses, 'insurance', '900');
  draft = applyOfficialCopaymentFieldChange(draft, 'public-0-copayment', '100');
  draft = applyOfficialCopaymentFieldChange(draft, 'public-0-benefit', '200');
  draft = applyOfficialCopaymentFieldChange(draft, 'public-1-copayment', '300');
  draft = applyOfficialCopaymentFieldChange(draft, 'public-1-benefit', '400');

  assert.deepEqual(draft, {
    insuranceYen: '900',
    publicExpenses: [
      { copaymentYen: '100', publicBenefitCopaymentYen: '200' },
      { copaymentYen: '300', publicBenefitCopaymentYen: '400' }
    ]
  });
});

test('the identifiers the validator reports are the ones the fields accept', () => {
  // 指摘の issue.field と入力欄の識別子がずれると、赤枠が別の欄に出る
  const parsed = parseOfficialCopaymentDraft({
    insuranceYen: 'x',
    publicExpenses: [{ copaymentYen: 'x', publicBenefitCopaymentYen: 'x' }]
  });

  for (const issue of parsed.issues) {
    const changed = applyOfficialCopaymentFieldChange(
      { insuranceYen: '', publicExpenses: [{ copaymentYen: '', publicBenefitCopaymentYen: '' }] },
      issue.field,
      '7'
    );
    assert.equal(
      JSON.stringify(changed).includes('"7"'),
      true,
      `${issue.field} がどの欄にも当たっていない`
    );
  }
});

test('a field identifier outside the rendered rows changes nothing', () => {
  // 公費の件数が減ったあとに古い識別子で書かれても、行を作らない。
  // 同じ下書きをそのまま返すこと (別物を返すと画面が描き直される)。
  for (const field of ['public-2-copayment', 'public--1-benefit', 'public-0-total', 'nonsense', '']) {
    assert.equal(
      applyOfficialCopaymentFieldChange(twoPublicExpenses, field, '999'),
      twoPublicExpenses,
      field
    );
  }
});
