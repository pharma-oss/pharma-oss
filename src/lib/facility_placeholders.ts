// 初期状態の施設情報に入っていた見本の適格請求書登録番号。実在の番号に見えるが、設定されたものではない。
// 初期設定チェックリスト(onboarding.ts)はこの値を「未設定」として扱う。
export const PLACEHOLDER_REGISTRATION_NUMBER = 'T1234567890123';

// 帳票に印字してよい、設定済みの登録番号か。空欄と見本の値は印字しない。
export function hasRealRegistrationNumber(value: unknown): boolean {
  const normalized = String(value ?? '').trim();
  return normalized !== '' && normalized !== PLACEHOLDER_REGISTRATION_NUMBER;
}
