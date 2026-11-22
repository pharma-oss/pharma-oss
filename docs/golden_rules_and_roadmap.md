# pharma-oss 金科玉条と実装ロードマップ

- **作成**: 2026-09-17
- **最終改訂**: 2026-11-22
- **照合対象**: `62fe33c`（`main`）を基準に、Phase A 品質強化（残存 `readFileSync` 移行 `7bb0c9e`/`b7d3d42`/`fb88e6a`、`registerPatient` ブラインドインデックス重複照合 `dc95e0f`、非印刷 CSS sub-1rem トークン化 41→0 `9d809dd`、非除外 `: any` 全撤廃 `colon-any` 14→10 `05f713c`）、Phase B 承認済み 5 機能（B-1 全帳票調剤単位併記 `930f442`、F-1 フォロー定型・未確認 SOAP 挿入・EMR フォロー予約 `a2a4917`、F-3 腎機能/妊娠授乳/OTC 安全チェック・`PATIENT_SCHEMA` v6 `f0df698`、G-1 FEFO 逸脱監査・構造化在庫ログ `AUDIT_LOG_SCHEMA` v21・麻薬/向精神薬補助帳簿 `b3fc878`、H-1 ローカル/NAS 追記専用 WORM コネクタ `62fe33c`）、Q-5 トラック正式編入、全品質ゲートおよび実機 Chrome E2E 5 本の通過を確認。
- **位置づけ**: 本書は「この製品が完成したときに何が守られているか」を定める最上位の文書である。
  `.agents/AGENTS.md` と `honest-verification` スキルが **開発者の行動規範** を定めるのに対し、本書は **製品そのものの不可侵の原則（第Ⅰ部）** と、そこへ至るための **実装予定（第Ⅲ部）・実装方針（第Ⅳ部）** を定める。
- **効力**: 第Ⅰ部と矛盾する実装計画・PR・要望は、第Ⅰ部が優先する。第Ⅰ部を変えるには本書の改訂そのものを提案し、合意を得てから実装する。
- **改訂ルール**: 第Ⅱ部の実測値と第Ⅲ部の進捗は、コード・型検査・本物のテストがそろった後にのみ更新する（先走り禁止）。第Ⅰ部の改訂は独立したコミットとし、理由をコミットメッセージに書く。

---

## 目次

- 第Ⅰ部 金科玉条 — 完成形の定義と十箇条
- 第Ⅱ部 現在地 — 2026-09-30 時点の実測
- 第Ⅲ部 実装予定の機能 — 9 トラック
- 第Ⅳ部 実装方針 — どう作るか
- 付録 — 用語と参照文書

---

# 第Ⅰ部 金科玉条

## 0. 完成形の定義

pharma-oss の完成形とは、次の 6 条件をすべて満たす状態を指す。どれか 1 つでも欠ければ「完成」と呼ばない。

| # | 条件 | 判定の根拠になるもの |
|---|---|---|
| 1 | **一店舗の保険薬局が、受付から請求まで、このアプリだけで、サーバー費・月額費なしに業務を回せる** | 現場運用マニュアルの開局前〜閉局時〜月次の手順が全部この画面で閉じる |
| 2 | **算定・レセプト（UKE）・帳票が、厚労省告示と支払基金の記録条件仕様（令和8年6月版・調剤用）に対して項目単位で突合済み** | `official_audit.ts` の critical 項目がすべて `verified` |
| 3 | **患者の要配慮個人情報が店舗の外に出ず、端末を失っても読めず、消えず、改ざんが検知できる** | 暗号化・鍵エスクロー・端末別ハッシュチェーン・WORM 保全が現物証跡付きで動いている |
| 4 | **AI 補助を含むすべての候補提示に対し、薬剤師の採否が記録され、未確認のものは院外文書・請求へ流出しない** | `aiStatus` ライフサイクルとトレーシングレポート除外の契約テスト |
| 5 | **本番接続（電子処方箋・オンライン資格確認・調剤機器）が、現地端末での試験証跡をもって可否判定されている** | `pilot:operational-readiness` が `pass` |
| 6 | **上記がすべて、コードを読まない人でも `npm run verify` と運用レビュー CLI の出力から確かめられる** | 型検査 0 件・テスト全通過・レビュー CLI の証跡 JSON |

「機能が多い」ことは完成の条件ではない。**機能を減らしてでも上の 6 条件を満たす方を選ぶ。**

## 1. 十箇条

各条は「原則 / なぜ / コードでの現れ / 違反の例」の 4 点で書く。「コードでの現れ」は現在のリポジトリに実在するものだけを挙げる。

### 第一条 最終判断は薬剤師が下す。システムは候補を出し、根拠を示し、止めるまでしかしない

- **なぜ**: 本ソフトは認証された医療機器でもレセコンでもない（README の免責）。臨床・請求の責任は薬剤師にある。システムが「決めた」ように見える瞬間に、責任の所在が曖昧になる。
- **コードでの現れ**
  - AI 補助は決定論的ルール・テンプレート展開のみで、外部 LLM へ送信しない（`docs/ai_architecture_policy.md`）
  - SOAP 下書きは `aiStatus: 'unconfirmed'` で生まれ、承認・修正を経ないと確定記録にならない（`soap_ai_lifecycle`）
  - 未確認エントリはトレーシングレポートから自動除外（`tracing_report.ts`）
  - AI 補助の表示は店舗ごとに 標準 / 制限 / 停止 を選べ、停止しても業務機能は止まらない（`ai_assist_policy.ts`）
  - 算定 OFF・薬価の版の選び直し・返戻理由コードは、薬剤師の操作として監査ログに残る
- **違反の例**: 「候補が 1 件しかないので自動反映した」「確認モーダルを省いて既定値で保存した」「AI 下書きをそのまま薬情に印字した」

### 第二条 患者データは店舗から出ない。端末に残さない設計を、便利さのために崩さない

- **なぜ**: 要配慮個人情報の漏えいは取り返しがつかない。ローカルファーストはコスト削減の手段であると同時に、漏えい面を店舗内に閉じる安全装置である。
- **コードでの現れ**
  - IndexedDB は `encryption-crypto-js` で暗号化し、主キーは推測不能な UUID
  - サテライト端末は RxDB メモリストレージのみで、ディスクに患者データを永続化しない（`docs/satellite_terminal_sync_plan.md`）
  - 外部送信は「ブラウザ → 自機 `/api` → 施設内コネクタ」の一方向パターンに固定し、平文 HTTP は `localhost` / loopback だけ許可
  - URL・トークン・通信本文・成果物の生 SHA-256 は画面・監査ログ・診断 JSON に出さない
  - 発注 CSV・算定ルール確認 CSV・個人情報なし診断 JSON は患者名を含まない
  - デモ患者は請求（UKE）・機器連携から除外され、一括削除できる
- **違反の例**: 「便利なのでクラウドに薬歴を置く」「デバッグのためにトークンをログへ出す」「サテライトに localStorage で薬歴を残す」

### 第三条 公式仕様が正本。記憶で書かず、取得して突合し、自前で番号を発番しない

- **なぜ**: 告示・記録条件仕様・マスタは改定される。人の記憶や過去の実装は、改定の瞬間に誤りになる。
- **コードでの現れ**
  - 支払基金の記録条件仕様 PDF を取得・解析する機構（`dispensing_uke_official_spec_pdf.ts`）と、コード表をその本文と再突合する関数（`verifyDispensingUkeCodeTablesAgainstSpecText`）
  - 医薬品マスタは公式 CSV/ZIP から取り込み、来歴（`drug_master_provenance.ts`）と版（`drug_master_version.ts`）を持つ
  - 用法は厚労省の電子処方箋用法マスタ（1,803 行）から取り込み、コード番号の自前発番を禁止（`usage_master.ts`）
  - 医療機関マスタは地方厚生局データから都道府県単位で差分マージ
  - 公式仕様で未確認の値は「未確認」と書き、既存挙動を維持する（`OFFICIAL_DOSAGE_FORM_CODE_MAP` の注記）
- **違反の例**: 「用法コードが無いので 999 を割り当てた」「PDF を見ずに別表の値を思い出して書いた」「マスタの列位置を仮定して取り込んだ」

### 第四条 迷ったら止める。勘で補完しない。判定できないものは「不能」と表示する

- **なぜ**: 患者に渡る印刷物と保険者へ出す請求は、誤った値より空欄の方がまだ安全である。勘補完は「正しく見える誤り」を生む。
- **コードでの現れ**
  - 請求前チェック・公式提出準備チェックで問題があれば UKE 出力そのものを止める（readiness error）
  - 未完了の確認事項があれば次工程へ進めない（受付→ピッキング→監査→薬歴→印刷）
  - 単位の `|| '錠'` フォールバックを撤廃し、単位が無ければ数値のみ印字（`amount_semantics.ts`）
  - 年齢は `calculatePatientAge` に一本化し、生年月日が読めなければ「不能」として警告を表面化
  - 移行 CSV の読めない生年月日は warning ではなく error として報告
  - 一部負担金額は点数×負担割合から算出せず、記録された値だけを出す（額の算出はしない）
  - 古いマスタファイルの取込で現在薬価が巻き戻らない・廃止薬が復活しない
- **違反の例**: 「未設定なら内服扱いにしておく」「和暦が読めないので 1900 年にした」「負担額は 3 割で計算して出した」

### 第五条 記録は改ざんできず、来歴を偽らない

- **なぜ**: 薬歴・調剤録は法定保存文書であり、監査ログは事故時の唯一の証拠である。遡って「きれいにする」ことは虚偽になる。
- **コードでの現れ**
  - 監査ログは端末別ハッシュチェーン（`terminalId`、旧ログはレガシーチェーン）で整合性検証（`audit_integrity.ts`）
  - S3 Object Lock（WORM）への保全ジョブと事前確認 CLI
  - 請求スナップショット（`claimLifecycle.exportSnapshot`）は不変で、現在値との差分を表示する（`claim_snapshot.ts`）
  - 出力済み請求は `claim_edit_guard.ts` で編集をブロックし、返戻→再請求の履歴イベントに理由コードを残す
  - スキーマ v4 以前の薬歴は `origin: 'legacy_unspecified'` のままとし、遡って「薬剤師手書き」と付与しない
  - 薬価ロールバックが価格履歴を消さない（`933e208`）
- **違反の例**: 「監査ログの並びを直すために書き換えた」「過去の未分類データを移行で一括 `manual` にした」「返戻時に元の UKE スナップショットを上書きした」

### 第六条 データを失わない。壊れても自動で消さず、復旧の道を必ず残す

- **なぜ**: ローカルファーストでは、端末 1 台の故障が店舗の全記録の喪失になり得る。
- **コードでの現れ**
  - DB 初期化失敗時に IndexedDB を自動削除しない（旧「自己修復」は無効化）。`navigator.storage.persist()` で永続化要求
  - バックアップはパスワード暗号化 JSON、世代管理、復旧前差分プレビュー、閉店時予定、OS スケジューラ用ジョブ
  - DB 暗号鍵の管理者エスクロー（印刷シート、`db_key_escrow.ts`）と現場運用規程（現場運用マニュアル §8）
  - 1 クリック外部保存と SHA-256 読み戻し照合（`file_system_backup.ts`）
  - スキーマ移行は `keepDocument`（任意項目の追加のみ）で、版数から `legacyMigrationStrategies` を自動生成
  - サテライトの未送信キューは暗号化して保持し、ACK で削除、保持期限・上限超過は警告
  - 患者編集時に複数公費（2件目以降）が消失しない安全保護ロジック（`patient_public_insurance.ts`）
- **違反の例**: 「起動できないので DB を消して作り直した」「プロパティを足したが version を上げなかった」「バックアップ形式を変えて旧ファイルを読めなくした」

### 第七条 検証は自分の目で行い、通ったことではなく壊したときに落ちることを確かめる

- **なぜ**: このリポジトリでは、テストが全件緑のまま実画面では動いていないバグが繰り返し見つかった（算定切替が保存されない、承認の監査ログが常に null、監査ログ表が常に空）。数字は安全の証拠にならない。
- **コードでの現れ**
  - `npx tsx --test` は型検査をしないため、`npx tsc --noEmit` を単独実行する
  - テスト内でロジックを再実装する偽カバレッジを禁止し、純粋関数を切り出して本物を import する
  - fail-first mutation の 4 手順（変異注入→fail 実測→戻す→pass 実測）を各 PR で実施し、報告に表で残す
  - 帳票は `renderToStaticMarkup` の実レンダリングテストと、Puppeteer による 11 帳票の実描画回帰（`test:e2e:print-layout`）
  - 運用レビュー CLI は `ops_review_cli.test.ts` が実際に実行して台帳とのずれを検出する。CLI の `exit 1` は「未達」という業務状態であり、CI を赤にしない
  - ドキュメントの「完了」は、コード・型検査・本物のテストがそろってからしか書かない
- **違反の例**: 「全体で 1,600 件通ったのでこのモジュールも正しい」「落ちるはずのテストを書いた（実測していない）」「tsx が通ったので型も大丈夫」

### 第八条 判定は一本化する。同じ問いに答える関数を 2 つ持たない

- **なぜ**: 剤形の判定が 5 か所に別実装され、帳票 3 か所が誤って「患者に渡る薬袋に誤った剤形が印字される」状態だった（2026-09-06 のレビュー）。分岐の重複は、改定のたびに食い違いを生む。
- **コードでの現れ**
  - 剤形は `resolveDosageCategory` / `resolveEffectiveDosageCategory`（`dosage_category.ts`）を正本とし、算定・帳票・UKE 剤形コードがこれを引く
  - 数量セマンティクス（内服＝1日量、外用・頓服・内滴＝総量）は `isDailyAmountItem` に集約
  - 薬価は `resolveDrugPrice(drug, 調剤日)` に集約し、根拠（`history` / `current` / `earliest_known` / `unknown`）を返す
  - 年齢は `calculatePatientAge`、算定入力は 1 か所にまとめた（引き継ぎ書 §8）
  - 環境変数は `src/lib/env.ts` 経由（直接参照は 3 ファイルに減少）
