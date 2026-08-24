# Completion summary: editor module split

## What moved where

| File                                | Lines | Responsibility                                                                                             |
| ----------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------- |
| `src/editor/main.tsx`               |   129 | Composition root: URL params, `takeScreenshot`, auto-capture, timeline callbacks, layout, `createRoot`.      |
| `src/editor/use-editor-state.ts`    |    82 | `EditorState` interface + `useEditorState()`: all shared editor state.                                       |
| `src/editor/annotation-canvas.tsx`  |   589 | Image + SVG canvas, pointer gestures (draft/drag/resize), inline comment editor, Esc/Del shortcuts.           |
| `src/editor/sidebar.tsx`            |   189 | Capture button, interaction/tool selects, colour, general feedback, action buttons, progress/status.         |
| `src/editor/comment-timeline.tsx`   |    68 | Comment Timeline section.                                                                                    |
| `src/editor/saved-shares.tsx`       |    79 | Saved Shares section (owns its own show/hide toggle).                                                        |
| `src/editor/use-exports.ts`         |   244 | `download`, `prepareExternalLlmPackage`, `copyForClaudeCode`, `createShareUrl`, saved-share list, `resolveDownloadPath`. |
| `src/editor/annotation-geometry.ts` |    50 | Pure helpers: `uid`, `moveAnnotation`, `annotationCommentAnchor`, `formatBytes`, `shareLabel`.                |
| `tests/annotation-geometry.test.ts` |    50 | Unit tests for `moveAnnotation` / `annotationCommentAnchor`.                                                 |

`main.tsx`: 1,171 -> 129 lines. Editor total 1,171 -> 1,430 lines (the growth is imports,
prop-type declarations and the state contract).

State ownership: `useEditorState` holds everything shared; transient pointer-gesture state
(`draft`, `drag`, `resize`) is private to `AnnotationCanvas`; the saved-shares show/hide toggle
is private to `SavedShares`; `savedShares` lives in `useExports`. `EditorState` also carries
`progress`/`setProgress` and `shareUrl`/`setShareUrl` because `takeScreenshot` (in `main.tsx`)
and `useExports` both write them.

## Deliberate deviations (behaviour-equivalent)

- `annotationCommentAnchor` now returns `{ x, y }` instead of `{ x, y } | null`; every branch
  always returned an object, so the `&& anchor` guards in the canvas JSX went away.
- Functional `setSelectedId` updates became plain assignments guarded by the current value
  (the setter is typed `(id: string | null) => void` in `EditorState`). Both callers are
  synchronous event handlers with a fresh render closure, so the result is identical.
  `setShareUrl` kept its functional updater (`EditorState` types it as
  `React.Dispatch<React.SetStateAction<string>>`) because `removeSavedShare` reads it after
  two awaits, where a captured snapshot would be stale.
- `takeScreenshot` no longer clears `draft`/`drag`/`resize` (now canvas-private), and the
  sidebar/timeline removers no longer clear `resize`. A pointer gesture cannot survive either
  action: reaching those buttons moves the pointer off the SVG, which fires `pointerleave` ->
  `onCanvasPointerUp` and ends the gesture. The reachable case - pressing Delete during a
  resize drag - still clears `resize` inside the keyboard handler, as before.
- The `Delete`/`Backspace` handler reads `selectedId` from the render closure instead of a
  ref (the ref write during render trips `react-hooks/refs`). The listener is now re-registered
  when the selection changes; behaviour is unchanged.

## Risks

- The refactor is not covered by unit tests beyond the geometry helpers; the safety net is the
  Playwright e2e suite (5/5 green, including a real scroll-and-stitch capture) plus a manual
  pass on annotate/comment/timeline/export flows.
- `annotation-canvas.tsx` is still large (589 lines) - almost all of it is the SVG markup for
  the three annotation kinds. Splitting the per-annotation rendering is left to a later change.

## Follow-ups

- `onCommit` is a no-op today; the undo/redo change wires it to a history stack.
- The hardcoded `slate-*`/`emerald-*`/`red-*` literals moved as-is and are replaced by the
  design-token change.
