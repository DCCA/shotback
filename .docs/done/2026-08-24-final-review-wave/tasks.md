# Tasks: Final review wave

## 1. Code

- [x] 1.1 Clamp `pageTitle` (one line, 200 chars) and `pageUrl` (500 chars) in
      `buildEnvironment`; three unit tests in `tests/capture.test.ts` (huge
      title, huge URL, undefined title). Verified `feedback.ts`'s
      `pageTitle.trim()` is the only other reader.
- [x] 1.2 ESLint `ignores: ["**/dist/**", "coverage/**", ".claude/**", ".superpowers/**"]`;
      `npm run lint` exits 0 with a nested worktree `dist/` present.
- [x] 1.3 Round the device pixel ratio at both render sites (`feedback.ts`
      Environment line via `displayDpr`, `viewer/main.tsx` metadata line); the
      sidecar keeps the raw value. Unit test at `1.100000023841858 -> @1.1x`.
- [x] 1.4 Arrow minimum length: `|dx| > 5 || |dy| > 5`, the same threshold box
      and redact use. No unit seam - the guard lives in the canvas component's
      pointer-up handler, which the unit suite (`tests/**/*.test.ts`, no DOM
      environment) cannot reach.
- [x] 1.5 Re-capture prompt line becomes a fact: "Before/after: this capture is
      a re-capture of a page reviewed earlier." Unit test updated.
- [x] 1.6 Single-capture sidecar `imagePath` is the basename `cap-<ts>.<ext>`,
      matching the batch sidecar's meaning ("beside this JSON"). e2e assertions
      updated.
- [x] 1.7 `saveSidecar` returns `{ saved, path }`, so the status tells "could
      not be saved" from "saved but could not be linked".
- [x] 1.8 Stranded JSDoc above `buildBatchPrompt` moved back onto
      `buildClaudeCodePrompt`, which it describes.
- [x] 1.9 Duplicate filter/sort deleted from `main.tsx`; `CommentTimeline`
      derives its rows (and its count, and its empty state) from
      `numberAnnotations` once.
- [x] 1.10 New `tests/theme-tokens.test.ts` parses the `.dark` block and the
      `prefers-color-scheme: dark` block out of `globals.css` and asserts the
      two property maps are equal.
- [x] 1.11 e2e: `test.setTimeout(120_000)` on the `inner` branch; the three
      state resets moved into `finally` blocks.

## 2. Docs

- [x] 2.1 `README.md`: Diagnostics bullet is Detailed-only; the privacy
      paragraph lists all five export paths; permissions gain `downloads`;
      Project Structure gains `skills/`.
- [x] 2.2 `CLAUDE.md`: `main.tsx` described as the ~200-line composition root
      with its modules and the five outputs; permissions gain `downloads`; the
      em dash on the capture-flow line becomes " - ".
- [x] 2.3 `PRIVACY.md`: the batch export added to "When data leaves your
      device".
- [x] 2.4 `public/manifest.json`: agent-handoff description (115 chars, under
      the 132 store limit).
- [x] 2.5 Plan Global Constraints: the pure-lib rule names the documented
      wrapper exception.

## 3. Gate

- [x] 3.1 `npm run check` green.
- [x] 3.2 `npm run format:check` green.
- [x] 3.3 `npm run test:e2e` green (8 passed).
- [x] 3.4 Zero em dashes on added lines.
