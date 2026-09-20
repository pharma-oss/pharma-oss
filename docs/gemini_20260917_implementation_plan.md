# Gemini 向け実装計画書（2026-09-17）

- **上位文書**: `docs/golden_rules_and_roadmap.md`（以下「金科玉条」）。本書と矛盾したら金科玉条が優先する。
- **行動規範**: `.agents/AGENTS.md` と `.agents/skills/honest-verification/SKILL.md`。
- **対象コミット**: `9b0a772`（`main`）。作業ツリーは `README.md` 1 行追加と `docs/golden_rules_and_roadmap.md`（未追跡）のみ変更あり。**この 2 つには触らないこと。**
- **範囲**: 金科玉条 第Ⅲ部のうち **A-3（判断材料の作成のみ）/ A-5 / I-2 / B-2** の 4 件。
- **PR 数**: 4 本（PR-H1 〜 PR-H4）。1 PR = 1 コミット。

---

## 0. Gemini への絶対規則

この節に反した提出物は、内容を読まずに差し戻す。

### 0.1 報告してよいのは、自分で実行して出力を貼れることだけ

過去のこのリポジトリでの作業で、**実行していないのに「修正完了」「テスト通過」と報告された事例が繰り返し発生している。** そのため次を義務とする。

1. `npx tsc --noEmit` を**単独で**実行する。`npx tsx --test` は型検査をしないので、テストが通っても型は保証されない。
2. `npm test` を実行し、**末尾の集計行（`ℹ tests` 〜 `ℹ duration_ms`）をそのまま貼る**。要約して書き直さない。
3. `npm run build` を実行する。JSX 構文エラーはここでしか出ないことがある。
4. 出力を貼れないものは「実行できなかった」と書く。**推測で「通るはず」と書かない。**

### 0.2 偽カバレッジの禁止

テストファイルの中で対象ロジックを `.filter()` 等で再実装して「テストした」ことにしてはならない。テスト対象は純粋関数として `export` し、テストから**本物を import** する。本計画の各 PR は、この形になるよう関数の切り出し位置まで指定してある。

### 0.3 fail-first mutation を実測する

各 PR には「注入する変異」を具体的に指定してある。次の 4 手順を**実際に実行**し、結果を表で報告する。

1. 指定された変異をソースへ注入する
2. `npm test` を実行し、**落ちたテスト名と件数を実測**する
3. 変異を戻す
4. `npm test` を実行し、pass に戻ることを実測する

**落ちなかった場合は「落ちなかった」と報告する。** そのテストは対象を守れていないので、テストの方を直してから再度実測する。指定の変異で 1 件も落ちないのに「落ちました」と書くことは、このリポジトリで最も重く扱う違反である。

### 0.4 頼まれていないことをしない

- 本計画に書いていないファイルを変更しない。気づいた問題は**報告書に書くだけ**にして、直さない。
- **スキーマ（`src/db/schema.ts`）を変更しない。** 本計画の 4 PR はいずれもスキーマ変更を必要としない。必要になったら設計が間違っているので、手を止めて報告する。
- **算定結果（点数）を変えない。** PR-H1 は「変わる場合に何件変わるか」を測るだけで、算定そのものは現状維持である。
- **外部送信のペイロードを変えない。** 電子処方箋・機器連携・UKE の出力に触らない。
- `refactor:` を名乗るコミットに挙動変更を混ぜない。

### 0.5 UI 規約（PR-H1 のみ該当）

- Vanilla CSS と CSS 変数のみ。Tailwind 等は使わない。
- 文字サイズは `--fs-*`、余白は `--space-*` トークンから選ぶ。**生の rem 値を書かない。**
- `styled-jsx` は同一ファイル内の別コンポーネントには当たらない（無言で無スタイルになる）。既存の `official-audit-*` クラスを再利用すること。
- 文言は日本語。エラー文には「何が起きたか」と「次に何をするか」を書く。

---

## 1. ベースライン実測値（2026-09-17、本計画作成時に実行して取得）

**作業開始前に自分で再取得し、一致することを確認してから着手すること。** ずれていたら、その旨を報告してから進める。

| 検証 | コマンド | ベースライン |
|---|---|---|
| 型検査 | `npx tsc --noEmit` | エラー 0 件（exit 0） |
| Lint | `npm run lint` | `✖ 11 problems (0 errors, 11 warnings)` |
| テスト | `npm test` | `tests 1702 / suites 71 / pass 1702 / fail 0`（exit 0、約 75 秒） |
| 本番ビルド | `npm run build` | 成功（exit 0） |

`npm test` は `TZ=Asia/Tokyo`・`--test-concurrency=1` 固定である（`package.json`）。この条件を変えないこと。

---

## 2. 本計画で割り当てる範囲と、割り当てない範囲

### 2.1 割り当てる 4 件

