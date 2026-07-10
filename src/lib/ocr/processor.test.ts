import { test, mock } from 'node:test';
import assert from 'node:assert';
import { parseDeliverySlip, parseJahisQr, parsePrescriptionOcrText, processPrescription } from './processor.ts';

test('parseJahisQr should correctly parse patient info and drugs', () => {
  const qrData = 'JAHIS_Z_01\n1,山田 太郎,ヤマダ タロウ,1,19800101\n201,,アスピリン,10,mg,1日1回,7';
  const result = parseJahisQr(qrData);

  assert.strictEqual(result.version, 'JAHIS_Z_01');
  assert.strictEqual(result.patient.name, '山田 太郎');
  assert.strictEqual(result.patient.kana, 'ヤマダ タロウ');
  assert.strictEqual(result.patient.gender, '1');
  assert.strictEqual(result.patient.birthDate, '19800101');

  assert.strictEqual(result.items.length, 1);
  assert.strictEqual(result.items[0].drugName, 'アスピリン');
  assert.strictEqual(result.items[0].amount, '10');
  assert.strictEqual(result.items[0].unit, 'mg');
  assert.strictEqual(result.items[0].usage, '1日1回');
  assert.strictEqual(result.items[0].days, '7');
});

test('parseJahisQr should handle empty or invalid input', () => {
  assert.deepStrictEqual(parseJahisQr(''), {
    version: '',
    patient: {},
    provider: {},
    items: [],
    warnings: [],
    rawRecordCount: 0
  });
  assert.deepStrictEqual(parseJahisQr(null as any), {
    version: '',
    patient: {},
    provider: {},
    items: [],
    warnings: [],
    rawRecordCount: 0
  });
});

test('parseJahisQr should ignore unrecognized record types', () => {
  const qrData = 'JAHIS_Z_01\n999,some,data';
  const result = parseJahisQr(qrData);
  assert.strictEqual(result.version, 'JAHIS_Z_01');
  assert.deepStrictEqual(result.patient, {});
  assert.strictEqual(result.items.length, 0);
  assert.strictEqual(result.rawRecordCount, 1);
});

test('parseJahisQr should parse official provider, drug code, and usage records', () => {
  const qrData = [
    'JAHIS9',
    '1,山田 太郎,1,19800101,,,,,,,ヤマダ タロウ',
    '5,20260630',
    '51,中央クリニック,,,1310000001',
    '55,佐藤 医師,内科',
    '201,1,アスピリン,3,錠,receipt,620000001',
    '301,1,1日3回毎食後,7,,,,1011001',
    '311,1,腰部に貼付'
  ].join('\n');

  const result = parseJahisQr(qrData);

  assert.strictEqual(result.patient.kana, 'ヤマダ タロウ');
  assert.strictEqual(result.provider.prescriptionDate, '20260630');
  assert.strictEqual(result.provider.institutionName, '中央クリニック');
  assert.strictEqual(result.provider.doctorName, '佐藤 医師');
  assert.strictEqual(result.items[0].rpNumber, 1);
  assert.strictEqual(result.items[0].drugCode, '620000001');
  assert.strictEqual(result.items[0].usage, '1日3回毎食後');
  assert.strictEqual(result.items[0].days, '7');
  assert.strictEqual(result.items[0].usageCode, '1011001');
  assert.strictEqual(result.items[0].rpComment, '腰部に貼付');
});

test('parseJahisQr should reject extremely large input', () => {
  const largeData = 'A'.repeat(10001);
  const result = parseJahisQr(largeData);
  assert.strictEqual(result.version, '');
  assert.strictEqual(result.items.length, 0);
});

test('parseJahisQr should limit the number of lines', () => {
  let qrData = 'V1\n';
  for (let i = 0; i < 300; i++) {
    qrData += `201,,Drug${i},10,mg,1日1回,7\n`;
  }
  const result = parseJahisQr(qrData);
  // MAX_LINES is 200, so it should process first 200 lines (including version line)
  // Each line is a drug except the first one.
  assert.strictEqual(result.items.length, 100); // MAX_ITEMS is 100
});

