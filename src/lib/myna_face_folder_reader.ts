// 資格確認端末(顔認証付きカードリーダー)が連携フォルダへ出す「資格確認結果」XMLを読んで、マイナ読取の結果にする。
// サーバー側(APIルート)専用。ブラウザのコードからは import しない(ファイルを読むため)。
//
// 読み方の方針:
//   - フォルダは環境変数(MYNA_CARD_READER_FOLDER)で決める。画面やリクエストから渡されたパスは使わない。
//   - 対象は OQSsiquc01res_face_*.xml だけ。一番新しい1件を、受付中の患者のものとして読む。
//     古いファイルが残っていても別の患者を取り込まないよう、更新から一定時間(既定10分)を過ぎたものは使わない。
//   - 元のファイルは削除・移動・書き換えをしない(資格確認端末側が管理するため)。
//   - シンボリックリンク、通常ファイル以外、4MiBを超えるファイルは読まない。
//   - 形式の出どころは src/lib/onshi_qualification_xml.ts を参照(公式仕様書は未入手、実機未確認)。
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  OnshiXmlError,
  assertCharacterCodeMatches,
  decodeOnshiXml,
  parseOnshiQualificationXml,
  type OnshiQualificationResult
} from './onshi_qualification_xml';
import {
  MynaCardReaderError,
  assertMynaCardReaderResult,
  type MynaCardReaderResult
} from './myna_card_reader';

