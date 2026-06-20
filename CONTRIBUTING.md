# Contributing to Shotback

## Development Flow

This repo follows [`FIREHOSE.md`](FIREHOSE.md). Read it before making changes.

1. For each non-trivial change, create a folder `.docs/doing/<change-name>/`
   with `proposal.md`, `spec.md`, `design.md`, and `tasks.md`.
2. Keep PRD/context aligned in `.docs/PRD.md`.
3. When complete, add a `completion-summary.md` and move the folder to
   `.docs/done/<date>-<change-name>/`; keep `.docs/todo/` in sync.

## Setup

```bash
npm install
npm run check   # typecheck + lint + test + build
```

Useful individual commands: `npm run typecheck`, `npm run lint`,
`npm run format`, `npm run test`, `npm run build`.

Load `dist/` via `chrome://extensions` for manual verification.

## Coding Guidelines

- Use TypeScript with strict, readable logic.
- Keep blast radius small and changes focused.
- Prefer explicit names over clever shortcuts.
- Keep UI copy clear and action-oriented.

## Validation Checklist

Before opening a PR:

- `npm run check` passes (typecheck, lint, test, build)
- `npm run format:check` passes
- Core flow works manually:
  - capture page
  - annotate + comment
  - timeline select/remove
  - local share viewer
  - external LLM fallback

## Pull Request Expectations

Include:

- What changed and why
- Testing performed
- Any limitations or follow-ups
- Screenshots for UI changes
