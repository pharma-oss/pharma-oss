import { test } from 'node:test';
import assert from 'node:assert';
import { parseFlexibleDateInput } from '@/lib/date_input';
import { buildPatientCandidateMatches } from '@/lib/patient_matching';
import type { PatientCandidate } from '@/hooks/useOcrPatientEligibility';

test('OCR受付の生年月日は半角8桁連続入力でYYYY-MM-DDへ自動変換される', () => {
  const raw8digits = '19850315';
  const normalized = parseFlexibleDateInput(raw8digits);
  assert.strictEqual(normalized, '1985-03-15');

  // 不正な日付形式や桁数の場合は undefined
  assert.strictEqual(parseFlexibleDateInput('99999999'), undefined);
  assert.strictEqual(parseFlexibleDateInput('123'), undefined);
});

test('生年月日8桁入力で正規化された日付は患者候補検索(buildPatientCandidateMatches)で突合される', () => {
  const mockCandidates: PatientCandidate[] = [
    {
      patientId: 'P001',
      name: '山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1985-03-15',
      gender: 'male',
      insuranceInfo: { number: '12345678' }
    } as unknown as PatientCandidate,
    {
      patientId: 'P002',
      name: '鈴木 花子',
      kana: 'スズキ ハナコ',
      birthDate: '1990-01-01',
      gender: 'female',
      insuranceInfo: { number: '87654321' }
    } as unknown as PatientCandidate
  ];

  // 8桁入力から正規化した YYYY-MM-DD で突合
  const normalizedBirthDate = parseFlexibleDateInput('19850315')!;
  const matches = buildPatientCandidateMatches(mockCandidates, {
    name: '山田',
    birthDate: normalizedBirthDate,
    insuranceNumber: ''
  }, 5);

  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].patient.patientId, 'P001');
  assert.ok(matches[0].score > 0);
  assert.ok(matches[0].reasonLabels.length > 0);
});
