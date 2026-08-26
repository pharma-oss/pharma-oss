# 運用レビュー台帳 (Ops Review Ledger)

- **対象**: `package.json` に定義された運用・レビュー用 CLI スクリプト（24 本）
- **作成**: 2026-08-26（P3-3）
- **目的**: 手動実行が必要な CLI を一覧化し、依存関係・入力・出力・終了コードの意味を明示する。
  Nightly CI（`.github/workflows/nightly-ops-review.yml`）はこの台帳の Tier 順で実行する。

---

## 0. 読み方（最初に）

### 終了コードの意味

これらのスクリプトの多くは **「レビュー結果が合格でないとき exit 1」** を返します。
**exit 1 = クラッシュではありません。** 「まだ確認が済んでいない」「ゲート未達」という業務上の状態です。

```
exit 0  レビュー結果が pass（またはツールとして正常終了）
exit 1  レビュー結果が attention / blocked、または必須入力が未指定
```

例（本日の実測、まっさらな作業ツリー）:

```
$ npm run release:readiness
{ "status": "blocked", "passedGateCount": 2, "attentionGateCount": 11, "blockedGateCount": 7, ... }
exit 1
```

7 ゲートが未達なのは、証跡（evidence）をまだ人が記録していないためです。**CI をこの exit code で
赤にしてはいけません。** Nightly CI は結果を収集して要約するだけで、ジョブは落としません。

### 自動テスト

`src/lib/ops_review_cli.test.ts` が `npm test` の中でこれらの CLI を実際に実行し、
台帳と実装のずれを検出します（2026-08-27 追加）。

- `package.json` に登録されたコマンドをそのまま実行し、標準出力 `outputs` の
  ファイル名と実際に書かれたファイルを突き合わせる
- exit code が `ok` と一致すること（本節の終了コードの意味）
- 必須入力なしなら exit 1 で、不足している env を名指しすること
- 任意入力 env に実在しないパスを渡すと必ず失敗すること（env 名の綴り確認）
- **この台帳に全 CLI の記載があること**

CLI を増やしたら、`RUNNABLE_CLIS` / `REQUIRED_INPUT_CLIS` と本台帳の両方へ追記してください。

### 証跡（evidence）について

多くのスクリプトは `YAKUREKI_*_EVIDENCE` で「人が実施した記録」の JSON を受け取ります。
未指定なら evidence テンプレートを出力し、status は `attention` 以上になります。
**これは設計どおりです。** 実運用では、薬局側が記録した証跡を渡して初めて `pass` になります。

---

## 1. 実行 Tier（依存グラフ）

下位 Tier の出力を上位 Tier が入力に取ります。Nightly CI はこの順で回します。

```
Tier 1  入力不要 / 自己完結
Tier 2  Tier 1 の成果物を入力に取る
Tier 3  Tier 2 の成果物を入力に取る
Tier 4  複数 Tier の成果物を統合する
```

### Tier 1 — 入力不要

| npm script | スクリプト | 概要 |
|---|---|---|
| `release:readiness` | `runReleaseUpdateReadiness.ts` | リリース更新の可否ゲート判定 |
| `release:post-review` | `runReleasePostReview.ts` | リリース後レビュー |
| `pilot:kpi-review` | `runPilotKpiReview.ts` | パイロット店舗の KPI レビュー |
| `ai:clinical-review` | `runAiClinicalReview.ts` | AI 補助の臨床レビュー |
| `migration:trial-acceptance` | `runMigrationTrialAcceptance.ts` | 移行トライアルの受け入れ判定 |
| `staff:access-recovery-review` | `runStaffAccessRecoveryReview.ts` | スタッフ認証復旧の月次レビュー |
| `electronic-prescription:connector-preflight` | `runElectronicPrescriptionConnectorPreflight.ts` | 電子処方箋コネクタの事前確認 |
| `test:e2e:print-layout` | `runPrintLayoutRegression.mjs` | 印刷帳票 9 種の実描画キャプチャ（`manifest.json` を出力） |

### Tier 2 — Tier 1 の出力が必要

