# Completion summary

## What changed

**One recommended output.** `#editor-actions` is now three separated groups -
edit (Undo/Redo/Delete), send (Copy for Claude Code, Prepare for Cloud LLM,
Copy Local Share Link), file (Download Image, Copy Image). `Copy for Claude
Code` is the only filled button, captioned `Saves PNG + JSON to
Downloads/shotback and copies the prompt.`; `Capture Page` is primary only
until there is a capture. No export's behaviour changed.

**Redactions are pixelated on the canvas.** `pixelateRegion` is now exported
from `src/lib/annotate.ts` and takes any `CanvasImageSource`; a
`#redaction-overlay` canvas inside the image wrapper redraws through it from
the `<img>`, so the editor shows the exact blocks the export burns in. Holding
`Alt` over a selected region reveals what is under it. The hatch survives only
as the draft's and the selected region's fill.

**Minors.** `plural()` (one helper, unit-tested) fixes `1 notes` everywhere;
the annotation count is stated once, as the header badge; the share URL is a
`Local share link copied` chip with an `Open` link and clears on any other
export; saved-share rows show the stored page title and a 40px lazy thumbnail;
`Capture Page` (with annotations) and a share's `Delete` both confirm inline
via `useTimedConfirm`, reverting after 5s / 3s.

## Verification

- `npm run check` green (252 unit tests, 19 files), `format:check` clean.
- `npm run test:e2e` green: 12/12, including the extended redaction test (the
  editor's own overlay is opaque in the region, transparent outside it, has the
  same collapsed detail as the export, and goes transparent under a held `Alt`)
  and a new `destructive actions confirm in place` test.
- Colour-utility grep over `src/`: 0 hits.
- Light and dark screenshots read for the actions column, the confirm pair, the
  share chip, the saved-share rows and the Alt reveal.

## Risks and follow-ups

- The overlay canvas inherits the SVG overlay's sizing exactly, so it aligns
  wherever the SVG does; a future zoom mode that breaks one breaks both, which
  is the intended coupling.
- `ponytail:` note on the Alt listener: on a platform where a bare `Alt` moves
  focus into browser chrome, the `blur` handler ends the reveal. The region
  stays covered, which is the safe failure. Upgrade path if it bites: reveal
  from a pointer gesture on the region instead.
- Saved-share thumbnails re-load whenever the shares array is replaced (e.g.
  after a delete). Cheap at the retention cap of 50 and only while the list is
  open; worth memoising by id if the list ever grows.
