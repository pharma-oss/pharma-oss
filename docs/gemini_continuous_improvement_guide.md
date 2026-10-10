# Gemini 向け 継続改善ガイド

- **作成**: 2026-10-11（実測の基準コミット: `898fa43`、`main`、作業ツリーはクリーン）
- **性質**: 単発の計画書ではなく、**毎回の起動で最初に読ませる常設の運用書**。改善テーマは起動プロンプトで指定されるか、§4 の掃引メニューから選ぶ。
- **上位文書（矛盾したらこちらが優先）**: `.agents/AGENTS.md` → `.agents/skills/honest-verification/SKILL.md` → `docs/golden_rules_and_roadmap.md` 第Ⅰ部（十箇条）と第Ⅳ部（実装方針）。
- **この文書を編集しない**。気づいた改善点は報告に書く。

---

## 0. 最初にやること

**あなたは毎回まっさらな状態で起動される。** 前回の記憶は無い。状態はすべて git と実測値にある。

1. 次の 4 つを、この順に読む: `.agents/AGENTS.md`、`.agents/skills/honest-verification/SKILL.md`、金科玉条 第Ⅰ部、本書。
2. `git status --short` を実行する。**本書自身（`docs/gemini_continuous_improvement_guide.md`）以外の行が 1 つでもあれば止まる。** 他の人（利用者や別のエージェント）の未コミット変更の可能性があり、上書きしてはならない。何が変更されているかだけを報告して終わる。
3. §5 のゲートを**変更を加える前に**実行し、ベースラインを取る。本書の値とずれていたら、そのこと自体を最初に報告する（直さない）。
4. §4 でテーマを決める。起動プロンプトにテーマの指定があればそれに従う。

**1 回の起動 = 1 テーマ = 1 コミット。** 報告を出したら止まる。起動プロンプトが複数テーマを明示したときだけ複数コミットにしてよいが、テーマごとに §5 のゲートを回し、前のテーマのゲートが赤なら次へ進まない。

---

## 1. 1 サイクルの流れ

```
 準備(§0) → テーマ選定(§4) → 宣言 → 実装 → ゲート(§5) → 変異(§6) → コミット(§9) → 報告(§10) → 停止
```

**宣言**: 実装に入る前に、次の 4 点を 5 行以内で書き出す（後で報告にそのまま使う）。

- 対象: 何を直すか（1 文）
- 触るファイル: 一覧。**ここに無いファイルは触らない**
- 触らないもの: 近くにあるが範囲外のもの
- 変異: 「この行をこう壊したらこのテストが落ちるはず」を 2 件以上

**途中で止まる条件**（どれか 1 つでも当たったら、実装を中断して、わかったことを報告して終わる）:

- ベースラインのゲートが赤い
- 修正に §3 の「提案して止まる」項目が必要になった
- 触るファイルが 8 個、または変更行が 400 行を超えそうになった（テーマが大きすぎる）
- 同じエラーに 3 回挑戦して直らない
- 指定した変異を入れてもテストが 1 件も落ちず、テストを直しても落ちるようにできない

**ゲートを通すために次のことをしてはならない**: 型を `any` やオプショナル（`?`）に緩める、テストの期待値を変える、`assert` を消す、`skip` を付ける、`eslint-disable` を足す。通らないなら、通らないと報告する。

---

## 2. 絶対規則（違反した提出物は内容を読まずに差し戻す）

### 2.1 実行したことだけを報告し、証拠は実行の生出力から引く

過去にこのリポジトリで起きたこと: ターミナル出力そのものの捏造（存在しないテストファイル名 17 個、バージョン番号の相違）、mutation 表に書かれた「落ちたテスト名」が実在しない、報告に書かれた CLI パスが存在しない、grep 出力が丸ごと架空。**コードは本物だったのに、報告の証拠だけが偽造された回が複数ある。** 偽造は、コードが正しくても、そのサイクル全体の差し戻し理由になる。

したがって:

- 各ゲートの出力は**ファイルに保存**する（§5 のコマンドをそのまま使う）。報告の数字・テスト名・grep 結果は、**そのファイルから引く**。手で打ち直さない。
- 出力を貼れないものは「実行できなかった」と書く。**推測で「通るはず」と書かない。**
- 報告に書くテスト名は `grep -n "test('" <ファイル>` で実在を確認してから書く。
- 報告に書く grep 結果は、報告を書く時点で**もう一度実行**した出力を使う。

### 2.2 偽カバレッジの禁止

