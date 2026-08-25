# Tasks: capture modes, highlight and pen tools

## 1. Capture modes

- [x] 1.1 `CaptureMode`, `CAPTURE_MODES`, `CAPTURE_DELAY_SECONDS`,
      `captureOptions`, `captureNoticeHeading` in `src/lib/capture.ts` (pure,
      unit-tested)
- [x] 1.2 `captureFullPage` takes `CaptureOptions`: visible mode is `[0]` steps,
      viewport-tall canvas and no scroll/notice messages
- [x] 1.3 Countdown driven from the orchestrator via `SB_CAPTURE_BEGIN`'s
      optional `heading`; content script sets the text and holds no timer
- [x] 1.4 Split control in `sidebar.tsx`; `onCapture(mode)`; `main.tsx` passes
      `"full"` for auto-capture

## 2. Highlight and pen

- [x] 2.1 `HighlightAnnotation` / `PenAnnotation` in `src/types/annotation.ts`;
      highlight joins `RectAnnotation`
- [x] 2.2 `numbering.ts`: bounds, `pinAnchor`, `inspectAnchor`,
      `describeGeometry`
- [x] 2.3 `crop.ts`: highlight intersected, pen kept-if-any-point-inside
- [x] 2.4 `annotate.ts`: multiply wash + full-opacity edge; round-capped
      polyline; `HIGHLIGHT_ALPHA` / `HIGHLIGHT_EDGE_WIDTH` exported
- [x] 2.5 `annotation-geometry.ts`: `moveAnnotation` shifts pen points
- [x] 2.6 Canvas: draw both, thinned pen draft, resize handles on highlight,
      inline comment editor on both
- [x] 2.7 Palette: `Highlight` (H) and `Pen` (P) after Text

## 3. Layout fallout

- [x] 3.1 Palette wraps at every width; tool group wraps internally
- [x] 3.2 Canvas grid track `minmax(0,1fr)`

## 4. Tests

- [x] 4.1 Unit RED -> GREEN: numbering, crop, annotate (export stub), sidecar,
      feedback, tool-palette, capture options, `moveAnnotation`
- [x] 4.2 e2e: visible mode yields viewport-tall image; delayed mode shows the
      countdown on the target page; highlight + pen drawn, pinned and in the
      prompt; palette hotkey guard extended to `h`/`p`

## 5. Gates and docs

- [x] 5.1 `npm run check`, `format:check`, `npm run test:e2e` green
- [x] 5.2 Tailwind colour-utility grep at zero
- [x] 5.3 Both themes screenshot-verified, over light and dark page content
- [x] 5.4 CLAUDE.md and README updated; this change folder written

## 6. Review fixes (see `review-fixes.md`)

- [x] 6.1 Post-countdown `SB_CAPTURE_BEGIN` supplies `captureNoticeHeading(0)`;
      e2e asserts the notice returns to the standard heading
- [x] 6.2 `PageMetrics.scrollTop` -> `CaptureResult.scrollOffset` -> the pure
      `toPageCoords`, so visible-mode inspection reads the right element
- [x] 6.3 `buildSidecar` clamps the reported rect to the image, so
      `normalizedRect` cannot leave 0..1
- [x] 6.4 Content-script watchdog: an abandoned capture cleans itself up
- [x] 6.5 Folds: visible-mode paint barrier, layout guard in the palette e2e,
      the chooser's `h-full`, the highlight draft's edge width, the
      `PageMetrics.scroller` comment
- [x] 6.6 Sabotage run proving the two new guards fail without their fixes
