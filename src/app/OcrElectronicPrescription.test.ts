import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildElectronicPrescriptionApplyDecision,
  normalizeElectronicPrescriptionFetchKey,
  type ElectronicPrescriptionFetchResult
} from '@/lib/electronic_prescription';
import { POST as fetchPost } from './api/electronic-prescription/fetch/route';
import { buildPrescriptionFromElectronicItem } from './ocr/helpers';
import { getAmountText, getTotalAmountText } from './print/helpers';
import { calculateRequiredStockAmount } from '@/lib/stock';

test('電子処方箋のキー正規化と適用判定ロジックが安全仕様どおりに動作する', () => {
  // キー正規化
  assert.strictEqual(normalizeElectronicPrescriptionFetchKey(' 1234-5678-9012 '), '1234-5678-9012');
  assert.strictEqual(normalizeElectronicPrescriptionFetchKey(''), '');

  // 情報提供ファイル（紙原本確認で反映可能）
  const infoFileResult: ElectronicPrescriptionFetchResult = {
    status: 'success',
    mode: 'connector',
    message: '',
    warnings: [],
    prescription: {
      prescriptionId: 'EP001',
      documentKind: 'prescription_information',
      validUntil: '2099-12-31',
      patient: { name: '山田 太郎', birthDate: '1985-03-15' },
      provider: { institutionName: 'テスト病院', doctorName: '医師A' },
      prescriptionDate: '2026-07-01',
      items: [
        {
          rpNumber: 1,
          drugCode: '620000001',
          drugName: 'アムロジピン錠5mg',
          sourceDrugName: 'アムロジピン錠5mg',
          masterDrugName: 'アムロジピン錠5mg',
          drugNameVerificationStatus: 'matched',
          amount: '1',
          unitCode: 'TAB',
          unitText: '錠',
          usage: '1日1回朝食後',
          days: '14'
        }
      ],
      signatureVerification: { status: 'valid' }
    },
    duplicateCheck: { status: 'passed', messages: [] },
    integrityHash: 'a'.repeat(64)
  };

  const unconfirmedDecision = buildElectronicPrescriptionApplyDecision(infoFileResult, {
    paperOriginalConfirmed: false
  });
  assert.strictEqual(unconfirmedDecision.canApply, false);
  assert.ok(unconfirmedDecision.requiredActions.some((a) => a.includes('紙の処方箋原本')));

  const confirmedDecision = buildElectronicPrescriptionApplyDecision(infoFileResult, {
    paperOriginalConfirmed: true
  });
  assert.strictEqual(confirmedDecision.canApply, true);
});

test('電子処方箋取得APIルートは空キーや未設定時に適切なエラー応答を返す', async () => {
  const req = new Request('http://localhost/api/electronic-prescription/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fetchKey: '',
      keyKind: 'exchange_number'
    })
  });

  const res = await fetchPost(req as any);
  const result = await res.json();
  assert.strictEqual(res.status, 200);
  assert.ok(result.status === 'unconfigured' || result.status === 'error');
});

test('【PR-D2】電子処方箋取込は薬価単位側（item.amount/unitText/unitCode）を格納し、表示は処方単位ペア・在庫引落は薬価単位実量となること', () => {
  // 換算明細（例: 250mL缶 × 3缶 = 750mL、14日分）
  const epItem = {
    rpNumber: 1,
    drugCode: '620000001',
    drugName: 'エンシュア・リキッド',
    amount: '750',
    unitCode: '304',
    unitText: 'mL',
    unitConversion: {
      conversionFactor: '250',
      prescribedAmount: '3',
      prescribedUnitCode: 'CAN',
      prescribedUnitText: '缶'
    },
    usage: '1日3回毎食後',
    days: '14'
  };

  const prescription = buildPrescriptionFromElectronicItem(
    epItem,
    'EP_TEST_001',
    0,
    () => 'mock_uuid_123'
  );

  // 1. PR-D2 コア検証: フォーム行の amount / unitText / unitCode には薬価単位側が格納されること
  assert.strictEqual(
    prescription.amount,
    '750',
    'amount は調剤実量 750 であること（処方単位 3 ではないこと）'
  );
  assert.strictEqual(
    prescription.unitText,
    'mL',
    'unitText は薬価単位 mL であること（処方単位 缶 ではないこと）'
  );
  assert.strictEqual(
    prescription.unitCode,
    '304',
    'unitCode は薬価単位コード 304 であること'
  );
  assert.deepEqual(
    prescription.electronicUnitConversion,
    epItem.unitConversion,
    'electronicUnitConversion に処方指示（3 缶、係数 250）がそのまま保持されること'
  );

  // 2. 帳票表示検証（PR-D1との結合）: 内部が薬価単位化されても、表示は処方単位ペア（3 缶）を厳格に維持すること
  const presentationItem = {
    amount: parseFloat(prescription.amount),
    unitText: prescription.unitText,
    days: parseInt(prescription.days, 10),
    dosageCategory: 'internal' as const,
    electronicUnitConversion: prescription.electronicUnitConversion
  };
  assert.strictEqual(
    getAmountText(presentationItem),
    '3 缶',
    '1日量は 3 缶 と表示されること（750 缶 や 3 mL に絶対にならないこと）'
  );
  assert.strictEqual(
    getTotalAmountText(presentationItem),
    '42 缶',
    '全量は 3 缶 * 14 日 = 42 缶 と表示されること（10500 缶 や 42 mL にならないこと）'
  );

  // 3. 在庫引落検証（PR-D2の影響範囲）: 在庫計算 calculateRequiredStockAmount は薬価単位実量（750 mL * 14日 = 10500）で計算されること
  const stockItem = {
    drugId: prescription.drugCode,
    amount: parseFloat(prescription.amount),
    days: parseInt(prescription.days, 10)
  };
  const requiredStock = calculateRequiredStockAmount(stockItem);
  assert.strictEqual(
    requiredStock,
    10500,
    '在庫引落量は 750 mL * 14 日 = 10500 であること（旧挙動の 3 * 14 = 42 ではないこと）'
  );
});

