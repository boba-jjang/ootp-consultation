# Task authoring guide

This guide is the authoring contract for OOTP Consultation tasks drafted through the hub's task-authoring server (`cao-task-author-ootp`). It turns the plan and the specs into tasks that CAO runs unattended: a coordinator reads the task, one developer builds it on a task branch, tests it and opens a pull request, and an independent QA role verifies the delivery. The task format is `docs/tasks/task-template.md`. The same file can also be carried out by one Claude Code session, locally or on the web, so a task stays self-contained either way.

## Who reads a task

| Reader            | Role               | What they have                                                         | What they do                                                                                                   |
| ----------------- | ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The author        | the connected AI   | This guide, the template and the sources the server lists              | Drafts, validates, renders and saves the task. Never implements it.                                            |
| The coordinator   | `ootp_code_owner`  | The rendered task, this repository and read-only GitHub operations     | Checks the task's preconditions, delegates the work, verifies every callback and reports readiness.            |
| The developer     | `ootp_developer`   | The rendered task, a task worktree and the hub's GitHub task operations | Writes the tests and the code on `task/<slug>`, runs the checks, commits, pushes and opens a draft pull request. |
| QA                | `ootp_qa`          | The rendered task, the delivery's exact commits and read-only GitHub   | Reruns the checks at the delivered commit in its own worktree and reports `ACCEPT` or `REJECT` with evidence.  |
| The owner         | you                | Everything                                                             | Reviews the draft, does the owner-only steps, launches the task and merges.                                    |

No reader but the owner can see the Claude Docs, the authoring conversation or the saved task folder. Put everything the task needs in the task, or point to a file in this repository.

## Sources and precedence

When sources disagree, the higher one wins. Record the conflict as an unresolved fact; don't settle it silently.

1. The owner's request: scope and Git authority.
2. `CLAUDE.md`: the current phase, the working rules, and "Corrections that override the canvas or the Basis as written".
3. `docs/implementation-plan.md`: platform decisions, phases and exit gates, checklists, CI/CD, database and environments. Its platform facts supersede platform text in both specs.
4. The specs:
   - `docs/agent-knowledge-base.md` (the Knowledge Base) is the spec of record. It restates the Basis for task generation; it is newer and general, with no Seattle player names, and adds the league sortable files, league percentiles, versioned header manifests and research reliability.
   - `docs/implementation-basis.md` (the Basis) keeps the Seattle reference data and player reads, which give fixture tests their expected values.
   - Cite the Knowledge Base for rules and the Basis for Seattle values. Where the Basis states a rule differently, the Knowledge Base wins.
5. `docs/design-handoff.md` and `docs/design/boards/README.md` for screens (the `screens` pack).
6. `fixtures/README.md` for which exports exist. An export that isn't there is assumed not to exist.

### Knowledge Base sections by number

The Knowledge Base refers to its own sections by number.

| §   | Section                    | §   | Section                                   |
| --- | -------------------------- | --- | ----------------------------------------- |
| 1   | Agent brief                | 9   | Defensive model                           |
| 2   | Product vision and scope   | 10  | Strategy rules                            |
| 3   | Architecture               | 11  | Lineup optimization                       |
| 4   | Data sources               | 12  | Development planner                       |
| 5   | Import contract            | 13  | Research reliability                      |
| 6   | Metrics and league context | 14  | Decisions, assumptions and open questions |
| 7   | Ratings model              | 15  | Delivery plan                             |
| 8   | League percentiles         | 16  | Glossary                                  |

## Rules for a task

1. One task is one unchecked checklist item in `docs/implementation-plan.md`, built on one task branch as one pull request that ticks that box. Quote the item. If an item is too big for one delivery, split it into tasks that each leave CI green; only the last one ticks the box.
2. Work the Knowledge Base calls for that has no checklist item yet adds its item to the plan in the same pull request, under the section and phase that Knowledge Base › Delivery plan gives it. Say so in the task. Changing a platform decision, adding a provider or touching production data needs the owner first (`CLAUDE.md` › Ask the owner first).
3. Order work by the current phase in `CLAUDE.md`, then the plan's checklists, then the build order (Knowledge Base › Delivery plan › Modules by phase). Never schedule a module before its inputs exist; name what it waits for under Dependencies.
4. Cite the sections a task implements by document and heading, for example "Knowledge Base › Import contract › Columns that need special handling".
5. A task that touches an open question (Knowledge Base § 14; plan › Risks and open questions) either records the owner's answer or builds behind a setting whose default comes from Knowledge Base › Assumptions. Say which.
6. Thresholds, weights, scales, floors, gates and stabilization points are settings, each with a default, a one-line description and its source, such as "research value" or "Seattle sample". A task that hard-codes one fails review.
7. Tests come first and run on the fixtures. Each import rule's test is written before its parser code, and each row of "Columns that need special handling" that the task touches gets at least one test. Expected values come from the fixtures or the Basis's Seattle reference data, never from memory.
8. No logic keyed to a specific player, team or league. Names appear only in tests and examples.
9. Items the Knowledge Base marks as later (database dumps, trade and contract valuation, opponent-specific advice) get no tasks unless the owner promotes them.
10. Steps only the owner can do (an account, a dashboard or repository setting, a secret) are blocking preparation gaps. The coordinator stops before delegating and lists them; nobody works around them. An export that isn't in `fixtures/` is unavailable, not a gap: build without it, as the Knowledge Base specifies.
11. `CLAUDE.md` loads into every session, so a task doesn't restate its rules. It names the ones that decide this task's acceptance.
12. The task is written for a worker that sees nothing but the task and the repository, and that no person answers while it runs. Every fact it needs is in the task or in a file it names; every judgement call is settled in Open questions.

## Filling the template

