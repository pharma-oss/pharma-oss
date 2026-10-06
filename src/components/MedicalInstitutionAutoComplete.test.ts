import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MedicalInstitutionAutoComplete,
  type MedicalInstitutionAutoCompleteProps
} from './MedicalInstitutionAutoComplete';
import {
  findMedicalInstitutionByCode,
  searchMedicalInstitutions
} from '../lib/master-data/medical_institution_master';

describe('MedicalInstitutionAutoComplete renderToStaticMarkup contracts', () => {
  it('renders default input fields, labels, placeholders, and ARIA combobox semantics', () => {
    const html = renderToStaticMarkup(
      React.createElement(MedicalInstitutionAutoComplete, {
        onChange: () => {}
      })
    );

    // Verify container and grid classes
    assert.ok(html.includes('class="medical-inst-autocomplete"'), 'Should render root container');
    assert.ok(html.includes('class="auto-grid"'), 'Should render grid wrapper');

    // Verify code field and label
    assert.ok(html.includes('医療機関コード (10桁)'), 'Should render code field label');
    assert.ok(html.includes('placeholder="10桁または7桁の医療機関コード"'), 'Should render default code placeholder');

    // Verify name combobox field, ARIA attributes, and label
    assert.ok(html.includes('医療機関名'), 'Should render name field label');
    assert.ok(html.includes('role="combobox"'), 'Combobox role should be present');
    assert.ok(html.includes('aria-expanded="false"'), 'aria-expanded should be false initially');
    assert.ok(html.includes('aria-haspopup="listbox"'), 'aria-haspopup should be listbox');
    assert.ok(html.includes('aria-controls="med-inst-suggestions-list"'), 'aria-controls should target suggestions list');
    assert.ok(html.includes('placeholder="例: 日本中央総合病院"'), 'Should render default name placeholder');
  });

  it('renders supplied valueCode, valueName, and custom placeholders', () => {
    const html = renderToStaticMarkup(
      React.createElement(MedicalInstitutionAutoComplete, {
        valueCode: '1310112345',
        valueName: '日本中央総合病院',
        placeholderCode: 'コードを入力',
        placeholderName: '病院名・クリニック名を入力',
        onChange: () => {}
      })
    );

    assert.ok(html.includes('value="1310112345"'), 'Should render code input value');
    assert.ok(html.includes('value="日本中央総合病院"'), 'Should render name input value');
    assert.ok(html.includes('placeholder="コードを入力"'), 'Should render custom code placeholder');
    assert.ok(html.includes('placeholder="病院名・クリニック名を入力"'), 'Should render custom name placeholder');
  });

  it('integrates accurately with medical institution master lookup functions', () => {
    // Verify master search matches seed records expected by autocomplete
    const foundByCode = findMedicalInstitutionByCode('1310112345');
    assert.ok(foundByCode, 'Should find seed hospital by code');
    assert.equal(foundByCode?.name, '日本中央総合病院');

    const searchResults = searchMedicalInstitutions('サクラ');
    assert.ok(searchResults.length > 0, 'Should find matching clinic by name substring');
    assert.ok(searchResults.some((r) => r.name.includes('サクラ内科クリニック')));
  });
});
