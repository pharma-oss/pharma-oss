# 公式添付文書ベース相互作用データ拡張 — 実行手順書

## 目的と背景

`src/lib/data/drug_infos.json` の `contraindications`（薬剤相互作用）は、以前はKEGG DDI（研究用途の一般的な薬理学的相互作用データベース）に由来していたが、これは日本の規制当局が承認した添付文書の「相互作用」章とは収載基準が異なり、実際に比較したところ記載のない組み合わせを警告に混ぜてしまっていた（詳細は `git log` の「相互作用チェック」関連コミットを参照）。

現在は、PMDA（独立行政法人医薬品医療機器総合機構）の公式添付文書HTMLから実データを抽出する方式に置き換えている。抽出対象は2章:

- **「10. 相互作用」章** → `DrugInfo.contraindications`（他剤との併用禁忌/併用注意）
- **「2. 禁忌（次の患者には投与しないこと）」章** → `DrugInfo.contraindicatedConditions`（疾患・妊娠・肝腎機能等、患者の状態に基づく絶対禁忌。例: 抗コリン薬と閉塞隅角緑内障）

2つは同じHTML取得から同時に抽出する（追加の通信は発生しない）。禁忌章のうち、薬剤名だけの項目（10.1併用禁忌と重複）と本剤自体への過敏症既往（アレルギー確認と重複）は抽出時に自動的に除外している。

医薬品マスター（`src/lib/data/drugs.json`）には一般名ベースで約7,200種類の成分がある。2026-07-02時点の作業キューは、全7,281成分のうち `done` 954件、`no_interactions_found` 138件、`fetch_error` 50件、`pending` 6,139件である。**途中経過を全成分完了として扱わず、キューの数字と検証結果を一緒に確認する。**

## 絶対に守ること（捏造防止）

検証結果の捏造・省略（実行していない検証を実行済みとして報告すること）は、このプロジェクトで最も重大な違反として扱う。安全情報を扱うデータのため、以下を必ず守ること。

1. **`src/lib/data/drug_infos.json` を直接手で編集しない。** 必ず `fetchOfficialDrugInteractionLabels.ts` 経由で書き込む。
2. **`src/scripts/officialDrugInteractionIngredientQueue.json` のステータスを手で `done` に書き換えない。** 実際にスクリプトを実行した結果としてのみ変化させる。
3. **`sourceUrl` や `contraindications` の中身を推測・生成しない。** 添付文書に相互作用の章が存在しない場合は `no_interactions_found` のまま何も書き込まないのが正しい挙動であり、失敗ではない。
4. **`fetchOfficialDrugInteractionLabels.ts` 実行後は必ず `verifyOfficialDrugInteractionLabels.ts` と `drug-label:queue-review` を実行し、その生の出力（PASS/FAIL、キュー残件、実行ログ）をそのまま報告に含める。** 自己申告のサマリーだけを進捗の根拠にしない。`verify` がFAILを返した状態や、キューレビューが保留の状態を「完了」と報告しない。
5. **`--limit` の上限（200）を超えて一度に処理しようとしない。** PMDAは公的機関のサーバーであり、配慮のない連続アクセスをしない。スクリプト側も200件を超える指定は拒否する。

## 過去に発生した重大なバグと教訓（必読）

2026-07-02のセッションで、`verifyOfficialDrugInteractionLabels.ts` の全数に近いサンプル検証（`--sample=900`）を実行したところ、いったん `done` になっていた成分の中から14件の致命的な不整合が見つかった。捏造ではなく、以下2種類の実在するロジックバグが原因だった。**同じ症状が再発していないか、作業の節目で `--sample=900` 程度の大きめのサンプルで検証すること。**

### バグ1: 剤形（内服・注射・外用）をまたいだ取り違え

PMDAは同一成分でも「錠」「注射」「外用」で添付文書が別文書になっていることが多い。修正前の成分マッチング（`fetchOfficialDrugInteractionLabels.ts` の `matchByKey`）は「外用かどうか」しか区別しておらず、内服と注射を区別していなかった。そのため、ある成分バケットの処理が別の成分バケット（同じ成分・別剤形）が正しく設定した品目のデータを、剤形違いの内容で上書きしてしまうことがあった（実例: ニコランジル注射用の相互作用データが、シグマート錠のデータで上書きされていた）。

