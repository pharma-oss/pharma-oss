import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';
import type { User } from '@/db/types';
import { DEFAULT_ROLE_PERMISSION_POLICY } from '@/lib/audit';
import {
  listDisabledOpeningTags,
  findOpeningTag,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';

function extractOpeningTags(html: string, tagName: string): string[] {
  const stripped = stripStyleBlocks(html);
  const regex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return stripped.match(regex) || [];
}

interface ControlSpec {
  name: string;
  tagName: 'button' | 'input' | 'select' | 'textarea';
  filter: (tag: string) => boolean;
  expectedCount: number;
}

// 43個の内訳（15組）:
// 1. スタッフを追加（btn-add-staff）1
// 2. オンボーディングの案内（btn-onboarding-action）1
// 3. 追加フォームのキャンセル（btn-staff-cancel）1
// 4. 追加フォームの保存（btn-staff-save）1
// 5. 権限ロールの標準に戻す（btn-role-reset）1
// 6. 権限ロールの保存（btn-role-save）1
// 7. 薬剤師列のチェックボックス 12
// 8. 事務列のチェックボックス 12
// 9. 復旧の select 2（対象スタッフ・理由。追加フォームの new-staff-role は権限の項が無いので除外）
// 10. 再設定パスワード（input-full-width）1
// 11. 対応メモ（recovery-textarea）1
// 12. 復旧アクションボタン（btn-recovery-action: パスワード再設定・パスキー解除）2
// 13. 退職前チェックを記録（btn-recovery-primary）1
// 14. スタッフ一覧のパスキー登録・再登録（btn-passkey-register: 3人分）3
// 15. スタッフ一覧のアカウント削除（btn-trash-staff: 3人分）3
const STAFF_MANAGEMENT_CONTROL_SPECS: ControlSpec[] = [
  {
    name: 'btn-add-staff (スタッフを追加ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-add-staff'),
    expectedCount: 1
  },
  {
    name: 'btn-onboarding-action (オンボーディング案内ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-onboarding-action'),
    expectedCount: 1
  },
  {
    name: 'btn-staff-cancel (スタッフ追加フォーム キャンセルボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-staff-cancel'),
    expectedCount: 1
  },
  {
    name: 'btn-staff-save (スタッフ追加フォーム 保存ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-staff-save'),
    expectedCount: 1
  },
  {
    name: 'btn-role-reset (権限ロール設定 標準に戻すボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-role-reset'),
    expectedCount: 1
  },
  {
    name: 'btn-role-save (権限ロール設定 保存ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-role-save'),
    expectedCount: 1
  },
  {
    name: 'role-checkbox-pharmacist (薬剤師列の権限チェックボックス)',
    tagName: 'input',
    filter: (tag) => tag.includes('type="checkbox"') && tag.includes('aria-label="薬剤師の'),
    expectedCount: 12
  },
  {
    name: 'role-checkbox-clerk (事務列の権限チェックボックス)',
    tagName: 'input',
    filter: (tag) => tag.includes('type="checkbox"') && tag.includes('aria-label="事務の'),
    expectedCount: 12
  },
  {
    name: 'select-recovery (復旧・退職対応 対象スタッフ・理由選択)',
    tagName: 'select',
    filter: (tag) => tag.includes('select-full-white') && !tag.includes('id="new-staff-role"'),
    expectedCount: 2
  },
  {
    name: 'input-recovery-password (復旧 再設定パスワード入力)',
    tagName: 'input',
    filter: (tag) => tag.includes('type="password"') && tag.includes('autoComplete="new-password"'),
    expectedCount: 1
  },
  {
    name: 'textarea-recovery-note (復旧 対応メモテキストエリア)',
    tagName: 'textarea',
    filter: (tag) => tag.includes('recovery-textarea'),
    expectedCount: 1
  },
  {
    name: 'btn-recovery-action (復旧 パスワード再設定・パスキー解除ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-recovery-action'),
    expectedCount: 2
  },
  {
    name: 'btn-recovery-primary (退職前チェックを記録ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-recovery-primary'),
    expectedCount: 1
  },
  {
    name: 'btn-passkey-register (スタッフ一覧 パスキー登録・再登録ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-passkey-register'),
    expectedCount: 3
  },
  {
    name: 'btn-trash-staff (スタッフ一覧 アカウント削除ボタン)',
    tagName: 'button',
    filter: (tag) => tag.includes('btn-trash-staff'),
    expectedCount: 3
  }
];

