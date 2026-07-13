'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Laptop, KeyRound, ShieldOff, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { resolveClientSyncIdentity, type ClientSyncRole } from '@/lib/sync/client_role';
import { logAuditAction, getCurrentUser } from '@/lib/audit';
import { useDatabase } from '@/db/DatabaseContext';

// 設定 > 端末同期 タブの本体。役割表示・登録端末一覧・トークン発行/再発行/失効・
// 競合レビューを提供する。端末登録系の操作はメイン端末(hub)でのみ有効。

interface TerminalRow {
  terminalId: string;
  label: string;
  registeredAt: string;
  lastSeenAt?: string;
  lastPushedSeq?: number;
  revokedAt?: string;
}

interface ConflictRow {
  id: string;
  collection: string;
  docId: string;
  terminalId: string;
  occurredAt: string;
  losingDocumentState: Record<string, unknown>;
  resolvedAt?: string;
  resolvedBy?: string;
}

const COLLECTION_LABELS: Record<string, string> = {
  patients: '患者',
  visits: '受付',
  prescription_items: '処方',
  soap_records: '薬歴',
  alerts: 'アレルギー/注意',
  interventions: '疑義照会',
  drugs: '医薬品マスタ',
  drug_stocks: '在庫',
  locations: '棚番地',
  medication_guidances: '服薬指導文例',
  patient_medication_info_templates: '薬情テンプレ',
  users: 'スタッフ',
  facility_settings: '施設設定',
  audit_logs: '監査ログ'
};

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function TerminalSyncPanel() {
  const db = useDatabase();
  const [role, setRole] = useState<ClientSyncRole | null>(null);
  const [terminals, setTerminals] = useState<TerminalRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [newTerminalId, setNewTerminalId] = useState('');
  const [newTerminalLabel, setNewTerminalLabel] = useState('');
  const [issuedToken, setIssuedToken] = useState<{ terminalId: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const identity = await resolveClientSyncIdentity();
    setRole(identity.role);
    if (identity.role !== 'hub') return;
    try {
      const [terminalsResponse, conflictsResponse] = await Promise.all([
        fetch('/api/sync/terminals'),
        fetch('/api/sync/conflicts?resolved=false')
      ]);
      if (terminalsResponse.ok) {
        setTerminals((await terminalsResponse.json()).terminals || []);
      }
      if (conflictsResponse.ok) {
        setConflicts((await conflictsResponse.json()).conflicts || []);
      }
    } catch {
      toast.error('端末同期の状態を取得できませんでした。');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const registerTerminal = async () => {
    if (!newTerminalId.trim() || !newTerminalLabel.trim()) {
      toast.error('端末IDとラベルを入力してください。');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/sync/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId: newTerminalId.trim(), label: newTerminalLabel.trim() })
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.message || '端末登録に失敗しました。');
        return;
      }
      setIssuedToken({ terminalId: body.terminalId, token: body.token });
      setNewTerminalId('');
      setNewTerminalLabel('');
      toast.success(`端末 ${body.terminalId} を登録しました。`);
      if (db) {
        await logAuditAction(db, 'facility_settings_update', `サテライト端末登録: ${body.terminalId} (${body.label})`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const rotateToken = async (terminalId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/sync/terminals/${encodeURIComponent(terminalId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate' })
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.message || 'トークン再発行に失敗しました。');
        return;
      }
      setIssuedToken({ terminalId: body.terminalId, token: body.token });
      toast.success(`端末 ${terminalId} のトークンを再発行しました。旧トークンは無効です。`);
      if (db) {
        await logAuditAction(db, 'facility_settings_update', `サテライト端末トークン再発行: ${terminalId}`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const revokeTerminal = async (terminalId: string) => {
    if (!window.confirm(`端末 ${terminalId} を失効させますか?\n失効後、この端末は同期できなくなります(端末に患者データは残っていません)。`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sync/terminals/${encodeURIComponent(terminalId)}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.message || '端末失効に失敗しました。');
        return;
      }
      toast.success(`端末 ${terminalId} を失効させました。`);
      if (db) {
        await logAuditAction(db, 'facility_settings_update', `サテライト端末失効: ${terminalId}`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const resolveConflict = async (conflict: ConflictRow) => {
    const reviewer = getCurrentUser();
    setBusy(true);
    try {
      const response = await fetch(`/api/sync/conflicts/${encodeURIComponent(conflict.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: reviewer.name })
      });
      if (!response.ok) {
        toast.error('競合の確認記録に失敗しました。');
        return;
      }
      toast.success('競合を確認済みにしました。');
      if (db) {
        await logAuditAction(
          db,
          'facility_settings_update',
          `同期競合を確認: ${COLLECTION_LABELS[conflict.collection] || conflict.collection} / 端末 ${conflict.terminalId}`
        );
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      toast.success('トークンをコピーしました。');
    } catch {
      toast.error('クリップボードへコピーできませんでした。表示された値を手動で控えてください。');
    }
  };

  // standalone時代の暗号化IndexedDB(pharmacy_os_db)を端末から消す。サテライトは
  // メモリDB(pharmacy_os_db_satellite)しか使わないため、稼働中でも安全に削除できる。
  const wipeLegacyLocalData = async () => {
    const confirmed = window.confirm(
      'この端末に残っている旧ローカルデータ(患者情報を含む暗号化データベース)を完全に削除します。\n' +
      'メイン端末へバックアップ復旧済みであることを確認しましたか?\nこの操作は取り消せません。'
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const databases = await indexedDB.databases();
      const legacyNames = databases
        .map((info) => info.name || '')
        .filter((name) => name.includes('pharmacy_os_db') && !name.includes('pharmacy_os_db_satellite'));
      await Promise.all(legacyNames.map((name) => new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      })));
      try {
        localStorage.removeItem('pharmacy_os_local_db_password');
      } catch {
        // localStorageが使えない環境では鍵も保存されていない
      }
      if (db) {
        await logAuditAction(db, 'facility_settings_update', `サテライト化に伴う旧ローカルデータ削除: ${legacyNames.length}件のデータベースを削除`);
      }
      toast.success(legacyNames.length > 0
        ? `旧ローカルデータ(${legacyNames.length}件のデータベース)を削除しました。`
        : '削除対象の旧ローカルデータはありませんでした。');
    } catch {
      toast.error('旧ローカルデータの削除に失敗しました。ブラウザの設定からサイトデータを削除してください。');
    } finally {
      setBusy(false);
    }
  };

  if (role === null) {
    return <p style={{ color: 'var(--muted-foreground, #64748b)' }}>端末同期の設定を読み込んでいます…</p>;
  }

  if (role === 'standalone') {
    return (
      <section className="card glass" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Laptop size={18} aria-hidden="true" /> 端末同期は無効です
        </h3>
        <p style={{ lineHeight: 1.8, margin: 0 }}>
          この端末は単独動作(standalone)です。店舗内で複数端末を使う場合は、メイン端末に
          <code> PHARMACY_SYNC_ROLE=hub </code>、サテライト端末に
          <code> PHARMACY_SYNC_ROLE=satellite </code> を設定してください。
          手順は docs/satellite_terminal_sync_plan.md を参照してください。
        </p>
      </section>
    );
  }

  if (role === 'satellite') {
    return (
      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <section className="card glass" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Laptop size={18} aria-hidden="true" /> この端末はサテライト端末です
          </h3>
          <p style={{ lineHeight: 1.8, margin: 0 }}>
            患者データはこの端末に保存されず、メイン端末に集約されます。
            端末の登録・失効・競合レビューはメイン端末の設定画面から行ってください。
            接続状態は画面上部の同期インジケーターで確認できます。
          </p>
        </section>

        <section className="card glass" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>旧ローカルデータの削除（サテライト化の仕上げ）</h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', lineHeight: 1.8 }}>
            この端末が以前に単独動作(standalone)で使われていた場合、暗号化された患者データが
            ブラウザ内(IndexedDB)に残っています。バックアップをメイン端末へ復旧し、
            メイン端末側で全データが揃っていることを確認してから削除してください。
            この操作は取り消せません。
          </p>
          <button
            type="button"
            onClick={() => void wipeLegacyLocalData()}
            disabled={busy}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >
            <ShieldOff size={15} aria-hidden="true" /> 旧ローカルデータを完全に削除
          </button>
        </section>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <section className="card glass" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Laptop size={18} aria-hidden="true" /> この端末はメイン端末(集約ハブ)です
        </h3>
        <p style={{ lineHeight: 1.7, margin: 0, fontSize: '0.9rem' }}>
          サテライト端末の入力はこの端末に集約されます。サテライトには患者データが保存されないため、
          追加・廃棄はここでのトークン発行・失効だけで完了します。
        </p>
      </section>

      <section className="card glass" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <KeyRound size={18} aria-hidden="true" /> サテライト端末の登録
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem' }}>
            端末ID(英数字・ハイフン)
            <input
              type="text"
              value={newTerminalId}
              onChange={(event) => setNewTerminalId(event.target.value)}
              placeholder="satellite-1"
              style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px', minWidth: '180px' }}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem' }}>
            ラベル(設置場所など)
            <input
              type="text"
              value={newTerminalLabel}
              onChange={(event) => setNewTerminalLabel(event.target.value)}
              placeholder="レジ横端末"
              style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px', minWidth: '180px' }}
            />
          </label>
          <button type="button" className="btn-primary" onClick={() => void registerTerminal()} disabled={busy} style={{ padding: '0.5rem 1rem' }}>
            登録してトークン発行
          </button>
        </div>

        {issuedToken && (
          <div role="alert" style={{ marginTop: '1rem', padding: '0.85rem', borderRadius: '8px', background: 'rgba(254, 249, 195, 0.7)', border: '1px solid #fde68a' }}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
              端末 {issuedToken.terminalId} のトークン(この画面にしか表示されません)
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '0.8rem', wordBreak: 'break-all', background: 'rgba(255,255,255,0.7)', padding: '0.35rem 0.5rem', borderRadius: '6px' }}>
                {issuedToken.token}
              </code>
              <button type="button" onClick={() => void copyToken()} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border, #e2e8f0)', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                <Copy size={14} aria-hidden="true" /> コピー
              </button>
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', lineHeight: 1.7 }}>
              サテライト端末の .env に <code>PHARMACY_SYNC_TERMINAL_ID={issuedToken.terminalId}</code> と
              <code> PHARMACY_SYNC_TERMINAL_TOKEN=(上記トークン)</code> を設定して再起動してください。
            </p>
          </div>
        )}
      </section>

      <section className="card glass" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem' }}>登録端末一覧</h3>
        {terminals.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted-foreground, #64748b)', fontSize: '0.9rem' }}>登録済みのサテライト端末はありません。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                  <th style={{ padding: '0.5rem' }}>端末ID</th>
                  <th style={{ padding: '0.5rem' }}>ラベル</th>
                  <th style={{ padding: '0.5rem' }}>最終同期</th>
                  <th style={{ padding: '0.5rem' }}>状態</th>
                  <th style={{ padding: '0.5rem' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {terminals.map((terminal) => (
                  <tr key={terminal.terminalId} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                    <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{terminal.terminalId}</td>
                    <td style={{ padding: '0.5rem' }}>{terminal.label}</td>
                    <td style={{ padding: '0.5rem' }}>{formatDateTime(terminal.lastSeenAt)}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {terminal.revokedAt
                        ? <span style={{ color: '#b91c1c', fontWeight: 600 }}>失効済み</span>
                        : <span style={{ color: '#15803d', fontWeight: 600 }}>有効</span>}
                    </td>
                    <td style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => void rotateToken(terminal.terminalId)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border, #e2e8f0)', background: 'white', cursor: 'pointer', fontSize: '0.78rem' }}>
                        <RefreshCw size={13} aria-hidden="true" /> トークン再発行
                      </button>
                      {!terminal.revokedAt && (
                        <button type="button" onClick={() => void revokeTerminal(terminal.terminalId)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.78rem' }}>
                          <ShieldOff size={13} aria-hidden="true" /> 失効
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card glass" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>同期競合レビュー</h3>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--muted-foreground, #64748b)' }}>
          同じデータが複数端末から同時に更新された場合、先に届いた内容が正となり、負けた書き込みがここに記録されます。
          内容を確認し、必要なら該当画面で手動反映してから「確認済み」にしてください。
        </p>
        {conflicts.length === 0 ? (
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#15803d', fontSize: '0.9rem' }}>
            <CheckCircle2 size={16} aria-hidden="true" /> 未確認の競合はありません。
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {conflicts.map((conflict) => (
              <div key={conflict.id} style={{ border: '1px solid #fde68a', borderRadius: '8px', padding: '0.85rem', background: 'rgba(254, 249, 195, 0.45)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {COLLECTION_LABELS[conflict.collection] || conflict.collection} / ID {conflict.docId}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground, #64748b)' }}>
                    端末 {conflict.terminalId} ・ {formatDateTime(conflict.occurredAt)}
                  </span>
                </div>
                <details style={{ marginBottom: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>反映されなかった内容を表示</summary>
                  <pre style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', maxHeight: '200px', overflow: 'auto', background: 'rgba(255,255,255,0.7)', padding: '0.5rem', borderRadius: '6px' }}>
                    {JSON.stringify(conflict.losingDocumentState, null, 2)}
                  </pre>
                </details>
                <button type="button" className="btn-primary" onClick={() => void resolveConflict(conflict)} disabled={busy} style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}>
                  確認済みにする
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
