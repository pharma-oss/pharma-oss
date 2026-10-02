# トラック I-1 / I-3 実装計画書: 画面動作・操作性通し確認と PrintPickingFlow 実描画テスト化

**作成日**: 2026-10-02  
**対象トラック**: 
- **トラック I-3**: アクセシビリティとレスポンシブの通し確認（受付→薬歴→印刷→在庫の通しフロー、キーボード操作、768px / 375px / 1280px）
- **トラック I-1**: `PrintPickingFlow.test.ts` の実描画テスト化（ソース文字列 grep から React 実描画・契約テストへの安全昇格）

---

## 1. ベースライン実測値

| 指標 | 実測値 | 判定基準 |
|---|---|---|
| `npx tsc --noEmit` | **0 件** | エラー 0 件維持 |
| `npm run lint` | **0 errors, 11 warnings** | エラー 0 件、新規警告 0 件 |
| `npm test` | **1,812 件全 PASS** | 回帰 0 件、テスト件数の維持・純増 |
| `PrintPickingFlow.test.ts` readFileSync | **Yes (5 箇所)** | ソース文字列 grep の実描画テスト化 |
| `PrintPickingFlow.test.ts` match/文字列 assert | **205 件** (全 assert: 211 件) | **テストを弱めず、assert 数を減らすことを目的にしない** |
| 全体ソース文字列テスト | **1,761 match asserts / 7,121 total asserts** | 段階的昇格 |
| インライン `style={{}}` 予算 | **3 箇所** (`TerminalSyncPanel.test.ts`) | 上限 3 箇所厳守 |
| レスポンシブ実画面キャプチャ | 過去の画面個別改善キャプチャのみ | 一連フロー（受付→薬歴→印刷→在庫）の通し証跡を新設 |

---

## 2. 要判断事項とその方針

### 判断 1: トラック I-3（アクセシビリティ・通し確認）の検証シナリオと合否基準
- **課題**: 単一画面単位のデザイン改善（I-6 第1段〜第6段）は完了したが、患者 1 名の一連フロー（受付・処方入力 → 薬歴・ピッキング → 印刷・調剤録・UKE → 在庫管理）を通した操作性・キーボード到達性・レスポンシブ崩れの検証が未完。
- **方針**:
  1. 架空の新規患者処方（例: アムロジピン＋メトホルミン）を投入し、以下の 4 画面を一連で巡回する自動検証スクリプト（`scripts/run_e2e_accessibility_drill.mjs`）を構築する。
     - 処方受付 (`/ocr`): 患者選択、処方内容入力・確認、調剤録・薬歴への遷移
     - 薬歴 (`/emr`): 疑義照会・公費確認、SOAP記載、ピッキング完了、調剤完了
     - 印刷・調剤録 (`/print/[visitId]`): 薬剤師確認、調剤録・薬袋・領収証プレビュー、公式UKE出力確認
     - 在庫・発注 (`/inventory`): 在庫一覧での引落確認、発注点割れ・期限切迫リスク・代替薬候補の確認
  2. 各画面において、以下の 3 条件を検証する：
     - **幅 1280px (デスクトップ)**: レイアウト破綻・要素重なり・横オーバーフロー（`overflow-x > 0px`）が 0 であること
     - **幅 768px (タブレット)**: タッチ領域・グリッド再配置・横オーバーフローが 0 であること
     - **幅 375px (モバイル・小型端末)**: 重要操作ボタンの押し出し消失が 0、文字欠落が 0、横オーバーフローが 0 であること
     - **キーボードアクセシビリティ**: 主要な対話要素（ボタン、入力欄、セレクト、タブ）への Tab キーフォーカス到達、Enter/Space での押下、フォーカスリングの可視性を検証
  3. 各画面・各幅・各操作状態のスクリーンショットを `artifacts/` および `.tempmediaStorage` へ自動保存し、客観的証跡とする。