- **違反の例**: 「帳票用に軽い判定を書いた」「この画面だけ用法の正規表現を別に持つ」「算定側は手動指定を無視し、帳票側は尊重する」（現に残っている食い違い。第Ⅲ部 A-3）

### 第九条 現場が迷わない。受付から請求までひと続きで、日本語で、印刷は実紙で確かめる

- **なぜ**: 使い手は薬剤師・事務であり、開発者ではない。画面で迷う時間は患者の待ち時間になる。
- **コードでの現れ**
  - ダッシュボードの未完了タスク駆動で、受付→ピッキング→監査→薬歴→帳票→UKE が 1 本の流れ
  - 管理者 / 薬剤師 / 事務のロール制御とパスキー、退職・端末移行の復旧手順
  - Vanilla CSS と CSS 変数のみ（Tailwind 等は不使用）。文字サイズは `--fs-*`、余白は `--space-*` トークンから選ぶ
  - 幅 720px 以下のモバイルでは見出し行を隠し自前ラベルに委ねる等、レスポンシブを実画面で確認
  - 帳票は余白・フォントを端末ごとに保存でき、実紙検証 JSON（`print:field-verification`）で長い薬品名・患者名を継続投入
  - 3 分デモと現場運用マニュアルで、練習と本番の境界（デモデータの片づけ）を明示
- **違反の例**: 「英語のエラー文をそのまま出す」「トークン外の 0.7rem を直書きする」「印刷は PDF プレビューで見たので実紙は省略」

### 第十条 頼まれていない安全基盤を独断で変えない。要判断は実装せず、書き出して仰ぐ

- **なぜ**: 競合解決（ハブ正本優先＋薬剤師レビュー）や算定ロジックは、点数・患者安全に直結する。「気を利かせた」変更が最も危険である。
- **コードでの現れ**
  - 各実装計画書に「要判断事項（実装者が勝手に決めないこと）」節を必ず設け、未決のまま残す
  - 挙動が変わる変更（例: 電子処方箋の送信ペイロードに用法コードが載る）は、変更前後の実測を並べて報告する
  - スキーマ version bump を伴う変更は計画書で事前に承認を得る（PR-G6 の例）
  - `refactor:` を名乗るコミットに挙動変更を含めない（`0c59de0` の反省）
- **違反の例**: 「競合解決を Last-Write-Wins にして UX を良くした」「用法の正規表現に口語形を足して検出率を上げた（誤検知評価なし）」「算定側も手動指定尊重に揃えておいた（点数が変わる）」

## 2. 不変条件（機械的に守られているもの）

第Ⅰ部の原則のうち、テスト・ゲートで自動検証されているものを列挙する。**ここに載っている検証を弱める変更は、第Ⅰ部の改訂に相当する。**

| 不変条件 | 守っているもの |
|---|---|
| RxDB のアクティブコレクション数は 14 以下（open-core 上限） | `src/db/index.ts` の `ACTIVE_RXDB_COLLECTION_LIMIT`、`collection_limit.test.ts` |
| スキーマにプロパティを足したら version を上げ、移行は `keepDocument` | `schema.test.ts`、各 PR のマイグレーション契約テスト |
| 監査ログのハッシュチェーンは端末別に検証でき、`terminalId` 無しの旧ログも検証できる | `audit_integrity.test.ts` |
| 出力済み請求（`exported` 以降）はスコープ内データを編集できない | `claim_edit_guard.test.ts`、`claim_actions.test.ts` |
| 未確認 AI 下書きはトレーシングレポートに載らない | `tracing_report.test.ts` |
| 単位未設定時に単位を補完しない。外用に `days` があっても総量として扱う | `amount_semantics.test.ts`、`PrintUnitDisplay.test.ts` |
| UKE 剤形コードは剤形判定の正本から導出する | `dispensing_uke*.test.ts`（PR-G1） |
| コード表（別表7/8/10）は公式仕様 PDF 本文と再突合できる | `dispensing_uke_code_tables.test.ts` |
| 古いマスタ取込で現在薬価が巻き戻らず、廃止薬が復活しない | `drug_price_history.test.ts`、`drug_master_attributes.test.ts` |
| 用法候補にコード番号が混入しない。内滴の用法は許可リスト 3 件のみ | `PrescriptionGroupEditor.test.ts`（PR-G2/G5）、`usage_master.test.ts`（PR-G3/G4）、`prescription_input_audit.test.ts`（PR-G5） |
| デモ受付は月次一括 UKE・単票 UKE・機器連携に含まれない | `useDashboardTasks.test.ts`、`demo_data.test.ts` |
| CSV の先頭危険文字は無害化され、印刷 HTML の可変値はエスケープされる | `csv_escape.test.ts`、各帳票のテスト |
| 新しい帳票コンポーネントは自動的に回帰テストの対象になる | `PrintLayoutRegression.test.ts`（`readdirSync` 走査） |
| 運用レビュー CLI は台帳（`docs/ops_review_ledger.md`）に全件記載され、実行契約が一致する | `ops_review_cli.test.ts` |
| 単体テストは `TZ=Asia/Tokyo`・`--test-concurrency=1` で CI とローカルが同条件 | `package.json` の `test`、`.github/workflows/onboarding-e2e.yml` |

---

# 第Ⅱ部 現在地（§1 品質ゲート・§2 規模・§3 スキーマの版は 2026-11-22 `126e1b4` 実測。§4 の現地証跡ステータスは未変更）

## 1. 品質ゲート

2026-11-22 に Phase A 品質強化（`7bb0c9e`〜`05f713c`）・Phase B 機能実装（B-1 `930f442`・F-1 `a2a4917`・F-3 `f0df698`・G-1 `b3fc878`・H-1 `62fe33c`）・Phase C 準備（`346d411`・`126e1b4`）完了後に再計測した結果（証跡: `artifacts/improvement/20261122-1034-C-prep-2-final/`）。**次に本書を更新する人は、自分で再取得して一致を確認すること。**

| 検証 | コマンド | 実測 |
|---|---|---|
| 型検査 | `npx tsc --noEmit` | エラー 0 件（exit 0） |
| Lint | `npm run lint` | error 0 / warning 0（exit 0） |
| ユニット/契約テスト | `npm test` | 3,227 pass / 0 fail / 218 suites、skip 0（exit 0） |
| 本番ビルド | `npm run build` | 成功（Next.js 16.4.6 Turbopack、32/32 ページ、exit 0）。Node.js SQLite 実験機能の警告あり |
| SW-F 回帰ガード | `bash scripts/improvement_swf.sh` | 3 / 4 / 5 / 0 / 0（`: any` 10 / `as any` 3。残存 10 件はすべて除外対象の `src/db/index.ts`・`src/lib/electronic_prescription_client.ts` のみ） |
| 依存脆弱性監査 | `npm audit --omit=dev` | critical 0 件（high 1 件・moderate 1 件）。`nightly-ops-review.yml` へ非ブロッキング監査追加 |
| CI 相当 E2E 4 本 | `npm run test:e2e:sync`・`onboarding`・`return-correction`・`print-layout` | すべて通過（2026-11-22 `62fe33c` 実機 Chrome 検証：`sync` 全項通過、`onboarding` `skipped: []`〔設定6/ダッシュボード3/印刷8〕、`return-correction` 3 ターゲット通過、`print-layout` 11 帳票キャプチャ＋領収証バーコード `200009603`/`¥960` 確認） |
| E2E アクセシビリティ・通しドリル | `node scripts/run_e2e_accessibility_drill.mjs` | 通過（2026-11-22 `62fe33c` 実機 Chrome 検証：`/ocr`・`/emr`・`/print/[visitId]`・`/inventory` 各 1280/768/375px オーバーフロー 0px、Tab 操作・公式 UKE モーダル起動＆Escape 閉鎖通過、`overflowErrors: 0`・`keyboardErrors: 0`） |

以下の段落は 2026-10-02 の記録。`npm test` はローカル通信を必要とするため、サンドボックスの制限外で実行した。ダッシュボード、薬歴画面（/emr）、処方受付画面（/ocr）、印刷・調剤録画面（/print/[visitId]）、在庫管理・発注画面（/inventory）は幅1280 / 768 / 375pxの実ブラウザ表示と主要操作を通しドリルで確認した。

## 2. 規模

| 項目 | 実測 |
|---|---|
| `src/` の TS/TSX（テスト除く） | 392 ファイル |
| テストファイル | 365 ファイル |
| 主要 6 画面の行数 | 8,852 行（ocr 1,991 / emr 2,570 / print 2,125 / inventory 857 / settings 844 / dashboard〔`src/app/app/page.tsx`〕465。※ 上位 3 画面は P7 行数予算テストで固定） |
| `scripts/` | 79 ファイル（第 1 階層）、npm scripts 49 本 |
| `PrintPickingFlow.test.ts` の `readFileSync` | **0 件**（2026-11-21 `abbf183` で残存 7 箇所を完全撤廃。さらに 2026-11-22 Phase A `7bb0c9e`/`b7d3d42`/`fb88e6a` で印刷・自費請求・受付の残存ソース文字列テストも実描画・実行テストへ移行完了） |
| 非印刷 CSS 生 sub-1rem フォントサイズ | **0 箇所**（2026-11-22 `9d809dd` で残存 41 箇所を `--fs-*` トークンへ統一完了） |
| インライン `style={{}}` | **3 箇所**（`AuditSettingsTab` 2、印刷ページ 1）。すべて動的 CSS 変数（`--bar-height` / `--print-*`）の正当な受け渡しのみ。`TerminalSyncPanel` 18 箇所と `ClientLayout` 6 箇所は CSS クラスへ移行完了し、予算上限 3 を `TerminalSyncPanel.test.ts` で自動防壁化 |
| `process.env` 直接参照（`env.ts` 以外・非テスト） | 4 ファイル（`backup.ts`、`pharmacy_device_connector_simulator.ts`、`BackupSettingsTab.tsx`、印刷ページ） |
| コード内 TODO / FIXME | 0 件 |

## 3. スキーマの版（`src/db/schema.ts`）

| コレクション | 版 | | コレクション | 版 |
|---|---|---|---|---|
| `visits` | 26 | | `drugs` | 10 |
| `audit_logs` | 21 | | `drug_stocks` | 5 |
| `prescription_items` | 18 | | `facility_settings` | 6 |
| `patients` | 6 | | `interventions` | 3 |
| `soap_records` | 4 | | `users` | 2 |
| `drug_infos`（SQLite WASM 側へ退避済み） | 2 | | `locations` / `alerts` / `medication_guidances` / `patient_medication_info_templates` | 1 |

アクティブコレクションは上限 14 で満杯である。新しい記録種別を足す場合の手順は第Ⅳ部 §2 を参照。`patients` v5（`5454628`・`a650206`）では鍵付き HMAC-SHA256 ブラインドインデックス 6 項目を導入し、v6（`f0df698`、`5: keepDocument`）では暗号化対象フィールド `clinicalProfile`（腎機能検査値・妊娠/授乳・併用 OTC/サプリ）を追加した。`audit_logs` v21（`b3fc878`、`20: keepDocument`）では G-1 構造化在庫監査ログ種別 6 件（`stock_fefo_deviation`・`stock_cancel`・`stock_return`・`stock_disposal`・`stock_take_variance`・`narcotic_ledger_export`）を追加し、既存ハッシュチェーン整合性を維持している。

## 4. 領域別の到達状況

`official_audit.ts`（設定 > レセプト点検）の宣言に基づく。`verified` は現地証跡まで揃った状態を指し、現時点で該当は無い。

| 領域 | status | 優先度 | 主に残っているもの |
|---|---|---|---|
| 令和8年6月調剤報酬点数ロジック | partial | critical | 告示・疑義解釈の残パターンのテスト化、施設基準加算/減算の月内条件、現物返戻事例の投入 |
| レセプト電算/UKE 記録条件仕様 | partial | critical | 通常 UKE と公式提出用 UKE の生成経路統合、入力・検査・請求状態更新の整合、国保連サンプルとの差分確認。公式提出経路には GO 集計・SN/JD/MF/ST 条件付き生成が存在 |
| 保険・公費・資格確認 | partial | critical | オンライン資格確認・マイナ資格確認の公式認証方式照合と現地機器での成功証跡、実レスポンス現物 |
| バックアップ・同期・復旧 | partial | critical | 本番端末の OS スケジューラ登録証跡、S3 以外の WORM 保存先、他社実データ相当の移行 CSV 継続投入 |
| 医薬品マスター正式更新 | partial | high | 外部 OCR エンジン選定、画像化 PDF の現物サンプル |
| 操作権限・監査ログ・改ざん対策 | partial | high | 監査ログ WORM 保全を本番端末で実行した現物証跡 |
| E2E・返戻・再請求ワークフロー | partial | high | 国保連公式サンプル網羅、パイロット複数店舗の実症例・4 週間 KPI、電子処方箋・NSIPS の現地確認 |
| 調剤録・薬袋・手帳シール・水剤/軟膏ラベル | implemented | high | A4/PDF/ラベル紙/実プリンタでの現物検証の継続 |

## 5. 直近 3 か月で確立したこと（再調査を避けるための要約）

