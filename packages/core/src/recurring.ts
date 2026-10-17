import { CronExpressionParser } from 'cron-parser';

export interface RecurringLike {
  id: string;
  enabled: boolean;
  nextRunAt: Date;
}

export function dueRecurring<T extends RecurringLike>(templates: T[], now: Date): T[] {
  return templates.filter((t) => t.enabled && t.nextRunAt.getTime() <= now.getTime());
}

/** Next run strictly after `after`, evaluated in `timezone`. Throws on an invalid expression. */
export function computeNextRun(cron: string, timezone: string, after: Date): Date {
  const expr = CronExpressionParser.parse(cron, { currentDate: after, tz: timezone });
  return expr.next().toDate();
}

export function isValidCron(cron: string, timezone = 'UTC'): boolean {
  try {
    // Exactly five fields keeps the UI presets and custom input consistent.
    if (cron.trim().split(/\s+/).length !== 5) return false;
    computeNextRun(cron, timezone, new Date(0));
    return true;
  } catch {
    return false;
  }
}

export const CRON_PRESETS = [
  { label: 'Every weekday at 09:00', cron: '0 9 * * 1-5' },
  { label: 'Every Monday at 09:00', cron: '0 9 * * 1' },
  { label: 'Every day at 20:00', cron: '0 20 * * *' },
  { label: 'First of the month at 09:00', cron: '0 9 1 * *' },
] as const;
