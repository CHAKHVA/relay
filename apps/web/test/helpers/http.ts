import { loginTestUser } from '@/lib/test-auth';

export type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

export interface TestUser {
  id: string;
  login: string;
  cookie: string;
}

export async function login(githubLogin: string, name?: string): Promise<TestUser> {
  const { user, headers } = await loginTestUser(githubLogin, name);
  return { id: user.id, login: githubLogin, cookie: headers.get('cookie') ?? '' };
}

export async function call<P = Record<string, string>>(
  handler: Handler<P>,
  opts: { method?: string; path?: string; body?: unknown; as?: TestUser | null; params?: P; headers?: Record<string, string> } = {},
) {
  const headers = new Headers(opts.headers);
  if (opts.as) headers.set('cookie', opts.as.cookie);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  const req = new Request(`http://localhost:3000${opts.path ?? '/'}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve((opts.params ?? {}) as P) });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test convenience: response bodies are asserted ad hoc
  return { status: res.status, data: data as any, headers: res.headers };
}
