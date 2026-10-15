import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MedicationGuidanceModal,
  normalizeGuidanceEntries,
  getMedicationGuidanceModalViewState,
  MEDICATION_GUIDANCE_LOAD_ERROR_MESSAGE,
  type MedicationGuidanceEntry
} from './components/MedicationGuidanceModal';

describe('normalizeGuidanceEntries pure function contracts', () => {
  it('normalizes guidance entries to uppercase type and trimmed text', () => {
    const raw = [
      { type: 's', text: '  めまいやふらつきの訴えなし  ' },
      { type: 'o', text: '血圧 128/82 mmHg' },
      { type: 'A', text: ' 降圧コントロール良好 ' },
      { type: 'p', text: ' 次回も同量継続、家庭血圧記録を指導 ' }
    ];
    const normalized = normalizeGuidanceEntries(raw);

    assert.deepStrictEqual(normalized, [
      { type: 'S', text: 'めまいやふらつきの訴えなし' },
      { type: 'O', text: '血圧 128/82 mmHg' },
      { type: 'A', text: '降圧コントロール良好' },
      { type: 'P', text: '次回も同量継続、家庭血圧記録を指導' }
    ]);
  });

  it('handles empty entries array safely', () => {
    const normalized = normalizeGuidanceEntries([]);
    assert.deepStrictEqual(normalized, []);
  });

  it('falls back gracefully on non-string text or invalid type', () => {
    const raw = [
      { type: 123 as any, text: undefined as any },
      { type: 'x', text: '備考メモ' }
    ];
    const normalized = normalizeGuidanceEntries(raw);
    assert.equal(normalized[0].type, 'S');
    assert.equal(normalized[0].text, '');
    assert.equal(normalized[1].type, 'X');
    assert.equal(normalized[1].text, '備考メモ');
  });
});

describe('getMedicationGuidanceModalViewState pure function contracts', () => {
  it('returns error state and disables save when hasLoadError is true', () => {
    assert.deepStrictEqual(getMedicationGuidanceModalViewState(false, true, false), {
      status: 'error',
      errorMessage: MEDICATION_GUIDANCE_LOAD_ERROR_MESSAGE,
      isSaveDisabled: true,
      saveDisabledTitle: '読み込みに失敗したため保存できません'
    });
  });

  it('returns loading state and disables save while loading', () => {
    assert.deepStrictEqual(getMedicationGuidanceModalViewState(true, false, false), {
      status: 'loading',
      errorMessage: null,
      isSaveDisabled: true,
      saveDisabledTitle: '読み込み中...'
    });
  });

  it('returns ready state and reflects isSaving in save button disabled state', () => {
    assert.deepStrictEqual(getMedicationGuidanceModalViewState(false, false, false), {
      status: 'ready',
      errorMessage: null,
      isSaveDisabled: false,
      saveDisabledTitle: ''
    });
    assert.deepStrictEqual(getMedicationGuidanceModalViewState(false, false, true), {
      status: 'ready',
      errorMessage: null,
      isSaveDisabled: true,
      saveDisabledTitle: '保存中...'
    });
  });
});

