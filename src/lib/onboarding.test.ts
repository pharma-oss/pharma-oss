import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog, FacilitySettings, User } from '../db/types.ts';
import {
  buildInitialSetupChecklist,
  buildInitialSetupChecklistCsv,
  buildInitialSetupHandoffMemo
} from './onboarding.ts';

const defaultSettings: FacilitySettings = {
  id: 'default',
  pharmacyName: 'Next-Gen 薬局',
  pharmacyCode: '',
  pharmacyPostalCode: '123-4567',
  pharmacyAddress: '東京都渋谷区桜丘町26-1',
  pharmacyPhone: '03-1234-5678',
  defaultPharmacistName: '山田',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none',
  genericDispensingReduction: false
};

function auditLog(actionType: AuditLog['actionType'], details: string): AuditLog {
  return {
    logId: `log_${actionType}_${details}`,
    timestamp: '2026-06-18T01:00:00.000Z',
    userId: 'admin',
    userName: '管理者',
    userRole: 'admin',
    actionType,
    details
  };
}

function staff(overrides: Partial<User>): User {
  return {
    userId: overrides.userId || `staff_${overrides.role || 'pharmacist'}`,
    name: overrides.name || '薬剤師',
    role: overrides.role || 'pharmacist',
    passwordHash: overrides.passwordHash,
    salt: overrides.salt,
    passkeyCredentialId: overrides.passkeyCredentialId,
    passkeyPublicKey: overrides.passkeyPublicKey
  };
}

test('buildInitialSetupChecklist blocks placeholder facility settings and missing admin credentials', () => {
  const checklist = buildInitialSetupChecklist({
    settings: defaultSettings,
    staff: [staff({ role: 'admin' })],
    auditLogs: [],
    generatedAt: new Date('2026-06-18T00:00:00.000Z')
  });

  assert.strictEqual(checklist.status, 'blocked');
  assert.strictEqual(checklist.statusLabel, '初期設定未完了');
  assert.strictEqual(checklist.nextStep?.id, 'facility');
  assert.ok(checklist.steps.find((step) => step.id === 'facility')?.requiredActions.includes('正式な薬局名を設定する'));
  assert.ok(checklist.steps.find((step) => step.id === 'staff')?.requiredActions.includes('管理者のパスワードまたはパスキーを登録する'));
});

test('buildInitialSetupChecklist marks setup complete when core onboarding evidence exists', () => {
  const checklist = buildInitialSetupChecklist({
    settings: {
      ...defaultSettings,
      pharmacyName: '青空薬局 渋谷店',
      pharmacyCode: '1312345',
      pharmacyAddress: '東京都渋谷区1-2-3',
      pharmacyPhone: '03-0000-0000',
      defaultPharmacistName: '薬剤師 一郎'
    },
    staff: [
      staff({ userId: 'admin', name: '管理者', role: 'admin', passwordHash: 'hash', salt: 'salt' }),
      staff({ userId: 'pharmacist', name: '薬剤師 一郎', role: 'pharmacist', passkeyCredentialId: 'credential' })
    ],
    auditLogs: [
      auditLog('drug_master_update', '支払基金マスタ同期: 医薬品マスターを更新しました'),
      auditLog('backup_drill', '復旧テスト（訓練）: sample.json / 判定 テストOK / 移行診断 移行OK ID欠落0件・重複0件・文字化け疑い0件'),
      auditLog('backup_export', 'バックアップ書き出し: yakureki_backup.json に100件を書き出しました。'),
      auditLog('backup_external_storage', 'バックアップ外部保存確認: yakureki_backup.json / 判定 外部保存OK'),
      auditLog('claim_lifecycle', '請求状態変更: UKEを出力し、請求をロックしました'),
      auditLog('uke_export', 'UKE出力: テスト受付'),
      auditLog('print', '印刷実行: 調剤録')
    ],
    generatedAt: new Date('2026-06-18T00:00:00.000Z')
  });

  assert.strictEqual(checklist.status, 'complete');
  assert.strictEqual(checklist.statusLabel, '導入準備OK');
  assert.strictEqual(checklist.completionRate, 100);
  assert.strictEqual(checklist.nextStep, undefined);
});

