import type { RelayResult } from '@relay/core';
import type { Task } from '../db/schema';

const PATH_RE = /(?:^|[\s`'"(])((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|mjs|json|md|py|go|rs|css|html|yml|yaml))(?=$|[\s`'")\],.:;])/g;

/** Repo paths mentioned in a free-text description (deduplicated, in order). */
export function pathsInText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PATH_RE)) {
    const p = m[1]!;
    if (!out.includes(p) && !/^https?:/.test(p)) out.push(p);
  }
  return out.slice(0, 8);
}

/** A plausible routine result for a DRY RUN task (SPEC §11.5). Never marked as real. */
export function synthesizeResult(task: Task): RelayResult {
  if (task.runKind === 'triage') {
    const fromText = pathsInText(`${task.title}\n${task.body}`);
    const files = task.likelyFiles.length ? task.likelyFiles : fromText.length ? fromText : ['README.md'];
    // Untyped issues are stored with a placeholder type; a triage that had nothing to go on infers one from the files.
    const needsType = !task.likelyFiles.length && !task.doneCheck;
    const type = needsType ? (files.some((f) => /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f)) ? 'code' : 'docs') : task.type;
    return {
      taskId: task.id,
      jobKind: 'triage',
      type: task.type,
      summary: `Dry run triage: classified as ${type}, ${files.length} likely file(s).`,
      outputMode: 'none',
      commentMarkdown: '',
      filesChanged: [],
      checkCommand: '',
      checkPassed: null,
      triage: { type, likelyFiles: files, doneCheck: task.doneCheck || 'pnpm test', size: task.size ?? 'S', title: null },
      notes: 'Synthesized by Relay DRY RUN. No routine was fired.',
    };
  }
  const base = {
    taskId: task.id,
    jobKind: 'work' as const,
    type: task.type,
    triage: null,
    notes: 'Synthesized by Relay DRY RUN. No routine was fired.',
  };
  const files = task.likelyFiles;
  const asPr = task.type === 'code' || (task.type === 'docs' && files.length > 0);
  if (asPr) {
    return {
      ...base,
      summary: `Dry run: would have completed “${task.title}”.`,
      outputMode: 'pr',
      commentMarkdown: '',
      filesChanged: files,
      checkCommand: task.doneCheck ?? '',
      checkPassed: task.doneCheck ? true : null,
    };
  }
  const md =
    task.type === 'review'
      ? `## Dry run review\n\nNo real review was performed. In a real run, findings for PR #${task.targetPrNumber ?? '?'} appear here, tagged **[blocker]**, **[suggestion]** or **[nit]**.`
      : `## Dry run result\n\nNo real work was performed for “${task.title}”. In a real run, the deliverable appears here as Markdown.`;
  return {
    ...base,
    summary: `Dry run: would have written a ${task.type} result.`,
    outputMode: 'comment',
    commentMarkdown: md,
    filesChanged: [],
    checkCommand: '',
    checkPassed: null,
  };
}
