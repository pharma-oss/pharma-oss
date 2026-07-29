# pharma-oss 運用・開発効率 改善報告書

**作成日:** 2026-07-29
**対象コミット:** `bec24c3` (main)
**目的:** 実店舗運用にあたって障害となる点と、開発・保守を効率化できる点を実測に基づいて洗い出す

> 本書は既存の [operational_issues.md](../operational_issues.md)（機能・法令準拠の未達項目）とは目的が異なります。
> あちらが「何が未実装か」を追うのに対し、本書は **「実装済みの機能を実際に店舗で回すときに何が詰まるか」** と
> **「開発チームの手数をどこで減らせるか」** を扱います。重複する項目は相互参照にとどめます。

---

## 0. 検証環境と実測値

本書の指摘はすべて、以下を実行した実測結果に基づいています（推測ではありません）。

| 項目 | コマンド | 結果 |
|---|---|---|
| 型チェック | `npx tsc --noEmit` | **エラー 0 件**（終了コード 0） |
| Lint | `npm run lint` | **エラー 0 件 / 警告 2 件**（`next/image` 推奨のみ） |
| ユニットテスト | `TZ=Asia/Tokyo npx tsx --test $(find src -name "*.test.ts")` | **1,315 pass / 0 fail**、所要 **91.0 秒** |
| 本番ビルド | `npm run build` | **成功**、所要 **46.3 秒** |
| 依存脆弱性 | `npm audit` | **15 件**（high 13 / moderate 1 / low 1）、本番依存のみで **6 件**（high 5） |

**コード規模:** TS/TSX **397 ファイル・146,260 行**、テストファイル 185 件。

> 現状のコード品質ゲート（型・Lint・テスト・ビルド）は **すべて green** です。
> 以下の指摘は「壊れている」ではなく「このまま店舗数を増やすと運用が破綻する / 開発速度が落ちる」という性質のものです。

---

## 1. 総括 — 優先度サマリ

| # | 課題 | 分類 | 影響 | 難度 | 優先度 |
|---|---|---|---|---|---|
| A-1 | サテライト端末の未同期データがタブ終了で消失する | 運用リスク | **患者データ喪失** | 中 | **最優先** |
| A-2 | バックアップ／監査保全の自動化が開発者向けCLIでしか成立しない | 運用リスク | 保全が形骸化 | 中 | **最優先** |
| A-3 | メイン端末が単一障害点（SPOF）で、停止中はサテライトがログインすらできない | 運用リスク | 全店舗業務停止 | 中 | 高 |
| A-4 | DB暗号鍵が localStorage 平文保存で、プロファイル喪失＝復号不能 | 運用リスク | **データ復旧不能** | 小 | 高 |
| A-5 | 店舗設定（権限ロール・印刷プリセット等）がバックアップ対象外 | 運用リスク | 復旧後の再設定 | 小 | 中 |
| A-6 | 日次・月次の手作業チェックが多く、属人化している | 運用効率 | 実施漏れ | 小 | 中 |
| B-1 | ページコンポーネントの巨大化（`settings/page.tsx` 10,020 行） | 開発効率 | 変更速度低下 | 大 | 高 |
| B-2 | テストの 35% が「ソース文字列の正規表現照合」で、挙動を検証していない | 開発効率 | **偽の安心** | 大 | 高 |
| B-3 | `npm test` が存在せず、検証手順がシェル依存 | 開発効率 | 参入障壁 | **極小** | 高（費用対効果） |
| B-4 | CI が単一ジョブ・完全直列 | 開発効率 | フィードバック遅延 | 小 | 中 |
| B-5 | npm script 40 件中 33 件が CI 未接続の手動ゲート | 開発効率 | 実施漏れ | 中 | 中 |
| B-6 | 環境変数 164 個中 155 個が `.env.example` 未記載 | 開発効率 | 設定事故 | 小 | 中 |
| B-7 | リリース管理が不在（タグ 0 件・CHANGELOG なし・版数固定） | 運用/開発 | 障害切り分け不能 | 小 | 高 |
| B-8 | private → public の rsync 手動同期に情報流出リスク | 開発効率 | 内部資料の公開 | 小 | 中 |
| C-1 | 本番依存に high 5 件の脆弱性（`rxdb` → `ws`） | 保守 | セキュリティ | **極小** | 高 |
| C-2 | ESLint 8.57（EOL）／`eslint-config-next` が 2 メジャー遅れ | 保守 | ルール不適用 | 小 | 中 |

