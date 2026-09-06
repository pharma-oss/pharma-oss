# コードレビュー実装計画書（2026-09-06）— 剤形判定の一元化・年齢取り扱いの正本化

対象コミット: `9967b94`（`main`、作業ツリーはクリーン）
ベースライン実測値（本計画の起点。作業前に自分で再取得して一致を確認すること）:

| 検証 | コマンド | ベースライン |
|---|---|---|
| 型検査 | `npx tsc --noEmit` | エラー 0 件 |
| Lint | `npm run lint` | error 0 / warning 11 |
| テスト | `npm test` | 1664 pass / 0 fail / 71 suites |
| ビルド | `npm run build` | 成功 |

---

## 0. この計画書の使い方（実装者への必須ルール）

`.agents/AGENTS.md`（行動ルール）を最優先で遵守すること。特に以下は本計画でも例外なく適用する。

1. **`npx tsx --test` は型検査をしない。** 各 PR の完了報告前に `npx tsc --noEmit` を単独実行し、エラー 0 件を自分の目で確認する。
2. **偽カバレッジの禁止。** テストファイル内で対象ロジックを再実装してはならない。必ず本物の関数を `import` して検証する。
3. **fail-first mutation の実証。** 各 PR で指定された変異を実際にコードへ注入し、テストが **fail すること**、戻すと **pass すること** の 4 手順を実測する。「落ちるはず」という推測を報告に書かない。
4. **ドキュメントの先走り禁止。** コード修正・型検査・本物のテスト通過がすべて揃うまで「完了」と書かない。
5. **指示範囲外の独断変更の禁止。** 本計画に書かれていない安全設計・競合解決・スキーマの書き換えを「気を利かせて」行わない。判断に迷ったら実装せず、報告に「要判断」として書き出す。
6. **RxDB スキーマの version bump は本計画に含まれない。** 本計画のどの PR もスキーマ変更を必要としない。プロパティを足したくなったら、それは設計を間違えている合図なので手を止めて報告すること。

各 PR は独立してコミットする。1 PR = 1 コミット。コミットメッセージは既存の慣習（`fix(scope): ...` / `refactor(scope): ...`）に合わせる。

---

## 1. 調査結果サマリ

剤形（内服・屯服・外用・内滴・注射）の判定が **5 か所に別実装** で散在しており、判定軸が食い違っている。そのうち帳票側の 3 実装が明確に誤っており、**患者に渡る印刷物に誤った剤形・誤った全量が印字される**。

| # | 場所 | 判定材料 | 状態 |
|---|---|---|---|
| 1 | `src/lib/dosage_category.ts:47` `inferDosageCategory` | 薬品名（外用/注射/内滴）＋用法（屯服のみ） | **用法からの外用判定が無い** |
| 2 | `src/lib/calculator.ts:557` `isExternal` | 保存済み category ＋ 用法正規表現 | 正しい（正規表現がここだけに埋め込まれている） |
| 3 | `src/lib/amount_semantics.ts:31` `isDailyAmountItem` | **生の** `item.dosageCategory` ＋ 用法正規表現 | **推定にフォールバックしない** |
| 4 | `src/app/print/helpers.ts:309` `getBagKindLabel` | 用法正規表現のみ（さらに狭い） | **誤り** |
| 5 | `src/app/print/components/MedicineBagPrint.tsx:42` `isExternalBag` | 用法正規表現のみ（さらに狭い） | **誤り** |

加えて、生年月日・年齢の取り扱いにも 3 系統の問題がある。

### 実測した誤りの証拠

すべて `npx tsx` で実際に関数を呼んで得た出力であり、推測ではない。

**証拠 A — 薬袋の剤形ラベルが誤る（`getBagKindLabel`）**

```
モーラステープ20mg   / 1日1回患部に貼る    -> 薬袋:内服薬  （正: 外用薬）
ヒアレイン点眼液0.1% / 1日5回両眼に1滴ずつ -> 薬袋:内服薬  （正: 外用薬）
ボラザG坐剤          / 1日2回肛門内に挿入   -> 薬袋:内服薬  （正: 外用薬）
タリビッド耳科用液   / 1日2回点耳          -> 薬袋:内服薬  （正: 外用薬）
カロナール錠200      / 疼痛時に1回1錠      -> 薬袋:内服薬  （正: 頓服薬）
```

`MedicineBagPrint.tsx:42` の `isExternalBag` も同じ正規表現なので、薬袋の色分け（`external-bag` / `internal-bag`）とバッジも同様に誤る。**坐剤・点眼液が「内服薬」と書かれた袋で患者に渡る**状態であり、経口誤用に直結する。

**証拠 B — ラベルの全量が日数倍される（`isDailyAmountItem`）**

`dosageCategory` が未設定の明細（フィールド追加前に作成され `keepDocument` で移行された文書、および旧バックアップからの復元分）で発生する。