- **2026-07**: サテライト端末同期（ハブ集約、メモリのみ、端末別監査チェーン）、外部ピッキングシステム連携、患者・薬品の名寄せ統合、デモデータの請求混入防止
- **2026-08 前半**: 主要 6 画面を 29,481 行 → 9,498 行へ分割（テスト先行 → Hook 抽出 → JSX 分割）、ソース文字列テストの 3 分類移行、デザイントークン、サテライトオフライン認証・キュー上限、DB 鍵エスクロー、AI 下書きライフサイクル
- **2026-08 後半**: 返戻理由コード接続（P3-A）、高額療養費・一部負担金・減免の公式 UKE 記録（P3-B）、調剤日時点の薬価（P3-C）、運用レビュー台帳と Nightly CI、点数変動点検
- **2026-09 前半**: 薬剤情報提供文書の安全リファクタリング、単位の勘補完撤廃と数量セマンティクス、マスタ単位取込（PR-C）、電子処方箋の調剤単位取込（PR-D）、剤形判定の一元化と年齢正本化（PR-E）、UKE 剤形コード是正・用法マスタ取込・用法選択式化・用法補足欄（PR-G1〜G6）
- **2026-09 後半**: 剤形判定の食い違い点検ワークスペース・what-if レビュー（PR-H1）、屯服ラベル比較バグの enum 直接比較による是正（PR-H5）、剤形・日数不整合監査警告（PR-H2 / A-5）、運用レビュー CLI の status 定義統一と台帳契約テスト（PR-H3 / I-2）、帳票・算定ヘルパーの any 型付け排除（PR-H4 / B-2）、ダッシュボードのデザイン改善第1段（I-6）
- **2026-09-30**: トラック D-2 の複数公費消失バグ解消と最大4件構造化編集・追加・削除UI、法別番号リアルタイム制度名表示、薬歴バナー公費バッジおよび期限警告表示、純粋関数モジュール新設（`patient_public_insurance.ts`）。続いてトラック I-6 第2段として薬歴画面（`/emr`）の日常操作・レスポンシブ改善（375px アクションバーボタン欠落バグ解消、SOAPフッター縦積み折り返し、処方遍歴のカード型美装化）。さらにトラック I-6 第3段として処方受付画面（`/ocr`）の日常操作・レスポンシブ改善（375px アクションバーのキャンセルボタン消失解消、用法選択ボタンのカード突き抜け解消、手入力モード時上部プレースホルダー整理）を実施。続いてトラック I-6 第4段として印刷・調剤録・薬袋画面（`/print`）の日常操作・レスポンシブ改善（375px ヘッダーボタングリッド化、印刷用紙シミュレーションの短冊潰れ解消と実寸保持・横スクロール化、調剤録への紙プレビュー適用、フローグリッド縦並び化）を実施し、実画面検証（1280/768/375px）完了。続いてトラック I-6 第5段として在庫管理・発注画面（`/inventory`）の日常操作・レスポンシブ改善（375px モバイルでの最重要情報「医薬品名」の初期表示不可視問題を医薬品名ファースト列配置刷新により 100% 視認可能に解消、発注ワークベンチのボタングループの不揃い段落ちを 2x2 均等対称グリッド化で解消、タブバーのタッチスクロール最適化）を実施し、実画面検証（1280/768/375px）完了。続いてトラック C-1 ステップ 1 として通常 UKE（単票・月次）と公式提出用 UKE の生成経路対照表を整理し、同一架空入力による現行出力差分（ヘッダー/RE/HO/CZ/KI/IY/ST/GO の仕様差異、末尾 EOF 0x1A、ドラフト状態ブロック契約、複数件集計合算）を自動テスト（`dispensing_uke_comparison.test.ts`、全 3 件 PASS、fail-first mutation 実証済み）および比較スクリプト（`scripts/compare_uke_paths.mjs`）で実証・固定。さらにトラック D-2 の残作業として、処方受付画面（`/ocr`）および月次ワークベンチでの複数公費・期限切れ警告表示接続を実施。受付画面の候補カード・選択中患者カードに公費制度名バッジ・負担割合および `evaluateInsuranceEligibility` と連動した警告アラートバナーを配備し、月次ワークベンチ（`ClaimWorkbenchRow` / `calculateDashboardClaimWorkItems`）各行に公費サマリーと期限切れ・負担上限未設定の警告バッジを表面化。公費期限切れ等の重大エラー時は優先度を「至急」（`high`）に自動昇格し、契約テスト（計 8 件増、全 1,767 件 PASS）および fail-first mutation で実証完了。続いてトラック C-1 ステップ 2 として通常 UKE と公式提出用 UKE の生成経路統合に向けた計画・設計と共通化を実施。月次公式生成内に閉じていた補助レコード（SN: 特別公費、JD: 日別調剤日、MF: 窓口負担額、ST: 医師指示分割調剤）生成ロジックを純粋関数モジュール（`dispensing_uke_official_supplemental.ts`）に抽出・共通化し、月次生成側（`monthly_claim_uke.ts`）を委譲リファクタリング。単票から公式提出用 UKE（RECEIPTY.CYO、GO: 1, totalPoints, 99、末尾 0x1A）を生成する純粋関数（`dispensing_uke_official_single.ts`）を新設し、二重実装ゼロの安全設計で月次公式エンジンと契約を共有。厳格な契約テスト（補助レコード 5 件、単票公式生成 3 件、全 8 件増、全 1,775 件 PASS）および fail-first mutation、計画報告書（`docs/uke_generation_unification_plan_step2.md`）を作成。
- **2026-10-01**: トラック C-1 ステップ 3 として単票画面（`/print/[visitId]`）への公式提出用 UKE（`RECEIPTY.CYO`）プレビュー・ダウンロード機能の併設実装と実務並行検証環境を確立。現行の通常出力ボタン（`RECEIPT_{id}.uke`）を一切変更せず維持しつつ、「公式UKE」ボタン（`data-testid="print-official-uke-button"`）および専用モーダル（`SingleOfficialUkeModal.tsx`）を新設。モーダル内で公式仕様適合の自動検証、サマリー（`RECEIPTY.CYO`、1件、点数、行数、EOF 0x1A）、構成レコード種別チップ（YK/RE/HO/GO等）、電算テキストプレビュー、コピー機能、およびダウンロード（`data-testid="download-official-cyo-button"`）と監査ログ（`uke_export`）記録を提供。厚労省コード欠落時は出力制限アラートとダウンロード非活性化で安全保護。インライン `style={{}}` ゼロ（Vanilla CSS `print.css`）、契約テスト（モーダル単体 3 件、画面併設 1 件、全 4 件増、全 1,779 件 PASS、fail-first mutation 実証済み）、および [ステップ 3 報告書](uke_generation_unification_plan_step3.md) を作成。続いてトラック I-6 第6段として設定画面（`/settings`）の日常操作・レスポンシブ最適化を実施（375px モバイルでのタブバー横スクロール化、スタッフ管理見出しの縦1文字折り返し解消、スタッフ一覧テーブル横スクロール化、共通フォームの1fr化、実画面検証 1280/768/375px 完了、契約テスト 5 件追加、全 1,784 件 PASS）。さらにトラック C-1 ステップ 4 として UKE 生成経路の統合・本番切替準備と安全な移行設計を実施。通常出力を独断で塞がず（AGENTS.md 第十条）、「点検用旧形式（院内点検・独自連携用）」として位置づけを明確化しつつ、公式提出用（`RECEIPTY.CYO`）を公的提出の正本として明示。単票および月次ワークベンチの両画面でボタン title 属性・監査ログ（`audit_logs`）の区分化（公式 vs 点検用旧形式）を配備し、利用追跡と客観的な完全廃止判定基準（公式運用実績1ヶ月以上、直近3ヶ月旧形式出力0件、ステークホルダー合意）を純粋関数モジュール（`uke_migration_policy.ts`）で確立。契約テスト（4件追加、全 1,788 件 PASS、fail-first mutation 実証済み）および [ステップ 4 報告書](uke_generation_unification_plan_step4.md) を作成。続いてトラック C-4 として減免区分・高額療養費の対応点検とUI・事前点検接続を実施。純粋モジュール `src/lib/patient_copayment_support.ts` を新設し、患者編集モーダル（`PatientBanner.tsx`）における高額療養費・減免データの保存時消失バグを解消して構造化編集フォーム（認定証ア〜キ、多数回、別表8区分、別表10減免、割合、金額、証明書番号）を配備。EMR患者バナーおよび処方受付（`/ocr`）選択中患者カードへのバッジ表示、印刷画面（`/print/[visitId]`）一部負担金ブロックへの注意ガイダンスバナー（誤徴収防止）、月次ワークベンチ公式事前点検（Readiness Check）での不正コード・減額割合欠落・証明書番号不正の自動検知を接続。契約テスト（7件追加、全 1,795 件 PASS、fail-first mutation 実証済み）、および [点検報告書](copayment_and_reduction_audit_20261001.md) を作成。続いてトラック F-2 として疑義照会・処方変更履歴の構造化を実施。薬剤師法第24条・第28条第2項・施行規則第16条第1項第10号（第15条第2号・第3号準用）に基づく調剤録の法定義務（照会日時、処方医・照会方法、区分、疑義内容、回答結果、患者同意、担当薬剤師、ステータス）を調剤録（`DispensingRecordPrint.tsx`）に新設（`data-testid="record-intervention-box"`）。コレクションを増やさず訪問データ（`visits`）内の入れ子プロパティ `interventionEvents` として構造化保存（RxDB スキーマ v23、医療安全データ保護のための暗号化指定、`22: keepDocument` マイグレーション戦略配備）。EMR 疑義照会モーダル（`EmrInterventionModal.tsx`）およびサイドパネルに照会区分（後発変更・残薬調整・用法用量・重複禁忌・中止・その他）の選択・自動サジェスト・バッジ表示を配備。レセプト摘要欄用要約テキスト生成および未回答疑義の公式事前点検（`official_uke_intervention_inquiry_pending` / `official_uke_intervention_reason_missing`）を統合（公式UKE電算摘要レコードへの自動印字配線は未接続・要判断）。純粋関数モジュール新設（`prescription_intervention_support.ts`）、契約テスト（7件増、調剤録印刷・スキーマテスト拡張、全 1,804 件 PASS、fail-first mutation 実証済み）、および [トラック F-2 報告書](intervention_structuring_20261001.md) を作成。続いてトラック G-2 として発注点・リードタイム・期限切迫・代替薬候補の統合を完了。処方不足だけでなく、発注点（安全在庫）割れ・使用期限切迫（60日以内/180日以内）を統合した推奨発注量算出、同一規格・成分（YJコード上7桁一致）の院内代替薬候補の提示（有効在庫順ソート）、発注ワークベンチ（`OrderWorkbench.tsx`）への理由別フィルタタブ（すべて/処方不足/発注点割れ/期限切迫）・理由バッジ・使用期限アラート・代替薬候補アコーディオン展開を配備。在庫一覧画面（`/inventory`）テーブルへの「発注点」列追加およびインライン編集保存（`ReorderPointEditor`、監査ログ `stock_update` 記録）。患者個人情報ゼロ規約（第二条）を厳守した発注 CSV / メモ出力。欠品予測エンジン（`operational_ai_prediction.ts`）へのデータパイプライン（発注点・期限切迫ロット・代替薬候補）の正式接続。`DRUG_SCHEMA` v10（`reorderPoint`, `leadTimeDays`, `targetStock` 追加、マイグレーション戦略 `9: keepDocument`）。インライン `style={{}}` ゼロ（Vanilla CSS `inventory.css`）。純粋関数モジュール新設（`inventory_reorder_support.ts`）、契約テスト（8件増、全 1,812 件 PASS、fail-first mutation 実証済み）、および [トラック G-2 報告書](inventory_reorder_and_substitution_20261001.md) を作成。
- **2026-10-02**: トラック I-3（アクセシビリティとレスポンシブの通し確認）および トラック I-1（PrintPickingFlow.test.ts の実描画テスト化）を完了。自動化スクリプト（`scripts/run_e2e_accessibility_drill.mjs`）を抜本改修し、実在するデモ受付 `visitId` を追跡した上で処方受付（`/ocr`）→ 薬歴（`/emr`）→ 印刷・調剤録（`/print/[visitId]`）→ 在庫管理（`/inventory`）の一連通しフローを 1280px / 768px / 375px の 3 ビューポートおよびキーボード操作で Puppeteer 実機検証。全画面・全幅で横スクロールはみ出し 0px、公式UKEモーダルの起動および Escape 閉鎖（`SingleOfficialUkeModal.tsx` にリスナー実装）、不適合時の安全なダウンロード保護、正真正銘計 14 枚のスクリーンショット保全を実証。リポジトリ最大のソース文字列テストであった `PrintPickingFlow.test.ts` において、調剤録（`DispensingRecordPrint`: 薬剤師法第24条・第28条第2項・施行規則第16条第1項第10号の法定記載）、公式UKE点検モーダル（`SingleOfficialUkeModal`）、電子処方箋操作パネル（`ElectronicPrescriptionPrintPanel`）を React `renderToStaticMarkup` による実描画テストへ昇格（26 assert）。`DispensingRecordPrint.tsx` の個別 readFileSync を撤廃したが、ファイル先頭の 7 箇所の readFileSync と 202 assert のソース由来検査が依然残存（全 234 assert 中、ソース検査 202 / 実描画 26）。続いて追加検証で判明した各点（当日期限判定の `<=` 統一、見込み残在庫ベース推奨発注量算出とワークベンチ完全一致、在庫120警告維持・補充10判定、棚不足追記時の件数・ID更新、および目標在庫量 targetStock の推奨量計算・リスク抽出条件への統合）を是正。Fail-First 変異テストで全件のバグ検知を実証。型チェック・リント・スタイル予算（上限3）・テスト全 1,824 件 PASS（78スイート）、本番ビルド全 28 ページ成功。詳細は [総合報告書改訂版](comprehensive_implementation_report_20261002.md)。
- **2026-10-06**: トラック A-3（処方入力監査への手動指定調剤区分・算定判定食い違い警告接続）および トラック I-1（印刷・帳票・連携コンポーネント全種の実描画テスト化）を実施。トラック A-3 では、点数算定ロジックを独断で書き換えることなく（第十条遵守）、薬剤師が手動指定した調剤区分（内服等）と用法の自動判定（外用等）が食い違う場合に、処方入力監査（`src/lib/prescription_input_audit.ts`）で `dosage_category_calculation_conflict`（severity: 'warning'）として検知し、調剤・請求前に食い違いを水際で表面化する安全保護ロジックを実装。Fail-First 変異テストで検出実証完了。トラック I-1 では、ソース文字列テスト（`readFileSync`）からの脱却を決定的に推進し、印刷・帳票画面（`/print/[visitId]`）を構成する全 11 コンポーネント（薬情3種: `DrugInfoItemCard`, `DrugInfoClaimTools`, `DrugInfoPrint`、薬袋: `MedicineBagPrint`、調剤明細書: `ReceiptStatementPrint`、領収証: `ReceiptPrint`、手帳シール: `MedicineNotebookStickerPrint`、水剤ラベル: `LiquidLabelSheetPrint`、軟膏ラベル: `OintmentLabelSheetPrint`、非常時復旧鍵シート: `EmergencyRecoveryKeySheetPrint`、調剤機器連携: `PharmacyDeviceHandoffPanel`）において React `renderToStaticMarkup` による本物の HTML 実描画テストを独立新設および `PrintPickingFlow.test.ts` に完全統合。Fail-First 変異テストにより全コンポーネントで破壊検出能力を実証。型チェック 0 件（`npx tsc --noEmit` exit 0）、インライン style 予算 3 箇所厳守、全ユニット/契約テスト 1,851 件 PASS（+27 件純増、全 78 スイート、約 54 秒）、本番ビルド全 28 ページ成功。
- **2026-11-21**: 合意済みの設計・仕様 5 領域を一括実装し、品質ゲート（`tsc` 0 / `lint` 0 / `npm test` 3,197 pass / `build` 32/32 / `swf` 3/4/5/0/0）および実機 Chrome E2E 5 本すべてを通過。① **Q-4**（`a59f367`）: `src/lib/network_host_policy.ts` にループバック・プライベート LAN IP 判定を集約し、同期・調剤機器・電子処方箋・外部連携診断の全コネクタ検証を統一強化。② **暗号化患者検索ブラインドインデックス**（`5454628`・`a650206`）: `PATIENT_SCHEMA` v4→v5 で平文 PII を出さない鍵付き HMAC-SHA256 索引 6 項目を導入（Dexie.js `DXE1` 準拠の `default: ''`・`required` 化と全スキーマ自動防壁テスト追加、自動フック・起動時バックフィル・安全フォールバック、同期 push 時除去・pull/競合時ローカル再索引による端末鍵差の誤競合防止）。③ **請求・UKE 出力変更**: A-3 算定側の既定を手動指定尊重へ統一（`a02c2e1`）、A-1 手入力処方での公式 16 桁 `electronicUsageCode` 保存と送信ペイロード差分実測（`9994ac7`）、A-2 監査付き冪等データ移行ヘルパー（`bccd714`）、A-4 単票・月次公式 UKE の SH 用法コード配線と未設定件数事前点検（`8dd5b3b`）、F-2 構造化 `interventionEvents` からの公式 `CO`（`810000001`）自動出力（`0c6f36e`）、C-1 ステップ 5a として単票・月次画面の旧形式点検用 UKE ボタンをネイティブ `<details>`/`<summary>` 詳細メニューへ段階格納（`49c590d`）。④ **同期・競合解決仕様**: ハブ正本優先＋薬剤師手動レビュー（`TerminalSyncPanel`、暗黙の上書き LWW 禁止）を正式仕様として確定。⑤ **I-1**（`abbf183`）: `PrintPickingFlow.test.ts` の残り全 7 箇所の `readFileSync` を 0 件へ撤廃し、抽出した画面部品・ルートガード・純粋ヘルパーに対する実実行・`renderToStaticMarkup` 契約テストへ全面移行（印刷画面も 2,434→2,144 行へ軽量化）。
- **2026-11-22**: Phase A 品質強化 6 コミットおよび Phase B 承認済み 5 機能（B-1・F-1・F-3・G-1・H-1）＋ Q-5 トラック編入をすべて実装・検証完了。品質ゲート（`tsc` 0 / `lint` 0 / `npm test` 3,222 pass / 217 suites / `build` 32/32 / `swf` 3/4/5/0/0・`colon-any` 14→10）および実機 Chrome E2E 5 本（`sync`・`onboarding`・`return-correction`・`print-layout` 11 帳票・`accessibility` 1280/768/375px オーバーフロー 0px）全通過。
  - **Phase A**: 残存ソース文字列テストの実描画・実行テスト移行（`7bb0c9e`・`b7d3d42`・`fb88e6a`）、`registerPatient` 重複患者照合の鍵付きブラインドインデックス化（`dc95e0f`）、非印刷 CSS sub-1rem 生フォントサイズ 41→0 トークン統一（`9d809dd`）、非除外 `: any` 全撤廃（`05f713c`）。
  - **Phase B**: **B-1**（`930f442`）単位換算時の全帳票（調剤録・薬袋・軟膏ラベル・手帳シール・薬情＋既存水剤ラベル）への調剤実量併記；**F-1**（`a2a4917`）構造化フォロー定型 4 種・薬剤師ロール即時編集・全テンプレート SOAP 挿入の `aiStatus: 'unconfirmed'` 強制（第一条）・EMR フォロー予約カード（`EmrFollowUpCard`→ダッシュボード KPI 接続）；**F-3**（`f0df698`）腎機能（eGFR/Cr/CrCl）・妊娠/授乳・併用 OTC/サプリ安全チェック拡張、`PATIENT_SCHEMA` v5→v6（`5: keepDocument`、`clinicalProfile` 暗号化）、手動入力＋電子処方箋検査値 1 クリック取込、90 日超過 `参考値（90日超過・要再確認）`・未登録時 `判定不能` 明示（第四条）；**G-1**（`b3fc878`）GS1 ピッキング FEFO 逸脱監査、`AUDIT_LOG_SCHEMA` v20→v21（`20: keepDocument`・構造化在庫監査種別 6 件追加）、取消・返品・廃棄・棚卸差異の構造化記録と麻薬・向精神薬受払補助帳簿 CSV/印刷出力（`法定帳簿の補助記録` 明記・患者個人情報ゼロ）；**H-1**（`62fe33c`）ローカル/NAS 追記専用 WORM 監査ログ保全コネクタ（`wx` 排他追記 `EEXIST` 拒否、`chmod 0o444`、`audit_worm_manifest.jsonl` SHA-256 チェーン、書き戻し照合、`--verify-only`、`npm run audit:local-worm-retention` / `:scheduled`）。

