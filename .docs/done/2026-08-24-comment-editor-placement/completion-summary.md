# Completion Summary

## What shipped

- `src/lib/editor-placement.ts` (new) - `placeInlineEditor`: below the shape, left-aligned, flips above near the bottom edge, clamped 10px inside the image.
- `src/editor/annotation-geometry.ts` - `annotationCommentAnchor` deleted (its only caller was the canvas line this change replaced), `annotationBounds` added.
- `src/editor/annotation-canvas.tsx` - placement from `placeInlineEditor(annotationBounds(...))`; `commitNewAnnotation` wraps the create/select/focus state updates in `flushSync`; the focus effect is a `useLayoutEffect`; the arrowhead is an explicit `<polygon>`.
- `src/lib/annotate.ts` - `arrowHeadPoints` exported and used by both the canvas polygon and the export's `drawArrowHead`.

## Tests

- `tests/editor-placement.test.ts` (new, 3 cases) and 3 `annotationBounds` cases: RED first (`annotationBounds is not a function`, module `editor-placement` missing), then green.
- `tests/e2e/extension.spec.ts` - the `smooth` capture test now draws a box and types `Chart` with no wait, asserting the timeline row reads exactly `Chart`.

**The focus race did not reproduce in headless Chromium.** With the old `useEffect` + un-batched `setState` code built into `dist/`, the new e2e passed: Playwright's `keyboard.type` sends each key over a separate CDP round trip, which is long enough for the effect to flush. Removing the focus call entirely (both `focus()` and `select()` - note `select()` focuses too) does turn the test red with `(no comment)`, so the assertion does guard focus. The `useLayoutEffect` + `flushSync` change was made regardless: it closes the gap the review reproduced by hand ("hart" for "Chart").

## Gates

- `npm run check` - typecheck, lint, 77 unit tests in 10 files, build: green.
- `npm run format:check` - clean.
- `npm run test:e2e` - 6/6 passed.
- `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - 0 hits.

## Visual verification

Screenshots (light theme, real unpacked extension, real capture) in
`.superpowers/sdd/2026-08-23-fix-it-all-plan/task-6-shots/`:

- `box-selected.png` - box drawn in the lower right; the editor sits directly under the box, left edge aligned with the box's, clear of the outline, handles and pin. The typed comment reads "Box near the right edge" in full (first character intact).
- `box-bottom-flip.png` - box at the very bottom of the capture; the editor flipped **above** it and stays inside the image.
- `arrow-selected.png` - the arrowhead now renders in the annotation red, matching the line; the editor sits below the arrow's bounding box, off the stroke.
