# Completion Summary: Per-annotation geometry in the prompt

## What changed

- `src/lib/numbering.ts` - new pure `describeGeometry(annotation, image)`:
  - box: `at (x, y) size WxH px [X%, Y% of page]`, `X% = round(100*x/image.width)`,
    `Y% = round(100*y/image.height)`.
  - arrow: `from (x1, y1) to (x2, y2) px`.
  - text: `at (x, y) px`.
  - All coordinates rounded to integers with `Math.round`; percentages
    rounded to whole numbers the same way.
- `src/lib/feedback.ts` - `formatAreaComments` takes an optional
  `image: { width: number; height: number }`; when given, each line becomes
  `${n}. [${tool}] ${note} - ${describeGeometry(annotation, image)}` instead of
  `${n}. [${tool}] ${note}`. Both `buildExternalLlmPrompt` and
  `buildClaudeCodePrompt` gained the same optional `image` param and pass it
  straight through. Without `image`, output is byte-identical to before (the
  Task 13 full-string `toBe` tests were kept, not weakened, and two new
  "byte-identical without image" `toBe` tests were added).
- `src/editor/use-exports.ts` - new `promptImage(imageSize)` helper returns
  `imageSize` only when `imageSize.width > 1` (the editor's `imageSize` starts
  at `{ width: 1, height: 1 }` before a capture lands, so a stray auto-capture
  race can never turn into a nonsense `[0%, 0% of page]` line). Both
  `prepareExternalLlmPackage` and `copyForClaudeCode` pass
  `image: promptImage(state.imageSize)`.

## Sample prompt line

From `buildExternalLlmPrompt` with `image = { width: 1000, height: 500 }` and
a box at `(0, 0)` sized `10x10`:

```
1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page]
2. [arrow] point here - from (0, 0) to (5, 5) px
3. [text] Label - at (1, 2) px
```

Without an `image`, the same annotations produce exactly what Task 13 did:

```
1. [box] fix padding
```

## RED/GREEN evidence

### Group 1: `describeGeometry` (numbering.test.ts)

RED (before implementation):

```
FAIL  tests/numbering.test.ts > describeGeometry > describes a box in px and % of page
TypeError: describeGeometry is not a function
FAIL  tests/numbering.test.ts > describeGeometry > describes an arrow as tail-to-head px
FAIL  tests/numbering.test.ts > describeGeometry > describes text as a single point in px
FAIL  tests/numbering.test.ts > describeGeometry > rounds fractional px and percentages
Tests  4 failed | 7 passed (11)
```

GREEN: `Tests  11 passed (11)`.

### Group 2: builders (feedback.test.ts)

RED (before implementation, 2 new full-string tests fail, all 16 existing
tests - including the Task 13 environment/no-environment `toBe` tests - kept
passing):

```
FAIL  tests/feedback.test.ts > buildExternalLlmPrompt > appends per-annotation geometry when an image size is given
- 1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page]
+ 1. [box] fix padding
FAIL  tests/feedback.test.ts > buildClaudeCodePrompt > appends per-annotation geometry when an image size is given
Tests  2 failed | 16 passed (18)
```

GREEN: `Tests  18 passed (18)` (29 combined with numbering.test.ts).

### Group 3: e2e (`smooth` clipboard assertion)

RED - stashed `src/` back to pre-implementation (`git stash push -- src/`),
rebuilt `dist/`, ran `npx playwright test -g smooth`:

```
Error: expect(received).toMatch(expected)
Expected pattern: /1\. \[box\] Chart - at \(\d+, \d+\) size \d+x\d+ px \[\d+%, \d+% of page\]/
Received string:  "...
Area comments:
1. [box] Chart"
1 failed
```

Restored the implementation (`git stash pop`), rebuilt, GREEN:

```
✓ full-page capture stitches every viewport in order (smooth) (2.3s)
```

## Gate output

```
npm run check
  typecheck: clean
  lint: clean
  test: 11 files, 98 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style! (one line-length fix applied to numbering.ts)

npm run test:e2e
  6 passed (6.2s)

grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/
  (zero hits)
```

## Self-review

- **Completeness**: all three geometry formats implemented and unit tested;
  both builders (`buildExternalLlmPrompt`, `buildClaudeCodePrompt`) take and
  forward `image`; `use-exports.ts` wires `state.imageSize` through a
  placeholder guard to both call sites; the `smooth` e2e test asserts the
  real clipboard prompt against the geometry regex.
- **Quality**: rounding uses `Math.round` exactly as specified (px and %,
  verified with a fractional-coordinate unit test); no annotation field can
  print as `undefined` - `describeGeometry` only reads fields that exist on
  the matched `tool` branch, and the guard in `use-exports.ts` means `image`
  is either a real `{ width, height }` or `undefined` (never a `1x1`
  placeholder leaking into the text).
- **Discipline**: no changes outside the four files named in the brief plus
  the change-folder docs and the one `CLAUDE.md` bullet; no new dependencies;
  no em dashes on any added line; no literal colour classes.
- **Testing**: RED captured for all three groups before implementing (unit
  tests via `TypeError`/string-diff failures, e2e via a real stash-rebuild-run
  cycle against the actual Chromium extension); GREEN re-verified after
  restoring the implementation, plus the full gate (`check`, `format:check`,
  `test:e2e`) all green on the final tree.

## Follow-ups

- None identified. Geometry for the exported PNG's own legend footer remains
  out of scope, as decided in the proposal.
