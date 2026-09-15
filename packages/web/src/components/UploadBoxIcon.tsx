import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { Tooltip } from '~/components/Tooltip';
import {
  BOX_ICON_PARAMS,
  build,
  boxIconAnimNeedsFrames,
  easeInOut,
  effectiveMotion,
  idleAnim,
  openingTarget,
  stepBoxIconAnim,
  viewBoxFor,
  type BoxIconAnim,
  type BoxIconMotion,
  type BoxIconPhase,
  type BoxIconScene,
  type SortedNode,
} from '~/lib/upload-box-icon';
import { messages } from '~/lib/messages';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_BOX = viewBoxFor(BOX_ICON_PARAMS);
const ERROR_FX_MS = 400;

export type UploadBoxIconHandle = {
  spin: () => void;
};

export type UploadBoxIconProps = {
  phase: BoxIconPhase;
  dragging: boolean;
  size?: number;
  /** ハーネス用。未指定なら pointerenter/leave。 */
  forceHover?: boolean;
  /** ハーネス用。未指定なら prefers-reduced-motion。 */
  reducedMotion?: boolean;
  /** spin のあと（uploading 以外）に呼ぶ。ファイル選択ダイアログ用。 */
  onActivate?: () => void;
  /**
   * success 状態の箱をクリック（または Enter/Space）したときの「開く」演出が
   * 終わったら呼ぶ。呼び出し側はここでフォームを初期状態に戻す。
   * reduced-motion では演出をせず即時に呼ぶ。
   */
  onOpened?: () => void;
};

type Pool = Map<string, SVGElement>;

function svgEl<K extends keyof SVGElementTagNameMap>(
  pool: Pool,
  parent: SVGSVGElement,
  id: string,
  tag: K,
): SVGElementTagNameMap[K] {
  const existing = pool.get(id);
  if (existing && existing.namespaceURI === SVG_NS && existing.tagName.toLowerCase() === tag) {
    parent.appendChild(existing);
    return existing as SVGElementTagNameMap[K];
  }
  existing?.remove();
  const node = document.createElementNS(SVG_NS, tag);
  node.setAttribute('data-nid', id);
  pool.set(id, node);
  parent.appendChild(node);
  return node;
}

function applyPath(
  el: SVGPathElement,
  d: string,
  attrs: Record<string, string | number | null>,
): void {
  el.setAttribute('d', d);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null) {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, String(value));
    }
  }
}

function itemPrefix(item: SortedNode, index: number): string {
  if (item.type === 'face' || item.type === 'flap') {
    return `${item.type}-${item.key}`;
  }
  return `${item.type}-${index}`;
}

function applyScene(svg: SVGSVGElement, scene: BoxIconScene, pool: Pool): void {
  svg.setAttribute('stroke-linejoin', scene.join);
  const used = new Set<string>();
  const take = <K extends keyof SVGElementTagNameMap>(id: string, tag: K) => {
    used.add(id);
    return svgEl(pool, svg, id, tag);
  };

  if (scene.ring) {
    const ring = take('ring', 'ellipse');
    ring.setAttribute('data-role', 'ring');
    ring.setAttribute('cx', String(scene.ring.cx));
    ring.setAttribute('cy', String(scene.ring.cy));
    ring.setAttribute('rx', String(scene.ring.rx));
    ring.setAttribute('ry', String(scene.ring.ry));
    ring.setAttribute('fill', scene.ring.fill);
    if (scene.ring.fill === 'none') {
      ring.removeAttribute('fill-opacity');
    } else {
      ring.setAttribute('fill-opacity', String(scene.ring.fillOpacity));
    }
    ring.setAttribute('stroke', scene.ring.stroke);
    ring.setAttribute('stroke-width', String(scene.ring.strokeWidth));
    if (scene.ring.dasharray) {
      ring.setAttribute('stroke-dasharray', scene.ring.dasharray);
      ring.setAttribute('stroke-dashoffset', String(scene.ring.dashoffset ?? 0));
    } else {
      ring.removeAttribute('stroke-dasharray');
      ring.removeAttribute('stroke-dashoffset');
    }
  }

  scene.items.forEach((item, index) => {
    const prefix = itemPrefix(item, index);
    if (item.type === 'face') {
      applyPath(take(`${prefix}-fill`, 'path'), item.fillPath, {
        fill: item.fill,
        stroke: 'none',
      });
      item.edges.forEach((edge, ei) => {
        applyPath(take(`${prefix}-e${ei}`, 'path'), edge.d, {
          fill: 'none',
          'stroke-width': edge.strokeWidth,
          'data-role': 'outline',
        });
      });
      return;
    }
    if (item.type === 'inner') {
      applyPath(take(prefix, 'path'), item.d, {
        fill: item.fill,
        'stroke-width': item.strokeWidth,
      });
      return;
    }
    if (item.type === 'sheet') {
      applyPath(take(`${prefix}-fill`, 'path'), item.fillPath, {
        fill: item.fill,
        stroke: item.stroke,
        'stroke-width': item.strokeWidth,
        opacity: item.opacity,
      });
      if (item.linesPath) {
        applyPath(take(`${prefix}-lines`, 'path'), item.linesPath, {
          fill: 'none',
          stroke: item.stroke,
          'stroke-width': item.linesStrokeWidth,
          opacity: item.opacity,
        });
      }
      return;
    }
    applyPath(take(`${prefix}-fill`, 'path'), item.fillPath, {
      fill: item.fill,
      stroke: 'none',
    });
    item.edges.forEach((edge, ei) => {
      applyPath(take(`${prefix}-e${ei}`, 'path'), edge.d, {
        fill: 'none',
        'stroke-width': edge.strokeWidth,
        'data-role': ei === 3 ? null : 'outline',
      });
    });
  });

  for (const [id, node] of pool) {
    if (!used.has(id)) {
      node.remove();
      pool.delete(id);
    }
  }
}

