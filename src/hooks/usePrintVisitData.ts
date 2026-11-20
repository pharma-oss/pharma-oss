import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Alert,
  Drug,
  FacilitySettings,
  Intervention,
  Patient,
  PatientMedicationInfoTemplate,
  PharmacyDatabase,
  Visit
} from '@/db/types';
import type { FeeCalculationOptions } from '@/lib/calculator';
import { selectApprovedPatientMedicationInfoTemplate } from '@/lib/patient_medication_info';
import { readClaimOptionsState } from '@/app/print/claim_actions';
import { buildPrintPrescriptionItem } from '@/app/print/helpers';
import type { PrintPrescriptionItem } from '@/app/print/types';

export type PrintPatientData = Patient & { id?: string };
export type PrintVisitData = Visit & { departmentId?: string };

export const EMPTY_PRINT_CLAIM_OPTIONS: FeeCalculationOptions = {
  drugFeeOnly: false,
  disabledFeeCodes: []
};

export function collectPrintVisitDrugIds(
  items: ReadonlyArray<{ drugId?: string | null; dispensedDrugCode?: string | null }>
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of items) {
    const prescribed = String(item.drugId || '').trim();
    if (prescribed && !seen.has(prescribed)) {
      seen.add(prescribed);
      ids.push(prescribed);
    }
    const dispensed = String(item.dispensedDrugCode || '').trim();
    if (dispensed && !seen.has(dispensed)) {
      seen.add(dispensed);
      ids.push(dispensed);
    }
  }
  return ids;
}

export function selectApprovedTemplatesByDrugCode(
  templateDocs: ReadonlyArray<{ toJSON: () => PatientMedicationInfoTemplate } | PatientMedicationInfoTemplate>
): Record<string, PatientMedicationInfoTemplate> {
  const candidatesByDrugCode: Record<string, PatientMedicationInfoTemplate[]> = {};
  for (const doc of templateDocs) {
    const template = 'toJSON' in doc && typeof doc.toJSON === 'function'
      ? doc.toJSON()
      : (doc as PatientMedicationInfoTemplate);
    if (template.status !== 'approved') continue;
    candidatesByDrugCode[template.drugCode] ||= [];
    candidatesByDrugCode[template.drugCode].push(template);
  }
  const templatesByDrugCode: Record<string, PatientMedicationInfoTemplate> = {};
  for (const [drugCode, candidates] of Object.entries(candidatesByDrugCode)) {
    const selectedTemplate = selectApprovedPatientMedicationInfoTemplate(candidates);
    if (selectedTemplate) templatesByDrugCode[drugCode] = selectedTemplate;
  }
  return templatesByDrugCode;
}

export type LoadedPrintVisitSnapshot =
  | { found: false }
  | {
      found: true;
      visitData: PrintVisitData;
      patientData: PrintPatientData | null;
      patientAlerts: Alert[];
      settingsData: FacilitySettings | null;
      prescriptionItems: PrintPrescriptionItem[];
      approvedMedicationInfoTemplates: Record<string, PatientMedicationInfoTemplate>;
      remarks: Record<string, string>;
      claimOptions: FeeCalculationOptions;
      interventions: Intervention[];
    };

// 印刷画面に必要な受付・患者・明細・薬品・薬情テンプレ・疑義照会を2段の Promise.all で一括取得する。
// 未 await の Promise を放置して unhandledRejection を起こさないよう、全クエリを Promise.all 内で完結させる。
export async function loadPrintVisitSnapshot(
  db: PharmacyDatabase,
  visitId: string
): Promise<LoadedPrintVisitSnapshot> {
  const [visit, items, settingsDoc] = await Promise.all([
    db.visits.findOne(visitId).exec(),
    db.prescription_items.find({ selector: { visitId } }).exec(),
    db.facility_settings.findOne('default').exec()
  ]);

  if (!visit) {
    return { found: false };
  }

  const visitJson = visit.toJSON() as PrintVisitData;
  const claimOptions = readClaimOptionsState(visitJson.claimOptions as FeeCalculationOptions | undefined);
  const uniqueDrugIds = collectPrintVisitDrugIds(items);

  const [patientDoc, drugsMap, alerts, medicationInfoTemplateDocs, interventionDocs] = await Promise.all([
    db.patients.findOne(visitJson.patientId).exec(),
    uniqueDrugIds.length > 0
      ? db.drugs.findByIds(uniqueDrugIds).exec()
      : Promise.resolve(new Map<string, Partial<Drug>>()),
    db.alerts.find({ selector: { patientId: visitJson.patientId } }).exec(),
    uniqueDrugIds.length > 0
      ? db.patient_medication_info_templates.find({
          selector: {
            drugCode: { $in: uniqueDrugIds },
            status: 'approved'
          }
        }).exec()
      : Promise.resolve([]),
    db.interventions
      ? db.interventions.find({ selector: { visitId } }).exec()
      : Promise.resolve([])
  ]);

  const patientData = patientDoc ? (patientDoc.toJSON() as PrintPatientData) : null;
  const patientAlerts = alerts
    .map((alert) => alert.toJSON() as Alert)
    .filter((alert) => alert.status !== 'resolved');
  const settingsData = settingsDoc ? (settingsDoc.toJSON() as FacilitySettings) : null;
  const interventions = interventionDocs.map((doc) => doc.toJSON() as Intervention);
  const approvedMedicationInfoTemplates = selectApprovedTemplatesByDrugCode(medicationInfoTemplateDocs);

  // 薬価は「調剤日時点」で引く。現在のマスター薬価をそのまま使うと、
  // 薬価改定後にマスターを取り込んだ時点で過去の調剤分まで点数が変わる。
  const dispensingDateForPrice = visitJson.dispensingDate || visitJson.issueDate || '';

  const prescriptionItems: PrintPrescriptionItem[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const dispensedDrugDoc = item.dispensedDrugCode ? drugsMap.get(item.dispensedDrugCode) : undefined;
    const prescribedDrugDoc = drugsMap.get(item.drugId);
    prescriptionItems[i] = buildPrintPrescriptionItem(
      item.toJSON(),
      prescribedDrugDoc,
      dispensedDrugDoc,
      dispensingDateForPrice
    );
  }

  const remarks: Record<string, string> = {};
  for (const item of prescriptionItems) {
    if (item.receiptRemark) remarks[item.itemId] = item.receiptRemark;
  }

  return {
    found: true,
    visitData: visitJson,
    patientData,
    patientAlerts,
    settingsData,
    prescriptionItems,
    approvedMedicationInfoTemplates,
    remarks,
    claimOptions,
    interventions
  };
}