| PR | 金科玉条 第Ⅲ部 | 内容 | 挙動変更 |
|---|---|---|---|
| PR-H1 | A-3 | 剤形判定の食い違い件数と点数影響を測る画面を追加（**算定は変えない**） | 画面が 1 つ増えるのみ |
| PR-H2 | A-5 | 剤形と日数の不整合を入力監査の**警告**として追加 | 警告が増える。保存・請求は止めない |
| PR-H3 | I-2 | 運用レビュー CLI の `status` 定義を一本化し、台帳とテストで固定 | 型の統一のみ。実行時の値は変えない |
| PR-H4 | B-2 | 印刷画面の未使用重複ヘルパー削除と `any` の縮小 | なし（型と削除のみ） |

順序は **PR-H4 → PR-H3 → PR-H2 → PR-H1** を推奨する（影響範囲の小さい順）。ただし依存関係は無いので、この順でなくてもよい。

### 2.2 割り当てない項目と、その理由

**これらには手を出さないこと。** 「ついでに直しておいた」は本計画では違反として扱う。

| 項目 | 理由 |
|---|---|
| A-1 / A-2 / A-4 / B-1 / C-2 | 金科玉条で「要判断」とされ、利用者の判断が未了。A-1・A-4 は**送信・提出内容が変わる** |
| C-1（UKE 生成器の令和8年6月版置換） | critical かつ提出物が変わる。公式サンプルとの差分実測が前提で、1 人の実装者に任せる規模ではない |
| C-3（算定ルールの残パターン） | 告示・疑義解釈の**出典番号が必須**。出典を思い出しで書く危険が高く、公式資料の実取得を伴うため本計画から外す |
| C-4 / D-2 | 患者マスタの入力導線変更を伴い、スキーマ変更の可能性がある |
| D-1 / E-1 / E-2 / H-3 / I-4 | 現地端末での**人による試験証跡**が成果物。コードでは完了できない |
| F-1 / F-2 / F-3 | テンプレ承認フローの共通化可否など要判断を含む |
| G-1 | `audit_logs` の version bump を伴う。スキーマ変更は事前承認が要る（第Ⅳ部 §2-3） |
| H-1 / H-2（`patient_records`） | コレクション枠の捻出対象が未決 |
| I-1（`PrintPickingFlow` の実描画テスト化） | assert 数を減らす方向に流れやすく、**テストを弱める事故**の危険が最も高い。実描画への置換は 1 件ずつ対面で確認しながら進めたい |
| I-3（アクセシビリティ通し確認） | Puppeteer の実画面キャプチャが成果物で、「確認した」の自己申告に依存する |
| I-5（`git push`） | GitHub 側の権限付与が必要で、リポジトリ所有者の作業 |

---

## 3. PR 分割

---

### PR-H1: 剤形判定の食い違いを数える（A-3 の判断材料。算定は変えない）

#### 前提（実測済み）

`src/lib/calculator.ts:556-559`

```ts
const category = resolveDosageCategory(item);
const isExternal = category === 'external' || EXTERNAL_USAGE_PATTERN.test(usage);
const isTonpuku = !isExternal && (category === 'as_needed' || usage.includes('頓服'));
const isNaiteki = !isExternal && (category === 'internal_drop' || usage.includes('内滴') || usage.includes('内用滴剤'));
const isInjection = category === 'injection' || usage.includes('注射');
```

`resolveDosageCategory`（`src/lib/dosage_category.ts:64-75`）は **`dosageCategory` が保存されていれば `dosageCategorySource` を見ずに無条件で返す**。その結果を `EXTERNAL_USAGE_PATTERN` と OR しているため、薬剤師が手動で「内服」を指定しても、用法に `点眼` 等が含まれていれば**算定は外用として扱う**。

いっぽう帳票側は `resolveEffectiveDosageCategory`（`src/lib/dosage_category.ts:83-96`）を通し、`dosageCategorySource === 'manual'` のとき保存値を最優先する。**帳票と算定が食い違う**（第八条の違反状態、金科玉条 A-3）。

揃えると**点数が変わる**。だから本 PR では揃えない。**何件・何点動くかを測る道具だけを作る。**

#### やること

**(1) 判定の切り出し（挙動変更ゼロ）**

`src/lib/dosage_category.ts` に次を追加する。

```ts
export type DosageCategoryResolution = 'legacy' | 'respect_manual';

export interface CalculationDosageFlags {
  isExternal: boolean;
  isTonpuku: boolean;
  isNaiteki: boolean;
  isInjection: boolean;
}

/**
 * 算定側の剤形フラグ。
 * 'legacy' は 2026-09-17 時点の calculator.ts の判定をそのまま保つ（既定）。
 * 'respect_manual' は手動指定を最優先する。帳票側 (resolveEffectiveDosageCategory) と同じ扱いになる。
 * 既定を 'respect_manual' に変えてはならない。点数が変わる（金科玉条 A-3 は要判断のまま）。
 */
export function resolveCalculationDosageFlags(
  item: DosageCategorySourceItem,
  resolution: DosageCategoryResolution = 'legacy'
): CalculationDosageFlags
```

