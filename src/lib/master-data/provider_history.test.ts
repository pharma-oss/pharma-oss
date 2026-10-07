import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Visit } from '../../db/types.ts';
import { buildProviderHistory, matchProviderHistory, type ProviderHistoryOption } from './provider_history.ts';

function visit(overrides: Partial<Visit>): Visit {
  return { issueDate: '2026-01-01', ...overrides } as Visit;
}

test('buildProviderHistory groups visits by institution code and collects distinct departments and doctors', () => {
  const history = buildProviderHistory([
    visit({ institutionCode: '1310123456', institutionName: '聖マリア記念病院', departmentName: '内科', doctorName: '鈴木', issueDate: '2026-03-01' }),
    visit({ institutionCode: '1310123456', institutionName: '聖マリア記念病院', departmentName: '内科', doctorName: '田中', issueDate: '2026-05-01' }),
    visit({ institutionCode: '1310123456', institutionName: '聖マリア記念病院', departmentName: '循環器内科', doctorName: '鈴木', issueDate: '2026-04-01' })
  ]);

  assert.equal(history.length, 1);
  assert.deepEqual(history[0].departments, ['内科', '循環器内科']);
  assert.deepEqual(history[0].doctors, ['鈴木', '田中']);
  assert.equal(history[0].lastSeen, '2026-05-01', 'lastSeen is the newest issue date regardless of visit order');
  assert.equal(history[0].key, '1310123456');
});

test('buildProviderHistory keys by name when no code was recorded, and skips visits with neither', () => {
  const history = buildProviderHistory([
    visit({ institutionName: 'さくらクリニック' }),
    visit({ institutionName: 'さくらクリニック', doctorName: '山田' }),
    visit({}),
    visit({ institutionCode: '  ', institutionName: '   ' })
  ]);

  assert.equal(history.length, 1);
  assert.equal(history[0].key, 'さくらクリニック');
  assert.equal(history[0].institutionCode, '');
  assert.deepEqual(history[0].doctors, ['山田']);
});

test('buildProviderHistory trims whitespace around code and name', () => {
  const [entry] = buildProviderHistory([visit({ institutionCode: ' 1310123456 ', institutionName: ' 聖マリア記念病院 ' })]);
  assert.equal(entry.institutionCode, '1310123456');
  assert.equal(entry.institutionName, '聖マリア記念病院');
  assert.equal(entry.key, '1310123456');
});

test('buildProviderHistory sorts newest first and honours the limit', () => {
  const visits = ['A', 'B', 'C', 'D'].map((name, i) => visit({ institutionName: name, issueDate: `2026-0${i + 1}-01` }));

  assert.deepEqual(buildProviderHistory(visits).map((h) => h.institutionName), ['D', 'C', 'B', 'A']);
  assert.deepEqual(buildProviderHistory(visits, 2).map((h) => h.institutionName), ['D', 'C']);
  assert.deepEqual(buildProviderHistory([]), []);
});

const history: ProviderHistoryOption[] = [
  { key: '1310123456', institutionCode: '1310123456', institutionName: '聖マリア記念病院', departments: [], doctors: [], lastSeen: '2026-05-01' },
  { key: '1410999999', institutionCode: '1410999999', institutionName: 'Sakura Clinic', departments: [], doctors: [], lastSeen: '2026-04-01' },
  { key: 'むさし薬局前医院', institutionCode: '', institutionName: 'むさし薬局前医院', departments: [], doctors: [], lastSeen: '2026-03-01' }
];

test('matchProviderHistory matches a code fragment against the institution code', () => {
  assert.deepEqual(matchProviderHistory(history, { institutionCode: '1310' }).map((h) => h.key), ['1310123456']);
  assert.deepEqual(matchProviderHistory(history, { institutionCode: '999' }).map((h) => h.key), ['1410999999']);
});

test('matchProviderHistory matches the name case-insensitively as a substring', () => {
  assert.deepEqual(matchProviderHistory(history, { institutionName: 'sakura' }).map((h) => h.key), ['1410999999']);
  assert.deepEqual(matchProviderHistory(history, { institutionName: 'マリア' }).map((h) => h.key), ['1310123456']);
});

test('matchProviderHistory ORs code and name, and returns nothing when neither matches', () => {
  assert.deepEqual(
    matchProviderHistory(history, { institutionCode: '1310', institutionName: 'sakura' }).map((h) => h.key),
    ['1310123456', '1410999999']
  );
  assert.deepEqual(matchProviderHistory(history, { institutionCode: '0000', institutionName: 'zzz' }), []);
});

test('matchProviderHistory with blank input suggests the most recent entries, capped by the limit', () => {
  assert.equal(matchProviderHistory(history, {}).length, 3);
  assert.equal(matchProviderHistory(history, { institutionCode: '  ', institutionName: ' ' }).length, 3);
  assert.deepEqual(matchProviderHistory(history, {}, 2).map((h) => h.key), ['1310123456', '1410999999']);
});
