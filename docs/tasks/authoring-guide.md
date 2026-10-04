# Task authoring guide

This guide is the authoring contract for OOTP Consultation tasks drafted through the hub's task-authoring server (`cao-task-author-ootp`). It turns the plan and the specs into tasks that one Claude Code session can finish, test and hand back as a pull request. The task format is `docs/tasks/task-template.md`.

## Who reads a task

| Reader      | What they have                                             | What they do                                                                                        |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The author  | This guide, the template and the sources the server lists  | Drafts, validates, renders and saves the task. Never implements it.                                 |
| The session | The rendered task and this repository, nothing else        | Builds the task on a branch, runs the checks and opens a pull request. Usually Claude Code on the web. |
| The owner   | Everything                                                 | Reviews the draft, does the owner-only steps, starts the session and merges.                        |

The session can't see the Claude Docs, the authoring conversation or the saved task folder. Put everything it needs in the task, or point to a file in this repository.

## Sources and precedence

When sources disagree, the higher one wins. Record the conflict as an unresolved fact; don't settle it silently.

1. The owner's request: scope and Git authority.
2. `CLAUDE.md`: the current phase, the working rules, and "Corrections that override the canvas or the Basis as written".
3. `docs/implementation-plan.md`: platform decisions, phases and exit gates, checklists, CI/CD, database and environments.
4. `docs/agent-knowledge-base.md` (the Knowledge Base): the spec of record for data, import rules and models. Cite its sections for every rule.
5. `docs/implementation-basis.md` (the Basis): the earlier spec, kept for the Seattle reference data and player reads that give fixture tests their expected values. Where its rules differ from the Knowledge Base, the Knowledge Base wins.
6. `docs/design-handoff.md` and `docs/design/boards/README.md` for screens (the `screens` pack).
7. `fixtures/README.md` for which exports exist, where they live and which are still missing.

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

1. One task is one unchecked checklist item in `docs/implementation-plan.md`, built on one branch as one pull request that ticks that box. Quote the item. If an item is too big for one session, split it into tasks that each leave CI green; only the last one ticks the box.
2. Work the Knowledge Base calls for that has no checklist item yet adds its item to the plan in the same pull request, under the section and phase that Knowledge Base › Delivery plan gives it. Say so in the task. Changing a platform decision, adding a provider or touching production data needs the owner first (`CLAUDE.md` › Ask the owner first).
3. Order work by the current phase in `CLAUDE.md`, then the plan's checklists, then Knowledge Base › Delivery plan › Modules by phase. Never schedule a module before its inputs exist; name what it waits for under Dependencies.
4. Cite the sections a task implements by document and heading, for example "Knowledge Base › Import contract › Columns that need special handling".
5. A task that touches an open question (Knowledge Base § 14; plan › Risks and open questions) either records the owner's answer or builds behind a setting whose default comes from Knowledge Base › Assumptions. Say which.
6. Thresholds, weights, scales, floors, gates and stabilization points are settings, each with a default, a one-line description and its source, such as "research value" or "Seattle sample". A task that hard-codes one fails review.
7. Tests come first and run on the fixtures. Each import rule's test is written before its parser code, and each row of "Columns that need special handling" that the task touches gets at least one test. Expected values come from the fixtures or the Basis's Seattle reference data, never from memory.
8. No logic keyed to a specific player, team or league. Names appear only in tests and examples.
9. Items the Knowledge Base marks as later (database dumps, trade and contract valuation, opponent-specific advice) get no tasks unless the owner promotes them.
10. Steps only the owner can do (an account, a dashboard or repository setting, a secret, an export added to `fixtures/`) are blocking preparation gaps. The session stops and lists them; it never works around them.
11. `CLAUDE.md` loads into every session, so a task doesn't restate its rules. It names the ones that decide this task's acceptance.

## Filling the template

The server generates seven sections from the draft's contract; leave them as empty strings in `sections`. Write the other four as prose.

