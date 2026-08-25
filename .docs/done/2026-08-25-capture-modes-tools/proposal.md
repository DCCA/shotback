# Proposal: capture modes, highlight and pen tools

## Why

Two gaps, both about what the editor can be asked for.

**Capture was one thing only.** Every capture scrolled the whole page and
stitched it, which is right for a bug report and wrong for the two other
things people actually want:

- A screenshot of just what is on screen. Scrolling the target tab to stitch a
  2400px document takes seconds and re-lays-out sticky headers, for a shot of
  one viewport.
- A shot of something that only exists while the pointer is somewhere: an open
  menu, a hover state, a tooltip. Clicking Capture Page dismisses it.

**The annotation tools could outline and label, not mark up.** Box, arrow and
text point _at_ things. Neither of the two gestures people reach for when
reviewing a page - swiping a marker over a line of copy, and scribbling round a
mess - had a tool.

## Scope

**In:**

- `captureFullPage` takes `{ mode?: "full" | "visible"; delaySeconds?: number }`.
  `visible` grabs the one on-screen frame (no scroll messages, no notice);
  `delaySeconds` counts down in the on-page notice before the frames.
- A compact mode chooser beside the Capture Page button: Full page / Visible
  area / Full page after 3s. Editor-side only; the toolbar icon and
  `Alt+Shift+S` stay full-page.
- Two annotation types: `HighlightAnnotation` (a rect washed in the annotation
  colour, `multiply`, plus a full-opacity edge) and `PenAnnotation` (a thinned
  freehand path). Both numbered, commented, inspected, cropped, exported,
  sidecar'd and prompted like a box.
- Palette gains `Highlight` (`H`) and `Pen` (`P`) after Text.
- The palette wraps at every width, and the canvas grid track gets an explicit
  `minmax(0,1fr)` minimum - eight segments no longer fit one row on a narrow
  canvas pane, and a toolbar that refused to shrink widened the pane and
  clipped the capture in it.

**Out:**

- Capture modes on the toolbar icon. One-click capture asks nothing by design,
  and there is nowhere to pick a mode before it fires.
- A configurable delay. Three seconds, one constant.
- Smoothing a pen path into a spline. Thinning to ~3px already reads as a
  stroke; a curve fit is a second problem.
- Highlight-specific blend choices per background. One `multiply` wash plus an
  edge covers light and dark page content (see `design.md`).
