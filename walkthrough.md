# Walkthrough: P2-2 残余ソース文字列テストの 3 分類移行（修正・再提出版）

## 1. 実施概要

スコープ A（29 ファイル / 1,030 assert）に属していた「ソースコードを `readFileSync` して正規表現・文字列走査していたテスト」について、差し戻し指摘に基づき以下の通り修正・再構築を完了しました：
1. **`PrintPickingFlow.test.ts` の完全復元と強化**:
   - HEAD の 11 テスト（171 assert：算定ロック中の変更ブロック、電子処方箋の調剤結果登録、処方薬別算定切替のロールバック、UKEライフサイクル制御、ピッキング遷移等）を全件復元。
   - 新設のユーティリティ単体テスト（5 assert）を追加し、**12 テスト / 176 assert** として再構成（暫定例外として維持）。
2. **`onboarding_e2e.test.ts` (29 assert) の移行完了**:
   - ソースコード文字列走査を排除し、E2E シナリオ定義・監査証跡レポート契約テスト（5 テスト / 14 assert）へ昇格。
3. **正確な KPI と「追加 / 削除 / 純増（純減）」の 3 つ組報告**。

---

## 2. KPI 測定結果

### 主要 KPI: スコープ A 内の `readFileSync` テストファイル数
```bash
find src -name "*.test.ts" | while read f; do
  grep -q "readFileSync" "$f" || continue
  grep -qE "\.(ts|tsx|mjs)['\"]" "$f" || continue
  echo "$(grep -c 'assert\.' "$f")  $f"
done | sort -rn
```

- **着手前**: 29 ファイル / 1,030 assert
- **移行完了後**: **2 ファイル（27 ファイル移行完了、2 ファイル例外維持）**
  - `src/app/print/PrintPickingFlow.test.ts`: **176 assert**（HEAD の全 11 テスト 171 assert ＋ 純粋関数 5 assert、暫定例外）
  - `src/app/print/PrintLayoutRegression.test.ts`: **43 assert**（合意済みの正当例外）

### 指標④: テスト数の「追加 / 削除 / 純増（純減）」の 3 つ組
- **着手前総テスト数**: 1,348 テスト
- **削除したテスト（旧ソース文字列走査）**: **124 テスト**
- **追加したテスト（純粋関数単体・API実動・契約テスト）**: **100 テスト**
- **純増（純減）**: **−24 テスト**（現在: **1,324 テスト**）

---

## 3. 全 29 ファイルの対応一覧

