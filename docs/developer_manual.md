# pharma-oss 開発者向けマニュアル

## 1. システムアーキテクチャ概要

pharma-oss は、Next.js (App Router) をフロントエンド基盤とし、クライアントサイドデータベースに RxDB を採用した「ローカルファースト」な Web アプリケーションです。オフラインでも動作し、高速なレスポンスを提供する設計となっています。

### テクノロジースタック
*   **フレームワーク**: Next.js (App Router)
*   **言語**: TypeScript
*   **スタイリング**: Vanilla CSS (CSS変数を用いた独自デザインシステム)
*   **業務データベース**: RxDB (バックエンドとして Dexie/IndexedDB を使用)
*   **参照マスタDB**: SQLite WASM/OPFS (薬品マスタ検索・用法コードマスタ)
*   **OCRエンジン**: Tesseract.js
*   **アイコン**: Lucide React
*   **パッケージマネージャー**: **npm** (package-lock.json をコミット対象とします)

## 2. 開発環境のセットアップ

1.  **リポジトリのクローンと依存関係のインストール**:
    必ず `npm` を使用してください。
    ```bash
    npm install
    ```
2.  **開発用サーバーの起動**:
    ```bash
    npm run dev
    ```
3.  **アクセス**:
    ブラウザで `http://localhost:3000` にアクセスします。

## 3. コーディングガイドラインとパフォーマンス最適化

当プロジェクトでは、パフォーマンスとセキュリティを最優先としています。以下のガイドラインを厳守してください。

### パフォーマンスに関する注意点
*   **リストレンダリング**: リストのレンダリング時には、配列のインデックスではなく、安定した一意の識別子（`visitId` や `itemId` など）を `key` として使用してください。不必要な再レンダリングを防ぐため、関数コンポーネントは `React.memo` でラップすることを検討してください。
*   **動的インポート**: `rxdb` などの重いクライアントサイドデータベースライブラリや、Tesseract.js のOCRモデルは、トップレベルで静的にインポートせず、必要になるコンポーネントの `useEffect` 内で動的にインポート（例: `await import('...')`）してください。
*   **大規模データ処理のループ**: UKEジェネレーター（`src/lib/receipt/uke_generator.ts`）のようなクリティカルなホットパスでは、`.map()` などの配列メソッドチェーンやスプレッド構文を避け、手動の `for` ループと文字列結合（`+=`）を使用してください。これにより、ガベージコレクションの負荷とCPUオーバーヘッドを大幅に削減できます。
*   **RxDBの利用**: RxDB ドキュメントの `.toJSON()` はオーバーヘッドを減らすためにループ内での使用を避けるべきですが、フィールドの欠落や脆弱性を招く恐れがある場合は無理な最適化を控えてください。

### セキュリティに関する注意点
*   **エラーハンドリング**: `catch` ブロックでは、監査とデバッグのために元の `error` オブジェクトを `console.error` に含めてください（スタックトレースを隠蔽しないため）。一方、ユーザー向けUI（アラートなど）には内部の機密情報を漏らさないよう汎用的なメッセージを表示してください。
*   **ID生成**: 主キー（`patientId` など）には、IDORの脆弱性を防ぐため、暗号論的に安全なUUIDを使用してください。生成には `crypto.randomUUID()`（ネイティブ実装）を推奨します（`src/lib/crypto.ts` を参照）。
*   **ファイルアップロード**: OCR画面におけるファイルアップロードでは、MIMEタイプ（画像または `application/pdf`）とファイルサイズ（10MB以下）を必ず検証し、XSSやDoS攻撃を防いでください。
*   **セキュリティヘッダ**: Next.js アプリケーションは、`next.config.mjs` を通じて CSP などの標準的なセキュリティヘッダを注入しています。
*   **個人情報なし診断**: 設定 > 操作ログ・監査ログの `個人情報なし診断JSON` は、問い合わせ時にサポートへ渡せる軽い状態レポートです。件数、整合性、レビュー状態、マイナ読取・オンライン資格確認・電子処方箋など外部連携の接続準備、初回セットアップのステップIDと残対応件数だけを書き出し、患者名、患者ID、保険番号、スタッフ名、薬局名、薬品名、監査ログ詳細、初回セットアップの証跡本文や対応文面、バックアップ本文、外部連携URL、認証トークンは含めないでください。

### UX/アクセシビリティ
*   単なる装飾目的のアイコンには、スクリーンリーダーでの読み上げを避けるため `aria-hidden="true"` を追加してください。
*   保存や送信などのアクション時には、画面全体をブロックするオーバーレイを避け、インラインでのローディング状態（スピナーなど）を活用してください。

## 4. テストの実行

プロジェクト内の静的検査とテスト（Node 22環境）を実行するには、以下のコマンドを使用します：

