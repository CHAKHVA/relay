import { RECENT_CHANGES_LIMIT } from './config';
import type { SchedTask, TaskStatus } from './types';

/**
 * Normalize a repo-relative path: strip leading "./" and "/", trailing "/", collapse "//".
 * Glob characters are NOT supported: "src/*.ts" is treated as a literal path.
 */
export function normalizePath(p: string): string {
  let s = p.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s;
}

/** Two paths overlap when equal or one is a directory prefix of the other. */
export function pathsOverlap(a: string, b: string): boolean {
  const x = normalizePath(a);
  const y = normalizePath(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

export function overlappingFiles(files: string[], claimed: string[]): string[] {
  return files.filter((f) => claimed.some((c) => pathsOverlap(f, c)));
}

/** Active claims: dispatched work runs of type code|docs. */
export function isActiveClaim(t: Pick<SchedTask, 'status' | 'runKind' | 'type'>): boolean {
  return t.status === 'dispatched' && t.runKind === 'work' && (t.type === 'code' || t.type === 'docs');
}

export interface LedgerConflict {
  blockedByTaskId: string;
  blockedOnFiles: string[];
}

export function findConflict(
  job: Pick<SchedTask, 'id' | 'likelyFiles'>,
  claims: Pick<SchedTask, 'id' | 'likelyFiles'>[],
): LedgerConflict | null {
  if (!job.likelyFiles.length) return null;
  for (const c of claims) {
    if (c.id === job.id) continue;
    const files = overlappingFiles(job.likelyFiles, c.likelyFiles);
    if (files.length) return { blockedByTaskId: c.id, blockedOnFiles: files.map(normalizePath) };
  }
  return null;
}

export interface RecentChange {
  taskId: string;
  branch: string;
  files: string[];
  status: TaskStatus;
  prUrl: string | null;
}

const RECENT_STATUSES: TaskStatus[] = ['dispatched', 'done', 'merged'];

/** Up to RECENT_CHANGES_LIMIT most recent work runs (excluding `excludeId`) that touched files. */
export function recentTeamChanges(tasks: SchedTask[], excludeId: string): RecentChange[] {
  return tasks
    .filter((t) => t.id !== excludeId && t.runKind === 'work' && RECENT_STATUSES.includes(t.status) && t.branch)
    .map((t) => ({ t, files: (t.status !== 'dispatched' && t.filesChanged?.length ? t.filesChanged : t.likelyFiles).map(normalizePath) }))
    .filter(({ files }) => files.length > 0)
    .sort((a, b) => (b.t.dispatchedAt?.getTime() ?? 0) - (a.t.dispatchedAt?.getTime() ?? 0))
    .slice(0, RECENT_CHANGES_LIMIT)
    .map(({ t, files }) => ({ taskId: t.id, branch: t.branch as string, files, status: t.status, prUrl: t.resultPrUrl ?? null }));
}