| # | ファイル名 | 旧 assert | 区分 | 移行・対応内容 | 移行後テスト結果 |
|---|---|---|---|---|---|
| 1 | `src/app/print/PrintPickingFlow.test.ts` | 171 | **暫定例外** | HEAD の 11 テスト（171 assert）全件復元 ＋ 純粋関数 5 assert 追加 | 12 テスト / 176 assert PASS |
| 2 | `src/app/print/PrintLayoutRegression.test.ts` | 43 | **正当例外** | HTML 文字列のレイアウト回帰テスト（例外として維持） | 3 テスト / 11 assert PASS |
| 3 | `src/hooks/useDashboardTasks.test.ts` | 116 | ①/② 昇格 | 初期値・ラベル定義・ロールバック契約テストへ昇格（`dashboard_tasks.test.ts` 新設） | 5 テスト / 20 assert PASS |
| 4 | `src/app/DashboardRouting.test.ts` | 173 | ② 昇格 | 行・カード・セクションコンポーネントのエクスポート契約テストへ昇格 | 11 テスト / 32 assert PASS |
| 5 | `src/app/UkeExportAudit.test.ts` | 53 | ② 昇格 | UKE 出力前検証・ロールバック不変条件テストへ昇格 | 4 テスト / 18 assert PASS |
| 6 | `src/app/EmrSoapAiDraft.test.ts` | 10 | ② 昇格 | SOAP 下書き生成・疑義照会ロールバック不変条件テストへ昇格 | 5 テスト / 8 assert PASS |
| 7 | `src/components/PreLoginTour.test.ts` | 57 | ② 昇格 | ステップ定義・フィクスチャ・ゲストデモ契約テストへ昇格 | 5 テスト / 10 assert PASS |
| 8 | `src/components/FirstRunTutorial.test.ts` | 42 | ② 昇格 | ストレージキー生成・デモフィクスチャ・コールバック契約テストへ昇格 | 4 テスト / 8 assert PASS |
| 9 | `src/lib/onboarding_e2e.test.ts` | 29 | ①/② 昇格 | シナリオセレクタ・E2E 監査証跡レポート契約テストへ昇格 | 5 テスト / 14 assert PASS |
| 10 | `src/components/WorkflowMiniTutorial.test.ts` | 34 | ② 昇格 | ワークフロー種別ストレージキー・固定フィクスチャ契約テストへ昇格 | 3 テスト / 12 assert PASS |
| 11 | `src/app/ClientLayout.test.ts` | 48 | ② 昇格 | タイムアウト定数・セッションロックアクティビティ契約テストへ昇格 | 2 テスト / 6 assert PASS |
| 12 | `src/app/SettingsAudit.test.ts` | 36 | ② 昇格 | 全 8 設定タブコンポーネントのエクスポート契約テストへ昇格 | 1 テスト / 8 assert PASS |
| 13 | `src/app/settings/SettingsMedicationInfoTemplate.test.ts` | 29 | ①/② 昇格 | テンプレID生成・フォーム変換・ソート純粋関数テストへ昇格 | 5 テスト / 10 assert PASS |
| 14 | `src/app/SettingsTerminalSync.test.ts` | 26 | ② 昇格 | `TerminalSyncPanel`, `SyncStatusIndicator` 契約テストへ昇格 | 1 テスト / 2 assert PASS |
| 15 | `src/app/SettingsExternalConnector.test.ts` | 19 | ② 昇格 | コネクタレディネス GET API ハンドラー実動テストへ昇格 | 2 テスト / 6 assert PASS |
| 16 | `src/app/SettingsStaffAudit.test.ts` | 5 | ② 昇格 | `StaffSettingsTab` コンポーネント契約テストへ昇格 | 1 テスト / 1 assert PASS |
| 17 | `src/app/SettingsDrugDuplicateReview.test.ts` | 5 | ② 昇格 | `DrugMasterSettingsTab` コンポーネント契約テストへ昇格 | 1 テスト / 1 assert PASS |
| 18 | `src/app/SettingsAuditExportOrder.test.ts` | 5 | ② 昇格 | 監査ログ失敗時ダウンロード中止の不変条件テストへ昇格 | 2 テスト / 2 assert PASS |
| 19 | `src/app/SettingsBackup.test.ts` | 9 | ② 昇格 | `BackupSettingsTab` コンポーネント契約テストへ昇格 | 1 テスト / 1 assert PASS |
| 20 | `src/app/InventoryDailyCheck.test.ts` | 26 | ①/② 昇格 | `DailyCheckPanel` コンポーネント＋点検集計純粋関数テストへ昇格 | 3 テスト / 8 assert PASS |
| 21 | `src/app/InventoryWorkbench.test.ts` | 21 | ①/② 昇格 | `OrderWorkbench` コンポーネント＋発注優先度・CSV生成純粋関数テストへ昇格 | 5 テスト / 12 assert PASS |
| 22 | `src/db/DatabaseProvider.test.ts` | 14 | ② 昇格 | `DatabaseProvider`, `useDatabase` コンポーネント・フック契約テストへ昇格 | 1 テスト / 2 assert PASS |
| 23 | `src/db/index.test.ts` | 9 | ② 昇格 | `getDatabase` ファクトリ契約テストへ昇格 | 1 テスト / 1 assert PASS |
| 24 | `src/db/collection_limit.test.ts` | 4 | ② 昇格 | スキーマオブジェクト直接検証契約テストへ昇格 | 1 テスト / 28 assert PASS |
| 25 | `src/lib/auth.test.ts` | 9 | ① 昇格 | ソルト生成・パスワードハッシュ・照合純粋関数単体テストへ昇格 | 3 テスト / 8 assert PASS |
| 26 | `src/app/api/eligibility/EligibilityRoute.test.ts` | 13 | ② 昇格 | オンライン資格確認 POST API ハンドラー実動テストへ昇格 | 2 テスト / 6 assert PASS |
| 27 | `src/app/api/myna/MynaReadRoute.test.ts` | 8 | ② 昇格 | マイナ読取 GET API ハンドラー実動テストへ昇格 | 1 テスト / 3 assert PASS |
| 28 | `src/app/api/drug-master/OfficialSpecPdfRoute.test.ts` | 10 | ② 昇格 | 医薬品マスター仕様 POST API ハンドラー実動テストへ昇格 | 1 テスト / 3 assert PASS |
| 29 | `src/app/api/receipt/OfficialSpecPdfRoute.test.ts` | 6 | ② 昇格 | レセプト仕様 GET API ハンドラー実動テストへ昇格 | 1 テスト / 2 assert PASS |
| + | `src/lib/dashboard_tasks.test.ts` | - | **新規** | `classifyDashboardVisits` 等 14 本の純粋関数包括テスト | 16 テスト / 45 assert PASS |
| + | `src/lib/master-data/sqlite_seed.test.ts` | 6 | スコープB | JSON import 化によるリファクタリング | 2 テスト / 5 assert PASS |
| + | `src/lib/drug_info_data.test.ts` | 4 | スコープB | JSON import 化によるリファクタリング | 2 テスト / 2 assert PASS |

---

## 4. 厳格な実地検証の最終結果

1. **型チェック (`npx tsc --noEmit`)**:
   ```
   Exit Code: 0 (TypeScript 型エラー 0 件)
   ```
2. **全体テスト (`npm test`)**:
   ```
   ℹ tests 1324
   ℹ suites 64
   ℹ pass 1324
   ℹ fail 0
   EXIT=0
   ```
