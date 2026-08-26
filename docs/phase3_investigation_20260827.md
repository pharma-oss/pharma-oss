# Phase 3 調査結果 — 高額療養費・減免区分・返戻ワークフロー・薬価改定差分

- **調査日**: 2026-08-27
- **調査対象コミット**: `fc1dfd3`
- **前提**: `docs/implementation_plan.md` §4.3、`docs/handoff_20260826.md` §3

---

## 0. 結論

**4 項目とも「仕様が未定」ではありませんでした。**
公式仕様は支払基金の記録条件仕様に確定しており、しかも **本リポジトリはその仕様書を取得・解析する機構を既に持っています**
（`src/lib/receipt/dispensing_uke_official_spec_pdf.ts` / `/api/receipt/official-spec-pdf`）。

実際に残っているのは、次の 1 つの事実に集約されます。

> **公式レイアウトの UKE ビルダは、RE / HO / KO の必須項目しか出力していない。**
> 高額療養費・一部負担金・減免を載せる任意項目は、検証テーブル側に定義済みなのに書き込まれていない。

```
              出力している項目 / 仕様上の項目
RE レコード          6 / 41
HO レコード          5 / 13
KO レコード          5 /  9
```

| 項目 | 状態 | 実体 |
|---|---|---|
| 高額療養費 | 仕様確定・未実装 | RE の特記事項(index 7)・給付割合(6)・一部負担金区分(39) が未出力 |
| 減免区分 | 仕様確定・未実装 | HO の減免区分(10)・減額割合(11)・減額金額(12)・一部負担金(8) が未出力 |
| 返戻ワークフロー | **コード体系は実装済み・未接続** | `claim_return_manager.ts` が dead code。登録経路は自由記述 |
| 薬価改定差分 | 仕様確定・未実装 | `Drug.price` が単一値。適用日も版も持たない |

---

## 1. 仕様の所在（再現手順つき）

出典は `src/lib/official_audit.ts` の `OFFICIAL_AUDIT_SOURCES.mhlwReceiptRecordCondition` に登録済みです。

```
支払基金 令和8年6月版 レセプト電算処理システム記録条件仕様（調剤用）
https://www.ssk.or.jp/seikyushiharai/iryokikan/download/index.files/iryokikan_in_07.pdf
```

リポジトリ自身の取得関数で本文を取り出せます（許可オリジンは ssk.or.jp に固定されています）。

```ts
import { fetchDispensingUkeOfficialSpecPdf } from '@/lib/receipt/dispensing_uke_official_spec_pdf';
const result = await fetchDispensingUkeOfficialSpecPdf({ timeoutMs: 60000 });
// result.text に本文
```

2026-08-27 に実行した結果:

```
contentLength  1,223,665 bytes
textLength     386,387 文字
completionGate 未完了 / レコード 8/20 / 項目 9/23
               未抽出 YK・HO・KO・SN・MF・SH・TO・MN・JY・ON・EX・RC
               未定義 IY・JD・RE・ST
```

**完了ゲート自体が未完了である**ことも、そのまま Phase 3 の作業対象です。
「未抽出」は PDF 本文からその項目表を抽出できていないもの、
「未定義」は仕様点検表で生成スコープが未分類のものを指します
（`src/lib/receipt/dispensing_uke_spec_pdf.ts:490` / `:554`）。

---

## 2. 項目別の実測

### 2.1 高額療養費

**仕様（記録条件仕様 別表7・別表8）**

別表7 レセプト特記事項コードに、高額療養費の適用区分がそのまま定義されています。

| 区分 | コード |
|---|---|
| 70歳未満の所得区分 | 26 区ア / 27 区イ / 28 区ウ / 29 区エ / 30 区オ |
| 多数回該当 | 31 多ア / 32 多イ / 33 多ウ / 34 多エ / 35 多オ |
| 後期高齢者医療のみ | 41 区カ / 42 区キ / 43 多カ / 44 多キ |

> 「コード」欄の「41」〜「44」は令和4.3.25 保医0325第1号に基づき後期高齢者医療のみ記録、令和4年9月診療以前分は記録しない

別表8 一部負担金区分コードは、70歳以上の低所得者区分（適用区分 II = コード1、適用区分 I = コード3）で、
**注として「高額療養費が現物給付された者に限り記録する」** と明記されています。

**実装**

- `高額療養費` の参照は `src` 全体で **0 箇所**（引き継ぎ書の実測と一致）。
- RE レコードのビルダ [dispensing_uke_official.ts:186](../src/lib/receipt/dispensing_uke_official.ts) は
  `レセプト番号 / レセプト種別 / 調剤年月 / 氏名 / 男女区分 / 生年月日` の 6 項目のみ。
  **給付割合(index 6)・レセプト特記事項(index 7)・一部負担金区分(index 39) は出力していません。**
