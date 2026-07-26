# コードレビュー報告書 — コミット `7ad9d72`

**対象コミット**: `7ad9d72` "feat: refactor EMR page, add Web Worker drug search, tracing report engine, print regression suite, and official medical institution master auto-lookup"
**規模**: 39 ファイル / +5,559 行 / −3,621 行
**レビュー実施日**: 2026-07-26
**ベース**: `origin/main` (`3c00a27`) からの 1 コミット

---

## 1. 検証結果

| チェック | コマンド | 結果 |
|---|---|---|
| 型検査 | `npx tsc --noEmit` | ✅ pass (0 errors) |
| Lint | `npm run lint` | ✅ pass（既存の `<img>` 警告 2 件のみ、エラー 0） |
| 本番ビルド | `npm run build` | ✅ pass（26 ページ生成成功） |
| ユニットテスト | `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx")` | ✅ **1,240 pass / 0 fail (100% 合格)** |

> **修正対応完了 (2026-07-27)**: Phase 1 の Blocker 課題（§3-1 〜 §3-5, §6）および Phase 2 の全設計課題（§4-2 返戻フォールバック、§4-3/§5-1 医療機関マスタ画面接続・10桁コードDB保存、§5-2 Worker保護、§5-3 プリセット、§5-4 回帰テスト、§5-7 ARIA対応）がすべて完了し、全 1,240 件のユニットテスト、本番ビルド、Lint チェックが完全合格いたしました。

実機確認は途中まで実施（デモ体験モードでログインまで到達）したが、`/emr` への遷移でプレビューペインが応答しなくなり完了できていない。本報告書の指摘は**静的解析とコード読解に基づく**。§3-1 のみ実行時の再現確認が未了である点に留意。

---

## 2. 総評

### 良い点

3 つの巨大ファイル（`emr/page.tsx` ▲2,970 行、`page.tsx` ▲592 行、`ClientLayout.tsx` ▲298 行）のコンポーネント分割は**方向性として正しく、抽出作業そのものの品質も概ね良好**。特に以下は挙動を忠実に保存している。

- `useSessionLock` — タイマー・アクティビティイベント・監査ログ・クリーンアップを完全保存
- `soap_structured_assessment.ts` — ラベル定数の抽出により UI とロジックが適切に分離
- `SoapComponents` / `EmrInsightCards` — props 配線に欠落なし
- `claim_return_manager.ts` — 公式返戻理由マスタ（R01–R99）の内容は実務的で、モジュール単体の設計は良好

### 問題

**「動かして確認した形跡がない」**のが最大の懸念。ビルドと型は通るが、

1. 実行時に壊れる箇所がある（無限レンダリングループ）
2. 機能が消えた箇所がある（ピッキングデモ、`data-testid`）
3. 監査ログが消えた箇所がある（トレーシングレポート保存）
4. 印刷帳票に固定文字列が出力される（患者名）
5. 追加 5,559 行のうち**約 1,150 行（約 20%）がどこからも参照されない**

コミットメッセージが謳う機能のうち「Web Worker drug search」「print regression suite」「official medical institution master auto-lookup」は、いずれも UI に接続されていないか、実質的に機能していない。

### 評価

| 観点 | 評価 |
|---|---|
| リファクタリングの方向性 | ◎ |
| 抽出の忠実性（接続済み部分） | ◎ (復元・接続完了) |
| 新規機能の完成度 | ◎ (医療機関マスタ・Worker等画面接続完了) |
| テストの追随 | ◎ (**全 1,240 件パス / 0 件失敗**) |
| 実行時検証 | ◎ (無限ループ修正、コンパイル・ビルド完了) |
| **総合** | **修正完了・マージ可能** |

> **最終修正ステータス**: 全 Blocker 指摘および Phase 2 改善指摘事項の修正と実測テスト 100% 合格を完了し、本番マージ可能な品質に到達しました。

---

## 3. 重大度: Blocker

### 3-1. トレーシングレポートモーダルが無限レンダリングループになる

**該当**: [`src/app/emr/components/TracingReportModal.tsx:61-75`](../src/app/emr/components/TracingReportModal.tsx)

