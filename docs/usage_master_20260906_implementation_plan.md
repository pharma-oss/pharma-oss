# 用法マスタと剤形整合の実装計画書（2026-09-06）

対象コミット: `127636a`（`main`）
ベースライン実測値（作業前に自分で再取得して一致を確認すること）:

| 検証 | コマンド | ベースライン |
|---|---|---|
| 型検査 | `npx tsc --noEmit` | エラー 0 件 |
| Lint | `npm run lint` | error 0 / warning 11 |
| テスト | `npm test` | 1677 pass / 0 fail / 71 suites |
| ビルド | `npm run build` | 成功 / 28 ページ |

`.agents/AGENTS.md` の行動ルールを最優先で遵守すること。特に **`npx tsc --noEmit` の単独実行**、**偽カバレッジの禁止**、**fail-first mutation の 4 手順実測**、**指示範囲外の独断変更の禁止**。1 PR = 1 コミット。

---

## 1. 出発点（利用者の決定）

1. **外用・頓服の用法候補は、公式の用法マスタを取り込んで用意する。** コード番号をこちらで発番することは禁止。
2. **用法欄は自由入力をやめ、マスタからの選択にする。自由記載は用法とは別のコメント欄を新設してそこに入れる。**

---

## 2. 調査結果

### 2.1 支払基金の基本マスターに用法マスターは無い（実取得で確認）

`https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.html` を実際に取得して掲載マスターを列挙した結果、次の 10 種のみで **用法マスターは含まれない**。

> 医科診療行為 / 歯科診療行為 / 調剤行為 / 医薬品 / 特定器材 / コメント / 傷病名 / 修飾語 / 歯式 / 訪問看護療養費

したがって既存の医薬品マスタ取込基盤（`src/lib/drug_master_official_page.ts` の `SSK_DRUG_MASTER_PAGE_URL`、`/api/drug-master/official-page`、`/api/drug-master/official-file`）を**そのまま流用することはできない**。取得元が別サイトになる。

### 2.2 用法マスタは厚労省のサイトから誰でも直接ダウンロードできる（実取得で確認）

医療機関等向け総合ポータルサイト（`iryohokenjyoho.service-now.com`）は SPA で匿名取得ではコンテンツが返らずログインが必要だが、**実ファイルは厚生労働省のサイトに公開されており、ログイン不要で取得できる**。

掲載ページ: https://www.mhlw.go.jp/stf/denshishohousen_shizai_00001.html

| 資料 | 形式 | URL |
|---|---|---|
| **用法マスタ（本体・コード一覧）** | xlsx 465KB | https://www.mhlw.go.jp/content/11120000/001056865.xlsx |
| 処方・注射オーダ標準用法規格 電子処方箋用法適用ガイド（令和7年7月1日） | PDF 382KB | https://www.mhlw.go.jp/content/11120000/001509213.pdf |
| 医療機関等において用法マスタを準備する際の留意点等 1.3版（令和7年7月1日） | PDF 488KB | https://www.mhlw.go.jp/content/11120000/001119768.pdf |
| 用法マスタ改定にかかる概要資料 | PDF 1009KB | https://www.mhlw.go.jp/content/11120000/001510229.pdf |
| 用法マスタ改定にかかる概要資料_別添 | xlsx 658KB | https://www.mhlw.go.jp/content/11120000/001509337.xlsx |
| （別紙）標準コードで記録可能な用法例について 1.0版 | PDF 824KB | https://www.mhlw.go.jp/content/11120000/001156238.pdf |

**本体は xlsx であり CSV ではない。** 既存の医薬品マスタ取込（CSV/ZIP）とは入力形式が異なるので、パーサをそのまま流用できない点に注意すること。

参考として、JP-CLINS が同一マスタを FHIR ValueSet として公開しており、機械可読な JSON が取得できる（**3,174 コード**、version 2025.7.1、CodeSystem: `http://jpfhir.jp/fhir/core/mhlw/CodeSystem/MedicationUsage_ePrescription`）。
https://jpfhir.jp/fhir/clins/igv1/ValueSet-JP-valueSet-MedicationUsageMHLW-Prscription.html

**ただし取り込みの正本は厚労省の xlsx とすること。** ValueSet は第三者による写しであり、版ずれの可能性がある。照合用の参考に留める。

### 2.2b 用法マスタの構造（実ファイルを開いて確定。推測は含まない）

`001056865.xlsx` を実際に取得して全シート・全行を解析した結果。**剤形の導出規則は推測不要で、マスタが明示的に列として持っている。**

**シート構成（6枚）**

| シート | 内容 |
|---|---|
| 電子処方箋用法マスタ（251101以降） | 本体。**データ 1,803 行** |
| 【参考】用法マスタレイアウト表（251101以降） | 列定義 19 項目 |
| 【参考】標準整理番号と用法コード（調剤レセプト）の関係 | 対応表 |
| 【参考】用法コード（調剤レセプト）一覧 | 別表12 の 3 桁コード一覧 |
| 電子処方箋用法マスタ（251031以前） | 旧版 |
| 【参考】用法マスタレイアウト表（251031以前） | 旧版の列定義 |

本体シートは 1 行目が項番（1〜19）、2〜3 行目がヘッダ（結合セル）、データはその後。**ヘッダにはルビ（カナ）が連結して入っているため、ヘッダ文字列の完全一致でマッチさせてはならない。** 1 行目の項番か列位置で取ること。

**列レイアウト（19 項目）**

