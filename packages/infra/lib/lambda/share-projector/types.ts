/** KVSに投影する値。仕様書のJSON形式そのまま */
export interface ShareKvsValue {
  /** S3キーから導出したprefix。 "pages/<email>/<slug>/" */
  p: string;
  /** Basic認証が設定されているときだけ。 "<salt>:<hash>" */
  b?: string;
  /** IPv4 CIDR許可リスト。設定されているときだけ */
  c?: string[];
}

/** 墓標。share-idの再利用を防ぐため、消さずに元の所有prefixだけを残す */
export interface ShareKvsTombstoneValue {
  /** 元の所有prefix。 "pages/<email>/<slug>/" */
  t: string;
}

/** .metadata.json の share フィールド(検証済み) */
export interface ValidatedShare {
  id: string;
  basic?: {
    username: string;
    salt: string;
    hash: string;
  };
  allowedCidrs?: string[];
}

/** あるprefixについて「あるべき状態」。shareが無効・期限切れなどならnull */
export interface DesiredEntry {
  id: string;
  value: ShareKvsValue;
}

/** KVSから読み取った実際のエントリ */
export interface ActualEntry {
  /** KVSのkey = share-id */
  id: string;
  /** 所有prefix(value.p またはvalue.t)。パース不能・どちらも無ければundefined(削除対象) */
  prefix: string | undefined;
  /** 墓標({"t": prefix})かどうか */
  isTombstone: boolean;
  /** 生JSON文字列。差分比較(値が同じなら書かない)に使う */
  rawValue: string;
}

export interface DiffPlan {
  puts: Array<{ key: string; value: string }>;
  deletes: string[];
  /** あるべきidが既に別prefixのエントリとして存在するため書かなかった警告 */
  hijackWarnings: Array<{ prefix: string; id: string; occupiedByPrefix: string }>;
}
