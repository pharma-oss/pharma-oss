# 電子処方箋導入計画

最終更新: 2026-07-01

## 目的

yakurekiを薬局レセコンとして、電子処方箋管理サービスへ安全に接続する。コード上の対応は「公式接続試験へ持ち込める状態」までを範囲とし、本番運用可否は店舗端末・電子処方箋管理サービスでの現地証跡を必須にする。

公式確認元:

- 厚生労働省 システムベンダ向け電子処方箋ページ: https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/denshishohousen_systemvendor.html
- 電子処方箋管理サービス導入に関するシステムベンダ向け技術解説書 2.03版（令和8年3月）: https://www.mhlw.go.jp/content/001046588.pdf
- 電子処方箋対応版ソフトのリリースに関するセルフチェックリスト 4.2版（令和8年2月）: https://www.mhlw.go.jp/content/001177736.xlsx

外部インターフェイス仕様書、電子処方箋管理サービス記録条件仕様、標準テストシナリオは医療機関等ONSの最新版を使う。公開資料だけでCSVレコードや資格確認端末共有フォルダの独自実装を推測せず、接続モジュールでONS仕様へ変換する。

## 導入フェーズ

### 1. 接続方式を決める

オンライン資格確認等システムの環境を前提に、次のどちらで接続するかを決める。

- `qualification_terminal`: 資格確認端末の連携ソフト経由で接続する。
- `web_api`: Web APIで直接接続する。

yakureki本体は、資格確認端末またはWeb APIの差を直接UIへ出さず、院外に置く「yakureki電子処方箋接続モジュール」から正規化済みJSONを受け取る。

### 2. 接続モジュールを設定する

本番接続では次を設定する。患者情報を含む通信はHTTPSを必須とし、平文HTTPは接続モジュールが同一端末の `localhost` / loopback にある場合だけ許可する。URLへユーザー名・パスワードは埋め込まず、Bearer認証を使う。

```bash
ELECTRONIC_PRESCRIPTION_MODE=connector
ELECTRONIC_PRESCRIPTION_ENDPOINT=https://<yakureki-connector>/electronic-prescription
ELECTRONIC_PRESCRIPTION_BEARER_TOKEN=<secret>
ELECTRONIC_PRESCRIPTION_TIMEOUT_MS=10000
ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND=qualification_terminal
ELECTRONIC_PRESCRIPTION_CAPABILITIES=prescription_fetch,signature_verification,hpki_verification,duplicate_check,reception_cancel,dispensing_result,dispensing_result_search,dispensing_result_cancel,dispensing_result_change,refill_prescription,paper_prescription
ELECTRONIC_PRESCRIPTION_CSV_MAX_BYTES=1048576
ELECTRONIC_PRESCRIPTION_REQUIRED_DISPLAY_ITEMS=prescription_id,exchange_number,patient_birth_date,provider,doctor,issued_at,valid_until,document_kind,signature_status,duplicate_check_status,drug_code,drug_name,amount,unit,usage,days,unit_conversion,usage_supplement,prescription_comment,laboratory_result,narcotic_administration
ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MODE=polling
ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_POLL_INTERVAL_MS=3000
ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_STALE_AFTER_MS=120000
ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MAX_PENDING_FILES=100
ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_PERFORMANCE_P95_MS=1800
ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_RETRY_POLICY_CONFIRMED=true
```

本番の取得・操作APIは、`ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND`、全 `ELECTRONIC_PRESCRIPTION_CAPABILITIES`、`ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256`、Bearer認証トークン、患者情報なしpreflight成功記録を確認できない場合、接続モジュールへ送信しない。preflight時の接続先・認証・接続方式・必須機能・接続モジュール成果物が現在設定と一致しない場合も送信しない。設定画面の「外部連携」タブでは、URL・トークン・通信本文・成果物の生SHA-256を出さず、接続方式、必須機能、CSV最大バイト、必須表示項目、共有フォルダ/ポーリング、直近試行の成否だけを表示する。

接続先を設定したら、患者情報を含まない疎通試験として次を実行する。

```bash
npm run electronic-prescription:connector-preflight
```

preflight は `yakureki-electronic-prescription-preflight` だけを接続モジュールへ送り、患者氏名、生年月日、保険番号、電子処方箋ID、引換番号、処方内容は送らない。成果物にはURL、Bearerトークン、通信本文、応答本文を残さず、方式、必須機能、HTTPステータス種別、応答形状、所要時間、`ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_*` へ転記できるメモだけを出力する。`electronic-prescription-last-attempt.env` には接続先SHA-256、認証照合値、接続方式、必須機能、接続モジュール成果物SHA-256も記録し、現在設定と一致する場合だけ患者情報ありAPIを許可する。preflight が成功したら `electronic-prescription-last-attempt.env` の値を起動環境へ反映し、設定画面の「電子処方箋」が `設定OK` になってから受付試験へ進む。

