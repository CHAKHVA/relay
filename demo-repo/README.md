# Relay demo repository

A tiny TypeScript project for trying [Relay](https://github.com/) end to end. Use it as a template ("Use this template"), install the Relay GitHub App on **your copy**, and run the prepared tasks on your own Claude seat. Nothing here is real production code.

```bash
pnpm install
pnpm test   # runs in a couple of seconds
```

## Prepared tasks

Create these from the Relay board (or as GitHub issues labeled `relay`):

1. **Code (high priority):** "Add unit tests for calcInvoice". Files: `src/billing.ts`, `tests/billing.test.ts`. Check: `pnpm test`. Size S.
2. **Code:** "Add input validation to validateLogin". Files: `src/auth.ts`, `tests/auth.test.ts`. Check: `pnpm test`. Size S.
3. **Code:** "Return structured errors from validateLogin". File: `src/auth.ts`. It is **blocked** behind task 2 because both touch `src/auth.ts`.
4. **Review:** "Review PR #<task 1's PR>" once task 1 opens its draft PR.
5. **Business:** "Compare 3 approaches for multi-currency formatting and recommend one". The answer arrives as a comment.
6. **Needs triage:** create a GitHub issue with only the `relay` label and a vague body, such as "The login flow feels too permissive". An agent fills in the details first.
7. **Recurring:** "Weekly dependency audit" (docs, comment result).

Relay writes results to `.relay/results/` on `claude/relay-*` branches; nothing is ever pushed to your default branch.
