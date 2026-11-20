import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AuditLog } from '@/db/types';
import type { AuditIntegrityReport } from '@/lib/audit_integrity';
import {
  executeSequencedAuditLogFetch,
  type AuditLogsCollectionLike
} from './useAuditSettings';

function makeAuditLog(logId: string, timestamp: string): AuditLog {
  return {
    logId,
    timestamp,
    userId: 'u-admin',
    userName: '管理者',
    userRole: 'admin',
    actionType: 'facility_settings_update',
    details: `detail-${logId}`
  };
}

function makeReport(total: number): AuditIntegrityReport {
  return {
    total,
    signed: total,
    unsigned: 0,
    invalid: 0,
    isValid: true
  };
}

describe('executeSequencedAuditLogFetch', () => {
  it('skips DB access when permission is missing or collection is null', async () => {
    let called = false;
    const collection: AuditLogsCollectionLike = {
      find: () => ({
        exec: async () => {
          called = true;
          return [];
        }
      })
    };

    assert.strictEqual(
      await executeSequencedAuditLogFetch({
        auditLogsCollection: collection,
        canLoad: false,
        nextSeq: () => 1,
        isCurrent: () => true,
        onLogsLoaded: () => {},
        onCheckingChange: () => {},
        onIntegrityVerified: () => {},
        onError: () => {}
      }),
      'skipped'
    );
    assert.strictEqual(called, false);

    assert.strictEqual(
      await executeSequencedAuditLogFetch({
        auditLogsCollection: null,
        canLoad: true,
        nextSeq: () => 1,
        isCurrent: () => true,
        onLogsLoaded: () => {},
        onCheckingChange: () => {},
        onIntegrityVerified: () => {},
        onError: () => {}
      }),
      'skipped'
    );
  });

  it('ignores stale responses and stale errors when a newer fetch overtakes an older one', async () => {
    let seqCounter = 0;
    const loadedSnapshots: AuditLog[][] = [];
    const verifiedReports: AuditIntegrityReport[] = [];
    const checkingHistory: boolean[] = [];
    const errors: unknown[] = [];

    let resolveFirstFind!: (rows: Array<{ toJSON: () => AuditLog }>) => void;
    let resolveFirstVerify!: (report: AuditIntegrityReport) => void;
    let callCount = 0;

    const collection: AuditLogsCollectionLike = {
      find: () => ({
        exec: () => {
          callCount += 1;
          if (callCount === 1) {
            return new Promise((resolve) => {
              resolveFirstFind = resolve;
            });
          }
          return Promise.resolve([
            { toJSON: () => makeAuditLog('log-new', '2026-11-21T00:05:00.000Z') }
          ]);
        }
      })
    };

    let verifyCalls = 0;
    const verifyIntegrity = (rows: AuditLog[]): Promise<AuditIntegrityReport> => {
      verifyCalls += 1;
      if (verifyCalls === 1 && rows[0]?.logId === 'log-old') {
        return new Promise((resolve) => {
          resolveFirstVerify = resolve;
        });
      }
      return Promise.resolve(makeReport(rows.length));
    };

    const nextSeq = () => {
      seqCounter += 1;
      return seqCounter;
    };
    const isCurrent = (seq: number) => seq === seqCounter;

    // Request 1 starts slow at DB find
    const firstPromise = executeSequencedAuditLogFetch({
      auditLogsCollection: collection,
      canLoad: true,
      nextSeq,
      isCurrent,
      verifyIntegrity,
      onLogsLoaded: (rows) => loadedSnapshots.push(rows),
      onCheckingChange: (checking) => checkingHistory.push(checking),
      onIntegrityVerified: (report) => verifiedReports.push(report),
      onError: (err) => errors.push(err)
    });

    // Request 2 overtakes Request 1 and completes first
    const secondOutcome = await executeSequencedAuditLogFetch({
      auditLogsCollection: collection,
      canLoad: true,
      nextSeq,
      isCurrent,
      verifyIntegrity,
      onLogsLoaded: (rows) => loadedSnapshots.push(rows),
      onCheckingChange: (checking) => checkingHistory.push(checking),
      onIntegrityVerified: (report) => verifiedReports.push(report),
      onError: (err) => errors.push(err)
    });
    assert.strictEqual(secondOutcome, 'completed');

    // Now Request 1 finishes late — must be ignored cleanly
    resolveFirstFind([{ toJSON: () => makeAuditLog('log-old', '2026-11-20T00:00:00.000Z') }]);
    const firstOutcome = await firstPromise;
    assert.strictEqual(firstOutcome, 'stale');
    assert.strictEqual(loadedSnapshots.length, 1);
    assert.strictEqual(loadedSnapshots[0][0].logId, 'log-new');
    assert.strictEqual(verifiedReports.length, 1);
    assert.deepStrictEqual(checkingHistory, [true, false]);
    assert.strictEqual(errors.length, 0);

    // Also test stale rejection after unmount / newer request during verifyIntegrity
    let call3Finished: Promise<'skipped' | 'stale' | 'completed' | 'error'>;
    const collection3: AuditLogsCollectionLike = {
      find: () => ({
        exec: async () => [{ toJSON: () => makeAuditLog('log-old', '2026-11-20T00:00:00.000Z') }]
      })
    };
    verifyCalls = 0;
    call3Finished = executeSequencedAuditLogFetch({
      auditLogsCollection: collection3,
      canLoad: true,
      nextSeq,
      isCurrent,
      verifyIntegrity,
      onLogsLoaded: (rows) => loadedSnapshots.push(rows),
      onCheckingChange: (checking) => checkingHistory.push(checking),
      onIntegrityVerified: (report) => verifiedReports.push(report),
      onError: (err) => errors.push(err)
    });
    // Wait a microtask so call 3 reaches verifyIntegrity
    await Promise.resolve();
    await Promise.resolve();
    // Simulate a newer fetch starting before call 3's verify resolves
    seqCounter += 1;
    resolveFirstVerify(makeReport(99));
    assert.strictEqual(await call3Finished, 'stale');
    assert.strictEqual(verifiedReports.length, 1);
    assert.strictEqual(errors.length, 0);
  });

  it('reports error and resets checking flag when the current fetch fails', async () => {
    const checkingHistory: boolean[] = [];
    const errors: unknown[] = [];
    const boom = new Error('IndexedDB read failed');

    const outcome = await executeSequencedAuditLogFetch({
      auditLogsCollection: {
        find: () => ({
          exec: async () => {
            throw boom;
          }
        })
      },
      canLoad: true,
      nextSeq: () => 1,
      isCurrent: () => true,
      onLogsLoaded: () => {},
      onCheckingChange: (checking) => checkingHistory.push(checking),
      onIntegrityVerified: () => {},
      onError: (err) => errors.push(err)
    });

    assert.strictEqual(outcome, 'error');
    assert.deepStrictEqual(errors, [boom]);
    assert.deepStrictEqual(checkingHistory, [false]);
  });
});