```
モーラステープ20mg 14枚 / 14日 (dosageCategory未設定)
  resolveDosageCategory = external   ← 名称から外用と分かる
  isDailyAmountItem     = true       ← しかし生の dosageCategory しか見ないので内服扱い
  getAmountLabel        = 1日量      （正: 全量）
  getTotalAmountText    = 196 枚     （正: 14 枚 / 14倍の過大表示）

ヒアレイン点眼液0.1% 3mL / 30日 (dosageCategory未設定)
  resolveDosageCategory = external
  isDailyAmountItem     = true
  getTotalAmountText    = 90 mL      （正: 3 mL / 30倍の過大表示）
```

これは §10 (PR-A/PR-B) で潰したはずの過大表示事故と同じクラスの欠陥が、`dosageCategory` 未設定という経路で残っていたもの。既存テストのフィクスチャがすべて `dosageCategory` を明示しているため検出できていない。

**証拠 C — 用法にしか外用の手掛かりがない薬剤を内服と推定する（`inferDosageCategory`）**

```
inferDosageCategory('タリビッド耳科用液', '1日2回点耳') = internal   （正: external）
```

`EXTERNAL_NAME_PATTERN` に「耳科用」「耳用」が無く、`inferDosageCategory` は用法から外用を判定しない。算定側（`calculator.ts:557`）は独自に用法正規表現を OR しているため救われているが、`resolveDosageCategory` 単体を信じる呼び出し側（本計画で増える）は救えない。

**証拠 D — 移行CSVが不正な生年月日を素通しし、以後の年齢が壊れる**

`buildPatientCsvMigrationPreview` に和暦表記の CSV を通した実測:

```
status = pass
issues = []
P001 birthDate="昭和45年3月2日" Date有効=false / calculatePatientAge=undefined
P002 birthDate="S45.3.2"       Date有効=false / calculatePatientAge=undefined
P003 birthDate="1970-03-02"    Date有効=true  / calculatePatientAge=56
```

`migration_csv.ts:439` の `normalizeDate` は 8 桁数字にも `YYYY-MM-DD` にもならない入力を **そのまま返す**。`if (!name || !birthDate)`（`migration_csv.ts:762`）は非空なので通過し、移行プレビューは `pass` / issue 0 件と報告する。結果として `new Date()` が `NaN` になる生年月日が DB に入る。

**証拠 E — 年齢が壊れたときの挙動が「静かに間違う」**

```
PatientBanner の表示（和暦の生年月日）= "NaN歳"
emr/page.tsx の警告 age（生年月日未登録）= 0 → "age < 15" が真
```

- `src/app/emr/page.tsx:1083` は `let patientAgeVal = 0;` を既定値にしており、生年月日が読めない患者を **0 歳として臨床警告条件に渡す**。出荷データ `src/lib/data/drug_infos.json` には `age < 15`（ノルバスク錠１０ｍｇ、アムロジピンベシル酸塩５ｍｇ錠の「小児に対する安全性は確立していません」）が実在するため、**誤発火する**。
- 生年月日が不正文字列の場合は `NaN` になり、`clinical_rules.ts:41` の `Number.isFinite` ガードで **すべての年齢条件が黙って不成立**になる。警告が出ないことと「警告なし」が区別できない。
- 年齢計算は 3 か所に重複実装されている（`src/app/print/helpers.ts:47` の `calculatePatientAge` のみ NaN ガードあり、`src/app/emr/page.tsx:1089` と `src/app/emr/components/PatientBanner.tsx:60` はガード無しの写し）。

---

## 2. PR 分割

依存関係があるので **この順序で実施すること**。

```
PR-E1（剤形判定の正本化）
  └─ PR-E2（帳票の数量セマンティクス）
  └─ PR-E3（薬袋の剤形ラベル・色分け）
PR-E4（年齢の正本化と不明の明示）
  └─ PR-E5（移行CSVの生年月日検証）
PR-E6（型の後始末・任意）
```

---

### PR-E1: 剤形推定を正本化し、用法からの外用判定を統合する

**対象**: `src/lib/dosage_category.ts`, `src/lib/calculator.ts`

**変更内容**

1. `src/lib/dosage_category.ts` に、用法から外用を判定する正規表現を **エクスポート付きで新設**する。パターンは `calculator.ts:557` に現在埋め込まれているものを **一字一句そのまま**移す。

   ```ts
   // 算定側 (calculator.ts) と印字側で同一の判定を使うための正本。
   export const EXTERNAL_USAGE_PATTERN = /外用|貼付|塗布|点眼|点鼻|点耳|吸入|坐剤|注入/;
   ```

   - 「貼る」「塗る」などの口語形は **追加しない**。誤検知の評価を伴う別課題であり、本 PR の範囲外。

2. `inferDosageCategory` に用法ベースの外用判定を追加する。優先順位は算定側と一致させ、**外用が屯服より先**に来ること。

   ```
   名称external → 名称injection → 名称internal_drop → 用法external(新規) → 用法as_needed → internal
   ```

   理由: 「坐剤を発熱時に挿入」のような明細で `as_needed` を先に取ると外用が消える。`calculator.ts` は `isTonpuku = !isExternal && ...` として外用を優先しており、その優先度に合わせる。

