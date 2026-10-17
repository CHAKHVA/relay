import { describe, expect, it } from 'vitest';
import { findConflict, isActiveClaim, normalizePath, overlappingFiles, pathsOverlap, recentTeamChanges } from '../src/ledger';
import { branchFor, buildJobPayload, fireText, parseBranch, triageBranch, workBranch } from '../src/payload';
import { at, task } from './fixtures';

describe('paths', () => {
  it('normalizes', () => {
    expect(normalizePath('./src//auth.ts')).toBe('src/auth.ts');
    expect(normalizePath('src/')).toBe('src');
    expect(normalizePath('/src\\x.ts')).toBe('src/x.ts');
    expect(normalizePath('././a')).toBe('a');
  });
  it('overlap rules', () => {
    expect(pathsOverlap('src/auth.ts', './src/auth.ts')).toBe(true);
    expect(pathsOverlap('src', 'src/auth.ts')).toBe(true);
    expect(pathsOverlap('src/auth.ts', 'src/')).toBe(true);
    expect(pathsOverlap('src/auth.ts', 'src/auth.tsx')).toBe(false);
    expect(pathsOverlap('src/a', 'src/ab')).toBe(false);
    expect(pathsOverlap('', 'src')).toBe(false);
    expect(overlappingFiles(['a/b', 'c'], ['a'])).toEqual(['a/b']);
  });
  it('globs are literal', () => {
    expect(pathsOverlap('src/*.ts', 'src/auth.ts')).toBe(false);
  });
});

describe('claims', () => {
  it('active claim = dispatched work code/docs', () => {
    expect(isActiveClaim(task({ status: 'dispatched', runKind: 'work', type: 'docs' }))).toBe(true);
    expect(isActiveClaim(task({ status: 'dispatched', runKind: 'triage', type: 'code' }))).toBe(false);
    expect(isActiveClaim(task({ status: 'dispatched', runKind: 'work', type: 'review' }))).toBe(false);
    expect(isActiveClaim(task({ status: 'done', runKind: 'work', type: 'code' }))).toBe(false);
  });
  it('findConflict ignores self and empty file lists', () => {
    expect(findConflict({ id: 'a', likelyFiles: [] }, [{ id: 'b', likelyFiles: ['x'] }])).toBeNull();
    expect(findConflict({ id: 'a', likelyFiles: ['x'] }, [{ id: 'a', likelyFiles: ['x'] }])).toBeNull();
  });
});

describe('recentTeamChanges', () => {
  it('most recent first, limited, files from result when done', () => {
    const tasks = Array.from({ length: 7 }, (_, i) =>
      task({
        id: `c${i}`,
        status: i % 2 ? 'done' : 'dispatched',
        runKind: 'work',
        branch: `claude/relay-c${i}`,
        likelyFiles: ['src/x.ts'],
        filesChanged: i % 2 ? ['src/y.ts'] : null,
        dispatchedAt: at(`2026-10-1${i}T00:00:00Z`),
        resultPrUrl: i % 2 ? `https://github.com/o/r/pull/${i}` : null,
      }),
    );
    tasks.push(task({ id: 'nofiles', status: 'done', runKind: 'work', branch: 'claude/relay-nofiles', likelyFiles: [], dispatchedAt: at('2026-10-19T00:00:00Z') }));
    tasks.push(task({ id: 'queued', status: 'queued', runKind: 'work', branch: 'b', likelyFiles: ['z'] }));
    const r = recentTeamChanges(tasks, 'c6');
    expect(r.map((x) => x.taskId)).toEqual(['c5', 'c4', 'c3', 'c2', 'c1']);
    expect(r[0]).toEqual({ taskId: 'c5', branch: 'claude/relay-c5', files: ['src/y.ts'], status: 'done', prUrl: 'https://github.com/o/r/pull/5' });
    expect(r[1]?.files).toEqual(['src/x.ts']);
  });
});

describe('payload', () => {
  const t = { id: 'r7f3a', type: 'code' as const, title: 'T', body: 'D', likelyFiles: ['src/auth.ts'], doneCheck: 'pnpm test', targetPrNumber: null };
  it('builds work payload per spec shape', () => {
    const p = buildJobPayload(t, 'work', [], 'ana');
    expect(p).toEqual({
      jobKind: 'work',
      relayTaskId: 'r7f3a',
      branch: 'claude/relay-r7f3a',
      type: 'code',
      title: 'T',
      description: 'D',
      likelyFiles: ['src/auth.ts'],
      doneCheck: 'pnpm test',
      targetPr: null,
      requester: 'ana',
      recentTeamChanges: [],
    });
    expect(fireText(p).startsWith('RELAY_JOB_JSON:\n{\n  "jobKind": "work"')).toBe(true);
    expect(JSON.parse(fireText(p).slice('RELAY_JOB_JSON:\n'.length))).toEqual(p);
  });
  it('triage branch includes attempt', () => {
    expect(buildJobPayload(t, 'triage', [], null, 2).branch).toBe('claude/relay-r7f3a-triage-2');
    expect(branchFor('a', 'work', 3)).toBe(workBranch('a'));
    expect(triageBranch('a', 1)).toBe('claude/relay-a-triage-1');
  });
  it('parses branches', () => {
    expect(parseBranch('refs/heads/claude/relay-r7f3a')).toEqual({ taskId: 'r7f3a', runKind: 'work', attempt: null });
    expect(parseBranch('claude/relay-r7f3a-triage-2')).toEqual({ taskId: 'r7f3a', runKind: 'triage', attempt: 2 });
    expect(parseBranch('claude/other')).toBeNull();
    expect(parseBranch('main')).toBeNull();
  });
});
