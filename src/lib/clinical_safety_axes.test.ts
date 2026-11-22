import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PatientClinicalProfile } from '../db/types.ts';
import {
  CLINICAL_PROFILE_AUDIT_FAILED_MESSAGE,
  LAB_RESULT_STALENESS_DAYS,
  buildClinicalSafetyWarningInsightItems,
  evaluateClinicalSafetyAxes,
  evaluateLabResultFreshness,
  extractPatientLabResultsFromElectronicPrescription,
  mergePatientLabResults,
  savePatientClinicalProfile
} from './clinical_safety_axes.ts';
import { AuditLogFailedError } from './audit_guard.ts';
import { VitalInsightCard } from '../app/emr/components/VitalInsightCard';

describe('F-3: clinical safety axes (renal, pregnancy/lactation, OTC) & 90-day lab staleness', () => {
  const basisDate = new Date(2026, 10, 22, 9, 0, 0); // 2026-11-22

  it('classifies lab freshness accurately with 90-day staleness threshold and unknown date', () => {
    assert.equal(LAB_RESULT_STALENESS_DAYS, 90);
    const fresh = evaluateLabResultFreshness('2026-10-01', basisDate);
    assert.equal(fresh.status, 'fresh');
    assert.equal(fresh.ageDays, 52);

    const exactBoundary = evaluateLabResultFreshness('2026-08-24', basisDate);
    assert.equal(exactBoundary.status, 'fresh');
    assert.equal(exactBoundary.ageDays, 90);

    const stale = evaluateLabResultFreshness('2026-08-23', basisDate);
    assert.equal(stale.status, 'stale');
    assert.equal(stale.ageDays, 91);
    assert.match(stale.label, /参考値（90日超過・要再確認）/);

    const unknown = evaluateLabResultFreshness('', basisDate);
    assert.equal(unknown.status, 'unknown_date');
    assert.equal(unknown.ageDays, null);
    assert.match(unknown.label, /測定日不明/);
  });

  it('extracts numeric electronic prescription lab results without fabricating non-numeric entries and merges latest-first', () => {
    const extracted = extractPatientLabResultsFromElectronicPrescription([
      { testName: 'eGFR', value: '38.5', unit: 'mL/min/1.73m2', measuredAt: '2026-11-10T09:00:00+09:00' },
      { testName: '尿蛋白', value: '陰性' }, // non-numeric -> skipped (Rule 4)
      { testName: 'Cr', value: '1.6', unit: 'mg/dL', measuredAt: '2026/11/10' }
    ]);
    assert.equal(extracted.length, 2);
    assert.equal(extracted[0].testName, 'eGFR');
    assert.equal(extracted[0].value, 38.5);
    assert.equal(extracted[0].measuredAt, '2026-11-10');
    assert.equal(extracted[0].source, 'electronic_prescription');

    const merged = mergePatientLabResults(
      [{ testName: 'eGFR', value: 45, unit: 'mL/min/1.73m2', measuredAt: '2026-06-01', source: 'manual' }],
      extracted
    );
    assert.equal(merged.length, 3);
    assert.equal(merged[0].measuredAt, '2026-11-10');
  });

  it('evaluates renal safety with danger/warning thresholds, marks >90d labs as stale reference, and reports unevaluable when missing', () => {
    // 1. Missing lab on renally cleared drug -> explicit 判定不能 (Rule 4)
    const missingWarnings = evaluateClinicalSafetyAxes({
      drugs: [{ drugName: 'メトホルミン塩酸塩錠250mg' }],
      patient: {},
      basisDate
    });
    assert.equal(missingWarnings.length, 1);
    assert.equal(missingWarnings[0].axis, 'renal');
    assert.equal(missingWarnings[0].isUnevaluable, true);
    assert.match(missingWarnings[0].message, /判定不能/);

    // 2. Fresh eGFR < 30 -> danger without stale marker
    const dangerWarnings = evaluateClinicalSafetyAxes({
      drugs: [{ drugName: 'メトホルミン塩酸塩錠250mg' }],
      patient: {
        clinicalProfile: {
          labResults: [{ testName: 'eGFR', value: 25, unit: 'mL/min/1.73m2', measuredAt: '2026-11-01', source: 'manual' }]
        }
      },
      basisDate
    });
    assert.equal(dangerWarnings.length, 1);
    assert.equal(dangerWarnings[0].severity, 'danger');
    assert.equal(dangerWarnings[0].isStaleReference, false);
    assert.ok(!dangerWarnings[0].message.includes('90日超過'));

    // 3. Stale eGFR (>90d) -> annotates 参考値（90日超過・要再確認）
    const staleWarnings = evaluateClinicalSafetyAxes({
      drugs: [{ drugName: 'ロキソプロフェンNa錠60mg' }],
      patient: {
        clinicalProfile: {
          labResults: [{ testName: 'eGFR', value: 48, unit: 'mL/min/1.73m2', measuredAt: '2026-07-01', source: 'manual' }]
        }
      },
      basisDate
    });
    assert.equal(staleWarnings.length, 1);
    assert.equal(staleWarnings[0].severity, 'warning');
    assert.equal(staleWarnings[0].isStaleReference, true);
    assert.match(staleWarnings[0].message, /参考値（90日超過・要再確認）/);

    // 4. Electronic prescription lab results feed directly into safety evaluation
    const epLabWarnings = evaluateClinicalSafetyAxes({
      drugs: [{ drugName: 'メトホルミン塩酸塩錠250mg' }],
      patient: {},
      electronicPrescriptionLabResults: [
        { testName: 'eGFR', value: '28', unit: 'mL/min/1.73m2', measuredAt: '2026-11-18' }
      ],
      basisDate
    });
    assert.equal(epLabWarnings.length, 1);
    assert.equal(epLabWarnings[0].severity, 'danger');
  });

  it('evaluates pregnancy, lactation, and concomitant OTC/supplement interactions', () => {
    const warnings = evaluateClinicalSafetyAxes({
      drugs: [
        { drugName: 'カンデサルタン錠8mg' },
        { drugName: 'コデインリン酸塩散1%' },
        { drugName: 'ワルファリンカリウム錠1mg' },
        { drugName: 'レボフロキサシン錠500mg' }
      ],
      patient: {
        clinicalProfile: {
          labResults: [{ testName: 'eGFR', value: 75, measuredAt: '2026-11-15', source: 'manual' }],
          pregnancyStatus: 'pregnant',
          lactationStatus: 'lactating',
          otcSupplements: [
            { name: '青汁（ビタミンK含有）', category: 'supplement' },
            { name: 'カルシウム・マグネシウム錠', category: 'supplement' }
          ]
        }
      },
      basisDate
    });

    assert.ok(warnings.some((w) => w.axis === 'pregnancy' && w.severity === 'danger' && w.drug.includes('カンデサルタン')));
    assert.ok(warnings.some((w) => w.axis === 'lactation' && w.severity === 'warning' && w.drug.includes('コデイン')));
    assert.ok(warnings.some((w) => w.axis === 'otc' && w.severity === 'danger' && w.drug.includes('ワルファリン')));
    assert.ok(warnings.some((w) => w.axis === 'otc' && w.severity === 'warning' && w.drug.includes('レボフロキサシン')));

    const insightItems = buildClinicalSafetyWarningInsightItems({
      drugs: [{ drugName: 'カンデサルタン錠8mg' }],
      patient: { clinicalProfile: { pregnancyStatus: 'pregnant' } },
      basisDate
    });
    assert.equal(insightItems.length, 1);
    assert.equal(insightItems[0].type, 'usage');
    assert.equal(insightItems[0].severity, 'danger');
  });

  it('savePatientClinicalProfile logs audit and rolls back on audit failure', async () => {
    let stored: unknown = { pregnancyStatus: 'not_pregnant' };
    const doc = {
      patch: async (values: Record<string, unknown>) => { stored = values.clinicalProfile; },
      incrementalPatch: async (values: Record<string, unknown>) => { stored = values.clinicalProfile; }
    };
    const audited: string[] = [];
    await savePatientClinicalProfile({
      patientDoc: doc,
      previousProfile: stored as PatientClinicalProfile,
      nextProfile: {
        pregnancyStatus: 'pregnant',
        labResults: [{ testName: 'eGFR', value: 42, measuredAt: '2026-11-20', source: 'manual' }]
      },
      logAudit: async (detail) => {
        audited.push(detail);
        return true;
      }
    });
    assert.equal(audited.length, 1);
    assert.match(audited[0], /検査値 1件 \/ 妊娠=妊娠中/);

    const beforeFail = stored;
    await assert.rejects(
      savePatientClinicalProfile({
        patientDoc: doc,
        previousProfile: beforeFail as PatientClinicalProfile,
        nextProfile: { pregnancyStatus: 'unknown' },
        logAudit: async () => false
      }),
      (err: unknown) => err instanceof AuditLogFailedError && err.message === CLINICAL_PROFILE_AUDIT_FAILED_MESSAGE
    );
    assert.deepEqual(stored, beforeFail);
  });

  it('VitalInsightCard renders empty placeholder, stale >90d badge, pregnancy/OTC chips, and e-prescription lab import button', () => {
    const emptyHtml = renderToStaticMarkup(React.createElement(VitalInsightCard));
    assert.ok(emptyHtml.includes('バイタル・臨床検査値'));
    assert.ok(emptyHtml.includes('最新の検査値（eGFR / Blood Pressure等）は未登録です'));

    const populatedHtml = renderToStaticMarkup(
      React.createElement(VitalInsightCard, {
        initialProfile: {
          labResults: [
            { testName: 'eGFR', value: 41, unit: 'mL/min/1.73m2', measuredAt: '2026-07-01', source: 'manual' }
          ],
          pregnancyStatus: 'pregnant',
          lactationStatus: 'lactating',
          otcSupplements: [{ name: 'セントジョーンズワート', category: 'supplement' }]
        },
        electronicPrescriptionLabResults: [
          { testName: 'eGFR', value: '39', unit: 'mL/min/1.73m2', measuredAt: '2026-11-20' }
        ],
        basisDate
      })
    );
    assert.ok(populatedHtml.includes('eGFR'));
    assert.ok(populatedHtml.includes('41 mL/min/1.73m2'));
    assert.ok(populatedHtml.includes('参考値（90日超過・要再確認）'));
    assert.ok(populatedHtml.includes('妊娠: 妊娠中'));
    assert.ok(populatedHtml.includes('授乳: 授乳中'));
    assert.ok(populatedHtml.includes('セントジョーンズワート'));
    assert.ok(populatedHtml.includes('電子処方箋の検査値を取り込む (1件)'));
  });
});
