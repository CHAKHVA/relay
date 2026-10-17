import { log } from '../http';

/** Placeholder until M5: the scheduler tick. */
export async function runTick(_workspaceId: string): Promise<void> {}

/** Run a tick, never throwing (used after webhooks and task creation). */
export async function runTickSafe(workspaceId: string): Promise<void> {
  try {
    await runTick(workspaceId);
  } catch (e) {
    log('error', 'tick failed', { workspaceId, error: (e as Error).message });
  }
}
