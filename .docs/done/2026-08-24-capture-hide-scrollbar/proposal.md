# Proposal: hide the page scrollbar while capturing

## Why

Each stitched frame comes from `chrome.tabs.captureVisibleTab`, which grabs
the whole viewport including the page's own scrollbar track (a ~15 px light
column at the right edge). That track ends up baked into every frame of the
final capture.

Evidence: reproduced with the real extension in Chromium (Playwright,
`--load-extension`). Sampling the right edge of a stitched capture
(`x = image.naturalWidth - 4`, `x = 765..779` in a 780 px wide capture) reads
RGB `252/252/252` (hue 0) instead of the page content's hue at every block -
the scrollbar track, not the page.

## Scope

- `src/content.ts`: hide the scrollbar (`scrollbar-width: none` +
  `::-webkit-scrollbar{display:none}`) on the scroller found by
  `findScroller()` for the duration of a capture, and restore it afterward.
- e2e: extend the existing stitched-capture assertions to also sample the
  right edge of each block.

## Non-goals

- Horizontal scrollbars (capture is vertical-scroll only).
- Third-party custom scrollbar widgets that aren't the native browser
  scrollbar.
