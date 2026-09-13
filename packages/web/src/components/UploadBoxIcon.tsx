import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from 'react';

import {
  BOX_ICON_PARAMS,
  build,
  effectiveMotion,
  idleAnim,
  stepBoxIconAnim,
  viewBoxFor,
  type BoxIconAnim,
  type BoxIconMotion,
  type BoxIconPhase,
  type BoxIconScene,
  type SortedNode,
} from '~/lib/upload-box-icon';

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
    if (item.type === 'flap') {
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
      return;
    }
    applyPath(take(prefix, 'path'), item.d, {
      fill: 'none',
      stroke: item.stroke,
      'stroke-width': item.strokeWidth,
      opacity: item.opacity,
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
  function UploadBoxIcon({ phase, dragging, size = 96, forceHover = false, reducedMotion }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const phaseRef = useRef(phase);
    const draggingRef = useRef(dragging);
    const forceHoverRef = useRef(forceHover);
    const reducedMotionRef = useRef(reducedMotion);
    const hoverRef = useRef(false);
    const spinFnRef = useRef<(() => void) | null>(null);

    phaseRef.current = phase;
    draggingRef.current = dragging;
    forceHoverRef.current = forceHover;
    reducedMotionRef.current = reducedMotion;

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
      spinFnRef.current = triggerSpin;

      applyScene(svg, build(BOX_ICON_PARAMS, cur), pool);

      const frame = (now: number) => {
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
        cur = stepBoxIconAnim({
          cur,
          params: BOX_ICON_PARAMS,
          motion,
          elapsedMs: now - stateT0,
          nowMs: now,
          spinStartedAt: spinT0,
          reducedMotion: reduced(),
        });
        applyScene(svg, build(BOX_ICON_PARAMS, cur), pool);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(errorTimer);
        spinFnRef.current = null;
        svg.replaceChildren();
        root.removeAttribute('data-error-fx');
      };
    }, []);

    const onClick = (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      spinFnRef.current?.();
    };

    return (
      <div
        ref={rootRef}
        className="upload-box-icon"
        aria-hidden="true"
        style={{ '--upload-box-icon-size': `${size}px` } as CSSProperties}
        onPointerEnter={() => {
          hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
        }}
        onClick={onClick}
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
  },
);
