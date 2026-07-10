import type { Patient } from '@/db/types';
import type { MynaCardReaderResult } from '@/lib/myna_card_reader';

export type MynaReadInsuranceDisplayStatus = 'verified' | 'demo' | 'warning';

export interface MynaReadInsuranceDisplay {
  status: MynaReadInsuranceDisplayStatus;
  label: string;
  message: string;
}

export function formatInsuranceBurdenRatio(burdenRatio?: number): string | undefined {
  if (!Number.isFinite(burdenRatio)) return undefined;
  return `${Number(burdenRatio) / 10}割`;
}

export function formatPatientInsuranceInfo(insuranceInfo?: Patient['insuranceInfo']): string {
  const insuranceType = insuranceInfo?.insuranceType?.trim();
  const burdenRatio = formatInsuranceBurdenRatio(insuranceInfo?.burdenRatio);

  if (insuranceType && burdenRatio) return `${insuranceType}（${burdenRatio}）`;
  if (burdenRatio) return `${burdenRatio}負担`;
  if (insuranceType) return insuranceType;
  return '保険情報未登録';
}

function formatReaderInsuranceInfo(insuranceInfo?: MynaCardReaderResult['insuranceInfo']): string {
  const provider = insuranceInfo?.provider?.trim();
  const burdenRatio = formatInsuranceBurdenRatio(insuranceInfo?.burdenRatio);

  if (provider && burdenRatio) return `読取 ${provider}（${burdenRatio}）`;
  if (burdenRatio) return `読取 ${burdenRatio}負担`;
  if (provider) return `読取 保険者${provider}`;
  return '読取 保険情報なし';
}

export function buildMynaReadInsuranceDisplay({
  patientInsuranceInfo,
  readerResult
}: {
  patientInsuranceInfo?: Patient['insuranceInfo'];
  readerResult: MynaCardReaderResult;
}): MynaReadInsuranceDisplay {
  const patientLabel = formatPatientInsuranceInfo(patientInsuranceInfo);

  if (readerResult.readerSource === 'mock') {
    return {
      status: 'demo',
      label: `${patientLabel} - デモ読取（実値維持）`,
      message: readerResult.readerMessage || 'デモ用のマイナ読取のため、患者登録値を維持しました。'
    };
  }

  const patientBurden = patientInsuranceInfo?.burdenRatio;
  const readerBurden = readerResult.insuranceInfo?.burdenRatio;
  if (
    Number.isFinite(patientBurden) &&
    Number.isFinite(readerBurden) &&
    patientBurden !== readerBurden
  ) {
    return {
      status: 'warning',
      label: `${patientLabel} / ${formatReaderInsuranceInfo(readerResult.insuranceInfo)}（要確認）`,
      message: 'マイナ読取結果と患者登録の負担割合が異なります。患者登録値を維持しています。'
    };
  }

  const label = patientLabel !== '保険情報未登録'
    ? patientLabel
    : formatReaderInsuranceInfo(readerResult.insuranceInfo);

  return {
    status: 'verified',
    label: `${label} - マイナ確認済`,
    message: readerResult.readerMessage || 'マイナ読取結果を確認しました。'
  };
}
