# Completion Summary: Crop the capture before export

## What changed

- `src/lib/crop.ts` (new, pure, no `chrome.*`):
  - `Rect` - a region of the capture in image px.
  - `MIN_CROP_SIZE = 24` - below that a drag is a mis-click, not a crop.
  - `clampCrop(crop, image)` - whole px, at least `MIN_CROP_SIZE` per side (or
    the image when it is smaller), fully inside the image. Applied where a crop
    is created (a drag can run past the edge) and again at export time, so a
    stored crop can never ask `drawImage` for pixels the capture does not have.
  - `applyCrop(annotations, crop)` - box: intersected with the crop (a box half
    outside is clamped to the visible part; one that only touches the edge has
    no area left and is dropped). Arrow: kept when **either** endpoint is
    inside, shifted and never clamped - clipping the line would move the head,
    and the head is what an arrow points at, so an endpoint slightly outside
    just draws off the crop-sized canvas. Text: kept when its anchor (its pin,
    and where the label is drawn from) is inside. Ids, comments and DOM
    contexts survive untouched; only coordinates change.
- `src/lib/annotate.ts` - `exportAnnotatedImage(base, annotations, { crop })`
  draws only the clamped crop rect (9-argument `drawImage`) onto a crop-sized
  canvas and sizes the pins, the notes layout and the footer/overlay decision
  off the crop instead of the loaded image. It deliberately does **not** call
  `applyCrop`: the caller passes annotations already in crop space, so the
  image, the prompts and the sidecar cannot describe different lists.
- `src/editor/use-editor-state.ts` - `EditorTool = AnnotationTool | "crop"`
  (nothing stored in an `Annotation` can ever be a crop), plus `crop` and
  `cropDraft` state.
- `src/editor/use-exports.ts` - `exportView(state)`: the one derivation that
  every output goes through (download, copy image, cloud LLM package, Claude
  Code prompt **and** its JSON sidecar, share save). With no crop it hands back
  `state.annotations` / `state.imageSize` unchanged, so every existing output is
  byte-identical; with one it hands back `applyCrop(...)`, the clamped crop and
  the crop's size as the reported image size.
- `src/editor/annotation-canvas.tsx` - the crop tool draws a marquee: the area
  outside is dimmed by four shade rects, the region carries a dark-under-dashed-
  white outline (`#crop-region`) that reads on light and dark captures alike,
  and the whole overlay is `pointerEvents="none"`. A marquee under
  `MIN_CROP_SIZE` is discarded. Escape cancels a pending marquee. While the crop
  tool draws, an annotation no longer swallows the pointer-down, so a crop can
  start on top of one. `draftRect` (a drag normalised to a rect) is shared with
  the box tool.
- `src/editor/sidebar.tsx` - `Crop` in the Tool select; **Apply crop** /
  **Cancel** while a marquee is pending; `Cropped to WxH` with a **Clear**
  button once applied.
- `src/editor/main.tsx` - a new capture clears `crop` and `cropDraft` alongside
  the annotations and history.

## Design note: annotations stay in capture space

The crop is stored as a `Rect` next to `zoom`, **outside** the annotation
history, and annotations are never rewritten when it is applied. Two things
follow, and both are deliberate:

- Undo/redo never steps through a crop, and clearing the crop restores the whole
  capture with every annotation exactly where it was - including the ones the
  crop had dropped.
- `refreshContexts` in `main.tsx` keeps working in the **uncropped** coordinate
  space. It maps `inspectAnchor(annotation) / captureScale` back onto the live
  tab, and those anchors are still capture-space, so a crop cannot shift a DOM
  lookup off its element. The e2e proves it: after cropping, the prompt still
  carries `-> #app > section.hero > button.cta`.

The shift happens once, at output time, in `exportView`.

## RED/GREEN evidence

### Group 1: `applyCrop` / `clampCrop` (crop.test.ts)

RED (before `src/lib/crop.ts` existed):

