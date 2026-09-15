/**
 * 等角の開いた箱アイコンの幾何。
 * 一次ソースは docs/icon-ideas/tuner-open-box.html の proj / rot / build / target / IDLE。
 * SC=16 のまま移植し、奥行きソート・側面の可視判定・線幅・陰影は簡略化しない。
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Quad2 = readonly [Vec2, Vec2, Vec2, Vec2];
export type Quad3 = readonly [Vec3, Vec3, Vec3, Vec3];

export type SideKey = 'br' | 'fr' | 'fl' | 'bl';

export type BoxIconParams = {
  h: number;
  shade: number;
  inner: number;
  fLen: number;
  fAng: number;
  bLen: number;
  bAng: number;
  wOut: number;
  wIn: number;
  round: number;
  sSize: number;
  sFloat: number;
  wSheet: number;
  sLines: number;
  ring: number;
  rR: number;
  wRing: number;
  rFill: number;
  rDash: number;
  bobAmp: number;
  spinMs: number;
  upMs: number;
  pad: number;
};

export type BoxIconAnim = {
  sheetZ: number;
  sheetOp: number;
  dFront: number;
  dBack: number;
  closed: number;
  /**
   * 一番外側のフラップ2枚（`PAIR_B` の br/fl）専用の closed。
   * 通常は `closed` と同値（`target`/`openingTarget` が毎回ミラーする）。
   * success 完了後のホバーだけ、この値だけを `SUCCESS_HOVER_CLOSED_OUTER` へ寄せて、
   * 内側2枚（bl/fr）は `closed=1` のまま貫通を避ける。
   */
  closedOuter: number;
  ringT: number;
  ringFill: number;
  ringDash: number;
  dashOff: number;
  spin: number;
};

export type BoxIconMotion = 'idle' | 'hover' | 'drag' | 'uploading' | 'success' | 'error';

/** Composer の phase。hover / drag はコンポーネント内部と dragging から導出する。 */
export type BoxIconPhase = 'idle' | 'uploading' | 'success' | 'error';

/** チューナー render() の指数補間。`k = 1 - 0.001^(16/260)`、約 0.26s で収束。 */
export const ANIM_CONVERGE_K = 1 - Math.pow(0.001, 16 / 260);

const INTERP_KEYS = [
  'sheetZ',
  'sheetOp',
  'dFront',
  'dBack',
  'closed',
  'closedOuter',
  'ringT',
  'ringFill',
  'ringDash',
  'dashOff',
] as const satisfies ReadonlyArray<keyof BoxIconAnim>;

export type StrokeSeg = {
  d: string;
  strokeWidth: number;
};

export type RingNode = {
  type: 'ring';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  dasharray: string | null;
  dashoffset: number | null;
};

export type FaceNode = {
  type: 'face';
  key: SideKey;
  depth: number;
  fill: string;
  fillPath: string;
  edges: readonly [StrokeSeg, StrokeSeg, StrokeSeg];
};

export type InnerNode = {
  type: 'inner';
  depth: number;
  d: string;
  fill: string;
  strokeWidth: number;
};

export type SheetNode = {
  type: 'sheet';
  depth: number;
  opacity: number;
  fillPath: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  linesPath: string | null;
  linesStrokeWidth: number;
};

export type FlapNode = {
  type: 'flap';
  key: SideKey;
  depth: number;
  angDeg: number;
  len: number;
  fill: string;
  fillPath: string;
  points3: Quad3;
  edges: readonly [StrokeSeg, StrokeSeg, StrokeSeg, StrokeSeg];
};

export type SortedNode = FaceNode | InnerNode | SheetNode | FlapNode;

export type BoxIconScene = {
  ring: RingNode | null;
  items: SortedNode[];
  join: 'round' | 'miter';
  pts: Vec2[];
};

/** チューナー DEF の確定値。底面の辺 = 1。 */
export const BOX_ICON_PARAMS: BoxIconParams = {
  h: 0.9,
  shade: 0.45,
  inner: 0.45,
  fLen: 0.45,
  fAng: 210,
  bLen: 0.5,
  bAng: 145,
  wOut: 1.5,
  wIn: 1.2,
  round: 1,
  sSize: 0.7,
  sFloat: 0.42,
  wSheet: 1.8,
  sLines: 1,
  ring: 1,
  rR: 1,
  wRing: 2,
  rFill: 1,
  rDash: 12,
  bobAmp: 0.1,
  spinMs: 900,
  upMs: 1200,
  pad: 2,
};

