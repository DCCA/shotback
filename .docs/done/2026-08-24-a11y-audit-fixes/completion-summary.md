# Completion summary: a11y audit fixes

All four findings fixed, one commit, `fix/a11y-audit` branch.

## Measured contrast (WCAG relative luminance / APCA-style ratio)

Light `--muted-foreground`:

| Background | Before (47% L) | After (42% L) |
|---|---|---|
| `--muted` (210 40% 96%) | 4.30:1 (fail) | 4.79:1 (pass) |
| `--background` (210 40% 98%) | 4.51:1 (pass, on the line) | 5.02:1 (pass) |
| `--card` (0 0% 100%) | 4.72:1 (pass) | 5.25:1 (pass) |

Dark `--muted-foreground` (215 20% 65% on 215 25% 17% `--muted`): 7.23:1,
unchanged.

## Verification

- `npm run check` (typecheck + lint + test + build): green, 227 unit tests
  (18 new: `tests/contrast-tokens.test.ts`).
- `npm run format:check`: green.
- `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/`: zero hits.
- `npm run test:e2e`: 10/10 green (8 pre-existing + 2 new: capture-notice
  spinner under reduced motion, editor button/select under reduced motion;
  the checkbox target-size assertion was added inside the existing batch
  block).
- Visual: screenshotted `dist/editor.html` in light and dark via a
  throwaway Playwright script against a local static server (no project
  "run" skill existed for this repo). Muted sidebar text (INTERACTION,
  TOOL, ZOOM, COLOR labels, the keyboard-shortcut help paragraph) reads as
  a clearly muted grey in both themes, not near-black. Dark mode is
  visually unchanged, as intended.

## Notes / follow-ups

None. Scope was contained to the four findings; no new dependencies, no
component API changes.
