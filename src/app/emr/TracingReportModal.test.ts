import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  submitTracingReportForm,
  TracingReportModal,
  type TracingReportModalProps
} from './components/TracingReportModal';
import {
  executeSaveTracingReport,
  TRACING_REPORT_ACTIVE_VISIT_NOT_FOUND_MESSAGE,
  TRACING_REPORT_DB_NOT_READY_MESSAGE,
  type ExecuteSaveTracingReportParams,
  type TracingReportVisitHandle
} from '@/hooks/useEmrTracingReport';
import type { Visit, VisitTracingReport } from '@/db/types';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';

const DISABLED_ATTRIBUTE_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;

function createMockTracingReportModalProps(
  overrides: Partial<TracingReportModalProps> = {}
): TracingReportModalProps {
  return {
    isOpen: true,
    onClose: () => {},
    patientName: '患者 太郎',
    prescriptionItems: [
      { drugName: 'カルベジロール錠10mg', quantity: 28, usage: '1日1回 朝食後' }
    ],
    soapProblems: [
      {
        title: '#1 高血圧症',
        entries: [
          { type: 'S', text: 'めまいは特になく血圧も安定している' },
          { type: 'O', text: 'BP 128/82 mmHg' },
          { type: 'A', text: '降圧効果良好で副作用徴候なし' },
          { type: 'P', text: '現行処方を継続し次回も家庭血圧を確認' }
        ]
      }
    ],
    pharmacyInfo: {
      pharmacyName: 'テスト薬局 本店',
      pharmacyPhone: '03-1234-5678',
      pharmacyFax: '03-1234-5679',
      defaultPharmacistName: '薬剤師 花子'
    },
    onSaveReport: async () => {},
    ...overrides
  };
}

function renderWithIsSaving(
  props: TracingReportModalProps,
  isSavingOverride: boolean
): string {
  return renderMarkupWithReactUseStateMock(
    () => React.createElement(TracingReportModal, props),
    {
      componentName: 'TracingReportModal',
      restoreAtCallIndex: 1,
      expectedCalls: 2,
      overrides: {
        1: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              false,
              `Expected TracingReportModal useState call #1 initial value to be false (isSaving), got ${String(initialState)}`
            ),
          value: isSavingOverride
        }
      }
    }
  );
}