| Template section      | Filled from                                                                                                                                         | Knowledge Base charter field |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1. Context            | Prose: the plan item quoted, its phase, the spec sections, why now, and a suggested role (architect, implementation developer, QA validator or code reviewer) | Scope, Suggested role |
| 2. Scope              | Contract `scope`: included, excluded, files to inspect, intended writes                                                                             | Scope                        |
| 3. Inputs and outputs | Prose: the files, fixtures, tables and settings read; the modules, functions, tables, migrations, endpoints or screens produced, with paths          | Inputs, Outputs              |
| 4. Requirements       | Contract `requirements`                                                                                                                             |                              |
| 5. Dependencies       | Contract `dependency` and `scenario_impact`                                                                                                         | Dependencies                 |
| 6. Open questions     | Prose: each open question or assumption touched and how it is handled, or "None"                                                                    | Open questions               |
| 7. Preparation        | Contract `capabilities`, `capability_rationale` and `preparation_gaps`                                                                              |                              |
| 8. Validation         | Contract `checks`                                                                                                                                   | Acceptance checks            |
| 9. Review             | Contract `review`                                                                                                                                   |                              |
| 10. Acceptance        | Contract `acceptance`                                                                                                                               | Acceptance checks            |
| 11. Delivery          | Prose: the branch, the commit and pull-request title, the plan box to tick, the pull-request summary and what is left for the owner                 |                              |

Contract notes:

- `task_kind` is `change` for implementation and `inspection` for a gate check or audit with no writes.
- `scope.writes` lists exact paths. A change task always writes `docs/implementation-plan.md`, to tick its box.
- `dependency` names plan items and pull requests by title. `scenario_impact` says what changes for the app's user, such as a screen or saved data, or that nothing does yet.
- Each check names its exact command, for example `pnpm test:core innings`, with the evidence and pass condition. The last check is CI on the pull request.
- `review.reviewers` stays empty, because the project has no CAO roles. `review.scope` says what the owner, or a separate code-reviewer session, checks.
- Commands in the session's own checkout need no capability. Declare one only for something outside it:

| Capability    | Use it for                                                                | Mode | Age limit | Retries |
| ------------- | ------------------------------------------------------------------------- | ---- | --------- | ------- |
| `github-pr`   | Pushing the branch, opening the pull request and reading its checks       | live | 3600 s    | 1       |
| `ci-database` | pgTAP tests, which need Docker and run only in CI's `db` job              | live | 3600 s    | 1       |
| `staging`     | Sign-in and data on the staging Supabase project, through a preview build | live | 3600 s    | 1       |

Request settings: `execution_provider` is `claude`. Unless the owner says otherwise, `git_authority` is "Task branch, commits, push and one pull request on boba-jjang/ootp-consultation; no merge, no writes to main, no force-push." Select the `core-logic` insert for `packages/core` work, `database` for `supabase/` and `screen` for screens in `apps/web`. Select the `screens` pack for screen work and `local-setup` for tooling, CI or setup.

## Validation commands

These come from `CLAUDE.md` › Commands. CI's `ci` job runs the first five in this order.

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- A narrower run: `pnpm test:core <filter>` or `pnpm test:apps <filter>`; `pnpm test` takes no arguments.
- Database tests run as `supabase test db`, which needs Docker, so CI's `db` job runs them whenever `supabase/` changes.
- End-to-end and axe tests start in Phase 3, with `e2e.yml`.

## Delivery

- Claude Code on the web creates its own branch (`claude/…`). A local session uses `<type>/<slug>`.
- Titles follow Conventional Commits, because the pull-request title becomes the squash-merge commit: `<type>(<scope>): <summary>`, for example `feat(core): parse innings as outs`.
- The pull request ticks the plan item. When a phase gate passes, it also updates `CLAUDE.md` › Current phase.
- The pull-request summary says what changed, how it was tested and what the owner must do next.
- The session never merges. The owner squash-merges once CI is green and the preview checks out.

## Definition of done

- The pull request is open with CI green (`ci`, plus `db` when `supabase/` changed) and its plan box ticked.
- Tests cover every rule the task implements, including the parsing traps and invariants it touches.
- Every new setting has a default, a one-line description and its source.
- No logic is keyed to a specific player, team or league.
- Remaining owner steps are listed in the pull-request summary.
