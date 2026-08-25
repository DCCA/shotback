# Review fixes: capture modes, highlight and pen tools

Two review seats on `e02a862..a010c50`. Four Importants and five folds, all
fixed on the same branch.

## Importants

### 1. The countdown's last frame became the notice for the whole capture

`SB_CAPTURE_BEGIN` was sent with no `heading` after the countdown loop, and the
content script only rewrites the heading when one is supplied - so "Capturing
in 1..." sat on the page for the entire stitch, and the unit-tested
`captureNoticeHeading(0)` was never called in production.

The post-countdown begin now always supplies `captureNoticeHeading(0)`. The
delayed-mode e2e was strengthened to catch the class: it polls the notice again
**after** the countdown window and requires it to have returned to `Capturing
full page` before the frames finish.

### 2. Visible-mode annotations inspected the wrong element

A visible-area capture's image starts at the scroll position it was taken from,
but `refreshContexts` divided by `scale` and sent the result as document-space
coordinates. On a page scrolled to 1200px, every `ElementContext` described an
element ~1200px above the annotation - confidently wrong selectors in prompts,
which is precisely what the module's own "a stale name is worse than no name"
rule exists to prevent.

`PageMetrics` now reports the scroller's `scrollTop`, `CaptureResult` carries
`scrollOffset` (that value for visible, 0 for full - a full capture scrolls to
the top before its first frame), and `main.tsx` maps through the new pure
`toPageCoords(point, mapping)`. A band above the scroller is exempt: the header
an inner-scroller page keeps whole in the first frame never moved with the
scroller, so the offset must not apply there.

### A. Cropped-pen sidecar geometry left the 0..1 contract

`applyCrop` deliberately keeps a pen's points outside the crop rather than
clamping them (clamping would redraw the stroke into a shape the user never
made), and those points flowed through `annotationBounds` into the sidecar,
producing negative `rect.x` and `normalizedRect` values outside `[0,1]` for
content not visible in the exported image.

Fixed in `buildSidecar` only: `clampToImage` intersects the **reported** bounds
with the image before normalising. The stored points and the draw path are
untouched, so the stroke still renders exactly as drawn. It applies to every
tool, and a rect already inside the image comes back unchanged (asserted).

### B. A mid-countdown editor close stranded the notice on the page

The leak window pre-dates this change, but the countdown widened it from
milliseconds to seconds of pure waiting: close the editor mid-count and the
target page kept the notice and its hidden scrollbars forever.

Fixed as a class, in the only place that can observe it: `content.ts` re-arms a
`CAPTURE_WATCHDOG_MS` (8s) timer on every capture message and clears it on
`SB_CAPTURE_END`/`SB_RESTORE_SCROLL`. A live capture talks far more often than
that, so expiry means nobody is coming back, and `endCapture()` removes the
notice, restores the scrollbars and forgets the scroller. It deliberately does
not scroll: 8 seconds is long enough for the user to have moved themselves, and
yanking them back would be worse than the offset left behind.

## Folds

3. Visible mode had no paint barrier before its single frame. It now sends the
   same `SB_SET_OVERLAY` the frame loop does - acked only after the next paint,
   which is what guarantees the scrollbar-hide has landed - which also covers
   hiding a notice a countdown left up. Harmless with no notice: the hide
   no-ops and the ack still waits.
4. The toolbar-width regression had no assertion of its own. The palette e2e
   now checks `scrollingElement.scrollWidth <= innerWidth` and that
   `#capture-viewport`'s right edge is inside the window.
5. `h-full` on the mode chooser's `Select` was killing its own `h-10` through
   twMerge (~38px beside a 40px button). Dropped.
6. The highlight **draft** preview hardcoded `strokeWidth="2"`; it uses
   `HIGHLIGHT_EDGE_WIDTH` like the committed shape and the export.
7. `PageMetrics.scroller`'s comment said "what the content script scrolled" -
   nothing scrolls in visible mode. Reworded to describe the geometry.

## Adjudicated, no action

- The unreachable visible+countdown branch stays, for API coherence.

## Verification

- `npm run check`: 285 unit tests, typecheck, lint, build - green.
- `npm run test:e2e`: 17/17 green (three new tests, one strengthened).
- **Sabotage run**, so the new guards are known to bite rather than assumed to:
  reverting `scrollOffset` to a constant 0 and dropping the post-countdown
  heading fails exactly the two tests written for them, and nothing else.
