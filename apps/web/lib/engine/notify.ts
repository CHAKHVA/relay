import type { NotificationKind } from '../db/schema';
import { db, schema } from '../db';
import { newId } from '../ids';

/** Create a notification; a repeated `dedupeKey` for the same member is ignored (idempotent). */
export async function notify(n: { memberId: string; kind: NotificationKind; title: string; body?: string; url?: string | null; dedupeKey?: string | null }) {
  await db()
    .insert(schema.notifications)
    .values({ id: newId(), memberId: n.memberId, kind: n.kind, title: n.title, body: n.body ?? '', url: n.url ?? null, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing();
}
