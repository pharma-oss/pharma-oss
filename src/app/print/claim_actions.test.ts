import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_ACTION_MESSAGES,
  applyClaimOptionsWithAudit,
  applyItemClaimFlagWithAudit,
  buildItemClaimFlagAuditDetail,
  buildItemClaimFlagPatches,
  buildPrintAuditDetail,
  persistClaimLifecycleWithAudit,
  persistClaimOptions,
  printDocumentsWithAuditLog,
  applyDrugPriceOverrideWithAudit,
  buildDrugPriceOverrideAuditDetail,
  type LogAuditActionFn
} from './claim_actions.ts';
import type { ClaimLifecycleState } from '../../lib/claim_lifecycle.ts';
import type { FeeCalculationOptions } from '../../lib/calculator.ts';

// PrintPickingFlow.test.ts がソース文字列の正規表現で見ていた
// 「監査ログが残らなければ操作を確定させない」契約を、モック DB での実動テストへ昇格したもの。
// ロールバックが抜けていても画面は正常に見えるため、DB に何が残ったかで判定する。

interface AuditEntry {
  actionType: string;
  details: string;
  patientId?: string;
  patientName?: string;
}

interface Harness {
  db: any;
  events: string[];
  auditEntries: AuditEntry[];
  visitPatches: any[];
  logAudit: LogAuditActionFn;
  currentVisit: () => any;
}

function createHarness(options: { visit?: any | null; auditOk?: boolean } = {}): Harness {
  const { visit = { visitId: 'v_0001' }, auditOk = true } = options;
  const events: string[] = [];
  const auditEntries: AuditEntry[] = [];
  const visitPatches: any[] = [];
  let visitJson: any = visit === null ? null : { ...visit };

  const visitDoc = visit === null
    ? null
    : {
        toJSON: () => ({ ...visitJson }),
        patch: async (patch: any) => {
          visitPatches.push(patch);
          visitJson = { ...visitJson, ...patch };
          events.push('visit.patch');
        }
      };

  const db = {
    visits: {
      findOne: (_id: string) => ({ exec: async () => visitDoc })
    }
  };

  const logAudit: LogAuditActionFn = async (_db, actionType, details, patientId, patientName) => {
    auditEntries.push({ actionType, details, patientId, patientName });
    events.push('audit');
    return auditOk;
  };

  return { db, events, auditEntries, visitPatches, logAudit, currentVisit: () => visitJson };
}

function createItem(overrides: Record<string, unknown> = {}) {
  const patches: Record<string, boolean>[] = [];
  // patch の中身ではなく「保存後に何が残ったか」で判定できるようにしておく。
  // null を書けば patch の形は正しく見えるが、RxDB のスキーマ検証では落ちる。
  let stored: Record<string, unknown> = {
    itemId: 'item_1',
    dispensedDrug: 'ロキソプロフェン錠60mg',
    ...overrides
  };
  const item: any = {
    ...stored,
    doc: {
      patch: async (patch: Record<string, boolean>) => {
        patches.push(patch);
        stored = { ...stored, ...patch };
      },
      modify: async (mutate: (data: Record<string, unknown>) => Record<string, unknown>) => {
        stored = mutate({ ...stored });
      }
    }
  };
  return { item, patches, stored: () => stored };
}

// ---------------------------------------------------------------------------
// 印刷: 監査ログの後ろでしか印刷しない
// ---------------------------------------------------------------------------

test('printDocumentsWithAuditLog prints only after the audit log is recorded', async () => {
  const harness = createHarness();
  const events = harness.events;

  const outcome = await printDocumentsWithAuditLog({
    db: harness.db,
    visitId: 'v_0001',
    patientId: 'pt_0001',
    patientName: 'デモ患者 みどり',
    print: () => events.push('print'),
    logAudit: harness.logAudit
  });

  assert.deepEqual(outcome, { status: 'printed' });
  // 監査ログ → 印刷 の順序が逆転すると、記録の無い印刷物が出てしまう。
  assert.deepEqual(events, ['audit', 'print']);
  assert.equal(harness.auditEntries.length, 1);
  assert.equal(harness.auditEntries[0].actionType, 'print');
  assert.match(harness.auditEntries[0].details, /受付ID v_0001/);
  assert.equal(harness.auditEntries[0].patientId, 'pt_0001');
  assert.equal(harness.auditEntries[0].patientName, 'デモ患者 みどり');
});

