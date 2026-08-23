import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildElectronicPrescriptionApplyDecision,
  normalizeElectronicPrescriptionFetchKey,
  type ElectronicPrescriptionFetchResult
} from '@/lib/electronic_prescription';
import { POST as fetchPost } from './api/electronic-prescription/fetch/route';

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
