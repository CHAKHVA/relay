/** 5-hour usage ring with a tick at the reserve threshold. */
export function UsageRing({ used, reserve, size = 56, label }: { used: number | null; reserve: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = used == null ? 0 : Math.max(0, Math.min(100, used));
  const limit = 100 - reserve;
  const over = pct >= limit;
  const angle = (limit / 100) * 2 * Math.PI - Math.PI / 2;
  const tick = { x1: size / 2 + (r - 5) * Math.cos(angle), y1: size / 2 + (r - 5) * Math.sin(angle), x2: size / 2 + (r + 5) * Math.cos(angle), y2: size / 2 + (r + 5) * Math.sin(angle) };
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? (used == null ? 'Usage unknown' : `${Math.round(pct)}% of the 5-hour limit used, reserve ${reserve}%`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        {used != null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={over ? 'var(--dusk)' : 'var(--run)'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
          />
        ) : null}
      </svg>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-0" aria-hidden="true">
        <line {...tick} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" transform={`rotate(90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums">{used == null ? '—' : `${Math.round(pct)}%`}</span>
    </div>
  );
}
