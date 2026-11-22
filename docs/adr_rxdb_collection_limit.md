# ADR: RxDB open-core コレクション上限 14 に対する統合枠および恒久策の設計決定（トラック H-2）

- **決定日**: 2026-11-22
- **ステータス**: 決定済み（Accepted）
- **対象トラック**: [金科玉条とロードマップ](golden_rules_and_roadmap.md) 第Ⅲ部 トラック H-2 / [サテライト端末同期計画](satellite_terminal_sync_plan.md)

---

## 1. 背景と現状実測

pharma-oss はブラウザ側ローカル DB として `rxdb`（open-core）＋ `dexie`（IndexedDB）を採用しており、open-core 版の同時オープン可能コレクション上限は **14** である（`src/db/index.ts` の `ACTIVE_RXDB_COLLECTION_LIMIT`）。

2026-11-22 時点で稼働中のアクティブコレクションはちょうど **14 / 14（満杯）** であり、`BACKUP_COLLECTIONS`（`src/lib/backup.ts`）および `ALL_SYNC_COLLECTIONS`（`src/lib/sync/sync_collections.ts`）と 1 対 1 で一致している。

| # | コレクション名 | 主用途・データ特性 | スキーマ版 |
|---|---|---|---|
| 1 | `patients` | 患者基本情報・保険/公費・`clinicalProfile`（暗号化） | v6 |
| 2 | `visits` | 受付・請求ライフサイクル・`interventionEvents`・`followUp` | v26 |
| 3 | `prescription_items` | 処方明細・調剤実量・用法コード | v18 |
| 4 | `soap_records` | 薬歴（SOAP）・AI 下書き状態 | v4 |
| 5 | `alerts` | アレルギー・副作用アラート | v1 |
| 6 | `interventions` | 疑義照会（従来構造） | v3 |
| 7 | `drugs` | 医薬品マスタ・薬価履歴・発注点 | v10 |
| 8 | `drug_stocks` | ロット・期限単位の在庫 | v5 |
| 9 | `locations` | 棚番地マスタ（店舗あたり数十〜百件規模） | v1 |
| 10 | `facility_settings` | 施設基準・営業時間・算定コード上書き（単一 `default` 文書） | v6 |
| 11 | `medication_guidances` | 薬剤別指導文例テンプレート（キー: `drugCode`） | v1 |
| 12 | `patient_medication_info_templates` | 薬情テンプレート（キー: `drugCode`） | v1 |
| 13 | `users` | スタッフ・権限・認証情報 | v2 |
| 14 | `audit_logs` | ハッシュチェーン付き監査ログ（サテライトは push 専用） | v21 |

※ 非患者参照データである `drug_infos`（PMDA 添付文書由来相互作用・禁忌）は既に SQLite-WASM マスタストア（`src/lib/master-data/`）へ退避済み。

---

## 2. 設計決定

### 決定 1: 現時点では 14 コレクション構成を維持する（即時統合は行わない）

- RxDB 上限の対象はコレクション数であり、ドキュメント内フィールド数ではない。
- 実際、Phase B の **F-2**（`visits.interventionEvents`）および **F-3**（`patients.clinicalProfile`）は、既存スキーマの暗号化入れ子フィールド追加＋ `keepDocument` マイグレーションにより、コレクション枠を一切消費せず安全に実装・同期できている。
- 具体的な新コレクション需要が無い段階で先行統合を行うと、バックアップ形式（`BACKUP_FORMAT_VERSION`）の変更・既存データのマイグレーションリスク・サテライト同期互換リスクを不必要に発生させるため、現時点は 14 枠を維持する。

### 決定 2: 将来 15 枠目が必要になった際の統合枠と多重化コレクション手順

以下の **発動条件（Trigger）** を満たす新機能（例: 長期的な在宅訪問記録、大量の時系列バイタル/検査履歴など、単一患者ドキュメントへの埋め込みでは同期ペイロード肥大化や複合インデックス検索要件を満たせない記録種別）が確定した時点で、1 枠を統合して汎用多重化コレクション `patient_records` を新設する。

1. **第 1 統合候補（優先採用）: `locations` の `facility_settings` への吸収**
   - 根拠: 参照箇所が在庫棚マスタ設定（`LocationMaster.tsx` / `/inventory`）および監査設定に極めて限定されており、店舗あたりのレコード数も数十〜百件程度の軽量な棚ラベル配列である。患者データを含まず、既存業務フローへの影響範囲が最小。
2. **第 2 統合候補（さらに枠が必要な場合）: `medication_guidances` + `patient_medication_info_templates` の統合**
   - 根拠: 双方とも `drugCode` をキーとする薬剤別テンプレートであり、1 コレクション（例: `drug_reference_templates`）へ安全に統合可能。
3. **捻出枠の用途: 汎用多重化コレクション `patient_records` の新設**
   - `recordType` + `patientId` の複合インデックスと暗号化ペイロードを持つ単一コレクションとして設計し、以後の患者系時系列記録種別をすべて 1 枠へ収容する。
4. **必須同時更新チェックリスト（第Ⅳ部 §2 規律）**
   - `src/db/schema.ts` / `src/db/index.ts`（マイグレーション＋バックアップ形式 v2 互換ロード）
   - `src/lib/backup.ts`（`BACKUP_COLLECTIONS`）※ `ALL_SYNC_COLLECTIONS` は自動的に追従
   - `docs/satellite_terminal_sync_plan.md`（同期対象表）
   - `src/db/collection_limit.test.ts`（14 上限および `BACKUP_COLLECTIONS`・`ALL_SYNC_COLLECTIONS` との完全一致契約）

### 決定 3: 恒久策は「Dexie 直接利用＋自前同期クライアント」とし、RxDB Premium は不採用

- **RxDB Premium を不採用とする理由**:
  - 本プロジェクトは Apache-2.0 のオープンソース薬局システムであり、商用ランタイムライセンスに依存すると店舗の無償導入・OSS としての再配布性が損なわれる。
- **恒久策として採用するアーキテクチャ**:
  - ハブ側正本は既に RxDB 非依存の **`node:sqlite` + AES-256-GCM + 自前 `/api/sync/*` エンドポイント** で稼働しており、ブラウザ側の実永続化基盤も既に導入済みの **`dexie`（4.4.2）** である。
  - 将来的に多重化コレクションでも対応困難な規模へ成長し上限 14 自体の撤廃が必要になった場合は、ブラウザ側を **Dexie 直接利用（IndexedDB + WebCrypto 暗号化ラッパー、サテライトはメモリ実装）＋自前チェックポイント pull/push 同期クライアント** へ段階移行する。ハブ側プロトコル・SQLite スキーマはそのまま流用できる。

---

## 3. 検証・回帰防壁

- `src/db/collection_limit.test.ts` において、以下を自動検証する契約を固定する。
  1. アクティブ RxDB スキーマ数が 14 以下であること（open-core 上限遵守）。
  2. アクティブ RxDB コレクション集合、`BACKUP_COLLECTIONS`、`ALL_SYNC_COLLECTIONS` の 3 者が 1 対 1 で完全一致すること。