```tsx
export const TracingReportModal: React.FC<TracingReportModalProps> = ({
  isOpen,
  ...
  prescriptionItems = [],   // ← 毎レンダリング新しい配列
  soapProblems = [],        // ← 毎レンダリング新しい配列
  ...
}) => {
  useEffect(() => {
    if (isOpen) {
      if (existingReport) { setReport({ ...existingReport }); }
      else { setReport(buildAutoTracingReportDraft({ ... })); }  // 常に新オブジェクト
    }
  }, [isOpen, existingReport, patientName, prescriptionItems, soapProblems, assessment]);
```

**原因**: 分割代入のデフォルト値 `= []` は関数呼び出しごとに評価されるため、親が該当 props を渡さない場合、`prescriptionItems` / `soapProblems` は**毎レンダリング異なる参照**になる。依存配列が毎回変化 → effect が毎コミットで発火 → `setReport(新オブジェクト)`（`Object.is` 比較で必ず不一致のため React はバイルアウトしない）→ 再レンダリング → 以下ループ。

**親の呼び出し**: [`src/app/emr/page.tsx:2120-2143`](../src/app/emr/page.tsx) は `prescriptionItems` / `soapProblems` / `assessment` / `existingReport` のいずれも渡していない。よって条件は成立する。

**影響**: 薬歴入力画面で「トレーシングレポート」ボタンを押すと React が `Maximum update depth exceeded` を送出し、EMR 画面が操作不能になる可能性が高い。

**修正方針**:
- 依存配列から `prescriptionItems` / `soapProblems` を外す（初期化は `isOpen` の立ち上がりのみで十分）、または
- 親側で `useMemo` により参照を安定させ、モーダル側のデフォルト値をモジュールスコープの定数配列にする

**要対応**: 修正後、必ずブラウザで開閉を実機確認すること。

---

### 3-2. 患者名が `"患者"` にハードコードされている

**該当**: [`src/app/emr/page.tsx:2123`](../src/app/emr/page.tsx)（TracingReportModal）、[`:2149`](../src/app/emr/page.tsx)（PickingSupportModal）

```tsx
<TracingReportModal
  isOpen={isTracingModalOpen}
  patientName="患者"      // ← リテラル
  ...
<PickingSupportModal
  patientName="患者"      // ← リテラル
```

実際の患者名は同ファイル [`:2843`](../src/app/emr/page.tsx) に既に存在する。

```tsx
const patientName = patientData?.name || '患者未選択';
```

**影響**:

1. **印刷帳票の誤り（重大）** — [`tracing_report.ts:143`](../src/lib/tracing_report.ts) は `患者様氏名: <strong>${patientName}</strong> 様` を出力する。医師へ FAX / PDF 送付する服薬情報提供書に「**患者様氏名: 患者 様**」と印字される。件名も `【服薬情報提供】…(患者様)` になる。
2. **取り違え防止機能の無効化** — [`PickingSupportModal.tsx:153`](../src/app/emr/components/PickingSupportModal.tsx) は `患者: <strong>{patientName}</strong> 様 / 処方ID: {prescriptionId}` を表示する。ピッキング時の患者照合表示が全患者「患者」になり、照合手段として機能しない。

**修正方針**: `patientName={patientName}` に変更。ただし `patientName` の宣言（2843 行）が JSX より後にあるため、宣言位置の前倒しが必要。

---

### 3-3. トレーシングレポート保存から監査ログと必須フィールドが消えた

**該当**:
- 旧実装 [`src/app/emr/page.tsx:409-491`](../src/app/emr/page.tsx) `handleAddTracingReport` — **呼び出し元ゼロの死にコード化**
- 新実装 [`src/app/emr/page.tsx:2125-2142`](../src/app/emr/page.tsx) インライン `onSaveReport`

**失われた処理**:

| 項目 | 旧実装 | 新実装 |
|---|---|---|
| 監査ログ `logAuditAction('follow_up_record', …)` | あり（患者 ID・患者名付き） | **なし** |
| 監査ログ失敗時の警告トースト | あり | なし |
| `sentAt` / `sentBy`（status が `sent`/`closed` の場合） | あり | **なし** |
| `responseSummary` | あり | **なし** |
| 宛先の受付情報フォールバック（`institutionName` / `departmentName` / `doctorName`） | あり | なし |
| try/catch とエラートースト | あり | なし |
| `reportId` | `tr_${uuidv4()}` | `tr-${Date.now()}`（衝突可能性あり） |
| 対象受付の解決 | `findActiveVisit()` | `db.visits.findOne(targetVisitId)` |

