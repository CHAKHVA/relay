import { z } from 'zod';
import { COMMENT_MARKDOWN_MAX } from './config';
import { SIZES, TASK_TYPES } from './types';

export const triageResultSchema = z.object({
  type: z.enum(TASK_TYPES),
  likelyFiles: z.array(z.string()).default([]),
  doneCheck: z.string().nullish().transform((v) => v || null),
  size: z.enum(SIZES).nullish().transform((v) => v ?? null),
  title: z.string().nullish().transform((v) => v?.trim() || null),
});

export const relayResultSchema = z.object({
  taskId: z.string().min(1),
  jobKind: z.enum(['triage', 'work']),
  type: z.enum(TASK_TYPES),
  summary: z.string().default(''),
  outputMode: z.enum(['pr', 'comment', 'none']),
  commentMarkdown: z.string().nullish().transform((v) => v ?? ''),
  filesChanged: z.array(z.string()).nullish().transform((v) => v ?? []),
  checkCommand: z.string().nullish().transform((v) => v ?? ''),
  checkPassed: z.boolean().nullish().transform((v) => v ?? null),
  triage: triageResultSchema.nullish().transform((v) => v ?? null),
  notes: z.string().nullish().transform((v) => v ?? ''),
});
export type RelayResult = z.infer<typeof relayResultSchema>;
export type TriageResult = z.infer<typeof triageResultSchema>;

export const TRUNCATION_NOTE = '\n\n_…truncated by Relay (result exceeded 60,000 characters)._';

export type ParseResultOutcome = { ok: true; result: RelayResult } | { ok: false; error: string };

/** Validate a routine result (SPEC §10.7). Accepts parsed JSON or a JSON string. */
export function parseResult(input: unknown): ParseResultOutcome {
  let json = input;
  if (typeof input === 'string') {
    try {
      json = JSON.parse(input);
    } catch {
      return { ok: false, error: 'Result file is not valid JSON' };
    }
  }
  const parsed = relayResultSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Invalid result: ${first?.path.join('.') || '(root)'} ${first?.message ?? ''}`.trim() };
  }
  const result = parsed.data;
  if (result.commentMarkdown.length > COMMENT_MARKDOWN_MAX) {
    result.commentMarkdown = result.commentMarkdown.slice(0, COMMENT_MARKDOWN_MAX - TRUNCATION_NOTE.length) + TRUNCATION_NOTE;
  }
  return { ok: true, result };
}

export function resultPath(taskId: string): string {
  return `.relay/results/${taskId}.json`;
}
