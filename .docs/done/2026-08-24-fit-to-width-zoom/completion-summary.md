# Completion Summary: Fit-to-Width and 1:1 Zoom

## What changed

**`src/editor/use-editor-state.ts`** - `EditorState` gains `zoom: "fit" | "actual"` (default `"fit"`) and `setZoom`.

**`src/editor/annotation-canvas.tsx`** - the capture pane is now two nested divs instead of one:

- Outer `#capture-viewport` (`w-full overflow-auto`, carries the visual border/background) is the scrollport. In fit mode it never has anything to scroll; in actual mode it scrolls the oversized image horizontally, inside its own box, never the page.
- Inner `relative` wrapper sizes to the image's real rendered box: `block w-full` in fit mode (so the image's own `w-full` resolves against a definite width) or `inline-block` in actual mode (so it shrink-wraps to the image's natural, possibly-wider-than-the-pane size).
- The `<img>` className switches on `zoom`: `block h-auto w-full max-w-full` (fit) vs `block h-auto max-w-none` (actual).
- The SVG overlay is unchanged (`absolute inset-0 h-full w-full`, same `viewBox`/`getScreenCTM` pointer math) but now always matches the image exactly, in both modes, because it is sized as a percentage of the inner wrapper rather than the outer scrollport.

**`src/editor/sidebar.tsx`** - a `Select` labelled "Zoom" (`Fit width` / `Actual size (100%)`), styled and wired like the existing "Tool" select, placed right after it.

**`tests/e2e/extension.spec.ts`** - the `inner` full-page-capture test now, at a viewport narrower than the real capture: asserts the canvas `Card` is not clipping the image and the page never scrolls sideways in fit mode (the default); switches to `Actual size (100%)` and asserts the same two things hold, plus that the canvas's own scrollport does scroll; switches back to `Fit width` before the rest of the test's existing assertions (which resize the viewport back to 1280x900 and are otherwise untouched).

**README.md** - features list now mentions the fit-to-width default with a 1:1 toggle.

## Why the two-level wrapper (not the one-div version first planned)

The task brief's original plan was a single wrapper div (`w-full overflow-auto`, toggling `inline-block`/`block`). Implementing that literally and testing it empirically (a scripted Playwright repro, not the checked-in test) surfaced a real bug: the SVG overlay's `h-full`/`w-full` is a CSS percentage, which resolves against its *positioned containing block*. If that containing block is the scrollport itself, the percentage resolves against the scrollport's own (fixed, visible) width - not the width of the wider image scrolling inside it. Concretely, at a 700px-wide pane with a 780px-wide capture in actual mode: the SVG was `617px` wide (matching the pane) while the image was `780px` wide, so the rightmost ~163px of the image had no SVG covering it at any scroll position. Drawing a box near the visible right edge after scrolling created zero annotations - pointer events fell through to the plain `<img>` underneath the missing SVG.

Nesting an inner wrapper that shrink-wraps to the image's own rendered box (the same "inline-block sizes to content" trick the original code already relied on) restores the invariant that the SVG always exactly matches the image, regardless of which mode is active or how far the scrollport has scrolled. Re-ran the same repro after the fix: SVG width matched the image (780px) in both modes, and the same near-edge box draw after scrolling produced one annotation.

## RED evidence

```
Error: expect(received).toBe(expected) // Object.is equality
Expected: false
Received: true
  231 |         const card = document.querySelectorAll("main > div")[1] as HTMLElement;
  232 |         return card.scrollWidth > card.clientWidth;
> 233 |       expect(await canvasClipped()).toBe(false);
```

At a viewport set to 70% of the real capture's natural width, `card.scrollWidth` (798) exceeded `card.clientWidth` (651): the canvas `Card`'s `overflow-hidden` was silently clipping the un-scaled image rather than either fitting or scrolling it.

## GREEN evidence

```
npx playwright test
  ✓ extension loads with no popup and the downloads permission
  ✓ capture notice shows, hides for the frame, and is removed
  ✓ full-page capture stitches every viewport in order (smooth)
  ✓ full-page capture stitches every viewport in order (inner)
  ✓ editor page renders the capture UI
  ✓ dark theme keeps every control legible
  6 passed (6.2s)
```

```
npm run check
  typecheck: clean
  lint: clean
  test (vitest): 11 files, 81 tests passed
  build: succeeded
```

```
npm run format:check
  All matched files use Prettier code style!
```

```
grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/
  (zero hits)
```

## Overlay-alignment verification

A scripted Playwright repro (not checked in) confirmed pointer-to-image-space accuracy directly, beyond what the e2e suite's coordinate-free scroll/clip assertions check:

- **Fit mode**: drew a box starting 20px in from the image's top-right corner; the resulting SVG `rect`'s right edge was 6.3px short of the true image width (780px) - consistent with the drag's own 20px starting offset, confirming `getScreenCTM`-based pointer math stays accurate when the image is CSS-scaled down to fit the pane.
- **Actual mode**: after scrolling the `#capture-viewport` fully right, drew a box near the now-visible right edge of the image; it registered correctly (1 annotation), where it silently failed (0 annotations) before the two-level wrapper fix.

## Screenshots

`.superpowers/sdd/2026-08-23-fix-it-all-plan/task-8-shots/` (this worktree; not committed - binary, and this repo carries no images):

- `fit-1280.png` - 1280px wide, fit mode: the capture fills the pane exactly, no clipping, no horizontal scrollbar. A box annotation with pin `1` sits correctly on the header/red-block boundary.
- `fit-1920.png` - 1920px wide, fit mode: same capture scaled to the wider pane; annotation still lands correctly.
- `actual-1280.png` - 1280px wide, actual (100%) mode: at this pane width the capture's natural size (~780px) happens to be narrower than the available canvas width, so no scrollbar is visible here - the narrower-viewport scroll case is covered by the e2e assertions and the scripted repro above, not by this particular screenshot.

Observation: the sidebar's "Zoom" select renders identically styled to "Interaction"/"Tool", labelled correctly, and switching it updates the image immediately with no annotation drift.

## Discipline

No other UI, capture, or export logic touched. The outer `Card`'s `overflow-hidden` (annotation-canvas.tsx) was left as-is - now redundant given the inner scrollport, but harmless, and removing it was out of scope.

## Risks / follow-ups

- The `Card`'s `overflow-hidden` is now dead weight (the inner scrollport handles all clipping/scrolling). Leaving it in place per the "no other UI changes" constraint; a future cleanup could drop it.
- Actual mode's vertical scrolling still happens at the page level (only horizontal scrolling was moved into the scrollport, matching the brief). A very tall 1:1 capture on a short viewport still scrolls the whole page vertically, which is existing, unchanged behavior.

## Fix round (review feedback on PR #27)

Two Important findings and two fold-ins from task review, addressed on the same branch.

### 1. Checked-in overlay-coverage regression test

The completion summary above documented a real SVG-overlay bug found and fixed with a scripted (not checked-in) repro. Review correctly flagged that nothing in the actual test suite would fail if the two-level wrapper were ever collapsed back to one div - the fix had no permanent guard.

Added `overlayMatchesImage()` to the `inner` e2e test: compares `#capture-image`'s and `#capture-viewport svg`'s `getBoundingClientRect()` (width, height, left, top, each within 1px). Asserted true in fit mode, in actual mode, and again after `el.scrollLeft = el.scrollWidth` on `#capture-viewport`.

**Proof it catches the regression** - temporarily collapsed `annotation-canvas.tsx`'s outer scrollport and inner sizing wrapper into a single div (the same structure the original brief proposed, and the one the completion summary above explains is broken), built, and ran the `inner` test:

```
npx playwright test -g "full-page capture stitches every viewport in order \(inner\)"

  Error: expect(received).toBe(expected) // Object.is equality
  Expected: true
  Received: false

      255 |       expect(await canvasClipped()).toBe(false);
      256 |       expect(await pageScrolls()).toBe(false);
    > 257 |       expect(await overlayMatchesImage()).toBe(true);
          |                                           ^
  1 failed
```

It failed on the *fit-mode* check, before even reaching the actual-mode/scroll assertions - with one div, `zoom === "fit"` forces `block w-full` directly on the div holding the `<img>` and the SVG both, and the SVG's percentage sizing then resolves fine in fit mode too only by coincidence of the image filling the div exactly; collapsing the two roles into one div breaks the invariant in both modes, not just actual mode. Restored the real two-level wrapper, rebuilt, reran: 1 passed.

### 2. Fixed-px affordances scaled with the image

`RESIZE_HANDLE_SIZE`/`RESIZE_HANDLE_HIT_SIZE`/`INLINE_EDITOR_SIZE` are viewBox (image-px) units. At a fit ratio well under 1 (a wide capture in a narrow pane) they render illegibly small on screen - the same problem `pinRadius` already solves for pins.

Added `canvasScale(imageWidth)` to `src/lib/numbering.ts`: `pinRadius(imageWidth) / 20`, the same clamp curve normalised to 1 at 1200px. Unit-tested (`tests/numbering.test.ts`): `canvasScale(1200) === 1`, `canvasScale(600) ≈ 0.7`, `canvasScale(4000) ≈ 1.4`.

`annotation-canvas.tsx` now computes `scale = canvasScale(imageSize.width)` once per render alongside `pinR`, and derives `resizeHandleSize`, `resizeHandleHitSize`, `inlineEditorSize` (`{width, height}`, passed to `placeInlineEditor`, whose signature already took an `editor` size param) and `inlineEditorFontSize` from the same base constants (now prefixed `BASE_*`) multiplied by `scale`. The textarea's font size moved from a Tailwind `text-[13px]` class to an inline `style={{ fontSize: ... }}` since it now has to vary per capture.

### Fold-ins

- **Fit mode must not upscale**: added `style={{ maxWidth: imageSize.width }}` to the `<img>` in fit mode, so a capture narrower than the pane renders at its real size instead of being stretched up to fill `w-full`. README wording updated: "shrink to fit, never upscale a narrower capture".
- **Actual mode baseline gap**: the `inline-block` inner wrapper left a few px of descender space below the image (the classic inline-formatting-context gap under a shrink-wrapped inline-block). Added `align-bottom` to the inner wrapper's className in actual mode.

### Re-verification

```
npx vitest run tests/numbering.test.ts
  Test Files  1 passed (1)
       Tests  7 passed (7)

npm run check
  typecheck: clean
  lint: clean
  test (vitest): 11 files, 82 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style!

npx playwright test
  ✓ extension loads with no popup and the downloads permission
  ✓ capture notice shows, hides for the frame, and is removed
  ✓ full-page capture stitches every viewport in order (smooth)
  ✓ full-page capture stitches every viewport in order (inner)
  ✓ editor page renders the capture UI
  ✓ dark theme keeps every control legible
  6 passed (6.0s)

grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/
  (zero hits)
```

### Screenshots (regenerated)

`.superpowers/sdd/2026-08-23-fix-it-all-plan/task-8-shots/` (this worktree; not committed):

- `fit-1920.png` - regenerated. The capture no longer stretches to fill the 1920px pane; it renders at its natural size (~780px in this test environment) with empty space to the right, confirming the "never upscale" fix.
- `fit-1280.png`, `actual-1280.png` - regenerated for consistency (both predate the `maxWidth` fix and, for actual mode, the `align-bottom` fix); box placement and pin position are unchanged.
- `fit-900-selected.png` (new) - 900px-wide pane, fit mode, a box drawn and left selected so the inline comment editor renders. The comment text ("Chart cuts off on mobile") is clearly legible, and the resize handles at the box's corners are visible, proportionate squares - not the illegible few-px dots the un-scaled constants would have produced at a stronger fit ratio. This test environment's capture (~780px wide) is narrower than the 1200px `canvasScale` baseline, so the scale factor in play here is a mild 0.7, not the extreme ~0.35 example in the review; the mechanism (unit-tested independently) is what covers the extreme case.

### Files touched in this round

- `src/lib/numbering.ts` (new `canvasScale`)
- `tests/numbering.test.ts` (new test)
- `src/editor/annotation-canvas.tsx` (scaled affordances, `maxWidth` cap, `align-bottom`)
- `tests/e2e/extension.spec.ts` (`overlayMatchesImage` + its three assertions)
- `README.md` (wording)
- `.docs/done/2026-08-24-fit-to-width-zoom/tasks.md`, `completion-summary.md` (this section)
