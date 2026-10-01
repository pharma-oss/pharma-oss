# トラック G-2 実装・検証完了報告書: 発注点・リードタイム・期限切迫・代替薬候補の統合

実施日: 2026-10-01  
対象トラック: **トラック G-2（在庫・店舗運用: 発注点・リードタイム・期限切迫・代替薬候補）**  
計画書: [docs/inventory_reorder_and_substitution_plan_20261001.md](file:///Users/takeaki/pharma-oss/docs/inventory_reorder_and_substitution_plan_20261001.md)

---

## 1. 概要と背景

従来の在庫管理・発注ワークベンチ（`/inventory`）は「受付中・調剤中処方で即座に不足する薬品」（`requiredAmount > availableAmount`）のみを対象としていた。
しかし、薬局の現場運用では、仕入先（卸）への発注リードタイム（翌営業日や数日）が存在するため、処方発生時に発注していては当日の調剤待ちや患者の再来局リスクを招く。
また、使用期限が迫っている（切迫・期限切れ）ロットの見落としによる調剤事故リスクや廃棄損、欠品時に代替薬（同効薬・後発品・先発品）をその場で確認・提案できない課題が存在していた。

本対応（トラック G-2）では、**金科玉条第一条（医療安全保護・薬剤師確認）、第二条（患者情報ゼロ・プライバシー保護）、第四条（金額や判断の自動推計・勝手な算出禁止、記録済み値の忠実反映）**を徹底し、発注点（安全在庫）・リードタイム・使用期限切迫評価・院内代替薬候補の統合を完了した。

---

## 2. 実装内容

### 2.1 型およびスキーマの拡張（RxDB `DRUG_SCHEMA` v10）
- **`src/db/types.ts`**:
  - `Drug` インターフェースに `reorderPoint?: number;`（発注点）、`leadTimeDays?: number;`（リードタイム日数）、`targetStock?: number;`（目標適正在庫）を追加。
  - `InventoryExpiryRisk`、`InventorySubstituteCandidate`、`EnhancedInventoryOrderRisk`、`OrderRiskReason` などの型定義を新設。
- **`src/db/schema.ts`**:
  - `DRUG_SCHEMA` のバージョンを 9 から 10 へインクリメント。
  - プロパティに `reorderPoint`、`leadTimeDays`、`targetStock`（いずれも `type: 'number', minimum: 0`）を追加。
- **`src/db/index.ts`**:
  - `drugs` の migrationStrategies に `9: keepDocument` を追加（既存ドキュメントの安全な持ち上げ・完全後方互換）。
- **`src/db/index.test.ts`**:
  - `provides migration strategy for DRUG_SCHEMA v10 preserving existing document` に更新し、v9 ドキュメントの無損失移行を検証。
- **`src/db/schema.test.ts`**:
  - `DRUG_SCHEMA` v10 のバリデーションテストを追加（全 PASS）。

### 2.2 純粋関数モジュール新設 (`src/lib/inventory_reorder_support.ts`)
ロジックの二重実装を排除し、完全決定論的かつ副作用のない純粋関数群を新設：
1. **`evaluateStockLotExpiry`**:
   - 在庫ロット（`drug_stocks`）の使用期限を走査し、期限切れ（当日以前）、至急切迫（60日以内）、注意切迫（180日以内）、最短使用期限を判定。
   - 期限切れ在庫は医療安全原則に従い、実質有効在庫（`effectiveAvailableAmount`）から除外。
2. **`calculateReorderAmounts`**:
   - 処方中必要量、実質有効在庫、発注点、目標在庫から不足量・発注点割れ量・推奨発注量を算出。
3. **`findInStockSubstitutes`**:
   - 厚労省薬価基準収載医薬品コード（YJコード上7桁プレフィックス一致）に基づき、同一成分・同一剤形規格の院内代替薬候補を探索。
   - 院内在庫（`stockQuantity` またはロット合計）がある品目を優先ソート。
4. **`buildEnhancedInventoryOrderRisk`**:
   - 処方不足、発注点割れ、期限切迫、院内代替候補を統合し、`EnhancedInventoryOrderRisk` を構築。
5. **`buildEnhancedInventoryOrderCsv` / `buildEnhancedInventoryOrderMemo`**:
   - **【金科玉条第二条・G-2方針の徹底遵守】**
   - 患者氏名・患者ID・処方箋番号などの個人情報を一切含まず、純粋な医薬品サプライチェーンデータ（優先度、理由、薬品コード、薬品名、棚位置、仕入先、必要量、在庫量、有効在庫、発注点、リードタイム、発注目安、影響件数、期限切迫、最短期限、代替候補数、主な院内代替薬、推奨アクション、棚不足報告）のみで構成。

### 2.3 発注ワークベンチ UI 拡張 (`OrderWorkbench.tsx`, `inventory.css`)
1. **理由別フィルタタブ**:
   - 「すべて (N)」「処方不足 (N)」「発注点割れ (N)」「期限切迫 (N)」のリアルタイム集計とワンクリック切り替え。
2. **候補カードの情報拡充**:
   - 理由タグ（`処方不足`, `発注点割れ`, `期限切迫`, `処方不足+発注点`）
   - 発注点（`発注点: N`）および納品目安（`納品目安: N日`）
   - 使用期限リスク表示（期限切れ発生警告、60日以内至急切迫警告、180日以内注意切迫）
3. **院内代替薬候補のコンパクト表示とアコーディオン展開**:
   - 有効在庫を持つ代替薬をプレビュー表示（`代替薬: ○○ (在庫: N)`）。
   - 展開ボタンで全候補の先発/後発、薬価、棚番地、在庫数量を確認可能。
4. **スタイリング**:
   - インライン `style={{}}` ゼロ。Vanilla CSS（`inventory.css`）とデザイントークン（`var(--primary)`, `var(--border)` 等）で統一。

### 2.4 在庫一覧画面 (`src/app/inventory/page.tsx`, `InventoryRow.tsx`)
1. **発注点（`reorderPoint`）のインライン編集・保存**:
   - 在庫一覧テーブルに「発注点」列を追加。
   - 各薬品行に数値入力フィールド（`.reorder-point-input`）を配備。Enter またはフォーカスアウトで `reorderPoint` を保存し、監査ログ（`stock_update`）を記録。
   - インライン `style={{}}` ゼロを完全遵守。
2. **統合リスク評価への接続**:
   - 発注候補算出を `buildEnhancedInventoryOrderRisk` へ移行し、処方不足・発注点割れ・期限切迫の全品目を網羅。
   - 発注 CSV エクスポートおよびクリップボードメモコピーを個人情報ゼロの拡張版へ刷新。

### 2.5 欠品予測エンジンとの統合 (`src/lib/operational_ai_prediction.ts`)
- `OperationalAiPredictionInventoryRisk` に発注点・期限切迫・代替薬候補フィールドを追加。
- `buildInventoryPrediction` のエビデンス（`evidence`）に「発注点設定」「使用期限リスク」「代替薬候補」を決定論的に反映。

---

## 3. 実地検証結果（honest-verification 準拠）

| 検査項目 | コマンド / 手法 | 結果 | 備考 |
|---|---|---|---|
| **TypeScript 型検査** | `npx tsc --noEmit` | **エラー 0 件** | プロパティ非存在・型不一致 0 件 |
| **ESLint** | `npm run lint` | **エラー 0 件** (0 error, 11 warnings) | 既存の警告のみ、新規エラー 0 件 |
| **Fail-First Mutation 実証** | `inventory_reorder_support.ts` | **実証完了** | `effectiveAvailableAmount` から `expiredQuantity` 控除を変異させてテストが意図通り失敗（1件）することを確認後に復元 |
| **スタイル予算防壁テスト** | `src/components/TerminalSyncPanel.test.ts` | **PASS (5/5)** | プロジェクト全体でインライン `style={{}}` が予算上限 3 を超えていないことを実機検証 |
| **G-2 単体・契約テスト** | `npx tsx --test ...` (5ファイル) | **全 89 件 PASS** | 単体・スキーマ・統合契約すべて成功 |
| **全体テストスイート** | `npm test`（BypassSandbox） | **1,812 件全 PASS** (0 fail, 0 cancelled, 0 skipped) | 全 78 テストスイート完全成功（前回収益から 8 件純増） |
| **本番ビルド** | `npm run build` | **全 28/28 ページ成功** | Turbopack による静的最適化・バンドル完了 |

---

## 4. 仕様確認の出典
- 医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律（薬機法）及び薬局等構造設備規則（医薬品の管理、有効期限管理、安全在庫管理）
- 厚生労働省 保険医療機関等において調剤を行うことができる医薬品（薬価基準収載医薬品コード・YJコード上7桁構造：第1-4桁 薬効分類、第5桁 投与経路・剤形、第6-7桁 成分規格）
- 個人情報の保護に関する法律（個人情報保護法）及び医療・介護関係事業者における個人情報の適切な取扱いのためのガイダンス（発注・サプライチェーンにおける患者個人情報除外の原則）

---

## 5. 未実施・できなかったこと
- 医薬品卸業者受発注システム（JD-NET / EOS / 各卸 Web-EDI 等）との直接 API 通信（実機ネットワーク連携は本アプリケーション外のため、業界標準 CSV エクスポートおよび現場メモ連携、画面ワークベンチ管理での完全実務支援までを実施）。