## 6. 今回の照合で修正した前提

- **C-1**: ステップ 1〜4 およびステップ 5a（旧形式点検用 UKE ボタンの `<details>` 詳細メニュー格納、`49c590d`）を完了。ステップ 5b（旧形式コードの完全削除）は条件 A（公式運用実績 1 ヶ月以上）・条件 B（直近 3 ヶ月旧形式出力 0 件）・条件 C（ステークホルダー合意）の充足まで並行維持する方針を確定。
- **Phase B 承認済み 5 機能（B-1・F-1・F-3・G-1・H-1）**: 要判断事項の合意を受けすべて実装・fail-first 変異テスト・全品質ゲート・実機 Chrome E2E 検証まで完了。
- **Q-5（2026-10-30〜11-17 追補）**: 算定条件（`claim_conditions.ts`・`facility_settings` v6）、領収証照合バーコード（`receipt_barcode.ts`）、自費患者の請求除外（`b73d7f3`・`b7d3d42`）を第Ⅲ部トラック C（C-5）へ、マイナ読取連携フォルダ XML の公式仕様突合・実機検証をトラック D（D-1）へ正式編入完了。
- **実施順序**: 実装可能な Phase A・Phase B 項目（A-1〜A-5 / B-1・B-2 / C-4・C-5 / D-2 / F-1〜F-3 / G-1・G-2 / H-1 / I-1・I-3・I-6）を完了済みへ整理し、残存タスクを条件待ち（C-1 ステップ 5b）、要判断・公式資料待ち（C-2 / C-3 / H-2 / I-2 保管ルール）、現地証跡・実データ待ち（D-1 / E-1 / E-2 / F-4 / H-3 / H-4 / I-4）、およびリモート同期（I-5）へ集約した。
- 今回も実プリンタ・現地機器・実症例での本番証跡収集は未実施であるため、実ブラウザ E2E 確認と領域別の本番証跡は厳格に区別し、第Ⅱ部 §4 の領域別 `status` は引き上げない。

---

# 第Ⅲ部 実装予定の機能

## 0. 優先順位の原則

トラック間・トラック内で順序を決めるときは、次の順に重みを置く。上位を損なう下位の改善は行わない。

1. **臨床安全**（患者に渡る印刷物・警告の正しさ）
2. **請求の正確性**（点数・UKE・返戻）
3. **データ保全**（消えない・改ざんされない・復旧できる）
4. **本番接続の証跡**（電子処方箋・資格確認・機器）
5. **現場の運用効率**
6. **開発効率・コード品質**

各項目には「前提」「方針」「受入基準」「要判断」を書く。**「要判断」は実装者が決めてはならない事項**であり、決まるまでその項目は着手しない（他の部分は進める）。

## トラック A: 用法・剤形整合の完了（PR-G 系の残り — A-1〜A-5 完了）

用法マスタ計画書（`docs/usage_master_20260906_implementation_plan.md`）の PR-G1〜G6 と A-1〜A-5 はすべて実装・検証完了。

### A-1 手入力処方への電子処方箋用法コード保存（PR-G7 — 実装完了 `9994ac7`）
- **前提**: PR-G5 で用法が公式マスタからの選択式になった。16 桁 `prescriptionCode` を既存フィールド `electronicUsageCode`（`maxLength: 50`）へ保存でき、スキーマ変更は不要。
- **実装内容（2026-11-21）**: `src/lib/master-data/usage_master.ts` に公式マスタ（1,775 件・重複ラベル 0 件）の O(1) 参照関数を追加し、`src/app/ocr/helpers.ts` / `PrescriptionGroupEditor.tsx` で手動用法選択時に 16 桁 `prescriptionCode` を `electronicUsageCode` へ自動保存（自由入力・消去時はクリアしてコード捏造を防止）。`buildElectronicPrescriptionDispensingResultPayload` を純粋関数として抽出し、`src/app/ocr/ElectronicUsageCodePersistence.test.ts` で変更前後の送信ペイロード差分（`usageCode: undefined` → `'1011000100000000'`）と fail-first mutation 3 件を実証。

### A-2 既存の `001 1日3回食後服用` 形式で保存された用法の扱い（実装完了 `bccd714`）
- **前提**: PR-G2 は新規混入を止めただけで、既存データには先頭 3 桁コード付き用法文字列が残り得た。
- **実装内容（2026-11-21）**: スキーマ変更ではなく監査付きデータ移行ヘルパー `src/lib/usage_legacy_migration.ts`（`parseLegacyCodedUsage`・`planLegacyUsageNormalization`・`migrateLegacyCodedUsages`、`dryRun` 対応・冪等実行・監査失敗時ロールバック）を新設。公式用法マスタ完全一致時のみ 16 桁 `electronicUsageCode` を補完し、不一致の自由入力にはコードを捏造しない契約を `usage_legacy_migration.test.ts` および fail-first mutation 3 件で実証。

### A-3 算定側の剤形判定で手動指定を尊重するか（実装完了 `a02c2e1`）
- **前提**: 従来 `calculator.ts` の `isExternal` は用法正規表現を無条件 OR しており、帳票（手動指定尊重）と算定が食い違っていた（第八条）。PR-H1/H5（`c27ad82`）で影響点検ワークスペースを先行配備した。
- **実装内容（2026-11-21）**: 合意に基づき `src/lib/dosage_category.ts` の既定を `resolution: DosageCategoryResolution = 'respect_manual'` へ切替え、算定側と帳票側の剤形判定を統一。手動「内服」×点眼用法ケースでの点数差分（旧 `legacy`: 10 点 → 新既定 `respect_manual`: 24 点）を `calculator.test.ts` に固定し、入力監査警告（`prescription_input_audit.ts`）も「算定・帳票ともに手動指定を優先しつつ用法文言との矛盾を警告する」表現へ整合化。fail-first mutation 2 件で実証。

### A-4 UKE 用法コード（SH レコード）の配線（実装完了 `8dd5b3b`）
- **前提**: 従来 SH レコード第 3 項目（用法コード）は常に空だった。外用・注射では `900` が公式仕様上の正しい値。
- **実装内容（2026-11-21）**: `src/lib/monthly_claim_uke.ts` の単票・月次共通ビルダー `buildMonthlyClaimOfficialBodyRecords` へ `deriveOfficialUsageCode` を配線し、公式 3 桁レセプト用法コード（内服 `005`、外用・注射 `900` 等）を SH 第 3 項目へ出力（公式マスタ未一致の自由入力は空欄維持・自前発番禁止）。併せて公式提出準備チェック（`MonthlyClaimUkeOfficialReadinessReport` / `formatMonthlyClaimUkePreflightReport`）に `checkedUsageGroupCount`・`missingUsageCodeCount`（「用法コード未設定 N件」）を追加。`dispensing_uke_official_usage_code.test.ts` および fail-first mutation 2 件で実証。

### A-5 剤形と日数の不整合チェック（実装完了）
- **前提**: 内滴に日数が入っている、外用に日数があるといった入力を、現在は監査で警告していない。PR-G5 で剤形不一致監査は入ったが、日数は対象外。
- **進捗**: PR-H2（`42ce918`）により、入力監査（`src/lib/prescription_input_audit.ts`）に警告 `INVALID_DAYS_FOR_DOSAGE_CATEGORY` を実装完了。内滴・外用・注射・頓服で日数が 0 より大きい場合に「1回量・総量で処方する剤形ですが、日数が入力されています」と警告し、強制ブロックはせず（第四条遵守）、修正案内を提示する。

## トラック B: 単位・数量セマンティクスの完了（PR-D 系の残り — B-1・B-2 完了）

### B-1 薬袋・ラベルへの処方単位・調剤実量の併記（実装完了 `930f442`）
- **前提**: 電子処方箋取込で処方単位と調剤（薬価）単位を換算した際、`electronicUnitConversion` に換算元の処方量・調剤量を保持している（PR-D2）。従来は水剤ラベルのみ換算後調剤量を併記しており、他帳票との整合が不足していた。
- **実装内容（2026-11-22）**: `src/app/print/helpers.ts` に `getDispensingAmountText` を新設し（`getDispensingTotalAmountText` にも `masterUnitText` フォールバックを追加）、`electronicUnitConversion` が存在する場合に全帳票（調剤録 `DispensingRecordPrint.tsx`・薬袋 `MedicineBagPrint.tsx`・軟膏ラベル `OintmentLabelSheetPrint.tsx`・お薬手帳シール `MedicineNotebookStickerPrint.tsx`・薬情 `DrugInfoItemCard.tsx`、および既存の水剤ラベル）で調剤実量・調剤換算量を併記するよう統一。`PrintUnitDisplay.test.ts` で全 5 帳票の正例・負例実描画テスト、fail-first 変異テスト 5/5 件、および実機 Chrome `test:e2e:print-layout`（11 帳票キャプチャ）を実証。