| 項番 | 項目 | 型 | 桁 | 内容 |
|---|---|---|---|---|
| 1 | 用法コード | X | 16 固定 | 電子処方箋の用法コード |
| 2 | **基本用法区分コード** | X | 1 固定 | **1：内服、2：外用、3：注射、4：注入** |
| 3 | 基本用法区分 | N | 2 | 名称 |
| 4 | 用法詳細区分コード | X | 1 固定 | 内服: 0経口/1舌下/2バッカル/3口腔内塗布<br>外用: A貼付/B塗布/C湿布/D撒布/E噴霧/F消毒/G点耳/H点眼/J点鼻/K うがい/L吸入/M トローチ/N膀胱洗浄/P鼻腔内洗浄/Q浣腸/R肛門挿入/S肛門注入/T膣内挿入/U膀胱注入 ほか |
| 5 | 用法詳細区分 | N | 15 可変 | 名称 |
| 6 | **タイミング指定区分コード** | 9 | 1 固定 | 1食事ベース型 / 2回数指定（等間隔）型 / 3時刻指定型 / 4回数指定（イベント）型 / **5頓用指示型** / 6生活リズム型 / 7回数のみ指定型 / 8時間間隔指定型 |
| 7 | タイミング指定区分 | N | 60 可変 | 名称 |
| 8 | 用法名称 | N | 50 可変 | 画面・帳票に出す名称 |
| 9 | 標準用法整理番号 | 9 | 4 固定 | 標準用法用語集の整理番号。無い場合は省略 |
| 10 | 使用開始日 | 9 | 8 固定 | YYYYMMDD |
| 11 | 使用終了日 | 9 | 8 固定 | 未終了は `99999999` |
| 12 | 用法コード区分 | 9 | 1 固定 | 0標準コード / 1適用ガイドコード |
| 13 | 用法補足記録・頓用の条件指定 | 9 | 1 固定 | 0不要 / 1必要 |
| 14 | 用法補足記録・投与タイミング | 9 | 1 固定 | 0不要 / 1必要 |
| 15 | 用法補足記録・投与時刻 | 9 | 1 固定 | 0不要 / 1必要 |
| 16 | 用法補足記録・投与間隔 | 9 | 1 固定 | 0不要 / 1必要 |
| 17 | 用法補足記録・部位 | 9 | 1 固定 | 0不要 / 1任意 / 2左・右・両 / 3必須 |
| 18 | 用法カナ名称 | N | 120 可変 | 全角カナ |
| 19 | **用法コード（調剤レセプト）** | 9 | 3 固定 | 記録条件仕様（調剤用）「別表12 用法コード」のコード |

**実測した分布（1,803 行）**

```
基本用法区分:  内服 253 / 外用 957 / 注射 565 / 注入 28
タイミング指定: 食事ベース181 / 等間隔5 / 時刻指定300 / イベント10 /
                頓用指示 585 / 生活リズム140 / 回数のみ546 / 時間間隔36
用法コード区分: 標準 1702 / 適用ガイド 101
使用終了日が 99999999 以外（廃止済）: 0 件
```

**16 桁コードの構造（全 1,803 行で一致することを実測）**

```
桁1 == 項番2 基本用法区分コード       … 全行一致
桁2 == 項番4 用法詳細区分コード       … 全行一致
桁3 == 項番6 タイミング指定区分コード … 全行一致
```

例: `2A50110000000000` = 外用(2) + 貼付(A) + 頓用指示型(5) →「疼痛時　貼付」

**ただし実装ではコードを切り出さず、項番 2 / 6 の列をそのまま読むこと。** 導出規則が将来変わっても列は変わらないため。

### 2.2c 「頓服」は基本用法区分ではない（重要）

マスタの基本用法区分は **内服 / 外用 / 注射 / 注入** の 4 つで、**頓服という区分は存在しない**。頓服は「基本用法区分 1（内服）かつ タイミング指定区分 5（頓用指示型）」で表現される。

```
1050110000000000 | 基本1:内服 | 詳細0:経口 | タイミング5:頓用指示型 | 疼痛時　服用
```

本プロジェクトの `DosageCategory` への写像は次になる（実測件数つき）:

| DosageCategory | マスタ側の条件 | 件数 |
|---|---|---|
| `internal`（内服） | 基本用法区分 1 かつ タイミング ≠ 5 | 178 |
| `as_needed`（屯服） | 基本用法区分 1 かつ **タイミング = 5** | 75 |
| `external`（外用） | 基本用法区分 2 | 957 |
| `injection`（注射） | 基本用法区分 3 | 565 |
| `internal_drop`（内滴） | **該当区分なし** | 0 |
| （注入） | 基本用法区分 4 | 28 |

**`internal_drop`（内滴）と 基本用法区分4（注入）の扱いは §3.5-1 / §3.5-2 で決着済み。そちらに従うこと。**

### 2.2d 調剤レセプト用法コードはマスタが持っている（2.4 の問題が解決する）

項番 19 に「用法コード（調剤レセプト）」が **全 1,803 行に設定済み**（空 0 件、異なり 38 コード）。16 桁の電子処方箋コードから 3 桁の UKE コードへの対応表を、こちらで作る必要はない。

「用法コード（調剤レセプト）一覧」シートには次の注記がある。

> 調剤レセプト・用法コードに関しては、内服薬の用法に対して設定しており、**外用・注射・注入のコードについては設定していません**

実データでもそのとおりで、外用・注射・注入の 1,550 行はすべて `900`（未コード化用法）が入っている。**つまり外用の SH レコードで用法コードが空/900 になるのは仕様どおりであり、誤りではない。**

