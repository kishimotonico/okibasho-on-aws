import { describe, expect, it, vi } from 'vitest';
import type { User } from 'oidc-client-ts';

import { buildLogoutUrl, restoreUser } from '../src/auth/user-manager';

describe('buildLogoutUrl', () => {
  it('Cognito独自形式(client_id + logout_uri)のログアウトURLを組み立てる', () => {
    const url = buildLogoutUrl('https://auth.example.com/', 'client-id', 'https://app.example.com');

    expect(url).toBe(
      'https://auth.example.com/logout?client_id=client-id&logout_uri=https%3A%2F%2Fapp.example.com',
    );
  });
});

describe('restoreUser', () => {
  const valid = { expired: false, refresh_token: 'refresh' } as User;
  const refreshed = { expired: false, refresh_token: 'new-refresh' } as User;

  it('有効なユーザーはそのまま返し、signinSilent しない', async () => {
    const signinSilent = vi.fn();
    const user = await restoreUser({
      getUser: async () => valid,
      signinSilent,
    });

    expect(user).toBe(valid);
    expect(signinSilent).not.toHaveBeenCalled();
  });

  it('期限切れで refresh token があれば signinSilent の結果を返す', async () => {
    const expired = { expired: true, refresh_token: 'refresh' } as User;
    const signinSilent = vi.fn(async () => refreshed);
    const user = await restoreUser({
      getUser: async () => expired,
      signinSilent,
    });

    expect(signinSilent).toHaveBeenCalledOnce();
    expect(user).toBe(refreshed);
  });

  it('期限切れで refresh token が無ければ null を返し、signinSilent しない', async () => {
    const expired = { expired: true } as User;
    const signinSilent = vi.fn();
    const user = await restoreUser({
      getUser: async () => expired,
      signinSilent,
    });

    expect(user).toBeNull();
    expect(signinSilent).not.toHaveBeenCalled();
  });

  it('signinSilent が失敗したら null を返す', async () => {
    const expired = { expired: true, refresh_token: 'refresh' } as User;
    const user = await restoreUser({
      getUser: async () => expired,
      signinSilent: async () => {
        throw new Error('invalid_grant');
      },
    });

    expect(user).toBeNull();
  });
});
