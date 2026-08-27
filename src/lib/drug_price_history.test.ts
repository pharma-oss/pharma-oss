import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRUG_PRICE_BEFORE_HISTORY_VALUE,
  appendDrugPriceRevision,
  drugPriceOverrideValue,
  formatDrugPriceRevisionLabel,
  seedDrugPriceBeforeHistory,
  toDrugPriceOverride,
  formatDrugPriceOverrideWarning,
  isDrugPriceOverridden,
  isDrugPriceRevisionNeeded,
  listDrugPriceRevisionChoices,
  resolveDrugPrice,
  resolveDrugPriceOn,
  resolveDrugPriceWithOverride,
  type DrugPriceRevision
} from './drug_price_history.ts';

// レセプトは「調剤日時点の薬価」で計算する。
// マスターの現在薬価だけで計算すると、改定後にマスターを取り込んだ時点で
// 過去の調剤分まで新薬価になってしまう。境界（改定日当日）を固定する。

const history: DrugPriceRevision[] = [
  { price: 12.3, effectiveFrom: '2024-04-01' },
  { price: 10.9, effectiveFrom: '2026-04-01' }
];

test('the revision date itself already uses the new price', () => {
  // 改定日当日から新薬価。前日は旧薬価。
  assert.deepEqual(
    resolveDrugPrice({ priceHistory: history }, '2026-03-31'),
    { price: 12.3, source: 'history', effectiveFrom: '2024-04-01' }
  );
  assert.deepEqual(
    resolveDrugPrice({ priceHistory: history }, '2026-04-01'),
    { price: 10.9, source: 'history', effectiveFrom: '2026-04-01' }
  );
  assert.deepEqual(
    resolveDrugPrice({ priceHistory: history }, '2026-04-02'),
    { price: 10.9, source: 'history', effectiveFrom: '2026-04-01' }
  );
});

test('an ISO dispensing date uses its leading calendar date as written', () => {
  // visit.dispensingDate は店舗の暦日として保存されている。
  // 先頭の YYYY-MM-DD をそのまま採り、時刻やオフセットで日付を動かさない。
  assert.equal(resolveDrugPriceOn({ priceHistory: history }, '2026-04-01T08:00:00+09:00'), 10.9);
  assert.equal(resolveDrugPriceOn({ priceHistory: history }, '2026-04-01T00:30:00.000Z'), 10.9);
  assert.equal(resolveDrugPriceOn({ priceHistory: history }, '2026-03-31T23:30:00+09:00'), 12.3);
});

test('a non-ISO dispensing date is read in store-local time', () => {
  // ISO 以外の表記は Date で解釈する。ここで UTC へ寄せると、
  // 改定日当日の朝の調剤が前日扱いになり旧薬価が当たってしまう
  // (JST 08:00 は UTC では前日 23:00)。
  assert.equal(resolveDrugPriceOn({ priceHistory: history }, '2026/04/01 08:00:00'), 10.9);
  assert.equal(resolveDrugPriceOn({ priceHistory: history }, '2026/04/01 00:30:00'), 10.9);
  assert.equal(resolveDrugPriceOn({ priceHistory: history }, '2026/03/31 23:30:00'), 12.3);
});

test('a drug without history falls back to the current price and says so', () => {
  assert.deepEqual(
    resolveDrugPrice({ price: 15.2 }, '2026-06-14'),
    { price: 15.2, source: 'current' }
  );
  assert.deepEqual(resolveDrugPrice({}, '2026-06-14'), { source: 'unknown' });
});

test('a dispensing date before the first revision is marked, not silently guessed', () => {
  // 履歴を持ち始める前の調剤。最も古い既知の薬価で代用するが、根拠を残す。
  assert.deepEqual(
    resolveDrugPrice({ price: 10.9, priceHistory: history }, '2020-01-01'),
    { price: 12.3, source: 'earliest_known', effectiveFrom: '2024-04-01' }
  );
});

test('an unreadable dispensing date resolves to unknown instead of the latest price', () => {
  // ここで最新版を当てると、改定後に過去分の点数が動く。
  assert.deepEqual(resolveDrugPrice({ price: 10.9, priceHistory: history }, ''), { source: 'unknown' });
  assert.deepEqual(resolveDrugPrice({ priceHistory: history }, 'not-a-date'), { source: 'unknown' });
});

test('appendDrugPriceRevision keeps the history sorted by effective date', () => {
  const appended = appendDrugPriceRevision(
    [{ price: 10.9, effectiveFrom: '2026-04-01' }],
    { price: 12.3, effectiveFrom: '2024-04-01' }
  );
  assert.deepEqual(appended, [
    { price: 12.3, effectiveFrom: '2024-04-01' },
    { price: 10.9, effectiveFrom: '2026-04-01' }
  ]);
});