3. `calculator.ts:557` の埋め込み正規表現を `EXTERNAL_USAGE_PATTERN` の参照に置き換える。

   ```ts
   const isExternal = category === 'external' || EXTERNAL_USAGE_PATTERN.test(usage);
   ```

**算定への影響（必ず実測して報告すること）**

理論上、算定結果は **変わらない**。`inferDosageCategory` が新たに `external` を返すのは用法が `EXTERNAL_USAGE_PATTERN` に一致する場合のみであり、その場合 `calculator.ts` の `isExternal` は既に第 2 項で `true` だったため。ただしこれは推論であって実測ではない。次を実測し、点数の差分が **0 であること**を報告に数字で書くこと。

```bash
npm run test:e2e:onboarding   # dev サーバ起動が必要
```

差分が出た場合は **修正を進めず、差分の内訳（項目別の点数）を添えて報告し、指示を待つ**こと。

**テスト**（`src/lib/dosage_category.test.ts` に追加）

- `inferDosageCategory('タリビッド耳科用液', '1日2回点耳')` === `'external'`
- `inferDosageCategory('ボラザG坐剤', '発熱時に1回1個 肛門内に挿入')` === `'external'`（屯服より外用が優先されること）
- `inferDosageCategory('カロナール錠200', '疼痛時に1回1錠')` === `'as_needed'`（既存の屯服判定が壊れていないこと）
- `inferDosageCategory('アムロジピン錠5mg', '1日1回朝食後')` === `'internal'`（回帰）
- `EXTERNAL_USAGE_PATTERN` が `calculator.ts` から参照されていること（`calculator.test.ts` の既存ケースが全通することで担保）

**fail-first mutation（4 手順を実測すること）**

| # | 変異 | 期待 |
|---|---|---|
| E1-1 | `inferDosageCategory` から用法external判定を削除する | 点耳・坐剤ケースが fail |
| E1-2 | 用法external を用法as_needed の **後**に移動する | 坐剤＋発熱時ケースが fail |
| E1-3 | `EXTERNAL_USAGE_PATTERN` から `点耳` を除く | 点耳ケースが fail |

**受入基準**: 上記 3 変異がすべて fail し戻すと pass する / `npx tsc --noEmit` 0 件 / `npm test` が 1664 + 追加分すべて pass / onboarding e2e の点数差分 0。

---

### PR-E2: 帳票の数量セマンティクスを推定込みの剤形判定に載せ替える

**対象**: `src/lib/amount_semantics.ts`, `src/app/print/helpers.ts`

**変更内容**

1. `AmountSemanticsItem`（`amount_semantics.ts:6`）の `Pick` に `'drugName' | 'dispensedDrug'` を追加する。
2. `isDailyAmountItem` の `const cat = item.dosageCategory;`（`amount_semantics.ts:31`）を `resolveDosageCategory(item)` に置き換える。用法正規表現による判定は `resolveDosageCategory` 側（PR-E1）に一本化されるため、`isDailyAmountItem` 内の重複した外用正規表現は削除してよい。ただし `頓服 / 内滴 / 内用滴剤 / 注射` の用法判定は `inferDosageCategory` の対象外の語（`内滴`, `内用滴剤`）を含むため、**削除せず残す**こと。
3. `AmountTextSourceItem`（`print/helpers.ts:123`）の `Pick` にも `'drugName' | 'dispensedDrug'` を追加する。
4. `amount_semantics.ts` 冒頭の 2 行コメントは実態と食い違っている（「算定側の剤形判定見直しは別宿題」は 2026-09-05 `9967b94` で完了済み）。実態に合わせて書き換える。

   ```ts
   // 印字用の数量セマンティクス判定。剤形判定は算定側と同じ resolveDosageCategory を使う。
   // 「1日量か全量か」の軸のみがここの責務で、算定上の剤形区分そのものは dosage_category.ts が正本。
   ```

**やってはいけないこと**: `days <= 0` を全量として扱う規約は変更しない。`getTotalAmountText` の丸め（`Math.round(x * 1000) / 1000`）も変更しない。

**テスト**（`src/lib/amount_semantics.test.ts` と `src/app/print/PrintUnitDisplay.test.ts` に追加）

証拠 B のフィクスチャを **`dosageCategory` を設定せずに** そのまま使うこと。

- テープ剤: `{ drugName: 'モーラステープ20mg', usage: '1日1回患部に貼る', amount: 14, days: 14, unitText: '枚' }`
  → `isDailyAmountItem` === `false` / `getAmountLabel` === `'全量'` / `getTotalAmountText` === `'14 枚'`
- 点眼液: `{ drugName: 'ヒアレイン点眼液0.1%', usage: '1日5回両眼に1滴ずつ', amount: 3, days: 30, unitText: 'mL' }`
  → `getTotalAmountText` === `'3 mL'`
- 内服の回帰: `{ drugName: 'アムロジピン錠5mg', usage: '1日1回朝食後', amount: 1, days: 28, unitText: '錠' }`
  → `isDailyAmountItem` === `true` / `getTotalAmountText` === `'28 錠'`
