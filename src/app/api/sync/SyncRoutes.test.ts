import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { GET as configGET } from './config/route.ts';
import { GET as pullGET } from './pull/route.ts';
import { POST as pushPOST } from './push/route.ts';
import { GET as statusGET } from './status/route.ts';
import { GET as remotePullGET } from './remote/pull/route.ts';
import { POST as remotePushPOST } from './remote/push/route.ts';
import { GET as terminalsGET, POST as terminalsPOST } from './terminals/route.ts';
import { POST as terminalActionPOST, DELETE as terminalDELETE } from './terminals/[terminalId]/route.ts';
import { GET as conflictsGET } from './conflicts/route.ts';
import { POST as conflictResolvePOST } from './conflicts/[conflictId]/route.ts';
import { TERMINAL_ID_HEADER } from '@/lib/sync/sync_http';

const ORIGINAL_ENV = { ...process.env };
let tempDir: string;

function resetSyncEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('PHARMACY_SYNC_')) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (key.startsWith('PHARMACY_SYNC_') && value !== undefined) process.env[key] = value;
  }
}

function setHubEnv() {
  resetSyncEnv();
  process.env.PHARMACY_SYNC_ROLE = 'hub';
  process.env.PHARMACY_SYNC_HUB_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.PHARMACY_SYNC_HUB_DB_PATH = join(tempDir, `hub-${randomBytes(6).toString('hex')}.sqlite`);
}

function setStandaloneEnv() {
  resetSyncEnv();
  process.env.PHARMACY_SYNC_ROLE = 'standalone';
}

test.before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'pharma-oss-sync-routes-'));
});

test.after(() => {
  resetSyncEnv();
  rmSync(tempDir, { recursive: true, force: true });
});

test('GET /api/sync/config reports standalone by default', async () => {
  setStandaloneEnv();
  const response = await configGET();
  const body = await response.json();
  assert.equal(body.role, 'standalone');
  assert.equal(body.configured, true);
});

test('GET /api/sync/config reports hub when configured', async () => {
  setHubEnv();
  const response = await configGET();
  const body = await response.json();
  assert.equal(body.role, 'hub');
  assert.equal(body.configured, true);
  assert.equal('token' in body, false);
});

test('GET /api/sync/pull returns 404 when sync is disabled (standalone)', async () => {
  setStandaloneEnv();
  const request = new NextRequest('http://localhost:3000/api/sync/pull?collection=patients&checkpoint=0');
  const response = await pullGET(request);
  assert.equal(response.status, 404);
});

test('POST /api/sync/push then GET /api/sync/pull round-trip on the hub role', async () => {
  setHubEnv();
  const pushRequest = new NextRequest('http://localhost:3000/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      collection: 'patients',
      rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: '山田太郎', _deleted: false } }]
    })
  });
  const pushResponse = await pushPOST(pushRequest);
  assert.equal(pushResponse.status, 200);
  const pushBody = await pushResponse.json();
  assert.deepEqual(pushBody.conflicts, []);

  const pullRequest = new NextRequest('http://localhost:3000/api/sync/pull?collection=patients&checkpoint=0');
  const pullResponse = await pullGET(pullRequest);
  assert.equal(pullResponse.status, 200);
  const pullBody = await pullResponse.json();
  assert.equal(pullBody.documents.length, 1);
  assert.equal(pullBody.documents[0].patientId, 'p1');
});

test('GET /api/sync/status reports terminals and unresolved conflicts on the hub role', async () => {
  setHubEnv();
  const registerRequest = new NextRequest('http://localhost:3000/api/sync/terminals', {
    method: 'POST',
    body: JSON.stringify({ terminalId: 'satellite-1', label: 'レジ横端末' })
  });
  await terminalsPOST(registerRequest);

  const statusResponse = await statusGET();
  const statusBody = await statusResponse.json();
  assert.equal(statusBody.role, 'hub');
  assert.equal(statusBody.terminals.length, 1);
  assert.equal(statusBody.unresolvedConflictCount, 0);
});

test('terminal registration issues a token that authenticates against /api/sync/remote/pull', async () => {
  setHubEnv();
  const registerRequest = new NextRequest('http://localhost:3000/api/sync/terminals', {
    method: 'POST',
    body: JSON.stringify({ terminalId: 'satellite-1', label: 'レジ横端末' })
  });
  const registerResponse = await terminalsPOST(registerRequest);
  assert.equal(registerResponse.status, 201);
  const { token } = await registerResponse.json();

  const unauthenticated = await remotePullGET(
    new NextRequest('http://localhost:3000/api/sync/remote/pull?collection=patients&checkpoint=0')
  );
  assert.equal(unauthenticated.status, 401);

  const authenticated = await remotePullGET(new NextRequest(
    'http://localhost:3000/api/sync/remote/pull?collection=patients&checkpoint=0',
    { headers: { Authorization: `Bearer ${token}`, [TERMINAL_ID_HEADER]: 'satellite-1' } }
  ));
  assert.equal(authenticated.status, 200);
});

