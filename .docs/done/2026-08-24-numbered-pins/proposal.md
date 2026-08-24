# Proposal: One Numbering Everywhere, Numbered Pins Instead of Comment Pills

## Why

Three surfaces numbered annotations three different ways, and the image carried no number at all:

- The comment timeline numbered rows by array index (`index + 1`).
- `formatAreaComments` in `src/lib/feedback.ts` numbered the prompt's `1. [box] ...` list by array position too - a different list from the timeline's as soon as an annotation was removed and re-added, or a share was reloaded in a different order.
- The editor canvas and the export drew each comment as a small white pill holding the raw comment text. At export scale (a full-page capture is commonly 1400px+ wide, and it is viewed fitted to the page) the 13-14px pill text is unreadable, long comments run off the image, and overlapping annotations stack pills on top of each other.

So the reviewer looking at the PNG had no way to tell which `1.` in the prompt belonged to which marked area. `.docs/reviews/2026-08-23-product-review.md` flagged the pills as illegible.

## Goal

One numbering, produced in one place, used by the timeline, the prompt, the canvas and the exported image - and a pin on the image that carries that number instead of a pill of text.

## Scope

- New `src/lib/numbering.ts`: `numberAnnotations` (creation order, not array order), `pinRadius` (scales with image width, clamped 14-28px), `pinAnchor` (box corner, arrow tail, text baseline start).
- `src/lib/feedback.ts` - `formatAreaComments` numbers from `numberAnnotations`.
- `src/lib/annotate.ts` - `drawCommentLabel` deleted; every annotation gets a numbered pin at its anchor; the "General Feedback" footer becomes a "Notes" footer that lists `n. comment` for each numbered annotation with a note, each line led by the same coloured pin, then a "General feedback" paragraph. Shape line width and the footer font scale from `pinRadius`.
- `src/editor/annotation-canvas.tsx` - the two comment-pill blocks replaced by the same pin, so the editor shows exactly what the export will.
- `src/editor/comment-timeline.tsx` - `#{n}` from `numberAnnotations`.
- `vitest.config.ts` - resolve the `@/*` alias, needed now that modules under test import each other by alias.

## Out of Scope

- Pin collision avoidance (two annotations anchored at the same point still overlap).
- A user-visible ordering control; creation order is the order.
- The editor's inline comment editor and its `annotationCommentAnchor` placement (untouched).
- Any toolbar, layout or colour change.