```bash
npm run lint
npx tsc --noEmit
npx tsx --test $(find src -name "*.test.ts")
```
※ `node_modules` の構成が不完全な環境でテストを実行する場合、純粋なユーティリティ（`crypto`、`uke_generator`など）のテストは動作しますが、外部依存が必要なテストは失敗する可能性があります。

※ 閉店時バックアップ予定・期日計算などのテストフィクスチャは、日本の店舗ローカル時刻（JST）を前提にしています。UTC等のタイムゾーンで実行すると時刻判定テストが4件失敗します。CIは `TZ: 'Asia/Tokyo'` で実行しており、手元で別タイムゾーンの環境を使う場合は `TZ=Asia/Tokyo npx tsx --test ...` としてください。

導入時の請求テスト・帳票印刷テストは、開発サーバーを起動したうえでブラウザE2Eランナーを実行します。

```bash
npm run dev
npm run test:e2e:onboarding
```

使い捨ての開発DBに導入確認用データを自動投入し、印刷画面まで確認する場合は、以下を指定します。

```bash
YAKUREKI_E2E_AUTO_SEED=1 npm run test:e2e:onboarding
```

既存のテスト用来局を使って印刷画面まで確認する場合は、来局IDを指定します。

```bash
YAKUREKI_E2E_VISIT_ID=<visitId> npm run test:e2e:onboarding
```

別ポートや既存環境に対して実行する場合は、`YAKUREKI_E2E_BASE_URL` を指定してください。初回セットアップ画面が表示される環境では、既定のセットアップパスワードとして `SetupPass123` を使います。変更する場合は `YAKUREKI_E2E_SETUP_PASSWORD` を指定します。自動投入されるデータは `e2e_onboarding_` 接頭辞を持つ dev/test 用データです。

失敗時は `artifacts/onboarding-e2e/` にスクリーンショット、HTML、画面テキスト、ブラウザログ、エラー概要を保存します。保存先を変える場合は `YAKUREKI_E2E_ARTIFACT_DIR` を指定してください。

GitHub Actions の `Onboarding E2E` ワークフローでは、lint、型チェック、ユニットテスト、ビルド、導入E2Eをまとめて実行します。失敗時は `onboarding-e2e-artifacts` としてブラウザ証跡と `dev_server.log` を保存します。

返戻修正導線は、同じワークフロー内で `npm run test:e2e:return-correction` 相当のブラウザE2Eとして確認します。返戻用のテストデータを投入し、保険・公費、処方内容、点数内訳の返戻修正ボタンと遷移先クエリを検証します。

印刷帳票のスクリーンショット回帰は、導入E2Eシードを使って調剤録、明細、領収証、薬剤情報、薬袋、お薬手帳シール、水剤ラベル、軟膏ラベルをPNG保存します。

```bash
YAKUREKI_E2E_AUTO_SEED=1 npm run test:e2e:print-layout
```

成功時も `artifacts/print-layout-regression/` に帳票ごとのPNGと `manifest.json` を保存します。CIでは `onboarding-e2e-artifacts` に含めます。

社保・国保の公式UKE提出試験レビューは、患者単位のUKE本文ではなく、提出先区分と件数・点数・GO集計だけをまとめた患者情報なしJSONを入力します。社保系と国保系の両方について、確認日、受付番号、受付結果ファイル名、そのファイルの `sourceArtifactSha256`、`noPatientDataConfirmed: true` を記録してください。

```bash
YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_JSON=<患者情報なし提出試験JSON> \
YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_OUTPUT_DIR=artifacts/official-submission-trial-review \
npm run claim:official-submission-review
```

レビューJSON、CSV、要約、入力テンプレートを出力します。患者名、患者ID、受付ID、生年月日、保険番号、UKE本文は入力しません。患者値を検出した場合は成果物上で伏せ、ダミー・モック・サンプルの受付結果は終了コード1で保留します。

オンライン資格確認の現地試験レビューは、接続準備診断JSON、公式レスポンス差分JSON、現地確認証跡JSONを分けて入力します。現地確認証跡には `capturedAt`、匿名の `operatorReviewId`、元資料の `sourceArtifactSha256`、`noPatientDataConfirmed: true` が必要です。患者情報、接続先URL、認証情報、通信本文は入れないでください。

```bash
YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS=<接続準備診断JSON> \
YAKUREKI_ELIGIBILITY_RESPONSE_DIFF=<公式レスポンス差分JSON> \
YAKUREKI_ELIGIBILITY_FIELD_EVIDENCE=<現地確認証跡JSON> \
npm run eligibility:field-readiness
```

`online-eligibility-field-readiness.json`、CSV、入力テンプレートを出力します。ダミー、検証用データ、患者情報混入、必須証跡の未完了は合格として扱いません。保留判定では成果物を残して終了コード1になります。