- テストの中で対象ロジックを `.filter()` 等で再実装して「テストした」ことにしない。対象は純粋関数として `export` し、**本物を import** する。
- 「テストを追加した」と書く前に、そのテストファイルが対象のモジュールを import していることを `grep -n "^import" <テスト>` で確認する。
- `typeof X === 'function'` だけのテストを「描画を検証した」と呼ばない（現在 0 件。増やさない）。
- 「全体で N 件通った」は、そのモジュールの正しさの根拠にならない。

### 2.3 変異を実測する。ただし「指定した変異が全部落ちた」は十分の証明ではない

§6 の 4 手順を実際に実行して表で報告する。**落ちなかったら「落ちなかった」と書き、テストの方を直す。** 落ちていないのに「落ちた」と書くのが、このリポジトリで最も重い違反である。

### 2.4 数字は実測の差で書く

コミットメッセージと報告に書く件数は、`ℹ tests` の**前回合計 → 今回合計の差**と、新規テストファイルごとの `ℹ tests N` で照合してから書く。記憶で「それらしい件数」を書かない（レビュアー自身も 7 件を 9 件と誤記して直した）。

### 2.5 食い違いを指摘されたら、記録ではなく実測を直す

過去に「9 件では」と指摘されて、9 件目を実行せずに記録の数字だけ 8 → 9 に書き換えた例がある（実際は 9 件目は原理的に検出不能で、8 が正しかった）。件数や結果の食い違いを指摘されたら、**まず実測し直し、記録を実測に合わせる。**

### 2.6 頼まれていないことをしない

- 宣言した「触るファイル」以外を変更しない。気づいた問題は**報告に書くだけ**にして、直さない。
- `refactor:` を名乗るコミットに挙動変更を混ぜない。
- **ドキュメントに「対応完了」と書くのは、コード・`tsc` 0 件・本物のテスト通過・（画面があれば）実画面確認がそろった後だけ。**
- `docs/golden_rules_and_roadmap.md` は編集しない（第Ⅱ部の実測値が古くなっているのは把握済みで、更新はレビュアーが行う）。

### 2.7 方針が変わった直後は、計画が古い方を向いていないか確認する

利用者が起動プロンプトで方針を変えたとき、過去の指摘や本書の記述より**新しい指示を優先**する。実装前に「宣言」が新しい方針に沿っているかを読み返す。

---

## 3. 自律してよいこと／提案して止まること／絶対にしないこと

### 自律してよい（§4 の範囲内に限る）

- 失敗が利用者に伝わらない箇所に、日本語の通知（何が起きたか＋次に何をするか）を足す
- 書き込みの戻り値・結果を検査して、失敗を例外・通知にする
- 型を足して `any` を消す（足した型が本当の不整合を暴いたら、直さず報告 — §7）
- 呼び出し元が 0 件だと**実測した**死コードの削除
- 既存の純粋関数を切り出して本物のテストを足す
- 文字サイズを `--fs-*` トークンへ寄せる（実画面確認が条件 — §8）

### 提案して止まる（報告の「判断を仰ぐ点」に書き、実装しない）

- スキーマの追加・`version` の bump（`src/db/schema.ts`）
- **算定結果（点数）・UKE 出力・電子処方箋や機器連携の送信ペイロードが変わる変更**
- 権限（`canUserPerform` の判定）の追加・変更
- 警告の重大度の変更（warning → error、または警告を消す）
- 同期・競合解決の挙動
- 文言以外の画面導線（ボタンの追加・削除・移動）
- 新しい npm 依存の追加
- テストの `assert` 数を減らす変更
- 金科玉条で「判断待ち」「現地証跡待ち」とされた項目（§4.4）

### 絶対にしない

- `git push`、`--force`、`git reset --hard`、`--no-verify`
- `.env*` の内容の出力・コミット、IndexedDB / DB の削除
- 監査ログのハッシュチェーン（`audit_integrity.ts`）を弱める変更
- 実患者データを使った検証
- 金科玉条 第Ⅰ部の変更

### 既に決着していて、再び指摘・変更しないこと

- OCR 画面の患者統合に権限チェックが無い件は、**事務職が受付画面から患者を統合・削除してよい**と決定済み。権限は足さない。
- 公式 UKE の YK レコードの登録番号は変更しない。
- `useSessionLock`、`demo_data`、設定画面の初回セットアップ CSV/メモの `await logAuditAction(` は意図的に戻り値を見ていない。
- バックアップ復旧後の監査ログ失敗は、災害復旧を止めないため取り消さず警告にしている（意図的）。
- 算定側の `isExternal = category === 'external' || EXTERNAL_USAGE_PATTERN.test(usage)` の OR は、保存値が腐った明細に対する唯一の防波堤。**外さない。**