接続モジュールの正規化JSON契約は、ONS外部インターフェイス仕様書、電子処方箋管理サービス記録条件仕様、標準テストシナリオの版と元資料SHA-256を添えて、次で検査する。

```bash
YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT=<contract.json> npm run electronic-prescription:connector-contract
```

契約サンプルには6桁引換番号取得、処方箋ID取得、同日複数処方箋、医師HPKI検証、単位変換・用法補足、提供診療情報・検査値、麻薬施用、重複投薬等チェック、調剤結果登録・検索復旧・変更・取消、紙原本のみの未署名調剤情報、調剤済み後の受付取消禁止、中断受付解消を含める。重複投薬等チェックの注意・停止サンプルは、匿名化済み確認メッセージを空にしない。各サンプルには一意な匿名サンプルIDを付け、同じIDを複数シナリオや複数操作へ使い回した契約レポートは公式試験に使わない。`connectorArtifactSha256` には契約サンプルを確認した接続モジュール配布物・設定パッケージのSHA-256を記録し、接続準備診断の成果物照合IDと一致しない契約レポートは公式試験に使わない。処方箋サンプルの患者名は「匿名」等の架空名にし、電子処方箋ID、引換番号、取得キーは `TEST` や匿名を含む合成識別子に差し替える。薬剤行は匿名薬名で、取得薬品名、yakureki表示薬品名、薬局マスタ薬品名の照合結果 `matched` を残し、`mismatch` または `not_checked` は契約NGにする。実患者氏名、保険番号、患者ID、本番の電子処方箋ID・引換番号・取得キー、接続URL、Bearerトークン、通信本文、CSV/XML生データ、生のHPKI証明書・シリアル・発行者名は入れず、SHA-256照合値と正規化済みJSONだけを残す。契約検査が `接続契約OK` にならない場合は、preflightが成功しても公式受付試験へ進まない。

### 3. 受付安全ゲートを確認する

受付画面では、取得キー種別を「引換番号」または「処方箋ID」から選び、電子処方箋IDまたは引換番号で取得する。引換番号の場合は被保険者番号も入力する。処方箋IDで取得する場合も、被保険者番号を任意入力すれば取得結果との照合に使う。取得後すぐに処方入力へ反映せず、次の条件を満たした場合だけ反映する。

- 患者・取得キー・被保険者番号が一致する。被保険者記号・番号は全角半角をそろえ、「・」「-」等の区切り記号の有無だけを吸収して照合し、区切りを除いた本体が異なる場合は別患者候補として停止する。
- 処方箋ID、処方日、有効期限、文書区分、医師の電子署名検証結果がある。
- 電子処方箋では署名検証が `valid` である。
- 有効期限内である。
- 処方箋情報提供ファイルでは、紙の処方箋原本を受領し、取得内容と照合済みである。
- 重複投薬・併用禁忌チェックが実施済みで、停止結果ではない。
- 取得内容SHA-256を記録できている。

デモ応答、未接続、署名未確認、期限切れ、重複確認未実施、受付停止結果は反映しない。

### 4. 公式操作APIを接続する

yakureki本体から接続モジュールへ、次の操作を送れるようにする。

- `duplicate_check`: 重複投薬・併用禁忌チェック。
- `reception_cancel`: 受付取消。
- `dispensing_result_register`: 調剤結果登録。
- `dispensing_result_search`: タイムアウト・再送後の調剤結果ID検索。
- `dispensing_result_cancel`: 調剤結果取消。
- `dispensing_result_change`: 調剤結果変更。

内部APIは `/api/electronic-prescription/operation` を使う。接続モジュールはURLや認証情報を返さず、操作結果、調剤結果ID、登録・更新日時、重複確認結果、調剤情報提供ファイルの電子署名有無・HPKI検証状態だけを返す。`duplicate_check` の成功応答では `passed`、`warning`、`blocked` の確認結果と、送信した全 `prescriptionIds` と一致する対象処方箋IDを必須にし、注意・停止結果では確認メッセージが空の応答を成功扱いにしない。HPKI検証結果には資格種別、証明書シリアル・発行者のSHA-256照合値、証明書有効期限、失効確認日時、任意のポリシーOIDを含められるが、生の証明書、シリアル、発行者名はyakurekiへ渡さない。失効確認日時はISO日時で記録し、医師HPKIでは署名検証日時以後、薬剤師HPKIでは調剤情報提供ファイルの署名日時以後の確認だけを成功扱いにする。ポリシーOIDを返す場合は数値アークのOID形式に限定し、形式不正なOIDを含む医師HPKIまたは薬剤師HPKI検証結果は成功扱いにしない。