---

## 2. 運用上のリスク（現場運用）

### A-1. 【最優先】サテライト端末の未同期データがタブ終了で消失する

**現状**

サテライト端末は設計上ディスクに患者データを持ちません（`src/db/index.ts:231` — `getRxStorageMemory()`）。
メイン端末が落ちている間の入力はブラウザのメモリ上にのみ存在し、これを守っているのは
`beforeunload` イベント **1 つだけ** です。

```
src/components/SyncStatusIndicator.tsx:93-102
// サテライトはタブを閉じるとメモリ上の未同期データが消える。
const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (indicatorRef.current === 'synced') return;
  event.preventDefault();
  event.returnValue = '';
};
```

現場マニュアルでも「**絶対にやってはいけないこと**」として人の規律に委ねられています
（`docs/field_operation_manual.md:129`）。

**なぜ問題か**

`beforeunload` は以下では **発火しません**。いずれも薬局の業務PCでは日常的に起こります。

- Windows Update の強制再起動 / 電源断・停電
- ブラウザプロセスのクラッシュ、メモリ不足による OS のプロセス kill
- ノートPCのバッテリー切れ、うっかりのシャットダウン

つまり「メイン端末が落ちている最中に入力した薬歴・受付」が、
**人為ミスなしでも消える経路が残っています**。ローカルファーストを謳う製品としては最も痛い欠陥です。

**改善案**

「サテライトに患者データを永続化しない」という原則は維持したまま解決できます。

1. **未同期分だけの暗号化ローカルキュー**を IndexedDB に持たせ、
   同期成功のACKを受けた時点で **即座に削除**する（＝ディスク上の滞留は「未送信の間だけ」）。
   これなら「サテライトに患者データが残らない」という監査上の主張は成立し続けます。
2. 併せて `visibilitychange` (`hidden`) での **前倒しフラッシュ**を実装する。
   `beforeunload` と違い、タブ非表示・スリープ移行の時点で確実に走ります。
3. 復帰時に「前回の未送信 N 件を復元しました」を明示し、監査ログに残す。

**受け入れ条件（テスト）:** 2プロセスE2E (`npm run test:e2e:sync`) に
「ハブ停止 → サテライトで入力 → サテライトのプロセスを SIGKILL → 再起動 → ハブ復帰 → データが届く」
シナリオを追加する。

---

### A-2. 【最優先】バックアップ／監査保全の自動化が開発者向けCLIでしか成立しない

**現状**

ローカルファースト製品において最も安全上重要な操作が「バックアップの外部保存」です。
ところが `docs/user_manual.md` は、**薬局の管理者向けの手順**として次のようなコマンドを提示しています。

```
docs/user_manual.md:92
npm run backup:browser-export -- --user-data-dir <ログイン済みブラウザプロファイル> \
  --download-dir <バックアップ置き場> --password-env YAKUREKI_BACKUP_PASSWORD \
  --export-transfer-manifest --destination-name <保存先名> --destination-path <保存先パス/URL>
```

同様の長大コマンドが `user_manual.md` 内に **19 箇所**あります
（`backup:external-transfer:scheduled`、`audit:s3-worm-retention:scheduled`、`s3-worm:preflight`、`ops:schedule-drill` 等）。

これらの前提となるもの:

- 店舗PCへの **Node.js / npm とリポジトリのチェックアウト**
- Puppeteer が操作する **ログイン済みブラウザプロファイル**のパス管理
- S3 保全を使う場合は **AWS CLI・認証プロファイル・Object Lock 有効バケット**
- 失敗検知のための **監視 Webhook エンドポイント**