describe('TracingReportModal renderToStaticMarkup contracts', () => {
  it('exports TracingReportModal as a callable React component function', () => {
    assert.equal(typeof TracingReportModal, 'function');
  });

  it('renders nothing when isOpen is false', () => {
    const props = createMockTracingReportModalProps({ isOpen: false });
    const html = renderToStaticMarkup(React.createElement(TracingReportModal, props));
    assert.equal(html, '', 'Should render empty string when closed');
  });

  it('renders tracing report modal fields, sections, and action buttons when isOpen is true', () => {
    const props = createMockTracingReportModalProps();
    const html = renderToStaticMarkup(React.createElement(TracingReportModal, props));

    // Header & Actions
    assert.ok(html.includes('服薬情報提供書 (トレーシングレポート) 作成'), 'Should render modal title');
    assert.ok(html.includes('SOAPから自動下書き'), 'Should render auto draft button');

    // Form labels and inputs
    assert.ok(html.includes('診療科 (任意)'), 'Should render department label');
    assert.ok(html.includes('担当医師名'), 'Should render doctor name label');
    assert.ok(html.includes('報告件名'), 'Should render subject label');
    assert.ok(html.includes('ステータス'), 'Should render status label');

    // Section textareas
    assert.ok(html.includes('1. 処方薬剤概要'), 'Should render medication summary section');
    assert.ok(html.includes('2. 患者の服薬状況・主訴・経過'), 'Should render patient condition section');
    assert.ok(html.includes('3. 薬剤師アセスメント'), 'Should render assessment section');
    assert.ok(html.includes('4. 処方提案・ご検討事項'), 'Should render proposal section');

    // Footer actions
    assert.ok(html.includes('A4印刷 / PDF出力'), 'Should render print preview button');
    assert.ok(html.includes('保存'), 'Should render save button');
  });

  it('populates fields when existingReport is provided', () => {
    const existingReport: VisitTracingReport = {
      reportId: 'tr-test-existing-001',
      reportDate: '2026-10-06',
      status: 'ready',
      destinationInstitution: '聖マリア記念病院',
      destinationInstitutionCode: '1310123456',
      destinationDepartment: '循環器内科',
      destinationDoctor: '鈴木 一郎 先生',
      subject: '【服薬情報提供】残薬調整および服薬状況報告',
      medicationSummary: 'カルベジロール錠10mg 1日1回 朝食後',
      patientCondition: '朝の服用忘れが週に1〜2回あり、残薬が14錠発生している',
      assessment: '血圧は安定しているが朝の内服アドヒアランス低下が懸念される',
      proposal: '朝食後から夕食後への服用時点変更、または一包化を提案いたします',
      followUpPlan: '次回来局時に残薬数および血圧手帳の記録を確認します',
      createdAt: '2026-10-06T10:00:00Z',
      updatedAt: '2026-10-06T10:00:00Z'
    };

    const props = createMockTracingReportModalProps({
      existingReport
    });
    const html = renderToStaticMarkup(React.createElement(TracingReportModal, props));

    assert.ok(html.includes('聖マリア記念病院'), 'Should render destination institution');
    assert.ok(html.includes('value="循環器内科"'), 'Should populate destination department');
    assert.ok(html.includes('value="鈴木 一郎 先生"'), 'Should populate doctor name');
    assert.ok(html.includes('value="【服薬情報提供】残薬調整および服薬状況報告"'), 'Should populate report subject');
    assert.ok(html.includes('カルベジロール錠10mg 1日1回 朝食後'), 'Should populate medication summary');
    assert.ok(html.includes('朝の服用忘れが週に1〜2回あり'), 'Should populate patient condition');
  });

  it('pins save button as disabled when report subject is empty or whitespace-only', () => {
    // Case 1: Empty subject string
    const emptyProps = createMockTracingReportModalProps({
      existingReport: { subject: '' } as unknown as VisitTracingReport
    });
    const emptyHtml = renderToStaticMarkup(React.createElement(TracingReportModal, emptyProps));
    const emptyBtnTag = findOpeningTag(emptyHtml, '<span>保存</span>', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(emptyBtnTag),
      `Save button must be disabled when subject is empty: ${emptyBtnTag}`
    );
    assert.ok(emptyHtml.includes('<span>保存</span>'), 'Save button label should be "保存"');

    // Case 2: Whitespace-only subject string
    const whitespaceProps = createMockTracingReportModalProps({
      existingReport: { subject: '   ' } as unknown as VisitTracingReport
    });
    const whitespaceHtml = renderToStaticMarkup(React.createElement(TracingReportModal, whitespaceProps));
    const whitespaceBtnTag = findOpeningTag(whitespaceHtml, '<span>保存</span>', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(whitespaceBtnTag),
      `Save button must be disabled when subject is whitespace-only: ${whitespaceBtnTag}`
    );
  });

  it('pins save button as enabled when subject is present and not saving', () => {
    // Case 1: Auto-drafted subject from default props
    const defaultProps = createMockTracingReportModalProps();
    const defaultHtml = renderToStaticMarkup(React.createElement(TracingReportModal, defaultProps));
    const defaultBtnTag = findOpeningTag(defaultHtml, '<span>保存</span>', 'button');
    assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(defaultBtnTag), `Save button must be enabled: ${defaultBtnTag}`);
    assert.match(defaultBtnTag, /\saria-busy="false"(?=[\s/>]|$)/);
    assert.ok(defaultHtml.includes('<span>保存</span>'), 'Save button label should be "保存"');

    // Case 2: Valid explicit subject from existingReport
    const validProps = createMockTracingReportModalProps({
      existingReport: {
        subject: '【服薬情報提供】残薬調整および服薬状況報告'
      } as unknown as VisitTracingReport
    });
    const validHtml = renderToStaticMarkup(React.createElement(TracingReportModal, validProps));
    const validBtnTag = findOpeningTag(validHtml, '<span>保存</span>', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(validBtnTag),
      `Save button must be enabled with valid subject: ${validBtnTag}`
    );
  });

  it('pins save button as disabled and displays saving text when isSaving is true', () => {
    const props = createMockTracingReportModalProps({
      existingReport: {
        subject: '【服薬情報提供】残薬調整および服薬状況報告'
      } as unknown as VisitTracingReport
    });

    const savingHtml = renderWithIsSaving(props, true);
    const savingBtnTag = findOpeningTag(savingHtml, '<span>保存中...</span>', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(savingBtnTag),
      `Save button must be disabled when isSaving is true even with valid subject: ${savingBtnTag}`
    );
    assert.match(savingBtnTag, /\saria-busy="true"(?=[\s/>]|$)/);
    assert.ok(savingHtml.includes('<span>保存中...</span>'), 'Save button label should change to "保存中..."');
    assert.ok(!savingHtml.includes('<span>保存</span>'), 'Save button label should not remain "保存"');
  });
});

const SAMPLE_TRACING_REPORT: VisitTracingReport = {
  reportId: 'tr-test-001',
  status: 'draft',
  reportDate: '2026-11-16',
  destinationInstitution: '中央病院',
  destinationInstitutionCode: '1310001',
  destinationDepartment: '内科',
  destinationDoctor: '山田 医師',
  subject: '残薬調整のご報告',
  medicationSummary: 'アムロジピン錠5mg',
  patientCondition: '残薬あり',
  assessment: 'アドヒアランス確認',
  proposal: '日数調整を提案',
  followUpPlan: '次回確認',
  createdAt: '2026-11-16T09:00:00.000Z',
  updatedAt: '2026-11-16T09:00:00.000Z'
};

