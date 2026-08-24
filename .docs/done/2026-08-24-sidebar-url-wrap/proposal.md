# Proposal: Stop the Sidebar Scrolling Sideways

## Why

After "Copy Local Share Link", the editor sidebar shows the share URL
(`chrome-extension://<id>/viewer.html?share=<id>`) as an anchor. The URL has
no whitespace to break on, so it renders as one unbreakable string and the
whole sidebar card gets a horizontal scrollbar - the fixed-width (360px)
left column at `lg` breakpoints and up cannot fit ~90 characters of URL
without either overflowing or wrapping.

## Goal

The share link wraps inside the sidebar card instead of forcing horizontal
scroll, at every viewport width.

## Scope

- `src/editor/main.tsx`: the share-link anchor gets `break-all` so it can
  break mid-string instead of overflowing.
- `tests/e2e/extension.spec.ts`: extend the existing
  `full-page capture stitches every viewport in order (inner)` test to
  generate a share link and assert the sidebar card has zero horizontal
  overflow (`scrollWidth - clientWidth === 0`).

## Note on file location

The task brief names `src/editor/sidebar.tsx` as the file to modify. As of
the Task 1 module split (`refactor/editor-module-split`), the share-link
anchor is not rendered inside `sidebar.tsx` - it is passed to `Sidebar` as
`children` from `src/editor/main.tsx` (`Sidebar` only owns the Card shell
and the fixed controls; the timeline, share link and saved-shares list are
composed by the caller). The fix therefore lands in `main.tsx`, where the
anchor's JSX actually lives. `sidebar.tsx` itself is unchanged.

## Out of Scope

- `min-w-0` on the Card content: not needed. `break-all` alone shrinks the
  anchor's min-content width to a single character, which the existing
  fixed 360px grid column already accommodates.
- Any other sidebar layout or spacing change.