一方、アプリ内の「バックアップ予定」機能は **スケジューラではなく単なるリマインダ**です
（`src/lib/backup_schedule_storage.ts` — localStorage にポリシーを保存するだけ）。
さらに調査したところ、**File System Access API は一切使われていません**
（`showSaveFilePicker` / `showDirectoryPicker` の使用箇所は 0 — テスト内の否定アサーション 1 件のみ）。

**なぜ問題か**

地域の調剤薬局で、管理薬剤師が `--user-data-dir` 付きの npm コマンドを
タスクスケジューラに登録して運用し続けることは、現実的に期待できません。
結果として **「閉局時に手でJSONを書き出し、手でNASにコピーし、手で『外部保存を記録』を押す」**
という 3 手作業（`docs/field_operation_manual.md:74`）に落ち、忙しい日に飛びます。
**バックアップされていない local-first は、単なる single-point-of-loss です。**

**改善案（費用対効果が最も高い）**

**File System Access API による「1クリック外部保存」をアプリ内に実装する。**

1. 初回セットアップで `showDirectoryPicker()` により NAS / 外付けドライブ / USB のフォルダを選ばせ、
   ディレクトリハンドルを IndexedDB に永続化する（権限は再訪時に `requestPermission()` で再取得）。
2. 閉局時の日次締めウィザードから、**暗号化バックアップの生成 → 選択済みフォルダへの直接書き込み →
   読み戻し SHA-256 照合 → 「外部保存を記録」の自動化**までを 1 アクションで完了させる。
3. 世代管理（3世代保持）と失敗時の画面内アラートもアプリ側で完結させる。

これにより **大多数の店舗で Node.js が不要**になります。
既存の CLI ジョブ群は「S3 WORM で法定保存を行う大規模店舗向けの上級オプション」として残し、
`user_manual.md`（薬局向け）から `developer_manual.md`（技術者向け）へ移設すべきです。
現在は薬局向けマニュアルに開発者向け手順が混在していることが、
**マニュアル全体（50,429 バイト）の読みづらさの主因**にもなっています。

> Chromium 系（Edge / Chrome）でのみ利用可能な API ですが、
> 本システムは既に PWA・IndexedDB・Web Worker 前提であり、対象環境と齟齬はありません。
> 非対応ブラウザは現行のダウンロード方式にフォールバックさせます。

---

### A-3. メイン端末が単一障害点（SPOF）になっている

**現状**

- サテライト端末は起動時にハブからデータを取得するため、**ハブが動いていないとログイン画面まで進めません**
  （`docs/field_operation_manual.md:29`）。
- 開局手順が「メイン端末を最初に起動する」に依存しています。
- ハブ復旧不能時の手順は「予備機へバックアップ復旧し、各サテライトの接続先設定を切り替える」
  （`docs/field_operation_manual.md:122`）ですが、接続先は **`.env` の `PHARMACY_SYNC_HUB_ENDPOINT`**、
  トークンは **ハブ画面で発行して転記**する運用のため、復旧には再ビルド相当の作業が要ります。

**なぜ問題か**

朝一番にメイン端末が起動しない = **その日の受付業務が全端末で開始できません**。
薬局は「後で復旧」が許されない業態です。

**改善案**

1. **サテライトのオフラインログイン**: 直近成功したスタッフ認証情報の検証材料
   （PBKDF2 ハッシュのみ、患者データは含まない）を短期キャッシュし、
   ハブ未接続でもログインして A-1 のローカルキューに入力を続けられるようにする。
2. **接続先設定の実行時切り替え**: `PHARMACY_SYNC_HUB_ENDPOINT` を再ビルド不要の
   画面設定（初回セットアップ）へ昇格させ、予備機への切り替えを 1 分作業にする。
3. **ハブDBの定期スナップショット**: `data/sync_hub.sqlite` の日次コピーを A-2 の外部保存に同梱する。
4. 予備機切り替えの **年1回のリハーサル**を月次業務チェックリストに追加する。

---

### A-4. DB暗号鍵が localStorage 平文保存で、プロファイル喪失＝復号不能

**現状**

`NEXT_PUBLIC_DB_PASSWORD` 未設定時、RxDB の暗号鍵はランダム生成され
**localStorage に平文で保存**されます（`src/db/index.ts:62-84`、キー `pharmacy_os_local_db_password`）。

