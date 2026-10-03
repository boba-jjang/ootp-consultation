Pick up the next task from the implementation plan.

1. Read `CLAUDE.md`, then `docs/implementation-plan.md`. Find the first unchecked task in the current phase that can be done in code. An earlier unchecked task that only the owner can do (an account, a dashboard setting, a secret) doesn't block it unless this task depends on it.
2. State the task, its acceptance check, and anything the owner must do first. If the owner must act first, stop there.
3. List the files you'll add or change and the tests you'll write first.
4. Implement it on a new branch. Run lint, typecheck and tests, and fix what fails.
5. Tick the task in `docs/implementation-plan.md`. End with a pull-request summary: what changed, how it was tested, and what the owner needs to do next.
