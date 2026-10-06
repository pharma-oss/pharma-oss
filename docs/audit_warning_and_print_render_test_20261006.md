# 処方入力監査・調剤区分食い違い警告接続および印刷・帳票・連携コンポーネント全種実描画テスト化 実施報告書（2026-10-06）

## 1. 概要

本報告書は、`pharma-oss` における品質・安全性向上の一環として、2026年10月6日に実施された以下の2つの重要トラックの実装および実地検証の成果をまとめたものである。

1. **トラック A-3（処方入力監査への手動指定調剤区分・算定判定食い違い警告接続）**:
   - 算定ロジックを独断で変更することなく（金科玉条 第十条「頼まれていない安全基盤を独断で変えない」の厳守）、薬剤師の手動指定調剤区分と用法から自動判定される算定区分に食い違いがある場合、処方入力監査（`src/lib/prescription_input_audit.ts`）で検知し、水際で警告を発行する安全保護機構を実装。
2. **トラック I-1（印刷・帳票・連携コンポーネント全種の本物 HTML 実描画テスト化）**:
   - ソースコード文字列検査（`readFileSync`）から脱却し、印刷画面（`/print/[visitId]`）を構成する全 11 コンポーネント（薬情3種、薬袋、調剤明細書、領収証、お薬手帳シール、水剤ラベル、軟膏ラベル、非常時復旧鍵シート、外部調剤機器連携パネル）を React `renderToStaticMarkup` による実描画テストへ昇格。

---

## 2. 主要品質指標の実測値

| 指標 | 前回（2026-10-02 実測） | 今回（2026-10-06 実測） | 変化 | 実態と検証状況 |
|---|---|---|---|---|
| **ユニット・契約テスト** | 1,824 件 PASS | **1,851 件 PASS** | **+27 件純増** | 0 fail, 0 cancelled, 0 skipped（全78スイート、約54秒） |
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

### トラック I-1: 印刷・帳票・連携コンポーネント全種の本物 HTML 実描画テスト化

#### 背景と設計方針
- 印刷画面（`/print/[visitId]`）周辺のテストは、従来ソースコードのテキスト（`.tsx`）を `readFileSync` して文字列の存在を確認する「ソース文字列テスト」が多数を占めていた。
- コンポーネントが実際に React として正しく HTML を出力しているか、条件分岐によって適切な DOM 属性やクラスが付与されるかを保証するため、React `renderToStaticMarkup` による実描画テストへの昇格を進めた。

#### 実装コンポーネントとテスト項目（全 11 コンポーネント網羅）
1. **`DrugInfoItemCard`** ([`src/app/print/DrugInfoItemCard.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/DrugInfoItemCard.test.ts)):
   - 承認済みテンプレート描画（薬品名、先発/後発変更、用法・日数・錠剤シェイプ、PMDAリンク）およびフォールバック・薬価警告の実描画検証。
2. **`DrugInfoClaimTools`** ([`src/app/print/DrugInfoClaimTools.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/DrugInfoClaimTools.test.ts)):
   - 一包化・粉砕・特定薬剤加算・レセ適、`canEditBilling: false` 時の `disabled=""` 属性保護実描画検証。
3. **`DrugInfoPrint`** ([`src/app/print/DrugInfoPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/DrugInfoPrint.test.ts)):
   - 薬情親ドキュメント、フォールバック警告バナー、処方0件案内文の実描画検証。
4. **`MedicineBagPrint`** ([`src/app/print/MedicineBagPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/MedicineBagPrint.test.ts)):
   - 内服薬袋（`internal-bag`）、外用薬袋（`external-bag`）、用法・用法補足、日数、タイミングバッジ、安全ガイダンスの実描画検証。
5. **`ReceiptStatementPrint`** ([`src/app/print/ReceiptStatementPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/ReceiptStatementPrint.test.ts)):
   - 調剤明細書（点数・金額、調剤報酬内訳テーブル、空データ案内、確認欄）の実描画検証。
6. **`ReceiptPrint`** ([`src/app/print/ReceiptPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/ReceiptPrint.test.ts)):
   - 領収証（患者様控、領収金額、費用区分内訳テーブル、領収印枠）の実描画検証。