電子処方箋の導入計画は `docs/electronic_prescription_rollout_plan.md` にまとめます。公式運用試験レビューは、接続準備診断JSONと現地確認証跡JSONを分けて入力します。接続準備診断では `ELECTRONIC_PRESCRIPTION_MODE=connector`、`ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND=qualification_terminal|web_api`、`ELECTRONIC_PRESCRIPTION_CAPABILITIES` を設定し、処方箋受付、署名検証、重複投薬等チェック、受付取消、調剤結果登録、調剤結果取消・変更、リフィル、紙処方箋情報提供ファイルの必須機能を申告します。現地確認証跡には、本番接続モジュール、受付内容照合、引換番号、「処方内容（控え）」を処方箋原本として扱わない確認、重複投薬等チェック、取消・変更、調剤結果登録、障害時手順の結果を入れます。患者氏名、生年月日、保険番号、電子処方箋ID、引換番号、薬品名、医療機関名、接続URL、認証情報、通信本文は入れないでください。

```bash
YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS=<接続準備診断JSON> \
YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_REPORT=<接続契約レポートJSON> \
YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_EVIDENCE=<現地確認証跡JSON> \
YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_OUTPUT_DIR=artifacts/electronic-prescription-field-readiness \
npm run electronic-prescription:field-readiness
```

`electronic-prescription-field-readiness.json`、CSV、入力テンプレート、現地チェックリストを出力します。`capturedAt`、匿名の`operatorReviewId`、元資料の`sourceArtifactSha256`、`noPatientDataConfirmed: true`、シナリオ別の`checkedItems`が揃わない証跡、デモ・ダミー証跡、患者情報・HPKI生証明書・生シリアル・発行者名が混ざった証跡は合格にしません。受付画面側も、デモ、患者生年月日または取得キーの不一致、必須項目不足、重複投薬等チェック未実施または受付停止結果を処方入力へ反映しません。受付後の公式操作は `/api/electronic-prescription/operation` へ `duplicate_check`、`reception_cancel`、`dispensing_result_register`、`dispensing_result_cancel`、`dispensing_result_change` を渡し、pharma-oss接続モジュールへ送ります。接続モジュールの応答には操作結果、調剤結果ID、登録日時、重複確認結果だけを返し、URL、認証情報、通信本文は返さないでください。

調剤機器・POS連携は、受付保存時にNSIPS風ファイルを直接生成しません。`PHARMACY_DEVICE_CONNECTOR_MODE=connector`、施設内の`PHARMACY_DEVICE_CONNECTOR_ENDPOINT`、`PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN`、`PHARMACY_DEVICE_CONNECTOR_KIND=nsips_gateway|vendor_api`、合意済みの`PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION`、`PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY=true`、`PHARMACY_DEVICE_CONNECTOR_CAPABILITIES=prescription_submit,prescription_replace,prescription_cancel,idempotent_submission,status_response`、直近試行結果を設定します。`nsips_gateway`では日本薬剤師会への利用申込と仕様利用許諾を確認して`PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED=true`を設定し、現行Ver.1.07.01と一致させます。同一端末のlocalhostだけHTTPを許可し、施設内LANはHTTPSを必須にします。ブラウザは`/api/external-integration/prescription-handoff`へ送信し、接続先は`accepted|duplicate|cancelled|rejected`、`transferId`、`receivedAt`だけを返します。

ローカル開発で実機なしに送信、重複送信、差替、取消を確認する場合だけ、`PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED=true`を設定します。このとき`/api/external-integration/prescription-handoff`はプロセス内のメモリシミュレータへ接続し、`PHARMACY_DEVICE_CONNECTOR_KIND`と`PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION`を結果に反映します。`NODE_ENV=production`では無効になり、現地試験や安定運用の証跡としては使用しません。

### 店舗内複数端末（サテライト端末同期）

店舗内で複数端末を使う場合は、1台をメイン端末(hub)、他をサテライト端末にします。設計・運用の全体像は `docs/satellite_terminal_sync_plan.md` を参照してください。

