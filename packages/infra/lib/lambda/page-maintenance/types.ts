/** KVSに投影する値。仕様書のJSON形式そのまま */
export interface ShareKvsValue {
  /** S3キーから導出したprefix。 "pages/<email>/<slug>/" */
  p: string;
  /** 22文字のshare-id。router側はURLの後半22文字とここを照合する */
  id: string;
  /** Basic認証が設定されているときだけ。 "<salt>:<hash>" */
  b?: string;
  /** IPv4 CIDR許可リスト。設定されているときだけ */
  c?: string[];
}

/** metadata の share フィールド(検証済み) */
export interface ValidatedShare {
  id: string;
  basic?: {
    username: string;
    salt: string;
    hash: string;
  };
  allowedCidrs?: string[];
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