---

## 4. 何に取り組むか

### 4.1 選び方

金科玉条 第Ⅲ部 §0 の優先順位に従う: **臨床安全 > 請求の正確性 > データ保全 > 本番接続の証跡 > 現場の運用効率 > コード品質。** 迷ったら、影響範囲（触るファイル数）の小さい方を先にする。

### 4.2 掃引メニュー

過去の監査で「画面は成功と言うが実際は失敗していた」型のバグが繰り返し見つかっている。**同じ型の取りこぼしを、機械的に探して潰す**のが継続改善の主軸である。

**探すコマンドは、この直後のコードブロックをそのままコピーして使う**（表の中に書き写さない）。件数は `898fa43` での実測。テーマを選ぶ前に自分で再実行して一致を確認する。

```bash
# 共通: テスト除外は grep -v '\.test\.'
echo "SW-B bulkInsert の呼び出し:"
grep -rnE 'bulkInsert\(' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
echo "SW-D UTC で日付を切る箇所:"
grep -rnE 'toISOString\(\)\.slice\(0, *10\)' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
echo "SW-A 12px 未満の生 font-size（印刷ページ除外）:"
grep -rnE "font-?[sS]ize:[[:space:]]*['\"]?0\.([0-6][0-9]*|7[0-4][0-9]*)rem" src --include='*.css' --include='*.tsx' --include='*.ts' | grep -v -E '\.test\.' | grep -vi print
echo "SW-E any:"
grep -rnE ':[[:space:]]*any\b' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | wc -l
grep -rnE 'as any\b' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | wc -l
```

| ID | 探すもの | 実測 | 直し方・注意 |
|---|---|---|---|
| **SW-B** | `bulkInsert` の戻り値を見ない書き込み。RxDB の `bulkInsert` は個別の失敗を**例外にせず** `{ success, error }` を返すので、一部が欠けても画面は成功と言う | 呼び出し 6 件のうち **1 件**: `src/app/inventory/components/LocationMaster.tsx:92`（棚番の一括作成。戻り値を捨てたまま入力欄をリセットする）。他の 5 件は検査済み（`src/db/index.ts` の `assertBulkWriteSuccess` は同ファイル内の関数で未 export） | `result.error` を検査し、失敗なら**欠けた件数を利用者に伝える**（`alert` は同ファイル内の既存の流儀）。成功した分を戻すかは宣言に書く。実 RxDB の挙動で確かめるテストを書く（`RxLikeStore` は §7） |
| **SW-D** | UTC の日付で「今日」「受付日」を作る | 9 件。うち 8 件は往復検証（実在日付の確認）か開発用スクリプト・説明コメントで**正しい**。残り 1 件が `src/app/print/helpers.ts:140` の `toDateOnly`（UTC で日付を切る。`src/` の非テストコードに**呼び出しが無い**。`src/app/print/[visitId]/page.tsx:112` で import されているだけ） | 呼び出し 0 件を `grep -rn "toDateOnly" src` で再確認 → 関数・未使用 import・それだけを検査するテスト（`helpers.test.ts`、`PrintPickingFlow.test.ts` の該当 assert）を削除。**削除したテスト・assert の数を報告に明記**。他ファイルの同名関数（`dead_stock.ts`、`drug_price_history.ts`）は別物なので触らない |
| **SW-A** | 12px 未満の生の `font-size`（`--fs-2xs` の 12px が下限） | **14 件／3 ファイル**: `emr/components/SoapComponents.tsx` 4、`ocr/page.tsx` 7、`inventory/inventory.css` 3（`0.65`〜`0.74rem`） | `var(--fs-2xs)` へ。**見た目が変わる**ので §8 の実画面確認（1280/768/375px）が条件。`SoapComponents.tsx` と `ocr/page.tsx` の CSS は `<style jsx>` で、同一ファイル内の別コンポーネントには当たらない（無言で無スタイルになる）。**0.75rem 以上 1rem 未満の生値 49 件は別テーマ**（トークンに寄せると見た目が動く）。1rem 以上（見出し）と印刷ページ（`print.css`、`print/[visitId]`）は対象外 |
| **SW-C** | 失敗が利用者に伝わらない `catch` | 付録 A のスクリプトで**候補 182 件**（通知・再 throw・エラー状態のセット等が無い `catch`。`src/lib` 51、`src/lib/sync` 24、`src/hooks` 19、`src/db` 10、…） | **182 件を一括で直さない。** 精度は高くない（localStorage の失敗の無視、取り消し失敗の二次ログ、再試行の経路など、意図的なものが多い）。1 テーマ 3〜5 件に絞り、各件を次の 3 つに分類してから動く: **(a) 利用者の操作による書き込み・書き出しの失敗**→ 通知必須（これだけ直す）／**(b) 読み込み失敗**→ 空表示と区別がつかないなら通知／**(c) 二次的なログ**→ 直さない。分類結果は報告の表にする |
| **SW-E** | `any` の縮小（`as any` は取り違えを隠す目印） | `: any` 294 件、`as any` 41 件 | **1 ファイル（または 1 フック）単位**。型を足した結果 `tsc` が本当の不整合を出したら、**それを直すのは別コミット（`fix:`）で、報告に「型で暴かれた不整合」として書く**。`refactor:` に混ぜない。型を緩めて通すのは禁止 |
| **SW-F** | **回帰ガード（減らす対象ではなく、悪化させない対象）** | 下のコードブロックの 5 つの数字 | **どのテーマの前後でも実行し、報告に書く。** 1 つでも悪化したら、そのコミットは認めない |

