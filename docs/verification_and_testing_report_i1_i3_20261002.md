# トラック I-1 / I-3 実装・検証報告書: 画面動作・操作性通し確認および PrintPickingFlow 実描画テスト化

**実施日**: 2026-10-02  
**対象トラック**:
- **トラック I-3**: アクセシビリティとレスポンシブの通し確認（受付→薬歴→印刷→在庫の通しフロー、キーボード操作、768px / 375px / 1280px）
- **トラック I-1**: `PrintPickingFlow.test.ts` の実描画テスト化（ソース文字列 grep から React 実描画・契約テストへの安全昇格）

---

## 1. 実施概要

[計画書](verification_and_testing_plan_i1_i3_20261002.md) に基づき、単一画面にとどまらない患者 1 名の一連フロー（受付 → 薬歴 → 印刷・調剤録 → 在庫管理）における日常操作・アクセシビリティ・レスポンシブ崩れ（横オーバーフロー）の通し検証（トラック I-3）を実施しました。  
併せて、リポジトリ最大のソース文字列テスト（205 match assert / 211 total assert）であった `PrintPickingFlow.test.ts` において、コンポーネントの表示・構造・配線検証を React の `renderToStaticMarkup` による本物のコンポーネント実描画テストへと昇格させ、assert 数を減らすことなく守備力を大幅に強化（211 → 234 assert）しました（トラック I-1）。

---

## 2. トラック I-3: アクセシビリティ・レスポンシブ通し確認実績

