/**
 * 患者年齢の計算正本
 * 和暦や不正な文字列など Date として解釈できない場合は undefined を返す。
 */
export function calculatePatientAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return Number.isFinite(age) ? age : undefined;
}
