# Tasks

## 1. Toast status

- [x] 1.1 `status-toast.tsx`: one `aria-live="polite"` region over the canvas,
      success auto-dismiss at 4s, error persists with a dismiss button.
- [x] 1.2 Inline SVG icons, offset+blur shadow, focus ring on dismiss, entrance
      transition + a targeted `prefers-reduced-motion` rule for it.
- [x] 1.3 `fixed` below `lg`, `absolute` in the canvas card from `lg` up.
- [x] 1.4 Sidebar keeps only the count rows; its `aria-live` wrapper is gone.
- [x] 1.5 `main.tsx` clears progress in the capture's `finally` (no more stale
      "Capture completed").

## 2. Crop truth on canvas

- [x] 2.1 RED: `cropViewMetrics` tests in `tests/crop.test.ts` (3 failing).
- [x] 2.2 GREEN: `cropViewMetrics` in `src/lib/crop.ts`.
- [x] 2.3 `#capture-window` clips to the view; image and SVG overlay unchanged.
- [x] 2.4 Applied crop drops the dim + marquee; `data-crop` states the region.
- [x] 2.5 Eight marquee handles reusing `applyBoxResizeDelta`.
- [x] 2.6 Apply/Cancel float at the marquee's corner; chip moves onto the canvas;
      both leave the sidebar.

## 3. Shell

- [x] 3.1 `main` fixed two-pane at `lg`; sidebar and canvas columns scroll their
      own contents; `#capture-viewport` is the only scroller for the capture.
- [x] 3.2 Below `lg`: canvas first, sidebar after, window scrolls; DOM order
      unchanged.

## 4. Verification

- [x] 4.1 e2e: toast inside the canvas pane, auto-dismisses, no "Capturing" left.
- [x] 4.2 e2e: applied crop shows only the crop region, marquee gone, overlay
      invariant still holds (also after Clear).
- [x] 4.3 e2e: `scrollHeight <= innerHeight` at 1280x900 while the scrollport
      scrolls.
- [x] 4.4 `npm run check`, `format:check`, `npm run test:e2e` (10) green.
- [x] 4.5 Colour-literal grep zero; no em dashes on added lines.
      (Round 1 overclaimed: the grep is Tailwind-class-only and missed a raw
      `rgba()` handle stroke - fixed in round 2, task 5.6.)
- [x] 4.6 Screenshots at 1280 and 900, light and dark, read back.
- [x] 4.7 CLAUDE.md updated.

## 5. Review round (two independent reviews, both "needs fixes")

- [x] 5.1 Floating Apply/Cancel `clamp()`ed inside the window on both axes;
      **Enter** added as a keyboard commit so the bar is never the only way.
- [x] 5.2 Applied-crop pins and numbering derived from `applyCrop` via the new
      pure `viewPins`; unit-tested on all four crop edges plus renumbering.
- [x] 5.3 Toast dismiss timer keyed on the status object, so an identical
      successive success cannot inherit the previous timer.
- [x] 5.4 `disabled={isBusy}` restored on Apply, Cancel and Clear; the Enter
      path re-checks it through the shared `applyCropDraft`.
- [x] 5.5 1:1 routed through the same percentage wrapper mapping; e2e covers
      1:1 + applied crop (window size, overlay invariant, pointer round trip);
      the viewBox departure documented in `design.md` and CLAUDE.md.
- [x] 5.6 Crop handle stroke moved to tokens; the round-1 gate claim corrected.
- [x] 5.7 Folds: guarded e2e toast dereference, CLAUDE.md "sidebar says how
      many are excluded" corrected to the canvas chip, stale "sidebar's Apply"
      comment removed.
- [x] 5.8 Found while fixing: the crop chip's Clear button covered the capture's
      top-left, making that corner undrawable (`elementFromPoint` proof). Chip
      is now `pointer-events-none` at bottom-left.
