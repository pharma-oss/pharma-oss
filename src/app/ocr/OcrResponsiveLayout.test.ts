import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { groupPrescriptionsByRp } from './types';
import {
  appendDrugToRpGroup,
  buildAppliedElectronicPrescriptionState,
  buildReceptionPrescriptionItemsPayload,
  calculatePrescriptionMetrics,
  createEmptyPrescription,
  formatPatientMergeOperationLabel,
  isElectronicPrescriptionInstitutionMismatch,
  removePrescriptionItemOrReset,
  resolveExistingElectronicPrescriptionLinks,
  togglePrescriptionReceiptRemarkAt,
  updatePrescriptionFieldAt,
  validateReceptionPrescriptionItems
} from './helpers';

describe('OCR Responsive Layout and Action Bar Contracts (Track I-6)', () => {
  it('verifies that ocr/page.tsx imports ocr.css and defines responsive rules preventing 375px action button overflow', () => {
    const pagePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'page.tsx');
    const cssPath = path.join(process.cwd(), 'src', 'app', 'ocr', 'ocr.css');
    const pageContent = fs.readFileSync(pagePath, 'utf-8');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(pageContent.includes("import './ocr.css';"), 'ocr/page.tsx must import ./ocr.css');
    assert.ok(pageContent.includes('btn-label-main'), 'Missing btn-label-main class in ocr/page.tsx');
    assert.ok(pageContent.includes('btn-label-sub'), 'Missing btn-label-sub class in ocr/page.tsx');

    // Must have max-width: 640px media query for form-actions
    assert.ok(cssContent.includes('@media (max-width: 640px)'), 'Missing 640px media query in ocr/ocr.css');
    assert.ok(cssContent.includes('grid-template-columns: 0.9fr 1.6fr;'), 'Missing responsive button grid in form-actions');
    assert.ok(cssContent.includes('.form-actions .btn-label-sub'), 'Missing sublabel visibility handling');
    assert.ok(cssContent.includes('.btn-label-main'), 'Missing btn-label-main class');
  });

  it('verifies that ocr/ocr.css hides visual-column in manual-mode on smaller screens', () => {
    const pagePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'page.tsx');
    const cssPath = path.join(process.cwd(), 'src', 'app', 'ocr', 'ocr.css');
    const pageContent = fs.readFileSync(pagePath, 'utf-8');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(pageContent.includes('side-by-side-container'), 'ocr/page.tsx must render side-by-side-container');
    assert.ok(
      cssContent.includes('.side-by-side-container.manual-mode .visual-column'),
      'Must hide visual-column in manual mode on narrow screens'
    );
  });

  it('verifies that PrescriptionGroupEditor.tsx wraps usage selector and handles 480px screens', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'components', 'PrescriptionGroupEditor.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('flex-wrap: wrap;'), 'usage-selector-wrap must allow flex-wrap');
    assert.ok(content.includes('@media (max-width: 480px)'), 'Missing 480px media query in PrescriptionGroupEditor');
    assert.ok(content.includes('.btn-select-usage'), 'Missing .btn-select-usage class');
  });

  it('verifies that PrescriptionRow.tsx defines 640px responsive rule for agent-override and flags', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'components', 'PrescriptionRow.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('@media (max-width: 640px)'), 'Missing 640px media query in PrescriptionRow');
    assert.ok(content.includes('.agent-override-chip'), 'Missing agent-override-chip responsive handling');
  });

  it('calculates prescription metrics, validates items, and builds save payload via extracted pure helpers', () => {
    const initial = [
      createEmptyPrescription('rp_1', {
        id: 'item_1',
        drugCode: '620001234',
        drugName: 'アムロジピン錠5mg',
        amount: '1',
        usage: '1日1回朝食後',
        days: '14',
        dispensedDrug: '変更なし',
        isIppoka: true
      })
    ];
    const withSecond = appendDrugToRpGroup(initial, 'rp_1');
    assert.equal(withSecond.length, 2);
    assert.equal(withSecond[1].usage, '1日1回朝食後');
    assert.equal(withSecond[1].days, '14');

    const groups = groupPrescriptionsByRp(withSecond);
    const metrics = calculatePrescriptionMetrics(withSecond, groups);
    assert.equal(metrics.rpCount, 1);
    assert.equal(metrics.drugCount, 2);
    assert.equal(metrics.missingDrugCount, 1);
    assert.equal(metrics.specialPrepCount, 1);

    assert.equal(
      validateReceptionPrescriptionItems(withSecond),
      '処方薬2: 薬品名を選択してください。'
    );

    const updated = updatePrescriptionFieldAt(withSecond, withSecond[1].id, 'usage', '1日2回朝夕食後', 1);
    assert.equal(updated[0].usage, '1日2回朝夕食後');
    assert.equal(updated[1].usage, '1日2回朝夕食後');

    const withRemark = togglePrescriptionReceiptRemarkAt(
      [{ ...initial[0], receiptRemark: '残薬調整' }],
      'item_1',
      false,
      0
    );
    assert.equal(withRemark[0].showReceiptRemark, false);
    assert.equal(withRemark[0].receiptRemark, '');

    const resetList = removePrescriptionItemOrReset(initial, 'item_1');
    assert.equal(resetList.length, 1);
    assert.equal(resetList[0].rpId, 'rp_initial');

    const payload = buildReceptionPrescriptionItemsPayload(initial, 'v_test', () => 'fixed');
    assert.equal(payload.length, 1);
    assert.equal(payload[0].itemId, 'item_fixed');
    assert.equal(payload[0].visitId, 'v_test');
    assert.equal(payload[0].rpNumber, 1);
    assert.equal(payload[0].dispensedDrug, 'アムロジピン錠5mg');
    assert.equal(payload[0].amount, 1);
    assert.equal(payload[0].days, 14);
  });

  it('evaluates electronic prescription institution mismatch and linked state transitions', () => {
    assert.equal(
      isElectronicPrescriptionInstitutionMismatch(
        { institutionCode: '1310001', institutionName: '東京病院' },
        { institutionCode: '1310001', institutionName: '東京病院（旧）' }
      ),
      false
    );
    assert.equal(
      isElectronicPrescriptionInstitutionMismatch(
        { institutionCode: '1310001', institutionName: '東京病院' },
        { institutionCode: '1310002', institutionName: '東京病院' }
      ),
      true
    );

    const firstState = buildAppliedElectronicPrescriptionState({
      applied: null,
      existingLinks: [],
      prescription: {
        prescriptionId: 'ep_1',
        documentKind: 'electronic_prescription',
        prescriptionDate: '2026-10-01',
        validUntil: '2026-10-04',
        patient: { name: '山田 太郎', birthDate: '1980-01-01' },
        provider: { institutionName: '東京病院' },
        items: [],
        signatureVerification: { status: 'valid' }
      },
      duplicateCheckStatus: 'passed',
      integrityHash: 'hash_1',
      paperOriginalConfirmed: false,
      appliedAt: '2026-10-01T09:00:00.000Z'
    });
    assert.equal(firstState.linkedPrescriptions?.length, 1);
    assert.equal(firstState.duplicateCheckStatus, 'passed');

    const existingLinks = resolveExistingElectronicPrescriptionLinks(firstState);
    const secondState = buildAppliedElectronicPrescriptionState({
      applied: firstState,
      existingLinks,
      prescription: {
        prescriptionId: 'ep_2',
        documentKind: 'prescription_information',
        prescriptionDate: '2026-10-01',
        validUntil: '2026-10-03',
        patient: { name: '山田 太郎', birthDate: '1980-01-01' },
        provider: { institutionName: '東京病院' },
        items: [],
        signatureVerification: { status: 'not_applicable' }
      },
      duplicateCheckStatus: 'warning',
      integrityHash: 'hash_2',
      paperOriginalConfirmed: true,
      appliedAt: '2026-10-01T09:05:00.000Z'
    });
    assert.equal(secondState.linkedPrescriptions?.length, 2);
    assert.equal(secondState.duplicateCheckStatus, 'warning');
    assert.equal(secondState.validUntil, '2026-10-03');
    assert.equal(secondState.paperOriginalConfirmed, true);

    assert.equal(
      formatPatientMergeOperationLabel({
        type: 'patch_visit_patient',
        visitId: 'v_1',
        beforePatientId: 'p_old',
        afterPatientId: 'p_new'
      }),
      '受付を付け替え: v_1 -> p_new'
    );
  });
});
