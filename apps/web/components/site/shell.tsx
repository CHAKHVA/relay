import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { StatusLine } from './status-line';

export function SiteShell({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-5">
        <Link href="/" aria-label="Relay home">
          <Logo />
        </Link>
        <nav aria-label="Site" className="ml-2 flex gap-5 text-sm text-muted">
          <Link href="/guide" className="hover:text-ink">
            Guide
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </nav>
        <div className="ml-auto">{action}</div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-sm text-muted">
          <span>Relay · same seats, more output, nothing pooled.</span>
          <StatusLine />
        </div>
      </footer>
    </div>
  );
}
