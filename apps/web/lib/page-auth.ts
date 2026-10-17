import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { memberCtxFor, type MemberCtx } from './access';
import { getSessionUser } from './auth';
import { HttpError } from './http';

export async function getPageUser() {
  return getSessionUser(await headers());
}

export async function requirePageUser(next = '/onboarding') {
  const u = await getPageUser();
  if (!u) redirect(`/?next=${encodeURIComponent(next)}`);
  return u;
}

/** Server components: the caller's membership or a 404 (workspace isolation). */
export async function requirePageMember(workspaceId: string): Promise<MemberCtx> {
  const user = await requirePageUser(`/w/${workspaceId}`);
  try {
    return await memberCtxFor(user, workspaceId);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}
