import { describe, expect, it } from 'vitest';
import {
  composeIssueBody,
  isRelayTaskIssue,
  metadataIssues,
  parseIssueBody,
  priorityFromLabels,
  priorityLabels,
  renderMetadataBlock,
  replaceMetadataBlock,
  typeFromLabels,
  typeLabel,
} from '../src/issue';
import { parseResult, resultPath, TRUNCATION_NOTE } from '../src/result';

const SPEC_BLOCK = `Fix login.

<!-- relay
type: code
likelyFiles:
  - src/auth.ts
  - tests/auth.test.ts
doneCheck: pnpm test
size: S
targetPr: 42          # review tasks only
requester: ana        # GitHub login; set by Relay when created from the board
-->`;

describe('parseIssueBody', () => {
  it('parses the spec example', () => {
    const p = parseIssueBody(SPEC_BLOCK);
    expect(p.text).toBe('Fix login.');
    expect(p.hasBlock).toBe(true);
    expect(p.malformed).toBe(false);
    expect(p.meta).toEqual({ type: 'code', likelyFiles: ['src/auth.ts', 'tests/auth.test.ts'], doneCheck: 'pnpm test', size: 'S', targetPr: 42, requester: 'ana' });
    expect(metadataIssues(p.meta)).toEqual([]);
  });
  it('no block', () => {
    const p = parseIssueBody('Just text\r\n');
    expect(p).toEqual({ text: 'Just text', meta: {}, malformed: false, hasBlock: false });
    expect(parseIssueBody(null).text).toBe('');
  });
  it('malformed yaml or values', () => {
    expect(parseIssueBody('x\n<!-- relay\ntype: [unclosed\n-->').malformed).toBe(true);
    expect(parseIssueBody('x\n<!-- relay\ntype: rocket\n-->').malformed).toBe(true);
    expect(parseIssueBody('x\n<!-- relay\n- a\n- b\n-->').malformed).toBe(true);
  });
  it('tolerant coercions', () => {
    const p = parseIssueBody('<!-- relay\ntype: Code\nlikelyFiles: src/a.ts\ndoneCheck: 123\nsize: s\n-->');
    expect(p.meta).toEqual({ type: 'code', likelyFiles: ['src/a.ts'], doneCheck: '123', size: 'S' });
    const empty = parseIssueBody('<!-- relay\ntype:\nlikelyFiles:\n-->');
    expect(empty.meta).toEqual({});
    expect(parseIssueBody('<!-- relay\n-->').meta).toEqual({});
  });
});

describe('metadataIssues', () => {
  it('validity rules', () => {
    expect(metadataIssues({})).toEqual(['type']);
    expect(metadataIssues({ type: 'code' })).toEqual(['likelyFiles', 'doneCheck']);
    expect(metadataIssues({ type: 'review' })).toEqual(['targetPr']);
    expect(metadataIssues({ type: 'review', targetPr: 3 })).toEqual([]);
    expect(metadataIssues({ type: 'docs' })).toEqual([]);
    expect(metadataIssues({ type: 'business' })).toEqual([]);
  });
});

describe('render / replace', () => {
  it('round-trips', () => {
    const meta = { type: 'code' as const, likelyFiles: ['src/a b.ts', 'src/x.ts'], doneCheck: 'pnpm test -- --run: yes', size: 'M' as const, targetPr: 7, requester: 'ana' };
    const body = composeIssueBody('Hello', meta);
    expect(parseIssueBody(body).meta).toEqual(meta);
    expect(parseIssueBody(body).text).toBe('Hello');
  });
  it('quotes risky scalars', () => {
    expect(renderMetadataBlock({ doneCheck: 'true' })).toContain('doneCheck: "true"');
    expect(renderMetadataBlock({ doneCheck: 'a # b' })).toContain('"a # b"');
    expect(renderMetadataBlock({})).toBe('<!-- relay\n-->');
  });
  it('replaces the block and preserves human text verbatim', () => {
    const human = 'Line one\n\n  - keep *this*  \nend';
    const replaced = replaceMetadataBlock(`${human}\n\n<!-- relay\ntype: docs\n-->\n`, { type: 'code', likelyFiles: ['a'], doneCheck: 'x' });
    expect(replaced.startsWith(`${human}\n\n<!-- relay\ntype: code`)).toBe(true);
    expect(replaced.match(/<!-- relay/g)).toHaveLength(1);
    expect(replaceMetadataBlock(null, { type: 'docs' })).toBe('<!-- relay\ntype: docs\n-->\n');
    expect(replaceMetadataBlock('vague', { type: 'docs' })).toBe('vague\n\n<!-- relay\ntype: docs\n-->\n');
    expect(composeIssueBody('', { type: 'docs' })).toBe('<!-- relay\ntype: docs\n-->\n');
  });
});

