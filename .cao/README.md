# CAO for OOTP Consultation

Tasks drafted by the task-authoring server run unattended through CAO (the CLI agent orchestrator) with the hub's `wsx` launcher. This directory, with `.workspace/`, binds the hub's shared coordination rules to this project's roles. The hub itself is a separate, private repository; nothing here depends on its contents beyond the installed `wsx` commands.

## Layout

```text
.workspace/
  profile.json                  workspace binding: repositories, resources, operation files
  operations.json               declared commands: pnpm checks and the GitHub read/task operations
  cao-watch-operations.json     hub-managed: cao.observe, artifact.sha256, human.reply (watch-setup)
  cao-protocol-operations.json  hub-managed: callback helpers and the QA report store (protocol-setup)
  launch.json                   what `wsx cao-launch` sends and watches
  role-bindings.json            roles, their hub operations, launch roots and pinned guides
  agent-contract.json           role kinds, tools and execution policies
  native-agents.json            tool lists for the generated .claude/agents/ files
  task-authoring.json           the task-authoring route (plan-task) and prompt packs
.cao/
  roles/                        editable role sources: project.md (the base), one file per role,
                                cao-callback-protocol.md (hub-managed message reference)
  agent_store/                  generated profiles that CAO installs and launches; never edit
  bin/cao-task-launch           the launcher, a shim to `wsx cao-launch`
  bin/cao-session-capture       pane transcript capture while a session runs
.claude/agents/                 generated native agents for Claude Code sessions; never edit
build/                          Git-ignored: task worktrees, QA worktrees, session evidence, reports
```

## Roles

| Role              | Kind        | Writes                                       | Hub operations                                                    |
| ----------------- | ----------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `ootp_code_owner` | coordinator | nothing                                      | GitHub reads, `cao.observe`, callback checks and ACKs, `human.reply` |
| `ootp_developer`  | implementer | its task worktree under `build/task-worktrees/` | GitHub reads, `github.task_prepare` / `task_commit` / `task_push` / `task_pr` |
| `ootp_qa`         | reviewer    | its QA worktree and report only              | GitHub reads, `cao.report_store`                                  |

Under Claude Code each role launches as its generated `_claude` variant; the coordinator's variant has no shell and uses its scoped hub operations instead.

## Launch

From this repository's root, with the profiles installed and the workspace trusted:

```sh
.cao/bin/cao-task-launch claude /absolute/path/to/task.md --dry-run   # resolve and print; start nothing
.cao/bin/cao-task-launch claude /absolute/path/to/task.md             # launch; the watcher reports to Slack
```

`CAO_CAO_AGENT` selects another coordinator role; the default is `ootp_code_owner`. The watcher runs in watchdog mode, notifies through the `cao` route and relays a coordinator's `HUMAN-INPUT` question to Slack for up to 30 minutes, with a chat.

## Setup on a machine

Once per checkout, after the hub's `wsx` is installed:

```sh
wsx agents check                          # generated profiles match the sources
wsx agents install-plan                   # what installation would write
wsx agents sync --expect-plan <plan_sha>  # install the profiles into CAO's store
wsx agents installed
wsx trust                                 # record the configuration digest
wsx cao claude-hooks install              # the hub's observation hooks into .claude/settings.json
```

Trust, the installed profiles and the hooks' install manifest are host state, not repository content.

## After editing a role, a binding or a pinned guide

`CLAUDE.md` and `docs/tasks/authoring-guide.md` are pinned generation inputs, like everything under `.cao/roles/` and the `.workspace/` bindings. Editing any of them stales `.cao/agent_store/generation.json`, and every launch refuses until the generation is re-rendered from this checkout. Render in the primary checkout, never in a worktree: the profiles embed the checkout's absolute path.

```sh
wsx agents plan                            # the change inventory and its plan_sha256
wsx agents render --expect-plan <plan_sha>
wsx agents check
```

Commit the regenerated files in the same pull request as the edit. After the merge: `wsx agents install-plan`, `wsx agents sync --expect-plan <sha>`, then `wsx trust` if the digest changed, and start fresh sessions.

## What the generated files contain

The generated profiles embed this checkout's absolute path, the pinned hub command names and the role texts. They are reproducible from the sources here with `wsx agents render`, and `wsx agents check` proves it. They hold no credentials: GitHub access comes from the host's own `gh` login for `boba-jjang`, resolved inside the hub's child process and never written anywhere.
