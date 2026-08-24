# Completion summary

## What changed

- **Status is a toast over the canvas** (`src/editor/status-toast.tsx`, new).
  The page's only `aria-live="polite"` region. Success clears itself after 4s,
  errors persist with a dismiss button, progress rides alongside and is cleared
  when the capture ends - `Capture completed` is gone. The sidebar keeps only
  the count rows.
- **The canvas renders the applied crop.** A new `#capture-window` clips to the
  region every export contains, positioned by the pure `cropViewMetrics`
  (`src/lib/crop.ts`). The image and the SVG overlay are untouched, so
  annotation coordinates, `refreshContexts` and the overlay-covers-image
  invariant are all unchanged. The dim + marquee stop once a crop is applied.
- **The crop's controls moved onto the canvas.** Eight resize handles on the
  marquee (reusing `applyBoxResizeDelta`), floating Apply/Cancel at its corner,
  and the `Cropped to WxH / Clear` chip over the canvas. The sidebar no longer
  gains and loses ~52px of rows when a crop is drawn and applied.
- **Fixed two-pane shell** at `lg` and up: the window does not scroll, each
  column scrolls its own contents, and `#capture-viewport` is the only scroller
  for the capture. Below `lg` the canvas comes first visually and the window
  scrolls; DOM order is unchanged.

## Evidence

- `npm run check` green (231 unit tests, typecheck, lint, build);
  `prettier --check .` clean.
- `npm run test:e2e` green, 10/10, including three new checks: the toast is
  inside the canvas pane's box and auto-dismisses with no "Capturing" left over;
  an applied crop shows exactly the crop's fraction of the capture with the
  marquee gone and `overlayMatchesImage` still true (also after Clear); and
  `documentElement.scrollHeight <= innerHeight` at 1280x900 while
  `#capture-viewport` scrolls.
- Colour-literal grep (the Tailwind-class pattern, `(text|bg|border|...)-(slate|emerald|red|white)`):
  0 hits. **First round overclaimed this**: that grep never covered raw CSS
  colours, and the crop marquee's handles shipped a hard-coded
  `rgba(15,23,42,0.9)` stroke. Now token-backed (`hsl(var(--card))` /
  `hsl(var(--foreground))`, applied as CSS so `var()` resolves) and readable in
  both themes. The pre-existing dim/outline literals in the marquee decoration
  are untouched and out of scope.
- No em dashes on added lines.
- Screenshots read back at 1280 and 900, light and dark: toast over the canvas
  after a copy, marquee with handles plus floating Apply/Cancel, applied crop
  showing only the crop region, and no double scroll.

## Risks and follow-ups

- **`data-crop` is a test affordance in product code**, in the style of
  `data-sb-inspect-gen`. It is the honest place to state the applied region now
  that no `#crop-region` rect survives Apply.
- **`mx-auto` on the crop window** also centres an uncropped capture narrower
  than the pane, which previously sat left-aligned. Deliberate, and consistent
  with how the cropped view reads.
- **Not addressed here** (out of scope): the canvas has no zoom control beyond
  fit/1:1, so a very small crop is shown at up to 1:1 and no larger.
