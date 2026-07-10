import type { Alert } from '@/db/types';

export interface PatientAlertDrugItem {
  itemId?: string;
  drugId?: string;
  drugName?: string;
  dispensedDrug?: string;
  genericName?: string;
}

export interface PatientAlertDrugWarning {
  alertType: 'allergy' | 'side_effect';
  severity: 'danger' | 'warning';
  title: string;
  message: string;
  matchedText: string;
  drugName: string;
  itemId?: string;
  alertId?: string;
}

type DrugPatientAlert = Alert & { type: 'allergy' | 'side_effect' };

const ALERT_TOKEN_SPLITTER = /[\s、,，;；／/]+/;
const ALERT_PREFIX_PATTERN = /^(アレルギー|副作用|注意|禁忌|疑い|既往|薬剤|薬品)[:：]/;
const MIN_TOKEN_LENGTH = 2;

export function isActivePatientAlert(alert: Alert): boolean {
  return alert.status !== 'resolved';
}

function isDrugPatientAlert(alert: Alert): alert is DrugPatientAlert {
  return isActivePatientAlert(alert) && (alert.type === 'allergy' || alert.type === 'side_effect');
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[　\s]/g, '')
    .replace(/[（）()[\]「」『』]/g, '');
}

export function tokenizePatientAlertContent(content: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();

  const addToken = (value: string) => {
    const cleaned = value.replace(ALERT_PREFIX_PATTERN, '').trim();
    const normalized = normalizeForMatch(cleaned);
    if (normalized.length < MIN_TOKEN_LENGTH || seen.has(normalized)) return;
    seen.add(normalized);
    tokens.push(cleaned);
  };

  for (const rawToken of content.split(ALERT_TOKEN_SPLITTER)) {
    const cleaned = rawToken.replace(ALERT_PREFIX_PATTERN, '').trim();
    addToken(cleaned);

    const causeMatch = cleaned.match(/^(.+?)(で|にて|による|服用後|内服後).*/);
    if (causeMatch) {
      addToken(causeMatch[1]);
    }
  }

  const fullText = content.trim();
  const normalizedFullText = normalizeForMatch(fullText);
  if (normalizedFullText.length >= MIN_TOKEN_LENGTH && !seen.has(normalizedFullText)) {
    tokens.push(fullText);
  }

  return tokens;
}

function getDrugName(item: PatientAlertDrugItem): string {
  return item.dispensedDrug || item.drugName || item.drugId || '薬品名未設定';
}

function matchesDrug(alertToken: string, drugName: string, genericName?: string): boolean {
  const normalizedToken = normalizeForMatch(alertToken);
  const normalizedDrugName = normalizeForMatch(drugName);

  if (normalizedToken.length < MIN_TOKEN_LENGTH) {
    return false;
  }

  if (normalizedDrugName.length >= MIN_TOKEN_LENGTH &&
      (normalizedDrugName.includes(normalizedToken) || normalizedToken.includes(normalizedDrugName))) {
    return true;
  }

  if (genericName) {
    const normalizedGeneric = normalizeForMatch(genericName);
    if (normalizedGeneric.length >= MIN_TOKEN_LENGTH &&
        (normalizedGeneric.includes(normalizedToken) || normalizedToken.includes(normalizedGeneric))) {
      return true;
    }
  }

  return false;
}

function stripAlertPrefix(content: string): string {
  return content.replace(ALERT_PREFIX_PATTERN, '').trim();
}

export function findPatientAlertDrugWarnings(
  alerts: Alert[],
  items: PatientAlertDrugItem[]
): PatientAlertDrugWarning[] {
  const warnings: PatientAlertDrugWarning[] = [];

  const activeAlerts = alerts.filter(isDrugPatientAlert);

  for (const alert of activeAlerts) {
    const tokens = tokenizePatientAlertContent(alert.content);
    if (tokens.length === 0) continue;

    for (const item of items) {
      const drugName = getDrugName(item);
      const genericName = item.genericName;
      const matchedText = tokens.find((token) => matchesDrug(token, drugName, genericName));
      if (!matchedText) continue;

      const isAllergy = alert.type === 'allergy';
      warnings.push({
        alertType: alert.type,
        severity: isAllergy ? 'danger' : 'warning',
        title: isAllergy ? '薬剤アレルギーに該当する可能性があります' : '過去副作用歴に該当する可能性があります',
        message: `${drugName} が患者アラート「${alert.content}」に一致しました。処方変更または疑義照会の要否を確認してください。`,
        matchedText,
        drugName,
        itemId: item.itemId,
        alertId: alert.alertId
      });
    }
  }

  return warnings;
}

export function formatPatientAlertLabel(alert: Alert): string {
  const content = stripAlertPrefix(alert.content);

  switch (alert.type) {
    case 'allergy':
      return `アレルギー: ${content}`;
    case 'side_effect':
      return `副作用歴: ${content}`;
    case 'chronic_disease':
      return `病名注意: ${content}`;
    default:
      return content;
  }
}
