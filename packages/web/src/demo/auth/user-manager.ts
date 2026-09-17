import type { AuthSession } from '~/auth/user-manager';

/** 本物（~/auth/user-manager）と同じ export を、同じ型で用意する */
type UserManagerModule = typeof import('~/auth/user-manager');

export const demoSession: AuthSession = { email: 'demo@example.com', idToken: 'demo' };

export const loadAuthSession: UserManagerModule['loadAuthSession'] = async () => demoSession;

// /callback へ来ることは無いが、route が import するので置く
export const completeSignInCallbackOnce: UserManagerModule['completeSignInCallbackOnce'] =
  async () => '/';
