# Proposal: Prompt verbosity levels

## Why

Both prompt builders always print everything they know: page URL, the
Environment block, per-annotation geometry and context, and (when non-empty)
the Diagnostics block. That is right for an agent doing real work, but it is a
lot of text to paste when all a reviewer wants is "here are the three
comments" - and it is a lot of text for a quick human-to-human handoff too.

## Goal

A "Prompt detail" setting with three levels, picked from the sidebar and
persisted across sessions:

- **Compact** - numbers, notes, general feedback and the page URL only. No
  Environment, no geometry, no context, no Diagnostics.
- **Standard** (default) - today's shape: Environment block, per-annotation
  geometry and the element each annotation covers.
- **Detailed** - standard, plus the Diagnostics block and, under each
  annotation that has one, its element's `text`/`classes`/`rect`.

The Diagnostics block moves from "always on when non-empty" to
detailed-only - a deliberate change from the block's original always-on
behaviour, not an oversight.

## Scope

- `src/lib/feedback.ts` - `Verbosity`, both builders take an optional
  `verbosity` (default `"standard"`).
- `src/lib/prefs.ts` (new) - `getPrefs()`/`setPrefs(partial)` over
  `chrome.storage.local` key `"prefs"`.
- `src/editor/sidebar.tsx` - a "Prompt detail" `Select` near the output
  actions.
- `src/editor/use-editor-state.ts` - `promptVerbosity` state, loaded from
  prefs on mount, persisted on change.
- `src/editor/use-exports.ts` - passes `state.promptVerbosity` to both
  builders.
- `tests/feedback.test.ts`, `tests/prefs.test.ts` (new),
  `tests/e2e/extension.spec.ts`.
- `README.md`, `CLAUDE.md`.

## Out of Scope

- Per-share verbosity (a saved share keeps whatever it was built with; the
  setting only affects new exports).
- A fourth level, or a numeric/slider control - three named levels cover the
  brief.
