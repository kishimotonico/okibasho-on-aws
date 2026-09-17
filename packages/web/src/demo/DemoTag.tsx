import { useState } from 'react';

import './demo-tag.css';

/** 画面上端からひもで下がる荷札。押すと上へ引っ込み、リロードするまで出ない */
export function DemoTag() {
  const [hidden, setHidden] = useState(false);

  return (
    <button
      type="button"
      className={`demo-tag${hidden ? ' demo-tag--hidden' : ''}`}
      aria-label="デモ表示を隠す"
      onClick={() => setHidden(true)}
    >
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <g transform="rotate(-6 40 30)">
          <path className="demo-tag__paper" d="M28 20H52L64 32V74H16V32Z" />
          <circle className="demo-tag__hole" cx="40" cy="30" r="3" />
          <text className="demo-tag__label" x="40" y="59">
            DEMO
          </text>
        </g>
        <path className="demo-tag__string" d="M40 0V30" />
      </svg>
    </button>
  );
}
