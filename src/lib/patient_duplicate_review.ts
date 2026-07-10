// 患者マスタ全体の重複候補点検(名寄せ)。
// 受付時の候補提示(patient_matching)と違い、登録済みの全患者を横断して
// 「同姓同名・同生年月日」「同カナ・同生年月日」のグループを洗い出し、
// 設定画面の統合導線(patient_merge)へつなぐ。
import type { Patient, Visit } from '../db/types.ts';
import { isDemoPatientId } from './demo_data.ts';
import { normalizePatientName } from './patient_matching.ts';

export type PatientDuplicateMatchType = 'name_birthdate' | 'kana_birthdate';

export interface PatientDuplicateMember {
  patientId: string;
  name: string;
  kana: string;
  birthDate: string;
  insuranceNumber: string;
  visitCount: number;
  latestVisitDate: string;
}

export interface PatientDuplicateGroup {
  groupId: string;
  matchType: PatientDuplicateMatchType;
  matchLabel: string;
  displayName: string;
  birthDate: string;
  // 統合先の推奨(受付が多い→直近来局が新しい順)を先頭に並べる
  members: PatientDuplicateMember[];
  suggestedTargetPatientId: string;
}

export interface PatientDuplicateScanReport {
  scannedPatientCount: number;
  groups: PatientDuplicateGroup[];
  duplicatePatientCount: number;
}

const MATCH_LABELS: Record<PatientDuplicateMatchType, string> = {
  name_birthdate: '氏名と生年月日が一致',
  kana_birthdate: 'カナと生年月日が一致'
};

// カナ比較はひらがな・カタカナの表記ゆれを吸収する
function normalizePatientKana(value: string): string {
  const halfNormalized = normalizePatientName(value || '');
  return halfNormalized.replace(/[ぁ-ゖ]/g, (char) => (
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  ));
}

function buildMember(
  patient: Patient,
  visitStats: Map<string, { count: number; latestIssueDate: string }>
): PatientDuplicateMember {
  const stats = visitStats.get(patient.patientId);
  return {
    patientId: patient.patientId,
    name: patient.name || '',
    kana: patient.kana || '',
    birthDate: patient.birthDate || '',
    insuranceNumber: patient.insuranceInfo?.number || '',
    visitCount: stats?.count || 0,
    latestVisitDate: stats?.latestIssueDate || ''
  };
}

function sortMembers(members: PatientDuplicateMember[]): PatientDuplicateMember[] {
  return [...members].sort((left, right) => (
    right.visitCount - left.visitCount ||
    right.latestVisitDate.localeCompare(left.latestVisitDate) ||
    left.patientId.localeCompare(right.patientId)
  ));
}

export function buildPatientVisitStats(
  visits: Array<Pick<Visit, 'patientId' | 'issueDate'>>
): Map<string, { count: number; latestIssueDate: string }> {
  const stats = new Map<string, { count: number; latestIssueDate: string }>();
  for (const visit of visits) {
    if (!visit.patientId) continue;
    const entry = stats.get(visit.patientId) || { count: 0, latestIssueDate: '' };
    entry.count++;
    const issueDate = visit.issueDate || '';
    if (issueDate.localeCompare(entry.latestIssueDate) > 0) {
      entry.latestIssueDate = issueDate;
    }
    stats.set(visit.patientId, entry);
  }
  return stats;
}

export function findDuplicatePatientGroups(
  patients: Patient[],
  visits: Array<Pick<Visit, 'patientId' | 'issueDate'>> = []
): PatientDuplicateScanReport {
  const visitStats = buildPatientVisitStats(visits);
  // チュートリアルのデモ患者は「デモデータを片づける」で消す前提のため対象外
  const targets = patients.filter((patient) => !isDemoPatientId(patient.patientId));

  const byNameKey = new Map<string, Patient[]>();
  const byKanaKey = new Map<string, Patient[]>();
  for (const patient of targets) {
    const birthDate = String(patient.birthDate || '').trim();
    if (!birthDate) continue;
    const nameKey = normalizePatientName(patient.name || '');
    if (nameKey) {
      const key = `${nameKey}|${birthDate}`;
      byNameKey.set(key, [...(byNameKey.get(key) || []), patient]);
    }
    const kanaKey = normalizePatientKana(patient.kana || '');
    if (kanaKey) {
      const key = `${kanaKey}|${birthDate}`;
      byKanaKey.set(key, [...(byKanaKey.get(key) || []), patient]);
    }
  }

  const groups: PatientDuplicateGroup[] = [];
  const groupedMemberSets: Set<string>[] = [];

  const addGroup = (matchType: PatientDuplicateMatchType, groupPatients: Patient[]) => {
    const memberIds = new Set(groupPatients.map((patient) => patient.patientId));
    // 氏名一致グループに完全に含まれるカナ一致グループは重複表示しない
    const alreadyCovered = groupedMemberSets.some((existing) => (
      memberIds.size <= existing.size && [...memberIds].every((id) => existing.has(id))
    ));
    if (alreadyCovered) return;
    groupedMemberSets.push(memberIds);

    const members = sortMembers(groupPatients.map((patient) => buildMember(patient, visitStats)));
    groups.push({
      groupId: `dup_${matchType}_${members.map((member) => member.patientId).join('_')}`,
      matchType,
      matchLabel: MATCH_LABELS[matchType],
      displayName: members[0].name || members[0].kana,
      birthDate: members[0].birthDate,
      members,
      suggestedTargetPatientId: members[0].patientId
    });
  };

  for (const groupPatients of byNameKey.values()) {
    if (groupPatients.length >= 2) addGroup('name_birthdate', groupPatients);
  }
  for (const groupPatients of byKanaKey.values()) {
    if (groupPatients.length >= 2) addGroup('kana_birthdate', groupPatients);
  }

  groups.sort((left, right) => (
    right.members.length - left.members.length ||
    left.displayName.localeCompare(right.displayName, 'ja')
  ));

  const duplicatePatientIds = new Set<string>();
  for (const group of groups) {
    for (const member of group.members) duplicatePatientIds.add(member.patientId);
  }

  return {
    scannedPatientCount: targets.length,
    groups,
    duplicatePatientCount: duplicatePatientIds.size
  };
}

// 監査ログ用の要約。件数のみで患者名は含めない。
export function buildPatientDuplicateScanAuditDetail(report: PatientDuplicateScanReport): string {
  return `患者重複点検: 対象${report.scannedPatientCount}名 / 重複候補${report.groups.length}グループ・${report.duplicatePatientCount}名`;
}
