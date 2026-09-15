import { BOX_ICON_PARAMS, build, idleAnim, viewBoxFor } from '~/lib/upload-box-icon';
import { messages } from '~/lib/messages';

const VIEW_BOX = viewBoxFor(BOX_ICON_PARAMS).join(' ');
// 床の円の位置・大きさは UploadBoxIcon の idle 形状の ring から取り、値を重複させない
const RING = build(BOX_ICON_PARAMS, idleAnim(BOX_ICON_PARAMS)).ring;

interface LoadingShellProps {
  lead: string;
}

/**
 * JS 読み込み〜ハイドレーション〜認証確認のあいだに出す静的な画面。
 * state も effect も持たず、prerender した _shell.html にそのまま焼き込まれる
 * （弧のアニメーションは CSS だけで回る）。composer・一覧の大きさと位置は
 * 本物と揃え、中身だけプレースホルダーにする。
 */
export function LoadingShell({ lead }: LoadingShellProps) {
  return (
    <div className="page">
      <div className="upload-panel">
        <div className="composer composer--loading">
          <div className="composer-drop">
            <div className="upload-box-icon" aria-hidden>
              <svg className="loading-box-svg" viewBox={VIEW_BOX} fill="none">
                {RING ? (
                  <>
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
                  </>
                ) : null}
              </svg>
            </div>
            <p className="composer-brand">okibasho</p>
            <p className="composer-lead">{lead}</p>
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
        <ul className="page-stack">
          {[0, 1, 2].map((i) => (
            <li key={i} className="page-row page-row--skeleton">
              <div className="page-row__skeleton-bar" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
