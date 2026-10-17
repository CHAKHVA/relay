import type { Metadata } from 'next';
import { Logo } from '@/components/logo';
import { SignInButton } from '@/components/sign-in-button';
import { Panel } from '@/components/ui/panel';
import { getPageUser } from '@/lib/page-auth';
import { getInvite } from '@/lib/services/workspaces';
import { AcceptInvite } from './accept';

export const metadata: Metadata = { title: 'Join workspace' };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [user, inv] = await Promise.all([getPageUser(), getInvite(code)]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <Logo />
      <Panel className="p-6">
        {!inv ? (
          <>
            <h1 className="text-xl font-semibold">This invite link doesn’t exist</h1>
            <p className="mt-2 text-muted">Check the link, or ask your workspace owner for a new one.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Join {inv.workspace.name}</h1>
            <p className="mt-2 text-muted">
              You’ll get your own seat in this workspace. Your tasks run on your own Claude account; sharing with teammates stays off until you turn it on.
            </p>
            <div className="mt-5">
              {!inv.usable ? (
                <p className="text-sm text-danger">This invite has expired or was already used. Ask the owner for a new link.</p>
              ) : user ? (
                <AcceptInvite code={code} />
              ) : (
                <SignInButton next={`/invite/${code}`} />
              )}
            </div>
          </>
        )}
      </Panel>
    </main>
  );
}
