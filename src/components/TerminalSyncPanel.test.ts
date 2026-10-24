import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLLECTION_LABELS, formatDateTime } from './TerminalSyncPanel';

describe('TerminalSyncPanel contracts and styling regressions', () => {
  it('maps key collections to human-readable Japanese labels', () => {
    assert.equal(COLLECTION_LABELS.patients, '患者');
    assert.equal(COLLECTION_LABELS.visits, '受付');
    assert.equal(COLLECTION_LABELS.prescription_items, '処方');
    assert.equal(COLLECTION_LABELS.soap_records, '薬歴');
    assert.equal(COLLECTION_LABELS.audit_logs, '監査ログ');
    assert.equal(COLLECTION_LABELS.drugs, '医薬品マスタ');
    assert.equal(COLLECTION_LABELS.drug_stocks, '在庫');
  });

  it('formats date and time accurately, returning dash for falsy or invalid values', () => {
    assert.equal(formatDateTime(null), '—');
    assert.equal(formatDateTime(undefined), '—');
    assert.equal(formatDateTime(''), '—');
    assert.equal(formatDateTime('invalid-date-string'), '—');

    const formatted = formatDateTime('2026-09-30T10:15:00Z');
    assert.ok(formatted !== '—');
    assert.ok(formatted.includes(':') || formatted.includes('15'));
  });

  it('strictly prohibits inline style={{}} in TerminalSyncPanel.tsx', () => {
    const filePath = path.join(process.cwd(), 'src', 'components', 'TerminalSyncPanel.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const styleMatches = content.match(/style=\{\{/g) || [];
    assert.equal(
      styleMatches.length,
      0,
      `Expected 0 inline style={{}} in TerminalSyncPanel.tsx, found ${styleMatches.length}`
    );
  });

  it('strictly prohibits inline style={{}} in ClientLayout.tsx', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ClientLayout.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const styleMatches = content.match(/style=\{\{/g) || [];
    assert.equal(
      styleMatches.length,
      0,
      `Expected 0 inline style={{}} in ClientLayout.tsx, found ${styleMatches.length}`
    );
  });

  it('verifies that total inline style={{}} across entire src does not exceed 3 legitimate dynamic styles', () => {
    function findTsxFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findTsxFiles(fullPath));
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const tsxFiles = findTsxFiles(path.join(process.cwd(), 'src'));
    const filesWithInlineStyles: { file: string; count: number }[] = [];
    let totalInlineStyles = 0;

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/style=\{\{/g) || [];
      if (matches.length > 0) {
        filesWithInlineStyles.push({
          file: path.relative(process.cwd(), file),
          count: matches.length
        });
        totalInlineStyles += matches.length;
      }
    }

    // Only AuditSettingsTab.tsx (2) and print/[visitId]/page.tsx (1) are permitted for dynamic CSS variables
    assert.equal(
      totalInlineStyles,
      3,
      `Expected exactly 3 legitimate dynamic inline style={{}}, but found ${totalInlineStyles}: ${JSON.stringify(filesWithInlineStyles)}`
    );
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TerminalSyncPanel, {
  TerminalSyncPanelView,
  type TerminalSyncPanelViewProps,
  type TerminalRow,
  type ConflictRow
} from './TerminalSyncPanel';

function createMockSyncPanelViewProps(overrides: Partial<TerminalSyncPanelViewProps> = {}): TerminalSyncPanelViewProps {
  return {
    role: 'standalone',
    terminals: [],
    conflicts: [],
    newTerminalId: '',
    setNewTerminalId: () => {},
    newTerminalLabel: '',
    setNewTerminalLabel: () => {},
    issuedToken: null,
    satelliteHealth: null,
    busy: false,
    standbyList: [],
    standbyListErrorMessage: null,
    standbyRegistrationBlocked: false,
    selectedStandby: '',
    setSelectedStandby: () => {},
    newStandbyEndpoint: '',
    setNewStandbyEndpoint: () => {},
    isHubReachable: true,
    currentHubEndpoint: '',
    defaultHubEndpoint: '',
    hubOverridden: false,
    switchingHub: false,
    isAdmin: true,
    handleRegisterStandbyEndpoint: () => {},
    handleSwitchStandbyHub: () => {},
    handleSwitchBackToDefaultHub: () => {},
    registerTerminal: () => {},
    rotateToken: () => {},
    revokeTerminal: () => {},
    resolveConflict: () => {},
    copyToken: () => {},
    wipeLegacyLocalData: () => {},
    flushSatelliteQueue: () => {},
    ...overrides
  };
}

describe('TerminalSyncPanelView renderToStaticMarkup contracts', () => {
  it('exports TerminalSyncPanel and TerminalSyncPanelView as callable React component functions', () => {
    assert.equal(typeof TerminalSyncPanel, 'function');
    assert.equal(typeof TerminalSyncPanelView, 'function');
  });

  it('renders loading notice when role is null', () => {
    const props = createMockSyncPanelViewProps({ role: null });
    const html = renderToStaticMarkup(React.createElement(TerminalSyncPanelView, props));

    assert.ok(html.includes('terminal-sync-loading'), 'Should render loading class');
    assert.ok(html.includes('端末同期の設定を読み込んでいます…'), 'Should display loading message');
  });

  it('renders standalone explanation when role is standalone', () => {
    const props = createMockSyncPanelViewProps({ role: 'standalone' });
    const html = renderToStaticMarkup(React.createElement(TerminalSyncPanelView, props));

    assert.ok(html.includes('端末同期は無効です'), 'Should render standalone title');
    assert.ok(html.includes('PHARMACY_SYNC_ROLE=hub'), 'Should mention hub role env variable');
    assert.ok(html.includes('PHARMACY_SYNC_ROLE=satellite'), 'Should mention satellite role env variable');
    assert.ok(html.includes('docs/satellite_terminal_sync_plan.md'), 'Should link documentation path');
  });

  it('renders satellite metrics, standby hubs, and wipe button when role is satellite', () => {
    const props = createMockSyncPanelViewProps({
      role: 'satellite',
      satelliteHealth: {
        total: 14,
        byCollection: { patients: 2, soap_records: 12 },
        expiredCount: 3,
        hasExpired: true,
        isNearLimit: false,
        isLimitExceeded: false,
        oldestEnqueuedAt: '2026-10-06T08:00:00Z',
        newestEnqueuedAt: '2026-10-07T08:00:00Z'
      },
      standbyList: [
        {
          endpoint: 'https://standby-1.local:3000',
          issuedAt: '2026-10-01T09:00:00Z',
          signature: 'sig-abc123456789'
        }
      ],
      isHubReachable: true,
      currentHubEndpoint: 'https://hub.local:3000'
    });
    const html = renderToStaticMarkup(React.createElement(TerminalSyncPanelView, props));

    assert.ok(html.includes('この端末はサテライト端末です'), 'Should render satellite header');
    assert.ok(html.includes('未送信ローカルキュー（暗号化バックログ）'), 'Should render queue card title');
    assert.ok(html.includes('前日未送信あり (3件)'), 'Should display expired warning badge');
    assert.ok(html.includes('患者: 2件'), 'Should display breakdown for patients');
    assert.ok(html.includes('薬歴: 12件'), 'Should display breakdown for soap_records');
    assert.ok(html.includes('未送信データを今すぐ送信 (Flush)'), 'Should render flush queue button');
    assert.ok(html.includes('予備機切替（Standby Hub設定）'), 'Should render standby hub title');
    assert.ok(html.includes('https://standby-1.local:3000'), 'Should render standby endpoint in list');
    assert.ok(html.includes('メインHub接続中 (オンライン)'), 'Should render online status');
    assert.ok(html.includes('旧ローカルデータを完全に削除'), 'Should render wipe legacy local data button');
  });

  it('shows the way back to the main hub only while the satellite is switched to a standby', () => {
    const base = {
      role: 'satellite' as const,
      isHubReachable: true,
      currentHubEndpoint: 'https://standby-1.local:3443',
      defaultHubEndpoint: 'https://main.local:3443'
    };
    const switched = renderToStaticMarkup(React.createElement(
      TerminalSyncPanelView,
      createMockSyncPanelViewProps({ ...base, hubOverridden: true })
    ));
    assert.ok(switched.includes('data-testid="standby-hub-switch-back"'), 'Should offer the way back to the main hub');
    assert.ok(switched.includes('メイン端末（既定）へ戻す'), 'Should label the way back');
    assert.ok(switched.includes('https://main.local:3443'), 'Should show the default endpoint to return to');
    assert.ok(switched.includes('予備機に接続中 (オンライン)'), 'Should say the satellite is on the standby');
    assert.ok(!switched.includes('メインHub接続中 (オンライン)'), 'Should no longer claim the main hub');

    const normal = renderToStaticMarkup(React.createElement(
      TerminalSyncPanelView,
      createMockSyncPanelViewProps({ ...base, currentHubEndpoint: 'https://main.local:3443', hubOverridden: false })
    ));
    assert.ok(!normal.includes('standby-hub-switch-back'), 'Should not offer a way back when already on the main hub');
    assert.ok(normal.includes('メインHub接続中 (オンライン)'));
  });

  it('renders hub terminal management table, register form, and conflict review when role is hub', () => {
    const mockTerminals: TerminalRow[] = [
      {
        terminalId: 'term-sat-01',
        label: '受付サテライト1',
        registeredAt: '2026-09-01T00:00:00Z',
        lastSeenAt: '2026-10-06T15:30:00Z'
      },
      {
        terminalId: 'term-sat-02',
        label: '調剤室サテライト2',
        registeredAt: '2026-09-02T00:00:00Z',
        revokedAt: '2026-10-01T12:00:00Z'
      }
    ];

    const mockConflicts: ConflictRow[] = [
      {
        id: 'conf-1',
        collection: 'patients',
        docId: 'pt-100',
        terminalId: 'term-sat-01',
        occurredAt: '2026-10-06T12:00:00Z',
        losingDocumentState: { name: '患者 競合太郎', notes: '電話番号変更' }
      }
    ];

    const props = createMockSyncPanelViewProps({
      role: 'hub',
      terminals: mockTerminals,
      conflicts: mockConflicts,
      issuedToken: {
        terminalId: 'term-sat-03',
        token: 'token-secret-xyz-987'
      }
    });
    const html = renderToStaticMarkup(React.createElement(TerminalSyncPanelView, props));

    assert.ok(html.includes('この端末はメイン端末(集約ハブ)です'), 'Should render hub header');
    assert.ok(html.includes('サテライト端末の登録'), 'Should render registration title');
    assert.ok(html.includes('登録してトークン発行'), 'Should render register button');
    assert.ok(html.includes('端末 term-sat-03 のトークン'), 'Should render issued token section');
    assert.ok(html.includes('token-secret-xyz-987'), 'Should display issued token string');
    assert.ok(html.includes('term-sat-01'), 'Should display active terminal in table');
    assert.ok(html.includes('受付サテライト1'), 'Should display terminal label');
    assert.ok(html.includes('有効'), 'Should display active badge');
    assert.ok(html.includes('失効済み'), 'Should display revoked badge for term-sat-02');
    assert.ok(html.includes('トークン再発行'), 'Should render rotate button');
    assert.ok(html.includes('同期競合レビュー'), 'Should render conflict section');
    assert.ok(html.includes('患者 / ID pt-100'), 'Should translate collection name to Japanese');
    assert.ok(html.includes('確認済みにする'), 'Should render resolve button');
  });

  it('renders standby allowlist error state, role="alert", disabled registration inputs, and heading with "読み込めません"', () => {
    const errorMsg = 'この端末に保存された予備機リストを読み込めませんでした（ブラウザの保存領域にアクセスできません）。';
    const props = createMockSyncPanelViewProps({
      role: 'satellite',
      standbyList: [],
      standbyListErrorMessage: errorMsg,
      standbyRegistrationBlocked: true,
      isHubReachable: true
    });
    const html = renderToStaticMarkup(React.createElement(TerminalSyncPanelView, props));

    // エラーあり＝文言と role="alert" があり
    assert.ok(html.includes('role="alert"'), 'Should render role="alert" for error message');
    assert.ok(html.includes(errorMsg), 'Should render the error message text');
    // 『登録済みの予備機はありません』が無く
    assert.ok(!html.includes('登録済みの予備機はありません'), 'Should NOT render empty notice when error exists');
    // 見出しに『読み込めません』がある
    assert.ok(html.includes('事前承認済み 予備Hubリスト (読み込めません)'), 'Should render heading with 読み込めません');
    // blocked＝登録ボタンと入力欄が disabled
    assert.ok(html.includes('disabled') && html.includes('placeholder="https://standby-hub.local:3000"'), 'Input must be disabled when blocked');
    assert.ok(html.includes('disabled') && html.includes('登録 (HMAC署名発行)'), 'Register button must be disabled when blocked');
  });

  it('renders normal empty standby notice when there is no error', () => {
    const props = createMockSyncPanelViewProps({
      role: 'satellite',
      standbyList: [],
      standbyListErrorMessage: null,
      standbyRegistrationBlocked: false,
      isHubReachable: true
    });
    const html = renderToStaticMarkup(React.createElement(TerminalSyncPanelView, props));

    assert.ok(html.includes('事前承認済み 予備Hubリスト (0件)'), 'Should render normal heading with (0件)');
    assert.ok(html.includes('登録済みの予備機はありません。メイン端末とのオンライン接続中に予備機 URL を登録してください。'), 'Should render normal empty text');
    assert.ok(!html.includes('事前承認済み 予備Hubリスト (読み込めません)'), 'Should not render error heading');
  });
});

