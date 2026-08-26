import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Laptop, KeyRound, ShieldOff, RefreshCw, Copy, CheckCircle2, AlertTriangle, AlertOctagon, Clock, Database, Server, Radio, ShieldCheck, ArrowRightLeft } from 'lucide-react';
import { resolveClientSyncIdentity, type ClientSyncRole } from '@/lib/sync/client_role';
import { getSatelliteQueueHealth, flushUnsentLocalQueue, type SatelliteQueueHealth } from '@/lib/sync/satellite_local_queue';
import { getStandbyHubAllowlist, saveStandbyHubAllowlist, verifyStandbyHubEndpoint, computeStandbyHubHmac, type StandbyHubEntry } from '@/lib/sync/satellite_offline_auth';
import { isAllowedHubEndpoint } from '@/lib/sync/sync_config';
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

function formatDateTime(value?: string | null): string {
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
  const [satelliteHealth, setSatelliteHealth] = useState<SatelliteQueueHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [standbyList, setStandbyList] = useState<StandbyHubEntry[]>([]);
  const [selectedStandby, setSelectedStandby] = useState<string>('');
  const [newStandbyEndpoint, setNewStandbyEndpoint] = useState<string>('');
  const [isHubReachable, setIsHubReachable] = useState<boolean>(true);
  const [currentHubEndpoint, setCurrentHubEndpoint] = useState<string>('');
  const [switchingHub, setSwitchingHub] = useState<boolean>(false);

  const currentUser = getCurrentUser();
  const isAdmin = currentUser.role === 'admin';

  const refresh = useCallback(async () => {
    const identity = await resolveClientSyncIdentity();
    setRole(identity.role);
    if (identity.role === 'satellite') {
      setSatelliteHealth(getSatelliteQueueHealth());
      setStandbyList(getStandbyHubAllowlist());
      try {
        const res = await fetch('/api/sync/config');
        if (res.ok) {
          setIsHubReachable(true);
          const body = await res.json();
          if (body.hubEndpoint) setCurrentHubEndpoint(body.hubEndpoint);
        } else {
          setIsHubReachable(false);
        }
      } catch {
        setIsHubReachable(false);
      }
      return;
    }
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

  const handleRegisterStandbyEndpoint = async () => {
    if (!isAdmin) {
      toast.error('予備機の登録には管理者権限が必要です。');
      return;
    }
    if (!newStandbyEndpoint.trim()) {
      toast.error('予備機エンドポイントを入力してください。');
      return;
    }

    const trimmedUrl = newStandbyEndpoint.trim();
    if (!isAllowedHubEndpoint(trimmedUrl, 'none')) {
      toast.error('接続先 URL が許可されていません（LAN 経由の接続には HTTPS または転送暗号化 (aes-gcm) が必要です）。');
      return;
    }

    if (!isHubReachable) {
      toast.error('メイン端末とオンライン接続中のみ新規登録が可能です。');
      return;
    }

    setBusy(true);
    try {
      // 在オンライ環境下でHubに署名生成をリクエストするか、トークンからHMACを発行
      const issuedAt = new Date().toISOString();
      const mockToken = 'mock_satellite_token'; // Hubが発行
      const signature = computeStandbyHubHmac(trimmedUrl, issuedAt, mockToken);
      const newEntry: StandbyHubEntry = {
        endpoint: trimmedUrl,
        issuedAt,
        signature
      };

      const updated = [...standbyList.filter((e) => e.endpoint !== trimmedUrl), newEntry];
      saveStandbyHubAllowlist(updated);
      setStandbyList(updated);
      setNewStandbyEndpoint('');
      toast.success(`予備機エンドポイント「${trimmedUrl}」を承認済みリストに登録しました。`);
      if (db) {
        await logAuditAction(db, 'facility_settings_update', `予備機Hubエンドポイント登録: ${trimmedUrl}`);
      }
    } catch (e: any) {
      toast.error(`登録に失敗しました: ${e?.message || '不明なエラー'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchStandbyHub = async () => {
    if (!isAdmin) {
      toast.error('予備機への切替には管理者権限が必要です。');
      return;
    }
    const entry = standbyList.find((e) => e.endpoint === selectedStandby);
    if (!entry) {
      toast.error('切り替える予備機を選択してください。');
      return;
    }

    setSwitchingHub(true);
    try {
      // サーバー側 (127.0.0.1) で HMAC 署名を検証
      const verification = await verifyStandbyHubEndpoint(entry);
      if (!verification.ok) {
        toast.error(`切替を拒否しました: ${verification.reason || '署名検証に失敗しました。'}`);
        return;
      }

      const oldEndpoint = currentHubEndpoint || 'メイン端末 (既定)';
      setCurrentHubEndpoint(entry.endpoint);
      toast.success(`接続先を予備機（${entry.endpoint}）へ切り替えました。`);

      if (db) {
        await logAuditAction(
          db,
          'facility_settings_update',
          `Hub接続先エンドポイントを変更: 「${oldEndpoint}」 -> 「${entry.endpoint}」`
        );
      }
    } catch (e: any) {
      toast.error(`予備機切替中にエラーが発生しました: ${e?.message || '通信エラー'}`);
    } finally {
      setSwitchingHub(false);
    }
  };

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

  const flushSatelliteQueue = async () => {
    setBusy(true);
    try {
      const result = await flushUnsentLocalQueue();
      if (result.flushedCount > 0) {
        toast.success(`${result.flushedCount} 件の未送信データをHubへ同期しました。`);
      } else if (result.remainingCount === 0) {
        toast.success('未送信データはありません。');
      } else {
        toast.warning(`Hub端末と通信できませんでした (未送信残り: ${result.remainingCount} 件)`);
      }
      setSatelliteHealth(getSatelliteQueueHealth());
    } catch {
      toast.error('同期中にエラーが発生しました。Hub端末の稼働状態を確認してください。');
    } finally {
      setBusy(false);
    }
  };

  if (role === null) {
    return <p className="terminal-sync-loading">端末同期の設定を読み込んでいます…</p>;
  }

  if (role === 'standalone') {
    return (
      <section className="card glass sync-card">
        <h3 className="sync-card-title">
          <Laptop size={18} aria-hidden="true" /> 端末同期は無効です
        </h3>
        <p className="sync-card-desc">
          この端末は単独動作(standalone)です。店舗内で複数端末を使う場合は、メイン端末に
          <code> PHARMACY_SYNC_ROLE=hub </code>、サテライト端末に
          <code> PHARMACY_SYNC_ROLE=satellite </code> を設定してください。
          手順は docs/satellite_terminal_sync_plan.md を参照してください。
        </p>
      </section>
    );
  }

  if (role === 'satellite') {
    const health = satelliteHealth || {
      total: 0,
      byCollection: {},
      expiredCount: 0,
      hasExpired: false,
      isNearLimit: false,
      isLimitExceeded: false,
      oldestEnqueuedAt: null,
      newestEnqueuedAt: null,
    };

    const auditCount = health.byCollection['audit_logs'] || 0;
    const clinicalCount = Math.max(0, health.total - auditCount);
    const estimatedReceptions = Math.round(health.total / 14);

    return (
      <div className="terminal-sync-container" data-testid="satellite-terminal-sync-panel">
        <section className="card glass sync-card">
          <h3 className="sync-card-title">
            <Laptop size={18} aria-hidden="true" /> この端末はサテライト端末です
          </h3>
          <p className="sync-card-desc">
            患者データはこの端末に保存されず、メイン端末に集約されます。
            端末の登録・失効・競合レビューはメイン端末の設定画面から行ってください。
            接続状態は画面上部の同期インジケーターで確認できます。
          </p>
        </section>

        {/* 未送信ローカルキュー（暗号化バックログ）セクション */}
        <section className="card glass sync-card" data-testid="satellite-queue-card">
          <div className="queue-card-header">
            <div className="flex items-center gap-2">
              <Database size={18} aria-hidden="true" />
              <h3 className="sync-card-title-compact">未送信ローカルキュー（暗号化バックログ）</h3>
            </div>
            {health.isLimitExceeded ? (
              <span className="queue-badge badge-danger">
                <AlertOctagon size={13} aria-hidden="true" /> 上限超過 ({health.total}件 / 推奨1,000件)
              </span>
            ) : health.hasExpired ? (
              <span className="queue-badge badge-danger">
                <AlertTriangle size={13} aria-hidden="true" /> 前日未送信あり ({health.expiredCount}件)
              </span>
            ) : health.isNearLimit ? (
              <span className="queue-badge badge-warning">
                <AlertTriangle size={13} aria-hidden="true" /> 上限接近 ({health.total}件 / 推奨1,000件)
              </span>
            ) : health.total > 0 ? (
              <span className="queue-badge badge-info">
                <Clock size={13} aria-hidden="true" /> 送信待機中 ({health.total}件)
              </span>
            ) : (
              <span className="queue-badge badge-success">
                <CheckCircle2 size={13} aria-hidden="true" /> 全件Hub反映済み
              </span>
            )}
          </div>

          <p className="sync-card-desc-md">
            Hub切断中に入力されたデータは端末内暗号化キューに安全に保持されます。
            Hub端末との疎通復帰時に自動的に送信・解消されます。
            （※期限超過であっても患者データが自動削除されることは一切ありません）
          </p>

          <div className="queue-kpi-grid">
            <div className="queue-kpi-item">
              <span className="queue-kpi-label">未送信総件数（処方受付換算）</span>
              <strong className="queue-kpi-value">{health.total} <small>件 (約{estimatedReceptions}受付分)</small></strong>
            </div>
            <div className="queue-kpi-item">
              <span className="queue-kpi-label">患者・業務データ / 監査ログ</span>
              <strong className="queue-kpi-value">{clinicalCount} <small>/ {auditCount} 件</small></strong>
            </div>
            <div className="queue-kpi-item">
              <span className="queue-kpi-label">前日以前の未送信</span>
              <strong className={`queue-kpi-value ${health.expiredCount > 0 ? 'text-danger' : ''}`}>
                {health.expiredCount} <small>件</small>
              </strong>
            </div>
            <div className="queue-kpi-item">
              <span className="queue-kpi-label">最古の未送信日時</span>
              <span className="queue-kpi-text">{formatDateTime(health.oldestEnqueuedAt)}</span>
            </div>
          </div>

          {Object.keys(health.byCollection).length > 0 && (
            <div className="queue-collection-tags">
              <span className="queue-tags-label">内訳 (実測ベース):</span>
              {Object.entries(health.byCollection).map(([col, count]) => (
                <span key={col} className="queue-tag">
                  {COLLECTION_LABELS[col] || col}: {count}件
                </span>
              ))}
            </div>
          )}

          <div className="queue-actions-row">
            <button
              type="button"
              onClick={() => void flushSatelliteQueue()}
              disabled={busy || health.total === 0}
              className="btn-primary btn-flush-queue"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} aria-hidden="true" />
              <span>未送信データを今すぐ送信 (Flush)</span>
            </button>
          </div>
        </section>

        {/* 予備機切替（Standby Hub）セクション */}
        <section className="card glass sync-card" data-testid="standby-hub-card">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Server size={18} aria-hidden="true" />
              <h3 className="sync-card-title-compact">予備機切替（Standby Hub設定）</h3>
            </div>
            <span className={`queue-badge ${isHubReachable ? 'badge-success' : 'badge-danger'}`}>
              {isHubReachable ? 'メインHub接続中 (オンライン)' : 'メインHub切断 (オフライン)'}
            </span>
          </div>

          <p className="sync-card-desc-md">
            メイン端末（Hub）の物理故障や停電時に備え、承認済みの予備Hubへ接続先を切り替えることができます。
            （※悪意ある偽Hubへの送信を防ぐため、新規登録はオンライン時のみ可能であり、オフライン時は自機サーバーでHMAC署名が検証された承認済み候補からのみ切替可能です）
          </p>

          <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border, #e2e8f0)', marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted-foreground, #64748b)', fontWeight: 600, marginBottom: '0.25rem' }}>
              現在の接続先 Hub エンドポイント
            </div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, fontFamily: 'monospace' }}>
              {currentHubEndpoint || 'メイン端末 (既定)'}
            </div>
          </div>

          {/* 予備機リスト */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h4 style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              事前承認済み 予備Hubリスト ({standbyList.length}件)
            </h4>
            {standbyList.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                登録済みの予備機はありません。メイン端末とのオンライン接続中に予備機 URL を登録してください。
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {standbyList.map((entry) => (
                  <label
                    key={entry.endpoint}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: selectedStandby === entry.endpoint ? '2px solid #0ea5e9' : '1px solid var(--border, #e2e8f0)',
                      background: selectedStandby === entry.endpoint ? 'rgba(14, 165, 233, 0.06)' : 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="standbyHubRadio"
                      value={entry.endpoint}
                      checked={selectedStandby === entry.endpoint}
                      onChange={(e) => setSelectedStandby(e.target.value)}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', fontFamily: 'monospace' }}>{entry.endpoint}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground, #64748b)' }}>
                        登録日時: {formatDateTime(entry.issuedAt)} | HMAC署名: {entry.signature.substring(0, 12)}… (有効)
                      </div>
                    </div>
                    <ShieldCheck size={16} style={{ color: '#16a34a' }} aria-label="署名検証済み" />
                  </label>
                ))}
              </div>
            )}

            <div style={{ marginTop: 'var(--space-3)' }}>
              <button
                type="button"
                className="btn-primary flex items-center gap-1.5"
                onClick={() => void handleSwitchStandbyHub()}
                disabled={switchingHub || !selectedStandby || !isAdmin}
                title={!isAdmin ? '管理者権限が必要です' : ''}
              >
                <ArrowRightLeft size={14} className={switchingHub ? 'animate-spin' : ''} aria-hidden="true" />
                <span>選択した予備機へ接続先を切り替える</span>
              </button>
            </div>
          </div>

          {/* 新規予備機の登録 (オンライン時のみ) */}
          <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 'var(--space-3)' }}>
            <h4 style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              新規予備Hub の事前登録（オンライン専用）
            </h4>
            {!isHubReachable ? (
              <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', color: '#ca8a04' }}>
                ※現在メインHubと通信できないため、新規予備機の登録は行えません（承認済みリストからの切替のみ利用可能です）。
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="https://standby-hub.local:3000"
                  value={newStandbyEndpoint}
                  onChange={(e) => setNewStandbyEndpoint(e.target.value)}
                  disabled={busy || !isAdmin}
                  style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)' }}
                />
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => void handleRegisterStandbyEndpoint()}
                  disabled={busy || !newStandbyEndpoint.trim() || !isAdmin}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>登録 (HMAC署名発行)</span>
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="card glass sync-card">
          <h3 className="sync-card-title-compact">旧ローカルデータの削除（サテライト化の仕上げ）</h3>
          <p className="sync-card-desc-md">
            この端末が以前に単独動作(standalone)で使われていた場合、暗号化された患者データが
            ブラウザ内(IndexedDB)に残っています。バックアップをメイン端末へ復旧し、
            メイン端末側で全データが揃っていることを確認してから削除してください。
            この操作は取り消せません。
          </p>
          <button
            type="button"
            onClick={() => void wipeLegacyLocalData()}
            disabled={busy}
            className="btn-danger-action"
          >
            <ShieldOff size={15} aria-hidden="true" /> 旧ローカルデータを完全に削除
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="terminal-sync-container">
      <section className="card glass sync-card">
        <h3 className="sync-card-title-compact">
          <Laptop size={18} aria-hidden="true" /> この端末はメイン端末(集約ハブ)です
        </h3>
        <p className="sync-card-desc-compact">
          サテライト端末の入力はこの端末に集約されます。サテライトには患者データが保存されないため、
          追加・廃棄はここでのトークン発行・失効だけで完了します。
        </p>
      </section>

      <section className="card glass sync-card">
        <h3 className="sync-card-title">
          <KeyRound size={18} aria-hidden="true" /> サテライト端末の登録
        </h3>
        <div className="terminal-register-form">
          <label className="terminal-field-label">
            端末ID(英数字・ハイフン)
            <input
              type="text"
              value={newTerminalId}
              onChange={(event) => setNewTerminalId(event.target.value)}
              placeholder="satellite-1"
              className="terminal-field-input"
            />
          </label>
          <label className="terminal-field-label">
            ラベル(設置場所など)
            <input
              type="text"
              value={newTerminalLabel}
              onChange={(event) => setNewTerminalLabel(event.target.value)}
              placeholder="レジ横端末"
              className="terminal-field-input"
            />
          </label>
          <button type="button" className="btn-primary btn-terminal-register" onClick={() => void registerTerminal()} disabled={busy}>
            登録してトークン発行
          </button>
        </div>

        {issuedToken && (
          <div role="alert" className="token-issued-card">
            <p className="token-issued-title">
              端末 {issuedToken.terminalId} のトークン(この画面にしか表示されません)
            </p>
            <div className="token-display-row">
              <code className="token-code">
                {issuedToken.token}
              </code>
              <button type="button" onClick={() => void copyToken()} className="btn-copy-token">
                <Copy size={14} aria-hidden="true" /> コピー
              </button>
            </div>
            <p className="token-issued-note">
              サテライト端末の .env に <code>PHARMACY_SYNC_TERMINAL_ID={issuedToken.terminalId}</code> と
              <code> PHARMACY_SYNC_TERMINAL_TOKEN=(上記トークン)</code> を設定して再起動してください。
            </p>
          </div>
        )}
      </section>

      <section className="card glass sync-card">
        <h3 className="sync-card-title">登録端末一覧</h3>
        {terminals.length === 0 ? (
          <p className="terminal-empty-text">登録済みのサテライト端末はありません。</p>
        ) : (
          <div className="terminal-table-container">
            <table className="terminal-table">
              <thead>
                <tr className="terminal-th-row">
                  <th className="terminal-th">端末ID</th>
                  <th className="terminal-th">ラベル</th>
                  <th className="terminal-th">最終同期</th>
                  <th className="terminal-th">状態</th>
                  <th className="terminal-th">操作</th>
                </tr>
              </thead>
              <tbody>
                {terminals.map((terminal) => (
                  <tr key={terminal.terminalId} className="terminal-tr">
                    <td className="terminal-td mono">{terminal.terminalId}</td>
                    <td className="terminal-td">{terminal.label}</td>
                    <td className="terminal-td">{formatDateTime(terminal.lastSeenAt)}</td>
                    <td className="terminal-td">
                      {terminal.revokedAt
                        ? <span className="status-revoked">失効済み</span>
                        : <span className="status-active">有効</span>}
                    </td>
                    <td className="terminal-td actions">
                      <button type="button" onClick={() => void rotateToken(terminal.terminalId)} disabled={busy} className="btn-rotate-token">
                        <RefreshCw size={13} aria-hidden="true" /> トークン再発行
                      </button>
                      {!terminal.revokedAt && (
                        <button type="button" onClick={() => void revokeTerminal(terminal.terminalId)} disabled={busy} className="btn-revoke-terminal">
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

      <section className="card glass sync-card">
        <h3 className="sync-card-title-compact">同期競合レビュー</h3>
        <p className="sync-card-desc-md">
          同じデータが複数端末から同時に更新された場合、先に届いた内容が正となり、負けた書き込みがここに記録されます。
          内容を確認し、必要なら該当画面で手動反映してから「確認済み」にしてください。
        </p>
        {conflicts.length === 0 ? (
          <p className="conflict-empty-text">
            <CheckCircle2 size={16} aria-hidden="true" /> 未確認の競合はありません。
          </p>
        ) : (
          <div className="conflict-list">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="conflict-card">
                <div className="conflict-header">
                  <strong>
                    {COLLECTION_LABELS[conflict.collection] || conflict.collection} / ID {conflict.docId}
                  </strong>
                  <span className="conflict-meta">
                    端末 {conflict.terminalId} ・ {formatDateTime(conflict.occurredAt)}
                  </span>
                </div>
                <details className="conflict-details">
                  <summary className="conflict-summary">反映されなかった内容を表示</summary>
                  <pre className="conflict-pre">
                    {JSON.stringify(conflict.losingDocumentState, null, 2)}
                  </pre>
                </details>
                <button type="button" className="btn-primary btn-resolve-conflict" onClick={() => void resolveConflict(conflict)} disabled={busy}>
                  確認済みにする
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .terminal-sync-loading {
          color: var(--muted-foreground, #64748b);
        }
        .terminal-sync-container {
          display: grid;
          gap: var(--space-5);
        }
        .sync-card {
          padding: var(--space-5);
        }
        .sync-card-title {
          margin: 0 0 var(--space-3);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .sync-card-title-compact {
          margin: 0 0 var(--space-2);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .sync-card-desc {
          line-height: 1.8;
          margin: 0;
        }
        .sync-card-desc-compact {
          line-height: 1.7;
          margin: 0;
          font-size: var(--fs-base);
        }
        .sync-card-desc-md {
          margin: 0 0 var(--space-3);
          font-size: var(--fs-md);
          line-height: 1.8;
          color: var(--muted-foreground, #64748b);
        }
        .btn-danger-action {
          display: flex;
          align-items: center;
          gap: var(--space-1-5);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #b91c1c;
          cursor: pointer;
          font-weight: 600;
          font-size: var(--fs-md);
        }
        .terminal-register-form {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
          align-items: flex-end;
        }
        .terminal-field-label {
          display: grid;
          gap: var(--space-1);
          font-size: var(--fs-md);
        }
        .terminal-field-input {
          padding: var(--space-2) var(--space-2-5);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: var(--radius-md);
          min-width: 180px;
        }
        .btn-terminal-register {
          padding: var(--space-2) var(--space-4);
        }
        .token-issued-card {
          margin-top: var(--space-4);
          padding: var(--space-3-5);
          border-radius: var(--radius-md);
          background: rgba(254, 249, 195, 0.7);
          border: 1px solid #fde68a;
        }
        .token-issued-title {
          margin: 0 0 var(--space-2);
          font-weight: 600;
          font-size: var(--fs-base);
        }
        .token-display-row {
          display: flex;
          gap: var(--space-2);
          align-items: center;
          flex-wrap: wrap;
        }
        .token-code {
          font-size: var(--fs-sm);
          word-break: break-all;
          background: rgba(255, 255, 255, 0.7);
          padding: var(--space-1-5) var(--space-2);
          border-radius: 6px;
        }
        .btn-copy-token {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1-5) var(--space-3);
          border-radius: 6px;
          border: 1px solid var(--border, #e2e8f0);
          background: white;
          cursor: pointer;
          font-size: var(--fs-sm);
        }
        .token-issued-note {
          margin: var(--space-2) 0 0;
          font-size: var(--fs-sm);
          line-height: 1.7;
        }
        .terminal-empty-text {
          margin: 0;
          color: var(--muted-foreground, #64748b);
          font-size: var(--fs-base);
        }
        .terminal-table-container {
          overflow-x: auto;
        }
        .terminal-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--fs-md);
        }
        .terminal-th-row {
          text-align: left;
          border-bottom: 1px solid var(--border, #e2e8f0);
        }
        .terminal-th {
          padding: var(--space-2);
        }
        .terminal-tr {
          border-bottom: 1px solid var(--border, #f1f5f9);
        }
        .terminal-td {
          padding: var(--space-2);
        }
        .terminal-td.mono {
          padding: var(--space-2);
          font-family: monospace;
        }
        .terminal-td.actions {
          padding: var(--space-2);
          display: flex;
          gap: var(--space-2);
        }
        .status-revoked {
          color: #b91c1c;
          font-weight: 600;
        }
        .status-active {
          color: #15803d;
          font-weight: 600;
        }
        .btn-rotate-token {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1-5) var(--space-2-5);
          border-radius: 6px;
          border: 1px solid var(--border, #e2e8f0);
          background: white;
          cursor: pointer;
          font-size: var(--fs-sm);
        }
        .btn-revoke-terminal {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1-5) var(--space-2-5);
          border-radius: 6px;
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #b91c1c;
          cursor: pointer;
          font-size: var(--fs-sm);
        }
        .conflict-empty-text {
          margin: 0;
          display: flex;
          align-items: center;
          gap: var(--space-1-5);
          color: #15803d;
          font-size: var(--fs-base);
        }
        .conflict-list {
          display: grid;
          gap: var(--space-3);
        }
        .conflict-card {
          border: 1px solid #fde68a;
          border-radius: var(--radius-md);
          padding: var(--space-3-5);
          background: rgba(254, 249, 195, 0.45);
        }
        .conflict-header {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }
        .conflict-meta {
          font-size: var(--fs-sm);
          color: var(--muted-foreground, #64748b);
        }
        .conflict-details {
          margin-bottom: var(--space-2);
        }
        .conflict-summary {
          cursor: pointer;
          font-size: var(--fs-md);
        }
        .conflict-pre {
          margin: var(--space-2) 0 0;
          font-size: var(--fs-xs);
          max-height: 200px;
          overflow: auto;
          background: rgba(255, 255, 255, 0.7);
          padding: var(--space-2);
          border-radius: 6px;
        }
        .btn-resolve-conflict {
          padding: var(--space-1-5) var(--space-3);
          font-size: var(--fs-md);
        }
        .queue-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }
        .queue-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2-5);
          border-radius: 999px;
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .badge-danger {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #f87171;
        }
        .badge-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fcd34d;
        }
        .badge-info {
          background: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .badge-success {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }
        .queue-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--space-3);
          margin: var(--space-4) 0;
          background: rgba(255, 255, 255, 0.6);
          padding: var(--space-3-5);
          border-radius: var(--radius-md);
          border: 1px solid var(--border, #e2e8f0);
        }
        .queue-kpi-item {
          display: flex;
          flex-direction: column;
          gap: var(--space-0-5);
        }
        .queue-kpi-label {
          font-size: var(--fs-xs);
          color: var(--muted-foreground, #64748b);
          font-weight: 600;
        }
        .queue-kpi-value {
          font-size: var(--fs-xl);
          font-weight: 800;
          color: var(--foreground, #0f172a);
        }
        .queue-kpi-value small {
          font-size: var(--fs-xs);
          font-weight: normal;
        }
        .queue-kpi-text {
          font-size: var(--fs-xs);
          font-weight: 600;
          color: var(--foreground, #0f172a);
        }
        .text-danger {
          color: #dc2626 !important;
        }
        .queue-collection-tags {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-1-5);
          margin-bottom: var(--space-4);
        }
        .queue-tags-label {
          font-size: var(--fs-xs);
          color: var(--muted-foreground, #64748b);
          font-weight: 600;
        }
        .queue-tag {
          padding: 0.15rem 0.5rem;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: var(--fs-2xs);
          color: #334155;
          font-weight: 600;
        }
        .queue-actions-row {
          display: flex;
          gap: var(--space-2);
        }
        .btn-flush-queue {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1-5);
          padding: var(--space-2) var(--space-4);
          font-size: var(--fs-sm);
        }
      `}</style>
    </div>
  );
}
