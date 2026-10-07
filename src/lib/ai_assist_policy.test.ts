import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyAiAssistModeWithAudit,
  buildAiQualityGateApplyAuditDetail,
  compareAiAssistModeStrictness,
  filterAiAssistItemsByMode,
  isAiAssistItemVisible,
  normalizeAiAssistMode
} from './ai_assist_policy.ts';

test('normalizeAiAssistMode preserves known modes and defaults legacy values to enabled', () => {
  assert.strictEqual(normalizeAiAssistMode('limited'), 'limited');
  assert.strictEqual(normalizeAiAssistMode('disabled'), 'disabled');
  assert.strictEqual(normalizeAiAssistMode(undefined), 'enabled');
  assert.strictEqual(normalizeAiAssistMode('unexpected'), 'enabled');
});

test('filterAiAssistItemsByMode limits suggestions consistently by severity', () => {
  const items = [
    { id: 'critical', severity: 'critical' as const },
    { id: 'warning', severity: 'warning' as const },
    { id: 'info', severity: 'info' as const }
  ];

  assert.deepStrictEqual(filterAiAssistItemsByMode(items, 'enabled').map((item) => item.id), [
    'critical',
    'warning',
    'info'
  ]);
  assert.deepStrictEqual(filterAiAssistItemsByMode(items, 'limited').map((item) => item.id), [
    'critical'
  ]);
  assert.deepStrictEqual(filterAiAssistItemsByMode(items, 'disabled'), []);
  assert.strictEqual(isAiAssistItemVisible('limited', 'warning'), false);
});

test('compareAiAssistModeStrictness distinguishes aligned, stricter, and unsafe modes', () => {
  assert.strictEqual(compareAiAssistModeStrictness('limited', 'limited'), 'aligned');
  assert.strictEqual(compareAiAssistModeStrictness('disabled', 'limited'), 'stricter');
  assert.strictEqual(compareAiAssistModeStrictness('enabled', 'disabled'), 'change_required');
});

// ---- 品質ゲートの推奨モードを反映する ----

const gate = { statusLabel: '要見直し', highConfidenceRejectedCount: 3, rejectionRate: 42 };

test('buildAiQualityGateApplyAuditDetail records both modes and the figures behind the decision', () => {
  assert.strictEqual(
    buildAiQualityGateApplyAuditDetail('enabled', 'limited', gate),
    'AI補助品質ゲート反映: 「標準」から「制限」へ変更 / 判定 要見直し / 高信頼度却下 3件 / 却下率 42%'
  );
  assert.strictEqual(
    buildAiQualityGateApplyAuditDetail('limited', 'disabled', { ...gate, highConfidenceRejectedCount: 0, rejectionRate: 0 }),
    'AI補助品質ゲート反映: 「制限」から「停止」へ変更 / 判定 要見直し / 高信頼度却下 0件 / 却下率 0%'
  );
});

function fakeFacilityDb(exists: boolean) {
  const calls = { findOne: [] as unknown[], patches: [] as Array<{ aiAssistMode: string }> };
  const db = {
    facility_settings: {
      findOne: (id: unknown) => {
        calls.findOne.push(id);
        return {
          exec: async () => (exists ? { patch: async (patch: { aiAssistMode: string }) => { calls.patches.push(patch); } } : null)
        };
      }
    }
  } as unknown as Parameters<typeof applyAiAssistModeWithAudit>[0]['db'];
  return { db, calls };
}

test('applyAiAssistModeWithAudit writes the recommended mode to the default settings and logs the given wording', async () => {
  const { db, calls } = fakeFacilityDb(true);
  const logged: string[] = [];

  await applyAiAssistModeWithAudit({
    db, previousMode: 'enabled', recommendedMode: 'limited', auditDetail: '監査文言',
    logAudit: async (detail) => { logged.push(detail); return true; }
  });

  assert.deepStrictEqual(calls.findOne, ['default']);
  assert.deepStrictEqual(calls.patches, [{ aiAssistMode: 'limited' }]);
  assert.deepStrictEqual(logged, ['監査文言']);
});

test('applyAiAssistModeWithAudit puts the previous mode back and fails when the audit log cannot be written', async () => {
  const { db, calls } = fakeFacilityDb(true);

  await assert.rejects(
    () => applyAiAssistModeWithAudit({
      db, previousMode: 'enabled', recommendedMode: 'disabled', auditDetail: 'x', logAudit: async () => false
    }),
    new Error('監査ログ記録に失敗したため、AI補助モードを元に戻しました。')
  );
  assert.deepStrictEqual(calls.patches, [{ aiAssistMode: 'disabled' }, { aiAssistMode: 'enabled' }]);
});

test('applyAiAssistModeWithAudit writes nothing and logs nothing when the facility settings are missing', async () => {
  const { db, calls } = fakeFacilityDb(false);
  let audited = false;

  await assert.rejects(
    () => applyAiAssistModeWithAudit({
      db, previousMode: 'enabled', recommendedMode: 'limited', auditDetail: 'x',
      logAudit: async () => { audited = true; return true; }
    }),
    new Error('施設設定が見つかりません。')
  );
  assert.deepStrictEqual(calls.patches, []);
  assert.strictEqual(audited, false);
});
