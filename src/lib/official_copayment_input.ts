// 一部負担金額の入力（HO第9項目・KO第7/第9項目）。
//
// 窓口で実際に徴収した額を記録する項目で、点数×負担割合からは算出しない。
// 高額療養費の現物給付・世帯合算・処方元医療機関との関係で変わるため、
// 算出すると患者への請求額を誤る。
//
// 検証は公式UKEの書き出し側 (dispensing_uke_official.ts の assertOptionalDigits)
// と同じ規則にしてある。出力時ではなく入力時に気づけるようにするため。

/** 公式UKEの一部負担金額の桁数上限 */
export const OFFICIAL_COPAYMENT_MAX_DIGITS = 8;

export interface OfficialCopaymentPublicExpenseDraft {
  /** KO第7項目 公費の一部負担金額 */
  copaymentYen: string;
  /** KO第9項目 公費負担額 */
  publicBenefitCopaymentYen: string;
}

export interface OfficialCopaymentDraft {
  /** HO第9項目 保険の一部負担金額 */
  insuranceYen: string;
  /** 公費ごと。patient.publicInsurances と同じ並びで対応させる */
  publicExpenses: OfficialCopaymentPublicExpenseDraft[];
}

export interface OfficialCopaymentIssue {
  code: string;
  message: string;
  /** 画面で入力欄を指すための識別子 */
  field: string;
}

export interface OfficialCopaymentValue {
  copaymentYen?: number;
  publicBenefitCopaymentYen?: number;
}

export interface OfficialCopaymentParseResult {
  insuranceCopaymentYen?: number;
  /** 末尾の空欄は落とす。間の空欄は並びを保つために残す */
  publicExpenseCopayments?: OfficialCopaymentValue[];
  issues: OfficialCopaymentIssue[];
}

/** 全角数字と桁区切りを受け付ける（窓口では ¥1,250 の形で控えていることがある） */
function normalizeAmountText(value: string): string {
  return String(value ?? '')
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s¥￥]/g, '')
    .trim();
}

interface ParsedAmount {
  value?: number;
  issue?: Omit<OfficialCopaymentIssue, 'field'>;
}

function parseAmount(raw: string, label: string): ParsedAmount {
  const text = normalizeAmountText(raw);
  if (text === '') return {};

  if (!/^\d+$/.test(text)) {
    return {
      issue: {
        code: 'copayment_not_a_whole_yen',
        message: `${label}は円単位の整数で入れてください（マイナス・小数は使えません）。`
      }
    };
  }
  if (text.replace(/^0+(?=\d)/, '').length > OFFICIAL_COPAYMENT_MAX_DIGITS) {
    return {
      issue: {
        code: 'copayment_too_many_digits',
        message: `${label}は${OFFICIAL_COPAYMENT_MAX_DIGITS}桁以内で入れてください。`
      }
    };
  }
  return { value: Number(text) };
}

function isBlankValue(value: OfficialCopaymentValue): boolean {
  return value.copaymentYen === undefined && value.publicBenefitCopaymentYen === undefined;
}

/**
 * 入力欄を claimOptions に入れる形へ直す。
 *
 * 空欄は「記録しない」であって 0円ではない。0円を記録したいなら 0 と入れる。
 */
export function parseOfficialCopaymentDraft(draft: OfficialCopaymentDraft): OfficialCopaymentParseResult {
  const issues: OfficialCopaymentIssue[] = [];

  const insurance = parseAmount(draft?.insuranceYen ?? '', '保険の一部負担金額');
  if (insurance.issue) issues.push({ ...insurance.issue, field: 'insurance' });

  const publicExpenses: OfficialCopaymentValue[] = (draft?.publicExpenses ?? []).map((row, index) => {
    const copayment = parseAmount(row?.copaymentYen ?? '', `公費${index + 1}の一部負担金額`);
    if (copayment.issue) issues.push({ ...copayment.issue, field: `public-${index}-copayment` });

    const benefit = parseAmount(row?.publicBenefitCopaymentYen ?? '', `公費${index + 1}の公費負担額`);
    if (benefit.issue) issues.push({ ...benefit.issue, field: `public-${index}-benefit` });

    return {
      ...(copayment.value === undefined ? {} : { copaymentYen: copayment.value }),
      ...(benefit.value === undefined ? {} : { publicBenefitCopaymentYen: benefit.value })
    };
  });

  // 末尾の空欄は落とす。間の空欄は公費の並びと対応させるために残す。
  let end = publicExpenses.length;
  while (end > 0 && isBlankValue(publicExpenses[end - 1])) end -= 1;
  const trimmed = publicExpenses.slice(0, end);

  return {
    ...(insurance.value === undefined ? {} : { insuranceCopaymentYen: insurance.value }),
    ...(trimmed.length === 0 ? {} : { publicExpenseCopayments: trimmed }),
    issues
  };
}

