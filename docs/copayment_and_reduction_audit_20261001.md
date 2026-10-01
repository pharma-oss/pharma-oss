# トラック C-4：減免区分・高額療養費の入力欄と公式出力の対応点検・接続 報告書

## 1. 概要と背景
調剤報酬請求（レセプト電算処理仕様）において、高額療養費（限度額適用認定証・多数回該当・一部負担金区分）および一部負担金減免（減額・免除・支払猶予）は、患者の窓口徴収額および審査支払機関（支払基金・国保連）への請求データに重大な影響を及ぼします。

- **別表7 レセプト特記事項コード（RE 第8項目）**: 限度額適用認定証の区分ア〜キ（「区ア」〜「区キ」）、多数回該当（「多ア」〜「多キ」）。
- **別表8 一部負担金区分コード（RE 第40項目）**: 70歳以上の低所得者世帯（コード「1」: 区分II、「3」: 区分I）。
- **一部負担金（HO 第9項目 / KO 第7項目・第9項目）**: 窓口で実際に徴収した金額。
- **証明書番号（HO 第8項目）**: 国民健康保険一部負担金減額・免除・徴収猶予証明書の番号（3桁）。
- **別表10 減免区分コード（HO 第11〜13項目）**: 「1」: 減額（割合%または金額円）、「2」: 免除、「3」: 支払猶予。

これまで Pharma-OSS では、公式電算処理エンジン（`dispensing_uke_official.ts`）にこれらの出力ロジックが実装されていたものの、**現場UI（患者情報編集モーダル）に入力欄が存在せず、保存時に既存データが消失する構造的リスク**や、受付・窓口での見落としリスクが存在していました。

本ステップでは、入力欄・表示バッジ・注意ガイダンス・事前点検（Readiness Check）の全導線を接続・点検し、安全な運用基盤を確立しました。

---

## 2. 点検結果と実施した改修

### 2.1 既存入力欄と公式出力の対応表（マッピング点検）
| 項目名 | レセプト電算位置 | DB 保存先 | UI 入力・表示場所 | 点検結果・対応 |
| :--- | :--- | :--- | :--- | :--- |
| **高額療養費適用区分** | RE 第8項目（別表7） | `patient.insuranceInfo.highCostLimitCategory` | 患者登録モーダル / EMRバナー / 受付カード | **新設接続**。ア〜キの選択式入力とバッジ表示を配備。 |
| **高額療養費多数回該当** | RE 第8項目（別表7） | `patient.insuranceInfo.highCostMultipleOccurrence` | 患者登録モーダル / EMRバナー / 受付カード | **新設接続**。チェックボックス入力と「多○（多数回）」バッジを配備。 |
| **一部負担金区分コード** | RE 第40項目（別表8） | `patient.insuranceInfo.copaymentCategoryCode` | 患者登録モーダル / EMRバナー / 受付カード | **新設接続**。コード1（低所得II）/ 3（低所得I）の選択式入力を配備。 |
| **一部負担金減免区分** | HO 第11項目（別表10） | `patient.insuranceInfo.copaymentReduction.code` | 患者登録モーダル / EMRバナー / 受付カード | **新設接続**。1:減額 / 2:免除 / 3:支払猶予の選択式入力を配備。 |
| **減免割合・金額** | HO 第12/13項目 | `patient.insuranceInfo.copaymentReduction.{ratioPercent, reducedYen}` | 患者登録モーダル | **新設接続**。減額選択時のみ数値入力欄を表示。 |
| **減免証明書番号** | HO 第8項目 | `patient.insuranceInfo.copaymentReduction.certificateNumber` | 患者登録モーダル | **新設接続**。3桁の数字入力を検証付きで配備。 |
| **保険一部負担金額** | HO 第9項目 | `visit.claimOptions.officialInsuranceCopaymentYen` | 印刷画面（`/print/[visitId]`） | **接続済み・ガイダンス強化**。患者が高額療養費・減免対象者の場合に警告アラートを表示。 |
| **公費一部負担金額 / 給付対象** | KO 第7項目 / 第9項目 | `visit.claimOptions.officialPublicExpenseCopayments` | 印刷画面（`/print/[visitId]`） | **接続済み**。複数公費（最大4件）と順序・件数が1:1一致。 |

### 2.2 データ消失バグの解消と構造化編集フォームの配備
- **患者編集モーダル（`PatientBanner.tsx`）**:
  - `handleSaveInsurance` において、`highCostLimitCategory` や `copaymentReduction` が保存時に空オブジェクトで上書きされ消失していた問題を解消。
  - 純粋モジュール `fromEditableCopaymentSupport` を介してパッチを確実にマージ保存する安全構造を確立。
  - モーダル内に「高額療養費・限度額適用認定証」および「一部負担金減免」の構造化セクションを追加。

### 2.3 現場の見落とし・徴収誤りを防ぐアラート・ガイダンス接続
- **患者バナー（EMR）および処方受付（OCR）**:
  - 患者選択時、高額療養費（「限度額: 区ウ」「限度額: 多ウ（多数回）」）や減免（「減免: 免除」「減免: 50%減額」）のバッジを即座に表示。
- **印刷画面（`/print/[visitId]`）**:
  - 一部負担金入力ブロック（`official-copayment-block`）において、患者が高額療養費認定証や減免証を所持している場合に目立つ注意アラート（`copayment-guidance-banner`）を表示。
  - 「免除のため窓口徴収額が0円であることを確認してください」等の具体的な注意事項を表示し、誤徴収を未然に防止。

### 2.4 月次ワークベンチ公式事前点検（Readiness Check）の統合
- `buildMonthlyClaimUkeOfficialReadinessReport`（`monthly_claim_uke.ts`）に `validateCopaymentSupportReadiness` を統合。
  - 不正な一部負担金区分コード（別表8外）
  - 不正な減免区分コード（別表10外）
  - 減額設定時の割合・金額未設定
  - 国保減免証明書番号の桁数不正（3桁以外）
  などを公式提出前に厳格に検知・警告。

---

## 3. 検証実績（honest-verification 遵守）
- **型検査**: `npx tsc --noEmit` により型エラー 0 件を確認。
- **Fail-First Mutation 実証**:
  - `patient_copayment_support.ts` の `fromEditableCopaymentSupport` を意図的に変異させ、テストが失敗することを実測。
  - `monthly_claim_uke.ts` の事前点検ループを意図的に無効化し、テストが `AssertionError: false == true` で失敗することを実測。
  - いずれも変異復元後に PASS を確認。
- **契約テスト**: `src/lib/receipt/patient_copayment_support.test.ts`（7件）を含むレセプト関連テスト 148 件全 PASS。
- **全テストスイート**: `npm test`（1,795 件）全 PASS（0 fail, 0 cancelled, 0 skipped）。
- **静的解析**: `npm run lint` により エラー 0 件（0 errors, 11 warnings: warning は既存のもののみ）を確認。
- **本番ビルド**: `npm run build` により 全 28/28 ページの静的生成およびバンドル成功を確認。