さらに重要な発見として、**現行リポジトリの `001`〜`048` ＋ `900` は、この「別表12 用法コード」そのものだった**（対応例: `1011000100000000`「１日１回朝食前 服用」→ `005`「１日１回朝食前服用」）。捨てる必要はなく、16 桁マスタの項番 19 として紐づく。

### 2.2e 用法補足レコードは仕様上必須（利用者の「別の自由入力欄」は仕様要求そのもの）

用法補足の要否を実測した結果:

```
頓用の条件指定 必要: 121 行
投与時刻       必要:  40 行
部位: 不要 706 / 任意 640 / 左右両 156 / 必須 301
用法コード区分 1（適用ガイドコード）: 101 行
  → 「当該コードだけでは回数及び条件等を指定できないため、
     必ず用法補足レコードを用いて用法を記録する」（レイアウト表 項番12）
```

**少なくとも 462 行（頓用条件121 + 投与時刻40 + 部位必須301、重複含む）と適用ガイドコード 101 行は、用法補足の記録が仕様上必須。** 用法欄を選択式にするなら補足欄は「あった方がよい」ではなく**無ければ仕様違反**になる。PR-G6 を PR-G5 と分離してはならない根拠がこれで一次資料により裏付けられた。

### 2.3 現行の用法候補は電子処方箋標準用法コードではない

`src/lib/master-data/usage_options.ts` は 53 件で、`001`〜`048` ＋ `900 未コード化用法` の **3 桁コード**。上記 16 桁体系とは別物である。さらに内訳は**全件が内服用法**（服用・毎N時間）であり、**外用・頓服の用法は 1 件も無い**。剤形で「外用」を選んでも候補に出るのは内服用法だけになる。

### 2.4 UKE（レセプト）の用法コードは 1〜3 桁で、電子処方箋の 16 桁とは別体系

`src/lib/receipt/dispensing_uke_official_body.ts:248`

```ts
if (input.usageCode) assertDigits(input.usageCode, '用法コード', 1, 3);
```

一方 `src/db/schema.ts:720` の `electronicUsageCode` は `maxLength: 50` で、電子処方箋から取り込んだコードがそのまま入る（`src/app/ocr/helpers.ts:231`）。**2 つの用法コード体系を 1 つのフィールドで持っている**ため、16 桁の電子処方箋コードを UKE 側へ流すと `assertDigits` で落ちる。現状は `src/lib/monthly_claim_uke.ts` から `usageCode` が一度も渡されていない（grep 0 件）ため **SH レコードの用法コードは常に空**で、問題が表面化していないだけである。

### 2.5 【新規発見・最重要】UKE の剤形コードが誤っており、テストが 1 件も無い

`src/lib/monthly_claim_uke.ts:948`

```ts
function deriveOfficialDosageFormCode(items: DispensingUkeItem[]): string {
  if (items.some((item) => (item.days ?? 0) > 0)) return '1';
  if (items.some((item) => /外|塗|貼|軟膏|クリーム|ローション/.test(String(item.usage || item.drugName || item.dispensedDrug || '')))) return '3';
  return '1';
}
```

これは `monthly_claim_uke.ts:1452` から呼ばれ、**支払基金へ提出する SH レコードの剤形コード**になる。コードを読む限り次の誤りがある（実行による確認は PR-G1 のテストで行うこと）:

1. **`days > 0` を最初に見て無条件に `'1'`（内服）を返す。** 外用薬に日数が入っていれば内服として提出される。これは `9967b94` で算定側の `isExternal` を直したのと**まったく同じ誤り**が、レセプト本体側に残っていたもの。
2. **屯服（`'2'`）を返す経路が存在しない。** 屯服薬は必ず `'1'` か `'3'` になる。
3. **内滴・注射の区分が無い。**
4. **`resolveDosageCategory` / `resolveEffectiveDosageCategory` を使っていない。** 剤形判定の 6 つ目の別実装であり、しかも最も外部に出る場所にある。

`deriveOfficialDosageFormCode` を参照するテストは **0 件**（`dispensing_uke_official_body.test.ts` はリテラルで `dosageFormCode: '1'` / `'3'` を渡しているだけで、導出は検証していない）。

### 2.6 用法候補を選ぶとコード番号が用法欄に混入する

`src/app/ocr/components/PrescriptionGroupEditor.tsx:129`

```tsx
<option key={usage.code} value={formatElectronicUsage(usage)} label={usage.code} />
```

`formatElectronicUsage` は `` `${code} ${label}` `` を返すので、候補から選ぶと用法欄が `001 1日3回食後服用` になる。この文字列は加工されずに保存され、`src/app/print/[visitId]/page.tsx:1257` が `item.usage` をそのまま薬袋のグループキー兼「使い方」表示に使う（除去処理は存在しない）。**患者に渡る薬袋に `001 1日3回食後服用` と印字される。**

なお `src/app/ocr/page.tsx:43` の `ELECTRONIC_USAGE_OPTIONS` / `formatElectronicUsage` の import は未使用（デッドインポート）。

---

## 3. 進行順とブロッカー

**用法マスタの実ファイルと構造は確定済み（2.2b〜2.2e）**。PR-G4 は着手可能。 剤形で候補を絞る改修（PR-G5）は、外用・頓服の候補が 0 件のままでは「選べない」どころか「何も選べない」画面になるため、マスタ取込より先に出してはならない。

```
PR-G1（UKE剤形コードの是正）        ← ブロックなし・最優先
PR-G2（用法コード混入バグの修正）    ← ブロックなし
PR-G3（用法候補に剤形を持たせる）    ← ブロックなし
        ↓
PR-G4（公式用法マスタ取込）          ← 構造確定済み。G4a の方式判断のみ要相談
        ↓
PR-G5（剤形による候補絞り込み・用法欄の選択式化）
PR-G6（用法補足コメント欄の新設）    ← PR-G5 と同時に出すこと
```