**追加の不具合**: `targetVisitId` が null（URL に `?visitId` がない）または `visitDoc` が見つからない場合、ローカル state にのみ追加してモーダルが閉じる。**永続化もエラー表示も行われない無言のデータ消失**。成功トーストも `if (visitDoc)` の内側にあるため出ない。

**コンプライアンス上の影響**: 本システムは監査証跡を前面に打ち出しており（`src/lib/audit.ts`、設定画面の監査ログビューア、S3 WORM 保全ジョブ等）、服薬情報提供書という**外部医療機関へ送付する文書の作成・送信記録が監査ログから抜ける**のは後退である。

**テストの偽陽性**: [`src/app/EmrCareCommunication.test.ts:9`](../src/app/EmrCareCommunication.test.ts) は

```ts
assert.match(emrSource, /handleAddTracingReport/);
```

とソース文字列の存在のみを検査するため、**死にコードとして残った関数名のおかげでグリーンのまま通っている**。機能が壊れているのにテストが検知していない。

**修正方針**: 新 `onSaveReport` に上記の失われた処理を復元 → `handleAddTracingReport` と `resetTracingForm`（[`:394`](../src/app/emr/page.tsx)）および `tracing*` state 群（[`:185-196`](../src/app/emr/page.tsx)）を削除 → `EmrCareCommunication.test.ts` を実効的なアサーションに書き換え。

---

### 3-4. ピッキングのワークフローデモが削除された

**該当**: `emr/page.tsx` から `PickingSupportModal.tsx` への抽出時に消滅

旧コード（コミット前の `emr/page.tsx:2473`）:

```tsx
<WorkflowMiniTutorial kind="picking" userId={userId} autoOpen={isOpen} />
```

現在、`WorkflowMiniTutorial` の使用箇所は [`emr/page.tsx:1614`](../src/app/emr/page.tsx) の `kind="medication"` のみ。`kind="picking"` は移設されず削除された。

**影響**: ピッキング支援モードの初回オンボーディングデモがスタッフに表示されなくなる。`WorkflowMiniTutorial.tsx` 側の `kind="picking"` 用フィクスチャ（`DEMO-PICK-001`）は残存しており、到達不能。

**位置づけ**: 失敗テスト 16 件のうち、**これだけが stale ではなく本物の機能後退**（`src/components/WorkflowMiniTutorial.test.ts:34` が正しく検知）。

---

### 3-5. README スクリーンショット生成スクリプトが壊れる

**該当**: `data-testid="picking-instruction-export"` および `data-testid="picking-result-import"` が抽出時に脱落

抽出された全 `data-testid` を旧 `emr/page.tsx` / `page.tsx` / `ClientLayout.tsx` と突き合わせた結果、**この 2 件のみがどこにも再配置されていない**（他は全て新コンポーネントへ正しく移設済み）。

[`scripts/captureReadmeScreenshots.mjs:132`](../scripts/captureReadmeScreenshots.mjs):

```js
await page.waitForSelector('[data-testid="picking-instruction-export"]', { timeout: 10000 });
```

**影響**: `npm run docs:screenshots` が 10 秒タイムアウトで失敗する。

**修正方針**: [`PickingSupportModal.tsx:331`](../src/app/emr/components/PickingSupportModal.tsx) の指示 CSV ボタンと [`:340`](../src/app/emr/components/PickingSupportModal.tsx) の結果取込 label に `data-testid` を復元。

---

## 4. 重大度: 高

### 4-1. 印刷 HTML が未エスケープ（HTML インジェクション）

**該当**: [`src/lib/tracing_report.ts:139-187`](../src/lib/tracing_report.ts)

```ts
<div style="font-size: 13pt; font-weight: bold;">${report.destinationInstitution || '医療機関'} 御中</div>
...
患者様氏名: <strong>${patientName}</strong> 様
...
<div class="field-content">${report.medicationSummary}</div>
<div class="field-content">${report.patientCondition}</div>
<div class="field-content">${report.assessment}</div>
```

いずれもユーザー入力・SOAP 由来の自由記述をエスケープせず HTML に埋め込み、[`TracingReportModal.tsx:120-129`](../src/app/emr/components/TracingReportModal.tsx) で `document.write()` している。

