/**
 * 依存パッケージなしでXLSX(=ZIPコンテナ)を読み取るための最小限のリーダー。
 * ZIP解析ロジックは src/lib/drug_master_zip.ts と同じ方式(中央ディレクトリ走査 + DecompressionStream)。
 * 厚生局が公開する「コード内容別医療機関一覧表」のExcelファイルは、都道府県ごとの.xlsxを
 * さらに.zipで束ねて配布されるため、二重(外側zip→内側xlsx=zip)の解凍に対応する。
 */

export type XlsxZipErrorCode =
  | 'xlsx_zip_invalid'
  | 'xlsx_zip_entry_not_found'
  | 'xlsx_zip_unsupported_compression'
  | 'xlsx_zip_zip64_unsupported';

export class XlsxZipError extends Error {
  constructor(
    public readonly code: XlsxZipErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'XlsxZipError';
  }
}

export interface ZipEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
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
  throw new XlsxZipError('xlsx_zip_invalid', 'ZIPファイルの中央ディレクトリを確認できません。');
}

export function listZipEntries(input: ArrayBuffer | Uint8Array): ZipEntry[] {
  const bytes = toUint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 22) {
    throw new XlsxZipError('xlsx_zip_invalid', 'ZIPファイルの形式を確認できません。');
  }

  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const centralDirectorySize = readUint32(view, eocdOffset + 12);

  if (centralDirectoryOffset === ZIP64_SENTINEL || centralDirectorySize === ZIP64_SENTINEL || totalEntries === 0xffff) {
    throw new XlsxZipError('xlsx_zip_zip64_unsupported', 'ZIP64形式のファイルにはまだ対応していません。');
  }
  if (centralDirectoryOffset + centralDirectorySize > view.byteLength) {
    throw new XlsxZipError('xlsx_zip_invalid', 'ZIPファイルの一覧領域が壊れています。');
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (readUint32(view, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new XlsxZipError('xlsx_zip_invalid', 'ZIPファイルの一覧を読み取れません。');
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
      throw new XlsxZipError('xlsx_zip_zip64_unsupported', 'ZIP64形式のファイルにはまだ対応していません。');
    }

    if (fileName && !fileName.endsWith('/')) {
      entries.push({ fileName, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    }

    offset = fileNameEnd + extraFieldLength + fileCommentLength;
  }

  return entries;
}

async function inflateRawDeflate(data: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = globalThis.DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new XlsxZipError('xlsx_zip_unsupported_compression', 'この環境ではZIP内の圧縮データを展開できません。');
  }
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([dataBuffer]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function extractZipEntryBytes(input: ArrayBuffer | Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const bytes = toUint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (readUint32(view, offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new XlsxZipError('xlsx_zip_invalid', 'ZIP内エントリの本体位置を確認できません。');
  }

  const fileNameLength = readUint16(view, offset + 26);
  const extraFieldLength = readUint16(view, offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.byteLength) {
    throw new XlsxZipError('xlsx_zip_invalid', 'ZIP内エントリのサイズを確認できません。');
  }

  const compressedBytes = bytes.slice(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressedBytes;
  if (entry.compressionMethod === 8) return inflateRawDeflate(compressedBytes);

  throw new XlsxZipError('xlsx_zip_unsupported_compression', `ZIP内エントリの圧縮方式 ${entry.compressionMethod} には対応していません。`);
}

export async function extractZipEntryText(input: ArrayBuffer | Uint8Array, entryNamePredicate: (fileName: string) => boolean): Promise<string> {
  const bytes = toUint8Array(input);
  const entries = listZipEntries(bytes);
  const entry = entries.find((e) => entryNamePredicate(e.fileName.replace(/\\/g, '/')));
  if (!entry) {
    throw new XlsxZipError('xlsx_zip_entry_not_found', 'ZIP内に対象のファイルが見つかりません。');
  }
  const data = await extractZipEntryBytes(bytes, entry);
  return new TextDecoder('utf-8').decode(data);
}

/** 外側のZIP(都道府県別.xlsxを束ねたもの)に含まれる.xlsxエントリ一覧 */
export function listXlsxEntriesInZip(input: ArrayBuffer | Uint8Array): ZipEntry[] {
  return listZipEntries(input).filter((e) => /\.xlsx$/i.test(e.fileName.replace(/\\/g, '/')));
}

export type XlsxCellGrid = Map<number, Map<string, string>>;

/**
 * XLSX内の xl/sharedStrings.xml と xl/worksheets/sheet1.xml から、
 * 行番号→列アルファベット→セル文字列 のグリッドを組み立てる。
 * 数式・書式・結合セルは扱わず、文字列/数値セルの値のみを対象とする(この用途に十分)。
 */
export function parseXlsxSheetGrid(sharedStringsXml: string, sheetXml: string): XlsxCellGrid {
  const strings: string[] = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siRegex.exec(sharedStringsXml))) {
    const texts = [...siMatch[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    strings.push(decodeXmlEntities(texts.join('')));
  }

  const grid: XlsxCellGrid = new Map();
  const rowRegex = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const rowNum = Number(rowMatch[1]);
    const cellsXml = rowMatch[2];
    const cellRegex = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    const rowCells = new Map<string, string>();
    while ((cellMatch = cellRegex.exec(cellsXml))) {
      const col = cellMatch[1];
      const attrs = cellMatch[2];
      const body = cellMatch[3];
      const typeMatch = attrs.match(/t="([a-z]+)"/);
      const type = typeMatch ? typeMatch[1] : undefined;
      const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      if (!valueMatch) continue;
      const raw = valueMatch[1];
      const text = type === 's' ? strings[Number(raw)] : decodeXmlEntities(raw);
      if (text !== undefined && text.trim() !== '') {
        rowCells.set(col, text);
      }
    }
    if (rowCells.size > 0) grid.set(rowNum, rowCells);
  }

  return grid;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 単一の.xlsxファイル(それ自体がZIP)から、シート1のグリッドを読み取る */
export async function readXlsxSheetGridFromXlsxBytes(xlsxBytes: ArrayBuffer | Uint8Array): Promise<XlsxCellGrid> {
  const bytes = toUint8Array(xlsxBytes);
  const entries = listZipEntries(bytes);

  const sharedStringsEntry = entries.find((e) => e.fileName.replace(/\\/g, '/').endsWith('xl/sharedStrings.xml'));
  const sheetEntry = entries.find((e) => e.fileName.replace(/\\/g, '/').endsWith('xl/worksheets/sheet1.xml'));
  if (!sheetEntry) {
    throw new XlsxZipError('xlsx_zip_entry_not_found', 'XLSX内にシートデータ(sheet1.xml)が見つかりません。');
  }

  const sheetXml = new TextDecoder('utf-8').decode(await extractZipEntryBytes(bytes, sheetEntry));
  const sharedStringsXml = sharedStringsEntry
    ? new TextDecoder('utf-8').decode(await extractZipEntryBytes(bytes, sharedStringsEntry))
    : '<sst/>';

  return parseXlsxSheetGrid(sharedStringsXml, sheetXml);
}