SW-F は次のコードブロックをそのまま実行する。基準値は 3 / 4 / 5 / 0 / 0（この順に出力される）。

```bash
echo "インライン style={{ (基準 3):"
grep -rnE 'style=\{\{' src --include='*.tsx' | grep -v -E '\.test\.' | wc -l
echo "process.env を直接参照する lib/env.ts 以外のファイル数 (基準 4):"
grep -rlE 'process\.env' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.|lib/env\.ts' | wc -l
echo "戻り値を捨てる await logAuditAction( (基準 5。§3 の意図的な 5 件):"
grep -rnE '^[[:space:]]*await[[:space:]]+logAuditAction\(' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | wc -l
echo "typeof X === 'function' だけのテスト (基準 0):"
grep -rnE "typeof [A-Za-z_.]+ === 'function'" src --include='*.test.ts' --include='*.test.tsx' | wc -l
echo "@ts-ignore / @ts-expect-error / @ts-nocheck (基準 0):"
grep -rnE '@ts-(ignore|expect-error|nocheck)' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | wc -l
```

### 4.3 初回サイクルの推奨順

1. **SW-B**（1 ファイル・データの欠落が見えない型・影響が最小）
2. **SW-D**（死コード削除。挙動変更なし）
3. **SW-A**（実画面確認が要る。1 画面ずつ別コミットにしてよい）
4. **SW-C**（分類が要る。(a) のみ）
5. **SW-E**（1 ファイルずつ）

### 4.4 着手しない領域

金科玉条 第Ⅲ部の「実施順序の目安」で次の状態とされた項目は**すべて対象外**。「ついでに直した」も違反として扱う。

- 挙動・対象の判断待ち（A-1 / A-2 / A-4 / B-1 / C-2 / F-1 / F-3 / G-1 / H-1 / H-2）
- 公式資料・症例待ち（C-3: 告示・疑義解釈の出典番号が必須。思い出しで書かない）
- 現地証跡・実データ待ち（D-1 / E-1 / E-2 / F-4 / H-3 / H-4 / I-4）
- リモート状態の確認が要る（I-5: `git push` はしない）
- **I-1（`PrintPickingFlow.test.ts` の実描画化）**: `assert` 数を減らす方向に流れやすく、テストを弱める事故の危険が最も高い。1 件ずつ対面で確認しながら進める項目

### 4.5 見つけたが直さないもの

範囲外の問題を見つけたら、**直さずに**報告の「触らなかったが気づいた点」へ書く。書くときは、ファイル・行・再現手順・「なぜ問題か」を 1 件 3 行以内で。推測は推測と書く。

---

## 5. ゲート

**必ず次のコマンドをそのまま使う**（出力が `$OUT` に残り、報告はそこから引く）。ゲートは直列に実行し、`npm run build` の実行中にソースを触らない。

