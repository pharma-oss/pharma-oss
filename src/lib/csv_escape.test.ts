import { test } from 'node:test';
import assert from 'node:assert';
import { escapeCsvCell, buildCsvRow, buildCsvDocument } from './csv_escape.ts';

test('escapeCsvCell correctly escapes regular strings with quotes', () => {
  assert.strictEqual(escapeCsvCell('hello'), '"hello"');
  assert.strictEqual(escapeCsvCell('東京都千代田区'), '"東京都千代田区"');
  assert.strictEqual(escapeCsvCell('アムロジピン錠5mg "サワイ"'), '"アムロジピン錠5mg ""サワイ"""');
});

test('escapeCsvCell neutralizes formula injection characters (=, +, -, @, \\t, \\r)', () => {
  assert.strictEqual(escapeCsvCell('=1+1'), '"\'=1+1"');
  assert.strictEqual(escapeCsvCell('+cmd|...'), '"\'+cmd|..."');
  assert.strictEqual(escapeCsvCell('-SUM(A1:A10)'), '"\'-SUM(A1:A10)"');
  assert.strictEqual(escapeCsvCell('@SUM(B1:B5)'), '"\'@SUM(B1:B5)"');
  assert.strictEqual(escapeCsvCell('\tmalicious'), '"\'\tmalicious"');
  assert.strictEqual(escapeCsvCell('\rmalicious'), '"\'\rmalicious"');
});

test('escapeCsvCell handles numbers, booleans, null and undefined', () => {
  assert.strictEqual(escapeCsvCell(123), '"123"');
  assert.strictEqual(escapeCsvCell(0), '"0"');
  assert.strictEqual(escapeCsvCell(true), '"true"');
  assert.strictEqual(escapeCsvCell(false), '"false"');
  assert.strictEqual(escapeCsvCell(null), '""');
  assert.strictEqual(escapeCsvCell(undefined), '""');
});

test('buildCsvRow joins properly escaped cells with commas', () => {
  const row = buildCsvRow(['Rx-1001', '山田 太郎', '=cmd|calc', 350]);
  assert.strictEqual(row, '"Rx-1001","山田 太郎","\'=cmd|calc","350"');
});

test('buildCsvDocument builds CRLF-delimited CSV documents', () => {
  const header = ['ID', 'Name', 'Score'];
  const row1 = ['1', '患者A', 100];
  const row2 = ['2', '患者B', '=SUM(1,2)'];
  const doc = buildCsvDocument([header, row1, row2]);
  assert.strictEqual(
    doc,
    '"ID","Name","Score"\r\n"1","患者A","100"\r\n"2","患者B","\'=SUM(1,2)"'
  );
});
