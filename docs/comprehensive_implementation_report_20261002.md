# pharma-oss 総合実装・検証報告書（2026-10-02・改訂版）

## 1. エグゼクティブサマリー

本報告書は、調剤薬局向けオープンソース電子薬歴・レセコン基盤 `pharma-oss` において、2026年9月30日から2026年10月2日にかけて実施された重要トラック群の実装・安全設計・操作性最適化・検証の全成果を客観的事実に基づき取りまとめた公式報告書である。

当初報告書における不正確・過大な記述（ソース文字列テスト残存状況、変異テストの質的差異、欠品予測エンジンへの未接続、レセプト要約の配線状況、法的根拠条文の誤記、および E2E 通しドリルの未完了状態）について、コード・履歴・保存証跡との厳格な照合を行い、不完全だったコードとスクリプトを是正した上で本改訂版を作成した。

### 主要指標の実測値と現状（改訂後）

| 指標 | 開発開始時（ベースライン `df9cd1e`） | 現在地（実測値） | 変化 | 実態と検証状況 |
|---|---|---|---|---|
| **ユニット・契約テスト** | 1,717 件 PASS | **1,822 件 PASS** | **+105 件純増** | 0 fail, 0 cancelled, 0 skipped（全78スイート、約86秒） |
| **TypeScript 型検査** | 0 件 | **0 件** | 維持 | `npx tsc --noEmit`（exit 0）単独実行で確認 |
| **ESLint 静的解析** | 0 件 | **0 件** | 維持 | 警告11件のみ（既存画像最適化・Hook依存） |
| **本番ビルド** | 28/28 ページ成功 | **28/28 ページ成功** | 維持 | `npm run build`（exit 0） |
| **インライン `style={{}}`** | 27 箇所（src 全体） | **3 箇所** | **-24 箇所** | 予算上限3厳守（`TerminalSyncPanel.test.ts` で自動防壁化） |
| **実画面横スクロールはみ出し** | 一部画面 375px で発生 | **主要4画面×3幅で 0px** | **実機実証** | 1280px / 768px / 375px（Puppeteer E2E ドリルで実測） |
| **ソース文字列テスト** | 199 assert（`PrintPickingFlow`） | **202 assert 残存** | **一部移行** | `DispensingRecordPrint.tsx` の個別 readFileSync は撤廃し実描画化（26 assert）。ファイル全体としては 7 箇所の readFileSync と 202 件のソース検査が依然残存（「0件」は誤り） |
| **Fail-First 変異テスト** | 一部トラックで実施 | **トラック別に質的差異あり** | **精査完了** | プロダクションコード変異（C-1, F-2, G-2, I-1）とテスト期待値書き換え（I-6 の一部）が存在したことを明記 |

---

## 2. 指摘事項への事実確認と是正実績

### [P1] I-3 画面動作・通し検証の真の実証と証跡保全
- **当初の不備**:
  - `run_e2e_accessibility_drill.mjs` がゲストデモを起動しないまま `/print/demo-visit-1` を開いたため、「印刷対象の受付が見つかりませんでした」というエラー画面となっていた。
  - 「公式UKE」ボタンが存在しないためモーダル検証が暗黙にスキップされ、キーボード操作失敗やモーダル開閉失敗が合否に反映されていなかった。また、検証失敗時でもスクリプトが exit 0 で終了する終了処理の不備や、モーダル内Tab検査でフォーカスがモーダル内にあるかの確認欠落があった。
  - 画像は記載の14枚ではなく13枚であり、公式UKEモーダルの画像および JSON 内の検証結果が欠落していた。
  - さらに、`SingleOfficialUkeModal.tsx` に Escape キーによる閉鎖リスナーが未実装であった。
  - また、点検用モーダルを開けるようにボタン条件を変更した際、請求エラー（`hasClaimErrors`、アレルギー禁忌等）がある状態でも公式UKEがダウンロードできてしまう重大な出力制限の弱まりが発生していた。
