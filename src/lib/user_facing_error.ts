// 失敗を利用者に見せる文言を決める。
//
// 日本語のメッセージ(「監査ログ記録に失敗したため、変更を取り消しました」など、利用者に向けて書かれたもの)は
// そのまま見せる。RxDB やブラウザの内部のエラー文言(英語、コード)は見せず、代わりの文言(fallback)にする。
// RxDB 17.4.0 の RxError.message 末尾に付く `Parameters:` ブロックには患者データや passwordHash が
// 含まれ得るため、必ず取り除いてから判定・返却する。
// 画面が「保存に失敗しました」だけだと、監査ログが原因のときも、入力し直して同じ失敗を繰り返してしまう。
const JAPANESE_TEXT = /[ぁ-ゖァ-ヺ一-鿿]/;

export function stripRxdbErrorParameters(message: string): string {
  const lines = message.split(/\r?\n/);
  let cutIndex = -1;

  for (let i = 0; i < lines.length - 1; i++) {
    if (/^-{20,}$/.test(lines[i]) && /^Parameters:/.test(lines[i + 1])) {
      cutIndex = i;
      break;
    }
  }

  if (cutIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/^Parameters:/.test(lines[i])) {
        cutIndex = i;
        break;
      }
    }
  }

  const body = cutIndex !== -1 ? lines.slice(0, cutIndex).join('\n') : message;
  return body.replace(/[0-9a-fA-F]{64,}/g, '[省略]').trim();
}

export function extractErrorMessage(error: unknown): string | undefined {
  let rawMessage: string | undefined;
  if (error instanceof Error) {
    rawMessage = error.message;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    rawMessage = (error as { message: string }).message;
  }
  if (!rawMessage) return undefined;
  const sanitized = stripRxdbErrorParameters(rawMessage);
  return sanitized.length > 0 ? sanitized : undefined;
}

export function userFacingErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const sanitized = stripRxdbErrorParameters(error.message);
  return sanitized.length > 0 && JAPANESE_TEXT.test(sanitized) ? sanitized : fallback;
}
