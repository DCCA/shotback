# Completion summary: Final review wave

## What changed

All sixteen findings from the whole-branch review shipped in one PR. Nothing was
skipped, and nothing outside the list was touched.

**Boundary clamps.** `buildEnvironment` now collapses the page title to one line
of 200 chars (`""` when the page reported none) and slices the page URL to 500,
putting it alongside the existing clamps on diagnostics URLs, CSS paths and
component names - every page-controlled string on the way into a prompt is now
bounded in the same place. `feedback.ts`'s `pageTitle.trim()` is the only other
reader of that field and stays as it is: a hand-built environment (an old share)
still needs it for the `(untitled)` fallback.

**Correctness at the edges.** The arrow tool got box's and redact's `> 5`
threshold, so a stray click in arrow mode creates nothing. `saveSidecar` now
returns `{ saved, path }` and the status distinguishes a failed write from a
written file whose absolute path never resolved. The single-capture sidecar's
`imagePath` became a bare `cap-<ts>.<ext>`, so both sidecar shapes mean
"relative to this JSON's folder".

**Rendering.** The device pixel ratio is rounded to two decimals at the two
places a human reads it (prompt Environment line, viewer metadata line);
the sidecar keeps the exact float, because a machine reader wants the real one.

**Wording.** The re-capture line states a fact instead of asking for a
comparison the agent cannot make.

**Dead weight.** The duplicate filter/sort in `main.tsx` is gone -
`CommentTimeline` derives rows, count and empty state from `numberAnnotations`
once - and the stranded JSDoc above `buildBatchPrompt` is back on the function
it describes.

**Gate hygiene.** ESLint ignores `**/dist/**` (a nested agent worktree's build no
longer fails lint), `.claude/**` and `.superpowers/**`. The e2e `inner`
mega-block has its own 120 s budget, and its three state resets moved into
`finally` blocks so a mid-test failure cannot leave the persisted prefs on
Compact/JPEG or a batch selection ticked for the tests that follow.

**Docs.** README, CLAUDE.md, PRIVACY.md, the manifest description and the plan's
Global Constraints now describe what the code actually does: Diagnostics is
Detailed-only, there are five export paths, `downloads` is a permission,
`skills/` exists, `main.tsx` is a ~200-line composition root, and the pure-lib
rule names its documented wrapper exception.

## Tests

- `tests/capture.test.ts` - three new cases: a 10k title collapses to one
  200-char line, a 1k URL slices to 500, an undefined title yields `""`.
- `tests/feedback.test.ts` - a fractional dpr renders `@1.1x`; the re-capture
  line's new wording.
- `tests/theme-tokens.test.ts` (new) - the `.dark` block and the
  `prefers-color-scheme: dark` block parse to equal property maps. Proven to
  fail by drifting `--input` in one block by one percent, then reverting.
- Gate: `npm run check` green (221 unit tests, 16 files), `npm run format:check` green,
  `npm run test:e2e` green (8 passed).

## Risks

Low. The one user-visible behaviour change is the arrow guard: a drag under 6px
in either axis no longer creates an annotation, matching box and redact. The
sidecar `imagePath` change is a JSON field's shape - anything reading the old
`shotback/cap-<ts>.png` prefix (only the e2e did) needs the basename now.

## Follow-ups

None. The arrow guard has no unit seam today; if the canvas ever grows a DOM
test environment, it is a two-line test.