export const UploadBoxIcon = forwardRef<UploadBoxIconHandle, UploadBoxIconProps>(
  function UploadBoxIcon(
    { phase, dragging, size = 96, forceHover = false, reducedMotion, onActivate, onOpened },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const phaseRef = useRef(phase);
    const draggingRef = useRef(dragging);
    const forceHoverRef = useRef(forceHover);
    const reducedMotionRef = useRef(reducedMotion);
    const onOpenedRef = useRef(onOpened);
    const hoverRef = useRef(false);
    const spinFnRef = useRef<(() => void) | null>(null);
    const openFnRef = useRef<(() => void) | null>(null);
    const kickRef = useRef<() => void>(() => {});

    phaseRef.current = phase;
    draggingRef.current = dragging;
    forceHoverRef.current = forceHover;
    reducedMotionRef.current = reducedMotion;
    onOpenedRef.current = onOpened;

    useImperativeHandle(
      ref,
      () => ({
        spin: () => {
          spinFnRef.current?.();
        },
      }),
      [],
    );

    useEffect(() => {
      const svg = svgRef.current;
      const root = rootRef.current;
      if (!svg || !root) {
        return;
      }

      svg.replaceChildren();
      const pool: Pool = new Map();
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      let cur: BoxIconAnim = idleAnim(BOX_ICON_PARAMS);
      let motion: BoxIconMotion = 'idle';
      let stateT0 = performance.now();
      let spinT0 = -1e9;
      /** success から開く演出の開始時刻。null なら演出中でない。 */
      let openingT0: number | null = null;
      let raf = 0;
      let errorTimer = 0;

      const reduced = () => reducedMotionRef.current ?? mq.matches;
      const hovering = () => forceHoverRef.current || hoverRef.current;

      const triggerSpin = () => {
        const next = effectiveMotion(phaseRef.current, draggingRef.current, hovering());
        if (reduced() || (next !== 'idle' && next !== 'hover')) {
          return;
        }
        spinT0 = performance.now();
      };
      /**
       * success の箱をクリック/Enter・Space したときの「開く」演出。openingTarget() で
       * success のシーケンスを反転させつつ、spin は通常のクリック回転と同じ easeInOut を走らせる。
       * reduced-motion では回転・演出なしで即時に idle へ戻し onOpened を呼ぶ。
       */
      const startOpening = () => {
        if (openingT0 !== null) {
          // 開くアニメーション中の二度押しは無視する
          return;
        }
        const now = performance.now();
        if (reduced()) {
          cur = idleAnim(BOX_ICON_PARAMS);
          motion = 'idle';
          stateT0 = now;
          applyScene(svg, build(BOX_ICON_PARAMS, cur), pool);
          onOpenedRef.current?.();
          return;
        }
        openingT0 = now;
        spinT0 = now;
        ensureRunning();
      };
      const frame = (now: number) => {
        raf = 0;
        if (openingT0 !== null) {
          const u = (now - openingT0) / BOX_ICON_PARAMS.spinMs;
          if (u >= 1) {
            openingT0 = null;
            cur = idleAnim(BOX_ICON_PARAMS);
            motion = 'idle';
            stateT0 = now;
            applyScene(svg, build(BOX_ICON_PARAMS, cur), pool);
            onOpenedRef.current?.();
            return;
          }
          const su = (now - spinT0) / BOX_ICON_PARAMS.spinMs;
          cur = {
            ...openingTarget(BOX_ICON_PARAMS, u),
            spin: su < 1 ? 360 * easeInOut(su) : 0,
          };
          applyScene(svg, build(BOX_ICON_PARAMS, cur), pool);
          raf = requestAnimationFrame(frame);
          return;
        }
        const nextMotion = effectiveMotion(phaseRef.current, draggingRef.current, hovering());
        if (nextMotion !== motion) {
          motion = nextMotion;
          stateT0 = now;
          if (motion === 'error') {
            root.setAttribute('data-error-fx', reduced() ? 'flash' : 'shake');
            window.clearTimeout(errorTimer);
            errorTimer = window.setTimeout(() => {
              root.removeAttribute('data-error-fx');
            }, ERROR_FX_MS);
          }
        }
        const input = {
          cur,
          params: BOX_ICON_PARAMS,
          motion,
          elapsedMs: now - stateT0,
          nowMs: now,
          spinStartedAt: spinT0,
          reducedMotion: reduced(),
          hovering: hovering(),
        };
        cur = stepBoxIconAnim(input);
        applyScene(svg, build(BOX_ICON_PARAMS, cur), pool);
        if (boxIconAnimNeedsFrames({ ...input, cur })) {
          raf = requestAnimationFrame(frame);
        }
      };

      const ensureRunning = () => {
        if (raf) {
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      spinFnRef.current = () => {
        triggerSpin();
        ensureRunning();
      };
      openFnRef.current = startOpening;
      kickRef.current = ensureRunning;

      applyScene(svg, build(BOX_ICON_PARAMS, cur), pool);
      ensureRunning();

      const onMotionPref = () => {
        ensureRunning();
      };
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          ensureRunning();
        }
      };
      mq.addEventListener('change', onMotionPref);
      document.addEventListener('visibilitychange', onVisibility);

      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(errorTimer);
        mq.removeEventListener('change', onMotionPref);
        document.removeEventListener('visibilitychange', onVisibility);
        spinFnRef.current = null;
        openFnRef.current = null;
        kickRef.current = () => {};
        svg.replaceChildren();
        root.removeAttribute('data-error-fx');
      };
    }, []);

    useEffect(() => {
      kickRef.current();
    }, [phase, dragging, forceHover, reducedMotion]);

    // success 状態の箱は「次のファイルを置く」の操作。uploading 中はクリック無効
    const openable = phase === 'success';

    const onClick = (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (phaseRef.current === 'success') {
        openFnRef.current?.();
        return;
      }
      spinFnRef.current?.();
      if (phaseRef.current !== 'uploading') {
        onActivate?.();
      }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (phaseRef.current !== 'success') {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        openFnRef.current?.();
      }
    };

    const box = (
      <div
        ref={rootRef}
        className={`upload-box-icon${openable ? ' upload-box-icon--openable' : ''}`}
        aria-hidden={openable ? undefined : true}
        role={openable ? 'button' : undefined}
        aria-label={openable ? messages.uploadAnother : undefined}
        tabIndex={openable ? 0 : undefined}
        style={{ '--upload-box-icon-size': `${size}px` } as CSSProperties}
        onPointerEnter={() => {
          hoverRef.current = true;
          kickRef.current();
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
          kickRef.current();
        }}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <svg
          ref={svgRef}
          viewBox={VIEW_BOX.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        />
      </div>
    );

    // openable に応じて Tooltip の有無を切り替えると div が再マウントされ、effect の
    // rAF ループが外れた古い svg を描き続けてしまう。木構造は固定し、open だけで表示を切り替える。
    return (
      <Tooltip label={messages.uploadAnother} open={openable ? undefined : false}>
        {box}
      </Tooltip>
    );
  },
);
