import { test } from 'node:test';
import assert from 'node:assert';
import { DRUG_MASTER_SPECIFICATION_COLUMNS } from './drug_master_csv.ts';
import {
  buildDrugMasterSpecificationPdfDiffReview,
  formatDrugMasterSpecificationPdfDiffReview,
  parseDrugMasterSpecificationPdfText
} from './drug_master_spec_pdf.ts';

const OFFICIAL_PDF_TEXT_EXCERPT = `
ファイルレイアウト
〈医薬品マスター〉
項 番 項 目 名 モード 桁 数 バイト数 備 考
１ 変更区分 数字 １ １
２ マスター種別 英数 １ １ Ｙ：固定
３ 医薬品コード 数字 ９ ９
医薬品名・規格名
４ 漢字有効桁数 数字 ２ ２
５ 漢字名称 漢字 ３２ ６４
６ カナ有効桁数 数字 ２ ２
７ カナ名称 英数ｶﾅ ２０ ２０
単位
８ コード 数字 ３ ３
９ 漢字有効桁数 数字 １ １
１０ 漢字名称 漢字 ６ １２
新又は現金額
１１ 金額種別 数字 １ １
１２ 新又は現金額 数字 １３ １３ 整数部「１０桁」、小数点「１桁」及び小数部「２桁」の組合せで設定
１３ 予備 数字 ２ ２ 未使用
１４ 麻薬・毒薬・覚醒剤原料・向精神
薬
数字 １ １
１５ 神経破壊剤 数字 １ １
１６ 生物学的製剤 数字 １ １
１７ 後発品 数字 １ １
１８ 予備 数字 １ １ 未使用
１９ 歯科特定薬剤 数字 １ １
２０ 造影（補助）剤 数字 １ １
２１ 注射容量 数字 ５ ５
２２ 収載方式等識別 数字 １ １
２３ 商品名等関連 数字 ９ ９
２４ 予備 数字 １ １ 未使用
２５ 予備 数字 １３ １３ 未使用
２６ 漢字名称変更区分 数字 １ １
２７ カナ名称変更区分 数字 １ １
２８ 剤形 数字 １ １
２９ 予備 英数 ４９ ４９ 未使用
３０ 変更年月日 数字 ８ ８
３１ 廃止年月日 数字 ８ ８
３２ 薬価基準収載医薬品コード 英数 １２ １２
３３ 公表順序番号 数字 ９ ９
３４ 経過措置年月日又は商品名医薬
品コード使用期限
数字 ８ ８
３５ 基本漢字名称 漢字 １００ ２００
３６ 薬価基準収載年月日 数字 ８ ８
３７ 一般名コード 英数 １２ １２
３８ 一般名処方の標準的な記載 漢字 １００ ２００
３９ 一般名処方加算対象区分 英数 １ １
４０ 抗ＨＩＶ薬区分 英数 １ １
４１ 長期収載品関連 数字 ９ ９
４２ 選定療養区分 数字 １ １
※ 項目間の区切り文字は「，」（カンマ）を使用。
〈特定器材マスター〉
`;

const COMPACT_OFFICIAL_PDF_TEXT_EXCERPT = `
〈医薬品マスター〉
項番項目名モード桁数バイト数備考
1変更区分数字11
2マスター種別英数11Y:固定
3医薬品コード数字99
医薬品名・規格名
4漢字有効桁数数字22
5漢字名称漢字3264
6カナ有効桁数数字22
7カナ名称英数カナ2020
単位
8コード数字33
9漢字有効桁数数字11
10漢字名称漢字612
新又は現金額
11金額種別数字11
12新又は現金額数字1313整数部「10桁」、小数点「1桁」及び小数部「2桁」の組合せで設定
13予備数字22未使用
14麻薬・毒薬・覚醒剤原料・向精神数字11
薬
15神経破壊剤数字11
16生物学的製剤数字11
17後発品数字11
18予備数字11未使用
19歯科特定薬剤数字11
20造影(補助)剤数字11
21注射容量数字55
22収載方式等識別数字11
23商品名等関連数字99
24予備数字11未使用
25予備数字1313未使用
26漢字名称変更区分数字11
27カナ名称変更区分数字11
28剤形数字11
29予備英数4949未使用
30変更年月日数字88
31廃止年月日数字88
32薬価基準収載医薬品コード英数1212
33公表順序番号数字99
34経過措置年月日又は商品名医薬数字88
品コード使用期限
35基本漢字名称漢字100200
36薬価基準収載年月日数字88
37一般名コード英数1212
38一般名処方の標準的な記載漢字100200
39一般名処方加算対象区分英数11
40抗HIV薬区分英数11
41長期収載品関連数字99
42選定療養区分数字11
〈特定器材マスター〉
`;