- `PrintUnitDisplay.test.ts` には `renderToStaticMarkup` 経由の実レンダリングで、`dosageCategory` 未設定のテープ剤が軟膏ラベルに「14 枚」と出ること（196 でないこと）を追加する。

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| E2-1 | `resolveDosageCategory(item)` を `item.dosageCategory` に戻す | テープ剤・点眼液ケースが fail |
| E2-2 | `AmountSemanticsItem` から `drugName` を外し `resolveDosageCategory` に渡さない | 同上が fail |
| E2-3 | 内服の `days` 乗算を外す | 内服回帰ケースが fail |

**受入基準**: 3 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run test:e2e:print-layout` が既存 11 帳票を出力し、内服帳票の表示が変わっていないこと。

---

### PR-E3: 薬袋の剤形ラベルと色分けを剤形判定に載せ替える

**対象**: `src/app/print/helpers.ts`, `src/app/print/components/MedicineBagPrint.tsx`

**変更内容**

1. `print/helpers.ts` に、薬袋グループ（用法でまとめた明細の配列）から剤形を決める純粋関数を新設する。`src/app/ocr/helpers.ts:121` の `getGroupDosageCategory` が同じ問題の既存の正解なので、その優先順位に倣うこと。

   ```ts
   export function getBagDosageCategory(items: BagCategorySourceItem[]): DosageCategory
   ```

   - 手動指定（`dosageCategorySource === 'manual'` かつ `dosageCategory` あり）の明細があれば、それを最優先で採用する。
   - なければ各明細に `resolveDosageCategory` を適用し、**安全側に倒す優先度** `external > injection > as_needed > internal_drop > internal` で最も外用寄りの区分を採用する。混在袋を「内服薬」と書くより「外用薬」と書くほうが誤飲事故に対して安全なため。
   - 明細が空の配列なら `'internal'` を返す。

2. `getBagKindLabel`（`print/helpers.ts:309`）のシグネチャを `(usage: string)` から `(category: DosageCategory)` に変更し、内部の正規表現を削除する。ラベルの対応は次のとおり。

   | category | ラベル |
   |---|---|
   | `external` | 外用薬 |
   | `injection` | 注射薬 |
   | `as_needed` | 頓服薬 |
   | `internal_drop` | 内服薬 |
   | `internal` | 内服薬 |

   `注射薬` は新しいラベル文字列になる。`src/app/print/PrintLayoutRegression.test.ts` の必須キーワード契約に影響が出ないか確認し、出るなら契約側にケースを追加すること（契約を緩めてはならない）。

3. `MedicineBagPrint.tsx:42` の `isExternalBag`（独自の正規表現）を削除し、`getBagDosageCategory(groupItems)` の結果から導出する。`external-bag` / `internal-bag` の CSS クラス名と、`yakutai-timing-strip` のフォールバックバッジ（`'外用'` / `'指示どおり'`）も同じ結果に従わせる。

   - CSS クラス名は既存の 2 値のまま変えないこと（スタイルシートの変更は本 PR の範囲外）。`external` と `injection` を `external-bag`、それ以外を `internal-bag` に写像する。

**テスト**（`src/app/print/helpers.test.ts` と `src/app/print/PrintUnitDisplay.test.ts`）

証拠 A の 5 ケースをそのまま回帰テストにすること。

- テープ剤・点眼液・坐剤・耳科用液のグループ → `getBagKindLabel` === `'外用薬'`
- `カロナール錠200` / `疼痛時に1回1錠` → `'頓服薬'`
- `アムロジピン錠5mg` / `1日1回朝食後` → `'内服薬'`（回帰）
- 手動指定の優先: 明細に `dosageCategorySource: 'manual', dosageCategory: 'internal'` があれば、名称が外用でも `'内服薬'`
- 混在袋: 内服明細と外用明細が同一グループにある場合に `'外用薬'`（安全側）
- `MedicineBagPrint` を `renderToStaticMarkup` でレンダリングし、テープ剤の袋が `external-bag` クラスを持ち、リボンに「外用薬」と出ること

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| E3-1 | `getBagKindLabel` を旧実装（用法正規表現）に戻す | 外用 4 ケースと頓服ケースが fail |
| E3-2 | 混在時の優先度を `internal` 優先に反転する | 混在袋ケースが fail |
| E3-3 | 手動指定の最優先を外す | 手動指定ケースが fail |
| E3-4 | `MedicineBagPrint` の `external-bag` 写像を旧正規表現に戻す | レンダリングテストが fail |

**受入基準**: 4 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run test:e2e:print-layout` を実行し、薬袋の実出力画像で「外用薬」リボンと外用色が出ていることを目視確認して報告に書くこと。

---

### PR-E4: 年齢計算を正本化し、判定不能を「不能」として表面化する

**対象**: `src/lib/patient_age.ts`(新規), `src/app/print/helpers.ts`, `src/app/emr/components/PatientBanner.tsx`, `src/app/emr/page.tsx`, `src/lib/clinical_rules.ts`

**変更内容**