```bash
OUT=/tmp/pharma-improvement/$(date +%Y%m%d-%H%M); mkdir -p "$OUT"
npx tsc --noEmit        > "$OUT/tsc.txt"   2>&1; echo "exit $?" >> "$OUT/tsc.txt"
npm run lint            > "$OUT/lint.txt"  2>&1; echo "exit $?" >> "$OUT/lint.txt"
npm test                > "$OUT/test.txt"  2>&1; echo "exit $?" >> "$OUT/test.txt"
npm run build           > "$OUT/build.txt" 2>&1; echo "exit $?" >> "$OUT/build.txt"
tail -n 12 "$OUT/test.txt"; grep -E "^exit" "$OUT"/*.txt
```

ベースライン（`898fa43`、2026-10-11 実測。**作業開始前に自分で取り直して一致を確認する**）:

| 検証 | コマンド | ベースライン |
|---|---|---|
| 型検査 | `npx tsc --noEmit` | 出力なし、exit 0 |
| Lint | `npm run lint` | 問題行なし、exit 0（警告 0 件） |
| テスト | `npm test` | `ℹ tests 2171` / `ℹ suites 106` / `ℹ pass 2171` / `ℹ fail 0` / `ℹ cancelled 0` / `ℹ skipped 0`、exit 0、約 68 秒 |
| ビルド | `npm run build` | exit 0、静的ページ 28 本（`Generating static pages … (n/28)`）。複数 lockfile によるルート推定の警告と Node.js SQLite の実験機能警告は既知 |

注意:

- **`npx tsx --test` は型検査をしない**（esbuild の変換のみ）。テストが通っても型は保証されない。`tsc` を**単独で**実行する。
- `npm test` は `TZ=Asia/Tokyo`・`--test-concurrency=1` 固定（`package.json`）。この条件を変えない。
- 特定のテストだけ回すとき: `TZ=Asia/Tokyo npx tsx --test <ファイル>`。
- テストが 1 本でも失敗したら、`ℹ fail` の数字ではなく、**失敗したテスト名**を報告する。

---

## 6. 変異テスト（fail-first mutation）

各テーマで、宣言した変異を**実際に**注入する。

1. 変異を 1 行ソースへ注入する（例: `sed` や `python3` の 1 行置換）
2. **対象のテストファイルだけ**を実行し（上記の特定実行）、落ちたテスト名と件数を実測する
3. `git checkout -- <ファイル>` で戻す
4. 同じテストを実行し、pass に戻ることを実測する

変異は **`npm run build` が完走した後**に当てる（build 中にソースを触ると壊れる）。1 件 30〜60 秒。

**「指定した変異が全部落ちた」は、テストが十分という意味ではない。** 過去に、指定した 4 つの変異はすべて検出されたのに、**変異が当たらない軸**（屯服 `as_needed` だけ表示ラベルの突き合わせが壊れていた）にテストが無く、バグが緑のまま通った。そのため、宣言に次を加える:

- 変異が**当たらない軸**を自分で 1 つ以上挙げ、その軸でテストが緑のまま壊れうるかを検討して報告に書く
- 判定に複数の分岐（列挙値）があるなら、**各分岐に 1 件ずつ**フィクスチャを入れる

---

## 7. この repo で実際に起きた落とし穴

テストが全件緑のまま通ったものばかり。新しい書き込み・日付・描画・剤形判定を触るときは、該当する項を読んでから書く。

### RxDB の書き込み

- **同じインスタンスで `patch()` を 2 回呼ぶと必ず `CONFLICT`**。「書いて、監査が残らなければ同じ doc で戻す」取り消しは、実 RxDB では全部失敗していた。**取り消しは `src/lib/rxdb_restore.ts` の `restoreFields`（incrementalPatch）か `restoreWith`**。通常の書き込みは `patch()` のまま（他端末の変更を CONFLICT で検出するため）。
- **`patch()` は「無い項目」を消さない。** 統合などで項目が補われた記録を元に戻すときは `doc.incrementalModify(() => ({ ...record }))`（`undefined` を書くとキーが残る）。
- **複数文書の一括書き込み**は `applyReversiblePatches`（失敗したら前半を戻す）と `undoAppliedPatchesNote`（戻せなかったら警告文）。
- **`bulkInsert` は個別の失敗を例外にしない**。`{ success, error }` を検査する。戻すのは `success` に入った ID だけ。
- **`upsert` / `bulkUpsert` は文書を丸ごと置き換える。** 書き戻す項目を列挙してコピーすると、列挙し忘れた項目が更新のたびに消える（納品書取込が `priceHistory`・発注点などを消していた）。全体を書き戻すなら `drugRecordFromDocument`（`src/lib/drug_record.ts`）、在庫数だけなら `patch`。
- **`doc.claimLifecycle` のような入れ子の値は、開発ビルドで `structuredClone` できず `DOC24` で失敗**する。複製は `doc.toJSON().field` か `plainCopy`（`rxdb_restore.ts`）。Node のメモリストレージでは再現しない（再現は `rxdb_plain_copy.test.ts` の dev-mode プラグインか実ブラウザ）。
- **取り消し・復元のテストは `src/lib/test_support/rxdb_like_doc.ts` の `RxLikeStore` で書く。** 偽ドキュメント（`patch: async (v) => Object.assign(state, v)`）は版の性質を持たず、壊れた取り消しがテストを通る。書いた後は `restoreFields` を `patch` に戻して**テストが落ちること**を確かめる。
- **スキーマにプロパティを足したら `version` を +1**（ただし §3 で「提案して止まる」）。上げ忘れてもテストは緑で、壊れるのは既存ユーザーの DB だけ。

