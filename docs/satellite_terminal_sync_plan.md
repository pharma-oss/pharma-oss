# サテライト端末同期（メイン端末集約）導入計画

最終更新: 2026-07-12

## 実装状況（2026-07-12）

- **Phase 1〜3は実装済み。** ハブストア(`src/lib/sync/hub_store.ts`)、同期API(`src/app/api/sync/*`)、役割分岐DB(`src/db/index.ts`)、レプリケーション(`src/lib/sync/replication_client.ts`)、初回同期ゲート(`src/db/DatabaseProvider.tsx`)、端末別監査チェーン(`src/lib/audit.ts` / `src/lib/audit_integrity.ts`)、同期ステータス表示(`src/components/SyncStatusIndicator.tsx`)、設定>端末同期タブ(`src/components/TerminalSyncPanel.tsx`)。
- **Phase 4は移行導線・E2E実装済み。** 2プロセスE2E(`scripts/runSyncE2E.mjs`、`npm run test:e2e:sync`)、CI組み込み、サテライト化後の旧ローカルデータ削除導線(設定>端末同期)。既存端末のデータ移行は既存のバックアップ書き出し→メイン端末で復旧の導線を使う(下記「既存端末のサテライト化手順」)。
- 実装済みの環境変数は本書「環境変数」の節のとおり。

## 目的

現在の yakureki は、患者データ（要配慮個人情報）を各端末のブラウザ内 IndexedDB に独立して暗号化保存するローカルファースト構成であり、端末間の同期機構がない。このため次の運用課題がある。

- 全端末に患者情報が残留し、端末の盗難・マルウェア感染・廃棄時の漏えいリスクが端末台数分に増える（[operational_issues.md](../operational_issues.md) §1）。
- 端末ごとにデータが分断され、同一患者が端末別に二重登録される。受付した端末でしか薬歴を参照できない。
- 店舗内複数端末同期と競合解決ルールが未整備（[operational_issues.md](../operational_issues.md) §6、§7「バックアップ/同期/復旧手順」）。

本計画では、店舗内の1台を**メイン端末（集約ハブ）**とし、他の端末を**サテライト端末**として次の構成へ移行する。

- サテライト端末は患者データを**一切ディスクに永続化しない**（RxDB メモリストレージのみ。タブを閉じれば消える）。
- サテライト端末での入力は、店舗内 LAN 経由で**メイン端末へ継続的に集約**する。起動時はメイン端末から全データを取得する。
- メイン端末に接続できない間もサテライトでの**入力は継続**でき、画面に未同期警告を常時表示する。再接続時に自動送信する。
- 既定は現行どおりの単独動作（`standalone`）とし、**既存インストールの動作は変えない**（後方互換）。

## 決定済みの方針

| 論点 | 決定 | 理由 |
| --- | --- | --- |
| サテライトの患者データ保持 | 完全メモリのみ（`rxdb/plugins/storage-memory`） | 「端末に保存されない」要件を厳密に満たす。参照データ含め起動時にメイン端末から取得 |
| メイン端末接続断時の動作 | 入力継続＋未同期警告＋クローズ時の消失確認ダイアログ | 業務を止めない。消失リスクは警告と live 同期で最小化 |
| アプリ配置 | 各端末に配置し、自機の Next.js サーバー経由でメイン端末へ中継 | localhost のセキュアコンテキストを維持し、カメラ（GS1 スキャン）・PWA・WebCrypto を温存。施設内コネクタ（NSIPS/電子処方箋接続モジュール）と同じ「ブラウザ→自機 `/api` →施設内エンドポイント」パターン |
| 競合解決 | ハブ（正本）優先。負けた書き込みは競合ログへ記録し設定画面で薬剤師がレビュー | 業務上の矛盾を人が最終判断する。operational_issues §6 への回答 |

## 全体アーキテクチャ

