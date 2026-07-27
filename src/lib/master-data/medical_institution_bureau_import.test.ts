import { test } from 'node:test';
import assert from 'node:assert';
import {
  groupBureauInstitutionBlocks,
  inferCategoryFromListingLabel,
  normalizeBureauInstitutionCode,
  parseBureauInstitutionListGrid
} from './medical_institution_bureau_import.ts';
import { parseXlsxSheetGrid } from './xlsx_zip_reader.ts';

test('normalizeBureauInstitutionCode strips separators used by different bureaus but keeps 7 digits', () => {
  // 近畿厚生局: ハイフン区切り
  assert.strictEqual(normalizeBureauInstitutionCode('01-40055 '), '0140055');
  // 九州厚生局: カンマ区切り(3桁+3桁+1桁)
  assert.strictEqual(normalizeBureauInstitutionCode('024,000,6'), '0240006');
  // 桁数が合わない場合は null(誤ったコードを機械的に補完しない)
  assert.strictEqual(normalizeBureauInstitutionCode('12-3'), null);
});

test('inferCategoryFromListingLabel maps official listing labels to hospital/clinic/dental/pharmacy', () => {
  assert.strictEqual(inferCategoryFromListingLabel('病院'), '病院');
  assert.strictEqual(inferCategoryFromListingLabel('診療所'), '診療所');
  assert.strictEqual(inferCategoryFromListingLabel('薬局'), '薬局');
  assert.strictEqual(inferCategoryFromListingLabel('歯科診療所'), '歯科診療所');
  assert.strictEqual(inferCategoryFromListingLabel('歯科病院'), '歯科病院');
  assert.strictEqual(inferCategoryFromListingLabel(''), '不明');
});

