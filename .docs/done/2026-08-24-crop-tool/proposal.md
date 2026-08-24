# Proposal: Crop the capture before export

## Why

A full-page capture is the right thing to take and usually the wrong thing to
hand over: the note is about one card, one modal, one broken row, and the agent
(or the reviewer) receives 2500px of page around it. Today the only way to
narrow that down is to not capture the page in the first place.

## Goal

A region of the capture can be selected in the editor, and from then on every
output - the exported PNG, both prompts, the JSON sidecar and a saved share -
describes that region and nothing else, with annotation coordinates expressed
in the crop's own space.

## Scope

- `src/lib/crop.ts` (new, pure) - `Rect`, `MIN_CROP_SIZE`, `clampCrop(crop,
image)` (whole px, at least 24x24, inside the image) and `applyCrop(annotations,
crop)`: shift into crop space, drop what the crop cut away, clamp partially
  outside boxes.
- `src/lib/annotate.ts` - `exportAnnotatedImage` takes an optional `crop` and
  draws only that source rect onto a crop-sized canvas. It does **not** call
  `applyCrop` itself: the caller passes annotations already in crop space, so
  the function keeps one job.
- `src/editor/use-editor-state.ts` - `crop` and `cropDraft` state plus an
  `EditorTool` type (`AnnotationTool | "crop"`), both **outside** the annotation
  history: a crop is a view onto the capture, like `zoom`, not an edit of it.
- `src/editor/use-exports.ts` - one `exportView(state)` derivation feeding all
  five outputs, so no output path can forget the crop.
- `src/editor/annotation-canvas.tsx` - crop marquee: dimmed outside, dashed
  outline, no pin, no timeline row, no history entry.
- `src/editor/sidebar.tsx` - a `Crop` entry in the Tool select, Apply/Cancel
  while a marquee is pending, and a `Cropped to WxH - Clear` row once applied.
- `src/editor/main.tsx` - a new capture clears the crop and any marquee.
- Tests: `tests/crop.test.ts` (new), crop cases in `tests/annotate.test.ts`, and
  an e2e block in the `inner` capture test.

## Out of Scope

- Redaction/blur of a region, and JPEG/quality options (later tasks).
- Cropping the stored capture itself: annotations stay in capture space and are
  shifted only on the way out, so clearing the crop restores everything.
- Moving or resizing an applied crop: it is redrawn instead.
