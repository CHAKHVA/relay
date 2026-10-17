import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { Priority, Size, TaskType } from './types';
import { SIZES, TASK_TYPES } from './types';

/** Labels Relay uses (SPEC §8.1); created on install. */
export const RELAY_LABELS = [
  { name: 'relay', color: '5b5bd6', description: 'Relay task' },
  { name: 'relay:type/code', color: '0e8a16', description: 'Relay: code task' },
  { name: 'relay:type/review', color: '1d76db', description: 'Relay: review/audit task' },
  { name: 'relay:type/docs', color: 'c5def5', description: 'Relay: docs/report task' },
  { name: 'relay:type/business', color: 'fbca04', description: 'Relay: business task' },
  { name: 'relay:high', color: 'd93f0b', description: 'Relay: high priority' },
  { name: 'relay:low', color: 'bfdadc', description: 'Relay: low priority' },
  { name: 'relay:recurring', color: 'ededed', description: 'Created by a Relay recurring template' },
  { name: 'relay-digest', color: 'f9d0c4', description: 'Relay member digest (not a task)' },
] as const;

export const RELAY_LABEL = 'relay';
export const DIGEST_LABEL = 'relay-digest';

export const typeLabel = (t: TaskType) => `relay:type/${t}`;

export function typeFromLabels(labels: string[]): TaskType | null {
  for (const t of TASK_TYPES) if (labels.includes(typeLabel(t))) return t;
  return null;
}

export function priorityFromLabels(labels: string[]): Priority {
  if (labels.includes('relay:high')) return 'high';
  if (labels.includes('relay:low')) return 'low';
  return 'normal';
}

export function priorityLabels(p: Priority): string[] {
  return p === 'high' ? ['relay:high'] : p === 'low' ? ['relay:low'] : [];
}

export function isRelayTaskIssue(labels: string[]): boolean {
  return labels.includes(RELAY_LABEL) && !labels.includes(DIGEST_LABEL);
}

/** Loose schema: every field optional; validity is decided by `metadataIssues`. */
export const issueMetadataSchema = z
  .object({
    type: z.enum(TASK_TYPES).optional(),
    likelyFiles: z.array(z.string().min(1)).optional(),
    doneCheck: z.string().min(1).optional(),
    size: z.enum(SIZES).optional(),
    targetPr: z.coerce.number().int().positive().optional(),
    requester: z.string().min(1).optional(),
    title: z.string().optional(),
  })
  .strip();
export type IssueMetadata = z.infer<typeof issueMetadataSchema>;

const BLOCK_RE = /<!--\s*relay\s*\n([\s\S]*?)-->\s*$/;
const ANY_BLOCK_RE = /\n*<!--\s*relay\s*\n[\s\S]*?-->\s*/g;

export interface ParsedIssueBody {
  /** Human description without the metadata block. */
  text: string;
  meta: IssueMetadata;
  /** True when a block was found but could not be parsed/validated. */
  malformed: boolean;
  hasBlock: boolean;
}

export function parseIssueBody(body: string | null | undefined): ParsedIssueBody {
  const src = (body ?? '').replace(/\r\n/g, '\n');
  const m = BLOCK_RE.exec(src.trimEnd());
  const text = src.replace(ANY_BLOCK_RE, '\n').trim();
  if (!m) return { text, meta: {}, malformed: false, hasBlock: false };
  try {
    const raw: unknown = parseYaml(m[1] ?? '') ?? {};
    if (typeof raw !== 'object' || Array.isArray(raw)) return { text, meta: {}, malformed: true, hasBlock: true };
    const r = raw as Record<string, unknown>;
    // Tolerate a single string for likelyFiles and numeric doneCheck/requester.
    if (typeof r.likelyFiles === 'string') r.likelyFiles = [r.likelyFiles];
    if (r.likelyFiles == null) delete r.likelyFiles;
    for (const k of ['doneCheck', 'requester', 'title']) {
      if (r[k] == null) delete r[k];
      else if (typeof r[k] !== 'string') r[k] = String(r[k]);
    }
    for (const k of ['type', 'size', 'targetPr']) if (r[k] == null) delete r[k];
    if (typeof r.type === 'string') r.type = r.type.trim().toLowerCase();
    if (typeof r.size === 'string') r.size = r.size.trim().toUpperCase();
    const parsed = issueMetadataSchema.safeParse(r);
    if (!parsed.success) return { text, meta: {}, malformed: true, hasBlock: true };
    return { text, meta: parsed.data, malformed: false, hasBlock: true };
  } catch {
    return { text, meta: {}, malformed: true, hasBlock: true };
  }
}

/** Missing requirements for a runnable task (SPEC §8.2). Empty = valid. */
export function metadataIssues(meta: IssueMetadata & { type?: TaskType | undefined }): string[] {
  const issues: string[] = [];
  if (!meta.type) return ['type'];
  if (meta.type === 'code') {
    if (!meta.likelyFiles?.length) issues.push('likelyFiles');
    if (!meta.doneCheck) issues.push('doneCheck');
  }
  if (meta.type === 'review' && !meta.targetPr) issues.push('targetPr');
  return issues;
}

export interface MetadataBlockInput {
  type?: TaskType | null;
  likelyFiles?: string[] | null;
  doneCheck?: string | null;
  size?: Size | null;
  targetPr?: number | null;
  requester?: string | null;
}

export function renderMetadataBlock(meta: MetadataBlockInput): string {
  const lines = ['<!-- relay'];
  if (meta.type) lines.push(`type: ${meta.type}`);
  if (meta.likelyFiles?.length) {
    lines.push('likelyFiles:');
    for (const f of meta.likelyFiles) lines.push(`  - ${yamlScalar(f)}`);
  }
  if (meta.doneCheck) lines.push(`doneCheck: ${yamlScalar(meta.doneCheck)}`);
  if (meta.size) lines.push(`size: ${meta.size}`);
  if (meta.targetPr) lines.push(`targetPr: ${meta.targetPr}`);
  if (meta.requester) lines.push(`requester: ${yamlScalar(meta.requester)}`);
  lines.push('-->');
  return lines.join('\n');
}

/** Quote a YAML scalar when it could be misparsed. */
function yamlScalar(s: string): string {
  if (/^[\w./@+-][\w ./@+=:-]*$/.test(s) && !/:\s/.test(s) && !/\s#/.test(s) && !/^(true|false|null|yes|no|~)$/i.test(s)) {
    return s;
  }
  return JSON.stringify(s);
}

/** Issue body = human text + metadata block. Never rewrites the human text. */
export function composeIssueBody(text: string, meta: MetadataBlockInput): string {
  const t = text.trim();
  return `${t ? `${t}\n\n` : ''}${renderMetadataBlock(meta)}\n`;
}

/** Replace (or append) the metadata block in an existing body, keeping the human text verbatim. */
export function replaceMetadataBlock(body: string | null | undefined, meta: MetadataBlockInput): string {
  const src = (body ?? '').replace(/\r\n/g, '\n');
  const without = src.replace(ANY_BLOCK_RE, '\n').replace(/\s+$/, '');
  return `${without ? `${without}\n\n` : ''}${renderMetadataBlock(meta)}\n`;
}