// 近畿厚生局 令和8年7月版の実データ(福井県, 医科)から2施設分を抜粋したグリッド。
// 1件目は通常の診療所(現存)、2件目は大きな病院を模して複数の継続行(常勤/非常勤・診療科)を持つ。
function buildRealSampleGrid() {
  const sharedStrings = [
    '', 'コード内容別医療機関一覧表', '[福井県]', '[令和 8年 7月 1日現在　医科　現存/休止]',
    '令和 8年 7月 1日作成　　1頁',
    '1', '01-15202 ', '公益財団法人　福井県予防医学協会附属診療所', '〒918－8238福井市和田２－１００６',
    '0776-23-4810', '公益財団法人　福井県予防医学協会　理事長　嶋﨑　元博', '山道　昇', '昭51. 5. 18',
    '内科　小児科', '診療所', '常　勤:　　　 4', '新規', '令6. 5. 18', '現存',
    '2', '01-17059 ', '福井県立病院', '〒910－8526福井市四ツ井２－８－１', '0776-54-5151',
    '福井県知事　石田　嵩人', '二宮　致', '昭38. 11. 1', '一般　　    541', '病院',
    '常　勤:　　 190', '新規', '一般（感染）', '令5. 11. 1', '　　　　      4', '非常勤:　　　28',
    '結核　　      6', '現存', '休止'
  ];

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="${sharedStrings.length}">
${sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('\n')}
</sst>`;

  const idx = (text: string) => sharedStrings.indexOf(text);
  const cell = (col: string, text: string) => `<c r="${col}0" t="s"><v>${idx(text)}</v></c>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="3">${cell('A', 'コード内容別医療機関一覧表')}${cell('B', '[福井県]')}</row>
<row r="5">${cell('A', '[令和 8年 7月 1日現在　医科　現存/休止]')}${cell('B', '令和 8年 7月 1日作成　　1頁')}</row>
<row r="12">${cell('A', '1')}${cell('B', '01-15202 ')}${cell('C', '公益財団法人　福井県予防医学協会附属診療所')}${cell('D', '〒918－8238福井市和田２－１００６')}${cell('E', '0776-23-4810')}${cell('F', '公益財団法人　福井県予防医学協会　理事長　嶋﨑　元博')}${cell('G', '山道　昇')}${cell('H', '昭51. 5. 18')}${cell('I', '内科　小児科')}${cell('J', '診療所')}</row>
<row r="13">${cell('E', '常　勤:　　　 4')}${cell('H', '新規')}${cell('J', '現存')}</row>
<row r="14">${cell('H', '令6. 5. 18')}</row>
<row r="15">${cell('A', '2')}${cell('B', '01-17059 ')}${cell('C', '福井県立病院')}${cell('D', '〒910－8526福井市四ツ井２－８－１')}${cell('E', '0776-54-5151')}${cell('F', '福井県知事　石田　嵩人')}${cell('G', '二宮　致')}${cell('H', '昭38. 11. 1')}${cell('I', '一般　　    541')}${cell('J', '病院')}</row>
<row r="16">${cell('E', '常　勤:　　 190')}${cell('H', '新規')}${cell('J', '休止')}</row>
</sheetData></worksheet>`;

  return parseXlsxSheetGrid(sharedStringsXml, sheetXml);
}

test('groupBureauInstitutionBlocks groups a variable number of continuation rows per institution', () => {
  const grid = buildRealSampleGrid();
  const blocks = groupBureauInstitutionBlocks(grid);

  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks[0].serialNumber, '1');
  assert.strictEqual(blocks[0].name, '公益財団法人　福井県予防医学協会附属診療所');
  assert.strictEqual(blocks[0].rawCode, '01-15202');
  assert.strictEqual(blocks[0].phone, '0776-23-4810');
  assert.strictEqual(blocks[0].status, '現存');
  assert.strictEqual(blocks[0].categoryLabel, '診療所');

  assert.strictEqual(blocks[1].serialNumber, '2');
  assert.strictEqual(blocks[1].name, '福井県立病院');
  assert.strictEqual(blocks[1].status, '休止');
  assert.strictEqual(blocks[1].categoryLabel, '病院');
});

test('parseBureauInstitutionListGrid builds real records, resolves prefecture code, and excludes 休止(inactive)', () => {
  const grid = buildRealSampleGrid();
  const result = parseBureauInstitutionListGrid(grid, { sourceFileName: '2026.7_kikanzentai_fukui_ika.xlsx' });

  assert.strictEqual(result.prefectureName, '福井県');
  assert.strictEqual(result.prefectureCode, '18');
  assert.strictEqual(result.skippedInactiveCount, 1, '休止(inactive)の福井県立病院は除外される');
  assert.strictEqual(result.skippedPharmacyCount, 0);
  assert.strictEqual(result.records.length, 1);

  const record = result.records[0];
  assert.strictEqual(record.name, '公益財団法人　福井県予防医学協会附属診療所');
  assert.strictEqual(record.scoreCode, '0115202');
  assert.strictEqual(record.prefectureCode, '18');
  // 都道府県2桁 + 検索番号7桁 の9桁(点数表区分1桁は一覧表だけからは判定できないため含めない)
  assert.strictEqual(record.code, '180115202');
  assert.strictEqual(record.category, 'clinic');
  assert.strictEqual(record.address, '〒918－8238福井市和田２－１００６');
  assert.strictEqual(record.phone, '0776-23-4810');
});

// 近畿厚生局 令和8年7月版の実データ(福井県, 薬局)から1施設分を抜粋したグリッド。
// トレーシングレポート等の宛先には薬局を使わないため、取り込み対象外(スキップ)になることを確認する。
function buildRealPharmacySampleGrid() {
  const sharedStrings = [
    '', 'コード内容別医療機関一覧表', '[福井県]', '[令和 8年 7月 1日現在　薬局　現存/休止]',
    '令和 8年 7月 1日作成　　1頁',
    '1', '01-40055 ', 'オーオカ薬局駅前本店', '〒910－0006福井市中央１－９－３０',
    '0776-23-2640', '株式会社　大岡薬局　代表取締役　大岡　宏道', '大岡　典子', '昭38. 5. 1',
    '調剤', '薬局', '常　勤:　　　 3', '新規', '現存'
  ];
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="${sharedStrings.length}">
${sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('\n')}
</sst>`;
  const idx = (text: string) => sharedStrings.indexOf(text);
  const cell = (col: string, text: string) => `<c r="${col}0" t="s"><v>${idx(text)}</v></c>`;
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="3">${cell('A', 'コード内容別医療機関一覧表')}${cell('B', '[福井県]')}</row>
<row r="5">${cell('A', '[令和 8年 7月 1日現在　薬局　現存/休止]')}${cell('B', '令和 8年 7月 1日作成　　1頁')}</row>
<row r="12">${cell('A', '1')}${cell('B', '01-40055 ')}${cell('C', 'オーオカ薬局駅前本店')}${cell('D', '〒910－0006福井市中央１－９－３０')}${cell('E', '0776-23-2640')}${cell('F', '株式会社　大岡薬局　代表取締役　大岡　宏道')}${cell('G', '大岡　典子')}${cell('H', '昭38. 5. 1')}${cell('I', '調剤')}${cell('J', '薬局')}</row>
<row r="13">${cell('E', '常　勤:　　　 3')}${cell('H', '新規')}${cell('J', '現存')}</row>
</sheetData></worksheet>`;
  return parseXlsxSheetGrid(sharedStringsXml, sheetXml);
}

test('parseBureauInstitutionListGrid excludes pharmacies (only hospitals/clinics/dental are wanted)', () => {
  const grid = buildRealPharmacySampleGrid();
  const result = parseBureauInstitutionListGrid(grid, { sourceFileName: '2026.7_kikanzentai_fukui_yakkyoku.xlsx' });

  assert.strictEqual(result.records.length, 0, '薬局レコードは取り込まれない');
  assert.strictEqual(result.skippedPharmacyCount, 1);
  assert.strictEqual(result.skippedInactiveCount, 0);
});
