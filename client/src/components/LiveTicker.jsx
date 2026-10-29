import { formatMagnitude, formatTimeAgo } from '../lib/geo.js';

export default function LiveTicker({ events }) {
  const items = (events || []).slice(0, 20);
  const doubled = items.length ? [...items, ...items] : [];
  return (
    <div className="ticker" aria-label="Recent live events">
      {items.length === 0 ? (
        <div className="ticker-empty">Waiting for live events…</div>
      ) : (
        <div className="ticker-track">
          {doubled.map((f, i) => {
            const p = f.properties || {};
            return (
              <span key={`${p.id || i}-${i}`} className="ticker-item">
                {formatMagnitude(p.mag)} · {formatTimeAgo(p.time)} ago · near {p.place || 'unknown'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
