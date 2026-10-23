// 製品としてまだ実装していない機能の一覧。
//
// 実装していない機能のボタンを押せる状態にしておくと、押してもエラーや「接続先が未設定」になるだけで、
// 現場が「壊れている」のか「まだ無い」のか区別できない。ここで implemented を false にした機能は、
// 画面側でボタンを「未実装」の表示にして押せなくする。実装できたらここを true にして画面を戻す。

export interface FeatureAvailability {
  /** 画面に出す機能名 */
  label: string;
  implemented: boolean;
  /** 未実装のとき、ボタンの近くに出す説明 */
  unavailableReason: string;
}

export const FEATURE_AVAILABILITY = {
  electronicPrescription: {
    label: '電子処方箋',
    // アプリ側の取得・検証処理はあるが、電子処方箋管理サービスへ実際につなぐ接続モジュールが無く、
    // 実運用で処方箋を取得できない。
    implemented: false,
    unavailableReason: '電子処方箋管理サービスと接続するモジュールがまだ無く、取得できません。紙の処方箋か、処方箋QRで受付してください。'
  },
  // マイナ読取(保険情報・氏名・生年月日)は、資格確認端末の連携フォルダを読む形で実装した。使えるかどうかは
  // 接続先の設定で決まるので、ここには置かない(GET /api/myna/status と useMynaReaderAvailability を参照)。
  mynaClinicalImport: {
    label: 'マイナ取込（特定健診・薬剤履歴）',
    // 特定健診・薬剤情報のXML(YZK/TKK系)は、資格確認結果とは別の電文で、形式を確かめられる資料が無い。
    implemented: false,
    unavailableReason: 'マイナからの特定健診情報・薬剤履歴の取込は、連携の仕様が未入手のため実装できていません。'
  },
  onlineEligibility: {
    label: 'オンライン資格確認',
    implemented: false,
    unavailableReason: 'オンライン資格確認は、連携の仕様が未入手のため実装できていません。保険者番号・負担割合は手入力してください。'
  }
} as const satisfies Record<string, FeatureAvailability>;

export type FeatureKey = keyof typeof FEATURE_AVAILABILITY;

export const UNIMPLEMENTED_BADGE_LABEL = '未実装';

export function isFeatureImplemented(key: FeatureKey): boolean {
  return FEATURE_AVAILABILITY[key].implemented;
}

/** ボタンに付ける表示。実装済みなら元のラベルのまま、未実装なら「（未実装）」を添える。 */
export function labelWithAvailability(key: FeatureKey, label: string): string {
  return isFeatureImplemented(key) ? label : `${label}（${UNIMPLEMENTED_BADGE_LABEL}）`;
}
