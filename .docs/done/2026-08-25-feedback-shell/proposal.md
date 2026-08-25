# Feedback visibility + app shell

## Why

Three findings from the editor critique, all about the editor telling the user
the truth about itself:

1. **P0 - status is invisible.** Every outcome ("Prompt copied", "Copy failed")
   rendered at the bottom of the sidebar's own scroll flow, under nine export
   buttons. Pressing an export button routinely left the answer off screen, and
   nothing ever cleared: `Capture completed` sat there through the rest of the
   session as a stale line to read past.
2. **P0 - Apply crop does nothing visible.** The canvas dimmed around the crop
   and kept dimming it after Apply. The full capture stayed on screen, so the
   only evidence a crop had taken effect was a sidebar chip - and the thing the
   exports would actually contain was never shown.
3. **P1 - the shell double-scrolls.** `min-h-screen` let the window scroll, and
   the capture's own scrollport scrolled inside it. Reaching the bottom of a
   tall screenshot meant scrolling the page and then scrolling the image.

## Scope

- Move status/progress out of the sidebar into a toast over the canvas pane.
- Make the canvas render the applied crop, and move the crop's own controls
  (Apply/Cancel, the applied-crop chip) onto the canvas with it.
- Make the editor a fixed two-pane shell at `lg` and up, with the capture's
  scrollport as the only scroller for the capture.

## Non-goals

- No change to what any export produces. `exportView` already applied the crop
  to every output; this change only makes the canvas agree with it.
- No change to the annotation model, the undo history or the prompts.
- No new sidebar sections, no reordering of the existing controls.
