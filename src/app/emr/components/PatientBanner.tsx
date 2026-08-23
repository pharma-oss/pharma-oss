import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CreditCard, Activity, CheckCircle2, Loader2, Camera, Upload, ClipboardList, History } from 'lucide-react';
import { toast } from 'sonner';
import { useDatabase } from '@/db/DatabaseProvider';
import { getCurrentUser } from '@/lib/audit';
import type { Alert, Visit, PublicInsurance, InsuranceEligibilityStatus, VisitInitialQuestionnaire, VisitMynaClinicalImport } from '@/db/types';
import { formatPatientAlertLabel, isActivePatientAlert } from '@/lib/patient_alerts';
import {
  toDateInputValue,
  compressQuestionnaireImage
} from '@/lib/emr_helpers';
import { extractInitialQuestionnaireOcrDraft } from '@/lib/initial_questionnaire_ocr';
import {
  type MynaReadInsuranceDisplay,
  formatPatientInsuranceInfo,
  buildMynaReadInsuranceDisplay
} from '@/lib/myna_read_display';
import type { MynaCardReaderResult } from '@/lib/myna_card_reader';

export interface PatientBannerProps {
  patientAlerts: Alert[];
  targetVisitId: string | null;
  onOpenPicking: () => void;
}

export const PatientBanner = React.memo(function PatientBanner({
  patientAlerts,
  targetVisitId,
  onOpenPicking
}: PatientBannerProps) {
  const db = useDatabase();
  const [patientData, setPatientData] = useState<any>(null);

  useEffect(() => {
    async function fetchPatientData() {
      if (!db) return;
      try {
        const visit = targetVisitId
          ? await db.visits.findOne(targetVisitId).exec()
          : (await db.visits.find({ selector: { status: 'processing' } }).exec())
              .slice()
              .sort((a: any, b: any) => (b.issueDate || '').localeCompare(a.issueDate || ''))[0];
        if (visit) {
          const patients = await db.patients.find({ selector: { patientId: visit.patientId } }).exec();
          if (patients.length > 0) {
            setPatientData(patients[0].toJSON());
          } else {
            setPatientData(null);
          }
        } else {
          setPatientData(null);
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchPatientData();
  }, [db, targetVisitId]);

  const calcAge = useMemo(() => {
    if (!patientData || !patientData.birthDate) return null;
    const birth = new Date(patientData.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
  }, [patientData]);

  const calcBirthDate = patientData?.birthDate ? patientData.birthDate.replace(/-/g, '/') + '生' : '生年月日未登録';
  const patientName = patientData?.name || '患者未選択';
  const patientGender = patientData?.gender === 'female' ? '女性' : patientData?.gender === 'male' ? '男性' : '';
  const patientTitle = patientData
    ? `${patientName} (${[calcAge !== null ? `${calcAge}歳` : '年齢不明', patientGender].filter(Boolean).join(' / ')})`
    : patientName;
  const patientInitials = patientName
    .split(/\s|　/)
    .filter(Boolean)
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2) || 'PT';
  const activePatientAlerts = patientAlerts.filter(isActivePatientAlert).slice(0, 4);

  const [isReading, setIsReading] = useState(false);
  const [isReadingClinical, setIsReadingClinical] = useState(false);
  const [mynaReadDisplay, setMynaReadDisplay] = useState<MynaReadInsuranceDisplay | null>(null);
  const [mynaClinicalMessage, setMynaClinicalMessage] = useState('');
  const patientInsuranceInfo = formatPatientInsuranceInfo(patientData?.insuranceInfo);
  const displayedInsuranceInfo = mynaReadDisplay?.label || patientInsuranceInfo;
  const insuranceBadgeClass = mynaReadDisplay?.status === 'verified'
    ? 'green'
    : mynaReadDisplay?.status === 'warning'
      ? 'orange'
      : 'blue';

  // Premium Insurance Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasOpenedInsuranceFromQuery, setHasOpenedInsuranceFromQuery] = useState(false);
  const [editPatientName, setEditPatientName] = useState('');
  const [editPatientBirthDate, setEditPatientBirthDate] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editBurden, setEditBurden] = useState(30);
  const [editType, setEditType] = useState('社保');
  const [editRel, setEditRel] = useState('本人');
  const [editValidFrom, setEditValidFrom] = useState('');
  const [editValidTo, setEditValidTo] = useState('');
  const [editEligibilityCheckedAt, setEditEligibilityCheckedAt] = useState('');
  const [editEligibilityStatus, setEditEligibilityStatus] = useState<InsuranceEligibilityStatus>('unchecked');
  const [editPub1Provider, setEditPub1Provider] = useState('');
  const [editPub1Recipient, setEditPub1Recipient] = useState('');
  const [editPub1Burden, setEditPub1Burden] = useState(10);
  const [editPub1StartDate, setEditPub1StartDate] = useState('');
  const [editPub1EndDate, setEditPub1EndDate] = useState('');
  const [editPub1MonthlyLimitYen, setEditPub1MonthlyLimitYen] = useState('');
  const [questionnaireImageDataUrl, setQuestionnaireImageDataUrl] = useState('');
  const [questionnaireImageName, setQuestionnaireImageName] = useState('');
  const [questionnaireImageByteSize, setQuestionnaireImageByteSize] = useState(0);
  const [questionnaireCapturedAt, setQuestionnaireCapturedAt] = useState('');
  const [questionnaireRawText, setQuestionnaireRawText] = useState('');
  const [questionnaireAllergies, setQuestionnaireAllergies] = useState('');
  const [questionnaireAdverseDrugReactions, setQuestionnaireAdverseDrugReactions] = useState('');
  const [questionnaireMedicalHistory, setQuestionnaireMedicalHistory] = useState('');
  const [questionnaireCurrentSymptoms, setQuestionnaireCurrentSymptoms] = useState('');
  const [questionnairePregnancyLactation, setQuestionnairePregnancyLactation] = useState('');
  const [questionnaireLifestyle, setQuestionnaireLifestyle] = useState('');
  const [questionnaireNotes, setQuestionnaireNotes] = useState('');
  const [questionnaireSourceType, setQuestionnaireSourceType] = useState<'camera' | 'image' | 'manual'>('manual');
  const [questionnaireWarnings, setQuestionnaireWarnings] = useState<string[]>([]);
  const [isQuestionnaireProcessing, setIsQuestionnaireProcessing] = useState(false);

  const findBannerVisit = useCallback(async () => {
    if (!db) return null;
    if (targetVisitId) {
      return db.visits.findOne(targetVisitId).exec();
    }
    const visits = await db.visits.find({ selector: { status: 'processing' } }).exec();
    return visits[0] || null;
  }, [db, targetVisitId]);

  const loadVisitQuestionnaireIntoModal = useCallback(async () => {
    const visit = await findBannerVisit();
    const visitJson = visit?.toJSON() as Visit | undefined;
    const questionnaire = visitJson?.initialQuestionnaire;
    setQuestionnaireImageDataUrl(questionnaire?.imageDataUrl || '');
    setQuestionnaireImageName(questionnaire?.imageOriginalName || '');
    setQuestionnaireImageByteSize(questionnaire?.imageByteSize || 0);
    setQuestionnaireCapturedAt(questionnaire?.capturedAt || '');
    setQuestionnaireRawText(questionnaire?.rawText || '');
    setQuestionnaireAllergies(questionnaire?.allergies || '');
    setQuestionnaireAdverseDrugReactions(questionnaire?.adverseDrugReactions || '');
    setQuestionnaireMedicalHistory(questionnaire?.medicalHistory || '');
    setQuestionnaireCurrentSymptoms(questionnaire?.currentSymptoms || '');
    setQuestionnairePregnancyLactation(questionnaire?.pregnancyLactation || '');
    setQuestionnaireLifestyle(questionnaire?.lifestyle || '');
    setQuestionnaireNotes(questionnaire?.notes || '');
    setQuestionnaireSourceType(questionnaire?.sourceType || 'manual');
    setQuestionnaireWarnings([]);
    setMynaClinicalMessage('');
  }, [findBannerVisit]);

  const hasQuestionnaireInput = useMemo(() => (
    [
      questionnaireImageDataUrl,
      questionnaireRawText,
      questionnaireAllergies,
      questionnaireAdverseDrugReactions,
      questionnaireMedicalHistory,
      questionnaireCurrentSymptoms,
      questionnairePregnancyLactation,
      questionnaireLifestyle,
      questionnaireNotes
    ].some((value) => value.trim().length > 0)
  ), [
    questionnaireAdverseDrugReactions,
    questionnaireAllergies,
    questionnaireCurrentSymptoms,
    questionnaireImageDataUrl,
    questionnaireLifestyle,
    questionnaireMedicalHistory,
    questionnaireNotes,
    questionnairePregnancyLactation,
    questionnaireRawText
  ]);

  const applyQuestionnaireOcrText = useCallback((text: string) => {
    const draft = extractInitialQuestionnaireOcrDraft(text);
    setQuestionnaireRawText(draft.rawText);
    setQuestionnaireAllergies((current) => draft.allergies || current);
    setQuestionnaireAdverseDrugReactions((current) => draft.adverseDrugReactions || current);
    setQuestionnaireMedicalHistory((current) => draft.medicalHistory || current);
    setQuestionnaireCurrentSymptoms((current) => draft.currentSymptoms || current);
    setQuestionnairePregnancyLactation((current) => draft.pregnancyLactation || current);
    setQuestionnaireLifestyle((current) => draft.lifestyle || current);
    setQuestionnaireNotes((current) => draft.notes || current);
    setQuestionnaireWarnings(draft.warnings);
  }, []);

  const handleQuestionnaireFileSelection = useCallback(async (file: File, sourceType: 'camera' | 'image') => {
    setIsQuestionnaireProcessing(true);
    setQuestionnaireSourceType(sourceType);
    setQuestionnaireCapturedAt(new Date().toISOString());
    setQuestionnaireWarnings([]);

    try {
      const [compressed, { processPrescription }] = await Promise.all([
        compressQuestionnaireImage(file),
        import('@/lib/ocr/processor')
      ]);
      setQuestionnaireImageDataUrl(compressed.dataUrl);
      setQuestionnaireImageByteSize(compressed.byteSize);
      setQuestionnaireImageName(file.name || 'questionnaire.jpg');
      const text = await processPrescription(file);
      applyQuestionnaireOcrText(text);
      toast.success(`初回質問表をOCR入力しました（保存画像 ${Math.round(compressed.byteSize / 1024)}KB）。`);
    } catch (error) {
      console.error('Failed to process initial questionnaire image:', error);
      toast.error(error instanceof Error ? error.message : '初回質問表のOCRに失敗しました。');
    } finally {
      setIsQuestionnaireProcessing(false);
    }
  }, [applyQuestionnaireOcrText]);

  const handleQuestionnaireFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>, sourceType: 'camera' | 'image') => {
    const file = event.target.files?.[0];
    if (file) {
      handleQuestionnaireFileSelection(file, sourceType);
    }
    event.target.value = '';
  }, [handleQuestionnaireFileSelection]);

  const openModal = useCallback(() => {
    if (patientData) {
      setEditPatientName(patientData.name || '');
      setEditPatientBirthDate(toDateInputValue(patientData.birthDate));
      setEditProvider(patientData.insuranceInfo?.provider || '');
      setEditNumber(patientData.insuranceInfo?.number || '');
      setEditBurden(patientData.insuranceInfo?.burdenRatio ?? 30);
      setEditType(patientData.insuranceInfo?.insuranceType || '社保');
      setEditRel(patientData.insuranceInfo?.relationship || '本人');
      setEditValidFrom(toDateInputValue(patientData.insuranceInfo?.validFrom));
      setEditValidTo(toDateInputValue(patientData.insuranceInfo?.validTo));
      setEditEligibilityCheckedAt(toDateInputValue(patientData.insuranceInfo?.eligibilityCheckedAt));
      setEditEligibilityStatus(patientData.insuranceInfo?.eligibilityStatus || 'unchecked');

      const pub1 = patientData.publicInsurances?.[0];
      setEditPub1Provider(pub1?.provider || '');
      setEditPub1Recipient(pub1?.recipient || '');
      setEditPub1Burden(pub1?.burdenRatio ?? 10);
      setEditPub1StartDate(toDateInputValue(pub1?.startDate));
      setEditPub1EndDate(toDateInputValue(pub1?.endDate));
      setEditPub1MonthlyLimitYen(pub1?.monthlyLimitYen !== undefined ? String(pub1.monthlyLimitYen) : '');
    }
    loadVisitQuestionnaireIntoModal().catch((error) => {
      console.error('Failed to load initial questionnaire:', error);
    });
    setIsModalOpen(true);
  }, [loadVisitQuestionnaireIntoModal, patientData]);

  useEffect(() => {
    if (typeof window === 'undefined' || hasOpenedInsuranceFromQuery || !patientData) return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('openInsurance') !== '1') return;
    setHasOpenedInsuranceFromQuery(true);
    openModal();
  }, [hasOpenedInsuranceFromQuery, openModal, patientData]);

  useEffect(() => {
    setMynaReadDisplay(null);
  }, [patientData?.patientId]);

  const handleSaveInsurance = async () => {
    if (!db || !patientData) return;
    try {
      const patientDoc = await db.patients.findOne(patientData.patientId).exec();
      if (patientDoc) {
        const publicInsurances: PublicInsurance[] = [];
        if (editPub1Provider && editPub1Recipient) {
          publicInsurances.push({
            provider: editPub1Provider,
            recipient: editPub1Recipient,
            burdenRatio: Number(editPub1Burden),
            startDate: editPub1StartDate || undefined,
            endDate: editPub1EndDate || undefined,
            monthlyLimitYen: editPub1MonthlyLimitYen.trim() ? Number(editPub1MonthlyLimitYen) : undefined
          });
        }

        const nextInsuranceInfo = {
          provider: editProvider,
          number: editNumber,
          burdenRatio: Number(editBurden),
          insuranceType: editType,
          relationship: editRel,
          validFrom: editValidFrom || undefined,
          validTo: editValidTo || undefined,
          eligibilityCheckedAt: editEligibilityCheckedAt || undefined,
          eligibilityStatus: editEligibilityStatus
        };
        const now = new Date().toISOString();
        const questionnairePayload: VisitInitialQuestionnaire | undefined = hasQuestionnaireInput
          ? {
              sourceType: questionnaireSourceType,
              capturedAt: questionnaireCapturedAt || now,
              imageDataUrl: questionnaireImageDataUrl || undefined,
              imageOriginalName: questionnaireImageName || undefined,
              imageByteSize: questionnaireImageByteSize || undefined,
              imageCompressedAt: questionnaireImageDataUrl ? now : undefined,
              rawText: questionnaireRawText.trim() || undefined,
              allergies: questionnaireAllergies.trim() || undefined,
              adverseDrugReactions: questionnaireAdverseDrugReactions.trim() || undefined,
              medicalHistory: questionnaireMedicalHistory.trim() || undefined,
              currentSymptoms: questionnaireCurrentSymptoms.trim() || undefined,
              pregnancyLactation: questionnairePregnancyLactation.trim() || undefined,
              lifestyle: questionnaireLifestyle.trim() || undefined,
              notes: questionnaireNotes.trim() || undefined,
              reviewedAt: now,
              reviewedBy: getCurrentUser().name
            }
          : undefined;

        await patientDoc.patch({
          name: editPatientName.trim() || patientData.name,
          birthDate: editPatientBirthDate || patientData.birthDate,
          insuranceInfo: nextInsuranceInfo,
          publicInsurances
        });
        if (questionnairePayload) {
          const visit = await findBannerVisit();
          if (visit) {
            await visit.patch({ initialQuestionnaire: questionnairePayload });
            document.dispatchEvent(new CustomEvent('visit-care-communication-updated'));
          }
        }

        toast.success(questionnairePayload
          ? '患者・保険・公費情報と初回質問表を保存しました。'
          : '患者・保険・公費情報を保存しました。');
        setIsModalOpen(false);

        // Update local memory state to re-render PatientBanner
        setPatientData((prev: any) => ({
          ...prev,
          name: editPatientName.trim() || prev?.name,
          birthDate: editPatientBirthDate || prev?.birthDate,
          insuranceInfo: nextInsuranceInfo,
          publicInsurances
        }));
      }
    } catch (e) {
      console.error(e);
      toast.error('保存に失敗しました。');
    }
  };

  const handleMynaRead = useCallback(async () => {
    if (!patientData) {
      toast.warning('患者を選択してからマイナ読取を実行してください。');
      return;
    }

    setIsReading(true);

    try {
      const response = await fetch('/api/myna/read');
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'マイナ読取に失敗しました。');
      }

      const nextDisplay = buildMynaReadInsuranceDisplay({
        patientInsuranceInfo: patientData.insuranceInfo,
        readerResult: payload as MynaCardReaderResult
      });
      setMynaReadDisplay(nextDisplay);

      if (nextDisplay.status === 'warning') {
        toast.warning(nextDisplay.message);
      } else if (nextDisplay.status === 'demo') {
        toast.info(nextDisplay.message);
      } else {
        toast.success(nextDisplay.message);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'マイナ読取に失敗しました。');
    } finally {
      setIsReading(false);
    }
  }, [patientData]);

  const handleMynaClinicalImport = useCallback(async () => {
    if (!db || !patientData) {
      toast.warning('患者を選択してからマイナ取込を実行してください。');
      return;
    }

    setIsReadingClinical(true);
    setMynaClinicalMessage('');

    try {
      const response = await fetch('/api/myna/read');
      const payload = await response.json().catch(() => null) as MynaCardReaderResult | null;
      if (!response.ok || !payload) {
        throw new Error((payload as any)?.message || 'マイナ取込に失敗しました。');
      }

      const healthCheckups = payload.specificHealthCheckups || [];
      const medicationHistory = payload.medicationHistory || [];
      if (healthCheckups.length === 0 && medicationHistory.length === 0) {
        setMynaClinicalMessage('特定健診情報・薬剤履歴は取得結果に含まれていませんでした。');
        toast.info('特定健診情報・薬剤履歴は取得結果に含まれていませんでした。');
        return;
      }

      const visit = await findBannerVisit();
      if (!visit) {
        throw new Error('保存先の来局レコードが見つかりません。');
      }

      const now = new Date().toISOString();
      const visitJson = visit.toJSON() as Visit;
      const currentCareCommunication = visitJson.careCommunication || {};
      const importRecord: VisitMynaClinicalImport = {
        importId: `myna_${Date.now()}`,
        importedAt: now,
        readerSource: payload.readerSource,
        readerCheckedAt: payload.readerCheckedAt,
        specificHealthCheckups: healthCheckups,
        medicationHistory,
        note: `特定健診 ${healthCheckups.length}件 / 薬剤履歴 ${medicationHistory.length}件`
      };

      await visit.patch({
        careCommunication: {
          ...currentCareCommunication,
          mynaClinicalImports: [importRecord, ...(currentCareCommunication.mynaClinicalImports || [])].slice(0, 20),
          updatedAt: now
        }
      });
      document.dispatchEvent(new CustomEvent('visit-care-communication-updated'));

      const message = `特定健診 ${healthCheckups.length}件 / 薬剤履歴 ${medicationHistory.length}件を取り込みました。`;
      setMynaClinicalMessage(message);
      toast.success(message);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'マイナ取込に失敗しました。');
    } finally {
      setIsReadingClinical(false);
    }
  }, [db, findBannerVisit, patientData]);

  return (
    <div id="emr-patient-alerts" className="patient-banner glass">
      <div className="avatar large">{patientInitials}</div>
      <div className="patient-summary">
        <div className="row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2>{patientTitle}</h2>
          <span className="id-tag">ID: {patientData?.patientId || '-'}</span>
          <span className="badge-outline">処理中</span>
        </div>
        <p className="text-muted">{calcBirthDate}</p>
        <div
          className="patient-actions"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}
        >
          <button
            className="btn-edit-insurance flex align-center gap-1"
            onClick={openModal}
            title="患者・保険・公費情報を編集"
            style={{
              background: 'rgba(37, 99, 235, 0.08)',
              color: 'var(--primary)',
              border: '1px solid rgba(37, 99, 235, 0.15)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <CreditCard size={12} />
            <span>患者・保険・公費編集</span>
          </button>
          <button
            className="btn-picking flex align-center gap-1"
            onClick={onOpenPicking}
            title="ピッキング支援モードを開始"
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              color: 'var(--success, #10b981)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Activity size={12} />
            <span>ピッキング支援</span>
          </button>
        </div>

      </div>
      <div className="patient-alerts">
        <div className="flex gap-2 patient-alert-badges">
          {activePatientAlerts.length > 0 ? (
            activePatientAlerts.map((alert) => (
              <span
                key={alert.alertId}
                className={`badge ${alert.type === 'allergy' ? 'red' : alert.type === 'side_effect' ? 'orange' : 'blue'}`}
              >
                {formatPatientAlertLabel(alert)}
              </span>
            ))
          ) : (
            <span className="badge blue">患者アラートなし</span>
          )}
        </div>
        <div className="flex align-center gap-2" style={{ justifyContent: 'flex-end', marginTop: '4px' }}>
          <span className={`badge ${insuranceBadgeClass}`}>
            {mynaReadDisplay?.status === 'verified' && <CheckCircle2 size={12} className="inline-icon" aria-hidden="true" />}
            保険: {displayedInsuranceInfo}
          </span>
          <span
            className="btn-tooltip-wrapper"
            data-disabled={isReading || !patientData}
            title={isReading ? '読み取り中...' : !patientData ? '患者を選択してください' : ''}
          >
            <button
              className="btn-myna"
              onClick={handleMynaRead}
              disabled={isReading || !patientData}
              aria-label="マイナンバーカードを読み取る"
            >
              {isReading ? (
                <><Loader2 size={14} className="spin" aria-hidden="true" /> 読取中...</>
              ) : (
                <><CreditCard size={14} aria-hidden="true" /> マイナ読取</>
              )}
            </button>
          </span>
        </div>
      </div>

      {/* Premium Insurance/Public Support Editor Modal */}
      {isModalOpen && (
        <div className="insurance-modal-overlay">
          <div className="insurance-modal card glass animate-scale">
            <div className="modal-header">
              <div className="modal-title-row">
                <CreditCard className="icon-primary" size={20} />
                <h3>患者・保険・公費情報の構造化登録</h3>
              </div>
              <p className="modal-subtitle">{patientName} 様の請求保険者・公費負担情報を設定します。</p>
            </div>
            
            <div className="modal-body">
              <div className="modal-section-title">患者基本情報</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-patient-name">患者名</label>
                  <input
                    id="m-patient-name"
                    type="text"
                    maxLength={100}
                    value={editPatientName}
                    onChange={(e) => setEditPatientName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-patient-birth-date">生年月日</label>
                  <input
                    id="m-patient-birth-date"
                    type="date"
                    value={editPatientBirthDate}
                    onChange={(e) => setEditPatientBirthDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-section-title mt-4">初回質問表 OCR</div>
              <div className="questionnaire-intake-panel" data-testid="emr-initial-questionnaire-ocr-panel">
                <div className="questionnaire-actions">
                  <label className="btn-secondary flex align-center gap-2 questionnaire-upload-button">
                    {isQuestionnaireProcessing ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
                    <span>{isQuestionnaireProcessing ? '読取中...' : 'カメラで撮影'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden-input"
                      disabled={isQuestionnaireProcessing}
                      onChange={(event) => handleQuestionnaireFileUpload(event, 'camera')}
                      data-testid="emr-initial-questionnaire-camera-input"
                    />
                  </label>
                  <label className="btn-secondary flex align-center gap-2 questionnaire-upload-button">
                    <Upload size={16} />
                    <span>画像を選択</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden-input"
                      disabled={isQuestionnaireProcessing}
                      onChange={(event) => handleQuestionnaireFileUpload(event, 'image')}
                      data-testid="emr-initial-questionnaire-image-input"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary flex align-center gap-2"
                    onClick={() => {
                      setQuestionnaireSourceType('manual');
                      setQuestionnaireCapturedAt((current) => current || new Date().toISOString());
                      applyQuestionnaireOcrText(questionnaireRawText);
                    }}
                    disabled={!questionnaireRawText.trim() || isQuestionnaireProcessing}
                  >
                    <ClipboardList size={16} />
                    全文から再抽出
                  </button>
                  {questionnaireImageByteSize > 0 && (
                    <span className="questionnaire-size-chip">
                      保存画像 {Math.round(questionnaireImageByteSize / 1024)}KB
                    </span>
                  )}
                </div>
                {questionnaireImageDataUrl && (
                  <div className="questionnaire-preview">
                    <img src={questionnaireImageDataUrl} alt="初回質問表の軽量保存画像" />
                  </div>
                )}
                {questionnaireWarnings.length > 0 && (
                  <ul className="questionnaire-warning-list">
                    {questionnaireWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <div className="questionnaire-field-grid">
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-allergies">アレルギー</label>
                    <textarea
                      id="m-questionnaire-allergies"
                      value={questionnaireAllergies}
                      onChange={(e) => setQuestionnaireAllergies(e.target.value)}
                      placeholder="薬・食物・花粉など"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-adverse">副作用歴</label>
                    <textarea
                      id="m-questionnaire-adverse"
                      value={questionnaireAdverseDrugReactions}
                      onChange={(e) => setQuestionnaireAdverseDrugReactions(e.target.value)}
                      placeholder="過去に合わなかった薬、症状"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-history">既往歴・治療中</label>
                    <textarea
                      id="m-questionnaire-history"
                      value={questionnaireMedicalHistory}
                      onChange={(e) => setQuestionnaireMedicalHistory(e.target.value)}
                      placeholder="持病、治療中の疾患"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-symptoms">症状・相談内容</label>
                    <textarea
                      id="m-questionnaire-symptoms"
                      value={questionnaireCurrentSymptoms}
                      onChange={(e) => setQuestionnaireCurrentSymptoms(e.target.value)}
                      placeholder="今回困っていること"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-pregnancy">妊娠・授乳</label>
                    <input
                      id="m-questionnaire-pregnancy"
                      type="text"
                      value={questionnairePregnancyLactation}
                      onChange={(e) => setQuestionnairePregnancyLactation(e.target.value)}
                      placeholder="該当なし / 妊娠中 / 授乳中"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-lifestyle">生活情報</label>
                    <input
                      id="m-questionnaire-lifestyle"
                      type="text"
                      value={questionnaireLifestyle}
                      onChange={(e) => setQuestionnaireLifestyle(e.target.value)}
                      placeholder="飲酒、喫煙、運転など"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="m-questionnaire-notes">備考</label>
                  <textarea
                    id="m-questionnaire-notes"
                    value={questionnaireNotes}
                    onChange={(e) => setQuestionnaireNotes(e.target.value)}
                    placeholder="薬剤師確認メモ"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-questionnaire-raw">OCR全文</label>
                  <textarea
                    id="m-questionnaire-raw"
                    className="questionnaire-raw-textarea"
                    value={isQuestionnaireProcessing ? '解析中...' : questionnaireRawText}
                    readOnly={isQuestionnaireProcessing}
                    onChange={(e) => {
                      setQuestionnaireRawText(e.target.value);
                      setQuestionnaireSourceType('manual');
                      setQuestionnaireCapturedAt((current) => current || new Date().toISOString());
                    }}
                    placeholder="撮影後にOCR全文が入ります。手入力・貼り付けもできます。"
                  />
                </div>
              </div>

              <div className="modal-section-title mt-4">マイナ臨床情報</div>
              <div className="myna-clinical-import-panel" data-testid="myna-clinical-import-panel">
                <button
                  type="button"
                  className="btn-secondary flex align-center gap-2"
                  onClick={handleMynaClinicalImport}
                  disabled={isReadingClinical || !patientData}
                  data-testid="myna-clinical-import-button"
                >
                  {isReadingClinical ? <Loader2 size={16} className="spin" /> : <History size={16} />}
                  {isReadingClinical ? '取込中...' : '特定健診・薬剤履歴を取込'}
                </button>
                {mynaClinicalMessage && (
                  <span className="myna-clinical-message">{mynaClinicalMessage}</span>
                )}
              </div>

              <div className="modal-section-title mt-4">保険情報 (HOレコード用)</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-ins-type">保険種別</label>
                  <select id="m-ins-type" value={editType} onChange={(e) => setEditType(e.target.value)}>
                    <option value="社保">社保 (健康保険)</option>
                    <option value="国保">国保 (国民健康保険)</option>
                    <option value="後期高齢">後期高齢</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-rel">本人・家族区分</label>
                  <select id="m-ins-rel" value={editRel} onChange={(e) => setEditRel(e.target.value)}>
                    <option value="本人">本人</option>
                    <option value="家族">家族</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-provider">保険者番号 (8桁/6桁)</label>
                  <input 
                    id="m-ins-provider"
                    type="text" 
                    maxLength={8}
                    placeholder="例: 06139999" 
                    value={editProvider} 
                    onChange={(e) => setEditProvider(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-number">記号番号</label>
                  <input 
                    id="m-ins-number"
                    type="text" 
                    placeholder="例: 記号123 番号456" 
                    value={editNumber} 
                    onChange={(e) => setEditNumber(e.target.value)} 
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="m-ins-burden">自己負担割合 (%)</label>
                  <select id="m-ins-burden" value={editBurden} onChange={(e) => setEditBurden(Number(e.target.value))}>
                    <option value={30}>30 % (3割)</option>
                    <option value={20}>20 % (2割)</option>
                    <option value={10}>10 % (1割)</option>
                    <option value={0}>0 % (無償/公費全額)</option>
                  </select>
                </div>
              </div>

              <div className="modal-section-title mt-4">資格確認・有効期間</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-ins-eligibility-status">資格確認状態</label>
                  <select
                    id="m-ins-eligibility-status"
                    value={editEligibilityStatus}
                    onChange={(e) => setEditEligibilityStatus(e.target.value as InsuranceEligibilityStatus)}
                  >
                    <option value="unchecked">未確認</option>
                    <option value="valid">有効</option>
                    <option value="warning">要確認</option>
                    <option value="invalid">無効</option>
                    <option value="unavailable">確認不可</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-eligibility-checked-at">資格確認日</label>
                  <input
                    id="m-ins-eligibility-checked-at"
                    type="date"
                    value={editEligibilityCheckedAt}
                    onChange={(e) => setEditEligibilityCheckedAt(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-valid-from">保険有効開始日</label>
                  <input
                    id="m-ins-valid-from"
                    type="date"
                    value={editValidFrom}
                    onChange={(e) => setEditValidFrom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-valid-to">保険有効期限</label>
                  <input
                    id="m-ins-valid-to"
                    type="date"
                    value={editValidTo}
                    onChange={(e) => setEditValidTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-section-title mt-4">公費情報 (KOレコード用)</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-pub-provider">公費負担者番号 (8桁)</label>
                  <input 
                    id="m-pub-provider"
                    type="text" 
                    maxLength={8}
                    placeholder="例: 51136018 (難病)" 
                    value={editPub1Provider} 
                    onChange={(e) => setEditPub1Provider(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-pub-recipient">公費受給者番号 (7桁)</label>
                  <input 
                    id="m-pub-recipient"
                    type="text" 
                    maxLength={7}
                    placeholder="例: 1234567" 
                    value={editPub1Recipient} 
                    onChange={(e) => setEditPub1Recipient(e.target.value)} 
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="m-pub-burden">公費自己負担割合 (%)</label>
                  <select id="m-pub-burden" value={editPub1Burden} onChange={(e) => setEditPub1Burden(Number(e.target.value))}>
                    <option value={10}>10 % (1割負担)</option>
                    <option value={0}>0 % (自己負担なし)</option>
                    <option value={20}>20 % (2割負担)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-pub-start-date">公費開始日</label>
                  <input
                    id="m-pub-start-date"
                    type="date"
                    value={editPub1StartDate}
                    onChange={(e) => setEditPub1StartDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-pub-end-date">公費有効期限</label>
                  <input
                    id="m-pub-end-date"
                    type="date"
                    value={editPub1EndDate}
                    onChange={(e) => setEditPub1EndDate(e.target.value)}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="m-pub-monthly-limit">月額負担上限 (円)</label>
                  <input
                    id="m-pub-monthly-limit"
                    type="number"
                    min={0}
                    placeholder="例: 5000"
                    value={editPub1MonthlyLimitYen}
                    onChange={(e) => setEditPub1MonthlyLimitYen(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>キャンセル</button>
              <button className="btn-primary" onClick={handleSaveInsurance} disabled={isQuestionnaireProcessing}>
                {isQuestionnaireProcessing ? 'OCR中...' : '保存して適用'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .patient-banner {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 1.25rem 2rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          flex-wrap: wrap;
        }

        .patient-summary {
          min-width: min(100%, 340px);
          flex: 1 1 340px;
        }
        .patient-summary h2 { margin-bottom: 0.2rem; }
        .id-tag { color: var(--text-ghost); font-family: var(--font-outfit), var(--font-noto-sans-jp), sans-serif; font-size: var(--fs-base); }

        .patient-alerts {
          margin-left: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: min(100%, 280px);
        }

        .badge {
          padding: 4px 12px;
          border-radius: 6px;
          font-size: var(--fs-sm);
          font-weight: 600;
        }
        .badge.red { background: #fee2e2; color: #dc2626; }
        .badge.orange { background: #fef3c7; color: #d97706; }
        .badge.blue { background: #dbeafe; color: #2563eb; }
        .badge-outline {
          border: 1px solid var(--border);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }

        .flex { display: flex; }
        .align-center { align-items: center; }
        .gap-2 { gap: 0.5rem; }
        .badge.green { background: #d1fae5; color: #059669; display: flex; align-items: center; gap: 4px; }
        .inline-icon { display: inline-block; }
        .patient-alert-badges {
          justify-content: flex-end;
          flex-wrap: wrap;
          max-width: 420px;
        }

        .btn-myna {
          background: #fdf2f8;
          color: #db2777;
          border: 1px solid #fbcfe8;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: var(--fs-sm);
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          transition: all var(--transition-fast);
        }
        .btn-myna:hover:not(:disabled) {
          background: #fce7f3;
        }
        .btn-myna:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .hidden-input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        .questionnaire-intake-panel,
        .myna-clinical-import-panel {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .questionnaire-actions,
        .myna-clinical-import-panel {
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          align-items: center;
        }

        .questionnaire-upload-button {
          position: relative;
          cursor: pointer;
          min-height: 38px;
          padding: 0.45rem 0.65rem;
        }

        .questionnaire-size-chip,
        .myna-clinical-message {
          border-radius: 999px;
          background: #ecfeff;
          color: #0f766e;
          padding: 0.2rem 0.55rem;
          font-size: var(--fs-xs);
          font-weight: 800;
        }

        .questionnaire-preview {
          width: min(100%, 360px);
          max-height: 240px;
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: white;
        }

        .questionnaire-preview img {
          display: block;
          width: 100%;
          height: auto;
        }

        .questionnaire-field-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
        }

        .questionnaire-intake-panel textarea {
          min-height: 76px;
          resize: vertical;
        }

        .questionnaire-raw-textarea {
          min-height: 112px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: var(--fs-sm);
          line-height: 1.5;
        }

        .questionnaire-warning-list {
          display: grid;
          gap: 0.35rem;
          margin: 0;
          padding-left: 1.1rem;
          color: #92400e;
          font-size: var(--fs-sm);
          font-weight: 700;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});

export default PatientBanner;