describe('MedicationGuidanceModal renderToStaticMarkup contracts', () => {
  it('renders nothing (null/empty string) when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(MedicationGuidanceModal, {
        isOpen: false,
        onClose: () => {},
        drug: { code: 'D001', name: 'アムロジピン錠5mg' }
      })
    );
    assert.equal(html, '');
  });

  it('renders guidance modal structure, drug title, and SOAP add buttons when open', () => {
    const html = renderToStaticMarkup(
      React.createElement(MedicationGuidanceModal, {
        isOpen: true,
        onClose: () => {},
        drug: { code: 'D001', name: 'アムロジピン錠5mg' }
      })
    );

    assert.ok(html.includes('class="modal-overlay"'), 'Should render modal overlay container');
    assert.ok(html.includes('class="modal-content modal-md"'), 'Should render modal-content modal-md');
    assert.ok(html.includes('服薬指導補助マニュアル: アムロジピン錠5mg'), 'Header should display drug name');
    assert.ok(html.includes('この薬剤に関する指導ポイントやヒントを登録できます。'), 'Should render guidance description');
    assert.ok(html.includes('class="guidance-entry-list"'), 'Should render guidance entry list container');
    assert.ok(html.includes('class="guidance-add-bar"'), 'Should render guidance add bar');

    // SOAP buttons check
    assert.ok(html.includes('class="btn-add-type is-s"'), 'Should render + S button');
    assert.ok(html.includes('+ S'), 'Button should label + S');
    assert.ok(html.includes('class="btn-add-type is-o"'), 'Should render + O button');
    assert.ok(html.includes('+ O'), 'Button should label + O');
    assert.ok(html.includes('class="btn-add-type is-a"'), 'Should render + A button');
    assert.ok(html.includes('+ A'), 'Button should label + A');
    assert.ok(html.includes('class="btn-add-type is-p"'), 'Should render + P button');
    assert.ok(html.includes('+ P'), 'Button should label + P');

    // Footer buttons check
    assert.ok(html.includes('キャンセル'), 'Should render cancel button');
    assert.ok(html.includes('保存'), 'Should render save button');
  });

  it('renders registered SOAP entries with type badges and textareas when initialEntries are provided', () => {
    const sampleEntries: MedicationGuidanceEntry[] = [
      { id: 'entry-1', type: 'S', text: '立ちくらみ・動悸なし' },
      { id: 'entry-2', type: 'O', text: '脈拍 72 bpm、血圧安定' },
      { id: 'entry-3', type: 'A', text: '過度の血圧低下徴候なし' },
      { id: 'entry-4', type: 'P', text: 'グレープフルーツジュース併用注意の再確認' }
    ];

    const html = renderToStaticMarkup(
      React.createElement(MedicationGuidanceModal, {
        isOpen: true,
        onClose: () => {},
        drug: { code: 'D001', name: 'アムロジピン錠5mg' },
        initialEntries: sampleEntries
      })
    );

    // Verify row count and type badge classes
    assert.ok(html.includes('class="guidance-type-badge is-s"'), 'Badge for S should be rendered');
    assert.ok(html.includes('class="guidance-type-badge is-o"'), 'Badge for O should be rendered');
    assert.ok(html.includes('class="guidance-type-badge is-a"'), 'Badge for A should be rendered');
    assert.ok(html.includes('class="guidance-type-badge is-p"'), 'Badge for P should be rendered');

    // Verify text content within textareas
    assert.ok(html.includes('立ちくらみ・動悸なし'), 'S entry text should be rendered');
    assert.ok(html.includes('脈拍 72 bpm、血圧安定'), 'O entry text should be rendered');
    assert.ok(html.includes('過度の血圧低下徴候なし'), 'A entry text should be rendered');
    assert.ok(html.includes('グレープフルーツジュース併用注意の再確認'), 'P entry text should be rendered');

    // Verify trash action buttons
    assert.ok(html.includes('btn-trash-action'), 'Trash action buttons should be rendered for each entry');
  });

  it('renders safely when drug object is missing or null without throwing', () => {
    const html = renderToStaticMarkup(
      React.createElement(MedicationGuidanceModal, {
        isOpen: true,
        onClose: () => {},
        drug: null
      })
    );
    assert.ok(html.includes('服薬指導補助マニュアル:'), 'Should render header safely without throwing');
    assert.ok(html.includes('class="guidance-add-bar"'), 'Should still render add bar');
  });

  it('renders error alert and disables save button when initialLoadError is true', () => {
    const rawHtml = renderToStaticMarkup(
      React.createElement(MedicationGuidanceModal, {
        isOpen: true,
        onClose: () => {},
        drug: { code: 'D001', name: 'アムロジピン錠5mg' },
        initialLoadError: true
      })
    );
    const html = rawHtml.replace(/<style[\s\S]*?<\/style>/g, '');
    assert.ok(html.includes(MEDICATION_GUIDANCE_LOAD_ERROR_MESSAGE), 'Should render load error message');
    assert.ok(!html.includes('class="guidance-add-bar"'), 'Should not render add bar when load failed');
    assert.ok(html.includes('data-disabled="true"'), 'Tooltip wrapper should reflect disabled state');
    assert.ok(html.includes('disabled=""'), 'Save button should be disabled when load failed');
  });
});