- **実施した是正措置**:
  1. `run_e2e_accessibility_drill.mjs` を抜本改修：
     - ルート画面でデモ開始をクリックし、リダイレクト先 URL から実在する `visitId`（例: `v_demo_muprb3iw`）を確実に取得して `/emr?visitId=...` および `/print/[visitId]` へ遷移。
     - `/print/[visitId]` において「印刷対象の受付が見つかりませんでした」画面が出現していないことを厳格検証。
     - 「公式UKE」ボタン（`data-testid="print-official-uke-button"`）が存在しない場合は即座に例外をスローしてテスト失敗（exit 1）とするよう厳格化。
     - モーダル内の Tab キー検査で `document.activeElement` がモーダルコンテナ（`[data-testid="single-official-uke-modal"]`）内に存在することを厳格検証。
     - 検証失敗（`summary.passed === false`、オーバーフロー・キーボードエラー発生）時に確実に `process.exit(1)` で終了するよう終了処理を厳格化。
  2. `SingleOfficialUkeModal.tsx` に Escape キーイベントリスナー（`useEffect`）を正式実装。
  3. `SingleOfficialUkeModal.tsx` に `hasClaimErrors` および `claimErrorMessages` プロパティを接続。厚労省コード欠落だけでなく、請求前チェックエラー（`patient_allergy_match` 等）が存在する場合はダウンロードボタンを `disabled` にして安全保護し、モーダル内に請求エラー警告アラートを表示。プレビュー自体は確認できつつ、公式提出用 UKE の不正出力・誤請求を水際で阻止（Fail-First 変異テスト実証済み、4/4 PASS）。
  4. E2E ドリルを実行し、以下を実機検証（exit 0）：
     - 全4画面（`/ocr`, `/emr`, `/print/[visitId]`, `/inventory`）× 3幅（1280px, 768px, 375px）で `overflowPx = 0px`。
     - キーボード Tab 到達（`/ocr` 6要素、`/emr` 8要素、モーダル内 4要素すべてモーダル内要素へフォーカス）。
     - 公式 UKE モーダルのクリック起動（`visible = true`、`RECEIPTY.CYO` ヘッダー確認）。
     - Escape キー押下によるモーダル閉鎖（`modalClosed = true`）。
     - 正真正銘 **計 14 枚のスクリーンショット**（`e2e_drill_print_official_uke_modal.png` 含む）および更新された JSON レポート（[`artifacts/accessibility-e2e-drill/e2e_accessibility_drill_report.json`](file:///Users/takeaki/pharma-oss/artifacts/accessibility-e2e-drill/e2e_accessibility_drill_report.json)）を出力・保全。

### [P1] 「ソース文字列テスト0件」の訂正
- **当初の誤記**:
  - 「主要ソース文字列テスト: 0 件（実描画化）」と記載していた。
- **実態と訂正**:
  - `src/app/print/PrintPickingFlow.test.ts` において撤廃されたのは `DispensingRecordPrint.tsx` の個別 `readFileSync` のみである。
  - ファイル先頭には依然として 7 箇所の `readFileSync`（`pageSource`, `typesSource`, `helpersSource`, components ディレクトリ走査, hooks ディレクトリ走査, `emrSource`, `claimSnapshotSource`）が存在する。
  - 総 assert 数 234 件のうち、202 件はソースコード文字列に対するマッチング検査（`assert.match`）であり、React `renderToStaticMarkup` による実描画検査は 26 件（3コンポーネント: `DispensingRecordPrint`, `SingleOfficialUkeModal`, `ElectronicPrescriptionPrintPanel`）である。
  - 「3コンポーネントの実描画テストを追加・一部移行したが、ソース文字列テストは依然として多数残存している」と訂正する。

### [P2] 変異テスト（Mutation）の質的差異の明示
- **当初の過大記述**:
  - 「全トラックでMutation実証」と総括していた。
- **実態と訂正**:
  - トラック C-1（UKEヘッダー・フッター・EOF）、トラック F-2（調剤録法定記載文字列）、トラック G-2（発注点・期限切迫計算）、トラック I-1（調剤録表示文字列）では、プロダクションコードの実装を変異させてテストが失敗することを確認した。
  - 一方、トラック I-6 の EMR（`docs/emr_design_20260930.md:70`）および OCR（`docs/ocr_design_20260930.md:76`）では、テストコード側の期待値文字列に `_MUTATION` を付与しただけであり、実装の破壊検出能力を証明したものではなかった。
  - したがって「全トラックで均一に変異耐性を実証した」という記述を撤回し、プロダクションコードを変異させたトラックと、テスト期待値書き換えにとどまったトラックを明確に区別して記載する。

### [P2] G-2 欠品予測エンジンへのデータパイプライン接続・有効在庫判定・網羅的走査の実装
- **当初の未完状態と不備**:
  - `src/lib/operational_ai_prediction.ts` 側には発注点・使用期限・代替薬候補を受け取る型とロジックが実装されていたが、実際の入力を作る `src/lib/dashboard_tasks.ts` の `calculateDashboardInventoryRisks` はこれらのプロパティを渡しておらず、画面への接続が未完であった。
  - 対象薬の在庫計算において期限判定を行わず `getTotalStock` でロット数量のみを合算していたため、必要量30・在庫100（全量2020年期限切れ）で不足・リスクが0件と判定され、発注ワークベンチ（有効在庫0・処方不足30）と結果が食い違っていた。
  - 代替薬候補の在庫合算でも期限切れロット（例: 2020年期限切れ）を含めて数量合算していたため、期限切れ薬が代替候補として提示されていた。
  - 評価ループが処方の必要量マップ（`requiredByStockDrugId`）のみを走査していたため、処方に登場しない院内医薬品（在庫80・発注点100・期限30日後）がリスク評価から漏れていた。
  - 処方不足がない場合（必要30・在庫80・発注点100）、発注点までの補充量（20）を処方不足量（`shortageAmount`）として設定していたため、AI予測で「不足20」「critical / 95点」と過大判定されていた。
- **実施した是正措置**:
  1. `getEffectiveAvailableStock` を新設し、当日以前の使用期限切れロットを厳格に除外した有効在庫数量（`effectiveAvailable`）を算出。必要量30・在庫100（全量2020年期限切れ）で有効在庫0・処方不足30として検知し、発注ワークベンチと完全に整合（Fail-First 変異テスト実証済み）。
  2. `calculateDashboardStockShortages` において、処方必要量のある薬剤だけでなく、院内全医薬品（`drugMap`）および在庫ロットのある薬剤を網羅的に走査。処方に登場しない薬剤であっても発注点割れ・期限切迫があれば在庫データに抽出されるよう接続（Fail-First 変異テスト実証済み）。
  3. 処方不足量（`shortageAmount`）は純粋に処方不足（`Math.max(0, requiredAmount - effectiveAvailable)`）とし、処方不足がない場合は `shortageAmount = 0` と設定。発注点までの補充量とは明確に分離し、AI予測エビデンス（`必要 30 / 在庫 80 / 不足 0`）およびスコア（warning / 68点）が適正に算出されるよう是正（Fail-First 変異テスト実証済み）。
  4. `src/hooks/useDashboardTasks.ts` において、`db.drugs.find().exec()` および `db.drug_stocks.find().exec()` を取得し、院内全医薬品・全在庫ロットから同一 YJ コードの代替薬候補探索と発注点評価を網羅的に行えるよう接続。
  5. `src/lib/operational_ai_prediction.test.ts` に結合テストを追加し、期限切れ対象薬の処方不足検知、処方にない薬剤の網羅的走査、および処方不足なし時の補充量分離を実証（9/9 PASS、3つの Fail-First 変異テスト実証済み）。

### [P2] F-2 レセプト要約の接続ステータスの是正
- **当初の誇大表現**:
  - `formatReceiptInterventionSummary` による「レセプト統合完了」と記載していた。
- **実態と訂正**:
  - 純粋関数 `formatReceiptInterventionSummary` の実装および単体テスト、未回答疑義の公式事前点検（Readiness Check）までは実装されている。
  - しかし、公式 UKE（`RECEIPTY.CYO`）の電算摘要レコード（CO レコードや SI レコード等）への自動印字配線は未接続である。
  - レセプト摘要欄への自動反映仕様は支払基金の記録条件仕様および算定ルールに基づく要判断事項（AGENTS.md 第十条）であるため、独断で電算出力に配線せず、「要約テキスト生成関数および公式事前点検の追加まで完了、公式UKE摘要レコードへの自動印字配線は未接続（判断待ち）」と訂正する。

### [P2] 調剤録の法的根拠条文の訂正
- **当初の誤記**:
  - 調剤録の法的根拠を「薬剤師法第24条・第25条」と記載していた。また前回の訂正時に施行規則を「第16条第1項第7号」と記載したが、第7号は処方箋の発行年月日であり不正確であった。
- **実態と是正**:
  - 薬剤師法第25条は「調剤された薬剤の表示（容器・被包の表示義務）」であり、調剤録の直接の法的根拠は**薬剤師法第28条第2項、同法施行規則第16条第1項第10号（同令第15条第2号・第3号の準用）**である（第24条は「処方せん中の疑義に対する確認義務」、第15条第2号は医薬品変更内容、第3号は疑義確認内容）。
  - `src/app/print/components/DispensingRecordPrint.tsx` の見出しを「疑義照会・処方変更の記録（薬剤師法第24条・第28条・施行規則第16条第1項第10号）」へ修正。
  - `src/app/print/PrintPickingFlow.test.ts` の期待値を修正し、Fail-First 変異（旧期待値での 1 fail 検知）および復元後の 18/18 PASS を実証。旧報告書（`docs/intervention_structuring_20261001.md:4`）の第25条誤記も含め、ドキュメント内の表記をすべて訂正。

---

## 3. 各トラックの確定実装成果一覧

### トラック D-2: 複数公費消失防止と構造化編集・期限切れ警告表示
- **成果**:
  - 純粋関数モジュール [`src/lib/patient_public_insurance.ts`](file:///Users/takeaki/pharma-oss/src/lib/patient_public_insurance.ts) 新設。法別番号（51, 54, 21, 12, 80等）判定、全角数字サニタイズ、最大4件の配列変換、未編集公費保護マージ。
  - 患者編集モーダル内に最大4件の構造化公費カード（「第1公費」「第2公費」...）の追加・編集・削除 UI を配備。
  - EMR 薬歴バナー、処方受付画面（`/ocr`）、月次ワークベンチ（`ClaimWorkbenchRow`）への公費バッジおよび期限切れ警告バナー・至急優先度昇格を接続。

### トラック I-6: 主要 6 画面の日常操作性・レスポンシブ最適化
- **成果**:
  - ダッシュボード: 患者対応フロー最優先配置、緊急度別タスクバッジ表示。
  - EMR（`/emr`）: 幅 375px モバイルでのアクションバーボタン欠落解消、SOAP フッター縦積み折り返し、処方遍歴カード型美装化。
  - 処方受付（`/ocr`）: 375px でのキャンセルボタンはみ出し解消、用法選択ボタン突き抜け解消。
  - 印刷（`/print`）: ヘッダーボタングリッド化、印刷用紙シミュレーションの短冊潰れ解消（実寸維持＋横スクロール化）。
  - 在庫（`/inventory`）: 375px モバイルでの医薬品名ファースト列配置刷新、発注ワークベンチ 2x2 均等対称グリッド化。
  - 設定（`/settings`）: 375px モバイルでのタブバー横スクロール化、テーブル横スクロール化、共通フォーム 1fr 化。

### トラック C-1: 通常 UKE と公式提出用 UKE の生成経路統合（Step 1〜4）
- **成果**:
  - Step 1: 単票通常・月次通常・月次公式の 3 経路の対照表作成と実測差分テスト（`dispensing_uke_comparison.test.ts`）。
  - Step 2: 補助レコード（SN/JD/MF/ST）共通化（`dispensing_uke_official_supplemental.ts`）と単票公式ビルダー確立（`dispensing_uke_official_single.ts`）。
  - Step 3: 単票画面（`/print/[visitId]`）への公式提出用 UKE（`RECEIPTY.CYO`）プレビュー・ダウンロード機能併設と実務並行検証環境確立（`SingleOfficialUkeModal.tsx`）。
  - Step 4: 本番切替準備と安全な移行設計（通常出力を「点検用旧形式」として位置づけ、監査ログ区分化、客観的廃止判定基準 A・B・C を策定）。
  - 今回の是正: 点検モーダルを開くボタンの `disabled` 条件を `!canExportUke` に整理し、モーダル内のダウンロードボタンを `!officialResult || !!buildError || isExporting` で安全保護。Escape キー閉鎖リスナーを追加。

### トラック C-4: 減免区分・高額療養費の対応点検と UI・事前点検接続
- **成果**:
  - 純粋モジュール [`src/lib/patient_copayment_support.ts`](file:///Users/takeaki/pharma-oss/src/lib/patient_copayment_support.ts) 新設。高額療養費（限度額適用認定証ア〜キ、多数回、別表8）および減免（別表10コード1〜3、割合、金額、証明書番号）の構造化編集フォーム配備。
  - EMR 患者バナー、処方受付画面へのバッジ表示、印刷画面での誤徴収防止ガイダンスバナー配備、月次ワークベンチ公式事前点検（Readiness Check）統合。勝手な自己負担額計算は行わない（第四条遵守）。

### トラック F-2: 疑義照会・処方変更履歴の構造化と調剤録記載
- **成果**:
  - 調剤録（`DispensingRecordPrint.tsx`）に薬剤師法第24条・第28条・施行規則第16条に基づく法定記載欄（`data-testid="record-intervention-box"`）を配備。
  - RxDB `visits` コレクションスキーマ v23 への `interventionEvents` 構造化保存（医療安全データ暗号化・`22: keepDocument`）。
  - EMR 疑義照会モーダルでの照会区分選択・自動サジェスト、未回答疑義の公式事前点検統合。
  - 要約テキスト生成の純粋関数（`formatReceiptInterventionSummary`）配備（公式UKEの電算摘要レコードへの自動印字配線は未接続・判断待ち）。

### トラック G-2: 発注点・リードタイム・期限切迫・代替薬候補の統合
- **成果**:
  - 純粋関数モジュール [`src/lib/inventory_reorder_support.ts`](file:///Users/takeaki/pharma-oss/src/lib/inventory_reorder_support.ts) 新設。処方不足・安全在庫割れ・使用期限切迫（60日/180日以内）統合発注量算出、同一規格・成分（YJコード上7桁一致）院内代替薬候補提示。
  - 発注ワークベンチ（`OrderWorkbench.tsx`）への理由別フィルタ・期限アラート・代替薬アコーディオン配備、在庫テーブルでの「発注点」インライン編集（`stock_update` 監査ログ記録）、`DRUG_SCHEMA` v10（`reorderPoint` 等追加、`9: keepDocument`）。
  - 今回の是正: `calculateDashboardInventoryRisks` から `operational_ai_prediction.ts` への発注点・期限切迫ロット・代替薬候補データの受け渡しパイプラインを正式接続。

### トラック I-3: 画面動作・操作性通し確認とアクセシビリティ検証
- **成果**:
  - `scripts/run_e2e_accessibility_drill.mjs` を抜本改修し、本番 Next.js サーバー上で受付（`/ocr`）→ 薬歴（`/emr`）→ 印刷・調剤録（`/print/[visitId]`）→ 在庫（`/inventory`）の通しフローを実走。
  - 1280px / 768px / 375px の全画面・全幅で `overflowPx = 0px` を実証。
  - キーボード Tab 到達および公式 UKE モーダルの起動・Escape 閉鎖を実証。
  - 全 14 枚のスクリーンショットおよび JSON レポートを保全。

### トラック I-1: `PrintPickingFlow.test.ts` の実描画テスト化（一部移行）
- **成果**:
  - `DispensingRecordPrint.tsx` の個別 `readFileSync` を撤廃し、React `renderToStaticMarkup` による実描画テストへ昇格。法定記載項目および 0 件時表示を検証。
  - `SingleOfficialUkeModal`、`ElectronicPrescriptionPrintPanel` の実描画テストを追加。
  - assert 数を 211 件から 234 件へ純増。ただし、ファイル全体としては 7 箇所の `readFileSync` と 202 件のソース由来 assert が依然として残存している。

### UI 共通基盤: インラインスタイル撤廃と予算自動防壁
- **成果**:
  - `TerminalSyncPanel`（18箇所）および `ClientLayout`（6箇所）の計 24 箇所を Vanilla CSS クラスへ完全移行。
  - `src/` 全体のインライン `style={{}}` を動的 CSS 変数受け渡し 3 箇所のみに整理。
  - `src/components/TerminalSyncPanel.test.ts` に予算上限 3 の自動防壁テストを配備。

### 追加検証指摘（4点）への是正と実機検証（2026-10-02 追加実施）
1. **[P2] 当日期限の在庫判定一致**:
   - **事象**: 判定日 2026-10-02・期限 2026-10-02・必要 30・在庫 100 で、ダッシュボードは有効在庫 100／不足 0、発注ワークベンチは有効在庫 0／不足 30 で食い違い。
   - **是正**: `dashboard_tasks.ts` の `getEffectiveAvailableStock` で `expTime <= nowTime` に統一（当日期限ロットは期限切れとして除外）。代替薬探索も含め `<=` で統一。
   - **Fail-First 実証**: `<=` を `<` に戻した変異テストで `issue 1: same-day expiry evaluates as expired` が FAIL（actual: 100, expected: 0）することを実証。
2. **[P2] 発注推奨量の見込み残在庫ベース統一**:
   - **事象**: 必要 30・在庫 80・発注点 100 でダッシュボードが 20、ワークベンチが 50。また、在庫 120 ではダッシュボードの警告が消失。
   - **是正**: ダッシュボード側の発注点判定および推奨量計算をワークベンチ（`inventory_reorder_support.ts` の `calculateReorderAmounts`）と完全統一。処方分を差し引いた見込み残在庫 `projectedRemaining = effectiveAvailable - requiredAmount` に基づき、残在庫が発注点を下回る場合に発注点割れ（`isBelowReorderPoint = true`）および補充量を算出。在庫 80 で推奨量 50、在庫 120 で警告を保持し補充量 10 と判定。
   - **Fail-First 実証**: 発注点判定を現在庫直接比較に戻した変異テストで `issue 2 extension: warning retained and reorder 10 calculated` が FAIL（actual: false, expected: true）することを実証。
3. **[P2] 棚不足統合時の不足件数・ID更新漏れの解消**:
   - **事象**: 必要 30・在庫 80・発注点 100・棚不足 5 で、リスク行は「不足5／至急」なのに `inventoryShortageCount` が 0、`shortageDrugIds` が空。
   - **是正**: `dashboard_tasks.ts` の棚不足統合ループにおいて、既存リスク品目への追記時にも `if (!shortageDrugIds.has(drugId)) { shortageDrugIds.add(drugId); inventoryShortageCount++; }` を実行するよう修正。
   - **Fail-First 実証**: 既存リスク追記時のカウント更新をスキップした変異テストで `issue 3: picking shortage updates inventoryShortageCount` が FAIL（actual: 0, expected: 1）することを実証。
4. **[P3] ロードマップ品質ゲート表の実測同期**:
   - `docs/golden_rules_and_roadmap.md:195` のユニットテスト実測値を最新の 1,822 件 PASS に同期。

---

## 4. 品質ゲート実測結果（改訂後・再取得）

| 検証項目 | コマンド | 実測結果 | 判定 |
|---|---|---|---|
| **TypeScript 型検査** | `npx tsc --noEmit` | **エラー 0 件**（exit 0） | **合格** |
| **ESLint 静的解析** | `npm run lint` | **エラー 0 件** / 警告 11 件（exit 0） | **合格** |
| **インライン style 予算** | `npx tsx --test src/components/TerminalSyncPanel.test.ts` | **5/5 PASS**（src 全体で上限 3 箇所厳守） | **合格** |
| **ユニット・契約テスト** | `npm test`（BypassSandbox: true） | **全 1,822 件 PASS** / 0 fail / 78 suites（約86秒） | **合格** |
| **本番ビルド検証** | `npm run build` | **全 28/28 ページ成功**（exit 0） | **合格** |
| **実画面通し E2E ドリル** | `node scripts/run_e2e_accessibility_drill.mjs` | **全画面・全幅で overflowPx = 0px**、Tab/Esc 閉鎖、全14枚保存（exit 0） | **合格** |

---

## 5. ロードマップ現在地と次の作業

ロードマップ（[`docs/golden_rules_and_roadmap.md`](file:///Users/takeaki/pharma-oss/docs/golden_rules_and_roadmap.md)）における各トラックの客観的ステータス：

```
【実装完了（実証済み）】
A-5（日数監査）/ B-2（any排除）/ C-4（減免・高額療養費）/ D-2（複数公費）/ G-2（発注点・期限切迫・代替薬・予測接続）/ I-3（E2Eドリル実証）/ I-6（主要6画面レスポンシブ）

【一部完了・残りは判断待ちまたは残存作業あり】
A-3: 点検ワークスペース・what-if レビュー実装済み、算定側の手動指定尊重判断待ち
C-1: ステップ 1〜4 完了・実務並行運用中、旧形式完全削除の条件（A:1ヶ月運用、B:出力0件、C:合意）充足待ち
F-2: 調剤録法定記載・EMR照会区分・公式事前点検・要約生成関数完了、公式UKE摘要レコードへの自動印字配線は判断待ち
I-1: DispensingRecordPrint の実描画化完了、PrintPickingFlow 内の残り 7 箇所の readFileSync 移行は今後の課題
I-2: 運用レビュー CLI status 定義統一済み、証跡保管ルール確定待ち

【判断待ち・現地証跡待ち】
A-1 / A-2 / A-4 / B-1 / C-2 / C-3 / D-1 / E-1 / E-2 / F-1 / F-3 / F-4 / G-1 / H-1 / H-2 / H-3 / H-4 / I-4 / I-5
```

### 次期推奨タスク
1. **トラック A-3: 算定側剤形判定と手動指定の食い違い影響点検**
   - 薬剤師の手動指定（内服/外用）と算定側（`calculator.ts` の `isExternal`）の用法正規表現自動判定が食い違う場合のレセプト点数・請求影響を点検・整理し、安全な救済策や警告方針を提示・検証する。
2. **トラック C-1: 旧形式完全削除の条件確認・準備**
   - 策定された客観的廃止判定基準（条件A: 実機受付確認1ヶ月以上、条件B: 出力0件継続、条件C: 合意）の達成状況を確認し、将来的な完全削除に向けた安全手順を精査する。
