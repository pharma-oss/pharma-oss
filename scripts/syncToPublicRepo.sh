#!/bin/bash
# private (yakureki, non-public forever) -> public (pharma-oss/pharma-oss clone) への
# 作業ツリー同期。git履歴は一切コピーしない。公開クローン側で通常のインクリメンタル
# コミットを作るための下準備として、追跡ファイルをrsyncするだけ。
#
# 使い方:
#   scripts/syncToPublicRepo.sh [公開クローンのパス]
#   (パス省略時は ../pharma-oss を既定とする)
#
# 実行後、公開クローン側で `git status` / `git diff` を見て内容を確認してから
# 手動で commit & push すること(自動コミットはしない)。

set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${1:-$SOURCE_DIR/../pharma-oss}"

if [ ! -d "$DEST_DIR/.git" ]; then
  echo "エラー: $DEST_DIR は git リポジトリではありません。先に" >&2
  echo "  git clone https://github.com/pharma-oss/pharma-oss.git $DEST_DIR" >&2
  echo "を実行してください。" >&2
  exit 1
fi

# 公開クローンの origin が本当に pharma-oss を指しているか確認する
# (誤って private リポジトリへ同期・上書きするのを防ぐ safety check)
DEST_REMOTE="$(git -C "$DEST_DIR" remote get-url origin 2>/dev/null || true)"
case "$DEST_REMOTE" in
  *pharma-oss/pharma-oss*) ;;
  *)
    echo "エラー: $DEST_DIR の origin が pharma-oss/pharma-oss ではありません ($DEST_REMOTE)。" >&2
    echo "誤った同期先の可能性があるため中止します。" >&2
    exit 1
    ;;
esac

echo "sync: $SOURCE_DIR -> $DEST_DIR"

rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.claude/' \
  --exclude 'docs/internal/' \
  --exclude '/artifacts/' \
  --exclude '/tmp/' \
  --exclude '/tmp-dist/' \
  --exclude '/test-results/' \
  --exclude '/external_exports/' \
  --exclude '/coverage/' \
  --exclude '*.tsbuildinfo' \
  --exclude 'next-env.d.ts' \
  --exclude 'dev_server.log' \
  --exclude '.env*.local' \
  --exclude '.DS_Store' \
  --exclude '/missing_shiori_all.json' \
  --exclude '/test_output.log' \
  --exclude 'pnpm-lock.yaml' \
  --exclude 'pnpm-workspace.yaml' \
  "$SOURCE_DIR/" "$DEST_DIR/"

echo "done. 公開クローン側で確認してください:"
echo "  cd $DEST_DIR && git status"
