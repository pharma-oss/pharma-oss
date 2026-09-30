import encoding from 'encoding-japanese';
import {
  buildDispensingUkeRecords
} from '../src/lib/receipt/dispensing_uke.ts';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkeBundle,
  buildMonthlyClaimUkeResults
} from '../src/lib/monthly_claim_uke.ts';
import { generateUkeContent } from '../src/lib/receipt/uke_generator.ts';

const testSettings = {
  id: 'default',
  pharmacyName: 'pharma-ossテスト薬局',
  pharmacyKana: 'テストヤッキョク',
  pharmacyCode: '1312345',
  pharmacyPostalCode: '100-0001',
  pharmacyAddress: '東京都千代田区千代田1-1',
  pharmacyPhone: '03-1234-5678',
  registrationNumber: 'T1234567890123',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false
};

const patient = {
  patientId: 'pt_sample_01',
  name: '社保 太郎',
  kana: 'シャホ タロウ',
  birthDate: '1985-05-15',
  gender: 'male',
  insuranceInfo: {
    provider: '06130012',
    number: '123456',
    burdenRatio: 30,
    relationship: '本人'
  }
};

const visit = {
  visitId: 'v_sample_01',
  patientId: 'pt_sample_01',
  prescriptionDate: '2026-06-10',
  dispensingDate: '2026-06-10',
  issueDate: '2026-06-10T10:00:00.000Z',
  status: 'completed',
  institutionId: '1312345',
  doctorId: 'doc_01',
  claimLifecycle: {
    status: 'rebilling',
    rebillingReason: '2026年6月定期請求サンプル'
  }
};

const items = [
  {
    itemId: 'item_sample_01',
    visitId: 'v_sample_01',
    drugId: '620000001',
    dispensedDrugCode: '620000001',
    drugName: 'アムロジピンOD錠5mg',
    amount: 1,
    days: 14,
    usage: '1日1回 朝食後',
    rpNumber: 1,
    dosageCategory: 'internal',
    drugPrice: 10.1,
    claimDrugFee: true
  }
];

const calculatedFees = [
  {
    code: 'base_fee',
    receiptFeeCode: '410004110',
    name: '調剤基本料1',
    points: 45,
    rationale: '調剤基本料1 (45点)'
  },
  {
    code: 'drug_preparation',
    receiptFeeCode: '420001810',
    name: '薬剤調製料 (内服薬)',
    points: 24,
    rationale: '薬剤調製料 内服薬 (14日分: 24点)'
  },
  {
    code: 'drug_fee',
    name: '薬剤料',
    points: 14,
    rationale: '薬剤料 (14点)'
  }
];

const testCase = { visit, patient, settings: testSettings, items, calculatedFees };
const generatedAt = new Date('2026-06-10T12:00:00.000Z');

// 1. 単票通常
const singleRecords = buildDispensingUkeRecords({
  visit,
  patient,
  settings: testSettings,
  items,
  calculatedFees,
  generatedAt
});
const singleContent = generateUkeContent(singleRecords);
const singleText = encoding.codeToString(encoding.convert([...singleContent], { to: 'UNICODE', from: 'SJIS' }));

// 2. 月次通常
const monthlyResults = buildMonthlyClaimUkeResults([testCase], generatedAt);
const regularBundle = buildMonthlyClaimUkeBundle(monthlyResults, 'TEST_REGULAR.uke');
const regularText = encoding.codeToString(encoding.convert([...regularBundle.content], { to: 'UNICODE', from: 'SJIS' }));

// 3. 月次公式
const officialBundle = buildMonthlyClaimOfficialUkeBundle([testCase], monthlyResults);
// 公式は末尾0x1Aを除く
const officialText = encoding.codeToString(encoding.convert([...officialBundle.content.slice(0, -1)], { to: 'UNICODE', from: 'SJIS' }));

console.log('=== [1] 単票通常 UKE レコード ===');
console.log(singleText);
console.log('=== [2] 月次通常 UKE レコード ===');
console.log(regularText);
console.log('=== [3] 月次公式提出用 UKE レコード ===');
console.log(officialText);
