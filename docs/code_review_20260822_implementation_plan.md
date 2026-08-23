# 【レビュー結果】docs/implementation_plan.md に対する技術レビュー

- **レビュー対象**: `docs/implementation_plan.md`（起案: Antigravity 開発ペア、起案日 2026-08-22）
- **レビュー者**: Claude 統括技術リード
- **レビュー日**: 2026-08-22
- **検証環境**: HEAD = `0d587bb` / macOS (darwin 25.5.0) / Node 22 / TZ=Asia/Tokyo
- **検証時の作業ツリー**: 未コミット変更 29 ファイルあり（計画書に注記なし）
- **判定**: **差し戻し（Phase 1 の再構成が必要）**

> 本レビューは計画書に記載された実測値をすべてレビュー者自身が再実行して検証したものです（`.agents/AGENTS.md` §1、`honest-verification` §1 準拠）。

---

## 1. 検証サマリ

| 計画書の主張（§2.1） | レビュー者の実測 | 判定 |
|---|---|:---:|
| `npx tsc --noEmit` エラー 0 件 | exit 0、出力なし | ✅ 一致 |
| `npm run lint` エラー 0 / 警告 2 | 0 errors / 2 warnings | ✅ 一致 |
| `npm run build` 成功 | exit 0、全 27 ルート生成 | ✅ 一致 |
| `npm test` **1,331 中 1,328 pass / 3 fail** | **1,331 pass / 0 fail / exit 0** | ❌ **不一致** |
| 426 ファイル / 148,889 行 | 148,889 行は ts/tsx **416** ファイルの合計 | ⚠️ 分母ズレ |
| 主要 6 画面で 29,481 行 | 29,481 行 | ✅ 一致 |
| 65 ファイル (34.6%) がソース文字列テスト | 65 / 188 = 34.57% | ✅ 一致 |
| `assert.match` 系 2,200+ 箇所 | **2,843 箇所** | ⚠️ 過小 |
| rxdb 17.4.0 へ更新済み（§2.3-1） | `node_modules/rxdb` = 17.4.0 | ✅ 一致 |
| settings/page.tsx 10,020 → 5,680 行（§2.3-3） | `git show 888daf0^` = 10,020 / HEAD = 5,680 | ✅ 一致 |
| CLI スクリプト 33 件（§3.4-3） | `scripts/` 37 ファイル、npm scripts 44 件 | ⚠️ 不一致 |

**Phase 1 の 4 タスクのうち 3 つが「既に実装済み」または「存在しない問題」** でした。詳細は §2 を参照。

---

## 2. 事実誤認 — Fact Base の訂正が必要

### A-1【最重要】失敗テスト 3 件は存在しない

計画書 §2.1 / §3.2-3 / P1-1 / gantt の 4 箇所に記載されている「3 件の失敗テスト」は、名指しの 3 ファイルを個別実行しても再現しません。

```bash
TZ=Asia/Tokyo npx tsx --test --test-concurrency=1 \
  src/lib/audit_integrity_s3_worm_job.test.ts \
  src/lib/backup_external_transfer_job.test.ts \
  src/lib/scheduled_ops_drill.test.ts
```

結果: **tests 23 / pass 23 / fail 0**。「サンドボックス内のローカル Webhook 通信制約で落ちる」とされたテスト自体が通っています。

```
✔ scheduled backup external transfer job posts failure notices to webhook monitoring (147.4ms)
✔ scheduled ops drill posts a no-patient-data webhook and writes a receipt (102.6ms)
```

フルスイート `npm test` も **tests 1331 / pass 1331 / fail 0 / exit 0**（duration 108.6s）。

**対応**: P1-1（1 人日）を削除し、Phase 1 を組み直すこと。`honest-verification` §1 の要点は「自身の目で確認してから報告する」であり、Fact Base セクションで唯一実測が外れたのがこの項目である点を重く見ること。

---

### A-2 §3.4-2「CI が単一ジョブで直列実行」は事実と異なる

`.github/workflows/onboarding-e2e.yml` は既に以下の状態です。

- `static`（lint → tsc → unit test）と `onboarding-e2e` の **2 ジョブに分割済み**、`needs: static` で連結
- `cache: npm`（L29）、`.next/cache` キャッシュ（L61-67）、Puppeteer キャッシュ（L69-75）の **3 種すべて設定済み**

