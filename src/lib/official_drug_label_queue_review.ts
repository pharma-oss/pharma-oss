export type OfficialDrugLabelQueueReviewStatus = 'pass' | 'attention' | 'blocked';

export interface OfficialDrugLabelQueueEntry {
  ingredient: string;
  productCount?: number;
  representativeDrugName?: string;
  representativeDocumentUrl?: string | null;
  status: string;
  sourceUrl?: string;
  flags?: string[];
  error?: string;
  lastAttemptAt?: string;
}

export interface OfficialDrugLabelDataMetrics {
  interactionRowCount: number;
  conditionRowCount: number;
  uniqueSourceUrlCount: number;
  pmdaSourceUrlCount: number;
  nonPmdaSourceUrlCount: number;
  oldTargetDrugSchemaCount: number;
  keggSignalCount: number;
}

export interface OfficialDrugLabelQueueIssueSummary {
  label: string;
  count: number;
  samples: string[];
}

export interface OfficialDrugLabelQueueGate {
  id: 'queue_remaining' | 'data_rows' | 'source_urls' | 'legacy_schema';
  title: string;
  status: OfficialDrugLabelQueueReviewStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface OfficialDrugLabelQueueReview {
  type: 'yakureki-official-drug-label-queue-review';
  schemaVersion: 1;
  generatedAt: string;
  status: OfficialDrugLabelQueueReviewStatus;
  statusLabel: string;
  actionLabel: string;
  canCloseP401InternalGate: boolean;
  totalIngredientCount: number;
  doneCount: number;
  noInteractionsFoundCount: number;
  noOfficialLabelFoundCount: number;
  pendingCount: number;
  fetchErrorCount: number;
  needsReviewCount: number;
  noRepresentativeProductCount: number;
  otherStatusCount: number;
  retryCandidateCount: number;
  manualReviewCandidateCount: number;
  fetchErrorSummary: {
    transientFetchFailureCount: number;
    noOfficialCandidateCount: number;
    otherFetchErrorCount: number;
    topMessages: OfficialDrugLabelQueueIssueSummary[];
  };
  needsReviewSummary: {
    topFlags: OfficialDrugLabelQueueIssueSummary[];
  };
  dataMetrics: OfficialDrugLabelDataMetrics;
  samples: {
    pending: string[];
    fetchError: string[];
    needsReview: string[];
    noRepresentativeProduct: string[];
    otherStatus: string[];
  };
  privacy: {
    containsPatientData: false;
    containsRawPmdaHtml: false;
    containsLocalPath: false;
    containsCredential: false;
  };
  gates: OfficialDrugLabelQueueGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsRawPmdaHtml: false,
  containsLocalPath: false,
  containsCredential: false
} as const;

const PMDA_SOURCE_URL_PATTERN = /^https:\/\/www\.pmda\.go\.jp\//;

function statusLabel(status: OfficialDrugLabelQueueReviewStatus): string {
  if (status === 'pass') return 'PMDAラベルキューOK';
  if (status === 'attention') return 'PMDAラベルキューを確認';
  return 'PMDAラベルキューを保留';
}

function actionLabel(status: OfficialDrugLabelQueueReviewStatus): string {
  if (status === 'pass') return 'P4-01内部ゲートを閉じられる';
  if (status === 'attention') return '例外の扱いを責任者確認';
  return '未処理または旧データを解消するまで閉じない';
}

function gate(options: {
  id: OfficialDrugLabelQueueGate['id'];
  title: string;
  status: OfficialDrugLabelQueueReviewStatus;
  target: string;
  actual: string;
  nextAction: string;
}): OfficialDrugLabelQueueGate {
  return {
    ...options,
    statusLabel: statusLabel(options.status)
  };
}

function summarizeStatus(gates: OfficialDrugLabelQueueGate[]): OfficialDrugLabelQueueReviewStatus {
  if (gates.some((item) => item.status === 'blocked')) return 'blocked';
  if (gates.some((item) => item.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: OfficialDrugLabelQueueGate[]): string[] {
  return Array.from(new Set(
    gates
      .filter((item) => item.status !== 'pass')
      .map((item) => item.nextAction)
      .filter(Boolean)
  ));
}

function sampleIngredients(entries: OfficialDrugLabelQueueEntry[], status: string): string[] {
  return entries
    .filter((entry) => entry.status === status)
    .map((entry) => entry.ingredient)
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeIssueText(value: unknown): string {
  return String(value || '未記録')
    .replace(/https?:\/\/[^\s]+/g, '<url>')
    .trim()
    .slice(0, 160);
}

function classifyFetchError(error: unknown): 'transient_fetch_failure' | 'no_official_candidate' | 'other_fetch_error' {
  const text = String(error || '');
  if (text.includes('添付文書候補が見つかりません')) return 'no_official_candidate';
  if (
    text.includes('fetch failed')
    || text.includes('ECONN')
    || text.includes('ETIMEDOUT')
    || text.includes('ENOTFOUND')
    || text.includes('EAI_AGAIN')
    || text.includes('timeout')
  ) {
    return 'transient_fetch_failure';
  }
  return 'other_fetch_error';
}

function summarizeIssues(items: { label: string; ingredient: string }[]): OfficialDrugLabelQueueIssueSummary[] {
  const byLabel = new Map<string, { count: number; samples: string[] }>();
  for (const item of items) {
    const current = byLabel.get(item.label) || { count: 0, samples: [] };
    current.count += 1;
    if (item.ingredient && current.samples.length < 5) current.samples.push(item.ingredient);
    byLabel.set(item.label, current);
  }
  return Array.from(byLabel.entries())
    .map(([label, value]) => ({ label, count: value.count, samples: value.samples }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

export function collectOfficialDrugLabelDataMetrics(drugInfos: unknown[]): OfficialDrugLabelDataMetrics {
  const sourceUrls = new Set<string>();
  let interactionRowCount = 0;
  let conditionRowCount = 0;
  let pmdaSourceUrlCount = 0;
  let nonPmdaSourceUrlCount = 0;
  let oldTargetDrugSchemaCount = 0;
  let keggSignalCount = 0;

  for (const info of drugInfos as Record<string, unknown>[]) {
    const interactions = Array.isArray(info.contraindications) ? info.contraindications : [];
    const conditions = Array.isArray(info.contraindicatedConditions) ? info.contraindicatedConditions : [];

    for (const row of interactions as Record<string, unknown>[]) {
      interactionRowCount += 1;
      if ('targetDrug' in row) oldTargetDrugSchemaCount += 1;
      if (JSON.stringify(row).includes('KEGG')) keggSignalCount += 1;
      const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl : '';
      if (sourceUrl) sourceUrls.add(sourceUrl);
      if (sourceUrl && PMDA_SOURCE_URL_PATTERN.test(sourceUrl)) {
        pmdaSourceUrlCount += 1;
      } else {
        nonPmdaSourceUrlCount += 1;
      }
    }

    for (const row of conditions as Record<string, unknown>[]) {
      conditionRowCount += 1;
      if (JSON.stringify(row).includes('KEGG')) keggSignalCount += 1;
      const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl : '';
      if (sourceUrl) sourceUrls.add(sourceUrl);
      if (sourceUrl && PMDA_SOURCE_URL_PATTERN.test(sourceUrl)) {
        pmdaSourceUrlCount += 1;
      } else {
        nonPmdaSourceUrlCount += 1;
      }
    }
  }

  return {
    interactionRowCount,
    conditionRowCount,
    uniqueSourceUrlCount: sourceUrls.size,
    pmdaSourceUrlCount,
    nonPmdaSourceUrlCount,
    oldTargetDrugSchemaCount,
    keggSignalCount
  };
}

export function buildOfficialDrugLabelQueueReview(input: {
  generatedAt?: Date;
  queueEntries: OfficialDrugLabelQueueEntry[];
  dataMetrics: OfficialDrugLabelDataMetrics;
}): OfficialDrugLabelQueueReview {
  const generatedAt = input.generatedAt ?? new Date();
  const entries = input.queueEntries;
  const dataMetrics = input.dataMetrics;
  const totalIngredientCount = entries.length;
  const doneCount = entries.filter((entry) => entry.status === 'done').length;
  const noInteractionsFoundCount = entries.filter((entry) => entry.status === 'no_interactions_found').length;
  const noOfficialLabelFoundCount = entries.filter((entry) => entry.status === 'no_official_label_found').length;
  const pendingCount = entries.filter((entry) => entry.status === 'pending').length;
  const fetchErrorCount = entries.filter((entry) => entry.status === 'fetch_error').length;
  const needsReviewCount = entries.filter((entry) => entry.status === 'needs_review').length;
  const noRepresentativeProductCount = entries.filter((entry) => entry.status === 'no_representative_product').length;
  const knownStatuses = new Set([
    'done',
    'no_interactions_found',
    'no_official_label_found',
    'pending',
    'fetch_error',
    'needs_review',
    'no_representative_product'
  ]);
  const otherStatusCount = entries.filter((entry) => !knownStatuses.has(entry.status)).length;
  const unresolvedCount = pendingCount + fetchErrorCount + needsReviewCount + noRepresentativeProductCount + otherStatusCount;
  const fetchErrorEntries = entries.filter((entry) => entry.status === 'fetch_error');
  const fetchErrorClasses = fetchErrorEntries.map((entry) => classifyFetchError(entry.error));
  const transientFetchFailureCount = fetchErrorClasses.filter((item) => item === 'transient_fetch_failure').length;
  const noOfficialCandidateCount = fetchErrorClasses.filter((item) => item === 'no_official_candidate').length;
  const otherFetchErrorCount = fetchErrorClasses.filter((item) => item === 'other_fetch_error').length;
  const fetchErrorSummary = {
    transientFetchFailureCount,
    noOfficialCandidateCount,
    otherFetchErrorCount,
    topMessages: summarizeIssues(fetchErrorEntries.map((entry) => ({
      label: normalizeIssueText(entry.error),
      ingredient: entry.ingredient
    })))
  };
  const needsReviewSummary = {
    topFlags: summarizeIssues(entries
      .filter((entry) => entry.status === 'needs_review')
      .flatMap((entry) => {
        const flags = entry.flags && entry.flags.length > 0 ? entry.flags : ['要確認理由未記録'];
        return flags.map((flag) => ({
          label: normalizeIssueText(flag),
          ingredient: entry.ingredient
        }));
      }))
  };

  const gates: OfficialDrugLabelQueueGate[] = [
    gate({
      id: 'queue_remaining',
      title: 'キュー残件',
      status: unresolvedCount === 0 ? 'pass' : 'blocked',
      target: 'pending、fetch_error、needs_review、no_representative_product、不明statusを0件にする',
      actual: `pending ${pendingCount} / fetch_error ${fetchErrorCount} / needs_review ${needsReviewCount} / 代表文書なし ${noRepresentativeProductCount} / 不明 ${otherStatusCount}`,
      nextAction: unresolvedCount === 0
        ? '対応不要'
        : '未処理、通信失敗、PMDA候補なし、要確認を原因別に閉じる'
    }),
    gate({
      id: 'data_rows',
      title: 'PMDA抽出データ',
      status: dataMetrics.interactionRowCount + dataMetrics.conditionRowCount > 0 ? 'pass' : 'blocked',
      target: 'PMDA公式添付文書由来の相互作用または患者状態禁忌データが存在する',
      actual: `相互作用 ${dataMetrics.interactionRowCount}行 / 患者状態禁忌 ${dataMetrics.conditionRowCount}行`,
      nextAction: dataMetrics.interactionRowCount + dataMetrics.conditionRowCount > 0
        ? '対応不要'
        : 'drug-label:fetchを実行し、PMDA由来の実データをdrug_infos.jsonへ反映する'
    }),
    gate({
      id: 'source_urls',
      title: 'PMDA根拠URL',
      status: dataMetrics.nonPmdaSourceUrlCount === 0 && dataMetrics.uniqueSourceUrlCount > 0 ? 'pass' : 'blocked',
      target: 'sourceUrlはPMDA公式ドメインだけで、ユニーク根拠URLが1件以上ある',
      actual: `PMDA行 ${dataMetrics.pmdaSourceUrlCount} / 非PMDA行 ${dataMetrics.nonPmdaSourceUrlCount} / unique sourceUrl ${dataMetrics.uniqueSourceUrlCount}`,
      nextAction: dataMetrics.nonPmdaSourceUrlCount === 0 && dataMetrics.uniqueSourceUrlCount > 0
        ? '対応不要'
        : 'PMDA以外のsourceUrlや空sourceUrlを取り除き、公式添付文書から再取得する'
    }),
    gate({
      id: 'legacy_schema',
      title: '旧データ混入',
      status: dataMetrics.oldTargetDrugSchemaCount === 0 && dataMetrics.keggSignalCount === 0 ? 'pass' : 'blocked',
      target: '旧targetDrug単数スキーマとKEGG由来文言を0件にする',
      actual: `旧targetDrug ${dataMetrics.oldTargetDrugSchemaCount} / KEGG信号 ${dataMetrics.keggSignalCount}`,
      nextAction: dataMetrics.oldTargetDrugSchemaCount === 0 && dataMetrics.keggSignalCount === 0
        ? '対応不要'
        : '旧スキーマとKEGG由来データをPMDA公式添付文書由来データへ置き換える'
    })
  ];
  const status = summarizeStatus(gates);
  const nextActions = uniqueActions(gates);

  return {
    type: 'yakureki-official-drug-label-queue-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: statusLabel(status),
    actionLabel: actionLabel(status),
    canCloseP401InternalGate: status === 'pass',
    totalIngredientCount,
    doneCount,
    noInteractionsFoundCount,
    noOfficialLabelFoundCount,
    pendingCount,
    fetchErrorCount,
    needsReviewCount,
    noRepresentativeProductCount,
    otherStatusCount,
    retryCandidateCount: transientFetchFailureCount,
    manualReviewCandidateCount: needsReviewCount + noRepresentativeProductCount + noOfficialLabelFoundCount + noOfficialCandidateCount + otherFetchErrorCount,
    fetchErrorSummary,
    needsReviewSummary,
    dataMetrics,
    samples: {
      pending: sampleIngredients(entries, 'pending'),
      fetchError: sampleIngredients(entries, 'fetch_error'),
      needsReview: sampleIngredients(entries, 'needs_review'),
      noRepresentativeProduct: sampleIngredients(entries, 'no_representative_product'),
      otherStatus: entries
        .filter((entry) => !knownStatuses.has(entry.status))
        .map((entry) => `${entry.ingredient}:${entry.status}`)
        .slice(0, 5)
    },
    privacy: PRIVACY_FLAGS,
    gates,
    passedGateCount: gates.filter((item) => item.status === 'pass').length,
    attentionGateCount: gates.filter((item) => item.status === 'attention').length,
    blockedGateCount: gates.filter((item) => item.status === 'blocked').length,
    nextActions: nextActions.length > 0 ? nextActions : ['対応不要']
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildOfficialDrugLabelQueueReviewCsv(review: OfficialDrugLabelQueueReview): string {
  const rows = [
    ['区分', '判定', '項目', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      'P4-01 PMDAラベルキュー',
      `${review.actionLabel} / 成分${review.totalIngredientCount}件 / done ${review.doneCount} / no_interactions ${review.noInteractionsFoundCount}`,
      review.nextActions[0] ?? '対応不要'
    ],
    [
      'データ',
      review.statusLabel,
      'PMDA抽出データ',
      `相互作用${review.dataMetrics.interactionRowCount} / 患者状態禁忌${review.dataMetrics.conditionRowCount} / sourceUrl${review.dataMetrics.uniqueSourceUrlCount}`,
      review.dataMetrics.oldTargetDrugSchemaCount === 0 && review.dataMetrics.keggSignalCount === 0 ? '対応不要' : '旧データ混入を解消する'
    ],
    [
      '原因別',
      review.statusLabel,
      'fetch_error内訳',
      `再試行${review.fetchErrorSummary.transientFetchFailureCount} / PMDA候補なし${review.fetchErrorSummary.noOfficialCandidateCount} / その他${review.fetchErrorSummary.otherFetchErrorCount}`,
      review.fetchErrorSummary.transientFetchFailureCount > 0
        ? '通信失敗だけを再試行し、PMDA候補なしは候補確認へ回す'
        : review.fetchErrorSummary.noOfficialCandidateCount > 0
          ? 'PMDA候補なしを人確認へ回す'
          : '対応不要'
    ],
    [
      '原因別',
      review.statusLabel,
      'needs_review内訳',
      review.needsReviewSummary.topFlags.map((item) => `${item.label}:${item.count}`).join(' / ') || 'なし',
      review.needsReviewCount > 0 ? '上位理由からパーサー修正または人確認で閉じる' : '対応不要'
    ],
    [
      'サンプル',
      review.statusLabel,
      '未処理・要確認成分',
      [
        ...review.samples.pending.map((item) => `pending:${item}`),
        ...review.samples.fetchError.map((item) => `fetch_error:${item}`),
        ...review.samples.needsReview.map((item) => `needs_review:${item}`),
        ...review.samples.noRepresentativeProduct.map((item) => `representative_missing:${item}`),
        ...review.samples.otherStatus.map((item) => `other:${item}`)
      ].join(' / ') || 'なし',
      review.pendingCount + review.fetchErrorCount + review.needsReviewCount + review.noRepresentativeProductCount + review.otherStatusCount > 0
        ? 'サンプル成分から処理を再開する'
        : '対応不要'
    ],
    ...review.gates.map((item) => [
      'ゲート',
      item.statusLabel,
      item.title,
      item.actual,
      item.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildOfficialDrugLabelQueueChecklist(review: OfficialDrugLabelQueueReview): string {
  return [
    '# PMDA公式ラベルキューレビュー',
    '',
    `- 判定: ${review.statusLabel}`,
    `- P4-01内部ゲート: ${review.canCloseP401InternalGate ? '閉じられる' : '保留'}`,
    `- キュー: 成分 ${review.totalIngredientCount}件 / done ${review.doneCount}件 / 相互作用なし ${review.noInteractionsFoundCount}件 / 公式候補なし ${review.noOfficialLabelFoundCount}件`,
    `- 残件: pending ${review.pendingCount}件 / fetch_error ${review.fetchErrorCount}件 / needs_review ${review.needsReviewCount}件 / 代表文書なし ${review.noRepresentativeProductCount}件 / 不明 ${review.otherStatusCount}件`,
    `- fetch_error内訳: 再試行 ${review.fetchErrorSummary.transientFetchFailureCount}件 / PMDA候補なし ${review.fetchErrorSummary.noOfficialCandidateCount}件 / その他 ${review.fetchErrorSummary.otherFetchErrorCount}件`,
    `- needs_review上位理由: ${review.needsReviewSummary.topFlags.map((item) => `${item.label} (${item.count}件)`).join(' / ') || 'なし'}`,
    `- データ: 相互作用 ${review.dataMetrics.interactionRowCount}行 / 患者状態禁忌 ${review.dataMetrics.conditionRowCount}行 / unique sourceUrl ${review.dataMetrics.uniqueSourceUrlCount}件`,
    `- 旧データ: targetDrug単数 ${review.dataMetrics.oldTargetDrugSchemaCount}件 / KEGG信号 ${review.dataMetrics.keggSignalCount}件`,
    '',
    '## ゲート',
    ...review.gates.map((item) => `- [${item.status === 'pass' ? 'x' : ' '}] ${item.title}: ${item.actual}`),
    '',
    '## 次の対応',
    ...review.nextActions.map((action) => `- ${action}`),
    '',
    '## 成果物に入れないもの',
    '- 患者名、患者ID、生年月日、保険番号',
    '- PMDA HTML本文',
    '- ローカル絶対パス',
    '- 認証情報やトークン'
  ].join('\n');
}