自動化スクリプト [`scripts/run_e2e_accessibility_drill.mjs`](file:///Users/takeaki/pharma-oss/scripts/run_e2e_accessibility_drill.mjs) を新設し、Next.js 本番サーバー上で Puppeteer による実機ブラウザ通し検証を実施しました。

### (1) ビューポート別横オーバーフロー検証結果

| 画面 | 1280px (デスクトップ) | 768px (タブレット) | 375px (モバイル・小型端末) | 判定 |
|---|---|---|---|---|
| **処方受付・入力 (`/ocr`)** | `0px` (幅 1280px) | `0px` (幅 768px) | `0px` (幅 375px) | **PASS** |
| **薬歴・SOAP (`/emr`)** | `0px` (幅 1280px) | `0px` (幅 768px) | `0px` (幅 375px) | **PASS** |
| **印刷・調剤録・UKE (`/print/[visitId]`)** | `0px` (幅 1280px) | `0px` (幅 768px) | `0px` (幅 375px) | **PASS** |
| **在庫管理・発注 (`/inventory`)** | `0px` (幅 1280px) | `0px` (幅 768px) | `0px` (幅 375px) | **PASS** |

すべての画面およびすべての幅において、横スクロールはみ出し（`overflowPx`）は **0px** であり、重要操作ボタンの押し出し消失やレイアウト崩壊が完全に解消されていることを実証しました。

### (2) キーボードアクセシビリティ検証結果

- **処方受付 (`/ocr`)**: Tab キーによるフォーカス移動で 6 つの主要対話要素（患者選択リンク、手入力切替ボタン、フォーム入力等）への到達を確認。
- **薬歴 (`/emr`)**: Tab キーによるフォーカス移動で 8 つの主要対話要素（タブバー、SOAPエディタ、プロブレム追加、処方遍歴カード、主操作ボタン等）への到達を確認。
- **印刷画面 (`/print`)**: 公式 UKE ボタン（`data-testid="print-official-uke-button"`）からモーダル（`SingleOfficialUkeModal`）を起動し、Escape キーによる安全なモーダル閉鎖を確認。

### (3) 保存証跡

- 詳細 JSON レポート: [`artifacts/accessibility-e2e-drill/e2e_accessibility_drill_report.json`](file:///Users/takeaki/pharma-oss/artifacts/accessibility-e2e-drill/e2e_accessibility_drill_report.json)
- キャプチャ画像一覧:
  - `e2e_drill_ocr_1280px.png`, `e2e_drill_ocr_768px.png`, `e2e_drill_ocr_375px.png`
  - `e2e_drill_emr_1280px.png`, `e2e_drill_emr_768px.png`, `e2e_drill_emr_375px.png`
  - `e2e_drill_print_1280px.png`, `e2e_drill_print_768px.png`, `e2e_drill_print_375px.png`
  - `e2e_drill_inventory_1280px.png`, `e2e_drill_inventory_768px.png`, `e2e_drill_inventory_375px.png`
  - `e2e_drill_inventory_order_workbench.png`

---

## 3. トラック I-1: `PrintPickingFlow.test.ts` 実描画テスト化実績

「assert 数を減らす方向に流れやすく、テストを弱める事故の危険が最も高い」（`docs/gemini_20260917_implementation_plan.md`）という規約を踏まえ、**assert 数を一切減らさず、実描画アサーションを純増（211 → 234 assert）させる安全昇格**を実施しました。

### (1) 実描画テスト化した主要領域

1. **調剤録の法定記載ブロック ([DispensingRecordPrint.tsx](file:///Users/takeaki/pharma-oss/src/app/print/components/DispensingRecordPrint.tsx))**:
   - `readFileSync(new URL('./components/DispensingRecordPrint.tsx', ...))` を撤廃。
   - `renderToStaticMarkup` により本物の React コンポーネントを描画。
   - 薬剤師法第24条・第25条に基づく法定記載項目（照会日時、処方医と照会方法 `山田 太郎 医師 (電話)`、区分 `後発医薬品変更`、疑義内容、回答結果、担当薬剤師 `鈴木 花子`、患者同意）が HTML テーブル内に正しくレンダリングされることを実地検証。
   - 疑義照会なし（0件）の場合のメッセージ `疑義照会・処方変更なし` の実描画も同時に検証。
2. **公式 UKE 点検・プレビューモーダル ([SingleOfficialUkeModal.tsx](file:///Users/takeaki/pharma-oss/src/app/print/components/SingleOfficialUkeModal.tsx))**:
   - `renderToStaticMarkup` による実描画テストを配備。
   - `data-testid="single-official-uke-modal"`, `data-testid="download-official-cyo-button"`, `RECEIPTY.CYO`, `公式提出仕様 適合確認済み`, 構成レコードチップ（`YK`, `RE`, `GO`）が確実にレンダリングされることを実地検証。
3. **電子処方箋ライフサイクル操作パネル ([ElectronicPrescriptionPrintPanel.tsx](file:///Users/takeaki/pharma-oss/src/app/print/components/ElectronicPrescriptionPrintPanel.tsx))**:
   - `renderToStaticMarkup` による実描画テストを配備。
   - `data-testid="electronic-prescription-lifecycle-panel"`、各操作ボタン（重複投薬確認、調剤結果登録、調剤結果検索、調剤結果変更、調剤結果取消、受付取消）、HPKI署名テキスト、ハッシュ値の実描画を実地検証。

### (2) Fail-First Mutation 実証

- `honest-verification` ルールに基づき、[DispensingRecordPrint.tsx](file:///Users/takeaki/pharma-oss/src/app/print/components/DispensingRecordPrint.tsx) の法定ラベル `疑義照会・処方変更の記録（薬剤師法第24条・第25条）` を `MUTATED_LABEL` に意図的に変異。
- テスト実行結果：
  ```
  ✖ dispensing record renders statutory intervention records block and connects with page data (17.828041ms)
    AssertionError [ERR_ASSERTION]: 法定タイトルが表示されること
  ```
  意図通り 1 件が厳格に fail することを確認後、コードを復元して全件 PASS を確認。

---

## 4. 厳格検証結果一覧

| 検証項目 | コマンド / 手法 | 結果 | 備考 |
|---|---|---|---|
| **TypeScript 型検査** | `npx tsc --noEmit` | **エラー 0 件** | `PrintPickingFlow.test.ts` の型を完全準拠 |
| **ESLint 検査** | `npm run lint` | **エラー 0 件** | 11 warnings（既存警告のみ） |
| **テストスイート** | `npm test` | **1,812 件全 PASS** | 0 fail, 0 cancelled, 0 skipped |
| **スタイル予算** | `TerminalSyncPanel.test.ts` | **5 件全 PASS** | インライン `style={{}}` 予算（上限3）厳守 |
| **Fail-First 実証** | コンポーネント変異テスト | **実証完了** | 意図通り fail することを確認後復元 |
| **Next.js 本番ビルド** | `npm run build` | **全 28/28 ページ成功** | トランスパイル・構文エラー 0 件 |
| **E2E 通し確認ドリル** | `run_e2e_accessibility_drill.mjs` | **全画面 PASS** | 1280/768/375px 横オーバーフロー 0px |
