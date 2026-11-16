import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Ajv from 'ajv';
import { INTERVENTION_SCHEMA } from '@/db/schema';
import type { Intervention } from '@/db/types';
import {
  executeAddEmrIntervention,
  INTERVENTION_ACTIVE_VISIT_NOT_FOUND_MESSAGE,
  INTERVENTION_DB_NOT_READY_MESSAGE,
  mergeInterventionCategories,
  type EmrInterventionVisitHandle,
  type InterventionItem
} from '@/hooks/useEmrIntervention';
import { getClaimEditBlockedMessage } from '@/lib/claim_edit_guard';
import type { InterventionInput, InterventionStoreDb } from '@/lib/prescription_intervention_support';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import { TracingReportModal } from './emr/components/TracingReportModal';
import {
  EmrInterventionModal,
  maybeSuggestInterventionCategory,
  submitEmrInterventionForm,
  type EmrInterventionModalProps
} from './emr/components/EmrInterventionModal';
import { tracingStatusLabel } from '../lib/emr_helpers';

const ajv = new Ajv({ strict: false });
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
ajv.addFormat(
  'date-time',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
);
const STRICT_INTERVENTION_SCHEMA = { ...INTERVENTION_SCHEMA, additionalProperties: false };
const validateInterventionSchema = ajv.compile(STRICT_INTERVENTION_SCHEMA);

test('tracingStatusLabel handles standard tracing report statuses', () => {
  assert.strictEqual(tracingStatusLabel.draft, '下書き');
  assert.strictEqual(tracingStatusLabel.sent, '送付済');
  assert.strictEqual(tracingStatusLabel.closed, '完了');
});

test('TracingReportModal is exported as React component and renders closed/opened static markup', () => {
  assert.strictEqual(typeof TracingReportModal, 'function');
  const closedHtml = renderToStaticMarkup(
    React.createElement(TracingReportModal, {
      isOpen: false,
      onClose: () => {},
      patientName: '患者 太郎',
      onSaveReport: async () => {}
    })
  );
  assert.strictEqual(closedHtml, '');

  const openHtml = renderToStaticMarkup(
    React.createElement(TracingReportModal, {
      isOpen: true,
      onClose: () => {},
      patientName: '患者 太郎',
      onSaveReport: async () => {}
    })
  );
  assert.ok(openHtml.includes('服薬情報提供書 (トレーシングレポート) 作成'));
});

test('EmrInterventionModal is exported as React component and renders intervention form correctly', () => {
  assert.strictEqual(typeof EmrInterventionModal, 'function');
  const closedHtml = renderToStaticMarkup(
    React.createElement(EmrInterventionModal, {
      isOpen: false,
      onClose: () => {},
      intDoctor: '',
      setIntDoctor: () => {},
      intReason: '',
      setIntReason: () => {},
      intBefore: '',
      setIntBefore: () => {},
      intAfter: '',
      setIntAfter: () => {},
      intResult: '',
      setIntResult: () => {},
      intStatus: 'completed',
      setIntStatus: () => {},
      intMethod: 'phone',
      setIntMethod: () => {},
      intResponseDueDate: '',
      setIntResponseDueDate: () => {},
      intNote: '',
      setIntNote: () => {},
      intConsented: true,
      setIntConsented: () => {},
      onSave: async () => {},
      resetForm: () => {}
    })
  );
  assert.strictEqual(closedHtml, '');

  const openHtml = renderToStaticMarkup(
    React.createElement(EmrInterventionModal, {
      isOpen: true,
      onClose: () => {},
      intDoctor: '山田 医師',
      setIntDoctor: () => {},
      intReason: '用量過多の疑義',
      setIntReason: () => {},
      intBefore: '1回2錠',
      setIntBefore: () => {},
      intAfter: '1回1錠',
      setIntAfter: () => {},
      intResult: '疑義照会の上、1回1錠へ減量合意',
      setIntResult: () => {},
      intStatus: 'completed',
      setIntStatus: () => {},
      intMethod: 'phone',
      setIntMethod: () => {},
      intResponseDueDate: '',
      setIntResponseDueDate: () => {},
      intNote: '',
      setIntNote: () => {},
      intConsented: true,
      setIntConsented: () => {},
      onSave: async () => {},
      resetForm: () => {}
    })
  );
  assert.ok(openHtml.includes('疑義照会・処方変更を記録'));
  assert.ok(openHtml.includes('role="dialog"'));
  assert.ok(openHtml.includes('aria-modal="true"'));
  assert.ok(openHtml.includes('aria-labelledby="intervention-modal-title"'));
  assert.ok(openHtml.includes('value="山田 医師"'));
  assert.ok(openHtml.includes('用量過多の疑義'));
  assert.ok(openHtml.includes('1回2錠'));
  assert.ok(openHtml.includes('1回1錠'));
});