```
メイン端末マシン                             サテライト端末マシン（複数可）
┌───────────────────────────┐      ┌───────────────────────────┐
│ ブラウザ (http://localhost:3000)│      │ ブラウザ (http://localhost:3000)│
│  RxDB Dexie+暗号化（現行どおり） │      │  RxDB メモリストレージ           │
│    ↕ replicateRxCollection    │      │    ↕ replicateRxCollection    │
│ Next.js サーバー               │      │ Next.js サーバー               │
│  /api/sync/* = ハブ本体        │◄─LAN──│  /api/sync/* = ハブへ中継       │
│  ハブストア (SQLite, AES-GCM)   │      │  （Bearer トークンは env のみ、   │
└───────────────────────────┘      │   ブラウザへ渡さない）           │
                                   └───────────────────────────┘
```

- 端末の役割は各マシンの環境変数 `PHARMACY_SYNC_ROLE=hub | satellite | standalone`（既定 `standalone`）で決める。
- **ハブストア**: メイン端末の Next.js サーバー内に `node:sqlite`（Node 22.13 以上、追加ネイティブ依存なし）で正本を保持する。ドキュメント本文は AES-256-GCM（`node:crypto`、鍵は `PHARMACY_SYNC_HUB_ENCRYPTION_KEY`）で暗号化して保存する。
- **同期プロトコル**: RxDB open-core の `replicateRxCollection`（チェックポイント式 pull/push、live、自動リトライ）。チェックポイントは RxDB 内部ストレージに保存されるため、コレクションを追加しない（open-core 上限14個を維持。`src/db/index.ts` の `ACTIVE_RXDB_COLLECTION_LIMIT` 参照）。
- **同一ルートの二役**: `/api/sync/pull | push | config | status` は、role=hub ならハブストアを直接処理し、role=satellite なら `PHARMACY_SYNC_HUB_ENDPOINT` へ Bearer トークン付きで転送する。
- **メイン端末のブラウザ**は現行どおり Dexie+暗号化 IndexedDB を持ち、自機の `/api/sync` と双方向同期する（メイン端末のブラウザ＝全量レプリカ。既存のバックアップ導線がそのまま全量を含む）。

### ハブストアのスキーマ（node:sqlite）

```sql
docs(collection TEXT, id TEXT, seq INTEGER,  -- seq はハブ採番の単調増加値（pull チェックポイント）
     rev TEXT, lwt INTEGER, deleted INTEGER,
     payload_enc BLOB,                        -- AES-256-GCM 暗号化した JSON
     PRIMARY KEY (collection, id));
terminals(terminal_id TEXT PRIMARY KEY, label TEXT,
          token_hash TEXT,                    -- トークンは平文保存しない
          last_seen_at TEXT, last_pushed_seq INTEGER);
conflicts(id TEXT PRIMARY KEY, collection TEXT, doc_id TEXT,
          terminal_id TEXT, occurred_at TEXT,
          losing_payload_enc BLOB, resolved INTEGER, resolved_by TEXT);
```

### 同期対象コレクションと方向

| コレクション | 方向 | 備考 |
| --- | --- | --- |
| patients, visits, prescription_items, soap_records, alerts, interventions, drugs, drug_stocks, locations, medication_guidances, patient_medication_info_templates, users, facility_settings | 双方向 | サテライトは参照データの JSON シードを行わず、すべてハブから pull する（シード→push の二重登録ノイズ回避） |
| audit_logs | サテライト: push 専用 / メイン: 双方向 | メイン端末ブラウザが全端末分を保持し、既存バックアップ（`src/lib/backup.ts` の `BACKUP_COLLECTIONS`）が全量を含む状態を維持 |

### コレクション上限（RxDB open-core 14個）と患者情報の拡張戦略

RxDB 17.1.0 open-core は同時にオープンできるコレクションを14個までに制限しており（`src/db/index.ts` の `ACTIVE_RXDB_COLLECTION_LIMIT`）、現状ちょうど14個で満杯である。この制約と本計画・今後の患者情報拡張の関係を明確にする。

