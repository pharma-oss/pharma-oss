import { useState, useCallback } from 'react';
import type { Drug } from '@/db/types';
import { formatDrugDisplayName } from '@/lib/master-data/drug_display';
import {
  getDrugAuditMeta,
  getDispensedDrugAuditMeta,
  clearDispensedDrugAuditMeta,
  NO_SUBSTITUTION_LABEL,
  isNoSubstitutionValue
} from '@/app/ocr/helpers';
import type { Prescription } from '@/app/ocr/types';

interface UseOcrDrugSearchModalOptions {
  setPrescriptions: React.Dispatch<React.SetStateAction<Prescription[]>>;
}

export function applyDrugSelectionToPrescriptions({
  prescriptions,
  editingRowId,
  modalTargetField,
  drug,
  changeReason
}: {
  prescriptions: Prescription[];
  editingRowId: string;
  modalTargetField: 'prescribed' | 'dispensed';
  drug: Drug;
  changeReason: string;
}): Prescription[] {
  const index = prescriptions.findIndex((p) => p.id === editingRowId);
  if (index === -1) return prescriptions;
  const next = [...prescriptions];
  if (modalTargetField === 'prescribed') {
    const auditMeta = getDrugAuditMeta(drug);
    const shouldSetUnitText = Boolean(
      drug.unitText && (next[index].electronicUnitConversion?.prescribedUnitText || !next[index].unitText?.trim())
    );
    const shouldSetUnitCode = Boolean(
      drug.unitCode && (next[index].electronicUnitConversion?.prescribedUnitCode || !next[index].unitCode?.trim())
    );
    next[index] = {
      ...next[index],
      drugCode: drug.code,
      drugName: formatDrugDisplayName(drug.name),
      ...(shouldSetUnitText ? { unitText: drug.unitText } : {}),
      ...(shouldSetUnitCode ? { unitCode: drug.unitCode } : {}),
      ...auditMeta,
      ...clearDispensedDrugAuditMeta,
      dispensedDrug: (!next[index].dispensedDrug || isNoSubstitutionValue(next[index].dispensedDrug))
        ? NO_SUBSTITUTION_LABEL
        : next[index].dispensedDrug,
      dispensedDrugCode: '',
      changeReason: ''
    };
  } else {
    next[index] = {
      ...next[index],
      ...getDispensedDrugAuditMeta(drug),
      dispensedDrug: formatDrugDisplayName(drug.name),
      dispensedDrugCode: drug.code,
      changeReason
    };
  }
  return next;
}

export function useOcrDrugSearchModal({ setPrescriptions }: UseOcrDrugSearchModalOptions) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [modalInitialQuery, setModalInitialQuery] = useState('');
  const [modalTargetField, setModalTargetField] = useState<'prescribed' | 'dispensed'>('dispensed');
  const [modalPrescribedCode, setModalPrescribedCode] = useState<string | undefined>(undefined);

  const handleOpenDrugSearch = useCallback((
    id: string,
    currentDrug: string,
    targetField: 'prescribed' | 'dispensed',
    prescribedCode?: string
  ) => {
    setEditingRowId(id);
    setModalInitialQuery(currentDrug);
    setModalTargetField(targetField);
    setModalPrescribedCode(prescribedCode);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleModalSelect = useCallback((drug: Drug, changeReason: string) => {
    if (editingRowId) {
      setPrescriptions((prev) => applyDrugSelectionToPrescriptions({
        prescriptions: prev,
        editingRowId,
        modalTargetField,
        drug,
        changeReason
      }));
    }
  }, [editingRowId, modalTargetField, setPrescriptions]);

  return {
    isModalOpen,
    setIsModalOpen,
    editingRowId,
    modalInitialQuery,
    modalTargetField,
    modalPrescribedCode,
    handleOpenDrugSearch,
    handleModalClose,
    handleModalSelect
  };
}
