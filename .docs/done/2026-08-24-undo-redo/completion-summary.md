# Completion Summary: Real Undo/Redo

## What changed

**`src/lib/history.ts` (new)** - a generic snapshot undo stack, pure and React-free.

- `createHistory(present)` -> `{ past: [], present, future: [] }`.
- `commit(h, next, limit = 100)` pushes `present` onto `past`, sets `next`, clears `future`, and trims `past` to the limit. `Object.is(next, h.present)` returns `h` untouched, so committing twice for the same array costs nothing.
- `undo`/`redo` move one entry across and return the same object when there is nothing to move (so `canUndo`/`canRedo` and the callers can both be simple).

**`src/editor/use-editor-state.ts`** - `annotations`/`setAnnotations` remain the live in-gesture state (a drag rewrites them on every pointer move; none of that belongs in the history). Added:

- `history` plus `canUndo`/`canRedo`.
- `commitAnnotations(next?)` - snapshots the annotations. It defaults to `annotationsRef.current`, a ref reassigned in the hook's render body, because the canvas commits from inside the very pointer handler that changed the annotations: `commitNewAnnotation` uses `flushSync`, so the component has re-rendered but the running handler's closure (and its `onCommit` prop) is a render behind. The ref object is stable, so the stale closure still reads the new value.
- `undoAnnotations()`/`redoAnnotations()` - set the history and the live annotations together, and clear `selectedId` when the selected annotation is not in the restored snapshot (undoing a create leaves nothing selected, so the inline comment editor disappears with the shape).
- `removeAnnotation(id)` - the single delete path: filter, set, commit, clear the selection if it was the removed item. Replaces three copies of the same filter.
- `resetAnnotations()` - annotations and history back to empty, for a new capture.

**`src/editor/annotation-canvas.tsx`**

- The inline comment textarea records its value on focus and calls `onCommit` on blur only if it changed - one history entry per editing session, not per keystroke.
- The Delete/Backspace branch calls `removeAnnotation` instead of filtering itself.
- The existing (single) window keydown listener gained Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y (redo), ignored while typing in an `input`/`textarea`/`contentEditable`. No second listener was registered; the effect's deps now include the undo/redo callbacks so the listener always closes over the current history.

**`src/editor/sidebar.tsx`** - "Undo Last Change" (which popped the last array entry, undoing nothing else) is gone. In its place `Undo` and `Redo`, two secondary buttons in one two-column row, disabled from `canUndo`/`canRedo`. "Delete Selected Item" is unchanged apart from going through `removeAnnotation`. The help paragraph now names Ctrl+Z / Ctrl+Shift+Z.

**`src/editor/main.tsx`** - `onCommit={() => state.commitAnnotations()}` (was a no-op placeholder), `state.resetAnnotations()` when a capture starts, and the timeline's `onRemove` is `state.removeAnnotation` (the local wrapper is gone).

## Commit points (every place a history entry is created)

| Where | When |
|---|---|
| `annotation-canvas.tsx` `onCanvasPointerUp` | Pointer-up after a draw that produced a shape, or a drag/resize that actually moved something (`gestureMovedRef`). A plain selection click does not commit. |
| `annotation-canvas.tsx` inline textarea `onBlur` | The comment/text differs from what it was when the editor took focus. |
| `use-editor-state.ts` `removeAnnotation` | Immediately after the removal - reached from Delete/Backspace, the sidebar's "Delete Selected Item" and the comment timeline's "Remove". |
| `use-editor-state.ts` `resetAnnotations` | Not a commit: a new capture throws the history away, so undo cannot reach into a previous screenshot. |

## Verification

- RED first, both layers:
  - `npx vitest run tests/history.test.ts` -> `Error: Cannot find module '../src/lib/history'`.
  - `npm run test:e2e` with the new e2e assertion against the unwired editor -> `expect(locator).toHaveAttribute` expected `"60"`, received `"110"` - the drag had moved the box 50 px and Ctrl+Z did nothing.
- `npm run check` - typecheck, lint, 81 unit tests (11 files), build: green.
- `npm run format:check` - green.
- `npm run test:e2e` - 6/6, including the new undo/redo drag assertion.
- `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - 0 hits.

The e2e assertion is also the proof that the create commit lands correctly: it draws a box at x=60, drags it to x=110 and undoes once. If the create had not been snapshotted, the single undo would have removed the box entirely and the locator would have gone away instead of reading `60`.

## Known follow-ups (not in this change)

- General feedback, colour and tool changes are not in the history.
- The history is per capture and per page load; nothing is persisted.
- Comment edits are one entry per focus session; there is no finer-grained text undo (the browser's own textarea undo still works inside the field).
