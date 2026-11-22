import type {
  Patient,
  PatientClinicalProfile,
  PatientLabResult,
  PatientLactationStatus,
  PatientOtcSupplement,
  PatientPregnancyStatus,
  VisitElectronicPrescriptionLaboratoryResult
} from '../db/types.ts';
import { patchWithAuditRollback } from './doc_audit_write.ts';
import { parseFlexibleDateInput } from './date_input.ts';
import type { PatchableDocument } from './rxdb_restore.ts';

export const LAB_RESULT_STALENESS_DAYS = 90;

export const PREGNANCY_STATUS_LABELS: Record<PatientPregnancyStatus, string> = {
  unknown: '未確認',
  not_pregnant: '妊娠なし',
  pregnant: '妊娠中',
  possibly_pregnant: '妊娠の可能性あり'
};

export const LACTATION_STATUS_LABELS: Record<PatientLactationStatus, string> = {
  unknown: '未確認',
  not_lactating: '授乳なし',
  lactating: '授乳中'
};

export const OTC_CATEGORY_LABELS: Record<NonNullable<PatientOtcSupplement['category']>, string> = {
  otc: '市販薬 (OTC)',
  supplement: 'サプリメント',
  kampo: '市販漢方',
  other: 'その他'
};

export interface LabResultFreshness {
  status: 'fresh' | 'stale' | 'unknown_date';
  ageDays: number | null;
  label: string;
}