---

### 3.5 決定事項（2026-09-06、利用者判断。実装者はこれに従うこと）

**1. 内滴（`internal_drop`）で選べる用法は 3 件に限定する**

電子処方箋用法マスタに内滴の区分は無い（2.2c）。実務上、内滴の用法は次の 3 つしか使わない（利用者判断）。**3 つとも公式マスタに実在する**ことを実データで確認済み。

```
1011100000000000 | タイミング1:食事ベース型 | １日１回就寝前　服用 | 基本区分1:内服 | レセ=013
1050W20000000000 | タイミング5:頓用指示型   | 適宜　服用          | 基本区分1:内服 | レセ=900 | 頓用条件=必要
1050410000000000 | タイミング5:頓用指示型   | 便秘時　服用        | 基本区分1:内服 | レセ=900
```

この 3 件は基本用法区分では internal と as_needed にまたがるため、**区分からは導出できない。明示的な許可リストとして持つこと。**

```ts
/**
 * 内滴（内用滴剤）で選べる用法。
 * 用法マスタに内滴の基本用法区分が無く、実務で使う用法も限られるため、
 * 利用者判断により次の 3 件に限定する（表示順もこの順）。
 */
export const INTERNAL_DROP_USAGE_PRESCRIPTION_CODES = [
  '1011100000000000', // １日１回就寝前　服用
  '1050W20000000000', // 適宜　服用
  '1050410000000000', // 便秘時　服用
] as const;
```

`filterUsageOptionsByCategory` の写像:

| DosageCategory | 出す候補 | 件数 |
|---|---|---|
| `internal` | 基本区分1 かつ タイミング ≠ 5 | 178 |
| `as_needed` | 基本区分1 かつ タイミング = 5 | 75 |
| `external` | 基本区分2 | 957 |
| `injection` | 基本区分3 | 565 |
| **`internal_drop`** | **上記 3 コードのみ（許可リスト順）** | **3** |

**内滴には日数を入れない**（総量入力）。既存の `isDailyAmountItem` は `days <= 0` を全量として扱うため追加実装は不要だが、内滴のフィクスチャで全量表示になることをテストで固定すること。

**2. 基本用法区分 4（注入、28 件）は取り込まない**

全 28 件が腹膜透析・気管内注入・涙のう内注入・鼓室内注入・滑液嚢穿刺後の注入・腹腔内注入・病巣内注入で、いずれも「医療機関・医療従事者」「在宅・医療従事者」「在宅・自己」向け。本プロジェクトの `DosageCategory` に対応先が無く、外来調剤の用法選択肢としては通常出ない。**`DosageCategory` に区分を足すことはしない**（スキーマと算定に波及するため）。必要になった時点で改めて合意する。

**3. 用法マスタは静的同梱とし、薬局側での更新機能は作らない**

依存追加（`exceljs` 等）は行わない。オフラインで xlsx → TS に変換し、生成物をコミットする。用法マスタは改定頻度が低く（本版で廃止済みコード 0 件）、件数も 1,775 件・約 399KB と小さいため、医薬品マスタのような取込 UI・監査ログ・ロールバックは不要。

**4. 剤形を変更したとき、既存の用法が新しい剤形の候補に無い場合は「警告のみ」**

用法の値は**保持する**。自動クリアもブロックもしない。警告の出し方は PR-G5 に定める。

**5. PR-G6 のスキーマ変更を承認する（2026-09-06）**

`PRESCRIPTION_ITEM_SCHEMA` を version 17 → 18 に上げ、`usageSupplementText`（`maxLength: 500`）を追加してよい。移行は `legacyMigrationStrategies` に `17: keepDocument` を足すのみ。**承認範囲はこの 1 プロパティと 1 回の bump に限る。**

---

### PR-G1: UKE の剤形コード導出を剤形判定の正本に載せ替える

**対象**: `src/lib/monthly_claim_uke.ts`

**先にやること（記憶で書かない）**

剤形コードの取り得る値と各区分の割当は、**支払基金「レセプト電算処理システム記録条件仕様（調剤用）」で確認すること**。このリポジトリには既に仕様 PDF を取得・照合する仕組みがある（`src/lib/receipt/dispensing_uke_spec_pdf.ts`、`/api/receipt/official-spec-pdf`、`docs/handoff_20260827.md` に記載の `iryokikan_in_07.pdf`）。内服・屯服・外用以外（内滴・注射）に割り当てるコードが仕様上存在するかどうかも必ず本文で確認する。**確認できない区分については実装せず、報告に「仕様未確認」として書き出すこと。**

**変更内容**

1. `deriveOfficialDosageFormCode` を `resolveEffectiveDosageCategory`（`src/lib/dosage_category.ts`）ベースに書き換える。`days > 0` の先行判定は削除する。
2. グループ内に複数明細がある場合の代表区分は、`src/app/print/helpers.ts` の `getBagDosageCategory` と同じ優先度（手動指定を最優先、その後 `external > injection > as_needed > internal_drop > internal`）を使う。判定の分散をこれ以上増やさないため、**`getBagDosageCategory` を `src/lib/dosage_category.ts` に移して共有するか、同じ優先度テーブルを再利用すること**（どちらにするかは実装者判断でよいが、優先度の定義を 2 箇所に書かないこと）。
3. 仕様で確認できた区分だけを写像する。確認できない区分は既存の挙動（`'1'`）を維持し、コード内コメントに未確認である旨を残す。

