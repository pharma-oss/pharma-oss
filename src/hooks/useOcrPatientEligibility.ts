import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { Patient, Alert } from '@/db/types';
import type { EligibilityStatus } from '@/app/ocr/helpers';
import {
  normalizeOnlineEligibilityResponse,
  type NormalizedOnlineEligibilityResult
} from '@/lib/online_eligibility';
import {
  findMatchingPatient,
  buildPatientCandidateMatches,
  normalizeInsuranceNumber,
  normalizePatientName,
  type PatientCandidateMatch
} from '@/lib/patient_matching';
import type {
  PatientMergePlan,
  PatientMergeExecutionPlan
} from '@/lib/patient_merge';

export type PatientCandidate = Patient & { doc?: any };
export type PatientMergeReview = {
  sourcePatientId: string;
  plan: PatientMergePlan;
  executionPlan: PatientMergeExecutionPlan;
};

interface UseOcrPatientEligibilityOptions {
  db: any;
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
  patientName,
  patientBirthDate,
  insuranceNumber,
  burdenRatio,
  setPatientName,
  setPatientBirthDate,
  setInsuranceNumber,
  setBurdenRatio
}: UseOcrPatientEligibilityOptions) {
  const [patientCandidates, setPatientCandidates] = useState<PatientCandidate[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientMergeReview, setPatientMergeReview] = useState<PatientMergeReview | null>(null);
  const [isLoadingPatientMergeReview, setIsLoadingPatientMergeReview] = useState(false);
  const [isApplyingPatientMerge, setIsApplyingPatientMerge] = useState(false);
  const [patientMergeMessage, setPatientMergeMessage] = useState('');
  const [activePatientAlerts, setActivePatientAlerts] = useState<Alert[]>([]);
  const [isReadingMyna, setIsReadingMyna] = useState(false);
  const [mynaMessage, setMynaMessage] = useState('');
  const [eligibilityStatus, setEligibilityStatus] = useState<EligibilityStatus>('unchecked');
  const [eligibilityMessage, setEligibilityMessage] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<NormalizedOnlineEligibilityResult | null>(null);

  // 患者候補の自動検索
  useEffect(() => {
    let isMounted = true;
    const loadCandidates = async () => {
      if (!db || (!patientName && !patientBirthDate && !insuranceNumber)) {
        setPatientCandidates([]);
        setSelectedPatientId(null);
        return;
      }

      try {
        const patientDocs = await db.patients.find().exec();
        const candidates = patientDocs.map((patientDoc: any) => ({
          ...patientDoc.toJSON(),
          doc: patientDoc
        })) as PatientCandidate[];
        const candidateMatches = buildPatientCandidateMatches(candidates, {
          name: patientName,
          birthDate: patientBirthDate,
          insuranceNumber
        }, 6);
        const directMatch = findMatchingPatient(candidates, {
          name: patientName,
          birthDate: patientBirthDate,
          insuranceNumber
        });
        const filtered = candidateMatches.map((match: PatientCandidateMatch<PatientCandidate>) => match.patient);

        if (!isMounted) return;
        setPatientCandidates(filtered);
        setSelectedPatientId((current) => {
          if (current && filtered.some((patient: PatientCandidate) => patient.patientId === current)) return current;
          return directMatch?.patient.patientId || null;
        });
      } catch (error) {
        console.error('Failed to load patient candidates:', error);
      }
    };

    loadCandidates();
    return () => { isMounted = false; };
  }, [db, patientName, patientBirthDate, insuranceNumber]);

  // 選択中患者のアラート取得
  useEffect(() => {
    let isMounted = true;
    const loadPatientAlerts = async () => {
      if (!db || !selectedPatientId) {
        setActivePatientAlerts([]);
        return;
      }

      try {
        const alertDocs = await db.alerts.find({ selector: { patientId: selectedPatientId } }).exec();
        if (!isMounted) return;
        setActivePatientAlerts(
          alertDocs
            .map((alertDoc: any) => alertDoc.toJSON() as Alert)
            .filter((alert: Alert) => alert.status !== 'resolved')
        );
      } catch (error) {
        console.error('Failed to load patient alerts:', error);
        if (isMounted) setActivePatientAlerts([]);
      }
    };

    loadPatientAlerts();
    return () => { isMounted = false; };
  }, [db, selectedPatientId]);

  // マイナ保険証読取
  const handleMynaRead = useCallback(async () => {
    setIsReadingMyna(true);
    setMynaMessage('');
    try {
      const response = await fetch('/api/myna/read');
      if (!response.ok) throw new Error('マイナ読取に失敗しました。');
      const data = await response.json();

      setPatientName(data.name || '');
      setPatientBirthDate(data.birthDate || '');
      setInsuranceNumber(data.insuranceInfo?.number || '');
      if (data.insuranceInfo?.burdenRatio) {
        setBurdenRatio(String(data.insuranceInfo.burdenRatio));
      }
      setSelectedPatientId(null);
      setEligibilityStatus('unchecked');
      setEligibilityResult(null);
      setMynaMessage(data.readerMessage || 'マイナ読取内容を反映しました。');
      toast.success(data.readerSource === 'mock' ? 'デモ用のマイナ読取内容を反映しました。' : 'マイナ読取内容を反映しました。');
    } catch (error) {
      console.error('Failed to read MyNa data:', error);
      setMynaMessage('マイナ読取に失敗しました。カードリーダー接続を確認してください。');
      toast.error('マイナ読取に失敗しました。');
    } finally {
      setIsReadingMyna(false);
    }
  }, [setBurdenRatio, setInsuranceNumber, setPatientBirthDate, setPatientName]);

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
    patientCandidates,
    setPatientCandidates,
    selectedPatientId,
    setSelectedPatientId,
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