受付反映後は、印刷/請求画面の「電子処方箋ライフサイクル」から同じ操作を実行する。同一患者・同一医療機関・同日発行の複数処方箋は1受付へ追加でき、各処方箋のID、文書区分、有効期限、署名状態、医師HPKIの資格種別・証明書照合値・有効期限・失効確認日時、重複確認状態、取得内容SHA-256を個別に保持する。調剤結果操作では代表IDと全 `prescriptionIds` を接続モジュールへ渡し、1つの調剤情報提供ファイルを各処方箋へ紐付ける。接続モジュールが調剤情報提供ファイルの署名状態を返した場合は、薬剤師HPKIの詳細検証結果とともに受付メタデータへ保存し、ライフサイクル画面と調剤録印刷へ出す。電子処方箋を基にした調剤情報提供ファイルでは薬剤師の電子署名を必須にし、紙原本・処方箋情報提供ファイルのみの場合は未署名でも、署名対象外として画面と印刷に残す。調剤結果登録・変更の操作入力で署名要否が未指定の場合は電子処方箋由来として `hpkiSignatureRequired: true` を接続モジュールへ渡し、未署名を許容するには操作情報の `signatureRequirement.hpkiSignatureRequired=false` を明示する。payload内だけで未署名許容を指定しても採用しない。署名不正、未確認、HPKI失効・期限切れ、薬剤師以外の資格種別、詳細検証結果不足を含む応答は、HTTP成功でも調剤結果登録成功として扱わない。薬剤行は医薬品コード廃止状態・廃止日、取得薬品名、yakureki表示薬品名、薬局マスタ薬品名、薬品名照合ステータス、単位コード/単位テキスト、用法コード、用法コードがない場合の用法テキストフォールバック、単位変換、用法補足を保存し、調剤結果payloadにも残す。取得薬品名、yakureki表示薬品名、薬局マスタ薬品名が一致しない、または照合未確認の場合は受付へ反映しない。提供診療情報レコード、検査値データ等レコード、麻薬施用レコードは受付・ライフサイクル画面・調剤録印刷に表示する。麻薬処方箋で麻薬施用レコードが欠ける場合は受付を止める。処方日時点で廃止済みの医薬品コードや、数値だけで単位を確認できない用量は受付・送信しない。調剤結果登録・変更は薬剤師確認の要修正が残る場合は送信せず、一度調剤済みとなった処方箋は調剤結果取消後も受付取消を行わない。調剤結果payloadは `yakureki-electronic-prescription-dispensing-result` の最小正規形に限定し、患者情報、医療機関名、接続URL、認証情報、通信本文、内部受付IDは送らない。操作送信時は正規化済み操作内容からSHA-256の `idempotencyKey` を生成し、`X-Yakureki-Idempotency-Key` ヘッダーと本文に付けて接続モジュール側の二重登録防止に使う。接続モジュールが同一 `idempotencyKey` に対して `duplicate`、`already_processed`、`idempotent_replay`、`replayed` を返した場合は、HTTP 2xxまたは409のどちらでもyakurekiでは処理済みの成功として扱う。409であっても明示的な重複状態がない競合は成功扱いにしない。受付取消の成功応答にはISO形式の取消・更新日時 `cancelledAt`、`canceledAt`、`registeredAt`、`updatedAt` のいずれかと、送信した全 `prescriptionIds` と一致する対象処方箋IDを必須にする。調剤結果登録・変更・取消・ID検索の成功応答には、有効な調剤結果ID、ISO形式の登録・更新日時 `registeredAt` または `updatedAt`、送信した全 `prescriptionIds` と一致する対象処方箋IDを必須にする。単一処方箋でも対象処方箋IDの照合結果を省略しない。変更・取消では応答IDが送信した調剤結果IDと一致することも確認する。タイムアウトや応答消失で登録成否が不明な場合は、再登録の前に `dispensing_result_search` で管理サービス上の調剤結果IDを検索し、見つかったIDと登録・更新日時を受付メタデータへ復元する。取得・操作結果のメッセージ、警告、重複確認メッセージは、接続URL、Bearerトークン、64桁ハッシュを伏せてから表示・保存する。HTTP成功でもJSONオブジェクトでない応答は通信成功とみなさず、処方入力へ反映しない。送信前と完了後は監査ログへ記録し、完了後は受付状態、調剤結果ID、最終更新日時、調剤情報提供ファイル署名・HPKI検証状態を受付メタデータへ保存する。

