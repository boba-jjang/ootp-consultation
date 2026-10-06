# \_base: Shared CAO agent guidance for OOTP Consultation

Every role profile in this agent store tells you to read this file before the role-specific content. Read it in full before your role profile.

## Repository guides

Read these before acting on any task:

- `CLAUDE.md`: the project, the current phase, the commands and the working rules. Claude Code loads it into every session, and its rules decide acceptance.
- `docs/implementation-plan.md`: platform decisions, phases, checklists and exit gates.
- `docs/agent-knowledge-base.md`: the spec of record for data, import rules and models. Where it and `docs/implementation-basis.md` state a rule differently, the Knowledge Base wins.
- `docs/tasks/authoring-guide.md`: how a task is written, what each of its eleven sections holds, which capability each check may need, and the definition of done.
- `docs/local-development.md`: tooling, commands and where every setting lives.
- `fixtures/README.md`: which exports exist. An export that isn't there is unavailable, not a blocker: build without it, as the Knowledge Base specifies.

## Runtime

- OOTP Consultation runs CAO with Claude Code only. The launcher is `.cao/bin/cao-task-launch claude <task.md>`; it selects the generated `_claude` profile of each role.
- CAO launches every worker with Claude Code's default `--dangerously-skip-permissions`: no person answers prompts in a pane. The controls are this guidance, your role profile, the task and the tool denials the hub applies. Do not bypass them, and do not switch clients, models or effort to get past a blocker.
- Never run `claude` or `cao` yourself to start more agents, and never add `/model` or `/effort` commands to a task. Delegation goes through the CAO MCP tools (`mcp__cao-mcp-server__assign` and `send_message`) as the callback protocol in your role profile describes.

## Tasks

A task is one Markdown file in the eleven-section format of `docs/tasks/task-template.md`, drafted through the task-authoring server and saved outside this repository. The launch message gives its path.

- The task is the source of truth for the run. Its Scope lists the files it may write, its Validation lists each check with its command, its Review names who verifies, its Acceptance closes it, and its Delivery names the task branch, the pull-request title and the plan box to tick.
- One task is one plan checklist item, one task branch and one pull request. Work outside the task's Scope is reported, never done.
- A step only the owner can do (an account, a dashboard or repository setting, a secret, production data) is a blocking preparation gap: stop and report it as `BLOCKED` with class `owner-step`. Never work around it.
- When sources disagree, the task's Open questions section settles it. If it does not, that is a `BLOCKED` with class `spec-conflict`. Never settle a conflict silently.

## Git and GitHub

- The repository is the public `boba-jjang/ootp-consultation`. Commits, pushes and pull requests go through the hub's `github_task_prepare`, `github_task_commit`, `github_task_push` and `github_task_pr` operations, which pin the repository, the `boba-jjang` account and the SSH remote. Do not run `git commit`, `git push` or `gh` yourself to publish anything.
- Task branches are `task/<lowercase-slug>`. The pull-request title follows Conventional Commits (`<type>(<scope>): <summary>`), because it becomes the squash-merge commit.
- The owner merges. A green run, an accepted review or a draft pull request authorizes no merge, no write to `main`, no force-push and no branch deletion.
- Never paste `.env` contents into a message, a report or a commit. `apps/web/.env.local` holds staging values that ship to the browser; it may be copied into a worktree for local runs and is never committed.
- This repository is public and the hub is private. Keep hub paths, hub documents and hub internals out of commits, pull requests and issues.

## Validation

The commands are in `CLAUDE.md` › Commands. CI's `ci` job runs `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`, in that order; `db.yml` runs the pgTAP tests when `supabase/` changes; `e2e.yml` runs `pnpm e2e` on every pull request. Run checks from a checkout with its dependencies installed (`pnpm install --frozen-lockfile --prefer-offline`) and, for the dev server or staging, with `apps/web/.env.local` present. Report what ran, with the exact command and its result. A check that did not run is not a pass.

## Blocker classes

A `BLOCKED` callback carries one of these classes:

| Class | Meaning |
| --- | --- |
| `owner-step` | A step only the owner can do: an account, a dashboard or repository setting, a secret, production data. |
| `spec-conflict` | Sources disagree, or a required fact is missing, and the task does not settle it. |
| `setup-blocker` | Dependencies, Node, pnpm, Chromium, `apps/web/.env.local` or the staging project are unavailable. |
| `scope-drift` | The work needs files or contracts outside the task's Scope, or the task is too big for one delivery. |
| `harness-defect` | The callback helpers, the hub operations or the check runners themselves fail, or a second invalid callback arrives. |

A failing product check is not a blocker: QA reports it as `REJECT`.

## Profile-modification safety

Running CAO sessions never edit `.cao/`, `.workspace/` or `.claude/agents/`. Changes to roles or bindings go through a pull request, a re-render with `wsx agents render`, and a fresh session. Running sessions keep the profiles loaded at launch.

