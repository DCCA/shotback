# Completion Summary: Redact a region before it leaves the editor

## What changed

- `src/types/annotation.ts` - `RedactAnnotation { tool: "redact"; x; y; width;
  height }` joins the `Annotation` union, and `RectAnnotation` (`box | redact`)
  names the two tools that are plain rectangles and share the drag/resize path.
  `AnnotationTool` gains `"redact"`, so it flows into the sidebar's
  `EditorTool` for free. It extends `AnnotationBase` for compatibility, but
  its `comment`/`context` are typed `never`, so the compiler refuses a write
  rather than leaving "never populated" to convention.
- `src/lib/numbering.ts` - `numberAnnotations` now filters redactions out
  before it numbers, which is the one place that decision lives: the comment
  timeline, the canvas pins, the exported legend, both prompts and the JSON
  sidecar all derive from it, so none of them can disagree about whether a
  redaction is a note. `redactions(annotations)` returns the other half in
  creation order, `inspectableAnnotations(annotations)` is what may be mapped
  back onto the live page (redactions filtered out in the lib, not at the call
  site, so a future inspection caller cannot leak by default), and
  `annotationBounds` treats a redaction as its own rect.
- `src/lib/annotate.ts` - `pixelateRegion` squashes a region onto a
  `ceil(w/12) x ceil(h/12)` offscreen canvas and stretches it straight back
  over itself with `imageSmoothingEnabled = false`, so what lands is one
  resampled value per block and the original is gone. The downscale runs at
  `imageSmoothingQuality = "high"` so a block weighs its whole area rather than
  sampling a pixel or two out of it (the default bilinear sample can carry one
  original pixel through almost intact). `exportAnnotatedImage` runs it for every
  redaction **immediately after** the base image draw and **before** any shape,
  pin or legend row, so nothing can be painted over a secret before it is
  destroyed. The region is clamped to the canvas (a hand-drawn rect can hang
  off the edge) and skipped when it has no area.
- `src/lib/crop.ts` - `applyCrop` handles redact on the box branch: intersected
  with the crop, dropped when nothing is left. A dropped redaction hides
  nothing, because the crop already cut those pixels out of the export.
- `src/lib/feedback.ts` - `redactionLines` renders one `Redacted regions: N`
  line above `Area comments:`, at **every** verbosity including `Compact` (a
  safety fact about the attached image is worth one line), and nothing at all
  when N is 0, so an untouched prompt stays byte-identical to before.
- `src/lib/sidecar.ts` - a `redactions` array of `{ tool, rect,
  normalizedRect }`, deliberately barer than a `SidecarAnnotation`: no `n` (no
  pin to match), no comment and no context, because a selector or a note about
  a hidden region would describe exactly what the user hid. Omitted entirely
  when nothing was redacted.
- `src/editor/use-editor-state.ts` - `setTool` forces draw mode for `redact` as
  it already did for `crop`; both are drawn by dragging out a region, and
  committing an annotation leaves the canvas in move mode.
- `src/editor/annotation-canvas.tsx` - a redaction renders as a diagonal SVG
  `<pattern>` hatch (`patternUnits="userSpaceOnUse"`, scaled by `canvasScale`)
  in the annotation colour at 35% opacity, dashed outline when selected, with
  the box resize handles reused via a new `renderResizeHandles` helper (the
  same markup boxes already used, now shared instead of duplicated). It gets no
  pin and no inline comment editor. `drawingCrop` became `drawingRegion` and
  now covers redact too, so an existing annotation does not swallow the
  pointer-down that starts one: a secret has to be coverable wherever it sits.
- `src/editor/main.tsx` - redactions are dropped from the timeline list, and
  the `SB_INSPECT_POINTS` point list comes from `inspectableAnnotations`.
- `src/editor/sidebar.tsx` - `Redact` in the Tool select; the counts split into
  `N notes` (numbered only) and a separate `Redacted regions: N (pixelated in
  every export and in the saved share)` line. `excludedByCrop` counts the
  numbered annotations only, so the panel agrees with itself.

## Leak surfaces

Every output is the return value of one `exportAnnotatedImage` call, reached
through the single `exportView(state)` derivation in `use-exports.ts`:

| Surface                             | Carries the pixelated image?                   |
| ----------------------------------- | ---------------------------------------------- |
| Download Image (PNG)                | yes, `merged`                                  |
| Copy Image (clipboard)              | yes, `merged` re-fetched as a blob             |
| Prepare for Cloud LLM (PNG)         | yes, `merged`                                  |
| Copy for Claude Code (PNG)          | yes, `merged`                                  |
| Copy Local Share Link (saved share) | yes, `saveLocalShare({ imageDataUrl: merged })` |
| Both prompts                        | count only, no numbered line, no selector      |
| JSON sidecar                        | rects only, no `n`, comment or context         |
| DOM inspection (`SB_INSPECT_POINTS`) | redactions are never sent                     |

No path stores or exports `baseDataUrl`. It is state on the editor tab and
nothing writes it to `chrome.storage.local`, IndexedDB or disk.

## Risks and honest limits

- **A redaction is destructive for the share.** The saved share holds the
  pixelated image, so it cannot be undone from the viewer. Recorded in
  `SECURITY.md` as intended behaviour.
- **The unredacted capture lives only in the editor tab.** Closing it is what
  destroys it, and there is no recovery afterwards for anyone, user included.
- **Redaction hides pixels, not the page.** The page URL, the environment
  block, other annotations' selectors and the failed-request URLs are
  untouched, so a secret in a URL still has to be removed by hand.
- **Block pixelation is weaker than a solid fill.** A grid of block averages is
  a lossy but structured encoding of what it replaced, and Depix-class attacks
  recover short runs of known-font text from one by searching a rendered corpus
  for a matching block pattern. `SECURITY.md` says so, and tells the user to
  draw the region generously larger than the secret and to rotate a redacted
  credential rather than trust the blocks. A solid-fill mode would remove that
  class of attack outright and is the obvious follow-up if this is not enough.

## Verification

- `npm run check`: typecheck, lint, **197** unit tests, build. Green.
- `npm run format:check`: green.
- `npm run test:e2e`: **7/7**, including a new test that draws a redaction over
  the fixture CTA's label and measures the pixels in the resulting saved share.
  Fine detail there falls from **20.17 to 1.55** (assertion: under a quarter),
  while a control region on the button's own edge 15px outside the redaction
  holds at **3.7488 -> 3.7488**, unchanged to the digit - so the assertion
  cannot be satisfied by a blank or corrupted export. The prompt says
  `Redacted regions: 1` and carries no `[redact]`, no numbered line and no
  `button.cta`.
- Colour-literal grep over `src/`: zero hits.

## Follow-ups

- None required. Task 24 (JPEG/quality options) touches the same export canvas;
  a lossy re-encode runs **after** pixelation and so cannot reveal anything,
  but the ordering is worth re-checking when it lands.
