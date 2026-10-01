# トラック C-1 ステップ 4：UKE 生成経路の統合・本番切替準備と安全な移行設計 報告書

## 1. 概要と背景
Pharma-OSS では、調剤報酬請求（レセプト電算処理）において以下の二系統のデータ出力経路が存在していました。
1. **旧形式・独自フォーマット出力（`RECEIPT_{id}.uke` / `RECEIPT_{month}.uke`）**:
   - 開発初期から使われていた点検用・独自連携用のフォーマット。
2. **公式電算処理仕様（`RECEIPTY.CYO`）**:
   - 厚生労働省・社会保険診療報酬支払基金・国民健康保険中央会標準規格（令和8年6月版準拠、JIS X 0208 Shift_JIS、CRLF、末尾EOF 0x1A、IR/RE/HO/KO/KH/CZ/IY/TO/CO/SI/GO）に準拠した公的提出用正本フォーマット。

ステップ 1（差分・対照表テスト）、ステップ 2（共通ビルダー・単票公式ビルダー）、ステップ 3（単票画面への公式プレビュー・出力モーダル併設）を経て、本ステップ 4 では **公式提出用（`RECEIPTY.CYO`）を公的提出の正本（Primary）として明示**し、旧形式を「点検用旧形式」として位置づけを明確化しました。

> [!IMPORTANT]
> **通常出力を独断で塞がない方針（AGENTS.md 第十条）**
> 現場では、院内の独自点検スクリプトや過去データとの比較照合のために旧形式が日常業務に組み込まれている可能性があります。
> 指示された範囲を超えて通常出力を独断で塞ぐことは厳禁とし、公式正本と点検用旧形式を安全に並行利用できる二重構造を維持しています。

---

## 2. 実施した変更とUI設計

### 2.1 単票画面（`/print/[visitId]`）
- **公式提出用ボタン（`print-official-uke-button`）**:
  - `title`: `公式提出用UKE（正本: RECEIPTY.CYO / 支払基金・国保連電算仕様 / GO集計 / EOF 0x1A）の点検とダウンロード`
  - 役割: 公的提出の正本として、電算仕様チェック、Shift_JIS プレビュー、`RECEIPTY.CYO` 出力モーダルを起動。
- **点検用旧形式ボタン（`print-uke-export-button`）**:
  - `title`: `点検用UKE出力（旧形式・独自フォーマット: RECEIPT_{id}.uke）`
  - 役割: 院内点検や独自ツール連携のための補助出力として併設維持。
- **監査ログ（`audit_logs`）の区分化**:
  - 公式出力時: `公式レセプト（UKE / RECEIPTY.CYO）エクスポート: 患者「{name}」の公式電子レセプト（点数: {points}点、レコード数: {records}行）を出力しました。`
  - 旧形式出力時: `レセプト（UKE・点検用旧形式）エクスポート: 患者「{name}」の電子レセプト（点数: {points}点、ファイル: {fileName}）を出力しました。`

### 2.2 月次請求ワークベンチ（`ClaimWorkbenchSection.tsx`）
- **公式提出用一括ボタン（`monthly-claim-official-uke-button`）**:
  - スタイル: `className="section-action-button primary"`（視覚的プライマリアクションとして正本を強調）
  - `title`: `公式提出用UKE出力（正本: RECEIPTY.CYO / 支払基金・国保連仕様 / 突合点検付き）`
  - 機能: 算定ルール事前点検、提出準備チェック、総合集計GO突合、EOF 0x1A 付き `RECEIPTY.CYO` 出力。
- **点検用旧形式一括ボタン（`monthly-claim-uke-button`）**:
  - `title`: `月次一括UKE出力（点検用・旧形式: RECEIPT_{month}.uke）`
  - スタイル: セカンダリアクションとして併設。
- **監査ログの区分化**:
  - 公式出力時: `月次公式UKE出力: {fileName} / RECEIPTY.CYO / 受付 {N}件 / 合計 {points}点 / 提出準備確認済み / 集計突合OK ...`
  - 旧形式出力時: `月次一括UKE（点検用旧形式）出力: {fileName} / 受付 {N}件 / 合計 {points}点。`

---

## 3. 安全な完全廃止判定基準と移行ロードマップ

純粋モジュール `src/lib/receipt/uke_migration_policy.ts` において、旧形式の完全廃止条件を客観的に評価する判定関数 `evaluateUkeRetirementReadiness` を策定しました。

### 3.1 完全廃止の3大条件（Gate Criteria）
| 条件 | 評価項目 | 判定基準 | 根拠・目的 |
| :--- | :--- | :--- | :--- |
| **条件 A** | 公式実績（`pilotMonthsConfirmed`） | **1ヶ月以上** | 支払基金・国保連のオンライン請求システムでの受付受領書突合が正常完了していること。 |
| **条件 B** | 旧形式出力ゼロ（`legacyExportCountLast3Months`） | **直近3ヶ月間 0 件** | 監査ログ上で現場での旧形式利用実績が自然消滅していることを実測確認。 |
| **条件 C** | ステークホルダー合意（`stakeholderConsentObtained`） | **完全合意（true）** | 現場薬剤師・医療事務・院内独自連携システムの保守担当者からの正式合意。 |

### 3.2 移行フェーズ（3段階）
1. **フェーズ 1（現在・ステップ 4 完了）: 正本明示・並行運用期**
   - 公式 `RECEIPTY.CYO` を公的提出正本として明示。
   - 点検用旧形式を併設維持し、監査ログで利用種別を追跡。
2. **フェーズ 2: UI 集約期（UI Nesting）**
   - 条件 A 達成後、点検用旧形式ボタンを「その他操作」等のプルダウンメニュー内に格納。
   - 日常的な主動線を完全に公式提出用に統一。
3. **フェーズ 3: 完全廃止期（Full Retirement）**
   - 条件 A, B, C のすべてを満たした時点で、旧形式ビルダーコードおよびダウンロード動線を完全削除。
   - 公式電算処理ビルダーにコードベースを一本化。

---

## 4. 検証実績（honest-verification 遵守）
- **型検査**: `npx tsc --noEmit` により型エラー 0 件を確認。
- **Fail-First Mutation 実証**:
  - `uke_migration_policy.ts` の `categorizeUkeExportAuditType` を意図的に変異させ、テストが `AssertionError: Expected 'official', got 'legacy_inspection'` で失敗することを実測。
  - 変異復元後に PASS を確認。
- **契約テスト**: `src/lib/receipt/dispensing_uke_step4_switchover.test.ts`（4件）を含むレセプト関連 112 件全 PASS。
