# 設定画面（/settings）日常操作・レスポンシブ最適化 実施記録（トラック I-6 第6段）

- **実施日**: 2026-10-01
- **対象画面**: 設定・マスタ管理画面（`/settings`）および各設定タブ（`FacilitySettingsTab`, `StaffSettingsTab`, etc.）
- **実施基準**: [黄金律とロードマップ](golden_rules_and_roadmap.md) 第九条（現場が迷わない）、第七条（検証は自分の目で）、`honest-verification`

---

## 1. 改善の背景と目的

ダッシュボード（第1段）、薬歴（第2段）、処方受付（第3段）、印刷（第4段）、在庫発注（第5段）に続き、薬局の日常運用・セットアップの中核を担う設定画面（`/settings`）において、モバイル（375px）およびタブレット（768px）環境での表示崩れ・操作性低下を抜本的に改善する。

---

## 2. 変更前の課題（Before 実測）

1. **タブバー（`.section-tabs`）の過剰な縦占有**:
   - 9 つのタブ（施設基準、外部連携、マスタ更新、薬情テンプレ、バックアップ、公式仕様点検、操作ログ、スタッフ管理、端末同期）が `flex-wrap: wrap` により、幅 375px で 6 行にわたって折り返され、画面の半分以上を占有していた。
2. **スタッフ管理（`StaffSettingsTab`）ヘッダーの縦 1 文字折り返し崩壊**:
   - `.staff-header` に `flex-wrap` や最小幅がなく、右側の「+ スタッフを追加」ボタンに押しつぶされて見出しの幅が極端に縮み、「ス / タ / ッ / フ / ア / カ / ウ / ン / ト ・ パ / ス / キ ー 管 理」と縦 1 文字ずつ折り返されていた。
3. **スタッフ一覧テーブル（`.staff-table`）の画面外押しつぶし**:
   - `.staff-table-wrapper` に `overflow-x: auto` がなく `overflow: hidden` になっていたため、幅 375px で各カラムのテキストが縦書き状に圧縮され視認不能となっていた。
4. **初回セットアップパネル（`.initial-setup-panel`）の不揃い**:
   - アクションボタン群（ステータスバッジ、薬局情報を保存、チェックリストCSV、引き継ぎメモ）が中途半端に折り返され、各ステップのアクションボタンの幅も不揃いだった。
5. **施設基準設定・共通フォーム（`.form-grid`）の狭小 2 列固定**:
   - `.form-grid` が常に 2 列固定だったため、スマートフォン幅で「地域支援・医薬品供給対応体制加算1〜5」などの長文ラベルが不規則に折り返され、入力枠の高さが乱れていた。

---

## 3. 改善内容（After 実装）

1. **タブバーのレスポンシブ最適化**:
   - PC（> 768px）: 2 行で均等・整然と並ぶピルボタングループを維持。
   - タブレット・モバイル（<= 768px）: `overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scroll-snap-type: x mandatory; scrollbar-width: thin;` を適用。スワイプ操作で快適に選択でき、縦領域を一切圧迫しない構成へ刷新。
2. **スタッフ管理タブのヘッダー・テーブル刷新**:
   - `.staff-header`: `flex-wrap: wrap` を付与し、モバイル（<= 640px）では `flex-direction: column; align-items: stretch;` とすることで見出しの全幅視認性を回復。追加ボタンも親指で押しやすい全幅（`min-height: 40px`）化。
   - `.staff-table-wrapper`: `overflow-x: auto; -webkit-overflow-scrolling: touch;` を付与し、`.staff-table` に `min-width: 580px;` を設定。モバイルでもテーブルの各列が崩れず、指でスクロールして確実に確認・操作可能。
3. **初回セットアップパネルの整列・カード化**:
   - 指標カード（完了率、完了、要確認、未完了）をモバイルで 2 × 2 の対称グリッドとし、境界線を統一。
   - アクションボタン群を 2 列均等グリッド化し、ステップ内の操作ボタンも全幅で押しやすく配置。
4. **共通フォーム（`globals.css`）のモバイル 1fr 化**:
   - `.form-grid` に `@media (max-width: 640px) { grid-template-columns: 1fr; gap: 0; }` を適用。スマートフォンでは自然に 1 列となり、長いラベルも一行で綺麗に表示され、入力枠も全幅（`max-width: 100%`）で操作性向上。
   - `.settings-section` のパディングをモバイルで `1.25rem 0.85rem` に最適化。

---

## 4. 実測値比較（Before vs After）

### 施設基準画面（Facility Tab）
| 画面幅 | 項目 | Before 実測値 | After 実測値 | 判定 |
|---|---|---|---|---|
| **375px** | 全体横スクロール overflow | `false` (375px) | `false` (375px) | PASS |
| **375px** | タブバー表示段数 | 6段（過剰占有） | 1段スワイプ（スリム） | 劇的改善 |
| **375px** | 算定コード入力列数 | 2列（文字詰まり） | 1列（全幅・快適） | 劇的改善 |
| **768px** | タブバー表示 | 折り返し混在 | 横スワイプ（整流） | PASS |
| **1280px** | コンテナ最大幅 | 800px（中央配置） | 800px（中央配置） | 維持 |

### スタッフ管理画面（Staff Tab）
| 画面幅 | 項目 | Before 実測値 | After 実測値 | 判定 |
|---|---|---|---|---|
| **375px** | スタッフ見出し幅 | < 100px（縦1文字折り返し） | 297.8px（全幅正常） | 根本解決 |
| **375px** | テーブル表示 | セル潰れ（文字縦書き崩壊） | 580px（横スクロール可） | 根本解決 |
| **375px** | 追加ボタン幅 | 小サイズ | 全幅（min-height: 40px） | 操作性向上 |

---

## 5. Fail-First Mutation 実証（第七条遵守）

| # | 変異注入箇所 | 内容 | 期待される挙動 | 実測結果 | 復元後の結果 |
|---|---|---|---|---|---|
| 1 | `src/app/settings/page.tsx` | `.section-tabs` の `overflow-x: auto` を `overflow-x: hidden` へ変更 | `SettingsResponsiveLayout.test.ts` のタブスクロール検証が FAIL | **FAIL**（1 failed / 4 passed） | **PASS**（5 passed / 0 failed） |

---

## 6. 品質ゲート検証結果

- **TypeScript 型検査 (`npx tsc --noEmit`)**: 0 件エラー
- **ESLint (`npm run lint`)**: 0 error (11 warnings - 既存のみ)
- **フルテストスイート (`npm test`)**: **1,784 件全件 PASS / 0 FAIL**（前回の 1,779 件から +5 件増）
- **本番ビルド (`npm run build`)**: **28 / 28 ページ成功**（全静的・動的ルート正常）
- **インラインスタイル防壁 (`TerminalSyncPanel.test.ts`)**: 3 件上限を完全死守（0 件新規追加）