async function runSaveTracingCase(
  overrides: Partial<ExecuteSaveTracingReportParams> = {},
  options: { patchError?: Error } = {}
) {
  const notifications: Array<{ kind: 'success' | 'warning' | 'error'; message: string }> = [];
  const stateReports: VisitTracingReport[][] = [];
  const patchedPayloads: Array<NonNullable<Visit['careCommunication']>> = [];
  const visitDoc: Visit = {
    visitId: 'v-tr-1',
    patientId: 'p-tr-1',
    prescriptionDate: '2026-11-16',
    dispensingDate: '2026-11-16',
    issueDate: '2026-11-16T09:00:00.000Z',
    status: 'processing'
  };
  const visit: TracingReportVisitHandle = {
    patientId: visitDoc.patientId,
    toJSON: () => visitDoc,
    patch: async ({ careCommunication }) => {
      if (options.patchError) throw options.patchError;
      visitDoc.careCommunication = careCommunication;
      patchedPayloads.push(careCommunication);
    }
  };
  const ok = await executeSaveTracingReport({
    isDbReady: true,
    findActiveVisit: async () => visit,
    report: SAMPLE_TRACING_REPORT,
    currentPatientName: '試験 患者',
    setTracingReports: (reports) => stateReports.push(reports),
    notifySuccess: (message) => notifications.push({ kind: 'success', message }),
    notifyWarning: (message) => notifications.push({ kind: 'warning', message }),
    notifyError: (message) => notifications.push({ kind: 'error', message }),
    logAudit: async () => true,
    now: '2026-11-16T10:00:00.000Z',
    currentUserName: '薬剤師 テスト',
    ...overrides
  });
  return { ok, notifications, stateReports, patchedPayloads };
}

describe('TracingReport save outcome and error handling contracts', () => {
  it('keeps modal open on empty subject, false save result, and thrown save errors', async () => {
    let calls = 0;
    assert.deepEqual(
      await submitTracingReportForm({ subject: '  ', onSave: async () => { calls += 1; return true; } }),
      { shouldClose: false, alertMessage: null }
    );
    assert.equal(calls, 0);

    const cases: Array<{ label: string; onSave: () => Promise<boolean | void>; expected: { shouldClose: boolean; alertMessage: string | null } }> = [
      { label: 'false return', onSave: async () => false, expected: { shouldClose: false, alertMessage: null } },
      { label: 'Japanese throw', onSave: async () => { throw new Error('通信に失敗しました'); }, expected: { shouldClose: false, alertMessage: '通信に失敗しました' } },
      { label: 'internal throw', onSave: async () => { throw new Error('IDB_ERR'); }, expected: { shouldClose: false, alertMessage: 'トレーシングレポートの保存に失敗しました' } },
      { label: 'true return', onSave: async () => true, expected: { shouldClose: true, alertMessage: null } },
      { label: 'void return', onSave: async () => {}, expected: { shouldClose: true, alertMessage: null } }
    ];
    for (const c of cases) {
      assert.deepEqual(await submitTracingReportForm({ subject: '件名', onSave: c.onSave }), c.expected, c.label);
    }
  });

  it('returns false and notifies on missing db, missing visit, and patch failure without clearing form state', async () => {
    const noDb = await runSaveTracingCase({ isDbReady: false });
    assert.equal(noDb.ok, false);
    assert.deepEqual(noDb.notifications, [{ kind: 'error', message: TRACING_REPORT_DB_NOT_READY_MESSAGE }]);
    assert.equal(noDb.stateReports.length, 0);

    const noVisit = await runSaveTracingCase({ findActiveVisit: async () => null });
    assert.equal(noVisit.ok, false);
    assert.deepEqual(noVisit.notifications, [{ kind: 'error', message: TRACING_REPORT_ACTIVE_VISIT_NOT_FOUND_MESSAGE }]);
    assert.equal(noVisit.stateReports.length, 0);

    const patchFail = await runSaveTracingCase({}, { patchError: new Error('IDB_PATCH_FAILED') });
    assert.equal(patchFail.ok, false);
    assert.deepEqual(patchFail.notifications, [{ kind: 'error', message: 'トレーシングレポートの保存に失敗しました' }]);
    assert.equal(patchFail.stateReports.length, 0);
  });

  it('persists tracing report, records sent metadata when sent, warns on audit failure, and returns true', async () => {
    const auditWarn = await runSaveTracingCase({
      report: { ...SAMPLE_TRACING_REPORT, status: 'sent' },
      logAudit: async () => false
    });
    assert.equal(auditWarn.ok, true);
    assert.equal(auditWarn.stateReports[0][0].sentBy, '薬剤師 テスト');
    assert.equal(auditWarn.stateReports[0][0].sentAt, '2026-11-16T10:00:00.000Z');
    assert.deepEqual(auditWarn.notifications, [{ kind: 'warning', message: 'レポートは保存しましたが、監査ログ記録に失敗しました。' }]);

    const draftOk = await runSaveTracingCase();
    assert.equal(draftOk.ok, true);
    assert.equal(draftOk.stateReports[0][0].sentBy, undefined);
    assert.equal(draftOk.patchedPayloads.length, 1);
    assert.deepEqual(draftOk.notifications, [{ kind: 'success', message: 'トレーシングレポートを保存しました' }]);
  });
});
