# Design: a11y audit fixes

## 1. Contrast token

`--muted-foreground` darkened from `215 16% 47%` to `215 16% 42%` in the
light `:root` block only. 42% clears 4.5:1 against `--muted` (96% L,
darkest of the three backgrounds it actually paints on) with margin, so
rounding/rendering differences across browsers cannot tip it back under the
line. The breakeven point against `--muted` alone is ~45.7% L; 42% was
picked for headroom rather than shaving to the wire.

`tests/contrast-tokens.test.ts` parses `globals.css`'s `:root {}` and
`.dark {}` blocks with a small regex-based extractor (mirroring
`tests/theme-tokens.test.ts`'s existing block-parsing approach), converts
each HSL token to sRGB, computes WCAG relative luminance and contrast ratio,
and asserts >= 4.5 for `muted-foreground` against `muted`/`background`/`card`
in both blocks. It reads the real source file, so a future token edit that
regresses contrast fails here instead of shipping.

## 2. Reduced motion

Added as a fifth block in `globals.css`, after the two dark blocks, same
"outside `@layer base`" placement so Tailwind doesn't tree-shake it. Targets
the exact Tailwind-generated selectors already in the compiled CSS
(verified against `dist/assets/globals.css` byte-for-byte):

- `.transition-\[transform\,background-color\,box-shadow\]` (the Button
  base) -> `transition-duration: 0ms`
- `.active\:scale-\[0\.98\]:active` (the Button press effect) ->
  `transform: none`
- `.transition-transform` (the Select chevron) -> `transition-property: none`
- `.transition-colors` (Input/Select trigger/Textarea) ->
  `transition-duration: 0ms`

This is deliberately not a global `* { transition: none }` kill: every
selector still changes color/background/shadow on hover, focus and disabled
- just instantly instead of animated - so state changes stay visible and
state hierarchy is preserved for someone who asked for less motion.

The on-page capture-notice spinner (`content.ts`, injected into the tab
being captured - not the extension's own React UI) reads
`matchMedia("(prefers-reduced-motion: reduce)").matches` once when the
overlay is built, and skips attaching `animation:shotback-spin ...` to the
spinner's inline `cssText` when true. The ring itself still renders (it
communicates "in progress" on its own); the keyframes `<style>` injection is
unconditional either way, matching the existing once-only guard
(`document.getElementById("shotback-overlay-style")`) - injecting an unused
`@keyframes` is harmless. A `data-shotback-spinner` attribute was added so
the e2e test can locate the element precisely (a plain `div > div` selector
would also match the pill wrapper).

## 3. Checkbox target size

Wrapped the `<input type="checkbox">` in `saved-shares.tsx` in a
`<label className="mt-1 flex size-6 shrink-0 cursor-pointer items-center
justify-center">`. A `<label>` (not a `<span>`) was chosen deliberately: a
label wrapping its control natively forwards a click anywhere in its box to
the input, so the 24x24 area is actually clickable, not just visually
padded. The input itself shrank from `h-4 w-4` to `size-4` (same 16px, just
the shorthand utility) with `accent-primary` kept. `aria-label` stayed on
the `<input>` unchanged, so the accessible name is unaffected.

## 4. Annotation canvas

`role="group"` (not `role="application"` - that would opt the whole surface
out of normal screen-reader browse mode, which is wrong for something that
is pointer-only anyway) plus a descriptive `aria-label` on the `<svg>`.
`decoding="async"` on the `<img>` so the browser doesn't block layout on
decoding a potentially large stitched capture.