**修正済み**: `getDosageFormCategory()` で「外用・注射・内服」の3区分を判定し、代表品目と候補品目のカテゴリが一致する場合のみマッチさせるようにした。もし今後、特定成分の一部品目だけ相互作用データの内容が明らかに他の剤形向けに見える場合、このカテゴリ判定に漏れている剤形キーワードがないか疑うこと（`topicalKeywords` / `injectionKeywords` の配列）。

### バグ2: 「今回0件だったら書き込まない」ガードにより誤データが消せない

`if (interactionRows.length > 0) existing.contraindications = ...` のように「新しい結果が0件のときは既存データに触らない」実装だと、過去の誤マッチで付いた別剤形のデータが、正しい（本来空であるべき）状態に永久に更新されなくなる。**修正済み**: 常に上書き（0件なら`undefined`にクリア）するようにした。今後スクリプトを改変する際もこのガードを復活させないこと。

### データ品質の癖: ブランド名が`genericName`に自己参照されている

`drugs.json` には、先発品の`genericName`がその製品名自身になっている品目が一定数ある（例: `クラビット点眼液０．５％` の `genericName` が `"クラビット点眼液０．５％"`、`アーテン散１％` も同様）。成分名の部分一致でバケットを作ると、この自己参照が別の一般名バケット（例: ブランド名の頭文字が同じ内服剤バケット）に誤ヒットしやすい。

症状: 特定のブランド品だけ相互作用/禁忌データが他の品目のコピーのように見える、または `verify` の「同じsourceUrlを引用する現行品目間でデータが食い違っている」チェックでFAILになる。対応: 該当品目の `drugs.json` 上の `documentUrl`（GeneralListのURL）を直接使い、その品目専用の添付文書を取得し直して個別に紐づけ直す（キューには成分名ではなく品目名をそのままingredientキーにした専用エントリを追加してよい）。

### 過去のセッションで判明した細かい癖

- **ブートストラップ生成時に`sourceUrl`が空のまま`done`扱いになっている成分がある**（キュー初期生成時、品目名の部分一致だけで一括done判定したため）。この場合、`refresh`系のURL単位の再取得では対象を見つけられず、何度再実行しても更新されない。症状: 同じ成分が繰り返し「更新されない」。対応: `drug_infos.json` 側の実データから逆算して`sourceUrl`を補完するか、`pending`に戻して再取得する。
- **`verifyOfficialDrugInteractionLabels.ts` の「同じsourceUrlを引用する現行品目間の整合性チェック」は廃止薬（`isAbolished: true`）を除外している。** 廃止薬は取得パイプラインの対象外で古いデータのまま残ることがあり、それ自体は異常ではない。

## 実行手順

### 1. 今回処理する分を実行する

```bash
npm run drug-label:fetch -- --limit=40
```

- `officialDrugInteractionIngredientQueue.json` の先頭から `pending` の成分を、指定件数だけ順番に処理する（対象は選べない。キューの順序どおりに進める）。
- 各成分について、PMDAのGeneralListページ→添付文書詳細HTML→「10.相互作用」章と「2.禁忌」章の抽出、を1回の取得で同時に行う。
- 抽出結果に異常（`findSuspiciousInteractionRows` または `findSuspiciousContraindicatedConditionRows` が何か検知した場合）は `needs_review` のまま残り、`drug_infos.json` には書き込まれない（相互作用・禁忌のどちらか一方でも異常があれば、その成分は両方とも書き込まない）。
- 相互作用・禁忌のどちらの章も存在しない添付文書は `no_interactions_found` として記録され、これは正常な結果（データを埋める必要はない）。片方だけ存在する場合は、存在する方だけを書き込む。
- 実行のたびに `officialDrugInteractionRunLog.jsonl` に追記される（上書きされない）。

### 1b. キュー残件レビューを出す

```bash
npm run drug-label:queue-review
```