describe('labels', () => {
  it('type and priority', () => {
    expect(typeFromLabels(['relay', 'relay:type/review'])).toBe('review');
    expect(typeFromLabels(['relay'])).toBeNull();
    expect(priorityFromLabels(['relay:high'])).toBe('high');
    expect(priorityFromLabels(['relay:low'])).toBe('low');
    expect(priorityFromLabels([])).toBe('normal');
    expect(priorityLabels('high')).toEqual(['relay:high']);
    expect(priorityLabels('low')).toEqual(['relay:low']);
    expect(priorityLabels('normal')).toEqual([]);
    expect(typeLabel('docs')).toBe('relay:type/docs');
    expect(isRelayTaskIssue(['relay'])).toBe(true);
    expect(isRelayTaskIssue(['relay', 'relay-digest'])).toBe(false);
    expect(isRelayTaskIssue(['bug'])).toBe(false);
  });
});

describe('parseResult', () => {
  const base = {
    taskId: 'r1',
    jobKind: 'work',
    type: 'code',
    summary: 'Did it',
    outputMode: 'pr',
    commentMarkdown: '',
    filesChanged: ['src/a.ts'],
    checkCommand: 'pnpm test',
    checkPassed: true,
    triage: null,
    notes: '',
  };
  it('accepts valid results (object or string)', () => {
    expect(parseResult(base)).toMatchObject({ ok: true, result: { taskId: 'r1', checkPassed: true } });
    expect(parseResult(JSON.stringify(base)).ok).toBe(true);
  });
  it('defaults optional fields', () => {
    const r = parseResult({ taskId: 'r1', jobKind: 'work', type: 'docs', outputMode: 'none' });
    expect(r).toMatchObject({ ok: true, result: { summary: '', commentMarkdown: '', filesChanged: [], checkPassed: null, triage: null, notes: '' } });
  });
  it('rejects unknown outputMode and bad JSON', () => {
    expect(parseResult({ ...base, outputMode: 'email' })).toMatchObject({ ok: false, error: expect.stringContaining('outputMode') });
    expect(parseResult('{nope')).toEqual({ ok: false, error: 'Result file is not valid JSON' });
  });
  it('parses triage', () => {
    const r = parseResult({ ...base, jobKind: 'triage', outputMode: 'none', triage: { type: 'code', likelyFiles: ['a'], doneCheck: 'pnpm test', size: 'S', title: ' Better ' } });
    expect(r).toMatchObject({ ok: true, result: { triage: { type: 'code', title: 'Better', size: 'S' } } });
    const r2 = parseResult({ ...base, triage: { type: 'docs', doneCheck: '', title: '' } });
    expect(r2).toMatchObject({ ok: true, result: { triage: { likelyFiles: [], doneCheck: null, size: null, title: null } } });
  });
  it('truncates long markdown', () => {
    const r = parseResult({ ...base, commentMarkdown: 'x'.repeat(70_000) });
    if (!r.ok) throw new Error('expected ok');
    expect(r.result.commentMarkdown.length).toBe(60_000);
    expect(r.result.commentMarkdown.endsWith(TRUNCATION_NOTE)).toBe(true);
  });
  it('result path', () => expect(resultPath('r1')).toBe('.relay/results/r1.json'));
});