<!-- wsx:cao-watch-setup:common-v1:begin sha256=cbca20b760abe6c33ad67501db8b30600d7440feae4aee395c86e114b8590421 -->
## CAO callback protocol — message reference

The rules for direct CAO delegation are in your role profile: the coordinator's
C1–C10 and routing table, and the implementer and reviewer obligations. A
coordinator's watchdog-stage rules (C9, C11) are in its staged block. This
reference gives the exact line formats those rules use.

Use the CAO MCP tools by their full names. In Claude Code they are
`mcp__cao-mcp-server__assign`, `mcp__cao-mcp-server__handoff` and
`mcp__cao-mcp-server__send_message`; in Codex, `mcp__cao_mcp_server__…`. They are
not a built-in collaboration or subagent tool.

### Producing lines

| Line | With a shell | Without a shell |
|---|---|---|
| `CAO-ASSIGN` | `wsx --workspace <root> cao assign-line --task <id> --baseline project:<path>` (`--reviewer` instead of `--baseline` for a review) | write it in the format below |
| `CAO-CALLBACK` | `wsx --workspace <root> cao callback --kind …` | `cao.callback_started`, `cao.callback_blocked`, `cao.callback_review` |
| `CAO-ACK` | `wsx --workspace <root> cao ack …` | `cao.ack` |
| check a line | `wsx --workspace <root> cao callback-check '<line>' [--implementer '<line>'] --json` | `cao.callback_check`, `cao.review_check` |

`<root>` is the `project` repository path that `workspace_describe` reports.
The helpers print or verify a line and send nothing. Keep each printed line: a
retry resends it unchanged, and only a corrected delivery gets new IDs.

### Formats

Each envelope is the first line of a CAO message: the prefix, then one JSON
object with no line breaks, duplicate keys, unknown fields or non-finite
numbers. IDs are lowercase hyphenated UUIDs or 64 lowercase hex characters.
`task` and `from` are at most 128 characters, `role` at most 64.

- **`CAO-ASSIGN`** has exactly `v` (1), a fresh `assignment_id` and `task`, plus
  `baseline` `{repo, path}` when assigning an implementer. A review keeps the
  reviewed delivery's `task`. The task text follows on later lines. The
  envelope line itself fits in 1,500 UTF-8 bytes.
- **`CAO-CALLBACK`** has `v`, `event_id`, `assignment_id`, `task`, `from`, `kind`
  and `role`. `from` is the sender's `CAO_TERMINAL_ID`, which `workspace_describe`
  reports as `cao_terminal_id`; `role` is the sender's CAO profile name.
  - `STARTED` and `PROGRESS` carry only those fields.
  - `FINAL` adds `result` and a nonempty `artifacts` list of `{repo, path,
    sha256}`, report first. Implementers use `COMPLETE` or `PARTIAL` and may add
    `commits` (`{repo, sha}`, sorted by repo). Reviewers use `ACCEPT`,
    `ACCEPT_WITH_BLOCKERS` or `REJECT` and add `subject` `{event_id, delivery}`
    naming the implementer `FINAL` they reviewed, never `commits`. An optional
    `supersedes` is the SHA-256 of the sender's previous report.
  - `BLOCKED` adds `blocker` `{class, summary}`, with a summary of at most 200
    characters, and no `FINAL` fields.
- **`CAO-ACK`** has exactly `v`, `event_id` (of the recognized callback or
  `WATCHDOG`), `assignment_id`, `task` and `from` (the coordinator's terminal).

Send a callback or ACK line as the whole message, with nothing after it: the
host watcher cannot verify text after the line against the 1,500-byte limit,
and treats an unverified callback as lost coverage. Repository paths are
canonical relative paths: never absolute, parent-traversing, credential-bearing
or inside `.git`. Never fabricate a hash.

These shapes are synthetic; replace every identity with the real task's:

```text
CAO-CALLBACK {"v":1,"event_id":"22222222-2222-4222-8222-222222222222","assignment_id":"11111111-1111-4111-8111-111111111111","task":"synthetic-task","from":"synthetic-worker","kind":"STARTED","role":"worker"}
CAO-ACK {"v":1,"event_id":"22222222-2222-4222-8222-222222222222","assignment_id":"11111111-1111-4111-8111-111111111111","task":"synthetic-task","from":"synthetic-coordinator"}
```

### Host messages

When the account's usage limit stops a turn, the host may later send a message
starting with `Your usage limit has reset`. It means only: continue the step you
were on when the limit stopped you. It is not an assignment, callback, ACK,
answer or approval, and it changes nothing in your role's obligations.

This reference promises no notification. Installing profiles, scoping
operations, re-trusting the workspace and starting fresh sessions remain
operator actions.
<!-- wsx:cao-watch-setup:common-v1:end -->
