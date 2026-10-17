import type { Member } from '../db/schema';

/** How a member is referenced on GitHub. Simulated members are never @-mentioned. */
export function ghName(m: Pick<Member, 'githubLogin' | 'displayName' | 'simulated'> | null | undefined): string | null {
  if (!m) return null;
  if (m.simulated) return `${m.displayName} (Simulated)`;
  return m.githubLogin ? `@${m.githubLogin}` : m.displayName;
}

export function firstName(m: Pick<Member, 'displayName'>): string {
  return m.displayName.split(' ')[0] ?? m.displayName;
}