1. `src/lib/patient_age.ts` を新設し、`print/helpers.ts:47` の `calculatePatientAge` を **ロジックを変えずに** 移設する。`print/helpers.ts` は移設先から re-export して既存の import を壊さないこと。
2. `PatientBanner.tsx:60-68` の `calcAge` と `emr/page.tsx:1089-1094` の年齢計算を、この共有関数の呼び出しに置き換える。
   - `PatientBanner` は `calcAge` が `undefined` のとき「年齢不明」を表示する（現状は `NaN歳` が出る）。
3. `clinical_rules.ts:1` の `UsageWarningContext.age` を `number | undefined` に変更する。
4. `clinical_rules.ts` に、条件が **評価できたかどうか**を返す関数を追加する。既存の `evaluateUsageWarningCondition` は戻り値 `boolean` のまま、新関数の薄いラッパとして残し、後方互換を壊さないこと。

   ```ts
   export interface UsageWarningEvaluation {
     /** 条件が成立したか。unevaluable が true のときは常に false。 */
     triggered: boolean;
     /** 条件の評価に必要な値（年齢など）が揃わず判定できなかったか。 */
     unevaluable: boolean;
   }
   export function evaluateUsageWarning(
     condition: string,
     context: UsageWarningContext
   ): UsageWarningEvaluation;
   ```

   - `age` 条件で `context.age` が `undefined` または非有限のとき `{ triggered: false, unevaluable: true }` を返す。
   - パースできない条件文字列は従来どおり `{ triggered: false, unevaluable: false }`（＝評価対象外）とする。`unevaluable` は「評価すべきだが値が無い」に限る。
5. `emr/page.tsx:1083` の `let patientAgeVal = 0;` を `let patientAge: number | undefined;` に変更し、`calculatePatientAge(patient.birthDate)` の結果をそのまま入れる。`emr/page.tsx:1231` の `age: patientAgeVal` を `age: patientAge` にする。
6. `emr/page.tsx` の警告生成ループで、`unevaluable` が 1 件でもあれば `newWarnings` に **重複しない 1 件だけ** 次の警告を追加する。

   ```
   type: 'usage', severity: 'warning',
   drug: '（患者情報）',
   message: '生年月日が未登録または不正なため、年齢に基づく警告を判定できませんでした。患者情報を確認してください。'
   ```

**やってはいけないこと**: `drug_infos.json` の条件文字列を書き換えない。患者スキーマを変更しない。年齢不明を 0 や 999 などの番兵値で代用しない。

**テスト**（`src/lib/clinical_rules.test.ts` と `src/lib/patient_age.test.ts`(新規)）

- `calculatePatientAge(undefined)` / `('')` / `('昭和45年3月2日')` → すべて `undefined`
- `calculatePatientAge('1970-03-02')` が正しい年齢を返し、誕生日前後で 1 歳ずれること（`TZ=Asia/Tokyo` 固定、固定日付を注入できるようにするか、生年月日を相対計算して判定する）
- `evaluateUsageWarning('age < 15', { amount: 1, age: undefined, diseases: [] })` → `{ triggered: false, unevaluable: true }`
- `evaluateUsageWarning('age < 15', { amount: 1, age: 10, diseases: [] })` → `{ triggered: true, unevaluable: false }`
- `evaluateUsageWarning('age < 15', { amount: 1, age: 40, diseases: [] })` → `{ triggered: false, unevaluable: false }`
- `evaluateUsageWarning('amount > 40', { amount: 50, age: undefined, diseases: [] })` → `{ triggered: true, unevaluable: false }`（年齢不明が年齢以外の条件を巻き添えにしないこと）
- 既存の `evaluateUsageWarningCondition` の戻り値が全ケースで従来どおりであること（回帰）

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| E4-1 | `age` が `undefined` のとき `0` として評価する（旧挙動） | `age < 15` の unevaluable ケースが fail |
| E4-2 | `unevaluable` を常に `false` にする | unevaluable ケースが fail |
| E4-3 | `calculatePatientAge` の `Number.isNaN` ガードを外す | 和暦ケースが fail |
| E4-4 | 年齢以外の条件でも `age` 未設定なら unevaluable にする | `amount > 40` ケースが fail |

