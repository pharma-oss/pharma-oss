import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { DatabaseContext } from '@/db/DatabaseContext';
import type {
  MedHistoryPrescriptionItem,
  MedHistorySoapRecord,
  MedHistoryVisit
} from '@/lib/drug_medication_history';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import DrugHistoryModal, {
  DRUG_HISTORY_EMPTY_MESSAGE,
  DRUG_HISTORY_LOAD_ERROR_MESSAGE,
  getDrugHistoryModalBodyState
} from './DrugHistoryModal';

interface DrugHistoryHookOverrides {
  loading?: boolean;
  hasLoadError?: boolean;
  visits?: MedHistoryVisit[];
  items?: MedHistoryPrescriptionItem[];
  soaps?: MedHistorySoapRecord[];
  drugNamesById?: Map<string, string>;
  selectedDrugId?: string | null;
}

function renderDrugHistoryModal(
  props: { open?: boolean; targetVisitId?: string | null; onClose?: () => void } = {},
  overrides: DrugHistoryHookOverrides = {}
): string {
  const html = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(
        DatabaseContext.Provider,
        { value: null },
        React.createElement(DrugHistoryModal, {
          targetVisitId: props.targetVisitId ?? 'V-001',
          open: props.open ?? true,
          onClose: props.onClose ?? (() => {})
        })
      ),
    {
      componentName: 'DrugHistoryModal',
      restoreAtCallIndex: 6,
      minCalls: 7,
      overrides: {
        0: {
          assertInitial: (v) =>
            assert.equal(typeof v, 'boolean', 'Hook #0 (loading) must initialize as boolean'),
          ...(overrides.loading !== undefined ? { value: overrides.loading } : {})
        },
        1: {
          assertInitial: (v) =>
            assert.equal(typeof v, 'boolean', 'Hook #1 (hasLoadError) must initialize as boolean'),
          ...(overrides.hasLoadError !== undefined ? { value: overrides.hasLoadError } : {})
        },
        2: {
          assertInitial: (v) =>
            assert.ok(Array.isArray(v), 'Hook #2 (visits) must initialize as array'),
          ...(overrides.visits !== undefined ? { value: overrides.visits } : {})
        },
        3: {
          assertInitial: (v) =>
            assert.ok(Array.isArray(v), 'Hook #3 (items) must initialize as array'),
          ...(overrides.items !== undefined ? { value: overrides.items } : {})
        },
        4: {
          assertInitial: (v) =>
            assert.ok(Array.isArray(v), 'Hook #4 (soaps) must initialize as array'),
          ...(overrides.soaps !== undefined ? { value: overrides.soaps } : {})
        },
        5: {
          assertInitial: (v) =>
            assert.ok(v instanceof Map, 'Hook #5 (drugNamesById) must initialize as Map'),
          ...(overrides.drugNamesById !== undefined ? { value: overrides.drugNamesById } : {})
        },
        6: {
          assertInitial: (v) =>
            assert.equal(v, null, 'Hook #6 (selectedDrugId) must initialize as null'),
          ...(overrides.selectedDrugId !== undefined ? { value: overrides.selectedDrugId } : {})
        }
      }
    }
  );
  return stripStyleBlocks(html);
}

describe('getDrugHistoryModalBodyState helper', () => {
  it('returns loading while loading is true regardless of error or drugCount', () => {
    assert.deepStrictEqual(getDrugHistoryModalBodyState(true, false, 0), {
      status: 'loading'
    });
    assert.deepStrictEqual(getDrugHistoryModalBodyState(true, true, 3), {
      status: 'loading'
    });
  });

  it('returns error message when loading failed instead of empty state', () => {
    assert.deepStrictEqual(getDrugHistoryModalBodyState(false, true, 0), {
      status: 'error',
      message: DRUG_HISTORY_LOAD_ERROR_MESSAGE
    });
    assert.deepStrictEqual(getDrugHistoryModalBodyState(false, true, 2), {
      status: 'error',
      message: DRUG_HISTORY_LOAD_ERROR_MESSAGE
    });
  });

  it('distinguishes empty history from ready state when load succeeded', () => {
    assert.deepStrictEqual(getDrugHistoryModalBodyState(false, false, 0), {
      status: 'empty',
      message: DRUG_HISTORY_EMPTY_MESSAGE
    });
    assert.deepStrictEqual(getDrugHistoryModalBodyState(false, false, 1), {
      status: 'ready'
    });
  });
});

