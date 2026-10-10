import { ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';

// 取り消し(元の値へ戻す)のための書き込み。
//
// RxDocument の patch() は、そのインスタンスが読み込んだ時点のスナップショットを基準に書く。
// 同じインスタンスで一度書いたあとにもう一度 patch() すると、基準の版が古いので必ず
// RxError (CONFLICT) になる(別の書き込みが間に入ったときも同じ)。「書いて、監査ログが残らなければ
// 同じインスタンスで元に戻す」という取り消しは、patch() では実際のデータベースでは失敗する。
//
// incrementalPatch() は最新の版に対して書き、衝突したら最新を読み直して再試行する。
// 取り消しにはこちらを使う。通常の書き込みは、他端末との同時更新を検出できるよう patch() のままにする。
interface PatchableDocument {
  patch: (values: any) => Promise<unknown>;
  incrementalPatch?: (values: any) => Promise<unknown>;
}

export async function restoreFields(doc: PatchableDocument, values: Record<string, unknown>): Promise<void> {
  // incrementalPatch が無いのは RxDB 以外の差し替え(テスト用のドキュメントなど)だけ
  if (typeof doc.incrementalPatch === 'function') {
    await doc.incrementalPatch(values);
  } else {
    await doc.patch(values);
  }
}

// 書き換え関数で戻すとき(項目ごと消すなど、値を書くだけでは戻せない場合)。理由は restoreFields と同じ。
interface ModifiableDocument<T> {
  modify: (mutate: (data: T) => T) => Promise<unknown>;
  incrementalModify?: (mutate: (data: T) => T) => Promise<unknown>;
}

export async function restoreWith<T>(doc: ModifiableDocument<T>, mutate: (data: T) => T): Promise<void> {
  if (typeof doc.incrementalModify === 'function') {
    await doc.incrementalModify(mutate);
  } else {
    await doc.modify(mutate);
  }
}

// ---- 複数のドキュメントへの書き込みを、まとめて適用し、まとめて戻す ----

export type ReversiblePatch = {
  doc: PatchableDocument;
  patch: Record<string, unknown>;
  rollbackPatch: Record<string, unknown>;
  label: string;
};

// 元に戻せなかった書き込み(label)。呼び出し側は「データを確認してください」と利用者に伝える。
export class PatchRollbackError extends Error {
  readonly failedLabels: string[];
  constructor(failedLabels: string[]) {
    super(`元に戻せなかった書き込み: ${failedLabels.join(', ')}`);
    this.name = 'PatchRollbackError';
    this.failedLabels = failedLabels;
  }
}

// 適用済みの書き込みを逆順に戻す。1つ失敗しても残りは戻し、戻せなかったものがあれば最後に PatchRollbackError を投げる。
export async function rollbackAppliedPatches(appliedPatches: ReversiblePatch[]): Promise<void> {
  const failedLabels: string[] = [];
  for (let i = appliedPatches.length - 1; i >= 0; i--) {
    const operation = appliedPatches[i];
    try {
      await restoreFields(operation.doc, operation.rollbackPatch);
    } catch (error) {
      console.error(`Failed to rollback ${operation.label}:`, error);
      failedLabels.push(operation.label);
    }
  }
  if (failedLabels.length > 0) throw new PatchRollbackError(failedLabels);
}

// 書き込みを順に適用し、適用済みの一覧を返す。途中で失敗したらそこまでを戻して元のエラーを投げる。
// 戻す処理にも失敗したときは、その旨をメッセージに加える(在庫が中途半端に残っていることを利用者に伝える)。
export async function applyReversiblePatches(operations: ReversiblePatch[]): Promise<ReversiblePatch[]> {
  const applied: ReversiblePatch[] = [];
  try {
    for (const operation of operations) {
      await operation.doc.patch(operation.patch);
      applied.push(operation);
    }
  } catch (error) {
    try {
      await rollbackAppliedPatches(applied);
    } catch {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${reason}${ROLLBACK_ALSO_FAILED_NOTE}`);
    }
    throw error;
  }
  return applied;
}

// 適用済みの書き込みを戻し、戻せなかったものがあれば利用者に伝える注意書きを返す(全部戻せたら空文字)。
// 失敗の通知にそのまま足せる。
export async function undoAppliedPatchesNote(appliedPatches: ReversiblePatch[]): Promise<string> {
  try {
    await rollbackAppliedPatches(appliedPatches);
    return '';
  } catch {
    return ROLLBACK_ALSO_FAILED_NOTE;
  }
}

// 取り消し用に「元の値」を取っておくときの複製。
//
// 文書のプロパティ(doc.claimLifecycle など入れ子の値)は structuredClone できない場合があり、そのまま書き戻すと
// RxError (DOC24) で書けない(開発ビルドの実ブラウザで、請求状態の取り消しが必ず失敗した)。JSON で複製すれば
// 書き戻せる。文書全体の toJSON() から取る場合は不要。undefined はそのまま返す。
export function plainCopy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
