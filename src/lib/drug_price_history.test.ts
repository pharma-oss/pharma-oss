import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendDrugPriceRevision,
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
    { effectiveFrom: '2026-04-01', price: 10.9, isAutoSelected: true },
    { effectiveFrom: '2024-04-01', price: 12.3, isAutoSelected: false }
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