*   **役割**: 各端末の環境変数 `PHARMACY_SYNC_ROLE=hub|satellite|standalone`(既定 standalone=従来どおり単独動作)。
*   **メイン端末(hub)**: Next.jsサーバー内の `node:sqlite`(Node 22.13以上)に正本を保持します(`src/lib/sync/hub_store.ts`、AES-256-GCMで暗号化)。`PHARMACY_SYNC_HUB_ENCRYPTION_KEY`(16進64文字)が必須、`PHARMACY_SYNC_HUB_DB_PATH`の既定は `./data/sync_hub.sqlite`。メイン端末のブラウザは従来どおり暗号化IndexedDBの全量レプリカを持ち、既存バックアップ導線がそのまま全端末分を含みます。
*   **サテライト端末**: ブラウザはRxDBメモリストレージのみで患者データをディスクへ書きません。`PHARMACY_SYNC_HUB_ENDPOINT`(localhostはHTTP可、施設内LANはHTTPS必須。HTTPしか使えないLANでは`PHARMACY_SYNC_TRANSPORT_ENCRYPTION=aes-gcm`と共有鍵`PHARMACY_SYNC_TRANSPORT_KEY`でペイロードを暗号化)、メイン端末の設定>端末同期で発行した`PHARMACY_SYNC_TERMINAL_ID`/`PHARMACY_SYNC_TERMINAL_TOKEN`を設定します。トークンはサーバー側envにのみ置かれ、ブラウザへは渡りません。
*   **同期**: RxDB open-coreの`replicateRxCollection`でブラウザ⇔自機`/api/sync/pull|push`を双方向同期します(サテライトの`audit_logs`はpush専用)。サテライトの自機サーバーは`/api/sync/remote/*`へBearerトークン付きで中継します。競合はハブ優先で、負けた書き込みは設定>端末同期の競合レビューに記録されます。
*   **監査ログ**: ハッシュチェーンは端末ごとに独立します(`AuditLog.terminalId`、メイン端末は`hub-local`)。`verifyAuditLogIntegrity`は端末別にチェーンを検証し、terminalIdなしの既存ログはレガシーチェーンとして従来どおり検証します。
*   **E2E**: `npm run build` 後に `npm run test:e2e:sync` で、ハブ起動→端末登録→サテライト経由push/pull→競合記録→トークン失効拒否を2プロセスで検証します。

```bash
YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS=<接続準備診断JSON> \
YAKUREKI_PHARMACY_DEVICE_FIELD_EVIDENCE=<現地確認証跡JSON> \
YAKUREKI_PHARMACY_DEVICE_FIELD_OUTPUT_DIR=artifacts/pharmacy-device-field-readiness \
npm run pharmacy-device:field-readiness
```

`pharmacy-device-field-readiness.json`、CSV、入力テンプレート、現地チェックリストを出力します。実機の内容一致、二重送信防止、差替、取消、再起動復帰、監査履歴、施設外送信なし、20営業日以上、成功20件以上、失敗率2%以下、未解決事故0件を確認します。患者氏名、患者番号、生年月日、薬品名、医療機関名、接続URL、認証情報、通信本文は証跡へ入れません。出所不足、デモ・ダミー、患者情報混入は安定運用にしません。

在庫の発注ワークベンチでは、`src/lib/inventory_order.ts` の純粋関数で患者名なしの発注CSV/メモと入庫確認CSV/メモを生成します。発注済み候補だけを入庫確認表へ出し、ロット番号、使用期限、納品数量、入庫日、確認者は納品時に埋める空欄として保持します。画面から入庫登録する場合は、発注済み候補の薬品コードを使って `drug_stocks` にロット在庫を追加し、薬品マスターの `stockQuantity` を加算し、`stock_update` 監査ログを残します。監査ログ記録に失敗した場合はロット追加と在庫数を戻します。CSV出力では表計算式として解釈される先頭文字を無害化し、患者名や受付IDを含めないことを `src/lib/inventory_order.test.ts` で固定しています。

日次締めでは、同日の `stock_update` 監査ログのうち詳細に `発注ワークベンチ入庫登録` を含むものを入庫登録件数として数え、個人情報なし診断や問い合わせ対応に関係する監査ログを問い合わせ負荷として数えます。`src/lib/operational_closing_report.ts` は在庫不足品目数、服薬フォロー候補数、入庫登録、問い合わせ負荷を承認ログへ残します。`src/lib/operational_closing_review.ts` は承認ログから4項目を読み取り、月次合計、前月差、直近6か月の内訳、日次締め1回あたりの店舗平均、改善アクション実行後の日次締め3営業日分による効果測定、責任者CSV、患者情報なしのBI JSONへ出力します。実行記録は90日さかのぼって見るため、月末に実施したアクションも翌月の締めで判定できます。BI JSONは効果測定項目追加に伴い `schemaVersion: 5` です。設定画面の現場KPI帯は `daily-closing-field-kpis`、店舗比較表は `store-field-kpi-benchmark` をE2E契約とし、一時ブラウザプロファイルで実値、1440px表示、390px表示、ページ全体の横はみ出しを確認します。

AI補助の表示制御は `src/lib/ai_assist_policy.ts` に集約します。`FacilitySettings.aiAssistMode` は `enabled`、`limited`、`disabled` の3値で、施設設定スキーマはv5です。既存店舗は従来表示を維持するためマイグレーションで `enabled`、新規店舗は安全側の `limited` を設定します。処方監査、SOAP下書き、ダッシュボード予測は必ず `filterAiAssistItemsByMode` を通し、制限時は `critical` のみ、停止時は空配列にします。

月次品質ゲートは `src/lib/ai_suggestion_feedback.ts` の `DEFAULT_AI_SUGGESTION_QUALITY_POLICY` で初期閾値を管理します。月20件未満は評価件数不足、信頼度80%以上の却下2件または10件以上で却下率25%以上は停止、却下率10%以上、修正・却下率35%以上、提案種別5件以上で修正・却下率50%以上などは制限候補です。判定と現在/推奨モードは患者情報なしCSV、BI JSON v2、匿名診断JSON v2へ出力します。これは運用上の安全ゲートであり、臨床精度の証明として扱わないでください。閾値変更時は純粋関数テスト、3画面の表示制御、監査ログ、文書を同時に更新します。