**受入基準**: 4 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run build` 成功 / 開発サーバで生年月日が不正な患者を 1 件作り、`PatientBanner` に「NaN歳」ではなく「年齢不明」が出ることを実画面で確認して報告に書くこと。

---

### PR-E5: 移行CSVで読めない生年月日を error として報告する

**対象**: `src/lib/migration_csv.ts`

**変更内容**

1. `normalizeDate`（`migration_csv.ts:439`）の戻り値が `YYYY-MM-DD` 形式かを判定するヘルパを追加する。`normalizeDate` 自体の戻り値仕様は変えない（保険期間の値を壊さないため）。
2. 患者 CSV の行処理（`migration_csv.ts:762` 付近）で、`birthDate` が非空だが `YYYY-MM-DD` にならない行を **error** の issue として報告し、その行をスキップする。

   ```
   severity: 'error'
   code:     'patient_migration_csv_birth_date_invalid'
   title:    '生年月日を日付として読み取れません'
   message:  `${line}行目の生年月日「${raw}」を YYYY-MM-DD として読み取れませんでした。西暦の年月日に直してから取り込んでください。`
   ```

3. `insuranceValidFrom` / `insuranceValidTo` が同様に読めない場合は **warning** の issue とし、**値は保持する**（`code: 'patient_migration_csv_insurance_date_invalid'`）。移行を止めるほどではなく、既存データを落とすほうが害が大きいため。
4. JAHIS の圧縮和暦（`S450302` 形式）は既に `src/app/ocr/helpers.ts:97` の `normalizeJahisDateInputValue` が解ける。`normalizeDate` からこれを利用してもよい。ただし **「昭和45年3月2日」や「S45.3.2」の解釈は本 PR では実装しない**（誤読リスクの評価が必要な別課題。§4 の要判断事項に記載）。

**テスト**（`src/lib/migration_csv.test.ts` に追加）

証拠 D の CSV をそのままフィクスチャにすること。

- 和暦 2 行＋西暦 1 行の CSV → `status` が `'blocked'`、`issues` に `patient_migration_csv_birth_date_invalid` が 2 件、`rows` は西暦 1 行のみ
- 既存の正常な CSV が引き続き `status: 'pass'` / `issues: []`（回帰）
- `insuranceValidFrom` が不正な行 → warning 1 件だが `rows` に残り、`insuranceInfo.validFrom` に元の値が保持されている

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| E5-1 | 生年月日の形式検証を外す | 和暦 CSV が `pass` になり fail |
| E5-2 | 生年月日の issue を `warning` に落とす | `status` が `blocked` にならず fail |
| E5-3 | 保険期間の不正値で行をスキップする | 保険期間ケースが fail |

**受入基準**: 3 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass。

---

### PR-E6（任意・低優先）: 帳票・算定ヘルパーの `any` を排除する

`docs/handoff_20260827.md` §9「残っている宿題」の 3・4 に対応する。**PR-E1〜E5 がすべて完了し検証済みになってから**着手すること。時間が足りなければ着手せず、その旨を報告すればよい。

- `src/app/print/helpers.ts:315` `getElectronicPrescriptionDocumentKinds(electronicPrescription: any): any[]`
  → `VisitElectronicPrescription`（`src/db/types.ts`）を使い、戻り値を `ElectronicPrescriptionDocumentKind[]` 相当に型付ける。
- `src/app/print/claim_actions.ts:192` `buildItemClaimFlagPatches(item: any)` および `:207` `buildItemClaimFlagAuditDetail(item: any)`
  → `getClaimItemFlagValue(item: object, ...)` と同じ受け口（構造的な最小 interface）に揃える。交差型代入で TS2345 が出る場合は `getClaimItemFlagValue` と同じ内部キャストの手法を使い、呼び出し側に `as any` を撒かないこと。

**受入基準**: `npx tsc --noEmit` 0 件 / `npm test` 全 pass / 既存の `claim_actions.test.ts` と `helpers.test.ts` が無改変で通ること（型付けのみの変更であり挙動を変えないため、テストの書き換えが必要になったらそれは挙動を変えた合図なので手を止めること）。

---

## 3. 全 PR 共通の最終検証

すべての PR 完了後、次を **実行して出力を報告に貼ること**。

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

期待値: tsc エラー 0 / lint error 0（warning は 11 件のまま。増えていたら報告） / テスト 1664 + 追加分がすべて pass / build 成功。

さらに帳票の実出力を確認する（dev サーバが必要）:

```bash
npm run test:e2e:print-layout
npm run test:e2e:onboarding
```

onboarding e2e の **点数は PR-E1 の時点から変化していないこと**。変化していたら数字を添えて報告すること。

---

## 4. 要判断事項（実装者が勝手に決めないこと）

1. **移行CSVの和暦解釈**: 「昭和45年3月2日」「S45.3.2」を自動で西暦に直すか、error として利用者に直させるか。本計画は後者（error 報告）を採用している。前者を実装したくなっても本計画では行わない。
2. **`EXTERNAL_USAGE_PATTERN` への口語形追加**: 「貼る」「塗る」「さす」などを足すと検出率は上がるが、内服薬の用法文（例:「水で流し込む」）との誤検知評価が必要。本計画では追加しない。
3. **薬袋ラベル「注射薬」の新設**: 保険薬局の薬袋に注射薬区分が必要かは運用判断。実装は入れるが、不要なら `internal_drop` と同様に「内服薬」へ寄せる選択肢もある。
4. **`dosageCategory` 未設定の既存文書を移行時に埋めるか**: 本計画は読み取り側（`resolveDosageCategory`）で毎回推定する方式を採り、スキーマ移行での一括書き込みは行わない。書き込み方式に変えたい場合は version bump を伴うので必ず事前合意すること。

---

## 5. 報告フォーマット

PR ごとに次を書くこと。推測を断定形で書かないこと。

```
## PR-Ex: <タイトル>
- コミット: <hash>
- 変更ファイル: <一覧>
- npx tsc --noEmit: エラー N 件（出力を貼る）
- npm test: pass N / fail N（末尾の集計行を貼る）
- mutation 実測:
  | # | 変異 | 実測 fail 数 | 戻した後 |
  |---|---|---|---|
  | Ex-1 | ... | fail 2 | pass |