- `'legacy'` は上の 4 行と**完全に同一の結果**を返すこと。式を「整理」しないこと。
- `'respect_manual'` は、`dosageCategorySource === 'manual' && dosageCategory` のとき**その区分のフラグだけを立てる**（用法正規表現を OR しない）。手動指定が無ければ `'legacy'` と同じ。

**(2) `calculator.ts` を切り出した関数へ差し替える**

`calculator.ts:556-559` を `resolveCalculationDosageFlags(item, options?.dosageCategoryResolution)` の呼び出しに置き換える。`FeeCalculationOptions`（`calculator.ts:25-31`）に **省略可能** で足す。

```ts
/** 既定は 'legacy'。点検画面の what-if 計算だけが 'respect_manual' を渡す */
dosageCategoryResolution?: DosageCategoryResolution;
```

**渡さない限り現在と同じ結果になること。** 既存の呼び出し元は一切変更しない。

**(3) 食い違いを数える純粋関数**

`src/lib/dosage_category_conflict.ts` を新規作成する。

```ts
export interface DosageCategoryConflictInput {
  visitId: string;
  rpNumber?: number;
  itemId?: string;
  drugName?: string;
  dispensedDrug?: string;
  usage?: string;
  dosageCategory?: DosageCategory;
  dosageCategorySource?: 'auto' | 'manual';
}

export interface DosageCategoryConflictCase {
  visitId: string;
  rpNumber?: number;
  /** 算定側が現在どう扱っているか */
  calculationCategoryLabel: string;
  /** 帳票側（実効剤形）がどう扱っているか */
  printCategoryLabel: string;
}

/** 受付ごとの what-if 点数。画面が計算して渡す（DB・施設設定・患者が要るため純粋関数にできない） */
export interface DosageCategoryConflictPoints {
  visitId: string;
  /** 現行 ('legacy') で計算した点数 */
  legacyPoints: number;
  /** 手動指定尊重 ('respect_manual') で計算した点数 */
  respectManualPoints: number;
}

export interface DosageCategoryConflictReview {
  checkedItemCount: number;
  cases: DosageCategoryConflictCase[];
  /** 食い違った明細を含む受付の数 */
  affectedVisitCount: number;
  /** 点数が動く受付の数。points を渡さなかった場合は 0 */
  pointsChangedVisitCount: number;
  /** 増えた分と減った分を相殺した合計。points を渡さなかった場合は 0 */
  netDeltaPoints: number;
  /** 受付ID → 点数差（respectManual − legacy）。0 の受付は含めない */
  deltaPointsByVisitId: Record<string, number>;
}

export function buildDosageCategoryConflictReview(
  inputs: DosageCategoryConflictInput[],
  points?: DosageCategoryConflictPoints[]
): DosageCategoryConflictReview;

export function buildDosageCategoryConflictCsv(review: DosageCategoryConflictReview): string;
export function makeDosageCategoryConflictCsvFileName(now: Date): string;
export function formatDosageCategoryConflictSummary(review: DosageCategoryConflictReview): string;
```

`points` を省略しても動くこと。**点数の集計そのものはこの純粋関数の中で行い、画面側で足し算しない**（画面のロジックはテストできないため）。画面は `calculateDispensingFees` を 2 回呼んだ結果を `DosageCategoryConflictPoints[]` として渡すだけにする。

**CSV に患者名・患者ID・薬品名を含めないこと。** `src/lib/claim_rule_review.ts:290` の `buildClaimOfficialRuleReviewCsv` と同じ規約に合わせる（金科玉条 第二条）。

CSV セルの先頭危険文字の無害化は、**共有モジュール `src/lib/csv_escape.ts` の `escapeCsvCell` / `buildCsvDocument` を import して使う**こと。`claim_points_drift.ts:132` と `claim_rule_review.ts:284` にはそれぞれ**ファイルローカルの `csvCell` が別実装で存在する**（export されていない）。これは第八条の重複だが、**既存の 2 つには触らない**（挙動が変わる危険がある）。新規ファイルだけ共有モジュールを使い、重複が 3 つ目に増えないようにする。既存 2 つの統合は本計画の範囲外として報告書に書く。

**ただし共有モジュールには挙動差がある（実測）。** `csv_escape.ts:17` は `-` で始まる文字列を無条件に `'` 前置するため、`-44` は `"'-44"` になり表計算ソフトで合計できない。`claim_points_drift.ts` のローカル版は「ただの数値は数式ではない」として例外にしているが、共有モジュールにはその例外が無い。

