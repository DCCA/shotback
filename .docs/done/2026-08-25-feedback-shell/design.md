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
what lets one mapping serve both zoom modes: fit-width gives the window
`width:100%; max-width:<view width>; aspect-ratio:<view>`, 1:1 gives it the
view's pixel size, and the same percentages hold either way. Nothing is
measured in JavaScript, so there is no ResizeObserver and no layout pass.

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
  percentages of the window, they are a constant size at any zoom, and anchoring
  *inside* the marquee means they can never be clipped by the window.

## Shell

`main` is `min-h-screen ... lg:h-screen lg:min-h-0 lg:overflow-hidden`. Both
cards get `lg:min-h-0` (a grid item's default `stretch` needs it before
`overflow-y-auto` will scroll rather than grow the row); the canvas card becomes
a flex column so `#capture-viewport` can take `min-h-0 flex-1`. Below `lg` the
canvas is `order-1` and the sidebar `order-2` - visual order only, DOM order
unchanged, so tab and screen-reader order are as before.
