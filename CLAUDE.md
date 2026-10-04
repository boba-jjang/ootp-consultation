# CLAUDE.md

## Project

OOTP CSV Consultation is a personal, free-tier web app. It turns one team's Out of the Park Baseball screen-view CSV exports into consultation: positions, batting order, strategy sliders with per-player overrides, and development priorities. Every recommendation shows its evidence and its confidence. Single user, no commercial use.

## Read before working

- `docs/implementation-plan.md`: platform, CI/CD, database, phases and task checklists. Work in its phase order.
- `docs/implementation-basis.md`: the spec for data, import rules and models. If code and the Basis disagree, follow the Basis and flag the conflict.
- `docs/design-handoff.md` and `docs/design/boards/`: screens, states, copy and design tokens. Board HTML is reference markup, not code to run.
- `fixtures/`: real exports used as golden test data. See `fixtures/README.md` for what's present and what's still missing.

## Current phase

Phase 1, walking skeleton. Exit gate: sign in on production, save and reload a team; a pull request shows green checks and a Vercel preview.

Update this section when a phase's gate passes.

## Stack

- pnpm workspaces; TypeScript in strict mode everywhere
- `apps/web`: React + Vite single-page app; Vercel Functions in `apps/web/api/`
- `packages/core`: pure TypeScript domain logic (importer, metrics, models)
- Supabase: Postgres, Auth (GitHub sign-in in production), row-level security; migrations in `supabase/migrations/`
- Tests: Vitest (unit and golden), pgTAP (database policies), Playwright with axe (end-to-end, from Phase 3)
- CI on GitHub Actions; hosting on Vercel Hobby

## Commands

Keep these current. Run them from the repo root on Node 24. The Node major is set in three places that must agree: `.nvmrc` (CI), and `engines.node` in the root and `apps/web` `package.json` files (Vercel reads the `apps/web` one). The pnpm version comes from `packageManager` in the root `package.json`.

- Install: `pnpm install` (CI uses `pnpm install --frozen-lockfile`)
- Dev server: `pnpm dev` (Vite, `apps/web`, on http://localhost:5173). It talks to the staging project: copy `apps/web/.env.example` to `apps/web/.env.local` and fill in staging's URL and publishable key.
- Lint: `pnpm lint` (ESLint, type-aware; warnings fail)
- Format: `pnpm format` to fix, `pnpm format:check` to check (Prettier)
- Typecheck: `pnpm typecheck` (`tsc --build` over every project referenced from the root `tsconfig.json`; add each new tsconfig there)
- Test: `pnpm test`, which runs `test:core` (core's own tests, with the coverage floor on `packages/core`), then `test:apps` (every other project). `pnpm test` takes no extra arguments, so pass a filter or `-u` to `test:core`, `test:apps` or `test:watch` instead.
- Build: `pnpm build`
- Database tests: `supabase db start`, then `supabase test db` (pgTAP in `supabase/tests/`). These need Docker and the Supabase CLI, so they're optional locally; CI runs them.

CI (`.github/workflows/ci.yml`, job `ci`) runs install, lint, format check, typecheck, test and build, in that order.
`.github/workflows/db.yml` (job `db`) applies every migration to a fresh database and runs the pgTAP tests when `supabase/` changes. On `main` it pushes migrations to staging, then production (jobs `db-deploy-staging` and `db-deploy-production`), once their GitHub variables and secrets exist.

## Deployments

- Vercel project `ootp-consultation` (Hobby): Root Directory `apps/web`, Vite preset, files outside the Root Directory included in the build, Node from `apps/web/package.json`.
- Production: https://ootp-consultation.vercel.app, deployed from `main`.
- Previews: one per pull request, its URL posted on the pull request. Each deployment gets `https://ootp-consultation-<hash>-boba18.vercel.app` and each branch `https://ootp-consultation-git-<branch>-boba18.vercel.app`, so allow `https://ootp-consultation-*-boba18.vercel.app` wherever redirects are listed (Supabase Auth).

## Working rules

- One plan checklist item per branch and pull request. Tick its box in `docs/implementation-plan.md` in the same pull request.
- Before writing code, state the task's acceptance check. If a step needs something only the owner can do (an account, a dashboard setting, a secret), stop and list it.
- `packages/core` imports no DOM, network or UI framework code. Every calculation lives there, with tests.
- For each import rule, write the test against `fixtures/` before the parser code. Each row of the Basis table "Columns that need special handling" gets at least one test.
- Raw export files are the source of truth. Store them verbatim, derive everything else, and never depend on CSV row order.
- Anything prefixed `VITE_` ships to the browser, so secrets never get that prefix. Never commit `.env` files, keys or tokens.
- Database changes go only through new files in `supabase/migrations/`, applied by CI. Never edit a migration that has run, and keep each one backward compatible.
- No paid services, paid tiers, or dependencies that need a payment method.
- Local development must not require Docker. It runs against the staging Supabase project; the full Supabase stack runs in CI.
- Keep two terms distinct: "Data coverage" is the top-bar badge (Low, Moderate, High); "Estimate confidence" is the band on a recommendation.

## Corrections that override the canvas or the Basis as written

- The pitching ratings view run on hitters (`cus_pitch_pot` listing hitters) is a supplemental source. Keep its DEF Pot column, drop the rest, and log it as supplemental, not rejected.
- Luck baselines are measured per metric pair from the import: BACON vs xBACON, wOBA vs xwOBA, ERA vs xERA. In the Seattle data, BACON runs below xBACON while team wOBA and staff ERA run above their expected values, so one offset can't serve all three.
- Pitcher regression signals come from the talent estimator (FIP, SIERA, ratings); xERA is one input.
- Small-sample flags use each stat's stabilization point from the Basis, not one innings cutoff.
- Pitcher age comes from `cus_pitch_pot`.
- At a position other than the listed one, show component-based ceilings, not the listed position's DEF.
- The canvas's Dugout alignment, batting order and luck reads are placeholders. Build them from the models.

## Ask the owner first

Changing a decision in the plan's "Platform decisions" table, adding a hosting or database provider, or touching production data.