test('printDocumentsWithAuditLog aborts printing when the audit log fails', async () => {
  const harness = createHarness({ auditOk: false });
  const events = harness.events;

  const outcome = await printDocumentsWithAuditLog({
    db: harness.db,
    visitId: 'v_0001',
    print: () => events.push('print'),
    logAudit: harness.logAudit
  });

  assert.deepEqual(outcome, { status: 'blocked', message: CLAIM_ACTION_MESSAGES.printAuditFailed });
  assert.deepEqual(events, ['audit'], '監査ログが失敗したら print() は呼ばれない');
});

test('printDocumentsWithAuditLog blocks printing before the database is ready', async () => {
  const harness = createHarness();
  const events = harness.events;

  const outcome = await printDocumentsWithAuditLog({
    db: null,
    visitId: 'v_0001',
    print: () => events.push('print'),
    logAudit: harness.logAudit
  });

  assert.deepEqual(outcome, { status: 'blocked', message: CLAIM_ACTION_MESSAGES.databaseNotReady });
  assert.deepEqual(events, [], 'DB 未初期化では監査ログも印刷も走らない');
});

test('buildPrintAuditDetail records the visit and falls back for an unnamed patient', () => {
  assert.equal(
    buildPrintAuditDetail('v_0001', 'デモ患者 みどり'),
    '帳票印刷実行: 受付ID v_0001 / 患者 デモ患者 みどり'
  );
  assert.match(buildPrintAuditDetail('v_0002', undefined), /患者 未設定$/);
  assert.match(buildPrintAuditDetail('v_0003', ''), /患者 未設定$/);
});

// ---------------------------------------------------------------------------
// 点数請求オプション: 監査ログが残らなければ DB ごと巻き戻す
// ---------------------------------------------------------------------------

const previousOptions: FeeCalculationOptions = { drugFeeOnly: false, disabledFeeCodes: [] };
const nextOptions: FeeCalculationOptions = { drugFeeOnly: true, disabledFeeCodes: [] };

test('applyClaimOptionsWithAudit persists the new billing options and records one audit entry', async () => {
  const harness = createHarness({ visit: { visitId: 'v_0001', claimOptions: previousOptions } });
  const applied: FeeCalculationOptions[] = [];
  const persisted: FeeCalculationOptions[] = [];

  const outcome = await applyClaimOptionsWithAudit({
    db: harness.db,
    visitId: 'v_0001',
    previousOptions,
    nextOptions,
    auditDetail: '点数請求切替: 薬剤料のみ',
    rollbackMessage: CLAIM_ACTION_MESSAGES.drugFeeOnlyAuditRolledBack,
    patientId: 'pt_0001',
    patientName: 'デモ患者 みどり',
    applyOptions: (o) => applied.push(o),
    onPersisted: (o) => persisted.push(o),
    logAudit: harness.logAudit
  });

  assert.deepEqual(outcome, { status: 'applied' });
  assert.deepEqual(harness.currentVisit().claimOptions, nextOptions);
  assert.deepEqual(applied, [nextOptions]);
  assert.deepEqual(persisted, [nextOptions]);
  assert.equal(harness.auditEntries.length, 1);
  assert.equal(harness.auditEntries[0].actionType, 'billing_toggle');
  assert.equal(harness.auditEntries[0].details, '点数請求切替: 薬剤料のみ');
  // 保存 → 監査ログ の順。監査ログが先だと、保存に失敗した変更が記録に残る。
  assert.deepEqual(harness.events, ['visit.patch', 'audit']);
});

