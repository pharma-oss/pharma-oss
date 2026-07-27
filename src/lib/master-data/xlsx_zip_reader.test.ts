import { test } from 'node:test';
import assert from 'node:assert';
import { deflateRawSync } from 'node:zlib';
import {
  listZipEntries,
  extractZipEntryBytes,
  listXlsxEntriesInZip,
  parseXlsxSheetGrid,
  readXlsxSheetGridFromXlsxBytes
} from './xlsx_zip_reader.ts';

interface ZipFixtureFile {
  name: string;
  content: string | Uint8Array;
  compressionMethod?: number;
}

function pushUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}
function pushUint32(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}
function pushBytes(bytes: number[], value: Uint8Array) {
  for (const byte of value) bytes.push(byte);
}

// 実際の xlsx_zip_reader.ts で扱うZIP形式(store/deflate + 中央ディレクトリ)を、
// src/lib/drug_master_zip.test.ts と同じ方式で最小構成のまま組み立てるヘルパー。
function makeZip(files: ZipFixtureFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localBytes: number[] = [];
  const centralBytes: number[] = [];
  const centralRecords: Array<{
    nameBytes: Uint8Array;
    compressedBytes: Uint8Array;
    uncompressedSize: number;
    localOffset: number;
    method: number;
  }> = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const method = file.compressionMethod ?? 0;
    const originalBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const compressedBytes = method === 8 ? new Uint8Array(deflateRawSync(originalBytes)) : originalBytes;
    const localOffset = localBytes.length;

    pushUint32(localBytes, 0x04034b50);
    pushUint16(localBytes, 20);
    pushUint16(localBytes, 0x0800);
    pushUint16(localBytes, method);
    pushUint16(localBytes, 0);
    pushUint16(localBytes, 0);
    pushUint32(localBytes, 0);
    pushUint32(localBytes, compressedBytes.length);
    pushUint32(localBytes, originalBytes.length);
    pushUint16(localBytes, nameBytes.length);
    pushUint16(localBytes, 0);
    pushBytes(localBytes, nameBytes);
    pushBytes(localBytes, compressedBytes);

    centralRecords.push({ nameBytes, compressedBytes, uncompressedSize: originalBytes.length, localOffset, method });
  }

  for (const record of centralRecords) {
    pushUint32(centralBytes, 0x02014b50);
    pushUint16(centralBytes, 20);
    pushUint16(centralBytes, 20);
    pushUint16(centralBytes, 0x0800);
    pushUint16(centralBytes, record.method);
    pushUint16(centralBytes, 0);
    pushUint16(centralBytes, 0);
    pushUint32(centralBytes, 0);
    pushUint32(centralBytes, record.compressedBytes.length);
    pushUint32(centralBytes, record.uncompressedSize);
    pushUint16(centralBytes, record.nameBytes.length);
    pushUint16(centralBytes, 0);
    pushUint16(centralBytes, 0);
    pushUint16(centralBytes, 0);
    pushUint16(centralBytes, 0);
    pushUint32(centralBytes, 0);
    pushUint32(centralBytes, record.localOffset);
    pushBytes(centralBytes, record.nameBytes);
  }

  const bytes = [...localBytes, ...centralBytes];
  const centralDirectoryOffset = localBytes.length;
  const centralDirectorySize = centralBytes.length;

  pushUint32(bytes, 0x06054b50);
  pushUint16(bytes, 0);
  pushUint16(bytes, 0);
  pushUint16(bytes, files.length);
  pushUint16(bytes, files.length);
  pushUint32(bytes, centralDirectorySize);
  pushUint32(bytes, centralDirectoryOffset);
  pushUint16(bytes, 0);

  return new Uint8Array(bytes);
}

