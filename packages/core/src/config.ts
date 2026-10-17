/** Estimated share of a 5-hour window and tokens per task size. Always shown as "est.". */
export const SIZE_COST = {
  S: { pct: 5, tokens: 150_000 },
  M: { pct: 12, tokens: 400_000 },
  L: { pct: 25, tokens: 900_000 },
} as const;
export const TRIAGE_COST = { pct: 3, tokens: 80_000 } as const;
export const DEFAULT_SIZE = 'M' as const;
export const BLENDED_USD_PER_MTOK = 6; // estimate, always labeled "est."
export const STALE_AFTER_MINUTES = 40;
export const USAGE_STALE_MINUTES = 30; // beacon older than this → estimate
export const RECENT_CHANGES_LIMIT = 5;
export const DRY_RUN_COMPLETE_AFTER_MS = 20_000;
export const MAX_ATTEMPTS = 2;

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
export const MAX_TEST_WINDOW_MINUTES = 60;
export const MIN_TEST_WINDOW_MINUTES = 15;
export const DIGEST_GRACE_MINUTES = 30;
export const WINDOW_STARTING_NOTICE_MINUTES = 10;
export const COMMENT_MARKDOWN_MAX = 60_000;
export const BRANCH_PREFIX = 'claude/relay-';