**`csv_escape.ts` を変更してはならない**（既存の全 CSV の挙動が変わる）。代わりに、点数差の列を **「増減」（`増` / `減`）と「点数差（絶対値）」の 2 列に分ける**。これなら負号が出ないので合計できる。既存の `buildClaimPointsDriftCsv` も「符号は数値そのものが持つ／増減は次の列で言う」という近い作りになっている（`claim_points_drift.ts:155-157`）。

**(4) 画面（設定 > レセプト点検 / 公式監査）**

`src/hooks/useOfficialAuditSettings.ts` と `src/components/settings/OfficialAuditSettingsTab.tsx` に、**「請求点数の変動点検」セクションのすぐ下**に「剤形判定の食い違い点検」セクションを足す。

- 既存の `handleReviewClaimPointsDrift`（`useOfficialAuditSettings.ts:244-322`）と同じ作りにする。権限は同じく `view_official_audit`。
- 出力済みの請求に限らず、**全受付の処方明細**を対象にする（入力段階の食い違いを見たいため）。
- 点数影響は、食い違った明細を含む受付だけを対象に、`calculateDispensingFees` を **`'legacy'` と `'respect_manual'` の 2 回**呼んで差を出す。薬価は既存の `resolveClaimItemPricing` を通すこと（通さないと薬剤料が落ちて差が嘘になる。`useOfficialAuditSettings.ts:272-289` と同じ扱い）。
- 実行時に `logAuditAction` で監査ログを残す（既存に合わせる）。
- 既存クラス（`official-audit-review-workspace` / `help-text` / `btn-primary` / `btn-secondary`）を再利用し、新しい生 rem を書かない。
- `data-testid` は既存の命名に合わせて `dosage-category-conflict-section` / `-run-button` / `-csv-button` / `-summary` / `-table`。
- 画面の説明文に **「この点検は算定結果を変えません。揃えるかどうかは未決です」** と明記する。

#### やってはいけないこと

- `dosageCategoryResolution` の**既定値を変えない**。
- `calculator.ts` の判定式そのものを「整理」しない。`'legacy'` は 1 文字も意味が変わってはならない。
- `resolveEffectiveDosageCategory` / `resolveDosageCategory` の中身を変えない。
- UKE・帳票・電子処方箋の出力に触らない。

#### 受入基準

- `npx tsc --noEmit` エラー 0 件
- `npm test` 全通過（ベースライン 1702 + 新規追加分）
- `npm run build` 成功
- 新規テスト `src/lib/dosage_category_conflict.test.ts` が**本物の関数を import** して検証している
- `src/lib/dosage_category.test.ts` に `resolveCalculationDosageFlags` の `'legacy'` / `'respect_manual'` 両方の固定テストがある
- **既定が `'legacy'` であることを直接固定するテストが 1 件以上ある**（手動「内服」＋用法「点眼」の明細で、オプション未指定なら `isExternal === true` になること）
- `points` を渡した場合・渡さなかった場合の両方で `buildDosageCategoryConflictReview` のテストがある
- CSV に患者名・患者ID・薬品名が出ないことを固定するテストがある

#### 注入する変異（fail-first mutation・必須）

| # | 変異 | 期待 |
|---|---|---|
| 1 | `resolveCalculationDosageFlags` の既定引数を `'respect_manual'` に変える | 既定を固定したテストが落ちる |
| 2 | `'legacy'` 側の `isExternal` から `EXTERNAL_USAGE_PATTERN.test(usage)` の OR 項を外す | `'legacy'` 固定テストと、既存の算定テストが落ちる |
| 3 | `'respect_manual'` 側で `dosageCategorySource === 'manual'` の判定を外し、常に `dosageCategory` を優先する | `'respect_manual'` 固定テストが落ちる |
| 4 | `buildDosageCategoryConflictReview` で食い違い判定を反転する（`!==` → `===`） | 食い違い件数のテストが落ちる |
| 5 | `buildDosageCategoryConflictCsv` のヘッダに `'患者名'` 列を足して値を埋める | 個人情報を含めないことを固定したテストが落ちる |
| 6 | `netDeltaPoints` の集計を `respectManualPoints - legacyPoints` から `legacyPoints - respectManualPoints` に反転する | 点数集計のテストが落ちる |

---

### PR-H2: 剤形と日数の不整合を入力監査の警告に足す（A-5）

#### 前提（実測済み）

- 入力監査は `src/lib/prescription_input_audit.ts`。Rp グループ単位の検査は 335 行目付近（PR-G5 で入った `usage_dosage_category_mismatch` と `usage_supplement_required_*`）。
- 日数の既存検査は `days_invalid`（177 行目、`days` が数値でない／負のとき error）と `long_days_without_comment`（186 行目、90 日超で info）のみ。**剤形との整合は見ていない。**
- 数量セマンティクスの正本は `src/lib/amount_semantics.ts` の `isDailyAmountItem`：内服で `days > 0` のときだけ 1 日量、**外用・頓服・内滴・注射は総量**。

