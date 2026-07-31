import type { DrugMasterOfficialDownloadCandidate } from '@/lib/drug_master_provenance';

export const drugMasterCandidateKindLabel: Record<DrugMasterOfficialDownloadCandidate['kind'], string> = {
  full_master: '全件',
  revision_master: '改定分',
  revision_notice: '改定内容',
  long_listed_drug: '長期収載',
  abolition_period: '経過措置',
  other: 'その他'
};

export const drugMasterSpecPdfDiffFieldLabel = {
  label: '項目名',
  mode: 'モード',
  digits: '桁数',
  bytes: 'バイト数'
} as const;