test('re-importing the same effective date replaces that revision', () => {
  // 取り込み直しで版が二重にならないこと
  const corrected = appendDrugPriceRevision(history, { price: 11.4, effectiveFrom: '2026-04-01' });
  assert.deepEqual(corrected, [
    { price: 12.3, effectiveFrom: '2024-04-01' },
    { price: 11.4, effectiveFrom: '2026-04-01' }
  ]);
});

test('correcting a revision back to the previous price removes that revision', () => {
  // 「2026-04-01 の改定でこの薬品の薬価は動かなかった」という訂正が来た場合。
  // 同日の版を差し替えたうえで、直前と同額になった版は履歴から消えること。
  const corrected = appendDrugPriceRevision(history, { price: 12.3, effectiveFrom: '2026-04-01' });
  assert.deepEqual(corrected, [{ price: 12.3, effectiveFrom: '2024-04-01' }]);
  assert.equal(resolveDrugPriceOn({ priceHistory: corrected }, '2026-06-01'), 12.3);
});

test('re-importing an unchanged price does not grow the history', () => {
  // マスター取込は毎月走る。値が同じなら版を増やさない。
  const unchanged = appendDrugPriceRevision(history, { price: 10.9, effectiveFrom: '2026-06-01' });
  assert.deepEqual(unchanged, history);
});

test('appendDrugPriceRevision ignores unusable input', () => {
  assert.deepEqual(
    appendDrugPriceRevision(history, { price: Number.NaN, effectiveFrom: '2026-06-01' }),
    history
  );
  assert.deepEqual(
    appendDrugPriceRevision(history, { price: 10, effectiveFrom: 'not-a-date' }),
    history
  );
  assert.deepEqual(appendDrugPriceRevision(undefined, { price: 10, effectiveFrom: '2026-04-01' }), [
    { price: 10, effectiveFrom: '2026-04-01' }
  ]);
});

test('isDrugPriceRevisionNeeded only fires when the price actually changed', () => {
  assert.equal(isDrugPriceRevisionNeeded({ priceHistory: history }, 10.9, '2026-06-01'), false);
  assert.equal(isDrugPriceRevisionNeeded({ priceHistory: history }, 9.8, '2026-06-01'), true);
  // 履歴が無く現在薬価と同じなら、版を作らない
  assert.equal(isDrugPriceRevisionNeeded({ price: 12.3 }, 12.3, '2026-06-01'), false);
  assert.equal(isDrugPriceRevisionNeeded({ price: 12.3 }, 11.1, '2026-06-01'), true);
  // 薬価が無いマスター行では版を作らない
  assert.equal(isDrugPriceRevisionNeeded({ price: 12.3 }, undefined, '2026-06-01'), false);
});

test('a back-filled revision is recorded even when it matches the extrapolated price', () => {
  // 遡り取込。履歴より前の日付で引いた薬価は最古版で代用した推定値でしかないので、
  // 一致しても「変わっていない」の根拠にならない。マスターが持ってきた事実を版にする。
  const known = [{ price: 10.9, effectiveFrom: '2026-04-01' }];
  assert.equal(
    resolveDrugPrice({ price: 10.9, priceHistory: known }, '2024-04-01').source,
    'earliest_known'
  );
  assert.equal(isDrugPriceRevisionNeeded({ price: 10.9, priceHistory: known }, 10.9, '2024-04-01'), true);
  // 当時の薬価が違っていた場合も当然積む
  assert.equal(isDrugPriceRevisionNeeded({ price: 10.9, priceHistory: known }, 12.3, '2024-04-01'), true);
});

test('back-filling absorbs a later revision that only repeats the same price', () => {
  // 「実は 2024-04-01 から 10.9 だった」と分かったら、2026-04-01 の版は
  // 薬価が変わっていない版になるので畳む。畳まないと選択 UI に同額が二つ並ぶ。
  const absorbed = appendDrugPriceRevision(
    [{ price: 10.9, effectiveFrom: '2026-04-01' }],
    { price: 10.9, effectiveFrom: '2024-04-01' }
  );
  assert.deepEqual(absorbed, [{ price: 10.9, effectiveFrom: '2024-04-01' }]);
  // 畳めるのは直後の版が同額のときだけ。薬価が変わっている版は残す。
  const kept = appendDrugPriceRevision(
    [{ price: 10.9, effectiveFrom: '2026-04-01' }],
    { price: 12.3, effectiveFrom: '2024-04-01' }
  );
  assert.deepEqual(kept, [
    { price: 12.3, effectiveFrom: '2024-04-01' },
    { price: 10.9, effectiveFrom: '2026-04-01' }
  ]);
});