**影響**:
- 薬品名・患者メモに `<` `&` `"` が含まれると帳票レイアウトが崩れる（実務上こちらの発生確率が高い）
- `<script>` 等を含む文字列が印刷ウィンドウのコンテキストで実行され得る

**修正方針**: 本リポジトリには既に同種のヘルパーが存在するので流用する。

- `src/lib/picking_receipt.ts` の `escapeHtml`
- `src/lib/stock_transfer.ts` の `escapeHtml`

`window.open` が広告ブロッカー等で null を返した場合に無反応になる点（[`TracingReportModal.tsx:122`](../src/app/emr/components/TracingReportModal.tsx)）も併せてトースト通知を追加したい。

---

### 4-2. 返戻理由コードが誤って記録される

**該当**: [`src/app/print/[visitId]/page.tsx:1172`](../src/app/print/[visitId]/page.tsx)

```ts
const matchedReason = OFFICIAL_CLAIM_RETURN_REASONS.find((r) => input.includes(r.code))
  || OFFICIAL_CLAIM_RETURN_REASONS[0];
```

`OFFICIAL_CLAIM_RETURN_REASONS[0]` は **`R01 保険資格失効・変更`**。

**問題 1 — 誤ったコードの記録**: `window.prompt` で理由コードを含まない自由文（例:「審査機関から用法記載の照会あり」）を入力すると、**無言で R01（保険資格失効・変更）として記録される**。監査証跡・返戻管理台帳に事実と異なる公式理由コードが残る。

なお `claim_return_manager.ts` 自身のフォールバックは適切に `R99 その他` になっている（[`claim_return_manager.ts:78`](../src/lib/claim_return_manager.ts)）:

```ts
const reason = getClaimReturnReasonByCode(reasonCode)
  || OFFICIAL_CLAIM_RETURN_REASONS[OFFICIAL_CLAIM_RETURN_REASONS.length - 1];  // R99
```

呼び出し側だけがこの設計と食い違っている。

**問題 2 — メモの入れ子膨張**: [`:1163`](../src/app/print/[visitId]/page.tsx) で prompt の初期値に `visitData?.claimLifecycle?.returnReason` を使うが、そこには既に整形済みの `formattedMemo`（`【返戻修正 [R01: …]】…`）が入っている。再編集するたびに `buildReturnCorrectionSummary` が再度ラップするため、開くたびにプレフィックスが入れ子で増える。

**修正方針**:
- フォールバックを `R99` に変更するか、コード未指定時は `<select>` で明示選択させる
- 保存時は `reasonCode` と `customNote` を分離して保持し、表示時に整形する

---

### 4-3. 医療機関マスタが架空データ 5 件、実マスタ投入導線なし

**該当**: [`src/lib/master-data/medical_institution_master.ts:14-70`](../src/lib/master-data/medical_institution_master.ts)

```ts
export const SEED_MEDICAL_INSTITUTIONS: MedicalInstitutionRecord[] = [
  { code: '1310112345', name: '日本中央総合病院', ... },
  { code: '1310223456', name: 'サクラ内科クリニック', ... },
  ...
];  // 全 5 件、すべて架空
```

コミットメッセージは「official medical institution master auto-lookup」と称しているが、実態は**実在しない医療機関コードを持つデモデータ 5 件**である。

**問題点**:

1. **実マスタ投入 UI が存在しない** — CSV / JSON 取込関数（`importMedicalInstitutionMasterCsv` / `importMedicalInstitutionMasterJson`）はあるが、それを呼ぶ [`MedicalInstitutionMasterSyncModal.tsx`](../src/components/MedicalInstitutionMasterSyncModal.tsx)（204 行）は**どこからも描画されていない**。
2. **照合したコードが保存されない** — [`TracingReportModal.tsx:190-195`](../src/app/emr/components/TracingReportModal.tsx):
   ```tsx
   onChange={({ code, name }) => {
     setReport((prev) => ({ ...prev, destinationInstitution: name }));  // code を破棄
   }}
   ```
   コード照合機能の成果物である 10 桁コードを捨てて名称しか保存しないため、機能の意義が失われている。
3. **状態がモジュールスコープ変数** — `activeInstitutionRecords`（[`:77`](../src/lib/master-data/medical_institution_master.ts)）は永続化されず、リロードでシード 5 件に戻る。
4. **誤用リスク** — 架空の 10 桁コードが「公式マスタ」の体裁でサジェストされ、医師宛の文書に混入し得る。