function createMockStaffSettingsProps(
  overrides: Partial<React.ComponentProps<typeof StaffSettingsTab>> = {}
): React.ComponentProps<typeof StaffSettingsTab> {
  const adminUser: User = {
    userId: 'user-admin-1',
    name: '管理者 一郎',
    role: 'admin',
    passwordHash: 'dummy-admin-hash',
    passkeyCredentialId: 'passkey-admin-cred-1'
  };

  const pharmacistUser: User = {
    userId: 'user-pharmacist-1',
    name: '薬剤師 花子',
    role: 'pharmacist',
    passwordHash: 'dummy-pharm-hash',
    passkeyCredentialId: 'passkey-pharm-cred-2'
  };

  const clerkUser: User = {
    userId: 'user-clerk-1',
    name: '事務 次郎',
    role: 'clerk',
    passwordHash: 'dummy-clerk-hash'
  };

  const staffList: User[] = [adminUser, pharmacistUser, clerkUser];

  return {
    currentUser: adminUser,
    canManageStaff: true,
    canViewAuditLogs: true,
    setIsAddStaffOpen: () => {},
    isOnboardingStaffSetup: true,
    currentStaffRecord: adminUser,
    shouldPromptCurrentStaffPasskey: true,
    handleRegisterPasskey: async () => {},
    isAddStaffOpen: true,
    handleAddStaff: async () => {},
    newStaffName: '',
    setNewStaffName: () => {},
    newStaffRole: 'pharmacist',
    setNewStaffRole: () => {},
    newStaffPassword: '',
    setNewStaffPassword: () => {},
    isSubmittingStaff: false,
    handleResetRolePermissionPolicy: async () => {},
    isSavingRolePermissionPolicy: false,
    handleSaveRolePermissionPolicy: async () => {},
    rolePermissionPolicy: DEFAULT_ROLE_PERMISSION_POLICY,
    handleRolePermissionToggle: () => {},
    handleExportStaffAccessRecoveryMonthlyReviewCsv: async () => {},
    isExportingStaffAccessRecoveryMonthlyReview: false,
    staffRecoveryChecklist: {
      reason: 'staff_retirement',
      title: '退職前チェック',
      status: 'attention',
      statusLabel: '進行中',
      targetLabel: '対象',
      steps: [],
      requiredActions: []
    },
    staffRecoveryTargetUserId: 'user-pharmacist-1',
    setStaffRecoveryTargetUserId: () => {},
    isHandlingStaffRecovery: false,
    staffList,
    staffRecoveryReason: 'staff_retirement',
    setStaffRecoveryReason: () => {},
    staffRecoveryPassword: 'password123',
    setStaffRecoveryPassword: () => {},
    staffRecoveryNote: '',
    setStaffRecoveryNote: () => {},
    handleResetStaffRecoveryPassword: async () => {},
    staffRecoveryTarget: pharmacistUser,
    handleClearStaffRecoveryPasskey: async () => {},
    handleRecordStaffRetirementCheck: async () => {},
    credentialedAdminCount: 2,
    handleDeleteStaff: async () => {},
    ...overrides
  };
}

