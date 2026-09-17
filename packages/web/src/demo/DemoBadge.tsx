import './demo-badge.css';

export function DemoBadge() {
  return (
    <div className="demo-badge" role="status">
      <span className="demo-badge__label">デモ</span>
      <span className="demo-badge__note">
        AWS には接続していません。データはリロードで消えます。
      </span>
    </div>
  );
}
