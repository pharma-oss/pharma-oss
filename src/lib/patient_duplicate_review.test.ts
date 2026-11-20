import { test } from 'node:test';
import assert from 'node:assert';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { VISIT_SCHEMA } from '../db/schema.ts';
import { legacyMigrationStrategies } from '../db/index.ts';
import type { Visit } from '../db/types.ts';
import { DEMO_PATIENT_ID } from './demo_data.ts';
import {
  buildDuplicatePatientVisitsQuery,
  buildPatientDuplicateScanAuditDetail,
  buildPatientVisitStats,
  collectDuplicatePatientCandidateIds,
  findDuplicatePatientGroups
} from './patient_duplicate_review.ts';

const patient = (overrides: any) => ({
  patientId: overrides.patientId,
  name: overrides.name ?? '山田 太郎',
  kana: overrides.kana ?? 'ヤマダ タロウ',
  birthDate: overrides.birthDate ?? '1958-05-12',
  ...(overrides.insuranceInfo ? { insuranceInfo: overrides.insuranceInfo } : {})
});

test('同姓同名・同生年月日の患者をグループ化し、受付が多い患者を残す候補にする', () => {
  const report = findDuplicatePatientGroups(
    [
      patient({ patientId: 'pt_a', name: '山田　太郎' }),
      patient({ patientId: 'pt_b', name: '山田 太郎' }),
      patient({ patientId: 'pt_c', name: '佐藤 花子', kana: 'サトウ ハナコ' })
    ],
    [
      { patientId: 'pt_b', issueDate: '2026-07-01T09:00:00.000Z' },
      { patientId: 'pt_b', issueDate: '2026-06-01T09:00:00.000Z' },
      { patientId: 'pt_a', issueDate: '2026-05-01T09:00:00.000Z' }
    ]
  );

  assert.strictEqual(report.scannedPatientCount, 3);
  assert.strictEqual(report.groups.length, 1);
  const group = report.groups[0];
  assert.strictEqual(group.matchType, 'name_birthdate');
  assert.strictEqual(group.members.length, 2);
  // 受付2件のpt_bが残す候補の先頭になる
  assert.strictEqual(group.suggestedTargetPatientId, 'pt_b');
  assert.strictEqual(group.members[0].visitCount, 2);
  assert.strictEqual(report.duplicatePatientCount, 2);
});

test('カナだけ一致する患者もグループ化し、氏名一致グループと重複表示しない', () => {
  const report = findDuplicatePatientGroups([
    // 氏名は違うがカナと生年月日が同じ(旧姓/表記ゆれ想定)
    patient({ patientId: 'pt_a', name: '山田 太郎', kana: 'やまだ たろう' }),
    patient({ patientId: 'pt_b', name: '山田 太朗', kana: 'ヤマダ　タロウ' })
  ]);

  assert.strictEqual(report.groups.length, 1);
  assert.strictEqual(report.groups[0].matchType, 'kana_birthdate');

  // 氏名もカナも一致する場合は氏名一致グループだけを表示する
  const both = findDuplicatePatientGroups([
    patient({ patientId: 'pt_c' }),
    patient({ patientId: 'pt_d' })
  ]);
  assert.strictEqual(both.groups.length, 1);
  assert.strictEqual(both.groups[0].matchType, 'name_birthdate');
});

test('生年月日が違う同姓同名や、デモ患者は重複候補にしない', () => {
  const report = findDuplicatePatientGroups([
    patient({ patientId: 'pt_a', birthDate: '1958-05-12' }),
    patient({ patientId: 'pt_b', birthDate: '1960-01-01' }),
    patient({ patientId: DEMO_PATIENT_ID, name: 'デモ患者 みどり', kana: 'デモカンジャ ミドリ' }),
    patient({ patientId: 'pt_demo_like', name: 'デモ患者 みどり', kana: 'デモカンジャ ミドリ' })
  ]);

  assert.strictEqual(report.groups.length, 0);
  // デモ患者はスキャン対象数にも入れない
  assert.strictEqual(report.scannedPatientCount, 3);
});

test('生年月日未登録の患者は誤統合を避けるため候補にしない', () => {
  const report = findDuplicatePatientGroups([
    patient({ patientId: 'pt_a', birthDate: '' }),
    patient({ patientId: 'pt_b', birthDate: '' })
  ]);
  assert.strictEqual(report.groups.length, 0);
});