P1-2 で未実施なのは E2E の matrix 並列化のみであり、「25 分 → 3 分」の短縮根拠も現状ログからは示せません。

**代わりに入れるべき実タスク**: CI の unit test は L43 で

```yaml
run: npx tsx --test $(find src -name "*.test.ts")
```

となっており、`package.json` の `npm test` にある **`--test-concurrency=1` が付いていません**。ローカルは直列、CI は並列という実行条件の乖離があり、`node:sqlite` や一時ファイルを扱うテストの flake 要因になります。CI を `npm test` の呼び出しに統一すること。

---

### A-3 P1-3「`src/lib/env.ts` を新設し」— 既に存在する

`src/lib/env.ts` はコミット `fd38334` で作成済みです。`AppEnvConfig`（docstring に「66 件のコア実行時設定を集約します」と明記）および `src/lib/env.test.ts` も存在します。

しかし実態は以下の通りです。

- **実際の消費者は `src/lib/sync/sync_config.ts` の 1 ファイルのみ**
- `src/` 内の直接 `process.env.` 参照は **95 箇所**（`env.ts` 自身とテストを除く）残存

**対応**: タスクを「新設」から「**既存 `env.ts` へ 95 箇所を移送し、docstring の主張を実態に一致させる**」へ変更。Zod 導入は不要（既存の独自バリデータで足りている）。工数 1.5 人日は移送作業には不足。

---

### A-4 §2.1「Turbopack 最適化ビルド」/「所要 44.6s」

`next.config.mjs` には `webpack:` と `turbopack: {}` が**両方**定義されています。Next.js 16.2.3 のビルドは Turbopack が既定のため、`webpack:` の

```js
config.resolve.fallback = { fs: false, path: false };
```

は効いていない可能性が高い。どちらの設定が実際に適用されているかを確認し、**死んでいる方を削除する**のが本来のタスクですが、計画に含まれていません。

「所要 44.6s」はキャッシュ有無の記載がなく再現条件が不明のため検証不能です。

---

### A-5 軽微な数値ズレ・整合性

| 箇所 | 記載 | 実測 |
|---|---|---|
| §2.1 | 426 ファイル / 148,889 行 | 148,889 行は ts/tsx **416** ファイルの合計。426 は `.json`/`.svg`/`.sh` 等を含む `src/` 全ファイル数 |
| §2.1 | `assert.match` 系 2,200+ | **2,843** |
| §3.4-3 / P3-3 | CLI スクリプト 33 件 | `scripts/` 37 ファイル、npm scripts 44 件 |
| §4 gantt | Phase 1 に 3 項目 | 表 4.1 の **P1-3（環境変数）が gantt に存在しない**。表と図が不一致 |
| §4 gantt vs 表 | P2-1..P2-4 の期間 20/25/15/10 日 | 表の工数は 8/10/5/4 人日。暦日と人日の別を明記すること |

---

## 3. 検証して正しかった項目

差し戻しの対象外であり、そのまま使える記述です。

- §2.1 の型検査・Lint・ビルドの各結果（Lint 警告 2 件は `src/app/emr/page.tsx:1769` と `:3179` の `@next/next/no-img-element`）
- §2.1 の主要 6 画面 29,481 行、および 65 / 188 = 34.6%
- §2.3-1 の rxdb 17.4.0、§2.3-3 の 10,020 → 5,680 行
- **§3.2-2 の DB 暗号鍵リスク**: `src/db/index.ts:62-98` の実装（`NEXT_PUBLIC_DB_PASSWORD` 未設定時にランダム鍵を生成し `localStorage` の `pharmacy_os_local_db_password` に保持、プロファイル喪失で復号不能）と正確に一致。コードを読んで書けている良い指摘

---

## 4. 設計上の最重要指摘 — 論点 1 の前提が実装と食い違っている

論点 1 は「未同期データのみを **IndexedDB** 内の暗号化キューに一時保持し、ACK 時に即座に削除する方式**を採用**（したい）」として評価を求めていますが、**これは既に実装・コミット済み**です（§2.3-4 に自ら「適用済み」と記載しているものと同一）。**しかも保存先は IndexedDB ではありません。**

### 実装の実態: `src/lib/sync/satellite_local_queue.ts`

