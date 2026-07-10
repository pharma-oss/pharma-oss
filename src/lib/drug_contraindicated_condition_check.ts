import type { Alert, DrugInfo, VisitInitialQuestionnaire } from '@/db/types';

export interface ContraindicatedConditionPrescriptionItem {
  itemId?: string;
  drugId?: string;
  drugName: string;
}

export interface ContraindicatedConditionWarning {
  drug: string;
  drugItemId?: string;
  conditionText: string;
  matchedPatientCondition: string;
  reason?: string;
  sourceUrl: string;
}

export interface ContraindicatedConditionCheckResult {
  warnings: ContraindicatedConditionWarning[];
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s　、。]/g, '');
}

function isNegativeConditionToken(value: string): boolean {
  const normalized = normalizeForMatch(value).replace(/[・\-ー―]/g, '');
  return /^(該当なし|なし|無し|特になし|特記なし|ありません|いいえ|無|no|na|n\/a)$/.test(normalized);
}

function splitPatientConditionText(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[\n\r、,，;；／/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !isNegativeConditionToken(token));
}

function addUnique(target: string[], value: string) {
  const trimmed = value.trim();
  if (!trimmed || isNegativeConditionToken(trimmed)) return;
  if (!target.includes(trimmed)) target.push(trimmed);
}

function expandPatientConditionText(value: string): string[] {
  const expanded: string[] = [];
  addUnique(expanded, value);

  const normalized = normalizeForMatch(value);
  if (/妊娠|妊婦/.test(normalized)) {
    addUnique(expanded, '妊婦');
    addUnique(expanded, '妊娠している可能性のある女性');
  }
  if (/授乳|授乳婦/.test(normalized)) {
    addUnique(expanded, '授乳婦');
    addUnique(expanded, '授乳中');
  }
  if (/(腎障害|腎機能障害|腎機能低下|腎不全|透析)/.test(normalized)) {
    addUnique(expanded, '腎臓に障害');
    addUnique(expanded, '腎機能障害');
  }
  if (/(肝障害|肝機能障害|肝機能低下|肝不全|肝疾患|child-pugh)/i.test(value)) {
    addUnique(expanded, '肝臓に障害');
    addUnique(expanded, '肝機能障害');
    addUnique(expanded, '肝疾患');
  }

  return expanded;
}

export interface ContraindicatedConditionPatientContext {
  alerts?: Alert[];
  initialQuestionnaire?: Pick<VisitInitialQuestionnaire, 'medicalHistory' | 'currentSymptoms' | 'pregnancyLactation'> | null;
}

/**
 * PMDA禁忌条件との突き合わせに使う患者状態を、薬歴アラートと初回質問表から集める。
 * 「該当なし」は除外し、妊娠中のような現場の短い表現は添付文書側の表記にも当たりやすい語へ広げる。
 */
export function buildContraindicatedConditionPatientTexts(context: ContraindicatedConditionPatientContext): string[] {
  const texts: string[] = [];

  for (const alert of context.alerts || []) {
    if (alert.status === 'resolved' || alert.type !== 'chronic_disease') continue;
    for (const token of splitPatientConditionText(alert.content)) {
      for (const expanded of expandPatientConditionText(token)) addUnique(texts, expanded);
    }
  }

  const questionnaire = context.initialQuestionnaire;
  for (const value of [
    questionnaire?.medicalHistory,
    questionnaire?.currentSymptoms,
    questionnaire?.pregnancyLactation
  ]) {
    for (const token of splitPatientConditionText(value)) {
      for (const expanded of expandPatientConditionText(token)) addUnique(texts, expanded);
    }
  }

  return texts;
}

/**
 * PMDA添付文書の禁忌条件文（「閉塞隅角緑内障の患者」等）は薬歴上の患者アラート（「緑内障」等）より
 * 冗長なため、どちらかがどちらかを部分一致で含んでいれば一致とみなす。
 */
function matchesPatientCondition(conditionText: string, patientCondition: string): boolean {
  const normalizedCondition = normalizeForMatch(conditionText);
  if (normalizedCondition.length < 2) return false;
  for (const candidate of expandPatientConditionText(patientCondition)) {
    const normalizedPatientCondition = normalizeForMatch(candidate);
    if (normalizedPatientCondition.length < 2) continue;
    if (
      normalizedCondition.includes(normalizedPatientCondition) ||
      normalizedPatientCondition.includes(normalizedCondition)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 処方薬の禁忌（PMDA添付文書 2.禁忌章由来、疾患・妊娠・肝腎機能等）を、患者の慢性疾患アラートと
 * 突き合わせる。薬剤同士の相互作用（drug_interaction_check.ts）とは別の、患者状態ベースのチェック。
 */
export function findContraindicatedConditionWarnings(
  prescribedItems: ContraindicatedConditionPrescriptionItem[],
  patientConditions: string[],
  drugInfoByDrugName: Map<string, DrugInfo[]>
): ContraindicatedConditionCheckResult {
  const warnings: ContraindicatedConditionWarning[] = [];

  for (const item of prescribedItems) {
    const infos = drugInfoByDrugName.get(item.drugName);
    if (!infos || infos.length === 0) continue;
    const info = infos[0];

    for (const condition of info.contraindicatedConditions || []) {
      const matchedPatientCondition = patientConditions.find((patientCondition) =>
        matchesPatientCondition(condition.conditionText, patientCondition)
      );
      if (matchedPatientCondition) {
        warnings.push({
          drug: item.drugName,
          drugItemId: item.itemId,
          conditionText: condition.conditionText,
          matchedPatientCondition,
          reason: condition.reason,
          sourceUrl: condition.sourceUrl
        });
      }
    }
  }

  return { warnings };
}
