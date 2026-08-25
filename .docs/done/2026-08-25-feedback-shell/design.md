# Design

## Toast (`src/editor/status-toast.tsx`)

One component, mounted by `AnnotationCanvas` inside the canvas `Card` (which
became `relative`), holding the page's only `aria-live="polite"` region. It
reads `status`/`progress` off `EditorState` and writes `setStatus(null)` for
both the 4-second success timer and the dismiss button - no new state.

- `fixed right-4 top-4 ... lg:absolute`. Absolute at `lg`, where the canvas pane
  is always on screen; fixed below it, where the shell unwinds and the canvas
  card can be scrolled away by the time an export button is pressed. Anchoring
  it only to the card would have reintroduced the very bug at narrow widths.
- The status paragraph keeps the `font-medium` class: it is what separates the
  status line from the progress line, and what the e2e waits on.
- Icons are inline SVG paths in the surrounding stroke style, inheriting
  `currentColor` from the tone. No emoji: a glyph carries the platform's own
  colour and shape onto a themed surface.
- The entrance is `transition-[transform,opacity]` flipped on the first frame
  after mount (`requestAnimationFrame`), remounted per message via a `key`.
  Progress keeps a stable key so counting up does not re-animate. A targeted
  rule in the `prefers-reduced-motion` block collapses that transition to 0ms,
  matching how the rest of the stylesheet treats motion.
- Shadow carries offset and blur (`0 10px 28px -8px` over `0 2px 6px -2px`), and
  the dismiss button is a 24x24 target with `focus-visible:ring-2 ring-ring`.

`main.tsx` clears progress in the capture's `finally`, killing the stale
"Capture completed".

## Crop preview (`src/lib/crop.ts` + `annotation-canvas.tsx`)

The image and the SVG overlay are **not** resized or re-`viewBox`ed. Instead a
new `#capture-window` box sits between the scrollport and the image wrapper:

```
#capture-viewport   (the only scroller for the capture)
  #capture-window   (relative, overflow-hidden, sized to the view)
    wrapper         (absolute, offset and scaled in percentages)
      img + svg     (unchanged: full capture, viewBox 0 0 W H)
```

`cropViewMetrics(view, image)` (pure, unit-tested) returns the wrapper's offsets
and width as percentages plus the window's aspect ratio. Because the wrapper is
absolutely positioned, its `left` percentage resolves against the window's width
and its `top` against the window's height, so each offset divides by its own
axis of the view - the bug the test pins down. Every number being a ratio is
what lets **one wrapper mapping serve both zoom modes**: at 1:1 the window is
exactly the view's pixel size, so the percentages evaluate to `-view.x`,
`-view.y` and the image's natural width; at fit-width the window is fluid
(`width:100%; max-width:<view width>; aspect-ratio:<view>`) and they scale with
it. Only the **window's** style differs between the two - the wrapper style is
literally the same object. Nothing is measured in JavaScript, so there is no
ResizeObserver and no layout pass.

**Deliberate departure from the brief.** The brief said "the SVG overlay viewBox
switches to the crop rect so annotations keep their coordinates". It does not:
the overlay keeps the full image's viewBox and the *window* clips instead. That
is what preserves the overlay-covers-image invariant the e2e guards - a
crop-sized viewBox would make the overlay stop matching the image's box - and it
leaves annotation coordinates, `getScreenCTM` pointer math and `refreshContexts`
untouched by a crop. The e2e pins the consequence directly: with a crop applied
at 1:1, a drag 10px inside the window's top-left reports the crop origin plus
10 in capture space.

Consequences, all deliberate:

- **The overlay-covers-image invariant is untouched.** The e2e's
  `overlayMatchesImage` now also runs with a crop applied and after clearing it.
- Annotations keep capture coordinates, so `refreshContexts` and `exportView`
  are unaffected. Annotations outside the crop are simply clipped by the window,
  which is exactly what the exports do to them.