### B-2 帳票・算定ヘルパーの `any` 排除（実装完了）
- **前提**: `helpers.ts` の `getElectronicPrescriptionDocumentKinds` と `claim_actions.ts` の `buildItemClaimFlagPatches(item: any)` に `any` が残る（`919ba74` で前者は一部型付け済み）。
- **進捗**: PR-H4（`b25db56`）により、未使用の重複ヘルパー（`getElectronicPrescriptionDocumentKinds`）を削除し、`claim_actions.ts` の `buildItemClaimFlagPatches` に厳格な型（`PrescriptionItemClaimTarget`）を付与して `any` を排除完了。既存テスト全通過、挙動変更ゼロ。

## トラック C: 算定・レセプト（critical）

### C-1 通常 UKE と公式提出用 UKE の生成経路統合（ステップ 1〜4・ステップ 5a 完了、旧形式完全削除は条件 A/B/C 待ち）
- **前提**: 単票・月次通常出力は `buildDispensingUkeRecords` と `generateUkeContent` を使用し、独自の項目位置・算定キーや作成日時を入れた ST を出す。月次公式提出は `buildMonthlyClaimOfficialUkeBundle` → `buildDispensingUkeOfficialFile` → `generateDispensingUkeOfficialContent` を使用する。両経路とも画面に接続されている。
- **実装済み**:
  - 公式経路の GO 集計、記録済み入力に基づく SN/JD/MF/ST の条件付き生成、西暦形式、提出準備チェック・集計突合（`src/lib/monthly_claim_uke.ts`、`src/lib/receipt/dispensing_uke_official.ts`）。
  - **2026-09-30 にステップ 1（経路と差分の固定）を完了**: 単票通常・月次通常・月次公式の 3 経路について、入力・生成レコード・停止条件・請求状態更新の対照表を整理。同一架空入力による実測出力差分（Shift-JIS デコードテキスト、ヘッダー/RE/HO/CZ/KI/IY/ST/GO の差異、末尾 EOF `0x1A` の有無、ドラフト状態ブロック契約、複数件集計合算）を自動テスト（`src/lib/receipt/dispensing_uke_comparison.test.ts`、全 3 件 PASS、fail-first mutation 実証済み）および比較スクリプト（`scripts/compare_uke_paths.mjs`）で固定。詳細は [対照表・差分報告書](uke_generation_paths_comparison_20260930.md)。
  - **2026-09-30 にステップ 2（SN/JD/MF/ST 共通化・単票公式ビルダー確立）を完了**:
    - 条件付き補助レコード（SN: 特別公費、JD: 日別調剤日、MF: 窓口負担額、ST: 医師指示分割調剤）の生成処理を純粋関数モジュール（`src/lib/receipt/dispensing_uke_official_supplemental.ts`）に抽出し、月次公式ビルダー（`src/lib/monthly_claim_uke.ts`）から委譲呼び出し。
    - 単票（1件受付）から公式仕様 UKE（RECEIPTY.CYO、GO: 1, totalPoints, 99、バイナリ末尾 0x1A）を生成する純粋関数 `buildSingleDispensingUkeOfficial`（`src/lib/receipt/dispensing_uke_official_single.ts`）を確立。月次公式バンドルエンジンと契約を共有し、二重実装ゼロを達成。
    - 契約テスト（`dispensing_uke_official_supplemental.test.ts` 5件、`dispensing_uke_official_single.test.ts` 3件、全 8 件 PASS、fail-first mutation 実証済み）、および [ステップ 2 計画・設計報告書](uke_generation_unification_plan_step2.md) を作成。
  - **2026-10-01 にステップ 3（単票画面への公式出力UI併設・実務並行検証）を完了**:
    - 単票画面（`/print/[visitId]`）のアクションバーに「公式UKE」ボタン（`data-testid="print-official-uke-button"`）を設置し、現行の「UKE出力」（`print-uke-export-button`）と併設。
    - 専用モーダル `SingleOfficialUkeModal`（`src/app/print/components/SingleOfficialUkeModal.tsx`）を実装。公式仕様適合検証、サマリー表示（RECEIPTY.CYO、1件、点数、行数、EOF 0x1A）、構成レコード種別チップ表示（YK/RE/HO/GO等）、等幅電算テキストプレビュー、コピー機能、およびダウンロード（`data-testid="download-official-cyo-button"`）と監査ログ（`uke_export`）を接続。
    - 厚労省コード欠落時は出力制限アラートとダウンロード非活性化で安全保護。インライン `style={{}}` ゼロ（Vanilla CSS `print.css`）。
    - 契約テスト（モーダル単体 `SingleOfficialUkeModal.test.ts` 3件、画面併設 `PrintPickingFlow.test.ts` 1件、全 4 件増、全 1,779 件 PASS、fail-first mutation 実証済み）、および [ステップ 3 報告書](uke_generation_unification_plan_step3.md) を作成。
  - **2026-10-01 にステップ 4（本番切替準備・安全な移行設計・完全廃止判定基準策定）を完了**:
    - 通常出力を独断で塞がず（AGENTS.md 第十条）、「点検用旧形式（院内点検・独自連携用）」として位置づけを明確化し、公的提出用正本（`RECEIPTY.CYO`）を前面に配置。
    - 単票画面（`/print/[visitId]`）および月次請求ワークベンチ（`ClaimWorkbenchSection.tsx`）の双方で、ボタンの `title` 属性（正本 vs 点検用旧形式）および監査ログ（`audit_logs`）のメッセージを厳格に区分化（「公式レセプト（UKE / RECEIPTY.CYO）エクスポート」「月次公式UKE出力」 vs 「レセプト（UKE・点検用旧形式）エクスポート」「月次一括UKE（点検用旧形式）出力」）。
    - 旧形式完全廃止の客観的判定基準（条件A: 公式運用実績1ヶ月以上、条件B: 直近3ヶ月旧形式出力0件、条件C: ステークホルダー合意）および分類・判定純粋関数（`src/lib/receipt/uke_migration_policy.ts`）を配備。
    - 契約テスト（`dispensing_uke_step4_switchover.test.ts` 4件、全 1,788 件 PASS、fail-first mutation 実証済み）、および [ステップ 4 報告書](uke_generation_unification_plan_step4.md) を作成。
  - **2026-11-21 にステップ 5a（旧形式ボタンの UI 詳細メニュー格納、`49c590d`）を完了**:
    - 単票画面（`src/app/print/components/PrintHeaderActions.tsx`）および月次請求ワークベンチ（`src/components/dashboard/ClaimWorkbenchSection.tsx`）において、公的提出用正本（`RECEIPTY.CYO`）を前面ボタンとしつつ、旧形式点検用 UKE ボタンをネイティブ `<details>`/`<summary>` 折り畳み詳細メニュー（初期閉・Vanilla CSS・インライン style 0 件、`data-testid` 維持）へ格納。
    - 契約テスト（`dispensing_uke_step4_switchover.test.ts`・`ClaimWorkbenchSelfPay.test.ts`・`PrintResponsiveLayout.test.ts`）および fail-first mutation 2 件・実機 Chrome E2E（`onboarding`・`accessibility`）で実証。
- **方針**: 公式ビルダを唯一の提出経路とする方針のもと、以下の段階的移行を進める。
  1. **経路と差分の固定**: 達成済み（ステップ 1）。
  2. **共通化と単票公式ビルダー確立**: 達成済み（ステップ 2）。SN/JD/MF/ST の条件付き生成ロジック共通化および単票公式生成関数を部品化。
  3. **単票画面への公式出力UI併設**: 達成済み（ステップ 3）。単票画面において既存の通常出力ボタンに加えて「公式提出用 UKE（RECEIPTY.CYO）プレビュー・ダウンロード」を併設し、実務並行検証環境を確立。
  4. **本番切替準備と安全な移行設計**: 達成済み（ステップ 4）。公式提出用を正本としつつ通常出力を点検用旧形式として並行維持し、監査ログによる利用追跡と完全廃止判定基準（条件A・B・C）を確立。
  5. **UI集約（ステップ 5a 完了）と完全廃止（ステップ 5b・条件待ち）**: ステップ 5a として旧形式ボタンを UI 詳細メニュー（`<details>`）へ格納済み。条件A（実機受付確認1ヶ月以上）・条件B（直近3ヶ月旧形式出力0件）・条件C（ステークホルダー合意）の充足をもってステップ 5b（旧形式生成コードの完全削除）へ進む。
- **受入基準**: 各段で変更前後の出力差分を提示し、骨格ゲート（先頭 YK / 末尾 GO / SH または KI 必須 / 非標準レコード混入なし）と集計突合を通す。公式資料・国保連サンプルとの確認済み範囲および未確認範囲を記録する。
- **要判断**: 条件A・B・C 達成後の旧形式コードの完全削除時期。調査完了・部品化完了をもって出力経路を自動的に切り替えない。

### C-2 薬価改定「変更年月日」の読み方の確定と遡り取込
- **前提**: 項番 30「変更年月日」を薬価の適用開始日として読んでいるが、公式 PDF は列レイアウト表のみで意味の説明が無く、この読み方は**未確認**。当日取込では結果は同じ。
- **方針**: 薬剤師・運用者へ確認し、確定するまで遡り取込（古いマスタファイルの取込）を始めない。既に古いファイルを取り込んでも現在薬価は巻き戻らない守りは入っている。
- **要判断**: 「変更年月日 = 適用開始日」の解釈。

### C-3 算定ルールの残パターンと施設基準加算/減算の月内条件
- **前提**: 検査薬の薬剤料以外、電子的調剤情報連携体制整備加算の同月 2 回以上、特別調剤基本料 B、保険・公費の有効期間外は算定ルール確認へ集約済み。
- **方針**: 現物返戻事例を `claim_rule_review.ts` へ継続投入し、疑義解釈の 1 ケース = 1 テストとして積む。点数が変わる修正は必ず「請求点数の変動点検」で影響件数を出してから入れる。
- **受入基準**: 各ルールに出典（告示・疑義解釈の番号）が付き、テストで再現できる。

### C-4 減免区分・高額療養費の対応点検とUI・事前点検接続（完了）
- **前提**: 別表 7/8/10 の記録は実装済み（P3-B）。印刷画面には保険・公費の一部負担金額の入力があり、患者編集には公費の入力があったが、高額療養費・減免の構造化入力フォームが存在せず、保存時に既存値が消失するリスクが存在していた。
- **実装済み（2026-10-01）**:
  - 純粋モジュール `src/lib/patient_copayment_support.ts` を新設し、高額療養費（限度額適用認定証ア〜キ、多数回該当、一部負担金区分別表8）および減免（別表10コード1〜3、減額割合%、減額金額円、国保証明書番号3桁）の相互変換・サニタイズ・バッジ生成・印刷ガイダンス・事前点検関数を確立。
  - 患者編集モーダル（`PatientBanner.tsx`）で高額療養費・減免の保存時データ消失バグを解消し、構造化編集フォーム（`emr-high-cost-editor`、`emr-reduction-editor`）を配備。
  - EMR患者バナーおよび処方受付画面（`/ocr`）の選択中患者カードに高額療養費・減免のリアルタイムバッジ表示を接続。
  - 印刷画面（`/print/[visitId]`）の一部負担金ブロックに、患者の認定証・減免証に応じた注意ガイダンスバナー（`copayment-guidance-banner`）を配備し、窓口での誤徴収を防止。
  - 月次ワークベンチ公式事前点検（`monthly_claim_uke.ts`）に `validateCopaymentSupportReadiness` を統合し、不正コードや減額割合欠落、証明書番号桁数不正を事前検知。
  - 契約テスト（`src/lib/receipt/patient_copayment_support.test.ts` 7件、fail-first mutation 実証済み）、および [点検報告書](copayment_and_reduction_audit_20261001.md) を作成。額の算出は行わない（第四条遵守）。

### C-5 算定条件・自費患者請求除外・領収証検証バーコード（Q-5 正式編入・実装完了）
- **算定条件（`claim_conditions.ts`・`facility_settings` v6）**: お薬手帳の有無・時間外/休日/深夜区分（営業時間 `businessHours` による判定）・特定薬剤管理指導加算（トッカン）の来局単位指定を `visit.claimOptions` へ統一し、画面・領収証・明細書・UKE が単一の `calculateDispensingFees` 結果を参照する構成を確立（点数未設定の項目は勘補完せず「点数未設定」として停止、第四条遵守）。
- **自費患者の請求除外（`b73d7f3`・`b7d3d42`）**: `self_pay_claim.ts` で明示的な自費患者を単票・月次 UKE および月次ワークベンチ請求対象から除外し、`ClaimWorkbenchSelfPay.test.ts` にて実描画・実行テスト化完了。
- **領収証照合バーコード（`receipt_barcode.ts`）**: 保険区分 1 桁（1=国保 / 2=社保 / 3=自費）＋領収金額 7 桁＋Luhn チェックデジット 1 桁の 9 桁固定長 Code128 を印字（判定不能時は `assumed` として自費扱い理由を明示）。実機 Chrome `test:e2e:print-layout` で `200009603` / `¥960` の印字・チェックデジット一致を自動回帰検証。

## トラック D: 保険・資格確認（critical）

