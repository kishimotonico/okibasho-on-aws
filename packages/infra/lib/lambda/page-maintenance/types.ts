/** KVSに投影する値。仕様書のJSON形式そのまま */
export interface ShareKvsValue {
  /** S3キーから導出したprefix。 "pages/<email>/<slug>/" */
  p: string;
  /** 22文字のshare-id。router側はURLの後半22文字とここを照合する */
  id: string;
  /**
   * base64("guest:"+password)。router側は `"Basic " + b` とAuthorizationヘッダを
   * そのまま文字列比較するだけでBasic認証を判定できる。パスワードを付けたときだけ設定する。
   * 無ければrouter側はBasic認証を行わない
   */
  b?: string;
  /** 完全一致で許可するIPv4アドレス。設定されているときだけ */
  ips?: string[];
}

/** metadata の share フィールド(検証済み) */
export interface ValidatedShare {
  id: string;
  /** 自動生成された平文パスワード。任意。付けたときだけ設定する */
  password?: string;
  allowedIps?: string[];
}

/** あるprefixについて「あるべき状態」。shareが無効・期限切れなどならnull(呼び出し元が判定する) */
export interface DesiredEntry {
  id: string;
  value: ShareKvsValue;
}

export interface DiffPlan {
  puts: Array<{ key: string; value: string }>;
  deletes: string[];
}
