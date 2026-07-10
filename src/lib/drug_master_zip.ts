export type DrugMasterZipErrorCode =
  | 'drug_master_zip_invalid'
  | 'drug_master_zip_no_csv'
  | 'drug_master_zip_unsupported_compression'
  | 'drug_master_zip_zip64_unsupported';

export interface DrugMasterZipCsvEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface ExtractDrugMasterCsvFromZipResult {
  csvFileName: string;
  csvBytes: Uint8Array;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  entryCount: number;
  csvEntryCount: number;
}

export class DrugMasterZipError extends Error {
  constructor(
    public readonly code: DrugMasterZipErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DrugMasterZipError';
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function decodeZipFileName(bytes: Uint8Array, utf8: boolean): string {
  const decoder = new TextDecoder(utf8 ? 'utf-8' : 'shift_jis');
  return decoder.decode(bytes).replace(/\0/g, '').trim();
}

function findEndOfCentralDirectory(view: DataView): number {
  const maxCommentLength = 0xffff;
  const minOffset = Math.max(0, view.byteLength - maxCommentLength - 22);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset--) {
    if (readUint32(view, offset) === EOCD_SIGNATURE) return offset;
  }
  throw new DrugMasterZipError('drug_master_zip_invalid', 'ZIPファイルの中央ディレクトリを確認できません。');
}

function parseZipEntries(bytes: Uint8Array): DrugMasterZipCsvEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 22) {
    throw new DrugMasterZipError('drug_master_zip_invalid', 'ZIPファイルの形式を確認できません。');
  }

  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const centralDirectorySize = readUint32(view, eocdOffset + 12);

  if (centralDirectoryOffset === ZIP64_SENTINEL || centralDirectorySize === ZIP64_SENTINEL || totalEntries === 0xffff) {
    throw new DrugMasterZipError('drug_master_zip_zip64_unsupported', 'ZIP64形式のファイルにはまだ対応していません。');
  }

  if (centralDirectoryOffset + centralDirectorySize > view.byteLength) {
    throw new DrugMasterZipError('drug_master_zip_invalid', 'ZIPファイルの一覧領域が壊れています。');
  }

  const entries: DrugMasterZipCsvEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (readUint32(view, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new DrugMasterZipError('drug_master_zip_invalid', 'ZIPファイルの一覧を読み取れません。');
    }

    const generalPurposeFlag = readUint16(view, offset + 8);
    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraFieldLength = readUint16(view, offset + 30);
    const fileCommentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = decodeZipFileName(bytes.slice(fileNameStart, fileNameEnd), Boolean(generalPurposeFlag & 0x0800));

    if (compressedSize === ZIP64_SENTINEL || uncompressedSize === ZIP64_SENTINEL || localHeaderOffset === ZIP64_SENTINEL) {
      throw new DrugMasterZipError('drug_master_zip_zip64_unsupported', 'ZIP64形式のファイルにはまだ対応していません。');
    }

    if (fileName && !fileName.endsWith('/')) {
      entries.push({
        fileName,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      });
    }

    offset = fileNameEnd + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function isCsvEntry(entry: DrugMasterZipCsvEntry): boolean {
  const fileName = entry.fileName.replace(/\\/g, '/');
  if (fileName.startsWith('__MACOSX/')) return false;
  return /\.csv$/i.test(fileName);
}

function pickDrugMasterCsv(entries: DrugMasterZipCsvEntry[]): DrugMasterZipCsvEntry {
  const csvEntries = entries.filter(isCsvEntry);
  if (csvEntries.length === 0) {
    throw new DrugMasterZipError('drug_master_zip_no_csv', 'ZIP内に医薬品マスターCSVが見つかりません。');
  }

  return [...csvEntries].sort((a, b) => {
    const aFull = /all|zen|全件|y_/i.test(a.fileName) ? 1 : 0;
    const bFull = /all|zen|全件|y_/i.test(b.fileName) ? 1 : 0;
    if (aFull !== bFull) return bFull - aFull;
    return b.uncompressedSize - a.uncompressedSize;
  })[0];
}

async function inflateRawDeflate(data: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = globalThis.DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new DrugMasterZipError(
      'drug_master_zip_unsupported_compression',
      'このブラウザではZIP内の圧縮CSVを展開できません。'
    );
  }

  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([dataBuffer]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractEntryBytes(bytes: Uint8Array, entry: DrugMasterZipCsvEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (readUint32(view, offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new DrugMasterZipError('drug_master_zip_invalid', 'ZIP内CSVの本体位置を確認できません。');
  }

  const fileNameLength = readUint16(view, offset + 26);
  const extraFieldLength = readUint16(view, offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.byteLength) {
    throw new DrugMasterZipError('drug_master_zip_invalid', 'ZIP内CSVのサイズを確認できません。');
  }

  const compressedBytes = bytes.slice(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressedBytes;
  if (entry.compressionMethod === 8) return inflateRawDeflate(compressedBytes);

  throw new DrugMasterZipError(
    'drug_master_zip_unsupported_compression',
    `ZIP内CSVの圧縮方式 ${entry.compressionMethod} には対応していません。`
  );
}

export function isDrugMasterZipUpload(fileName: string, bytes?: ArrayBuffer | Uint8Array): boolean {
  if (/\.zip$/i.test(fileName.trim())) return true;
  const data = bytes ? toUint8Array(bytes) : undefined;
  return Boolean(data && data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04);
}

export async function extractDrugMasterCsvFromZip(
  input: ArrayBuffer | Uint8Array
): Promise<ExtractDrugMasterCsvFromZipResult> {
  const bytes = toUint8Array(input);
  const entries = parseZipEntries(bytes);
  const csvEntryCount = entries.filter(isCsvEntry).length;
  const selected = pickDrugMasterCsv(entries);
  const csvBytes = await extractEntryBytes(bytes, selected);

  if (selected.uncompressedSize > 0 && csvBytes.length !== selected.uncompressedSize) {
    throw new DrugMasterZipError('drug_master_zip_invalid', 'ZIP内CSVの展開後サイズが一致しません。');
  }

  return {
    csvFileName: selected.fileName,
    csvBytes,
    compressionMethod: selected.compressionMethod,
    compressedSize: selected.compressedSize,
    uncompressedSize: selected.uncompressedSize,
    entryCount: entries.length,
    csvEntryCount
  };
}
