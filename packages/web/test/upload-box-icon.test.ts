import { describe, expect, it } from 'vitest';

import {
  ANIM_CONVERGE_K,
  BOX_ICON_PARAMS,
  C30,
  S30,
  SC,
  build,
  ease,
  easeInOut,
  effectiveMotion,
  idleAnim,
  lerp,
  poseForReducedMotion,
  proj,
  rot,
  stepBoxIconAnim,
  target,
  viewBoxFor,
  type FaceNode,
  type FlapNode,
} from '../src/lib/upload-box-icon';

const P = BOX_ICON_PARAMS;

function flapsOf(scene: ReturnType<typeof build>): FlapNode[] {
  return scene.items.filter((item): item is FlapNode => item.type === 'flap');
}

function facesOf(scene: ReturnType<typeof build>): FaceNode[] {
  return scene.items.filter((item): item is FaceNode => item.type === 'face');
}

function flap(scene: ReturnType<typeof build>, key: FlapNode['key']): FlapNode {
  const node = flapsOf(scene).find((item) => item.key === key);
  if (!node) {
    throw new Error(`flap ${key} missing`);
  }
  return node;
}

function face(scene: ReturnType<typeof build>, key: FaceNode['key']): FaceNode {
  const node = facesOf(scene).find((item) => item.key === key);
  if (!node) {
    throw new Error(`face ${key} missing`);
  }
  return node;
}

describe('proj', () => {
  it('原点は (0, 0)', () => {
    expect(proj([0, 0, 0])).toEqual([0, 0]);
  });

  it('既知点を SC=16 の等角投影で写す', () => {
    expect(proj([1, 0, 0])[0]).toBeCloseTo(C30 * SC, 10);
    expect(proj([1, 0, 0])[1]).toBeCloseTo(S30 * SC, 10);
    expect(proj([0, 1, 0])[0]).toBeCloseTo(-C30 * SC, 10);
    expect(proj([0, 1, 0])[1]).toBeCloseTo(S30 * SC, 10);
    expect(proj([0, 0, 1])).toEqual([0, -SC]);
    expect(proj([0.5, 0.5, 0])).toEqual([0, SC * S30]);
    expect(proj([-0.5, -0.5, 0])).toEqual([0, -SC * S30]);
    expect(proj([0.5, -0.5, 0])[0]).toBeCloseTo(C30 * SC, 10);
    expect(proj([0.5, -0.5, 0])[1]).toBeCloseTo(0, 10);
  });
});

describe('rot', () => {
  it('90° ヨーで (1,0,0) が (0,1,0) になる', () => {
    const [x, y, z] = rot([1, 0, 0], 90);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
    expect(z).toBe(0);
  });

  it('z は変えない', () => {
    expect(rot([0.3, -0.2, 0.9], 45)[2]).toBe(0.9);
  });
});

describe('idle のフラップ', () => {
  it('手前は 210°、奥は 145°、長さは決定値のまま', () => {
    const scene = build(P, idleAnim(P));
    expect(flap(scene, 'fr').angDeg).toBe(210);
    expect(flap(scene, 'fl').angDeg).toBe(210);
    expect(flap(scene, 'br').angDeg).toBe(145);
    expect(flap(scene, 'bl').angDeg).toBe(145);
    expect(flap(scene, 'fr').len).toBe(0.45);
    expect(flap(scene, 'fl').len).toBe(0.45);
    expect(flap(scene, 'br').len).toBe(0.5);
    expect(flap(scene, 'bl').len).toBe(0.5);
  });

  it('手前フラップは外向きかつ下向き、奥は外向きかつ上向き', () => {
    const scene = build(P, idleAnim(P));
    const fr = flap(scene, 'fr');
    const hinge = fr.points3[0];
    const outer = fr.points3[3];
    expect(outer[0]).toBeGreaterThan(hinge[0]);
    expect(outer[2]).toBeLessThan(hinge[2]);

    const br = flap(scene, 'br');
    expect(br.points3[3][1]).toBeLessThan(br.points3[0][1]);
    expect(br.points3[3][2]).toBeGreaterThan(br.points3[0][2]);
  });
});

