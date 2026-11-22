import { isAbsolute, relative, resolve } from 'node:path';
import { buildAiClinicalReviewEvidenceTemplate } from './ai_clinical_review.ts';
import { buildCsvDocument } from './csv_escape.ts';
import { buildElectronicPrescriptionFieldEvidenceTemplate } from './electronic_prescription_field_readiness.ts';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';
import { buildMigrationTrialAcceptanceEvidenceTemplate } from './migration_trial_acceptance.ts';
import { buildOnlineEligibilityAuthEvidenceTemplate } from './online_eligibility_field_readiness.ts';
import { type OpsReviewStatus } from './ops_review_status.ts';
import { buildPharmacyDeviceFieldEvidenceTemplate } from './pharmacy_device_field_readiness.ts';
import { buildPilotKpiReviewEvidenceTemplate } from './pilot_kpi_review.ts';
import { buildPilotOperationalReadinessEvidenceTemplate } from './pilot_operational_readiness.ts';
import { buildPrintMediaFieldEvidenceTemplate } from './print_media_field_verification.ts';
import { buildReleaseUpdateEvidenceTemplate } from './release_update_readiness.ts';

export const FIELD_EVIDENCE_STORAGE_POLICY = {
  policyVersion: 1,
  storageLocation: 'リポジトリ外のアクセス制御・ディスク暗号化済みディレクトリまたは院内NAS（Git管理下への配置禁止）',
  recommendedDirectoryPattern: '/var/lib/yakureki-evidence/<store-code>/<YYYY-MM>/',
  minimumRetentionYears: 5,
  requiredRealWorldProofFields: [
    'capturedAt (ISO 8601 実測・確認日時)',
    'operatorReviewId / reviewRecordId (匿名確認記録ID)',
    'sourceArtifactSha256 (元資料のSHA-256 64桁hex)',
    'noPatientDataConfirmed: true (患者個人情報なし確認)'
  ],
  forbiddenContents: [
    '患者氏名・患者ID・生年月日・被保険者記号番号・公費受給者番号',
    'APIトークン・パスワード・秘密鍵・証明書秘密部',
    'ローカルフルパス・施設内URL・通信生本文',
    'demo / dummy / mock / sample / localhost 等の合成・練習文字列'
  ]
} as const;

export interface PhaseCEvidenceSlotSpec {
  slotId: string;
  track: string;
  title: string;
  npmScript: string;
  envVar: string;
  fileName: string;
  claimKind: string;
}