- `pending`、`fetch_error`、`needs_review`、代表文書なし、不明statusを数え、残件サンプルを患者情報なしCSVへ出す。
- `drug_infos.json` 側の旧`targetDrug`単数スキーマ、KEGG信号、PMDA以外の`sourceUrl`も同時に確認する。
- `fetch_error` は通信再試行、PMDA候補なし、その他に分けて表示する。通信失敗だけを再試行し、候補なしはPMDA検索候補なしレビューまたは人確認へ回す。
- P4-01内部ゲートを閉じてよいかは、出力JSONの `canCloseP401InternalGate` と各ゲートの状態を確認する。

### 1c. PMDA候補なしを閉じてよいか確認する

```bash
npm run drug-label:no-candidate-review
```

- `fetch_error` のうち「添付文書候補が見つかりません」を候補なしレビュー対象として集計する。
- 証跡JSONを渡す場合は `YAKUREKI_DRUG_LABEL_NO_CANDIDATE_EVIDENCE` に指定する。確認日時、匿名確認ID、元資料SHA-256、患者情報なし確認、PMDA検索再確認、代替候補確認、閉じ承認、責任者確認がそろわない場合は保留にする。
- `readyForNoOfficialLabelFoundClosure` が `true` の場合だけ、`no_official_label_found` として閉じる候補にする。

`--limit` は1回あたり40〜100程度を目安にする。大きすぎるとPMDAへの負荷が高くなり、小さすぎると進捗が遅い。

### 2. 検証を実行する（省略不可）

```bash
npm run drug-label:verify -- --sample=15
```

- `drug_infos.json` の構造チェック（旧スキーマ残存、KEGGデータ残存、配合剤への誤適用、sourceUrlの妥当性、薬剤名の異常パターンなど）を行う。
- ランダムにサンプルした `sourceUrl` を実際にPMDAへ再取得し、同じパーサーで再計算した結果と保存データを突き合わせる（本文が変わっていないのにデータが食い違う場合はハード失敗）。
- 終了コード0=PASS、1=FAIL。FAILの場合、原因を修正してから再実行すること。`--sample` を増やすほど検証の信頼度が上がる（母集団が小さいうちは全数に近い値を指定してよい）。

### 3. テストとビルドを確認する

```bash
rg --files src -g '*.test.ts' | tr '\n' '\0' | xargs -0 npx tsx --test
npx tsc --noEmit -p tsconfig.json
npm run build
```

### 4. 上記1〜3を繰り返す

`officialDrugInteractionIngredientQueue.json` の `pending` が0になるまで、または作業を区切る時点まで、1〜3を繰り返す。

## needs_review になった成分への対応

`findSuspiciousInteractionRows` / `findSuspiciousContraindicatedConditionRows` が異常を検知した場合、原因は主に以下のいずれか。

- 想定していないHTML構造（新しい改版マーカーのクラス名、新しい区切り記法など）
- `extractDrugNameLines` / `extractOfficialContraindicatedConditionRowsFromLabelHtml`（`src/lib/drug_official_interaction_label.ts`）の抽出ロジックの見落とし

