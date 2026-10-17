# VERSIONS.md

Resolved with `pnpm view <pkg> version` on 2026-10-17 (M0) and installed exactly (no ranges).

## Toolchain

| Tool | Version | Notes |
|---|---|---|
| Node.js | 26.12.0 | Local. Vercel deploys on the newest runtime it offers (see PROGRESS.md / M14). |
| pnpm | 12.14.0 | `packageManager` field |
| git | 2.56.0 | |
| gh | 2.102.0 | |
| Vercel CLI | 64.5.0 | |
| smee-client | 5.0.0 | global + devDependency |

## Packages

| Package | Version |
|---|---|
| @eslint/js | 10.0.1 |
| @neondatabase/serverless | 1.2.0 |
| @octokit/auth-app | 8.3.1 |
| @octokit/webhooks | 14.2.0 |
| @paralleldrive/cuid2 | 3.3.0 |
| @playwright/test | 1.64.1 |
| @tailwindcss/postcss | 4.3.3 |
| @tanstack/react-query | 5.104.4 |
| @types/node | 26.6.5 |
| @types/react | 19.3.0 |
| @types/react-dom | 19.3.0 |
| @vitest/coverage-v8 | 5.0.5 |
| babel-plugin-react-compiler | 1.0.0 |
| better-auth | 1.7.10 |
| class-variance-authority | 0.7.1 |
| clsx | 2.1.1 |
| cmdk | 1.1.1 |
| cron-parser | 5.10.2 |
| dotenv | 18.0.8 |
| drizzle-kit | 1.0.0-rc.4 |
| drizzle-orm | 1.0.0-rc.4 |
| eslint | 10.13.0 |
| eslint-config-next | 16.4.2 |
| lucide-react | 1.59.0 |
| next | 16.4.2 |
| next-themes | 0.4.6 |
| octokit | 5.0.5 |
| radix-ui | 1.8.1 |
| react | 19.3.1 |
| react-dom | 19.3.1 |
| react-markdown | 10.1.0 |
| remark-gfm | 4.0.1 |
| smee-client | 5.0.0 |
| sonner | 2.0.8 |
| tailwind-merge | 3.7.0 |
| tailwindcss | 4.3.3 |
| temporal-polyfill | 1.0.6 |
| tsx | 4.23.15 |
| typescript | 6.0.3 |
| typescript-eslint | 8.71.2 |
| vitest | 5.0.5 |
| yaml | 2.9.1 |
| zod | 4.6.7 |

## Deviations from "latest stable" (SPEC §4 fallbacks)

- **TypeScript 6.0.3 instead of 7.0.2.** `typescript-eslint@8.71.2` (latest) declares `typescript >=4.8.4 <6.1.0` and uses the TS JS API that the native 7.x compiler does not provide, so linting breaks on 7.x. SPEC §4 allows pinning the latest 6.x in that case.
- **Drizzle ORM / drizzle-kit 1.0.0-rc.4.** npm `latest` for drizzle is still 0.45.4 / 0.31.11; no 1.x stable exists yet. SPEC §4 requires Drizzle 1.x (for `drizzle-orm/zod`), so the `rc` dist-tag is used. Better Auth 1.7.10 declares support for `drizzle-orm >=1.0.0-rc.1`.