export const FACE_XML_FILE_PATTERN = /^OQSsiquc01res_face_[^\\/]+\.xml$/i;
export const DEFAULT_FACE_XML_MAX_AGE_MINUTES = 10;
export const MIN_FACE_XML_MAX_AGE_MINUTES = 1;
export const MAX_FACE_XML_MAX_AGE_MINUTES = 120;
export const MAX_FACE_XML_BYTES = 4 * 1024 * 1024;
// 共有フォルダ越しの時計のずれを許す幅。これより未来の更新時刻は信用しない。
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export interface FolderEntryStat {
  isFile(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
}

export interface FaceFolderFileSystem {
  readdir(directory: string): Promise<string[]>;
  lstat(filePath: string): Promise<FolderEntryStat>;
  readFile(filePath: string): Promise<Uint8Array>;
}

const nodeFileSystem: FaceFolderFileSystem = {
  readdir: (directory) => readdir(directory),
  lstat: (filePath) => lstat(filePath),
  readFile: (filePath) => readFile(filePath)
};

export interface FaceFolderReadConfig {
  folderPath?: string;
  maxAgeMinutes?: number;
  now?: () => Date;
  fileSystem?: FaceFolderFileSystem;
}

export function clampFaceXmlMaxAgeMinutes(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return DEFAULT_FACE_XML_MAX_AGE_MINUTES;
  return Math.min(MAX_FACE_XML_MAX_AGE_MINUTES, Math.max(MIN_FACE_XML_MAX_AGE_MINUTES, Math.round(value)));
}

function formatRecordNumber(result: OnshiQualificationResult): string | undefined {
  const parts = [
    result.insuredCardSymbol ? `記号${result.insuredCardSymbol}` : '',
    result.insuredIdentificationNumber ? `番号${result.insuredIdentificationNumber}` : '',
    result.insuredBranchNumber ? `枝番${result.insuredBranchNumber}` : ''
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function buildMynaResultFromQualification(
  qualification: OnshiQualificationResult,
  options: { modifiedAt: Date; fileName: string }
): MynaCardReaderResult {
  const recordNumber = formatRecordNumber(qualification);
  const confirmedAt = qualification.header.processExecutionTime || options.modifiedAt.toISOString();
  return {
    name: qualification.name,
    ...(qualification.nameKana ? { kana: qualification.nameKana } : {}),
    birthDate: qualification.birthDate,
    ...(qualification.sex ? { gender: qualification.sex } : {}),
    insuranceInfo: {
      ...(qualification.insurerNumber ? { provider: qualification.insurerNumber } : {}),
      ...(recordNumber ? { number: recordNumber } : {}),
      ...(qualification.burdenRatioPercent !== undefined ? { burdenRatio: qualification.burdenRatioPercent } : {})
    },
    readerSource: 'folder',
    readerCheckedAt: options.modifiedAt.toISOString(),
    readerMessage: `資格確認端末の連携フォルダから読み取りました(確認 ${confirmedAt} / ${options.fileName})。`
  };
}

export async function readMynaCardFromFolder(config: FaceFolderReadConfig): Promise<MynaCardReaderResult> {
  const folderPath = config.folderPath?.trim();
  if (!folderPath) {
    throw new MynaCardReaderError(
      'myna_reader_folder_unconfigured',
      '資格確認端末の連携フォルダが未設定です。MYNA_CARD_READER_FOLDER にフォルダを指定してください。',
      503
    );
  }
  if (!path.isAbsolute(folderPath)) {
    throw new MynaCardReaderError(
      'myna_reader_folder_unconfigured',
      '連携フォルダは絶対パス(または共有フォルダのパス)で指定してください。',
      503
    );
  }

  const fileSystem = config.fileSystem ?? nodeFileSystem;
  const now = (config.now ?? (() => new Date()))();
  const maxAgeMinutes = clampFaceXmlMaxAgeMinutes(config.maxAgeMinutes);

  let names: string[];
  try {
    names = await fileSystem.readdir(folderPath);
  } catch (cause) {
    throw new MynaCardReaderError(
      'myna_reader_folder_unreadable',
      '資格確認端末の連携フォルダを開けませんでした。フォルダの場所とアクセス権を確認してください。',
      503,
      cause
    );
  }

  let newest: { name: string; modifiedAtMs: number; size: number } | undefined;
  for (const name of names) {
    if (!FACE_XML_FILE_PATTERN.test(name)) continue;
    let stat: FolderEntryStat;
    try {
      stat = await fileSystem.lstat(path.join(folderPath, name));
    } catch {
      continue; // 一覧のあとに消えたファイルは飛ばす
    }
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    if (!newest || stat.mtimeMs > newest.modifiedAtMs || (stat.mtimeMs === newest.modifiedAtMs && name > newest.name)) {
      newest = { name, modifiedAtMs: stat.mtimeMs, size: stat.size };
    }
  }

  if (!newest) {
    throw new MynaCardReaderError(
      'myna_reader_folder_empty',
      '資格確認結果のファイルが見つかりません。患者にマイナンバーカードを読み取らせてから、もう一度押してください。',
      404
    );
  }

  const ageMs = now.getTime() - newest.modifiedAtMs;
  if (ageMs < -CLOCK_SKEW_TOLERANCE_MS) {
    throw new MynaCardReaderError(
      'myna_reader_folder_clock_skew',
      '資格確認結果の更新時刻が未来になっています。資格確認端末とこの端末の時計を確認してください。',
      409
    );
  }
  if (ageMs > maxAgeMinutes * 60 * 1000) {
    const minutes = Math.max(1, Math.round(ageMs / 60000));
    throw new MynaCardReaderError(
      'myna_reader_folder_stale',
      `最新の資格確認結果は約${minutes}分前のものです(使えるのは${maxAgeMinutes}分以内)。別の患者の情報を取り込まないよう、もう一度マイナンバーカードを読み取らせてください。`,
      409
    );
  }
  if (newest.size > MAX_FACE_XML_BYTES) {
    throw new MynaCardReaderError('myna_reader_file_invalid', '資格確認結果のファイルが大きすぎるため読みません。', 422);
  }

  try {
    const bytes = await fileSystem.readFile(path.join(folderPath, newest.name));
    const decoded = decodeOnshiXml(bytes);
    const qualification = parseOnshiQualificationXml(decoded.text);
    assertCharacterCodeMatches(qualification, decoded.encoding);
    const result = buildMynaResultFromQualification(qualification, {
      modifiedAt: new Date(newest.modifiedAtMs),
      fileName: newest.name
    });
    assertMynaCardReaderResult(result);
    return result;
  } catch (error) {
    if (error instanceof MynaCardReaderError) throw error;
    if (error instanceof OnshiXmlError) {
      throw new MynaCardReaderError('myna_reader_file_invalid', error.message, 422, error);
    }
    throw new MynaCardReaderError(
      'myna_reader_folder_unreadable',
      '資格確認結果のファイルを読めませんでした。',
      503,
      error
    );
  }
}
