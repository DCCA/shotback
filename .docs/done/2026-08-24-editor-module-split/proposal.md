# Proposal: split the editor into focused modules

## Why

`src/editor/main.tsx` had grown to 1,171 lines holding every editor concern at once: URL
parsing, capture orchestration, all editor state, the SVG annotation canvas with its pointer
gestures, the sidebar controls, the comment timeline, the saved-shares list and the four export
flows. Every queued editor change (undo/redo history, design-token pass, timeline work, export
tweaks) has to edit that one file, so they cannot be reviewed independently and every diff
carries the whole file's blast radius.

## Scope

A pure move: identical behaviour, identical rendered DOM and class names.

- Extract the pure helpers (`uid`, `moveAnnotation`, `annotationCommentAnchor`, `formatBytes`,
  `shareLabel`) into `src/editor/annotation-geometry.ts` and unit-test the geometry ones.
- Extract `useEditorState()` (the shared editor state contract later changes build on),
  `AnnotationCanvas`, `Sidebar`, `CommentTimeline`, `SavedShares` and `useExports()`.
- Leave `main.tsx` as the composition root: URL parsing, `takeScreenshot`, auto-capture,
  timeline callbacks, layout.

## Non-goals

- No new features, no renamed user-visible strings, no design-token work (a later change
  replaces the hardcoded `slate-*`/`emerald-*` literals that moved as-is).
- No undo/redo: `AnnotationCanvas` gains an `onCommit` prop that `main.tsx` passes as a no-op,
  so the history change has a seam to hook into.
