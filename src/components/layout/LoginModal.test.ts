import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { LoginModal } from './LoginModal';
import type { User } from '@/db/types';

describe('LoginModal component contracts and render tests', () => {
  const baseUser: User = {
    userId: 'user-ph-01',
    name: '山田 薬剤師',
    role: 'pharmacist'
  };

  const userWithPasskey: User = {
    userId: 'user-ph-02',
    name: '佐藤 管理者',
    role: 'admin',
    passkeyCredentialId: 'cred-mock-passkey-123'
  };

  it('exports LoginModal as a callable React function', () => {
    assert.equal(typeof LoginModal, 'function');
  });

  it('renders standard password login modal without passkey button when user lacks passkey', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginModal, {
        selectedUser: baseUser,
        passwordInput: 'test-pass',
        loginError: '',
        isVerifying: false,
        onPasswordInputChange: () => {},
        onPasswordSubmit: () => {},
        onPasskeyClick: () => {},
        onCancel: () => {}
      })
    );

    assert.ok(html.includes('スタッフログイン'), 'Should render modal title');
    assert.ok(html.includes('「山田 薬剤師」として認証してください'), 'Should display selected user name');
    assert.ok(html.includes('value="test-pass"'), 'Should populate password input value');
    assert.ok(html.includes('パスワードでログイン'), 'Should render password submit button');
    assert.ok(html.includes('キャンセル'), 'Should render cancel button');
    assert.ok(!html.includes('パスキーでログイン'), 'Should NOT render passkey button when user has no passkeyCredentialId');
    assert.ok(!html.includes('class="login-error"'), 'Should NOT render error box when loginError is empty');
  });

  it('renders passkey login button when selectedUser has passkeyCredentialId', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginModal, {
        selectedUser: userWithPasskey,
        passwordInput: '',
        loginError: '',
        isVerifying: false,
        onPasswordInputChange: () => {},
        onPasswordSubmit: () => {},
        onPasskeyClick: () => {},
        onCancel: () => {}
      })
    );

    assert.ok(html.includes('「佐藤 管理者」として認証してください'), 'Should display user name');
    assert.ok(html.includes('btn-login-passkey'), 'Should render passkey button class');
    assert.ok(html.includes('パスキーでログイン'), 'Should render passkey button label');
  });

  it('renders error message when loginError is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginModal, {
        selectedUser: baseUser,
        passwordInput: '',
        loginError: 'パスワードが正しくありません',
        isVerifying: false,
        onPasswordInputChange: () => {},
        onPasswordSubmit: () => {},
        onPasskeyClick: () => {},
        onCancel: () => {}
      })
    );

    assert.ok(html.includes('login-error'), 'Should render login-error container');
    assert.ok(html.includes('⚠️ パスワードが正しくありません'), 'Should display error text with alert icon');
  });

  it('disables buttons and renders spinner when isVerifying is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginModal, {
        selectedUser: userWithPasskey,
        passwordInput: 'my-pass',
        loginError: '',
        isVerifying: true,
        onPasswordInputChange: () => {},
        onPasswordSubmit: () => {},
        onPasskeyClick: () => {},
        onCancel: () => {}
      })
    );

    // isVerifying: true 時は 3 個のボタン（送信・パスキー・キャンセル）が無効化され、false 時は 0 個
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      3,
      `Action buttons must be disabled during verification:\n${disabledTags.join('\n')}`
    );
    assert.ok(
      disabledTags.some((tag) => tag.includes('btn-login-submit')),
      'Submit button must be disabled'
    );
    assert.ok(
      disabledTags.some((tag) => tag.includes('btn-login-passkey')),
      'Passkey button must be disabled'
    );
    assert.ok(
      disabledTags.some((tag) => tag.includes('btn-login-cancel')),
      'Cancel button must be disabled'
    );

    const htmlNotVerifying = renderToStaticMarkup(
      React.createElement(LoginModal, {
        selectedUser: userWithPasskey,
        passwordInput: 'my-pass',
        loginError: '',
        isVerifying: false,
        onPasswordInputChange: () => {},
        onPasswordSubmit: () => {},
        onPasskeyClick: () => {},
        onCancel: () => {}
      })
    );
    const notVerifyingTags = listDisabledOpeningTags(htmlNotVerifying);
    assert.equal(
      notVerifyingTags.length,
      0,
      `Action buttons must not be disabled when isVerifying is false:\n${notVerifyingTags.join('\n')}`
    );
    assert.ok(html.includes('animate-spin'), 'Should display spinning loader during verification');
  });
});
