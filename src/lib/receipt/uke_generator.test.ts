import { test } from 'node:test';
import assert from 'node:assert';
import { generateUkeContent, escapeCSVField, type UkeRecord } from './uke_generator.ts';
import encoding from 'encoding-japanese';

// Helper to decode SJIS back to string for testing
function decodeSJIS(uint8Array: Uint8Array): string {
  const unicodeArray = encoding.convert(Array.from(uint8Array), {
    to: 'UNICODE',
    from: 'SJIS'
  });
  // The 'encoding.convert' function returns an array of character codes (numbers).
  // Some versions of encoding-japanese or types might require mapping them to chars manually
  // but encoding.codeToString usually works. Let's make sure it handles the numeric array correctly.
  return encoding.codeToString(unicodeArray as number[]);
}

test('escapeCSVField should escape fields correctly', () => {
  // Normal field
  assert.strictEqual(escapeCSVField('Normal'), 'Normal');

  // CSV Injection prevention (prepend single quote)
  assert.strictEqual(escapeCSVField('=Value'), "'=Value");
  assert.strictEqual(escapeCSVField('+Field'), "'+Field");
  assert.strictEqual(escapeCSVField('-Field'), "'-Field");
  assert.strictEqual(escapeCSVField('@Field'), "'@Field");

  // RFC 4180 escaping (wrap in double quotes)
  assert.strictEqual(escapeCSVField('Field, with comma'), '"Field, with comma"');
  assert.strictEqual(escapeCSVField('Field "with" quotes'), '"Field ""with"" quotes"');
  assert.strictEqual(escapeCSVField('Field\nwith newline'), '"Field\nwith newline"');

  // Combined: Formula injection + RFC 4180 escaping
  // First it prepends ', then it sees the comma and wraps in "..."
  // =SUM(1,2) -> '=SUM(1,2) -> "'=SUM(1,2)"
  assert.strictEqual(escapeCSVField('=SUM(1,2)'), '"\'=SUM(1,2)"');
});

test('generateUkeContent should format records correctly', () => {
  const records: UkeRecord[] = [
    { type: 'A', fields: ['1', '2'] },
    { type: 'B', fields: ['3', '4', '5'] }
  ];
  const result = generateUkeContent(records);
  assert.strictEqual(decodeSJIS(result), 'A,1,2\r\nB,3,4,5');
});

test('generateUkeContent should prevent CSV injection in records', () => {
  const records: UkeRecord[] = [
    { type: 'RE', fields: ['=SUM(1,2)', '+42', '-99', '@INFO'] }
  ];
  const result = generateUkeContent(records);
  // =SUM(1,2) has comma, so it is quoted. Others don't.
  assert.strictEqual(decodeSJIS(result), "RE,\"'=SUM(1,2)\",'+42,'-99,'@INFO");
});

test('generateUkeContent should return an empty string for empty input', () => {
  const records: UkeRecord[] = [];
  const result = generateUkeContent(records);
  assert.strictEqual(decodeSJIS(result), '');
});