```
FAIL  tests/crop.test.ts [ tests/crop.test.ts ]
Error: Cannot find module '../src/lib/crop' imported from tests/crop.test.ts
FAIL  tests/annotate.test.ts [ tests/annotate.test.ts ]
Error: Cannot find module '../src/lib/crop' imported from tests/annotate.test.ts
 Test Files  2 failed (2)
```

GREEN after `crop.ts`: `crop.test.ts` passed in full.

### Group 2: `exportAnnotatedImage` crop (annotate.test.ts)

RED (with `crop.ts` in place but `annotate.ts` untouched):

```
FAIL  tests/annotate.test.ts > exportAnnotatedImage crop > draws only the crop source rect onto a crop-sized canvas
FAIL  tests/annotate.test.ts > exportAnnotatedImage crop > pins the annotations it is given, already in crop space
FAIL  tests/annotate.test.ts > exportAnnotatedImage crop > clamps a crop that runs past the image bounds
FAIL  tests/annotate.test.ts > exportAnnotatedImage crop > draws the whole image when no crop is given
AssertionError: expected [ +0, +0 ] to deeply equal [ Array(8) ]
 Tests  4 failed | 31 passed (35)
```

GREEN: `Tests  35 passed (35)`.

### Group 3: e2e (the `inner` capture test)

RED 1 - `dist/` rebuilt from pre-change `src/` (`git stash push -- src/`):

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for getByRole('option', { name: 'Crop' })
1 failed
```

RED 2 - implementation restored, but `exportView` deliberately returning
uncropped annotations (image cropped, prompts not):

```
expect(received).toContain(expected)
Received string:    "...
Area comments:
1. [box] (no comment) - at (44, 60) size 160x120 px [18%, 28% of page] -> html > body > div:nth-of-type(2) > div:nth-of-type(1)
2. [text] (empty) - at (584, 500) px -> html > body > div:nth-of-type(2) > div:nth-of-type(2)
3. [box] (no comment) - at (254, 214) size 100x65 px [104%, 100% of page] -> #app > section.hero > button.cta in <PricingCard > Page>"
1 failed
```

The expected substring was the same box's geometry measured from the crop
origin; what came back was its capture-space position, with the out-of-crop
text annotation still listed.

(The `[104%, 100% of page]` in that output is the same bug from the other side:
capture-space coordinates measured against the crop's size.)

GREEN, full suite:

```
✓ 1 extension loads with no popup and the downloads permission (11ms)
✓ 2 capture notice shows, hides for the frame, and is removed (85ms)
✓ 3 full-page capture stitches every viewport in order (smooth) (2.9s)
✓ 4 full-page capture stitches every viewport in order (inner) (5.0s)
✓ 5 editor page renders the capture UI (48ms)
✓ 6 dark theme keeps every control legible (42ms)
6 passed (8.6s)
```

The `inner` test now also asserts, after cropping to a region around the CTA:
the CTA box's prompt geometry in crop-space coordinates (computed from the
`#crop-region` rect the canvas draws), `-> #app > section.hero > button.cta`
still present, the out-of-crop text annotation gone from the list, the saved
share's image exactly the crop's width (and far shorter than the capture - it
carries the notes footer under the crop), and `Clear` removing the region.

## Gate output

```
npm run check
  typecheck: clean
  lint: clean
  test: 15 files, 178 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style!

npm run test:e2e
  6 passed (8.6s)

grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/
  (zero hits)
```

## Visual check

The crop UI was screenshotted from the real e2e run in light and dark: the
marquee (dimmed surround, dashed outline) with **Apply crop** / **Cancel** in
the sidebar, and the applied state showing `Cropped to 244x215` with **Clear**.
Both read correctly in both themes; the crop controls are plain `Button`s and a
`bg-muted` row, so they inherit the token palette like every other sidebar row.

## Risks / follow-ups

- An annotation drawn outside the crop is still drawable (the canvas shows the
  whole capture) and silently absent from the exports. The dimmed surround is
  the only signal. Left as is: hiding the rest of the capture would make it
  impossible to redraw a crop that is too small.
- An applied crop cannot be nudged or resized - it is redrawn. Worth revisiting
  only if it turns out to be a real annoyance.