**やってはいけないこと**: 仕様で確認できないコード値を推測で割り当てない。`assertDigits` の桁数制約を緩めない。`usageCode` の配線（2.4）は本 PR では触らない。

**テスト**（`src/lib/monthly_claim_uke.test.ts`）

`deriveOfficialDosageFormCode` は非公開なので、**テスト内で再実装せず**、公開 API（`buildMonthlyClaimUkeResults` など）経由で生成された SH レコードの剤形コードを検証すること。既存テストのフィクスチャ構築方法を流用する。

- 外用薬 + `days: 14`（モーラステープ 14 枚）→ 剤形コードが内服（`'1'`）に**ならない**こと
- 屯服薬（`dosageCategory: 'as_needed'`）→ 仕様で確認できた屯服のコードになること
- 内服薬 + `days: 28` → `'1'`（回帰）
- 手動指定（`dosageCategorySource: 'manual'`）が優先されること

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| G1-1 | `days > 0` の先行判定を戻す | テープ剤ケースが fail |
| G1-2 | 屯服の写像を内服に変える | 屯服ケースが fail |
| G1-3 | 手動指定の優先を外す | 手動指定ケースが fail |

**受入基準**: 3 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / **既存の UKE 関連テストが 1 件も壊れないこと**（壊れた場合は提出物の内容が変わっているので、変わった項目を列挙して報告し、指示を待つ）。

---

### PR-G2: 用法候補のコード番号が用法欄・薬袋に混入するのを止める

**対象**: `src/app/ocr/components/PrescriptionGroupEditor.tsx`, `src/app/ocr/page.tsx`

**変更内容**

1. `<option>` の `value` を `formatElectronicUsage(usage)` から **`usage.label` のみ**に変える。コードは `label` 属性側（ドロップダウンの副次表示）に回す。
2. `src/app/ocr/page.tsx:43` の未使用 import（`ELECTRONIC_USAGE_OPTIONS`, `formatElectronicUsage`）を削除する。
3. `formatElectronicUsage` 自体は他用途（監査ログ表示など）で使う可能性があるため**削除しない**。

**やってはいけないこと**: 既に `001 1日3回食後服用` の形で保存されている既存データを一括で書き換えない（マイグレーションは本 PR の範囲外。必要なら別途合意する）。

**テスト**（`src/app/print/helpers.test.ts` または新規）

- 用法候補の `value` にコード番号が含まれないこと（`ELECTRONIC_USAGE_OPTIONS` の各 label が `/^\d{3}\s/` にマッチしないことを、コンポーネントを `renderToStaticMarkup` して `<option value>` から実測する）

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| G2-1 | `value` を `formatElectronicUsage(usage)` に戻す | 上記テストが fail |

