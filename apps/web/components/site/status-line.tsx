'use client';

import { useEffect, useState } from 'react';

/** Footer status line backed by /api/health (SPEC §21.5). */
export function StatusLine() {
  const [state, setState] = useState<'checking' | 'ok' | 'degraded'>('checking');
  useEffect(() => {
    let alive = true;
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => alive && setState(r.ok ? 'ok' : 'degraded'))
      .catch(() => alive && setState('degraded'));
    return () => {
      alive = false;
    };
  }, []);
  const text = state === 'ok' ? 'All systems normal' : state === 'degraded' ? 'Degraded: some features may be unavailable' : 'Checking status…';
  return (
    <span role="status" className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2 rounded-full ${state === 'ok' ? 'bg-run' : state === 'degraded' ? 'bg-dusk' : 'bg-faint'}`} />
      {text}
    </span>
  );
}
