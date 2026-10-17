/** 24-hour view of three seats: usage windows, and a task changing hands. Decorative (described in text). */
export function HeroArt() {
  const hours = [0, 4, 8, 12, 16, 20, 24];
  const X = (h: number) => 96 + (h / 24) * 536;
  const rows = [
    { name: 'Ana', note: '96% used', y: 70, band: [[19, 24], [0, 8]], used: 96, tone: 'dusk' as const },
    { name: 'Luka', note: '40% used', y: 140, band: [[20, 24], [0, 9]], used: 40, tone: 'primary' as const },
    { name: 'You', note: 'idle', y: 210, band: [[19, 24], [0, 8]], used: 12, tone: 'primary' as const },
  ];
  return (
    <figure className="w-full" aria-label="Illustration: Ana's seat is at its limit, so her task runs on your idle seat overnight.">
      <svg viewBox="0 0 640 300" className="h-auto w-full" role="img" aria-hidden="true">
        {hours.map((h) => (
          <g key={h}>
            <line x1={X(h)} y1="36" x2={X(h)} y2="252" stroke="var(--line)" strokeDasharray="2 5" />
            <text x={X(h)} y="270" textAnchor="middle" fontSize="12" fill="var(--faint)" fontFamily="var(--font-mono)">
              {String(h % 24).padStart(2, '0')}:00
            </text>
          </g>
        ))}
        {rows.map((r) => (
          <g key={r.name}>
            <text x="0" y={r.y - 2} fontSize="17" fontWeight="700" fill="var(--ink)">
              {r.name}
            </text>
            <text x="0" y={r.y + 16} fontSize="13" fill="var(--muted)">
              {r.note}
            </text>
            <rect x="96" y={r.y - 18} width="536" height="36" rx="8" fill="var(--surface-2)" stroke="var(--line)" />
            {r.band.map(([a, b], i) => (
              <rect key={i} x={X(a!)} y={r.y - 18} width={X(b!) - X(a!)} height="36" rx="8" fill="var(--night-band)" opacity="0.88" />
            ))}
            <rect x={96} y={r.y + 22} width={(r.used / 100) * 536} height="4" rx="2" fill={r.used > 90 ? 'var(--dusk)' : 'var(--run)'} />
          </g>
        ))}
        {/* the baton: Ana's task hops to the idle seat */}
        <path d={`M ${X(21)} 88 C ${X(21) + 40} 120, ${X(21) + 40} 160, ${X(22)} 196`} fill="none" stroke="var(--dusk)" strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />
        <rect x={X(21) - 48} y="49" width="96" height="26" rx="13" fill="var(--dusk)" />
        <text x={X(21)} y="67" textAnchor="middle" fontSize="13" fontWeight="700" fill="#2a1d00">
          task r7f3a
        </text>
        <rect x={X(22) - 50} y="195" width="100" height="26" rx="13" fill="var(--run)" />
        <text x={X(22)} y="212" textAnchor="middle" fontSize="13" fontWeight="700" fill="#04211c">
          runs here
        </text>
      </svg>
      <figcaption className="sr-only">Night-shift run windows for three teammates over 24 hours. Ana is at 96% of her limit, so her task is handed to your idle seat.</figcaption>
    </figure>
  );
}