test('back-filling the same master twice does not grow the history', () => {
  // 遡り取込をやり直しても版が積み上がらないこと
  const drug = { price: 10.9, priceHistory: [{ price: 10.9, effectiveFrom: '2026-04-01' }] };
  const first = appendDrugPriceRevision(drug.priceHistory, { price: 10.9, effectiveFrom: '2024-04-01' });
  assert.equal(isDrugPriceRevisionNeeded({ price: drug.price, priceHistory: first }, 10.9, '2024-04-01'), false);

  // 遡り取込のあと、その期間の調剤は推定ではなく記録として引ける
  assert.deepEqual(
    resolveDrugPrice({ price: 10.9, priceHistory: first }, '2025-01-01'),
    { price: 10.9, source: 'history', effectiveFrom: '2024-04-01' }
  );
});


// --- 開始日不明の版 -------------------------------------------------------
// マスターの現在薬価には適用開始日が付いてこない。履歴が空のまま最初の改定を
// 積むと旧薬価がどこにも残らず、改定前の調剤が新薬価で算定されてしまう。

const withUnknownStart: DrugPriceRevision[] = [
  { price: 12.3 },
  { price: 10.9, effectiveFrom: '2026-04-01' }
];

test('a revision with no effective date stands for the price before the first revision', () => {
  // 改定日以降は記録どおり
  assert.deepEqual(
    resolveDrugPrice({ priceHistory: withUnknownStart }, '2026-04-01'),
    { price: 10.9, source: 'history', effectiveFrom: '2026-04-01' }
  );
  // 改定日より前は旧薬価。ただし「いつから」は分からないので推定のまま返す
  assert.deepEqual(
    resolveDrugPrice({ priceHistory: withUnknownStart }, '2026-03-31'),
    { price: 12.3, source: 'earliest_known' }
  );
});

test('the first recorded revision no longer drops the price that came before it', () => {
  // これが無いと、改定を取り込んだ時点で改定前の調剤まで新薬価になる。
  const seeded = seedDrugPriceBeforeHistory(undefined, 12.3);
  const afterImport = appendDrugPriceRevision(seeded, { price: 10.9, effectiveFrom: '2026-04-01' });

  assert.deepEqual(afterImport, [{ price: 12.3 }, { price: 10.9, effectiveFrom: '2026-04-01' }]);
  assert.equal(resolveDrugPriceOn({ price: 10.9, priceHistory: afterImport }, '2026-03-31'), 12.3);
  assert.equal(resolveDrugPriceOn({ price: 10.9, priceHistory: afterImport }, '2026-04-01'), 10.9);
});

test('seedDrugPriceBeforeHistory only fills an empty history', () => {
  assert.deepEqual(seedDrugPriceBeforeHistory(undefined, 12.3), [{ price: 12.3 }]);
  assert.deepEqual(seedDrugPriceBeforeHistory([], 12.3), [{ price: 12.3 }]);
  // 既に版があるなら現在薬価は最新の版として記録済み。触らない。
  assert.deepEqual(seedDrugPriceBeforeHistory(history, 10.9), history);
  // 薬価が分からないマスター行では何も置かない
  assert.deepEqual(seedDrugPriceBeforeHistory(undefined, undefined), []);
  assert.deepEqual(seedDrugPriceBeforeHistory(undefined, Number.NaN), []);
});

test('learning when the unknown start began replaces it instead of duplicating it', () => {
  // 開始日不明の 12.3 に「12.3 は 2024-04-01 から」が来たら、開始日が判明したということ
  assert.deepEqual(
    appendDrugPriceRevision([{ price: 12.3 }], { price: 12.3, effectiveFrom: '2024-04-01' }),
    [{ price: 12.3, effectiveFrom: '2024-04-01' }]
  );
  // 薬価が違うなら、開始日不明の版はより古い薬価として残る
  assert.deepEqual(
    appendDrugPriceRevision([{ price: 12.3 }], { price: 10.9, effectiveFrom: '2026-04-01' }),
    [{ price: 12.3 }, { price: 10.9, effectiveFrom: '2026-04-01' }]
  );
});