コード上のコメントは「固定鍵の共有を避ける」という正しい判断を説明しており、その点は妥当です。
ただし運用上、次の 2 つの帰結が残ります。

1. **ブラウザプロファイルの破損・再作成・Windowsユーザープロファイル再構築で鍵が失われると、
   IndexedDB が残っていても永久に復号できません。**
   （バックアップJSONは別途ユーザー指定パスワードで暗号化されるため、
   バックアップさえ取れていれば救済されます — だからこそ A-2 が最優先になります。）
2. 鍵と暗号文が同一プロファイル内に同居するため、**端末盗難時の保護力は限定的**です。
   IndexedDB の暗号化は「ディスクを抜かれた場合」には効きますが、
   「ログイン状態のPCごと持ち去られた場合」には効きません。

**改善案**

1. 初回セットアップウィザードに **「本番運用チェック」** を追加し、
   `NEXT_PUBLIC_DB_PASSWORD` 未設定なら**警告バナーを常時表示**する
   （現状は `console.warn` のみで、店舗の誰も気づけません）。
2. 生成鍵を**管理者パスワードでラップして印刷／バックアップJSONへ同梱**する鍵エスクローを用意し、
   プロファイル喪失からの復旧経路を作る。
3. 端末盗難の脅威に対しては、暗号化ではなく **OSのディスク暗号化（BitLocker/FileVault）の必須化**を
   導入要件として明記する。現状の README/マニュアルには記載がありません。

---

### A-5. 店舗設定がバックアップ対象外で、復旧しても元に戻らない

**現状**

バックアップ対象は RxDB のコレクションのみです（`src/lib/backup.ts:9` — `BACKUP_COLLECTIONS`）。
一方、以下の設定は **localStorage にのみ**存在し、バックアップにも同期にも含まれません。

| キー | 内容 | 失われると |
|---|---|---|
| `pharmacy_os_role_permission_policy_v1` | 店舗ごとの権限ロール設定 | **権限設計を一から再構築** |
| `yakureki:print-presets:v1` | 端末ごとの余白・フォントスケール | 帳票の印刷位置ずれ・用紙の作り直し |
| `yakureki_backup_schedule_policy` | 閉店時バックアップ予定 | バックアップ運用の設定消失 |
| `pharmacy_os_local_db_password` | DB暗号鍵（A-4） | **復号不能** |

**改善案**

バックアップJSONに `localSettings` セクションを追加し、
書き出し／復旧の両方で扱う。`pharma_os_local_db_password` については A-4 のエスクロー方式に従い、
**平文では同梱しない**こと（バックアップファイル自体のパスワードとは別レイヤで包む）。

---

### A-6. 日次・月次の手作業チェックの多さと属人化

**現状**

現場マニュアルが求める定型作業は、開局前 5 項目（5分）、閉局時 5 項目（10分）、月次 6 項目です。
このうち複数が「実施したことを人が記録する」形式で、実施漏れを機械的に検出できません。

**改善案**

1. A-2 の 1 クリック外部保存を **日次締めウィザードに統合**し、
   「書き出し → 外部保存 → 記録」を 1 アクション・自動記録にする（閉局時の 3 手作業を 1 に）。
2. 開局前チェックのうち機械判定できるもの（前日バックアップの有無、復旧通知、
   サテライトの同期状態、マスタ更新予定日）は **ダッシュボード上部の 1 行サマリに集約**し、
   全部 OK なら緑 1 行、問題があるものだけ展開する形にする。
3. 月次の「患者重複点検」「薬品重複点検」は**バックグラウンドで定期実行して候補件数だけ通知**し、
   0 件なら人が画面を開く必要をなくす。

---

## 3. 開発・保守の効率化

### B-1. ページコンポーネントの巨大化

**実測**

