// 実際の RxDB と同じ「版」の性質を持つ、テスト用の最小のドキュメントとコレクション。
//
// - インスタンスは読み込んだ時点の版を覚えていて、patch() はその版が最新でなければ CONFLICT を投げる。
//   書いたあとも、そのインスタンス自身は古い版のまま(実際の RxDB と同じ)。
// - incrementalPatch() と getLatest() は最新の版に対して働く。
// 単純に Object.assign するだけの偽物は、「同じインスタンスで書いて、同じインスタンスで戻す」取り消しの
// 失敗(CONFLICT)を再現できず、壊れた取り消しがテストを通ってしまう。
export class RxLikeConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor() {
    super('RxError (CONFLICT)');
  }
}

export interface RxLikeDocument {
  [field: string]: unknown;
  patch: (values: Record<string, unknown>) => Promise<RxLikeDocument>;
  incrementalPatch: (values: Record<string, unknown>) => Promise<RxLikeDocument>;
  modify: (mutate: (data: any) => any) => Promise<RxLikeDocument>;
  incrementalModify: (mutate: (data: any) => any) => Promise<RxLikeDocument>;
  getLatest: () => RxLikeDocument;
  remove: () => Promise<void>;
  toJSON: () => Record<string, unknown>;
}

export class RxLikeStore {
  private data: Record<string, unknown>;
  private revision = 1;
  removed = false;
  writeLog: Array<Record<string, unknown>> = [];
  // 書き込みを失敗させたいときに設定する(true を返すと、その書き込みは通常のエラーで失敗する)
  failWrite: ((values: Record<string, unknown>) => boolean) | null = null;

  constructor(initial: Record<string, unknown>) {
    this.data = { ...initial };
  }

  current(): Record<string, unknown> {
    return { ...this.data };
  }

  /** 最新の版のインスタンス */
  open(): RxLikeDocument {
    return this.instance(this.revision, { ...this.data });
  }

  /** 項目の削除も含めて、ドキュメント全体を差し替える(modify 用) */
  private replace(next: Record<string, unknown>) {
    if (this.failWrite?.(next)) throw new Error(`write failed: ${JSON.stringify(next)}`);
    this.data = { ...next };
    this.revision += 1;
    this.writeLog.push({ ...next });
  }

  private write(values: Record<string, unknown>) {
    if (this.failWrite?.(values)) throw new Error(`write failed: ${JSON.stringify(values)}`);
    Object.assign(this.data, values);
    this.revision += 1;
    this.writeLog.push({ ...values });
  }

  private instance(revision: number, snapshot: Record<string, unknown>): RxLikeDocument {
    const store = this;
    const doc: RxLikeDocument = {
      ...snapshot,
      async patch(values) {
        if (revision !== store.revision) throw new RxLikeConflictError();
        store.write(values);
        return store.open();
      },
      async incrementalPatch(values) {
        store.write(values);
        return store.open();
      },
      async modify(mutate) {
        if (revision !== store.revision) throw new RxLikeConflictError();
        store.replace(await mutate({ ...snapshot }));
        return store.open();
      },
      async incrementalModify(mutate) {
        store.replace(await mutate({ ...store.current() }));
        return store.open();
      },
      getLatest() {
        return store.open();
      },
      async remove() {
        store.removed = true;
      },
      toJSON() {
        return { ...snapshot };
      }
    };
    return doc;
  }
}
