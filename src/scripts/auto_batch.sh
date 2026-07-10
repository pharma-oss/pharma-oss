#!/bin/bash
set -e
export NODE_USE_ENV_PROXY=1

# プロキシ設定の表示（確認用）
echo "Proxy configuration check:"
echo "NODE_USE_ENV_PROXY=$NODE_USE_ENV_PROXY"

BATCH_COUNT=1

while true; do
  echo "=================================================="
  echo "  Starting Batch #$BATCH_COUNT at $(date)"
  echo "=================================================="
  
  # 1. バッチフェッチを実行 (limit=40)
  echo "--> Running fetch..."
  npx tsx src/scripts/fetchOfficialDrugInteractionLabels.ts --limit=40
  
  # 2. キューファイルをパースして、pending の残数を確認する
  # jq を使用して残りの pending 件数を取得
  PENDING_REMAINING=$(node -e "
    const fs = require('fs');
    const queue = JSON.parse(fs.readFileSync('src/scripts/officialDrugInteractionIngredientQueue.json', 'utf-8'));
    console.log(queue.filter(e => e.status === 'pending').length);
  ")
  
  echo "Pending remaining: $PENDING_REMAINING"
  
  # 3. 監査を実行 (sample=15)
  echo "--> Running verification..."
  npx tsx src/scripts/verifyOfficialDrugInteractionLabels.ts --sample=15
  
  # 4. pending残数が 0 になったら正常終了
  if [ "$PENDING_REMAINING" -eq 0 ]; then
    echo "=================================================="
    echo "  All pending items have been processed! (Remaining: 0)"
    echo "=================================================="
    break
  fi
  
  # 次のバッチに向けて少しインターバルを置く
  echo "Waiting 5 seconds before Batch #$((BATCH_COUNT + 1))..."
  sleep 5
  
  BATCH_COUNT=$((BATCH_COUNT + 1))
done