**受入基準**: 1 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run lint` の warning が 11 件から増えないこと。

---

### PR-G3: 用法候補に剤形を持たせる

**対象**: `src/lib/master-data/types.ts`, `src/lib/master-data/usage_options.ts`, `src/lib/master-data/usage_master.ts`

**変更内容**

1. `ElectronicUsageOption` に剤形を追加する。マスタ未取込でも壊れないよう**任意プロパティ**にする。

   ```ts
   export interface ElectronicUsageOption {
     code: string;
     label: string;
     /** 用法が属する剤形。未設定はマスタ側に区分情報が無いことを表す。 */
     category?: DosageCategory;
   }
   ```

2. 既存 53 件に `category` を付ける。`001`〜`048` は**すべて内服**（`'internal'`）。`900 未コード化用法` は区分不明なので **`category` を付けない**（未設定のまま残す）。
3. 剤形で候補を絞る純粋関数を `usage_master.ts` に追加する。

   ```ts
   /** 指定した剤形で選べる用法候補。category 未設定の候補（未コード化用法など）は常に含める。 */
   export function filterUsageOptionsByCategory(
     options: ElectronicUsageOption[],
     category: DosageCategory
   ): ElectronicUsageOption[];
   ```

**やってはいけないこと**: この PR では **UI を変えない**（絞り込みの適用は PR-G5）。外用・頓服の用法を**でっち上げて追加しない**。

**テスト**（新規 `src/lib/master-data/usage_master.test.ts`）

- `ELECTRONIC_USAGE_OPTIONS` の `001`〜`048` がすべて `category === 'internal'` であること
- `900` に `category` が無いこと
- `filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'external')` が **`900` のみ**を返すこと（＝現時点で外用の候補が存在しないという事実をテストで固定する）
- `filterUsageOptionsByCategory(..., 'internal')` が 49 件（001〜048 ＋ 900）を返すこと

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| G3-1 | `category` 未設定の候補を除外する | 外用フィルタのテストが fail |
| G3-2 | 適当な 1 件の `category` を `'external'` にする | 内服件数のテストが fail |

**受入基準**: 2 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass。

---

### PR-G4: 公式用法マスタの取込（静的同梱）

**前提**: 2.2b〜2.2e で列レイアウトと剤形の導出規則は**確定済み**。§3.5 の決定事項に従うこと。着手時に実ファイルを開き、2.2b の表および分布（内服253 / 外用957 / 注射565 / 注入28、計1,803行）と一致することを確認する。一致しなければ版が変わっているので手を止めて差分を報告する。

同梱済みファイル: `artifacts/mhlw-usage-master/001056865_yoho_master.xlsx`
（取得元・SHA-256 は同ディレクトリの `SOURCE.md`。`artifacts/` は gitignore 対象なので、無ければ SOURCE.md の URL から再取得する）

**方式（決定済み・案B）**: 依存を追加せず、**オフライン変換して静的同梱**する。薬局側での更新機能は作らない。

- 変換スクリプトを `scripts/buildUsageMaster.mjs`（または `.ts`）に置く。xlsx の読み取りは `artifacts/mhlw-usage-master/xlsx_dump.py` と同じく **zip + XML の直読み**で足りる（依存不要）。JS で書き直すか、Python スクリプトを呼ぶかは実装者判断でよい。
- 出力は `src/lib/master-data/usage_options.ts`（既存ファイルの置き換え）。
- **生成物をコミットする。** ビルド時に xlsx を読む構成にはしない。
- 生成物の先頭に、出典 URL・版（251101以降）・生成日・元ファイルの SHA-256 をコメントで残すこと。

**サイズの目安**: 取り込み対象 1,775 件でカナ込み JSON 相当 **約 399KB**。同ディレクトリの `drugs.json`（7.4MB）と比べて誤差の範囲であり、バンドルサイズを理由に項目を削る必要はない。

**PR-G4a: 型の拡張**

`ElectronicUsageOption` を拡張する。**項番 19（調剤レセプト用法コード）が既存の 3 桁 `code` に対応する**ので、既存フィールドの意味を変えないこと。

```ts
export interface ElectronicUsageOption {
  /** 調剤レセプト用法コード（別表12、3桁）。既存の意味を変えない。 */
  code: string;
  /** 用法名称（項番8） */
  label: string;
  /** 電子処方箋用法コード（項番1、16桁） */
  prescriptionCode?: string;
  /** 剤形。項番2と項番6から §3.5 の表に従って導出する */
  category?: DosageCategory;
  /** 用法カナ名称（項番18）。候補検索に使う */
  kana?: string;
  /** 用法補足レコードの要否（項番13/15/17）。補足欄を必須にするかの判定に使う */
  supplement?: {
    asNeededCondition: boolean;                          // 項番13
    administrationTime: boolean;                         // 項番15
    site: 'none' | 'optional' | 'lateral' | 'required';  // 項番17
  };
  /** 0:標準コード / 1:適用ガイドコード（項番12）。guide は補足記録が必須 */
  codeKind?: 'standard' | 'guide';
}
```

**PR-G4b: 変換と絞り込み関数**

1. 剤形の導出は **項番 2 と項番 6 の列を読む**。16 桁コードから切り出さないこと（2.2b 参照）。
2. **基本用法区分 4（注入、28 件）は取り込まない**（§3.5-2）。
3. 使用終了日（項番11）が `99999999` でない行は取り込まない（現時点 0 件だが将来の廃止に備える）。
4. `filterUsageOptionsByCategory` を §3.5-1 の表どおりに実装する。**`internal_drop` は基本用法区分1のすべて（internal + as_needed）を返す**点に注意。

**テスト**

生成済みの `usage_options.ts` を import して実測すること（xlsx をテストで読まない）。

- 総件数 1,775 件
- `filterUsageOptionsByCategory(o,'internal')` → 178 件
- `filterUsageOptionsByCategory(o,'as_needed')` → 75 件、すべて `prescriptionCode[2] === '5'`
- `filterUsageOptionsByCategory(o,'external')` → 957 件
- `filterUsageOptionsByCategory(o,'injection')` → 565 件
- **`filterUsageOptionsByCategory(o,'internal_drop')` → 3 件のみ**。返る順序が `INTERNAL_DROP_USAGE_PRESCRIPTION_CODES` の順（就寝前 → 適宜 → 便秘時）であること
- 基本用法区分4（`prescriptionCode` が `4` 始まり）が 0 件であること
- 個別対応の実測値:
  - `1011000100000000`「１日１回朝食前　服用」→ `category: 'internal'`, `code: '005'`
  - `1011100000000000`「１日１回就寝前　服用」→ `category: 'internal'`, `code: '013'`
  - `1050W20000000000`「適宜　服用」→ `category: 'as_needed'`, `code: '900'`, `supplement.asNeededCondition === true`
  - `1050410000000000`「便秘時　服用」→ `category: 'as_needed'`, `code: '900'`
  - `2A50110000000000`「疼痛時　貼付」→ `category: 'external'`, `code: '900'`, `supplement.site === 'required'`
- 外用・注射のすべての行で `code === '900'`（2.2d）

**内滴の受入確認（利用者の実務に基づく）**: 剤形「内滴」の候補が **ちょうど 3 件**であり、「１日１回就寝前　服用」「適宜　服用」「便秘時　服用」であること、かつ**それ以外の内服用法（例:「１日３回朝昼夕食後　服用」）が含まれないこと**を明示的にテストすること。

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| G4-1 | 屯服の判定（タイミング=5）を外し内服に寄せる | 屯服 75 件・内服 178 件のテストが fail |
| G4-2 | 基本用法区分の写像で 2（外用）を内服にする | 外用 957 件のテストが fail |
| G4-3 | `internal_drop` を基本区分1の全件（253件）にする | 内滴 3 件のテストが fail |
| G4-4 | 基本用法区分4 の除外を外す | 注入 0 件のテストが fail |

**受入基準**: 4 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run build` 成功。生成物の差分が変換スクリプトの出力と一致すること（スクリプトを再実行して `git diff` が空になること）を確認して報告する。

### PR-G5: 用法欄を公式マスタからの選択式にする（★PR-G4 完了後）

**対象**: `src/app/ocr/components/PrescriptionGroupEditor.tsx`, 新規 `src/app/ocr/components/UsageSearchModal.tsx`, `src/lib/prescription_input_audit.ts`, `src/app/ocr/page.tsx`

