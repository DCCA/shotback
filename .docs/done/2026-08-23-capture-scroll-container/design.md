# Design

## content.ts

- `findScroller()`: if `document.scrollingElement.scrollHeight > innerHeight`
  use the window. Else scan `document.querySelectorAll("*")` once, keep
  elements with `scrollHeight > clientHeight + 1` and `clientHeight >=
  innerHeight / 2`, then check computed `overflow-y` (`auto`|`scroll`) and pick
  the largest by `clientWidth * clientHeight`. One-shot on
  `SB_GET_PAGE_METRICS`; stored in module state for the scroll messages.
- `PageMetrics` gains `scrollerTop` (rounded `getBoundingClientRect().top`,
  0 for the window). `fullHeight`/`viewportHeight` become the scroller's
  `scrollHeight`/`clientHeight` (unchanged for the window case).
- `SB_SCROLL_TO` / `SB_RESTORE_SCROLL` call `target.scrollTo({ top, behavior:
  "instant" })` on the element or the window.

## capture.ts

- Canvas height = `(scrollerTop + fullHeight) * scale`.
- Pure `segmentPlacement(index, y, metrics)` returns `{ sy, sh, dy }`: frame 0
  is drawn whole at 0; later frames draw source rows
  `[scrollerTop, scrollerTop + viewportHeight)` at `scrollerTop + y`. With
  `scrollerTop = 0` this is exactly today's behavior.

## Tests

- Unit: `segmentPlacement` in `tests/capture.test.ts`.
- E2E: `tests/e2e/extension.spec.ts` gains a real full-page capture (editor
  with `autocapture=1`) against an inner-scroller page and a smooth-scroll
  page, checking the image height and per-viewport content via pixel hue.
