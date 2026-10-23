import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FACE_XML_MAX_AGE_MINUTES,
  FACE_XML_FILE_PATTERN,
  MAX_FACE_XML_BYTES,
  clampFaceXmlMaxAgeMinutes,
  readMynaCardFromFolder,
  type FaceFolderFileSystem
} from './myna_face_folder_reader';
import { MynaCardReaderError, readMynaCard, resolveMynaReaderAvailability } from './myna_card_reader';

const NOW = new Date('2026-10-23T09:30:00+09:00');
const FOLDER = '/share/oqs/face';

function sampleXml(name = '検証 花子', birthdate = '19850315', extra = ''): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<XmlMsg>
  <MessageHeader>
    <ProcessExecutionTime>20261023092800</ProcessExecutionTime>
    <MedicalInstitutionCode>1311234567</MedicalInstitutionCode>
    <ReferenceClassification>1</ReferenceClassification>
    <SegmentOfResult>1</SegmentOfResult>
    <CharacterCodeIdentifier>0</CharacterCodeIdentifier>
  </MessageHeader>
  <MessageBody>
    <ProcessingResultStatus>1</ProcessingResultStatus>
    <ResultList>
      <ResultOfQualificationConfirmation>
        <Name>${name}</Name><NameKana>ｹﾝｼｮｳ ﾊﾅｺ</NameKana><Sex1>2</Sex1><Birthdate>${birthdate}</Birthdate>
        <InsurerNumber>01234567</InsurerNumber><InsuredCardSymbol>123</InsuredCardSymbol>
        <InsuredIdentificationNumber>456</InsuredIdentificationNumber><InsuredBranchNumber>01</InsuredBranchNumber>
        ${extra}
      </ResultOfQualificationConfirmation>
    </ResultList>
  </MessageBody>
