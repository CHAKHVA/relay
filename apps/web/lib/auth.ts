import { betterAuth } from 'better-auth';
import { authOptions } from './auth-options';

function create() {
  return betterAuth(authOptions());
}
type Auth = ReturnType<typeof create>;
const g = globalThis as unknown as { __relayAuth?: Auth };

export function auth(): Auth {
  if (!g.__relayAuth) g.__relayAuth = create();
  return g.__relayAuth;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  githubLogin?: string | null;
}

export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const s = await auth().api.getSession({ headers });
  if (!s) return null;
  const u = s.user as typeof s.user & { githubLogin?: string | null };
  return { id: u.id, name: u.name, email: u.email, image: u.image ?? null, githubLogin: u.githubLogin ?? null };
}