AI症例レビューは `src/lib/ai_clinical_review.ts` と `npm run ai:clinical-review` で扱います。入力には匿名ケースID、匿名店舗ID、匿名レビュー者ID、提案種別、信頼度、採否、薬剤師判定、誤提案、安全影響だけを入れます。症例本文、監査ログ本文、正式な店舗名、職員氏名、ローカルパス、URL、トークンは入れません。実症例レビューとして合格させるには、`capturedAt`、匿名の `operatorReviewId`、元資料の `sourceArtifactSha256`、`noPatientDataConfirmed: true` が必要です。月次品質ゲートの結果も添付し、推奨モードを反映したかを `qualityGateAttached` と `qualityGateModeApplied` で記録します。入力がない場合もテンプレートとチェックリストは出力しますが、判定は「AI拡大判断を保留」になります。

```bash
YAKUREKI_AI_CLINICAL_REVIEW_EVIDENCE=<匿名AI症例レビューJSON> YAKUREKI_AI_CLINICAL_REVIEW_OUTPUT_DIR=artifacts/ai-clinical-review npm run ai:clinical-review
```

パイロット店舗KPIの週次レビューは、患者名、患者ID、スタッフ名、薬局名、問い合わせ本文、外部URL、認証トークン、ローカルパスを含めない匿名JSONを入力にします。実証跡として合格させるには、`capturedAt`、匿名の `operatorReviewId`、元資料の `sourceArtifactSha256`、`noPatientDataConfirmed: true` が必要です。入力がない場合もテンプレートとチェックリストは出力しますが、判定は「パイロット継続判断を保留」になります。

```bash
YAKUREKI_PILOT_KPI_EVIDENCE=<匿名KPI JSON> YAKUREKI_PILOT_KPI_OUTPUT_DIR=artifacts/pilot-kpi-review npm run pilot:kpi-review
```

出力先には `pilot-kpi-review.json`、`pilot-kpi-review.csv`、`pilot-kpi-evidence-template.json`、`pilot-kpi-checklist.txt`、`pilot-kpi-evidence-request.json`、`pilot-kpi-evidence-request.txt` を保存します。提出依頼書には、匿名週次KPI、リリース後レビュー、SLA・障害対応レビュー、サポートトリアージ、改善アクション、責任者レビューごとに、必要項目、提出頻度、店舗内だけで扱う情報、サポートへ共有してよい集計値が入ります。複数店舗で4週間以上の匿名週次KPIをそろえ、返戻率、平均処理時間、閉店前残タスク、欠品率、フォロー期限内率、重大障害、問い合わせ負荷、改善アクションを確認してください。同じ匿名店舗IDで4週間以上そろうと、前半週と後半週を比べ、平均値だけでは見えない後半悪化も4週間トレンドとして判定します。レビューJSONは個人情報なし診断の `workflows.pilotKpi` に集計値だけで載せられ、保留があればサポートトリアージの「パイロットKPI」確認領域に出ます。ダミーや検証用データを実パイロットとして入力した場合、CLIは成果物を残したうえで終了コード1になります。

パイロット正式運用判定は、週次KPIだけでなく、更新運用、移行、帳票実紙検証、AI症例レビュー、オンライン資格確認、電子処方箋の公式運用試験を束ねます。`npm run pilot:operational-readiness` は、各レビューJSONを環境変数で受け取り、責任者レビュー、停止ルール、サポート引き継ぎが揃うまで正式運用候補にしません。入力のメタ情報には `capturedAt`、匿名の `operatorReviewId`、元資料の `sourceArtifactSha256`、`noPatientDataConfirmed: true` を入れてください。出力先には `pilot-operational-readiness.json`、`pilot-operational-readiness.csv`、`pilot-operational-readiness-evidence-template.json`、`pilot-operational-readiness-checklist.txt`、`pilot-operational-readiness-request.json`、`pilot-operational-readiness-request.txt` を保存します。提出依頼書には、各レビューJSONの作成コマンド、渡す環境変数、必要項目、店舗内だけで扱う情報、サポートへ共有してよい集計値が入ります。

