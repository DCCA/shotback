# Tasks: Page diagnostics in the prompt

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/feedback.test.ts`: a `Diagnostics:` block after the
        `Environment:` block, the block on its own when no environment was
        captured, the 20-entry cap, and two byte-identity guards for the
        nothing-collected path (both builders).
  - [x] 1.2 RED: `5 failed | 23 passed (28)` - the block missing from every
        prompt; the two byte-identity guards passed from the start, which is
        what they are for.
- [x] **2. The pure block; GREEN**
  - [x] 2.1 `src/lib/feedback.ts` - `diagnosticsBlock` plus `contextLines`,
        which replaces `environmentLines` and blank-line separates whichever
        blocks are present (none present -> no blank lines at all, so the old
        prompts keep their exact shape).
  - [x] 2.2 GREEN: `28 passed (28)`, then `27 passed` after the console-error
        cases were dropped with the feature.
- [x] **3. The chrome boundary**
  - [x] 3.1 `src/content.ts` - `SB_GET_DIAGNOSTICS`, computed on demand from
        `performance.getEntriesByType("resource")`: `responseStatus >= 400`,
        feature-guarded, deduped by status+URL, capped at 20, each URL
        collapsed to one line of 200 chars.
  - [x] 3.2 `src/lib/capture.ts` - `PageDiagnostics`,
        `CaptureResult.diagnostics`, and `getDiagnostics(tabId)` (best effort,
        never throws), called right after the metrics read.
- [x] **4. Editor wiring**
  - [x] 4.1 `EditorState.diagnostics` / `setDiagnostics`, cleared when a capture
        starts and set from `result.diagnostics`.
  - [x] 4.2 `use-exports.ts` passes it to both prompt builders.
- [x] **5. e2e**
  - [x] 5.1 The fixture server 404s anything that is not a fixture page; the
        `smooth` page requests a 1px transparent `/missing.png` (absolutely
        positioned, so neither the page height nor a sampled pixel moves).
  - [x] 5.2 RED against pre-change `src/` (`git stash push -- src`, `dist/`
        rebuilt): the copied prompt has no `Diagnostics:` line.
  - [x] 5.3 GREEN: the prompt contains `Diagnostics:`, `- Failed requests:`,
        `404 ` and `/missing.png`.
- [x] **6. Console errors: measured, not shipped**
  - [x] 6.1 Implemented the briefed ring buffer + `error`/`unhandledrejection`
        listeners; the e2e proved they never fire for a page-world error.
  - [x] 6.2 Probed both worlds directly against real Chromium to confirm the
        cause (see `proposal.md`).
  - [x] 6.3 Removed the dead collector, documented the limitation in
        `README.md`, `SECURITY.md` and `CLAUDE.md`, and left the
        `world: "MAIN"` trade open for the maintainer.
- [x] **7. Gate + docs**
  - [x] 7.1 `npm run check` - typecheck, lint, 123 unit tests, build: green.
  - [x] 7.2 `npm run format:check` - green.
  - [x] 7.3 `npm run test:e2e` - 6/6.
  - [x] 7.4 Colour-literal grep and em-dash grep - zero hits.
  - [x] 7.5 CLAUDE.md (content.ts message list, a page-diagnostics paragraph,
        the `feedback.ts`/`capture.ts` helper entries, the e2e description),
        README (feature bullet, usage block, known limitation), SECURITY.md
        (what capture reads, the deliberate non-collection section, data
        handling).
- [x] **8. Commit and PR**
