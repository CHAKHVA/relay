/** Relay wordmark: two offset bars — a baton changing hands. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="5" width="11" height="4.5" rx="2.25" fill="var(--primary)" />
        <rect x="9" y="12.5" width="11" height="4.5" rx="2.25" fill="var(--dusk)" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight">Relay</span>
    </span>
  );
}
