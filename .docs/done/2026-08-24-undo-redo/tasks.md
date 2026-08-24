# Tasks: Real Undo/Redo

- [x] **1. Failing unit test**
  - [x] 1.1 `tests/history.test.ts`: undo/redo round trip, a new commit clears the redo stack, undo at the start and redo at the end are no-ops, the limit drops the oldest entry.
- [x] **2. Run it to verify it fails**
  - [x] 2.1 RED: `Error: Cannot find module '../src/lib/history'`.
- [x] **3. Implement `src/lib/history.ts`**
  - [x] 3.1 `createHistory`, `commit` (no-op on the same reference, default limit 100), `undo`, `redo` - all returning the same object when there is nothing to do.
  - [x] 3.2 GREEN: `npx vitest run tests/history.test.ts` - 4 passed.
- [x] **4. Failing e2e**
  - [x] 4.1 In the `inner` capture test: draw a box, switch the Interaction select to "Move Existing", drag the box 50 px right, `Control+z`, assert the `rect`'s `x` is back to the drawn value, `Control+Shift+z`, assert it moved again.
  - [x] 4.2 RED: `expect(locator).toHaveAttribute` - expected `"60"`, received `"110"` (the drag worked, Ctrl+Z did nothing).
- [x] **5. Wire the history into the editor**
  - [x] 5.1 `use-editor-state.ts`: `history` state, `commitAnnotations(next?)` (defaults to a ref holding the latest annotations, because the canvas commits from inside the `flushSync` handler that just changed them), `undoAnnotations`/`redoAnnotations` (set history + live annotations, clear the selection when the selected annotation is gone), `canUndo`/`canRedo`, `removeAnnotation(id)`, `resetAnnotations()`.
  - [x] 5.2 `annotation-canvas.tsx`: commit on the inline textarea's blur when the text changed since focus; Delete/Backspace routed through `removeAnnotation`; Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y added to the one existing keydown listener, ignored while typing in a field.
  - [x] 5.3 `sidebar.tsx`: `Undo`/`Redo` buttons in one two-column row, disabled from `canUndo`/`canRedo`; `removeLast` deleted; `removeSelected` calls `removeAnnotation`; the help paragraph names the shortcuts.
  - [x] 5.4 `main.tsx`: `onCommit={() => state.commitAnnotations()}`, `resetAnnotations()` on capture, `onRemove={state.removeAnnotation}` for the timeline.
- [x] **6. Verify**
  - [x] 6.1 `npm run check` - typecheck, lint, 81 unit tests (11 files), build: green.
  - [x] 6.2 `npm run format:check` - green.
  - [x] 6.3 `npm run test:e2e` - 6/6.
  - [x] 6.4 `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - 0 hits.
- [x] **7. Docs**
  - [x] 7.1 CLAUDE.md: `src/lib/history.ts` in the helper list plus an "Undo/redo" paragraph listing every commit point.
  - [x] 7.2 README: undo/redo in the feature list and in Usage.
- [x] **8. Commit and PR**

- [x] **9. Task-review fixes**
  - [x] 9.1 Comment edits also commit from an effect cleanup keyed on `selectedId`, not only from `onBlur`: clicking empty canvas unmounts the textarea and React dispatches no blur for it, so a typed comment was silently dropped by the next undo. Typing marks `noteDirtyRef`; whichever path fires first commits and clears the flag (the second is a `commit` no-op).
  - [x] 9.2 e2e: the `inner` block now types a comment, deselects by clicking empty canvas, and asserts Ctrl+Z undoes the comment (row back to `(no comment)`, box still at the moved x) and a second Ctrl+Z undoes the move; then selects the box, presses Delete and asserts Ctrl+Z brings it back. RED first: `expected "110", received "60"` - the comment was never committed.
  - [x] 9.3 Root-cause fix found by the RED run: the commit from a passive effect had not re-rendered when the next keypress arrived, so undo read a stale `history`. The history is now mirrored in `historyRef` (every write goes through `applyHistory`) and undo/redo/commit read the ref.
  - [x] 9.4 `commitAnnotations` is `() => void` again (no dead optional parameter); `NO_ANNOTATIONS` replaced by plain `[]`; the README line uses " - " instead of an em dash.
  - [x] 9.5 The annotations ref is synced in a `useLayoutEffect` instead of during render (`react-hooks/refs` forbids a render-phase ref write; `flushSync` runs layout effects before it returns, so the create path is unaffected).
  - [x] 9.6 Re-ran `npx vitest run tests/history.test.ts` (4 passed), `npm run check` (81 unit tests, green), `npm run format:check` (green), `npm run test:e2e` twice (6/6 both).

- [x] **10. Task re-review fix**
  - [x] 10.1 e2e first, RED: placing a text annotation and pressing Ctrl+Z left `ol li` at 0 rows instead of 1 - the undo reached past the (never committed) text annotation into the previous edit.
  - [x] 10.2 `onCanvasPointerDown`'s text branch calls `onCommit()` after `commitNewAnnotation`, because a text annotation never reaches the pointer-up commit.
  - [x] 10.3 Commit-point tables in `completion-summary.md` and the task report corrected: the text branch is its own commit point.
  - [x] 10.4 `npm run check` green (81 unit tests), `npm run format:check` green, `npm run test:e2e` 6/6 (twice).
