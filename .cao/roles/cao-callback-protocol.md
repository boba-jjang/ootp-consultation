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