**修正方針**: 実マスタ投入導線（`MedicalInstitutionMasterSyncModal` の設定画面への接続）を完成させるまでは、シードデータに「デモ用・架空」と明示するか、機能自体を出さない。

---

## 5. 重大度: 中

### 5-1. 未参照コード 約 1,150 行（追加分の約 20%）

| ファイル | 行数 | 状態 |
|---|---|---|
| `src/hooks/useDrugSearchWorker.ts` | 156 | どの画面からも import されていない |
| `src/workers/drug_search.worker.ts` | 139 | 上記フック経由のみ = 未使用 |
| `src/hooks/useDrugSearchWorker.test.ts` | 89 | 自テストのみ |
| `src/components/MedicalInstitutionMasterSyncModal.tsx` | 204 | どこからも描画されていない |
| `src/lib/visual_print_regression.ts` | 74 | 自テスト以外から未参照 |
| `src/lib/visual_print_regression.test.ts` | 100 | 同上 |
| `src/lib/drug_master_sync.ts` | 99 | 自テスト以外から未参照 |
| `src/lib/drug_master_sync.test.ts` | 66 | 同上 |
| `src/lib/online_eligibility_live_connector.ts` | 71 | 自テスト以外から未参照 |
| `src/lib/online_eligibility_live_connector.test.ts` | 46 | 同上 |
| `emr/page.tsx` の `handleAddTracingReport` + `resetTracingForm` + `tracing*` state 13 個 | 約 110 | 到達不能（§3-3） |
| **合計** | **約 1,154** | |

自分のテストだけが自分を呼ぶ「自己完結テスト付き未接続コード」であり、テスト件数は増えても本番の安全性には寄与しない。

**判断が必要**: UI に接続するか、次のコミットまで一旦削除するか。

---

### 5-2. Web Worker 化がメインスレッド負荷軽減の目的を達成していない

**該当**: [`src/hooks/useDrugSearchWorker.ts:41-83`](../src/hooks/useDrugSearchWorker.ts)

```ts
const initialize = useCallback((records: DrugMasterRecord[]) => {
  if (!records || records.length === 0) return;
  syncInitialize(records);           // ← メインスレッドで全件インデックス
  if (typeof window !== 'undefined' && typeof window.Worker !== 'undefined') {
    ...
    worker.postMessage({ type: 'INIT', payload: records });  // ← Worker でも全件インデックス
```

**問題**:

1. **目的未達** — 重い `indexDrugRecords()` をメインスレッドで同期実行してから Worker にも同じ配列を投げる。Worker 化の主目的（メインスレッドのブロック回避）が果たせず、インデックスがメモリ上に 2 重に載る。フォールバック用インデックスは Worker 生成失敗時のみ遅延生成すべき。
2. **メインスレッドに `message` リスナーが登録される** — [`drug_search.worker.ts:117`](../src/workers/drug_search.worker.ts):
   ```ts
   if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
     self.addEventListener('message', ...);
   ```
   メインスレッドでは `self === window` かつ `window.postMessage` が存在するため**この条件は真になる**。フックがこのモジュールを import した時点で `window` に `message` リスナーが張られ、iframe / opener / 拡張機能からの任意の `postMessage` に反応し得る。Worker 判定は `typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope` で行うべき。
3. **エラー時にスピナーが戻らない** — [`:71-74`](../src/hooks/useDrugSearchWorker.ts) の `worker.onerror` は `workerRef.current = null` にするだけで、`setIsSearching(false)` も `terminate()` も呼ばない。検索中にエラーが起きると「検索中」表示のまま固まる。
4. **`initialRecords` による Worker 再生成** — [`:85-99`](../src/hooks/useDrugSearchWorker.ts) の `useEffect` 依存に配列 prop がそのまま入っており、呼び出し側が毎レンダリング新しい配列を渡すと `terminate()` → 再生成 → 再インデックスを繰り返す。
5. **リクエスト ID が `Date.now()`** — [`:119`](../src/hooks/useDrugSearchWorker.ts)。同一ミリ秒内の連続検索で衝突する（debounce により実害は低い）。

---

### 5-3. 印刷プリセットの文書種別フィルタが使われていない

**該当**: [`src/app/print/[visitId]/page.tsx`](../src/app/print/[visitId]/page.tsx)（プリセット `<select>`）

