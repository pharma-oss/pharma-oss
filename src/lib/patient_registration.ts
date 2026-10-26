import type { Patient } from '@/db/types';
import { runWithAuditRollback } from '@/lib/audit_guard';
import { parseFlexibleDateInput } from '@/lib/date_input';
import type { MynaCardReaderResult } from '@/lib/myna_card_reader';
import { findMatchingPatient } from '@/lib/patient_matching';

// 処方箋受付の前に行う、新規患者の登録。
//
// 保険情報の持ち方は、薬歴の保険設定(PatientBanner)・レセプト出力(UKE)・マイナ読取の結果と同じ:
//   insuranceInfo.provider = 保険者番号(半角数字6桁または8桁)
//   insuranceInfo.number   = 記号・番号(「記号12 番号345」のような文字列)

export type PatientGender = NonNullable<Patient['gender']>;
export type RegistrationBurdenRatio = '10' | '20' | '30';

export interface PatientRegistrationForm {
  name: string;
  kana: string;
  /** 入力のまま(半角8桁・区切り付きなど)。検証で YYYY-MM-DD にそろえる。 */
  birthDate: string;
  gender: '' | PatientGender;
  /** 保険者番号 */
  insurerNumber: string;
  /** 記号・番号 */
  insuredNumber: string;
  burdenRatio: RegistrationBurdenRatio;
}

export const EMPTY_PATIENT_REGISTRATION_FORM: PatientRegistrationForm = {
  name: '',
  kana: '',
  birthDate: '',
  gender: '',
  insurerNumber: '',
  insuredNumber: '',
  burdenRatio: '30'
};

export type PatientRegistrationField = keyof PatientRegistrationForm;

export interface ValidatedPatientRegistration {
  name: string;
  kana: string;
  birthDate: string;
  gender: PatientGender;
  insurerNumber: string;
  insuredNumber: string;
  burdenRatio: number;
}

export type PatientRegistrationValidation =
  | { ok: true; value: ValidatedPatientRegistration }
  | { ok: false; errors: Partial<Record<PatientRegistrationField, string>> };

const NAME_MAX_LENGTH = 100;
const KANA_MAX_LENGTH = 100;
const INSURED_NUMBER_MAX_LENGTH = 50;
const INSURER_NUMBER_PATTERN = /^(\d{6}|\d{8})$/;

function toKatakana(value: string): string {
  return value.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

/** フリガナは、全角カタカナにそろえ、空白は半角1つにする(ヤマダ タロウ)。 */
export function normalizeKana(value: string): string {
  return toKatakana(value.normalize('NFKC')).replace(/\s+/g, ' ').trim();
}

function isGender(value: string): value is PatientGender {
  return value === 'male' || value === 'female' || value === 'other';
}

export function validatePatientRegistration(
  form: PatientRegistrationForm,
  now: Date = new Date()
): PatientRegistrationValidation {
  const errors: Partial<Record<PatientRegistrationField, string>> = {};

  const name = form.name.trim();
  if (!name) errors.name = '氏名を入力してください。';
  else if (name.length > NAME_MAX_LENGTH) errors.name = `氏名は${NAME_MAX_LENGTH}文字以内で入力してください。`;

  const kana = normalizeKana(form.kana);
  if (kana.length > KANA_MAX_LENGTH) errors.kana = `フリガナは${KANA_MAX_LENGTH}文字以内で入力してください。`;

  const birthDateInput = form.birthDate.trim();
  const birthDate = parseFlexibleDateInput(birthDateInput.normalize('NFKC'));
  if (!birthDateInput) {
    errors.birthDate = '生年月日を入力してください。';
  } else if (!birthDate) {
    errors.birthDate = '生年月日を正しく入力してください(例: 19850315)。';
  } else if (birthDate > toLocalDateKey(now)) {
    errors.birthDate = '生年月日が未来の日付になっています。';
  }

  if (!isGender(form.gender)) errors.gender = '性別を選んでください。';

  const insurerNumber = form.insurerNumber.normalize('NFKC').replace(/[\s-]/g, '');
  if (insurerNumber && !INSURER_NUMBER_PATTERN.test(insurerNumber)) {
    errors.insurerNumber = '保険者番号は半角数字の6桁または8桁で入力してください。';
  }

  const insuredNumber = form.insuredNumber.normalize('NFKC').trim();
  if (insuredNumber.length > INSURED_NUMBER_MAX_LENGTH) {
    errors.insuredNumber = `記号・番号は${INSURED_NUMBER_MAX_LENGTH}文字以内で入力してください。`;
  }

  if (Object.keys(errors).length > 0 || !birthDate || !isGender(form.gender)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      name,
      kana,
      birthDate,
      gender: form.gender,
      insurerNumber,
      insuredNumber,
      burdenRatio: Number(form.burdenRatio)
    }
  };
}

// 端末のローカル日付(YYYY-MM-DD)。toISOString() は UTC なので、日本時間の朝9時前は前日になってしまう。
function toLocalDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildPatientRecord(value: ValidatedPatientRegistration, patientId: string): Patient {
  return {
    patientId,
    name: value.name,
    kana: value.kana,
    birthDate: value.birthDate,
    gender: value.gender,
    insuranceInfo: {
      ...(value.insurerNumber ? { provider: value.insurerNumber } : {}),
      ...(value.insuredNumber ? { number: value.insuredNumber } : {}),
      burdenRatio: value.burdenRatio
    }
  };
}