### 5. 現地試験を実施する

`npm run electronic-prescription:field-readiness` に、接続準備診断JSON、接続契約レポートJSON、現地確認証跡JSONを入力する。

```bash
YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS=<connector-readiness.json> \
YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_REPORT=<connector-contract.json> \
YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_EVIDENCE=<field-evidence.json> \
npm run electronic-prescription:field-readiness
```

証跡には患者氏名、生年月日、保険番号、電子処方箋ID、引換番号、薬品名、医療機関名、接続URL、認証情報、通信本文、HPKIの生証明書・生シリアル・発行者名を入れない。HPKIは資格種別、有効期限、失効確認日時、証明書SHA-256照合値だけを残す。接続契約レポートが `接続契約OK` でない場合や、別種類・古いschemaのJSONを指定した場合は、現地確認が揃っていても公式運用試験OKにしない。

現地確認証跡は総括のチェックだけでは足りない。`scenarioReviews` に、6桁引換番号取得、処方箋ID取得、同日複数処方箋、医師HPKI検証、単位変換・用法補足、提供診療情報・検査値、麻薬施用、重複投薬等チェック、調剤結果登録・検索復旧・変更・取消、紙原本のみの未署名調剤情報、調剤済み後の受付取消禁止、中断受付解消をそれぞれ1件以上、確認日時、シナリオごとに一意な匿名確認ID、元資料SHA-256、患者情報なし確認、テンプレートの `checkedItems` にあるシナリオ別必須確認項目付きで残す。欠けるシナリオや、日時・匿名ID・SHA-256・シナリオ別確認項目が不足するシナリオ、匿名確認IDを複数シナリオで使い回した証跡は正式運用OKにしない。

最低限、次を現地で確認する。

- 本番接続モジュールで受付対象を取得できる。
- 同一患者・同一医療機関・同日発行の複数処方箋を1受付へ追加し、各処方箋へ同じ調剤結果を紐付けられる。
- 6桁引換番号で取得でき、将来の16桁拡張をアプリ側で拒否しない。
- 「処方内容（控え）」を処方箋原本として扱わない。
- 処方医HPKIの資格種別、証明書照合値、有効期限、失効状態・確認日時を照合し、不足・不正・期限切れ・失効を受付しない。
- 処方日時点で廃止済みの医薬品コードを反映・送信せず、取得薬品名、yakureki表示薬品名、薬局マスタ薬品名の照合、単位コード/テキスト、単位変換、用法補足、用法テキストフォールバックが保存・送信に残る。
- 提供診療情報レコード、検査値データ等レコード、麻薬施用レコードが受付画面・ライフサイクル画面・調剤録印刷へ出る。麻薬処方箋で麻薬施用レコードが欠ける場合は受付を止める。
- CSV最大バイト、受付の必須表示項目、共有フォルダ滞留・ポーリング・再送・二重取込防止・P95処理時間を確認できる。
- 重複投薬・併用禁忌チェックを実行できる。
- 取消済み、変更済みを古い内容のまま反映しない。
- 調剤結果登録、ID検索、取消、変更を実行できる。
- 一度調剤済みとなった処方箋は、調剤結果取消後も受付取消できない。
- タイムアウト後に調剤結果IDを検索し、二重登録せず登録済みIDを復元できる。
- 電子処方箋由来の調剤情報提供ファイルでは、薬剤師HPKI資格種別、証明書照合値、有効期限、失効状態・確認日時が画面と調剤録印刷へ出て、不足・不正・未署名時は登録成功にならない。紙原本・処方箋情報提供ファイルのみの場合は、未署名を署名対象外として表示・印刷できる。
- 障害時の受付停止・復旧・再送手順を担当者が説明できる。

### 6. 本番可否判定

本番運用へ進める条件は次の通り。

- 設定画面の外部連携診断で電子処方箋が `設定OK`。
- 現地試験CLIが `OK`。
- パイロット正式運用判定で電子処方箋公式運用試験が必須レビューとして通過。
- 責任者レビュー、停止ルール、サポート引き継ぎが完了。

コード上のテスト通過だけでは本番可とはしない。
