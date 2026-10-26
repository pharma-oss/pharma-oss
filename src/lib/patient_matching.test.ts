import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPatientCandidateMatches,
  findMatchingPatient,
  normalizeInsuranceNumber,
  normalizePatientName
} from './patient_matching.ts';
import type { Patient } from '../db/types.ts';

const patients: Patient[] = [
  {
    patientId: 'p1',
    name: '山田 太郎',
    kana: '',
    birthDate: '1980-01-01',
    insuranceInfo: { number: '12345678', burdenRatio: 30 }
  },
  {
    patientId: 'p2',
    name: '山田 花子',
    kana: '',
    birthDate: '1982-02-02',
    insuranceInfo: { number: '12345678', burdenRatio: 30 }
  }
];

test('normalizePatientName removes spaces and normalizes width', () => {
  assert.strictEqual(normalizePatientName('山田　太郎'), '山田太郎');
  assert.strictEqual(normalizePatientName('YAMADA TARO'), 'yamadataro');
});

test('normalizeInsuranceNumber keeps digits and normalizes full-width numbers', () => {
  assert.strictEqual(normalizeInsuranceNumber('１２３-４５６'), '123456');
});

test('findMatchingPatient matches by insurance number and normalized name', () => {
  const result = findMatchingPatient(patients, {
    name: '山田太郎',
    insuranceNumber: '１２３４５６７８'
  });

  assert.strictEqual(result?.patient.patientId, 'p1');
  assert.strictEqual(result?.reason, 'insurance_and_name');
});

test('findMatchingPatient does not match the same insurance number with a different name', () => {
  const result = findMatchingPatient(patients, {
    name: '山田 次郎',
    insuranceNumber: '12345678'
  });

  assert.strictEqual(result, undefined);
});

test('findMatchingPatient can fall back to name and birth date', () => {
  const result = findMatchingPatient(patients, {
    name: '山田 花子',
    birthDate: '1982-02-02'
  });

  assert.strictEqual(result?.patient.patientId, 'p2');
  assert.strictEqual(result?.reason, 'birthdate_and_name');
});

test('findMatchingPatient prefers birth date and name when insurance number has changed', () => {
  const result = findMatchingPatient(patients, {
    name: '山田 太郎',
    birthDate: '1980-01-01',
    insuranceNumber: '99999999'
  });

  assert.strictEqual(result?.patient.patientId, 'p1');
  assert.strictEqual(result?.reason, 'birthdate_and_name');
});

test('buildPatientCandidateMatches ranks same-name candidates by confirming details', () => {
  const candidates = buildPatientCandidateMatches([
    ...patients,
    {
      patientId: 'p3',
      name: '山田 太郎',
      kana: '',
      birthDate: '1975-05-05',
      insuranceInfo: { number: '99999999', burdenRatio: 30 }
    }
  ], {
    name: '山田 太郎',
    birthDate: '1980-01-01',
    insuranceNumber: '12345678'
  });

  assert.strictEqual(candidates[0].patient.patientId, 'p1');
  assert.strictEqual(candidates[0].risk, 'low');
  assert.deepStrictEqual(candidates[0].reasonLabels, ['氏名一致', '生年月日一致', '保険番号一致']);
  assert.strictEqual(candidates[1].patient.patientId, 'p3');
  assert.strictEqual(candidates[1].risk, 'high');
  assert.match(candidates[1].warning || '', /同姓同名候補/);
});

test('buildPatientCandidateMatches warns when insurance number matches but name differs', () => {
  const candidates = buildPatientCandidateMatches(patients, {
    name: '別人 太郎',
    insuranceNumber: '12345678'
  });

  assert.ok(candidates.length >= 1);
  assert.ok(candidates.every((candidate) => candidate.reasons.includes('insurance_number')));
  assert.ok(candidates.every((candidate) => candidate.warning?.includes('保険番号は一致')));
});

test('insurance number matches both provider (保険者番号, set by patient registration) and number (set by the old reception)', () => {
  const registered: Patient = {
    patientId: 'p10',
    name: '登録 一郎',
    kana: '',
    birthDate: '1975-05-05',
    insuranceInfo: { provider: '06139999', number: '記号12 番号345', burdenRatio: 30 }
  };
  const legacy: Patient = {
    patientId: 'p11',
    name: '旧受付 二郎',
    kana: '',
    birthDate: '1976-06-06',
    insuranceInfo: { number: '87654321', burdenRatio: 30 }
  };
  const both = [registered, legacy];

  // 氏名が一致し、保険者番号(provider)も一致 -> 生年月日が無くても同一人物として扱える
  assert.strictEqual(findMatchingPatient(both, { name: '登録一郎', insuranceNumber: '06139999' })?.patient.patientId, 'p10');
  assert.strictEqual(findMatchingPatient(both, { name: '旧受付二郎', insuranceNumber: '87654321' })?.patient.patientId, 'p11');
  assert.strictEqual(findMatchingPatient(both, { name: '登録一郎', insuranceNumber: '99999999' }), undefined);

  const candidates = buildPatientCandidateMatches(both, { name: '', insuranceNumber: '06139999' });
  assert.deepStrictEqual(candidates.map((candidate) => candidate.patient.patientId), ['p10']);
  assert.ok(candidates[0].reasons.includes('insurance_number'));
});