- **上限の対象は「コレクション数」であり、ドキュメント内のフィールド数ではない。** 患者情報の項目追加は `PATIENT_SCHEMA` のスキーマバージョンアップ＋マイグレーション（既存の仕組み）で行い、上限を消費しない。同期はドキュメント全体を JSON として転送し、ハブストアもペイロードをスキーマ非依存の暗号化 BLOB として保存するため、**項目追加時に同期側の変更は不要**。
- **本計画はコレクションを1つも追加しない。** レプリケーションのチェックポイントは RxDB 内部ストレージに保存され、ハブストアは RxDB 外の SQLite である。
- 新しい記録種別（検査値履歴、在宅訪問記録など）を**コレクションとして**追加したい場合は、次の順で対応する。
  1. **フィールド埋め込み**: 患者/受付と 1:1 または少数件のデータは、既存ドキュメントの入れ子フィールドにする（既存例: `patients.publicInsurances`）。
  2. **汎用 `patient_records` コレクションの確保**: `recordType` フィールドと `patientId + recordType` 複合インデックスを持つ多重化コレクションを1枠だけ新設し、以後の患者系記録種別はすべてここに収容する。枠は既存コレクションの統合で捻出する（候補: `medication_guidances` と `patient_medication_info_templates` を参照データ1コレクションへ統合、`locations` の `facility_settings` への吸収）。統合は既存のマイグレーション機構とバックアップ形式のバージョンアップで行う。
  3. **非患者参照データは RxDB 外へ**: 端末に残ってよい参照系マスタは SQLite-WASM マスタストア（`src/lib/master-data/`）へ置く。`drug_infos` を RxDB から退避した前例あり（`src/db/collection_limit.test.ts`）。患者データはサテライトで永続化できないためこの手は使わず、2. の多重化コレクションで受ける。
  4. **恒久策**: 上限撤廃が必要になった場合は RxDB Premium ライセンスの購入、または Dexie（依存導入済み）＋自前チェックポイント同期クライアントへの移行を検討する。ハブ集約後は正本がハブ側 SQLite になり同期エンドポイントも自前実装のため、ブラウザ側ストレージの差し替え難度は現行構成より下がる。
- 新コレクション追加時は、同期対象表・`BACKUP_COLLECTIONS`（`src/lib/backup.ts`）・`collection_limit.test.ts` の3点を併せて更新する。

### 監査ログのハッシュチェーン変更

現行の監査ログは単一チェーン（`previousHash`→`integrityHash` 直列、`src/lib/audit_integrity.ts`）のため、複数端末のログを集約すると検証が壊れる。次のとおり変更する。

- `AuditLog` に `terminalId` を追加し、**端末ごとの独立チェーン**にする。
- 検証（整合性チェック・S3 WORM 保全）は `terminalId` でグループ化し、各チェーンを個別に検証する。
- `terminalId` を持たない既存ログは「レガシーチェーン」として従来どおり検証する（後方互換）。

### 通信の安全

電子処方箋接続モジュール・調剤機器コネクタと同じ規約に合わせる。

- 平文 HTTP は同一端末の `localhost` / loopback だけ許可。施設内 LAN は HTTPS を必須とする。
- HTTPS 証明書を用意できない店舗向けの代替として、`PHARMACY_SYNC_TRANSPORT_ENCRYPTION=aes-gcm` を設定した場合のみ、共有施設鍵でペイロードを AES-256-GCM 暗号化したうえで LAN 内 HTTP を許可する（Bearer トークン＋ペイロード暗号化で盗聴・なりすましを緩和）。
- 端末トークンはメイン端末の設定画面で発行し、サテライトの `.env` にだけ保存する（ブラウザへは渡さない）。ハブ側はハッシュのみ保存する。
- URL・トークン・通信本文は監査ログ・画面・成果物へ生値を出さない（既存コネクタと同じ扱い）。

### 環境変数（案）