```bash
YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE=<正式運用判定メタJSON> \
YAKUREKI_PILOT_KPI_REVIEW_JSON=<pilot-kpi-review.json> \
YAKUREKI_RELEASE_OPS_ACCEPTANCE_JSON=<release-ops-acceptance.json> \
YAKUREKI_MIGRATION_ACCEPTANCE_JSON=<migration-trial-acceptance.json> \
YAKUREKI_PRINT_FIELD_REVIEW_JSON=<print-media-field-verification.json> \
YAKUREKI_AI_CLINICAL_REVIEW_JSON=<ai-clinical-review.json> \
YAKUREKI_ELIGIBILITY_FIELD_READINESS_JSON=<online-eligibility-field-readiness.json> \
YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_READINESS_JSON=<electronic-prescription-field-readiness.json> \
YAKUREKI_PILOT_OPERATIONAL_READINESS_OUTPUT_DIR=artifacts/pilot-operational-readiness \
npm run pilot:operational-readiness
```

SLAレビューと問い合わせ訓練レビューを単体で実証跡として扱う場合も、入力JSONには実作業の `capturedAt`、匿名の `operatorReviewId`、元資料の `sourceArtifactSha256`、`noPatientDataConfirmed: true` が必要です。ダミーや検証用データを実問い合わせ・更新失敗訓練として入力した場合、`support:sla` と `support:drill` は成果物を残したうえで終了コード1になります。

リリース運用受入レビューは、更新準備、更新後、SLA、問い合わせ訓練の各レビューJSONを束ねて、実問い合わせまたは更新失敗訓練をもとに運用拡大してよいかを判定します。更新準備レビューと更新後レビューは同じ `releaseId` であること、SLAレビューの影響領域が問い合わせ訓練でも薬局・サポート確認済み、かつ再現済みであることも確認します。レビューJSONのローカルパスは成果物へ保存せず、患者名、スタッフ名、薬局名、問い合わせ本文、告知本文、URL、トークン、ローカルパスを含めない結果だけを出力します。更新準備レビュー、更新後レビュー、SLAレビュー、問い合わせ訓練レビュー、受入証跡JSONには、実作業の`capturedAt`、匿名の`operatorReviewId`、元資料の`sourceArtifactSha256`、`noPatientDataConfirmed`を入れてください。ダミーや検証用データを実問い合わせ・更新失敗訓練として入力した場合、CLIは成果物を残したうえで終了コード1になります。

```bash
YAKUREKI_RELEASE_READINESS_REVIEW_JSON=<更新準備レビューJSON> \
YAKUREKI_RELEASE_POST_REVIEW_JSON=<更新後レビューJSON> \
YAKUREKI_SUPPORT_SLA_REVIEW_JSON=<SLAレビューJSON> \
YAKUREKI_SUPPORT_DRILL_REVIEW_JSON=<問い合わせ訓練レビューJSON> \
YAKUREKI_RELEASE_OPS_ACCEPTANCE_EVIDENCE=<受入証跡JSON> \
YAKUREKI_RELEASE_OPS_ACCEPTANCE_OUTPUT_DIR=artifacts/release-ops-acceptance \
npm run release:ops-acceptance
```

出力先には `release-ops-acceptance.json`、`release-ops-acceptance.csv`、`release-ops-acceptance-evidence-template.json`、`release-ops-acceptance-checklist.txt` を保存します。レビューJSONは個人情報なし診断の `workflows.releaseOpsAcceptance` に集計値だけで載せられ、保留があればサポートトリアージの「リリース運用受入」確認領域に出ます。入力がない場合もテンプレートとチェックリストは出力しますが、判定は「運用拡大を保留」になります。

帳票実紙検証は、スクリーンショット回帰の `manifest.json` と、実プリンタ・実紙で確認したJSONを `npm run print:field-verification` に渡して確認します。CLIはレビューJSON/CSV、実紙確認テンプレートに加えて、帳票・実紙検証依頼書JSON/TXTを出力します。依頼書には調剤録、明細書、領収証、薬剤情報、薬袋、手帳シール、水剤ラベル、軟膏ラベルごとの紙種、想定寸法、確認項目、店舗内だけで扱う情報、サポートへ共有してよい集計値が入ります。実紙確認JSONには各帳票の `checkedAt`、匿名の `operatorReviewId`、`sourceArtifactSha256`、`noPatientDataConfirmed: true` を入れてください。レビューJSONは個人情報なし診断の `workflows.printMediaFieldVerification` に、証跡品質、実プリンタ確認、紙種一致、切れなし、文字の読みやすさ、余白、寸法確認の件数だけを載せます。患者名、薬品名入り原本、スクリーンショットファイル名、ローカルパス、プリンタ名、確認者名は共有成果物へ入れません。

```bash
YAKUREKI_PRINT_LAYOUT_MANIFEST=<runPrintLayoutRegressionのmanifest.json> \
YAKUREKI_PRINT_FIELD_EVIDENCE=<実紙確認JSON> \
YAKUREKI_PRINT_FIELD_OUTPUT_DIR=artifacts/print-media-field-verification \
npm run print:field-verification
```

出力先には `print-media-field-verification-review.json`、`print-media-field-verification-review.csv`、`print-media-field-evidence-template.json`、`print-media-field-check-request.json`、`print-media-field-check-request.txt` を保存します。実紙確認JSONが未指定、または未完了帳票がある場合もテンプレートと依頼書は出力しますが、判定は「実紙検証を確認」または「実紙検証が未完了」になります。

