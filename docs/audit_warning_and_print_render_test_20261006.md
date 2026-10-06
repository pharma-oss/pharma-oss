# 処方入力監査・調剤区分食い違い警告接続および印刷・帳票コンポーネント群実描画テスト化 実施報告書（2026-10-06）

## 1. 概要

本報告書は、`pharma-oss` における品質・安全性向上の一環として、2026年10月6日に実施された以下の2つの重要トラックの実装および実地検証の成果をまとめたものである。

1. **トラック A-3（処方入力監査への手動指定調剤区分・算定判定食い違い警告接続）**:
   - 算定ロジックを独断で変更することなく（金科玉条 第十条「頼まれていない安全基盤を独断で変えない」の厳守）、薬剤師の手動指定調剤区分と用法から自動判定される算定区分に食い違いがある場合、処方入力監査（`src/lib/prescription_input_audit.ts`）で検知し、水際で警告を発行する安全保護機構を実装。
2. **トラック I-1（印刷・帳票コンポーネント群の本物 HTML 実描画テスト化）**:
   - ソースコード文字列検査（`readFileSync`）から脱却し、患者・家族に交付される主要印刷帳票群（薬情、薬袋、調剤明細書、領収証、お薬手帳シール）の計 7 コンポーネントを React `renderToStaticMarkup` による実描画テストへ昇格。

---

## 2. 主要品質指標の実測値

| 指標 | 前回（2026-10-02 実測） | 今回（2026-10-06 実測） | 変化 | 実態と検証状況 |
|---|---|---|---|---|
| **ユニット・契約テスト** | 1,824 件 PASS | **1,841 件 PASS** | **+17 件純増** | 0 fail, 0 cancelled, 0 skipped（全78スイート、約54秒） |
| **TypeScript 型検査** | 0 件 | **0 件** | 維持 | `npx tsc --noEmit`（exit 0）単独実行で確認 |
| **本番ビルド** | 28/28 ページ成功 | **28/28 ページ成功** | 維持 | `npm run build`（exit 0）全28ページ生成 |
| **インライン `style={{}}`** | 3 箇所 | **3 箇所** | 維持 | 予算上限3厳守（`TerminalSyncPanel.test.ts` 5/5 PASS） |

---

## 3. 実装詳細

### トラック A-3: 手動調剤区分・算定判定食い違い警告接続

#### 背景と設計方針
- `calculator.ts` の `resolveCalculationDosageFlags` は既定で `legacy` モードを採用しており、用法テキストから正規表現で内服・外用・屯服を判定する。
- 薬剤師が処方入力時に手動で調剤区分（例: `internal`）を指定していても、用法に「点眼」「塗布」等の外用文言が含まれている場合、算定側では外用調製料として計算され、帳票（手動指定尊重）と算定（用法の語彙優先）で食い違いが発生する潜在リスクがあった。
- 算定側の挙動を手動指定尊重に独断で書き換えると**請求点数が変わる**ため、第十条の通り要判断事項として残し、点数計算を変更せず、**処方入力監査（`src/lib/prescription_input_audit.ts`）で警告 `dosage_category_calculation_conflict` を表面化**するアプローチを採用した。