describe('StaffSettingsTab contracts', () => {
  it('exports StaffSettingsTab as a callable React component function', () => {
    assert.equal(typeof StaffSettingsTab, 'function');
  });

  it('keeps staff management controls disabled only when canManageStaff is false', () => {
    for (const shouldPromptCurrentStaffPasskey of [true, false]) {
      const deniedProps = createMockStaffSettingsProps({
        canManageStaff: false,
        canViewAuditLogs: true,
        shouldPromptCurrentStaffPasskey
      });
      const htmlDenied = renderToStaticMarkup(React.createElement(StaffSettingsTab, deniedProps));
      const disabledDenied = listDisabledOpeningTags(htmlDenied);

      assert.equal(
        disabledDenied.length,
        55,
        `When canManageStaff is false (shouldPromptCurrentStaffPasskey=${shouldPromptCurrentStaffPasskey}), exactly 55 disabled tags must be present (12 admin role fixed checkboxes + 43 staff controls):\n${disabledDenied.join('\n')}`
      );

      const permittedProps = createMockStaffSettingsProps({
        canManageStaff: true,
        canViewAuditLogs: true,
        shouldPromptCurrentStaffPasskey
      });
      const htmlPermitted = renderToStaticMarkup(React.createElement(StaffSettingsTab, permittedProps));
      const disabledPermitted = listDisabledOpeningTags(htmlPermitted);

      assert.equal(
        disabledPermitted.length,
        12,
        `When canManageStaff is true (shouldPromptCurrentStaffPasskey=${shouldPromptCurrentStaffPasskey}), exactly 12 disabled tags must be present:\n${disabledPermitted.join('\n')}`
      );
      assert.ok(
        disabledPermitted.every((tag) => tag.includes('aria-label="管理者の')),
        `All 12 disabled tags in permitted state must be admin fixed role checkboxes:\n${disabledPermitted.join('\n')}`
      );

      let verifiedControlsCount = 0;
      for (const spec of STAFF_MANAGEMENT_CONTROL_SPECS) {
        const deniedMatchingTags = extractOpeningTags(htmlDenied, spec.tagName).filter(spec.filter);
        assert.equal(
          deniedMatchingTags.length,
          spec.expectedCount,
          `Expected ${spec.expectedCount} tags for "${spec.name}" in denied markup, got ${deniedMatchingTags.length}:\n${deniedMatchingTags.join('\n')}`
        );
        for (const tag of deniedMatchingTags) {
          assert.ok(
            /\sdisabled=""(?=[\s/>]|$)/.test(tag),
            `Element "${spec.name}" must have disabled="" when canManageStaff is false:\n${tag}`
          );
        }

        const permittedMatchingTags = extractOpeningTags(htmlPermitted, spec.tagName).filter(spec.filter);
        assert.equal(
          permittedMatchingTags.length,
          spec.expectedCount,
          `Expected ${spec.expectedCount} tags for "${spec.name}" in permitted markup, got ${permittedMatchingTags.length}:\n${permittedMatchingTags.join('\n')}`
        );
        for (const tag of permittedMatchingTags) {
          assert.ok(
            !/\sdisabled=""(?=[\s/>]|$)/.test(tag),
            `Element "${spec.name}" must not have disabled="" when canManageStaff is true:\n${tag}`
          );
        }

        verifiedControlsCount += deniedMatchingTags.length;
      }

      assert.equal(
        verifiedControlsCount,
        43,
        `Total verified staff management controls must be 43, got ${verifiedControlsCount}`
      );
    }
  });

  it('keeps the monthly recovery review CSV button disabled only when canViewAuditLogs is false', () => {
    const deniedProps = createMockStaffSettingsProps({
      canManageStaff: true,
      canViewAuditLogs: false
    });
    const htmlDenied = renderToStaticMarkup(React.createElement(StaffSettingsTab, deniedProps));
    const disabledDenied = listDisabledOpeningTags(htmlDenied);

    assert.equal(
      disabledDenied.length,
      13,
      `When canViewAuditLogs is false, exactly 13 disabled tags must be present (12 admin role fixed checkboxes + monthly review CSV button):\n${disabledDenied.join('\n')}`
    );
    const deniedCsvTag = findOpeningTag(
      htmlDenied,
      'staff-access-recovery-monthly-review-csv',
      'button'
    );
    assert.ok(
      /\sdisabled=""(?=[\s/>]|$)/.test(deniedCsvTag),
      `Monthly review CSV button must have disabled="" when canViewAuditLogs is false:\n${deniedCsvTag}`
    );

    const permittedProps = createMockStaffSettingsProps({
      canManageStaff: true,
      canViewAuditLogs: true
    });
    const htmlPermitted = renderToStaticMarkup(React.createElement(StaffSettingsTab, permittedProps));
    const disabledPermitted = listDisabledOpeningTags(htmlPermitted);

    assert.equal(
      disabledPermitted.length,
      12,
      `When canViewAuditLogs is true, exactly 12 disabled tags must be present:\n${disabledPermitted.join('\n')}`
    );
    const permittedCsvTag = findOpeningTag(
      htmlPermitted,
      'staff-access-recovery-monthly-review-csv',
      'button'
    );
    assert.ok(
      !/\sdisabled=""(?=[\s/>]|$)/.test(permittedCsvTag),
      `Monthly review CSV button must not have disabled="" when canViewAuditLogs is true:\n${permittedCsvTag}`
    );
  });
});
