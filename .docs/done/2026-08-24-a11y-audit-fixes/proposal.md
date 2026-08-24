# A11y audit fixes

## Why

An accessibility/quality audit of Shotback found four findings, two P1 and
two P2/P3. All four are fixed in this change.

## Findings

1. **P1 - AA contrast for muted text in light mode.** `--muted-foreground:
   215 16% 47%` on `--muted: 210 40% 96%` measured 4.30:1, under WCAG AA's
   4.5:1 for body text. It also under-cleared against `--background` (4.51:1,
   effectively on the line) once rounding is accounted for.
2. **P1 - No `prefers-reduced-motion` support.** The button press
   (`active:scale-[0.98]`), the select chevron's rotation, and every
   colour/box-shadow transition ran at full animated speed regardless of the
   user's OS motion preference. The on-page capture-notice spinner (injected
   by `content.ts` into the page being captured, not the extension's own UI)
   spun unconditionally too.
3. **P2 - Saved-share checkbox target size.** The per-share checkbox in
   `src/editor/saved-shares.tsx` was a bare `<input type="checkbox">
   className="h-4 w-4">` - roughly 13px, well under the 24x24 CSS px minimum
   target size (WCAG 2.5.8).
4. **P2/P3 - Annotation canvas accessible name and image decoding.** The
   interactive `<svg>` annotation surface in
   `src/editor/annotation-canvas.tsx` had no accessible name or role, and the
   captured-page `<img>` had no `decoding` hint.

## Scope

Token-only contrast fix (no palette redesign), a targeted reduced-motion
media block plus one content-script conditional, one markup wrap for the
checkbox target size, and two attributes on the annotation canvas. No new
dependencies, no component API changes.
