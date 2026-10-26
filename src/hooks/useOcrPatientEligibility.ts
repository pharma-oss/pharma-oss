import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { Patient, Alert } from '@/db/types';
import type { EligibilityStatus } from '@/app/ocr/helpers';
import {
  normalizeOnlineEligibilityResponse,
  type NormalizedOnlineEligibilityResult
} from '@/lib/online_eligibility';
import { findMatchingPatient, normalizeInsuranceNumber } from '@/lib/patient_matching';
import { buildPatientSearchQuery, searchPatients, type PatientSearchMatch } from '@/lib/patient_search';
import { parseFlexibleDateInput } from '@/lib/date_input';
import type {
  PatientMergePlan,
  PatientMergeExecutionPlan
} from '@/lib/patient_merge';
import type { MynaCardReaderResult } from '@/lib/myna_card_reader';
import {
  buildMynaReadConfirmationMessage,
  DEFAULT_RECEPTION_BURDEN_RATIO,
  pickReceptionInsuranceNumber,
  resolveReceptionInsuranceFields
} from '@/lib/myna_read_display';
import { fetchMynaCardRead } from '@/lib/myna_read_client';

/** 検索結果に出す患者の上限 */
const PATIENT_SEARCH_RESULT_LIMIT = 8;

export type PatientCandidate = Patient & { doc?: any };
export type PatientMergeReview = {
  sourcePatientId: string;
  plan: PatientMergePlan;
  executionPlan: PatientMergeExecutionPlan;
};

interface UseOcrPatientEligibilityOptions {
  db: any;
  /** 受付の検索欄に打った文字。氏名・フリガナ・生年月日(半角8桁など)を空白で区切って絞り込む。 */
  patientSearchQuery: string;
  setPatientSearchQuery: (query: string) => void;
  /** 処方箋(OCR・QR・電子処方箋)やマイナ読取で分かった患者。一致する患者がいれば自動で選ぶ。選んだ後は、選んだ患者の値が入る。 */
  patientName: string;
  patientBirthDate: string;
  insuranceNumber: string;
  burdenRatio: string;
  setPatientName: (name: string) => void;
  setPatientBirthDate: (birthDate: string) => void;
  setInsuranceNumber: (insuranceNumber: string) => void;
  setBurdenRatio: (burdenRatio: string) => void;
}

