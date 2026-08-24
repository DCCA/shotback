# Tasks

- [x] 1.1 Failing unit test for `placeInlineEditor` (`tests/editor-placement.test.ts`).
- [x] 1.2 Failing unit test for `annotationBounds` (box / arrow / text) in `tests/annotation-geometry.test.ts`.
- [x] 1.3 Implement `src/lib/editor-placement.ts` and `annotationBounds`; delete `annotationCommentAnchor` (no callers left) and its test.
- [x] 1.4 Use `placeInlineEditor(annotationBounds(selected), imageSize, INLINE_EDITOR_SIZE)` for `inlineEditorPosition`.
- [x] 2.1 e2e: draw a box and type "Chart" with no wait, assert the timeline row reads exactly `Chart`.
- [x] 2.2 Focus in a `useLayoutEffect`; wrap the annotation-creating state updates in `flushSync` (`commitNewAnnotation`).
- [x] 3.1 Arrowhead: drop the `<defs>` `currentColor` marker, draw an explicit `<polygon>` per arrow from the shared `arrowHeadPoints` in `src/lib/annotate.ts`.
- [x] 4.1 `npm run check`, `npm run format:check`, `npm run test:e2e` green; colour-literal grep at zero.
- [x] 4.2 Visual verification of the three cases (editor beside a box, flipped above at the bottom edge, coloured arrowhead).
- [x] 4.3 CLAUDE.md helper list updated with `src/lib/editor-placement.ts`.