### 監査ログ（`src/lib/audit_guard.ts`）

新しい書き込み・書き出しを足すときは、**先に 3 種のどれに当たるかを決める**:

| 種類 | 関数 | 振る舞い |
|---|---|---|
| 書き出し（CSV・ファイル・クリップボード） | `exportWithAuditFirst` | 監査 → 持ち出し。監査が失敗したら書き出さない |
| 書き込み | `runWithAuditRollback`（単一文書は `patchWithAuditRollback`） | 書込 → 監査。失敗したら元に戻す。戻せなければ `rollbackFailed` |
| 点検・結果の記録 | `recordAuditOrNotify` | 止めない。**記録が残らなかったことを通知する** |

`await logAuditAction(...)` の戻り値を捨てない（§4.2 SW-F）。「記録しました」と画面に出す前に、戻り値で分岐する。

### 日付

- `new Date().toISOString().slice(0, 10)` は **UTC の日付**。日本時間の 0:00〜8:59 は前日になる。「今日」は `toLocalDateKey()`、保存値（受付日時の ISO 文字列など）は `toLocalDateKeyFromValue()`（`src/lib/local_date.ts`）。
- `npm test` は `TZ=Asia/Tokyo` だが、既存テストの時刻は `T09:00` で UTC も同日になるため、**朝 9 時前だけの不具合は検出されなかった。** 日付のテストは `new Date(2026, 9, 8, 8, 30)` のようにローカル時刻で組み立て、**朝（0:30 / 8:30）と夜（23:59）の両方**を確認する。

### 剤形・数量

- `resolveDosageCategory` は**保存済み `dosageCategory` があれば無条件で返す**。保存値と用法が食い違う明細（古い保存値）で壊れる。剤形を触るテストには、**保存値と用法が食い違うフィクスチャ**を必ず入れる。手動指定を尊重する層は `resolveEffectiveDosageCategory`。
- **表示ラベルで剤形を比較しない。** `DOSAGE_CATEGORY_LABELS.as_needed` は `'屯服'`（屯）だが、算定側のフラグ名 `isTonpuku` から素朴にラベルを作ると `'頓服'`（頓）になり、屯服が全件「食い違い」になる。比較は `DosageCategory` の列挙値で行い、ラベルは表示の直前にだけ引く。
- 単位が無いときに `|| '錠'` のように補完しない（`amount_semantics.ts`）。

### 描画テスト

- `renderToStaticMarkup` の出力には、`<style jsx>` の **CSS 本文が素のまま `<style>…</style>` として入る**。`html.includes('is-danger')` は CSS セレクタに当たり、肯定は DOM に無くても通り、否定は誤って落ちる。**`html.replace(/<style[\s\S]*?<\/style>/g, '')` で除去してから**検証する。`disabled` は `disabled=""` で照合する。
- `Received true for a non-boolean attribute jsx` の警告は無害。
- 変異で「クラス名を変えたら落ちるか」を 1 件は確かめる。
- `useRouter` などで静的描画できないものは、純粋関数（判定＋文言）と表示専用の `…View` に分けてテストする。

### スタイル

