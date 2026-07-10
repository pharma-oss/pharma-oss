import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildMockMynaCardReaderResult,
  MynaCardReaderError,
  normalizeMynaCardReaderPayload,
  readMynaCard,
  readMynaCardFromBridge
} from './myna_card_reader.ts';

const fixedNow = () => new Date('2026-06-18T09:00:00.000Z');

test('buildMockMynaCardReaderResult marks demo data as mock source', () => {
  const result = buildMockMynaCardReaderResult(fixedNow);

  assert.strictEqual(result.readerSource, 'mock');
  assert.strictEqual(result.readerCheckedAt, '2026-06-18T09:00:00.000Z');
  assert.match(result.readerMessage, /デモ用/);
  assert.strictEqual(result.name, 'マイナ 太郎');
  assert.strictEqual(result.insuranceInfo?.number, '12345678');
});

test('normalizeMynaCardReaderPayload accepts nested Japanese card-reader payloads', () => {
  const result = normalizeMynaCardReaderPayload({
    patient: {
      氏名: ' 資格 花子 ',
      氏名カナ: 'シカク ハナコ',
      生年月日: '1980年1月2日',
      性別: '女性',
      保険情報: {
        保険者番号: '０６１２３４５６',
        記号番号: ' 記号１２３ ',
        負担割合: '3割'
      }
    },
    特定健診情報: [{
      健診日: '2026-04-10',
      身長: '160.5',
      体重: '52.4',
      BMI: '20.4',
      収縮期血圧: '122',
      拡張期血圧: '74',
      HbA1c: '5.6',
      eGFR: '80.1',
      所見: ['腎機能確認']
    }],
    薬剤履歴: [{
      調剤日: '2026-06-01',
      薬品名: 'アムロジピン錠5mg',
      用法: '1日1回 朝食後',
      日数: '28',
      医療機関名: '資格内科'
    }]
  }, {
    source: 'bridge',
    checkedAt: '2026-06-18T09:00:00.000Z'
  });

  assert.strictEqual(result.readerSource, 'bridge');
  assert.strictEqual(result.name, '資格 花子');
  assert.strictEqual(result.birthDate, '1980-01-02');
  assert.strictEqual(result.gender, 'female');
  assert.strictEqual(result.insuranceInfo?.provider, '06123456');
  assert.strictEqual(result.insuranceInfo?.number, '記号123');
  assert.strictEqual(result.insuranceInfo?.burdenRatio, 30);
  assert.strictEqual(result.specificHealthCheckups?.[0]?.checkedAt, '2026-04-10');
  assert.strictEqual(result.specificHealthCheckups?.[0]?.heightCm, 160.5);
  assert.strictEqual(result.specificHealthCheckups?.[0]?.findings?.[0], '腎機能確認');
  assert.strictEqual(result.medicationHistory?.[0]?.drugName, 'アムロジピン錠5mg');
  assert.strictEqual(result.medicationHistory?.[0]?.days, 28);
});

test('readMynaCard falls back to explicit mock mode when no bridge endpoint is configured', async () => {
  const result = await readMynaCard({ now: fixedNow });

  assert.strictEqual(result.readerSource, 'mock');
  assert.strictEqual(result.readerCheckedAt, '2026-06-18T09:00:00.000Z');
});

test('readMynaCard blocks implicit mock fallback when disabled', async () => {
  await assert.rejects(
    () => readMynaCard({ allowMockFallback: false, now: fixedNow }),
    (error) => {
      assert.ok(error instanceof MynaCardReaderError);
      assert.strictEqual(error.code, 'myna_reader_bridge_unconfigured');
      assert.strictEqual(error.status, 503);
      return true;
    }
  );
});

test('readMynaCard blocks explicit mock mode when disabled', async () => {
  await assert.rejects(
    () => readMynaCard({ mode: 'mock', allowMockFallback: false, now: fixedNow }),
    (error) => {
      assert.ok(error instanceof MynaCardReaderError);
      assert.strictEqual(error.code, 'myna_reader_mock_disabled');
      assert.strictEqual(error.status, 503);
      return true;
    }
  );
});

test('normalizeMynaCardReaderPayload keeps numeric burden ratios as percentages', () => {
  const result = normalizeMynaCardReaderPayload({
    name: '負担 一郎',
    birthDate: '1970-01-01',
    insuranceInfo: {
      burdenRatio: '10'
    }
  });

  assert.strictEqual(result.insuranceInfo?.burdenRatio, 10);
});

test('readMynaCard bridge mode requires a configured endpoint', async () => {
  await assert.rejects(
    () => readMynaCard({ mode: 'bridge' }),
    (error) => {
      assert.ok(error instanceof MynaCardReaderError);
      assert.strictEqual(error.code, 'myna_reader_bridge_unconfigured');
      assert.strictEqual(error.status, 503);
      return true;
    }
  );
});

test('readMynaCardFromBridge fetches and normalizes bridge responses', async () => {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          name: '実機 太郎',
          birthDate: '1975/12/05',
          insuranceInfo: {
            provider: '06123456',
            number: 'A123',
            burdenRatio: 20
          }
        };
      }
    } as Response;
  };

  const result = await readMynaCardFromBridge({
    endpoint: 'http://127.0.0.1:39100/myna/read',
    fetchImpl,
    now: fixedNow
  });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(String(calls[0].input), 'http://127.0.0.1:39100/myna/read');
  assert.strictEqual(calls[0].init?.method, 'GET');
  assert.strictEqual(result.readerSource, 'bridge');
  assert.strictEqual(result.readerCheckedAt, '2026-06-18T09:00:00.000Z');
  assert.strictEqual(result.name, '実機 太郎');
  assert.strictEqual(result.birthDate, '1975-12-05');
});

test('readMynaCardFromBridge rejects invalid bridge payloads', async () => {
  const fetchImpl: typeof fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { insuranceInfo: { number: '12345678' } };
    }
  } as Response);

  await assert.rejects(
    () => readMynaCardFromBridge({
      endpoint: 'http://127.0.0.1:39100/myna/read',
      fetchImpl,
      now: fixedNow
    }),
    (error) => {
      assert.ok(error instanceof MynaCardReaderError);
      assert.strictEqual(error.code, 'myna_reader_payload_invalid');
      return true;
    }
  );
});