export const PHASE_C_EVIDENCE_SLOTS: readonly PhaseCEvidenceSlotSpec[] = [
  {
    slotId: 'print_media_field',
    track: 'printed_forms',
    title: '帳票実紙検証（A4/A5/ラベル紙・実プリンタ）',
    npmScript: 'print:field-verification',
    envVar: 'YAKUREKI_PRINT_FIELD_EVIDENCE',
    fileName: '01_print_media_field_evidence.json',
    claimKind: 'print-media-field-verification'
  },
  {
    slotId: 'online_eligibility_field',
    track: 'D-1',
    title: 'オンライン資格確認・マイナ資格確認 現地試験＆XML仕様突合',
    npmScript: 'eligibility:field-readiness',
    envVar: 'YAKUREKI_ELIGIBILITY_FIELD_EVIDENCE',
    fileName: '02_online_eligibility_field_evidence.json',
    claimKind: 'online-eligibility-field-readiness'
  },
  {
    slotId: 'electronic_prescription_field',
    track: 'E-1',
    title: '電子処方箋 本番接続・公式運用試験',
    npmScript: 'electronic-prescription:field-readiness',
    envVar: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_EVIDENCE',
    fileName: '03_electronic_prescription_field_evidence.json',
    claimKind: 'electronic-prescription-field-readiness'
  },
  {
    slotId: 'pharmacy_device_field',
    track: 'E-2',
    title: 'NSIPS 調剤機器連携 20営業日安定運用試験',
    npmScript: 'pharmacy-device:field-readiness',
    envVar: 'YAKUREKI_PHARMACY_DEVICE_FIELD_EVIDENCE',
    fileName: '04_pharmacy_device_field_evidence.json',
    claimKind: 'pharmacy-device-field-readiness'
  },
  {
    slotId: 'ai_clinical_review',
    track: 'F-4',
    title: 'AI補助 実症例臨床レビュー（複数店舗）',
    npmScript: 'ai:clinical-review',
    envVar: 'YAKUREKI_AI_CLINICAL_REVIEW_EVIDENCE',
    fileName: '05_ai_clinical_review_evidence.json',
    claimKind: 'ai-clinical-review'
  },
  {
    slotId: 'migration_trial_acceptance',
    track: 'H-4',
    title: '他社ソフト移行CSV 実データ相当トライアル受入',
    npmScript: 'migration:trial-acceptance',
    envVar: 'YAKUREKI_MIGRATION_ACCEPTANCE_EVIDENCE',
    fileName: '06_migration_trial_acceptance_evidence.json',
    claimKind: 'migration-trial-acceptance'
  },
  {
    slotId: 'release_update_readiness',
    track: 'H-3/I-4',
    title: 'リリース更新準備・予備機切替・OSスケジューラ点検',
    npmScript: 'release:readiness',
    envVar: 'YAKUREKI_RELEASE_READINESS_EVIDENCE',
    fileName: '07_release_update_readiness_evidence.json',
    claimKind: 'release-update-readiness'
  },
  {
    slotId: 'pilot_kpi_review',
    track: 'I-4',
    title: 'パイロット複数店舗 4週間KPIレビュー',
    npmScript: 'pilot:kpi-review',
    envVar: 'YAKUREKI_PILOT_KPI_EVIDENCE',
    fileName: '08_pilot_kpi_review_evidence.json',
    claimKind: 'pilot-kpi-review'
  },
  {
    slotId: 'pilot_operational_readiness',
    track: 'I-4',
    title: 'パイロット正式運用判定（責任者承認・停止ルール）',
    npmScript: 'pilot:operational-readiness',
    envVar: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE',
    fileName: '09_pilot_operational_readiness_evidence.json',
    claimKind: 'pilot-operational-readiness'
  }
] as const;