- Vanilla CSS と CSS 変数のみ。**Tailwind 等は使わない。** 文字サイズは `src/app/globals.css` の `--fs-2xs`(12px) / `--fs-xs`(13px) / `--fs-sm`(14px) / `--fs-md`(15px) / `--fs-base`(16px)、余白は `--space-*`。**生の rem を書かない。**
- `styled-jsx` は**書かれたコンポーネントのスコープにしか効かない**。同一ファイル内の別コンポーネントに同じクラス名を付けても、エラーも警告も出ず無スタイルになる。複数コンポーネントで共有するクラスは `globals.css` へ、ただし `.insurance-modal .modal-header` のように固有の祖先クラスで囲う。
- 文言は日本語。エラー文は「何が起きたか」と「次に何をするか」を書く。英語のエラーをそのまま出さない。

### 分割・モジュール化（`refactor:` の検証）

過去、巨大ページの分割で元のロジックが取り違えられ、`tsc`・build・既存テストが全部緑のまま回帰した（印刷時の薬剤師確認 6 種中 5 種が消えた、など）。`refactor:` を名乗るなら、**初期リリース `8091090` の元ページ（`git show 8091090:src/app/<page>.tsx`）と突き合わせる**: 元ページの日本語文言が現在の `src` 全体に残っているか、`build*/format*/make*` の呼び出しの引数の数、`make*FileName` の出力形式、元ページが import していた関数が今どこからも使われていないか。

---

## 8. 画面を変えるときの実画面確認

単体テストで見えないバグ（保存されない、常に null、常に空）は実画面でしか見つからない。**見た目や操作が変わるテーマ（SW-A など）は、実画面確認が完了条件。** 「確認した」の自己申告ではなく、**何を操作して何を見たか**を報告に書く。

- 開発サーバ: `npm run dev`（:3000）。起動直後は初回コンパイルで遷移がタイムアウトするので、先に主要ページを一度開いて温める。
- 幅 **1280 / 768 / 375px** の 3 つで確認し、横スクロールのはみ出しが 0px であること。既存の通しドリル: `node scripts/run_e2e_accessibility_drill.mjs`。
- 印刷帳票の回帰: `npm run test:e2e:print-layout`（**dev サーバ必須。`next start` では動かない**）。`element.boundingBox()` が 180 秒でハングすることがあるが、**コードの回帰と決めつけない**。失敗時も `artifacts/print-layout-regression/<stamp>/page.html` は保存されるので、中身は grep で確認できる。
- onboarding E2E: `YAKUREKI_E2E_AUTO_SEED=1 node scripts/runOnboardingE2E.mjs`（dev サーバ必須）。初回は各ページのコンパイル待ちで「missing selectors」になりやすい。失敗時の `page.html` に中身が出ていればタイミング失敗なので、そのまま再実行する。
- Puppeteer の詰まりどころ:
  - `page.click(selector)` は画面下方の要素でハングする → `page.$eval(sel, el => el.click())`
  - `window.confirm` を出すボタンを `page.evaluate` の中から押すと詰まる → `page.on('dialog')` を付け、evaluate の**外**から押す
  - 値を入れて blur させるときは、先に `el.focus()` を呼ぶ（フォーカスが無いと `onBlur` 保存が動かない）
  - Chrome が見つからないとき: ダウンロードせず `PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
  - 医薬品マスター CSV は Shift_JIS で読まれる（UTF-8 だと列名照合に失敗する）
  - スクリプトはプロジェクト直下に置かないと `node_modules` を解決できない。**終わったら消す。**
- 書き込み失敗の再現: `crypto.subtle.digest` を reject させると「監査ログが残らない」状況を作れる。ただし `page.goto` のたびに元に戻るので、遷移した後に入れ直す。`db.<collection>.bulkInsert` を差し替えれば、一括書き込みの部分失敗を再現できる。利用者に何も出ない失敗は、`alert` と `[data-sonner-toast]` と pageerror を見て確かめる。

---

## 9. コミット

- **1 テーマ = 1 コミット。** `feat(scope):` / `fix(scope):` / `refactor(scope):` / `test(scope):` / `docs:` / `chore(scope):`。**メッセージは英語**、1 行目は「利用者や読む人にとって何が変わるか」を書く（直近の例: `fix(inventory): show drugs with negative stock in the inventory list and count them in the warning`）。
- コミット前に `git status --short` と `git diff --stat` を実行し、**宣言した「触るファイル」以外が入っていないこと**を確認する。`git add` はファイルを名指しする（`-A` / `.` は使わない）。
- 本文に件数を書くときは §2.4 の照合を終えた数字だけ。
- 全ゲートが緑になる前にコミットしない。**`git push` はしない。**

---

## 10. 報告フォーマット

最終メッセージに次をそのまま埋めて出す。推測を断定形で書かない。

```
## <テーマID>: <タイトル>