- 未実施・できなかったこと: <あれば正直に書く。無ければ「なし」>
```

---

# 追補（2026-09-06、PR-E1〜E6 の独立検証後に追記）

PR-E1〜E6 の完了報告を独立検証した。証拠 A〜E はすべて実測で解消を確認した（下記 §6）。
一方で **PR-E2 が新しいリグレッションを 1 件持ち込んでいる**ことと、既存テストに 1 件の偽カバレッジがあることを検出した。PR-E7 / PR-E8 として続けて対応する。

## 6. 独立検証の実測結果（`919ba74` 時点）

| 検証 | 実測 | ベースライン | 判定 |
|---|---|---|---|
| `npx tsc --noEmit` | エラー 0 件 | 0 件 | 一致 |
| `npm run lint` | error 0 / warning 11 | error 0 / warning 11 | 一致（新規警告なし） |
| `npm test` | 1675 pass / 0 fail / 71 suites / 78.7s | 1664 pass / 71 suites / 83.9s | 妥当 |
| `npm run build` | 成功 | 成功 | 一致 |

再注入した変異（報告の追試）:

| 変異 | 実測 |
|---|---|
| E1-1 `inferDosageCategory` から用法external判定を削除 | `dosage_category.test.ts` が `actual: 'internal', expected: 'external'` で fail |
| E3-1 `getBagKindLabel` を旧用法正規表現に戻す | `helpers.test.ts` が pass 24 / **fail 1** |

新規テストは対象モジュールを実際に `import` しており、偽カバレッジではないことを確認した。

証拠の解消（実関数を呼んだ出力）:

```
モーラステープ20mg   (dosageCategory未設定): 全量 / 14 枚      ← 旧: 1日量 / 196 枚
ヒアレイン点眼液0.1% (dosageCategory未設定): 全量 / 3 mL       ← 旧: 1日量 / 90 mL
薬袋: テープ=外用薬 点眼=外用薬 坐剤=外用薬 耳科用液=外用薬 カロナール(疼痛時)=頓服薬 アムロジピン=内服薬
```

---

### PR-E7: PR-E2/E3 が落とした「用法による外用の上書き」を戻す（リグレッション修正）

**発見した事象（実測）**

PR-E2 で `isDailyAmountItem` から用法の外用正規表現を削除し、判定を `resolveDosageCategory(item)` 一本にした。しかし `resolveDosageCategory` は **保存済み `dosageCategory` があれば無条件でそれを返す**ため、保存値が用法と食い違う明細で外用判定が効かなくなった。

```
{ drugName: 'タリビッド耳科用液', usage: '1日2回点耳', amount: 5, days: 14,
  unitText: 'mL', dosageCategory: 'internal', dosageCategorySource: 'auto' }

