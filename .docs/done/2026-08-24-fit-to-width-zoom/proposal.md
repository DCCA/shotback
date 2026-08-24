# Proposal: Fit-to-Width and 1:1 Zoom

## Why

`annotation-canvas.tsx` rendered the captured `<img>` at `max-w-none` inside a `relative inline-block` wrapper. A full-page capture wider than the canvas pane was never scaled down, so it either ran off the right edge of the pane invisibly (the outer `Card` carries `overflow-hidden`, so the overflow is silently clipped rather than scrolled) or, if that clipping were ever removed, would scroll the whole page sideways. Either way the user cannot see or annotate the parts of a wide capture past the pane's width.

## Goal

The capture defaults to fitting the width of its pane, with an explicit toggle to view it at its real pixel size (1:1) when precise inspection is needed. Neither mode ever scrolls the page body or an ancestor `Card` sideways, and the SVG annotation overlay stays pixel-aligned with the image in both modes - including the part of a 1:1 image that is only visible after scrolling.

## Scope

- `EditorState` gains `zoom: "fit" | "actual"` (default `"fit"`) and `setZoom`.
- `annotation-canvas.tsx`: the image's CSS sizing switches on `zoom`; the pane structure changes from one `inline-block` wrapper to an outer scrollport (`w-full overflow-auto`) holding an inner sizing wrapper (`block w-full` in fit mode, `inline-block` in actual mode) so the SVG overlay - sized by CSS percentage against that inner wrapper - always matches the image's real rendered box, not just the pane's visible width.
- `sidebar.tsx`: a `Select` labelled "Zoom" (`Fit width` / `Actual size (100%)`), same styling as the existing "Tool" select, placed right after it.
- `tests/e2e/extension.spec.ts`: extend the `inner` full-page-capture test to cover both zoom modes at a pane narrower than the capture.
- README features list mentions the fit-to-width default and the 1:1 toggle.

## Out of Scope

- Any zoom level other than fit-width and 100%.
- Changing the outer `Card`'s `overflow-hidden` (still present, now redundant with the inner scrollport but harmless).
- Any change to capture/stitching, annotation tools, or export flows.
