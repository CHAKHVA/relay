import { z } from 'zod';
import { testLoginEnabled } from '@/lib/test-login';

const bodySchema = z.object({
  githubLogin: z.string().regex(/^[A-Za-z0-9-]{1,39}$/),
  name: z.string().min(1).max(100).optional(),
});

/** POST /api/test/login — local/CI only; 404 everywhere else. */
export async function POST(req: Request) {
  if (!testLoginEnabled()) return new Response('Not found', { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 });
  const { loginTestUser } = await import('@/lib/test-auth');
  const { cookies, user } = await loginTestUser(parsed.data.githubLogin, parsed.data.name);
  const res = Response.json({ userId: user.id });
  for (const c of cookies) {
    res.headers.append('Set-Cookie', `${c.name}=${c.value}; Path=${c.path}; HttpOnly; SameSite=${c.sameSite}${c.secure ? '; Secure' : ''}`);
  }
  return res;
}
