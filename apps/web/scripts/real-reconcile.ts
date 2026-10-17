// Reconcile (never plans or fires) the "M13 real fires" workspace until its running tasks finish.
import { config } from 'dotenv';
import { eq, inArray } from 'drizzle-orm';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '..', '.env.test'), quiet: true });
const { db, schema, pool } = await import('../lib/db');
const { reconcileWorkspace } = await import('../lib/engine/results');

const [ws] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.name, 'M13 real fires'));
const deadline = Date.now() + 35 * 60_000;
while (Date.now() < deadline) {
  await reconcileWorkspace((await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, ws!.id)))[0]!, new Date());
  const running = await db().select().from(schema.tasks).where(inArray(schema.tasks.status, ['dispatched', 'triaging']));
  const all = await db().select().from(schema.tasks).where(eq(schema.tasks.workspaceId, ws!.id));
  console.log(new Date().toISOString().slice(11, 19), all.map((t) => `${t.id}:${t.status}`).join(' '));
  if (!running.length) break;
  await new Promise((r) => setTimeout(r, 30_000));
}
for (const t of await db().select().from(schema.tasks).where(eq(schema.tasks.workspaceId, ws!.id))) {
  console.log(t.id, t.type, t.status, t.title, '| session', t.sessionUrl, '| pr', t.resultPrUrl, '| comment', t.resultCommentUrl);
}
await pool().end();
