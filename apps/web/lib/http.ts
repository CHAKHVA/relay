import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, code, message);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in required');
export const forbidden = (message = 'Only the workspace owner can do that') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
export const tooMany = (message: string) => new HttpError(429, 'rate_limited', message);

export function requestId(req: Request): string {
  return req.headers.get('x-request-id') ?? randomUUID();
}

type Level = 'info' | 'warn' | 'error';
/** Structured server log. Never pass tokens or full result bodies. */
export function log(level: Level, msg: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, msg, ...data, ts: new Date().toISOString() });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.NODE_ENV !== 'test') console.log(line);
}

export type RouteCtx<P> = { params: Promise<P> };

/** Wrap a route handler: maps HttpError to JSON, adds a request id to every error. */
export function route<P = Record<string, string>>(fn: (req: Request, params: P, rid: string) => Promise<Response>) {
  return async (req: Request, ctx: RouteCtx<P>): Promise<Response> => {
    const rid = requestId(req);
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const res = await fn(req, params, rid);
      res.headers.set('x-request-id', rid);
      return res;
    } catch (e) {
      if (e instanceof HttpError) {
        return Response.json({ error: e.message, code: e.code, requestId: rid }, { status: e.status, headers: { 'x-request-id': rid } });
      }
      log('error', 'unhandled route error', { requestId: rid, path: new URL(req.url).pathname, error: e instanceof Error ? e.message : String(e) });
      return Response.json(
        { error: 'Something went wrong. Please try again.', code: 'internal', requestId: rid },
        { status: 500, headers: { 'x-request-id': rid } },
      );
    }
  };
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const raw = await req.json().catch(() => {
    throw badRequest('Request body must be JSON');
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw badRequest(`Invalid ${i?.path.join('.') || 'body'}: ${i?.message ?? 'invalid'}`, 'validation');
  }
  return parsed.data;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}