test('buildPatientVisitStats counts visits and keeps the latest issue date', () => {
  const stats = buildPatientVisitStats([
    { patientId: 'pt_a', issueDate: '2026-06-01T09:00:00.000Z' },
    { patientId: 'pt_a', issueDate: '2026-07-01T09:00:00.000Z' },
    { patientId: '', issueDate: '2026-07-01T09:00:00.000Z' }
  ]);
  assert.strictEqual(stats.get('pt_a')?.count, 2);
  assert.strictEqual(stats.get('pt_a')?.latestIssueDate, '2026-07-01T09:00:00.000Z');
  assert.strictEqual(stats.size, 1);
});

test('監査ログ要約は件数だけで患者名を含めない', () => {
  const report = findDuplicatePatientGroups([
    patient({ patientId: 'pt_a' }),
    patient({ patientId: 'pt_b' })
  ]);
  const detail = buildPatientDuplicateScanAuditDetail(report);
  assert.match(detail, /患者重複点検: 対象2名 \/ 重複候補1グループ・2名/);
  assert.doesNotMatch(detail, /山田/);
});

test('collectDuplicatePatientCandidateIds と buildDuplicatePatientVisitsQuery は重複候補患者のみに絞る (P2-2)', () => {
  const uniqueOnly = [
    patient({ patientId: 'pt_1', name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1958-05-12' }),
    patient({ patientId: 'pt_2', name: '佐藤 花子', kana: 'サトウ ハナコ', birthDate: '1970-01-01' })
  ];
  assert.deepStrictEqual(collectDuplicatePatientCandidateIds(uniqueOnly), []);
  assert.strictEqual(buildDuplicatePatientVisitsQuery([]), null);

  const mixed = [
    patient({ patientId: 'pt_a', name: '山田　太郎', kana: 'ヤマダ タロウ', birthDate: '1958-05-12' }),
    patient({ patientId: 'pt_b', name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1958-05-12' }),
    patient({ patientId: 'pt_c', name: '佐藤 花子', kana: 'サトウ ハナコ', birthDate: '1970-01-01' })
  ];
  const candidateIds = collectDuplicatePatientCandidateIds(mixed);
  assert.deepStrictEqual(candidateIds, ['pt_a', 'pt_b']);
  assert.deepStrictEqual(buildDuplicatePatientVisitsQuery(candidateIds), {
    selector: {
      patientId: { $in: ['pt_a', 'pt_b'] }
    }
  });
});

test('RxDB visits.find(buildDuplicatePatientVisitsQuery(...)) は暗号化 visits から重複候補患者の受付だけを取得し全件時と同一の点検結果を返す (P2-2)', async () => {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const storage = wrappedValidateAjvStorage({
    storage: wrappedKeyEncryptionCryptoJsStorage({ storage: getRxStorageMemory() })
  });
  const db = await createRxDatabase({
    name: `patient_dup_p2_2_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    storage,
    password: 'test-patient-dup-p22',
    ignoreDuplicate: true
  });
  try {
    const collections = await db.addCollections({
      visits: {
        schema: VISIT_SCHEMA,
        migrationStrategies: legacyMigrationStrategies(VISIT_SCHEMA, {})
      }
    });
    const allVisits: Visit[] = [
      { visitId: 'v_1', patientId: 'pt_a', issueDate: '2026-05-01T09:00:00.000Z', status: 'completed' },
      { visitId: 'v_2', patientId: 'pt_b', issueDate: '2026-06-01T09:00:00.000Z', status: 'completed' },
      { visitId: 'v_3', patientId: 'pt_b', issueDate: '2026-07-01T09:00:00.000Z', status: 'completed' },
      { visitId: 'v_4', patientId: 'pt_unrelated', issueDate: '2026-07-10T09:00:00.000Z', status: 'completed' }
    ];
    await collections.visits.bulkInsert(allVisits);

    const patients = [
      patient({ patientId: 'pt_a', name: '山田　太郎' }),
      patient({ patientId: 'pt_b', name: '山田 太郎' }),
      patient({ patientId: 'pt_unrelated', name: '鈴木 一郎', kana: 'スズキ イチロウ' })
    ];

    const query = buildDuplicatePatientVisitsQuery(collectDuplicatePatientCandidateIds(patients));
    assert.ok(query);
    const scopedDocs = await collections.visits.find(query).exec();
    assert.deepStrictEqual(scopedDocs.map((d) => d.visitId).sort(), ['v_1', 'v_2', 'v_3']);

    const scopedReport = findDuplicatePatientGroups(
      patients,
      scopedDocs.map((doc) => ({ patientId: doc.get('patientId') as string, issueDate: doc.get('issueDate') as string }))
    );
    const fullReport = findDuplicatePatientGroups(patients, allVisits);
    assert.deepStrictEqual(scopedReport, fullReport);
  } finally {
    await db.close();
  }
});