実プリンタ確認の前に現場へ依頼書だけ渡したい場合は、`YAKUREKI_PRINT_FIELD_REQUEST_ONLY=1` を指定します。この場合は `YAKUREKI_PRINT_LAYOUT_MANIFEST` なしで、実紙確認テンプレートと帳票・実紙検証依頼書だけを出力し、レビュー判定や進捗加点は行いません。

実データ相当の移行受入レビューは、患者、受付、在庫、薬歴のCSV/TSVまたは既存の移行パックレビューJSONを入力にして、1日テスト開始可否を判定します。患者と受付が結び付くこと、在庫を確認できること、薬歴と受付が結び付くことを「初日業務」として個別に判定し、3業務のうち何件が開始できるかも出力します。CSV原文、患者名、患者ID、受付ID、薬歴本文、ファイル名、ローカルパスは成果物へ保存せず、件数、指摘数、参照不整合、確認ゲートだけを出力します。移行受入証跡JSONには、実作業の`capturedAt`、匿名の`operatorReviewId`、元資料の`sourceArtifactSha256`、患者情報なし確認を入れてください。CLIは、薬局側へ渡す提出物依頼書も出力し、患者CSV、受付CSV、在庫CSV、薬歴CSV、証跡JSONの必要列、最低件数、店舗内だけで扱う情報、サポートへ共有してよい集計値を分けて確認できます。ダミーや検証用データを実データ相当として入力した場合、CLIは成果物を残したうえで終了コード1になります。

```bash
YAKUREKI_MIGRATION_PATIENT_CSV=<患者CSV/TSV> \
YAKUREKI_MIGRATION_VISIT_CSV=<受付CSV/TSV> \
YAKUREKI_MIGRATION_DRUG_STOCK_CSV=<在庫CSV/TSV> \
YAKUREKI_MIGRATION_SOAP_CSV=<薬歴CSV/TSV> \
YAKUREKI_MIGRATION_ACCEPTANCE_EVIDENCE=<移行受入証跡JSON> \
YAKUREKI_MIGRATION_ACCEPTANCE_OUTPUT_DIR=artifacts/migration-trial-acceptance \
npm run migration:trial-acceptance
```

出力先には `migration-trial-acceptance.json`、`migration-trial-acceptance.csv`、`migration-trial-acceptance-evidence-template.json`、`migration-trial-acceptance-checklist.txt`、`migration-trial-acceptance-sample-request.json`、`migration-trial-acceptance-sample-request.txt` を保存します。標準出力には初日業務の判定と開始可能業務数も含みます。レビューJSONは個人情報なし診断の `workflows.migrationTrialAcceptance` に集計値だけで載せられ、保留があればサポートトリアージの「移行受入・1日テスト」確認領域に出ます。入力がない場合もテンプレート、提出物依頼書、チェックリストは出力しますが、判定は「移行受入を保留」になります。

スタッフの端末移行、退職、パスキー紛失対応は、画面上の確認に加えて `staff:access-recovery-review` で匿名証跡レビューにできます。証跡JSONには確認日時、匿名確認ID、元資料SHA-256、患者情報なし確認、スタッフ名なし確認、薬局名なし確認、監査ログ本文なし確認、匿名ケースID、対象ロール、変更前バックアップ、外部保存、管理者残存、理由別確認、操作ログ、責任者確認だけを入れます。氏名、薬局名、監査ログ本文、ローカルパス、URL、トークン、パスワード、パスキー情報は入れません。レビュー結果は個人情報なし診断JSONの `workflows.staffAccessRecovery` にも要約でき、サポートトリアージでは保留時に「認証復旧・退職対応」として確認領域へ出します。設定画面の個人情報なし診断JSONでは、当月の対象操作だけを `workflows.staffAccessRecoveryMonthly` にまとめ、月次棚卸の判定、対象操作件数、3場面の不足、証跡品質の件数だけを共有します。対象操作がない月は「対象操作なし」として閉じつつ、導入前または年次訓練で3場面の匿名証跡を残す案内を出します。設定画面のスタッフタブからは同じ内容を「月次棚卸CSV」として直接書き出せます。CSV書き出しは監査ログ記録に成功した場合だけ開始します。サポートトリアージは `staffAccessRecovery` と `staffAccessRecoveryMonthly` のどちらかに保留があれば同じ確認領域へ出し、氏名や監査ログ本文を受け取らずに当月対象操作と不足ゲートだけを確認します。

```bash
YAKUREKI_STAFF_ACCESS_RECOVERY_EVIDENCE=artifacts/staff-access-recovery-review/evidence.json \
YAKUREKI_STAFF_ACCESS_RECOVERY_OUTPUT_DIR=artifacts/staff-access-recovery-review \
npm run staff:access-recovery-review
```