つまり外用・頓服・内滴・注射に日数が入っていても、現在は数量の解釈は正しく総量になるが、**入力そのものは誰も指摘しない**。

#### やること

`buildPrescriptionInputAudit` に **Rp グループ単位** の検査を 1 件足す。

```
code:     'dosage_days_mismatch'
severity: 'warning'
条件:     resolveEffectiveDosageCategory(代表明細) が 'external' | 'as_needed' | 'internal_drop' | 'injection'
          かつ その Rp のいずれかの明細で days > 0
title:    `Rp{n} は調剤区分「{剤形ラベル}」ですが日数が入っています`
message:  '外用・屯服・内滴・注射の数量は総量です。日数を空欄にするか、調剤区分を確認してください。このままでも保存できます。'
```

- 剤形は `resolveEffectiveDosageCategory`（帳票側の正本）を使う。**算定側の判定を持ち込まない**（PR-H1 の範囲）。
- 代表明細の選び方と `rpNumber` の取り方は、直上の `usage_dosage_category_mismatch`（`prescription_input_audit.ts:339-354`）と同じにする。
- **警告のみ。** 保存も次工程も止めない。請求前チェック（readiness）には一切足さない。
- `DOSAGE_CATEGORY_LABELS` を使う。ラベル文字列を自前で書かない。

#### やってはいけないこと

- severity を `error` にしない（強制するかどうかは要判断のまま）。
- 逆方向（内服なのに日数が空）の警告を足さない。**本 PR の対象外であり、要判断である**（§4-2）。
- `isDailyAmountItem` や `amount_semantics.ts` を変更しない。
- 既存の `days_invalid` / `long_days_without_comment` の条件を変えない。

#### 受入基準

- `npx tsc --noEmit` エラー 0 件 / `npm test` 全通過 / `npm run build` 成功
- `src/lib/prescription_input_audit.test.ts` に次の 4 ケースを足す（本物を import して検証）
  1. 外用 ＋ `days: 14` → `dosage_days_mismatch` が warning で 1 件出る
  2. 内滴 ＋ `days: 7` → 1 件出る
  3. 内服 ＋ `days: 14` → **出ない**
  4. 外用 ＋ `days: 0` → **出ない**
- 既存の監査テストの件数が減っていないこと

#### 注入する変異（fail-first mutation・必須）

| # | 変異 | 期待 |
|---|---|---|
| 1 | 条件から `'internal_drop'` を外す | ケース 2 が落ちる |
| 2 | `days > 0` を `days >= 0` に変える | ケース 4 が落ちる |
| 3 | severity を `'error'` に変える | severity を固定したテストが落ちる（無ければ足してから実測する） |
| 4 | 剤形の条件を反転し `'internal'` のときに出す | ケース 1・3 が落ちる |

---

### PR-H3: 運用レビュー CLI の `status` 定義を一本化する（I-2 の前半）

#### 前提（実測済み）

- `'pass' | 'attention' | 'blocked'` の 3 値 union が、`src/lib/` の中で **同じ内容のまま 19 個、別名で個別に定義されている**（実測。次のコマンドで再現できる）。

```bash
grep -rhoE "^export type [A-Za-z]+ = 'pass' \| 'attention' \| 'blocked';" src/lib/*.ts | wc -l
```

  `AiClinicalReviewStatus` / `BackupRestoreDrillStatus` / `ElectronicPrescriptionFieldStatus` / `EvidenceIntegrityStatus` / `MigrationPackageReadinessStatus` / `OfficialDrugLabelNoCandidateReviewStatus` / `OfficialDrugLabelQueueReviewStatus` / `OnlineEligibilityFieldGateStatus` / `PharmacyDeviceFieldStatus` / `PilotKpiReviewStatus` / `PilotOperationalReadinessStatus` / `PrintMediaVerificationStatus` / `ReleaseOpsAcceptanceStatus` / `ReleasePostReviewStatus` / `ReleaseUpdateReadinessStatus` / `ScheduledOpsContinuityStatus` / `StaffAccessRecoveryReviewStatus` / `SupportCaseDrillStatus` / `SupportIncidentSlaStatus`

  なお `MigrationTrialAcceptanceStatus` は `MigrationPackageReadinessStatus` の別名として定義済みで、既に間接的に 3 値である。**この 19 個以外を勝手に巻き込まないこと。**
- 例外が 2 件ある。
  - `ElectronicPrescriptionConnectorContractStatus = 'pass' | 'blocked'`
  - `ClaimOfficialRuleStatus = 'pass' | 'attention'`
- CLI の標準出力には `status` と `statusLabel` が載る（`npm run release:readiness` の実測で確認）。
- `src/lib/ops_review_cli.test.ts` は現在、**`ok` と exit code の一致は見ているが `status` は見ていない**（338-378 行目）。
- 台帳 `docs/ops_review_ledger.md` §0 に exit code の意味はあるが、**`status` 3 値の定義表が無い**。

#### やること

