import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { Visit } from '@/db/types';
import type { EligibilityStatus } from '@/app/ocr/helpers';
import {
  buildElectronicPrescriptionApplyDecision,
  normalizeElectronicPrescriptionFetchKey,
  type ElectronicPrescriptionFetchKeyKind,
  type ElectronicPrescriptionFetchResult
} from '@/lib/electronic_prescription';

export function useOcrElectronicPrescription() {
  const [electronicPrescriptionKey, setElectronicPrescriptionKey] = useState('');
  const [electronicPrescriptionKeyKind, setElectronicPrescriptionKeyKind] = useState<ElectronicPrescriptionFetchKeyKind>('exchange_number');
  const [electronicPrescriptionInsuredNumber, setElectronicPrescriptionInsuredNumber] = useState('');
  const [electronicPrescriptionStatus, setElectronicPrescriptionStatus] = useState<EligibilityStatus>('unchecked');
  const [electronicPrescriptionMessage, setElectronicPrescriptionMessage] = useState('');
  const [electronicPrescriptionWarnings, setElectronicPrescriptionWarnings] = useState<string[]>([]);
  const [electronicPrescriptionIntegrityHash, setElectronicPrescriptionIntegrityHash] = useState('');
  const [isFetchingElectronicPrescription, setIsFetchingElectronicPrescription] = useState(false);
  const [pendingElectronicPrescription, setPendingElectronicPrescription] = useState<ElectronicPrescriptionFetchResult | null>(null);
  const [electronicPrescriptionPaperOriginalConfirmed, setElectronicPrescriptionPaperOriginalConfirmed] = useState(false);
  const [appliedElectronicPrescription, setAppliedElectronicPrescription] = useState<NonNullable<Visit['electronicPrescription']> | null>(null);

  const electronicPrescriptionApplyDecision = useMemo(() => {
    if (!pendingElectronicPrescription) return null;
    return buildElectronicPrescriptionApplyDecision(pendingElectronicPrescription, {
      paperOriginalConfirmed: electronicPrescriptionPaperOriginalConfirmed
    });
  }, [electronicPrescriptionPaperOriginalConfirmed, pendingElectronicPrescription]);

  const handleElectronicPrescriptionFetch = useCallback(async (patientBirthDate?: string) => {
    const normalizedFetchKey = normalizeElectronicPrescriptionFetchKey(electronicPrescriptionKey);
    if (!normalizedFetchKey) {
      toast.warning('電子処方箋IDまたは引換番号を入力してください。');
      return;
    }

    setIsFetchingElectronicPrescription(true);
    setElectronicPrescriptionStatus('checking');
    setElectronicPrescriptionMessage('');
    setElectronicPrescriptionWarnings([]);
    setElectronicPrescriptionIntegrityHash('');
    setPendingElectronicPrescription(null);
    setElectronicPrescriptionPaperOriginalConfirmed(false);
    try {
      const response = await fetch('/api/electronic-prescription/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fetchKey: normalizedFetchKey,
          keyKind: electronicPrescriptionKeyKind,
          insuredNumber: electronicPrescriptionInsuredNumber.trim() || undefined,
          patientBirthDate: typeof patientBirthDate === 'string' ? patientBirthDate : undefined
        })
      });
      const result = await response.json() as ElectronicPrescriptionFetchResult;
      const applyDecision = buildElectronicPrescriptionApplyDecision(result, {
        paperOriginalConfirmed: false
      });
      setElectronicPrescriptionWarnings(result.warnings || []);
      setElectronicPrescriptionIntegrityHash(result.integrityHash || '');

      if (result.status !== 'success' || !result.prescription) {
        setElectronicPrescriptionStatus(result.status === 'unconfigured' ? 'unavailable' : 'warning');
        setElectronicPrescriptionMessage(applyDecision.message);
        toast.warning(applyDecision.message);
        return;
      }

      setPendingElectronicPrescription(result);
      setElectronicPrescriptionStatus(applyDecision.canApply ? 'confirmed' : 'warning');
      setElectronicPrescriptionMessage(
        applyDecision.canApply
          ? '取得内容を確認しました。「処方入力へ反映」で入力欄へ取り込みます。'
          : applyDecision.message
      );
      if (applyDecision.canApply) {
        toast.success('電子処方箋を取得しました。内容を確認してから処方入力へ反映してください。');
      } else {
        toast.warning(applyDecision.message);
      }
    } catch (error) {
      console.error('Electronic prescription fetch failed:', error);
      setElectronicPrescriptionStatus('unavailable');
      setElectronicPrescriptionMessage('電子処方箋取得APIに接続できません。');
      toast.error('電子処方箋取得APIに接続できません。');
    } finally {
      setIsFetchingElectronicPrescription(false);
    }
  }, [electronicPrescriptionInsuredNumber, electronicPrescriptionKey, electronicPrescriptionKeyKind]);

  const clearPendingElectronicPrescription = useCallback(() => {
    setPendingElectronicPrescription(null);
    setElectronicPrescriptionPaperOriginalConfirmed(false);
  }, []);

  return {
    electronicPrescriptionKey,
    setElectronicPrescriptionKey,
    electronicPrescriptionKeyKind,
    setElectronicPrescriptionKeyKind,
    electronicPrescriptionInsuredNumber,
    setElectronicPrescriptionInsuredNumber,
    electronicPrescriptionStatus,
    setElectronicPrescriptionStatus,
    electronicPrescriptionMessage,
    setElectronicPrescriptionMessage,
    electronicPrescriptionWarnings,
    setElectronicPrescriptionWarnings,
    electronicPrescriptionIntegrityHash,
    setElectronicPrescriptionIntegrityHash,
    isFetchingElectronicPrescription,
    setIsFetchingElectronicPrescription,
    pendingElectronicPrescription,
    setPendingElectronicPrescription,
    electronicPrescriptionPaperOriginalConfirmed,
    setElectronicPrescriptionPaperOriginalConfirmed,
    appliedElectronicPrescription,
    setAppliedElectronicPrescription,
    electronicPrescriptionApplyDecision,
    handleElectronicPrescriptionFetch,
    clearPendingElectronicPrescription
  };
}
