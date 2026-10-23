import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET as readMyna } from './read/route';
import { GET as readStatus } from './status/route';

const ENV_KEYS = [
  'MYNA_CARD_READER_MODE',
  'MYNA_CARD_READER_FOLDER',
  'MYNA_CARD_READER_ENDPOINT',
  'MYNA_CARD_READER_FOLDER_MAX_AGE_MINUTES'
] as const;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<XmlMsg>
  <MessageHeader>
    <SegmentOfResult>1</SegmentOfResult>
    <CharacterCodeIdentifier>0</CharacterCodeIdentifier>
  </MessageHeader>
  <MessageBody>
    <ProcessingResultStatus>1</ProcessingResultStatus>
    <ResultList>
      <ResultOfQualificationConfirmation>
        <Name>検証 花子</Name><NameKana>ｹﾝｼｮｳ ﾊﾅｺ</NameKana><Sex1>2</Sex1><Birthdate>19850315</Birthdate>
        <InsurerNumber>01234567</InsurerNumber><InsuredCardSymbol>123</InsuredCardSymbol>
        <InsuredIdentificationNumber>456</InsuredIdentificationNumber><InsuredBranchNumber>01</InsuredBranchNumber>
      </ResultOfQualificationConfirmation>
    </ResultList>
  </MessageBody>
</XmlMsg>`;

describe('Myna folder routes (real file system)', () => {
  let folder: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'myna-face-'));
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await rm(folder, { recursive: true, force: true });
  });

  it('status is unavailable by default, so the button stays off', async () => {
    const body = await (await readStatus()).json();
    assert.equal(body.available, false);
    assert.ok(body.reason);
  });

  it('status is available for a configured folder that exists, and unavailable when it does not', async () => {
    process.env.MYNA_CARD_READER_MODE = 'folder';
    process.env.MYNA_CARD_READER_FOLDER = folder;
    assert.deepEqual(await (await readStatus()).json(), { available: true, source: 'folder' });

    process.env.MYNA_CARD_READER_FOLDER = path.join(folder, 'missing');
    const missing = await (await readStatus()).json();
    assert.equal(missing.available, false);
    assert.ok(missing.reason.includes('開けません'));
  });

  it('reads the face XML that was just written and returns the reception fields', async () => {
    process.env.MYNA_CARD_READER_MODE = 'folder';
    process.env.MYNA_CARD_READER_FOLDER = folder;
    await writeFile(path.join(folder, 'OQSsiquc01res_face_20261023092800.xml'), SAMPLE_XML, 'utf-8');
    const response = await readMyna();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.readerSource, 'folder');
    assert.equal(body.name, '検証 花子');
    assert.equal(body.birthDate, '1985-03-15');
    assert.equal(body.insuranceInfo.provider, '01234567');
  });

  it('answers with a clear error when the folder has no result yet', async () => {
    process.env.MYNA_CARD_READER_MODE = 'folder';
    process.env.MYNA_CARD_READER_FOLDER = folder;
    const response = await readMyna();
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.code, 'myna_reader_folder_empty');
  });

  it('does not use a file that is older than the allowed time', async () => {
    process.env.MYNA_CARD_READER_MODE = 'folder';
    process.env.MYNA_CARD_READER_FOLDER = folder;
    process.env.MYNA_CARD_READER_FOLDER_MAX_AGE_MINUTES = '1';
    const file = path.join(folder, 'OQSsiquc01res_face_old.xml');
    await writeFile(file, SAMPLE_XML, 'utf-8');
    const { utimes } = await import('node:fs/promises');
    const old = new Date(Date.now() - 30 * 60 * 1000);
    await utimes(file, old, old);
    const response = await readMyna();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'myna_reader_folder_stale');
  });
});