- 一方、検証テーブル [dispensing_uke_validation.ts:575](../src/lib/receipt/dispensing_uke_validation.ts) には
  index 0〜40 の全項目が定義済みです。**仕様の写しは既にコードにあります。**
- 自己負担額の計算 [billing.ts](../src/lib/billing.ts) は 32 行で、点数 × 負担割合の丸めのみ。
  限度額の頭打ちも、月内合算も、多数回該当もありません。

### 2.2 減免区分

**仕様（別表10 および HO レコードの記録条件）**

```
別表10 減免区分コード   1 減額 / 2 免除 / 3 支払猶予
```

記録条件（PDF 本文より）:

- 減免区分は「一部負担金減額、免除、徴収猶予証明書」が提示された場合、
  または広域連合長から一部負担金の減額・免除・徴収猶予を受けた場合に記録
- 減額割合は「割」単位で減額される場合に百分率(%)で記録
- 減額金額は「円」単位で減額される場合に記録
- 証明書番号は国民健康保険の「一部負担金減額、免除、徴収猶予証明書」に番号がある場合に記録
- 一部負担金は「一部負担金が必要な場合は当該金額を記録する」

**実装**

- `減免` の参照は **検証テーブルの 1 行のみ**（`dispensing_uke_validation.ts:622`）。値を作る側は存在しません。
- HO ビルダは `保険者番号 / 被保険者記号 / 被保険者番号 / 処方箋受付回数 / 合計点数` の 5 項目のみ。
  **証明書番号(7)・一部負担金(8)・減免区分(10)・減額割合(11)・減額金額(12) は未出力。**
- KO ビルダも 5 項目のみで、**一部負担金額(6)・公費給付対象一部負担金(8) は未出力**です。

### 2.3 返戻ワークフロー — ここだけ性質が違います

**返戻理由コードの体系は、すでに実装されています。**

[claim_return_manager.ts](../src/lib/claim_return_manager.ts) に、コード・カテゴリ・対処・推奨メモを持つ 6 件が定義済みです。

```
R01 保険資格失効・変更          (insurance)
R02 被保険者記号・番号誤り      (insurance)
R03 公費負担者・受給者番号不一致 (public_insurance)
R04 調剤報酬算定要件不備        (calculation)
R05 処方箋指示と請求内容不一致  (prescription)
R99 その他（審査機関照会）      (other)
```

**しかし、このモジュールは自身のテスト以外から一切参照されていません（dead code）。**

```bash
grep -rn "OFFICIAL_CLAIM_RETURN_REASONS\|buildReturnCorrectionSummary\|getClaimReturnReasonByCode" src \
  | grep -v claim_return_manager
# → claim_return_manager.test.ts のみ
```

実際の返戻登録は自由記述です。

```ts
// src/app/print/[visitId]/page.tsx:838
const reason = window.prompt('返戻理由を入力してください (例: 保険者番号不一致、用法不備等):');
```

一方、下流はコードを前提にしています。

- `monthly_claim_uke.ts:2404` — 「受付NGまたは返戻理由を、患者情報を含まないコードで記録してください。」
- `online_claim_acceptance.ts:67` — 受付結果ファイルから `返戻理由 / 返戻事由 / 事由` 列を取り込む

つまり **入口だけが自由文字列で、体系も下流も既にある**状態です。ここは新しい仕様を決める必要がありません。

### 2.4 薬価改定差分

**実装**

```ts
// src/db/types.ts:47
export interface Drug {
  code: string;
  name: string;
  ...
  price?: number;   // 単一値。適用日も版も持たない
}
```

- 薬品マスター取込は provenance（SHA-256・取得元 URL・取得日時・行数）を残しますが、
  価格そのものは上書きされます（`drug_master_provenance.ts`）。
- CSV レイアウトには **項番34「経過措置年月日又は商品名医薬品コード使用期限」** の定義が既にあります
  （`drug_master_csv.ts:140`）。取込口はできています。
- 結果として、**改定日をまたぐ月遅れ請求・返戻再請求で、改定後の薬価で再計算されます。**
  調剤日時点の薬価を再現する手段がありません。

---

## 3. 実装計画

依存の小さい順です。1 と 2 は互いに独立しています。

### P3-A 返戻理由コードの接続 — **完了（2026-08-27）**

1. ~~`handleRegisterReturn` の `window.prompt`~~ → 返戻理由コードの選択 UI ＋ 補足メモ欄に置き換え
2. `ClaimLifecycleState.returnReasonCode` と履歴イベントの `reasonCode` を追加（visits schema v20 → v21）
3. 監査ログを `buildReturnCorrectionSummary` の `auditDetails` に統一
   （実測: `レセプト返戻処理: [R03] 公費負担者・受給者番号不一致 (対応者: … / メモ: …)`）
