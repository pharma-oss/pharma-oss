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