export function useOcrPatientEligibility({
  db,
  patientSearchQuery,
  setPatientSearchQuery,
  patientName,
  patientBirthDate,
  insuranceNumber,
  burdenRatio,
  setPatientName,
  setPatientBirthDate,
  setInsuranceNumber,
  setBurdenRatio
}: UseOcrPatientEligibilityOptions) {
  const [allPatients, setAllPatients] = useState<PatientCandidate[]>([]);
  const [hasPatientCandidatesFetchError, setHasPatientCandidatesFetchError] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  // 直近のマイナ読取の結果。患者が見つからないときの新規登録で、カナ・性別・記号番号まで引き継ぐ。
  const [mynaReadResult, setMynaReadResult] = useState<MynaCardReaderResult | null>(null);
  const [patientMergeReview, setPatientMergeReview] = useState<PatientMergeReview | null>(null);
  const [isLoadingPatientMergeReview, setIsLoadingPatientMergeReview] = useState(false);
  const [isApplyingPatientMerge, setIsApplyingPatientMerge] = useState(false);
  const [patientMergeMessage, setPatientMergeMessage] = useState('');
  const [activePatientAlerts, setActivePatientAlerts] = useState<Alert[]>([]);
  const [hasPatientAlertsFetchError, setHasPatientAlertsFetchError] = useState(false);
  const [isReadingMyna, setIsReadingMyna] = useState(false);
  const [mynaMessage, setMynaMessage] = useState('');
  const [eligibilityStatus, setEligibilityStatus] = useState<EligibilityStatus>('unchecked');
  const [eligibilityMessage, setEligibilityMessage] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<NormalizedOnlineEligibilityResult | null>(null);

  // 患者マスターを購読する。端末内の全患者を持っておき、検索は入力のたびに端末内で絞る
  // (登録直後の患者や、同期で届いた患者もすぐ検索に出る)。
  useEffect(() => {
    if (!db) return;
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      subscription = db.patients.find().$.subscribe({
        next: (patientDocs: any[]) => {
          if (!isMounted) return;
          setAllPatients(patientDocs.map((patientDoc: any) => ({
            ...patientDoc.toJSON(),
            doc: patientDoc
          })) as PatientCandidate[]);
          setHasPatientCandidatesFetchError(false);
        },
        error: (error: unknown) => {
          console.error('Failed to load patient candidates:', error);
          if (isMounted) {
            setHasPatientCandidatesFetchError(true);
            toast.error('患者候補の検索に失敗しました。');
          }
        }
      });
    } catch (error) {
      console.error('Failed to load patient candidates:', error);
      setHasPatientCandidatesFetchError(true);
      toast.error('患者候補の検索に失敗しました。');
    }
    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [db]);

  // 検索欄の文字に当てはまる患者(全部に当てはまる患者がいなければ、一部だけ当てはまる患者)
  const patientMatches = useMemo<PatientSearchMatch<PatientCandidate>[]>(
    () => searchPatients(allPatients, patientSearchQuery, PATIENT_SEARCH_RESULT_LIMIT),
    [allPatients, patientSearchQuery]
  );
  const patientCandidates = useMemo(() => patientMatches.map((match) => match.patient), [patientMatches]);
  // 選んだ患者は、検索欄を書き換えても、候補から外れても、最新の登録内容で持ち続ける
  const selectedPatient = useMemo(
    () => (selectedPatientId ? allPatients.find((patient) => patient.patientId === selectedPatientId) : undefined),
    [allPatients, selectedPatientId]
  );

  // 選択中患者のアラート取得
  useEffect(() => {
    let isMounted = true;
    const loadPatientAlerts = async () => {
      if (!db || !selectedPatientId) {
        setActivePatientAlerts([]);
        setHasPatientAlertsFetchError(false);
        return;
      }

      setHasPatientAlertsFetchError(false);
      try {
        const alertDocs = await db.alerts.find({ selector: { patientId: selectedPatientId } }).exec();
        if (!isMounted) return;
        setActivePatientAlerts(
          alertDocs
            .map((alertDoc: any) => alertDoc.toJSON() as Alert)
            .filter((alert: Alert) => alert.status !== 'resolved')
        );
        setHasPatientAlertsFetchError(false);
      } catch (error) {
        console.error('Failed to load patient alerts:', error);
        if (isMounted) {
          setActivePatientAlerts([]);
          setHasPatientAlertsFetchError(true);
          toast.error('患者アラート情報の読み込みに失敗しました。');
        }
      }
    };

    loadPatientAlerts();
    return () => { isMounted = false; };
  }, [db, selectedPatientId]);

  // 患者を選ぶ。氏名・生年月日・保険者番号・負担割合を、選んだ患者の登録内容に入れ替える
  // (前に選んだ患者の保険者番号が残ったまま、別の患者に保存されることがないように)。
  // 直近のマイナ読取がこの患者本人のものなら、より新しいカードの保険者番号・負担割合を使う。
  const selectPatient = useCallback((patient: PatientCandidate) => {
    const insuranceFields = resolveReceptionInsuranceFields(patient, mynaReadResult);
    setSelectedPatientId(patient.patientId);
    setPatientName(patient.name);
    setPatientBirthDate(patient.birthDate);
    setInsuranceNumber(insuranceFields.insuranceNumber);
    setBurdenRatio(insuranceFields.burdenRatio);
    setEligibilityStatus('unchecked');
    setEligibilityResult(null);
  }, [mynaReadResult, setBurdenRatio, setInsuranceNumber, setPatientBirthDate, setPatientName]);

  // 処方箋・QR・マイナ読取で氏名と生年月日(または保険者番号)が分かり、その人が登録済みなら自動で選ぶ。
  // 手で選んだ患者は上書きしない。
  useEffect(() => {
    if (selectedPatientId || !patientName.trim()) return;
    const directMatch = findMatchingPatient(allPatients, {
      name: patientName,
      birthDate: patientBirthDate,
      insuranceNumber
    });
    if (directMatch) selectPatient(directMatch.patient);
  }, [allPatients, insuranceNumber, patientBirthDate, patientName, selectPatient, selectedPatientId]);

  // 選び直す。選んだ患者と、受付欄・検索欄の患者の値を空にする。
  const clearSelectedPatient = useCallback(() => {
    setSelectedPatientId(null);
    setPatientName('');
    setPatientBirthDate('');
    setInsuranceNumber('');
    setBurdenRatio(DEFAULT_RECEPTION_BURDEN_RATIO);
    setPatientSearchQuery('');
    setMynaReadResult(null);
    setMynaMessage('');
    setEligibilityStatus('unchecked');
    setEligibilityResult(null);
    setPatientMergeReview(null);
    setPatientMergeMessage('');
  }, [setBurdenRatio, setInsuranceNumber, setPatientBirthDate, setPatientName, setPatientSearchQuery]);

  // マイナ保険証読取。読み取った氏名と生年月日で患者を探す(登録済みなら自動で選ぶ。いなければ新規登録へ)。
  const handleMynaRead = useCallback(async () => {
    setIsReadingMyna(true);
    setMynaMessage('');
    try {
      const data = await fetchMynaCardRead();

      // 直近に資格確認した人の結果を読むので、反映する前に、目の前の患者のものかを人が確かめる
      if (data.readerSource !== 'mock' && !window.confirm(buildMynaReadConfirmationMessage(data))) {
        setMynaMessage('マイナ読取の内容は受付欄に入れませんでした。');
        return;
      }

      const birthDate = parseFlexibleDateInput(data.birthDate) || data.birthDate || '';
      setMynaReadResult(data);
      setSelectedPatientId(null);
      setPatientName(data.name || '');
      setPatientBirthDate(birthDate);
      setPatientSearchQuery(buildPatientSearchQuery({ name: data.name, birthDate }));
      // 受付欄の「保険者番号」には保険者番号(数字)を入れる。記号・番号は入れない
      setInsuranceNumber(pickReceptionInsuranceNumber(data.insuranceInfo));
      if (data.insuranceInfo?.burdenRatio) {
        setBurdenRatio(String(data.insuranceInfo.burdenRatio));
      }
      setEligibilityStatus('unchecked');
      setEligibilityResult(null);
      setMynaMessage(data.readerMessage || 'マイナ読取内容を反映しました。');
      toast.success(data.readerSource === 'mock' ? 'デモ用のマイナ読取内容を反映しました。' : 'マイナ読取内容を反映しました。');
    } catch (error) {
      console.error('Failed to read MyNa data:', error);
      const message = error instanceof Error && error.message ? error.message : 'マイナ読取に失敗しました。';
      setMynaMessage(message);
      toast.error(message);
    } finally {
      setIsReadingMyna(false);
    }
  }, [setBurdenRatio, setInsuranceNumber, setPatientBirthDate, setPatientName, setPatientSearchQuery]);

  // オンライン資格確認
  const handleEligibilityCheck = useCallback(async () => {
    const normalizedInsuranceNumber = normalizeInsuranceNumber(insuranceNumber);
    if (!normalizedInsuranceNumber) {
      setEligibilityStatus('warning');
      setEligibilityMessage('保険者番号を入力してください。');
      return;
    }

    setEligibilityStatus('checking');
    setEligibilityMessage('');
    try {
      const response = await fetch('/api/eligibility/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          birthDate: patientBirthDate,
          insuranceNumber: normalizedInsuranceNumber,
          insuredNumber: normalizedInsuranceNumber,
          burdenRatio: Number(burdenRatio)
        })
      });
      const result = await response.json();
      const normalizedResult = normalizeOnlineEligibilityResponse(result);
      setEligibilityResult(normalizedResult);
      setEligibilityStatus(normalizedResult.uiStatus);
      setEligibilityMessage(result.eligibilitySource === 'mock' ? 'デモ用の資格確認結果です。' : (normalizedResult.message || '資格確認結果を取得しました。'));
      if (normalizedResult.insuranceInfoPatch.burdenRatio !== undefined) {
        setBurdenRatio(String(normalizedResult.insuranceInfoPatch.burdenRatio));
      }
    } catch (error) {
      console.error('Eligibility check failed:', error);
      setEligibilityStatus('unavailable');
      setEligibilityResult(null);
      setEligibilityMessage('資格確認サービスに接続できません。');
    }
  }, [burdenRatio, insuranceNumber, patientBirthDate, patientName, setBurdenRatio]);

  return {
    patientMatches,
    patientCandidates,
    hasPatientCandidatesFetchError,
    selectedPatientId,
    setSelectedPatientId,
    selectedPatient,
    selectPatient,
    clearSelectedPatient,
    mynaReadResult,
    setMynaReadResult,
    patientMergeReview,
    setPatientMergeReview,
    isLoadingPatientMergeReview,
    setIsLoadingPatientMergeReview,
    isApplyingPatientMerge,
    setIsApplyingPatientMerge,
    patientMergeMessage,
    setPatientMergeMessage,
    activePatientAlerts,
    setActivePatientAlerts,
    hasPatientAlertsFetchError,
    setHasPatientAlertsFetchError,
    isReadingMyna,
    mynaMessage,
    setMynaMessage,
    eligibilityStatus,
    setEligibilityStatus,
    eligibilityMessage,
    setEligibilityMessage,
    eligibilityResult,
    setEligibilityResult,
    handleMynaRead,
    handleEligibilityCheck
  };
}
