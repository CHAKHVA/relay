'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export function WorkspaceNav({ id, owner }: { id: string; owner: boolean }) {
  const path = usePathname();
  const items = [
    { href: `/w/${id}`, label: 'Board', exact: true },
    { href: `/w/${id}/start`, label: 'Getting started' },
    { href: `/w/${id}/recurring`, label: 'Recurring' },
    { href: `/w/${id}/team`, label: 'Team' },
    { href: `/w/${id}/digest`, label: 'Digest' },
    { href: `/w/${id}/me`, label: 'My seat' },
    ...(owner ? [{ href: `/w/${id}/settings`, label: 'Settings' }] : []),
  ];
  return (
    <nav aria-label="Workspace" className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              active ? 'border-primary font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