/**
 * 入力欄1つ分の変更を下書きへ反映する。
 *
 * 欄の識別子は検証の指摘 (issue.field) と同じものを使う。
 * 公費の欄は「何番目のどちらの金額か」を取り違えると、別の公費に付いてしまう。
 */
export function applyOfficialCopaymentFieldChange(
  draft: OfficialCopaymentDraft,
  field: string,
  value: string
): OfficialCopaymentDraft {
  if (field === 'insurance') {
    return { ...draft, insuranceYen: value };
  }

  const matched = /^public-(\d+)-(copayment|benefit)$/.exec(field);
  if (!matched) return draft;

  const index = Number(matched[1]);
  if (!Number.isInteger(index) || index < 0 || index >= draft.publicExpenses.length) return draft;

  return {
    ...draft,
    publicExpenses: draft.publicExpenses.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return matched[2] === 'copayment'
        ? { ...row, copaymentYen: value }
        : { ...row, publicBenefitCopaymentYen: value };
    })
  };
}

/** 保存済みの値を入力欄へ読み込む */
export function toOfficialCopaymentDraft(
  options: {
    officialInsuranceCopaymentYen?: number;
    officialPublicExpenseCopayments?: OfficialCopaymentValue[];
  } | undefined,
  publicInsuranceCount: number
): OfficialCopaymentDraft {
  const stored = options?.officialPublicExpenseCopayments ?? [];
  return {
    insuranceYen: options?.officialInsuranceCopaymentYen === undefined
      ? ''
      : String(options.officialInsuranceCopaymentYen),
    publicExpenses: Array.from({ length: publicInsuranceCount }, (_, index) => ({
      copaymentYen: stored[index]?.copaymentYen === undefined ? '' : String(stored[index].copaymentYen),
      publicBenefitCopaymentYen: stored[index]?.publicBenefitCopaymentYen === undefined
        ? ''
        : String(stored[index].publicBenefitCopaymentYen)
    }))
  };
}

function formatYen(value?: number): string {
  return value === undefined ? '未記録' : `${value.toLocaleString('ja-JP')}円`;
}

/** 画面と監査ログで同じ文言を使う */
export function buildOfficialCopaymentAuditDetail(
  before: {
    officialInsuranceCopaymentYen?: number;
    officialPublicExpenseCopayments?: OfficialCopaymentValue[];
  } | undefined,
  after: OfficialCopaymentParseResult
): string {
  const parts = [
    `保険 ${formatYen(before?.officialInsuranceCopaymentYen)} → ${formatYen(after.insuranceCopaymentYen)}`
  ];
  const beforePublic = before?.officialPublicExpenseCopayments ?? [];
  const afterPublic = after.publicExpenseCopayments ?? [];
  const count = Math.max(beforePublic.length, afterPublic.length);
  for (let index = 0; index < count; index += 1) {
    parts.push(
      `公費${index + 1} 一部負担 ${formatYen(beforePublic[index]?.copaymentYen)} → ${formatYen(afterPublic[index]?.copaymentYen)}`
      + ` / 公費負担 ${formatYen(beforePublic[index]?.publicBenefitCopaymentYen)} → ${formatYen(afterPublic[index]?.publicBenefitCopaymentYen)}`
    );
  }
  return `一部負担金額の記録: ${parts.join(' / ')}`;
}

/** 保存する必要があるか。同じ値なら監査ログに中身の無い記録を残さない */
export function isOfficialCopaymentChanged(
  before: {
    officialInsuranceCopaymentYen?: number;
    officialPublicExpenseCopayments?: OfficialCopaymentValue[];
  } | undefined,
  after: OfficialCopaymentParseResult
): boolean {
  if ((before?.officialInsuranceCopaymentYen) !== after.insuranceCopaymentYen) return true;
  const beforePublic = before?.officialPublicExpenseCopayments ?? [];
  const afterPublic = after.publicExpenseCopayments ?? [];
  if (beforePublic.length !== afterPublic.length) return true;
  return beforePublic.some((row, index) =>
    row?.copaymentYen !== afterPublic[index]?.copaymentYen
    || row?.publicBenefitCopaymentYen !== afterPublic[index]?.publicBenefitCopaymentYen);
}
