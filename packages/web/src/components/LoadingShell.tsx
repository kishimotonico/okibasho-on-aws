import { PagesListSkeleton } from '~/components/PagesSection';
import { BOX_ICON_PARAMS, build, idleAnim, viewBoxFor } from '~/lib/upload-box-icon';
import { messages } from '~/lib/messages';

const VIEW_BOX = viewBoxFor(BOX_ICON_PARAMS).join(' ');
// BOX_ICON_PARAMS.ring は 1 固定なので ring は必ず存在する。値は idle 形状から取り重複させない
const RING = build(BOX_ICON_PARAMS, idleAnim(BOX_ICON_PARAMS)).ring!;

/** JS 読み込み〜認証確認のあいだの静的な画面。prerender で _shell.html に焼き込まれる */
export function LoadingShell() {
  return (
    <div className="page">
      <div className="upload-panel">
        <div className="composer composer--loading">
          <div className="composer-drop">
            <div className="upload-box-icon" aria-hidden>
              <svg className="loading-box-svg" viewBox={VIEW_BOX} fill="none">
                <ellipse
                  cx={RING.cx}
                  cy={RING.cy}
                  rx={RING.rx}
                  ry={RING.ry}
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth={RING.strokeWidth}
                />
                <ellipse
                  className="loading-floor-arc"
                  cx={RING.cx}
                  cy={RING.cy}
                  rx={RING.rx}
                  ry={RING.ry}
                  pathLength={100}
                  fill="none"
                />
              </svg>
            </div>
            <p className="composer-brand">okibasho</p>
            <p className="composer-lead">{messages.loadingLead}</p>
            {/* PickLinks と同じ高さの非操作プレースホルダー。無いと本物と1行分ずれる */}
            <div className="composer-pick-links" aria-hidden>
              <span className="text-link">{messages.pickFiles}</span>
              <span className="composer-pick-links__sep"> · </span>
              <span className="text-link">{messages.pickDirectory}</span>
            </div>
          </div>
          <div className="url-field">
            <div className="loading-placeholder loading-placeholder--url" />
          </div>
          <div className="toolbar-row">
            <div className="loading-placeholder loading-placeholder--chip" />
            <div className="loading-placeholder loading-placeholder--chip loading-placeholder--chip-wide" />
          </div>
        </div>
      </div>

      <section className="pages-section" aria-hidden>
        <h2>{messages.listHeading}</h2>
        <PagesListSkeleton />
      </section>
    </div>
  );
}