対応手順:
1. 該当成分の `representativeDocumentUrl` から実際のHTMLを確認し、何が問題か特定する。
2. `src/lib/drug_official_interaction_label.ts` の抽出ロジックを修正する。
3. **実際に取得した本物のHTML断片を使って** `src/lib/drug_official_interaction_label.test.ts` に回帰テストを追加する（架空のHTMLで代用しない）。
4. `npx tsx --test src/lib/drug_official_interaction_label.test.ts` で確認する。
5. 該当成分のキューエントリのステータスを `pending` に戻し（`sourceUrl` 等の付帯情報は削除してよい）、再度 `fetchOfficialDrugInteractionLabels.ts` を実行する。
6. 同じ問題が他の既存データにも影響していないか、`drug_infos.json` 全体に対して該当パターンを検索して確認する。過去に実際に発生した例:
   - `デュロキセチン`: `<br>`区切りを使わず「、」だけで複数薬剤名を並べる10.相互作用の行があり、42品目分のパースが崩れていた。
   - `ラタノプロスト`（キサラタン点眼液）: 2.禁忌が`<ol><li>`を使わず単一の`<p>`直書きだったため、章の境界を区切らずに`<ol>`を探した結果、後続の別章（8.重要な基本的注意）まで読み込んでいた。
   - `ザルティア`/`炭酸リチウム`: 2.禁忌の`<li data-level="2">`の中にさらに`<li data-level="3">`がネストしており、非貪欲正規表現では対応する`</li>`を見誤っていた。バランスの取れたタグ深度を手動追跡する`parseContraindicationListItems`で解決。
   - `ホルマリン`/`ポプスカイン`: 2.禁忌が`<ol>`ではなく`<ul class="SimpleList">`を使い、かつ`<span class="Header-preview">`が「装飾ラベル（例: 〈効能共通〉）」の場合と「禁忌条件そのもの（例: アンテベートクリームの細菌・真菌感染症うんぬん）」の場合の両方があった。中身が`〈〉`/`<>`で囲まれていれば装飾ラベルとして除去、そうでなければ本文として残す（`stripOrUnwrapHeaderPreviewSpans`）。
   - `ポプスカイン`（10.相互作用）: 「CYP3A4阻害剤（A、B、C等）及びCYP1A2阻害剤（D、E、F等）」のような「等）」で終わる列挙括弧の中の「、」が分割されず1行に混在していた。`findEnumerationParenStarts`で「等）」終端の括弧だけを分割対象にし、疾患文脈の括弧（例: ベネトクラクスの内部に「、」を含む病態括弧）は保護したまま。
   - `ヘルベッサーR`（ジルチアゼム）: 禁忌条件の理由が`［］`ではなく`〔〕`で囲まれており、`splitConditionTextAndReason`が対応していなかった。
   - `オキシトシン`: 隣接する複数の`HeaderRef`リンクを除去した後、カンマと空白が入り混じった残骸（`], ,`など）が残っていた。末尾クリーンアップの正規表現を`/[,、\s]+$/`に広げて解決。

## 対象外（意図的にスキップするもの）

- **配合剤**（一般名に「・」を含む）: 単剤とは別の添付文書を持つため、配合剤専用の対応が別途必要。今回の対象外。
- **医薬品マスターに存在しない成分**: `drugs.json` に該当製品がない成分（シタグリプチン、アピキサバン等、確認済み）は対象にしようがない。
- **廃止薬**（`isAbolished: true`）: 処方対象外のため優先度が低い。
- **禁忌章のうち、薬剤名だけの項目・本剤自体への過敏症既往の定型文**: 前者は10.1併用禁忌と、後者はアレルギー確認機能（`patient_alerts.ts`）と重複するため、抽出時に自動的に除外している（`extractOfficialContraindicatedConditionRowsFromLabelHtml`内の`PURE_DRUG_LIST_PATTERN`/`SELF_HYPERSENSITIVITY_PATTERN`）。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/lib/drug_official_interaction_label.ts` | 添付文書HTMLの解析（純粋関数）。10.相互作用と2.禁忌の両方を抽出。テスト対象の中核。 |
| `src/lib/drug_official_interaction_label.test.ts` | 実際に取得したHTML断片による回帰テスト。 |
| `src/lib/drug_interaction_check.ts` | 処方薬同士の相互作用チェック（`DrugInfo.contraindications`を使用）。 |
| `src/lib/drug_contraindicated_condition_check.ts` | 患者の疾患等と薬剤の絶対禁忌の突き合わせ（`DrugInfo.contraindicatedConditions`を使用）。 |
| `src/scripts/fetchOfficialDrugInteractionLabels.ts` | キュー駆動の取得・適用スクリプト。 |
| `src/scripts/verifyOfficialDrugInteractionLabels.ts` | 独立監査スクリプト。自己申告を信用しない。 |
| `src/scripts/officialDrugInteractionIngredientQueue.json` | 作業キュー（進捗の唯一の正）。 |
| `src/scripts/officialDrugInteractionRunLog.jsonl` | 実行履歴（追記専用）。 |

## 完了の定義について

「全成分完了」は約7,200成分分の作業であり、1回のセッションで終わる規模ではない。**途中経過を「完了」と報告しないこと。** 報告する際は、`officialDrugInteractionIngredientQueue.json` の `pending` 件数の推移と、直近の `verifyOfficialDrugInteractionLabels.ts` の実行結果（PASS/FAILと標準出力の抜粋）を必ず添えること。
