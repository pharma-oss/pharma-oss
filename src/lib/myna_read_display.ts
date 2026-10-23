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

type PatientIdentity = Pick<Patient, 'name' | 'birthDate'> & { kana?: string };

function normalizeIdentityText(value: string | undefined): string {
  // 空白(全角含む)を除き、ひらがなをカタカナへ、全角半角をそろえて比べる
  return (value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[\u3041-\u3096]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
    .toLowerCase();
}

/**
 * 読み取った方が、いま開いている患者本人か。連携フォルダの結果は「直近に資格確認した人」のものなので、
 * 別の患者の結果を読んでも「確認済」と表示しないよう、生年月日(完全一致)と氏名(漢字またはカナ)で確かめる。
 */
export function checkMynaReadMatchesPatient(
  readerResult: Pick<MynaCardReaderResult, 'name' | 'kana' | 'birthDate'>,
  patient: PatientIdentity
): { matches: boolean; reason?: string } {
  if (readerResult.birthDate && patient.birthDate && readerResult.birthDate !== patient.birthDate) {
    return { matches: false, reason: '生年月日が選択中の患者と異なります。' };
  }
  const patientNames = [normalizeIdentityText(patient.name), normalizeIdentityText(patient.kana)].filter(Boolean);
  const readerNames = [normalizeIdentityText(readerResult.name), normalizeIdentityText(readerResult.kana)].filter(Boolean);
  if (patientNames.length > 0 && readerNames.length > 0 && !readerNames.some((name) => patientNames.includes(name))) {
    return { matches: false, reason: '氏名が選択中の患者と異なります。' };
  }
  return { matches: true };
}

export function buildMynaReadInsuranceDisplay({
  patientInsuranceInfo,
  patient,
  readerResult
}: {
  patientInsuranceInfo?: Patient['insuranceInfo'];
  /** 選択中の患者。渡すと、読み取った方が本人かどうかも確かめる。 */
  patient?: PatientIdentity;
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

  if (patient) {
    const identity = checkMynaReadMatchesPatient(readerResult, patient);
    if (!identity.matches) {
      return {
        status: 'warning',
        label: `${patientLabel} / 読取 ${readerResult.name}（別の方のおそれ）`,
        message: `${identity.reason}別の患者の資格確認結果を読み取った可能性があります。患者を確認してください。`
      };
    }
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

// ------------------------------------------------------------------
// 受付画面(/ocr)でマイナ読取の結果を入れるときの補助
// ------------------------------------------------------------------

/** 受付の「保険者番号」欄(半角数字6〜10桁)に入れる値。保険者番号を優先し、数字でなければ入れない。 */
export function pickReceptionInsuranceNumber(insuranceInfo?: MynaCardReaderResult['insuranceInfo']): string {
  const isInsurerNumber = (value?: string) => !!value && /^\d{6,10}$/.test(value.trim());
  if (isInsurerNumber(insuranceInfo?.provider)) return insuranceInfo!.provider!.trim();
  if (isInsurerNumber(insuranceInfo?.number)) return insuranceInfo!.number!.trim();
  return '';
}

// readerCheckedAt は UTC のISO文字列。画面には端末の時刻(日本時間)で見せないと、15時の受付が6時に見えてしまう
function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 取り込む前に薬剤師が目で確認するための文面(患者の前で読み上げて照合できる項目だけ)。 */
export function buildMynaReadConfirmationMessage(result: MynaCardReaderResult): string {
  const lines = [
    '次の内容を受付欄に入れます。目の前の患者のものか確認してください。',
    '',
    `氏名: ${result.name}${result.kana ? `（${result.kana}）` : ''}`,
    `生年月日: ${result.birthDate}`
  ];
  if (result.insuranceInfo?.provider) lines.push(`保険者番号: ${result.insuranceInfo.provider}`);
  if (result.insuranceInfo?.number) lines.push(`記号・番号: ${result.insuranceInfo.number}`);
  const burden = formatInsuranceBurdenRatio(result.insuranceInfo?.burdenRatio);
  lines.push(burden ? `負担割合: ${burden}` : '負担割合: 読取結果に無いため、受付欄の選択のままです');
  lines.push(`読取時刻: ${formatLocalDateTime(result.readerCheckedAt)}`);
  return lines.join('\n');
}

export type MynaReaderAvailabilityState =
  | { status: 'checking' }
  | { status: 'ready'; available: boolean; reason?: string };

export interface MynaReaderButtonView {
  disabled: boolean;
  label: string;
  title?: string;
}

/** 状態APIの結果から、マイナ読取ボタンの表示(押せるか・文言・補足)を決める。 */
export function getMynaReaderButtonView(state: MynaReaderAvailabilityState, baseLabel: string): MynaReaderButtonView {
  if (state.status === 'checking') {
    return { disabled: true, label: baseLabel, title: 'マイナ読取が使えるか確認しています。' };
  }
  if (!state.available) {
    return { disabled: true, label: `${baseLabel}（未設定）`, title: state.reason || 'マイナ読取の接続先が未設定です。' };
  }
  return { disabled: false, label: baseLabel };
}
