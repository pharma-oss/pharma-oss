import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ocrSource = readFileSync(new URL('./ocr/page.tsx', import.meta.url), 'utf8');

test('OCR受付の生年月日は半角8桁連続入力でYYYY-MM-DDへ自動変換される', () => {
  assert.match(ocrSource, /import \{ parseFlexibleDateInput \} from '@\/lib\/date_input'/);
  assert.match(ocrSource, /id="patientBirthDate"/);
  // ネイティブの日付ピッカーではなく、8桁連続入力を受け付けるテキスト入力にしてある
  assert.doesNotMatch(ocrSource.match(/id="patientBirthDate"[\s\S]{0,300}/)?.[0] || '', /type="date"/);
  assert.match(ocrSource, /inputMode="numeric"/);
  assert.match(ocrSource, /const digitsOnly = raw\.replace\(\/\[\^\\d\]\/g, ''\)/);
  assert.match(ocrSource, /digitsOnly\.length === 8 \? parseFlexibleDateInput\(digitsOnly\) : undefined/);
  assert.match(ocrSource, /setPatientBirthDate\(normalized \|\| raw\)/);
  assert.match(ocrSource, /半角8桁.*19850315.*入力できます/);
});

test('生年月日8桁入力は既存の患者候補検索(buildPatientCandidateMatches)へそのまま流れる', () => {
  // patientBirthDate は既に候補検索の入力に使われており、8桁入力機能はその手前で
  // YYYY-MM-DDへ正規化するだけなので、候補リストUI自体への変更は不要。
  const candidateMatchesBlock = ocrSource.match(/buildPatientCandidateMatches\(patientCandidates, \{[\s\S]{0,120}\}/)?.[0] || '';
  assert.match(candidateMatchesBlock, /birthDate: patientBirthDate/);
  assert.match(ocrSource, /className="patient-candidate-list"/);
  assert.match(ocrSource, /match\.reasonLabels\.map/);
});
