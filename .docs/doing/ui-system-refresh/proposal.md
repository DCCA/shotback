# Proposal: UI System Refresh (Tailwind + shadcn-style components)

## Why
Current UI is functional but visually inconsistent across popup, editor, and viewer, with duplicated surface-level CSS and limited component reuse.

## Scope
- Add Tailwind CSS infrastructure.
- Introduce reusable shadcn-style UI primitives.
- Refactor popup, editor, and viewer UI to use shared primitives and utility classes.
- Preserve existing behavior and capture/annotation workflows.

## Out of Scope
- Changes to capture, annotation geometry logic, or storage behavior.
- New product features beyond visual/UX polish.