**(1) 正本の型を 1 つ作る**

`src/lib/ops_review_status.ts` を新規作成する。

```ts
/**
 * 運用レビュー CLI の判定。3 値の意味は docs/ops_review_ledger.md §0 が正本。
 * pass      … 確認が済み、次へ進んでよい
 * attention … 確認が済んでいない項目がある。業務は続けられる
 * blocked   … 進めてはならない未達がある
 */
export type OpsReviewStatus = 'pass' | 'attention' | 'blocked';

export const OPS_REVIEW_STATUSES: OpsReviewStatus[] = ['pass', 'attention', 'blocked'];

/** 台帳 §0 の終了コード規約。pass は 0、それ以外は 1 */
export function opsReviewStatusExitCode(status: OpsReviewStatus): 0 | 1;

export function isOpsReviewStatus(value: unknown): value is OpsReviewStatus;
```

**`statusLabel` の共通化はしないこと。** 各 CLI の `statusLabel` は業務ごとの文言である（実測: `release:readiness` の `blocked` は `"更新停止"`）。共通ラベル表を作って差し替えると**標準出力が変わる**。ラベルは各 CLI の現在の実装のまま残す。

**(2) 重複エイリアスを置き換える**

3 値がそろっている既存の型エイリアスを、`OpsReviewStatus` の別名にする。

```ts
export type ReleaseUpdateReadinessStatus = OpsReviewStatus;
```

- **型だけの変更にする。** 実行時の値・分岐・ラベル文字列・exit code を 1 つも変えない。
- **エイリアス名は消さない。** 呼び出し元の import を壊さないため、名前はそのまま残して中身を差し替える。
- **例外 2 件（`ElectronicPrescriptionConnectorContractStatus` / `ClaimOfficialRuleStatus`）は今のまま狭い型で残す。** 広げると、その CLI が返さないはずの値を返してもコンパイラが止めなくなる。台帳に「なぜ狭いか」を 1 行書く。

**(3) 台帳に定義表を足す**

`docs/ops_review_ledger.md` §0 に `status` の定義表を追加する。

| status | 意味 | 終了コード | 運用上の扱い |
|---|---|---|---|
| `pass` | 確認が済み、次へ進んでよい | 0 | — |
| `attention` | 未確認の項目がある。業務は続けられる | 1 | 証跡を記録して再実行 |
| `blocked` | 進めてはならない未達がある | 1 | 未達を解消するまで進めない |

**「exit 1 はクラッシュではない。Nightly CI をこれで赤にしない」** という既存の記述（§0）と矛盾しないように書くこと。

**(4) テストに契約を足す**

`src/lib/ops_review_cli.test.ts` の `for (const contract of RUNNABLE_CLIS)` ループ（338 行目）に次を追加する。

- 標準出力の `status` が `OPS_REVIEW_STATUSES` のいずれかであること（`status` を出さない CLI は `RUNNABLE_CLIS` の契約に `reportsStatus: false` を足して明示的に除外する。**黙って飛ばさない**）
- `status` と exit code が `opsReviewStatusExitCode` に一致すること
- 台帳 §0 の定義表に 3 値すべての記載があること（`ops review ledger covers every CLI exercised here` テストと同じ流儀で、台帳本文を読んで検証する）

#### やってはいけないこと

- CLI の判定ロジック・しきい値・出力 JSON の形を変えない。
- `status` を返していない CLI に新しく `status` を足さない（それは別の変更）。
- 証跡（`YAKUREKI_*_EVIDENCE`）の**保管場所と保存期間には触れない**。要判断である（§4-3）。
- `.github/workflows/nightly-ops-review.yml` を変更しない。

#### 受入基準

- `npx tsc --noEmit` エラー 0 件 / `npm test` 全通過 / `npm run build` 成功
- **CLI の標準出力 JSON が変更前後で同一であること。** 入力不要で完走する 3 本（`release:readiness` / `pilot:kpi-review` / `ai:clinical-review`）について、変更前後の stdout を保存して `diff` を取り、差分が無いことを報告に貼る（出力先 env を使い、タイムスタンプ由来のパス差だけは除外してよい。除外した旨を書く）。`support:drill` 等は入力必須なのでこの確認には使わない（`ops_review_cli.test.ts:270-278` の `REQUIRED_INPUT_CLIS`）
- 台帳に定義表があり、テストがそれを読んでいる

#### 注入する変異（fail-first mutation・必須）

| # | 変異 | 期待 |
|---|---|---|
| 1 | `opsReviewStatusExitCode` を `attention` のとき 0 を返すように変える | `opsReviewStatusExitCode` の単体テストが落ちる |
| 2 | `opsReviewStatusExitCode` を `blocked` のとき 0 を返すように変える | CLI の status↔exit code 契約テストが落ちる（まっさらな作業ツリーでは `release:readiness` が `blocked` を返すため） |
| 3 | `OPS_REVIEW_STATUSES` から `'attention'` を外す | status の値域テストが落ちる |
| 4 | 台帳 §0 の定義表から `blocked` の行を消す | 台帳検証テストが落ちる |
| 5 | `ElectronicPrescriptionConnectorContractStatus` を `OpsReviewStatus` に広げる | **落ちない可能性がある。落ちなかったらそう報告する**（型の緩和はテストで捕まらない。だから広げない） |