</XmlMsg>`;
}

interface FakeFile {
  bytes: Uint8Array;
  mtimeMs: number;
  isFile?: boolean;
  isSymbolicLink?: boolean;
}

function createFakeFileSystem(files: Record<string, FakeFile>, options: { failReaddir?: boolean } = {}): FaceFolderFileSystem & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async readdir() {
      if (options.failReaddir) throw new Error('EACCES');
      return Object.keys(files);
    },
    async lstat(filePath) {
      const file = files[filePath.split('/').pop() as string];
      if (!file) throw new Error('ENOENT');
      return {
        isFile: () => file.isFile ?? true,
        isSymbolicLink: () => file.isSymbolicLink ?? false,
        size: file.bytes.length,
        mtimeMs: file.mtimeMs
      };
    },
    async readFile(filePath) {
      reads.push(filePath);
      return files[filePath.split('/').pop() as string].bytes;
    }
  };
}

const minutesAgo = (minutes: number) => NOW.getTime() - minutes * 60 * 1000;
const utf8 = (text: string) => new TextEncoder().encode(text);

async function expectReaderError(action: () => Promise<unknown>, code: string, status?: number) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof MynaCardReaderError, 'must be a MynaCardReaderError');
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

describe('FACE_XML_FILE_PATTERN', () => {
  it('matches only the face result files', () => {
    assert.ok(FACE_XML_FILE_PATTERN.test('OQSsiquc01res_face_20261023092800.xml'));
    assert.equal(FACE_XML_FILE_PATTERN.test('OQSsiquc01req_face_1.xml'), false);
    assert.equal(FACE_XML_FILE_PATTERN.test('YZKsiquc01res_01261023.xml'), false);
    assert.equal(FACE_XML_FILE_PATTERN.test('../OQSsiquc01res_face_1.xml'), false);
    assert.equal(FACE_XML_FILE_PATTERN.test('OQSsiquc01res_face_1.xml.bak'), false);
  });
});

describe('readMynaCardFromFolder', () => {
  it('reads the newest recent file and maps it to the reception fields', async () => {
    const fileSystem = createFakeFileSystem({
      'OQSsiquc01res_face_old.xml': { bytes: utf8(sampleXml('古い 患者', '19700101')), mtimeMs: minutesAgo(8) },
      'OQSsiquc01res_face_new.xml': { bytes: utf8(sampleXml()), mtimeMs: minutesAgo(1) }
    });
    const result = await readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem });
    assert.equal(result.readerSource, 'folder');
    assert.equal(result.name, '検証 花子');
    assert.equal(result.kana, 'ケンショウ ハナコ');
    assert.equal(result.birthDate, '1985-03-15');
    assert.equal(result.gender, 'female');
    assert.equal(result.insuranceInfo?.provider, '01234567');
    assert.equal(result.insuranceInfo?.number, '記号123 番号456 枝番01');
    assert.equal(result.insuranceInfo?.burdenRatio, undefined, 'no burden ratio is invented');
    assert.ok(result.readerMessage.includes('OQSsiquc01res_face_new.xml'));
    assert.deepEqual(fileSystem.reads, [`${FOLDER}/OQSsiquc01res_face_new.xml`], 'only the newest file is opened');
  });

  it('carries a burden ratio only when the file states one', async () => {
    const fileSystem = createFakeFileSystem({
      'OQSsiquc01res_face_a.xml': {
        bytes: utf8(sampleXml('検証 太郎', '19450101', '<InsuredPartialContributionRatio>020</InsuredPartialContributionRatio>')),
        mtimeMs: minutesAgo(1)
      }
    });
    const result = await readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem });
    assert.equal(result.insuranceInfo?.burdenRatio, 20);
  });

  it('refuses a stale file so another patient is not filled in', async () => {
    const fileSystem = createFakeFileSystem({ 'OQSsiquc01res_face_a.xml': { bytes: utf8(sampleXml()), mtimeMs: minutesAgo(DEFAULT_FACE_XML_MAX_AGE_MINUTES + 1) } });
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem }), 'myna_reader_folder_stale', 409);
    // 期限を伸ばせば読める
    const result = await readMynaCardFromFolder({ folderPath: FOLDER, maxAgeMinutes: 30, now: () => NOW, fileSystem });
    assert.equal(result.name, '検証 花子');
  });

  it('refuses a modification time far in the future (clock skew)', async () => {
    const fileSystem = createFakeFileSystem({ 'OQSsiquc01res_face_a.xml': { bytes: utf8(sampleXml()), mtimeMs: NOW.getTime() + 20 * 60 * 1000 } });
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem }), 'myna_reader_folder_clock_skew', 409);
  });

  it('reports an empty folder and ignores files that do not match', async () => {
    const empty = createFakeFileSystem({
      'readme.txt': { bytes: utf8('x'), mtimeMs: minutesAgo(1) },
      'OQSsiquc01res_face_1.xml.bak': { bytes: utf8(sampleXml()), mtimeMs: minutesAgo(1) }
    });
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem: empty }), 'myna_reader_folder_empty', 404);
  });

  it('skips symbolic links and non-regular files', async () => {
    const fileSystem = createFakeFileSystem({
      'OQSsiquc01res_face_link.xml': { bytes: utf8(sampleXml()), mtimeMs: minutesAgo(1), isSymbolicLink: true },
      'OQSsiquc01res_face_dir.xml': { bytes: utf8(sampleXml()), mtimeMs: minutesAgo(1), isFile: false }
    });
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem }), 'myna_reader_folder_empty');
    assert.deepEqual(fileSystem.reads, []);
  });

  it('refuses an oversized file without reading it', async () => {
    const fileSystem = createFakeFileSystem({ 'OQSsiquc01res_face_big.xml': { bytes: new Uint8Array(MAX_FACE_XML_BYTES + 1), mtimeMs: minutesAgo(1) } });
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem }), 'myna_reader_file_invalid', 422);
    assert.deepEqual(fileSystem.reads, []);
  });

  it('turns a broken or unsafe file into a clear error and never leaks the file contents', async () => {
    const secret = '機密の氏名';
    const bomb = createFakeFileSystem({
      'OQSsiquc01res_face_a.xml': { bytes: utf8(`<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "${secret}">]><a>&x;</a>`), mtimeMs: minutesAgo(1) }
    });
    await assert.rejects(
      () => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem: bomb }),
      (error: unknown) => error instanceof MynaCardReaderError && error.code === 'myna_reader_file_invalid' && !error.message.includes(secret)
    );
    const processing = createFakeFileSystem({
      'OQSsiquc01res_face_a.xml': { bytes: utf8(sampleXml().replace('<SegmentOfResult>1<', '<SegmentOfResult>2<')), mtimeMs: minutesAgo(1) }
    });
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem: processing }), 'myna_reader_file_invalid', 422);
  });

  it('requires a configured absolute folder and reports an unreadable one', async () => {
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: '', now: () => NOW }), 'myna_reader_folder_unconfigured', 503);
    await expectReaderError(() => readMynaCardFromFolder({ folderPath: 'relative/dir', now: () => NOW }), 'myna_reader_folder_unconfigured', 503);
    await expectReaderError(
      () => readMynaCardFromFolder({ folderPath: FOLDER, now: () => NOW, fileSystem: createFakeFileSystem({}, { failReaddir: true }) }),
      'myna_reader_folder_unreadable',
      503
    );
  });

  it('clamps the allowed age', () => {
    assert.equal(clampFaceXmlMaxAgeMinutes(undefined), DEFAULT_FACE_XML_MAX_AGE_MINUTES);
    assert.equal(clampFaceXmlMaxAgeMinutes(0), DEFAULT_FACE_XML_MAX_AGE_MINUTES);
    assert.equal(clampFaceXmlMaxAgeMinutes(9999), 120);
    assert.equal(clampFaceXmlMaxAgeMinutes(0.4), 1);
  });
});

describe('readMynaCard with a folder', () => {
  it('uses the folder in folder mode and reports a missing folder setting', async () => {
    await expectReaderError(() => readMynaCard({ mode: 'folder' }), 'myna_reader_folder_unconfigured', 503);
  });

  it('does not fall back to the demo data when folder mode fails', async () => {
    await assert.rejects(
      () => readMynaCard({ mode: 'folder', folderPath: '/definitely/not/here', allowMockFallback: true }),
      (error: unknown) => error instanceof MynaCardReaderError && error.code === 'myna_reader_folder_unreadable'
    );
  });

  it('prefers the bridge endpoint over the folder in auto mode, and uses the folder when there is no endpoint', async () => {
    await assert.rejects(
      () => readMynaCard({ mode: 'auto', endpoint: 'http://127.0.0.1:1/none', folderPath: '/definitely/not/here', timeoutMs: 1000 }),
      (error: unknown) => error instanceof MynaCardReaderError && error.code.startsWith('myna_reader_bridge')
    );
    await assert.rejects(
      () => readMynaCard({ mode: 'auto', folderPath: '/definitely/not/here', allowMockFallback: true }),
      (error: unknown) => error instanceof MynaCardReaderError && error.code === 'myna_reader_folder_unreadable'
    );
  });
});

describe('resolveMynaReaderAvailability', () => {
  it('treats the demo data as unavailable so staff cannot mistake it for a real read', () => {
    const mock = resolveMynaReaderAvailability({ mode: 'mock' });
    assert.equal(mock.available, false);
    assert.ok(mock.reason);
    assert.equal(resolveMynaReaderAvailability({}).available, false);
  });

  it('is available when a folder or an endpoint is configured for the matching mode', () => {
    assert.deepEqual(resolveMynaReaderAvailability({ mode: 'folder', folderPath: FOLDER }), { available: true, source: 'folder' });
    assert.equal(resolveMynaReaderAvailability({ mode: 'folder' }).available, false);
    assert.deepEqual(resolveMynaReaderAvailability({ mode: 'bridge', endpoint: 'http://127.0.0.1:8080' }), { available: true, source: 'bridge' });
    assert.equal(resolveMynaReaderAvailability({ mode: 'bridge' }).available, false);
    assert.deepEqual(resolveMynaReaderAvailability({ mode: 'auto', folderPath: FOLDER }), { available: true, source: 'folder' });
    assert.deepEqual(resolveMynaReaderAvailability({ mode: 'auto', endpoint: 'http://x', folderPath: FOLDER }), { available: true, source: 'bridge' });
    assert.equal(resolveMynaReaderAvailability({ mode: 'disabled', folderPath: FOLDER }).available, false);
  });
});
