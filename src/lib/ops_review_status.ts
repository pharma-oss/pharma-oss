/**
 * 運用レビュー CLI の判定。3 値の意味は docs/ops_review_ledger.md §0 が正本。
 * pass      … 確認が済み、次へ進んでよい
 * attention … 確認が済んでいない項目がある。業務は続けられる
 * blocked   … 進めてはならない未達がある
 */
export type OpsReviewStatus = 'pass' | 'attention' | 'blocked';

export const OPS_REVIEW_STATUSES: OpsReviewStatus[] = ['pass', 'attention', 'blocked'];

/** 台帳 §0 の終了コード規約。pass は 0、それ以外は 1 */
export function opsReviewStatusExitCode(status: OpsReviewStatus): 0 | 1 {
  return status === 'pass' ? 0 : 1;
}

export function isOpsReviewStatus(value: unknown): value is OpsReviewStatus {
  return typeof value === 'string' && OPS_REVIEW_STATUSES.includes(value as OpsReviewStatus);
}
