# Completion summary

## What changed

- `src/content.ts`: added `hideScrollbars`/`showScrollbars`, gated by a
  `<style id="shotback-hide-scrollbar">` tag (`scrollbar-width: none` +
  `::-webkit-scrollbar{display:none}` on `html`, `body`, and the scroller
  found by `findScroller()`, tagged `[data-shotback-scroller]`).
  `SB_GET_PAGE_METRICS` now tags the scroller and calls `hideScrollbars()`
  right after `findScroller()` and before reading any geometry (hiding the
  bar reflows the page, so metrics must be read after). `SB_RESTORE_SCROLL`
  and `SB_CAPTURE_END` both call `showScrollbars()` (idempotent - either can
  fire first depending on how a capture ends).
- `tests/e2e/extension.spec.ts`: `hueAt` gained an `x` parameter; the
  stitched-capture test now also samples the right edge
  (`x = image.naturalWidth - 4`) of each block, in addition to the existing
  `x = 20` samples.

## Evidence

RED (before the fix, right-edge samples mismatched - scrollbar track,
hue 0/RGB 252,252,252 - on both page shapes):

```
$ npm run test:e2e -- -g "stitches"
- Expected  - 1
+ Received  + 9
- Array []
+ Array [-450, -750, -1050, -1350, -1650, -1950, -2250]   # smooth
+ Array [-514, -814, -1114, -1414, -1714, -2014, -2314]   # inner
2 failed
```

GREEN (after the fix):

```
$ npm run test:e2e -- -g "stitches"
✓ full-page capture stitches every viewport in order (smooth) (2.0s)
✓ full-page capture stitches every viewport in order (inner) (2.4s)
2 passed (4.9s)

$ npm run test:e2e
5 passed (5.1s)

$ npm run check
Tests  59 passed (59)
✓ built in 359ms

$ npm run format:check
All matched files use Prettier code style!
```

## Risks / follow-ups

- None known. The style tag and `data-shotback-scroller` attribute are both
  removed on restore, so a capture that fails partway does not leave a
  permanently hidden scrollbar (both `SB_RESTORE_SCROLL` and `SB_CAPTURE_END`
  call the idempotent `showScrollbars()`).
