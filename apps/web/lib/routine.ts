import { z } from 'zod';
import { decrypt } from './crypto';
import { newId } from './ids';

/** The only place Relay talks to Anthropic (SPEC §6.1). The endpoint is a research preview. */
export const ROUTINE_BETA_HEADER = 'experimental-cc-routine-2026-04-01';
export const ANTHROPIC_VERSION = '2023-06-01';
export const FIRE_TIMEOUT_MS = 20_000;

const FIRE_URL_RE = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/(trig_[A-Za-z0-9]+)\/fire$/;

export const routineCredentialsSchema = z.object({
  fireUrl: z.string().trim().regex(FIRE_URL_RE, 'Expected https://api.anthropic.com/v1/claude_code/routines/trig_…/fire'),
  token: z
    .string()
    .trim()
    .min(10)
    .max(500)
    .regex(/^\S+$/, 'The token must not contain spaces'),
});

/** "trig_…XYZ" for display; never the secret. */
export function routineHint(fireUrl: string): string {
  const id = FIRE_URL_RE.exec(fireUrl)?.[1] ?? 'trig_';
  return `trig_…${id.slice(-3)}`;
}

const fireResponse = z.object({
  claude_code_session_id: z.string().optional(),
  claude_code_session_url: z.string().url(),
});

export interface FireInput {
  /** Encrypted credentials as stored on the member row. */
  fireUrlEnc: string;
  tokenEnc: string;
  text: string;
  dryRun: boolean;
}
export interface FireResult {
  sessionUrl: string;
  sessionId: string | null;
  dryRun: boolean;
}

export class FireError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Fire a member's routine. In dry run no network call is made (SPEC §11.5). */
export async function fire(input: FireInput): Promise<FireResult> {
  if (input.dryRun) {
    const id = newId().slice(0, 12);
    return { sessionUrl: `https://claude.ai/code/session_dryrun_${id}`, sessionId: `session_dryrun_${id}`, dryRun: true };
  }
  const url = decrypt(input.fireUrlEnc);
  const token = decrypt(input.tokenEnc);
  if (!FIRE_URL_RE.test(url)) throw new FireError('Stored routine URL is invalid');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-beta': ROUTINE_BETA_HEADER,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: input.text }),
      signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
    });
  } catch (e) {
    throw new FireError(`Routine request failed: ${(e as Error).name === 'TimeoutError' ? 'timed out' : 'network error'}`);
  }
  if (!res.ok) throw new FireError(`Routine API returned ${res.status}`, res.status);
  const parsed = fireResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new FireError('Unexpected response from the routine API');
  return { sessionUrl: parsed.data.claude_code_session_url, sessionId: parsed.data.claude_code_session_id ?? null, dryRun: false };
}
