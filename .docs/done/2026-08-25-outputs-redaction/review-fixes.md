# Review round

Two review seats on `3908f4e..3254ca8`. Everything below is fixed on the same
branch; the `Capture Page` step-down to secondary was adjudicated accepted and
needs no action.

## Correctness

### The preview was not the export, once a crop was involved

The overlay pixelated raw `redactions(annotations)` off the untouched `<img>`,
in image space. The export renders `exportView`: the crop clamped, the
annotations through `applyCrop` (which **clips** a redaction the crop cuts
through) onto a crop-sized canvas, each region pixelated from the canvas as the
region before it left it. Two divergences followed:

- **A crop cutting through a redaction.** The export blocks the clipped region
  from the crop's edge; the overlay blocked the whole region from its own
  un-clipped corner. When the two corners are not congruent mod the 12px block,
  every seam lands somewhere else.
- **Overlapping redactions.** The export stacks them; the overlay had each one
  read pristine pixels.

Fixed by reproducing the export's canvas: an offscreen buffer sized to the
clamped crop, `applyCrop`'d annotations, sequential `pixelateRegion`, then only
the rects `redactionBounds` reports are copied onto the overlay at display
coordinates. `crop` added to the effect deps.

`redactionBounds(region, size)` was extracted and exported from `annotate.ts`
so the copy-back cannot re-derive the clamp and rounding by hand.

Proof: `tests/annotate.test.ts` shows the seam sets are disjoint at
`crop.x = 505`; the e2e applies a crop that cuts a redaction and compares the
overlay's pixels against the saved share's for the same window (mean luminance
delta < 1). Mutating the effect back to image space makes that delta 5.72.

### Both confirms dropped keyboard focus

The autoFocused Confirm unmounts on cancel, on confirm and on the timed revert,
landing the keyboard on `document.body`. The hazard is identical at both call
sites, so it is fixed once, in `useTimedConfirm`:

- `triggerRef(key)` re-focuses the trigger when the pair goes - but only when
  focus was orphaned onto the body, so a timed revert cannot yank the caret out
  of a field someone is typing in.
- `onKeyDown` makes Escape cancel.
- `onConfirm(run)` ignores activation for 250ms after arming. The double-click
  probe confirmed the hypothesis: without the guard, `dblclick` on **Delete**
  deleted the share outright.

### Thumbnails were rebuilt on every refresh

The effect keyed on `shares` identity and revoked the whole map in cleanup, so
one delete blanked every row to grey and re-read every blob from IndexedDB. Now
diffed: revoke only ids that left, load only ids that are missing, release
everything on unmount.

## Copy and hygiene

- The primary's caption names the format actually in force - "Saves PNG" was
  wrong under the JPEG pref.
- The redaction status line says the canvas half too: "pixelated here, and in
  every export and saved share".
- With no redactions the overlay canvas is sized 0x0 rather than holding a
  capture-sized backing store.
- The comment timeline's count badge is gone. The sidebar header's badge is now
  the only place the annotation count is stated, which satisfies both readings
  of the original brief.

## Verification

`npm run check` green (254 unit tests / 19 files), `format:check` clean,
`npm run test:e2e` 12/12 green, colour-utility grep 0, light and dark
screenshots re-read.