test('parseDrugMasterSpecificationPdfText extracts all drug master columns from PDF text', () => {
  const result = parseDrugMasterSpecificationPdfText(OFFICIAL_PDF_TEXT_EXCERPT);

  assert.deepStrictEqual(result.issues, []);
  assert.strictEqual(result.columns.length, 42);
  assert.strictEqual(result.columns[0].label, '変更区分');
  assert.strictEqual(result.columns[7].label, '単位コード');
  assert.strictEqual(result.columns[8].label, '単位漢字有効桁数');
  assert.strictEqual(result.columns[13].label, '麻薬・毒薬・覚醒剤原料・向精神薬');
  assert.strictEqual(result.columns[33].label, '経過措置年月日又は商品名医薬品コード使用期限');
  assert.strictEqual(result.columns[39].label, '抗HIV薬区分');
  assert.strictEqual(result.columns[41].label, '選定療養区分');
});

test('parseDrugMasterSpecificationPdfText handles compact searchable PDF extraction text', () => {
  const review = buildDrugMasterSpecificationPdfDiffReview(COMPACT_OFFICIAL_PDF_TEXT_EXCERPT);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.parsedColumnCount, 42);
  assert.deepStrictEqual(review.parseIssues, []);
  assert.deepStrictEqual(review.differences, []);
});

test('buildDrugMasterSpecificationPdfDiffReview matches the current hard-coded layout', () => {
  const review = buildDrugMasterSpecificationPdfDiffReview(OFFICIAL_PDF_TEXT_EXCERPT);
  const label = formatDrugMasterSpecificationPdfDiffReview(review);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.parsedColumnCount, 42);
  assert.strictEqual(review.expectedColumnCount, 42);
  assert.strictEqual(review.matchedColumnCount, 42);
  assert.deepStrictEqual(review.missingItemNumbers, []);
  assert.deepStrictEqual(review.extraItemNumbers, []);
  assert.deepStrictEqual(review.differences, []);
  assert.match(label, /PDF本文項目 42\/42/);
  assert.match(label, /一致 42\/42/);
});

test('buildDrugMasterSpecificationPdfDiffReview reports candidate differences from revised PDF text', () => {
  const changedColumns = DRUG_MASTER_SPECIFICATION_COLUMNS.map((column) => ({ ...column }));
  changedColumns[11] = {
    ...changedColumns[11],
    digits: 12,
    bytes: 12
  };

  const review = buildDrugMasterSpecificationPdfDiffReview(OFFICIAL_PDF_TEXT_EXCERPT, changedColumns);

  assert.strictEqual(review.ok, false);
  assert.ok(review.differences.some((diff) => diff.itemNumber === 12 && diff.field === 'digits' && diff.expected === 12 && diff.observed === 13));
  assert.ok(review.differences.some((diff) => diff.itemNumber === 12 && diff.field === 'bytes' && diff.expected === 12 && diff.observed === 13));
  assert.match(formatDrugMasterSpecificationPdfDiffReview(review), /12\.digits:12->13/);
});

test('buildDrugMasterSpecificationPdfDiffReview reports missing PDF rows', () => {
  const review = buildDrugMasterSpecificationPdfDiffReview(OFFICIAL_PDF_TEXT_EXCERPT.replace('４２ 選定療養区分 数字 １ １', ''));

  assert.strictEqual(review.ok, false);
  assert.ok(review.parseIssues.some((issue) => issue.includes('42番')));
  assert.ok(review.missingItemNumbers.includes(42));
});
