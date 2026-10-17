import { createId } from '@paralleldrive/cuid2';
import { randomBytes } from 'node:crypto';

export const newId = () => createId();

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Short task id like "r7f3a" (lowercase alphanumerics, matches branch parsing). */
export function newTaskId(): string {
  const bytes = randomBytes(5);
  let s = 'r';
  for (let i = 0; i < 4; i++) s += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return s;
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
