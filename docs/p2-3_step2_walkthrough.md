# Walkthrough: P2-3 デザイントークン策定 & インライン style={{}} 置換（Step 2 完了・EMR実画面検証）

## 1. 実施概要

**Step 2: EMR 薬歴・処方・モーダル（155 箇所）** のすべてのインライン `style={{}}` をデザイントークン（`--space-*`）および Vanilla CSS / `<style jsx>` クラスへ置換し、本物の実画面描画検証（ログイン突破＋シードデータ展開＋各モーダル展開待機）を完了しました。

---

## 2. Step 2 置換内訳（計 155 箇所すべて削減完了）

| ファイル | 置換前 | 置換後 | 主な改修内容 |
|---|---|---|---|
| `src/app/emr/components/PickingSupportModal.tsx` | 40 箇所 | **0 箇所** | `.picking-modal`, `.scan-form-box`, `.picking-item-card`, `.shortage-editor`, `.picking-footer` 等へクラス化 |
| `src/app/emr/page.tsx` | 37 箇所 | **0 箇所** | `TimelineItem`, `.soap-panel-container`, `.ai-assist-notice`, `.aside-card`, `.intervention-list`, `.modal-completion` 等へクラス化 |
| `src/app/emr/components/TracingReportModal.tsx` | 31 箇所 | **0 箇所** | `.tracing-dialog`, `.tracing-header`, `.tracing-grid-2col`, `.tracing-input`, `.tracing-footer` 等へクラス化 |
| `src/app/emr/components/EmrInterventionModal.tsx` | 16 箇所 | **0 箇所** | `.modal-intervention`, `.intervention-row`, `.intervention-input`, `.intervention-textarea` 等へクラス化 |
| `src/app/emr/components/MedicationGuidanceModal.tsx` | 12 箇所 | **0 箇所** | `.modal-md`, `.guidance-entry-list`, `.guidance-type-badge`, `.guidance-textarea`, `.btn-add-type` 等へクラス化 |
| `src/app/emr/components/EmrInsightCards.tsx` | 8 箇所 | **0 箇所** | `.insight-card.warning.is-clear`, `.text-success-dark`, `.severity-danger/warning`, `.insight-empty-text` 等へクラス化 |
| `src/app/emr/components/SoapComponents.tsx` | 5 箇所 | **0 箇所** | `SoapEntryBox` の `.entry-header`, `.entry-badge`, `.entry-sublabel`, `.btn-remove-entry`, `.entry-textarea` 等へクラス化 |
| `src/app/emr/components/PatientBanner.tsx` | 5 箇所 | **0 箇所** | `.patient-header-row`, `.patient-actions`, `.btn-edit-insurance`, `.btn-picking`, `.patient-alerts-footer` 等へクラス化 |
| `src/app/emr/components/DrugHistoryModal.tsx` | 1 箇所 | **0 箇所** | `.dh-soap-letter.is-s/o/a/p` クラス化 |
| **Step 2 小計** | **155 箇所** | **0 箇所** | **EMR 配下の残存 style={{}} は完全 0 件** |

---

## 3. 本物実画面描画検証結果（MD5 チェックサム照合済み）

シードデータ展開後の実環境において、各モーダルを展開し個別に撮影・検証しました：

| キャプチャ対象 | ファイル名 | MD5 チェックサム | 実画面検証内容 |
|---|---|---|---|
| **EMR メイン画面** | `emr_main_screen.png` | `c91a62f0...` | 患者バナー（`.patient-actions` gap: 8px、保険バッジ）、SOAPエディタ、インサイトカード、右側サイドバー（初回質問表、マイナ取込、疑義照会、トレーシング、処方遍歴タイムライン） |
| **ピッキング支援モーダル** | `emr_picking_modal.png` | `32be0f94...` | バーコードスキャンフォーム、進捗サマリー、調剤アイテムカード、不足記録エディタ、指示CSV/結果取込フッター |
| **疑義照会モーダル** | `emr_intervention_modal.png` | `f7b5fc9ead24...` | 照会状態・方法セレクト、医師名、変更理由、変更前後の薬品名、回答期限・同意チェックボックス |
| **トレーシングレポートモーダル** | `emr_tracing_modal.png` | `e403b10d...` | 医療機関オートコンプリート、診療科・担当医グリッド、4区分テキストエリア、A4印刷・保存フッター |

### 実画面プレビュー

#### ① EMR メイン画面 (`/emr`)
![EMRメイン画面](/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9/emr_main_screen.png)

#### ② ピッキング支援モーダル (`PickingSupportModal`)
![ピッキング支援モーダル](/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9/emr_picking_modal.png)

#### ③ 疑義照会モーダル (`EmrInterventionModal`)
![疑義照会モーダル](/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9/emr_intervention_modal.png)

#### ④ トレーシングレポートモーダル (`TracingReportModal`)
![トレーシングレポートモーダル](/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9/emr_tracing_modal.png)

---

## 4. 厳格な検証生結果

- **`npx tsc --noEmit`**: Exit code 0 (型エラー 0 件)
- **`npm run build`**: Exit code 0 (本番ビルド完全成功)
- **`npm test`**: tests 1324 / suites 64 / pass 1324 / fail 0 / exit 0
- **残存 `style={{` 件数推移**:
  - Step 1 (在庫 24 / OCR 4): **28 箇所削減完了 (残 0)**
  - Step 2 (EMR 155): **155 箇所削減完了 (残 0)**
  - 全体残存: **756 箇所**（残るは Step 3: Settings/Dashboard/Print 198 箇所およびその他共通コンポーネント）