### D-1 オンライン資格確認・マイナ資格確認の本番接続およびマイナ読取実機仕様突合（Q-5 正式編入）
- **前提**: コネクタ（`online_eligibility_live_connector.ts`）、応答差分（`online_eligibility_response_diff.ts`）、現地準備 CLI（`eligibility:field-readiness`）、および資格確認端末連携フォルダ XML 読取は実装済み。公式認証方式・連携フォルダ XML 形式の公式仕様書突合と、現地機器での成功試行の現物証跡が無い。
- **方針**: 現地証跡が無い限り本番可としない（`docs/electronic_prescription_rollout_plan.md` §6 と同じ判定規則）。実レスポンスおよび連携フォルダ XML の現物サンプルを `YAKUREKI_ELIGIBILITY_RESPONSE_DIFF` 等へ投入して仕様突合・差分ゼロを確認する。
- **受入基準**: `eligibility:field-readiness` が `pass` かつマイナ読取連携フォルダ XML の実機仕様突合が完了していること。

### D-2 公費期限警告・負担上限・資格確認日の運用管理
- **実装済み**: `PatientBanner.tsx` に保険の有効期間・資格確認日・状態、複数公費（最大4件）の開始日・期限・負担上限・負担割合の構造化入力がある。`evaluateInsuranceEligibility` に期限切れ・期限間近・負担上限未設定・資格確認日の警告があり、請求前チェックとダッシュボードの請求リスク、および薬歴バナーの公費警告バッジへ接続されている。
- **進捗（2026-09-30）**:
  - `PatientBanner.tsx` で公費1件目のみを扱って2件目以降を失っていたデータ消失バグを解消。
  - 純粋関数モジュール `src/lib/patient_public_insurance.ts` を新設し、法別番号（51, 54, 21, 12, 80等）による制度名判定、全角数字サニタイズ、最大4件の配列変換、未編集公費保護マージ（`mergePreservingUneditedPublicInsurances`）を実装。
  - モーダル内に最大4件の複数公費カード（「第1公費」「第2公費」...）の追加・削除・編集UIを整備し、制度名タグをリアルタイム表示。
  - 薬歴バナーに公費ごとのバッジ（制度名・負担割合）を表示し、`evaluateInsuranceEligibility` と連動して期限切れ（赤・要確認）や期限間近・上限未設定（橙・期限注意）を表面化。
  - 純粋関数単体テスト（8件）、契約テスト（1件）、実レンダリングテスト（3件）の計12件を追加し、fail-first mutation での変異注入・脱落検知を実証。幅 1280px / 768px / 375px の実ブラウザ画面キャプチャで折り返し・表示崩れなしを確認。
- **残る方針**: 処方受付画面（`/ocr`）および月次ワークベンチ（`ClaimWorkbenchRow`）での複数公費・期限切れ警告表示の接続を完了。実店舗パイロット時の運用フィードバックに応じた微調整を継続する。
- **受入基準**: 公費2件以上の患者で他の患者情報や公費1件目を編集しても、未編集の公費・順序・付随項目が保存前後で維持される（達成済み）。期限当日・期限切れ・資格未確認の表示を薬歴・処方受付・月次請求一覧の実画面で確認する（達成済み）。

## トラック E: 電子処方箋・調剤機器の本番接続

### E-1 電子処方箋接続モジュールの現地試験
- **前提**: 取得・署名/HPKI 検証・重複投薬チェック・受付取消・調剤結果登録/検索/取消/変更・リフィル・紙処方箋の各 capability、preflight、契約 CLI は実装済み。現地端末での試験証跡が無い。
- **方針**: 接続方式（`qualification_terminal` / `web_api`）を店舗ごとに決め、`electronic-prescription:connector-preflight` → `connector-contract` → `field-readiness` の順で証跡を積む。6 桁引換番号・タイムアウト後の ID 検索による二重登録防止を現地で確認する。
- **受入基準**: 設定画面の外部連携診断が `設定OK`、現地試験 CLI が `OK`、パイロット正式運用判定で必須レビュー通過。

### E-2 NSIPS 調剤機器連携の安定運用証跡
- **前提**: 施設内コネクタ経由の送信・差替・取消、シミュレータ、現地準備 CLI は実装済み。`0c59de0` 以降、機器連携ペイロードに `unit` が実際に送信される。
- **方針**: 許諾・仕様確認済みのゲートウェイまたはメーカー API で、送信・内容一致・重複防止・差替・取消・再起動復帰を実機確認し、20 営業日の安定運用証跡を投入する。
- **要判断**: 対象機器（散薬分包機・水剤監査機・POS）の順序。

## トラック F: 薬歴・臨床安全

### F-1 服薬フォローアップと薬剤別指導テンプレート（実装完了 `a2a4917`）
- **前提**: SOAP 4 パネル、構造化チェック、前回 Do、処方差分、タイムライン、薬情テンプレ承認制は実装済み。継続フォロー・次回確認事項・残薬/副作用/アドヒアランスのテンプレ化が未完だった。
- **実装内容（2026-11-22）**: 純粋モジュール `src/lib/follow_up_templates.ts` と EMR フォロー予約カード `src/app/emr/components/EmrFollowUpCard.tsx` を新設。`medication_guidances` の薬剤別指導テンプレートを薬剤師ロールで承認待ちなしに即時編集可能とし、`MedicationGuidanceModal.tsx` に構造化フォロー定型 4 種（残薬確認・副作用確認・アドヒアランス・次回確認事項）を追加。すべてのテンプレート SOAP 挿入は必ず `origin: 'ai_draft'`・`aiStatus: 'unconfirmed'` として発行し（第一条遵守・未確認のままトレーシングレポートへ流出しないことを検証済み）、`EmrFollowUpCard` から保存したフォロー予定（`visit.followUp`）がダッシュボード KPI「フォロー候補」へ直結する。`follow_up_templates.test.ts` および fail-first 変異テスト 3/3 件で実証。

### F-2 疑義照会・処方変更履歴の構造化（調剤録・EMR・事前点検・公式 UKE `CO` 配線完了 `0c6f36e`）
- **前提**: `interventions`（v3）に疑義照会は入るが、後発変更・残薬調整・患者同意・医師回答を薬歴・調剤録・レセプト摘要へ連動させる構造化が未完であった。
- **実装内容**:
  - **2026-10-01（構造化・調剤録・EMR・事前点検）**: 新規コレクションを増やさず、訪問データ（`visits`）内の入れ子プロパティ `interventionEvents` として構造化保存（RxDB スキーマ v23、暗号化指定、`22: keepDocument`）。調剤録（`DispensingRecordPrint.tsx`）に薬剤師法第24条・第28条第2項・施行規則第16条第1項第10号（第15条第2号・第3号準用）に基づく法定記載欄（`data-testid="record-intervention-box"`）を新設。EMR 画面（`EmrInterventionModal.tsx`）に照会区分（後発変更・残薬調整・用法用量・重複禁忌・中止・その他）の選択・自動サジェスト・バッジ表示を配備。純粋関数モジュール（`prescription_intervention_support.ts`）によりレセプト摘要要約テキスト生成および未回答疑義の公式事前点検（`official_uke_intervention_inquiry_pending` / `official_uke_intervention_reason_missing`）を統合（[報告書](intervention_structuring_20261001.md)）。
  - **2026-11-21（公式 UKE `CO` 摘要自動印字配線 `0c6f36e`）**: `src/lib/receipt/dispensing_uke_official_supplemental.ts` に `OFFICIAL_FREE_TEXT_COMMENT_CODE = '810000001'`・`sanitizeAndChunkOfficialCommentText`（Shift-JIS 76 バイト以内分割・改行/カンマ無害化）・`buildOfficialInterventionComments`（`cancelled` 除外・重複除外）を実装し、`src/lib/monthly_claim_uke.ts`（単票・月次共通）へ接続。RP1 直下に公式 `CO`（KI 単独時は `TK`）を自動出力し、`dispensing_uke_official_intervention_co.test.ts`（公式提出モード検証エラー 0 件）および fail-first mutation 3 件で実証。

### F-3 安全チェックの判定軸拡張（実装完了 `f0df698`）
- **前提**: アレルギー/副作用歴のファジー一致、PMDA 添付文書由来の相互作用・禁忌、同効薬重複（YJ 上 4 桁）、禁忌疾患は実装済み。腎機能・妊娠授乳・併用 OTC/サプリが未対応だった。
- **実装内容（2026-11-22）**: `PATIENT_SCHEMA` v5→v6（`5: keepDocument`、`clinicalProfile` を `encrypted` 指定）へ拡張し、純粋評価エンジン `src/lib/clinical_safety_axes.ts` と EMR 臨床検査値カード `src/app/emr/components/VitalInsightCard.tsx` を実装。腎機能（eGFR/Cr/CrCl）・妊娠/授乳状況・併用 OTC/サプリの 3 軸を手動入力および電子処方箋検査値 1 クリック取込の双方から受け取り、EMR 警告パネルへリアルタイム反映する。90 日超過の検査値は `参考値（90日超過・要再確認）` として明示し、腎排泄/腎注意薬が処方されているのに腎機能検査値が未登録の場合は `判定不能` 警告を明示する（第四条遵守）。暗号化 RxDB v5→v6 マイグレーション、`clinical_safety_axes.test.ts`、および fail-first 変異テスト 4/4 件で実証。

### F-4 AI 症例レビューへの実症例投入
- **前提**: `ai:clinical-review` CLI は有用性・誤提案・高信頼度の誤提案・店舗/提案種別の偏りを判定できるが、複数パイロット店舗の実症例が無い。
- **方針**: パイロット 4 週間 KPI（I-4）と同時に投入する。外部 LLM を導入する場合は `docs/ai_architecture_policy.md` の「将来 LLM を導入する際の必須見直し事項」（プロンプト境界・サニタイズ層）を先に実装し、本書第一条・第二条の改訂として提案する。

## トラック G: 在庫・店舗運用（G-1・G-2 完了）

### G-1 ロット/期限順の実引落と監査、取消・返品・廃棄・棚卸差異ログ（実装完了 `b3fc878`）
- **前提**: ロット・期限単位の在庫、入庫、分譲、デッドストック検知、棚番地は実装済み。実引落時の FEFO 逸脱監査、取消・返品・廃棄・棚卸差異の構造化ログ、および麻薬・向精神薬の受払補助帳簿が未完だった。
- **実装内容（2026-11-22）**:
  - `src/lib/stock.ts` に `detectFefoPickingDeviation` を新設し、EMR の GS1 ピッキング照合時（`handleVerifyPickingScan`）に最短期限の有効在庫ロット以外を照合した場合、非ブロッキング警告＋監査ログ `stock_fefo_deviation` を自動記録。
  - `AUDIT_LOG_SCHEMA` v20→v21（`20: keepDocument`・ハッシュチェーン継続検証済み）へ構造化在庫監査ログ種別 6 件（`stock_fefo_deviation`・`stock_cancel`・`stock_return`・`stock_disposal`・`stock_take_variance`・`narcotic_ledger_export`）を追加し、`DailyCheckPanel.tsx` の棚卸差異保存を `stock_take_variance` へ接続。
  - `src/lib/inventory_audit_log.ts` および `src/app/inventory/components/InventoryAuditToolsPanel.tsx` を新設し、取消・返品・廃棄・棚卸差異のロールバック付き構造化記録と、麻薬・向精神薬受払・残高補助帳簿の CSV（数式無害化・患者個人情報ゼロ、第二条遵守）および印刷 HTML（XSS エスケープ済み・`法定帳簿の補助記録` 明記）出力を実装。`inventory_audit_log.test.ts`・RxDB v20→v21 移行テスト・fail-first 変異テスト 4/4 件で実証。

### G-2 発注点・リードタイム・期限切迫・代替薬候補（実装完了）
- **前提**: 処理中処方を考慮した利用可能在庫と発注ワークベンチは実装済み。
- **進捗**: 2026-10-01 に基本機能実装完了。処方不足だけでなく、発注点（安全在庫）割れ・使用期限切迫（60日/180日）を統合した推奨発注量算出、同一規格・成分（YJコード上7桁一致）の院内代替薬候補の提示（有効在庫順）、発注ワークベンチ（理由別フィルタ・バッジ・代替薬アコーディオン）、在庫一覧テーブルでの発注点インライン編集・監査ログ記録を配備。2026-10-02 に欠品予測エンジン（`operational_ai_prediction.ts`）へのデータパイプライン（`calculateDashboardInventoryRisks` からの発注点・期限切迫ロット・代替候補の受け渡し）を正式接続。患者個人情報ゼロ規約（第二条）を完全維持した発注 CSV / メモ出力、インライン `style={{}}` ゼロ（Vanilla CSS `inventory.css`）、`DRUG_SCHEMA` v10（`9: keepDocument`）、純粋関数モジュール新設（`inventory_reorder_support.ts`）、契約テスト 8 件追加（全 1,813 件 PASS、fail-first mutation 実証済み）。詳細は [トラック G-2 報告書](inventory_reorder_and_substitution_20261001.md)。
- **方針**: 患者名を含まない発注 CSV の規約を維持する。

## トラック H: データ保全・複数端末

### H-1 S3 以外の WORM 保存先コネクタ（実装完了 `62fe33c`）
- **前提**: 従来は AWS S3 Object Lock のみ対応で、クラウドを使えない店舗向けのローカル/NAS 保全コネクタが無かった。
- **実装内容（2026-11-22）**: 単一正本コア `scripts/lib/audit_local_worm_core.mjs`（型定義 `.d.mts`＋公開窓口 `src/lib/audit_integrity_local_worm.ts`）、CLI `scripts/runAuditLogLocalWormRetention.mjs`、および定期実行ラッパー `scripts/runScheduledAuditLogLocalWormRetention.mjs`（`npm run audit:local-worm-retention` / `:scheduled`、`docs/ops_review_ledger.md` 登録済み）を実装。排他追記（`flag: 'wx'` による `EEXIST` 上書き拒否）、読取専用ロック（`chmod 0o444`）、ディスク書き戻し SHA-256／`integrity.latestHash` 照合、`audit_worm_manifest.jsonl` ハッシュチェーン追記・`--verify-only` 改ざん検知、受領書 JSON 発行、および失敗通知 JSON／Webhook 送信を完備。NAS 側 WORM 設定の運用者確認（`--immutable-verified`）が無い場合は正直に `status: 'attention'` を返す（第四条遵守）。`audit_integrity_local_worm.test.ts` および fail-first 変異テスト 3/3 件で実証。

