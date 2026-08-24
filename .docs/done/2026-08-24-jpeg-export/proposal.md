# Proposal: JPEG export and size readout

## Why

Every export is a PNG today, and PNG is the wrong default for a photo-heavy
capture pasted into a chat window or attached to an issue - it is often several
times the size a lossy JPEG would be for the same screenshot, and the user has
no way to see what an export actually weighs before or after sending it
somewhere.

## Goal

- A sidebar **"Export format"** setting (`PNG` default, `JPEG`) that Download,
  Prepare for Cloud LLM and Copy for Claude Code honour - Copy Image and the
  saved share/viewer stay PNG always, because clipboard `image/jpeg` support is
  inconsistent and a share link is meant to render everywhere.
- JPEG is encoded at a fixed quality (0.9); there is no quality slider.
- A muted sidebar line, **"Last export: N KB"**, appears after any export and
  reflects the real size of the data URL it produced.

## Scope

- `src/lib/annotate.ts` - `exportAnnotatedImage`'s `format`/`quality` options,
  the white-fill-before-draw for JPEG (no alpha channel), `dataUrlByteLength`.
- `src/lib/prefs.ts` - `exportFormat`.
- `src/lib/sidecar.ts` - optional `imageFormat`, `version` unchanged.
- `src/editor/use-editor-state.ts` - `exportFormat`/`setExportFormat` (loaded
  from and persisted to prefs, like `promptVerbosity`), `lastExportSize`.
- `src/editor/use-exports.ts` - `download`, `prepareExternalLlmPackage` and
  `copyForClaudeCode` pass `format`; every export sets `lastExportSize`;
  filenames swap `.png` for `.jpg` when the format is JPEG.
- `src/editor/sidebar.tsx` - the "Export format" Select, the size readout, the
  Download button's label following the format.
- `src/editor/main.tsx` - clears `lastExportSize` on a new capture.
- `tests/annotate.test.ts`, `tests/prefs.test.ts`, `tests/sidecar.test.ts`,
  `tests/e2e/extension.spec.ts`.
- `README.md`, `CLAUDE.md`.

## Out of Scope

- A quality slider or any other JPEG-specific control.
- Changing the PNG-only clipboard copy or the PNG-only saved share.
- Renaming the existing `download`/`prepareExternalLlmPackage` filename
  prefixes (`shotback-`, `shotback-llm-`) - only the extension changes.
