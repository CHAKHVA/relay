import { handleWebhook } from '@/lib/engine/webhook';
import { webhooks } from '@/lib/github/app';
import { log, requestId } from '@/lib/http';

export const maxDuration = 60;

/** POST /api/github/webhook — signature-verified GitHub App webhooks. */
export async function POST(req: Request) {
  const rid = requestId(req);
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const event = req.headers.get('x-github-event') ?? '';
  const delivery = req.headers.get('x-github-delivery') ?? '';
  const raw = await req.text();
  if (!signature || !(await webhooks().verify(raw, signature).catch(() => false))) {
    return Response.json({ error: 'Invalid signature', requestId: rid }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON', requestId: rid }, { status: 400 });
  }
  try {
    const result = await handleWebhook(event, payload);
    log('info', 'webhook', { requestId: rid, event, delivery, handled: result.handled, detail: result.detail });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    log('error', 'webhook failed', { requestId: rid, event, delivery, error: (e as Error).message });
    return Response.json({ error: 'Webhook handling failed', requestId: rid }, { status: 500 });
  }
}
