import type { Drug } from '../db/types.ts';

// 薬品ドキュメントを、そのまま書き戻せる完全なレコード(全項目)にする。
//
// bulkUpsert / upsert は文書を丸ごと置き換える。書き戻す項目を1つずつ列挙してコピーすると、列挙し忘れた
// 項目が更新のたびに消える(薬価マスタの更新で、発注点・リードタイム・目標在庫が消えていた)。
// 項目を足したときに直し忘れないよう、列挙ではなく文書の全体から作る。
export function drugRecordFromDocument(doc: { toJSON: () => unknown }): Drug {
  return structuredClone(doc.toJSON()) as Drug;
}
