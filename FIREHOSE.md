# FIREHOSE PRINCIPLES
These are the operating rules for this project.
They are non-negotiable unless the user explicitly approves a change.

## Core Philosophy (OpenSpec-lite)

- Be fluid, not rigid: update plan/spec/tasks as you learn.
- Be iterative, not waterfall: refine intent during implementation.
- Be easy, not complex: choose the simplest process that preserves clarity.
- Be brownfield-first: describe deltas to existing behavior, not full rewrites.
- Keep one logical unit of work per change.

## .docs

- Use `.docs/` for long-lived project context and specs.
- Write for human + LLM readability (short sections, explicit headings).
- If `.docs/` does not exist, create it.
- Do **not** add `.docs/` to `.gitignore`; this folder is part of project source-of-truth.
- If needed, ignore only ephemeral paths (for example `.docs/tmp/`, `.docs/.cache/`, `.docs/drafts/`).

### Suggested structure

- `.docs/PRD.md` → product intent and scope.
- `.docs/todo/` → proposed changes not started.
- `.docs/doing/` → active changes.
- `.docs/done/` → completed changes with full history.

For each change, create one folder:

```text
.docs/doing/<change-name>/
	proposal.md   # why + scope
	spec.md       # requirements + scenarios (what)
	design.md     # technical approach (how)
	tasks.md      # checklist (execution)
```

## Planning & Spec Rules

- Clarify scope before coding; ask the user when ambiguity affects outcomes.
- Start every non-trivial task with `proposal.md` and `tasks.md`.
- Keep changes focused; if scope/intent shifts significantly, start a new change folder.
- Track tasks with checkboxes and hierarchical numbering (e.g., 1.1, 1.2).
- Keep artifacts synced with reality (do not let docs drift).

### Requirement format (in `spec.md`)

- Write requirements with RFC 2119 keywords (`MUST`, `SHALL`, `SHOULD`, `MAY`).
- Each requirement must include at least one scenario.
- Use Given/When/Then scenarios, including happy path and edge cases.

Template:

```markdown
### Requirement: Descriptive Name
The system SHALL ...

#### Scenario: Example
- GIVEN ...
- WHEN ...
- THEN ...
- AND ...
```

## Code

- Keep code simple, explicit, and easy to review.
- Prefer small diffs with low blast radius and clear rollback paths.
- Follow existing project conventions before introducing new patterns.
- Add concise comments only where intent is non-obvious.
- Use test-driven development when practical.

## Verification & Done Criteria

Before moving a change from `.docs/doing/` to `.docs/done/`:

- All planned tasks are complete or explicitly deferred.
- Implementation matches requirements and scenarios.
- Relevant tests are added/updated and pass (except pure UI tweaks where agreed).
- Design notes reflect final technical decisions.
- A short completion summary is added (what changed, risks, follow-ups).

## Git

- Follow Git best practices.
- Commit only your own changes.
- Keep `.gitignore` current; create it if missing.
- Keep commits focused and reviewable.

## PRD

- Use `.docs/PRD.md` as the entry point for project context.
- If it does not exist, ask the user to create it.
- Keep goals, constraints, and non-goals current over time.

## AI Collaboration

- Use plain, direct language.
- Avoid prompt theater and over-engineered instructions.
- If impact is unclear, present 2-3 options before changing code.
- Work in short loops: discuss → implement → test → refine.
- If work runs long, stop and provide a status update.
- Preserve intent with concise, high-signal notes.