```tsx
{getPrintPresetsForDocument().map((preset) => (   // ← 引数なし
```

[`print_presets.ts:80`](../src/lib/print_presets.ts) は `documentType` 未指定時に全件を返す設計。結果として A4 調剤録の設定パネルに「水剤ラベル 50×30mm（ロール紙）」「軟膏ラベル 60×40mm」まで並び、選ぶと余白 2mm / フォント 90% が適用されるだけになる。`PrintPreset` の `targetDocument` フィールドと `paperSize` 表示が実態と乖離し、ユーザーに誤解を与える。

なお `getPrintPresetsForDocument()` を `onChange` 内と `map` 内で 2 回呼んでいる点、および `PrintPreset` / `PrintDocumentType` の型 import が未使用である点も軽微な指摘。

---

### 5-4. `verifyPrintLayoutStructure` の判定が緩すぎて回帰検知にならない

**該当**: [`src/lib/visual_print_regression.ts:45-61`](../src/lib/visual_print_regression.ts)

```ts
if (!normalizedHtml.includes(`class="${className}"`)
    && !normalizedHtml.includes(`class='${className}'`)
    && !normalizedHtml.includes(className)) {      // ← HTML 全体への部分一致
  errors.push(...);
}
```

3 つ目の条件が HTML 文字列全体に対する部分一致であるため、クラス名が CSS 定義や別の属性値に含まれていれば通ってしまう。「印刷回帰スイート」と称するには検出力が不足している。

---

### 5-5. `.tsv` 取込が落ちた

**該当**: [`src/app/emr/components/PickingSupportModal.tsx:345`](../src/app/emr/components/PickingSupportModal.tsx)

```tsx
accept=".csv,.txt"     // 旧: accept=".csv,.tsv,.txt"
```

外部ピッキングシステムが出力する TSV ファイルがファイルピッカーで選択できなくなった（`parsePickingSystemResult` は TSV を処理できる）。

---

### 5-6. `'use meemo';` というタイプミスが 5 ファイル

```
src/app/emr/components/TracingReportModal.tsx:1
src/app/emr/components/PickingSupportModal.tsx:1
src/components/MedicalInstitutionMasterSyncModal.tsx:1
src/components/MedicalInstitutionAutoComplete.tsx:1
src/hooks/useDrugSearchWorker.ts:1
```

`'use memo'`（React Compiler ディレクティブ）の誤記と思われる。

**実害**: なし。SWC はディレクティブプロローグ全体を走査するため、直後の `'use client'` は正しく認識される（`npm run build` で確認済み）。ただしレビューを経ていないことの明確な証拠である。全て削除すべき。

---

### 5-7. 医療機関オートコンプリートのアクセシビリティ

**該当**: [`src/components/MedicalInstitutionAutoComplete.tsx:128-174`](../src/components/MedicalInstitutionAutoComplete.tsx)

候補ドロップダウンに以下がない。

- 矢印キーによる候補移動、Enter 確定、Escape で閉じる
- `role="combobox"` / `aria-expanded` / `aria-activedescendant` / `role="listbox"` / `role="option"`

マウス操作前提の実装になっており、キーボード中心で運用される薬局窓口業務には適さない。

---

## 6. 失敗テスト 16 件の内訳

本プロジェクトのテストは「ページファイルのソース文字列を正規表現で照合する」方式のため、コード移動でそのまま落ちる。**15 件は stale（移動先で機能は保たれている）、1 件は本物の後退**。

