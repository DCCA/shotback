# Tasks: Per-annotation geometry in the prompt

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/numbering.test.ts`: `describeGeometry` for box (with a
        fractional-coordinate rounding case), arrow, text.
  - [x] 1.2 `tests/feedback.test.ts`: both builders emit the geometry suffix
        on every line when given `image` (full-string `toBe`); the existing
        Task 13 full-string `toBe` tests are untouched, plus a new explicit
        "byte-identical without image" `toBe` case for each builder.
  - [x] 1.3 RED: 4 failures in `numbering.test.ts` (`describeGeometry is not a
        function`), 2 failures in `feedback.test.ts` (geometry suffix missing)
        - the pre-existing full-string tests kept passing throughout.
- [x] **2. Implement; GREEN**
  - [x] 2.1 `describeGeometry` added to `src/lib/numbering.ts`.
  - [x] 2.2 `formatAreaComments` takes an optional `image` and appends
        `- ${describeGeometry(...)}` per line only when given one; both
        builders gain the optional `image` param and pass it through.
  - [x] 2.3 GREEN: 11 tests in `numbering.test.ts`, 18 in `feedback.test.ts`.
- [x] **3. Wire `use-exports.ts`**
  - [x] 3.1 `promptImage(imageSize)` returns `imageSize` only when
        `imageSize.width > 1` (guards the `{ width: 1, height: 1 }`
        placeholder before a real capture lands), `undefined` otherwise.
  - [x] 3.2 Both `buildExternalLlmPrompt` and `buildClaudeCodePrompt` calls in
        `prepareExternalLlmPackage` / `copyForClaudeCode` pass
        `image: promptImage(state.imageSize)`.
- [x] **4. e2e**
  - [x] 4.1 RED against pre-change `src/` (`git stash push -- src/`, rebuilt
        `dist/`): the new geometry regex did not match the copied prompt.
  - [x] 4.2 Restored the implementation (`git stash pop`), rebuilt, GREEN: the
        `smooth` test's clipboard prompt matches
        `/1\. \[box\] Chart - at \(\d+, \d+\) size \d+x\d+ px \[\d+%, \d+% of page\]/`.
- [x] **5. Gate + docs**
  - [x] 5.1 `npm run check` - typecheck, lint, 98 unit tests, build: green.
  - [x] 5.2 `npm run format:check` - green (one Prettier line-length fix in
        `numbering.ts`).
  - [x] 5.3 `npm run test:e2e` - 6/6.
  - [x] 5.4 Colour-literal grep - zero hits.
  - [x] 5.5 CLAUDE.md `numbering.ts` bullet gains `describeGeometry`.
- [x] **6. Commit and PR**
