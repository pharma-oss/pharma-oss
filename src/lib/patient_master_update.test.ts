import { test } from 'node:test';
import assert from 'node:assert';
import type { Patient } from '../db/types.ts';
import { describePatientMasterChanges } from './patient_master_update.ts';

const patient: Patient = {
  patientId: 'pt_1',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-01-02',
  insuranceInfo: {
    provider: '06123456',
    number: '記号123',
    burdenRatio: 30
  }
};

test('describePatientMasterChanges returns changed billing-relevant fields', () => {
  const changes = describePatientMasterChanges(patient, {
    name: '山田 太郎',
    birthDate: '1980-01-02',
    insuranceInfo: {
      provider: '06123456',
      number: '記号456',
      burdenRatio: 20,
      validTo: '2026-12-31',
      eligibilityCheckedAt: '2026-06-15',
      eligibilityStatus: 'valid'
    },
    publicInsurances: [
      {
        provider: '51136018',
        recipient: '1234567',
        burdenRatio: 10,
        startDate: '2026-04-01',
        endDate: '2026-12-31',
        monthlyLimitYen: 5000
      }
    ]
  });

  assert.deepStrictEqual(changes, [
    '保険記号番号: 「記号123」→「記号456」',
    '負担割合: 「30」→「20」',
    '保険有効期限: 「未設定」→「2026-12-31」',
    '資格確認日: 「未設定」→「2026-06-15」',
    '資格確認状態: 「未設定」→「valid」',
    '公費情報: 「未設定」→「51136018/1234567/10%/2026-04-01/2026-12-31/5000円」'
  ]);
});

test('describePatientMasterChanges returns empty array when nothing changed', () => {
  assert.deepStrictEqual(describePatientMasterChanges(patient, {
    name: '山田 太郎',
    birthDate: '1980-01-02',
    insuranceInfo: {
      provider: '06123456',
      number: '記号123',
      burdenRatio: 30
    }
  }), []);
});