**設計**

1. **候補が多いので `<select>` は使えない。** 外用だけで 957 件ある。既存の `src/app/ocr/components/DrugSearchModal.tsx` と**同じ流儀**で `UsageSearchModal.tsx` を新設すること。

   - 絞り込みロジックは純粋関数 `calculateFilteredUsageOptions(params)` として export し、テストから本物を import して検証する（`calculateFilteredDrugs` と同じ。**テスト内で `.filter()` を再実装する偽カバレッジを作らない**）。
   - 検索対象は 用法名称（項番8）・用法カナ名称（項番18）・調剤レセプト用法コード（項番19）。
   - モーダルに渡す候補は `filterUsageOptionsByCategory(options, 剤形)` で絞ったもの（§3.5-1 の表。**内滴はちょうど 3 件**なので、モーダルを出さずその場で 3 択にしてもよい。実装者判断でよいが、操作感を揃える理由でモーダルに統一しても構わない）。

2. **用法欄の見た目**: 読み取り専用の表示＋「用法を選ぶ」ボタンでモーダルを開く形にする。`PrescriptionRow` の薬品名欄（`onOpenDrugSearch`）と同じ操作感に揃えること。

3. **剤形変更時は警告のみ（§3.5-4）**

   - 用法の値は保持する。**クリアしない。ブロックしない。**
   - `prescription_input_audit.ts` に issue を追加する。

     ```
     severity: 'warning'
     code:     'usage_dosage_category_mismatch'
     title:    `Rp○ の用法が調剤区分「外用」の候補にありません`
     message:  '用法を選び直すか、調剤区分を確認してください。このままでも保存できます。'
     rpId:     <該当 Rp>
     ```

   - 判定に剤形が要るので、`PrescriptionInputAuditItem` に `dosageCategory?: DosageCategory` と `dosageCategorySource?: 'auto' | 'manual'` を追加する（型の追加のみ。スキーマ変更ではない）。
   - 監査パネル（`PrescriptionAuditPanel`）だけでなく、**該当 Rp グループのヘッダにもインラインで印を出す**こと。画面下の一覧だけでは剤形を変えた瞬間に気づけない。

4. **選択した用法から剤形を自動変更しない。** 剤形は利用者が選ぶもので、用法選択が剤形を書き換えると「警告のみ」という決定の意味が無くなる。

5. **保存する値は用法名称（項番8）のみ。** コード番号は `usage` に混ぜない（PR-G2 の方針）。16 桁コードの保存は PR-G7（任意）で扱う。

**やってはいけないこと**: スキーマを変更しない。`usage` の maxLength（200）を超える名称が無いか確認し、超えるものがあれば手を止めて報告する。

**テスト**

- `calculateFilteredUsageOptions` の単体テスト（本物を import すること）
  - 剤形「外用」で 957 件、「内滴」でちょうど 3 件が母集団になること
  - 「便秘」で検索して `1050410000000000`「便秘時　服用」が出ること
  - カナ「テキギ」で「適宜　服用」が出ること
  - レセプトコード「013」で「１日１回就寝前　服用」が出ること
- `buildPrescriptionInputAudit` の単体テスト
  - 剤形 `external` ＋ 用法「１日３回朝昼夕食後　服用」（内服の用法）→ `usage_dosage_category_mismatch` が warning で 1 件出ること
  - 剤形 `internal_drop` ＋ 用法「便秘時　服用」→ **issue が出ないこと**（許可リストに含まれるため）
  - 剤形 `internal_drop` ＋ 用法「１日３回朝昼夕食後　服用」→ `usage_dosage_category_mismatch` が warning で 1 件出ること（内服の用法だが内滴の 3 件には無い）
  - 剤形 `external` ＋ 用法「疼痛時　貼付」→ issue が出ないこと
  - 用法未入力 → この issue は出ないこと（別の既存 issue の担当）

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| G5-1 | 剤形フィルタを外して全候補を返す | 外用 957 件・内滴 3 件のテストが fail |
| G5-2 | 不一致時に用法を自動クリアする | 「値が保持されること」のテストが fail |
| G5-3 | 不一致 issue の severity を `error` にする | warning を期待するテストが fail |
| G5-4 | 内滴の許可リストから「便秘時　服用」を外す | 内滴 3 件のテストと内滴＋便秘時の監査テストが fail |