### H-2 患者系記録の多重化コレクション `patient_records`
- **前提**: RxDB open-core の上限 14 に満杯。新しい記録種別（検査値、在宅訪問記録等）をコレクションとして足せない。
- **方針**: 計画書（`docs/satellite_terminal_sync_plan.md` の「コレクション上限」節）の手順に従う。①入れ子フィールドで足りるなら足さない、②足す場合は `medication_guidances` と `patient_medication_info_templates` の統合等で 1 枠を捻出し、`recordType` + `patientId` 複合インデックスの 1 コレクションに収容する、③同期対象表・`BACKUP_COLLECTIONS`・`collection_limit.test.ts` を同時更新。
- **要判断**: 枠を捻出する統合対象。恒久策（RxDB Premium か Dexie 自前同期）の要否。

### H-3 ハブ予備機切替と復旧手順の現物証跡
- **前提**: サテライトの「設定 > 端末同期 > 予備機切替」（P2-4）は 2026-10-22 に完成した（`src/lib/sync/standby_hub.ts`、`/api/sync/standby-hub/*`）。それ以前は固定の仮トークンで署名しており、実トークンのサテライトでは必ず「署名検証に失敗」になり、切替も画面の表示を変えるだけだった（「実装済み」は誤り）。いまは、この端末のサーバーが端末トークンで署名し、切替前に予備機が端末を受け付けることを確かめ、接続先を保存して、レプリケーションを世代つきでやり直す。予備機の実機リハーサル（年1回）の現物証跡と、本番端末の OS スケジューラ登録・点検受領書の現物証跡が無い。
- **方針**: `ops:schedule-drill` の結果と現場運用マニュアル §4/§8 の記録を証跡 JSON として保管し、`release:readiness` のゲートに投入する。

### H-4 他社ソフトからの移行 CSV
- **前提**: `migration_csv.ts` と移行トライアル受入 CLI は実装済み。和暦の生年月日は error として利用者に直させる方針（PR-E5）。
- **方針**: 実データ相当の患者・受付・在庫・薬歴 CSV を継続投入し、導入手順を現場運用マニュアルへ固定する。和暦の自動変換は行わない（第四条・第十条: 要判断として残す）。

## トラック I: 品質・運用体制

### I-1 `PrintPickingFlow.test.ts` の実描画テスト化（完了 `abbf183` — `readFileSync` 0 件）
- **前提**: 199 assert が算定変更・返戻・電子処方箋ライフサイクルや `data-testid` 配線をソース文字列で確認していた。
- **進捗**:
  - 2026-10-02 に調剤録（`DispensingRecordPrint`）・公式UKEプレビューモーダル（`SingleOfficialUkeModal`）・電子処方箋操作パネル（`ElectronicPrescriptionPrintPanel`）の 3 コンポーネントを実描画テストへ移行（残り 7 箇所の `readFileSync` が残存していた）。
  - **2026-11-21（`abbf183`）に残り全 7 箇所の `readFileSync` を完全撤廃（0 件）**。`src/app/emr/emr_route_guards.ts`・`src/app/print/components/ClaimLifecyclePanel.tsx`・`PharmacistCheckPanel.tsx`・`ClaimCheckPanel.tsx` および `src/app/print/helpers.ts` の純粋ヘルパー 4 関数（`buildPrintPickingSupportUrl`・`buildPrintInterventionUrl`・`buildPrintReceiptBarcodeState`・`runPrintWithBodyClass`）へ抽出し、実実行・React `renderToStaticMarkup` 契約テスト（17 テスト・fail-first mutation 4 件実証済み）へ全面移行完了。併せて印刷画面も 2,434→2,144 行（-290 行）へ軽量化。
  - **2026-11-22（Phase A `7bb0c9e`・`b7d3d42`・`fb88e6a`・`dc95e0f`・`9d809dd`・`05f713c`）**: 印刷・自費請求・受付の残存ソース文字列テストを実描画・実行テストへ移行完了。併せて `registerPatient` 重複患者照合の鍵付きブラインドインデックス化、非印刷 CSS sub-1rem 生フォントサイズ 41→0 の `--fs-*` トークン統一、および除外 2 ファイル以外の `: any` 全撤廃（`colon-any` 14→10）を完了。

### I-2 運用レビュー CLI の `status` 定義統一と証跡保管ルール（実装完了 `7d2c6df`・`126e1b4`）
- **前提**: `pass` / `attention` / `blocked` の共通定義と終了コード規約は `ops_review_status.ts` と運用レビュー台帳にある。証跡 JSON のリポジトリ外保管ルールと一括点検 CLI が残課題だった。
- **進捗**:
  - PR-H3（`7d2c6df`）により、台帳（`docs/ops_review_ledger.md`）に status 定義表を明記し、`ops_review_cli.test.ts` で全 CLI の出力が台帳契約と一致することを検証する契約テストを整備完了。
  - **2026-11-22（`126e1b4`）**: `docs/ops_review_ledger.md` §5 に証跡 JSON 保管・保持ルール（リポジトリ外の暗号化ディレクトリ/院内 NAS、最低保持期間 5 年、必須メタ 4 項目、禁止項目）を策定し、`src/lib/field_evidence_bundle.ts`・`scripts/runFieldEvidenceBundle.ts`（`npm run ops:field-evidence-bundle`）で Phase C 全 9 スロットの雛形一括生成（`--init`、`wx` 既存保護）、リポジトリ内パス拒否ガード、および `evidence_integrity.ts` による真正性・患者個人情報ゼロ・未記入テンプレート検知の一括監査を実装・台帳契約テストへ統合完了（fail-first 変異テスト 3/3 件実証）。

### I-3 アクセシビリティとレスポンシブの通し確認（通し確認完了）
- **前提**: 単一画面単位のデザイン改善後、受付→請求の一連フローでのキーボード操作・タブレット/モバイル通し確認が未完だった。
- **進捗**: 2026-10-02 に完了。自動化スクリプト（`scripts/run_e2e_accessibility_drill.mjs`）を抜本改修し、実在するデモ受付 `visitId` を追跡した上で処方受付（`/ocr`）→ 薬歴（`/emr`）→ 印刷・調剤録（`/print/[visitId]`）→ 在庫（`/inventory`）の一連フローを 1280px / 768px / 375px の 3 ビューポートおよびキーボード操作で Puppeteer 実機検証。全画面・全幅で横オーバーフロー 0px、公式UKEモーダルの起動および Escape 閉鎖（`SingleOfficialUkeModal.tsx` にリスナー実装）、不適合時のダウンロード安全保護、正真正銘計 14 枚のスクリーンショット保全を実機検証済み。詳細は [総合報告書改訂版](comprehensive_implementation_report_20261002.md)。
- **方針**: 新規画面やフロー追加時にも同様の通しスクリプトで横オーバーフロー 0px とキーボード操作性を自動検査する。

### I-4 パイロット複数店舗の 4 週間 KPI とリリース運用受入
- **前提**: `pilot:kpi-review` / `pilot:operational-readiness` / `release:ops-acceptance` に加え、全 9 証跡スロットを一括初期化・点検する `ops:field-evidence-bundle` が実装済み。まっさらな作業ツリーでは現地証跡が無いため `blocked`（設計どおり）。
- **方針**: `npm run ops:field-evidence-bundle -- --init /var/lib/yakureki-evidence/<store>/` でリポジトリ外に雛形を配置し、現地証跡（実紙検証、資格確認、電子処方箋、NSIPS、AI 実症例、移行、予備機・スケジューラ、4 週間 KPI）を順に投入して `pass` に至る過程を第Ⅱ部 §4 の status に反映する。**ここが完成形の条件 5・6 に直結する。**

### I-5 リポジトリ運用（2026-11-22 同期済み）
- **進捗**: 2026-11-22 に Phase A・B の 12 コミット（`ddda47a..22d6a7f`）を `git push origin main` で正常同期確認済み。引き続き 1 PR = 1 コミットの慣習と明示的 push 承認ルールを維持する。

### I-6 デザインと日常操作の改善（ダッシュボード第1段・薬歴画面第2段・処方受付画面第3段・印刷調剤録第4段・在庫発注第5段・設定画面第6段完了）
- **前提**: `globals.css` に色・文字サイズ・余白・角丸のトークンがあり、ダッシュボードはカードと一覧で構成されている。改善前の「進行中のタスク」は AI 補助予測・請求リスク・月次請求・在庫の各セクションより後にあった。
- **進捗**: 
  - 2026-09-29 にダッシュボード第1段を実施。患者一覧を集計直下へ移動し、薬剤師確認対象を先に表示する構成、モバイルの集計2列、デモ案内の折返し、状態別表示と再読み込み導線を実装した。1280 / 768 / 375pxで横はみ出しがないこと、新規受付・薬歴一覧・患者カード・日次締めのキーボード操作、追加描画テスト4件を確認した。詳細は [実施記録](dashboard_design_20260928.md)。
  - 2026-09-30 に薬歴画面（`/emr`）の日常操作・レスポンシブ改善（第2段）を実施。375px（モバイル・小型端末）において固定アクションバーの「薬歴完了 (在庫引落)」ボタンが画面外左側（`left: -72.9px`）へ押し出されて文字欠落・押下不能となっていた重大バグを、640px レスポンシブグリッド（`grid-template-columns: 1.15fr 0.85fr;`）とサブラベル省力化により解消（`left: 29px`、完全画面内収容）。SOAPエディタのプロブレム追加ボタンの不自然な日本語文字ぶつ切り改行を 480px 縦積み折り返しで解消。処方遍歴をカード型（今回/過去バッジ、用量変更チップ）へ美装化し純粋コンポーネント `TimelineItem` として export。1280 / 768 / 375px で横オーバーフロー 0px を実証し、契約テスト 4 件（fail-first mutation 実施済み）をパス。詳細は [実施記録](emr_design_20260930.md)。
  - 2026-09-30 に処方受付・入力画面（`/ocr`）の日常操作・レスポンシブ改善（第3段）を実施。375px（モバイル・小型端末）において固定アクションバーの「キャンセル」ボタンが画面外左側へ押し出され消滅・文字欠落していた重大バグを、640px レスポンシブグリッド（`grid-template-columns: 0.9fr 1.6fr;`）とサブラベル省力化により解消（キャンセルボタン幅 99.7px、主操作ボタン幅 177.3px で完全画面内収容）。処方グループエディタ（`PrescriptionGroupEditor`）内の用法選択ボタン（`btn-select-usage`）が親カードの右境界線を突き破って文字がはみ出していた問題を、480px / 640px の flex-wrap / 縦積みルールにより完全解消（`overflowsCard: false`）。手入力モード時にモバイルで不要な空ヘッダー・枠（`.visual-column`）を非表示化し、フォーム最上部配置を実現。1280 / 768 / 375px で横オーバーフロー 0px を実証し、契約テスト 4 件（fail-first mutation 実施済み）をパス。詳細は [実施記録](ocr_design_20260930.md)。
  - 2026-09-30 に印刷・調剤録・薬袋画面（`/print`）の日常操作・レスポンシブ改善（第4段）を実施。375px（モバイル・小型端末）においてヘッダー操作ボタン群（一括印刷・再読込・完了等）の重なり崩れを 2 列均等グリッド化で解消。印刷用紙シミュレーション（薬袋・お薬手帳・水剤軟膏ラベル）が極端に細い短冊状に潰れて文字・レイアウトが読めなくなっていた問題を、実寸保持（`width: 794px` / `width: 378px`）＋親コンテナ横スクロール化で解消し、調剤録タブにも同様の紙プレビューを適用。フローグリッドを 1 列縦並び化。1280 / 768 / 375px で横オーバーフロー 0px を実証し、契約テスト 4 件（fail-first mutation 実施済み）をパス。詳細は [実施記録](print_design_20260930.md)。
  - 2026-09-30 に在庫管理・発注画面（`/inventory`）の日常操作・レスポンシブ改善（第5段）を実施。375px（モバイル・小型端末）において在庫一覧テーブルの列順が YJ コードから始まっていたため最重要情報である「医薬品名」が初期画面から完全に隠弊していた問題を、医薬品名ファースト列配置（医薬品名 > 現在庫 > 利用可能 > 引渡予定 > 棚番地 > YJコード）への刷新および最左列 `min-width: 260px` 適用により解消（横スクロール不要で薬品名と現在庫を 100% 視認可能）。発注ワークベンチのアクションボタン群（4 個）が 3 個 + 1 個に段落ちして右半分が空白になっていた不揃い崩れを、640px 以下の 2 × 2 均等対称グリッド化により解消。タブバーに `-webkit-overflow-scrolling: touch;` を付与しタッチ最適化。1280 / 768 / 375px で横オーバーフロー 0px を実証し、契約テスト 4 件（fail-first mutation 実施済み）をパス。詳細は [実施記録](inventory_design_20260930.md)。
  - 2026-10-01 に設定画面（`/settings`）の日常操作・レスポンシブ改善（第6段）を実施。375px（モバイル）において 9 つのタブが 6 行に折り返されて画面の半分を占有していた問題を、横スクロールピルタブバー（`overflow-x: auto`、`-webkit-overflow-scrolling: touch`、`scroll-snap-type: x mandatory`）により解消。スタッフ管理タブにおいて見出しが幅 100px 未満に押しつぶされて縦 1 文字折り返しになっていた重大バグおよびテーブルセル圧縮崩壊を、`flex-direction: column` / 全幅ボタン化およびテーブルラッパーの `overflow-x: auto`（`min-width: 580px`）により完全解決。共通フォーム（`.form-grid`）をモバイルで 1fr 単一列化し、長文算定コードラベルの折り返し不揃いを解消。初回セットアップパネルの指標カード 2 × 2 対称グリッド化。1280 / 768 / 375px で横オーバーフロー 0px を実証し、契約テスト 5 件（fail-first mutation 実施済み）をパス。詳細は [実施記録](settings_design_20261001.md)。
