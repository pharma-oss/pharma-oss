import { parseRole } from './sync_config.ts';

// `npm run start`(scripts/startApp.ts)が、Next の起動引数を決めるための判定。
//
// メイン端末(hub)とサテライト端末(satellite)では、アプリ本体を同じ端末の中だけで受け付ける
// (ループバック専用: -H 127.0.0.1)。施設内LANへ公開するのは、メイン端末の同期ゲートウェイだけ。
// 起動する人が `start:local` を選び忘れても、同期の役割が設定されていれば自動でそうなるようにする。
// 単独動作(standalone)の起動引数は従来のまま変えない。
// 参照: docs/satellite_terminal_sync_plan.md、src/lib/sync/sync_gateway.ts

export const LOOPBACK_BIND_ADDRESS = '127.0.0.1';

export type StartRole = 'standalone' | 'hub' | 'satellite' | 'invalid';

export type NextStartArgsResult =
  | { ok: true; role: StartRole; loopbackOnly: boolean; args: string[]; notice?: string }
  | { ok: false; message: string };

function extractHostnames(argv: string[]): { rest: string[]; hostnames: string[] } {
  const rest: string[] = [];
  const hostnames: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '-H' || token === '--hostname') {
      hostnames.push(argv[index + 1] ?? '');
      index++;
    } else if (token.startsWith('--hostname=')) {
      hostnames.push(token.slice('--hostname='.length));
    } else if (token.startsWith('-H') && !token.startsWith('--')) {
      hostnames.push(token.slice(2).replace(/^=/, ''));
    } else {
      rest.push(token);
    }
  }
  return { rest, hostnames };
}

function resolveRole(roleValue: string | undefined): StartRole {
  const role = parseRole(roleValue);
  return role === null ? 'invalid' : role;
}

function noticeFor(role: Exclude<StartRole, 'standalone'>): string {
  if (role === 'hub') {
    return 'PHARMACY_SYNC_ROLE=hub のため、アプリ本体はこの端末の中だけ(127.0.0.1)で受け付ける形で起動します。'
      + 'サテライト端末からの接続は、別のターミナルで `npm run sync:gateway` を起動して受けます。';
  }
  if (role === 'satellite') {
    return 'PHARMACY_SYNC_ROLE=satellite のため、アプリ本体はこの端末の中だけ(127.0.0.1)で受け付ける形で起動します。';
  }
  return 'PHARMACY_SYNC_ROLE の値が不正です。安全のため、アプリ本体はこの端末の中だけ(127.0.0.1)で受け付ける形で起動します。'
    + '値は hub, satellite, standalone のいずれかにしてください。';
}

// argv は `npm run start -- <ここ>` の引数(例: ['-p', '3001'])。戻り値の args は `next start` の後ろに渡す引数。
export function resolveNextStartArgs(roleValue: string | undefined, argv: string[]): NextStartArgsResult {
  const role = resolveRole(roleValue);
  if (role === 'standalone') {
    return { ok: true, role, loopbackOnly: false, args: [...argv] };
  }

  const { rest, hostnames } = extractHostnames(argv);
  const rejected = hostnames.find((hostname) => hostname !== LOOPBACK_BIND_ADDRESS);
  if (rejected !== undefined) {
    return {
      ok: false,
      message: `同期の役割(${role})が設定されているため、待受アドレス(-H / --hostname)は ${LOOPBACK_BIND_ADDRESS} 以外にできません。`
        + '施設内LANへ公開するのは、メイン端末の `npm run sync:gateway` だけです。'
    };
  }
  return {
    ok: true,
    role,
    loopbackOnly: true,
    args: [...rest, '-H', LOOPBACK_BIND_ADDRESS],
    notice: noticeFor(role)
  };
}
