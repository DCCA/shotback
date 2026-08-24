# Tasks: split the editor into modules

- [x] 1.1 Write the failing unit test for the moved pure helpers (`tests/annotation-geometry.test.ts`).
- [x] 1.2 Run it red (`npx vitest run tests/annotation-geometry.test.ts` - cannot resolve module).
- [x] 1.3 Move `uid`, `moveAnnotation`, `annotationCommentAnchor`, `formatBytes`, `shareLabel`
      into `src/editor/annotation-geometry.ts` and import them back into `main.tsx`.
- [x] 1.4 Run the test green and the full gate (`npm run check`).
- [x] 1.5 Commit: `refactor(editor): extract pure annotation geometry helpers`.
- [x] 1.6 Extract `useEditorState()` into `src/editor/use-editor-state.ts` (exports the
      `EditorState` interface later changes depend on).
- [x] 1.7 Extract `AnnotationCanvas` into `src/editor/annotation-canvas.tsx` (image + SVG,
      pointer handlers, draft/drag/resize state, inline comment editor, keyboard shortcuts),
      with an `onCommit` prop called when a gesture added, moved or resized an annotation.
- [x] 1.8 Extract `useExports`, `Sidebar`, `CommentTimeline`, `SavedShares`.
- [x] 1.9 Verify nothing changed: `npm run check`, `npm run format:check`, `npm run test:e2e`
      (5/5), `wc -l src/editor/main.tsx` = 129 (< 200).
- [x] 1.10 Commit, push, open the PR.