```bash
# メイン端末
PHARMACY_SYNC_ROLE=hub
PHARMACY_SYNC_HUB_ENCRYPTION_KEY=<32byte hex>       # ハブストアの at-rest 暗号鍵
PHARMACY_SYNC_HUB_DB_PATH=./data/sync_hub.sqlite    # 既定値あり

# サテライト端末
PHARMACY_SYNC_ROLE=satellite
PHARMACY_SYNC_HUB_ENDPOINT=https://<メイン端末>:3000
PHARMACY_SYNC_TERMINAL_ID=<メイン端末で発行>
PHARMACY_SYNC_TERMINAL_TOKEN=<メイン端末で発行>
PHARMACY_SYNC_TRANSPORT_ENCRYPTION=aes-gcm          # LAN が HTTP の場合のみ必須
PHARMACY_SYNC_TRANSPORT_KEY=<共有施設鍵>
```

## 実装フェーズ

### Phase 1: ハブストアと同期 API（サーバー側のみ）

- `src/lib/sync/hub_store.ts`: node:sqlite ストア（seq 採番、rev 比較による push 競合検出、AES-GCM at-rest 暗号化）＋ `hub_store.test.ts`
- `src/lib/sync/sync_config.ts`: env 解釈と検証（`src/lib/pharmacy_device_connector_client.ts` の env 検証パターンを踏襲）
- `src/app/api/sync/{pull,push,config,status}/route.ts`: hub=ストア処理 / satellite=中継。ルートテストは `src/app/api/system/ConnectorReadinessRoute.test.ts` の形式
- 端末登録・トークン発行/失効（`terminals` テーブル）

完了条件: 2つの Node プロセス（hub / satellite 中継）間で pull/push/checkpoint がユニットテストで通る。トークン不一致・HTTPS 規約違反・暗号鍵未設定時は起動/受信を拒否する。

### Phase 2: クライアント同期とサテライトモード

- `src/db/index.ts` の `create()` を役割分岐: 起動時に自機 `/api/sync/config` を取得し、satellite → メモリストレージ（暗号化ラッパー・ローカルパスワード生成・JSON シードをスキップ）、hub / standalone → 現行どおり
- `src/lib/sync/replication.ts`: 対象コレクションへ `replicateRxCollection` を起動（fetch 先は自機 `/api/sync`。audit_logs は方向制御）
- サテライト初回同期ゲート: users / facility_settings の pull 完了までログイン画面をブロックし、進捗を表示（`src/db/DatabaseProvider.tsx`）

完了条件: サテライトで受付→メイン端末ブラウザに反映。サテライトのリロード後、IndexedDB に患者データが存在しない（DevTools で確認）。

### Phase 3: 監査チェーン・競合レビュー・状態表示

- `src/lib/audit.ts` / `src/lib/audit_integrity.ts`: `terminalId` 追加、端末別チェーン検証、レガシー互換
- ヘッダー常時表示の同期ステータス（同期済み / 送信待ちN件 / メイン端末未接続）と、サテライトの `beforeunload` 未同期消失警告
- 設定 > 端末同期 ページ: 役割表示、接続状態、登録端末一覧と最終同期時刻、競合レビュー一覧（負けた書き込みの内容表示と確認記録）、トークン発行/失効

完了条件: メイン停止中のサテライト入力が復旧後に自動送信される。競合を意図的に起こすと設定画面でレビューできる。監査ログ整合性検証が複数端末ログに対して成功する。

### Phase 4: 移行ツール・ドキュメント・E2E

- 既存端末のサテライト化フロー(実装済みの手順は下記「既存端末のサテライト化手順」)
- 集約後の端末間重複患者は、既存の患者重複レビュー/統合（`src/lib/patient_duplicate_review.ts` / `src/lib/patient_merge.ts`）で名寄せする
- README / developer_manual / field_operation_manual の更新（セットアップ手順、障害時運用）
- 2プロセス同期 E2E `scripts/runSyncE2E.mjs`（`npm run test:e2e:sync`。ハブ起動→端末登録→サテライト経由 push/pull →競合記録→失効拒否を検証）と CI 組み込み

完了条件: 新規店舗セットアップと既存店舗移行の両手順がドキュメントどおりに完走し、E2E が CI で通る。

## 既存端末のサテライト化手順（実装済み）

既存の単独動作端末をサテライトへ切り替えるときは、新しい一括送信機構ではなく、
検証済みの既存バックアップ導線でデータをメイン端末へ寄せる。