| ファイル | 行数 |
|---|---:|
| `src/app/settings/page.tsx` | **10,020** |
| `src/app/print/[visitId]/page.tsx` | 7,091 |
| `src/app/ocr/page.tsx` | 6,052 |
| `src/app/emr/page.tsx` | 4,559 |
| `src/app/inventory/page.tsx` | 4,360 |
| `src/app/page.tsx` | 1,928 |
| **6 ファイル計** | **34,010** |
| （参考）`src/components/` **全体** | **3,031** |

`settings/page.tsx` 単体で `useState` が **124 個**、タブが 9 種
（`facility` / `external` / `master` / `medicationInfo` / `backup` / `officialAudit` / `audit` / `staff` / `terminalSync`）。

**なぜ問題か**

- 別々の機能を触る 2 人が **必ず同じファイルで衝突**する。
- レビュー時の差分が読めず、`git log` に
  「fix: resolve JSX closing tag in settings page」「fix: resolve build compilation errors and all 1244 test suite failures」
  といった、**巨大ファイルの編集事故を後追いで直すコミット**が実際に残っている。
- 単体テストが書けないため、B-2 の「ソース正規表現テスト」に逃げる構造的原因になっている。

**改善案**

`settings/page.tsx` を **タブ単位で 9 ファイルへ機械的に分割**する。
タブ間で共有される状態は限定的（`activeTab` と権限判定）なので、リスクの低い作業です。
1 タブ ≒ 1,000 行に落ちれば、テストも React Testing Library で書けるようになります。
`print` / `ocr` も同様に「帳票種別ごと」「読み取り工程ごと」に分割可能です。

**着手順の推奨:** `settings` の `terminalSync` / `staff` / `backup`（比較的独立している）→ `master` → 残り。

---

### B-2. テストの 35% が挙動ではなく「ソース文字列」を検証している

**実測**

- テストファイル **185 件**中、**65 件（35%）** が `readFileSync` でソースを読み込んでいる。
- その 65 ファイル（計 12,730 行）に含まれる `assert.match` / `assert.doesNotMatch` は **2,267 件**。

**実例** (`src/app/SettingsTerminalSync.test.ts:11-14)`)

```ts
const settingsSource = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8');

test('settings exposes a terminal sync tab gated by facility management permission', () => {
  assert.match(settingsSource, /'terminalSync'/);
  assert.match(settingsSource, /openTab\('terminalSync', 'manage_facility_settings'\)/);
  assert.match(settingsSource, /端末同期（メイン端末集約）/);
  assert.match(settingsSource, /<TerminalSyncPanel \/>/);
});
```

**なぜ問題か**

- **リファクタで壊れる**: 変数名変更、JSX の整形、文字列の分割で赤くなる。B-1 の分割を阻む最大の障壁。
- **バグを検出しない**: 「ソースにその文字列がある」ことしか保証しない。
  権限判定が実際に効いているか、クリックで正しく遷移するかは検証されていない。
- **カバレッジを誤認させる**: README の「1,150+ passing」バッジ（実測 1,315）が、
  実際の挙動保証より大きく見える。

**注記:** これは本プロジェクト自身の `.agents/skills/honest-verification/SKILL.md` が
「偽カバレッジ」として明確に禁じている手法です。**ルールは正しいのに、既存 65 ファイルが未移行**という状態です。

**改善案**

1. **新規のソース正規表現テストを禁止**する（ESLint カスタムルール、または CI で
   `readFileSync(...page.tsx)` を検出して失敗させる）。
2. 既存分は一括書き換えせず、**B-1 の分割と同時に、触ったファイルから順に**
   純粋関数の直接 import ＋ React Testing Library へ移行する。
3. `@testing-library/react` は現在未導入です。導入し、まず `TerminalSyncPanel` /
   `DashboardRows` / `LoginModal` など **既に切り出し済みのコンポーネント**から実挙動テストを書く。

---

### B-3. `npm test` が存在しない（最も費用対効果が高い改善）

**現状**

`package.json` に **40 個の script** がありますが、`test` はありません。
開発者は `developer_manual.md:52` を読んで以下を手打ちする必要があります。

```
npx tsx --test $(find src -name "*.test.ts")
```

このコマンドは `find` のシェル展開に依存し、`TZ=Asia/Tokyo` の指定漏れで
**時刻判定テストが 4 件失敗**します（マニュアルにも明記されている既知の罠）。

