# Completion Summary: Finish the Dark Theme

## What changed

**`src/styles/globals.css`**

- The `.dark` token block is now paired with `@media (prefers-color-scheme: dark) { :root:not(.light) { ... } }` holding the same declarations, so dark applies from the OS preference as well as from `class="dark"`, and `class="light"` forces light back on. The duplication is deliberate and commented in the file: `light-dark()` returns a colour rather than the bare HSL channels the tokens interpolate (which would break every `bg-primary/40`-style alpha modifier), and the usual inline pre-render script is forbidden by MV3's CSP.
- New tokens: `--glow-1`/`--glow-1-alpha`, `--glow-2`/`--glow-2-alpha` drive the two decorative body radial gradients (`0.32`/`0.5` in light, `0.12`/`0.18` in dark, with dark hues `16 185 129` / `59 130 246`). Alpha is a token so the single `body` rule serves both themes.
- New tokens `--card-highlight` / `--card-shadow` replace the hardcoded `hsl(0 0% 100%/0.6)` inset highlight and `hsl(222 47% 11%/0.06)` drop shadow in `card.tsx`. The white highlight was a bright hairline across the top of every card in dark; it is `0 0% 100% / 0.06` there now.
- `color-scheme: light` / `dark` per theme, so native scrollbars and the `<input type="color">` swatch follow.
- Two dark values were wrong for text use and were lifted (see below).

**`src/components/ui/card.tsx`** - elevation now uses the two new tokens.

**`src/components/ui/button.tsx`** - neutral disabled state for every variant, and the two hardcoded white insets replaced by `--button-highlight`.

**`src/editor/*.tsx`, `src/viewer/main.tsx`** - 51 literal colour classes replaced with tokens.

**`tests/e2e/extension.spec.ts`** - new test `dark theme keeps every control legible`.

## Literal-to-token mapping applied

| Literal | Token |
|---|---|
| `text-slate-500` | `text-muted-foreground` |
| `text-slate-600` | `text-muted-foreground` |
| `text-slate-700` | `text-muted-foreground` |
| `text-slate-800` | `text-foreground` |
| `text-slate-900` | `text-foreground` |
| `border-slate-200` | `border-border` |
| `border-slate-300` | `border-border` (`border-input` on the inline comment textarea - it is a form control) |
| `bg-slate-50`, `hover:bg-slate-50` | `bg-muted`, `hover:bg-muted` |
| `bg-slate-100` | `bg-muted` |
| `bg-white` | `bg-card` |
| `bg-white/95` | `bg-card/95` |
| `text-emerald-700` | `text-primary` |
| `border-emerald-400` | `border-primary` |
| `border-emerald-600` | `border-primary` |
| `bg-emerald-50` | `bg-accent` |
| `ring-emerald-200` | `ring-ring/40` |
| `ring-emerald-600/50` | `ring-ring/50` |
| `text-red-700` | `text-destructive` |
| `hover:bg-red-50` | `hover:bg-destructive/10` |

Not in the original table, added here:

| Literal (in `src/components/ui/card.tsx`) | Token |
|---|---|
| `hsl(0_0%_100%/0.6)` inset highlight (`card.tsx`) | `hsl(var(--card-highlight))` |
| `hsl(222_47%_11%/0.06)` drop shadow (`card.tsx`) | `hsl(var(--card-shadow))` |
| `hsl(0_0%_100%/0.12)` and `/0.15` insets (`button.tsx`) | `hsl(var(--button-highlight))` |

## Dark token values corrected

Two dark tokens were legible as *backgrounds* but not as *text*, and the migration made them load-bearing as text (`text-primary` for the success status, the editor share link and the viewer's source link; `text-destructive` for the Remove/Delete buttons and the error status).

This was a design decision, **not** something a test forced. The e2e legibility test loads an empty editor page, where none of those elements are mounted; it passed at the old values. The numbers below are luminance deltas under the same measure the test uses, which wants >= 0.3 against the nearest painted background. Dark surfaces: `bg-card` 0.073, `bg-secondary` / `bg-muted` 0.159.

| Token | Was (dark) | Now (dark) | What it fixes |
|---|---|---|---|
| `--destructive` | `0 72% 51%` (lum 0.307) | `0 84% 68%` (lum 0.525) | `text-destructive` on `bg-secondary` - the Remove and Delete buttons in the timeline and saved-shares lists: **0.148 -> 0.367**. On `bg-card` - the error status line: **0.234 -> 0.452**. Both were under the bar. |
| `--destructive-hover` | `0 74% 58%` | `0 84% 75%` | Keeps the hover step above the new base. |
| `--destructive-foreground` | `0 0% 100%` | `222 47% 6%` | Dark ink on the now-lighter red (6.0:1), matching how dark `--primary` already pairs with a dark foreground. |
| `--primary` | `161 94% 30%` (lum 0.449) | `161 94% 36%` (lum 0.539) | `text-primary` on `bg-muted` - the viewer's source-page link inside the metadata panel: **0.290 -> 0.380**. It already cleared the bar on `bg-card` (0.376), so this is about the panel, and it keeps the two `text-primary` uses consistent. |
| `--primary-hover` | `161 94% 36%` | `161 94% 42%` | Keeps the hover step above the new base. |

Light values are untouched. The same numbers and reasoning are recorded in a comment above the dark blocks in `globals.css`.

## Disabled buttons

Lightening `--destructive` meant `--destructive-foreground` became dark ink, and the old `disabled:opacity-50` then rendered "Delete Selected Item" as dark ink on dull maroon over a near-black card. `button.tsx` now uses a neutral disabled state for every variant instead - `disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:shadow-none` - so a disabled button reads the same way in both themes and in every variant.

## Verification

- `npm run check` - typecheck, lint, 59 unit tests, build: green.
- `npm run format:check` - green.
- `npm run test:e2e` - 6/6 green, including the new dark-theme test.
- `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - zero hits. The pattern is anchored to Tailwind class prefixes so it does not fire on prose or on the palette-origin comments in `globals.css` (`/* emerald-700 */`), which are kept.
- Screenshots, taken by driving the real extension in Chromium through a real capture with two annotations, comments, general feedback, a generated share link and saved shares. Not committed (~1 MB of PNGs, and this repo carries no images); they live locally at `.superpowers/sdd/2026-08-23-fix-it-all-plan/task-3-shots/`:
  - `editor-{light,dark}.png` - sidebar mid-scroll: every action button, the status line, the timeline rows, the share link.
  - `editor-top-{light,dark}.png` - sidebar top: title, notes badge, Capture Page, both selects, colour input, feedback textarea, help text.
  - `editor-selected-{light,dark}.png` - an annotation selected: the enabled destructive button, the selected timeline row, the saved-shares rows, the inline comment editor over the capture.
  - `viewer-{light,dark}.png` - share metadata, source link, download button, annotated image.

## Risks / follow-ups

- The dark and media-query token blocks must be edited together. The in-file comment says so.
- The e2e heuristic catches text that vanishes into its background; it cannot catch a light island inside a dark UI (light text on a light panel still "passes"). The screenshots cover that gap.
- The inline comment editor over the screenshot is now `bg-card/95` - dark app chrome floating over a light captured page in dark mode. Deliberate (it is app chrome, not page content), but it is the one place where the two colour worlds meet.
