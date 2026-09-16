import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { createHandler, rejectReason } from '../lib/lambda/pre-sign-up/handler.js';

function makeEvent(
  triggerSource: PreSignUpTriggerEvent['triggerSource'],
  userAttributes: Record<string, string>,
): PreSignUpTriggerEvent {
  return { triggerSource, request: { userAttributes } } as unknown as PreSignUpTriggerEvent;
}

describe('pre-sign-up', () => {
  it.each([
    ['PreSignUp_ExternalProvider', { email: 'tanaka@example.jp', email_verified: 'true' }],
    ['PreSignUp_AdminCreateUser', { email: 'okibasho-debug@example.jp' }],
  ] as const)('%s の正しいアドレスは通す', async (source, attributes) => {
    const event = makeEvent(source, attributes);
    await expect(createHandler('example.jp')(event)).resolves.toBe(event);
  });

  it.each([
    ['別ドメイン', 'PreSignUp_AdminCreateUser', { email: 'tanaka@example.com' }, 'domain'],
    [
      'ドメインの部分一致',
      'PreSignUp_AdminCreateUser',
      { email: 'tanaka@evil-example.jp' },
      'domain',
    ],
    ['大文字', 'PreSignUp_AdminCreateUser', { email: 'Tanaka@example.jp' }, 'format'],
    ['+ 付き', 'PreSignUp_AdminCreateUser', { email: 'tanaka+x@example.jp' }, 'format'],
    [
      'Google で未検証',
      'PreSignUp_ExternalProvider',
      { email: 'tanaka@example.jp', email_verified: 'false' },
      'unverified',
    ],
  ] as const)('%s は拒否する', async (_name, source, attributes, reason) => {
    const event = makeEvent(source, attributes);
    expect(rejectReason(event, 'example.jp')).toBe(reason);
    await expect(createHandler('example.jp')(event)).rejects.toThrow();
  });
});