test('remote push applies rows through Bearer auth and lists the terminal', async () => {
  setHubEnv();
  const registerResponse = await terminalsPOST(new NextRequest('http://localhost:3000/api/sync/terminals', {
    method: 'POST',
    body: JSON.stringify({ terminalId: 'satellite-1', label: 'レジ横端末' })
  }));
  const { token } = await registerResponse.json();

  const pushResponse = await remotePushPOST(new NextRequest('http://localhost:3000/api/sync/remote/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, [TERMINAL_ID_HEADER]: 'satellite-1', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collection: 'patients',
      rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }]
    })
  }));
  assert.equal(pushResponse.status, 200);

  const list = await (await terminalsGET()).json();
  assert.equal(list.terminals[0].lastPushedSeq > 0, true);
});

test('rotating then revoking a terminal via the [terminalId] route updates auth outcomes', async () => {
  setHubEnv();
  const registerResponse = await terminalsPOST(new NextRequest('http://localhost:3000/api/sync/terminals', {
    method: 'POST',
    body: JSON.stringify({ terminalId: 'satellite-1', label: 'レジ横端末' })
  }));
  const { token: originalToken } = await registerResponse.json();

  const rotateResponse = await terminalActionPOST(
    new NextRequest('http://localhost:3000/api/sync/terminals/satellite-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'rotate' })
    }),
    { params: Promise.resolve({ terminalId: 'satellite-1' }) }
  );
  assert.equal(rotateResponse.status, 200);
  const { token: rotatedToken } = await rotateResponse.json();
  assert.notEqual(originalToken, rotatedToken);

  const oldTokenAttempt = await remotePullGET(new NextRequest(
    'http://localhost:3000/api/sync/remote/pull?collection=patients&checkpoint=0',
    { headers: { Authorization: `Bearer ${originalToken}`, [TERMINAL_ID_HEADER]: 'satellite-1' } }
  ));
  assert.equal(oldTokenAttempt.status, 401);

  const revokeResponse = await terminalDELETE(
    new NextRequest('http://localhost:3000/api/sync/terminals/satellite-1', { method: 'DELETE' }),
    { params: Promise.resolve({ terminalId: 'satellite-1' }) }
  );
  assert.equal(revokeResponse.status, 200);

  const newTokenAfterRevoke = await remotePullGET(new NextRequest(
    'http://localhost:3000/api/sync/remote/pull?collection=patients&checkpoint=0',
    { headers: { Authorization: `Bearer ${rotatedToken}`, [TERMINAL_ID_HEADER]: 'satellite-1' } }
  ));
  assert.equal(newTokenAfterRevoke.status, 401);
});

test('GET /api/sync/terminals returns 404 when the server is not configured as a hub', async () => {
  setStandaloneEnv();
  const response = await terminalsGET();
  assert.equal(response.status, 404);
});

test('config route exposes the terminal id for per-terminal audit chains but never the token', async () => {
  setHubEnv();
  const hubConfig = await (await configGET()).json();
  assert.equal(hubConfig.terminalId, 'hub-local');
  assert.equal('token' in hubConfig, false);
  assert.equal('terminalToken' in hubConfig, false);
});

test('conflict review flow: a losing concurrent write is listed then marked resolved', async () => {
  setHubEnv();
  // 1件目の書き込み
  await pushPOST(new NextRequest('http://localhost:3000/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      collection: 'patients',
      rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: '初期値', _deleted: false } }]
    })
  }));
  const original = (await (await pullGET(
    new NextRequest('http://localhost:3000/api/sync/pull?collection=patients&checkpoint=0')
  )).json()).documents[0];

  // 別内容で先に更新(勝ち)
  await pushPOST(new NextRequest('http://localhost:3000/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      collection: 'patients',
      rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: '勝った更新', _deleted: false }, assumedMasterState: original }]
    })
  }));
  // 古い状態を前提にした更新(負け→競合記録)
  const losingResponse = await pushPOST(new NextRequest('http://localhost:3000/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      collection: 'patients',
      rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: '負けた更新', _deleted: false }, assumedMasterState: original }]
    })
  }));
  const losingBody = await losingResponse.json();
  assert.equal(losingBody.conflicts.length, 1);

  const unresolved = await (await conflictsGET(
    new NextRequest('http://localhost:3000/api/sync/conflicts?resolved=false')
  )).json();
  assert.equal(unresolved.conflicts.length, 1);
  assert.equal(unresolved.conflicts[0].losingDocumentState.name, '負けた更新');

  const resolveResponse = await conflictResolvePOST(
    new NextRequest(`http://localhost:3000/api/sync/conflicts/${encodeURIComponent(unresolved.conflicts[0].id)}`, {
      method: 'POST',
      body: JSON.stringify({ resolvedBy: '薬剤師 一郎' })
    }),
    { params: Promise.resolve({ conflictId: unresolved.conflicts[0].id }) }
  );
  assert.equal(resolveResponse.status, 200);

  const afterResolve = await (await conflictsGET(
    new NextRequest('http://localhost:3000/api/sync/conflicts?resolved=false')
  )).json();
  assert.equal(afterResolve.conflicts.length, 0);
});

test('GET /api/sync/conflicts returns 404 outside the hub role', async () => {
  setStandaloneEnv();
  const response = await conflictsGET(new NextRequest('http://localhost:3000/api/sync/conflicts'));
  assert.equal(response.status, 404);
});