1. **旧端末で**: 設定 > バックアップ から暗号化バックアップJSONを書き出す。
2. **メイン端末で**: 設定 > バックアップ の復旧導線で取り込む(復旧前差分プレビューで件数を照合)。
   メイン端末は常時レプリケーションしているため、取り込んだデータは自動的にハブストアへも反映される。
3. **メイン端末で**: 設定 > 端末同期 からサテライト端末を登録し、トークンを発行する。
4. **旧端末で**: `.env` に `PHARMACY_SYNC_ROLE=satellite` とハブ接続先・端末ID・トークンを設定して再起動する。
5. **旧端末(サテライト化後)で**: 設定 > 端末同期 の「旧ローカルデータを完全に削除」で、
   端末に残った暗号化IndexedDBを削除する(操作は監査ログに記録される)。
6. 集約後、同一患者が端末ごとに二重登録されていた場合は患者重複レビューで統合する。

## 運用設計

- **メイン端末停止時**: サテライトは未同期警告つきで入力継続。メイン復旧後に自動送信。長時間停止が見込まれる場合はサテライトのタブを閉じない（メモリ上の未同期データが消えるため）。
- **ハブストア（SQLiteファイル）を失った場合**: レプリケーションのチェックポイントはブラウザ側に残るため、空のハブストアへ自動では再送されない。メイン端末のブラウザバックアップを設定 > バックアップから復旧（再インポート）すると、全ドキュメントが書き直されて自動的にハブストアへ再pushされる。
- **バックアップ**: 現行のブラウザバックアップ（設定 > バックアップ、`scripts/runBrowserBackupExport.mjs`）はメイン端末で実施すれば全端末分を含む。ハブストアの SQLite ファイルも閉店時バックアップ対象に加える。ハブストアが破損した場合はメイン端末ブラウザの全量レプリカから再 push で再構築できる。
- **時刻同期**: push の競合判定はハブ採番の seq に基づくため時計ずれで壊れないが、監査ログ・薬歴の時刻整合のため全端末の NTP 同期を推奨する。
- **端末の追加・廃棄**: 追加はメイン端末でトークン発行→サテライト `.env` 設定→初回同期。廃棄・紛失時はトークン失効のみでよい（サテライトには患者データが残っていない）。メイン端末の廃棄・故障は従来どおりバックアップ復旧手順による。

## 主要リスク

- **サテライトはタブクローズ・クラッシュで未同期入力が消える** — 常時ステータス表示、クローズ時警告、接続時は数秒間隔の live 同期で消失窓を最小化する。
- **メイン端末が単一障害点になる** — メイン端末ブラウザの全量レプリカと既存バックアップ体制を維持し、ハブストアは再構築可能にする。メイン故障時は予備機へバックアップ復旧し、`PHARMACY_SYNC_HUB_ENDPOINT` を切り替える。
- **Node 22.13 未満では node:sqlite が使えない** — セットアップ要件に明記する（CI は Node 22 で検証）。
- **初回同期の所要時間** — 薬品マスタ含む全量 pull のため、店舗 LAN で数秒〜数十秒を想定。進捗表示で対処し、必要ならコレクション別の一括スナップショット取得を追加する。
- **RxDB open-core のコレクション上限（14個）に既に達している** — 本計画はコレクションを追加しないため影響しないが、今後の記録種別追加は「コレクション上限と患者情報の拡張戦略」の節の方針（フィールド埋め込み→多重化コレクション→Premium/Dexie 移行）に従う。

## 検証方法

- 単体: `npx tsx --test $(find src -name "*.test.ts")`（既存全件＋sync 追加分）
- 手動/E2E: ポートを変えて hub と satellite の2サーバーを起動し、(1) サテライトで患者受付→メイン端末ブラウザへ反映、(2) サテライトのリロード後に IndexedDB へ患者データが残っていない、(3) メイン停止中のサテライト入力が復旧後に自動送信される、(4) 同一患者の同時編集で競合レビューに記録される、を確認する。