7. **`MedicineNotebookStickerPrint`** ([`src/app/print/MedicineNotebookStickerPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/MedicineNotebookStickerPrint.test.ts)):
   - お薬手帳シール（Rp、薬品名、日数、用法補足、タイミングバッジ、薬局情報）の実描画検証。
8. **`LiquidLabelSheetPrint`** ([`src/app/print/LiquidLabelSheetPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/LiquidLabelSheetPrint.test.ts)):
   - 水剤ラベルシート（水剤タイトル、全量・1日量・日数グリッド、安全注意文「使用前によく振り、量を確認してください」、空データ時 null）の実描画検証。
9. **`OintmentLabelSheetPrint`** ([`src/app/print/OintmentLabelSheetPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/OintmentLabelSheetPrint.test.ts)):
   - 軟膏ラベルシート（外用タイトル、患部使用注意文、全量、空データ時 null）の実描画検証。
10. **`EmergencyRecoveryKeySheetPrint`** ([`src/app/print/EmergencyRecoveryKeySheetPrint.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/EmergencyRecoveryKeySheetPrint.test.ts)):
    - 非常時暗号鍵復旧シート（未発行時の認証前警告「未認証状態での印刷・金庫保管厳禁」、発行時のFingerprint、PBKDF2-AES-GCM-256、Base64ペイロード、チェックサム）の実描画検証。
11. **`PharmacyDeviceHandoffPanel`** ([`src/app/print/PharmacyDeviceHandoffPanel.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/PharmacyDeviceHandoffPanel.test.ts)):
    - 調剤機器連携パネル（NSIPSゲートウェイ準備、未送信時送信ボタン有効/差替・取消disabled、完了時転送ID・差替/取消ボタン有効）の実描画検証。
12. **統合テスト連携** ([`src/app/print/PrintPickingFlow.test.ts`](file:///Users/takeaki/pharma-oss/src/app/print/PrintPickingFlow.test.ts)):
    - 上記すべてのコンポーネントの実描画テストを統合（全 24 テスト PASS）。

#### テストと Fail-First 実証
- 全コンポーネントにおいてプロダクションコード変異（Mutation）を注入し、テストが即座に FAIL することを確認してから元に戻す習慣を徹底。テストが本物の描画破壊を捕捉できることを実証した。

---

## 4. 型安全とスタイリングの検証結果

### 型チェック（`npx tsc --noEmit`）
- `VisitPharmacyDeviceHandoff` の `status: 'accepted' | 'duplicate' | 'cancelled'` や `connectorKind`, `transferId` 等の厳格な型定義とモックを完全整合させ、`npx tsc --noEmit` exit 0（エラー 0 件）を達成。

### スタイリング規約（Vanilla CSS / インライン style 予算）
- 新規 CSS 直書きを一切行わず、既存の CSS クラス（`drug-info-row`, `yakutai-doc`, `statement-ledger-doc`, `receipt-doc`, `handbook-sticker`, `liquid-label`, `ointment-label`, `emergency-recovery-key-sheet-doc`, `pharmacy-device-handoff-panel` 等）を遵守。
- `TerminalSyncPanel.test.ts` による走査テストにおいて、`src/` 全体のインライン `style={{}}` が予算上限 3 箇所（動的 CSS 変数渡し）以内であることを実測確認（5/5 PASS）。

---

## 5. 次のステップ

1. **Track C-1 UKE 統合の本番移行条件の監視**:
   - 公式運用実績、旧形式出力 0 件、ステークホルダー合意の判定基準の運用準備。
2. **Track F-1 服薬指導テンプレート・フォローアップ計画**:
   - 医療安全と業務効率を両立する指導記録の構造化検討。
3. **Track H-1 WORM 保存先コネクタの拡張検討**:
   - S3 以外の追記専用保存領域のインターフェース設計。
