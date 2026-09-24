/** 本物（~/auth/session）と同じ export を、同じ型で用意する */
type SessionModule = typeof import('~/auth/session');

const DEMO_EMAIL = 'demo@example.com';

export class NotSignedInError extends Error {
  constructor() {
    super('not signed in');
    this.name = 'NotSignedInError';
  }
}

export const requireSignedIn: SessionModule['requireSignedIn'] = async () => ({
  email: DEMO_EMAIL,
});

export const requireIdToken: SessionModule['requireIdToken'] = async () => 'demo';

// デモにログアウト先は無いので、トップを読み直す。
// router は絶対 URL への redirect だけをページの読み直しにする
export const signOut: SessionModule['signOut'] = async () =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;

// /callback へ来ることは無いが、route が import するので置く
export const completeSignInCallbackOnce: SessionModule['completeSignInCallbackOnce'] = async () =>
  '/';
