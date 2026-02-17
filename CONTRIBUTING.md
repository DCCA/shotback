# Contributing to Shotback

## Development Flow
1. Create/update a task in `.docs/doing/current-task.md` before major changes.
2. Keep PRD/context aligned in `.docs/PRD.md`.
3. Move completed work notes to `.docs/done/` and next items to `.docs/todo/`.

## Setup
```bash
npm install
npm run test
npm run build
```

Load `dist/` via `chrome://extensions` for manual verification.

## Coding Guidelines
- Use TypeScript with strict, readable logic.
- Keep blast radius small and changes focused.
- Prefer explicit names over clever shortcuts.
- Keep UI copy clear and action-oriented.

## Validation Checklist
Before opening a PR:
- `npm run test` passes
- `npm run build` passes
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