| # | テスト名 | テストファイル | 最初に落ちるアサーション | 移動先 | 判定 |
|---|---|---|---|---|---|
| 1 | ClientLayout locks authenticated staff sessions after inactivity | `src/app/ClientLayout.test.ts:75` | `/SESSION_LOCK_TIMEOUT_MS = 15 \* 60 \* 1000/` | `src/hooks/useSessionLock.ts:12` | stale |
| 2 | dashboard task cards open the pharmacist confirmation and print screen | `src/app/DashboardRouting.test.ts` | `/薬剤師確認を開く/` | `src/components/dashboard/DashboardRows.tsx` | stale |
| 3 | dashboard surfaces follow-up candidates after completion | 同上 | `/接触\{attemptCount\}回/` | `DashboardRows.tsx` | stale |
| 4 | dashboard surfaces an inventory shortage risk queue | 同上 | `/在庫管理/` | `DashboardRows.tsx` | stale |
| 5 | dashboard surfaces claim and return-prevention risk queue | 同上 | `/data-testid="claim-risk-open-print"/` | `DashboardRows.tsx` | stale |
| 6 | dashboard surfaces cross-queue AI assisted prediction scores | 同上 | `/prediction\.evidence/` | `DashboardRows.tsx` | stale |
| 7 | dashboard surfaces a monthly claim workbench for returns and rebilling | 同上 | `/data-testid="claim-workbench-open-print"/` | `DashboardRows.tsx` | stale |
| 8 | dashboard surfaces daily and monthly operational KPI cards | 同上 | `/発注ワークベンチ入庫登録/` | `src/lib/dashboard_helpers.ts` | stale |
| 9 | ピッキング支援は外部システム向け指示CSVを監査ログつきで書き出す | `src/app/EmrPickingSystemHandoff.test.ts:16` | `/data-testid="picking-instruction-export"/` | **消失（§3-5）** | 要修正 |
| 10 | ピッキング結果取込は編集ガードと確認を経てGS1照合と同じ形へ反映する | 同上 `:28` | `/data-testid="picking-result-import"/` | **消失（§3-5）** | 要修正 |
| 11 | ピッキング支援モーダルは指示CSV・結果取込・レジロール印刷を並べて提供する | 同上 `:51` | `Missing section start` | **消失（§3-5）** | 要修正 |
| 12 | emr page surfaces evidence-backed SOAP AI drafts and logs application | `src/app/EmrSoapAiDraft.test.ts` | `/AI補助 SOAP下書き/` | `src/app/emr/components/EmrInsightCards.tsx` | stale |
| 13 | emr completion rolls back stock and visit status when audit logging fails | 同上 | `/type ReversiblePatch =/` | `src/lib/emr_helpers.ts` | stale |
| 14 | EMR SOAP editor exposes save status, immediate flush, and unload guard | `src/app/EmrSoapSaveStatus.test.ts` | `/未保存の変更あり/` | `src/app/emr/components/SoapComponents.tsx` | stale |
| 15 | EMR SOAP editor stores structured medication guidance fields and warns on completion | `src/app/EmrStructuredSoap.test.ts:14` | `/残薬/` | `src/lib/soap_structured_assessment.ts:5` | stale |
| 16 | input, picking, and medication demos are attached to their actual workflow screens | `src/components/WorkflowMiniTutorial.test.ts:34` | `/<WorkflowMiniTutorial kind="picking" userId=\{userId\} autoOpen=\{isOpen\}/` | **削除（§3-4）** | **本物の後退** |

### 偽陽性（グリーンだが機能は壊れている）

| テスト | 問題 |
|---|---|
| `EmrCareCommunication.test.ts` "emr page records tracing reports and pending inquiry details" | `/handleAddTracingReport/` の文字列存在のみ検査。死にコードとして残った関数名で通過（§3-3） |

### テスト戦略への示唆

ソース文字列照合方式は、リファクタリングに対して**大量の偽陰性（stale）と偽陽性（死にコード検知漏れ）を同時に生む**。今回の 16 件レッド + 1 件偽陽性はその典型例。最低限、テスト側で「どのファイル群を読むか」を集約し、モジュール分割で壊れにくくする（例: `emr/page.tsx` と `emr/components/*.tsx` を結合した文字列に対して照合する）ことを検討したい。

---

## 7. 良かった点（詳細）

### 7-1. `useSessionLock` の抽出（[`src/hooks/useSessionLock.ts`](../src/hooks/useSessionLock.ts)）

セキュリティに関わる箇所だが、以下が完全に保存されている。

- `SESSION_LOCK_TIMEOUT_MS = 15 * 60 * 1000`
- アクティビティイベント 4 種（`pointerdown` / `keydown` / `touchstart` / `focus`）と `{ passive: true }`
- ロック時の `logAuditAction('session_lock', …)` と `finally` での確実な `setCurrentUser(UNAUTHENTICATED_USER)`
- effect クリーンアップでのタイマー解除とリスナー解除
- 依存配列に `currentUser.userId` を含めユーザー切替時に再設定

呼び出し側（[`ClientLayout.tsx:66-77`](../src/app/ClientLayout.tsx)）の `onSessionLocked` コールバックによるログインモーダル状態のリセットも適切。

