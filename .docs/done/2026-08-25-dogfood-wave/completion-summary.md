# Completion summary: dogfood wave

Shipped as **PR #49** (`fix/dogfood-findings`, merged as `0a92de3`). This folder
was written afterwards, in the final fix wave, because #49 - the largest of the
five waves on this branch by source churn - went out without one, which
`FIREHOSE.md` requires.

## What landed

- **Escape discards a comment draft** and hands the keyboard back to the canvas
  with the annotation still selected, so the Enter -> type -> Escape -> nudge
  run works. Every other leave path still commits. A text annotation placed and
  never typed into is removed rather than restored to an empty baseline.
- **The canvas is drawable from the keyboard.** `tabIndex={0}` on the SVG with
  an accessible name that says what the keys do, Enter places the armed tool's
  shape at the centre of the _visible_ capture, arrow keys nudge and Shift+arrow
  resizes. The pure geometry lives in `src/lib/keyboard-shapes.ts` with its own
  unit tests; the canvas keeps only what needs the DOM or React.
- **The status toast moved to the bottom-right** of the canvas pane, off the
  palette's swatch row.
- **Saved shares follow `chrome.storage.onChanged`** for `share:` keys, so a
  second editor tab appears without the reload that would destroy the first
  tab's annotations. `withOwnWrite` keeps this tab from listing twice.
- **Copy for Claude Code records the capture in Saved Shares** (best effort,
  named in the status when it fails, always PNG).
- **The comment timeline names the element** each annotation covers.
- **Leaving a comment restores focus** to that annotation's timeline row.
- **One `sr-only` live region** announces delete, undo and redo.
- **`describeGeometry` clamps its printed coordinates** through `clampToImage`,
  the same helper the sidecar uses, so the prompt and the JSON agree.

## Decisions worth remembering

- **Commit a nudge on key-up, not on a timer.** A held arrow key repeats
  keydown and fires exactly one keyup, so "one undo entry per nudge run" needs
  no debounce at all. `window.blur` commits too, because Alt-Tabbing mid-hold
  fires no keyup.
- **The focus ring belongs on `#capture-viewport`, not the SVG.** The SVG is as
  tall as the capture, so a ring on its own edges is off screen on anything
  taller than the pane - measured at 1280x900 with the capture scrolled 900px:
  the SVG's box ran -775..1625 against a 124..863 scrollport and no indicator
  was visible anywhere.
- **Pen has no keyboard placement.** A default squiggle is a shape the user
  never made.
- **The `sr-only` announcer is a second region, not a second banner.** Putting
  undo and delete through the toast would blink a card over the capture on every
  keystroke of an undo run. `announce()` alternates a trailing no-break space,
  because a live region handed the same string twice says nothing the second
  time.

## The regression this turned up

Adding `describeElement` to `src/lib/dom-context.ts` - by subject, exactly where
it belonged - collapsed 15 of 18 e2e tests. That module was the content script's
**only** import, so Vite had been inlining it; the moment `comment-timeline.tsx`
imported from it as well, Vite emitted a shared chunk and `dist/content.js`
began with a top-level `import`. A classic MV3 content script cannot execute
one, so the script silently never loaded and every capture died with "Receiving
end does not exist", nowhere near the change that caused it - and `npm run
check` was green throughout.

Fixed by moving `describeElement` to `feedback.ts` and, because the hazard is
structural rather than spent, by adding `scripts/check-content-script.mjs` to
the build: `npm run build` now fails if `dist/content.js` carries a top-level
`import`/`export` in any form. The e2e imports that script's own
`hasModuleSyntax` predicate rather than restating it, so the gate and the test
cannot drift.

## Review trail

Two whole-wave reviews were run against this work before merge
(`wave-e-review-opus.md`, `wave-e-review-codex.md`) and every finding fixed in
one round (`wave-e-fix-round-1.md`, re-reviewed in `wave-e-rereview.md`): 1
Critical, 6 Important and 7 minors, including the keymap guards, keeping the
selection on Escape, copying the prompt before recording the share, and a
history rewrite so that no commit in the series leaves a non-loading extension.

The whole-branch review that followed (`final-review-opus.md`) raised four more
against this wave's surface area, fixed in the final wave on
`fix/final-review`: the listbox guard reaching only one of four keymap branches,
Escape keeping a never-typed text annotation, the comment timeline being the one
surface not reconciled with an applied crop, and this missing change folder.
