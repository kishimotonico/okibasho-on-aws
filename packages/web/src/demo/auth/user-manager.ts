import type { AuthSession } from '~/auth/user-manager';

/** 本物（~/auth/user-manager）と同じ export を、同じ型で用意する */
type UserManagerModule = typeof import('~/auth/user-manager');

export const demoSession: AuthSession = { email: 'demo@example.com', idToken: 'demo' };

export const restoreUser: UserManagerModule['restoreUser'] = async () => null;

export const loadUser: UserManagerModule['loadUser'] = async () => null;

export const loadAuthSession: UserManagerModule['loadAuthSession'] = async () => demoSession;

// デモにログアウト先は無いので、トップを読み直す。
// router は絶対 URL への redirect だけをページの読み直しにする
export const signOut: UserManagerModule['signOut'] = async () =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;

// /callback へ来ることは無いが、route が import するので置く
export const completeSignInCallbackOnce: UserManagerModule['completeSignInCallbackOnce'] =
  async () => '/';
