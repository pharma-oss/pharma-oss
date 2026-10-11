import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildMedicationInfoTemplateSaveErrorMessage,
  rollbackMedicationInfoTemplateWrites,
  type MedicationInfoTemplateCollectionLike
} from './useMedicationInfoTemplateSettings.ts';
import type { PatientMedicationInfoTemplate } from '@/db/types';

const sampleTemplate: PatientMedicationInfoTemplate = {
  templateId: 'tmpl-001',
  drugCode: '1119001F1010',
  drugName: 'サンプル薬品錠10mg',
  status: 'draft',
  sourceType: 'pharmacy_authored',
  effectText: '適応症サマリー',
  sideEffectText: '副作用サマリー',
  counselingText: '注意サマリー',
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z'
};

test('buildMedicationInfoTemplateSaveErrorMessage formats base message on successful rollback', () => {
  const message = buildMedicationInfoTemplateSaveErrorMessage(
    new Error('監査ログの記録に失敗しました'),
    { rolledBack: true, rollbackErrorCount: 0 }
  );
  assert.strictEqual(message, '薬情テンプレを保存できませんでした: 監査ログの記録に失敗しました');
});

test('buildMedicationInfoTemplateSaveErrorMessage appends rollback failure note when rollback failed', () => {
  const message = buildMedicationInfoTemplateSaveErrorMessage(
    new Error('書き込みタイムアウト'),
    {
      rolledBack: false,
      rollbackErrorCount: 1,
      rollbackNote: '作成・更新の取り消しに失敗しました（1件の復元エラー）。'
    }
  );
  assert.strictEqual(
    message,
    '薬情テンプレを保存できませんでした: 書き込みタイムアウト 作成・更新の取り消しに失敗しました（1件の復元エラー）。'
  );
});

test('rollbackMedicationInfoTemplateWrites returns rolledBack true when bulkUpsert succeeds with no errors', async () => {
  const upsertedDocs: PatientMedicationInfoTemplate[] = [];
  const removedIds: string[] = [];

  const mockCollection: MedicationInfoTemplateCollectionLike = {
    bulkUpsert: async (docs) => {
      upsertedDocs.push(...docs);
      return { error: [], success: docs };
    },
    findOne: (id) => ({
      exec: async () => ({
        remove: async () => {
          removedIds.push(id);
        }
      })
    })
  };

  const previousMap = new Map<string, PatientMedicationInfoTemplate | undefined>([
    ['tmpl-001', sampleTemplate],
    ['tmpl-new', undefined]
  ]);
  const attemptedIds = ['tmpl-001', 'tmpl-new'];

  const result = await rollbackMedicationInfoTemplateWrites(mockCollection, previousMap, attemptedIds);

  assert.strictEqual(result.rolledBack, true);
  assert.strictEqual(result.rollbackErrorCount, 0);
  assert.strictEqual(upsertedDocs.length, 1);
  assert.strictEqual(upsertedDocs[0].templateId, 'tmpl-001');
  assert.deepStrictEqual(removedIds, ['tmpl-new']);
});

test('rollbackMedicationInfoTemplateWrites detects bulkUpsert error result and marks rolledBack false with failure note', async () => {
  const mockCollection: MedicationInfoTemplateCollectionLike = {
    bulkUpsert: async () => ({
      error: [{ documentId: 'tmpl-001', status: 500, message: 'storage failure' }],
      success: []
    }),
    findOne: () => ({
      exec: async () => null
    })
  };

  const previousMap = new Map<string, PatientMedicationInfoTemplate | undefined>([
    ['tmpl-001', sampleTemplate]
  ]);
  const attemptedIds = ['tmpl-001'];

  const result = await rollbackMedicationInfoTemplateWrites(mockCollection, previousMap, attemptedIds);

  assert.strictEqual(result.rolledBack, false);
  assert.strictEqual(result.rollbackErrorCount, 1);
  assert.strictEqual(
    result.rollbackNote,
    '作成・更新の取り消しに失敗しました（1件の復元エラー）。'
  );
});