4. `online_claim_acceptance.ts` の取込に `inferClaimReturnReasonCode` を接続し、
   施設ごとに揺れる自由記述を R コードへ寄せる（該当なしは R99）
5. 記録済みの返戻理由コードを請求ライフサイクルパネルに表示

実ブラウザで、R03 を選んで登録 → リロードしても DB から `返戻対応` と
`記録済みの返戻理由: R03 公費負担者・受給者番号不一致` が復元されることを確認済み。

### P3-B RE / HO / KO の任意項目出力（高額療養費・減免はここに集約）

1. 入力インターフェースの拡張
   - `DispensingUkeOfficialClaimCommonInput` に `benefitRatio` / `specialNotes` / `copaymentCategoryCode`
   - `DispensingUkeOfficialInsuranceInput` に `certificateNumber` / `copaymentYen` / `reductionCode` / `reductionRatio` / `reductionYen`
   - `DispensingUkeOfficialPublicExpenseInput` に `copaymentYen` / `publicBenefitCopaymentYen`
2. 別表7（特記事項）・別表8（一部負担金区分）・別表10（減免区分）を、
   検証テーブルと同じ形でコード表としてモジュール化する
3. 患者マスターに適用区分と減免情報を持たせる
   （`insuranceInfo` には現在 `burdenRatio` はあるが**適用区分がありません**）
4. `calculateInsuranceAmounts` に自己負担限度額の頭打ちを入れる

### P3-C 薬価の版管理

1. `Drug.price` を履歴化する（`priceHistory: { price, validFrom, validTo? }[]` 等）
2. 点数計算を「調剤日時点の薬価」で引くようにする
3. マスター取込時に、既存価格との差分を改定として記録する（provenance に取得日時があるので接続可能）
4. 経過措置年月日を算定可否の判定に使う

### P3-D 仕様書突合ゲートの完走

`fetchDispensingUkeOfficialSpecPdf` の完了ゲートを「未完了」から進める作業です。
現在 20 レコード中 8 レコードしか PDF 本文から抽出できていません。
P3-B の作業と同じ資料を読むので、まとめて進めるのが効率的です。

---

## 4. 実装前に確認したい 1 点

**適用区分（区ア〜区オ等）の入手経路。**

- オンライン資格確認では限度額適用区分を取得できますが、
  `src/lib/online_eligibility.ts` は現在これを抽出していません。
- `insuranceInfo` にも適用区分のフィールドがありません（`src/db/types.ts:249`）。

資格確認から取る／窓口で手入力する のどちらも実務上ありうるため、**両方を実装する**前提で進めます
（資格確認から取得できた場合はそれを既定値にし、手入力で上書き可能にする）。
これで困る運用があれば、着手前に指摘してください。

---

## 5. 検証方法

- 別表のコード表は**公式仕様 PDF の本文と突合するテスト**にできます。
  `fetchDispensingUkeOfficialSpecPdf` は既にあるので、
  ネットワークに出ないよう `fetchImpl` を差し替えて固定のサンプル本文と突合する形が取れます。
- 出力側は `dispensing_uke_validation.ts` の全項目定義に対する検証が既にあります。
  任意項目を出力し始めたら、この検証が桁数・形式を見ます。
- 返戻コードの接続は、`claim_actions.test.ts` と同じくモック DB で
  「監査ログにコードが残ること」を実挙動で確認できます。


#### 実装済み（2026-08-27）

| 層 | 内容 |
|---|---|
| コード表 | `src/lib/receipt/dispensing_uke_code_tables.ts`。別表7（33件）・別表8・別表10 を公式PDF本文と突合して写した |
| ビルダ | RE 第7/8/40項目、HO 第8/9/11-13項目、KO 第7/9項目を出力。任意項目が無ければ既存出力と1バイトも変わらない |
| 患者マスター | `insuranceInfo` に適用区分・多数回該当・一部負担金区分・減免（区分/割合/金額/証明書番号）を追加（patient schema v3 → v4） |
| 組み立て | `buildMonthlyClaimOfficialClaimInput` が患者マスターから RE/HO へ流し込む |
| 安全弁 | 適用区分が記録条件を満たさない場合（例: 社保の患者に区カ）は readiness error になり、**公式提出そのものが止まる**。区分の抜けたレセプトは出さない |

#### 意図的にやっていないこと

- **HO 一部負担金額（第9項目）の自動算出はしない。** 記録条件は「一部負担金が必要な場合は
  当該金額を記録する」だが、窓口で実際に徴収した額は高額療養費の現物給付・世帯合算・
  処方元医療機関との関係で決まる。点数×負担割合から機械的に出すと、
  患者への請求額を誤る。ビルダは `copaymentYen` を受け取れる状態にしてあるので、
  MF（窓口負担額情報）と同じく明示入力の経路を用意する形が妥当。
- **自己負担限度額そのものの計算はしない。** 同上の理由。区分の「記録」と額の「算出」は別。
