# Proposal: Real Undo/Redo for Annotations

## Why

The editor's only reversal was a sidebar button labelled "Undo Last Change" that popped the last item off the annotations array. It was not undo:

- It could not undo a move, a resize or a comment edit - only a creation, and only if that creation happened to be last in the array.
- It could delete an annotation the user never asked to delete (the newest one) after any other edit.
- There was no redo at all, and no keyboard shortcut, so an accidental drag or an accidental Delete was unrecoverable.

Task 1 split the editor and gave the canvas an `onCommit` callback that already fires exactly once per completed create/move/resize gesture (a plain selection click does not fire it). It was wired to a no-op, waiting for this change.

## Goal

Every completed edit is one undo step, reachable from the sidebar and from the keyboard, with redo.

## Scope

- New `src/lib/history.ts`: `createHistory`/`commit`/`undo`/`redo` over `{ past, present, future }`, snapshot-based, capped at 100 entries. Pure, no `chrome.*`, no React.
- `src/editor/use-editor-state.ts` - `annotations` stays the live in-gesture state; new `history`, `commitAnnotations`, `undoAnnotations`, `redoAnnotations`, `canUndo`, `canRedo`, `removeAnnotation` (the one delete path) and `resetAnnotations` (clears annotations **and** history for a fresh capture).
- `src/editor/annotation-canvas.tsx` - `onCommit` on pointer-up (already gated) and on the inline comment textarea's blur when the text changed; the Delete/Backspace path goes through `removeAnnotation`; the existing keydown listener gains Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y.
- `src/editor/sidebar.tsx` - "Undo Last Change" replaced by `Undo`/`Redo` buttons in one row, disabled from `canUndo`/`canRedo`; "Delete Selected Item" unchanged in behaviour, now routed through `removeAnnotation`.
- `src/editor/main.tsx` - passes `commitAnnotations` as `onCommit`, uses `resetAnnotations` on capture and `removeAnnotation` for the timeline's Remove.
- `tests/history.test.ts` (new) and an undo/redo drag assertion in the `inner` e2e capture test.

## Out of Scope

- Undoing anything other than annotations (general feedback, colour, tool, saved shares).
- Per-keystroke undo inside a comment; one editing session is one entry.
- Persisting history across a capture or a page reload.
- Any other UI change.
