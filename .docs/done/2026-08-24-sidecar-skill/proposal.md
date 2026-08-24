# Proposal: JSON sidecar and a shotback skill

## Why

The Claude Code handoff hands an agent a PNG and a prose prompt. Everything the
extension knows - which pin is which, the rect each annotation covers, the CSS
path and React component under it, what the page failed to load - is flattened
into English the agent has to re-parse, and the geometry is only useful if it
opens the image and measures. The extension already holds all of it as data.

## Goal

**Copy for Claude Code** writes two files with the same timestamp:

```text
Downloads/shotback/cap-<ts>.png     the annotated capture
Downloads/shotback/cap-<ts>.json    the same review as data
```

and the copied prompt names both:

```text
Review this screenshot: /mnt/c/Users/you/Downloads/shotback/cap-1756052403118.png
Machine-readable annotations (selectors, rects, diagnostics): /mnt/c/Users/you/Downloads/shotback/cap-1756052403118.json
```

A repo-shipped skill (`skills/shotback/SKILL.md`) tells an agent how to use the
pair: read the JSON, find the source from `cssPath`/`component`, treat
`normalizedRect` as layout position, fold the diagnostics into the fix, and open
the PNG only when the selectors do not settle it.

## Scope

- `src/lib/sidecar.ts` - the `Sidecar` type and the pure `buildSidecar`.
- `src/lib/numbering.ts` - gains `annotationBounds`, moved out of
  `src/editor/annotation-geometry.ts` so `src/lib` does not import `src/editor`.
- `src/lib/feedback.ts` - `buildClaudeCodePrompt` takes an optional
  `sidecarPath` and renders the machine-readable line.
- `src/editor/use-exports.ts` - `downloadBlob` (shared by both downloads) and
  the best-effort `saveSidecar`.
- `skills/shotback/SKILL.md`, `README.md`, `CLAUDE.md`, `SECURITY.md`.
- `tests/sidecar.test.ts`, `tests/feedback.test.ts`, `tests/numbering.test.ts`,
  `tests/e2e/extension.spec.ts`.

## Out of Scope

- Verbosity levels (Task 18).
- A sidecar for the cloud-LLM export: that path has nowhere to put a second
  file the user must attach by hand.
- Persisting the sidecar on saved shares - it is a handoff artifact, not state.
- `version` negotiation. There is one version, `1`; a reader that finds
  something else should say so rather than guess.

## Non-goals that shaped the design

- **The sidecar must never cost the user their prompt.** Writing it is best
  effort: if the download fails or its path cannot be resolved, the prompt is
  still copied, without the machine-readable line, and the status says so.
- **No new permission.** `downloads` already covers writing the PNG and reading
  back its path; the sidecar rides the same code path.