変異 1 は、`attention` を返す CLI がまっさらな作業ツリーに 1 本も無ければ CLI 契約テストでは捕まらない。だから **`opsReviewStatusExitCode` の 3 値すべてを直接固定する単体テストを別途書く**こと（`src/lib/ops_review_status.test.ts`）。

---

### PR-H4: 印刷画面の未使用重複ヘルパーを消し、`any` を縮める（B-2）

#### 前提（実測済み。**ロードマップ B-2 の記述は一部古い**）

金科玉条 B-2 は「`helpers.ts` の `getElectronicPrescriptionDocumentKinds` と `claim_actions.ts` の `buildItemClaimFlagPatches(item: any)` に `any` が残る」としているが、**2026-09-17 時点では両方とも型付け済み**である。

- `src/app/print/helpers.ts:323-329` … `electronicPrescription?: VisitElectronicPrescription | null` で型付け済み
- `src/app/print/claim_actions.ts:191-195` … `buildItemClaimFlagPatches(item: object, field: string, value: boolean)` で型付け済み

実際に残っているのは次の 2 種類である。

**(a) 未使用の重複ヘルパー**

`src/app/print/[visitId]/page.tsx:1139-1143` にローカル関数 `getElectronicPrescriptionDocumentKinds` が定義されているが、**同ファイル内で参照が 1 箇所（定義行）しかない**（grep 実測）。つまり呼ばれていない死んだコードである。

さらに、`helpers.ts` 版と**既定値が食い違う**。

| | 既定値 |
|---|---|
| `helpers.ts:327` | `'electronic_prescription'` |
| `page.tsx:1142` | `'prescription'` |

同じ問いに答える関数が 2 つあり、答えが違う。第八条そのものである。

**(b) `claim_actions.ts` に残る `any`（実測 8 箇所。`grep -c ": any" src/app/print/claim_actions.ts` で再現できる）**

| 行 | 対象 |
|---|---|
| 216 | `ApplyItemClaimFlagWithAuditParams.item: any` |
| 222 | `ApplyItemClaimFlagWithAuditParams.itemDoc: any` |
| 308 | `item: any` |
| 310 | `itemDoc: any` |
| 331 | `item: any` |
| 378 / 389 / 399 | `writeOverride(data: any, ...)` と `itemDoc.modify((data: any) => ...)` |

#### やること

**(1) 死んだ重複ヘルパーを消す**

`src/app/print/[visitId]/page.tsx:1139-1143` のローカル `getElectronicPrescriptionDocumentKinds` を**削除する**。

削除前に `grep -rn "getElectronicPrescriptionDocumentKinds" src/` を実行し、**その出力を報告に貼る**こと。`page.tsx` 内の参照が定義行だけであることを、自分の目で確認してから消す。

`helpers.ts` 版は残す。`page.tsx` から `helpers.ts` 版を新たに import して呼ぶ、といった**配線の追加はしない**（呼ばれていないものを呼び始めるのは挙動変更である）。

**(2) `claim_actions.ts` の `any` を型付ける**

- `item` は `object` か、既存の交差型 `PrintPrescriptionItem`（`src/app/print/types.ts:25`）の流儀に合わせる。
- `itemDoc` は RxDocument 相当の**最小限の構造的型**（`patch` / `modify` を持つ）を定義して当てる。`any` を `unknown` に置き換えただけで済ませない。
- `writeOverride(data: any)` は、扱っているプロパティだけを持つ型にする。
- **架空のフィールドを型に追認させないこと。** 実際に読み書きしているプロパティだけを型に書く。型を通すために存在しないフィールドを型定義へ足すのは禁止（引き継ぎ書 §9 の決定）。
- 型付けが難しい箇所が残ったら、**`any` のまま残して報告に書く。** 無理に押し通して挙動を変えるより良い。

#### やってはいけないこと

- 実行時の挙動を 1 つも変えない。これは純粋に型と削除の PR である。
- `helpers.ts` の `getElectronicPrescriptionDocumentKinds` の既定値（`'electronic_prescription'`）を変えない。**電子処方箋の送信内容に効く可能性がある**（`usePrintElectronicPrescription.ts:102, 268` から呼ばれている）。
- `usePrintElectronicPrescription.ts` に触らない。

#### 受入基準

