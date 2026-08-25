# Design: capture modes, highlight and pen tools

## Capture modes

`captureFullPage(tabId, windowId, onProgress, options)` gains a fourth
parameter, `CaptureOptions = { mode?: "full" | "visible"; delaySeconds?: number }`.
Both default to today's behaviour, so every existing call site is unchanged.

Inside, the mode changes exactly three things:

- `steps` is `[0]` instead of `buildScrollSteps(...)`.
- `contentHeight` is `metrics.viewportHeight` instead of `metrics.fullHeight`,
  which is what sizes the stitched canvas. With `scrollerTop` added as before,
  an inner-scroller page still keeps its header band.
- The per-frame `SB_SCROLL_TO` / `SB_SET_OVERLAY` pair is skipped.

Everything else is shared: the metrics read (which is what hides the page's
scrollbars), the diagnostics read, `SB_RESTORE_SCROLL` and `SB_CAPTURE_END` in
the `finally`, and the previously-active tab restore. A visible-mode capture
therefore leaves the page in exactly the state a full one does.

**No notice in visible mode.** The notice exists because a full capture takes
over the target tab for several seconds and scrolls it under the user. A
visible-mode grab does neither: it is one `captureVisibleTab` call. Showing the
notice would mean a show, a paint, a hide acked after another paint and a
settle - roughly half a second of flashing a warning about something that has
already finished. So it is skipped, deliberately, and the frame is taken
straight away.

**The countdown** is driven by the orchestrator, not the content script:
`SB_CAPTURE_BEGIN` takes an optional `heading`, and `captureFullPage` re-sends
it once a second with `captureNoticeHeading(remaining)`. The content script
holds no timer, so nothing can be left counting down after a failed capture,
and the wording is a pure function pinned by a unit test. It is text updates
only - no animation, no transition - so a `prefers-reduced-motion` preference
changes nothing about it (the spinner beside it already honours that).

Delay and mode are independent in the orchestrator; the UI offers the three
useful combinations through `captureOptions(mode)` and `CAPTURE_MODES`. A
delayed visible capture is coherent anyway: the countdown's notice is hidden
(`SB_SET_OVERLAY`, acked after paint) before the one frame.

**Editor-side only.** `background.ts` is untouched: the toolbar icon opens the
editor with `autocapture=1` and `main.tsx` passes `"full"` explicitly there.
There is no moment between the click and the capture in which a mode could be
chosen, and adding URL params for it would be a mode chooser nobody can reach.

## The chooser

A split control in the sidebar header: the existing filled `Capture Page`
button (`flex-1`) beside a 9.5rem `Select`. The button's label never changes -
it always captures - and the chooser is what says how much. The mode is local
`useState` in `sidebar.tsx` rather than editor state: it is read once, at the
click, and nothing else in the session depends on it. `onCapture` takes the
mode as its argument, so `main.tsx` stays the only place that talks to
`captureFullPage`.

The `Replace capture?` confirm pair goes through the same `runCapture`, so the
mode survives the confirm.

## Highlight and pen

Two new members of the `Annotation` union, both carrying a `comment` (unlike
`redact`, which is deliberately mute):

- `HighlightAnnotation { tool: "highlight"; x; y; width; height }` - a rect, so
  it joins `RectAnnotation` and inherits the eight-handle resize path.
- `PenAnnotation { tool: "pen"; points: Array<{x,y}> }`.

Every helper that switches on `tool` was extended together, which is what keeps
the canvas, the export, the prompts and the sidecar describing one thing:

| Helper                          | Highlight            | Pen                                  |
| ------------------------------- | -------------------- | ------------------------------------ |
| `annotationBounds`              | its own rect         | min/max of the points (0 rect if none) |
| `pinAnchor`                     | `x, y`               | bounds top-left                      |
| `inspectAnchor`                 | bounds centre        | bounds centre                        |
| `applyCrop`                     | intersected, like a box | kept if **any** point is inside, shifted, never clamped |
| `describeGeometry`              | like a box           | `pen path of N points from (..) to (..)` + bounds % |
| `moveAnnotation`                | `x, y` shift         | every point shifted                  |
| `numberAnnotations` / `sidecar` | unchanged - both are ordinary numbered annotations |

Pen crop follows the arrow's rule rather than the box's: clamping a stray point
onto the crop edge would redraw the stroke into a shape the user never made.

**Drawing.** Highlight reuses the rect draft. Pen gets its own `penDraft`
state - a path is not a rect - and thins as it goes: a point is appended only
once the pointer has travelled `PEN_POINT_SPACING` (3 px) from the last one, so
a stroke is a few dozen points instead of one per pointer event, in the
annotations array, the undo history, every saved share and the sidecar. A
single-point path is a click that never moved and commits nothing.

**Highlight rendering, and why there is an edge.** The wash is the annotation
colour at `HIGHLIGHT_ALPHA` (0.35) composited `multiply` - `mix-blend-mode` on
the canvas, `globalCompositeOperation` + `globalAlpha` (saved and restored) in
the export - because that is what keeps the text underneath readable instead of
washing it out. But `multiply` against a near-black section leaves near-black:
verified on a two-tone fixture, a highlight over a dark hero was invisible in
both editor themes. So the region also gets a `HIGHLIGHT_EDGE_WIDTH` (2 px)
edge at full opacity, outside the blend. On light content it reads as the
marker's own boundary; on dark content it is the whole of what marks the
region. Both constants are exported from `annotate.ts` and used by the canvas,
so the preview and the PNG cannot drift.

Pen is a polyline with round caps and joins in both, over a 14px transparent
stroke on the canvas for a hit area - the same trick the arrow uses.

## The palette, and the pane it sits in

Eight segments no longer fit one row on a narrow canvas pane. Two changes, both
of which are the fix for the same bug rather than styling:

- The tool group wraps internally (`flex-wrap`, `min-h-8`, `min-w-0`) and the
  bar wraps at every width, not only below `lg`.
- The canvas grid track is `minmax(0,1fr)`, not `1fr`. A bare `1fr` has an
  automatic minimum, so a toolbar that refused to shrink widened the column,
  overflowed the window and clipped the capture inside it - which is exactly
  what the `inner` e2e's `canvasClipped()` caught.