const noop = () => {};

function createMockEmrInterventionModalProps(
  overrides: Partial<EmrInterventionModalProps> = {}
): EmrInterventionModalProps {
  return {
    isOpen: true, onClose: noop, resetForm: noop, onSave: async () => true,
    intCategory: 'dosage_change', setIntCategory: noop,
    intDoctor: '山田 医師', setIntDoctor: noop,
    intReason: '用量過多の疑義', setIntReason: noop,
    intBefore: '1回2錠', setIntBefore: noop,
    intAfter: '1回1錠', setIntAfter: noop,
    intResult: '1回1錠へ減量合意', setIntResult: noop,
    intStatus: 'completed', setIntStatus: noop,
    intMethod: 'phone', setIntMethod: noop,
    intResponseDueDate: '', setIntResponseDueDate: noop,
    intNote: '', setIntNote: noop,
    intConsented: true, setIntConsented: noop,
    ...overrides
  };
}

const SAMPLE_INTERVENTION_INPUT: InterventionInput = {
  category: 'dosage_change', reason: '用量過多の疑義照会',
  beforeSnapshot: '1回2錠', afterSnapshot: '1回1錠',
  inquiryStatus: 'completed', inquiryMethod: 'phone',
  inquiryDoctor: '山田 医師', inquiryResult: '減量了承',
  responseDueDate: '', note: '', patientConsented: true
};

function createInMemoryInterventionTestStore(options: { claimStatus?: 'draft' | 'exported'; insertThrows?: Error } = {}) {
  const insertedRecords: Intervention[] = [];
  let removedCount = 0;
  const visit: EmrInterventionVisitHandle = {
    visitId: 'visit-int-1',
    patientId: 'pat-int-1',
    claimLifecycle: { status: options.claimStatus ?? 'draft' },
    interventionEvents: [],
    patch: async ({ interventionEvents }) => { visit.interventionEvents = interventionEvents; }
  };
  const db: InterventionStoreDb = {
    interventions: {
      insert: async (record) => {
        if (options.insertThrows) throw options.insertThrows;
        if (!validateInterventionSchema(record)) {
          throw new Error(`INTERVENTION_SCHEMA validation failed: ${ajv.errorsText(validateInterventionSchema.errors)}`);
        }
        insertedRecords.push(record);
        return {
          remove: async () => {
            removedCount += 1;
            const idx = insertedRecords.findIndex((r) => r.interventionId === record.interventionId);
            if (idx >= 0) insertedRecords.splice(idx, 1);
          }
        };
      },
      findOne: () => ({ exec: async () => null })
    },
    patients: { find: () => ({ exec: async () => [{ name: '試験 患者' }] }) }
  };
  return { db, visit, insertedRecords, getRemovedCount: () => removedCount };
}

async function runAddInterventionCase(
  overrides: Partial<Parameters<typeof executeAddEmrIntervention>[0]> = {}
) {
  const notifications: Array<{ kind: 'success' | 'error'; message: string }> = [];
  const appended: InterventionItem[] = [];
  const store = createInMemoryInterventionTestStore();
  const ok = await executeAddEmrIntervention({
    db: store.db,
    findActiveVisit: async () => store.visit,
    input: SAMPLE_INTERVENTION_INPUT,
    appendIntervention: (r) => appended.push(r),
    notifySuccess: (m) => notifications.push({ kind: 'success', message: m }),
    notifyError: (m) => notifications.push({ kind: 'error', message: m }),
    logAudit: async () => true,
    now: '2026-11-16T12:00:00.000Z',
    interventionId: 'int-test-1',
    currentUserName: '薬剤師 テスト',
    ...overrides
  });
  return { ok, notifications, appended, store };
}