export const C30 = Math.cos(Math.PI / 6);
export const S30 = 0.5;
/** 底面の辺の長さ（viewBox 単位）。線幅との比率を保つための固定値。 */
export const SC = 16;

export const CORNERS: readonly [Vec2, Vec2, Vec2, Vec2] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

type CornerIndex = 0 | 1 | 2 | 3;

type SideDef = {
  a: CornerIndex;
  b: CornerIndex;
  n: Vec3;
  key: SideKey;
};

export const SIDES: readonly [SideDef, SideDef, SideDef, SideDef] = [
  { a: 0, b: 1, n: [0, -1, 0], key: 'br' },
  { a: 1, b: 2, n: [1, 0, 0], key: 'fr' },
  { a: 2, b: 3, n: [0, 1, 0], key: 'fl' },
  { a: 3, b: 0, n: [-1, 0, 0], key: 'bl' },
];

/** 閉じるとき br/fl（y 方向の対）を上に重ね、中央に合わせ目を作る。 */
const PAIR_B: Readonly<Record<SideKey, boolean>> = {
  br: true,
  fl: true,
  fr: false,
  bl: false,
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(t: number): number {
  if (t < 0) {
    return 0;
  }
  if (t > 1) {
    return 1;
  }
  return t;
}

export function ease(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function easeInOut(t: number): number {
  const x = clamp01(t);
  if (x < 0.5) {
    return 4 * x * x * x;
  }
  return 1 - (-2 * x + 2) ** 3 / 2;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 等角投影。カメラは (1,1,1) 方向から見下ろす。
 * proj(x, y, z) = ((x - y) * C30 * SC, (x + y) * S30 * SC - z * SC)
 */
export function proj(pt: Vec3): Vec2 {
  const [x, y, z] = pt;
  return [(x - y) * C30 * SC, (x + y) * S30 * SC - z * SC];
}

/**
 * 鉛直軸まわりのヨー回転。床の円と紙は rot を通さない。
 * rot(x, y, z) = (x cosθ - y sinθ, x sinθ + y cosθ, z)
 */
export function rot(pt: Vec3, thetaDeg: number): Vec3 {
  const th = (thetaDeg * Math.PI) / 180;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  const [x, y, z] = pt;
  return [x * cs - y * sn, x * sn + y * cs, z];
}

export function idleAnim(p: BoxIconParams): BoxIconAnim {
  return {
    sheetZ: p.sFloat,
    sheetOp: 1,
    dFront: 0,
    dBack: 0,
    closed: 0,
    closedOuter: 0,
    ringT: 0,
    ringFill: 0,
    ringDash: 0,
    dashOff: 0,
    spin: 0,
  };
}

/**
 * success で箱にホバーしたときに、一番外側のフラップ2枚（`PAIR_B` の br/fl）だけ
 * わずかに開きかける（closedOuter の目標値）。内側2枚（bl/fr）は closed=1 のまま
 * 動かさない（4枚とも開くと貫通して見えるため。ユーザー確認済み）。
 * DECISION 2.2 の bobAmp 同様、見た目で決めた値（モックは 0.94。ここは 0.82）。
 */
export const SUCCESS_HOVER_CLOSED_OUTER = 0.82;

/**
 * 各状態の目標値。t は状態に入ってからの経過ミリ秒。
 * error はチューナー未定義のため IDLE へ戻す。
 * DECISION 2.5 と異なり、success で蓋をエメラルドに染める lidOp は持たない
 * （ユーザー決定: 閉じた蓋は --well のまま。成功は床の円の緑だけで伝える。詳細は DESIGN.md）。
 */
export function target(p: BoxIconParams, state: BoxIconMotion, t: number): BoxIconAnim {
  const g = idleAnim(p);
  if (state === 'hover') {
    g.sheetZ = p.sFloat + p.bobAmp * Math.sin(t / 300);
    g.dBack = -3;
  }
  if (state === 'drag') {
    g.sheetZ = 0.06;
    g.dFront = 6;
    g.dBack = -8;
    g.ringT = 1;
  }
  if (state === 'uploading') {
    const ph = (t / p.upMs) % 1;
    g.sheetZ = lerp(p.sFloat, -0.6 * p.h, ease(ph / 0.7));
    g.sheetOp = ph < 0.7 ? 1 : 1 - (ph - 0.7) / 0.3;
    g.dFront = 4 + 2 * Math.sin(t / 180);
    g.dBack = -6 + 2 * Math.sin(t / 220);
    g.ringT = 1;
    g.ringDash = 1;
    g.dashOff = (t / 1600) % 1;
  }
  if (state === 'success') {
    const u = t / 1000;
    g.sheetZ = lerp(p.sFloat, -0.6 * p.h, ease(u / 0.45));
    g.sheetOp = u < 0.4 ? 1 : Math.max(0, 1 - (u - 0.4) / 0.25);
    g.closed = ease((u - 0.35) / 0.55);
    g.ringT = 1;
    g.ringFill = ease((u - 0.6) / 0.4);
  }
  // closedOuter は常に closed をミラーする（ホバー後の分岐だけ stepBoxIconAnim が上書きする）。
  g.closedOuter = g.closed;
  return g;
}

/**
 * DECISION 2章の effective。phase が uploading/success/error ならそれが勝ち、
 * それ以外は dragging → hover → idle。
 */
export function effectiveMotion(
  phase: BoxIconPhase,
  dragging: boolean,
  hovering: boolean,
): BoxIconMotion {
  if (phase === 'uploading' || phase === 'success' || phase === 'error') {
    return phase;
  }
  if (dragging) {
    return 'drag';
  }
  if (hovering) {
    return 'hover';
  }
  return 'idle';
}

/**
 * prefers-reduced-motion 時の静止ポーズ。動きだけを削り、各状態の最終形は残す。
 * uploading の破線回転は実線＋アクセント色。success は t=1200ms の完了形。
 */
export function poseForReducedMotion(p: BoxIconParams, motion: BoxIconMotion): BoxIconAnim {
  if (motion === 'hover') {
    const g = idleAnim(p);
    g.dBack = -3;
    return g;
  }
  if (motion === 'drag') {
    return target(p, 'drag', 0);
  }
  if (motion === 'uploading') {
    const g = idleAnim(p);
    g.dFront = 4;
    g.dBack = -6;
    g.ringT = 1;
    g.ringDash = 0;
    g.dashOff = 0;
    return g;
  }
  if (motion === 'success') {
    return target(p, 'success', 1200);
  }
  return idleAnim(p);
}

/** success の一度きりのシーケンスが終わるまでのミリ秒（target() の success 分岐が終息する時間）。 */
export const SUCCESS_SEQUENCE_MS = 1200;

export type StepBoxIconAnimInput = {
  cur: BoxIconAnim;
  params: BoxIconParams;
  motion: BoxIconMotion;
  elapsedMs: number;
  nowMs: number;
  spinStartedAt: number;
  reducedMotion: boolean;
  /** success 完了後、箱にホバーしているか。蓋をわずかに開きかける演出にだけ使う。 */
  hovering?: boolean;
};

/**
 * チューナー render() 1フレーム分。
 * uploading / success、および hover の sheetZ は目標値を直接代入。それ以外は指数補間。
 * spin は easeInOut で 0→360。reduced-motion ではポーズへ即時切替、spin は 0。
 * success のシーケンスが終わったあとだけ、hovering に応じて closedOuter
 * （一番外側のフラップ2枚 br/fl だけ）を SUCCESS_HOVER_CLOSED_OUTER（開きかけ）/ 1（閉じたまま）
 * へ指数補間で寄せる。内側2枚（bl/fr）の closed は 1 で固定し、4枚とも開いて貫通するのを避ける
 * （DECISION 未定義・今回追加。reduced-motion では動かさない）。
 */
export function stepBoxIconAnim(input: StepBoxIconAnimInput): BoxIconAnim {
  const { cur, params, motion, elapsedMs, nowMs, spinStartedAt, reducedMotion, hovering } = input;
  if (reducedMotion) {
    return { ...poseForReducedMotion(params, motion), spin: 0 };
  }
  const g = target(params, motion, elapsedMs);
  const next: BoxIconAnim = { ...cur };
  for (const key of INTERP_KEYS) {
    const assignDirect =
      motion === 'uploading' || motion === 'success' || (motion === 'hover' && key === 'sheetZ');
    next[key] = assignDirect ? g[key] : lerp(cur[key], g[key], ANIM_CONVERGE_K);
  }
  if (motion === 'success' && elapsedMs >= SUCCESS_SEQUENCE_MS) {
    next.closed = 1;
    const outerLiftTarget = hovering ? SUCCESS_HOVER_CLOSED_OUTER : 1;
    next.closedOuter = lerp(cur.closedOuter, outerLiftTarget, ANIM_CONVERGE_K);
  }
  const su = (nowMs - spinStartedAt) / params.spinMs;
  next.spin = su < 1 ? 360 * easeInOut(su) : 0;
  return next;
}

export function boxIconAnimNearlyEqual(a: BoxIconAnim, b: BoxIconAnim, eps = 1e-4): boolean {
  if (Math.abs(a.spin - b.spin) > 0.25) {
    return false;
  }
  for (const key of INTERP_KEYS) {
    if (Math.abs(a[key] - b[key]) > eps) {
      return false;
    }
  }
  return true;
}

/**
 * rAF を続けるか。hover / uploading の時間駆動、success シーケンス、spin、
 * 指数補間の途中だけ true。収束したら false。
 */
export function boxIconAnimNeedsFrames(input: StepBoxIconAnimInput): boolean {
  const { motion, reducedMotion, nowMs, spinStartedAt, params, elapsedMs, cur } = input;
  if (!reducedMotion) {
    if (motion === 'hover' || motion === 'uploading') {
      return true;
    }
    if (motion === 'success' && elapsedMs < SUCCESS_SEQUENCE_MS) {
      return true;
    }
    // click 直後、マウント時に一度だけ予約された rAF がまだ発火していないと
    // ensureRunning() は「既に予約済み」として新しい frame を積まない（そのまま
    // 既存の予約に乗る）。その古い予約の rAF タイムスタンプ（このフレームの
    // nowMs）は、直前に performance.now() で取った spinStartedAt よりわずかに
    // 早いことがあり、素の引き算だと負になって「回転中ではない」と誤判定して
    // しまう（回転が1フレームも進まず終わるバグ）。0 未満は 0 として扱う
    const spinElapsed = Math.max(0, nowMs - spinStartedAt);
    if (spinElapsed < params.spinMs) {
      return true;
    }
  }
  const next = stepBoxIconAnim(input);
  return !boxIconAnimNearlyEqual(cur, next);
}

/** success の一度きりのシーケンスのうち、opening が上書きしない残りのキー。 */
export type BoxIconOpeningAnim = Pick<
  BoxIconAnim,
  | 'sheetOp'
  | 'closed'
  | 'closedOuter'
  | 'ringFill'
  | 'ringT'
  | 'ringDash'
  | 'dashOff'
  | 'dFront'
  | 'dBack'
  | 'sheetZ'
>;

/**
 * success 完了状態からクリックで開くときの、経過分数 u（0〜1）に対する目標値。
 * DECISION に定義はなく、2.5（success）を反転させた今回の追加仕様（ユーザー決定 3）。
 * spin は別途 easeInOut(u) * 360 で計算し、この戻り値には含めない
 * （呼び出し側で spin を合成して1フレーム分の BoxIconAnim を組み立てる）。
 */
export function openingTarget(p: BoxIconParams, u: number): BoxIconOpeningAnim {
  const uu = clamp01(u);
  const closed = 1 - ease(clamp01((uu - 0.05) / 0.75));
  return {
    sheetOp: clamp01((uu - 0.28) / 0.4),
    closed,
    // 開くときは4枚とも同じ量で開く（貫通対策は success 完了後のホバーだけの演出）。
    closedOuter: closed,
    ringFill: 1 - clamp01(uu / 0.5),
    ringT: 1 - clamp01((uu - 0.6) / 0.4),
    ringDash: 0,
    dashOff: 0,
    dFront: 0,
    dBack: 0,
    sheetZ: lerp(-0.6 * p.h, p.sFloat, clamp01((uu - 0.3) / 0.6)),
  };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function mix(c1: string, c2: string, t: number): string {
  return `color-mix(in srgb, ${c1} ${Math.round((1 - t) * 100)}%, ${c2})`;
}

function pathFrom(pts: readonly Vec2[], close = false): string {
  return (
    pts.map((pt, i) => `${i ? 'L' : 'M'}${round2(pt[0])} ${round2(pt[1])}`).join('') +
    (close ? 'Z' : '')
  );
}

function projectQuad(pts: Quad3, fn: (pt: Vec3) => Vec2): Quad2 {
  return [fn(pts[0]), fn(pts[1]), fn(pts[2]), fn(pts[3])];
}

function visAt(vis: readonly boolean[], i: number): boolean {
  return vis[(i + 4) % 4] === true;
}

/**
 * 箱・フラップ・紙・床の円のシーンを組む。
 * 床の円は items の外（常に最奥）。残りは depth 昇順。
 */
export function build(p: BoxIconParams, st: BoxIconAnim): BoxIconScene {
  const h = p.h;
  const closed = st.closed;
  const spin = st.spin || 0;
  const P3 = (pt: Vec3): Vec2 => proj(rot(pt, spin));
  const depthOf = (pts3: readonly Vec3[]): number =>
    pts3.reduce((sum, q) => {
      const r = rot(q, spin);
      return sum + r[0] + r[1];
    }, 0) / pts3.length;
  const join: 'round' | 'miter' = p.round ? 'round' : 'miter';
  const innerC = mix('var(--well)', 'var(--text)', 0.25 + p.inner * 0.45);

  const items: SortedNode[] = [];
  const pts: Vec2[] = [];
  const push = (arr: readonly Vec2[]) => {
    for (const q of arr) {
      pts.push(q);
    }
  };

  let ring: RingNode | null = null;
  if (p.ring) {
    const rx = Math.SQRT2 * C30 * p.rR * SC;
    const ry = Math.SQRT2 * S30 * p.rR * SC;
    const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const stroke = st.ringT > 0 ? mix('var(--line)', 'var(--emerald)', st.ringT) : 'var(--line)';
    const fill = p.rFill && st.ringFill > 0.001 ? 'var(--emerald-soft)' : 'none';
    const seg = per / (p.rDash * 2);
    ring = {
      type: 'ring',
      cx: 0,
      cy: 0,
      rx: round2(rx),
      ry: round2(ry),
      fill,
      fillOpacity: round2(st.ringFill),
      stroke,
      strokeWidth: p.wRing,
      dasharray: st.ringDash > 0.001 ? `${round2(seg)} ${round2(seg)}` : null,
      dashoffset: st.ringDash > 0.001 ? round2(-st.dashOff * per) : null,
    };
    push([
      [-rx, -ry],
      [rx, ry],
    ]);
  }

  const vis = SIDES.map(({ n }) => {
    const r = rot(n, spin);
    return r[0] + r[1] > 1e-6;
  });
  const top3: Quad3 = [
    [CORNERS[0][0], CORNERS[0][1], h],
    [CORNERS[1][0], CORNERS[1][1], h],
    [CORNERS[2][0], CORNERS[2][1], h],
    [CORNERS[3][0], CORNERS[3][1], h],
  ];
  const top = projectQuad(top3, P3);
  push(top);

  SIDES.forEach((s, i) => {
    if (!visAt(vis, i)) {
      return;
    }
    const ca = CORNERS[s.a];
    const cb = CORNERS[s.b];
    const q3: Quad3 = [
      [ca[0], ca[1], h],
      [cb[0], cb[1], h],
      [cb[0], cb[1], 0],
      [ca[0], ca[1], 0],
    ];
    const q = projectQuad(q3, P3);
    push([q[2], q[3]]);
    const r = rot(s.n, spin);
    const t = 0.22 + 0.16 * clamp01((r[0] - r[1] + 1) / 2);
    const fill = mix('var(--well)', 'var(--text)', p.shade * t);
    const prev = visAt(vis, i + 3);
    const next = visAt(vis, i + 1);
    const wA = prev ? p.wIn : p.wOut;
    const wB = next ? p.wIn : p.wOut;
    items.push({
      type: 'face',
      key: s.key,
      depth: depthOf(q3),
      fill,
      fillPath: pathFrom(q, true),
      edges: [
        { d: pathFrom([q[0], q[3]]), strokeWidth: round2(wA) },
        { d: pathFrom([q[3], q[2]]), strokeWidth: round2(p.wOut) },
        { d: pathFrom([q[2], q[1]]), strokeWidth: round2(wB) },
      ],
    });
  });

  items.push({
    type: 'inner',
    depth: -0.45,
    d: pathFrom(top, true),
    fill: innerC,
    strokeWidth: round2(p.wIn),
  });

  if (st.sheetOp > 0.01) {
    const q = p.sSize / 2;
    const z = h + st.sheetZ;
    const s3: Quad3 = [
      [-q, -q, z],
      [q, -q, z],
      [q, q, z],
      [-q, q, z],
    ];
    const s = projectQuad(s3, proj);
    const l1: Vec2[] = [proj([-q * 0.55, -q * 0.25, z]), proj([q * 0.35, -q * 0.25, z])];
    const l2: Vec2[] = [proj([-q * 0.55, q * 0.2, z]), proj([q * 0.35, q * 0.2, z])];
    const linesPath = p.sLines ? `${pathFrom(l1)}${pathFrom(l2)}` : null;
    items.push({
      type: 'sheet',
      depth: -0.44,
      opacity: round2(st.sheetOp),
      fillPath: pathFrom(s, true),
      fill: 'var(--emerald-soft)',
      stroke: 'var(--emerald)',
      strokeWidth: p.wSheet,
      linesPath,
      linesStrokeWidth: round2(p.wSheet * 0.8),
    });
    if (st.sheetZ >= p.sFloat - 1e-6) {
      push(s);
    }
  }

  // ユーザー決定 1: 閉じた蓋は --well のまま。DECISION 2.5 の「蓋が薄緑になる」は採用しない
  // （成功はフラップと重なって見た目が崩れていたため。床の円の緑だけで伝える。DESIGN.md 参照）。

  const closedOuter = st.closedOuter;

  SIDES.forEach((s) => {
    const back = s.key === 'bl' || s.key === 'br';
    // 一番外側の2枚（PAIR_B の br/fl）だけ closedOuter を使う。success 完了後のホバーで
    // この2枚だけ開きかけ、内側2枚（bl/fr）は closed=1 のまま貫通を避ける（通常は同値）。
    const sideClosed = PAIR_B[s.key] ? closedOuter : closed;
    const len = lerp(back ? p.bLen : p.fLen, 0.5, sideClosed);
    const angDeg = lerp(back ? p.bAng + st.dBack : p.fAng + st.dFront, 0, sideClosed);
    const ang = (angDeg * Math.PI) / 180;
    const d: Vec3 = [-s.n[0] * Math.cos(ang), -s.n[1] * Math.cos(ang), Math.sin(ang)];
    const ca = CORNERS[s.a];
    const cb = CORNERS[s.b];
    const h1: Vec3 = [ca[0], ca[1], h];
    const h2: Vec3 = [cb[0], cb[1], h];
    const q3: Quad3 = [h1, h2, add(h2, mul(d, len)), add(h1, mul(d, len))];
    const q = projectQuad(q3, P3);
    push(q);
    const wFar = lerp(p.wOut, p.wIn, sideClosed);
    items.push({
      type: 'flap',
      key: s.key,
      depth: depthOf(q3) + (PAIR_B[s.key] ? 1.0 * sideClosed : 0),
      angDeg,
      len,
      fill: 'var(--well)',
      fillPath: pathFrom(q, true),
      points3: q3,
      edges: [
        { d: pathFrom([q[1], q[2]]), strokeWidth: round2(p.wOut) },
        { d: pathFrom([q[2], q[3]]), strokeWidth: round2(wFar) },
        { d: pathFrom([q[3], q[0]]), strokeWidth: round2(p.wOut) },
        { d: pathFrom([q[0], q[1]]), strokeWidth: round2(p.wIn) },
      ],
    });
  });

  items.sort((a, b) => a.depth - b.depth);
  return { ring, items, join, pts };
}

/** viewBox は idle の形で固定する。 */
export function viewBoxFor(p: BoxIconParams): readonly [number, number, number, number] {
  const { pts } = build(p, idleAnim(p));
  const w = Math.max(p.wOut, p.wIn, p.wSheet, p.wRing) / 2 + p.pad;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  minX -= w;
  maxX += w;
  minY -= w;
  maxY += w;
  const size = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return [round2(cx - size / 2), round2(cy - size / 2), round2(size), round2(size)];
}

export const BOX_ICON_BAKED_COLORS = {
  text: '#1a1d21',
  emerald: '#1f7a4d',
  well: '#ffffff',
  line: '#d3d6db',
  emeraldSoft: '#e0ece6',
} as const;

const BAKE_VARS: ReadonlyArray<readonly [string, string]> = [
  ['var(--emerald-soft)', BOX_ICON_BAKED_COLORS.emeraldSoft],
  ['var(--emerald)', BOX_ICON_BAKED_COLORS.emerald],
  ['var(--text)', BOX_ICON_BAKED_COLORS.text],
  ['var(--well)', BOX_ICON_BAKED_COLORS.well],
  ['var(--line)', BOX_ICON_BAKED_COLORS.line],
];

function parseHex(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function mixHex(a: string, b: string, tTowardB: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const ch = (i: number) =>
    Math.round(pa[i]! * (1 - tTowardB) + pb[i]! * tTowardB)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

export function bakePaint(value: string): string {
  if (value === 'none') {
    return value;
  }
  let out = value;
  for (const [token, hex] of BAKE_VARS) {
    out = out.replaceAll(token, hex);
  }
  const mix = /^color-mix\(in srgb, (#(?:[0-9a-fA-F]{6})) (\d+)%, (#(?:[0-9a-fA-F]{6}))\)$/.exec(
    out,
  );
  if (mix) {
    return mixHex(mix[1]!, mix[3]!, 1 - Number(mix[2]) / 100);
  }
  return out;
}

/** 16px favicon 向け。線を少し太くし、紙の中の2本線は省く。 */
export function faviconBoxParams(): BoxIconParams {
  return {
    ...BOX_ICON_PARAMS,
    wOut: 2,
    wIn: 1.6,
    wSheet: 2.2,
    wRing: 2.6,
    sLines: 0,
  };
}

export function sceneToStaticSvg(
  scene: BoxIconScene,
  viewBox: readonly [number, number, number, number],
): string {
  const parts: string[] = [];
  const path = (d: string, attrs: string) => {
    parts.push(`<path d="${d}"${attrs}/>`);
  };

  if (scene.ring) {
    const ring = scene.ring;
    const fill = bakePaint(ring.fill);
    const fillOpacity = fill === 'none' ? '' : ` fill-opacity="${ring.fillOpacity}"`;
    parts.push(
      `<ellipse cx="${ring.cx}" cy="${ring.cy}" rx="${ring.rx}" ry="${ring.ry}" fill="${fill}"${fillOpacity} stroke="${bakePaint(ring.stroke)}" stroke-width="${ring.strokeWidth}"/>`,
    );
  }

  for (const item of scene.items) {
    if (item.type === 'face') {
      path(item.fillPath, ` fill="${bakePaint(item.fill)}" stroke="none"`);
      for (const edge of item.edges) {
        path(edge.d, ` fill="none" stroke-width="${edge.strokeWidth}"`);
      }
      continue;
    }
    if (item.type === 'inner') {
      path(item.d, ` fill="${bakePaint(item.fill)}" stroke-width="${item.strokeWidth}"`);
      continue;
    }
    if (item.type === 'sheet') {
      path(
        item.fillPath,
        ` fill="${bakePaint(item.fill)}" stroke="${bakePaint(item.stroke)}" stroke-width="${item.strokeWidth}" opacity="${item.opacity}"`,
      );
      if (item.linesPath) {
        path(
          item.linesPath,
          ` fill="none" stroke="${bakePaint(item.stroke)}" stroke-width="${item.linesStrokeWidth}" opacity="${item.opacity}"`,
        );
      }
      continue;
    }
    path(item.fillPath, ` fill="${bakePaint(item.fill)}" stroke="none"`);
    for (const edge of item.edges) {
      path(edge.d, ` fill="none" stroke-width="${edge.strokeWidth}"`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" fill="none" stroke="${BOX_ICON_BAKED_COLORS.text}" stroke-linecap="round" stroke-linejoin="${scene.join}">${parts.join('')}</svg>\n`;
}

export function svgForIdleFavicon(): string {
  const params = faviconBoxParams();
  return sceneToStaticSvg(build(params, idleAnim(params)), viewBoxFor(params));
}
