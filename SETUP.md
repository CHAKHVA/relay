# SETUP.md — Do this once, before the one-prompt build

Everything below needs a browser or your accounts, so it must be done by you **before** Claude Code starts. When you finish, every value lives in one file, `.env.setup`, and Claude Code can build, test, deploy, and verify Relay on its own.

Time: about 45–60 minutes. Placeholders: `<you>` = your GitHub username, `<yourname>` = any short unique name.

---

## 1. Accounts
- GitHub account
- [Neon](https://neon.tech) (free)
- [Vercel](https://vercel.com) (free Hobby)
- Claude **Pro / Max / Team / Enterprise** plan (routines must be enabled)

## 2. Tools on your Mac
```bash
xcode-select --install                                 # git + build tools (skip if already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"   # Homebrew, if missing
curl -fsSL https://claude.ai/install.sh | bash        # Claude Code (open a new terminal afterwards)
brew install fnm gh
fnm install 26 && fnm default 26                       # Node 26 (follow fnm's printed shell setup line)
corepack enable                                        # pnpm
npm i -g vercel smee-client                            # Vercel CLI + webhook forwarder
```
Then sign in:
```bash
claude                      # log in with your Claude account in the browser, then exit (/exit)
gh auth login               # GitHub.com → HTTPS → login with browser
gh auth refresh -s workflow,repo
vercel login
```
Check: `node -v` (v26.x), `pnpm -v`, `gh auth status`, `vercel whoami`, `claude --version`.

## 3. GitHub repositories
```bash
gh repo create relay --public --clone      # the app's code (public so judges can see it)
gh repo create relay-sandbox --private     # Claude's automated test target
gh repo create relay-demo --public         # becomes the public template judges copy
```
Initialize the two empty repos so GitHub Apps can be installed and routines can clone them:
```bash
for r in relay-sandbox relay-demo; do
  tmp=$(mktemp -d) && cd "$tmp" && git init -q -b main && echo "# $r" > README.md \
  && git add . && git commit -qm init && git remote add origin "https://github.com/<you>/$r.git" \
  && git push -q -u origin main && cd - >/dev/null
done
```

## 4. Neon database
1. Create a project named **relay**.
2. Dashboard → **Connect** → copy the **pooled** connection string of the `main` branch → this is `PROD_DATABASE_URL`.
3. Branches → **Create branch** named `dev` (from `main`) → copy its pooled connection string → this is `DATABASE_URL`.

## 5. Vercel project and production URL
```bash
cd relay
vercel project add relay
```
Then in the Vercel dashboard → project **relay** → Settings → **Domains** → add `relay-<yourname>.vercel.app` (pick any free name). This is your production URL: `PROD_APP_URL=https://relay-<yourname>.vercel.app`.

Create a token: Vercel → Account Settings → **Tokens** → create (scope: your account/team, no expiry or a long one) → `VERCEL_TOKEN`. Note your scope (your Vercel username or team slug) → `VERCEL_SCOPE`.

## 6. Webhook forwarding for local development
Open https://smee.io/new and copy the channel URL → `SMEE_URL`.

## 7. Generate secrets
```bash
for n in BETTER_AUTH_SECRET RELAY_ENCRYPTION_KEY CRON_SECRET GITHUB_WEBHOOK_SECRET PROD_BETTER_AUTH_SECRET PROD_RELAY_ENCRYPTION_KEY PROD_CRON_SECRET PROD_GITHUB_WEBHOOK_SECRET; do
  echo "$n=$(openssl rand -base64 32)"
done
```
Keep the output for `.env.setup`.

## 8. GitHub App #1 — **Relay Dev** (for local work and automated tests)
GitHub → Settings → Developer settings → **GitHub Apps** → **New GitHub App**:

| Field | Value |
|---|---|
| Name | `Relay Dev <yourname>` |
| Homepage URL | `http://localhost:3000` |
| Callback URL | `http://localhost:3000/api/auth/callback/github` |
| Expire user authorization tokens | leave checked |
| Request user authorization (OAuth) during installation | unchecked |
| Setup URL | `http://localhost:3000/api/github/setup` · check **Redirect on update** |
| Webhook | Active ✅ · URL = your `SMEE_URL` · Secret = your `GITHUB_WEBHOOK_SECRET` |
| Repository permissions | Contents: **Read-only** · Issues: **Read and write** · Pull requests: **Read and write** · Metadata: **Read-only** (automatic) |
| Account permissions | Email addresses: **Read-only** |
| Subscribe to events | **Issues**, **Push**, **Pull request** |
| Where can this app be installed | **Only on this account** |

After **Create**:
- Note **App ID** → `GITHUB_APP_ID`, **Client ID** → `GITHUB_CLIENT_ID`, and the app's URL slug (from its public page `github.com/apps/<slug>`) → `GITHUB_APP_SLUG`.
- **Generate a new client secret** → `GITHUB_CLIENT_SECRET`.
- **Generate a private key** → a `.pem` downloads. Move it to `relay/secrets/relay-dev.pem`.
- Left menu → **Install App** → install on **only** `relay-sandbox`.

## 9. GitHub App #2 — **Relay** (production, public)
Same as step 8, except:

| Field | Value |
|---|---|
| Name | `Relay <yourname>` (this is what judges see) |
| Homepage URL | `PROD_APP_URL` |
| Callback URL | `PROD_APP_URL/api/auth/callback/github` |
| Setup URL | `PROD_APP_URL/api/github/setup` · **Redirect on update** |
| Webhook URL | `PROD_APP_URL/api/github/webhook` · Secret = `PROD_GITHUB_WEBHOOK_SECRET` |
| Where can this app be installed | **Any account** |

Save its App ID, Client ID, client secret, slug as the `PROD_` values; private key → `relay/secrets/relay-prod.pem`. **Do not install it anywhere yet** (it will fail until the app is deployed; you'll install it on your demo copy after the build).

## 10. Claude Code routine (used for up to 3 real test runs)
1. Give Claude access to your GitHub repos for cloud sessions: run `claude` and then `/web-setup` (or connect GitHub at claude.ai/code) and make sure `relay-sandbox` is accessible.
2. Open https://claude.ai/code/routines → **New routine**:
   - Name: `Relay worker (sandbox)`
   - Repository: `<you>/relay-sandbox`
   - Environment: **Default**; setup script: `corepack enable && (pnpm install || true)`
   - Prompt: copy the code block from **SPEC.md §9** exactly (everything between the triple backticks).
   - Connectors: remove all.
   - Trigger: **API** → **Create**.
3. Edit the routine → API trigger → copy the **URL** → `ROUTINE_FIRE_URL`; **Generate token** → `ROUTINE_TOKEN` (shown once).

Each real run uses one of your daily routine runs and some of your Claude usage. Claude Code is limited to `REAL_FIRE_BUDGET` runs (default 3).

## 11. Put the project folder together
Inside `relay/` (the cloned app repo):
```
relay/
  SPEC.md
  CLAUDE.md
  SETUP.md
  .env.setup          ← create from the template below
  .gitignore          ← create from below
  secrets/
    relay-dev.pem
    relay-prod.pem
```
`.gitignore`:
```
.env*
!.env.example
secrets/
*.pem
node_modules/
.next/
test-artifacts/
.vercel/
```
`.env.setup` template (fill every value):
```bash
# ---------- Identity ----------
GITHUB_OWNER=<you>
TEST_REPO=<you>/relay-sandbox
DEMO_TEMPLATE_REPO=<you>/relay-demo
APP_REPO=<you>/relay

# ---------- Development / tests ----------
APP_URL=http://localhost:3000
DATABASE_URL=postgres://...dev branch pooled...
BETTER_AUTH_SECRET=...
RELAY_ENCRYPTION_KEY=...
CRON_SECRET=...
SMEE_URL=https://smee.io/...
GITHUB_APP_ID=...
GITHUB_APP_SLUG=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_APP_PRIVATE_KEY_PATH=./secrets/relay-dev.pem

# ---------- Real routine (M13 only) ----------
ROUTINE_FIRE_URL=https://api.anthropic.com/v1/claude_code/routines/trig_.../fire
ROUTINE_TOKEN=sk-ant-oat01-...
REAL_FIRE_BUDGET=3

# ---------- Production ----------
PROD_APP_URL=https://relay-<yourname>.vercel.app
PROD_DATABASE_URL=postgres://...main branch pooled...
PROD_BETTER_AUTH_SECRET=...
PROD_RELAY_ENCRYPTION_KEY=...
PROD_CRON_SECRET=...
PROD_GITHUB_APP_ID=...
PROD_GITHUB_APP_SLUG=...
PROD_GITHUB_CLIENT_ID=...
PROD_GITHUB_CLIENT_SECRET=...
PROD_GITHUB_WEBHOOK_SECRET=...
PROD_GITHUB_APP_PRIVATE_KEY_PATH=./secrets/relay-prod.pem
VERCEL_TOKEN=...
VERCEL_SCOPE=<vercel username or team slug>
VERCEL_PROJECT_NAME=relay
```
Commit only the docs:
```bash
git add SPEC.md CLAUDE.md SETUP.md .gitignore && git commit -m "Add spec" && git push
```
Double-check nothing secret is staged: `git status` must not show `.env.setup` or `secrets/`.

## 12. Start the build
```bash
cd relay
claude --dangerously-skip-permissions
```
Paste the kickoff prompt (see the chat). Claude Code works through M0–M15, testing each step, and writes progress to `PROGRESS.md`.

**If it pauses** (usage limit or context reset): wait for the limit to reset, then run `claude --continue --dangerously-skip-permissions` and type `continue` — it resumes from `PROGRESS.md`.

## 13. After the build (you)
1. Read the **Final report** at the end of `PROGRESS.md` and do anything under **Needs human**.
2. Install the production app: create your own copy of `relay-demo` with **Use this template** (e.g. `relay-showcase`), open the live site, sign in, and follow the in-app checklist (it installs **Relay <yourname>** on that copy). Create a routine for that repo the same way as step 10.
3. Ask a friend with another GitHub account (and their own Claude plan) to go through the checklist on their own copy — this is the final public check.
4. Record the demo video (SPEC.md §16.4), using demo mode, "Load demo team", and the demo clock.