- **方針**: 最初にダッシュボードを改善し、その表示ルールを受付→薬歴→印刷・調剤録→在庫→設定へ段階的に展開する。配色は既存の青緑系と白を基調とし、Vanilla CSS と既存トークンを使う。
  1. **情報の優先順位**: 「対応が必要な警告」「進行中の患者」「次に行う操作」を見つけやすい配置にする。集計・補助情報との見出し階層を整理し、患者名・工程・待ち時間・主操作がまとまって読めるようにする。
  2. **文字・余白・操作部品**: 見出し、本文、補足、入力欄の文字サイズと行間を揃える。主要・副次・取消操作の見た目を統一し、フォーカスと押せる領域を明確にする。ボタンには実際の動作を接続し、空・読込中・エラー時にも次の操作を示す。
  3. **フォーム・一覧・モーダル**: 関連する入力項目をまとめ、エラーを該当項目に近づける。狭い画面ではカードや列配置を調整し、患者名・状態・操作が重ならないようにする。
  4. **共通化**: 先行画面で確認したスタイルを共通部品へ反映する。既存の静的インラインスタイルも、対象画面を改善する際にクラスへ移す。
- **受入基準**: 同じ架空データを用い、幅 1280px / 768px / 375px の変更前後キャプチャを残す。長い患者名、複数警告、空一覧、読込中、エラーを確認し、主要操作・警告の欠落や画面全体の横はみ出しがない。色に加えて文言・アイコンで状態を識別でき、キーボードだけで主要操作とモーダルの開閉ができる。変更画面の動作を検証し、印刷帳票に影響する変更では既存の印刷回帰も実行する。
- **I-3 との分担**: I-6 は画面ごとのデザイン実装、I-3 は受付から請求までの操作性・アクセシビリティの通し確認を扱う。確認画面や警告を省略する変更はデザイン改善に含めない。

## 実施順序の目安

次に行う作業を以下の順に絞る。必要な判断や現地証跡の収集は、着手可能な作業と並行して進められる。

| 順 | 次の作業 | この段階の成果物・境界 |
|---|---|---|
| 1 | **C-1 の旧形式完全削除（ステップ 5b）** | 条件A・B・C（実機受付確認1ヶ月以上・直近3ヶ月出力0件・現場合意）の充足を確認し、`<details>` 内旧形式ボタンと旧形式生成コードを完全削除 |
| 2 | **現地証跡の収集・投入（D-1 / E-1 / E-2 / F-4 / H-3 / I-4）** | 実機資格確認・電子処方箋・NSIPS・予備機切替リハーサル・4 週間パイロット KPI の現物証跡を運用レビュー CLI へ投入 |

| 状態 | 対象 | 再開条件 |
|---|---|---|
| 実装完了 | A-1〜A-5 / B-1・B-2 / C-4・C-5（Q-5） / D-2 / F-1〜F-3 / G-1・G-2 / H-1 / I-1・I-2・I-3・I-5・I-6 | 回帰を維持。通常の実装待ちには戻さない |
| 一部完了・残りは条件待ち | C-1（ステップ1〜4・ステップ5a 完了、旧形式完全削除は条件A/B/C待ち） | UKE旧形式廃止条件（A:実績1ヶ月、B:出力0件、C:合意）の達成確認をもって `<details>` 内旧形式と旧生成コードを完全削除 |
| 挙動・対象の判断待ち | C-2 / H-2 | 各項目の「要判断」（薬価改定「変更年月日」の解釈、RxDB コレクション統合枠または恒久策）を解消 |
| 公式資料・症例待ち | C-3 | 出典と具体的な未対応ケースを入手し、点数影響を確認する |
| 現地証跡・実データ待ち | D-1（Q-5 マイナ読取実機仕様突合含む） / E-1 / E-2 / F-4 / H-3 / H-4 / I-4 | `ops:field-evidence-bundle -- --init <外部保管先>` で雛形を配置し、対象機器・店舗・実施担当の実測証跡を投入する。E-2 は対象機器の順序も判断する |

全トラックの完了を、ローカルの自動テスト通過だけでは判定しない。現地証跡が必要な項目は引き続き未完とする。

---

# 第Ⅳ部 実装方針

## 1. 進め方の単位

- **計画書 → PR 分割 → 1 PR = 1 コミット → 報告**の順で進める。計画書には必ず「ベースライン実測値」「要判断事項」「報告フォーマット」の 3 節を置く（`docs/code_review_20260906_implementation_plan.md` が雛形）。
- コミットメッセージは `feat(scope):` / `fix(scope):` / `refactor(scope):` / `docs:` / `test(scope):`。`refactor:` に挙動変更を含めない。
- 報告には次を書く。推測を断定形で書かない。

```
## PR-Xn: <タイトル>
- コミット: <hash>
- 変更ファイル: <一覧>
- npx tsc --noEmit: エラー N 件（出力を貼る）
- npm test: pass N / fail N（末尾の集計行を貼る）
- mutation 実測:
  | # | 変異 | 実測 fail 数 | 戻した後 |
- 仕様確認の出典: <PDF 名・版・該当箇所。確認できなかった項目は「未確認」と明記>
- 未実施・できなかったこと: <正直に書く。無ければ「なし」>
```

## 2. スキーマ変更の規律

1. プロパティを 1 つ足すだけでも `version` を上げる。**上げ忘れてもテストは緑のまま、壊れるのは既存ユーザーの DB だけ**である。
2. 移行は任意項目の追加のみ（`keepDocument`）。既存値の書き換えを伴う移行は「データ移行」として別途合意する。
3. version bump は計画書に明記し、事前承認を得る。計画に無い bump が必要になったら設計を疑い、手を止めて報告する。
4. コレクションを足すときは、同期対象表（`docs/satellite_terminal_sync_plan.md`）・`BACKUP_COLLECTIONS`（`src/lib/backup.ts`）・`collection_limit.test.ts` の 3 点を同時に更新する。上限 14 を超えるなら H-2 の手順に従う。
5. 患者データはサテライトで永続化できないため、RxDB 外（SQLite WASM）へ退避してよいのは端末に残ってよい参照系マスタだけ。

## 3. テスト戦略

| 対象 | 方法 |
|---|---|
| ロジック | 純粋関数として切り出し、テストから本物を import する。テスト内で再実装しない |
| 保存・監査ログ・ロールバックの契約 | モック DB による契約テスト（`claim_actions.test.ts` の流儀） |
| 帳票 | `renderToStaticMarkup` の実レンダリング（`PrintUnitDisplay.test.ts`）＋ 11 帳票の Puppeteer 実描画回帰（`test:e2e:print-layout`、dev サーバ必須、他タブを閉じる） |
| 変異耐性 | 計画書で指定した変異を実際に注入し、fail → 戻して pass を実測。「通ったこと」ではなく「壊すと落ちること」を確認する |
| 運用 CLI | `ops_review_cli.test.ts` が実行契約（出力ファイル・exit code・必須 env）を検証。ソースを grep しない |
| 実画面 | 単体で見えないバグ（保存されない、常に null、常に空）は実画面で操作して見つける。キャプチャは縦長ビューポート＋ `clip` で撮り、目的の要素が含まれるか検査する |
| ソース文字列テスト | 新規に書かない。既存 4 ファイルは実描画で代替できたものから減らす。assert 数の削減を目標にしない |

`npm test` は `TZ=Asia/Tokyo`・`--test-concurrency=1` 固定。CI（`onboarding-e2e.yml`）も同じコマンドを呼ぶ。レプリケーション系は `--test-timeout=30000` を付ける。

## 4. 公式資料との突合手順

1. 出典を `official_audit.ts` の `OFFICIAL_AUDIT_SOURCES` に登録する（URL・版）。
2. 取得は既存の取得関数（`fetchDispensingUkeOfficialSpecPdf`、`drug_master_official_file.ts`、`xlsx_zip_reader.ts`）を使い、ブラウザからは自機 `/api/*` 経由で許可オリジンに限定する。
3. コード表・列レイアウトは本文と突合する関数を用意し、テストで再突合できるようにする。
4. 意味が確認できない列（例: 医薬品マスタ項番 30「変更年月日」）は「未確認」と書き、運用者に確認するまで解釈に依存する機能を有効化しない。
5. 報告の「仕様確認の出典」に PDF 名・版・該当箇所を書く。

## 5. UI 規約

- Vanilla CSS と CSS 変数のみ。Tailwind 等の未導入手法を使わない。
- 文字サイズは `--fs-*`、余白は `--space-*` から選ぶ。生の rem 値を書かない（印刷ページの `print.css` は対象外）。
- インライン `style={{}}` は動的 CSS 変数（例 `--bar-height`、`--print-*`）の受け渡しに限る。第Ⅱ部 §2 で名指しされていた `TerminalSyncPanel`（18箇所）と `ClientLayout`（6箇所）の計 24 箇所はクラスへの移設を完了し、全 `src/` 配下で動的 CSS 変数 3 箇所のみに整理済み。
- `styled-jsx` は同一ファイル内の別コンポーネントに当たらない（無言で無スタイルになる）。
- 幅 720px 以下のモバイル表示を実画面で確認する。トーストは top-center。
- 文言は日本語。エラー文は「何が起きたか」「次に何をするか」を書く。

## 6. 外部連携の規約

- 患者情報を含む通信は HTTPS 必須。平文 HTTP は同一端末の `localhost` / loopback のみ。施設内 LAN で証明書が無い場合に限り `PHARMACY_SYNC_TRANSPORT_ENCRYPTION=aes-gcm` のペイロード暗号化で代替。
- 認証は Bearer。URL にユーザー名・パスワードを埋め込まない。トークンはサテライトの `.env` のみに置き、ブラウザへ渡さず、ハブはハッシュのみ保存。
- 本番送信は、接続方式・全 capability・成果物 SHA-256・Bearer・患者情報なし preflight 成功記録がそろい、かつ現在設定と一致しない限り行わない。
- 画面には接続方式・必須機能・上限値・直近試行の成否だけを出し、URL・トークン・本文・生ハッシュは出さない。
- 送信内容が変わる変更は、変更前後のペイロードを実測して並べて報告する。

## 7. 本番可否の判定

- **コード上のテスト通過だけでは本番可としない。** 設定画面の外部連携診断、現地試験 CLI、パイロット正式運用判定の 3 段で証跡を積む。
- 運用レビュー CLI の `exit 1` は「未達」という業務状態であり、クラッシュではない。Nightly CI はサマリを残すだけでジョブを落とさない。
- 証跡（`YAKUREKI_*_EVIDENCE`）は人が実施した記録であり、テンプレートを埋めただけのものを `pass` にしない。

## 8. ドキュメントの規律

- **本書（金科玉条とロードマップ）**: 第Ⅰ部は原則、第Ⅲ部は「何を・なぜ・どう」。進捗の更新は実装と検証がそろってから。
- **計画書（`docs/*_implementation_plan.md`）**: 1 テーマ 1 冊。ベースライン実測・PR 分割・要判断・報告フォーマットを必ず含む。
- **引き継ぎ書（`docs/handoff_YYYYMMDD.md`）**: セッション単位の事実の記録。「前回の記述は誤りだった」と分かったら、消さずに訂正を追記する。
- **`official_audit.ts`**: 画面（設定 > レセプト点検）に出る到達状況の正本。`status` を上げるのは現地証跡が揃ったとき。
- **README / 各マニュアル**: 機能の追加・削除と同じコミットで更新する。
- 「対応完了」と書いてよいのは、コード・`npx tsc --noEmit` 0 件・本物のテスト通過・（画面があれば）実画面確認がそろったときだけ。

---

# 付録

## A. 用語

| 用語 | 意味 |
|---|---|
| UKE | レセプト電算処理システムへ提出する電子レセプトファイル（Shift-JIS） |
| 記録条件仕様 | 支払基金が公開する UKE の記録条件仕様（令和8年6月版・調剤用、`iryokikan_in_07.pdf`） |
| ハブ / サテライト | 店舗内のメイン端末（正本）と、患者データを永続化しない従属端末 |
| 剤形（`DosageCategory`） | `internal` 内服 / `as_needed` 頓服 / `external` 外用 / `internal_drop` 内滴 / `injection` 注射 |
| 数量セマンティクス | 内服は 1 日量、外用・頓服・内滴は総量として数量を解釈する規約 |
| fail-first mutation | 変異を注入してテストが落ちることを実測し、戻して通ることを実測する 4 手順 |
| 偽カバレッジ | テスト内でロジックを再実装して「通した」だけのテスト |
| 証跡（evidence） | 人が現地で実施した記録の JSON。運用レビュー CLI の入力 |
| WORM | Write Once Read Many。S3 Object Lock 等の追記専用保全 |

## B. 参照文書

| 文書 | 役割 |
|---|---|
| `.agents/AGENTS.md`、`.agents/skills/honest-verification/SKILL.md` | 開発者の行動規範（本書第Ⅰ部第七条・第十条の出典） |
| `docs/ai_architecture_policy.md` | AI 補助の設計方針（第一条の出典） |
| `docs/satellite_terminal_sync_plan.md` | 複数端末同期の設計（第二条・第六条・H-2 の出典） |
| `docs/electronic_prescription_rollout_plan.md` | 電子処方箋の導入フェーズと本番可否判定（E-1・第Ⅳ部 §7 の出典） |
| `docs/implementation_plan.md` | 2026-08 の段階的改善計画（Phase 1〜3、完了分の記録） |
| `docs/phase3_investigation_20260827.md` | 高額療養費・減免・返戻・薬価改定の仕様所在の調査 |
| `docs/code_review_20260906_implementation_plan.md` | 剤形判定一元化・年齢正本化（PR-E 系） |
| `docs/usage_master_20260906_implementation_plan.md` | 用法マスタ取込・用法選択式化（PR-G 系、トラック A の出典） |
| `docs/handoff_20260827.md` | 直近の引き継ぎ書（§8〜§11 に 9 月前半の作業） |
| `docs/ops_review_ledger.md` | 運用レビュー CLI 24 本の台帳と Tier |
| `operational_issues.md` | 実運用に向けた課題と解決状況の一覧 |
| `docs/field_operation_manual.md`、`docs/user_manual.md`、`docs/developer_manual.md` | 現場・利用者・開発者向けマニュアル |
| `src/lib/official_audit.ts` | 到達状況の正本（設定 > レセプト点検） |
