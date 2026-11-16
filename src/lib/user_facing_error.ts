// 失敗を利用者に見せる文言を決める。
//
// 日本語のメッセージ(「監査ログ記録に失敗したため、変更を取り消しました」など、利用者に向けて書かれたもの)は
// そのまま見せる。RxDB やブラウザの内部のエラー文言(英語、コード)は見せず、代わりの文言(fallback)にする。
// 画面が「保存に失敗しました」だけだと、監査ログが原因のときも、入力し直して同じ失敗を繰り返してしまう。
const JAPANESE_TEXT = /[ぁ-ゖァ-ヺ一-鿿]/;

export function extractErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message || undefined;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message || undefined;
  }
  return undefined;
}

export function userFacingErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && JAPANESE_TEXT.test(error.message) ? error.message : fallback;
}
