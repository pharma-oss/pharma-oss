import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PWA_BANNER_DISMISSED_STORAGE_KEY,
  executePwaInstallPrompt,
  isPwaBannerDismissed,
  markPwaBannerDismissed
} from './usePWA';

describe('usePWA helpers', () => {
  it('isPwaBannerDismissed reads flag and safely falls back to false when storage is unavailable or throws', () => {
    assert.strictEqual(isPwaBannerDismissed(null), false);
    assert.strictEqual(isPwaBannerDismissed(undefined), false);
    assert.strictEqual(
      isPwaBannerDismissed({
        getItem: (key) => (key === PWA_BANNER_DISMISSED_STORAGE_KEY ? 'true' : null)
      }),
      true
    );
    assert.strictEqual(
      isPwaBannerDismissed({
        getItem: () => 'false'
      }),
      false
    );
    assert.strictEqual(
      isPwaBannerDismissed({
        getItem: () => {
          throw new DOMException('Blocked by privacy policy', 'SecurityError');
        }
      }),
      false
    );
  });

  it('markPwaBannerDismissed writes dismissal key and safely returns false when storage throws', () => {
    const stored = new Map<string, string>();
    const persisted = markPwaBannerDismissed({
      setItem: (key, value) => {
        stored.set(key, value);
      }
    });
    assert.strictEqual(persisted, true);
    assert.strictEqual(stored.get(PWA_BANNER_DISMISSED_STORAGE_KEY), 'true');

    assert.strictEqual(markPwaBannerDismissed(null), false);
    assert.strictEqual(
      markPwaBannerDismissed({
        setItem: () => {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
      }),
      false
    );
  });

  it('executePwaInstallPrompt returns noop, accepted, dismissed, or error without unhandled rejections', async () => {
    assert.strictEqual(await executePwaInstallPrompt(null), 'noop');

    let promptCalled = false;
    const accepted = await executePwaInstallPrompt({
      prompt: async () => {
        promptCalled = true;
      },
      userChoice: Promise.resolve({ outcome: 'accepted' })
    });
    assert.strictEqual(promptCalled, true);
    assert.strictEqual(accepted, 'accepted');

    const dismissed = await executePwaInstallPrompt({
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' })
    });
    assert.strictEqual(dismissed, 'dismissed');

    const promptError = await executePwaInstallPrompt({
      prompt: async () => {
        throw new Error('User gesture expired');
      },
      userChoice: Promise.resolve({ outcome: 'dismissed' })
    });
    assert.strictEqual(promptError, 'error');

    const choiceError = await executePwaInstallPrompt({
      prompt: async () => {},
      userChoice: Promise.reject(new Error('Prompt aborted'))
    });
    assert.strictEqual(choiceError, 'error');
  });
});
