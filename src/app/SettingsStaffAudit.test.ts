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

const DISABLED_ATTR_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;
const TITLE_ATTR_PATTERN = /\stitle="([^"]*)"/;
const BUTTON_BLOCK_PATTERN = /<button\b[^>]*>[\s\S]*?<\/button>/gi;
const BUTTON_OPENING_TAG_PATTERN = /^<button\b[^>]*>/i;

function extractOpeningTags(html: string, tagName: string): string[] {
  const stripped = stripStyleBlocks(html);
  const regex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return stripped.match(regex) || [];
}

function extractTitleAttribute(tag: string): string | null {
  const match = tag.match(TITLE_ATTR_PATTERN);
  return match ? match[1] : null;
}

function findButtonOpeningTagBySpanText(html: string, spanText: string): string {
  const stripped = stripStyleBlocks(html);
  const buttonBlocks = stripped.match(BUTTON_BLOCK_PATTERN) || [];
  const targetSpan = `<span>${spanText}</span>`;
  const matchingBlocks = buttonBlocks.filter((block) => block.includes(targetSpan));
  assert.equal(
    matchingBlocks.length,
    1,
    `Expected exactly 1 <button> containing ${targetSpan}, got ${matchingBlocks.length}`
  );
  const openingMatch = matchingBlocks[0].match(BUTTON_OPENING_TAG_PATTERN);
  assert.ok(openingMatch, `Failed to extract opening <button> tag for ${targetSpan}`);
  return openingMatch[0];
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

const MOCK_ADMIN_USER: User = {
  userId: 'user-admin-1',
  name: '管理者 一郎',
  role: 'admin',
  passwordHash: 'dummy-admin-hash',
  salt: 'dummy-admin-salt',
  passkeyCredentialId: 'passkey-admin-cred-1'
};

const MOCK_PHARMACIST_USER: User = {
  userId: 'user-pharmacist-1',
  name: '薬剤師 花子',
  role: 'pharmacist',
  passwordHash: 'dummy-pharm-hash',
  salt: 'dummy-pharm-salt',
  passkeyCredentialId: 'passkey-pharm-cred-2'
};

const MOCK_CLERK_USER: User = {
  userId: 'user-clerk-1',
  name: '事務 次郎',
  role: 'clerk',
  passwordHash: 'dummy-clerk-hash',
  salt: 'dummy-clerk-salt'
};

const MOCK_STAFF_LIST: User[] = [MOCK_ADMIN_USER, MOCK_PHARMACIST_USER, MOCK_CLERK_USER];

function createMockStaffSettingsProps(
  overrides: Partial<React.ComponentProps<typeof StaffSettingsTab>> = {}
): React.ComponentProps<typeof StaffSettingsTab> {
  return {
    currentUser: MOCK_ADMIN_USER,
    canManageStaff: true,
    canViewAuditLogs: true,
    setIsAddStaffOpen: () => {},
    isOnboardingStaffSetup: true,
    currentStaffRecord: MOCK_ADMIN_USER,
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
    staffList: MOCK_STAFF_LIST,
    staffRecoveryReason: 'staff_retirement',
    setStaffRecoveryReason: () => {},
    staffRecoveryPassword: 'password123',
    setStaffRecoveryPassword: () => {},
    staffRecoveryNote: '',
    setStaffRecoveryNote: () => {},
    handleResetStaffRecoveryPassword: async () => {},
    staffRecoveryTarget: MOCK_PHARMACIST_USER,
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

  it('keeps recovery action buttons and last credentialed admin trash button disabled when preconditions unmet even when permitted', () => {
    // 1) staffRecoveryPassword が 8文字未満のとき: パスワード再設定ボタンが無効かつ案内 title
    const shortPasswordHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          staffRecoveryPassword: 'short'
        })
      )
    );
    const pwdTagShort = findButtonOpeningTagBySpanText(shortPasswordHtml, 'パスワード再設定');
    assert.ok(
      DISABLED_ATTR_PATTERN.test(pwdTagShort),
      `Expected password reset button to be disabled when password is under 8 chars:\n${pwdTagShort}`
    );
    assert.equal(
      extractTitleAttribute(pwdTagShort),
      '8文字以上の新しいパスワードを入力してください'
    );

    // 有効時（8文字以上）は disabled でなく、title も案内なし
    const validPasswordHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          staffRecoveryPassword: 'password123'
        })
      )
    );
    const pwdTagValid = findButtonOpeningTagBySpanText(validPasswordHtml, 'パスワード再設定');
    assert.ok(!DISABLED_ATTR_PATTERN.test(pwdTagValid));
    assert.equal(extractTitleAttribute(pwdTagValid), null);

    // 2) staffRecoveryTarget に passkeyCredentialId がない（事務）とき: パスキー解除ボタンが無効かつ案内 title
    const clerkTargetHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          staffRecoveryTarget: MOCK_CLERK_USER
        })
      )
    );
    const passkeyTagNoCred = findButtonOpeningTagBySpanText(clerkTargetHtml, 'パスキーを解除');
    assert.ok(
      DISABLED_ATTR_PATTERN.test(passkeyTagNoCred),
      `Expected clear passkey button to be disabled when target has no passkey:\n${passkeyTagNoCred}`
    );
    assert.equal(
      extractTitleAttribute(passkeyTagNoCred),
      '解除するパスキーがありません'
    );

    // 有効時（薬剤師: passkeyCredentialId あり）は disabled でなく、title も案内なし
    const pharmTargetHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          staffRecoveryTarget: MOCK_PHARMACIST_USER
        })
      )
    );
    const passkeyTagValid = findButtonOpeningTagBySpanText(pharmTargetHtml, 'パスキーを解除');
    assert.ok(!DISABLED_ATTR_PATTERN.test(passkeyTagValid));
    assert.equal(extractTitleAttribute(passkeyTagValid), null);

    // 3) staffRecoveryTarget が null のとき: 復旧ボタン（パスワード再設定・パスキー解除・退職チェック）が無効
    const noTargetHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          staffRecoveryTarget: null
        })
      )
    );
    const pwdTagNoTarget = findButtonOpeningTagBySpanText(noTargetHtml, 'パスワード再設定');
    const passkeyTagNoTarget = findButtonOpeningTagBySpanText(noTargetHtml, 'パスキーを解除');
    const retirementTagNoTarget = findButtonOpeningTagBySpanText(noTargetHtml, '退職前チェックを記録');
    assert.ok(DISABLED_ATTR_PATTERN.test(pwdTagNoTarget));
    assert.ok(DISABLED_ATTR_PATTERN.test(passkeyTagNoTarget));
    assert.ok(DISABLED_ATTR_PATTERN.test(retirementTagNoTarget));

    // 4) credentialedAdminCount が 1 のとき: 管理者一郎の削除ボタンのみ無効かつ案内 title
    const lastAdminHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          credentialedAdminCount: 1
        })
      )
    );
    const adminTrashTag = findOpeningTag(lastAdminHtml, 'aria-label="管理者 一郎を削除"', 'button');
    const pharmTrashTag = findOpeningTag(lastAdminHtml, 'aria-label="薬剤師 花子を削除"', 'button');
    const clerkTrashTag = findOpeningTag(lastAdminHtml, 'aria-label="事務 次郎を削除"', 'button');

    assert.ok(
      DISABLED_ATTR_PATTERN.test(adminTrashTag),
      `Expected last admin trash button to be disabled:\n${adminTrashTag}`
    );
    assert.equal(
      extractTitleAttribute(adminTrashTag),
      '最後の認証済み管理者は削除できません'
    );
    assert.ok(!DISABLED_ATTR_PATTERN.test(pharmTrashTag));
    assert.equal(extractTitleAttribute(pharmTrashTag), 'スタッフアカウントを削除');
    assert.ok(!DISABLED_ATTR_PATTERN.test(clerkTrashTag));
    assert.equal(extractTitleAttribute(clerkTrashTag), 'スタッフアカウントを削除');
  });

  it('keeps controls disabled during in-flight submission and recovery operations even when permitted', () => {
    // 1) isSubmittingStaff: true
    const submittingHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          isSubmittingStaff: true
        })
      )
    );
    const cancelBtn = findOpeningTag(submittingHtml, 'btn-staff-cancel', 'button');
    const saveBtn = findOpeningTag(submittingHtml, 'btn-staff-save', 'button');
    assert.ok(DISABLED_ATTR_PATTERN.test(cancelBtn));
    assert.ok(DISABLED_ATTR_PATTERN.test(saveBtn));

    // 2) isSavingRolePermissionPolicy: true
    const savingPolicyHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          isSavingRolePermissionPolicy: true
        })
      )
    );
    const resetBtn = findOpeningTag(savingPolicyHtml, 'btn-role-reset', 'button');
    const roleSaveBtn = findOpeningTag(savingPolicyHtml, 'btn-role-save', 'button');
    assert.ok(DISABLED_ATTR_PATTERN.test(resetBtn));
    assert.ok(DISABLED_ATTR_PATTERN.test(roleSaveBtn));
    const roleCheckboxes = extractOpeningTags(savingPolicyHtml, 'input').filter(
      (tag) => tag.includes('type="checkbox"') && (tag.includes('aria-label="薬剤師の') || tag.includes('aria-label="事務の'))
    );
    assert.equal(roleCheckboxes.length, 24);
    assert.ok(roleCheckboxes.every((tag) => DISABLED_ATTR_PATTERN.test(tag)));

    // 3) isHandlingStaffRecovery: true
    const handlingRecoveryHtml = renderToStaticMarkup(
      React.createElement(
        StaffSettingsTab,
        createMockStaffSettingsProps({
          canManageStaff: true,
          isHandlingStaffRecovery: true
        })
      )
    );
    const recoverySelects = extractOpeningTags(handlingRecoveryHtml, 'select').filter(
      (tag) => tag.includes('select-full-white') && !tag.includes('id="new-staff-role"')
    );
    assert.equal(recoverySelects.length, 2);
    assert.ok(recoverySelects.every((tag) => DISABLED_ATTR_PATTERN.test(tag)));

    const pwdInput = findOpeningTag(handlingRecoveryHtml, 'autoComplete="new-password"', 'input');
    const noteTextarea = findOpeningTag(handlingRecoveryHtml, 'recovery-textarea', 'textarea');
    const pwdActionBtn = findButtonOpeningTagBySpanText(handlingRecoveryHtml, 'パスワード再設定');
    const passkeyActionBtn = findButtonOpeningTagBySpanText(handlingRecoveryHtml, 'パスキーを解除');
    const retireActionBtn = findButtonOpeningTagBySpanText(handlingRecoveryHtml, '退職前チェックを記録');

    assert.ok(DISABLED_ATTR_PATTERN.test(pwdInput));
    assert.ok(DISABLED_ATTR_PATTERN.test(noteTextarea));
    assert.ok(DISABLED_ATTR_PATTERN.test(pwdActionBtn));
    assert.ok(DISABLED_ATTR_PATTERN.test(passkeyActionBtn));
    assert.ok(DISABLED_ATTR_PATTERN.test(retireActionBtn));
  });
});