test('buildInitialSetupChecklist accepts migration package readiness audit as migration evidence', () => {
  const checklist = buildInitialSetupChecklist({
    settings: {
      ...defaultSettings,
      pharmacyName: '青空薬局 渋谷店',
      pharmacyCode: '1312345',
      pharmacyAddress: '東京都渋谷区1-2-3',
      pharmacyPhone: '03-0000-0000',
      defaultPharmacistName: '薬剤師 一郎'
    },
    staff: [
      staff({ userId: 'admin', name: '管理者', role: 'admin', passwordHash: 'hash', salt: 'salt' }),
      staff({ userId: 'pharmacist', name: '薬剤師 一郎', role: 'pharmacist', passkeyCredentialId: 'credential' })
    ],
    auditLogs: [
      auditLog('drug_master_update', '支払基金マスタ同期: 医薬品マスターを更新しました'),
      auditLog('backup_drill', '導入移行レビュー 導入移行OK / 患者1件・受付1件・在庫1件・薬歴1件 / CSV指摘0件・参照不整合0件 / 1日テスト 開始OK / 患者情報なし'),
      auditLog('backup_export', 'バックアップ書き出し: yakureki_backup.json に100件を書き出しました。'),
      auditLog('backup_external_storage', 'バックアップ外部保存確認: yakureki_backup.json / 判定 外部保存OK'),
      auditLog('claim_lifecycle', '請求状態変更: UKEを出力し、請求をロックしました'),
      auditLog('uke_export', 'UKE出力: テスト受付'),
      auditLog('print', '印刷実行: 調剤録')
    ],
    generatedAt: new Date('2026-06-18T00:00:00.000Z')
  });
  const migrationStep = checklist.steps.find((step) => step.id === 'migration');

  assert.strictEqual(migrationStep?.status, 'complete');
  assert.strictEqual(migrationStep?.evidence, '導入移行OKの診断ログあり');
});

test('buildInitialSetupChecklistCsv exports formula-safe rows', () => {
  const checklist = buildInitialSetupChecklist({
    settings: {
      ...defaultSettings,
      pharmacyName: '=危険薬局',
      pharmacyCode: '1312345',
      pharmacyAddress: '東京都渋谷区1-2-3',
      pharmacyPhone: '03-0000-0000',
      defaultPharmacistName: '薬剤師 一郎'
    },
    staff: [staff({ userId: 'admin', name: '管理者', role: 'admin', passwordHash: 'hash', salt: 'salt' })],
    auditLogs: [auditLog('backup_export', 'バックアップ書き出し')],
    generatedAt: new Date('2026-06-18T00:00:00.000Z')
  });

  const csv = buildInitialSetupChecklistCsv(checklist);
  assert.match(csv, /^"区分","項目","判定","証跡","必要な対応"/);
  assert.match(csv, /"'=危険薬局/);
  assert.doesNotMatch(csv, /","=危険薬局/);
});

test('buildInitialSetupHandoffMemo summarizes next onboarding work', () => {
  const checklist = buildInitialSetupChecklist({
    settings: defaultSettings,
    staff: [staff({ role: 'admin' })],
    auditLogs: [],
    generatedAt: new Date('2026-06-18T00:00:00.000Z')
  });
  const memo = buildInitialSetupHandoffMemo(checklist);

  assert.match(memo, /^初回セットアップ引き継ぎメモ（初期設定未完了）/);
  assert.match(memo, /進捗: \d+\/7完了/);
  assert.match(memo, /次の作業: 薬局基本情報 - 薬局情報を保存/);
  assert.match(memo, /残対応:/);
  assert.match(memo, /正式な薬局名を設定する/);
  assert.match(memo, /管理者のパスワードまたはパスキーを登録する/);
});

test('claim test guidance steers staff away from the tutorial demo patient', () => {
  const checklist = buildInitialSetupChecklist({
    settings: defaultSettings,
    staff: [staff({ role: 'admin' })],
    auditLogs: [],
    generatedAt: new Date('2026-06-18T00:00:00.000Z')
  });
  const claimStep = checklist.steps.find((step) => step.id === 'claim_test');
  assert.ok(claimStep);
  // 一覧では先頭2件しか表示されないため、案内は必ず先頭に置く
  assert.strictEqual(
    claimStep.requiredActions[0],
    'チュートリアルのデモ患者はUKE出力できないため、導入確認用テストデータで実施する'
  );
});
