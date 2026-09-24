import { describe, expect, it } from 'vitest';

import { buildLogoutUrl } from '../src/auth/session';

describe('buildLogoutUrl', () => {
  it('Cognito独自形式(client_id + logout_uri)のログアウトURLを組み立てる', () => {
    const url = buildLogoutUrl('https://auth.example.com/', 'client-id', 'https://app.example.com');

    expect(url).toBe(
      'https://auth.example.com/logout?client_id=client-id&logout_uri=https%3A%2F%2Fapp.example.com',
    );
  });
});
