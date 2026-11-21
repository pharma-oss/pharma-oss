import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UNIMPLEMENTED_BADGE_LABEL,
  isFeatureImplemented,
  labelWithAvailability
} from '@/lib/feature_availability';
import { getMynaReaderButtonView } from '@/lib/myna_read_display';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import {
  ElectronicPrescriptionUnimplementedPanel,
  ReceptionElectronicEntryCard,
  canOpenElectronicPrescriptionEntry,
  formatIntakeToolsToggleLabel
} from './components/ReceptionElectronicEntryCard';
import {
  ReceptionEligibilityToolRow,
  ReceptionPatientSearchBar
} from './components/ReceptionPatientSearchBar';

// 電子処方箋は接続モジュールが無く未実装。
// 受付画面の各UI部品を renderToStaticMarkup で実描画し、未実装表示と押下ブロックを検証する。
describe('electronic prescription is shown as not implemented on the reception page', () => {
  it('reads the availability flag from the shared registry', () => {
    assert.equal(isFeatureImplemented('electronicPrescription'), false);
    assert.equal(isFeatureImplemented('onlineEligibility'), false);
    assert.equal(UNIMPLEMENTED_BADGE_LABEL, '未実装');
  });

  it('renders the "電子処方箋で受付" card as disabled with 未実装 badge and blocks opening while unimplemented', () => {
    assert.equal(canOpenElectronicPrescriptionEntry(false), false);
    assert.equal(canOpenElectronicPrescriptionEntry(true), true);

    const disabledHtml = renderToStaticMarkup(
      React.createElement(ReceptionElectronicEntryCard, {
        onOpen: () => {}
      })
    );
    const cardTag = findOpeningTag(disabledHtml, 'data-testid="electronic-prescription-entry"', 'button');
    assert.ok(cardTag.includes('disabled=""'), 'the card must be disabled');
    assert.ok(cardTag.includes('aria-disabled="true"'), 'the card must expose aria-disabled');
    assert.ok(disabledHtml.includes('data-testid="electronic-prescription-entry-badge"'), 'the card must show the 未実装 badge');
    assert.ok(disabledHtml.includes(UNIMPLEMENTED_BADGE_LABEL));

    const enabledHtml = renderToStaticMarkup(
      React.createElement(ReceptionElectronicEntryCard, {
        implemented: true,
        onOpen: () => {}
      })
    );
    const enabledCardTag = findOpeningTag(enabledHtml, 'data-testid="electronic-prescription-entry"', 'button');
    assert.equal(enabledCardTag.includes('disabled=""'), false);
    assert.equal(enabledHtml.includes('electronic-prescription-entry-badge'), false);
  });

  it('replaces the fetch form with a disabled button and a 未実装 badge while it is not implemented', () => {
    const html = renderToStaticMarkup(
      React.createElement(ElectronicPrescriptionUnimplementedPanel, {})
    );
    assert.ok(html.includes('data-testid="electronic-prescription-unimplemented-badge"'));
    assert.ok(html.includes(UNIMPLEMENTED_BADGE_LABEL));
    const fetchBtnTag = findOpeningTag(html, 'data-testid="electronic-prescription-fetch"', 'button');
    assert.ok(fetchBtnTag.includes('disabled=""'), 'the fetch button must be disabled');
    assert.ok(fetchBtnTag.includes('aria-disabled="true"'));
    assert.ok(html.includes(labelWithAvailability('electronicPrescription', '取得して確認')));
    // 未実装の間は、引換番号・被保険者番号の入力欄や「処方入力へ反映」を出さない
    assert.equal(html.includes('electronicPrescriptionKey'), false);
    assert.equal(html.includes('electronic-prescription-apply'), false);
  });

  it('turns the Myna read button on only when its connection is configured, and keeps online eligibility off', () => {
    const unavailableMyna = getMynaReaderButtonView({ status: 'ready', available: false, reason: '未設定' }, 'マイナ読取');
    const availableMyna = getMynaReaderButtonView({ status: 'ready', available: true }, 'マイナ読取');

    const unavailableSearchHtml = renderToStaticMarkup(
      React.createElement(ReceptionPatientSearchBar, {
        patientSearchQuery: '',
        onPatientSearchQueryChange: () => {},
        hasImage: false,
        isReadingMyna: false,
        mynaReadButton: unavailableMyna,
        mynaMessage: '',
        hasDb: true,
        onMynaRead: () => {},
        onOpenPatientRegistration: () => {}
      })
    );
    const unavailableMynaTag = findOpeningTag(unavailableSearchHtml, 'data-testid="myna-read-button"', 'button');
    assert.ok(unavailableMynaTag.includes('disabled=""'), 'Myna button must be disabled when unconfigured');

    const availableSearchHtml = renderToStaticMarkup(
      React.createElement(ReceptionPatientSearchBar, {
        patientSearchQuery: '',
        onPatientSearchQueryChange: () => {},
        hasImage: false,
        isReadingMyna: false,
        mynaReadButton: availableMyna,
        mynaMessage: '',
        hasDb: true,
        onMynaRead: () => {},
        onOpenPatientRegistration: () => {}
      })
    );
    const availableMynaTag = findOpeningTag(availableSearchHtml, 'data-testid="myna-read-button"', 'button');
    assert.equal(availableMynaTag.includes('disabled=""'), false, 'Myna button must be enabled when configured');

    const readingSearchHtml = renderToStaticMarkup(
      React.createElement(ReceptionPatientSearchBar, {
        patientSearchQuery: '',
        onPatientSearchQueryChange: () => {},
        hasImage: false,
        isReadingMyna: true,
        mynaReadButton: availableMyna,
        mynaMessage: '',
        hasDb: true,
        onMynaRead: () => {},
        onOpenPatientRegistration: () => {}
      })
    );
    const readingMynaTag = findOpeningTag(readingSearchHtml, 'data-testid="myna-read-button"', 'button');
    assert.ok(readingMynaTag.includes('disabled=""'), 'Myna button must be disabled while reading');

    const eligibilityHtml = renderToStaticMarkup(
      React.createElement(ReceptionEligibilityToolRow, {
        insuranceNumber: '06139999',
        eligibilityStatus: 'unchecked',
        eligibilityMessage: '',
        eligibilityResult: null,
        mynaReaderState: { status: 'ready', available: false, reason: '未設定' },
        mynaReadButton: unavailableMyna,
        onEligibilityCheck: () => {}
      })
    );
    const eligibilityTag = findOpeningTag(eligibilityHtml, 'data-testid="online-eligibility-button"', 'button');
    assert.ok(eligibilityTag.includes('disabled=""'), 'the eligibility button must be disabled while unimplemented');
    assert.ok(eligibilityHtml.includes(labelWithAvailability('onlineEligibility', 'オンライン資格確認')));
    assert.ok(eligibilityHtml.includes('data-testid="reception-tool-unimplemented-note"'));
  });

  it('does not tell the user the QR intake also covers electronic prescriptions while unimplemented', () => {
    assert.equal(formatIntakeToolsToggleLabel(false), '処方箋QRから取り込む');
    assert.equal(formatIntakeToolsToggleLabel(true), 'QR・電子処方箋から取り込む');
  });
});