- `npx tsc --noEmit` エラー 0 件 / `npm test` 全通過 / `npm run build` 成功
- `npm run lint` の warning が **11 件から増えていない**
- **mutation は不要**（挙動を変えないため）。代わりに次の 2 つを報告に貼る
  1. 削除前の `grep -rn "getElectronicPrescriptionDocumentKinds" src/` の出力
  2. 削除後の同じ grep の出力
- `src/app/print/claim_actions.ts` の `: any` の残数を、変更前（8 箇所）と変更後で数えて報告する。0 にならなくてよい。**残した理由を書くこと。**

---

## 4. 要判断事項（Gemini が決めてはならない）

本計画の範囲内で「決めたくなる」が、**決めてはならない**もの。実装せず、報告書の末尾に列挙して返すこと。

1. **算定側の剤形判定を手動指定尊重へ揃えるか**（金科玉条 A-3）。PR-H1 は件数と点数影響を測るところまで。揃えるかどうかは、その数字を見て利用者が決める。
2. **内服なのに日数が空欄の入力を警告するか**（PR-H2 の逆方向）。一包化・頓用的な内服など、空欄が正しい場合があり得るため、誤警告の評価なしに足さない。
3. **「内滴に日数を入れない」を強制するか、警告にとどめるか**（金科玉条 A-5 の要判断）。PR-H2 は警告のみで実装する。
4. **運用レビュー証跡（`YAKUREKI_*_EVIDENCE`）の保管場所と保存期間**（金科玉条 I-2 の要判断）。PR-H3 は status 定義の統一までで、保管ルールには触れない。
5. **`ElectronicPrescriptionConnectorContractStatus` と `ClaimOfficialRuleStatus` を 3 値へ揃えるか**。PR-H3 は狭いまま残す。揃えると、その CLI が返さないはずの値をコンパイラが止めなくなる。

---

## 5. 報告フォーマット

PR ごとに次を書く。**推測を断定形で書かない。**

```
## PR-Hx: <タイトル>
- コミット: <hash>
- 変更ファイル: <一覧>

- npx tsc --noEmit:
  <出力をそのまま貼る。0 件なら「出力なし / exit 0」と書く>

- npm test:
  <末尾の集計行 ℹ tests 〜 ℹ duration_ms をそのまま貼る>

- npm run build:
  <成功/失敗と、失敗ならエラー全文>

- npm run lint:
  <✖ N problems (N errors, N warnings) の行>

- mutation 実測:
  | # | 変異 | 実測 fail 数 | 落ちたテスト名 | 戻した後 |
  |---|---|---|---|---|
  <指定された変異をすべて。落ちなかったものは「0 件（落ちなかった）」と書く>

- 挙動変更の有無: <あり / なし。あるなら変更前後を並べる>

- 仕様確認の出典: <確認できなかった項目は「未確認」と明記>

- 未実施・できなかったこと: <正直に書く。無ければ「なし」>

- 気づいたが直さなかったこと: <本計画の範囲外で見つけた問題。直さずここに書く>
```

## 6. 受け取り側の検証手順（依頼者が実行する。Gemini は関与しない）

提出物は、報告書を信用せず次の手順で検証する。

1. `git log --oneline` で 1 PR = 1 コミットになっているか確認する
2. `git diff` で、本計画に書いていないファイルが変更されていないか確認する
3. `npx tsc --noEmit` / `npm test` / `npm run build` / `npm run lint` を**こちらで再実行**し、報告の数値と一致するか確認する
4. 各 PR の指定変異を**こちらで 1 件ずつ注入**し、報告の fail 数と一致するか確認する
5. 新規テストが本物の関数を import しているか（テスト内でロジックを再実装していないか）を目視する
6. PR-H1 は実画面（設定 > 公式監査）で点検ボタンを押し、件数と CSV を確認する
7. PR-H3 は CLI の stdout 差分を自分で取り直す

---

## 付録: 参照する既存コード

| 目的 | ファイル |
|---|---|
| 剤形判定の正本 | `src/lib/dosage_category.ts` |
| 算定の剤形フラグ | `src/lib/calculator.ts:536-605` |
| 数量セマンティクス | `src/lib/amount_semantics.ts` |
| 入力監査 | `src/lib/prescription_input_audit.ts` |
| 点数変動点検（UI の雛形） | `src/lib/claim_points_drift.ts` / `src/hooks/useOfficialAuditSettings.ts:244-333` / `src/components/settings/OfficialAuditSettingsTab.tsx:207-287` |
| 個人情報を含めない CSV の書き方 | `src/lib/claim_rule_review.ts:290-330` |
| CSV エスケープの共有モジュール | `src/lib/csv_escape.ts` |
| 印刷画面の交差型 | `src/app/print/types.ts:25` |
| 運用レビュー CLI の契約テスト | `src/lib/ops_review_cli.test.ts` |
| 運用レビュー台帳 | `docs/ops_review_ledger.md` |
| 行動規範 | `.agents/AGENTS.md` |
| 上位文書 | `docs/golden_rules_and_roadmap.md` |
