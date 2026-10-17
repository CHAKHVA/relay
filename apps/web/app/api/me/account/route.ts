import { requireUser } from '@/lib/access';
import { json, route } from '@/lib/http';
import { deleteAccount } from '@/lib/services/deletion';

/** DELETE /api/me/account — removes my user, memberships, usage tokens and routine credentials. */
export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  await deleteAccount(user);
  const res = json({ ok: true });
  // Clear the (now invalid) session cookies.
  for (const name of ['better-auth.session_token', '__Secure-better-auth.session_token']) res.headers.append('set-cookie', `${name}=; Path=/; Max-Age=0`);
  return res;
});
