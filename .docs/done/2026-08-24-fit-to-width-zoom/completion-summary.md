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
