# Proposal: Redact a region before it leaves the editor

## Why

A full-page capture takes whatever is on screen, and what is on screen is
regularly not shareable: a customer name, an API key in a devtools panel, a
salary column, the tester's own email in a nav bar. Today the only options are
to not capture the page, to crop away half the context, or to hand the whole
thing over and hope. Every export path is a leak path, so "I will just be
careful" is not a mitigation.

## Goal

A region of the capture can be blocked out in the editor, and after that no
output carries the pixels underneath it: not the downloaded PNG, not the
clipboard copy, not the cloud LLM package, not the PNG written for Claude Code,
and not the image stored in a saved local share. The prompts and the sidecar
say that regions were hidden and where, and nothing else about them.

## Scope

- `src/types/annotation.ts` - `RedactAnnotation { tool: "redact"; x; y; width;
  height }` joins the `Annotation` union, plus `RectAnnotation` (`box |
  redact`) for the shared drag/resize path. It extends `AnnotationBase` for
  compatibility, but its `comment`/`context` are never populated.
- `src/lib/numbering.ts` - `numberAnnotations` **excludes** redactions, once,
  so the timeline, the pins, the legend, the prompts and the sidecar all skip
  them together; `redactions(annotations)` returns the other half.
- `src/lib/annotate.ts` - `exportAnnotatedImage` pixelates every redaction onto
  the base image (a `ceil(w/12) x ceil(h/12)` offscreen buffer, redrawn with
  `imageSmoothingEnabled = false`) **before** it draws any annotation, pin or
  legend row.
- `src/lib/crop.ts` - `applyCrop` shifts and clamps a redaction like a box.
- `src/lib/feedback.ts` - one `Redacted regions: N` line at every verbosity,
  `Compact` included, and never a numbered line for a redaction.
- `src/lib/sidecar.ts` - a `redactions` array of `{ tool, rect,
  normalizedRect }`, no `n`, comment or context, omitted when empty.
- `src/editor/*` - a `Redact` entry in the Tool select that forces draw mode,
  a hatched SVG-pattern preview on the canvas, drag/resize/delete/undo shared
  with boxes, no pin and no comment editor, and no DOM inspection.
- `SECURITY.md` - what redaction does and does not protect, stated plainly.
- Tests: unit cases across numbering/crop/feedback/sidecar/annotate, plus an
  e2e that draws a redaction over the fixture's CTA and measures the pixels in
  the resulting share.

## Ruling: the saved share

A share stores the **annotated export**, which is the pixelated image, so a
redaction is destructive for it: opening `viewer.html?share=<id>` cannot
recover what was hidden. That is the intended behaviour, not a limitation, and
`SECURITY.md` says so. The original capture survives only as the editor tab's
in-memory `baseDataUrl`, and closing the tab destroys it.

## Out of Scope

- Redacting text by selector rather than by region.
- JPEG/quality options (a later task); a lossy re-encode would be a second
  thing acting on the same pixels and belongs in its own change.
- Any way to reveal a redacted region after the fact. There deliberately is
  none outside the editor session that drew it.
