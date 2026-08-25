# Proposal: dogfood wave (keyboard access, export trace, toast, saved shares)

Recorded after the fact. The work shipped as PR #49 without its change folder,
which `FIREHOSE.md` requires for any non-trivial change and which the other
four waves on this branch each carried. This folder is the missing record; the
source material is the dogfood findings and the wave brief and report in
`.superpowers/sdd/2026-08-23-fix-it-all-plan/` (`dogfood-verified.md`,
`wave-e-brief.md`, `wave-e-report.md`, `wave-e-review-*.md`).

## Why

Three people were asked to use Shotback for real - a first-timer, a power user
and a keyboard-only user - and every finding they raised was reproduced
independently against the built extension before any of it was accepted. Twelve
verified findings came back, and they cluster into four honest gaps:

**The editor lost track of its own output.** _Copy for Claude Code_ wrote a PNG
and a JSON sidecar to disk and left no trace inside Shotback: Saved Shares still
read `0 / No saved shares yet`. Lose the clipboard before pasting and the only
route back to a file the tool had just written was the OS file browser.

**The one thing the product promises was invisible until after it was sent.**
Shotback's pitch is "point the agent at the exact element", and it does resolve
one for every annotation - but nothing rendered `annotation.context`. A box
drawn over genuinely blank space still produced a fully confident selector, and
the first sight of it was the copied prompt. `elementsFromPoint` always answers
_something_, so "a few pixels off" and "dead on" looked identical in the editor.

**The keyboard could not draw.** No pointer, no annotation: there was no way to
create, move or resize a shape without a mouse, the canvas was not focusable,
Escape in the inline comment editor **committed** the draft instead of
discarding it, leaving that editor the one control in the app where Escape meant
the opposite of cancel, and leaving a note stranded focus on `<body>` so the
next Tab wrapped to the top of the sidebar. Delete, undo and redo changed the
canvas and announced nothing at all.

**Small things that were quietly expensive.** The success toast was docked
top-right, over the palette's colour swatches, and swallowed clicks aimed at
them for the four seconds a success is up. A tool hotkey pressed straight after
finishing a shape went into the just-committed annotation's comment box. The
saved-shares list was read once on mount, so a second editor tab never appeared
in the first - and the only refresh was a reload, which re-runs `autocapture=1`
and destroys that tab's own annotations. The `Downloads/shotback` caption read
as a relative path, and the collapsed Saved Shares toggle gave no count.

## Scope

**In** (the eleven items E1-E11 of the wave brief):

- Escape in the inline comment editor discards the draft and hands focus back
  to the canvas with the annotation still selected; every other leave path still
  commits. One sidebar hint line names it.
- The canvas is drawable from the keyboard: focusable SVG, `Enter` places the
  armed tool's default shape at the centre of the _visible_ part of the capture,
  arrow keys nudge and `Shift`+arrow resizes, one commit per key-up. The pure
  geometry lands in `src/lib/keyboard-shapes.ts` with its own unit tests.
- The status toast moves to the bottom-right of the canvas pane.
- The saved-shares list follows `chrome.storage.onChanged` for `share:` keys.
- _Copy for Claude Code_ records the capture in Saved Shares, best effort.
- The comment timeline names the element each annotation covers.
- Leaving the comment editor restores focus to that annotation's timeline row.
- One `sr-only` live region announces delete, undo and redo.
- The Downloads caption and the collapsed share count are reworded.
- `describeGeometry`'s printed coordinates are clamped to the image, the same
  clamp the sidecar reports its rect through, so the prompt and the JSON beside
  it cannot describe the same annotation differently.

**Out:**

- A DevTools-style element picker over the capture (dogfood finding 3). The
  timeline's element line answers the same question after the fact for a
  fraction of the work; a live hover-inspect over a static image is its own
  change.
- Any change to the inspection round trip itself. Finding 2 was about showing
  what it already resolves, not about resolving it differently.
