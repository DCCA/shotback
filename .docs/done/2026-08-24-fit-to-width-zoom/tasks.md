# Tasks: Fit-to-Width and 1:1 Zoom

- [x] **1. Write the failing e2e test**
  - [x] 1.1 In the `inner` full-page-capture test, at a viewport narrower than the real capture: assert the canvas `Card` is not clipping the image (`card.scrollWidth <= card.clientWidth`) and the page itself never scrolls sideways (`document.documentElement.scrollWidth <= clientWidth`).
  - [x] 1.2 Switch the new "Zoom" select to `Actual size (100%)`; assert neither the `Card` nor the page clip/scroll, and that the canvas's own scrollport (`#capture-viewport`) does scroll (`scrollWidth > clientWidth`).
- [x] **2. Run it to verify it fails**
  - [x] 2.1 RED: `expect(await canvasClipped()).toBe(false)` fails - `card.scrollWidth` (798) > `card.clientWidth` (651) at the narrower viewport, because `max-w-none` never shrinks the image and the `Card`'s `overflow-hidden` silently clips it instead of scrolling.
- [x] **3. Add `zoom` state**
  - [x] 3.1 `EditorState.zoom: "fit" | "actual"` + `setZoom`, default `"fit"`, in `use-editor-state.ts`.
- [x] **4. Fix the canvas sizing**
  - [x] 4.1 `<img>` className switches on `zoom`: `block h-auto w-full max-w-full` (fit) vs `block h-auto max-w-none` (actual).
  - [x] 4.2 Restructure the wrapper into an outer scrollport (`#capture-viewport`, `w-full overflow-auto`) and an inner sizing wrapper (`relative`, `block w-full` in fit / `inline-block` in actual) holding the `<img>` and the SVG overlay.
    - Discovered mid-implementation: a single wrapper (as first drafted) breaks the SVG overlay in actual mode. The SVG is sized by CSS percentage (`h-full w-full`) against its positioned ancestor; if that ancestor is the scrollport itself, the SVG is clipped to the *visible* pane width, not the image's real width, so pointer hit-testing silently misses the part of the image only reachable by scrolling (reproduced: drawing a box near the visible right edge after scrolling created 0 annotations). Nesting an inner wrapper that shrink-wraps to the image's actual rendered box (`inline-block` in actual mode) restores the invariant that the SVG always matches the image exactly. Confirmed the fix with a scripted repro (scroll right, draw near the edge, 1 annotation now created; also confirmed the previous bug reproduced as 0).
- [x] **5. Sidebar Zoom select**
  - [x] 5.1 `Select` labelled "Zoom" (`aria-labelledby`, same styling as "Tool"), options `Fit width` (`fit`) / `Actual size (100%)` (`actual`), placed after the Tool select.
- [x] **6. Run e2e + gate, verify overlay alignment, screenshot**
  - [x] 6.1 `npm run test:e2e` - 6/6 green.
  - [x] 6.2 `npm run check` (typecheck, lint, 81 unit tests, build) - green.
  - [x] 6.3 `npm run format:check` - green.
  - [x] 6.4 `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - zero hits.
  - [x] 6.5 Fit-mode corner-placement check: drew a box at the image's top-right corner in fit mode via a scripted repro; the resulting image-space rect landed within 6px of the true edge (matching the drag's own 20px starting inset from the corner) - overlay is pixel-aligned.
  - [x] 6.6 Screenshots at 1280px and 1920px wide (fit) and 1280px (actual) in `.superpowers/sdd/2026-08-23-fix-it-all-plan/task-8-shots/`.
- [x] **7. Docs**
  - [x] 7.1 `.docs/done/2026-08-24-fit-to-width-zoom/` (this folder).
  - [x] 7.2 README features list mentions fit-to-width default + 1:1 toggle.
- [x] **8. Commit, push, PR**

## Fix round (review feedback on PR #27)

- [x] **9. Checked-in overlay-coverage regression test**
  - [x] 9.1 `overlayMatchesImage()` in the `inner` e2e test: asserts the SVG's `getBoundingClientRect()` matches `#capture-image`'s within 1px, in fit mode, in actual mode, and again after scrolling `#capture-viewport` fully right.
  - [x] 9.2 Proved it catches the regression: temporarily collapsed the two-level wrapper back to one div, ran the `inner` test, quoted the RED (failed on the fit-mode check, before even reaching actual mode), restored the real implementation, reran - GREEN.
- [x] **10. Scale fixed-px-in-image-space affordances with the image**
  - [x] 10.1 `canvasScale(imageWidth)` in `src/lib/numbering.ts` = `pinRadius(imageWidth) / 20` (same clamp curve, normalised to 1 at 1200px). Unit-tested: 1200 -> 1, 600 -> 0.7, 4000 -> 1.4.
  - [x] 10.2 `annotation-canvas.tsx`: resize handle size/hit-size, the inline comment editor's width/height (passed to `placeInlineEditor`) and its textarea font size all multiply by `canvasScale(imageSize.width)`.
- [x] **11. Fold-ins**
  - [x] 11.1 Fit mode never upscales: `style={{ maxWidth: imageSize.width }}` on the `<img>` in fit mode.
  - [x] 11.2 Actual mode's `inline-block` inner wrapper baseline gap: added `align-bottom` to it.
  - [x] 11.3 README wording: "shrink to fit, never upscale a narrower capture".
- [x] **12. Re-verify and re-screenshot**
  - [x] 12.1 `npx vitest run tests/numbering.test.ts` - green (7 tests).
  - [x] 12.2 `npm run check` - green (82 unit tests total).
  - [x] 12.3 `npm run format:check` - green.
  - [x] 12.4 `npm run test:e2e` - 6/6 green.
  - [x] 12.5 Regenerated `fit-1920.png` (now capped at natural size, not stretched), `fit-1280.png` and `actual-1280.png` (same fix, for consistency), and added `fit-900-selected.png` (box selected, comment editor legible at a sub-1200px capture's scale factor).
- [x] **13. Push**
