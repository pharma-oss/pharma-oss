import { useState, useEffect, useCallback } from 'react';
import type { FacilitySettings, PatientMedicationInfoTemplate } from '@/db/types';
import type { FeeCalculationOptions } from '@/lib/calculator';
import { selectApprovedPatientMedicationInfoTemplate } from '@/lib/patient_medication_info';

export interface UsePrintVisitDataReturn {
  isLoading: boolean;
  visitData: any;
  patientData: any;
  patientAlerts: any[];
  settingsData: FacilitySettings | null;
  prescriptionItems: any[];
  approvedMedicationInfoTemplates: Record<string, PatientMedicationInfoTemplate>;
  remarks: Record<string, string>;
  claimOptions: FeeCalculationOptions;
  setVisitData: React.Dispatch<React.SetStateAction<any>>;
  setPrescriptionItems: React.Dispatch<React.SetStateAction<any[]>>;
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
  const [prescriptionItems, setPrescriptionItems] = useState<any[]>([]);
  const [approvedMedicationInfoTemplates, setApprovedMedicationInfoTemplates] = useState<Record<string, PatientMedicationInfoTemplate>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [claimOptions, setClaimOptions] = useState<FeeCalculationOptions>({ drugFeeOnly: false, disabledFeeCodes: [] });

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
      setClaimOptions({
        drugFeeOnly: !!visitJson.claimOptions?.drugFeeOnly,
        disabledFeeCodes: Array.from(visitJson.claimOptions?.disabledFeeCodes || []),
        disabledFeeRationales: { ...(visitJson.claimOptions?.disabledFeeRationales || {}) }
      });

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

      const [patient, drugsMap, settingsDoc, alerts, medicationInfoTemplateDocs] = await Promise.all([
        patientPromise,
        drugsPromise,
        settingsPromise,
        alertsPromise,
        medicationInfoTemplatesPromise
      ]);

      if (patient) setPatientData(patient.toJSON());
      setPatientAlerts(alerts.map((alert: any) => alert.toJSON()).filter((alert: any) => alert.status !== 'resolved'));
      if (settingsDoc) setSettingsData(settingsDoc.toJSON());

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

      const itemsData = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const dispensedDrugDoc = item.dispensedDrugCode ? drugsMap.get(item.dispensedDrugCode) : undefined;
        const prescribedDrugDoc = drugsMap.get(item.drugId);
        const billingDrugDoc = dispensedDrugDoc || prescribedDrugDoc;
        itemsData[i] = {
          ...item.toJSON(),
          drugName: item.drugName || prescribedDrugDoc?.name || '',
          dispensedDrug: item.dispensedDrug || dispensedDrugDoc?.name || '',
          genericName: prescribedDrugDoc?.genericName || '',
          dispensedGenericName: dispensedDrugDoc?.genericName || '',
          price: billingDrugDoc?.price || item.price || 0,
          yjCode: billingDrugDoc?.yjCode || item.yjCode || '',
          isGeneric: billingDrugDoc?.isGeneric ?? item.isGeneric,
          isHighRisk: item.isHighRisk ?? prescribedDrugDoc?.isHighRisk ?? dispensedDrugDoc?.isHighRisk ?? false
        };
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
    setVisitData,
    setPrescriptionItems,
    setRemarks,
    setClaimOptions,
    reloadVisitData: loadData
  };
}