test('submitEmrInterventionForm keeps modal open on empty reason, false return, and save errors', async () => {
  let saveCallCount = 0;
  const blankOutcome = await submitEmrInterventionForm({
    reason: '   ',
    onSave: async () => {
      saveCallCount += 1;
      return true;
    }
  });
  assert.deepEqual(blankOutcome, { alertMessage: '理由を入力してください。', shouldCloseAndReset: false });
  assert.equal(saveCallCount, 0);

  const cases: Array<{ label: string; onSave: () => Promise<boolean | void>; expected: { alertMessage: string | null; shouldCloseAndReset: boolean } }> = [
    { label: 'false return', onSave: async () => false, expected: { alertMessage: null, shouldCloseAndReset: false } },
    { label: 'Japanese error', onSave: async () => { throw new Error('保存先との通信に失敗しました。'); }, expected: { alertMessage: '保存先との通信に失敗しました。', shouldCloseAndReset: false } },
    { label: 'internal error', onSave: async () => { throw new Error('ECONNREFUSED'); }, expected: { alertMessage: '保存に失敗しました。', shouldCloseAndReset: false } },
    { label: 'true return', onSave: async () => true, expected: { alertMessage: null, shouldCloseAndReset: true } },
    { label: 'void return', onSave: async () => {}, expected: { alertMessage: null, shouldCloseAndReset: true } }
  ];
  for (const testCase of cases) {
    assert.deepEqual(await submitEmrInterventionForm({ reason: '重複投薬の確認', onSave: testCase.onSave }), testCase.expected, testCase.label);
  }
});

test('executeAddEmrIntervention returns false and notifies on missing db, missing visit, locked claim, DB failure, and audit rollback', async () => {
  const noDb = await runAddInterventionCase({ db: null, findActiveVisit: async () => null });
  assert.equal(noDb.ok, false);
  assert.deepEqual(noDb.notifications, [{ kind: 'error', message: INTERVENTION_DB_NOT_READY_MESSAGE }]);
  assert.equal(noDb.appended.length, 0);

  const noVisit = await runAddInterventionCase({ findActiveVisit: async () => null });
  assert.equal(noVisit.ok, false);
  assert.deepEqual(noVisit.notifications, [{ kind: 'error', message: INTERVENTION_ACTIVE_VISIT_NOT_FOUND_MESSAGE }]);
  assert.equal(noVisit.appended.length, 0);

  const lockedStore = createInMemoryInterventionTestStore({ claimStatus: 'exported' });
  const locked = await runAddInterventionCase({ db: lockedStore.db, findActiveVisit: async () => lockedStore.visit });
  assert.equal(locked.ok, false);
  assert.deepEqual(locked.notifications, [{ kind: 'error', message: getClaimEditBlockedMessage({ status: 'exported' }, 'prescription') }]);
  assert.equal(lockedStore.insertedRecords.length, 0);
  assert.equal(locked.appended.length, 0);

  const failStore = createInMemoryInterventionTestStore({ insertThrows: new Error('IDB_WRITE_FAILED') });
  const insertFail = await runAddInterventionCase({ db: failStore.db, findActiveVisit: async () => failStore.visit });
  assert.equal(insertFail.ok, false);
  assert.deepEqual(insertFail.notifications, [{ kind: 'error', message: '保存に失敗しました' }]);
  assert.equal(insertFail.appended.length, 0);

  const rollbackStore = createInMemoryInterventionTestStore();
  const auditRollback = await runAddInterventionCase({
    db: rollbackStore.db, findActiveVisit: async () => rollbackStore.visit, logAudit: async () => false, interventionId: 'int-rollback-1'
  });
  assert.equal(auditRollback.ok, false);
  assert.equal(rollbackStore.getRemovedCount(), 1);
  assert.equal(rollbackStore.insertedRecords.length, 0);
  assert.deepEqual(rollbackStore.visit.interventionEvents, []);
  assert.deepEqual(auditRollback.notifications, [{ kind: 'error', message: '疑義照会記録の監査ログ記録に失敗したため、記録を元に戻しました。' }]);
  assert.equal(auditRollback.appended.length, 0);
});

