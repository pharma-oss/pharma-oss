// 出力済みの請求と、いま計算し直した点数のずれを受付横断で洗い出す。
//
// 算定の実装を直すと、既に UKE を出した受付の点数が変わることがある。
// 印刷画面の請求時点スナップショット差分は1件ずつしか見られないので、
// 「どの請求が影響を受けたか」を運用者が把握できない。
//
// 点数を作り直すのではなく、出力時点に記録された点数と突き合わせるだけ。
// 何を再提出するかは運用者が決める。

export interface ClaimPointsDriftInput {
  visitId: string;
  patientName?: string;
  dispensingDate?: string;
  claimStatus?: string;
  exportedAt?: string;
  exportedFileName?: string;
  /** 出力時点のスナップショットに記録された点数 */
  exportedPoints?: number;
  /** いま同じ受付を計算し直した点数。計算できなければ省略 */
  currentPoints?: number;
}

/** increased/decreased は再計算できた場合。unknown は計算し直せなかった受付 */
export type ClaimPointsDriftKind = 'increased' | 'decreased' | 'unknown';

export interface ClaimPointsDriftCase {
  visitId: string;
  patientName: string;
  dispensingDate: string;
  claimStatus: string;
  exportedAt: string;
  exportedFileName: string;
  exportedPoints: number;
  /** unknown のときは省略 */
  currentPoints?: number;
  /** unknown のときは省略。現在 − 出力時点 */
  deltaPoints?: number;
  kind: ClaimPointsDriftKind;
}

export interface ClaimPointsDriftReview {
  /** 出力済みとして突き合わせた受付の件数 */
  checkedCount: number;
  /** ずれのあった受付だけ。ずれの大きい順 */
  cases: ClaimPointsDriftCase[];
  increasedCount: number;
  decreasedCount: number;
  unknownCount: number;
  /** 増減の合計（増えた分と減った分を相殺した値） */
  netDeltaPoints: number;
}

function text(value: string | undefined, fallback = ''): string {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? fallback : trimmed;
}

/**
 * 出力済みの受付を突き合わせる。
 *
 * 出力時点の点数を持たない受付は、比べるものが無いので数えない
 * （まだ出力していない受付がここに混ざると件数の意味が変わる）。
 */
export function buildClaimPointsDriftReview(
  inputs: ClaimPointsDriftInput[]
): ClaimPointsDriftReview {
  const checked = (inputs || []).filter((input) => Number.isFinite(input?.exportedPoints as number));

  const cases: ClaimPointsDriftCase[] = [];
  for (const input of checked) {
    const exportedPoints = input.exportedPoints as number;
    const base = {
      visitId: text(input.visitId),
      patientName: text(input.patientName, '（患者名なし）'),
      dispensingDate: text(input.dispensingDate, '不明'),
      claimStatus: text(input.claimStatus, '不明'),
      exportedAt: text(input.exportedAt, '不明'),
      exportedFileName: text(input.exportedFileName, '不明'),
      exportedPoints
    };

    if (!Number.isFinite(input.currentPoints as number)) {
      // 計算し直せない受付を黙って落とすと、ずれが無かったのと同じに見えてしまう
      cases.push({ ...base, kind: 'unknown' });
      continue;
    }

    const currentPoints = input.currentPoints as number;
    const deltaPoints = currentPoints - exportedPoints;
    if (deltaPoints === 0) continue;

    cases.push({
      ...base,
      currentPoints,
      deltaPoints,
      kind: deltaPoints > 0 ? 'increased' : 'decreased'
    });
  }

  cases.sort((a, b) => {
    const weight = (item: ClaimPointsDriftCase) => item.kind === 'unknown'
      ? Number.POSITIVE_INFINITY
      : Math.abs(item.deltaPoints as number);
    const diff = weight(b) - weight(a);
    return diff !== 0 ? diff : a.visitId.localeCompare(b.visitId);
  });

  return {
    checkedCount: checked.length,
    cases,
    increasedCount: cases.filter((item) => item.kind === 'increased').length,
    decreasedCount: cases.filter((item) => item.kind === 'decreased').length,
    unknownCount: cases.filter((item) => item.kind === 'unknown').length,
    netDeltaPoints: cases.reduce((sum, item) => sum + (item.deltaPoints ?? 0), 0)
  };
}

/** 画面と監査ログで同じ文言を使う */
export function formatClaimPointsDriftSummary(review: ClaimPointsDriftReview): string {
  if (review.checkedCount === 0) return '出力済みの請求がありません。';
  if (review.cases.length === 0) {
    return `出力済み ${review.checkedCount}件を突き合わせ、点数のずれはありませんでした。`;
  }
  const parts = [`出力済み ${review.checkedCount}件のうち ${review.cases.length}件で点数が変わっています`];
  if (review.increasedCount > 0) parts.push(`増 ${review.increasedCount}件`);
  if (review.decreasedCount > 0) parts.push(`減 ${review.decreasedCount}件`);
  if (review.unknownCount > 0) parts.push(`再計算できず ${review.unknownCount}件`);
  parts.push(`差引 ${review.netDeltaPoints >= 0 ? '+' : ''}${review.netDeltaPoints}点`);
  return `${parts.join(' / ')}。`;
}

function csvCell(value: unknown): string {
  let text_ = String(value ?? '');
  // 表計算ソフトで数式として解釈されないようにする。
  // ただの数値（-44 など）は数式ではないので、そのまま出して合計できるようにする。
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(text_.trim());
  if (!isPlainNumber && /^[=+\-@]/.test(text_.trimStart())) text_ = `'${text_}`;
  return `"${text_.replace(/"/g, '""')}"`;
}

export function buildClaimPointsDriftCsv(review: ClaimPointsDriftReview): string {
  const rows: unknown[][] = [
    ['受付ID', '患者名', '調剤日', '請求状態', '出力日時', '出力ファイル', '出力時点の点数', '現在の点数', '差', '区分']
  ];
  for (const item of review.cases) {
    rows.push([
      item.visitId,
      item.patientName,
      item.dispensingDate,
      item.claimStatus,
      item.exportedAt,
      item.exportedFileName,
      item.exportedPoints,
      item.currentPoints ?? '',
      // 符号は数値そのものが持つ。増減は次の列で言う。
      item.deltaPoints ?? '',
      item.kind === 'increased' ? '増' : item.kind === 'decreased' ? '減' : '再計算できず'
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function makeClaimPointsDriftCsvFileName(createdAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `yakureki_claim_points_drift_${createdAt.getFullYear()}${pad(createdAt.getMonth() + 1)}`
    + `${pad(createdAt.getDate())}_${pad(createdAt.getHours())}${pad(createdAt.getMinutes())}`
    + `${pad(createdAt.getSeconds())}.csv`;
}
