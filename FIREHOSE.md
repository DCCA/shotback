# FIREHOSE PRINCIPLES
These are the principles you must follow when working on this project.
These rules are non-negotiable. If a change is needed, ask the user first.

## .docs

- Use this folder as a notes area.
- Keep long-term notes and context here.
- Write docs for LLM readability.
- If `.docs/` does not exist, create it.
- Add `.docs/` to `.gitignore`.

## GIT

- Follow Git best practices.
- Commit only your own changes.
- Keep `.gitignore` updated with files that should not be tracked.
- If there is no `.gitignore`, create one.
- Make sure the `.gitignore` is updated regularly.

## Code

- Keep code simple.
- Make code understandable for non-technical readers, using comments when needed.
- Follow coding best practices.
- Plan, review, and improve your approach before implementation.
- Use a test-driven approach when possible.
- Always check and test your code before finishing a task.

## Planning

- Make sure scope is clear before implementation.
- Ask the user when clarification is needed.
- Create a to-do list before implementing.
- Create a minimal spec for what you are about to implement.
- Manage specs in:
	- `.docs/todo` for backlog items.
	- `.docs/doing` for specs in progress.
	- `.docs/done` for completed work.
- Keep these docs up to date at all times.

## PRD
- Use `.docs/PRD.md` as the starting file for any project.
- If it does not exist, ask the user to create it.
- Use product management best practices when creating it.
- Make sure project context is clear before implementation starts.
- Keep this doc updated over time.

## AI Collaboration

- Use plain, direct language in all responses and plans.
- Do not use prompt theater or over-engineered instructions.
- If impact is unclear, propose 2-3 options before making changes.
- Keep blast radius small: prefer focused changes that are easy to review and revert.
- If work takes longer than expected, stop and provide a status update before continuing.
- Work in short loops: discuss → implement → test → refine.
- After each feature or bug fix (except pure UI tweaks), add or run relevant tests.
- Preserve intent for future runs by documenting tricky logic with concise notes/comments.