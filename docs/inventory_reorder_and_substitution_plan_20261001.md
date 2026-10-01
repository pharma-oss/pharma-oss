# トラック G-2 実装計画書: 発注点・リードタイム・期限切迫・代替薬候補の統合

対象コミット: `631afb2`（`main`、作業ツリーはクリーン）
計画作成日: 2026-10-01

## 0. ベースライン実測値（作業起点）

| 検証項目 | コマンド | 実測結果 |
|---|---|---|
| 型検査 | `npx tsc --noEmit` | **エラー 0 件** |
| Lint | `npm run lint` | **error 0 / warning 11**（既存警告のみ） |
| テスト | `npm test`（BypassSandbox） | **1,804 pass / 0 fail / 78 suites** |
| ビルド | `npm run build` | **成功（全 28/28 ページ生成）** |

---

## 1. 背景と課題

現行の発注ワークベンチ（`/inventory`、`src/lib/inventory_order.ts`）は、**「受付中・調剤中処方で即座に不足する薬品」**（`requiredAmount > availableAmount`）のみを対象としている。
しかし、調剤薬局の実務運用においては以下の重大な運用課題が存在する：

1. **発注点（安全在庫水準）割れの未検知**:
   - 処方が入ってから発注するのでは、仕入先からの配送リードタイム（翌日または数日）があるため、当日の調剤待ちや患者の再来局リスクを招く。
   - 規定の発注点（安全在庫）を下回った段階で計画的に発注できる仕組みが必要。
2. **使用期限切迫ロットの見落とし**:
   - ロット管理（`drug_stocks`）で使用期限（`expirationDate`）を記録しているが、発注ワークベンチに期限切迫（60日〜180日以内）や期限切れの情報が集約されていない。
   - 期限切れの薬剤を誤って有効在庫と見なして調剤・欠品を引き起こしたり、廃棄損を招くリスクがある。
3. **欠品時の院内代替薬候補の即時確認導線欠落**:
   - 欠品や不足が発生した際、同効薬・後発品・先発品などの代替薬候補（YJコード上7桁一致）をその場で確認できず、別画面やマスタ検索を手動で行う必要がある。
   - 処方医への疑義照会（トラック F-2 で整備した `interventionEvents`）との連動も不十分。
4. **患者プライバシー保護の徹底（金科玉条第二条・G-2方針）**:
   - 発注 CSV や入庫確認 CSV、クリップボードメモには患者氏名・ID・処方箋番号などの個人情報を絶対に含めず、純粋な医薬品サプライチェーンデータのみで構成する規約を維持する。

---

## 2. 設計方針とアーキテクチャ

### 2.1 純粋関数モジュール新設 (`src/lib/inventory_reorder_support.ts`)
ロジックの二重実装を排除し、テスト可能で副作用のない純粋関数として以下を実装する：

1. **`calculateReorderShortage`**:
   - 在庫量、処理中必要量、発注点（`reorderPoint`）、リードタイム係数、期限切れ数量を考慮し、推奨発注量を算出する。
   - `recommendedOrderAmount = Math.max(0, shortageAmount, reorderPoint - availableAmount)`
2. **`evaluateStockLotExpiry`**:
   - ロット一覧（`drug_stocks`）から最短使用期限、期限切れロット数量、切迫ロット（60日以内/180日以内）数量を判定。
   - 期限切れロットは実質有効在庫から安全に除外。
3. **`findInStockSubstitutes`**:
   - 欠品薬品と同一成分・規格（YJコード上7桁一致、同一剤形区分）の代替薬候補を、院内マスタおよび実在庫ロットから探索。
   - 院内在庫を持つ代替薬を優先してリストアップ。
4. **`buildEnhancedInventoryOrderRisk`**:
   - 処方不足・発注点割れ・期限切迫・代替薬候補を統合した拡張リスク構造体を生成。
5. **CSV / メモ出力の拡張**:
   - 個人情報ゼロを維持したまま、「発注点」「切迫ロット情報」「代替候補数」を CSV / メモに安全に出力。

### 2.2 スキーマ拡張の検討（RxDB `drugs` コレクション v10）
- `src/db/types.ts`:
  - `Drug` に `reorderPoint?: number;`（発注点）、`leadTimeDays?: number;`（リードタイム日数）、`targetStock?: number;`（目標在庫）を追加。
- `src/db/schema.ts`:
  - `DRUG_SCHEMA` のバージョンを 9 から 10 へインクリメント。
  - プロパティに `reorderPoint`、`leadTimeDays`、`targetStock`（いずれも `type: 'number'`）を追加。
- `src/db/index.ts`:
  - `drugs` の migrationStrategies に `9: keepDocument` を追加（無停止・完全後方互換）。

### 2.3 画面（`/inventory`、`OrderWorkbench.tsx`）への接続
1. **発注ワークベンチの候補抽出条件拡張**:
   - 「処方不足」だけでなく「発注点割れ（`availableStock <= reorderPoint`）」および「期限切迫リスク」の薬品も候補に含める（フィルタ切替可能：すべて／処方不足／発注点割れ／期限切迫）。
2. **候補カード・一覧の表示拡張**:
   - 発注点・期限切迫バッジの表示。
   - 代替薬候補アコーディオンまたはチップ表示（院内在庫数付き）。
   - 代替薬がある場合「疑義照会を開く（EMRへ連携）」導線の提供。
3. **在庫一覧（`InventoryRow.tsx`）での発注点表示・編集**:
   - 在庫一覧行で薬品の発注点（`reorderPoint`）を視認・設定可能にする。