describe('DrugHistoryModal SSR UI rendering states', () => {
  it('renders nothing when open is false and renders header dialog with loading, error, and empty states when open is true', () => {
    const closedHtml = renderDrugHistoryModal(
      { open: false },
      { loading: true }
    );
    assert.equal(closedHtml, '');

    const loadingHtml = renderDrugHistoryModal(
      { open: true },
      { loading: true, hasLoadError: true }
    );
    const dialogTag = findOpeningTag(loadingHtml, 'aria-label="薬剤履歴"', 'div');
    assert.match(dialogTag, /\bdh-modal\b/);
    assert.match(dialogTag, /\brole="dialog"/);
    assert.match(dialogTag, /\baria-modal="true"/);
    assert.ok(loadingHtml.includes('<h3>薬剤履歴</h3>'));
    assert.ok(loadingHtml.includes('aria-label="閉じる"'));
    assert.ok(loadingHtml.includes('読み込み中...'));
    assert.ok(!loadingHtml.includes(DRUG_HISTORY_LOAD_ERROR_MESSAGE));
    assert.ok(!loadingHtml.includes(DRUG_HISTORY_EMPTY_MESSAGE));
    assert.ok(!loadingHtml.includes('class="dh-body"'));

    const errorHtml = renderDrugHistoryModal(
      { open: true },
      { loading: false, hasLoadError: true }
    );
    assert.ok(errorHtml.includes(`<div class="dh-empty">${DRUG_HISTORY_LOAD_ERROR_MESSAGE}</div>`));
    assert.ok(!errorHtml.includes('読み込み中...'));
    assert.ok(!errorHtml.includes(DRUG_HISTORY_EMPTY_MESSAGE));
    assert.ok(!errorHtml.includes('class="dh-body"'));

    const emptyHtml = renderDrugHistoryModal(
      { open: true },
      { loading: false, hasLoadError: false, visits: [], items: [] }
    );
    assert.ok(emptyHtml.includes(`<div class="dh-empty">${DRUG_HISTORY_EMPTY_MESSAGE}</div>`));
    assert.ok(!emptyHtml.includes('読み込み中...'));
    assert.ok(!emptyHtml.includes(DRUG_HISTORY_LOAD_ERROR_MESSAGE));
    assert.ok(!emptyHtml.includes('class="dh-body"'));
  });

  it('renders drug selector with active state, formatted timeline entries, substitution badge, fallback labels, and non-blank SOAP rows', () => {
    const visits: MedHistoryVisit[] = [
      {
        visitId: 'V-1',
        patientId: 'P-1',
        prescriptionDate: '2026-05-10',
        institutionName: '桜丘内科クリニック',
        departmentName: '循環器科',
        doctorName: '山田太郎',
        status: 'completed'
      },
      {
        visitId: 'V-2',
        patientId: 'P-1',
        status: 'completed'
      },
      {
        visitId: 'V-3',
        patientId: 'P-1',
        prescriptionDate: '2026-04-01',
        institutionName: 'みなと眼科',
        status: 'completed'
      }
    ];
    const items: MedHistoryPrescriptionItem[] = [
      {
        visitId: 'V-1',
        drugId: 'D-61001',
        drugName: 'アムロジピン錠5mg',
        dispensedDrugCode: 'D-62001',
        dispensedDrug: 'アムロジピンOD錠5mg「GE」',
        amount: 1,
        usage: '1日1回朝食後',
        days: 28
      },
      {
        visitId: 'V-2',
        drugId: 'D-61001',
        drugName: 'アムロジピン錠5mg',
        dispensedDrugCode: 'D-61001',
        dispensedDrug: 'アムロジピン錠5mg',
        amount: 2,
        usage: '1日1回就寝前',
        days: 14
      },
      {
        visitId: 'V-3',
        drugId: 'D-61002',
        drugName: 'ヒアレイン点眼液0.1%',
        dispensedDrugCode: 'D-61002',
        dispensedDrug: 'ヒアレイン点眼液0.1%',
        amount: 1,
        usage: '1日4回点眼',
        days: 30
      }
    ];
    const soaps: MedHistorySoapRecord[] = [
      {
        visitId: 'V-1',
        problems: [
          {
            title: '高血圧管理',
            entries: [
              { type: 'S', text: '朝のめまいなし' },
              { type: 'O', text: '   ' },
              { type: 'P', text: '継続服用と血圧記録を説明' }
            ]
          }
        ]
      }
    ];
    const drugNamesById = new Map<string, string>([
      ['D-61001', 'アムロジピン錠5mg(マスタ名)'],
      ['D-61002', 'ヒアレイン点眼液0.1%']
    ]);

    const defaultHtml = renderDrugHistoryModal(
      { open: true },
      { visits, items, soaps, drugNamesById, selectedDrugId: null }
    );

    assert.ok(defaultHtml.includes('class="dh-body"'));
    assert.ok(defaultHtml.includes('aria-label="薬剤を選択"'));
    assert.ok(defaultHtml.includes('aria-label="履歴"'));

    const activeDrugButton = findOpeningTag(defaultHtml, 'アムロジピン錠5mg(マスタ名)', 'button');
    assert.match(activeDrugButton, /\bdh-drug\b/);
    assert.match(activeDrugButton, /\bactive\b/);
    const inactiveDrugButton = findOpeningTag(defaultHtml, 'ヒアレイン点眼液0.1%', 'button');
    assert.match(inactiveDrugButton, /\bdh-drug\b/);
    assert.doesNotMatch(inactiveDrugButton, /\bactive\b/);

    assert.ok(defaultHtml.includes('<span class="dh-drug-meta">2回 / 最終 2026/05/10</span>'));
    assert.ok(defaultHtml.includes('<span class="dh-drug-meta">1回 / 最終 2026/04/01</span>'));
    assert.ok(
      defaultHtml.includes(
        '<div class="dh-anchor"><strong>アムロジピン錠5mg(マスタ名)</strong><span>2件の受付 / 最終処方 2026/05/10</span></div>'
      )
    );

    assert.ok(defaultHtml.includes('桜丘内科クリニック 循環器科 / 山田太郎医師'));
    assert.ok(defaultHtml.includes('医療機関不明'));
    assert.ok(defaultHtml.includes('日付不明'));
    assert.ok(defaultHtml.includes('→ 調剤: アムロジピンOD錠5mg「GE」'));
    assert.ok(defaultHtml.includes('1日1回朝食後　1 × 28日分'));

    assert.ok(defaultHtml.includes('<div class="dh-problem-title">高血圧管理</div>'));
    assert.ok(defaultHtml.includes('<span class="dh-soap-letter is-s">S</span><span>朝のめまいなし</span>'));
    assert.ok(defaultHtml.includes('<span class="dh-soap-letter is-p">P</span><span>継続服用と血圧記録を説明</span>'));
    const soapLines = defaultHtml.match(/class="dh-soap-line"/g) ?? [];
    assert.equal(soapLines.length, 2, 'Blank whitespace SOAP entries must be filtered out');
    assert.ok(!defaultHtml.includes('class="dh-soap-letter is-o"'));
    assert.ok(defaultHtml.includes('<div class="dh-soap-empty">この受付の薬歴は記録されていません。</div>'));

    const switchedHtml = renderDrugHistoryModal(
      { open: true },
      { visits, items, soaps, drugNamesById, selectedDrugId: 'D-61002' }
    );
    const switchedActiveButton = findOpeningTag(switchedHtml, 'ヒアレイン点眼液0.1%', 'button');
    assert.match(switchedActiveButton, /\bactive\b/);
    const switchedInactiveButton = findOpeningTag(switchedHtml, 'アムロジピン錠5mg(マスタ名)', 'button');
    assert.doesNotMatch(switchedInactiveButton, /\bactive\b/);
    assert.ok(
      switchedHtml.includes(
        '<div class="dh-anchor"><strong>ヒアレイン点眼液0.1%</strong><span>1件の受付 / 最終処方 2026/04/01</span></div>'
      )
    );
    assert.ok(switchedHtml.includes('みなと眼科'));
    assert.ok(!switchedHtml.includes('桜丘内科クリニック'));
  });

  it('shows empty timeline notice when selected drug exists only on cancelled visits', () => {
    const visits: MedHistoryVisit[] = [
      {
        visitId: 'V-CANCELLED',
        patientId: 'P-1',
        prescriptionDate: '2026-05-01',
        status: 'cancelled'
      }
    ];
    const items: MedHistoryPrescriptionItem[] = [
      {
        visitId: 'V-CANCELLED',
        drugId: 'D-90001',
        drugName: 'キャンセル薬錠10mg',
        amount: 1,
        days: 7
      }
    ];

    const html = renderDrugHistoryModal(
      { open: true },
      { visits, items, selectedDrugId: null }
    );

    assert.ok(html.includes('class="dh-body"'));
    assert.ok(html.includes('キャンセル薬錠10mg'));
    assert.ok(html.includes('<div class="dh-empty">この薬の過去処方は見つかりませんでした。</div>'));
    assert.ok(!html.includes('class="dh-entry"'));
  });
});
