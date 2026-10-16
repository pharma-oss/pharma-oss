import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveNextStartArgs } from './start_policy.ts';

describe('resolveNextStartArgs', () => {
  test('leaves a standalone start exactly as it was', () => {
    for (const role of [undefined, '', 'standalone', ' Standalone ']) {
      const result = resolveNextStartArgs(role, ['-p', '3001']);
      assert.deepEqual(result, { ok: true, role: 'standalone', loopbackOnly: false, args: ['-p', '3001'] }, String(role));
    }
    // standalone では待受アドレスの指定もそのまま通す(従来どおり)
    const withHost = resolveNextStartArgs('standalone', ['-H', '0.0.0.0']);
    assert.deepEqual(withHost.ok && withHost.args, ['-H', '0.0.0.0']);
  });

  test('pins hub and satellite to the loopback address', () => {
    for (const role of ['hub', 'satellite', ' HUB ']) {
      const result = resolveNextStartArgs(role, []);
      assert.equal(result.ok, true, role);
      assert.deepEqual(result.ok && result.args, ['-H', '127.0.0.1'], role);
      assert.equal(result.ok && result.loopbackOnly, true, role);
    }
  });

  test('keeps the other start arguments and appends the loopback address once', () => {
    const result = resolveNextStartArgs('satellite', ['-p', '3402', '--keepAliveTimeout', '5000']);
    assert.deepEqual(result.ok && result.args, ['-p', '3402', '--keepAliveTimeout', '5000', '-H', '127.0.0.1']);
  });

  test('accepts an explicit loopback hostname in every spelling, without repeating it', () => {
    const spellings = [
      ['-H', '127.0.0.1'],
      ['--hostname', '127.0.0.1'],
      ['--hostname=127.0.0.1'],
      ['-H127.0.0.1'],
      ['-H=127.0.0.1']
    ];
    for (const spelling of spellings) {
      const result = resolveNextStartArgs('hub', ['-p', '3000', ...spelling]);
      assert.deepEqual(result.ok && result.args, ['-p', '3000', '-H', '127.0.0.1'], spelling.join(' '));
    }
  });

  test('refuses any other hostname for hub and satellite', () => {
    const attempts = [
      ['-H', '0.0.0.0'],
      ['--hostname', '192.168.0.3'],
      ['--hostname=0.0.0.0'],
      ['-H0.0.0.0'],
      ['-H', 'localhost'],
      ['-H', '::'],
      ['-H', '127.0.0.1.example.com'],
      ['-H'],
      ['-H', '127.0.0.1', '-H', '0.0.0.0']
    ];
    for (const role of ['hub', 'satellite']) {
      for (const attempt of attempts) {
        const result = resolveNextStartArgs(role, attempt);
        assert.equal(result.ok, false, `${role} ${attempt.join(' ')}`);
        assert.match(!result.ok ? result.message : '', /127\.0\.0\.1/);
      }
    }
  });

  test('treats a mistyped role as restricted rather than open', () => {
    for (const role of ['hubb', 'main', 'sattelite']) {
      const result = resolveNextStartArgs(role, []);
      assert.equal(result.ok && result.role, 'invalid', role);
      assert.deepEqual(result.ok && result.args, ['-H', '127.0.0.1'], role);
      assert.match(result.ok ? result.notice || '' : '', /不正/);
    }
    assert.equal(resolveNextStartArgs('hubb', ['-H', '0.0.0.0']).ok, false);
  });

  test('explains what to do next for each role', () => {
    const hub = resolveNextStartArgs('hub', []);
    assert.match(hub.ok ? hub.notice || '' : '', /sync:gateway/);
    const satellite = resolveNextStartArgs('satellite', []);
    assert.equal(satellite.ok && /sync:gateway/.test(satellite.notice || ''), false);
  });
});

describe('npm run start wiring (scripts/startApp.ts, dry run)', () => {
  const script = fileURLToPath(new URL('../../../scripts/startApp.ts', import.meta.url));

  function dryRun(env: Record<string, string>, args: string[]): { args: string[] } | { exitCode: number; stderr: string } {
    try {
      const stdout = execFileSync(process.execPath, ['--import', 'tsx', script, ...args], {
        env: { PATH: process.env.PATH || '', NODE_ENV: 'production', PHARMACY_START_DRY_RUN: '1', ...env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000
      });
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      return JSON.parse(jsonLine || '{}');
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      return { exitCode: failure.status ?? -1, stderr: String(failure.stderr || '') };
    }
  }

  test('hands next start the loopback address on a hub and a satellite', () => {
    assert.deepEqual(dryRun({ PHARMACY_SYNC_ROLE: 'hub' }, ['-p', '3000']), { args: ['start', '-p', '3000', '-H', '127.0.0.1'] });
    assert.deepEqual(dryRun({ PHARMACY_SYNC_ROLE: 'satellite' }, []), { args: ['start', '-H', '127.0.0.1'] });
  });

  test('leaves a standalone start unchanged', () => {
    assert.deepEqual(dryRun({ PHARMACY_SYNC_ROLE: 'standalone' }, ['-p', '3000']), { args: ['start', '-p', '3000'] });
  });

  test('stops with exit code 1 when a hub is asked to listen on all interfaces', () => {
    const result = dryRun({ PHARMACY_SYNC_ROLE: 'hub' }, ['-H', '0.0.0.0']);
    assert.ok('exitCode' in result, JSON.stringify(result));
    assert.equal('exitCode' in result && result.exitCode, 1);
    assert.match('stderr' in result ? result.stderr : '', /127\.0\.0\.1/);
    // 判定の拒否を無視して後続の処理で偶然落ちる、という形ではなく、拒否の理由を出して止まること
    assert.doesNotMatch('stderr' in result ? result.stderr : '', /TypeError|node:internal/);
  });
});
