#!/usr/bin/env bash
# 継続改善の回帰ガード(SW-F)と any の件数を、docs/gemini_continuous_improvement_guide.md の §4.2 のとおりに数える。
#
#   bash scripts/improvement_swf.sh
#
# scripts/improvement_gate.sh が、ゲートのたびに出力を $OUT/swf.txt へ保存する。報告の SW-F の欄は、そのファイルの数字をそのまま書く
# (項目名も数え方も変えない。別のコマンドで数えた数字を書かない)。基準値は括弧の中。

set -u
cd "$(dirname "$0")/.." || exit 2

count_lines() { wc -l | tr -d ' '; }

echo -n "inline-style (基準 3): "
grep -rnE 'style=\{\{' src --include='*.tsx' | grep -v -E '\.test\.' | count_lines
echo -n "process-env-files (基準 4): "
grep -rlE 'process\.env' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.|lib/env\.ts' | count_lines
echo -n "await-logAuditAction (基準 5): "
grep -rnE '^[[:space:]]*await[[:space:]]+logAuditAction\(' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | count_lines
echo -n "typeof-function-tests (基準 0): "
grep -rnE "typeof [A-Za-z_.]+ === 'function'" src --include='*.test.ts' --include='*.test.tsx' | count_lines
echo -n "ts-ignore (基準 0): "
grep -rnE '@ts-(ignore|expect-error|nocheck)' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | count_lines
echo -n "colon-any: "
grep -rnE ':[[:space:]]*any\b' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | count_lines
echo -n "as-any: "
grep -rnE 'as any\b' src --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.' | count_lines
