#!/usr/bin/env bash
# 継続改善の変異テスト(fail-first mutation)を 1 件実行する。docs/gemini_continuous_improvement_guide.md の §6 を参照。
#
#   bash scripts/improvement_mutate.sh <ラベル> <対象ファイル> <変える前の文字列> <変えた後の文字列> <テストファイル>...
#
# 例:
#   bash scripts/improvement_mutate.sh A-severity src/lib/dashboard_tasks.ts "severity: 'error'," "severity: 'warning'," src/lib/dashboard_tasks.test.ts
#
# やること(手で sed や python を使わずに、必ずこのスクリプトで変異を当てる):
#   1. 対象ファイルを artifacts/improvement/<日付-時刻>-mutbak/ へ .txt でバックアップする(.ts のまま置くと tsc が拾う)
#   2. 「変える前の文字列」がファイルにちょうど 1 回だけ出現することを確かめてから置換する(0 回や 2 回以上なら何も変えず止まる)
#   3. 指定したテストファイルだけを TZ=Asia/Tokyo npx tsx --test で実行する(ファイルは別々の引数のまま渡す)
#   4. バックアップから cp で戻し、戻ったことを cmp で確かめる(途中で止まっても、終了時に必ず戻す)
#   5. 結果を artifacts/improvement/<日付-時刻>-mutations/<ラベル>.txt に保存し、要約を表示する
#
# 変異表(報告)の「落ちたテスト名」と件数は、この結果ファイルの「落ちたテスト」の行だけから書く。
# 結果ファイルが無い変異を報告の表に書かない。同じラベルは使い回せない(証拠を上書きしない)。
# 複数行の文字列は、そのままシェルの引用符の中に改行を入れて渡せる。

set -u
cd "$(dirname "$0")/.." || exit 2

if [ "$#" -lt 5 ]; then
  echo "usage: bash scripts/improvement_mutate.sh <label> <file> <old> <new> <test-file>..." >&2
  exit 2
fi

LABEL="$1"; FILE="$2"; OLD="$3"; NEW="$4"; shift 4
if ! [[ "$LABEL" =~ ^[A-Za-z0-9_-]+$ ]]; then echo "label must match [A-Za-z0-9_-]+: $LABEL" >&2; exit 2; fi
if [ ! -f "$FILE" ]; then echo "no such file: $FILE" >&2; exit 2; fi
if [ -z "$OLD" ]; then echo "old string is empty" >&2; exit 2; fi
if [ "$OLD" = "$NEW" ]; then echo "old and new are identical (not a mutation)" >&2; exit 2; fi
for t in "$@"; do
  if [ ! -f "$t" ]; then echo "no such test file: $t (pass each test file as its own argument)" >&2; exit 2; fi
done

STAMP="$(date +%Y%m%d-%H%M)"
BAKDIR="artifacts/improvement/${STAMP}-mutbak"
RESDIR="artifacts/improvement/${STAMP}-mutations"

# 同じラベルの結果が(別の分でも)既にあれば止まる
if compgen -G "artifacts/improvement/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]-mutations/${LABEL}.txt" > /dev/null; then
  echo "label already used (choose another label):" >&2
  compgen -G "artifacts/improvement/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]-mutations/${LABEL}.txt" >&2
  exit 2
fi

mkdir -p "$BAKDIR" "$RESDIR"
BAK="$BAKDIR/${FILE//\//__}.txt"
RES="$RESDIR/${LABEL}.txt"
cp "$FILE" "$BAK"

restore() {
  cp "$BAK" "$FILE"
}
trap restore EXIT INT TERM

# 置換(出現回数が 1 回でなければ変えない)
if ! OLD="$OLD" NEW="$NEW" FILE="$FILE" python3 -I - <<'PY'
import os, sys
path = os.environ['FILE']; old = os.environ['OLD']; new = os.environ['NEW']
text = open(path, encoding='utf-8').read()
n = text.count(old)
if n != 1:
    sys.stderr.write(f'old string occurs {n} times in {path} (need exactly 1); nothing was changed\n')
    sys.exit(3)
open(path, 'w', encoding='utf-8').write(text.replace(old, new))
PY
then
  exit 3
fi

OUTFILE="$(mktemp)"
TZ=Asia/Tokyo npx tsx --test "$@" > "$OUTFILE" 2>&1
TEST_EXIT=$?

restore
if cmp -s "$BAK" "$FILE"; then RESTORED="yes"; else RESTORED="NO (restore failed)"; fi
trap - EXIT INT TERM

SUMMARY="$(grep -E '^ℹ (tests|pass|fail)' "$OUTFILE" | tr '\n' ' ')"
FAILED="$(awk '/^✖ failing tests:/{f=1;next} f && /^✖ /{print}' "$OUTFILE" | sed -E 's/ \([0-9.]+ms\)$//' | sort -u)"
if [ -z "$SUMMARY" ]; then
  RESULT="ERROR (テストが実行されなかった。ファイル名・引数を確かめる。この結果は変異の検出として数えない)"
elif [ "$TEST_EXIT" -ne 0 ]; then
  RESULT="CAUGHT (テストが落ちた)"
else
  RESULT="SURVIVED (すべて通った。生き残り)"
fi

{
  echo "label: $LABEL"
  echo "file: $FILE"
  echo "tests: $*"
  echo "old: <<<"; printf '%s\n' "$OLD"; echo ">>>"
  echo "new: <<<"; printf '%s\n' "$NEW"; echo ">>>"
  echo "result: $RESULT"
  echo "summary: $SUMMARY"
  echo "restored: $RESTORED"
  echo "落ちたテスト:"
  if [ -n "$FAILED" ]; then printf '%s\n' "$FAILED"; else echo "(なし)"; fi
  echo "--- テスト出力(全文) ---"
  cat "$OUTFILE"
} > "$RES"
rm -f "$OUTFILE"

echo "label:    $LABEL"
echo "result:   $RESULT"
echo "summary:  $SUMMARY"
echo "restored: $RESTORED"
echo "落ちたテスト:"
if [ -n "$FAILED" ]; then printf '  %s\n' "$FAILED"; else echo "  (なし)"; fi
echo "evidence: $RES"
[ "$RESTORED" = "yes" ] || exit 4
exit 0