### 判断 2: トラック I-1（`PrintPickingFlow.test.ts` 実描画テスト化）の昇格設計
- **課題**: `docs/gemini_20260917_implementation_plan.md` に明記されている通り、「assert 数を減らす方向に流れやすく、テストを弱める事故の危険が最も高い」。
- **方針**:
  1. **原則**: assert 数を減らさない。テスト対象の防御壁を絶対に下げない。
  2. **分割と昇格**:
     - **表示・レイアウト・要素配線**: `react-dom/server` の `renderToStaticMarkup` を用いて、各コンポーネント（`DispensingRecordPrint`, `ReceiptStatementPrint`, `SingleOfficialUkeModal`, `DrugInfoClaimTools`, パネル群）を本物の React コンポーネントとして描画し、生成された HTML 内に `data-testid`、法定記載項目（例: 薬剤師法第24条・第28条第2項・施行規則第16条第1項第10号の疑義照会欄、公式UKE構成レコード、患者識別マーク、保険公費情報等）が正しく含まれていることを検証する。
     - **算定オプション・監査ログ・ロールバック契約**: `claim_actions.ts` で既にモック DB を用いた契約テスト（`claim_actions.test.ts` 19 テスト / 98 assert）が存在する。画面層（page.tsx / usePrintActions）の委譲確認について、React 実描画またはフック契約テストとして安全に検証する。
     - **電子処方箋ライフサイクル**: `VisitElectronicPrescription` ペイロード構築純粋関数およびライフサイクル判定関数の直接テストを拡充し、実コンポーネント描画と結合する。
  3. `PrintPickingFlow.test.ts` を段階的に実描画テスト（`renderToStaticMarkup`）へ移行し、`readFileSync` の依存を削減する。

---

## 3. 実装・検証ステップ

### ステップ 1: トラック I-3 通し確認 E2E スクリプトの実装と実地検証
1. `scripts/run_e2e_accessibility_drill.mjs` を作成：
   - Next.js 本番サーバー（`next start`）を起動
   - Puppeteer で 1280px / 768px / 375px の 3 ビューポートで受付 → 薬歴 → 印刷 → 在庫を巡回
   - キーボード操作（Tab / Enter）によるフォーカス遷移・主要ボタン操作を実証
   - 各画面の `document.documentElement.scrollWidth <= window.innerWidth`（横スクロールはみ出し 0px）を自動検査
   - キャプチャを保存
2. 実行・証跡取得・レポート化。

### ステップ 2: トラック I-1 `PrintPickingFlow.test.ts` の実描画テスト化
1. 実描画テスト用の共通テストヘルパー・モック環境の整備。
2. `PrintPickingFlow.test.ts` 内のコンポーネント表示・配線テストを `renderToStaticMarkup` による実描画テストへ昇格：
   - 疑義照会・調剤録法定記載ブロックの実描画テスト化
   - 公式 UKE プレビュー・ダウンロードモーダルの実描画テスト化
   - 薬剤師確認パネル・請求点検パネルの実描画テスト化
   - 電子処方箋操作パネル・署名ステータス表示の実描画テスト化
3. assert 数を維持し、Fail-First Mutation を実施してテストが機能していることを証明。
4. `scripts/measure_source_string_tests.ts` を再実行し、ソース文字列依存の減少を確認。

### ステップ 3: 総合検証とドキュメント更新
1. `npx tsc --noEmit` エラー 0 件。
2. `npm run lint` エラー 0 件。
3. `npm test` 全件 PASS。
4. `npm run build` 全 28 ページ成功。
5. `docs/golden_rules_and_roadmap.md` の更新（第Ⅱ部 進捗記録、前提、第Ⅲ部 トラック I-1 / I-3、待ち行列表）。
6. コミット実行（`1 PR = 1 コミット`）。

---

## 4. 報告フォーマット

```markdown
## トラック I-1 / I-3: 画面動作・操作性通し確認および PrintPickingFlow 実描画テスト化 完了報告
- コミット: <hash>
- 変更ファイル: <一覧>
- npx tsc --noEmit: エラー 0 件
- npm run lint: エラー 0 件
- npm test: pass N / fail 0
- ソース文字列テスト測定: PrintPickingFlow.test.ts readFileSync 削減、match assert 移行実績
- 通し確認 E2E 実績: 1280px / 768px / 375px 横オーバーフロー 0px、キーボード操作性
- キャプチャ証跡: artifacts/ に保存した画像一覧
```