export function isPathInsideDirectory(candidatePath: string, rootDir: string): boolean {
  const resolvedCandidate = resolve(candidatePath);
  const resolvedRoot = resolve(rootDir);
  const rel = relative(resolvedRoot, resolvedCandidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function buildPhaseCEvidenceTemplates(generatedAt = new Date()): Record<string, unknown> {
  return {
    print_media_field: buildPrintMediaFieldEvidenceTemplate({ generatedAt }),
    online_eligibility_field: buildOnlineEligibilityAuthEvidenceTemplate(),
    electronic_prescription_field: buildElectronicPrescriptionFieldEvidenceTemplate(),
    pharmacy_device_field: buildPharmacyDeviceFieldEvidenceTemplate(),
    ai_clinical_review: buildAiClinicalReviewEvidenceTemplate({ generatedAt }),
    migration_trial_acceptance: buildMigrationTrialAcceptanceEvidenceTemplate({ generatedAt }),
    release_update_readiness: buildReleaseUpdateEvidenceTemplate({ generatedAt }),
    pilot_kpi_review: buildPilotKpiReviewEvidenceTemplate({ generatedAt }),
    pilot_operational_readiness: buildPilotOperationalReadinessEvidenceTemplate({ generatedAt })
  };
}

export interface SubmittedFieldEvidenceSlot {
  slotId: string;
  present: boolean;
  parseError?: string;
  payload?: unknown;
}

export interface FieldEvidenceSlotReview {
  slotId: string;
  track: string;
  title: string;
  npmScript: string;
  envVar: string;
  fileName: string;
  present: boolean;
  status: OpsReviewStatus;
  statusLabel: string;
  issueCount: number;
  issues: string[];
  requiredActions: string[];
  integrity?: EvidenceIntegrityReview;
}

export interface FieldEvidenceBundleReview {
  type: 'yakureki-field-evidence-bundle-review';
  generatedAt: string;
  bundleId: string;
  status: OpsReviewStatus;
  statusLabel: string;
  totalSlotCount: number;
  presentSlotCount: number;
  passedSlotCount: number;
  attentionSlotCount: number;
  blockedSlotCount: number;
  storagePolicy: typeof FIELD_EVIDENCE_STORAGE_POLICY;
  evidenceIntegrityStatus: OpsReviewStatus;
  slots: FieldEvidenceSlotReview[];
  requiredActions: string[];
}

export function evaluateFieldEvidenceBundle(params: {
  bundleId?: string;
  submittedSlots: readonly SubmittedFieldEvidenceSlot[];
  generatedAt?: Date;
}): FieldEvidenceBundleReview {
  const generatedAt = params.generatedAt ?? new Date();
  const bundleId = (params.bundleId || 'phase-c-field-evidence-bundle').trim();
  const byId = new Map(params.submittedSlots.map((slot) => [slot.slotId, slot]));

  const slots: FieldEvidenceSlotReview[] = PHASE_C_EVIDENCE_SLOTS.map((spec) => {
    const submitted = byId.get(spec.slotId);
    if (!submitted || !submitted.present) {
      return {
        slotId: spec.slotId,
        track: spec.track,
        title: spec.title,
        npmScript: spec.npmScript,
        envVar: spec.envVar,
        fileName: spec.fileName,
        present: false,
        status: 'blocked',
        statusLabel: '未提出',
        issueCount: 1,
        issues: [`${spec.fileName} が未提出です`],
        requiredActions: [
          `${spec.track} (${spec.title}) の現地実施記録を ${spec.fileName} に記録し、リポジトリ外の証跡保管ディレクトリへ配置する`
        ]
      };
    }

    if (submitted.parseError) {
      return {
        slotId: spec.slotId,
        track: spec.track,
        title: spec.title,
        npmScript: spec.npmScript,
        envVar: spec.envVar,
        fileName: spec.fileName,
        present: true,
        status: 'blocked',
        statusLabel: 'JSON不正',
        issueCount: 1,
        issues: [`JSON解析エラー: ${submitted.parseError}`],
        requiredActions: [`${spec.fileName} のJSON構文を修正して再実行する`]
      };
    }

    const integrity = buildEvidenceIntegrityReview({
      evidenceId: `${bundleId}:${spec.slotId}`,
      claimKind: spec.claimKind,
      evidence: submitted.payload,
      noPatientDataExpected: true,
      realWorldEvidenceRequired: true,
      allowSyntheticEvidence: false,
      generatedAt
    });

    const payloadObj = submitted.payload && typeof submitted.payload === 'object' && !Array.isArray(submitted.payload)
      ? submitted.payload as Record<string, unknown>
      : null;
    const isUnfilledTemplateType = Boolean(
      payloadObj && typeof payloadObj.type === 'string' && payloadObj.type.endsWith('-template')
    );

    const issues = integrity.issues.map((issue) => `${issue.code}: ${issue.message}`);
    const requiredActions = [...integrity.requiredActions];
    let status: OpsReviewStatus = integrity.status;

    if (isUnfilledTemplateType) {
      issues.unshift('unfilled_template_type: 雛形テンプレートのまま提出されています（type 末尾の -template を外し実測記録を入力してください）');
      requiredActions.unshift(`${spec.fileName} に現地実測値を記入し、テンプレート種別を実記録へ更新する`);
      status = 'blocked';
    }

    const statusLabel = status === 'pass'
      ? '現物証跡OK'
      : status === 'attention'
        ? '確認事項あり'
        : '保留・未達';

    return {
      slotId: spec.slotId,
      track: spec.track,
      title: spec.title,
      npmScript: spec.npmScript,
      envVar: spec.envVar,
      fileName: spec.fileName,
      present: true,
      status,
      statusLabel,
      issueCount: issues.length,
      issues,
      requiredActions,
      integrity
    };
  });

  const presentSlotCount = slots.filter((slot) => slot.present).length;
  const passedSlotCount = slots.filter((slot) => slot.status === 'pass').length;
  const attentionSlotCount = slots.filter((slot) => slot.status === 'attention').length;
  const blockedSlotCount = slots.filter((slot) => slot.status === 'blocked').length;

  const status: OpsReviewStatus = blockedSlotCount > 0
    ? 'blocked'
    : attentionSlotCount > 0
      ? 'attention'
      : 'pass';

  const statusLabel = status === 'pass'
    ? 'Phase C 現地証跡バンドル適合'
    : status === 'attention'
      ? 'Phase C 現地証跡バンドル要確認'
      : 'Phase C 現地証跡バンドル未達（保留）';

  const requiredActions = slots
    .filter((slot) => slot.status !== 'pass')
    .flatMap((slot) => slot.requiredActions.slice(0, 1));

  return {
    type: 'yakureki-field-evidence-bundle-review',
    generatedAt: generatedAt.toISOString(),
    bundleId,
    status,
    statusLabel,
    totalSlotCount: slots.length,
    presentSlotCount,
    passedSlotCount,
    attentionSlotCount,
    blockedSlotCount,
    storagePolicy: FIELD_EVIDENCE_STORAGE_POLICY,
    evidenceIntegrityStatus: status,
    slots,
    requiredActions
  };
}

export function buildFieldEvidenceBundleCsv(review: FieldEvidenceBundleReview): string {
  const header = [
    'スロットID',
    'トラック',
    '対象項目',
    'ファイル名',
    '対象CLI',
    '環境変数',
    '提出有無',
    '判定',
    '指摘件数',
    '主な指摘',
    '次の対応'
  ];
  const rows = review.slots.map((slot) => [
    slot.slotId,
    slot.track,
    slot.title,
    slot.fileName,
    slot.npmScript,
    slot.envVar,
    slot.present ? '提出済' : '未提出',
    slot.statusLabel,
    String(slot.issueCount),
    slot.issues[0] || '',
    slot.requiredActions[0] || '対応不要'
  ]);
  return buildCsvDocument([header, ...rows]);
}

export function buildFieldEvidenceBundleChecklist(review: FieldEvidenceBundleReview): string {
  const lines = [
    `# Phase C 現地証跡バンドル点検チェックリスト (${review.bundleId})`,
    `生成日時: ${review.generatedAt}`,
    `総合判定: ${review.statusLabel} (${review.status})`,
    `達成状況: 合格 ${review.passedSlotCount}/${review.totalSlotCount}件 / 要確認 ${review.attentionSlotCount}件 / 保留 ${review.blockedSlotCount}件（提出済 ${review.presentSlotCount}件）`,
    '',
    '## 証跡保管ルール（I-2）',
    `- 保管場所: ${review.storagePolicy.storageLocation}`,
    `- 推奨パス: ${review.storagePolicy.recommendedDirectoryPattern}`,
    `- 最低保持期間: ${review.storagePolicy.minimumRetentionYears} 年`,
    '',
    '## 各トラック証跡スロット',
    ...review.slots.map((slot) => {
      const mark = slot.status === 'pass' ? '[x]' : '[ ]';
      const detail = slot.issues.length > 0 ? ` — ${slot.issues[0]}` : '';
      return `${mark} [${slot.track}] ${slot.title} (${slot.fileName} / ${slot.envVar}) => ${slot.statusLabel}${detail}`;
    }),
    '',
    '## 次の運用レビューCLI実行コマンド例',
    ...review.slots.map((slot) => `  ${slot.envVar}="<EVIDENCE_DIR>/${slot.fileName}" npm run ${slot.npmScript}`)
  ];
  return lines.join('\n');
}

export function buildEvidenceStorageReadme(evidenceDirLabel = '<EVIDENCE_DIR>'): string {
  return [
    '# pharma-oss Phase C 現地証跡保管ディレクトリ (I-2 / I-4)',
    '',
    '## 保管ルール',
    `- 保管場所: ${FIELD_EVIDENCE_STORAGE_POLICY.storageLocation}`,
    `- 最低保持期間: ${FIELD_EVIDENCE_STORAGE_POLICY.minimumRetentionYears} 年（店舗規程が長い場合はそちらを優先）`,
    '- 必須フィールド:',
    ...FIELD_EVIDENCE_STORAGE_POLICY.requiredRealWorldProofFields.map((f) => `  - ${f}`),
    '- 記載禁止項目（自動検査でブロックされます）:',
    ...FIELD_EVIDENCE_STORAGE_POLICY.forbiddenContents.map((f) => `  - ${f}`),
    '',
    '## 運用手順',
    '1. 各 01_*.json 〜 09_*.json に現地の実測・確認結果を記入し、`type` 末尾の `-template` を外してください。',
    '2. 監査実行:',
    `   YAKUREKI_FIELD_EVIDENCE_DIR="${evidenceDirLabel}" npm run ops:field-evidence-bundle`,
    '3. 全スロットが pass になったら、出力されたチェックリストに沿って各 Tier 1〜4 運用レビュー CLI を実行してください。'
  ].join('\n');
}