function toBurdenRatio(value: number | undefined, fallback: RegistrationBurdenRatio): RegistrationBurdenRatio {
  return value === 10 || value === 20 || value === 30 ? String(value) as RegistrationBurdenRatio : fallback;
}

/** マイナ読取の結果から、登録フォームの初期値を作る。読み取れなかった項目は空のまま(性別は未選択)にする。 */
export function buildPatientRegistrationFormFromMyna(
  result: Pick<MynaCardReaderResult, 'name' | 'kana' | 'birthDate' | 'gender' | 'insuranceInfo'>,
  fallbackBurdenRatio: RegistrationBurdenRatio = EMPTY_PATIENT_REGISTRATION_FORM.burdenRatio
): PatientRegistrationForm {
  const provider = (result.insuranceInfo?.provider || '').normalize('NFKC').replace(/[\s-]/g, '');
  const insuredNumber = (result.insuranceInfo?.number || '').normalize('NFKC').trim();
  return {
    name: (result.name || '').trim(),
    kana: normalizeKana(result.kana || ''),
    birthDate: parseFlexibleDateInput(result.birthDate) || result.birthDate || '',
    gender: result.gender && isGender(result.gender) ? result.gender : '',
    // 保険者番号の欄には、保険者番号(数字)だけを入れる。「社保」のような種別は入れない。
    insurerNumber: INSURER_NUMBER_PATTERN.test(provider) ? provider : '',
    insuredNumber,
    burdenRatio: toBurdenRatio(result.insuranceInfo?.burdenRatio, fallbackBurdenRatio)
  };
}

/**
 * いま入力済みのフォームに、マイナ読取の内容を重ねる。マイナで読めた項目は上書きし、読めなかった項目は
 * 入力済みの値を残す(カナが無い読取結果で、手で入れたカナを消さない)。
 */
export function applyMynaToRegistrationForm(
  current: PatientRegistrationForm,
  result: Pick<MynaCardReaderResult, 'name' | 'kana' | 'birthDate' | 'gender' | 'insuranceInfo'>
): PatientRegistrationForm {
  const fromMyna = buildPatientRegistrationFormFromMyna(result, current.burdenRatio);
  return {
    name: fromMyna.name || current.name,
    kana: fromMyna.kana || current.kana,
    birthDate: fromMyna.birthDate || current.birthDate,
    gender: fromMyna.gender || current.gender,
    insurerNumber: fromMyna.insurerNumber || current.insurerNumber,
    insuredNumber: fromMyna.insuredNumber || current.insuredNumber,
    burdenRatio: fromMyna.burdenRatio
  };
}

// RxDB のドキュメント。toJSON() は読み取り専用の型を返すので、ここでは unknown として受け、Patient として読む。
interface PatientDocumentLike {
  toJSON: () => unknown;
}

export interface PatientRegistrationDb {
  patients: {
    find: () => { exec: () => Promise<PatientDocumentLike[]> };
    insert: (doc: Patient) => Promise<PatientDocumentLike>;
    findOne: (id: string) => { exec: () => Promise<{ remove: () => Promise<unknown> } | null> };
  };
}

export type PatientRegistrationOutcome =
  /** doc は、受付で続けて使う登録直後のドキュメント */
  | { status: 'registered'; patient: Patient; doc: PatientDocumentLike }
  /** 同じ氏名・生年月日の患者がすでにいる。登録せず、その患者を返す。 */
  | { status: 'duplicate'; patient: Patient };

export const PATIENT_REGISTRATION_AUDIT_FAILED_MESSAGE =
  '監査ログを記録できなかったため、患者登録を取り消しました。';

/**
 * 患者を登録する。同じ氏名・生年月日の患者がいれば、二重に作らずその患者を返す。
 * 書き込み -> 監査ログ。監査ログが残らなければ登録を取り消し、AuditLogFailedError を投げる。
 */
export async function registerPatient(params: {
  db: PatientRegistrationDb;
  value: ValidatedPatientRegistration;
  generatePatientId: () => string;
  logAudit: (patient: Patient) => Promise<boolean>;
}): Promise<PatientRegistrationOutcome> {
  const { db, value, generatePatientId, logAudit } = params;

  const existingDocs = await db.patients.find().exec();
  const existing = existingDocs.map((doc) => doc.toJSON() as Patient);
  const duplicate = findMatchingPatient(existing, { name: value.name, birthDate: value.birthDate });
  if (duplicate) return { status: 'duplicate', patient: duplicate.patient };

  const patient = buildPatientRecord(value, generatePatientId());
  const doc = await runWithAuditRollback({
    write: () => db.patients.insert(patient),
    logAudit: () => logAudit(patient),
    rollback: async () => {
      await (await db.patients.findOne(patient.patientId).exec())?.remove();
    },
    failureMessage: PATIENT_REGISTRATION_AUDIT_FAILED_MESSAGE
  });
  return { status: 'registered', patient: doc.toJSON() as Patient, doc };
}
