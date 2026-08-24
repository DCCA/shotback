# Tasks: Crop the capture before export

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/crop.test.ts`: `applyCrop` for boxes (shift, clamp on each
        edge, larger-than-crop, fully outside, edge-touching), arrows (both
        endpoints inside, tail-only, head-only, both outside), text (anchor in
        / out), plus order, no-mutation and empty-input cases; `clampCrop`
        (fits, rounds, off-edge, negative origin, min size, image size).
  - [x] 1.2 `tests/annotate.test.ts`: `exportAnnotatedImage` with `crop` draws
        only the source rect onto a crop-sized canvas, pins the crop-space
        annotations it is given, clamps an out-of-bounds crop, and still draws
        the whole image without one.
  - [x] 1.3 RED: both files failed to import `../src/lib/crop`
        (`Cannot find module`), then the 4 new `annotate.test.ts` cases failed
        on the `drawImage` source-rect args once `crop.ts` existed.
- [x] **2. Implement; GREEN**
  - [x] 2.1 `src/lib/crop.ts` with `Rect`, `MIN_CROP_SIZE`, `clampCrop`,
        `applyCrop`.
  - [x] 2.2 `exportAnnotatedImage` takes `options.crop`, clamps it, sizes the
        canvas and the notes layout off the crop, and draws the 9-argument
        `drawImage` source rect.
  - [x] 2.3 GREEN: 35 tests across `crop.test.ts` + `annotate.test.ts`.
- [x] **3. Editor wiring**
  - [x] 3.1 `EditorTool = AnnotationTool | "crop"`, `crop` / `cropDraft` state
        outside the history.
  - [x] 3.2 `exportView(state)` in `use-exports.ts` - the single derivation used
        by download, copy image, cloud LLM, Claude Code (prompt and sidecar) and
        share save.
  - [x] 3.3 Canvas: marquee on pointer-up (>= `MIN_CROP_SIZE`, clamped), dimmed
        outside, `#crop-region` outline, Escape cancels, annotations do not
        swallow a pointer-down while the crop tool draws.
  - [x] 3.4 Sidebar: `Crop` tool option, Apply/Cancel, `Cropped to WxH - Clear`.
  - [x] 3.5 `main.tsx`: a new capture clears `crop` and `cropDraft`.
- [x] **4. e2e**
  - [x] 4.1 RED against a `dist/` built from pre-change `src/`
        (`git stash push -- src/`): no `Crop` option in the Tool select.
  - [x] 4.2 RED targeted at the prompt path: with `exportView` returning
        uncropped annotations, the geometry assertion failed - the CTA box
        still reported `at (254, 214) ... [104%, 100% of page]`.
  - [x] 4.3 GREEN: crop-space geometry, element context intact, the text
        annotation dropped, the share image exactly the crop's width, Clear
        removes the region.
- [x] **5. Gate + docs**
  - [x] 5.1 `npm run check` - typecheck, lint, 178 unit tests, build: green.
  - [x] 5.2 `npm run format:check` - green.
  - [x] 5.3 `npm run test:e2e` - 6/6.
  - [x] 5.4 Colour-literal grep - zero hits.
  - [x] 5.5 Crop UI screenshotted in light and dark (marquee + applied row).
  - [x] 5.6 CLAUDE.md (helper list, outputs paragraph) and README (Features,
        Usage) updated.
- [x] **6. Commit and PR**