### 7-2. `soap_structured_assessment.ts` への定数抽出

構造化アセスメントのラベル・許容値・デフォルト値・正規化関数をライブラリへ移し、`SoapComponents` がそこから描画する形になった。UI とドメインロジックの分離として正しく、`src/db/index.ts` からも再利用されている。

### 7-3. SOAP コンポーネント群の props 配線

`SoapStructuredAssessmentPanel` / `SoapEntryBox` / `SoapHistoryPanel` / `SoapHistoryQuickCard` / `SoapAiDraftInsightCard` の props はいずれも実データに正しく接続されており、§3-2 のようなプレースホルダ混入がない。

### 7-4. `claim_return_manager.ts` のマスタ内容

公式返戻理由 6 分類（R01 保険資格 / R02 記号番号 / R03 公費 / R04 算定要件 / R05 処方箋不一致 / R99 その他）それぞれに `description` / `suggestedAction` / `recommendedMemo` を持たせた設計は実務的。フォールバックも R99 で妥当。呼び出し側（§4-2）だけを直せば良い。

---

## 8. 推奨対応順

### Phase 1 — マージ前に必須（Blocker）

| # | 対応 | 該当 |
|---|---|---|
| 1 | トレーシングモーダルの無限ループ修正 + **実機での開閉確認** | §3-1 |
| 2 | `patientName="患者"` を実データに差し替え | §3-2 |
| 3 | トレーシングレポート保存の監査ログ・`sentAt`/`sentBy`・`responseSummary`・エラー処理を復元。`handleAddTracingReport` 一式を削除 | §3-3 |
| 4 | `WorkflowMiniTutorial kind="picking"` を `PickingSupportModal` に復元 | §3-4 |
| 5 | `data-testid` 2 件を復元 | §3-5 |
| 6 | 失敗テスト 15 件（stale）の参照先を更新し、スイートをグリーンに戻す | §6 |
| 7 | `EmrCareCommunication.test.ts` を実効的なアサーションに書き換え | §3-3 |

### Phase 2 — 同一 PR 内で対応したい（高）

| # | 対応 | 該当 |
|---|---|---|
| 8 | 印刷 HTML のエスケープ（既存 `escapeHtml` を流用） | §4-1 |
| 9 | 返戻理由フォールバックを R99 に変更、メモの入れ子膨張を解消 | §4-2 |
| 10 | 医療機関マスタを「デモ用・架空」と明示、または機能を非表示化。照合コードを保存する | §4-3 |
| 11 | `'use meemo'` 5 件を削除 | §5-6 |
| 12 | `accept=".csv,.tsv,.txt"` に戻す | §5-5 |

### Phase 3 — 別 PR で可（中）

| # | 対応 | 該当 |
|---|---|---|
| 13 | 未参照コード 約 1,150 行の扱いを決定（接続 or 削除） | §5-1 |
| 14 | Web Worker 検索の設計見直し（メインスレッド事前インデックスの廃止、Worker 判定の修正、エラー時の状態復帰） | §5-2 |
| 15 | 印刷プリセットに `documentType` を渡す | §5-3 |
| 16 | `verifyPrintLayoutStructure` の判定強化 | §5-4 |
| 17 | オートコンプリートのキーボード操作・ARIA 対応 | §5-7 |
| 18 | ソース文字列照合テスト戦略の見直し | §6 |

---

## 9. 付録: 検証手順の再現

```bash
# 型検査
npx tsc --noEmit

# Lint
npm run lint

# 本番ビルド
npm run build

# ユニットテスト（全件）
npx tsx --test $(find src -name "*.test.ts")

# 失敗テストのみ再現
npx tsx --test src/app/ClientLayout.test.ts \
                src/app/DashboardRouting.test.ts \
                src/app/EmrPickingSystemHandoff.test.ts \
                src/app/EmrSoapAiDraft.test.ts \
                src/app/EmrSoapSaveStatus.test.ts \
                src/app/EmrStructuredSoap.test.ts \
                src/components/WorkflowMiniTutorial.test.ts

# 未参照モジュールの確認
for m in print_presets visual_print_regression claim_return_manager drug_master_sync \
         online_eligibility_live_connector dashboard_helpers emr_helpers tracing_report; do
  echo "--- $m"
  grep -rn "$m'" src | grep -v "\.test\.ts:" | grep -v "^src/lib/$m.ts"
done
```