- コミット: <hash>（`git log -1 --format=%h` の出力）
- 変更ファイル: <`git show --stat <hash>` の出力>
- 宣言した「触るファイル」との差: <無ければ「なし」>

### ゲート（出力ファイル: /tmp/pharma-improvement/<stamp>/）
- npx tsc --noEmit: <tsc.txt の中身をそのまま>
- npm run lint: <lint.txt の末尾をそのまま>
- npm test: <test.txt の `ℹ tests` 〜 `ℹ duration_ms` をそのまま>
- npm run build: <exit と静的ページ数>
- テスト件数の差: <前回合計> → <今回合計>（差 N。新規ファイルごとの `ℹ tests` の合計と一致するか）

### 変異（実測）
| # | 変異（ファイル:行 と置換内容） | 落ちたテスト名（実在を grep 確認済み） | 落ちた件数 | 戻した後 |
|---|---|---|---|---|

- 変異が当たらない軸と、その検討: <書く>

### SW-F 回帰ガード（前 → 後）
<5 つの数字>

### 実画面確認（画面を変えた場合のみ）
<操作 → 見たもの。幅ごと。確認していなければ「未確認」>

### 触らなかったが気づいた点
<ファイル・行・再現手順・なぜ問題か。無ければ「なし」>

### 判断を仰ぐ点（§3「提案して止まる」に当たったもの）
<無ければ「なし」>

### 未実施・できなかったこと
<正直に。無ければ「なし」>
```

---

## 11. レビューでは何が確認されるか

提出物は、あなたの報告を信じずに次の手順で検証される。**報告を書く前に自分でも同じことをしておく**と、差し戻されない。

1. `git log` で実コミットを確認し、`tsc` / `lint` / `npm test` / `npm run build` を**最初から自分で再実行**する。報告の数字は転記しない。
2. 報告に貼られたコマンド出力の真偽: パッケージ名・バージョン、`npm test` の実スクリプト文字列との一致、`suites` 数と `duration_ms` が実測レンジ（約 106 suites・約 68 秒）に収まるか、出力に出てくるファイル名が `find` で実在するか。
3. 変異表の「落ちたテスト名」を `grep -n "test('" <ファイル>` の実在文字列と照合する。
4. 報告が貼った grep 出力・ファイルパスを、当該コミットの親（`git grep <語> <hash>^`）から取り直して突き合わせる。
5. 変異を 2〜3 件、独自に注入してテストが落ちるかを確認する（変異が当たらない軸も探す）。
6. diff を読み、型の緩和・期待値の書き換え・assert の削除・宣言外のファイルが無いか確認する。

**1 本の報告が正確でも、他の報告が正確とは見なされない。** 毎回、同じ検証が行われる。

---

## 付録 A: 握りつぶし `catch` の候補を出すスクリプト（SW-C 用）

`catch` ブロックを波括弧で切り出し、**利用者への通知・再 throw・エラー状態のセット等が一切無い**ものを列挙する。**候補を出すだけで、判定はしない。** 実測: 182 件（精度は高くない。分類は §4.2 SW-C）。

```bash
python3 -I - <<'PY'
import re, pathlib
NOTIFY = re.compile(r'toast|alert\(|throw |set[A-Z]\w*(Error|Message|Status|Notice|Feedback|Warning)|notify|recordAuditOrNotify|onError|reject\(|showError|errorMessage')
rows = []
for p in sorted(pathlib.Path('src').rglob('*')):
    if p.suffix not in ('.ts', '.tsx') or '.test.' in p.name:
        continue
    t = p.read_text(encoding='utf-8')
    for m in re.finditer(r'\bcatch\b\s*(\([^)]*\))?\s*\{', t):
        i, depth = m.end(), 1
        while i < len(t) and depth:
            depth += (t[i] == '{') - (t[i] == '}')
            i += 1
        body = t[m.end():i - 1]
        if not NOTIFY.search(body):
            rows.append(f"{p}:{t.count(chr(10), 0, m.start()) + 1}  {' '.join(body.split())[:90]}")
print(len(rows))
print('\n'.join(rows))
PY
```

## 付録 B: 起動プロンプトの例（人が使う）

```bash
gemini --yolo -p "docs/gemini_continuous_improvement_guide.md を最初から最後まで読み、その指示に従って 1 サイクルだけ実行してください。テーマは SW-B です。完了したら §10 の報告を出力して停止してください。"
```

戻ってきた報告は §11 の手順で検証してから取り込む。