test('the unknown start stays the oldest revision however imports arrive', () => {
  let built = seedDrugPriceBeforeHistory(undefined, 13.8);
  built = appendDrugPriceRevision(built, { price: 10.9, effectiveFrom: '2026-04-01' });
  built = appendDrugPriceRevision(built, { price: 12.3, effectiveFrom: '2024-04-01' });

  assert.deepEqual(built, [
    { price: 13.8 },
    { price: 12.3, effectiveFrom: '2024-04-01' },
    { price: 10.9, effectiveFrom: '2026-04-01' }
  ]);
  assert.equal(resolveDrugPriceOn({ priceHistory: built }, '2023-06-14'), 13.8);
  assert.equal(resolveDrugPriceOn({ priceHistory: built }, '2025-06-14'), 12.3);
});

test('a revision with a broken date is dropped, not read as an unknown start', () => {
  // 項目が無い（開始日不明）のと、値が壊れているのは別物
  const messy = [
    { price: 9.9, effectiveFrom: 'not-a-date' },
    { price: 10.9, effectiveFrom: '2026-04-01' }
  ] as DrugPriceRevision[];
  assert.deepEqual(
    resolveDrugPrice({ priceHistory: messy }, '2020-01-01'),
    { price: 10.9, source: 'earliest_known', effectiveFrom: '2026-04-01' }
  );
});

test('only the first unknown start is kept when the data holds several', () => {
  // 二つ以上あっても先後を決められないので、最初の一つしか採らない
  const broken = [{ price: 13.8 }, { price: 12.3 }] as DrugPriceRevision[];
  assert.deepEqual(
    listDrugPriceRevisionChoices({ priceHistory: broken }, '2026-06-01'),
    [{ value: DRUG_PRICE_BEFORE_HISTORY_VALUE, price: 13.8, isAutoSelected: true }]
  );
});

test('the picker carries the unknown start on a reserved value, not an empty one', () => {
  // 空文字は「調剤日時点（自動）」に使われているので、開始日不明の版には使えない
  assert.deepEqual(listDrugPriceRevisionChoices({ priceHistory: withUnknownStart }, '2026-03-31'), [
    { value: '2026-04-01', effectiveFrom: '2026-04-01', price: 10.9, isAutoSelected: false },
    { value: DRUG_PRICE_BEFORE_HISTORY_VALUE, price: 12.3, isAutoSelected: true }
  ]);
  assert.notEqual(DRUG_PRICE_BEFORE_HISTORY_VALUE, '');
});

test('an unreadable dispensing date marks no revision as the automatic one', () => {
  // 調剤日が読めないと解決自体ができない。開始日不明の版を自動扱いしないこと。
  const choices = listDrugPriceRevisionChoices({ priceHistory: withUnknownStart }, '');
  assert.deepEqual(choices.map((choice) => choice.isAutoSelected), [false, false]);
});

test('the unknown start can be applied as an override and read back', () => {
  const drug = { price: 10.9, priceHistory: withUnknownStart };
  const chosen = listDrugPriceRevisionChoices(drug, '2026-06-01')
    .find((choice) => choice.value === DRUG_PRICE_BEFORE_HISTORY_VALUE);
  const override = toDrugPriceOverride(chosen);

  assert.deepEqual(override, { price: 12.3 });
  assert.deepEqual(resolveDrugPriceWithOverride(drug, '2026-06-01', override), {
    price: 12.3,
    source: 'override',
    autoResolved: { price: 10.9, source: 'history', effectiveFrom: '2026-04-01' }
  });
  // 画面が選択状態を復元できること
  assert.equal(drugPriceOverrideValue(override), DRUG_PRICE_BEFORE_HISTORY_VALUE);
  assert.equal(drugPriceOverrideValue(null), '');
  assert.equal(drugPriceOverrideValue({ price: 10.9, effectiveFrom: '2026-04-01' }), '2026-04-01');
});

test('choosing the unknown start when it is already what the date resolves to is not an override', () => {
  const drug = { price: 12.3, priceHistory: withUnknownStart };
  assert.deepEqual(resolveDrugPriceWithOverride(drug, '2026-03-31', { price: 12.3 }), {
    price: 12.3,
    source: 'earliest_known'
  });
});

test('formatDrugPriceRevisionLabel names a revision with no start date', () => {
  // 画面・請求前チェック・監査ログで同じ言い方をする
  assert.equal(formatDrugPriceRevisionLabel('2026-04-01'), '適用 2026-04-01');
  assert.equal(formatDrugPriceRevisionLabel(undefined), '開始日不明・最初の改定より前');
  assert.match(
    formatDrugPriceOverrideWarning(
      resolveDrugPriceWithOverride({ price: 10.9, priceHistory: withUnknownStart }, '2026-06-01', { price: 12.3 }),
      '2026-06-01'
    ),
    /12\.3円（開始日不明・最初の改定より前）/
  );
});

