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
  mynaCardReader: {
    label: 'マイナ読取',
    // 読取結果を受け取って画面に入れる処理はあるが、カードや資格確認端末から実際に情報を取り出す部分が無い
    // (連携の仕様書はオンライン資格確認の医療機関等ONSにあり、まだ入手できていない)。
    // 開発用のデモデータを返す設定だけが動く状態なので、現場では押せなくする。
    implemented: false,
    unavailableReason: 'マイナ読取は、連携の仕様が未入手のため実装できていません。保険情報は手入力してください。'
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