**受入基準**: 4 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run build` 成功 / **開発サーバの実画面で、剤形を内服→外用に変えたときに用法が消えず警告だけが出ることを確認し、スクリーンショットを添えて報告すること。**

---

### PR-G6: 用法補足（自由入力）欄の新設（スキーマ変更あり・**2026-09-06 承認済み**）

**PR-G5 と必ず同時にリリースすること。** 用法を選択式にしてから補足欄が無い期間を作ってはならない（2.2e のとおり、補足の記録は仕様上必須）。

**この PR は RxDB スキーマの version bump（17 → 18）を伴う。2026-09-06 に利用者の承認を得ているため着手してよい。**
ただし承認されたのは **`usageSupplementText` の追加と 17→18 の bump のみ**である。これ以外のプロパティ追加・他コレクションの bump は承認に含まれない。必要になったら手を止めて報告すること。

**設計**

1. `PRESCRIPTION_ITEM_SCHEMA`（現在 **version 17**）に手入力用の用法補足を追加し、**version 18** へ bump する。

   ```ts
   usageSupplementText: { type: 'string', maxLength: 500 },
   ```

   - 移行は `legacyMigrationStrategies` に `17: keepDocument` を追加するだけでよい（既存文書は未設定のまま）。
   - `src/db/types.ts` の `PrescriptionItem` にも `usageSupplementText?: string;` を追加する。
   - **プロパティを足して bump を忘れると、テストは緑のまま既存利用者の DB だけが壊れる。** `src/db/schema.test.ts` に version と properties の対応を固定するテストがあるか確認し、無ければ追加すること。

2. **既存の `electronicUsageSupplementText` は流用しない。** これは電子処方箋から取り込んだ値の保管場所であり（`src/app/ocr/helpers.ts:233`）、手入力と混ぜると出所が失われる。`rpComment` も流用しない（Rp 単位の内部メモで、電子処方箋には送られない）。

3. **印字**: 薬袋・薬情・お薬手帳シールで、用法と並べて印字する。ここが印字されないと、マスタに無い指示（「入浴後に患部へ」、頓用の条件、部位、投与時刻）が患者に伝わらず、選択式化がそのまま情報欠落になる。

4. **入力の必須判定**: 選択中の用法の `supplement` フラグ（PR-G4a）に応じて、監査で不足を検知する。

   ```
   supplement.asNeededCondition === true かつ 補足が空 → warning 'usage_supplement_required_condition'
   supplement.administrationTime === true かつ 補足が空 → warning 'usage_supplement_required_time'
   supplement.site === 'required'      かつ 補足が空 → warning 'usage_supplement_required_site'
   codeKind === 'guide'                かつ 補足が空 → warning 'usage_supplement_required_guide'
   ```

   `severity` は `warning` とする（`error` にして保存をブロックするかは未合意。**独断で error にしないこと**）。

**テスト**

- スキーマ: `PRESCRIPTION_ITEM_SCHEMA.version === 18` かつ `properties.usageSupplementText` が存在すること。`legacyMigrationStrategies` が 1〜18 を返し、17 が `keepDocument` であること
- 監査: 「適宜　服用」（`asNeededCondition: true`）＋ 補足空 → warning 1 件。補足あり → 0 件
- 監査: 「疼痛時　貼付」（`site: 'required'`）＋ 補足空 → warning 1 件
- 印字: `renderToStaticMarkup` で薬袋に補足文字列が出ること

**fail-first mutation**

| # | 変異 | 期待 |
|---|---|---|
| G6-1 | version を 17 のままにする | スキーマテストが fail |
| G6-2 | `legacyMigrationStrategies` の 17 を削る | 移行契約テストが fail |
| G6-3 | 補足必須の判定を常に false にする | 監査テストが fail |
| G6-4 | 薬袋から補足の描画を外す | 印字テストが fail |

**受入基準**: 4 変異が実測 fail / `npx tsc --noEmit` 0 件 / `npm test` 全 pass / `npm run test:e2e:print-layout` で薬袋に補足が出ることを実画像で確認して報告。

---

### PR-G7（任意）: 手入力の処方に電子処方箋用法コードを保存する

**PR-G5/G6 の完了後に、単独で判断できるようにするため分離してある。不要なら実施しなくてよい。**

用法を公式マスタから選ぶようになるので、16 桁の `prescriptionCode` を既存フィールド `electronicUsageCode`（`maxLength: 50`、スキーマ変更不要）に保存できる。

**ただしこれは送信内容が変わる挙動変更である。** `src/hooks/usePrintElectronicPrescription.ts:123` が `electronicUsageCode` を電子処方箋の `usageCode` として送っており、現在は手入力の処方で常に空。埋めると調剤結果情報に用法コードが載るようになる。

実施する場合は、**報告に「送信内容が変わる」ことを明記**し、変更前後で送信ペイロードがどう変わるかを実測して並べること。調剤レセプト用の 3 桁コードの配線は §4-4 が未決なので**本 PR では触らない**。

---

## 4. 残る要判断事項（実装者が勝手に決めないこと）

§3.5 で内滴・注入・取込方式は決着済み。残りは次のとおり。

1. **旧版シート（251031以前）の要否**: 本体 xlsx には旧版シートも入っている。過去の処方を再表示する際に旧コードの名称解決が要るかどうか。現時点では取り込まない方針で進め、必要が判明したら追加する。
2. **既に `001 1日3回食後服用` 形式で保存されている用法データの扱い**: そのまま残す（PR-G2 の方針）か、移行で正規化するか。移行するならスキーマではなくデータ移行として別途合意する。
3. **UKE 用法コードの配線**: 現在 SH レコードの用法コードは常に空。マスタの項番 19 から埋められるようになるが、**提出内容が変わる**ため埋めるかどうかは判断が要る。なお外用・注射では `900` が正しい値であり、空でないことが誤りとは限らない（2.2d）。
4. **剤形と日数の不整合チェック**: 内滴に日数が入っている、外用に日数がある等を入力監査で警告するか。§3.5-1 の「内滴に日数を入れない」を強制するかどうかを含め、本計画では**実装しない**。必要なら別途起案する。

## 5. 報告フォーマット

PR ごとに次を書くこと。推測を断定形で書かないこと。

```
## PR-Gx: <タイトル>
- コミット: <hash>
- 変更ファイル: <一覧>
- npx tsc --noEmit: エラー N 件（出力を貼る）
- npm test: pass N / fail N（末尾の集計行を貼る）
- mutation 実測:
  | # | 変異 | 実測 fail 数 | 戻した後 |
- 仕様確認の出典: <PDF名・版・該当箇所。確認できなかった項目は「未確認」と明記>
- 未実施・できなかったこと: <あれば正直に書く。無ければ「なし」>
```
