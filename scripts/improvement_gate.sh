#!/usr/bin/env bash
# 継続改善のゲート(tsc / lint / テスト / ビルド)を、docs/gemini_continuous_improvement_guide.md の §5 のとおりに実行する。
#
#   bash scripts/improvement_gate.sh <TAG>
#
# TAG は baseline / final、一括実行では <テーマID>-baseline / <テーマID>-final。
# 再実行は別の TAG にする(例: final-rerun)。同じ TAG のディレクトリが既にあれば何もせず止まる(赤の出力を上書きしない)。
# 出力は artifacts/improvement/<日付-時刻>-<TAG>/ の tsc.txt / lint.txt / test.txt / build.txt。
# 各ファイルの末尾に "exit N" の行が残る。ゲートは直列に実行する(build の実行中にソースを触らない)。

set -u
cd "$(dirname "$0")/.." || exit 2

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "usage: bash scripts/improvement_gate.sh <TAG>" >&2
  exit 2
fi

# 日付と時刻が違っても、同じ TAG のディレクトリが既にあれば止まる(赤の出力を残すため、TAG を使い回さない)
if compgen -G "artifacts/improvement/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]-$TAG" > /dev/null; then
  echo "TAG already used (use another TAG, e.g. $TAG-rerun):" >&2
  compgen -G "artifacts/improvement/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]-$TAG" >&2
  exit 2
fi
OUT="artifacts/improvement/$(date +%Y%m%d-%H%M)-$TAG"
mkdir -p "$OUT"

npx tsc --noEmit > "$OUT/tsc.txt" 2>&1;   echo "exit $?" >> "$OUT/tsc.txt"
npm run lint     > "$OUT/lint.txt" 2>&1;  echo "exit $?" >> "$OUT/lint.txt"
npm test         > "$OUT/test.txt" 2>&1;  echo "exit $?" >> "$OUT/test.txt"
npm run build    > "$OUT/build.txt" 2>&1; echo "exit $?" >> "$OUT/build.txt"

tail -n 12 "$OUT/test.txt"
grep -E "^exit" "$OUT"/*.txt
echo "OUT=$OUT"