export interface UsePrintVisitDataReturn {
  isLoading: boolean;
  hasLoadError: boolean;
  visitData: PrintVisitData | null;
  patientData: PrintPatientData | null;
  patientAlerts: Alert[];
  settingsData: FacilitySettings | null;
  prescriptionItems: PrintPrescriptionItem[];
  approvedMedicationInfoTemplates: Record<string, PatientMedicationInfoTemplate>;
  remarks: Record<string, string>;
  claimOptions: FeeCalculationOptions;
  interventions: Intervention[];
  setVisitData: React.Dispatch<React.SetStateAction<PrintVisitData | null>>;
  setPrescriptionItems: React.Dispatch<React.SetStateAction<PrintPrescriptionItem[]>>;
  setRemarks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setClaimOptions: React.Dispatch<React.SetStateAction<FeeCalculationOptions>>;
  reloadVisitData: () => Promise<void>;
}

export function usePrintVisitData(db: PharmacyDatabase | null | undefined, visitId: string): UsePrintVisitDataReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [visitData, setVisitData] = useState<PrintVisitData | null>(null);
  const [patientData, setPatientData] = useState<PrintPatientData | null>(null);
  const [patientAlerts, setPatientAlerts] = useState<Alert[]>([]);
  const [settingsData, setSettingsData] = useState<FacilitySettings | null>(null);
  const [prescriptionItems, setPrescriptionItems] = useState<PrintPrescriptionItem[]>([]);
  const [approvedMedicationInfoTemplates, setApprovedMedicationInfoTemplates] = useState<Record<string, PatientMedicationInfoTemplate>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [claimOptions, setClaimOptions] = useState<FeeCalculationOptions>(EMPTY_PRINT_CLAIM_OPTIONS);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const requestSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!db || !visitId) return;

    const requestId = ++requestSeqRef.current;
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const snapshot = await loadPrintVisitSnapshot(db, visitId);
      if (!isMountedRef.current || requestId !== requestSeqRef.current) return;

      if (!snapshot.found) {
        setVisitData(null);
        setPatientData(null);
        setPatientAlerts([]);
        setPrescriptionItems([]);
        setApprovedMedicationInfoTemplates({});
        setRemarks({});
        setClaimOptions(EMPTY_PRINT_CLAIM_OPTIONS);
        setInterventions([]);
        setHasLoadError(false);
        return;
      }

      setVisitData(snapshot.visitData);
      setClaimOptions(snapshot.claimOptions);
      setPatientData(snapshot.patientData);
      setPatientAlerts(snapshot.patientAlerts);
      setSettingsData(snapshot.settingsData);
      setInterventions(snapshot.interventions);
      setApprovedMedicationInfoTemplates(snapshot.approvedMedicationInfoTemplates);
      setPrescriptionItems(snapshot.prescriptionItems);
      setRemarks(snapshot.remarks);
      setHasLoadError(false);
    } catch (e) {
      console.error('Failed to load print visit data:', e);
      if (isMountedRef.current && requestId === requestSeqRef.current) {
        setHasLoadError(true);
      }
    } finally {
      if (isMountedRef.current && requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [db, visitId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    isLoading,
    hasLoadError,
    visitData,
    patientData,
    patientAlerts,
    settingsData,
    prescriptionItems,
    approvedMedicationInfoTemplates,
    remarks,
    claimOptions,
    interventions,
    setVisitData,
    setPrescriptionItems,
    setRemarks,
    setClaimOptions,
    reloadVisitData: loadData
  };
}