test('parseJahisQr should limit the number of items', () => {
  let qrData = 'V1\n';
  for (let i = 0; i < 150; i++) {
    qrData += `201,,Drug${i},10,mg,1日1回,7\n`;
  }
  const result = parseJahisQr(qrData);
  assert.strictEqual(result.items.length, 100); // MAX_ITEMS is 100
});

test('parseJahisQr should truncate extremely long fields', () => {
  const longName = 'B'.repeat(600);
  const qrData = `JAHIS_Z_01\n1,${longName},KANA,1,19800101`;
  const result = parseJahisQr(qrData);
  assert.strictEqual(result.patient.name?.length, 500); // MAX_FIELD_LENGTH is 500
  assert.strictEqual(result.patient.name, 'B'.repeat(500));
});

test('parseDeliverySlip should not invent missing lot, supplier, or expiration data', () => {
  const result = parseDeliverySlip('ABC123 アセトアミノフェン錠 12');

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].code, 'ABC123');
  assert.strictEqual(result[0].quantity, 12);
  assert.strictEqual(result[0].expirationDate, '');
  assert.strictEqual(result[0].supplier, '');
});

test('parseDeliverySlip should extract expiration date when present', () => {
  const result = parseDeliverySlip('ABC123 アセトアミノフェン錠 2027/03/31 12');

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].expirationDate, '2027-03-31');
});

test('processPrescription should return text on success', async () => {
  const mockScheduler = {
    addJob: async () => ({ data: { text: 'Mocked OCR Text' } })
  };
  const mockFile = {} as File;

  const text = await processPrescription(mockFile, mockScheduler);
  assert.strictEqual(text, 'Mocked OCR Text');
});

test('processPrescription should log and re-throw error on failure', async () => {
  const ocrError = new Error('OCR Failure');
  const mockScheduler = {
    addJob: async () => { throw ocrError; }
  };
  const mockFile = {} as File;

  const consoleMock = mock.method(console, 'error', () => {});

  await assert.rejects(
    async () => {
      await processPrescription(mockFile, mockScheduler);
    },
    (err: any) => {
      assert.strictEqual(err, ocrError);
      return true;
    }
  );

  assert.strictEqual(consoleMock.mock.callCount(), 1);
  assert.strictEqual(consoleMock.mock.calls[0].arguments[0], 'OCR Error: An error occurred during processing');
  assert.strictEqual(consoleMock.mock.calls[0].arguments[1], ocrError);

  consoleMock.mock.restore();
});

test('parsePrescriptionOcrText extracts patient, provider, and drug lines from noisy OCR text', () => {
  const text = [
    '処方箋',
    '交付年月日 令和8年7月6日',
    '患者氏名 山田 花子 様',
    '生年月日 昭和35年4月15日',
    'テスト中央クリニック 内科',
    '医師氏名 佐藤 一郎 印',
    'Rp1 アムロジピン錠5mg 1錠',
    '1日1回朝食後 14日分',
    'Rp2 モーラステープ20mg 7枚',
    '1日1回 腰部に貼付'
  ].join('\n');

  const result = parsePrescriptionOcrText(text);

  assert.strictEqual(result.patient.name, '山田 花子');
  assert.strictEqual(result.patient.birthDate, '19600415');
  assert.strictEqual(result.provider.institutionName, 'テスト中央クリニック');
  assert.strictEqual(result.provider.departmentName, '内科');
  assert.strictEqual(result.provider.doctorName, '佐藤 一郎');
  assert.strictEqual(result.provider.prescriptionDate, '20260706');

  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.items[0].drugName, 'アムロジピン錠5mg');
  assert.strictEqual(result.items[0].amount, '1');
  assert.strictEqual(result.items[0].unit, '錠');
  assert.strictEqual(result.items[0].usage, '1日1回朝食後');
  assert.strictEqual(result.items[0].days, '14');
  assert.strictEqual(result.items[1].drugName, 'モーラステープ20mg');
  assert.strictEqual(result.items[1].usage, '1日1回 腰部に貼付');
});

test('parsePrescriptionOcrText reports warnings when nothing is recognizable', () => {
  const result = parsePrescriptionOcrText('意味のないテキスト\n12345');
  assert.strictEqual(result.items.length, 0);
  assert.strictEqual(result.matchedFieldCount, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('患者氏名')));
  assert.ok(result.warnings.some((warning) => warning.includes('処方薬')));
});
