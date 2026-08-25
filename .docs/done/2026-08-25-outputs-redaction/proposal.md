# Proposal: output hierarchy, live redaction, UX minors

## Why

Three findings from the editor critique, all in the sidebar-and-canvas surface,
all small enough to ship as one unit of work:

1. **The output column recommended nothing.** Nine buttons, one of them filled
   (`Copy Local Share Link`) - and the filled one was not the handoff Shotback
   exists for. Nothing separated "edit what is on the canvas" from "send this
   somewhere" from "just give me the file".
2. **A redaction was a promise, not a preview.** The canvas drew a 35% diagonal
   hatch; the pixels only actually went in the export. "Is enough of that
   address covered?" could only be answered by writing the file and opening it.
3. **A batch of small wrongnesses**: `1 notes`; the annotation count printed
   twice; ninety characters of `chrome-extension://...` in the sidebar; saved
   shares identified only by hostname; `Capture Page` and `Delete` both one
   click from throwing work away.

## Scope

- Re-weight and group the sidebar's actions; `Copy for Claude Code` becomes the
  one primary, with a one-line caption saying what it writes.
- Render redactions pixelated **on the canvas**, through the export's own
  pixelation code, with `Alt` to reveal a selected one.
- The minors batch above.

## Non-goals

- No change to what any export contains. Every output still goes through
  `exportView` -> `exportAnnotatedImage`, byte for byte.
- No new redaction options (block size, blur vs. blocks, colour fill).
- No change to the storage schema.
