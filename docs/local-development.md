# Local development

How to work on OOTP Consultation on your own machine. Your local app talks to the **staging** Supabase project, so nothing you do locally touches production. You don't need Docker unless you want to run the database tests yourself; CI runs them on every pull request.

## What to install

| Tool | Version | Notes |
| --- | --- | --- |
| Git | any recent | |
| Node.js | 24 (see `.nvmrc`) | Use a version manager so the right version is picked up per project: [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm) on macOS and Linux, fnm or [nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows. |
| pnpm | 10.34.6 (from `packageManager` in `package.json`) | Run `corepack enable` once; Node 24 ships Corepack, which then runs the pinned pnpm automatically. |
| VS Code | optional | Opening the repo offers the recommended extensions (ESLint, Prettier, EditorConfig, Vitest). |
| Docker Desktop and the Supabase CLI 2.119.0 | optional | Only for running the database tests locally. Install the CLI with `brew install supabase/tap/supabase` (macOS), `scoop install supabase` (Windows) or from its [releases page](https://github.com/supabase/cli/releases). |

## First-time setup

1. Clone the repo and enter it:

   ```sh
   git clone https://github.com/boba-jjang/ootp-consultation.git
   cd ootp-consultation
   ```

2. Switch to Node 24 and turn on Corepack:

   ```sh
   fnm use        # or: nvm use
   corepack enable
   ```

3. Install dependencies:

   ```sh
   pnpm install
   ```

4. Create your local settings file from the template:

   ```sh
   cp apps/web/.env.example apps/web/.env.local
   ```

   Fill in the two `VITE_` values from the **ootp-staging** project in Supabase (the Connect button shows both). These are the same values as Vercel's Preview and Development variables. `.env.local` is gitignored, so it never gets committed.

5. Check the setup:

   ```sh
   pnpm check-setup
   ```

   It checks Node and pnpm versions, installed dependencies and your `.env.local`. It fails if the file points at production or holds a secret key.

6. Start the app:

   ```sh
   pnpm dev
   ```

   Open http://localhost:5173 and sign in with GitHub. Locally you sign in through the staging GitHub OAuth app. The dev server always uses port 5173, because that's the only local address staging's sign-in settings allow. If the port is busy, stop whatever is using it rather than changing the port.

## Everyday commands

Run these from the repo root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the app at http://localhost:5173 against staging |
| `pnpm lint` | ESLint; warnings fail, as in CI |
| `pnpm format` | Formats everything with Prettier; `pnpm format:check` only checks |
| `pnpm typecheck` | TypeScript over every project |
| `pnpm test` | Core tests with the coverage floor, then everything else; `pnpm test:watch` while working |
| `pnpm build` | Production build |
| `pnpm e2e` | The end-to-end and accessibility tests in `e2e/`, in headless Chromium against the dev server (it starts one if none is running). Once per machine: `pnpm exec playwright install chromium`. |
| `pnpm check-setup` | Checks your machine and `.env.local` |

CI runs lint, format check, typecheck, test and build on every pull request, so running them before you push saves a round trip.

## Database tests (optional)

With Docker running and the Supabase CLI installed:

```sh
supabase db start   # a local Postgres with every migration applied
supabase test db    # the pgTAP policy tests in supabase/tests/
supabase stop
```

To change the database, add a new file to `supabase/migrations/` (`supabase migration new <name>`) and open a pull request. Never run `supabase db push` against staging or production from your machine: the `DB` workflow applies migrations after a merge to `main`, staging first.

## Where every setting lives

None of these values belong in the repo. This table says where each one is kept.

| Setting | Where it's set | Secret? |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Your `apps/web/.env.local` (staging); Vercel, Preview and Development scopes (staging) and Production scope (prod) | No, they ship to the browser |
| `SUPABASE_REF_STAGING`, `SUPABASE_REF_PROD` | GitHub repo, Actions variables | No |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_STAGING`, `SUPABASE_DB_PASSWORD_PROD` | GitHub repo, Actions secrets. Keep them in your password manager, not on disk. | Yes |
| GitHub OAuth app client secrets | Each Supabase project's GitHub provider only | Yes |
| `GEMINI_API_KEY`, `ADVISOR_DAILY_LIMIT` (Phase 5) | Vercel, and `apps/web/.env.local` without a `VITE_` prefix | The API key is |

Project refs: staging is `kcmjeivksnptmvemusma` and production is `piswvhjbbzeogclbulwp`.

## Working with Claude Code locally

`CLAUDE.md` loads automatically, and `/next-task` and `/gate-check` work as they do in the cloud. The session-start hook in `.claude/settings.json` only installs dependencies in cloud sessions and does nothing on your machine.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The page says "This build has no Supabase settings" | `apps/web/.env.local` is missing or misnamed. Fix it, then restart `pnpm dev`; Vite reads env files only at start. |
| After GitHub sign-in you land on the wrong address | Use http://localhost:5173 exactly. Staging's Supabase URL Configuration needs `http://localhost:5173/**` among its redirect URLs. |
| `Unsupported engine` warnings | You're not on Node 24. Run `fnm use` or `nvm use`. |
| pnpm says the version doesn't match | Run `corepack enable`, then retry. |
| `Port 5173 is in use` | Another dev server is running. Stop it. |
