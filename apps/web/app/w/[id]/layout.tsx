import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeaderTools } from '@/components/app/header-tools';
import { WorkspaceNav } from '@/components/app/nav';
import { Logo } from '@/components/logo';
import { requirePageMember } from '@/lib/page-auth';

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace, member } = await requirePageMember(id);
  const repo = workspace.repoOwner && workspace.repoName ? `${workspace.repoOwner}/${workspace.repoName}` : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-5 pt-3">
          <Link href="/onboarding" aria-label="All workspaces">
            <Logo />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{workspace.name}</div>
            <div className="truncate text-xs text-muted">{repo ?? 'No repository connected'}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <HeaderTools workspaceId={id} />
          </div>
        </div>
        <div className="mx-auto max-w-[1500px] px-3 pt-2">
          <WorkspaceNav id={id} owner={member.role === 'owner'} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1500px] flex-1 px-5 py-6">{children}</div>
    </div>
  );
}
