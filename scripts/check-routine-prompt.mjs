#!/usr/bin/env node
// Asserts routine/ROUTINE_PROMPT.md is byte-identical to the code block in SPEC.md §9.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
export function extractSpecPrompt(spec) {
  const start = spec.indexOf('## 9. Routine prompt');
  const fenceOpen = spec.indexOf('```\n', start);
  const fenceClose = spec.indexOf('\n```', fenceOpen + 4);
  return spec.slice(fenceOpen + 4, fenceClose + 1);
}
const spec = readFileSync(resolve(root, 'SPEC.md'), 'utf8');
const prompt = readFileSync(resolve(root, 'routine/ROUTINE_PROMPT.md'), 'utf8');
if (extractSpecPrompt(spec) !== prompt) {
  console.error('✖ routine/ROUTINE_PROMPT.md differs from SPEC.md §9');
  process.exit(1);
}
console.log('✓ routine/ROUTINE_PROMPT.md matches SPEC.md §9');
