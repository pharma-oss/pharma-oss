import { useState, useEffect, useCallback } from 'react';
import type { FacilitySettings, PatientMedicationInfoTemplate } from '@/db/types';
import type { FeeCalculationOptions } from '@/lib/calculator';
import { selectApprovedPatientMedicationInfoTemplate } from '@/lib/patient_medication_info';
import { readClaimOptionsState } from '@/app/print/claim_actions';
import { buildPrintPrescriptionItem } from '@/app/print/helpers';
import type { PrintPrescriptionItem } from '@/app/print/types';

export interface UsePrintVisitDataReturn {
  isLoading: boolean;
  visitData: any;
  patientData: any;
  patientAlerts: any[];
  settingsData: FacilitySettings | null;
  prescriptionItems: PrintPrescriptionItem[];
  approvedMedicationInfoTemplates: Record<string, PatientMedicationInfoTemplate>;
  remarks: Record<string, string>;
  claimOptions: FeeCalculationOptions;
  interventions: any[];
  setVisitData: React.Dispatch<React.SetStateAction<any>>;
  setPrescriptionItems: React.Dispatch<React.SetStateAction<PrintPrescriptionItem[]>>;
  setRemarks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setClaimOptions: React.Dispatch<React.SetStateAction<FeeCalculationOptions>>;
  reloadVisitData: () => Promise<void>;
}

export function usePrintVisitData(db: any, visitId: string): UsePrintVisitDataReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [visitData, setVisitData] = useState<any>(null);
  const [patientData, setPatientData] = useState<any>(null);
  const [patientAlerts, setPatientAlerts] = useState<any[]>([]);
  const [settingsData, setSettingsData] = useState<FacilitySettings | null>(null);
  const [prescriptionItems, setPrescriptionItems] = useState<PrintPrescriptionItem[]>([]);
  const [approvedMedicationInfoTemplates, setApprovedMedicationInfoTemplates] = useState<Record<string, PatientMedicationInfoTemplate>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [claimOptions, setClaimOptions] = useState<FeeCalculationOptions>({ drugFeeOnly: false, disabledFeeCodes: [] });
  const [interventions, setInterventions] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!db || !visitId) return;

    try {
      const visitPromise = db.visits.findOne(visitId).exec();
      const itemsPromise = db.prescription_items.find({ selector: { visitId } }).exec();
      const settingsPromise = db.facility_settings.findOne('default').exec();

      const visit = await visitPromise;
      if (!visit) {
        setIsLoading(false);
        return;
      }

      const visitJson = visit.toJSON();
      setVisitData(visitJson);
      setClaimOptions(readClaimOptionsState(visitJson.claimOptions));

      const patientPromise = db.patients.findOne(visit.patientId).exec();
      const alertsPromise = db.alerts.find({ selector: { patientId: visit.patientId } }).exec();

      const items = await itemsPromise;

      const drugIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const prescribedDrugId = items[i].drugId;
        const dispensedDrugCode = items[i].dispensedDrugCode;
        if (prescribedDrugId) drugIds.push(prescribedDrugId);
        if (dispensedDrugCode) drugIds.push(dispensedDrugCode);
      }

      const uniqueDrugIds = Array.from(new Set(drugIds));
      const drugsPromise = db.drugs.findByIds(uniqueDrugIds).exec();
      const medicationInfoTemplatesPromise = uniqueDrugIds.length > 0
        ? db.patient_medication_info_templates.find({
            selector: {
              drugCode: { $in: uniqueDrugIds },
              status: 'approved'
            }
          }).exec()
        : Promise.resolve([]);

      const interventionsPromise = db.interventions
        ? db.interventions.find({ selector: { visitId } }).exec()
        : Promise.resolve([]);

      const [patient, drugsMap, settingsDoc, alerts, medicationInfoTemplateDocs, interventionDocs] = await Promise.all([
        patientPromise,
        drugsPromise,
        settingsPromise,
        alertsPromise,
        medicationInfoTemplatesPromise,
        interventionsPromise
      ]);

      if (patient) setPatientData(patient.toJSON());
      setPatientAlerts(alerts.map((alert: any) => alert.toJSON()).filter((alert: any) => alert.status !== 'resolved'));
      if (settingsDoc) setSettingsData(settingsDoc.toJSON());
      setInterventions(interventionDocs.map((doc: any) => doc.toJSON()));

      const templateCandidatesByDrugCode: Record<string, PatientMedicationInfoTemplate[]> = {};
      for (const templateDoc of medicationInfoTemplateDocs) {
        const template = templateDoc.toJSON() as PatientMedicationInfoTemplate;
        if (template.status === 'approved') {
          templateCandidatesByDrugCode[template.drugCode] ||= [];
          templateCandidatesByDrugCode[template.drugCode].push(template);
        }
      }
      const templatesByDrugCode: Record<string, PatientMedicationInfoTemplate> = {};
      for (const [drugCode, candidates] of Object.entries(templateCandidatesByDrugCode)) {
        const selectedTemplate = selectApprovedPatientMedicationInfoTemplate(candidates);
        if (selectedTemplate) templatesByDrugCode[drugCode] = selectedTemplate;
      }
      setApprovedMedicationInfoTemplates(templatesByDrugCode);

      // 薬価は「調剤日時点」で引く。現在のマスター薬価をそのまま使うと、
      // 薬価改定後にマスターを取り込んだ時点で過去の調剤分まで点数が変わる。
      const dispensingDateForPrice = visitJson.dispensingDate || visitJson.issueDate || '';

      const itemsData: PrintPrescriptionItem[] = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const dispensedDrugDoc = item.dispensedDrugCode ? drugsMap.get(item.dispensedDrugCode) : undefined;
        const prescribedDrugDoc = drugsMap.get(item.drugId);
        itemsData[i] = buildPrintPrescriptionItem(
          item.toJSON(),
          prescribedDrugDoc,
          dispensedDrugDoc,
          dispensingDateForPrice
        );
      }

      setPrescriptionItems(itemsData);

      const initialRemarks: Record<string, string> = {};
      itemsData.forEach((it) => {
        if (it.receiptRemark) initialRemarks[it.itemId] = it.receiptRemark;
      });
      setRemarks(initialRemarks);
    } catch (e) {
      console.error('Failed to load print visit data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [db, visitId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    isLoading,
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
