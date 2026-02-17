# Repository Guidelines

## Project Structure & Module Organization
This repository is currently documentation-first and minimal.
- `FIREHOSE.md`: project operating principles and workflow rules.
- `AGENTS.md`: this contributor guide.
- `.docs/` (create when needed): working notes and specs.
  - `.docs/todo/`: planned work.
  - `.docs/doing/`: in-progress specs.
  - `.docs/done/`: completed specs.
- `excalidraw.log`: local/runtime artifact; do not treat as source.

Keep source-like, durable files in the repo root or a clearly named top-level folder. Keep generated or local artifacts out of version control.

## Build, Test, and Development Commands
There is no build system configured yet. Use lightweight checks:
- `ls -la`: verify expected files and structure.
- `rg --files`: list tracked workspace files quickly.
- `markdownlint "**/*.md"` (if installed): lint Markdown style.

If you add runtime code, also add a documented `build`, `test`, and `dev` command set in this file.

## Coding Style & Naming Conventions
- Use clear, direct Markdown with short sections and actionable bullets.
- Prefer ASCII unless non-ASCII is required.
- Use descriptive file/folder names in `kebab-case` (e.g., `api-contract.md`).
- Keep docs easy to scan: short paragraphs, concrete examples, no filler.

For code additions, follow language-standard formatters/linters and document them in this guide.

## Testing Guidelines
Current repository content is documentation, so validation is mostly structural:
- Confirm links, paths, and command examples are correct.
- Run Markdown linting when available.
- Review changes for clarity and consistency with `FIREHOSE.md`.

If tests are introduced later, place them in a top-level `tests/` folder or language-standard location and adopt explicit naming (e.g., `*.test.*`).

## Commit & Pull Request Guidelines
Git metadata is not available in this workspace snapshot, so no historical convention can be inferred here.
Use these defaults:
- Commits: imperative, concise subject (e.g., `docs: add contributor guide`).
- Keep commits focused and limited to one change theme.
- PRs: include purpose, scope, validation steps, and any follow-up work.
- Link related issues and include screenshots only when visual output changes.

## Security & Configuration Tips
- Do not commit secrets, tokens, or machine-specific logs.
- Keep `.gitignore` updated for local artifacts (for example, logs and temporary files).