| 論点 1 の記述 | 実装 |
|---|---|
| IndexedDB 内の暗号化キュー | **localStorage**（`yakureki_satellite_unsent_queue_v1`） |
| （鍵の所在に言及なし） | **同じ localStorage に平文で同居**（`yakureki_satellite_persistent_queue_enc_key`、L27 / L50-53） |
| （暗号方式に言及なし） | `CryptoJS.AES.encrypt(json, passphrase)` = AES-256-**CBC** + EVP_BytesToKey(MD5, 1 反復) + **MAC なし**。ハブ転送の AES-256-**GCM** と非対称 |
| ACK 時に削除 | `clearAckedRecord()` で実装済み（一致） |

配線も完了しています（`src/lib/sync/replication_client.ts:60` から `enqueueUnsentRecord`、`src/components/SyncStatusIndicator.tsx` から `flushUnsentLocalQueue`）。キューに載るのは同期対象コレクション全部、すなわち `patients` / `visits` / `soap_records` / `prescription_items` / `alerts` / `interventions` — **要配慮個人情報そのもの**です。

### 帰結

1. **§2.2 アーキテクチャ図の「RxDB (Satellite: Memory Storage) ※患者データ非永続化」は実装と矛盾している。**
   未送信の患者データは端末の localStorage に永続化されます。図か実装のいずれかを修正する必要があります（`.agents/AGENTS.md` §3「ドキュメントと実際のコードの完全整合」）。
2. **鍵が暗号文と同一ストレージに同居しているため、端末プロファイルを読める相手および XSS に対して暗号化は実質的に機能しない。**
   ブラウザクラッシュ後の生存性を確保するための意図的なトレードオフであることはソース中のコメントから読み取れますが、「サテライトに患者データを残さない」という原則は**既に破られている**という認識で議論を始める必要があります。

### 論点 1 の再提起の仕方

「採用してよいか」ではなく、以下の形で提起し直してください。

> 現状すでに localStorage へ暗号化永続化し、鍵を同じ localStorage に置く形で出荷済みである。このモデルを許容するか、それとも
> (a) 鍵をハブ由来または人の入力に切り替える
> (b) キューの保持期間・件数に上限を設ける
> (c) §2.2 の図の記述を実態に合わせる
> のいずれを採るか。

現在の書き方では、**実装と異なる設計に対して承認が出てしまいます**。なお本件は医療データ保護の設計変更にあたるため、`.agents/AGENTS.md` §7 に従い、リード回答前の独断変更は行わないこと。

---

## 5. 論点 2 への回答 — 「カスタム Hook ＋ 最小限の Context」に賛成

推奨案に賛成しますが、根拠は好みではなく直近の設定画面分割（`888daf0`）の実測です。

| 指標 | 実測 |
|---|---|
| 8 タブコンポーネントの `useState` | **全ファイル 0 件** |
| `src/app/settings/page.tsx` の `useState` | **124 件**（分割後も） |
| 各タブへの props 数 | BackupSettingsTab **89** / AuditSettingsTab **60** / DrugMasterSettingsTab **53** / StaffSettingsTab **41** / MedicationInfoTemplateSettingsTab 33 / OfficialAuditSettingsTab 18 / FacilitySettingsTab 15 / ExternalConnectorSettingsTab 3 — **計 312** |

行数は 10,020 → 5,680 と半減しましたが、**状態グラフは 1 ミリも移動していません**。JSX だけが外に出て、312 props の境界が増えた形です。

したがって **P1-4「残り 5,680 行を 2 人日で 300 行以下」は、この手順の延長では達成不可能**です。124 の `useState` と対応するハンドラ群が本体だからです。

**指示**:

1. 順序を逆にする。**先に state を hook へ切り出し**（`useBackupSettings()`、`useAuditSettings()` 等）、JSX の移動はその後。
2. P2-1（print / ocr / emr）にも同じ順序を適用する。
3. Context は「hook を跨いだ共有が実測で必要と判明したもの」に限定する。
4. 選択肢 3（各サブコンポーネントが独立に RxDB Observable を購読）は採用しない。同一画面内でクエリが分散し、表示間の整合が取れなくなるため。

---

## 6. 論点 3 への回答 — カバレッジ指標の低下は懸念不要

対象の 65 ファイルは元々カバレッジではありません。実例:

- `src/db/index.test.ts:16` — `assert.match(source, /async function createSatelliteDatabase[\s\S]*?getRxStorageMemory\(\)/)`
- `src/app/SettingsTerminalSync.test.ts` — `assert.match(panelSource, /端末同期（メイン端末集約）/)`