test('applyClaimOptionsWithAudit rolls the stored billing options back when the audit log fails', async () => {
  const harness = createHarness({
    visit: { visitId: 'v_0001', claimOptions: previousOptions },
    auditOk: false
  });
  const applied: FeeCalculationOptions[] = [];
  const persisted: FeeCalculationOptions[] = [];

  const outcome = await applyClaimOptionsWithAudit({
    db: harness.db,
    visitId: 'v_0001',
    previousOptions,
    nextOptions,
    auditDetail: '点数請求算定切替: 「01」を 算定OFF (理由: 算定要件未充足のため) に変更しました。',
    rollbackMessage: CLAIM_ACTION_MESSAGES.feeToggleAuditRolledBack,
    applyOptions: (o) => applied.push(o),
    onPersisted: (o) => persisted.push(o),
    logAudit: harness.logAudit
  });

  assert.deepEqual(outcome, {
    status: 'rolled_back',
    message: CLAIM_ACTION_MESSAGES.feeToggleAuditRolledBack
  });
  // 画面の state だけでなく、DB に残った値まで戻っていること。
  assert.deepEqual(harness.currentVisit().claimOptions, previousOptions);
  assert.deepEqual(harness.visitPatches, [{ claimOptions: nextOptions }, { claimOptions: previousOptions }]);
  assert.deepEqual(applied, [nextOptions, previousOptions]);
  assert.deepEqual(persisted, [nextOptions, previousOptions]);
  assert.deepEqual(harness.events, ['visit.patch', 'audit', 'visit.patch']);
});