test('executeAddEmrIntervention persists record, appends state, notifies success, and returns true on success', async () => {
  const completed = await runAddInterventionCase({ interventionId: 'int-ok-1' });
  assert.equal(completed.ok, true);
  assert.equal(completed.appended.length, 1);
  assert.equal(completed.appended[0].interventionId, 'int-ok-1');
  assert.equal(completed.appended[0].category, 'dosage_change');
  assert.equal(completed.store.visit.interventionEvents?.length, 1);
  assert.deepEqual(completed.notifications, [{ kind: 'success', message: '疑義照会・処方変更を記録しました' }]);

  const merged = mergeInterventionCategories(
    completed.store.insertedRecords,
    completed.store.visit.interventionEvents
  );
  assert.equal(merged[0].category, 'dosage_change');

  const pending = await runAddInterventionCase({ input: { ...SAMPLE_INTERVENTION_INPUT, inquiryStatus: 'pending' }, interventionId: 'int-ok-2' });
  assert.equal(pending.ok, true);
  assert.equal(pending.appended.length, 1);
  assert.deepEqual(pending.notifications, [{ kind: 'success', message: '疑義照会を照会中として記録しました' }]);
});

test('maybeSuggestInterventionCategory suggests category from reason or drug names only when currentCategory is other', () => {
  const suggested: string[] = [];
  maybeSuggestInterventionCategory({
    currentCategory: 'other',
    reason: '',
    beforeDrug: 'ロキソニン錠60mg',
    afterDrug: 'ロキソプロフェンNa錠60mg（後発品変更）',
    setCategory: (c) => suggested.push(c)
  });
  assert.deepEqual(suggested, ['generic_change']);

  maybeSuggestInterventionCategory({
    currentCategory: 'discontinuation',
    reason: '後発品変更',
    beforeDrug: '',
    afterDrug: '',
    setCategory: (c) => suggested.push(c)
  });
  assert.deepEqual(suggested, ['generic_change']);
});

test('EmrInterventionModal disables submit button with aria-busy and saving label only while isSaving is true', () => {
  const idleHtml = stripStyleBlocks(
    renderToStaticMarkup(
      React.createElement(EmrInterventionModal, createMockEmrInterventionModalProps())
    )
  );
  const idleSubmitTag = findOpeningTag(idleHtml, '>登録</button>', 'button');
  assert.doesNotMatch(idleSubmitTag, /\sdisabled=""(?=[\s/>]|$)/);
  assert.match(idleSubmitTag, /\saria-busy="false"(?=[\s/>]|$)/);

  const savingHtml = stripStyleBlocks(
    renderMarkupWithReactUseStateMock(
      () => React.createElement(EmrInterventionModal, createMockEmrInterventionModalProps()),
      {
        componentName: 'EmrInterventionModal',
        restoreAtCallIndex: 0,
        expectedCalls: 1,
        overrides: {
          0: {
            assertInitial: (initialState) =>
              assert.equal(initialState, false, `Expected isSaving initial false, got ${String(initialState)}`),
            value: true
          }
        }
      }
    )
  );
  const savingSubmitTag = findOpeningTag(savingHtml, '>登録中...</button>', 'button');
  assert.match(savingSubmitTag, /\sdisabled=""(?=[\s/>]|$)/);
  assert.match(savingSubmitTag, /\saria-busy="true"(?=[\s/>]|$)/);

  const cancelButtonTag = findOpeningTag(savingHtml, '>キャンセル</button>', 'button');
  assert.doesNotMatch(cancelButtonTag, /\sdisabled=""(?=[\s/>]|$)/);
});