resolveDosageCategory = internal
isDailyAmountItem     = true      （PR-E2 前は false）
getAmountLabel        = 1日量     （正: 全量）
getTotalAmountText    = 70 mL     （正: 5 mL / 14倍の過大表示）
薬袋                  = 内服薬    （正: 外用薬）
```

算定側（`calculator.ts:557`）は `category === 'external' || EXTERNAL_USAGE_PATTERN.test(usage)` の OR を残しているため `external` のままであり、**帳票と算定が再び食い違っている**。

**なぜ届くか**: `dosageCategory` は `ocr/page.tsx:1283` で保存時に必ず書かれる。PR-E1（`6e4a306`）より前の `inferDosageCategory` は用法から外用を判定しなかったため、**名称に剤形語が無く用法にしかない薬剤（耳科用液／点耳、注腸剤／注入 など）は `internal` として保存されている**。これは PR-E2 が直した「`dosageCategory` 未設定のレガシー文書」より母集団が大きい可能性がある。

**原因**: 計画書 PR-E2 の「`isDailyAmountItem` 内の重複した外用正規表現は削除してよい」という指示が誤っていた。`resolveDosageCategory` は保存値で短絡するため、削除は等価ではなかった。

**変更内容**

1. `src/lib/dosage_category.ts` に実効剤形の解決関数を新設する。

   ```ts
   /**
    * 保存済み区分・用法・名称を突き合わせた実効剤形。
    * 手動指定 (dosageCategorySource === 'manual') は薬剤師の判断として最優先で尊重する。
    * それ以外では、用法の外用表現を保存済みの自動推定値より優先する
    * (保存値が PR-E1 以前の推定で 'internal' のまま残っている明細を救うため)。
    */
   export function resolveEffectiveDosageCategory(item: {
     drugName?: string;
     dispensedDrug?: string;
     usage?: string;
     dosageCategory?: DosageCategory;
     dosageCategorySource?: 'auto' | 'manual';
   }): DosageCategory {
     if (item.dosageCategorySource === 'manual' && item.dosageCategory) {
       return item.dosageCategory;
     }
     if (EXTERNAL_USAGE_PATTERN.test(item.usage || '')) {
       return 'external';
     }
     return resolveDosageCategory(item);
   }
   ```

2. `src/lib/amount_semantics.ts` の `isDailyAmountItem` を `resolveEffectiveDosageCategory(item)` に切り替える。
3. `src/app/print/helpers.ts` の `getBagDosageCategory` のループ内 `resolveDosageCategory(item)` を `resolveEffectiveDosageCategory(item)` に切り替える。先頭の手動指定ブロックはそのまま残す（グループ単位の手動優先は PR-E3 で合意済みの挙動）。
4. `src/lib/calculator.ts` は **変更しない**。既に OR で救済しており、算定点数を動かさないため。

**やってはいけないこと**: `resolveDosageCategory` の既存シグネチャ・挙動を変えない（`calculator.ts` と `ocr/helpers.ts` が依存している）。`EXTERNAL_USAGE_PATTERN` に語を足さない。

**テスト**（`src/lib/amount_semantics.test.ts` と `src/app/print/helpers.test.ts`）

- 上記の耳科用液フィクスチャ（`dosageCategory: 'internal'`, `dosageCategorySource: 'auto'`）
  → `isDailyAmountItem` === `false` / `getTotalAmountText` === `'5 mL'` / 薬袋 === `'外用薬'`
- 手動指定の尊重: `{ drugName: 'ヒアレイン点眼液0.1%', usage: '1日5回点眼', dosageCategory: 'internal', dosageCategorySource: 'manual' }`
  → 薬袋 === `'内服薬'`（手動が勝つこと）
- 内服の回帰: アムロジピン 1錠/28日 → `'1日量'` / `'28 錠'`
- PR-E2 で追加した `dosageCategory` 未設定ケースが引き続き通ること

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| E7-1 | `resolveEffectiveDosageCategory` から用法外用の上書きを削除 | 耳科用液ケースが fail |
| E7-2 | 手動指定の最優先を削除 | 手動指定ケースが fail |
| E7-3 | `isDailyAmountItem` を `resolveDosageCategory` に戻す | 耳科用液ケースが fail |

**受入基準**: 3 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run test:e2e:onboarding` の点数が 321 点のまま変わらないこと。

---

### PR-E8: 偽カバレッジになっている既存テストを本物に差し替える

**発見した事象**

`src/lib/amount_semantics.test.ts:78` の `documents and locks known divergence between amount_semantics and calculator.ts for tape with days` は、`calculator.ts` の判定を **テストファイル内で再実装している**。

```ts
// calculator.ts:575 の判定ロジックの直接再現
const isNaiteki = usage.includes('内滴') || usage.includes('内用滴剤');
const isTonpuku = usage.includes('頓服');
const isInjection = usage.includes('注射');
const calculatorIsInternal = !!(days > 0 && !isNaiteki && !isTonpuku && !isInjection);
```

これは `.agents/AGENTS.md` §2 が禁じる偽カバレッジであり、かつ **再現が古い**。本物の `calculator.ts:557` には `9967b94` 以降 `isExternal` があり、テープ剤（`dosageCategory: 'external'`）は `isInternalMedicine === false` になる。つまりテストが「固定」している乖離は **既に存在しない**。テストが通るのは再実装が実態から外れているからにすぎず、帳票と算定が食い違っているという誤った記録を残している。

**変更内容**

- 当該テストを、本物の `calculateDispensingFees`（または `calculator.ts` が公開している判定）を `import` して、テープ剤で **帳票側と算定側が一致すること** を固定するテストに書き換える。
- テスト名とコメントから「既知の乖離」という記述を削除し、一致を担保する契約に改める。
- `calculator.ts` に判定を公開する必要が出た場合は、`isInternalMedicine` 相当の純粋関数を新たに export するのではなく、**まず既存の公開 API で書けないか検討する**こと。新規 export が必要だと判断したら、実装せずに理由を添えて報告すること。

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| E8-1 | `calculator.ts:557` の `isExternal` から `category === 'external'` を外す | 新テストが fail |
| E8-2 | `isDailyAmountItem` のテープ剤判定を反転させる | 新テストが fail |

**受入基準**: 2 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass。テスト件数は増減どちらでもよいが、**既存テストを削除するだけで済ませないこと**。

---

## 7. 追加の要判断事項

**手動指定と用法が食い違うときの算定側の扱い**: `calculator.ts:557` の `isExternal` は `EXTERNAL_USAGE_PATTERN` を無条件に OR しているため、薬剤師が手動で「内服」を指定した明細でも用法に「点眼」等があれば **外用として算定**する。PR-E7 では帳票側は手動指定を尊重する設計にしたため、この一点で帳票と算定が食い違う。算定側を手動指定尊重に合わせるかどうかは点数に影響するため、**実装者は変更せず、ユーザーの判断を仰ぐこと**。