test('applyClaimOptionsWithAudit refuses to touch the audit log when persistence fails', async () => {
  const harness = createHarness({ visit: null });

  await assert.rejects(
    () => applyClaimOptionsWithAudit({
      db: harness.db,
      visitId: 'v_missing',
      previousOptions,
      nextOptions,
      auditDetail: '点数請求切替: 薬剤料のみ',
      rollbackMessage: CLAIM_ACTION_MESSAGES.drugFeeOnlyAuditRolledBack,
      applyOptions: () => {},
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.visitNotFound)
  );
  assert.deepEqual(harness.auditEntries, [], '保存できていない変更を監査ログへ書かない');
});

test('persistClaimOptions reports an uninitialized database instead of silently skipping', async () => {
  await assert.rejects(
    () => persistClaimOptions({ db: null, visitId: 'v_0001', options: nextOptions }),
    new Error(CLAIM_ACTION_MESSAGES.databaseNotReady)
  );
});

// ---------------------------------------------------------------------------
// 処方薬別の算定フラグ
// ---------------------------------------------------------------------------

test('buildItemClaimFlagPatches captures the previous value for the rollback patch', () => {
  const { patch, previousPatch } = buildItemClaimFlagPatches({ claimPreparation: false }, 'claimPreparation', true);
  assert.deepEqual(patch, { claimPreparation: true });
  assert.deepEqual(previousPatch, { claimPreparation: false });
});

test('buildItemClaimFlagPatches turns off preparation and management fees for a diagnostic test', () => {
  // 検査扱いに切り替えると調剤料・管理料も落ちるため、巻き戻しは 3 項目まとめて戻す。
  const { patch, previousPatch } = buildItemClaimFlagPatches({}, 'isDiagnosticTest', true);
  assert.deepEqual(patch, {
    isDiagnosticTest: true,
    claimPreparation: false,
    claimManagement: false
  });
  assert.deepEqual(previousPatch, {
    isDiagnosticTest: false,
    claimPreparation: true,
    claimManagement: true
  });

  // 検査扱いを外すときは連動しない (元の算定状態は薬剤師が判断する)。
  const off = buildItemClaimFlagPatches({ isDiagnosticTest: true }, 'isDiagnosticTest', false);
  assert.deepEqual(off.patch, { isDiagnosticTest: false });
  assert.deepEqual(off.previousPatch, { isDiagnosticTest: true });
});

test('buildItemClaimFlagAuditDetail names the drug and the direction of the change', () => {
  const detail = buildItemClaimFlagAuditDetail({ dispensedDrug: 'ロキソプロフェン錠60mg' }, 'claimPreparation', false);
  assert.match(detail, /ロキソプロフェン錠60mg/);
  assert.match(detail, /「claimPreparation」を OFF に変更しました。/);
  assert.match(
    buildItemClaimFlagAuditDetail({ drugId: 'drug_9' }, 'claimManagement', true),
    /薬品「drug_9」の「claimManagement」を ON に変更しました。/
  );
});

test('applyItemClaimFlagWithAudit keeps the item change once the audit log is recorded', async () => {
  const harness = createHarness();
  const { item, patches } = createItem();

  const patch = await applyItemClaimFlagWithAudit({
    db: harness.db,
    item,
    itemDoc: item.doc,
    field: 'claimPreparation',
    value: false,
    patientId: 'pt_0001',
    patientName: 'デモ患者 みどり',
    logAudit: harness.logAudit
  });

  assert.deepEqual(patch, { claimPreparation: false });
  assert.deepEqual(patches, [{ claimPreparation: false }], '巻き戻しの patch は起きない');
  assert.equal(harness.auditEntries.length, 1);
  assert.equal(harness.auditEntries[0].actionType, 'billing_toggle');
});

test('applyItemClaimFlagWithAudit rolls the item back when the audit log fails', async () => {
  const harness = createHarness({ auditOk: false });
  const { item, patches } = createItem({ claimPreparation: true });

  await assert.rejects(
    () => applyItemClaimFlagWithAudit({
      db: harness.db,
      item,
      itemDoc: item.doc,
      field: 'claimPreparation',
      value: false,
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.itemClaimToggleAuditRolledBack)
  );

  assert.deepEqual(
    patches,
    [{ claimPreparation: false }, { claimPreparation: true }],
    '2 回目の patch で元の算定フラグへ戻る'
  );
});

test('applyItemClaimFlagWithAudit restores all three flags when a diagnostic test rollback happens', async () => {
  const harness = createHarness({ auditOk: false });
  const { item, patches } = createItem({ claimPreparation: false, claimManagement: true });

  await assert.rejects(
    () => applyItemClaimFlagWithAudit({
      db: harness.db,
      item,
      itemDoc: item.doc,
      field: 'isDiagnosticTest',
      value: true,
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.itemClaimToggleAuditRolledBack)
  );

  assert.deepEqual(patches[1], {
    isDiagnosticTest: false,
    claimPreparation: false,
    claimManagement: true
  });
});

// ---------------------------------------------------------------------------
// 請求ライフサイクル: 返戻 → 再請求 → 請求完了
// ---------------------------------------------------------------------------

const returnedLifecycle: ClaimLifecycleState = {
  status: 'returned',
  returnedAt: '2026-08-26T01:00:00.000Z',
  returnReason: '保険者番号不一致'
};

test('persistClaimLifecycleWithAudit stores the transition and records it', async () => {
  const harness = createHarness({ visit: { visitId: 'v_0001', claimLifecycle: { status: 'exported' } } });
  const appliedStates: ClaimLifecycleState[] = [];

  await persistClaimLifecycleWithAudit({
    db: harness.db,
    visitId: 'v_0001',
    nextLifecycle: returnedLifecycle,
    detail: '返戻登録 (保険者番号不一致)',
    patientId: 'pt_0001',
    patientName: 'デモ患者 みどり',
    applyLifecycle: (l) => appliedStates.push(l),
    logAudit: harness.logAudit
  });

  assert.deepEqual(harness.currentVisit().claimLifecycle, returnedLifecycle);
  assert.deepEqual(appliedStates, [returnedLifecycle]);
  assert.equal(harness.auditEntries.length, 1);
  assert.equal(harness.auditEntries[0].actionType, 'claim_lifecycle');
  assert.equal(harness.auditEntries[0].details, '返戻登録 (保険者番号不一致)');
});

test('persistClaimLifecycleWithAudit restores the previous lifecycle when the audit log fails', async () => {
  const exported: ClaimLifecycleState = { status: 'exported', exportedFileName: 'RECEIPTC.UKE' };
  const harness = createHarness({ visit: { visitId: 'v_0001', claimLifecycle: exported }, auditOk: false });
  const appliedStates: ClaimLifecycleState[] = [];

  await assert.rejects(
    () => persistClaimLifecycleWithAudit({
      db: harness.db,
      visitId: 'v_0001',
      nextLifecycle: returnedLifecycle,
      detail: '返戻登録 (保険者番号不一致)',
      applyLifecycle: (l) => appliedStates.push(l),
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.claimLifecycleAuditRolledBack)
  );

  // 返戻の記録が残らないまま状態だけ進むと、ロックの理由を後から追えなくなる。
  assert.deepEqual(harness.currentVisit().claimLifecycle, exported);
  assert.deepEqual(appliedStates, [returnedLifecycle, exported]);
  assert.deepEqual(harness.events, ['visit.patch', 'audit', 'visit.patch']);
});

test('persistClaimLifecycleWithAudit falls back to draft when there was no previous lifecycle', async () => {
  const harness = createHarness({ visit: { visitId: 'v_0001' }, auditOk: false });
  const appliedStates: ClaimLifecycleState[] = [];

  await assert.rejects(
    () => persistClaimLifecycleWithAudit({
      db: harness.db,
      visitId: 'v_0001',
      nextLifecycle: returnedLifecycle,
      detail: '返戻登録 (保険者番号不一致)',
      applyLifecycle: (l) => appliedStates.push(l),
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.claimLifecycleAuditRolledBack)
  );

  assert.deepEqual(harness.currentVisit().claimLifecycle, { status: 'draft' });
  assert.deepEqual(appliedStates[1], { status: 'draft' });
});

test('persistClaimLifecycleWithAudit reports a missing visit instead of writing an audit entry', async () => {
  const harness = createHarness({ visit: null });

  await assert.rejects(
    () => persistClaimLifecycleWithAudit({
      db: harness.db,
      visitId: 'v_missing',
      nextLifecycle: returnedLifecycle,
      detail: '返戻登録 (保険者番号不一致)',
      applyLifecycle: () => {},
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.claimLifecycleVisitNotFound)
  );
  assert.deepEqual(harness.auditEntries, []);
});

test('persistClaimLifecycleWithAudit does nothing while the database is unavailable', async () => {
  const harness = createHarness();
  const appliedStates: ClaimLifecycleState[] = [];

  await persistClaimLifecycleWithAudit({
    db: null,
    visitId: 'v_0001',
    nextLifecycle: returnedLifecycle,
    detail: '返戻登録 (保険者番号不一致)',
    applyLifecycle: (l) => appliedStates.push(l),
    logAudit: harness.logAudit
  });

  assert.deepEqual(appliedStates, []);
  assert.deepEqual(harness.auditEntries, []);
});


// ---------------------------------------------------------------------------
// 薬価の版の切り替え
// ---------------------------------------------------------------------------

const priceHistory = [
  { price: 12.3, effectiveFrom: '2024-04-01' },
  { price: 10.9, effectiveFrom: '2026-04-01' }
];

function harness_stored_override(stored: Record<string, unknown>) {
  return stored.drugPriceOverride;
}

test('applyDrugPriceOverrideWithAudit records the deviation from the dispensing-date price', async () => {
  const harness = createHarness();
  const { item, stored } = createItem();

  const outcome = await applyDrugPriceOverrideWithAudit({
    db: harness.db,
    item,
    itemDoc: item.doc,
    drug: { priceHistory },
    dispensingDate: '2026-06-14',
    override: { effectiveFrom: '2024-04-01', price: 12.3 },
    patientId: 'pt_0001',
    patientName: 'デモ患者 みどり',
    logAudit: harness.logAudit
  });

  assert.equal(outcome.price, 12.3);
  assert.equal(outcome.overridden, true);
  assert.match(outcome.warning, /調剤日時点は 10\.9円/);
  assert.deepEqual(harness_stored_override(stored()), { effectiveFrom: '2024-04-01', price: 12.3 });

  // 点数が変わる操作なので、違う版を当てたことが監査ログに必ず残る
  assert.equal(harness.auditEntries.length, 1);
  assert.equal(harness.auditEntries[0].actionType, 'billing_toggle');
  assert.match(harness.auditEntries[0].details, /調剤日時点と異なる薬価を適用しました/);
  assert.match(harness.auditEntries[0].details, /12\.3円（適用 2024-04-01）/);
});

test('applyDrugPriceOverrideWithAudit clears the override and says it returned to the automatic price', async () => {
  const harness = createHarness();
  const { item, stored } = createItem({
    drugPriceOverride: { effectiveFrom: '2024-04-01', price: 12.3 }
  });

  const outcome = await applyDrugPriceOverrideWithAudit({
    db: harness.db,
    item,
    itemDoc: item.doc,
    drug: { priceHistory },
    dispensingDate: '2026-06-14',
    override: null,
    logAudit: harness.logAudit
  });

  assert.equal(outcome.overridden, false);
  assert.equal(outcome.price, 10.9);
  assert.equal(outcome.warning, '');
  // null を書くとスキーマ検証で落ちる。項目ごと消えていること。
  assert.equal('drugPriceOverride' in stored(), false);
  assert.match(harness.auditEntries[0].details, /調剤日 2026-06-14 時点の薬価（10\.9円）へ戻しました/);
});

test('choosing the dispensing-date revision is recorded without a deviation warning', async () => {
  const harness = createHarness();
  const { item } = createItem();

  const outcome = await applyDrugPriceOverrideWithAudit({
    db: harness.db,
    item,
    itemDoc: item.doc,
    drug: { priceHistory },
    dispensingDate: '2026-06-14',
    override: { effectiveFrom: '2026-04-01', price: 10.9 },
    logAudit: harness.logAudit
  });

  assert.equal(outcome.overridden, false, '同じ結論に警告は出さない');
  assert.equal(outcome.warning, '');
});

test('applyDrugPriceOverrideWithAudit restores the previous override when the audit log fails', async () => {
  const harness = createHarness({ auditOk: false });
  const previous = { effectiveFrom: '2024-04-01', price: 12.3 };
  const { item, stored } = createItem({ drugPriceOverride: previous });

  await assert.rejects(
    () => applyDrugPriceOverrideWithAudit({
      db: harness.db,
      item,
      itemDoc: item.doc,
      drug: { priceHistory },
      dispensingDate: '2026-06-14',
      override: null,
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.drugPriceOverrideAuditRolledBack)
  );

  assert.deepEqual(stored().drugPriceOverride, previous);
});

test('the revision with no start date is stored without an effective date', async () => {
  // 開始日不明の版を選んだときに空文字の日付を書くと、
  // 読み戻したときに「壊れた日付の版」として捨てられる。
  const harness = createHarness();
  const { item, stored } = createItem();

  await applyDrugPriceOverrideWithAudit({
    db: harness.db,
    item,
    itemDoc: item.doc,
    drug: { price: 10.9, priceHistory: [{ price: 13.2 }, ...priceHistory] },
    dispensingDate: '2026-06-14',
    override: { price: 13.2 },
    logAudit: harness.logAudit
  });

  assert.deepEqual(stored().drugPriceOverride, { price: 13.2 });
  assert.equal('effectiveFrom' in (stored().drugPriceOverride as object), false);
});

test('buildDrugPriceOverrideAuditDetail names the drug', () => {
  const detail = buildDrugPriceOverrideAuditDetail(
    { dispensedDrug: 'ロキソプロフェン錠60mg' },
    { price: 12.3, overridden: true, warning: '(警告文)' },
    '2026-06-14'
  );
  assert.match(detail, /ロキソプロフェン錠60mg/);
  assert.match(detail, /\(警告文\)/);
});


test('item-level actions refuse to run without the prescription item document', async () => {
  // 画面の明細は toJSON() 由来で RxDocument を持たない。
  // ここを黙って握りつぶすと、チェックを操作しても何も保存されない状態になる
  // (実際にそうなっていた)。理由の分かる失敗にする。
  const harness = createHarness();
  const { item } = createItem();

  await assert.rejects(
    () => applyItemClaimFlagWithAudit({
      db: harness.db,
      item,
      itemDoc: undefined,
      field: 'claimPreparation',
      value: false,
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.prescriptionItemNotFound)
  );

  await assert.rejects(
    () => applyDrugPriceOverrideWithAudit({
      db: harness.db,
      item,
      itemDoc: null,
      drug: { priceHistory },
      dispensingDate: '2026-06-14',
      override: null,
      logAudit: harness.logAudit
    }),
    new Error(CLAIM_ACTION_MESSAGES.prescriptionItemNotFound)
  );

  assert.deepEqual(harness.auditEntries, [], '保存できていないのに監査ログを書かない');
});