The server generates seven sections from the draft's contract; leave them as empty strings in `sections`. Write the other four as prose.

| Template section      | Filled from                                                                                                                                              | Knowledge Base charter field |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1. Context            | Prose: the plan item quoted, its phase, the spec sections it implements, and why now                                                                      | Scope                        |
| 2. Scope              | Contract `scope`: included, excluded, files to inspect, intended writes                                                                                   | Scope                        |
| 3. Inputs and outputs | Prose: the files, fixtures, tables and settings read; the modules, functions, tables, migrations, endpoints or screens produced, with paths                | Inputs, Outputs              |
| 4. Requirements       | Contract `requirements`                                                                                                                                   |                              |
| 5. Dependencies       | Contract `dependency` and `scenario_impact`                                                                                                               | Dependencies                 |
| 6. Open questions     | Prose: each open question or assumption touched and how it is handled, or "None"                                                                          | Open questions               |
| 7. Preparation        | Contract `capabilities`, `capability_rationale` and `preparation_gaps`                                                                                    |                              |
| 8. Validation         | Contract `checks`                                                                                                                                         | Acceptance checks            |
| 9. Review             | Contract `review`                                                                                                                                         |                              |
| 10. Acceptance        | Contract `acceptance`                                                                                                                                     | Acceptance checks            |
| 11. Delivery          | Prose: the task branch, the commit and pull-request title, the plan box to tick, the pull-request summary and what is left for the owner                  |                              |

Contract notes:

- `task_kind` is `change` for implementation and `inspection` for a gate check or audit with no writes.
- `scope.writes` lists exact paths. A change task always writes `docs/implementation-plan.md`, to tick its box.
- `dependency` names plan items and pull requests by title. `scenario_impact` says what changes for the app's user, such as a screen or saved data, or that nothing does yet.
- Each check names its exact command, for example `pnpm exec vitest run --project @ootp/core innings`, with the evidence and pass condition. The developer runs every check in the task worktree before its `FINAL`; QA reruns them at the delivered commit. The last check is CI on the pull request.
- `owner` is `ootp_developer` and `review.reviewers` is `["ootp_qa"]`; the server refuses any other owner or an empty reviewer list. `review.scope` says what QA verifies beyond rerunning the checks, for example that each new setting has its default, description and source.
- Commands in the worker's own worktree need no capability. Declare one only for something outside it:

| Capability    | Use it for                                                                                                                     | Mode | Age limit | Retries |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---- | --------- | ------- |
| `github-task` | The branch, commits, push and draft pull request through the hub's `github_task_prepare`, `github_task_commit`, `github_task_push` and `github_task_pr`; reading its checks with `github_pull_request` | live | 3600 s    | 1       |
| `ci-database` | pgTAP tests, which need Docker and run only in CI's `db` job                                                                   | live | 3600 s    | 1       |
| `staging`     | Sign-in and data on the staging Supabase project, through the dev server or a preview build                                    | live | 3600 s    | 1       |

Request settings: `execution_provider` is `claude`; the route is `plan-task`. Unless the owner says otherwise, `git_authority` is "Task branch, commits, push and one draft pull request on boba-jjang/ootp-consultation through the hub's github_task operations; no merge, no writes to main, no force-push." Select the `core-logic` insert for `packages/core` work, `database` for `supabase/` and `screen` for screens in `apps/web`. Select the `screens` pack for screen work and `local-setup` for tooling, CI or setup.

## Validation commands

These come from `CLAUDE.md` › Commands. CI's `ci` job runs the first five in this order.

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- A narrower run: `pnpm exec vitest run --project @ootp/core <filter>` for core, or `pnpm test:apps <filter>`; `pnpm test` takes no arguments. Don't filter `pnpm test:core`: its coverage floor covers all of core, so a filtered run always fails it. Leave coverage to a check that runs the whole of `pnpm test:core`.
- Database tests run as `supabase test db`, which needs Docker, so CI's `db` job runs them whenever `supabase/` changes.
- End-to-end and axe tests run as `pnpm e2e`, against the dev server and the staging project; `e2e.yml` runs them on every pull request.

## Delivery

- The developer works in the worktree that `github_task_prepare` returns, on `task/<lowercase-slug>`, started at the `main` commit the coordinator measured. A worktree has no dependencies or local settings of its own: `pnpm install --frozen-lockfile --prefer-offline`, and `apps/web/.env.local` copied from the project root when a check needs the dev server or staging.
- Titles follow Conventional Commits, because the pull-request title becomes the squash-merge commit: `<type>(<scope>): <summary>`, for example `feat(core): parse innings as outs`.
- The pull request ticks the plan item. When a phase gate passes, it also updates `CLAUDE.md` › Current phase.
- The pull-request summary says what changed, how it was tested and what the owner must do next.
- Nobody but the owner merges. The owner squash-merges once QA has accepted, CI is green and the preview checks out.

## Running a task

From this repository's root, with the hub installed and the profiles current (`.cao/README.md`):

```sh
.cao/bin/cao-task-launch claude /absolute/path/to/task.md --dry-run   # resolve and print; start nothing
.cao/bin/cao-task-launch claude /absolute/path/to/task.md             # launch
```

The coordinator stops, with a question posted through the hub's notifier, when the task has a blocking gap, when sources conflict, or when QA rejects twice. A Claude Code session can carry out the same task file directly when CAO is unavailable; the task's wording covers both.

## Definition of done

- The pull request is open as a draft with CI green (`ci`, plus `db` when `supabase/` changed) and its plan box ticked, and QA has accepted the delivered head.
- Tests cover every rule the task implements, including the parsing traps and invariants it touches.
- Every new setting has a default, a one-line description and its source.
- No logic is keyed to a specific player, team or league.
- Remaining owner steps are listed in the pull-request summary.