- `mx-auto` on the window centres a region narrower than the pane instead of
  pinning it left with dead space beside it. Auto margins collapse to 0 when the
  content overflows, so the 1:1 scroll path is untouched.
- The applied crop is exposed as `data-crop="x,y,w,h"` on the window - the
  canvas no longer draws a `#crop-region` rect once a crop is in force, and the
  e2e needs the region in image px.

## Crop controls

- `renderResizeHandles` was generalised into `renderHandles(rect, colour, key,
onDown)`; the marquee passes `cropDraft` and a handler that runs the same
  `applyBoxResizeDelta` (bounded by the image, `minSize: MIN_CROP_SIZE`) and
  writes the result back through `clampCrop`. A marquee resize is a view change,
  so it commits nothing to the undo history.
- Apply/Cancel are **HTML over the window**, not a `foreignObject` in the SVG.
  The first attempt used a `foreignObject` (the inline comment editor's
  precedent); content there is sized in *image* px, so at fit-width the buttons
  shrank with the capture and rendered ~66x18 on screen - under the readable and
  tappable floor. As HTML anchored at the marquee's bottom-left corner in
  percentages of the window, they are a constant size at any zoom. Both axes are
  `clamp()`ed against the bar's own fixed size (`CROP_CONTROLS_SIZE`), because
  the bar is a child of the clipping window: a narrow marquee at the right edge
  would otherwise push it past 100%, and one against the top edge would put it
  above the window - out of reach, with no other way to apply.
- **Enter applies a drawn marquee**, through the same `applyCropDraft` the
  button calls, so the floating bar is not a single point of failure whatever
  the marquee's position. Escape already cancelled one.
- **`disabled={isBusy}` on Apply, Cancel and Clear**, restoring the guard the
  removed sidebar rows carried: an export promise in flight captured the crop it
  started with, and letting the canvas move underneath it desyncs the file from
  the screen. `applyCropDraft` re-checks `isBusy`, so the keyboard path cannot
  bypass it.
- **The chip is `pointer-events-none`** (only its Clear button opts back in) and
  sits bottom-left. Top-left with a live button covered the capture's own origin,
  where a drag usually starts: `elementFromPoint` at the crop window's top-left
  returned the Clear button, and that corner was simply not drawable.

## Pins under an applied crop

The canvas used to number and clamp against the full image while the export
numbered `applyCrop`'s survivors and clamped against the crop canvas, so the two
disagreed twice over: an anchor two px inside the crop edge drew half-clipped on
the canvas and a full radius in inside the PNG, and a pin numbered 3 on screen
came out 2 in the export. `viewPins(annotations, crop, image)` (pure, in
`src/lib/numbering.ts`, unit-tested on all four crop edges plus the renumbering)
is now the single derivation: with no crop it is the plain list (the editor still
numbers everything it holds, per the Task 21 ruling), and with one applied it is
the export's list, radius and clamp, with centres shifted back by the crop origin
for the full-image overlay. An annotation the crop dropped gets no pin, exactly
as the export drops it.

## Toast timer

The dismiss effect keys on the status **object**, not on its kind and message.
Every `setStatus` call builds a fresh object, so an identical message arriving a
second time is a new identity: the effect re-runs, clears the previous timer and
gives the new toast its own full 4s. Keyed on the text, the second toast would
have inherited the first one's remaining time and could vanish almost at once.
`setStatus` is `useState`'s setter, so it is stable and cannot restart the clock
on an unrelated render.

## Shell

`main` is `min-h-screen ... lg:h-screen lg:min-h-0 lg:overflow-hidden`. Both
cards get `lg:min-h-0` (a grid item's default `stretch` needs it before
`overflow-y-auto` will scroll rather than grow the row); the canvas card becomes
a flex column so `#capture-viewport` can take `min-h-0 flex-1`. Below `lg` the
canvas is `order-1` and the sidebar `order-2` - visual order only, DOM order
unchanged, so tab and screen-reader order are as before.