### 2.4 `operational_ai_prediction.ts` との接続
- `buildInventoryPrediction` において、発注点割れおよび期限切迫による欠品予測スコアとエビデンス（発注点、切迫数量、代替薬の有無）を生成。

---

## 3. 要判断事項（設計上の決定）

| # | 項目 | 検討内容 | 決定方針 |
|---|---|---|---|
| 1 | **発注点のデフォルト値** | 発注点が未設定の薬品の扱い | デフォルトは「未設定（処方不足のみ発注）」。ハイリスク薬や特定保管薬のみデフォルト安全日数を考慮可能とし、勝手な自動算出は行わない（金科玉条第四条遵守）。 |
| 2 | **期限切迫の判定基準日数** | 何日前から切迫とするか | `EXPIRY_URGENT_DAYS = 60`（2ヶ月以内：至急）、`EXPIRY_ATTENTION_DAYS = 180`（6ヶ月以内：注意、既存の `dead_stock.ts` と統一）。 |
| 3 | **発注候補の初期表示** | 発注点割れの薬品が大量にある場合の見やすさ | 優先度順（至急＝処方不足・期限切れ／注意＝発注点割れ・期限切迫）でソートし、タブやフィルタ（すべて／処方不足／発注点割れ）で容易に絞り込めるようにする。 |
| 4 | **代替薬の探索範囲** | マスタ全件か、院内採用薬のみか | YJコード上7桁（同一成分・同一剤形）で院内在庫（`stockQuantity > 0` またはロットあり）を持つ薬品を最優先とし、次いで院内マスタ登録薬品を提示。 |

---

## 4. PR 分割計画（1 PR = 1 コミット）

### PR-G2-1: 純粋関数・型・スキーマ拡張
- **作業内容**:
  - `src/db/types.ts`: `Drug` に `reorderPoint?: number;`、`leadTimeDays?: number;`、`targetStock?: number;` を追加。拡張リスク型 `EnhancedInventoryOrderRisk` の定義。
  - `src/db/schema.ts`: `DRUG_SCHEMA` を v10 へインクリメント、プロパティ追加。
  - `src/db/index.ts`: `drugs` migrationStrategy に `9: keepDocument` 追加。
  - `src/lib/inventory_reorder_support.ts` 新設（発注点計算、期限切迫判定、代替薬探索、CSV/メモ拡張）。
  - 単体テスト `src/lib/inventory_reorder_support.test.ts` 新設。
  - `src/db/schema.test.ts` 更新。
- **実地検証**:
  - `npx tsc --noEmit` エラー 0 件。
  - 単体テスト全 PASS。
  - fail-first mutation 実証。

### PR-G2-2: 発注ワークベンチ UI・代替薬表示・発注点設定の接続
- **作業内容**:
  - `src/app/inventory/components/OrderWorkbench.tsx`:
    - フィルタ切替（すべて／処方不足／発注点割れ／期限切迫）の追加。
    - 発注点バッジ、期限切迫バッジ（最短期限・切迫数量）の表示。
    - 院内代替薬候補のチップ表示（院内在庫数付き）。
  - `src/app/inventory/page.tsx`:
    - `inventory_reorder_support` による候補算出の接続。
    - CSV 出力・メモコピーの拡張（個人情報ゼロ維持）。
  - `src/app/inventory/components/InventoryRow.tsx`:
    - 発注点の表示・編集機能。
  - 契約テスト `src/app/InventoryWorkbench.test.ts` 等の拡張。
- **実地検証**:
  - `npx tsc --noEmit` エラー 0 件。
  - `npm run lint` エラー 0 件。
  - UI レンダリングおよびテスト全 PASS。

### PR-G2-3: 欠品予測（`operational_ai_prediction.ts`）接続・統合回帰・ドキュメント更新
- **作業内容**:
  - `src/lib/operational_ai_prediction.ts`: 発注点割れ・期限切迫・代替薬有無を考慮した欠品予測エビデンス拡張。
  - `src/lib/operational_ai_prediction.test.ts`: 予測拡張のテスト追加。
  - 全体テスト（`npm test`）1,804件超全 PASS。
  - 本番ビルド（`npm run build`）成功。
  - ドキュメント更新（`docs/golden_rules_and_roadmap.md`、完了報告書 `docs/inventory_reorder_and_substitution_20261001.md`）。
- **実地検証**:
  - 全 28 ページビルド確認。
  - ドキュメント整合性確認。

---

## 5. 報告フォーマット（コミット後提示用）

```markdown
## トラック G-2: 発注点・リードタイム・期限切迫・代替薬候補の実装
- コミット: <hash>
- 変更ファイル: <一覧>
- npx tsc --noEmit: エラー 0 件
- npm run lint: error 0 / warning 11
- npm test: pass N / fail 0
- mutation 実測:
  | # | 変異箇所 | 変異内容 | 実測 fail 数 | 戻した後 |
  | 1 | `inventory_reorder_support.ts` | 発注点計算のロジック変異 | 1 件 fail | pass 復元確認 |
- 仕様確認の出典:
  - 薬事法・薬局開設許可基準（医薬品の適正管理、安全在庫・使用期限管理）
  - 厚労省 薬価基準収載医薬品コード（YJコード上7桁による同一成分・規格判定）
- 未実施・できなかったこと: 実卸受発注EDI（JD-NET/EOS等）との実機通信（今回はCSVエクスポート・メモ連携およびワークベンチ管理まで）
```
