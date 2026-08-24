# Tasks: Redact a region before it leaves the editor

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/numbering.test.ts`: redactions are left out of
        `numberAnnotations`, `redactions()` returns them in creation order,
        `annotationBounds` gives a redaction its own rect.
  - [x] 1.2 `tests/feedback.test.ts`: `Redacted regions: N` sits above
        `Area comments:` at every verbosity and in both builders, nothing
        renders when N is 0, and a redaction never gets a numbered line.
  - [x] 1.3 `tests/sidecar.test.ts`: redactions listed apart from the
        annotations as `{ tool, rect, normalizedRect }`, field omitted at 0.
  - [x] 1.4 `tests/crop.test.ts`: a redaction is shifted, clamped and dropped
        by `applyCrop` exactly like a box.
  - [x] 1.5 `tests/annotate.test.ts`: the export records the downscale/upscale
        `drawImage` pair against a 12px-block buffer with
        `imageSmoothingEnabled` set false before the second draw, does it
        before the first `strokeRect`/`arc`, draws no pin or legend row for a
        redaction, clamps one that runs past the image and skips an empty one.
        The context stub now records property sets in order, and hands the
        pixelation buffer its own canvas object.
  - [x] 1.6 RED: 12 failing tests across the five files
        (`redactions is not a function`, the redaction numbered `2`, no
        `Redacted regions` line, `sidecar.redactions` undefined, one
        `drawImage` where three were expected).
- [x] **2. Implement; GREEN**
  - [x] 2.1 `RedactAnnotation` + `RectAnnotation` in `src/types/annotation.ts`.
  - [x] 2.2 `numberAnnotations` filters redactions out; `redactions()` added;
        `annotationBounds` treats redact as a rect.
  - [x] 2.3 `pixelateRegion` in `annotate.ts`, called right after the base
        image draw and before every mark.
  - [x] 2.4 `applyCrop` handles redact on the box branch.
  - [x] 2.5 `redactionLines` in `feedback.ts`; `redactionsField` in
        `sidecar.ts`.
  - [x] 2.6 GREEN: 196 unit tests.
- [x] **3. Editor wiring**
  - [x] 3.1 `Redact` in the sidebar Tool select; `setTool` forces draw mode for
        it as it already did for crop.
  - [x] 3.2 Canvas: hatched `<pattern>` preview in the annotation colour at 35%
        opacity, dashed outline when selected, box resize handles reused
        (`renderResizeHandles`, now shared with boxes), drag/delete/undo
        unchanged, no pin, no inline comment editor, and an existing annotation
        does not swallow the pointer-down.
  - [x] 3.3 `main.tsx`: redactions dropped from the timeline list and from the
        `SB_INSPECT_POINTS` point list.
  - [x] 3.4 Sidebar counts split: `N notes` is the numbered count, with a
        separate `Redacted regions: N` line saying where they end up.
- [x] **4. e2e**
  - [x] 4.1 RED against a `dist/` built from pre-change `src/`
        (`git stash push -- src`): no `Redact` option in the Tool select.
  - [x] 4.2 First GREEN attempt failed honestly: plain luminance variance
        barely moved (1908 -> 1806), because block averages keep variance high.
        Replaced with `pixelDetail` (mean step between adjacent pixels), which
        is what pixelation actually destroys.
  - [x] 4.3 GREEN: detail over the CTA's label collapses 9.49 -> 1.22 in the
        saved share (assertion: under a quarter), the prompt says
        `Redacted regions: 1` and carries no `[redact]`, no numbered line and
        no `button.cta`, and the timeline stays empty.
- [x] **5. Gate + docs**
  - [x] 5.1 `npm run check` - typecheck, lint, 196 unit tests, build: green.
  - [x] 5.2 `npm run format:check` - green.
  - [x] 5.3 `npm run test:e2e` - 7/7.
  - [x] 5.4 Colour-literal grep - zero hits.
  - [x] 5.5 `SECURITY.md` (the ruling, stated plainly), `CLAUDE.md` (union,
        numbering, annotate, sidecar, the Redact paragraph, the e2e line),
        `README.md` (Features) and `skills/shotback/SKILL.md` (the sidecar
        shape plus "leave redactions alone") updated.
- [x] **6. Commit and PR**

## Review fixes (task review of 8b3b9ad..8d21dad)

- [x] **7.1 Pixelation was a sample, not an average (Important).** `bufferCtx`
      used the default downscale, which weighs a couple of neighbours per
      output pixel and can carry one original pixel through almost intact,
      while `SECURITY.md` claimed "averaged". Set
      `bufferCtx.imageSmoothingQuality = "high"` before the downscale so a
      block weighs its whole area, and reworded the doc to "resampled". Unit
      test asserts the quality is set before the downscale draw, and it was
      verified to fail without the line.
- [x] **7.2 Missing attack caveat (Important).** `SECURITY.md` now says plainly
      that block pixelation is weaker than a solid fill and that Depix-class
      attacks recover short runs of known-font text from a block grid, tells
      the user to draw the region generously larger than the secret and to
      rotate a redacted credential rather than trust the blocks, and names a
      solid-fill mode as the obvious future option.
- [x] **7.3 The e2e did not prove the damage was confined (Important).**
      `expect(after).toBeLessThan(before / 4)` also passes for a blank or
      corrupted export. The redaction now covers the CTA's label rather than
      the whole button, and a control region on the button's own edge, 15px
      outside it, is measured before and after: it must stay above 70% of its
      pre-redaction detail. Measured 3.7488 -> 3.7488, unchanged to the digit,
      while the redacted label goes 20.17 -> 1.55.
- [x] **7.4 "Never populated" was convention, not a rule.** `RedactAnnotation`
      gains `comment?: never; context?: never`. The compiler immediately found
      the two paths that could have written them (`refreshContexts` and
      `updateSelectedAnnotationNote`); both now carry an explicit guard.
- [x] **7.5 Inspection exclusion moved into the lib.**
      `inspectableAnnotations(annotations)` in `numbering.ts`, used by
      `refreshContexts`, so a future inspection call site cannot leak by
      default. Unit tested. `inspectAnchor` unchanged.
- [x] **7.6 Sidebar panel self-consistency.** `excludedByCrop` counted
      redactions while `Annotations: N` excluded them; it is now computed over
      the numbered annotations only.
