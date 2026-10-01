# トラック F-2：疑義照会・処方変更履歴の構造化（調剤録・レセプト摘要欄への自動反映）報告書

## 1. 概要と背景
薬剤師法第24条（疑義がある処方せんの調剤禁止）および第25条（調剤録の作成・記入・保存義務）において、処方せん中の疑わしい点について処方医に疑義照会を行い、処方変更や指示を受けた場合、以下の事項を調剤録およびレセプトに正確に記録することが法律・保険調剤規則上の必須義務とされています。

- **照会日時**（何月何日何時何分）
- **照会先**（医療機関・処方医氏名および照会方法: 電話・FAX・対面等）
- **疑義の内容**（照会理由、変更前の薬剤名・用法用量・日数）
- **医師の回答結果**（同意・変更内容・指示事項、回答日時）
- **患者の同意確認**（後発品変更や残薬調整等における同意）
- **対応薬剤師氏名**

従来の Pharma-OSS では、`interventions` コレクションにフリーテキスト主体の疑義照会レコードが存在していたものの、以下の課題がありました。
1. **調剤録帳票への未反映**: 印刷画面の調剤録（`DispensingRecordPrint.tsx`）に疑義照会記録欄が存在せず、法定調剤録としての要件を満たしていなかった。
2. **照会区分の非構造化**: 後発品変更、残薬調整、用法用量変更、重複相互作用、処方中止等の区分が体系化されておらず、レセプト摘要欄への定型要約転記が不十分だった。
3. **データ配置の分離**: 訪問データ（`visits`）と疑義照会が別コレクションに分かれており、受付データ単体での保全・スナップショット性が弱かった。
4. **事前点検の未接続**: 医師への照会が「照会中（未回答）」のまま調剤完了・レセプト提出へ進んでしまうリスクに対する事前点検（Readiness Check）が存在しなかった。

本改修では、コレクションを増やさず `visits.interventionEvents` として履歴イベントを構造化し、調剤録への法定記載欄の配備、EMRでの照会区分選択・自動サジェスト、およびレセプト摘要欄・月次公式事前点検への全導線を確立しました。

---

## 2. 実施した改修内容

### 2.1 データモデルの構造化（コレクションを増やさない設計方針）
- **`src/db/types.ts`**:
  - `InterventionCategory` 型を新設: `'generic_change' | 'leftover_adjustment' | 'dosage_change' | 'interaction_inquiry' | 'discontinuation' | 'other'`
  - `VisitInterventionEvent` インターフェースを定義。
  - `Visit` インターフェースに `interventionEvents?: VisitInterventionEvent[];` を追加。
- **`src/db/schema.ts`**:
  - `VISIT_SCHEMA` のバージョンを 22 から 23 にインクリメント。
  - `interventionEvents` 配列プロパティを追加し、医療安全データ保護のため `encrypted` 配列に登録。
- **`src/db/index.ts`**:
  - バージョン 22 から 23 へのマイグレーション戦略（`22: keepDocument`）を追加し、既存データの安全性を確保。

### 2.2 純粋関数モジュール `src/lib/prescription_intervention_support.ts`
- **カテゴリ自動サジェスト (`suggestInterventionCategory`)**:
  - 理由テキストや薬品名から初期サジェストを提供（第四条遵守: 勝手な自動推計ではなく、UI初期値にとどめ人間が選択・修正）。
- **データ正規化 (`normalizeVisitInterventionEvents`)**:
  - `visit.interventionEvents` を最優先とし、未移行のレガシー `interventions` からも安全にフォールバック変換（後方互換性100%）。
- **調剤録フォーマット (`formatDispensingRecordInterventions`)**:
  - 法定記載項目（照会日時、処方医・照会方法、照会区分、疑義内容・変更前、回答結果・変更後、患者同意、担当薬剤師、ステータス）をテーブル行形式に整形。
- **レセプト摘要要約 (`formatReceiptInterventionSummary`)**:
  - 審査支払機関の慣行に合致した標準的要約テキスト（【疑義照会・処方変更】日付 医師(方法) [区分] 理由 変更内容 結果 同意）を生成。
- **事前点検 (`validateInterventionReadiness`)**:
  - 未回答（`pending`）の疑義照会、理由未入力、医師名未入力を自動検知。

### 2.3 調剤録帳票（`DispensingRecordPrint.tsx`）への法定記載欄の配備
- 「薬名・1日量・用法」テーブルと「情報提供・指導の要点」の間に、薬剤師法第24条・第25条に基づく「疑義照会・処方変更の記録」ブロック（`data-testid="record-intervention-box"`）を配備。
- 疑義照会が存在する場合: 照会日時、処方医、区分バッジ、疑義内容、回答・変更内容、患者同意、担当薬剤師を明瞭な表形式で記載。
- 疑義照会が 0 件の場合: 「疑義照会・処方変更なし」と明記し、調剤録としての法的完全性を担保。
- インライン `style={{}}` は一切使用せず、既存の `<style jsx>` 内でカラム幅・枠線を定義（プロジェクト規約遵守）。

### 2.4 EMR 画面（`useEmrIntervention.ts` / `EmrInterventionModal.tsx` / `emr/page.tsx`）の強化
- モーダル内に「照会区分」のセレクトボックスを配備（`generic_change`, `leftover_adjustment`, `dosage_change`, `interaction_inquiry`, `discontinuation`, `other`）。
- 照会理由入力時にカテゴリを自動サジェスト。
- 登録時、既存の `interventions` コレクションへのインサートに加え、`visit.patch({ interventionEvents: [...] })` により訪問ドキュメント内にも構造化保存。
- 削除時も `visit.interventionEvents` から連動削除。
- EMR サイドパネルの疑義照会カードに照会区分チップ（`.intervention-category-chip`）を表示。

### 2.5 印刷画面（`/print/[visitId]/page.tsx`）および月次事前点検（`monthly_claim_uke.ts`）への接続
- 単票印刷画面の `usePrintVisitData` で `interventions` を読み込み、`DispensingRecordPrint` および公式 UKE モーダル（`SingleOfficialUkeModal`）へ伝達。
- 薬剤師確認ブロックで疑義照会の件数・状態を表示。
- 月次請求公式事前点検（`buildMonthlyClaimUkeOfficialReadinessReport`）に `validateInterventionReadiness` を統合し、未回答（`pending`）の疑義照会が残っているレセプトを公式提出前に自動検知（`official_uke_intervention_inquiry_pending`）。

---

## 3. 実地検証実績（honest-verification 遵守）

- **型検査**: `npx tsc --noEmit` を単独実行し、エラー 0 件を確認。
- **静的解析**: `npm run lint` を実行し、エラー 0 件（0 errors, 11 warnings: warning は既存のもののみ）を確認。
- **Fail-First Mutation 実証**:
  - `prescription_intervention_support.ts` の `formatDispensingRecordInterventions` において、`consentText` を意図的に `'MUTATED_FAIL'` に変異させ、テストが `AssertionError: 'MUTATED_FAIL' !== '同意済'` で正しく失敗することを実測。
  - 変異復元後に全テストが PASS することを確認。
- **テストスイート**:
  - 新設契約テスト `src/lib/receipt/prescription_intervention_support.test.ts`（7件全 PASS）。
  - `src/app/print/PrintPickingFlow.test.ts` に調剤録疑義照会ブロックの契約テストを追加（18件全 PASS）。
  - 全テストスイート `npm test`: **1,804 件全 PASS**（0 fail, 0 cancelled, 0 skipped）。
- **本番ビルド**: `npm run build` を実行し、全 28/28 ページの静的生成およびバンドル成功を確認。