test('history survives an out-of-order import of an older revision', () => {
  // 過去の改定を後から取り込んでも、調剤日での判定が壊れないこと
  let built: DrugPriceRevision[] = [];
  built = appendDrugPriceRevision(built, { price: 10.9, effectiveFrom: '2026-04-01' });
  built = appendDrugPriceRevision(built, { price: 12.3, effectiveFrom: '2024-04-01' });
  built = appendDrugPriceRevision(built, { price: 13.8, effectiveFrom: '2022-04-01' });

  assert.deepEqual(built.map((item) => item.effectiveFrom), ['2022-04-01', '2024-04-01', '2026-04-01']);
  assert.equal(resolveDrugPriceOn({ priceHistory: built }, '2023-06-14'), 13.8);
  assert.equal(resolveDrugPriceOn({ priceHistory: built }, '2025-06-14'), 12.3);
  assert.equal(resolveDrugPriceOn({ priceHistory: built }, '2026-06-14'), 10.9);
});


// 薬剤師が薬価の版を選び直せるようにした分。
// 選び直しは点数を動かすので、「上書きしたこと」が消えないようにする。

test('listDrugPriceRevisionChoices marks the revision that the dispensing date resolves to', () => {
  const choices = listDrugPriceRevisionChoices({ priceHistory: history }, '2026-06-14');

  // 新しい版が先頭 (選ぶときに探しやすい)
  assert.deepEqual(choices, [
    { value: '2026-04-01', effectiveFrom: '2026-04-01', price: 10.9, isAutoSelected: true },
    { value: '2024-04-01', effectiveFrom: '2024-04-01', price: 12.3, isAutoSelected: false }
  ]);

  // 調剤日が変われば自動選択も変わる
  const past = listDrugPriceRevisionChoices({ priceHistory: history }, '2025-06-14');
  assert.deepEqual(past.map((choice) => choice.isAutoSelected), [false, true]);
});

test('listDrugPriceRevisionChoices returns nothing when there is no history', () => {
  assert.deepEqual(listDrugPriceRevisionChoices({ price: 10.9 }, '2026-06-14'), []);
});

test('resolveDrugPriceWithOverride applies the chosen revision and keeps the automatic one', () => {
  const resolution = resolveDrugPriceWithOverride(
    { priceHistory: history },
    '2026-06-14',
    { effectiveFrom: '2024-04-01', price: 12.3 }
  );

  assert.equal(resolution.price, 12.3);
  assert.equal(resolution.source, 'override');
  assert.equal(resolution.effectiveFrom, '2024-04-01');
  // 上書きしなければどうなっていたかを残す。警告と監査ログで使う。
  assert.deepEqual(resolution.autoResolved, {
    price: 10.9,
    source: 'history',
    effectiveFrom: '2026-04-01'
  });
  assert.equal(isDrugPriceOverridden(resolution), true);
});

test('choosing the same revision as the dispensing date is not treated as an override', () => {
  // 同じ結論に警告を出しても意味がない
  const resolution = resolveDrugPriceWithOverride(
    { priceHistory: history },
    '2026-06-14',
    { effectiveFrom: '2026-04-01', price: 10.9 }
  );

  assert.equal(resolution.source, 'history');
  assert.equal(isDrugPriceOverridden(resolution), false);
});

test('an unusable override falls back to the automatic resolution', () => {
  const base = { priceHistory: history };
  assert.equal(resolveDrugPriceWithOverride(base, '2026-06-14', null).source, 'history');
  assert.equal(
    resolveDrugPriceWithOverride(base, '2026-06-14', { effectiveFrom: '', price: 12.3 }).source,
    'history'
  );
  assert.equal(
    resolveDrugPriceWithOverride(base, '2026-06-14', { effectiveFrom: '2024-04-01', price: Number.NaN }).source,
    'history'
  );
});

test('formatDrugPriceOverrideWarning names both the applied and the automatic price', () => {
  const resolution = resolveDrugPriceWithOverride(
    { priceHistory: history },
    '2026-06-14',
    { effectiveFrom: '2024-04-01', price: 12.3 }
  );
  const warning = formatDrugPriceOverrideWarning(resolution, '2026-06-14');

  assert.match(warning, /調剤日 2026-06-14/);
  assert.match(warning, /12\.3円（適用 2024-04-01）/);
  assert.match(warning, /調剤日時点は 10\.9円（適用 2026-04-01）/);

  // 上書きしていないときは文言を出さない
  assert.equal(formatDrugPriceOverrideWarning(resolveDrugPrice({ priceHistory: history }, '2026-06-14'), '2026-06-14'), '');
});