出力先には `staff-access-recovery-review.json`、`staff-access-recovery-review.csv`、`staff-access-recovery-evidence-template.json`、`staff-access-recovery-checklist.txt` を保存します。端末移行、スタッフ退職、パスキー紛失のいずれかが未確認、または管理者残存、変更前バックアップ、操作ログ、責任者確認が不足する場合は保留になります。

PMDA公式添付文書由来の相互作用・患者状態禁忌データは、取得後に `drug-label:queue-review` でキュー残件と旧データ混入を確認します。`pending`、`fetch_error`、`needs_review`、代表文書なし、不明status、旧`targetDrug`単数スキーマ、KEGG信号、PMDA以外の`sourceUrl`が残る場合はP4-01内部ゲートを閉じません。`fetch_error` は通信再試行、PMDA候補なし、その他へ分け、`needs_review` は上位理由を集計します。成果物には患者情報、PMDA HTML本文、ローカルパス、認証情報を入れず、件数、ゲート、残件サンプルだけを出します。

```bash
YAKUREKI_DRUG_LABEL_QUEUE_REVIEW_OUTPUT_DIR=artifacts/official-drug-label-queue-review npm run drug-label:queue-review
```

出力先には `official-drug-label-queue-review.json`、`official-drug-label-queue-review.csv`、`official-drug-label-queue-checklist.txt` を保存します。標準出力の `canCloseP401InternalGate` が `true` の場合だけ、PMDAラベル更新の内部ゲートを閉じられます。

PMDA候補なしの `fetch_error` は、通信失敗と同じ再試行対象にせず、`drug-label:no-candidate-review` で人確認と責任者確認を分けて残します。証跡JSONを渡す場合は、確認日時、匿名確認ID、元資料SHA-256、患者情報なし確認、PMDA検索再確認、代替候補確認、閉じ承認、責任者確認を入れます。

```bash
YAKUREKI_DRUG_LABEL_NO_CANDIDATE_EVIDENCE=artifacts/official-drug-label-no-candidate-review/evidence.json \
YAKUREKI_DRUG_LABEL_NO_CANDIDATE_OUTPUT_DIR=artifacts/official-drug-label-no-candidate-review \
npm run drug-label:no-candidate-review
```

出力先には `official-drug-label-no-candidate-review.json`、`official-drug-label-no-candidate-review.csv`、`official-drug-label-no-candidate-checklist.txt` を保存します。証跡が不足する場合はテンプレートも出し、`no_official_label_found` として閉じる候補にはしません。

## 5. データベーススキーマについて

RxDBのスキーマ定義（`src/db/schema.ts`）では、ジェネリック型 `RxJsonSchema<T>` を使用し、データインターフェースとデータベース構造を直接リンクさせています。これにより、コンパイル時にスキーマプロパティの検証が可能になります。
また、オフライン時のデータ永続性を確保するため、アプリケーションの読み込み時に `navigator.storage.persist()` を呼び出しています（`DatabaseProvider` 参照）。

### マスタデータ層

pharma-oss は単一 Web アプリ + RxDB を基本構成とし、患者、来局、処方内容、薬歴、在庫、監査ログ、施設設定などの業務データは RxDB に保持します。一方、薬品マスタ検索や用法コードのような参照マスタは `src/lib/master-data/` に分離し、RxDB にマスタ用コレクションを追加しない方針です。

参照マスタ層は `public/sqlite-master-data.worker.js` 経由で SQLite WASM を初期化します。既定では `public/sqlite/` に pin した `@sqlite.org/sqlite-wasm@3.53.0-build1` の runtime assets を同一オリジンで配信します。別 build を検証する場合は `NEXT_PUBLIC_SQLITE_WASM_MODULE_URL` と `NEXT_PUBLIC_SQLITE_WASM_BINARY_URL` を差し替えてください。ブラウザが OPFS VFS を利用できる場合は `/yakureki-master-data.sqlite3` に永続化します。SQLite WASM アセットが取得できない、または OPFS が使えない環境では、既存の JSON/in-memory 検索へフォールバックします。

医療機関、診療科、医師は専用マスタDBではなく Visit に保存し、`src/lib/master-data/provider_history.ts` で過去 Visit から候補化します。

## 6. プルリクエスト（PR）の作成
*   PR作成前には必ず Linter とテストを実行してください。
*   パフォーマンス改善のPRは、タイトルに ⚡ 絵文字を含め、説明に「💡 What」「🎯 Why」「📊 Impact」「🔬 Measurement」のセクションを設けてください。
*   UXやアクセシビリティ改善のPRは、タイトルに 🎨 絵文字を含め、説明に「💡 What」「🎯 Why」「📸 Before/After」「♿ Accessibility」のセクションを設けてください。
*   セキュリティ関連のPRは、タイトルに 🔒 絵文字を含め、説明に「🎯 What」「⚠️ Risk」「🛡️ Solution」のセクションを設けてください。
