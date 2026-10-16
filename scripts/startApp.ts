// `npm run start` の実体。Next を本番モード(next start)で起動する。
// 同期の役割(PHARMACY_SYNC_ROLE)が hub / satellite のときは、待受を 127.0.0.1 に固定する。
// 引数はそのまま `next start` へ渡す(例: npm run start -- -p 3001)。
// 参照: src/lib/sync/start_policy.ts
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNextStartArgs } from '../src/lib/sync/start_policy.ts';
import { loadEnvFiles } from './lib/env_files.ts';

function fail(message: string): never {
  console.error(`[start] ${message}`);
  process.exit(1);
}

loadEnvFiles();

const result = resolveNextStartArgs(process.env.PHARMACY_SYNC_ROLE, process.argv.slice(2));
if (!result.ok) fail(result.message);
if (result.notice) console.log(`[start] ${result.notice}`);

const nextArgs = ['start', ...result.args];
if (process.env.PHARMACY_START_DRY_RUN === '1') {
  // 配線の確認用(テストが使う)。起動はせず、渡す引数だけを出す。
  console.log(JSON.stringify({ args: nextArgs }));
  process.exit(0);
}

const nextBin = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'next', 'dist', 'bin', 'next');
if (!existsSync(nextBin)) fail('Next が見つかりません。`npm ci` を実行してください。');

// Windows でも動くよう、.bin のシェルスクリプトではなく Node で Next の本体を直接起動する。
const child = spawn(process.execPath, [nextBin, ...nextArgs], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