// 近畿厚生局 令和8年7月版「福井県 薬局」の実データから、施設1件分を抜粋した
// sharedStrings.xml / sheet1.xml(実際のXML構造をそのまま踏襲、内容は先頭1件分のみ)
const REAL_SHARED_STRINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="15">
<si><t/></si>
<si><t>コード内容別医療機関一覧表</t></si>
<si><t>[福井県]</t></si>
<si><t>[令和 8年 7月 1日現在　薬局　現存/休止]</t></si>
<si><t>令和 8年 7月 1日作成　　1頁</t></si>
<si><t>1</t></si>
<si><t xml:space="preserve">01-40055 </t></si>
<si><t>オーオカ薬局駅前本店</t></si>
<si><t>〒910－0006福井市中央１－９－３０</t></si>
<si><t>0776-23-2640</t></si>
<si><t>株式会社　大岡薬局　代表取締役　大岡　宏道</t></si>
<si><t>大岡　典子</t></si>
<si><t>昭38. 5. 1</t></si>
<si><t>調剤</t></si>
<si><t>薬局</t></si>
<si><t>新規</t></si>
<si><t>現存</t></si>
</sst>`;

const REAL_SHEET_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A2:X20"/><sheetData>
<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c></row>
<row r="5"><c r="A5" t="s"><v>3</v></c><c r="B5" t="s"><v>4</v></c></row>
<row r="12"><c r="A12" t="s"><v>5</v></c><c r="B12" t="s"><v>6</v></c><c r="C12" t="s"><v>7</v></c><c r="D12" t="s"><v>8</v></c><c r="E12" t="s"><v>9</v></c><c r="F12" t="s"><v>10</v></c><c r="G12" t="s"><v>11</v></c><c r="H12" t="s"><v>12</v></c><c r="I12" t="s"><v>13</v></c><c r="J12" t="s"><v>14</v></c></row>
<row r="13"><c r="H13" t="s"><v>15</v></c><c r="J13" t="s"><v>16</v></c></row>
</sheetData></worksheet>`;

test('parseXlsxSheetGrid decodes real government sharedStrings/sheet XML into a row/col grid', () => {
  const grid = parseXlsxSheetGrid(REAL_SHARED_STRINGS_XML, REAL_SHEET_XML);

  const headerRow = grid.get(12);
  assert.ok(headerRow, 'row 12 (institution header row) should exist');
  assert.strictEqual(headerRow!.get('A'), '1');
  assert.strictEqual(headerRow!.get('B'), '01-40055 ');
  assert.strictEqual(headerRow!.get('C'), 'オーオカ薬局駅前本店');
  assert.strictEqual(headerRow!.get('D'), '〒910－0006福井市中央１－９－３０');
  assert.strictEqual(headerRow!.get('E'), '0776-23-2640');
  assert.strictEqual(headerRow!.get('J'), '薬局');

  const continuationRow = grid.get(13);
  assert.ok(continuationRow, 'row 13 (continuation row: status) should exist');
  assert.strictEqual(continuationRow!.get('J'), '現存');

  // 空白セル(row2, row4など)は数値セルとして拾わない(範囲内に含まれない)
  assert.strictEqual(grid.has(2), false);
});

test('readXlsxSheetGridFromXlsxBytes reads sheet1.xml through a real ZIP container (xlsx = zip)', async () => {
  const xlsxBytes = makeZip([
    { name: 'xl/sharedStrings.xml', content: REAL_SHARED_STRINGS_XML, compressionMethod: 8 },
    { name: 'xl/worksheets/sheet1.xml', content: REAL_SHEET_XML, compressionMethod: 8 }
  ]);

  const grid = await readXlsxSheetGridFromXlsxBytes(xlsxBytes);
  const headerRow = grid.get(12);
  assert.strictEqual(headerRow?.get('C'), 'オーオカ薬局駅前本店');
});

test('listXlsxEntriesInZip finds only .xlsx entries in a bundle zip (government per-prefecture bundle)', () => {
  const bundleZip = makeZip([
    { name: '2026.7_kikanzentai_fukui_yakkyoku.xlsx', content: 'dummy1' },
    { name: '2026.7_kikanzentai_osaka_yakkyoku.xlsx', content: 'dummy2' },
    { name: 'readme.txt', content: '説明' }
  ]);

  const entries = listXlsxEntriesInZip(bundleZip);
  assert.strictEqual(entries.length, 2);
  assert.ok(entries.every((e) => e.fileName.endsWith('.xlsx')));
});

test('listZipEntries and extractZipEntryBytes round-trip deflate-compressed entries', async () => {
  const zip = makeZip([{ name: 'xl/worksheets/sheet1.xml', content: REAL_SHEET_XML, compressionMethod: 8 }]);
  const entries = listZipEntries(zip);
  assert.strictEqual(entries.length, 1);

  const bytes = await extractZipEntryBytes(zip, entries[0]);
  const text = new TextDecoder('utf-8').decode(bytes);
  assert.strictEqual(text, REAL_SHEET_XML);
});