**改善案（5 分で終わる）**

```jsonc
"scripts": {
  "test": "TZ=Asia/Tokyo tsx --test \"src/**/*.test.ts\"",
  "typecheck": "tsc --noEmit",
  "verify": "npm run lint && npm run typecheck && npm test"
}
```

`TZ` を script 側に固定すれば、CI の `env: TZ` 指定への依存もなくなり、
どのタイムゾーンの開発者でも同じ結果になります。CI と `developer_manual.md` も `npm run verify` に統一します。

---

### B-4. CI が単一ジョブ・完全直列

**現状**

`.github/workflows/onboarding-e2e.yml` は 1 ジョブ（timeout 25 分）で以下を順に実行します。

```
npm ci → lint → tsc → unit test(91s) → build(46s) → sync E2E
       → dev server 起動 → onboarding E2E → return-correction E2E → print-layout E2E
```

- Puppeteer のブラウザはキャッシュされていますが、**Next.js のビルドキャッシュ（`.next/cache`）は未キャッシュ**です。
- 静的検査（lint / tsc / unit）が終わるまで、E2E の失敗が分かりません。
- 逆に E2E が落ちると、静的検査だけ直したい時も全部やり直しです。

**改善案**

```yaml
jobs:
  static:   # lint + typecheck + unit test  → 約 3 分で結果が返る
  e2e:      # needs: static。build + 4種のブラウザE2E
```

さらに `actions/cache` に `.next/cache` を追加（キー: `${{ hashFiles('package-lock.json') }}`）。
3 種のブラウザ E2E は `matrix` で並列化できます。
体感フィードバックは **25 分 → 3 分（静的）／10 分（全体）** 程度まで短縮できます。

---

### B-5. npm script 40 件中 33 件が CI 未接続の手動ゲート

**現状**

CI から呼ばれているのは 7 件のみ（`lint` / `build` / `dev` / E2E 4 種）。
残る 33 件は `support:triage`、`release:readiness`、`pilot:kpi-review`、`evidence:integrity`、
`electronic-prescription:connector-contract` など、**人が入力JSONを用意して手で回すレビューゲート**です。

**なぜ問題か**

- 実行証跡はローカルの `artifacts/` に出るだけで、**いつ・誰が・どの版で実行したかが残りません**
  （`artifacts/` は `.gitignore` 対象）。
- スクリプト自体の回帰（入力スキーマ変更でクラッシュする等）が誰にも気づかれません。

**改善案**

1. **入力不要で回せるもの**（preflight / contract のドライラン系）を
   **nightly ワークフロー**に載せ、壊れたら気づけるようにする。
2. レビュー系 33 件について、**「いつ実行するか・成果物をどこに何年保管するか・誰が承認するか」**を
   1 枚の運用台帳（`docs/ops_review_ledger.md`）に集約する。
   現在は `user_manual.md` / `developer_manual.md` / 各スクリプトの `usage()` に散在しています。
3. 使われていないものは **統廃合**を検討する。40 個の script は、
   このコード規模（147k 行）に対しても多すぎます。

---

### B-6. 環境変数 164 個中 155 個が `.env.example` 未記載

**実測**

- コード中で参照される `process.env.*`: **164 種**
- `.env.example` に記載: **9 種**（未記載 155 種）
- うち `YAKUREKI_` 接頭辞（レビュースクリプト用）: 98 種 / 実行時設定: 66 種

未記載の実行時設定には、**接続先や認証トークンを含む重要なもの**が並びます。

```
ELECTRONIC_PRESCRIPTION_MODE / _ENDPOINT / _BEARER_TOKEN
PHARMACY_DEVICE_CONNECTOR_MODE / _ENDPOINT / _BEARER_TOKEN / _SIMULATOR_ENABLED
ONLINE_ELIGIBILITY_MODE / _ENDPOINT / _BEARER_TOKEN / _ALLOW_MOCK
MYNA_CARD_READER_MODE / _ENDPOINT / _ALLOW_MOCK
```

**なぜ問題か**

