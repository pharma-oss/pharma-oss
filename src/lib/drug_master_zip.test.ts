import { test } from 'node:test';
import assert from 'node:assert';
import { deflateRawSync } from 'node:zlib';
import {
  DrugMasterZipError,
  extractDrugMasterCsvFromZip,
  isDrugMasterZipUpload
} from './drug_master_zip.ts';

interface ZipFixtureFile {
  name: string;
  content: string;
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

function makeZip(files: ZipFixtureFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localBytes: number[] = [];
  const centralBytes: number[] = [];
  const centralRecords: Array<ZipFixtureFile & {
    nameBytes: Uint8Array;
    compressedBytes: Uint8Array;
    uncompressedSize: number;
    localOffset: number;
    method: number;
  }> = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const method = file.compressionMethod ?? 0;
    const originalBytes = encoder.encode(file.content);
    const compressedBytes = method === 8
      ? new Uint8Array(deflateRawSync(originalBytes))
      : originalBytes;
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

    centralRecords.push({ ...file, nameBytes, compressedBytes, uncompressedSize: originalBytes.length, localOffset, method });
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

test('isDrugMasterZipUpload detects zip names and magic bytes', () => {
  const zip = makeZip([{ name: 'y_all.csv', content: '"2","Y","620000001"' }]);

  assert.strictEqual(isDrugMasterZipUpload('official.zip'), true);
  assert.strictEqual(isDrugMasterZipUpload('official.csv', zip), true);
  assert.strictEqual(isDrugMasterZipUpload('official.csv', new TextEncoder().encode('csv')), false);
});

test('extractDrugMasterCsvFromZip selects the likely full drug master CSV', async () => {
  const zip = makeZip([
    { name: 'readme.txt', content: '説明' },
    { name: 'update.csv', content: '"2","Y","620000002"\n' },
    { name: 'y_all_20260611.csv', content: '"2","Y","620000001","02","標準錠"\n"2","Y","620000002","02","標準散"\n' }
  ]);

  const result = await extractDrugMasterCsvFromZip(zip);

  assert.strictEqual(result.csvFileName, 'y_all_20260611.csv');
  assert.strictEqual(result.entryCount, 3);
  assert.strictEqual(result.csvEntryCount, 2);
  assert.strictEqual(result.compressionMethod, 0);
  assert.match(new TextDecoder().decode(result.csvBytes), /標準錠/);
});

test('extractDrugMasterCsvFromZip inflates deflated CSV entries when available', async () => {
  if (!globalThis.DecompressionStream) return;
  const zip = makeZip([
    { name: 'y_all_20260611.csv', content: '"2","Y","620000001","02","標準錠"\n', compressionMethod: 8 }
  ]);

  const result = await extractDrugMasterCsvFromZip(zip);

  assert.strictEqual(result.compressionMethod, 8);
  assert.match(new TextDecoder().decode(result.csvBytes), /標準錠/);
});

test('extractDrugMasterCsvFromZip rejects archives without CSV files', async () => {
  const zip = makeZip([{ name: 'readme.txt', content: '説明' }]);

  await assert.rejects(
    extractDrugMasterCsvFromZip(zip),
    (error) => error instanceof DrugMasterZipError && error.code === 'drug_master_zip_no_csv'
  );
});

test('extractDrugMasterCsvFromZip rejects unsupported compression methods', async () => {
  const zip = makeZip([{ name: 'y_all.csv', content: 'not really compressed', compressionMethod: 99 }]);

  await assert.rejects(
    extractDrugMasterCsvFromZip(zip),
    (error) => error instanceof DrugMasterZipError && error.code === 'drug_master_zip_unsupported_compression'
  );
});
