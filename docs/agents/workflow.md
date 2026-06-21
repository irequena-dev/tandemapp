# Workflow & principles

## Plan vs. act

- **New features / architectural decisions**: plan first. Enter plan mode, write the plan to `tasks/todo.md` with checkable items, and check in before implementing. For domain/architecture decisions, lean on the `grill-with-docs`, `to-prd` and `to-issues` skills and keep `CONTEXT.md`/ADRs current.
- **Bug reports / failing CI**: just fix it autonomously. Point at the logs/errors/failing tests and resolve them — no hand-holding, no context switching for the user. (TDD still applies: write the failing test first, then fix. See [testing](./testing.md).)
- If something goes sideways mid-task, STOP and re-plan.

## Subagents

- Once a plan is approved, prefer routing implementation through subagents — one task per subagent. Offload research, exploration, and parallel work too.
- The main thread plans, reviews, and verifies (runs tests, lint, typecheck against the plan), keeping its own context clean.

## Verification before done

- Never mark a task complete without proving it works: run `pnpm lint`, the typecheck, and the relevant tests.
- Diff behavior between `main` and your changes when relevant.

## Self-improvement

- After any correction from the user, record the pattern in `tasks/lessons.md` and review lessons at session start.

## Track & document

- Mark `tasks/todo.md` items complete as you go; give a high-level summary at each step and a review section when done.

## Core principles

- **Ubiquitous Language**: always use the `CONTEXT.md` terms; respect the ADRs in `docs/adr/` and update them if a decision changes.
- **Minimal impact**: touch only what's necessary; find root causes rather than temporary fixes.
- **No secrets in the repo**: `*.env.local` stays gitignored.

## Communication

- Be extremely concise. Sacrifice grammar for the sake of concision.
