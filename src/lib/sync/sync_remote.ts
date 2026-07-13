import type { HubStore } from './hub_store.ts';
import type { PharmacySyncTransportEncryption } from './sync_config.ts';
import { decodeTransportPayload, encodeTransportPayload, extractBearerToken } from './sync_http.ts';
import { isSyncCollectionName } from './sync_collections.ts';
import { normalizeBatchSize, type SyncOperationResult } from './sync_client.ts';
import type { HubPullResult, HubPushRow } from './hub_store.ts';

// メイン端末(ハブ)が、サテライト端末から施設内LAN経由で呼ばれる認証必須のエンドポイント。
// hub自身のブラウザは同一オリジンの /api/sync/pull|push (sync_client.ts) を使うため
// ここは通らない。トークン検証は必ずここで行う。
// 参照: docs/satellite_terminal_sync_plan.md

export interface RemoteAuthContext {
  authorizationHeader: string | null;
  terminalId: string | null;
  store: HubStore;
}

function authenticate(context: RemoteAuthContext): SyncOperationResult<never> | null {
  const token = extractBearerToken(context.authorizationHeader);
  if (!token || !context.terminalId) {
    return { ok: false, status: 401, body: { message: '認証情報がありません。' } };
  }
  if (!context.store.verifyTerminal(context.terminalId, token)) {
    return { ok: false, status: 401, body: { message: '端末認証に失敗しました。' } };
  }
  return null;
}

export interface RemotePullRequest extends RemoteAuthContext {
  collection: string;
  checkpointSeq: number;
  batchSize: number;
  transportEncryption: PharmacySyncTransportEncryption;
  transportKey?: Buffer;
}

export function handleRemotePull(request: RemotePullRequest): SyncOperationResult<unknown> {
  const authError = authenticate(request);
  if (authError) return authError;
  if (!isSyncCollectionName(request.collection)) {
    return { ok: false, status: 400, body: { message: '不明なコレクションです。' } };
  }
  const result: HubPullResult = request.store.pull(request.collection, request.checkpointSeq, normalizeBatchSize(request.batchSize));
  return { ok: true, status: 200, body: encodeTransportPayload(result, request.transportEncryption, request.transportKey) };
}

export interface RemotePushRequest extends RemoteAuthContext {
  rawBody: unknown;
  transportEncryption: PharmacySyncTransportEncryption;
  transportKey?: Buffer;
}

export function handleRemotePush(request: RemotePushRequest): SyncOperationResult<unknown> {
  const authError = authenticate(request);
  if (authError) return authError;

  let decoded: { collection: string; rows: HubPushRow[] };
  try {
    decoded = decodeTransportPayload<{ collection: string; rows: HubPushRow[] }>(
      request.rawBody,
      request.transportEncryption,
      request.transportKey
    );
  } catch {
    return { ok: false, status: 400, body: { message: '同期本文を復号できませんでした。' } };
  }

  if (!isSyncCollectionName(decoded.collection)) {
    return { ok: false, status: 400, body: { message: '不明なコレクションです。' } };
  }
  if (!Array.isArray(decoded.rows)) {
    return { ok: false, status: 400, body: { message: 'push本文の形式が不正です。' } };
  }

  const conflicts = request.store.push(decoded.collection, request.terminalId as string, decoded.rows);
  return {
    ok: true,
    status: 200,
    body: encodeTransportPayload({ conflicts }, request.transportEncryption, request.transportKey)
  };
}