#### 実装コード
- [`src/lib/prescription_input_audit.ts`](file:///Users/takeaki/pharma-oss/src/lib/prescription_input_audit.ts):
  - 薬剤師が手動で調剤区分を指定（`manualDosageCategorySpecified === true`）している場合のみ検証を実行。
  - `legacy` モードでの算定判定結果を取得し、手動区分が内服（`internal`）であるにもかかわらず算定上外用判定（`isExternal === true`）または屯服判定（`isTonpuku === true`）となる場合、警告を発行。
  - 警告コード: `dosage_category_calculation_conflict`
  - 重大度: `warning`
  - メッセージ: 「手動指定された調剤区分（内服）と用法の算定判定（外用/屯服）が食い違っています。算定内容と調剤区分を確認してください。」

#### テストと Fail-First 実証
- [`src/lib/prescription_input_audit.test.ts`](file:///Users/takeaki/pharma-oss/src/lib/prescription_input_audit.test.ts):
  1. 手動内服指定 × 点眼用法の食い違い検知（PASS）
  2. 手動内服指定 × 屯服用法の食い違い検知（PASS）
  3. 手動内服指定 × 通常内服用法での非検出（PASS）
  4. 自動判定（manual指定なし）時の非検出（PASS）
  - **Fail-First 実証**: 監査ロジック内の判定条件を変異させた際にテストが赤（失敗）になることを実証完了。

---

### トラック I-1: 印刷・帳票コンポーネント群の本物 HTML 実描画テスト化

#### 背景と設計方針
- 印刷画面（`/print/[visitId]`）周辺のテストは、従来ソースコードのテキスト（`.tsx`）を `readFileSync` して文字列の存在を確認する「ソース文字列テスト」が多数を占めていた。
- コンポーネントが実際に React として正しく HTML を出力しているか、条件分岐によって適切な DOM 属性やクラスが付与されるかを保証するため、React `renderToStaticMarkup` による実描画テストへの昇格を進めた。

#### 実装コンポーネントとテスト項目
1. **`DrugInfoItemCard`** ([`src/app/print/DrugInfoItemCard.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/DrugInfoItemCard.test.ts)):
   - **承認済みテンプレート描画**: 調剤薬品名、先発/後発変更注記（処方薬品名）、用法・日数・錠剤外観シェイプ（`drug-shape tablet`）、服用タイミングバッジ、副作用・注意事項、参照版日、PMDA公式検索リンクの実描画検証。
   - **フォールバック & 薬価警告描画**: `source: 'safe_fallback'` 時の注意文案内、参照版日の非表示、薬価改定警告テキストおよびセレクトボックス（`drug-price-revision-select`）の実描画検証。
2. **`DrugInfoClaimTools`** ([`src/app/print/DrugInfoClaimTools.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/DrugInfoClaimTools.test.ts)):
   - **請求ツール実描画**: 一包化、粉砕、調製、薬管、特定薬剤加算（ハイリスク薬加算1等）、レセプト特記事項入力欄の実描画検証。
   - **権限保護実描画**: `canEditBilling: false` 時に各チェックボックス・入力欄に `disabled=""` 属性が確実に付与されることの実描画検証。
3. **`DrugInfoPrint`** ([`src/app/print/DrugInfoPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/DrugInfoPrint.test.ts)):
   - **親ドキュメント実描画**: 薬情タイトル、患者名、交付日、保険薬局情報（名称・所在地・電話・登録番号・調剤薬局コード）、承認済み薬情カードの統合描画検証。
   - **フォールバック警告バナー**: `medicationInfoFallbackCount > 0` 時に「一部の医薬品で薬局確認済み情報が未登録のため...」の警告バナー（`medication-info-fallback-banner`）が確実に出力されることの実描画検証。
   - **処方 0 件時の案内文**: 処方データが存在しない場合のメッセージ表示検証。
4. **`MedicineBagPrint`** ([`src/app/print/MedicineBagPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/MedicineBagPrint.test.ts)):
   - **内服薬袋実描画**: `internal-bag` クラス、内服薬ラベル、受付番号、調剤日、患者名、用法・用法補足（（起床時血圧測定後に服用））、日数（14日分）、タイミングバッジ（朝食後）、調剤薬名、安全ガイダンス（氏名・使い方・日数、子どもの手の届かない場所）、薬局情報の検証。
   - **外用薬袋実描画**: `external-bag` クラス、外用薬ラベル、外用薬品名、用法の検証。
5. **`ReceiptStatementPrint`** ([`src/app/print/ReceiptStatementPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/ReceiptStatementPrint.test.ts)):
   - **調剤明細書実描画**: 受付番号、患者名、患者番号、生年月日、処方元医療機関・処方医、保険者番号・負担割合（30%）、合計点数（83 点）、保険診療総額（¥830）、保険者負担額（¥580）、患者負担金額（¥250）、調剤報酬内訳テーブル（調剤基本料1、薬剤調製料、薬剤料、レセ電算コード）、薬局情報、確認印枠の検証。
   - **空データ時実描画**: 算定項目 0 件時の「データがありません」メッセージ表示検証。
6. **`ReceiptPrint`** ([`src/app/print/ReceiptPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/ReceiptPrint.test.ts)):
   - **領収証実描画**: 患者様控、受付番号、発行日、領収証タイトル、患者名、領収金額（¥250）、保険調剤一部負担金領収文言、総点数（83 点）、保険診療総額、保険者負担額、患者負担割合、費用内訳テーブル（調剤基本料 45点、薬剤料 14点等）、薬局情報、領収印枠の検証。
7. **`MedicineNotebookStickerPrint`** ([`src/app/print/MedicineNotebookStickerPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/MedicineNotebookStickerPrint.test.ts)):
   - **手帳シール実描画**: 患者名、調剤日、Rp番号、調剤薬品名、日数（14日分）、用法・用法補足（（起床時血圧測定後に服用））、タイミングバッジ、薬局名、TEL、担当薬剤師の検証。
8. **統合テスト連携** ([`src/app/print/PrintPickingFlow.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/PrintPickingFlow.test.ts)):
   - `PrintPickingFlow.test.ts` に上記すべての帳票コンポーネントの実描画テストを統合（全 22 テスト中、実描画アサーションが大幅に拡充）。

#### テストと Fail-First 実証
- **Fail-First 実証**:
  - `DrugInfoPrint.tsx`: フォールバックバナー表示条件を変異させ、テストが即座に FAIL することを確認。
  - `MedicineBagPrint.tsx`: クラス名を `broken-bag` に変異させ、テストが FAIL することを確認。
  - `ReceiptStatementPrint.tsx`: `data-testid` を `broken-statement-doc` に変異させ、テストが FAIL することを確認。
  - `ReceiptPrint.tsx`: `data-testid` を `broken-receipt-doc` に変異させ、テストが FAIL することを確認。
  - `MedicineNotebookStickerPrint.tsx`: `data-testid` を `broken-sticker-doc` に変異させ、テストが FAIL することを確認。
- 各コンポーネントが描画破壊を確実に捕捉できることを実証した。

---

## 4. 型安全とスタイリングの検証結果

### 型チェック（`npx tsc --noEmit`）
- 本格的な実描画テストの記述に伴い、型定義の不整合（`MedicationInfoPrintContent.source` の型 `'approved_template' | 'safe_fallback'`、`DrugPriceRevisionChoice` の `isAutoSelected` プロパティ、`PharmacyInfo` の `code` / `registrationNumber` 必須契約）が露呈。
- これらを正確にモック・型付けし、`npx tsc --noEmit` exit 0（エラー 0 件）を達成。

### スタイリング規約（Vanilla CSS / インライン style 予算）
- 新規 CSS 直書きを一切行わず、既存の CSS クラス（`drug-info-row`, `drug-info-card`, `medication-info-fallback-banner`, `yakutai-doc`, `statement-ledger-doc`, `receipt-doc`, `handbook-sticker` 等）と Vanilla CSS ルールを遵守。
- `TerminalSyncPanel.test.ts` によるインラインスタイル走査テストにおいて、`src/` 全体のインライン `style={{}}` が予算上限 3 箇所（動的 CSS 変数渡し）以内であることを実測確認（5/5 PASS）。

---

## 5. 次のステップ

1. **Track I-1 残存ソース文字列テストの更なる縮小**:
   - `PrintPickingFlow.test.ts` 内に残存する `readFileSync` によるソースコード文字列検査のうち、未移行の補助パネル（`PharmacyDeviceHandoffPanel`, `LiquidLabelSheetPrint`, `OintmentLabelSheetPrint`, `EmergencyRecoveryKeySheetPrint` 等）の実描画化を進める。
2. **Track C-1 UKE 統合の本番移行条件の監視**:
   - 公式運用実績、旧形式出力 0 件、ステークホルダー合意の判定基準の運用準備。
3. **Track F-1 服薬指導テンプレート・フォローアップ計画**:
   - 医療安全と業務効率を両立する指導記録の構造化検討。