いずれもソース文字列の存在確認であり、レンダリング結果も状態遷移も検証していません。リネームや整形で壊れる一方、挙動の後退は一切検出しません。

**移行時の 3 分類**:

| 分類 | 対応 |
|---|---|
| ① 純粋関数に落とせるもの（計算・抽出・判定） | 関数として抽出・export し、テストから直接 import して検証 |
| ② UI 文言の存在確認 | 文言を定数モジュールへ切り出し、定数同士を突き合わせる |
| ③ ①②のどちらでもないもの | **削除する** |

「移行率 100%」を KPI にすると ③ が形を変えて温存されます。**テスト件数が減ることが正しい場合がある**旨を §6 の DoD に明記すること。

---

## 7. 差し戻し条件（再提出時のチェックリスト）

- [ ] 1. §2.1 のテスト行を `1,331 件中 1,331 pass / 0 fail` に訂正。§3.2-3・P1-1・gantt から失敗 3 件の記述を削除
- [ ] 2. §3.4-2 を「2 ジョブ分割・3 種キャッシュ設定済み」に訂正。P1-2 を「CI を `npm test` に統一（`--test-concurrency=1` 欠落の解消）」＋「E2E matrix 化」へ差し替え
- [ ] 3. P1-3 を「env.ts 新設」→「既存 `env.ts` へ 95 箇所を移送」に変更し、工数を再見積
- [ ] 4. P1-4 / P2-1 を「state → hook 抽出を先行、JSX 移動は後」に書き換え。「300 行以下」は根拠を示すか目標値を見直す
- [ ] 5. 論点 1 を §4 の形で提起し直し、§2.2 の図の「患者データ非永続化」を実装に合わせる
- [ ] 6. gantt と表 4.1 を一致させる（P1-3 の欠落）。暦日と人日の別を明記
- [ ] 7. §2.1 の数値の分母を揃える（426 / 416）。`assert.match` 2,843、CLI スクリプト件数を訂正
- [ ] 8. 各実測値にコマンド・実行日時を併記。作業ツリーに未コミット変更 29 ファイルがある旨を注記

---

## 8. 総評

分析の枠組み（4 視点による整理、Phase 分け、受け入れ基準の明文化）はよく出来ています。§3.2-2 の暗号鍵管理リスクのように、コードを実際に読んで正確に記述できている箇所もあります。

問題は Phase 1 に集中しており、**そのすべてが「実際にコマンドを走らせる」だけで防げた**ものです。Phase 2 / 3 の内容は概ね妥当であるため、Phase 1 を組み直せば承認します。

---

## 付録: レビュー時に実行した検証コマンド

```bash
# 型検査
npx tsc --noEmit                                    # exit 0, 出力なし

# Lint
npm run lint                                        # 0 errors, 2 warnings

# 本番ビルド
npm run build                                       # exit 0, 27 ルート生成

# フルテストスイート
npm test                                            # tests 1331 / pass 1331 / fail 0 / exit 0

# 「失敗している」とされた 3 ファイルの個別実行
TZ=Asia/Tokyo npx tsx --test --test-concurrency=1 \
  src/lib/audit_integrity_s3_worm_job.test.ts \
  src/lib/backup_external_transfer_job.test.ts \
  src/lib/scheduled_ops_drill.test.ts               # tests 23 / pass 23 / fail 0

# コード規模
find src -type f | wc -l                                                  # 426
find src -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l              # 416
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec cat {} + | wc -l  # 148889
find src -name "*.test.ts" | wc -l                                        # 188
grep -rl "readFileSync" --include="*.test.ts" src | wc -l                 # 65
grep -rho "assert\.match\|assert\.doesNotMatch" --include="*.test.ts" src | wc -l  # 2843

# 環境変数の集約状況
grep -rn "process\.env\." --include="*.ts" --include="*.tsx" src \
  | grep -v "^src/lib/env.ts" | grep -v "\.test\.ts" | wc -l              # 95

# 設定画面分割の実態
git show 888daf0^:src/app/settings/page.tsx | wc -l                       # 10020
wc -l src/app/settings/page.tsx                                           # 5680
grep -c "useState" src/app/settings/page.tsx                              # 124
grep -c "useState" src/components/settings/*.tsx                          # 全て 0
```