`*_ALLOW_MOCK` / `*_SIMULATOR_ENABLED` のような、**本番で有効化してはいけないフラグ**が
どこにも一覧化されていません（コードは `NODE_ENV=production` で無効化していますが、
運用者がその存在を知る手段がありません）。

**改善案**

1. `.env.example` を **`.env.example`（実行時設定・全 66 件）** と
   **`.env.review.example`（レビュースクリプト用・98 件）** に分割し、全件を記載する。
2. より根本的には、環境変数の読み出しを `src/lib/env.ts` に集約して型付けし、
   **一覧を自動生成**する。散在した `process.env.X` の直接参照は、
   Next.js のクライアント／サーバー境界を跨ぐ事故の温床でもあります。

---

### B-7. リリース管理が不在

**実測**

- `git tag`: **0 件**
- `CHANGELOG.md`: **なし**
- `package.json` の `version`: **`1.0.0` 固定**
- アプリ内にビルド版数の表示なし

**なぜ問題か**

店舗から「印刷がずれる」「UKE が止まる」と連絡が来たとき、
**その店舗がどの版を動かしているか特定する手段がありません**。
複数店舗に展開した瞬間に、サポートが成立しなくなります。

**改善案**

1. `package.json` の版数運用を開始し、`git tag` を打つ。`CHANGELOG.md` を追加する。
2. ビルド時に commit hash を環境変数へ焼き込み、
   **設定画面のフッター・バックアップJSON・監査ログ・診断エクスポート**に版数を含める。
   `anonymous_diagnostic_export.ts` が既にあるので、そこに 1 フィールド足すだけです。
3. サテライト同期時に **ハブとサテライトの版数不一致を検出して警告**する
   （スキーママイグレーションの整合性に直結します）。

---

### B-8. private → public の rsync 手動同期に情報流出リスク

**現状**

`scripts/syncToPublicRepo.sh` が、非公開リポジトリの作業ツリーを
公開リポジトリへ `rsync -a --delete` し、公開側で人が `git status` を見て手動コミットします。
除外は **20 個の `--exclude` パターン**（`docs/internal/`、`.env*.local`、`.claude/` 等）による**拒否リスト方式**です。

同期先の `origin` が `pharma-oss/pharma-oss` かを確認する safety check がある点は良い設計です。

**なぜ問題か**

拒否リスト方式は、**新しい内部専用ファイルが増えるたびに追記が必要**で、追記漏れがそのまま公開に直結します。
公開側の履歴は実作業と一致しないため、事故時の追跡も困難です。

**改善案**

1. 同期直前に **secret scan**（`gitleaks detect` 等）をスクリプト内で実行し、
   検出時は `exit 1` で止める。10 行程度の追加で済みます。
2. 除外を**許可リスト方式**（`src/`, `docs/`（`internal` 除く）, `scripts/`, ルートの既知ファイル）へ寄せる。
3. 公開側コミット前の `git status` 確認をチェックリスト化し、
   新規ファイルが 1 件でもあれば人が意図を確認する運用にする。

---

## 4. 依存関係・セキュリティ保守

### C-1. 本番依存に high 5 件の脆弱性

```
npm audit --omit=dev  →  6 vulnerabilities (5 high, 1 moderate)
npm audit             → 15 vulnerabilities (13 high, 1 moderate, 1 low)
```

主要因は **`rxdb@17.1.0` が脆弱な `ws` に依存**していること。

- `ws`: Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx)
- `ws`: Memory exhaustion DoS (GHSA-96hv-2xvq-fx4p)

**`rxdb@17.4.0` へ上げれば解消**します（同一メジャー内のマイナー更新）。

**改善案:** `rxdb` を 17.4.0 へ更新 → `npm audit --omit=dev` が 0 件になることを確認 →
ユニットテスト＋同期E2E（`npm run test:e2e:sync`）で回帰確認。
RxDB はストレージ層の中核なので、**マイグレーションと暗号化プラグインの動作確認**を必ず含めてください。

### C-2. ESLint 8.57（EOL）と `eslint-config-next` の 2 メジャー遅れ