| npm script | 必要な入力 (env) | 供給元 |
|---|---|---|
| `print:field-verification` | `YAKUREKI_PRINT_LAYOUT_MANIFEST` | `test:e2e:print-layout` の `manifest.json` |
| `support:triage` | `YAKUREKI_SUPPORT_DIAGNOSTIC_JSON` | 設定画面「個人情報なし診断JSON」の書き出し |
| `electronic-prescription:connector-contract` | `YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT` | コネクタ側の契約定義 |
| `eligibility:field-readiness` | `YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS`, `YAKUREKI_ELIGIBILITY_RESPONSE_DIFF` | `/api/system/connector-readiness` の応答 |
| `pharmacy-device:field-readiness` | `YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS` | 同上 |
| `claim:official-submission-review` | `YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_JSON` | 提出トライアルの記録 |
| `drug-label:queue-review` | `YAKUREKI_DRUG_LABEL_QUEUE_JSON`, `YAKUREKI_DRUG_INFOS_JSON` | `drug-label:fetch` の成果物 |
| `drug-label:no-candidate-review` | `YAKUREKI_DRUG_LABEL_QUEUE_JSON` | 同上 |
| `evidence:integrity` | `YAKUREKI_EVIDENCE_INTEGRITY_JSON` | 各レビューの証跡 JSON |

### Tier 3 — Tier 2 の出力が必要

| npm script | 必要な入力 (env) | 供給元 |
|---|---|---|
| `support:drill` | `YAKUREKI_SUPPORT_TRIAGE_JSON` | `support:triage` |
| `support:sla` | `YAKUREKI_SUPPORT_TRIAGE_JSON` | `support:triage` |
| `electronic-prescription:field-readiness` | `..._CONNECTOR_CONTRACT_REPORT`, `..._CONNECTOR_READINESS` | `electronic-prescription:connector-contract` |

### Tier 4 — 統合レビュー

| npm script | 必要な入力 (env) |
|---|---|
| `release:ops-acceptance` | `YAKUREKI_RELEASE_READINESS_REVIEW_JSON`, `YAKUREKI_RELEASE_POST_REVIEW_JSON`, `YAKUREKI_SUPPORT_DRILL_REVIEW_JSON`, `YAKUREKI_SUPPORT_SLA_REVIEW_JSON` |
| `pilot:operational-readiness` | `YAKUREKI_PILOT_KPI_REVIEW_JSON`, `YAKUREKI_AI_CLINICAL_REVIEW_JSON`, `YAKUREKI_MIGRATION_ACCEPTANCE_JSON`, `YAKUREKI_PRINT_FIELD_REVIEW_JSON`, `YAKUREKI_RELEASE_OPS_ACCEPTANCE_JSON`, `YAKUREKI_ELIGIBILITY_FIELD_READINESS_JSON`, `YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_READINESS_JSON` |

---

## 2. ネットワーク・外部サービスを要するもの（Nightly CI 対象外）

以下は外部サービスへ実際に送信するため、**Nightly CI では実行しません**。
実運用の設定が入った環境で、運用者が手動または個別のスケジュールで実行します。

| npm script | 外部依存 |
|---|---|
| `backup:external-transfer` / `:scheduled` | NAS / 外部ストレージへの転送 |
| `backup:s3-worm-transfer` | AWS S3 Object Lock |
| `audit:s3-worm-retention` / `:scheduled` | AWS S3 Object Lock |
| `ops:schedule-drill` | 監視 Webhook への通知 |
| `s3-worm:preflight` | AWS 認証情報の事前確認 |
| `drug-label:fetch` | PMDA / 公式サイトからの取得 |
| `backup:browser-export` | ブラウザ実操作 |

---

## 3. Nightly CI との対応

`.github/workflows/nightly-ops-review.yml` が毎晩 JST 03:00 に Tier 1 → 4 の順で実行します。

- 各スクリプトの **exit code ではジョブを落としません**（`continue-on-error`）。
- 各スクリプトの JSON 出力を `$GITHUB_STEP_SUMMARY` に要約し、`artifacts/` をアップロードします。
- **ジョブが赤になるのは、スクリプトが「クラッシュした」場合だけ**にしたいので、
  レビュー結果の良し悪しは要約を人が読んで判断します。

### 運用者が見るもの

1. Actions の実行サマリ（各レビューの `status` 一覧）
2. アップロードされた `artifacts/*/`（JSON / CSV / チェックリスト）
3. `blocked` が出たものは、証跡を記録して再実行する

---

## 4. 未整理・今後の課題

- 各スクリプトの `status` 値（`pass` / `attention` / `blocked`）の定義がスクリプト間で
  完全には揃っていない。統一するかどうかは未決。
- `evidence:integrity` は他レビューの証跡を検証するが、Nightly では入力が揃わないため
  現状スキップしている。
- 証跡 JSON の保管場所（リポジトリ外）の運用ルールは未定。
