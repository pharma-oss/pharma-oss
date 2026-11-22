'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Download, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatabase } from '@/db/DatabaseProvider';
import type {
  Patient,
  PatientClinicalProfile,
  PatientLabResult,
  PatientLactationStatus,
  PatientOtcSupplement,
  PatientPregnancyStatus,
  Visit,
  VisitElectronicPrescriptionLaboratoryResult
} from '@/db/types';
import { logAuditAction } from '@/lib/audit';
import { AuditLogFailedError } from '@/lib/audit_guard';
import {
  LACTATION_STATUS_LABELS,
  OTC_CATEGORY_LABELS,
  PREGNANCY_STATUS_LABELS,
  evaluateLabResultFreshness,
  extractPatientLabResultsFromElectronicPrescription,
  mergePatientLabResults,
  savePatientClinicalProfile
} from '@/lib/clinical_safety_axes';
import { toLocalDateKey } from '@/lib/local_date';
import { plainCopy } from '@/lib/rxdb_restore';

export interface VitalInsightCardProps {
  targetVisitId?: string | null;
  initialProfile?: PatientClinicalProfile;
  electronicPrescriptionLabResults?: readonly VisitElectronicPrescriptionLaboratoryResult[];
  basisDate?: Date;
}

export const VitalInsightCard = React.memo<VitalInsightCardProps>(function VitalInsightCard({
  targetVisitId,
  initialProfile,
  electronicPrescriptionLabResults = [],
  basisDate
}: VitalInsightCardProps) {
  const db = useDatabase();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string>('');
  const [profile, setProfile] = useState<PatientClinicalProfile | undefined>(initialProfile);
  const [epLabs, setEpLabs] = useState<readonly VisitElectronicPrescriptionLaboratoryResult[]>(
    electronicPrescriptionLabResults
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Manual form drafts
  const [labTestName, setLabTestName] = useState('eGFR');
  const [labValue, setLabValue] = useState('');
  const [labUnit, setLabUnit] = useState('mL/min/1.73m2');
  const [labMeasuredAt, setLabMeasuredAt] = useState(() => toLocalDateKey());
  const [pregnancyStatus, setPregnancyStatus] = useState<PatientPregnancyStatus>(
    initialProfile?.pregnancyStatus || 'unknown'
  );
  const [lactationStatus, setLactationStatus] = useState<PatientLactationStatus>(
    initialProfile?.lactationStatus || 'unknown'
  );
  const [otcName, setOtcName] = useState('');
  const [otcCategory, setOtcCategory] = useState<NonNullable<PatientOtcSupplement['category']>>('otc');

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    async function loadClinicalProfile() {
      if (!db) return;
      try {
        let visitDoc = targetVisitId ? await db.visits.findOne(targetVisitId).exec() : null;
        if (!visitDoc) {
          const processing = await db.visits.find({ selector: { status: 'processing' } }).exec();
          visitDoc = processing
            .slice()
            .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))[0] || null;
        }
        if (cancelled) return;
        if (!visitDoc) {
          setPatientId(null);
          setPatientName('');
          setEpLabs([]);
          return;
        }
        const visitJson = visitDoc.toJSON() as Visit;
        setEpLabs(visitJson.electronicPrescription?.supplementaryInformation?.laboratoryResults || []);
        const pDoc = await db.patients.findOne(visitJson.patientId).exec();
        if (cancelled || !pDoc) return;
        const pJson = pDoc.toJSON() as Patient;
        setPatientId(pJson.patientId);
        setPatientName(pJson.name || '');
        setProfile(pJson.clinicalProfile);
        setPregnancyStatus(pJson.clinicalProfile?.pregnancyStatus || 'unknown');
        setLactationStatus(pJson.clinicalProfile?.lactationStatus || 'unknown');
      } catch (error) {
        console.warn('Failed to load patient clinical profile:', error);
      }
    }
    loadClinicalProfile();
    return () => {
      cancelled = true;
    };
  }, [db, targetVisitId]);

  const persistProfile = async (nextProfile: PatientClinicalProfile, successMessage: string) => {
    if (!db || !patientId || isSaving) return;
    setIsSaving(true);
    try {
      const patientDoc = await db.patients.findOne(patientId).exec();
      if (!patientDoc) {
        toast.error('患者データが見つかりませんでした。');
        return;
      }
      const previousProfile = plainCopy((patientDoc.toJSON() as Patient).clinicalProfile);
      const saved = await savePatientClinicalProfile({
        patientDoc,
        previousProfile,
        nextProfile: { ...nextProfile, updatedAt: new Date().toISOString() },
        logAudit: (detail) => logAuditAction(db, 'prescription_edit', detail, patientId, patientName)
      });
      setProfile(saved);
      setPregnancyStatus(saved.pregnancyStatus || 'unknown');
      setLactationStatus(saved.lactationStatus || 'unknown');
      document.dispatchEvent(new CustomEvent('patient-clinical-profile-updated'));
      toast.success(successMessage);
    } catch (error) {
      console.error('Failed to save clinical profile:', error);
      toast.error(error instanceof AuditLogFailedError ? error.message : '臨床安全情報の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveManualInput = async () => {
    const trimmedVal = labValue.trim();
    const nextLabs: PatientLabResult[] = [...(profile?.labResults || [])];
    if (trimmedVal) {
      const numeric = Number(trimmedVal.normalize('NFKC'));
      if (!Number.isFinite(numeric) || numeric < 0) {
        toast.error('検査値は0以上の数値で入力してください。');
        return;
      }
      nextLabs.unshift({
        testName: labTestName.trim() || 'eGFR',
        value: numeric,
        ...(labUnit.trim() ? { unit: labUnit.trim() } : {}),
        ...(labMeasuredAt ? { measuredAt: labMeasuredAt } : {}),
        source: 'manual'
      });
    }
    const nextOtcs: PatientOtcSupplement[] = [...(profile?.otcSupplements || [])];
    if (otcName.trim()) {
      nextOtcs.push({ name: otcName.trim(), category: otcCategory });
    }
    await persistProfile(
      {
        labResults: mergePatientLabResults(nextLabs, []),
        pregnancyStatus,
        lactationStatus,
        otcSupplements: nextOtcs
      },
      '検査値・妊娠授乳・併用OTC情報を保存しました。安全チェックへ反映します。'
    );
    setLabValue('');
    setOtcName('');
  };

  const handleImportEpLabs = async () => {
    const extracted = extractPatientLabResultsFromElectronicPrescription(epLabs);
    if (extracted.length === 0) {
      toast.info('取り込み可能な数値検査値が電子処方箋に含まれていません。');
      return;
    }
    await persistProfile(
      {
        ...(profile || {}),
        labResults: mergePatientLabResults(profile?.labResults, extracted)
      },
      `電子処方箋から検査値 ${extracted.length}件を取り込みました。`
    );
  };

  const handleRemoveOtc = async (index: number) => {
    const nextOtcs = (profile?.otcSupplements || []).filter((_, idx) => idx !== index);
    await persistProfile(
      { ...(profile || {}), otcSupplements: nextOtcs },
      '併用OTC・サプリメントを削除しました。'
    );
  };

  const labs = profile?.labResults || [];
  const otcs = profile?.otcSupplements || [];
  const hasAnyProfileData = labs.length > 0
    || otcs.length > 0
    || (profile?.pregnancyStatus && profile.pregnancyStatus !== 'unknown')
    || (profile?.lactationStatus && profile.lactationStatus !== 'unknown');
  const importableEpLabs = extractPatientLabResultsFromElectronicPrescription(epLabs);

  return (
    <div className="insight-card vital" data-testid="vital-insight-card">
      <div className="insight-header vital-header">
        <div className="vital-title-group">
          <Activity size={18} className="icon-vital" aria-hidden="true" />
          <h3>バイタル・臨床検査値</h3>
        </div>
        {db && patientId && (
          <button
            type="button"
            className="btn-secondary vital-edit-toggle"
            data-testid="vital-edit-toggle"
            onClick={() => setIsEditing((prev) => !prev)}
          >
            <Plus size={12} aria-hidden="true" />
            <span>{isEditing ? '閉じる' : '登録・編集'}</span>
          </button>
        )}
      </div>

      {!hasAnyProfileData ? (
        <p className="insight-empty-text">
          最新の検査値（eGFR / Blood Pressure等）は未登録です
        </p>
      ) : (
        <div className="vital-summary-list">
          {labs.slice(0, 4).map((lab, idx) => {
            const freshness = evaluateLabResultFreshness(lab.measuredAt, basisDate);
            return (
              <div key={`${lab.testName}-${lab.measuredAt || idx}-${idx}`} className="vital-lab-row">
                <div className="vital-lab-main">
                  <strong>{lab.testName}</strong>
                  <span>{lab.value}{lab.unit ? ` ${lab.unit}` : ''}</span>
                  {lab.measuredAt && <small>{lab.measuredAt.slice(0, 10)}</small>}
                </div>
                <span className={`vital-freshness-badge is-${freshness.status}`}>
                  {freshness.label}
                </span>
              </div>
            );
          })}

          {((profile?.pregnancyStatus && profile.pregnancyStatus !== 'unknown')
            || (profile?.lactationStatus && profile.lactationStatus !== 'unknown')) && (
            <div className="vital-status-chips">
              {profile?.pregnancyStatus && profile.pregnancyStatus !== 'unknown' && (
                <span className={`vital-chip ${profile.pregnancyStatus === 'pregnant' || profile.pregnancyStatus === 'possibly_pregnant' ? 'is-alert' : ''}`}>
                  妊娠: {PREGNANCY_STATUS_LABELS[profile.pregnancyStatus]}
                </span>
              )}
              {profile?.lactationStatus && profile.lactationStatus !== 'unknown' && (
                <span className={`vital-chip ${profile.lactationStatus === 'lactating' ? 'is-alert' : ''}`}>
                  授乳: {LACTATION_STATUS_LABELS[profile.lactationStatus]}
                </span>
              )}
            </div>
          )}

          {otcs.length > 0 && (
            <div className="vital-otc-list">
              <span className="vital-sub-label">併用 OTC・サプリ:</span>
              {otcs.map((otc, idx) => (
                <span key={`${otc.name}-${idx}`} className="vital-otc-chip">
                  <span>{otc.name}</span>
                  {db && patientId && (
                    <button
                      type="button"
                      className="vital-otc-remove"
                      onClick={() => handleRemoveOtc(idx)}
                      disabled={isSaving}
                      aria-label={`${otc.name}を削除`}
                    >
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {importableEpLabs.length > 0 && (
        <button
          type="button"
          className="btn-secondary vital-ep-import-btn"
          data-testid="vital-ep-lab-import-btn"
          onClick={handleImportEpLabs}
          disabled={isSaving || !db || !patientId}
        >
          <Download size={13} aria-hidden="true" />
          <span>電子処方箋の検査値を取り込む ({importableEpLabs.length}件)</span>
        </button>
      )}

      {isEditing && (
        <div className="vital-editor-form" data-testid="vital-editor-form">
          <div className="vital-form-grid">
            <label className="vital-field">
              <span>検査項目</span>
              <select
                value={labTestName}
                onChange={(e) => {
                  const val = e.target.value;
                  setLabTestName(val);
                  setLabUnit(val === 'eGFR' ? 'mL/min/1.73m2' : val === 'Cr' ? 'mg/dL' : val === 'CrCl' ? 'mL/min' : '');
                }}
              >
                <option value="eGFR">eGFR</option>
                <option value="Cr">Cr (血清クレアチニン)</option>
                <option value="CrCl">CrCl</option>
                <option value="K">K (カリウム)</option>
                <option value="HbA1c">HbA1c</option>
              </select>
            </label>
            <label className="vital-field">
              <span>値 ({labUnit || '単位'})</span>
              <input
                type="number"
                step="0.1"
                value={labValue}
                onChange={(e) => setLabValue(e.target.value)}
                placeholder="例: 42"
              />
            </label>
            <label className="vital-field">
              <span>測定日</span>
              <input
                type="date"
                value={labMeasuredAt}
                onChange={(e) => setLabMeasuredAt(e.target.value)}
              />
            </label>
          </div>
          <div className="vital-form-grid-2">
            <label className="vital-field">
              <span>妊娠状況</span>
              <select value={pregnancyStatus} onChange={(e) => setPregnancyStatus(e.target.value as PatientPregnancyStatus)}>
                {(Object.keys(PREGNANCY_STATUS_LABELS) as PatientPregnancyStatus[]).map((k) => (
                  <option key={k} value={k}>{PREGNANCY_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="vital-field">
              <span>授乳状況</span>
              <select value={lactationStatus} onChange={(e) => setLactationStatus(e.target.value as PatientLactationStatus)}>
                {(Object.keys(LACTATION_STATUS_LABELS) as PatientLactationStatus[]).map((k) => (
                  <option key={k} value={k}>{LACTATION_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="vital-form-grid-2">
            <label className="vital-field">
              <span>併用 OTC・サプリ名</span>
              <input
                type="text"
                value={otcName}
                onChange={(e) => setOtcName(e.target.value)}
                placeholder="例: ロキソニンS / 青汁 / カルシウム"
                maxLength={120}
              />
            </label>
            <label className="vital-field">
              <span>区分</span>
              <select
                value={otcCategory}
                onChange={(e) => setOtcCategory(e.target.value as NonNullable<PatientOtcSupplement['category']>)}
              >
                {(Object.keys(OTC_CATEGORY_LABELS) as Array<NonNullable<PatientOtcSupplement['category']>>).map((k) => (
                  <option key={k} value={k}>{OTC_CATEGORY_LABELS[k]}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn-primary vital-save-btn"
            onClick={handleSaveManualInput}
            disabled={isSaving}
          >
            <Save size={14} aria-hidden="true" />
            <span>{isSaving ? '保存中...' : '保存して安全チェックへ反映'}</span>
          </button>
        </div>
      )}

      <style jsx>{`
        .vital-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
        }
        .vital-title-group {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .icon-vital {
          color: var(--primary);
        }
        .vital-edit-toggle {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          font-size: var(--fs-2xs);
          font-weight: 700;
        }
        .vital-summary-list {
          display: grid;
          gap: var(--space-2);
        }
        .vital-lab-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          flex-wrap: wrap;
          padding: var(--space-1-5) var(--space-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-base);
        }
        .vital-lab-main {
          display: inline-flex;
          align-items: baseline;
          gap: var(--space-1-5);
          font-size: var(--fs-xs);
        }
        .vital-lab-main small {
          font-size: var(--fs-2xs);
          color: var(--text-muted);
        }
        .vital-freshness-badge {
          padding: var(--space-0-5) var(--space-1-5);
          border-radius: 999px;
          font-size: var(--fs-2xs);
          font-weight: 700;
        }
        .vital-freshness-badge.is-fresh {
          background: #dcfce7;
          color: #166534;
        }
        .vital-freshness-badge.is-stale,
        .vital-freshness-badge.is-unknown_date {
          background: #ffedd5;
          color: #9a3412;
        }
        .vital-status-chips,
        .vital-otc-list {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-1-5);
        }
        .vital-sub-label {
          font-size: var(--fs-2xs);
          font-weight: 700;
          color: var(--text-muted);
        }
        .vital-chip,
        .vital-otc-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-0-5) var(--space-2);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg-subtle);
          font-size: var(--fs-2xs);
          font-weight: 700;
        }
        .vital-chip.is-alert {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #991b1b;
        }
        .vital-otc-remove {
          border: 0;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          display: inline-flex;
        }
        .vital-ep-import-btn {
          margin-top: var(--space-2);
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1-5);
          font-size: var(--fs-xs);
          font-weight: 700;
          min-height: 34px;
        }
        .vital-editor-form {
          margin-top: var(--space-2-5);
          padding-top: var(--space-2-5);
          border-top: 1px dashed var(--border);
          display: grid;
          gap: var(--space-2);
        }
        .vital-form-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--space-1-5);
        }
        .vital-form-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-1-5);
        }
        .vital-field {
          display: grid;
          gap: var(--space-0-5);
          min-width: 0;
        }
        .vital-field span {
          font-size: var(--fs-2xs);
          font-weight: 700;
          color: var(--text-muted);
        }
        .vital-field input,
        .vital-field select {
          width: 100%;
          min-width: 0;
          padding: var(--space-1) var(--space-1-5);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-main);
          font-size: var(--fs-xs);
          font-family: inherit;
        }
        .vital-save-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1-5);
          min-height: 34px;
          font-size: var(--fs-xs);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
});