| パッケージ | 現在 | 最新 |
|---|---|---|
| `eslint` | 8.57.0（**2024年10月にEOL**） | 10.8.0 |
| `eslint-config-next` | **14.2.3** | 16.2.12 |
| `next` | 16.2.3 | 16.2.12 |

**Next.js 16 を使いながら、Lint ルールは Next 14 世代のもの**が適用されています。
App Router / React 19 向けの新しい検査（Server Component 境界、`use client` の誤用など）が
**まったく効いていません**。Lint が「エラー 0 / 警告 2」なのは、**ルールが古いから**でもあります。

**改善案:** `eslint` 9 系（flat config）＋ `eslint-config-next@16` へ更新する。
flat config への移行が必要なので、C-1 とは分けて実施してください。

### C-3. 依存更新の自動化が未設定

`.github/dependabot.yml` / Renovate ともに未設定です。
17 パッケージ中 **17 件すべてが古い**状態（`npm outdated` 全件ヒット）。

**改善案:** Dependabot を weekly / grouped（patch・minor をまとめて 1 PR）で設定する。
CI が既に PR で全チェックを回すので、安全に回せます。

---

## 5. 推奨ロードマップ

### フェーズ 1 — 即日〜1週間（低コスト・高効果）

| 項目 | 内容 | 目安 |
|---|---|---|
| B-3 | `npm test` / `typecheck` / `verify` script 追加、`TZ` を script に固定 | 30分 |
| C-1 | `rxdb` 17.4.0 へ更新、本番依存の high 5 件を解消 | 2時間 |
| C-3 | Dependabot 設定 | 30分 |
| B-7 | `CHANGELOG.md`・タグ運用開始、版数をアプリ内表示・診断JSONへ | 半日 |
| B-4 | CI を static / e2e の 2 ジョブへ分割、`.next/cache` をキャッシュ | 半日 |
| A-4(1) | `NEXT_PUBLIC_DB_PASSWORD` 未設定時の画面内警告バナー | 2時間 |
| B-8 | 同期スクリプトに secret scan を組み込み | 2時間 |

### フェーズ 2 — 1〜2ヶ月（運用リスクの本丸）

| 項目 | 内容 |
|---|---|
| **A-1** | サテライトの未同期ローカルキュー ＋ `visibilitychange` フラッシュ ＋ 電源断シナリオの E2E |
| **A-2** | File System Access API による 1クリック外部保存。CLI 手順を開発者マニュアルへ移設 |
| A-5 | バックアップJSONへの `localSettings` 追加 |
| A-6 | 日次締めウィザードへの統合、開局前チェックの自動判定 |
| B-6 | `src/lib/env.ts` への集約と `.env.example` の全件記載 |

### フェーズ 3 — 3〜6ヶ月（構造改善）

| 項目 | 内容 |
|---|---|
| **B-1** | `settings/page.tsx` のタブ単位分割（9ファイル）→ `print` / `ocr` |
| **B-2** | RTL 導入。分割したファイルから順に実挙動テストへ移行。新規ソース正規表現テストを CI で禁止 |
| A-3 | サテライトのオフラインログイン、ハブ接続先の画面設定化、予備機フェイルオーバー訓練 |
| B-5 | レビューゲート 33 件の運用台帳化・統廃合、nightly 化 |
| C-2 | ESLint 9 flat config ＋ `eslint-config-next@16` |

---

## 6. 補足 — 本報告書で扱わなかったこと

以下は [operational_issues.md](../operational_issues.md) の管轄として、意図的に除外しています。

- 令和8年調剤報酬の算定ロジックと公式資料との突合状況
- UKE / レセプト電算仕様への準拠度、返戻ケースの検証
- 医薬品マスタの正式更新経路、PMDA添付文書データの網羅性
- 法定帳票の様式監査、マイナ資格確認の実連携

これらは **本書のどの改善よりも、実請求運用の可否を左右します**。
本書はあくまで「機能が揃った後、店舗で回し続けられるか」を扱ったものです。

---

*本報告書の指摘はすべて、2026-07-29 時点のコミット `bec24c3` に対する実行結果・実測値に基づきます。*