function parseDateMidnightMs(value: string | undefined | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const flexible = parseFlexibleDateInput(trimmed.slice(0, 10));
  if (flexible) {
    const [y, m, d] = flexible.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const dt = new Date(parsed);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
}

export function evaluateLabResultFreshness(
  measuredAt: string | undefined | null,
  basisDate: Date = new Date()
): LabResultFreshness {
  const measuredMs = parseDateMidnightMs(measuredAt);
  if (measuredMs === null) {
    return {
      status: 'unknown_date',
      ageDays: null,
      label: '測定日不明（要再確認）'
    };
  }
  const basisMs = new Date(basisDate.getFullYear(), basisDate.getMonth(), basisDate.getDate()).getTime();
  const ageDays = Math.floor((basisMs - measuredMs) / 86_400_000);
  if (ageDays > LAB_RESULT_STALENESS_DAYS) {
    return {
      status: 'stale',
      ageDays,
      label: `参考値（${LAB_RESULT_STALENESS_DAYS}日超過・要再確認）`
    };
  }
  return {
    status: 'fresh',
    ageDays: Math.max(0, ageDays),
    label: `有効（${LAB_RESULT_STALENESS_DAYS}日以内）`
  };
}

function normalizeLabTestKey(testName: string): string {
  const compact = testName.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
  if (compact.includes('egfr')) return 'egfr';
  if (compact.includes('crcl') || compact.includes('ccr') || compact.includes('クレアチニンクリアランス')) return 'crcl';
  if (compact === 'cr' || compact === 'scr' || compact === 'cre' || compact.includes('クレアチニン')) return 'cr';
  return compact;
}

export function extractPatientLabResultsFromElectronicPrescription(
  labResults: readonly VisitElectronicPrescriptionLaboratoryResult[] | undefined | null
): PatientLabResult[] {
  const parsed: PatientLabResult[] = [];
  for (const item of labResults || []) {
    const testName = (item.testName || '').trim();
    if (!testName) continue;
    const rawNumeric = String(item.value || '').normalize('NFKC').replace(/,/g, '').trim();
    const numeric = Number(rawNumeric);
    if (!rawNumeric || !Number.isFinite(numeric)) {
      // 金科玉条 第四条: 数値として解釈できない検査値は勘で変換しない
      continue;
    }
    const normalizedDate = item.measuredAt
      ? (parseFlexibleDateInput(item.measuredAt.slice(0, 10)) || item.measuredAt.trim())
      : undefined;
    parsed.push({
      testName,
      value: numeric,
      ...(item.unit?.trim() ? { unit: item.unit.trim() } : {}),
      ...(normalizedDate ? { measuredAt: normalizedDate } : {}),
      source: 'electronic_prescription',
      ...(item.comment?.trim() ? { note: item.comment.trim() } : {})
    });
  }
  return parsed;
}

export function mergePatientLabResults(
  existing: readonly PatientLabResult[] | undefined | null,
  incoming: readonly PatientLabResult[] | undefined | null
): PatientLabResult[] {
  const seen = new Set<string>();
  const combined: PatientLabResult[] = [];
  for (const item of [...(incoming || []), ...(existing || [])]) {
    const key = [
      normalizeLabTestKey(item.testName),
      String(item.value),
      (item.measuredAt || '').slice(0, 10),
      item.source
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push({ ...item });
  }
  return combined.sort((a, b) => {
    const aMs = parseDateMidnightMs(a.measuredAt) ?? Number.NEGATIVE_INFINITY;
    const bMs = parseDateMidnightMs(b.measuredAt) ?? Number.NEGATIVE_INFINITY;
    if (bMs !== aMs) return bMs - aMs;
    return a.testName.localeCompare(b.testName, 'ja');
  });
}

export interface ClinicalSafetyDrugInput {
  drugName: string;
  dispensedDrug?: string;
  genericName?: string;
}

export interface ClinicalSafetyAxisWarning {
  axis: 'renal' | 'pregnancy' | 'lactation' | 'otc';
  severity: 'danger' | 'warning';
  drug: string;
  message: string;
  isStaleReference?: boolean;
  isUnevaluable?: boolean;
}

interface RenalRule {
  keywords: readonly string[];
  dangerBelowEgfr?: number;
  warningBelowEgfr: number;
  label: string;
}

const RENAL_DRUG_RULES: readonly RenalRule[] = [
  {
    keywords: ['メトホルミン', 'メトグルコ', 'イニシンク', 'エクメット', 'メタクト'],
    dangerBelowEgfr: 30,
    warningBelowEgfr: 45,
    label: 'ビグアナイド系（乳酸アシドーシスリスク）'
  },
  {
    keywords: ['ロキソプロフェン', 'ロキソニン', 'イブプロフェン', 'ジクロフェナク', 'ボルタレン', 'セレコキシブ', 'セレコックス', 'メロキシカム', 'ナプロキセン'],
    dangerBelowEgfr: 30,
    warningBelowEgfr: 60,
    label: 'NSAIDs（腎機能悪化・AKIリスク）'
  },
  {
    keywords: ['プレガバリン', 'リリカ', 'ミロガバリン', 'タリージェ', 'ガバペンチン'],
    warningBelowEgfr: 60,
    label: '腎排泄型鎮痛薬（腎機能に応じた用量調節）'
  },
  {
    keywords: ['レボフロキサシン', 'クラビット', 'シプロフロキサシン', 'ファモチジン', 'ガスター', 'アロプリノール', 'ザイロリック'],
    warningBelowEgfr: 50,
    label: '腎排泄型薬剤（腎機能に応じた用量調節）'
  },
  {
    keywords: ['ダビガトラン', 'プラザキサ', 'リバーロキサバン', 'イグザレルト', 'アピキサバン', 'エリキュース', 'エドキサバン', 'リクシアナ'],
    dangerBelowEgfr: 30,
    warningBelowEgfr: 50,
    label: '直接経口抗凝固薬（腎機能低下時の出血リスク・用量確認）'
  },
  {
    keywords: ['シタグリプチン', 'ジャヌビア', 'グラクティブ', 'アログリプチン', 'ネシーナ', 'ビルダグリプチン', 'エクア'],
    warningBelowEgfr: 50,
    label: '腎排泄型DPP-4阻害薬（腎機能に応じた用量調節）'
  }
];

interface PregnancyRule {
  keywords: readonly string[];
  severity: 'danger' | 'warning';
  reason: string;
}

const PREGNANCY_DRUG_RULES: readonly PregnancyRule[] = [
  {
    keywords: ['カンデサルタン', 'ブロプレス', 'バルサルタン', 'ディオバン', 'オルメサルタン', 'テルミサルタン', 'ロサルタン', 'イルベサルタン', 'アジルサルタン', 'エナラプリル', 'リシノプリル', 'イミダプリル'],
    severity: 'danger',
    reason: 'ARB/ACE阻害薬は妊婦・妊娠の可能性がある患者に禁忌（胎児毒性・羊水過少リスク）'
  },
  {
    keywords: ['アトルバスタチン', 'ロスバスタチン', 'ピタバスタチン', 'シンバスタチン', 'プラバスタチン', 'フルバスタチン'],
    severity: 'danger',
    reason: 'スタチン系は妊婦・妊娠の可能性がある患者に禁忌'
  },
  {
    keywords: ['ロキソプロフェン', 'ロキソニン', 'イブプロフェン', 'ジクロフェナク', 'ボルタレン', 'セレコキシブ', 'セレコックス', 'アスピリン', 'インドメタシン'],
    severity: 'danger',
    reason: 'NSAIDsは妊娠後期禁忌・胎児動脈管収縮リスクあり（妊娠週数と処方意図を確認）'
  },
  {
    keywords: ['ワルファリン', 'ワーファリン', 'バルプロ酸', 'デパケン', 'メトトレキサート', 'リウマトレックス'],
    severity: 'danger',
    reason: '催奇形性・胎児毒性リスクのため妊婦禁忌または厳重確認対象'
  }
];

const LACTATION_DRUG_RULES: readonly PregnancyRule[] = [
  {
    keywords: ['コデイン', 'ジヒドロコデイン', 'トラマドール', 'トラムセット', 'メトトレキサート', 'リチウム', 'リーマス', 'アミオダロン', 'アンカロン'],
    severity: 'warning',
    reason: '乳汁移行・乳児への影響に注意が必要（授乳可否・代替薬を確認）'
  },
  {
    keywords: ['アスピリン', 'バファリン', 'ロキソプロフェン', 'ロキソニン', 'ジクロフェナク'],
    severity: 'warning',
    reason: '授乳中の使用可否・服用タイミングを添付文書および最新ガイドラインで確認'
  }
];

interface OtcInteractionRule {
  otcKeywords: readonly string[];
  drugKeywords: readonly string[];
  severity: 'danger' | 'warning';
  message: string;
}

const OTC_INTERACTION_RULES: readonly OtcInteractionRule[] = [
  {
    otcKeywords: ['セントジョーンズワート', 'セイヨウオトギリソウ', 'st.john', 'sjw'],
    drugKeywords: ['ワルファリン', 'ワーファリン', 'タクロリムス', 'シクロスポリン', 'ダビガトラン', 'リバーロキサバン', 'アピキサバン', 'エドキサバン', 'セルトラリン', 'パロキセチン', 'エスシタロプラム'],
    severity: 'danger',
    message: 'CYP誘導等により処方薬の血中濃度低下・作用減弱のおそれ'
  },
  {
    otcKeywords: ['青汁', 'クロレラ', 'ビタミンk', '納豆'],
    drugKeywords: ['ワルファリン', 'ワーファリン'],
    severity: 'danger',
    message: 'ビタミンK含有によりワルファリンの抗凝固作用が減弱するおそれ'
  },
  {
    otcKeywords: ['ロキソニン', 'バファリン', 'イブ', 'eve', 'パブロン', 'ベンザ', 'ルル', 'リングル', 'タイレノール', 'カロナール', '総合感冒薬', '解熱鎮痛'],
    drugKeywords: ['ロキソプロフェン', 'ロキソニン', 'イブプロフェン', 'ジクロフェナク', 'セレコキシブ', 'アセトアミノフェン', 'カロナール', 'アスピリン'],
    severity: 'warning',
    message: '市販薬との鎮痛解熱成分（NSAIDs/アセトアミノフェン等）重複服用の可能性あり'
  },
  {
    otcKeywords: ['カルシウム', 'マグネシウム', '鉄', '亜鉛', 'マルチミネラル', '胃腸薬', '制酸'],
    drugKeywords: ['レボフロキサシン', 'クラビット', 'シプロフロキサシン', 'ミノサイクリン', 'ミノマイシン', 'ドキシサイクリン', 'レボチロキシン', 'チラーヂン', 'アレンドロン酸', 'リセドロン酸'],
    severity: 'warning',
    message: '金属カチオンとのキレート形成等により処方薬の吸収低下のおそれ（服用間隔を確認）'
  },
  {
    otcKeywords: ['イチョウ葉', 'epa', 'dha', 'フィッシュオイル', 'オメガ3'],
    drugKeywords: ['ワルファリン', 'ワーファリン', 'アスピリン', 'クロピドグレル', 'プラスグレル', 'ダビガトラン', 'リバーロキサバン', 'アピキサバン', 'エドキサバン'],
    severity: 'warning',
    message: '抗血栓作用の相加により出血リスクが高まるおそれ'
  }
];

function normalizedDrugSearchText(drug: ClinicalSafetyDrugInput): string {
  return [drug.dispensedDrug, drug.drugName, drug.genericName]
    .filter(Boolean)
    .join(' ')
    .normalize('NFKC')
    .toLowerCase();
}

function matchesAnyKeyword(haystackLower: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => haystackLower.includes(kw.normalize('NFKC').toLowerCase()));
}

function findLatestRenalLab(
  labResults: readonly PatientLabResult[]
): { kind: 'egfr' | 'crcl' | 'cr'; lab: PatientLabResult } | null {
  const sorted = mergePatientLabResults(labResults, []);
  const egfr = sorted.find((lab) => normalizeLabTestKey(lab.testName) === 'egfr');
  if (egfr) return { kind: 'egfr', lab: egfr };
  const crcl = sorted.find((lab) => normalizeLabTestKey(lab.testName) === 'crcl');
  if (crcl) return { kind: 'crcl', lab: crcl };
  const cr = sorted.find((lab) => normalizeLabTestKey(lab.testName) === 'cr');
  if (cr) return { kind: 'cr', lab: cr };
  return null;
}

export function evaluateClinicalSafetyAxes(params: {
  drugs: readonly ClinicalSafetyDrugInput[];
  patient?: Pick<Patient, 'clinicalProfile'> | null;
  electronicPrescriptionLabResults?: readonly VisitElectronicPrescriptionLaboratoryResult[];
  basisDate?: Date;
}): ClinicalSafetyAxisWarning[] {
  const { drugs, patient, electronicPrescriptionLabResults, basisDate = new Date() } = params;
  if (drugs.length === 0) return [];

  const profile = patient?.clinicalProfile;
  const importedLabs = extractPatientLabResultsFromElectronicPrescription(electronicPrescriptionLabResults);
  const allLabs = mergePatientLabResults(profile?.labResults, importedLabs);
  const latestRenal = findLatestRenalLab(allLabs);
  const renalFreshness = latestRenal ? evaluateLabResultFreshness(latestRenal.lab.measuredAt, basisDate) : null;

  const warnings: ClinicalSafetyAxisWarning[] = [];
  const seenKeys = new Set<string>();
  const pushUnique = (warning: ClinicalSafetyAxisWarning) => {
    const key = `${warning.axis}|${warning.severity}|${warning.drug}|${warning.message}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    warnings.push(warning);
  };

  let renalSensitiveDrugNames: string[] = [];

  for (const drug of drugs) {
    const displayName = drug.dispensedDrug || drug.drugName;
    const text = normalizedDrugSearchText(drug);

    // 1. 腎機能チェック軸 (eGFR / CrCl / Cr)
    for (const rule of RENAL_DRUG_RULES) {
      if (!matchesAnyKeyword(text, rule.keywords)) continue;
      renalSensitiveDrugNames.push(displayName);
      if (!latestRenal) continue;

      const staleSuffix = renalFreshness && renalFreshness.status !== 'fresh'
        ? ` ※${renalFreshness.label}`
        : '';
      const datePart = latestRenal.lab.measuredAt ? ` (${latestRenal.lab.measuredAt.slice(0, 10)})` : '';

      if (latestRenal.kind === 'egfr' || latestRenal.kind === 'crcl') {
        const valueLabel = `${latestRenal.lab.testName} ${latestRenal.lab.value}${latestRenal.lab.unit ? ` ${latestRenal.lab.unit}` : ''}${datePart}`;
        if (rule.dangerBelowEgfr !== undefined && latestRenal.lab.value < rule.dangerBelowEgfr) {
          pushUnique({
            axis: 'renal',
            severity: 'danger',
            drug: displayName,
            message: `腎機能低下 [${valueLabel}] により禁忌・厳重注意: ${rule.label}。処方継続の可否・減量を至急確認してください。${staleSuffix}`,
            isStaleReference: renalFreshness?.status === 'stale'
          });
        } else if (latestRenal.lab.value < rule.warningBelowEgfr) {
          pushUnique({
            axis: 'renal',
            severity: 'warning',
            drug: displayName,
            message: `腎機能低下 [${valueLabel}] に注意: ${rule.label}。用量調節・経過確認を検討してください。${staleSuffix}`,
            isStaleReference: renalFreshness?.status === 'stale'
          });
        }
      } else if (latestRenal.kind === 'cr' && latestRenal.lab.value >= 1.2) {
        const valueLabel = `${latestRenal.lab.testName} ${latestRenal.lab.value}${latestRenal.lab.unit ? ` ${latestRenal.lab.unit}` : ' mg/dL'}${datePart}`;
        pushUnique({
          axis: 'renal',
          severity: latestRenal.lab.value >= 2.0 && rule.dangerBelowEgfr !== undefined ? 'danger' : 'warning',
          drug: displayName,
          message: `血清クレアチニン高値 [${valueLabel}] のため腎機能確認が必要: ${rule.label}。eGFR を確認し用量調節を検討してください。${staleSuffix}`,
          isStaleReference: renalFreshness?.status === 'stale'
        });
      }
      break;
    }

    // 2. 妊娠・授乳チェック軸
    if (profile?.pregnancyStatus === 'pregnant' || profile?.pregnancyStatus === 'possibly_pregnant') {
      const statusText = PREGNANCY_STATUS_LABELS[profile.pregnancyStatus];
      for (const rule of PREGNANCY_DRUG_RULES) {
        if (!matchesAnyKeyword(text, rule.keywords)) continue;
        pushUnique({
          axis: 'pregnancy',
          severity: rule.severity,
          drug: displayName,
          message: `【${statusText}】${rule.reason}。`
        });
        break;
      }
    }

    if (profile?.lactationStatus === 'lactating') {
      for (const rule of LACTATION_DRUG_RULES) {
        if (!matchesAnyKeyword(text, rule.keywords)) continue;
        pushUnique({
          axis: 'lactation',
          severity: rule.severity,
          drug: displayName,
          message: `【授乳中】${rule.reason}。`
        });
        break;
      }
    }

    // 3. 併用 OTC / サプリメントチェック軸
    for (const otc of profile?.otcSupplements || []) {
      const otcText = `${otc.name} ${otc.note || ''}`.normalize('NFKC').toLowerCase();
      for (const rule of OTC_INTERACTION_RULES) {
        if (!matchesAnyKeyword(otcText, rule.otcKeywords)) continue;
        if (!matchesAnyKeyword(text, rule.drugKeywords)) continue;
        pushUnique({
          axis: 'otc',
          severity: rule.severity,
          drug: displayName,
          message: `併用OTC/サプリ「${otc.name}」との相互作用・重複注意: ${rule.message}。`
        });
      }
    }
  }

  // 金科玉条 第四条: 腎排泄・腎注意薬が処方されているのに腎機能検査値が未登録なら「判定不能」を明示する
  renalSensitiveDrugNames = Array.from(new Set(renalSensitiveDrugNames));
  if (!latestRenal && renalSensitiveDrugNames.length > 0) {
    pushUnique({
      axis: 'renal',
      severity: 'warning',
      drug: renalSensitiveDrugNames.join('・'),
      message: '腎機能検査値（eGFR / Cr）が未登録のため腎機能に基づく用量・禁忌を判定不能です。検査値を確認・登録してください。',
      isUnevaluable: true
    });
  }

  return warnings;
}

export function buildClinicalSafetyWarningInsightItems(params: {
  drugs: readonly ClinicalSafetyDrugInput[];
  patient?: Pick<Patient, 'clinicalProfile'> | null;
  electronicPrescriptionLabResults?: readonly VisitElectronicPrescriptionLaboratoryResult[];
  basisDate?: Date;
}): Array<{ type: 'usage'; severity: 'danger' | 'warning'; drug: string; message: string }> {
  return evaluateClinicalSafetyAxes(params).map((warning) => ({
    type: 'usage',
    severity: warning.severity,
    drug: warning.drug,
    message: warning.message
  }));
}

export const CLINICAL_PROFILE_AUDIT_FAILED_MESSAGE =
  '監査ログの記録に失敗したため、患者の臨床安全プロファイル（検査値・妊娠授乳・OTC）の保存を取り消しました。';

export async function savePatientClinicalProfile(params: {
  patientDoc: PatchableDocument;
  previousProfile: PatientClinicalProfile | undefined;
  nextProfile: PatientClinicalProfile;
  logAudit: (detail: string) => Promise<boolean>;
}): Promise<PatientClinicalProfile> {
  const labCount = params.nextProfile.labResults?.length ?? 0;
  const otcCount = params.nextProfile.otcSupplements?.length ?? 0;
  const preg = PREGNANCY_STATUS_LABELS[params.nextProfile.pregnancyStatus || 'unknown'];
  const lact = LACTATION_STATUS_LABELS[params.nextProfile.lactationStatus || 'unknown'];
  const detail = `臨床安全プロファイル更新: 検査値 ${labCount}件 / 妊娠=${preg} / 授乳=${lact} / 併用OTC・サプリ ${otcCount}件`;

  await patchWithAuditRollback({
    doc: params.patientDoc,
    patch: { clinicalProfile: params.nextProfile },
    previous: { clinicalProfile: params.previousProfile },
    logAudit: () => params.logAudit(detail),
    failureMessage: CLINICAL_PROFILE_AUDIT_FAILED_MESSAGE
  });

  return params.nextProfile;
}
