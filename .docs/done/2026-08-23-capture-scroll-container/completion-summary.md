# Completion summary

## What changed

- `src/content.ts`: `findScroller` picks the document when it scrolls,
  otherwise the largest `overflow: auto|scroll` element at least half the
  viewport tall. Metrics report that scroller's `scrollHeight`/`clientHeight`
  plus `scrollerTop`. Scrolls use `behavior: "instant"`.
- `src/lib/capture.ts`: `segmentPlacement` (pure) places frames; the first
  is drawn whole, later ones cropped to the scroller's rows. Canvas height
  includes `scrollerTop`.
- Tests: 2 unit tests for `segmentPlacement`; 2 e2e tests run a real
  `captureVisibleTab` capture on a smooth-scroll page and an inner-scroller
  page and verify height and per-block content by pixel hue. Both fail on the
  previous source (inner: 493 px of 2464; smooth: frames repeat the previous
  viewport) and pass on this change.

## Evidence

Repro with the built extension in Chromium before the fix:
`innerScroll ... result {"w":780,"h":493}` for a 2400 px scroller;
`smooth` block hues `37,74,111,...` where `74,111,148,...` were expected.

## Risks / follow-ups

- Scroller detection is a heuristic (largest tall scrollable element). Pages
  with two comparably sized scrollers, or nested scrollers, still capture only
  the one picked.
- Content below an inner scroller (a footer outside it) is overwritten by the
  stitched frames; sticky elements inside the scrolled region duplicate as
  before.