describe('closed=1 のフラップ', () => {
  it('長さが 0.5、角度が 0 になる', () => {
    const scene = build(P, { ...idleAnim(P), closed: 1 });
    for (const node of flapsOf(scene)) {
      expect(node.len).toBe(0.5);
      expect(node.angDeg).toBe(0);
    }
  });

  it('fLen / bLen が違っても閉じると 0.5 に揃う', () => {
    const scene = build({ ...P, fLen: 0.2, bLen: 0.3 }, { ...idleAnim(P), closed: 1 });
    for (const node of flapsOf(scene)) {
      expect(node.len).toBe(0.5);
    }
  });

  it('先端辺の線幅は wIn になる', () => {
    const scene = build(P, { ...idleAnim(P), closed: 1 });
    expect(flap(scene, 'fr').edges[1].strokeWidth).toBe(P.wIn);
  });
});

describe('depth sort', () => {
  it('idle は奥フラップ → 開口部 → 紙 → 側面 → 手前フラップ', () => {
    const scene = build(P, idleAnim(P));
    const order = scene.items.map((item) =>
      item.type === 'flap' || item.type === 'face' ? `${item.type}-${item.key}` : item.type,
    );
    expect(order).toEqual([
      'flap-br',
      'flap-bl',
      'inner',
      'sheet',
      'face-fr',
      'face-fl',
      'flap-fr',
      'flap-fl',
    ]);
    const depths = scene.items.map((item) => item.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('closed=1 では br/fl が bl/fr の上に来る', () => {
    const scene = build(P, { ...idleAnim(P), closed: 1, sheetOp: 0 });
    const br = flap(scene, 'br');
    const fl = flap(scene, 'fl');
    const bl = flap(scene, 'bl');
    const fr = flap(scene, 'fr');
    expect(br.depth).toBeGreaterThan(bl.depth);
    expect(fl.depth).toBeGreaterThan(fr.depth);
  });

  it('床の円は items に入らず常に別枠', () => {
    const scene = build(P, idleAnim(P));
    expect(scene.ring).not.toBeNull();
    expect(scene.items.some((item) => item.type === 'inner')).toBe(true);
    expect(scene.items.find((item) => item.type === 'sheet')).toBeTruthy();
  });
});

describe('側面の可視判定', () => {
  it('idle では手前 2 面だけ見える', () => {
    const keys = facesOf(build(P, idleAnim(P))).map((node) => node.key);
    expect(keys).toEqual(['fr', 'fl']);
  });

  it('spin=180 では奥 2 面だけ見える', () => {
    const keys = facesOf(build(P, { ...idleAnim(P), spin: 180 })).map((node) => node.key);
    expect(keys).toEqual(['br', 'bl']);
  });

  it('見えている縦稜線は隣面も見えていれば wIn', () => {
    const node = face(build(P, idleAnim(P)), 'fr');
    expect(node.edges[0].strokeWidth).toBe(P.wOut);
    expect(node.edges[1].strokeWidth).toBe(P.wOut);
    expect(node.edges[2].strokeWidth).toBe(P.wIn);
  });
});

describe('紙と床の円は回さない', () => {
  it('spin しても紙の path は変わらない', () => {
    const idle = build(P, idleAnim(P));
    const spun = build(P, { ...idleAnim(P), spin: 90 });
    const sheetIdle = idle.items.find((item) => item.type === 'sheet');
    const sheetSpun = spun.items.find((item) => item.type === 'sheet');
    expect(sheetIdle?.type).toBe('sheet');
    expect(sheetSpun?.type).toBe('sheet');
    if (sheetIdle?.type === 'sheet' && sheetSpun?.type === 'sheet') {
      expect(sheetSpun.fillPath).toBe(sheetIdle.fillPath);
    }
    expect(spun.ring?.rx).toBe(idle.ring?.rx);
    expect(spun.ring?.ry).toBe(idle.ring?.ry);
    expect(flap(spun, 'fr').fillPath).not.toBe(flap(idle, 'fr').fillPath);
  });
});

describe('target', () => {
  it('idle と error は IDLE', () => {
    expect(target(P, 'idle', 0)).toEqual(idleAnim(P));
    expect(target(P, 'error', 800)).toEqual(idleAnim(P));
  });

  it('hover は紙の浮遊と奥フラップ -3°', () => {
    const atRest = target(P, 'hover', 0);
    expect(atRest.sheetZ).toBe(P.sFloat);
    expect(atRest.dBack).toBe(-3);
    expect(atRest.dFront).toBe(0);

    const peak = target(P, 'hover', (Math.PI / 2) * 300);
    expect(peak.sheetZ).toBeCloseTo(P.sFloat + P.bobAmp, 10);
  });

  it('drag は沈み・受け入れ・円の着色', () => {
    expect(target(P, 'drag', 0)).toMatchObject({
      sheetZ: 0.06,
      dFront: 6,
      dBack: -8,
      ringT: 1,
      ringFill: 0,
      closed: 0,
    });
  });

  it('uploading は落下ループと破線回転', () => {
    const start = target(P, 'uploading', 0);
    expect(start.sheetZ).toBeCloseTo(P.sFloat, 10);
    expect(start.sheetOp).toBe(1);
    expect(start.ringT).toBe(1);
    expect(start.ringDash).toBe(1);
    expect(start.dashOff).toBe(0);

    const fallen = target(P, 'uploading', P.upMs * 0.7);
    expect(fallen.sheetZ).toBeCloseTo(-0.6 * P.h, 10);
    expect(fallen.sheetOp).toBe(1);

    const fade = target(P, 'uploading', P.upMs * 0.85);
    expect(fade.sheetOp).toBeCloseTo(0.5, 10);

    const mid = target(P, 'uploading', 800);
    expect(mid.dFront).toBeCloseTo(4 + 2 * Math.sin(800 / 180), 10);
    expect(mid.dBack).toBeCloseTo(-6 + 2 * Math.sin(800 / 220), 10);
    expect(mid.dashOff).toBeCloseTo((800 / 1600) % 1, 10);
  });

  it('success は一度きりのシーケンス', () => {
    const start = target(P, 'success', 0);
    expect(start.sheetZ).toBeCloseTo(P.sFloat, 10);
    expect(start.sheetOp).toBe(1);
    expect(start.closed).toBe(0);
    expect(start.lidOp).toBe(0);
    expect(start.ringFill).toBe(0);
    expect(start.ringT).toBe(1);

    const mid = target(P, 'success', 600);
    expect(mid.sheetOp).toBeCloseTo(0.2, 10);
    expect(mid.closed).toBeCloseTo(ease((0.6 - 0.35) / 0.55), 10);
    expect(mid.ringFill).toBeCloseTo(ease(0), 10);

    const done = target(P, 'success', 1200);
    expect(done.sheetZ).toBeCloseTo(-0.6 * P.h, 10);
    expect(done.sheetOp).toBe(0);
    expect(done.closed).toBe(1);
    expect(done.lidOp).toBe(1);
    expect(done.ringFill).toBe(1);
    expect(done.ringDash).toBe(0);
  });
});

describe('色トークンと viewBox', () => {
  it('紙と蓋は --emerald / --emerald-soft を使う', () => {
    const idle = build(P, idleAnim(P));
    const sheet = idle.items.find((item) => item.type === 'sheet');
    expect(sheet).toMatchObject({
      fill: 'var(--emerald-soft)',
      stroke: 'var(--emerald)',
    });

    const closed = build(P, { ...idleAnim(P), closed: 1, lidOp: 1 });
    const lid = closed.items.find((item) => item.type === 'lid');
    expect(lid).toMatchObject({
      type: 'lid',
      stroke: 'var(--emerald)',
      depth: 9,
    });
    expect(flap(closed, 'fr').fill).toContain('--emerald-soft');
  });

  it('開口部の暗さは決定値の式どおり', () => {
    const inner = build(P, idleAnim(P)).items.find((item) => item.type === 'inner');
    expect(inner).toMatchObject({
      fill: 'color-mix(in srgb, var(--well) 55%, var(--text))',
      strokeWidth: 1.2,
    });
  });

  it('idle の viewBox は正方形で有限', () => {
    const vb = viewBoxFor(P);
    expect(vb[2]).toBe(vb[3]);
    expect(vb[2]).toBeGreaterThan(0);
    expect(vb.every(Number.isFinite)).toBe(true);
  });
});

describe('lerp', () => {
  it('closed 補間の端点', () => {
    expect(lerp(0.45, 0.5, 0)).toBe(0.45);
    expect(lerp(0.45, 0.5, 1)).toBe(0.5);
  });
});

describe('effectiveMotion', () => {
  it('phase が uploading/success/error なら dragging と hover より勝つ', () => {
    expect(effectiveMotion('uploading', true, true)).toBe('uploading');
    expect(effectiveMotion('success', true, true)).toBe('success');
    expect(effectiveMotion('error', false, true)).toBe('error');
  });

  it('idle では dragging → hover → idle', () => {
    expect(effectiveMotion('idle', true, true)).toBe('drag');
    expect(effectiveMotion('idle', false, true)).toBe('hover');
    expect(effectiveMotion('idle', false, false)).toBe('idle');
  });
});

describe('stepBoxIconAnim', () => {
  const base = {
    params: P,
    nowMs: 0,
    spinStartedAt: -1e9,
    reducedMotion: false,
  } as const;

  it('収束係数はチューナーと同じ 1 - 0.001^(16/260)', () => {
    expect(ANIM_CONVERGE_K).toBe(1 - Math.pow(0.001, 16 / 260));
  });

  it('drag は指数補間する', () => {
    const cur = idleAnim(P);
    const next = stepBoxIconAnim({ ...base, cur, motion: 'drag', elapsedMs: 0 });
    expect(next.sheetZ).toBeCloseTo(lerp(P.sFloat, 0.06, ANIM_CONVERGE_K), 10);
    expect(next.dFront).toBeCloseTo(lerp(0, 6, ANIM_CONVERGE_K), 10);
    expect(next.dBack).toBeCloseTo(lerp(0, -8, ANIM_CONVERGE_K), 10);
    expect(next.ringT).toBeCloseTo(ANIM_CONVERGE_K, 10);
    expect(next.spin).toBe(0);
  });

  it('hover の sheetZ は直接代入、dBack は補間', () => {
    const t = (Math.PI / 2) * 300;
    const next = stepBoxIconAnim({
      ...base,
      cur: idleAnim(P),
      motion: 'hover',
      elapsedMs: t,
    });
    expect(next.sheetZ).toBeCloseTo(P.sFloat + P.bobAmp, 10);
    expect(next.dBack).toBeCloseTo(lerp(0, -3, ANIM_CONVERGE_K), 10);
  });

  it('uploading / success は目標値を直接代入する', () => {
    const t = 800;
    const gUp = target(P, 'uploading', t);
    const up = stepBoxIconAnim({
      ...base,
      cur: idleAnim(P),
      motion: 'uploading',
      elapsedMs: t,
    });
    expect(up.sheetZ).toBe(gUp.sheetZ);
    expect(up.sheetOp).toBe(gUp.sheetOp);
    expect(up.dFront).toBe(gUp.dFront);
    expect(up.ringDash).toBe(1);
    expect(up.dashOff).toBe(gUp.dashOff);

    const gOk = target(P, 'success', 600);
    const ok = stepBoxIconAnim({
      ...base,
      cur: idleAnim(P),
      motion: 'success',
      elapsedMs: 600,
    });
    expect(ok.closed).toBe(gOk.closed);
    expect(ok.lidOp).toBe(gOk.lidOp);
    expect(ok.sheetOp).toBe(gOk.sheetOp);
    expect(ok.ringFill).toBe(gOk.ringFill);
  });

  it('spin は easeInOut で 0→360', () => {
    const mid = stepBoxIconAnim({
      ...base,
      cur: idleAnim(P),
      motion: 'idle',
      elapsedMs: 0,
      nowMs: 450,
      spinStartedAt: 0,
    });
    expect(mid.spin).toBeCloseTo(360 * easeInOut(450 / P.spinMs), 10);
    expect(mid.spin).toBeCloseTo(180, 10);

    const done = stepBoxIconAnim({
      ...base,
      cur: idleAnim(P),
      motion: 'idle',
      elapsedMs: 0,
      nowMs: P.spinMs,
      spinStartedAt: 0,
    });
    expect(done.spin).toBe(0);
  });

  it('reduced-motion はポーズへ即時切替し spin しない', () => {
    const up = stepBoxIconAnim({
      ...base,
      cur: idleAnim(P),
      motion: 'uploading',
      elapsedMs: 800,
      nowMs: 100,
      spinStartedAt: 0,
      reducedMotion: true,
    });
    expect(up).toEqual({ ...poseForReducedMotion(P, 'uploading'), spin: 0 });
    expect(up.ringDash).toBe(0);
    expect(up.ringT).toBe(1);
    expect(up.sheetZ).toBe(P.sFloat);

    const ok = poseForReducedMotion(P, 'success');
    expect(ok.closed).toBe(1);
    expect(ok.lidOp).toBe(1);
    expect(ok.sheetOp).toBe(0);
    expect(ok.ringFill).toBe(1);
  });
});
