// artifacts/ 配下の各レビュー成果物から status を集めて Markdown 表にする。
// Nightly Ops Review ワークフローが $GITHUB_STEP_SUMMARY へ流し込む。
// 台帳: docs/ops_review_ledger.md
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'artifacts';

function latestSubdir(dir) {
  const subs = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
  if (subs.length === 0) return null;
  return join(dir, subs.sort().at(-1));
}

// 1 ディレクトリ内に check-request / evidence-template など複数 JSON があるため、
// 「status を持つもの」を成果物とみなす。名前順の先頭を取ると別物を拾う。
function findReviewJson(dir) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (parsed && typeof parsed === 'object' && 'status' in parsed) return parsed;
    } catch { /* 壊れた JSON は無視して次を見る */ }
  }
  return null;
}

const rows = [];
if (existsSync(ROOT)) {
  for (const name of readdirSync(ROOT).sort()) {
    const dir = join(ROOT, name);
    if (!statSync(dir).isDirectory()) continue;
    const latest = latestSubdir(dir);
    if (!latest) continue;
    const review = findReviewJson(latest);
    if (!review) continue;
    const num = (...keys) => {
      for (const k of keys) if (typeof review[k] === 'number') return review[k];
      return '-';
    };
    rows.push({
      name,
      status: review.statusLabel ? `${review.status} (${review.statusLabel})` : String(review.status),
      passed: num('passedGateCount', 'passedDocumentCount'),
      attention: num('attentionGateCount', 'attentionDocumentCount'),
      blocked: num('blockedGateCount', 'blockedDocumentCount')
    });
  }
}

const out = [];
out.push('## Nightly Ops Review');
out.push('');
out.push('各レビューの status です。**exit code ではジョブを落としていません。**');
out.push('これらのスクリプトは「レビュー未達」で exit 1 を返す設計のため、');
out.push('赤/緑ではなく下表と artifacts を人が読んで判断してください。');
out.push('');
out.push('台帳: `docs/ops_review_ledger.md`');
out.push('');
if (rows.length === 0) {
  out.push('_成果物が見つかりませんでした。_');
} else {
  out.push('| レビュー | status | passed | attention | blocked |');
  out.push('|---|---|---:|---:|---:|');
  for (const r of rows) {
    out.push(`| ${r.name} | ${r.status} | ${r.passed} | ${r.attention} | ${r.blocked} |`);
  }
  const blocked = rows.filter((r) => String(r.status).startsWith('blocked'));
  if (blocked.length > 0) {
    out.push('');
    out.push(`> **${blocked.length} 件が blocked です**: ${blocked.map((r) => r.name).join(', ')}`);
    out.push('> 証跡(evidence)を記録して再実行してください。');
  }
}
console.log(out.join('\n'));
