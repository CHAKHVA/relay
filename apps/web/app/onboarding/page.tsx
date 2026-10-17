import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Panel } from '@/components/ui/panel';
import { requirePageUser } from '@/lib/page-auth';
import { listMyWorkspaces } from '@/lib/services/workspaces';
import { OnboardingForms } from './forms';

export const metadata: Metadata = { title: 'Get started' };

export default async function OnboardingPage() {
  const user = await requirePageUser();
  const mine = await listMyWorkspaces(user.id);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <Link href="/" aria-label="Relay home">
        <Logo />
      </Link>
      <div>
        <h1 className="text-3xl font-semibold">Welcome, {user.name.split(' ')[0]}</h1>
        <p className="mt-2 text-muted">A workspace is one team and one GitHub repository. Create one, or join your team with an invite link.</p>
      </div>
      {mine.length ? (
        <Panel className="p-4">
          <h2 className="text-base font-semibold">Your workspaces</h2>
          <ul className="mt-2 divide-y divide-line">
            {mine.map(({ workspace, member }) => (
              <li key={workspace.id} className="flex items-center justify-between py-2">
                <Link href={`/w/${workspace.id}`} className="font-medium text-primary hover:underline">
                  {workspace.name}
                </Link>
                <span className="text-sm text-muted">{member.role === 'owner' ? 'Owner' : 'Member'}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <OnboardingForms />
    </main>
  );
}
