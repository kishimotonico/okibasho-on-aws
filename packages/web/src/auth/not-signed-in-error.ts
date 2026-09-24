// demo ビルドは ~/auth/session を丸ごと差し替えるが、usePagesApi.ts の instanceof 判定は
// 実物と差し替え先で同じクラスを見る必要があるため、差し替え対象に入らないここへ置く
export class NotSignedInError extends Error {
  constructor() {
    super('not signed in');
    this.name = 'NotSignedInError';
  }
}
